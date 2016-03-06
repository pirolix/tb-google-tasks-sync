/*
    Google Tasks sync for Mozilla Thunderbird
*/

//hardcoded to overwrite data.json in <profile dir>/google_tasks_sync/ with dataToWrite
gt_tasks_sync.writeToFile = function(dataToWrite, successCallback)
{		
	var file = FileUtils.getFile("ProfD", ["google_tasks_sync", "data.json"]);
	file = gt_tasks_sync.FileIO.open(file.path);
	
	if(!file) {
		gt_tasks_sync.handleReturnedError("Unable to open file data.json for writing");
		return;
	}
	 
	var success = gt_tasks_sync.FileIO.write(file,dataToWrite,'w',"UTF-8");
	
	if(!success) {
		gt_tasks_sync.handleReturnedError("Error while writing to file data.json");
		return;
	}
	
	if(successCallback)
		successCallback();
}

//writes the gt_tasks_sync.queuedMoves "global var" to disk
gt_tasks_sync.saveQueuedMoves = function(successCallback) {
	var file = FileUtils.getFile("ProfD", ["google_tasks_sync", "queuedMoves.json"]);
	file = gt_tasks_sync.FileIO.open(file.path);
	
	if(!file) {
		gt_tasks_sync.handleReturnedError("Unable to open file queuedMoves.json for writing");
		return;
	}
	
	var dataToWrite = JSON.stringify(gt_tasks_sync.queuedMoves);
	var success = gt_tasks_sync.FileIO.write(file,dataToWrite,'w',"UTF-8");
	
	if(!success) {
		gt_tasks_sync.handleReturnedError("Error while writing to file queuedMoves.json");
		return;
	}
	
	if(successCallback)
		successCallback();
}

//hardcoded to read everything from data.json in <profile dir>/google_tasks_sync/
//also reads queued moves from queuedMoves.json
gt_tasks_sync.readFromFile = function(successCallback)
{
	//data.json
	var file = FileUtils.getFile("ProfD", ["google_tasks_sync", "data.json"]);
	file = gt_tasks_sync.FileIO.open(file.path);
	if(!file) {
		gt_tasks_sync.handleReturnedError("Unable to open file data.json for reading");
		return;
	}
	var localData = gt_tasks_sync.FileIO.read(file, "UTF-8");
	
	//queuedMoves.json - not passed to callback, instead loaded directly into a global var
	//TODO: make all file I/O functions work directly with global vars and not pass data as arguments
	var file = FileUtils.getFile("ProfD", ["google_tasks_sync", "queuedMoves.json"]);
	file = gt_tasks_sync.FileIO.open(file.path);
	if(!file) {
		gt_tasks_sync.handleReturnedError("Unable to open file queuedMoves.json for reading");
		return;
	}
	var parseThis = gt_tasks_sync.FileIO.read(file, "UTF-8");
	try {
		gt_tasks_sync.queuedMoves = JSON.parse(parseThis);
	} catch(e) {
		gt_tasks_sync.queuedMoves = new Object();
	}

	successCallback(localData);
}

//create backup by copying data.json
gt_tasks_sync.createBackup = function(callback)
{	
	var backupDir = FileUtils.getDir("ProfD", ["google_tasks_sync", "backup"]);

	var backupDirContents = backupDir.directoryEntries;
	var oldestFile;
	var fileCount = 0;
	while(backupDirContents.hasMoreElements()) { //TODO: some error handling here might be a good idea
		var currentFile = backupDirContents.getNext().QueryInterface(Components.interfaces.nsIFile);
		fileCount++;
		if(!oldestFile)
			oldestFile = currentFile;
		else if (oldestFile.lastModifiedTime > currentFile.lastModifiedTime)
			oldestFile = currentFile;
	}
	if(fileCount >= 10)
		oldestFile.remove(0); //if there are too many backups, axe the oldest one
	
	//copy data.json to create a new backup file
	var processedPath = FileUtils.getFile("ProfD", ["google_tasks_sync", "data.json"]).path;
	var currentDataFile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
	currentDataFile.initWithPath(processedPath);
	var newFilename = new Date().toISOString();
	newFilename = newFilename.replace(new RegExp(/:/g), "-") + ".json";
	currentDataFile.copyTo(backupDir, newFilename);
	
	callback();
}

gt_tasks_sync.ensureFilesExist = function() {
	var backupDir = FileUtils.getDir("ProfD", ["google_tasks_sync", "backup"]);
	if(!backupDir.exists()) {
		backupDir.create(1, 0775); //create a directory, will create parent dirs as needed
	}
	
	var file = FileUtils.getFile("ProfD", ["google_tasks_sync", "data.json"]);
	if(!file.exists()) {
		file.create(0, 0664); //create a file
	}
	
	var file = FileUtils.getFile("ProfD", ["google_tasks_sync", "queuedMoves.json"]);
	if(!file.exists()) {
		file.create(0, 0664);
	}
		
}

