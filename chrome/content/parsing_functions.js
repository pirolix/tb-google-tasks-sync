/*
    Google Tasks sync for Mozilla Thunderbird
	
	This file contains auxiliary functions.
*/

gt_tasks_sync.generateTaskId = function()
{
	var currentTime = new Date();
	var taskId = "oc_temp"+currentTime.valueOf();
	
	var alphanumeric = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for(var i=0; i<5; i++) {
		taskId += alphanumeric.charAt(Math.floor(Math.random() * alphanumeric.length));
	}

	return taskId;
}


/*
 * Returns a deep copy of the specified task in localTasks
 */
gt_tasks_sync.cloneLocalTask = function(tasklistId, taskId) {

	var sc = gt_tasks_sync.localTasks[tasklistId].items[taskId];
	var dc = new Object();
	
	dc.kind = "tasks#task";
	dc.id = sc.id;
	if(sc.etag != null) dc.etag = sc.etag;
	dc.title = sc.title;
	dc.updated = sc.updated;
	if(sc.selfLink != null) dc.selfLink = sc.selfLink;
	if(sc.parent != null) dc.parent = sc.parent;
	if(sc.position != null) dc.position = sc.position;
	if(sc.notes != null) dc.notes = sc.notes;
	dc.status = sc.status;
	if(sc.due != null) dc.due = sc.due;
	if(sc.completed != null) dc.completed = sc.completed;
	if(sc.deleted != null) dc.deleted = sc.deleted;
	if(sc.hidden != null) dc.hidden = sc.hidden;
	//if(sc.links != null) dc.links = sc.links; - not needed, since this field can't be modified locally (it's read-only for the API)
	
	return dc;

}

gt_tasks_sync.generateDueDateLabel = function(dateObj) {
	var format = gt_tasks_sync.prefBranch.getCharPref("due_date_format");
	
	var dayOfTheMonth = dateObj.getUTCDate();
	var month = dateObj.getUTCMonth() + 1; //+1 because in getMonth() 0 corresponds to January etc.

	if(dayOfTheMonth < 10)
		dayOfTheMonth = "0" + dayOfTheMonth; //untyped variables ftw
	if(month < 10)
		month = "0" + month;
	
	switch(format) {
		case "12/31/2013":
			return month + "/" + dayOfTheMonth + "/" + dateObj.getUTCFullYear();
			
		case "31.12":
			return dayOfTheMonth + "." + month;
			

		case "31.12.2013":
			return dayOfTheMonth + "." + month + "." + dateObj.getUTCFullYear();
			
		case "2013-12-31":
			return dateObj.getUTCFullYear() + "-" + month + "-" + dayOfTheMonth;
			
		default: // 12/31
			return month + "/" + dayOfTheMonth;
			
	}
}

gt_tasks_sync.prefListener = { //update UI when the due date format is changed, under certain circumstances
	register: function() {
		gt_tasks_sync.prefBranch.addObserver("due_date_format", this, false);
	},
	
	unregister: function() {
		gt_tasks_sync.prefBranch.removeObserver("due_date_format", this);
	},
	
	observe: function(aSubject, aTopic, aData) {
		if(document.getElementById("gt_tasks_sync_taskbox").collapsed == false && gt_tasks_sync.syncInProgress == false)
			gt_tasks_sync.rebuildTree();
	}
}
gt_tasks_sync.prefListener.register();
