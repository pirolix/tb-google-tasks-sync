/*
	Google Tasks Sync for Mozilla Thunderbird
*/

//the backup viewer is a separate window
Components.utils.import("resource://gre/modules/FileUtils.jsm");
if(typeof gt_tasks_sync === "undefined")
	gt_tasks_sync = new Object();

/*indent to improve legibility*/
	gt_tasks_sync.backupTasks = new Object();

	gt_tasks_sync.listSnapshots = function() {
		
		var backupDir = FileUtils.getDir("ProfD", ["google_tasks_sync", "backup"]);
		//alert(backupDir.directoryEntries);
		var backupDirContents = backupDir.directoryEntries;
		
		var menupopup = document.getElementById("oc_backupsnapshotmenu");
		while(menupopup.hasChildNodes())
			menupopup.removeChild(menupopup.lastChild);
		
		var sortHere = new Array();
		while(backupDirContents.hasMoreElements()) { //TODO: some error handling here might be a good idea
			var currentFile = backupDirContents.getNext().QueryInterface(Components.interfaces.nsIFile);
			var menuitem = document.createElement("menuitem");
			var niceTimestamp = currentFile.leafName.substr(0,10) + ", " + currentFile.leafName.substr(11,2) + ":" + currentFile.leafName.substr(14,2) + ":" + currentFile.leafName.substr(17,2) + " UTC";
			menuitem.setAttribute("label", niceTimestamp);
			menuitem.setAttribute("value", currentFile.path);
			sortHere.push(menuitem);
		}
		if(sortHere.length == 0) {
			var menuitem = document.createElement("menuitem");
			menuitem.setAttribute("label", "There are no backups.");
			menupopup.appendChild(menuitem);
			document.getElementById("oc_backupsnapshotlist").disabled = true;
		} else {
			document.getElementById("oc_backupsnapshotlist").disabled = false;
		}
		
		sortHere.sort(function (a,b) {
			var aLabel = a.getAttribute("label");
			var bLabel = b.getAttribute("label");
			if(aLabel > bLabel) {
				return -1; //place a before b - more recent date first
			} else {
				return 1;
			}
		});
		
		while(sortHere.length > 0)
			menupopup.appendChild(sortHere.shift());

		document.getElementById("oc_backupsnapshotlist").selectedIndex = 0;
		
		if(!document.getElementById("oc_backupsnapshotlist").disabled)
			gt_tasks_sync.switchSnapshot();

	}

	gt_tasks_sync.switchSnapshot = function()
	{
		var processedPath = document.getElementById("oc_backupsnapshotlist").value; //taken straight from nsIFile.path, so should be platform-agnostic

		var file = FileIO.open(processedPath);
		if(!file) {
			gt_tasks_sync.handleReturnedError("Unable to open file data.txt for reading");
			return;
		}
		
		var backupData = FileIO.read(file, "UTF-8");
		try {
			gt_tasks_sync.backupTasks = JSON.parse(backupData);
		} catch(e) {
			gt_tasks_sync.backupTasks = new Object();
		}
		
		var menupopup = document.getElementById("oc_backupobjectmenu");
		while(menupopup.hasChildNodes())
			menupopup.removeChild(menupopup.lastChild);
		
		if(Object.keys(gt_tasks_sync.backupTasks).length == 0) {
			var menuitem = document.createElement("menuitem");
			menuitem.setAttribute("label", "This snapshot is empty.");
			document.getElementById("oc_backuptitlelabel").value = "Status & title:";
			document.getElementById("oc_backuptitlebox").value = "";
			document.getElementById("oc_backupcheckbox").collapsed = false;
			document.getElementById("oc_backupcheckbox").checked = false;
			document.getElementById("oc_backuptitlebox").setAttribute("style", "margin-left: -8px;");
			document.getElementById("oc_backupnotesbox").value = "";
			document.getElementById("oc_backupduedatebox").value = "";
			document.getElementById("oc_backupjsonbox").value = "";
			menupopup.appendChild(menuitem);
			document.getElementById("oc_backupobjectlist").disabled = true;
		} else {
			document.getElementById("oc_backupobjectlist").disabled = false;
			for(var i in gt_tasks_sync.backupTasks) {
				//header
				var menuitem = document.createElement("menuitem");
				menuitem.setAttribute("label", gt_tasks_sync.backupTasks[i]['header'].title + " - the tasklist itself");
				menuitem.setAttribute("value", gt_tasks_sync.backupTasks[i]['header'].id + "/" + "header");
				menupopup.appendChild(menuitem);
				
				//items
				for(var j in gt_tasks_sync.backupTasks[i].items) {
					var menuitem = document.createElement("menuitem");
					menuitem.setAttribute("label", gt_tasks_sync.backupTasks[i]['header'].title + " / " + gt_tasks_sync.backupTasks[i].items[j].title);
					menuitem.setAttribute("value", gt_tasks_sync.backupTasks[i]['header'].id + "/" + gt_tasks_sync.backupTasks[i].items[j].id);
					menupopup.appendChild(menuitem);
				}
			}
		}
		
		document.getElementById("oc_backupobjectlist").selectedIndex = 0;
		if(!document.getElementById("oc_backupobjectlist").disabled)
			gt_tasks_sync.switchTask();
		
	}

	gt_tasks_sync.switchTask = function()
	{
		var extractFromThis = document.getElementById("oc_backupobjectlist").value;
		var indexOfSlash = extractFromThis.search("/");
		var tasklistId = extractFromThis.substr(0,indexOfSlash);
		var taskId = extractFromThis.substring(indexOfSlash+1);
		
		if(taskId == "header") {
			document.getElementById("oc_backuptitlebox").value = gt_tasks_sync.backupTasks[tasklistId].header.title;
			
			document.getElementById("oc_backuptitlelabel").value = "Title:";
			document.getElementById("oc_backupcheckbox").collapsed = true;
			document.getElementById("oc_backuptitlebox").setAttribute("style", "");
			document.getElementById("oc_backupnotesbox").value = "N/A";
			document.getElementById("oc_backupduedatebox").value = "N/A";
			
			var niceJSON = "{\n";
			for(var i in gt_tasks_sync.backupTasks[tasklistId].header) {
				niceJSON += "   \"" + i + "\": \"" + gt_tasks_sync.backupTasks[tasklistId].header[i] + "\",\n";
			}
			niceJSON += "}"
			document.getElementById("oc_backupjsonbox").value = niceJSON;
			
		} else {
			document.getElementById("oc_backuptitlebox").value = gt_tasks_sync.backupTasks[tasklistId].items[taskId].title;
				
			if(gt_tasks_sync.backupTasks[tasklistId].items[taskId].notes)
				document.getElementById("oc_backupnotesbox").value = gt_tasks_sync.backupTasks[tasklistId].items[taskId].notes;
			else
				document.getElementById("oc_backupnotesbox").value = "";
				
			if(gt_tasks_sync.backupTasks[tasklistId].items[taskId].due) {
				var labelDateBuf = new Date(gt_tasks_sync.backupTasks[tasklistId].items[taskId].due);
				var dayOfTheMonth = labelDateBuf.getDate();
				var month = labelDateBuf.getMonth() + 1; //+1 because in getMonth() 0 corresponds to January etc.
				if(dayOfTheMonth < 10)
					dayOfTheMonth = "0" + dayOfTheMonth; //untyped variables ftw
				if(month < 10)
					month = "0" + month;
				document.getElementById("oc_backupduedatebox").value = labelDateBuf.getFullYear()+"-"+month+"-"+dayOfTheMonth;
			} else {
				document.getElementById("oc_backupduedatebox").value = "";
			}
			
			document.getElementById("oc_backuptitlelabel").value = "Status & title:";
			document.getElementById("oc_backupcheckbox").collapsed = false;
			document.getElementById("oc_backuptitlebox").setAttribute("style", "margin-left: -8px;");
			if(gt_tasks_sync.backupTasks[tasklistId].items[taskId].status == "completed") {
				document.getElementById("oc_backupcheckbox").checked = true;
				}
			else {
				document.getElementById("oc_backupcheckbox").checked = false;
			}
			
			var niceJSON = "{\n";
			for(var i in gt_tasks_sync.backupTasks[tasklistId].items[taskId]) {
				niceJSON += "   \"" + i + "\": \"" + gt_tasks_sync.backupTasks[tasklistId].items[taskId][i] + "\",\n";
			}
			niceJSON += "}"
			document.getElementById("oc_backupjsonbox").value = niceJSON;
		}
	}

	gt_tasks_sync.backupViewerInit = function() { //called via the window's onload attribute
		gt_tasks_sync.listSnapshots();
	}
