/*
    Google Tasks sync for Mozilla Thunderbird
	
	This file reuses code from goo.gl lite by Matthew Flaschen
	
	License: GPLv2+
*/
   
	gt_tasks_sync.Cc = Components.classes;
	gt_tasks_sync.Ci = Components.interfaces;
	gt_tasks_sync.Cr = Components.results;

	gt_tasks_sync.consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
	gt_tasks_sync.ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

	gt_tasks_sync.KEY = "AIzaSyDfvfaFtF4pFIqSw16t83nV496K1Wo_XvY";

	gt_tasks_sync.URL_TASKLISTS_LIST = "https://www.googleapis.com/tasks/v1/users/@me/lists";
	gt_tasks_sync.URL_TASKS_LIST = "https://www.googleapis.com/tasks/v1/lists/"
	
	gt_tasks_sync.OAUTH_COMPLETION_URL = "http://localhost";
	gt_tasks_sync.OAUTH_KEY = "1099105089389.apps.googleusercontent.com";
	gt_tasks_sync.OAUTH_SECRET ="Wdlo5S0q55g4ETlW5EfGiuLG";
	gt_tasks_sync.OAUTH_CODE_GRANT_TYPE = "authorization_code";
	gt_tasks_sync.OAUTH_REFRESH_GRANT_TYPE = "refresh_token";
	gt_tasks_sync.OAUTH_PARAMS =
	{
		'xoauth_displayname': "Google Tasks Sync",
		'scope': 'https://www.googleapis.com/auth/tasks',
		'response_type': 'code'
	};

	gt_tasks_sync.OAUTH_PROVIDER_NAME = "google2";
	gt_tasks_sync.OAUTH_PROVIDER_DISPLAY_NAME = "Google";
	gt_tasks_sync.OAUTH_PROVIDER_CALLS =
	{
		signatureMethod     : "HMAC-SHA1",
		userAuthorizationURL: "https://accounts.google.com/o/oauth2/auth",
		accessTokenURL      : "https://accounts.google.com/o/oauth2/token"
	};
	gt_tasks_sync.OAUTH_VERSION = "2.0";

	gt_tasks_sync.PREF_BRANCH_NAME = 'extensions.gt_tasks_sync.';
	//gt_tasks_sync.prefService = Cc["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
	//gt_tasks_sync.prefBranch = prefService.getBranch(PREF_BRANCH_NAME); // already defined in main file

	// var service = null;
	// var handler = null;

	/**
	 * @param serviceObj gt_tasks_sync.OAuthConsumer service
	 * @param successCallback function to call on success.  Takes a single string, the token
	 * @param errorCallback function to call on success.  Takes a single string, the error message
	 */
	gt_tasks_sync.handleUserAuthorization = function(serviceObj, successCallback, errorCallback)
	{
		// service = serviceObj;
		gt_tasks_sync.getTokensFromCode(serviceObj.token, successCallback, errorCallback);
	};

	// Hack to exchange code for token.  Should be in gt_tasks_sync.OAuthConsumer
	/**
	 * @param code the access code
	 * @param successCallback function to call on success.  Takes a single string, the token
	 * @param errorCallback function to call on success.  Takes a single string, the error message
	 */
	gt_tasks_sync.getTokensFromCode = function(code, successCallback, errorCallback)
	{
		gt_tasks_sync.sendTokenRequest({
			code: code,
			redirect_uri: gt_tasks_sync.OAUTH_COMPLETION_URL,
			scope: gt_tasks_sync.OAUTH_PARAMS.scope,
			grant_type: gt_tasks_sync.OAUTH_CODE_GRANT_TYPE
		}, successCallback, errorCallback);
	}

	/**
	 * @param parameters parameter object to encode and send
	 * @param successCallback function to call on success.  Takes a single string, the token
	 * @param errorCallback function taking a single string, an error message, to call on error
	 */
	gt_tasks_sync.sendTokenRequest = function(parameters, successCallback, errorCallback)
	{
		parameters.client_id = gt_tasks_sync.OAUTH_KEY;
		parameters.client_secret = gt_tasks_sync.OAUTH_SECRET;
		var req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
		req.addEventListener("load", function()
		{
			var response = JSON.parse(req.responseText);
                        if(response.error)
                        {
                                errorCallback(response.error.message);
                        }
			else
			{
				gt_tasks_sync.storeAuthenticationDetails(response);
				successCallback(response.access_token);
			}
		}, false);

		req.addEventListener("error", function()
		{
			errorCallback("Authentication network request failed");
		}, false);

		req.open("POST", gt_tasks_sync.OAUTH_PROVIDER_CALLS.accessTokenURL);
		req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		var body = gt_tasks_sync.OAuth.formEncode(parameters);
		req.send(body);
	};

	gt_tasks_sync.storeAuthenticationDetails = function(response)
	{
		gt_tasks_sync.prefBranch.setCharPref("access_token", response.access_token);
		// Only get refresh token the first time, so we should be sure not to erase it
		if(response.refresh_token)
		{
			gt_tasks_sync.prefBranch.setCharPref("refresh_token", response.refresh_token);
		}
		gt_tasks_sync.prefBranch.setCharPref("token_type", response.token_type);
		var time = (new Date()).getTime();
		var expirationTime = time + (response.expires_in * 1000);
		gt_tasks_sync.prefBranch.setCharPref("expiration", expirationTime);
	};

	// Only Google's gt_tasks_sync.OAuth 1 is currently built in.
	gt_tasks_sync.registerGoogleAuth2 = function()
	{
		var myProviderCall = function(key, secret, completionURI)
		{
			var myProvider = gt_tasks_sync.OAuthConsumer.makeProvider(gt_tasks_sync.OAUTH_PROVIDER_NAME, gt_tasks_sync.OAUTH_PROVIDER_DISPLAY_NAME, key, secret, completionURI, gt_tasks_sync.OAUTH_PROVIDER_CALLS);
			myProvider.tokenRx = /code=([^&]*)/gi,
			myProvider.version = gt_tasks_sync.OAUTH_VERSION;
			myProvider.requestMethod = "POST";
			return myProvider;
		};
		gt_tasks_sync.OAuthConsumer._providers[gt_tasks_sync.OAUTH_PROVIDER_NAME] = myProviderCall;
	};

	/**
	 * Attempts to ensure the user is authorized, then calls the success callback or error callback as appropriate.
	 *
	 * @param successCallback function to call on successful authorization.  Takes a single string, the token
	 * @param errorCallback function taking a single string, an error message, to call on error
	 */
	gt_tasks_sync.authorize = function(successCallback, errorCallback)
	{
		var time = (new Date()).getTime();
		var expiration = + gt_tasks_sync.prefBranch.getCharPref("expiration");
		var accessToken = gt_tasks_sync.prefBranch.getCharPref("access_token");
		if (accessToken && time < expiration)
		{
			successCallback(accessToken);
			return;
		}

		var refreshToken = gt_tasks_sync.prefBranch.getCharPref("refresh_token");
		if(refreshToken)
		{
			gt_tasks_sync.sendTokenRequest(
			{
				refresh_token: refreshToken,
				grant_type: gt_tasks_sync.OAUTH_REFRESH_GRANT_TYPE
			}, successCallback, errorCallback);
			return;
		}

		// We should only get here the first time, or if they clear the preferences.  Otherwise, we'll at least have a refresh token.
		gt_tasks_sync.OAuthConsumer.resetAccess(gt_tasks_sync.OAUTH_PROVIDER_NAME, gt_tasks_sync.OAUTH_KEY, gt_tasks_sync.OAUTH_SECRET); //added by TL, without it clearing preferences in Thunderbird seemed to break the addon
		gt_tasks_sync.registerGoogleAuth2();
		gt_tasks_sync.OAuthConsumer.authorize(gt_tasks_sync.OAUTH_PROVIDER_NAME, gt_tasks_sync.OAUTH_KEY, gt_tasks_sync.OAUTH_SECRET, gt_tasks_sync.OAUTH_COMPLETION_URL, function(service)
		{
			gt_tasks_sync.handleUserAuthorization(service, successCallback, errorCallback);
		}, gt_tasks_sync.OAUTH_PARAMS);
	}

	/**
	 * Sends a request, authenticated
	 *
	 * @param message message to send, fitting the gt_tasks_sync.OAuth library's envelope
	 * @param callback function to call with response to request, success or failure, taking the XMLHttpRequest object
	 * @param authenticationErrorCallback function to call, taking a single error message, on authentication failure before the message is sent.
	 */
	gt_tasks_sync.sendRequest = function(message, callback, authenticationErrorCallback)
	{
		gt_tasks_sync.authorize(function(token)
		{
			// XXX Since we're doing part of the gt_tasks_sync.OAuth flow, we mock a service with just the token and version
			var service =
			{
				name: gt_tasks_sync.OAUTH_PROVIDER_NAME,
				token: token,
				version: gt_tasks_sync.OAUTH_VERSION
			};
			gt_tasks_sync.OAuthConsumer.call(service, message, callback);
		}, authenticationErrorCallback);
	}
	
	//finishes full sync by pushing changes to Google
	gt_tasks_sync.sendQueuedMoves = function(lastResult)
	{	
		//alert("sending a queued move; queued moves are:\n"+JSON.stringify(gt_tasks_sync.queuedMoves));
	
		if(lastResult) {
			//alert("Received:\n"+lastResult);
			var returnedTask = JSON.parse(lastResult);
		
			gt_tasks_sync.localTasks[gt_tasks_sync.tasklistIdForQM].items[returnedTask.id] = returnedTask;
			gt_tasks_sync.writeToFile(JSON.stringify(gt_tasks_sync.localTasks), false); //asynchronous is fine, the file is only read once at startup, and there's no way we'll be back with another task by the time the write completes
			
			delete gt_tasks_sync.queuedMoves[gt_tasks_sync.tasklistIdForQM][returnedTask.id];
			if(Object.keys(gt_tasks_sync.queuedMoves[gt_tasks_sync.tasklistIdForQM]).length == 0) {
				delete gt_tasks_sync.queuedMoves[gt_tasks_sync.tasklistIdForQM];
			}
			gt_tasks_sync.saveQueuedMoves(); //again, asynchronous is fine
		}
		
		if(Object.keys(gt_tasks_sync.queuedMoves).length == 0) {
			//we're done, continue the sync
			//alert("done sending moves");
			gt_tasks_sync.retrieveTasklists();
		} else {
		
			//grab a single task
			for (var i in gt_tasks_sync.queuedMoves) {
				gt_tasks_sync.lastTaskSent.tasklistId = i;
				for (var j in gt_tasks_sync.queuedMoves[i]) {
					gt_tasks_sync.lastTaskSent.taskId = j;
					break;
				}
				break;
			}
			gt_tasks_sync.tasklistIdForQM = i;
		
			var np = gt_tasks_sync.queuedMoves[i][j].newParent;
			var ns = gt_tasks_sync.queuedMoves[i][j].newSibling;
			var objBuf = new Object;
			objBuf.parent = np;
			objBuf.previous = ns;
			var requestBody = JSON.stringify({"parent":np, "previous":ns}); //not needed, but oauthconsumer.js won't work properly without it
			var actionBuf = "https://www.googleapis.com/tasks/v1/lists/"+i+"/tasks/"+j+"/move?";
			if(np) actionBuf += "parent=" + np;
			if(np && ns) actionBuf += "&";
			if(ns) actionBuf += "previous=" + ns;
			var message =
			{
				action: actionBuf,
				method: "POST",
				contentType: "application/json",
				parameters: requestBody
			};
			
			//alert(message.method + "\n" + "\n" + message.action + "\n" + message.parameters);
		
			gt_tasks_sync.sendRequest(message, function(req) { //success callback
			
				if(!req.responseText) { //looks like we were unable to connect
					gt_tasks_sync.handleError("No response from server");
					return; //don't continue syncing if an error was encountered
				}
				var response = JSON.parse(req.responseText);
				if(response.error)
				{
					gt_tasks_sync.handleError(response.error.message);
					return;
				}

				gt_tasks_sync.sendQueuedMoves(req.responseText);
				
			}, function(authenticationErrorText) { //authentication error callback
				var errorTextWithPrefix = "Authentication error: " + authenticationErrorText;
				gt_tasks_sync.handleError(errorTextWithPrefix);
			});
		
		}
	}
	
	gt_tasks_sync.retrieveTasklists = function (successCallback) {
		//alert("Retrieving task lists");
	
		var message = {
			action: gt_tasks_sync.URL_TASKLISTS_LIST,
			method: "GET",
			//contentType: "application/json", //left undefined, it will default to application/x-www-form-urlencoded, which is fine for a GET request
			parameters: {"max-results":"50"} //dummy, invalid parameter (oAuth apparently won't work with no params); correct version would be maxResults
		};
		
		gt_tasks_sync.sendRequest(message, function(req)
		{
			if(!req.responseText) { //looks like we were unable to connect
				gt_tasks_sync.handleError("No response from server");
				return; //don't continue syncing if an error was encountered
			}
			var response = JSON.parse(req.responseText);
			if(response.error)
			{
				gt_tasks_sync.handleError(response.error.message);
				return;
			}
			
			//success!
			var retrievedTasklists = JSON.parse(req.responseText);
			for(var i in retrievedTasklists.items) {
				var idBuf = retrievedTasklists.items[i].id;
				gt_tasks_sync.remoteTasks[idBuf] = new Object(); //won't overwrite anything because remoteTasks was empty when full sync started
				gt_tasks_sync.remoteTasks[idBuf].header = retrievedTasklists.items[i];
				gt_tasks_sync.remoteTasks[idBuf].items = new Object();
				gt_tasks_sync.remainingTasklists.push(idBuf); //indicates that this tasklist's tasks need to be retrieved
			}
			gt_tasks_sync.retrieveTasks(false); //continue downloading data
			
		}, function(authenticationErrorText) { //authentication error callback
			var errorTextWithPrefix = "Authentication error: " + authenticationErrorText;
			gt_tasks_sync.handleError(errorTextWithPrefix);
		});
	}
	
	gt_tasks_sync.retrieveTasks = function(lastResult) {
		//alert("Retrieving tasks, lists remaining: " + gt_tasks_sync.remainingTasklists);
		
		if(lastResult) { //store the data we retrieved in the previous iteration, also remove the tasklist that was just processed
			var lastResultItems = JSON.parse(lastResult).items;
			for(var i in lastResultItems) {
				var idBuf = lastResultItems[i].id;
				gt_tasks_sync.remoteTasks[gt_tasks_sync.remainingTasklists[0]].items[idBuf] = lastResultItems[i];
			}
			
			var nextPageToken = JSON.parse(lastResult).nextPageToken //there's another page of tasks from this tasklist
			
			if(!nextPageToken) gt_tasks_sync.remainingTasklists.splice(0,1); //we're done with this tasklist
		}
	
		if(gt_tasks_sync.remainingTasklists.length == 0) {
			//we have all the remote data!
			gt_tasks_sync.fullSync();
		} else {
		
			var timestamp = gt_tasks_sync.prefBranch.getCharPref("last_sync_time_minus_leeway");
			if(timestamp) {
				var message =
				{
					action: gt_tasks_sync.URL_TASKS_LIST+gt_tasks_sync.remainingTasklists[0]+"/tasks",
					method: "GET",
					//contentType: "application/json", //can be left undefined for a GET request, will default to something that works :)
					parameters: {"showDeleted":true, "showHidden":true, "updatedMin":timestamp}
				};
			} else {
				var message =
				{
					action: gt_tasks_sync.URL_TASKS_LIST+gt_tasks_sync.remainingTasklists[0]+"/tasks",
					method: "GET",
					//contentType: "application/json",
					parameters: {"showDeleted":true, "showHidden":true}
				};
			}
			
			if(nextPageToken) message.parameters.pageToken = nextPageToken;
			
			gt_tasks_sync.sendRequest(message, function(req) //success or non-authentication error callback
			{
				if(!req.responseText) { //looks like we were unable to connect
					gt_tasks_sync.handleError("No response from server");
					return; //don't continue syncing if an error was encountered
				}
				var response = JSON.parse(req.responseText);
				if(response.error)
				{
					gt_tasks_sync.handleError(response.error.message);
					return;
				}

				gt_tasks_sync.retrieveTasks(req.responseText);
				
			}, function(authenticationErrorText) { //authentication error callback
				var errorTextWithPrefix = "Authentication error: " + authenticationErrorText;
				gt_tasks_sync.handleError(errorTextWithPrefix);
			});
		}
	}
	
	//finishes full sync by pushing changes to Google
	gt_tasks_sync.sendTasks = function(lastResult)
	{
		if(lastResult) {
			//alert("Received:\n"+lastResult);
		
			delete gt_tasks_sync.localTasks[gt_tasks_sync.lastTaskSent.tasklistId].items[gt_tasks_sync.lastTaskSent.taskId]; //takes care of temporary local tasks
			var returnedTask = JSON.parse(lastResult);
			gt_tasks_sync.localTasks[gt_tasks_sync.lastTaskSent.tasklistId].items[returnedTask.id] = returnedTask;
			
			gt_tasks_sync.writeToFile(JSON.stringify(gt_tasks_sync.localTasks), false); //asynchronous is fine, the file is only read once at startup, and there's no way we'll be back with another task by the time the write completes
			
			delete gt_tasks_sync.tasksToSend[gt_tasks_sync.lastTaskSent.tasklistId].items[gt_tasks_sync.lastTaskSent.taskId];
			
			if(Object.keys(gt_tasks_sync.tasksToSend[gt_tasks_sync.lastTaskSent.tasklistId].items).length == 0) {
				delete gt_tasks_sync.tasksToSend[gt_tasks_sync.lastTaskSent.tasklistId];
			}
		}
		
		//alert("Sending tasks, tasks remaining: " + Object.keys(gt_tasks_sync.tasksToSend));
		
		if(Object.keys(gt_tasks_sync.tasksToSend).length == 0) {

			//alert("Done sending tasks.");
			//we're done, unlock the full sync button and update last sync time prefs if we just finished a full sync
			if(gt_tasks_sync.shouldUpdateTimePrefs) {
				var currentTime = new Date();
				var fiveMinutesAgo = new Date(Date.now()-300000);			
				gt_tasks_sync.prefBranch.setCharPref("last_sync_time", currentTime.toISOString());
				gt_tasks_sync.prefBranch.setCharPref("last_sync_time_minus_leeway", fiveMinutesAgo.toISOString());
				gt_tasks_sync.shouldUpdateTimePrefs = false;
			}
			gt_tasks_sync.unlockSyncButton();
			
			if(Object.keys(gt_tasks_sync.bufferedTasks).length != 0)
				gt_tasks_sync.sendBufferedTasks(); //in case we just finished a full sync, and local changes were made in the meantime, we need to send them to Google

		} else {
		
			//grab a single task
			for (var i in gt_tasks_sync.tasksToSend) {
				gt_tasks_sync.lastTaskSent.tasklistId = i;
				for (var j in gt_tasks_sync.tasksToSend[i].items) {
					gt_tasks_sync.lastTaskSent.taskId = j;
					break;
				}
				break;
			}
			
			//create a copy to be trimmed down before sending
			//note: I have no idea if this will work if one of the object's properties is itself an object, but the only task field that could be an object (links) seems to never be used
			//alert(JSON.stringify(gt_tasks_sync.tasksToSend[i].items[j]));
			var objectToSend = new Object();
			for(var k in gt_tasks_sync.tasksToSend[i].items[j]) {
				objectToSend[k] = gt_tasks_sync.tasksToSend[i].items[j][k];
			}
			//alert(JSON.stringify(objectToSend));
			//alert("wait, what?");
		
			if(objectToSend.id.substr(0,7) == "oc_temp") { //create new task
				//delete fields which are undesired or outright disallowed when creating a new task
				delete objectToSend.id;
				delete objectToSend.etag;
				delete objectToSend.selfLink;
				delete objectToSend.deleted;
				delete objectToSend.hidden;
				var requestBody = JSON.stringify(objectToSend);
				var message =
				{
					action: "https://www.googleapis.com/tasks/v1/lists/"+i+"/tasks",
					method: "POST",
					contentType: "application/json",
					parameters: requestBody
				};
			} else { //update task
				if(!objectToSend.notes) //if this property is missing, Google will assume we don't want to change it, preventing the user from clearing existing notes
					objectToSend.notes = ""; //this will cause Google to completely delete the notes property, which is exactly what we want
			
				var requestBody = JSON.stringify(objectToSend);
				var message =
				{
					action: "https://www.googleapis.com/tasks/v1/lists/"+i+"/tasks/"+objectToSend.id,
					method: "PUT",
					contentType: "application/json",
					parameters: requestBody
				};
			}
			
			//alert(message.method + "\n" + message.parameters);
		
			gt_tasks_sync.sendRequest(message, function(req) { //success callback
			
				if(!req.responseText) { //looks like we were unable to connect
					gt_tasks_sync.handleError("No response from server");
					return; //don't continue syncing if an error was encountered
				}
				var response = JSON.parse(req.responseText);
				if(response.error)
				{
					gt_tasks_sync.handleError(response.error.message);
					return;
				}

				gt_tasks_sync.sendTasks(req.responseText);
				
			}, function(authenticationErrorText) { //authentication error callback
				var errorTextWithPrefix = "Authentication error: " + authenticationErrorText;
				gt_tasks_sync.handleError(errorTextWithPrefix);
			});
		
		}
	}
	
	gt_tasks_sync.sendSingleTask = function(tasklistId, taskToSend) {
		if(taskToSend.id.substr(0,7) == "oc_temp") { //create new task
			
			var tempId = taskToSend.id; //will be needed later to replce the temporary, local task with the one returned by Google
		
			//make a deep copy of taskToSend to remove excess properties from without risk of corrupting the original in case the sync fails
			var objectToSend = new Object();
			for(var k in taskToSend) {
				objectToSend[k] = taskToSend[k];
			}
		
			delete objectToSend.id;
			delete objectToSend.etag;
			delete objectToSend.selfLink;
			delete objectToSend.deleted;
			delete objectToSend.hidden;

			var requestBody = JSON.stringify(objectToSend);
			var message =
			{
				action: "https://www.googleapis.com/tasks/v1/lists/"+tasklistId+"/tasks",
				method: "POST",
				contentType: "application/json",
				parameters: requestBody
			};

		} else { //update task
			if(!taskToSend.notes)
				taskToSend.notes = "";
		
			var requestBody = JSON.stringify(taskToSend);
			var message =
			{
				action: "https://www.googleapis.com/tasks/v1/lists/"+tasklistId+"/tasks/"+taskToSend.id,
				method: "PUT",
				contentType: "application/json",
				parameters: requestBody
			};
		}

		gt_tasks_sync.sendRequest(message, function(req) { //success callback
		
			if(!req.responseText) { //looks like we were unable to connect
				gt_tasks_sync.handleError("No response from server");
				return; //don't continue syncing if an error was encountered
			}
			var response = JSON.parse(req.responseText); //if there is no error, this is the returned task
			if(response.error)
			{
				gt_tasks_sync.handleError(response.error.message);
				return;
			}

			if(tempId)
				delete gt_tasks_sync.localTasks[tasklistId].items[tempId];
			
			gt_tasks_sync.localTasks[tasklistId].items[response.id] = response;
			
			gt_tasks_sync.writeToFile(JSON.stringify(gt_tasks_sync.localTasks), function() { //we're done, update UI and unlock sync button
				gt_tasks_sync.rebuildTree();
				gt_tasks_sync.unlockSyncButton();
			});
			
		}, function(authenticationErrorText) { //authentication error callback
			var errorTextWithPrefix = "Authentication error: " + authenticationErrorText;
			gt_tasks_sync.handleError(errorTextWithPrefix);
		});
	}
	
/* //example of a message: get tasks in list "MDIxMTI5ODY3NjY4ODYzMzY5NjY6MDow"
var message =
{
	action: gt_tasks_sync.URL_TASKS_LIST+"MDIxMTI5ODY3NjY4ODYzMzY5NjY6MDow"+"/tasks",
	method: "GET",
	//contentType: "application/json",
	parameters: {"max-results":"50"}
}; */