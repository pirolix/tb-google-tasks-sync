/*
    Google Tasks sync for Mozilla Thunderbird
*/

Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource:///modules/Services.jsm");

if(typeof gt_tasks_sync === "undefined")
	gt_tasks_sync = new Object();

Components.utils.import("resource://oauthorizer/modules/oauth.jsm", gt_tasks_sync);
Components.utils.import("resource://oauthorizer/modules/oauthconsumer.js", gt_tasks_sync);
Services.scriptloader.loadSubScript("resource://jsio/jsio.js", gt_tasks_sync);

/* indent to improve legibility */
	
	//"global" variables
	gt_tasks_sync.prefBranchName = 'extensions.google_tasks_sync.';
	gt_tasks_sync.prefService = Cc["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
	gt_tasks_sync.prefBranch = gt_tasks_sync.prefService.getBranch(gt_tasks_sync.prefBranchName);
	delete gt_tasks_sync.prefBranchName;
	delete gt_tasks_sync.prefService
	gt_tasks_sync.treeItems = new Object(); //stores interface elements
	gt_tasks_sync.reorderingTreeItems = new Object(); //stores reordering interface elements
	gt_tasks_sync.taskBeingEdited = ""; //used by startAdding(), startEditing() and finishEditing() - not an actual task object, but a string containing tasklistId+"/"+taskId
	gt_tasks_sync.oldValues = new Object(); //created by startEditing(), then read by finishEditing() to see what fields the user actually changed
	gt_tasks_sync.returnedTasks = new Object(); //tasks returned by Google in response to insert and update methods - used by sendData()
	gt_tasks_sync.lastActivity = new Date(); //Date - used to prevent fullSync from starting too recently after we start pushing a single-task change to Google, and upon completion of a single-task change to see if another wasn't started in the meantime
	gt_tasks_sync.bufferedTasks = new Object(); //If the user makes a change while full sync is in progress, we don't want to touch localTasks, so instead we save the modified task here to be merged into localTasks once sync completes. Same structure as localTasks.
	gt_tasks_sync.syncInProgress = false;

	gt_tasks_sync.localTasks = new Object(); //actually stores tasklists, which in turn contain tasks - note: localTasks[tasklistId].items is an associative array with task ids as keys, unlike Google's JSON representation where it's a standard JSON array
	gt_tasks_sync.remoteTasks; //global var to dump data in when fetching it piece by piece; only used when full sync is in progress and empty at other times
	gt_tasks_sync.remainingTasklists; //auxiliary var used when retrieving tasks
	gt_tasks_sync.tasksToSend = new Object(); //used when finishing full sync - stores tasks that need to be pushed to Google, the sendTasks method will autmatically choose between INSERT and UPDATE based on task id; has same structure as localTasks
	gt_tasks_sync.lastTaskSent = new Object(); //auxiliary var used by sendTasks, stores both tasklistId and taskId as properties
	gt_tasks_sync.shouldUpdateTimePrefs = false; //is set to true when starting fullSync; sendTasks will update the last sync time pref if true, then reset it to false
	gt_tasks_sync.queuedMoves = new Object(); //when a task is moved locally, the move operation to be sent to Google is queued here, does not use 'items' in structure
	gt_tasks_sync.tasklistIdForQM; //auxiliary var used when sending queued moves
	gt_tasks_sync.unconfirmedQueuedMoves = new Object(); //allows the user to cancel reordering without erasing previously saved queued moves
	
	gt_tasks_sync.tasksInMainInterface = new Array(); //contains the ids of tasks visible in the main interface, in the order they're listed. Used when building the reordering interface
	
	gt_tasks_sync.handleError = function(errorText)
	{
		//will be restored by a successful firstSync or fullSync
		document.getElementById("gt_tasks_sync_full_sync_button").image = "chrome://google_tasks_sync/skin/sync-alert.png";
		document.getElementById("gt_tasks_sync_full_sync_button").setAttribute("tooltiptext", "Last sync failed. Click to retry.\nDetails were logged to Thunderbird's error console.");
	
		//any procedure that locks the inteface will be aborted in case of an error, so we need to unlock the interface here
		gt_tasks_sync.showTasklistInterface();
		document.getElementById("gt_tasks_sync_full_sync_button").disabled = false;
		//TODO: also unlock any disabled checkboxes
		
		throw new Error("Google Tasks Sync: " + errorText);
	};
	
	gt_tasks_sync.startFullSync = function()
	{
		gt_tasks_sync.lockSyncButton();
	
		gt_tasks_sync.remoteTasks = new Object();
		gt_tasks_sync.remainingTasklists = new Array();
		
		gt_tasks_sync.tasksToSend = new Object();
		gt_tasks_sync.shouldUpdateTimePrefs = true;
	
		gt_tasks_sync.sendQueuedMoves(false); //will call retrieveTasks when done, which in turn will call fullSync when all remote data has been downloaded
	
	}
	
	//note: unless this is the first sync (no timestamp in prefs) we don't receive all tasks from the remote side, but assume a task that exists there iff it has a proper, Google-assigned id (i.e. its id doesn't start with oc_temp)
	//since network_functions.js has access to the id of the task it's about to send, it will determine whether to update or create a new one - fullSync doesn't need to worry about that
	gt_tasks_sync.fullSync = function()
	{
		//alert("We have all the remote data.");			
		
		//note: locally editing tasklists is NYI, so just resolve tasklist header conflicts in the remote side's favor
		for(var i in gt_tasks_sync.remoteTasks) { //find tasklists that only exist remotely
			if(!gt_tasks_sync.localTasks.hasOwnProperty(i)) {
				gt_tasks_sync.localTasks[i] = gt_tasks_sync.remoteTasks[i];
			}
		}
		for(var i in gt_tasks_sync.localTasks) { //find tasklists that only exist locally
			if(!gt_tasks_sync.remoteTasks.hasOwnProperty(i)) {
				delete gt_tasks_sync.localTasks[i];
			}
		}
		
		//now local and remote data have the same tasklists, but their contents need to be synced
		for(var i in gt_tasks_sync.localTasks) {
			gt_tasks_sync.localTasks[i].header = gt_tasks_sync.remoteTasks[i].header;
			
			//find tasks that only exist in remote data and add them to local data
			for(var j in gt_tasks_sync.remoteTasks[i].items) {
			
				//alert("Debug A:" + i + " " + j);
				
				if(!gt_tasks_sync.localTasks[i].items.hasOwnProperty(j)) {
					gt_tasks_sync.localTasks[i].items[j] = gt_tasks_sync.remoteTasks[i].items[j];
				}
			}
			
			//iterate through local data - flag new and recently changed tasks to be pushed to google and compare tasks that exist on both sides
			for(var j in gt_tasks_sync.localTasks[i].items) {
			
				//alert("Debug B:" + i + " " + j);
				
				if(!gt_tasks_sync.remoteTasks[i].items.hasOwnProperty(j)) {
					var lastSyncDate = new Date(gt_tasks_sync.prefBranch.getCharPref("last_sync_time"));
					var taskUpdateDate = new Date(gt_tasks_sync.localTasks[i].items[j].updated);
					
					if(taskUpdateDate > lastSyncDate) {
						//new or recently changed task, send to Google
						if(typeof gt_tasks_sync.tasksToSend[i] === 'undefined') {
							gt_tasks_sync.tasksToSend[i] = new Object();
							gt_tasks_sync.tasksToSend[i].items = new Object();
						}
						gt_tasks_sync.tasksToSend[i].items[j] = gt_tasks_sync.localTasks[i].items[j];
					}
						
				} else { //task exists on both sides, most recently modified version wins
					if(new Date(gt_tasks_sync.localTasks[i].items[j].updated) > new Date(gt_tasks_sync.remoteTasks[i].items[j].updated)) {
						if(typeof gt_tasks_sync.tasksToSend[i] === 'undefined') {
							gt_tasks_sync.tasksToSend[i] = new Object();
							gt_tasks_sync.tasksToSend[i].items = new Object();
						}
						gt_tasks_sync.tasksToSend[i].items[j] = gt_tasks_sync.localTasks[i].items[j];
					} else {
						gt_tasks_sync.localTasks[i].items[j] = gt_tasks_sync.remoteTasks[i].items[j];
					}
				}
			}
		}
			
		//alert("Writing to file...");
		gt_tasks_sync.mergeBufferedTasks(); //merges buffered tasks into local data, doesn't send them yet
		gt_tasks_sync.writeToFile(JSON.stringify(gt_tasks_sync.localTasks), function() {
			gt_tasks_sync.rebuildTree();

			gt_tasks_sync.sendTasks(false); //will also send the buffered tasks and, when done, unlock the sync button and set syncInProgress to false
		});
	}
	
	/* can't be launched while the sync button is locked, so no need to check whether a sync is in progress */
	gt_tasks_sync.clearCompletedTasks = function() {
		var tasklistId = document.getElementById("gt_tasks_sync_tasklistmenu").value;
		
		gt_tasks_sync.tasksToSend = new Object();
	
		for(var j in gt_tasks_sync.localTasks[tasklistId].items) {
			var task = gt_tasks_sync.localTasks[tasklistId].items[j];
			
			if(!task.deleted && !task.hidden && task.status == "completed") {
				gt_tasks_sync.localTasks[tasklistId].items[j].deleted = "true"; //the field "hidden" is read-only, so we must delete the task
				gt_tasks_sync.localTasks[tasklistId].items[j].updated = new Date().toISOString();
				
				var box_taskwrapper = document.getElementById(tasklistId+"/"+task.id);
				document.getElementById("gt_tasks_sync_taskcontainer").removeChild(box_taskwrapper);
				
				if(!gt_tasks_sync.tasksToSend.hasOwnProperty(tasklistId)) {
					gt_tasks_sync.tasksToSend[tasklistId] = new Object();
					gt_tasks_sync.tasksToSend[tasklistId].items = new Object();
				}
				gt_tasks_sync.tasksToSend[tasklistId].items[j] = gt_tasks_sync.localTasks[tasklistId].items[j];
			}
		}
		
		gt_tasks_sync.sendTasks(false);
	}
	
	/***
		start adding a task

		@param prePopulatedTask Object with {title, notes} to prepopulate the new task fields. (from an email, for instance). This parameter is optional.
	***/
	gt_tasks_sync.startAdding = function(prePopulatedTask)
	{
		//can't add if no tasklist is selected
		if(!document.getElementById("gt_tasks_sync_tasklistmenu").value)
			return;

		//prepare the interface
		document.getElementById("gt_tasks_sync_newtasktitle").value = "";
		document.getElementById("gt_tasks_sync_newtaskcheckbox").checked = false;
		document.getElementById("gt_tasks_sync_newtasknotes").value = "";
		document.getElementById("gt_tasks_sync_delete_button").disabled = true; //no need for a delete button when adding a new task
		
		gt_tasks_sync.taskBeingEdited = ""; //global variable that will tell finishEditing() that we're adding a brand new task
		
		if (prePopulatedTask) {
			if(prePopulatedTask.title)
				document.getElementById("gt_tasks_sync_newtasktitle").value = prePopulatedTask.title;
			if(prePopulatedTask.notes)
				document.getElementById("gt_tasks_sync_newtasknotes").value = prePopulatedTask.notes;
		}
		//switch to the task editing interface now that we're ready
		document.getElementById("gt_tasks_sync_taskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_newtaskbox").collapsed = false;
		document.getElementById("gt_tasks_sync_newtasktitle").focus();
	}
	
	gt_tasks_sync.startEditing = function(event)
	{
		//find out which task we're editing - may need to go up up to 3 levels depending on which element was clicked
		var elementBuf = event.target.parentNode;
		if(elementBuf.getAttribute("class") != "gt_tasks_sync_c_taskwrapper" && elementBuf.getAttribute("class") != "gt_tasks_sync_c_taskwrapper_faded")
		{
			elementBuf = elementBuf.parentNode
			if(elementBuf.getAttribute("class") != "gt_tasks_sync_c_taskwrapper" && elementBuf.getAttribute("class") != "gt_tasks_sync_c_taskwrapper_faded")
			{
				elementBuf = elementBuf.parentNode
				if(elementBuf.getAttribute("class") != "gt_tasks_sync_c_taskwrapper" && elementBuf.getAttribute("class") != "gt_tasks_sync_c_taskwrapper_faded")
				{
					gt_tasks_sync.handleError("Unable to determine which task was clicked");
					return; //if we still haven't found the right box, something is wrong and we shouldn't continue
				}
			}
		}
		//a slash separates the tasklist id from the task id
		var indexOfSlash = elementBuf.id.search("/");
		var tasklistId = elementBuf.id.substring(0,indexOfSlash);
		var taskId = elementBuf.id.slice(indexOfSlash+1);
		
		//let's store the above information in a global variable for finishEditing() to use
		gt_tasks_sync.taskBeingEdited = elementBuf.id; //contains both tasklist id and task id
		
		var taskObjBuf = gt_tasks_sync.localTasks[tasklistId].items[taskId];
		
		document.getElementById("gt_tasks_sync_delete_button").disabled = false;
		document.getElementById("gt_tasks_sync_newtasktitle").value = taskObjBuf.title;
		if(taskObjBuf.status == "completed")
			document.getElementById("gt_tasks_sync_newtaskcheckbox").checked = true;
		else
			document.getElementById("gt_tasks_sync_newtaskcheckbox").checked = false;
		if(taskObjBuf.notes)
			document.getElementById("gt_tasks_sync_newtasknotes").value = taskObjBuf.notes;
		else
			document.getElementById("gt_tasks_sync_newtasknotes").value = "";
		if(taskObjBuf.due) { //workaround until I can figure out why setting the value property didn't work
			var datepicker = document.getElementById("gt_tasks_sync_newtaskdatepicker");
			datepicker.disabled = false;
			datepicker.style.visibility = "visible";
			document.getElementById("gt_tasks_sync_clear_due_date_button").style.visibility = "visible";
			document.getElementById("gt_tasks_sync_add_due_date_button").style.visibility = "collapse";
		} else {
			var datepicker = document.getElementById("gt_tasks_sync_newtaskdatepicker");
			datepicker.disabled = true;
			datepicker.style.visibility = "collapse";
			document.getElementById("gt_tasks_sync_clear_due_date_button").style.visibility = "collapse";
			document.getElementById("gt_tasks_sync_add_due_date_button").style.visibility = "visible";
		}
		//save the current values in a global variable
		//so that finishEditing() can later check what changes the user actually made
		gt_tasks_sync.oldValues = new Object;
		gt_tasks_sync.oldValues["gt_tasks_sync_newtasknotes"] = document.getElementById("gt_tasks_sync_newtasknotes").value;
		gt_tasks_sync.oldValues["gt_tasks_sync_newtaskcheckbox"] = document.getElementById("gt_tasks_sync_newtaskcheckbox").checked;
		gt_tasks_sync.oldValues["gt_tasks_sync_newtasktitle"] = document.getElementById("gt_tasks_sync_newtasktitle").value;
		gt_tasks_sync.oldValues["gt_tasks_sync_newtaskdatepicker"] = document.getElementById("gt_tasks_sync_newtaskdatepicker").value; //adjusted as part of the datepicker workaround
		gt_tasks_sync.oldValues["gt_tasks_sync_taskdatepickerdisabled"] = document.getElementById("gt_tasks_sync_newtaskdatepicker").disabled;

		//switch to the task editing interface now that it's prepared
		document.getElementById("gt_tasks_sync_taskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_newtaskbox").collapsed = false;
		document.getElementById("gt_tasks_sync_newtasktitle").focus();
		
		//we're done here; a separate function will be called when the user clicks the OK button
		return;
	}
	
	gt_tasks_sync.addDueDate = function(event) {
		event.target.disabled = true;
		var datepicker = document.getElementById("gt_tasks_sync_newtaskdatepicker");
		datepicker.disabled = false;
		datepicker.style.visibility = "visible";
		document.getElementById("gt_tasks_sync_add_due_date_button").style.visibility = "collapse";
		document.getElementById("gt_tasks_sync_clear_due_date_button").style.visibility = "visible";
		event.target.disabled = false;
	}
	
	gt_tasks_sync.clearDueDate = function(event) {
		event.target.disabled = true;
		var datepicker = document.getElementById("gt_tasks_sync_newtaskdatepicker");
		datepicker.style.visibility = "collapse";
		datepicker.disabled = true;
		document.getElementById("gt_tasks_sync_clear_due_date_button").style.visibility = "collapse";
		document.getElementById("gt_tasks_sync_add_due_date_button").style.visibility = "visible";
		event.target.disabled = false;
	}
	
	//called when the user presses the OK button in the task edit window to finalize adding or editing a task
	//will actually update the task in local data and on the Google servers
	//will also return the user to the task list window
	gt_tasks_sync.finishEditing = function()
	{
		if(!gt_tasks_sync.taskBeingEdited) { //add a new task
			var localObjBuf = new Object(); //the new task
			localObjBuf.title = document.getElementById("gt_tasks_sync_newtasktitle").value;
			localObjBuf.notes = document.getElementById("gt_tasks_sync_newtasknotes").value;
			if(document.getElementById("gt_tasks_sync_newtaskcheckbox").checked) {
				localObjBuf.status = "completed";
				localObjBuf.completed = new Date().toISOString();
			} else {
				localObjBuf.status = "needsAction";
				delete localObjBuf.completed;
			}
			var datepickerValue = document.getElementById("gt_tasks_sync_newtaskdatepicker").value;
			if(document.getElementById("gt_tasks_sync_newtaskdatepicker").disabled != true) { //set a due date
				var dueBuf = new Date(datepickerValue);
				var dateBuf = dueBuf.getDate(); //day of the month
				if(dateBuf < 10)
					dateBuf = "0"+dateBuf; //JavaScript ftw
				var monthBuf = dueBuf.getMonth()+1;
				if(monthBuf < 10)
					monthBuf = "0"+monthBuf;
				localObjBuf.due = dueBuf.getFullYear() + "-" + monthBuf + "-" + dateBuf + "T00:00:00.000Z"; 	//TODO: not sure if this won't break in other timzeones
			}
			else
				delete localObjBuf.due; //
			if(!localObjBuf.title) //failsafe to prevent the title from being nonexistent, which is not allowed
				localObjBuf.title = "";
				
			var tasklistId = document.getElementById("gt_tasks_sync_tasklistmenu").value; //tasklist in which we're creating the new task
			
			//save the new task
			localObjBuf.id = gt_tasks_sync.generateTaskId();
			localObjBuf.updated = new Date().toISOString();
			gt_tasks_sync.saveSingleChange(tasklistId, localObjBuf.id, localObjBuf);
			gt_tasks_sync.showTasklistInterface();

		} else {
			//if we got here, we're editing a task		
			var indexOfSlash = gt_tasks_sync.taskBeingEdited.search("/");
			var tasklistId = gt_tasks_sync.taskBeingEdited.substring(0,indexOfSlash);
			var taskId = gt_tasks_sync.taskBeingEdited.slice(indexOfSlash+1);
		
			var localObjBuf = gt_tasks_sync.cloneLocalTask(tasklistId, taskId); //the updated task
			
			var noChanges = true; //keep track of whether the user actually changed anything
			
			if(document.getElementById("gt_tasks_sync_newtasktitle").value != gt_tasks_sync.oldValues["gt_tasks_sync_newtasktitle"])
			{
				localObjBuf.title = document.getElementById("gt_tasks_sync_newtasktitle").value;
				noChanges = false;
			}
			if(document.getElementById("gt_tasks_sync_newtasknotes").value != gt_tasks_sync.oldValues["gt_tasks_sync_newtasknotes"])
			{
				localObjBuf.notes = document.getElementById("gt_tasks_sync_newtasknotes").value;
				if(!document.getElementById("gt_tasks_sync_newtasknotes").value)
				{
					delete localObjBuf.notes; //don't leave an unnecessary notes="" field
				}
				noChanges = false;
			}
			if(document.getElementById("gt_tasks_sync_newtaskcheckbox").checked != gt_tasks_sync.oldValues["gt_tasks_sync_newtaskcheckbox"])
			{
				if(document.getElementById("gt_tasks_sync_newtaskcheckbox").checked)
				{
					localObjBuf.status = "completed";
					localObjBuf.completed = new Date().toISOString();
				}
				else
				{
					localObjBuf.status = "needsAction";
					delete localObjBuf.completed;
				}
				noChanges = false;
			}
			var datepickerValue = document.getElementById("gt_tasks_sync_newtaskdatepicker").value;
			var datepickerdisabled = document.getElementById("gt_tasks_sync_newtaskdatepicker").disabled;
			if(datepickerValue != gt_tasks_sync.oldValues["gt_tasks_sync_newtaskdatepicker"] || gt_tasks_sync.oldValues["gt_tasks_sync_taskdatepickerdisabled"] != datepickerdisabled) {
				if(document.getElementById("gt_tasks_sync_newtaskdatepicker").disabled != true) { //set a due date
					var dueBuf = new Date(datepickerValue);
					var dateBuf = dueBuf.getDate(); //day of the month
					if(dateBuf < 10)
						dateBuf = "0"+dateBuf; //JavaScript ftw
					var monthBuf = dueBuf.getMonth() + 1;
					if(monthBuf < 10)
						monthBuf = "0"+monthBuf;
					localObjBuf.due = dueBuf.getFullYear() + "-" + monthBuf + "-" + dateBuf + "T00:00:00.000Z"; 	//TODO: not sure if this won't break in other timzeones
				} else { //or delete it
					delete localObjBuf.due;
				}
				noChanges = false;
			}
			
			if(!noChanges) //actually update the task in local and remote data
			{
				localObjBuf.updated = new Date().toISOString();
				gt_tasks_sync.saveSingleChange(tasklistId, localObjBuf.id, localObjBuf);
				gt_tasks_sync.showTasklistInterface();
			}
			else
			{
				//alert("No changes.");
				gt_tasks_sync.cancelEditing();
			}
		}
	}
	
	//deleting a task means setting its "deleted" property to "true"
	gt_tasks_sync.deleteTask = function()
	{
		var indexOfSlash = gt_tasks_sync.taskBeingEdited.search("/");
		var tasklistId = gt_tasks_sync.taskBeingEdited.substring(0,indexOfSlash);
		var taskId = gt_tasks_sync.taskBeingEdited.slice(indexOfSlash+1);
		
		var deletedTask = gt_tasks_sync.cloneLocalTask(tasklistId, taskId);
		
		deletedTask.deleted = "true";
		deletedTask.updated = new Date().toISOString();
		
		gt_tasks_sync.saveSingleChange(tasklistId, taskId, deletedTask);
		
		gt_tasks_sync.showTasklistInterface();
	}
	
	gt_tasks_sync.cancelEditing = function()
	{
		//we don't need to clear the elements in gt_tasks_sync_newtaskbox or any variables,
		//next time editing or adding starts, the appropriate function will overwrite their contents
		gt_tasks_sync.showTasklistInterface();
	}
	
	gt_tasks_sync.handleMenulistChange = function()
	{
		gt_tasks_sync.updateTree();
	}
	
	gt_tasks_sync.handleCheckboxChange = function(event)
	{
		event.target.disabled = true; //prevent user from changing the checkbox again too early
		
		//find out which task was changed
		var elementBuf = event.target.parentNode;
		if(elementBuf.getAttribute("class") != "gt_tasks_sync_c_taskwrapper" && elementBuf.getAttribute("class") != "gt_tasks_sync_c_taskwrapper_faded") { //this should never happen - if it does, something clearly went wrong
			gt_tasks_sync.handleError("Unable to determine which task was changed");
			return;
		}
		var indexOfSlash = elementBuf.id.search("/");
		var tasklistId = elementBuf.id.substring(0,indexOfSlash);
		var taskId = elementBuf.id.slice(indexOfSlash+1);
		
		//create the object representing the updated task
		var updatedTask = gt_tasks_sync.cloneLocalTask(tasklistId, taskId);
		var timestamp = new Date().toISOString();
		if(event.target.checked) {
			updatedTask.status = "completed";
			updatedTask.completed = timestamp;
		} else {
			updatedTask.status = "needsAction";
			delete updatedTask.completed;
		}
		updatedTask.updated = timestamp;
		
		gt_tasks_sync.saveSingleChange(tasklistId, taskId, updatedTask);
		
		event.target.disabled = false;
	}
	
	gt_tasks_sync.saveSingleChange = function(tasklistId, taskId, task) {
	
		if(gt_tasks_sync.syncInProgress) {
		
			if(gt_tasks_sync.bufferedTasks[tasklistId] == null)
				gt_tasks_sync.bufferedTasks[tasklistId] = new Object();
			if(gt_tasks_sync.bufferedTasks[tasklistId].items == null)
				gt_tasks_sync.bufferedTasks[tasklistId].items = new Object();
			
			gt_tasks_sync.bufferedTasks[tasklistId].items[taskId] = task;
			
			//alert("Full sync was in progress, saved buffered task " + gt_tasks_sync.bufferedTasks[tasklistId].items[taskId].id);
				
		} else {
			//save and send just the one task that was just changed
			gt_tasks_sync.lockSyncButton();

			gt_tasks_sync.localTasks[tasklistId].items[taskId] = task;
			
			gt_tasks_sync.writeToFile(JSON.stringify(gt_tasks_sync.localTasks), function() {
				gt_tasks_sync.sendSingleTask(tasklistId, task);
			});
			
			//alert("Saved:\n" + tasklistId + "\n" + taskId + "\n" + task.id);
			
		}
		
		//update the UI element representing the changed task
		
		var box_taskwrapper = document.getElementById(tasklistId+"/"+taskId);
		if(!box_taskwrapper) { //a new task has been added
			gt_tasks_sync.rebuildTree();
			return;
		}
		
		if(task.deleted == "true") {
			document.getElementById("gt_tasks_sync_taskcontainer").removeChild(box_taskwrapper);
			return;
		}
		
		var checkbox = box_taskwrapper.firstChild;
		var vbox = box_taskwrapper.lastChild;
		var box_taskmainbox = vbox.firstChild;
		var label_tasknotes = vbox.lastChild; //the notes label may be absent, in which case the taskmainbox will be assigned here, which we'll check for later
		var label_tasktitle = box_taskmainbox.firstChild;
		var label_taskdue = box_taskmainbox.lastChild;

		label_tasktitle.setAttribute("value", task.title);

		if(label_tasknotes != box_taskmainbox) vbox.removeChild(label_tasknotes);
		if(task.notes) {
			label_tasknotes = document.createElement("label");
			label_tasknotes.setAttribute("class", "gt_tasks_sync_c_tasknotes");
			label_tasknotes.setAttribute("crop", "end");
			label_tasknotes.setAttribute("value", task.notes);
			vbox.appendChild(label_tasknotes);
		}
		
		if(task.due) {
			var labelDateBuf = new Date(task.due);
			
			if(new Date(labelDateBuf.valueOf()+86400000) < new Date()) //task is overdue
				label_taskdue.setAttribute("class", "gt_tasks_sync_c_taskoverdue");
			else
				label_taskdue.setAttribute("class", "gt_tasks_sync_c_taskdue");
				
			var dayOfTheMonth = labelDateBuf.getUTCDate();
			var month = labelDateBuf.getUTCMonth() + 1;
			if(dayOfTheMonth < 10)
				dayOfTheMonth = "0" + dayOfTheMonth;
			if(month < 10)
				month = "0" + month;
			
			label_taskdue.setAttribute("value", month+"/"+dayOfTheMonth);
		} else {
			label_taskdue.removeAttribute("value");
			label_taskdue.setAttribute("class", "gt_tasks_sync_c_taskdue");
		}
		
		if(task.status == "completed") {
			checkbox.setAttribute("checked", "true");
			box_taskwrapper.setAttribute("class", "gt_tasks_sync_c_taskwrapper_faded");
		} else {
			checkbox.setAttribute("checked", "false");
			box_taskwrapper.setAttribute("class", "gt_tasks_sync_c_taskwrapper");
		}
	}
	
	//merges buffered tasks into local data, doesn't send them - that's what sendBufferedTasks() is for
	gt_tasks_sync.mergeBufferedTasks = function() {
	
		for(var i in gt_tasks_sync.bufferedTasks) {
			if(gt_tasks_sync.localTasks[i]) { //if a tasklist no longer exists, it was deleted on the remote side and we don't care about it anymore
				for(var j in gt_tasks_sync.bufferedTasks[i].items) {
					gt_tasks_sync.localTasks[i].items[j] = gt_tasks_sync.bufferedTasks[i].items[j];
				}
			}
		}

	}

	gt_tasks_sync.sendBufferedTasks = function() {
	
		gt_tasks_sync.tasksToSend = new Object();
	
		for(var i in gt_tasks_sync.bufferedTasks) {
			gt_tasks_sync.tasksToSend[i] = new Object();
			gt_tasks_sync.tasksToSend[i].items = new Object();
			for(var j in gt_tasks_sync.bufferedTasks[i].items) {
				gt_tasks_sync.tasksToSend[i].items[j] = gt_tasks_sync.bufferedTasks[i].items[j];
			}
		}
		gt_tasks_sync.sendTasks(false);
		
		//by the time this method is called, the bufferedTasks will always be merged into local data,
		//and now that they've also been copied to tasksToSend they can safely be cleared
		gt_tasks_sync.bufferedTasks = new Object();
	}
	
	gt_tasks_sync.toggleSorting = function(event) {
		if(event.target.hasAttribute("checked")) 
			gt_tasks_sync.prefBranch.setBoolPref("sort_by_due_date", 1);
		else
			gt_tasks_sync.prefBranch.setBoolPref("sort_by_due_date", 0);
			
		gt_tasks_sync.rebuildTree();
	}
	
	gt_tasks_sync.toggleHideCompletedTasks = function(event) {
		if(event.target.hasAttribute("checked")) 
			gt_tasks_sync.prefBranch.setBoolPref("hide_completed_tasks", 1);
		else
			gt_tasks_sync.prefBranch.setBoolPref("hide_completed_tasks", 0);
			
		gt_tasks_sync.rebuildTree();
	}
	
	gt_tasks_sync.startReordering = function() {
		//prepare the interface
		var currentTasklistId = document.getElementById("gt_tasks_sync_tasklistmenu").value;
		var label = document.getElementById("gt_tasks_sync_reorderboxlabel");
		label.value = "Reordering " + gt_tasks_sync.localTasks[currentTasklistId].header.title;

		//if main interface was sorted by due date, switch it to custom order since the reordering interface will copy its task order
		//this is desirable anyway because the user will want to see their new custom order once they're done rearranging
		if(gt_tasks_sync.prefBranch.getBoolPref("sort_by_due_date")) {
			gt_tasks_sync.prefBranch.setBoolPref("sort_by_due_date", 0);
			document.getElementById("gt_tasks_sync_menuitem_sort").removeAttribute("checked");
			var dummy = gt_tasks_sync.rebuildTree();
		}
		
		gt_tasks_sync.tasksInMainInterface = new Array();
		var vbox = document.getElementById("gt_tasks_sync_taskcontainer");
		var nodes = vbox.childNodes;
		for(var i in nodes) {
			var indexOfSlash = nodes.item(i).id.search("/");
			var idBuffer = nodes.item(i).id.slice(indexOfSlash+1);
			gt_tasks_sync.tasksInMainInterface.push(idBuffer);
		}
		var dummy = gt_tasks_sync.rebuildReorderingTree();
		
		//switch to it
		gt_tasks_sync.showReorderingInterface();
	}
	
	gt_tasks_sync.finishReordering = function() {
		for(var i in gt_tasks_sync.unconfirmedQueuedMoves) {
			for(var j in gt_tasks_sync.unconfirmedQueuedMoves[i]) {
				if(typeof gt_tasks_sync.queuedMoves[i] === 'undefined')
					gt_tasks_sync.queuedMoves[i] = new Object();

				gt_tasks_sync.queuedMoves[i][j] = gt_tasks_sync.unconfirmedQueuedMoves[i][j];
			}
		}
		//alert("Saving queued moves");
		gt_tasks_sync.saveQueuedMoves(function() {
			gt_tasks_sync.showTasklistInterface();
			gt_tasks_sync.rebuildTree();
			//alert("Starting full sync");
			gt_tasks_sync.startFullSync();
		});
	}
	
	gt_tasks_sync.cancelReordering = function() {
		gt_tasks_sync.unconfirmedQueuedMoves = new Object();
		gt_tasks_sync.showTasklistInterface();
	}

	 /**
     * onDropMessage
     *
     * Gets called in case we're dropping a message
     * on the 'task mode'-button.
     *
     * @param aMsgHdr     The message to handle.
     */
    gt_tasks_sync.onDropMessage = function(aMsgHdr) {
    	let task = new Object();

        let msgFolder = aMsgHdr.folder;
        let msgUri = msgFolder.getUriForMsg(aMsgHdr);

        task.title = aMsgHdr.mime2DecodedSubject;

        let messenger = Components.classes["@mozilla.org/messenger;1"]
                                  .createInstance(Components.interfaces.nsIMessenger);
        let streamListener = Components.classes["@mozilla.org/network/sync-stream-listener;1"]
                                       .createInstance(Components.interfaces.nsISyncStreamListener);
        messenger.messageServiceFromURI(msgUri).streamMessage(msgUri,
                                                              streamListener,
                                                              null,
                                                              null,
                                                              false,
                                                              "",
                                                              false);

        let plainTextMessage = "";
        plainTextMessage = msgFolder.getMsgTextFromStream(streamListener.inputStream,
                                                          aMsgHdr.Charset,
                                                          65536,
                                                          32768,
                                                          false,
                                                          true,
                                                          {});
        task.notes =  plainTextMessage;

        gt_tasks_sync.startAdding(task);
    }
	
	gt_tasks_sync.init = function()
	{	
		//hack to move overlay elements below Lightning's events and tasks - the position property didn't work for some reason
		var myBox = document.querySelector("#gt_tasks_sync_interfacewrapper");
		var mySplitter = document.querySelector("#gt_tasks_sync_splitter");
		var myBoxParent = myBox.parentNode;
		myBoxParent.removeChild(mySplitter);
		myBoxParent.removeChild(myBox);
		
		if(gt_tasks_sync.prefBranch.getCharPref("attach_to") == "folder_pane") {
			myBoxParent = document.querySelector("#folderPaneBox");
		} else { //default to Lightning's today pane if available, otherwise, fall back on folder pane
			//alert("1");
			myBoxParent = document.querySelector("#today-pane-panel");
			if(!myBoxParent) { //looks like Lightning isn't installed, so fall back on folder pane
				//alert("2");
				myBoxParent = document.querySelector("#folderPaneBox");
				gt_tasks_sync.prefBranch.setCharPref("attach_to", "folder_pane");
			}
		}
		
		myBoxParent.appendChild(mySplitter);
		myBoxParent.appendChild(myBox);
		
		//make the menu reflect the preferences
		if(gt_tasks_sync.prefBranch.getBoolPref("sort_by_due_date"))
			document.getElementById("gt_tasks_sync_menuitem_sort").setAttribute("checked", true);
		else
			document.getElementById("gt_tasks_sync_menuitem_sort").removeAttribute("checked");
			
		if(gt_tasks_sync.prefBranch.getBoolPref("hide_completed_tasks"))
			document.getElementById("gt_tasks_sync_menuitem_hide_completed").setAttribute("checked", true);
		else
			document.getElementById("gt_tasks_sync_menuitem_hide_completed").removeAttribute("checked");
	
		gt_tasks_sync.showDummyInterface("Initializing...");
		gt_tasks_sync.bufferedTasks = new Object; //initialize this global variable now so the functions that use it won't have to
		
		gt_tasks_sync.ensureFilesExist();
		
		//handle backup
		gt_tasks_sync.createBackup(function() { //continue init once createBackup is done

			var accessToken = gt_tasks_sync.prefBranch.getCharPref("access_token");
			var refreshToken = gt_tasks_sync.prefBranch.getCharPref("refresh_token");
		
			if(gt_tasks_sync.prefBranch.getBoolPref('clear_all_on_startup') || (!accessToken && !refreshToken)) { //complete addon reset
				//alert("Reset!");
				gt_tasks_sync.prefBranch.clearUserPref('access_token');
				gt_tasks_sync.prefBranch.clearUserPref('refresh_token');
				gt_tasks_sync.prefBranch.clearUserPref('clear_all_on_startup');
				gt_tasks_sync.prefBranch.clearUserPref('last_sync_time');
				gt_tasks_sync.prefBranch.clearUserPref('last_sync_time_minus_leeway');
				gt_tasks_sync.showWelcomeInterface();
				document.getElementById("gt_tasks_sync_dummylabel").setAttribute("value", "Synchronizing...");
			} else {
				//alert("No reset.");
				gt_tasks_sync.readFromFile(function(localData) {
					try {
						gt_tasks_sync.localTasks = JSON.parse(localData);
					} catch(e) { //local data is corrupt, re-download everything from Google
						gt_tasks_sync.localTasks = new Object();
						gt_tasks_sync.queuedMoves = new Object();
						gt_tasks_sync.prefBranch.clearUserPref('last_sync_time');
						gt_tasks_sync.prefBranch.clearUserPref('last_sync_time_minus_leeway');
					}
					var dummy = gt_tasks_sync.rebuildTree(); //will allow add-on to function if we're offline or the full sync fails for some other reason
					gt_tasks_sync.startFullSync(); //TODO: temporarily commented out for development purposes
					gt_tasks_sync.showTasklistInterface(); //not needed if above line is active
				});
			}
		});
	
	}
	
	gt_tasks_sync.welcome = function() {
		gt_tasks_sync.showTasklistInterface();
		gt_tasks_sync.startFullSync();
	}
	
window.addEventListener("load", gt_tasks_sync.init, false);
