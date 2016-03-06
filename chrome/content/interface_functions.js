/*
    Google Tasks sync for Mozilla Thunderbird
*/

	gt_tasks_sync.showWelcomeInterface = function()
	{
		document.getElementById("gt_tasks_sync_welcomebox").collapsed = false;
		document.getElementById("gt_tasks_sync_taskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_newtaskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_dummytaskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_reorderbox").collapsed = true;
		document.getElementById("gt_tasks_sync_reorderingkeys").setAttribute("disabled", true);
		return true;
	}
	
	gt_tasks_sync.showDummyInterface = function(stringToDisplay)
	{
		document.getElementById("gt_tasks_sync_dummylabel").setAttribute("value", stringToDisplay);
	
		document.getElementById("gt_tasks_sync_welcomebox").collapsed = true;
		document.getElementById("gt_tasks_sync_taskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_newtaskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_dummytaskbox").collapsed = false;
		document.getElementById("gt_tasks_sync_reorderbox").collapsed = true;
		document.getElementById("gt_tasks_sync_reorderingkeys").setAttribute("disabled", true);
		return true;
	}
	
	gt_tasks_sync.showTasklistInterface = function()
	{
		document.getElementById("gt_tasks_sync_welcomebox").collapsed = true;
		document.getElementById("gt_tasks_sync_taskbox").collapsed = false; //upon unlocking the UI, we always end up in this panel
		document.getElementById("gt_tasks_sync_newtaskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_dummytaskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_reorderbox").collapsed = true;
		document.getElementById("gt_tasks_sync_reorderingkeys").setAttribute("disabled", true);
		return true;
	}
	
	gt_tasks_sync.showReorderingInterface = function()
	{
		document.getElementById("gt_tasks_sync_welcomebox").collapsed = true;
		document.getElementById("gt_tasks_sync_taskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_newtaskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_dummytaskbox").collapsed = true;
		document.getElementById("gt_tasks_sync_reorderbox").collapsed = false;
		document.getElementById("gt_tasks_sync_reorderingkeys").setAttribute("disabled", false);
		
		document.getElementById("gt_tasks_sync_reorderinghelp").collapsed = true; //don't show help by default
		
		return true;
	}
	
	gt_tasks_sync.lockSyncButton = function() {
		gt_tasks_sync.syncInProgress = true;
		document.getElementById("gt_tasks_sync_full_sync_button").disabled = true;
		document.getElementById("gt_tasks_sync_full_sync_button").image = "chrome://google_tasks_sync/skin/sync-hourglass.png"; //show the user that the change is being pushed
	}
	
	gt_tasks_sync.unlockSyncButton = function(error) {
		if(error) {
			document.getElementById("gt_tasks_sync_full_sync_button").image = "chrome://google_tasks_sync/skin/sync-alert.png";
			document.getElementById("gt_tasks_sync_full_sync_button").setAttribute("tooltiptext", "Last sync failed. Click to retry.\nDetails were logged to Thunderbird's error console.");
		} else {
			document.getElementById("gt_tasks_sync_full_sync_button").image = "chrome://google_tasks_sync/skin/sync.png";
			document.getElementById("gt_tasks_sync_full_sync_button").setAttribute("tooltiptext", "Sync all tasklists");
		}
		
		gt_tasks_sync.syncInProgress = false;
		document.getElementById("gt_tasks_sync_full_sync_button").disabled = false;
	}

	//called on startup as well as at the end of a fullSync to (re-)create the UI
	//TODO: merge rebuildTree and updateTree
	gt_tasks_sync.rebuildTree = function()
	{
		
		//empty the menulist containing tasklists
		var menulist = document.getElementById("gt_tasks_sync_tasklistmenu");
		var lastValue = menulist.value; //use this to switch back to the same tasklist later, if it still exists
		var menupopup = document.getElementById("gt_tasks_sync_tasklistselection");
		
		while(menupopup.hasChildNodes())
		{
			menupopup.removeChild(menupopup.lastChild);
		}
		
		//refill it
		var menuitem;
		for(var i in gt_tasks_sync.localTasks) 
		{
			menuitem = document.createElement("menuitem");
			menuitem.setAttribute("label", gt_tasks_sync.localTasks[i].header.title);
			menuitem.setAttribute("value", gt_tasks_sync.localTasks[i].header.id);
			menupopup.appendChild(menuitem);
			if(menuitem.value == lastValue)
				menulist.selectedItem = menuitem;
		}
		if(menulist.selectedIndex == -1)
			menulist.selectedIndex = 0; //looks like the previous tasklist no longer exists, so select one of the others
		
		//TODO: maybe rename gt_tasks_sync.treeItems, since boxes are now used?
		//fill gt_tasks_sync.treeItems, a global variable storing box elements to be used in the "tree", similar structure to dataArr
		var vbox;
		var box1;
		var checkbox;
		var box2;
		var label;
		
		//purge whatever was in the array so far, since we're rebuilding from scratch
		gt_tasks_sync.treeItems = new Object();
		
		for(var i in gt_tasks_sync.localTasks)
		{
			gt_tasks_sync.treeItems[i] = new Object();
		
			for(var j in gt_tasks_sync.localTasks[i].items)
			{
				if(!gt_tasks_sync.localTasks[i].items[j].deleted && !gt_tasks_sync.localTasks[i].items[j].hidden)
				{
					if(gt_tasks_sync.localTasks[i].items[j].status != "completed" || !gt_tasks_sync.prefBranch.getBoolPref("hide_completed_tasks")) {
					
						box1 = document.createElement("box");
						box1.setAttribute("class", "gt_tasks_sync_c_taskwrapper");
						box1.setAttribute("align", "start");
						box1.id = gt_tasks_sync.localTasks[i].header.id + "/" + gt_tasks_sync.localTasks[i].items[j].id;
						
						if(!gt_tasks_sync.prefBranch.getBoolPref("sort_by_due_date")) {
							
							//indent - by level: 0px, 20px, 30px, 40px, 45px, 50px, 55px, ... (+5 for each additional level)
							switch(gt_tasks_sync.numberOfAncestors(i, j)) {
								case 0:
									box1.style.paddingLeft = "0px";
									break;
								case 1:
									box1.style.paddingLeft = "20px";
									break;
								case 2:
									box1.style.paddingLeft = "30px";
									break;
								case 3:
									box1.style.paddingLeft = "40px";
									break;
								default:
									var newPadding = 40 + 5 * (gt_tasks_sync.numberOfAncestors(i, j) - 3);
									box1.style.paddingLeft = newPadding + "px";
									break;
							}
						}
						
						//status checkbox
						checkbox = document.createElement("checkbox");
						checkbox.setAttribute("class", "gt_tasks_sync_c_taskcheckbox");
						checkbox.setAttribute("oncommand", "gt_tasks_sync.handleCheckboxChange(event)");
						if(gt_tasks_sync.localTasks[i].items[j].status == "completed") {
							checkbox.setAttribute("checked", "true");
							//box1.setAttribute("style", "opacity: 0.7;"); //TODO: rewrite this to change the class
							box1.setAttribute("class", "gt_tasks_sync_c_taskwrapper_faded");
						}
						else {
							checkbox.setAttribute("checked", "false");
						}
						box1.appendChild(checkbox);
						
						//vbox wrapping box2 and the notes label (if present)
						vbox = document.createElement("vbox");
						vbox.flex = "1";
						vbox.setAttribute("class", "gt_tasks_sync_c_taskauxbox");
						vbox.setAttribute("onclick", "gt_tasks_sync.startEditing(event);");
						
						//box wrapping the title and due date labels
						box2 = document.createElement("box");
						box2.setAttribute("class", "gt_tasks_sync_c_taskmainbox");
						box2.flex = "1";
						
						//title label
						label = document.createElement("label");
						label.setAttribute("class", "gt_tasks_sync_c_tasktitle");
						label.flex = "1";
						label.setAttribute("crop", "end");
						label.setAttribute("value", gt_tasks_sync.localTasks[i].items[j].title);
						box2.appendChild(label);
						
						//due date label
						label = document.createElement("label");
						label.setAttribute("class", "gt_tasks_sync_c_taskdue");
						if(gt_tasks_sync.localTasks[i].items[j].due) {
							var labelDateBuf = new Date(gt_tasks_sync.localTasks[i].items[j].due);
							label.setAttribute("value", gt_tasks_sync.generateDueDateLabel(labelDateBuf));
						}					
						box2.appendChild(label);
						
						vbox.appendChild(box2);
						//notes label
						if(gt_tasks_sync.localTasks[i].items[j].notes) {
							label = document.createElement("label");
							label.setAttribute("class", "gt_tasks_sync_c_tasknotes");
							label.setAttribute("crop", "end");
							label.setAttribute("value", gt_tasks_sync.localTasks[i].items[j].notes);
							vbox.appendChild(label);
						}					
						
						box1.appendChild(vbox);				
						gt_tasks_sync.treeItems[i][j] = box1;
					}
				}
			}
		}
		
		//now put the appropriate treeitems in the "tree", visible to the user		
		return gt_tasks_sync.updateTree();
	}
	
	//projects the gt_tasks_sync.treeItems global variable onto the UI
	//note that gt_tasks_sync.treeItems actually contains boxes of class "gt_tasks_sync_taskwrapper"
	//also reflects the "queued moves" (gt_tasks_sync.queuedMoves)
	//called whenever selection in menulist changes, or when a task is added or deleted
	//gets new tasklist id from the menulist's value, thus takes no arguments
	gt_tasks_sync.updateTree = function()
	{
		var vbox = document.getElementById("gt_tasks_sync_taskcontainer");
		
		//get rid of all current elements
		while(vbox.hasChildNodes())
		{
			vbox.removeChild(vbox.lastChild);
		}
		
		//add new elements
		var currentTasklistId = document.getElementById("gt_tasks_sync_tasklistmenu").value;
		if(!currentTasklistId) //looks like no data was downloaded yet, so we have nothing to work with here
			return false;
		var keyArrL2 = Object.keys(gt_tasks_sync.treeItems[currentTasklistId]);
		var box1;
		var sortHere = new Array();
		for(var j=0; j<keyArrL2.length; j++)
			sortHere.push(gt_tasks_sync.treeItems[currentTasklistId][keyArrL2[j]]);

		if(gt_tasks_sync.prefBranch.getBoolPref("sort_by_due_date")) { //this reflects the checkbox option in the menu
			sortHere.sort(function (a,b) {
			
				//get the task corresponding to a
				var indexOfSlash = a.id.search("/");
				var aTasklistId = a.id.substring(0,indexOfSlash);
				var aTaskId = a.id.slice(indexOfSlash+1);
				
				//get the task corresponding to b
				indexOfSlash = b.id.search("/");
				var bTasklistId = b.id.substring(0,indexOfSlash);
				var bTaskId = b.id.slice(indexOfSlash+1);
				
				var aTask = gt_tasks_sync.localTasks[aTasklistId].items[aTaskId];
				var bTask = gt_tasks_sync.localTasks[bTasklistId].items[bTaskId];
			
				//first criterion: completion
				var aStatus = a.firstChild.getAttribute("checked");
				var bStatus = b.firstChild.getAttribute("checked");
				if(aTask.status != "completed" && bTask.status == "completed") {
					return -1; //place a before b, since completed tasks go last
				}
				if(aTask.status == "completed" && bTask.status != "completed") {
					return 1;
				}
				
				//second criterion: due date
				if(aTask.due && !bTask.due)
					return -1; //place a before b, since tasks with no due date go last
				if(bTask.due && !aTask.due)
					return 1;
				
				//we can compare the strings directly - they are RFCsomething timestamps
				if(aTask.due > bTask.due) {
					return 1; //less time left -> task goes higher
				} else if(aTask.due == bTask.due) { //fall back on title
					if(aTask.title < bTask.title)
						return -1;
					else if(aTask.title > bTask.title)
						return 1;
					else
						return 0;
				} else {
					return -1;
				}
			});
		} else { //display in user's custom order
			sortHere.sort(function (a,b) {

				//get the task corresponding to a
				var indexOfSlash = a.id.search("/");
				var aTasklistId = a.id.substring(0,indexOfSlash);
				var aTaskId = a.id.slice(indexOfSlash+1);
				
				//get the task corresponding to b
				indexOfSlash = b.id.search("/");
				var bTasklistId = b.id.substring(0,indexOfSlash);
				var bTaskId = b.id.slice(indexOfSlash+1);
				
				var aPositions = gt_tasks_sync.getPositions(aTasklistId, aTaskId);
				var bPositions = gt_tasks_sync.getPositions(bTasklistId, bTaskId);
				var lesserLength = Math.min(aPositions.length, bPositions.length);
				
				for(var i=0; i<lesserLength; i++) {
					if(aPositions[i] < bPositions[i]) {
						return -1; //place a before b
					}
					if(bPositions[i] < aPositions[i]) {
						return 1;
					}
				}
				
				return aPositions.length - bPositions.length;
			});
		}
		
		while(sortHere.length > 0)
			vbox.appendChild(sortHere.shift());
		
		for(var j in gt_tasks_sync.queuedMoves[currentTasklistId]) {
			if(gt_tasks_sync.queuedMoves[currentTasklistId][j].newSibling) {
				var insertAfter = gt_tasks_sync.queuedMoves[currentTasklistId][j].newSibling;
				gt_tasks_sync.moveTaskNode(j, insertAfter);
			} else if (gt_tasks_sync.queuedMoves[currentTasklistId][j].newParent) {
				var insertAfter = gt_tasks_sync.queuedMoves[currentTasklistId][j].newParent;
				gt_tasks_sync.moveTaskNode(j, insertAfter);
			} else {
				gt_tasks_sync.moveTaskNode(j);
			}
		}
			
		return true;
	}
	
	//remove the node representing node1TaskId and insert it after node2TaskId and adjust indent
	gt_tasks_sync.moveTaskNode = function(node1TaskId, node2TaskId) {
		
		var vbox = document.getElementById("gt_tasks_sync_taskcontainer");
		
		//find node1
		var nodes = vbox.childNodes;
		for(var i in nodes) {
			var indexOfSlash = nodes.item(i).id.search("/");
			var idBuffer = nodes.item(i).id.slice(indexOfSlash+1);
			if(idBuffer == node1TaskId)
				var node1 = nodes.item(i);
		}

		if(!node1.style.paddingLeft) {
			var originalTaskPadding = 0;
		} else {
			var strBuf = node1.style.paddingLeft.toString();
			var originalTaskPadding = parseInt(strBuf.substring(0,strBuf.length-2));
		}
		
		//remove node1's child task nodes
		var node1Children = new Array();
		while(node1.nextSibling) {
			if(!node1.nextSibling.style.paddingLeft) {
				var nextNodePadding = 0;
			} else {				
				var strBuf = node1.nextSibling.style.paddingLeft.toString();
				var nextNodePadding = parseInt(strBuf.substring(0,strBuf.length-2));
			}
			
			if(nextNodePadding <= originalTaskPadding) //there are no more child tasks
				break;

			node1Children.push(vbox.removeChild(node1.nextSibling));
		}
		//remove node1 itself
		var node1 = vbox.removeChild(node1);
		
		if(!node2TaskId) { //move to first position
			var removedNodes = new Array();
			while(vbox.hasChildNodes())
				removedNodes.push(vbox.removeChild(vbox.firstChild));
			
			vbox.appendChild(node1);
			while(node1Children.length > 0)
				vbox.appendChild(node1Children.shift());
			
			while(removedNodes.length > 0)
				vbox.appendChild(removedNodes.shift());

			node1.style.paddingLeft = "0px";
			
			return;
		}
		
		//find node2
		var nodes = vbox.childNodes; //not sure how deep this assignment is, so let's re-assign
		for(var i in nodes) {
			var indexOfSlash = nodes.item(i).id.search("/");
			var idBuffer = nodes.item(i).id.slice(indexOfSlash+1);
			if(idBuffer == node2TaskId)
				var node2 = nodes.item(i);
		}
		//find node2's last child
		if(!node2.style.paddingLeft) {
			var node2Padding = 0;
		} else {
			var strBuf = node2.style.paddingLeft.toString();
			var node2Padding = parseInt(strBuf.substring(0,strBuf.length-2));
		}
		var childTaskNode = node2;
		while(childTaskNode) {
			var nextNode = childTaskNode.nextSibling;
			if(!nextNode)
				break;
			
			if(!nextNode.style.paddingLeft) {
				var nextNodePadding = 0;
			} else {
				var strBuf = nextNode.style.paddingLeft.toString();
				var nextNodePadding = parseInt(strBuf.substring(0,strBuf.length-2));
			}
			if(nextNodePadding <= node2Padding) { //found something that's not a child task
				var lastChildTaskNode = childTaskNode;
				break;
			}
			childTaskNode = nextNode;
		}
		var trailingNodes = new Array();
		if(lastChildTaskNode) { //if this does not exist, there are no trailing nodes to remove
			while(lastChildTaskNode.nextSibling) {
				trailingNodes.push(vbox.removeChild(lastChildTaskNode.nextSibling));
			}
		}
		
		//now put back node1 and its child tasks
		vbox.appendChild(node1);
		for(var i = 0; i < node1Children.length; i++) { // we keep them in the array to fix their indents later
			vbox.appendChild(node1Children[i]);
		}
			
		//put back the trailing tasks
		while(trailingNodes.length > 0)
			vbox.appendChild(trailingNodes.shift());


		var currentTasklistId = document.getElementById("gt_tasks_sync_tasklistmenu").value; //debug only
		
		//fix indents of node1 and nodes representing its child tasks
		node1Children.push(node1);
		for(var i = 0; i < node1Children.length; i++) {
			var currentTaskId = node1Children[i].id.slice(indexOfSlash+1);

			switch(gt_tasks_sync.numberOfAncestors(currentTasklistId, currentTaskId)) {
				case 0:
					node1Children[i].style.paddingLeft = "0px";
					break;
				case 1:
					node1Children[i].style.paddingLeft = "20px";
					break;
				case 2:
					node1Children[i].style.paddingLeft = "30px";
					break;
				case 3:
					node1Children[i].style.paddingLeft = "40px";
					break;
				default:
					var newPadding = 40 + 5 * (gt_tasks_sync.numberOfAncestors(currentTasklistId, currentTaskId) - 3);
					node1Children[i].style.paddingLeft = newPadding + "px";
					break;
			}
		}
	}
	
	//used to fix indent in above method; takes queued moves into account
	gt_tasks_sync.numberOfAncestors = function(tasklistId, taskId) {
		var ancestorCount = 0;
		
		var taskBuf = gt_tasks_sync.localTasks[tasklistId].items[taskId];
		//alert("Checking ancestor count for: " + taskBuf.title);
		
		var flag;
		while(true) {
			if(gt_tasks_sync.queuedMoves.hasOwnProperty(tasklistId) && gt_tasks_sync.queuedMoves[tasklistId].hasOwnProperty(taskBuf.id) && gt_tasks_sync.queuedMoves[tasklistId][taskBuf.id].hasOwnProperty("newParent")) {
				ancestorCount++;
				taskBuf = gt_tasks_sync.localTasks[tasklistId].items[ gt_tasks_sync.queuedMoves[tasklistId][taskBuf.id]["newParent"] ];
			} else if(taskBuf.hasOwnProperty("parent")) {
				taskBuf = gt_tasks_sync.localTasks[tasklistId].items[taskBuf.parent];
				ancestorCount++;
			} else {
				break;
			}
		}
		
		//alert("Ancestor count is: " + ancestorCount);
		return ancestorCount;
	}
	
	//returns an array containing the position property of the task and all of its "ancestors", used to sort tasks when displaying in user-specified order
	//does not need to resolve queued moves because it's used before queued moves are applied to the UI
	gt_tasks_sync.getPositions = function(tasklistId, taskId) {
	
		var arrBuf = new Array();
		
		var taskBuf = gt_tasks_sync.localTasks[tasklistId].items[taskId];
		
		if(taskBuf) { //TODO: this check shouldn't be necessary
			arrBuf.push(taskBuf.position);
			
			while(taskBuf.parent) {
				taskBuf = gt_tasks_sync.localTasks[tasklistId].items[taskBuf.parent];
				arrBuf.push(taskBuf.position);			
			}
			
			arrBuf.reverse();
		}

		return arrBuf;
	}
	
