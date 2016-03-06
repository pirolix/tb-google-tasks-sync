/*
    Google Tasks sync for Mozilla Thunderbird
*/

	gt_tasks_sync.toggleReorderingHelp = function() {
		if(document.getElementById("gt_tasks_sync_reorderinghelp").collapsed)
			document.getElementById("gt_tasks_sync_reorderinghelp").collapsed = false;
		else
			document.getElementById("gt_tasks_sync_reorderinghelp").collapsed = true;
	}

	gt_tasks_sync.rebuildReorderingTree = function() {
		var currentTasklistId = document.getElementById("gt_tasks_sync_tasklistmenu").value;
		//var reorderingTreeItems = new Array();
		var sortHere = new Array();
		
		for(var j in gt_tasks_sync.localTasks[currentTasklistId].items)
		{
			if(!gt_tasks_sync.localTasks[currentTasklistId].items[j].deleted && !gt_tasks_sync.localTasks[currentTasklistId].items[j].hidden)
			{
				var box1 = document.createElement("box");
				box1.setAttribute("class", "gt_tasks_sync_c_taskwrapper");
				box1.setAttribute("align", "start");
				box1.id = j; //task id
				

				//indent - by level: 0px, 20px, 30px, 40px, 45px, 50px, 55px, ... (+5 for each additional level)
				switch(gt_tasks_sync.numberOfAncestors(currentTasklistId, j)) {
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
						var newPadding = 40 + 5 * (gt_tasks_sync.numberOfAncestors(currentTasklistId, j) - 3);
						box1.style.paddingLeft = newPadding + "px";
						break;
				}
				
				//status checkbox
				var checkbox = document.createElement("checkbox");
				checkbox.setAttribute("class", "gt_tasks_sync_c_taskcheckbox");
				checkbox.disabled = true; //this interface is for reordering only
				if(gt_tasks_sync.localTasks[currentTasklistId].items[j].status == "completed") {
					checkbox.setAttribute("checked", "true");
					//box1.setAttribute("style", "opacity: 0.7;"); //TODO: rewrite this to change the class
					box1.setAttribute("class", "gt_tasks_sync_c_taskwrapper_faded");
				}
				else {
					checkbox.setAttribute("checked", "false");
				}
				box1.appendChild(checkbox);
				
				//vbox wrapping box2 and the notes label (if present)
				var vbox = document.createElement("vbox");
				vbox.flex = "1";
				vbox.setAttribute("class", "gt_tasks_sync_c_taskauxbox");
				vbox.setAttribute("onclick", "gt_tasks_sync.toggleSelection(event);");
				
				//box wrapping the title and due date labels
				var box2 = document.createElement("box");
				box2.setAttribute("class", "gt_tasks_sync_c_taskmainbox");
				box2.flex = "1";
				
				//title label
				var label = document.createElement("label");
				label.setAttribute("class", "gt_tasks_sync_c_tasktitle");
				label.flex = "1";
				label.setAttribute("crop", "end");
				label.setAttribute("value", gt_tasks_sync.localTasks[currentTasklistId].items[j].title);
				box2.appendChild(label);
				
				//due date label
				label = document.createElement("label");
				label.setAttribute("class", "gt_tasks_sync_c_taskdue");
				if(gt_tasks_sync.localTasks[currentTasklistId].items[j].due) {
					var labelDateBuf = new Date(gt_tasks_sync.localTasks[currentTasklistId].items[j].due);
					label.setAttribute("value", gt_tasks_sync.generateDueDateLabel(labelDateBuf));
				}
				box2.appendChild(label);
				
				vbox.appendChild(box2);
				//notes label
				if(gt_tasks_sync.localTasks[currentTasklistId].items[j].notes) {
					label = document.createElement("label");
					label.setAttribute("class", "gt_tasks_sync_c_tasknotes");
					label.setAttribute("crop", "end");
					label.setAttribute("value", gt_tasks_sync.localTasks[currentTasklistId].items[j].notes);
					vbox.appendChild(label);
				}					
				
				box1.appendChild(vbox);				
				//reorderingTreeItems[j] = box1;
				sortHere.push(box1);
			}
		}
		
		var vbox = document.getElementById("gt_tasks_sync_reorderingcontainer");
		
		//get rid of all current elements
		while(vbox.hasChildNodes())
		{
			vbox.removeChild(vbox.lastChild);
		}
		
		//sortHere is already filled, so let's "sort" - simply re-using the order in which the tasks are listed in the main interface
		sortHere.sort(function (a,b) {
			//a.id and b.id are task ids
			return gt_tasks_sync.tasksInMainInterface.indexOf(a.id) - gt_tasks_sync.tasksInMainInterface.indexOf(b.id);
		});
		
		
		while(sortHere.length > 0)
			vbox.appendChild(sortHere.shift());
		
		return true;
	}
	
	gt_tasks_sync.toggleSelection = function(event) { //select task so it can be moved, or deselect it if it's already selected
		
		//find out which task was clicked
		var box = event.target.parentNode;
		if(box.getAttribute("class").substring(0,27) != "gt_tasks_sync_c_taskwrapper") //there are 4 classes total, but they all start with this
		{
			box = box.parentNode
			if(box.getAttribute("class").substring(0,27) != "gt_tasks_sync_c_taskwrapper")
			{
				box = box.parentNode
				if(box.getAttribute("class").substring(0,27) != "gt_tasks_sync_c_taskwrapper")
				{
					gt_tasks_sync.handleError("Unable to determine which task was clicked");
					return; //if we still haven't found the right box, something is wrong and we shouldn't continue
				}
			}
		}
		
		switch(box.getAttribute("class")) {
			case "gt_tasks_sync_c_taskwrapper":
				gt_tasks_sync.deselectAll();
				box.setAttribute("class", "gt_tasks_sync_c_taskwrapper_selected");
				break;
			case "gt_tasks_sync_c_taskwrapper_faded":
				gt_tasks_sync.deselectAll();
				box.setAttribute("class", "gt_tasks_sync_c_taskwrapper_faded_selected");
				break;
			case "gt_tasks_sync_c_taskwrapper_selected":
				box.setAttribute("class", "gt_tasks_sync_c_taskwrapper");
				break;
			case "gt_tasks_sync_c_taskwrapper_faded_selected":
				box.setAttribute("class", "gt_tasks_sync_c_taskwrapper_faded");
				break;
			default:
				gt_tasks_sync.handleError("Error when selecting/deselecting a task");
		}
	}
	
	gt_tasks_sync.deselectAll = function() {
		var nodes = document.getElementById("gt_tasks_sync_reorderingcontainer").childNodes;
		for(var i in nodes) {
			if(nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_selected")
				nodes.item(i).setAttribute("class", "gt_tasks_sync_c_taskwrapper");
			else if(nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_faded_selected")
				nodes.item(i).setAttribute("class", "gt_tasks_sync_c_taskwrapper_faded");
		}
	}
	
	gt_tasks_sync.moveTaskUp = function() {
		var vbox = document.getElementById("gt_tasks_sync_reorderingcontainer");
		var nodes = vbox.childNodes;
		for(var i in nodes) {
			if(nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_selected" || nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_faded_selected")
				var selectedNode = nodes.item(i);
		}
		if(!selectedNode || !selectedNode.previousSibling)
			return;
		
		if(!selectedNode.style.paddingLeft) {
			var originalTaskPadding = 0;
		} else {
			var strBuf = selectedNode.style.paddingLeft.toString();
			var originalTaskPadding = parseInt(strBuf.substring(0,strBuf.length-2));
		}
		
		//remove the node (along with its parent tasks, if needed) that is to be moved below the selected node
		var nodesToSwapWith = new Array(); //will hold nodeToSwapWith and child tasks
		var nodeToSwapWith = selectedNode.previousSibling;
		
		if(!selectedNode || !selectedNode.previousSibling)
			return;
		
		if(!nodeToSwapWith.style.paddingLeft) {
			var nextNodePadding = 0;
		} else {		
			var strBuf = nodeToSwapWith.style.paddingLeft.toString();
			var nextNodePadding = parseInt(strBuf.substring(0,strBuf.length-2));
		}
		if(nextNodePadding > originalTaskPadding) {
			while(nodeToSwapWith.previousSibling) {
				if(!nodeToSwapWith.previousSibling.style.paddingLeft) {
					var nextNodePadding = 0;
				} else {		
					var strBuf = nodeToSwapWith.previousSibling.style.paddingLeft.toString();
					var nextNodePadding = parseInt(strBuf.substring(0,strBuf.length-2));
				}

				nodesToSwapWith.push(vbox.removeChild(nodeToSwapWith.previousSibling));
				
				if(nextNodePadding <= originalTaskPadding)
					break;
			}
		}
		nodesToSwapWith.splice(0, 0, vbox.removeChild(nodeToSwapWith));
		//alert("node above and parents removed");
		
		//remove the trailing nodes (nodes below the selected node's last child task)
		//first find the last child task
		var childTaskNode = selectedNode;
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
			if(nextNodePadding <= originalTaskPadding) { //found something that's not a child task
				var lastChildTaskNode = childTaskNode;
				var canMove = true; //TODO: this is unnecessary
				break;
			}
			childTaskNode = nextNode;
		}
		//now remove the trailing nodes
		if(lastChildTaskNode) { //if this is false, all nodes below the selected one are child tasks
			var trailingNodes = new Array();
			while(lastChildTaskNode.nextSibling) {
				trailingNodes.push(vbox.removeChild(lastChildTaskNode.nextSibling));
			}
		}
		
		//no need to remove the selected node itself
		//put the nodes back in the new order
		while(nodesToSwapWith.length > 0)
			vbox.appendChild(nodesToSwapWith.pop());
		
		if(trailingNodes) {
			trailingNodes.reverse();
			while(trailingNodes.length > 0)
				vbox.appendChild(trailingNodes.pop());
		}
		
		gt_tasks_sync.queueMoveForTask();

		gt_tasks_sync.fixIndent(); //if it moves the task again, it will overwrite the queued move, which is fine
	}
	
	gt_tasks_sync.moveTaskDown = function() {
		var vbox = document.getElementById("gt_tasks_sync_reorderingcontainer");
		var nodes = vbox.childNodes;
		for(var i in nodes) {
			if(nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_selected" || nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_faded_selected")
				var selectedNode = nodes.item(i);
		}
		if(!selectedNode || !selectedNode.nextSibling)
			return;
		
		if(!selectedNode.style.paddingLeft) {
			var originalTaskPadding = 0;
		} else {
			var strBuf = selectedNode.style.paddingLeft.toString();
			var originalTaskPadding = parseInt(strBuf.substring(0,strBuf.length-2));
		}
		
		var canMove = false; //if all nodes below the selected one are child tasks, we can't move
		var nextNode = selectedNode.nextSibling;
		while(nextNode) {
			if(!nextNode.style.paddingLeft) {
				var nextNodePadding = 0;
			} else {				
				var strBuf = nextNode.style.paddingLeft.toString();
				var nextNodePadding = parseInt(strBuf.substring(0,strBuf.length-2));
			}
			if(nextNodePadding <= originalTaskPadding) { //found something that's not a child task
				canMove = true;
				break;
			}
			nextNode = nextNode.nextSibling;
		}
		
		if(!canMove)
			return;
		
		//remove the nodes representing the child tasks
		var childTaskNodes = new Array();
		while(selectedNode.nextSibling) {
			if(!selectedNode.nextSibling.style.paddingLeft) {
				var nextNodePadding = 0;
			} else {				
				var strBuf = selectedNode.nextSibling.style.paddingLeft.toString();
				var nextNodePadding = parseInt(strBuf.substring(0,strBuf.length-2));
			}
			//alert(originalTaskPadding + "\n" + nextNodePadding);
			if(nextNodePadding <= originalTaskPadding) //there are no more child tasks
				break;

			childTaskNodes.push(vbox.removeChild(selectedNode.nextSibling));
		}
		
		//remove the node (along with its child tasks) to be moved above the selected node
		var nodesToSwapWith = new Array(); //will hold nodeToSwapWith and child tasks
		var nodeToSwapWith = selectedNode.nextSibling;
		
		if(!nodeToSwapWith.style.paddingLeft) {
			originalTaskPadding = 0;
		} else {
			var strBuf = nodeToSwapWith.style.paddingLeft.toString();
			originalTaskPadding = parseInt(strBuf.substring(0,strBuf.length-2));
		}
		
		while(nodeToSwapWith.nextSibling) {
			if(!nodeToSwapWith.nextSibling.style.paddingLeft) {
				var nextNodePadding = 0;
			} else {				
				var strBuf = nodeToSwapWith.nextSibling.style.paddingLeft.toString();
				var nextNodePadding = parseInt(strBuf.substring(0,strBuf.length-2));
			}

			if(nextNodePadding <= originalTaskPadding)
				break;

			nodesToSwapWith.push(vbox.removeChild(nodeToSwapWith.nextSibling));
		}
		nodesToSwapWith.reverse();
		nodesToSwapWith.push(vbox.removeChild(nodeToSwapWith));
		
		//remove the trailing nodes (nodes below the ones being moved)
		var trailingNodes = new Array();
		while(selectedNode.nextSibling) {
			trailingNodes.push(vbox.removeChild(selectedNode.nextSibling));
		}
		
		//remove the selected node itself
		vbox.removeChild(selectedNode);
		
		//put the nodes back in the new order
		while(nodesToSwapWith.length > 0)
			vbox.appendChild(nodesToSwapWith.pop());
		vbox.appendChild(selectedNode);
		trailingNodes.reverse();
		childTaskNodes.reverse();
		while(childTaskNodes.length > 0)
			vbox.appendChild(childTaskNodes.pop());
		while(trailingNodes.length > 0)
			vbox.appendChild(trailingNodes.pop());
		
		gt_tasks_sync.queueMoveForTask();

		gt_tasks_sync.fixIndent();
	}
	
	gt_tasks_sync.moveTaskLeft = function() {
		var vbox = document.getElementById("gt_tasks_sync_reorderingcontainer");
		var nodes = vbox.childNodes;
		for(var i in nodes) {
			if(nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_selected" || nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_faded_selected")
				var selectedNode = nodes.item(i);
		}
		if(!selectedNode || !selectedNode.style.paddingLeft || selectedNode.style.paddingLeft == "0px")
			return;
		
		
		var strBuf = selectedNode.style.paddingLeft.toString();
		var originalTaskPadding = parseInt(strBuf.substring(0,strBuf.length-2));
		
		gt_tasks_sync.moveNodeLeft(selectedNode);
		
		
		//now let's move the nodes representing child tasks
		var nextNode = selectedNode.nextSibling;
		while(nextNode) {
			if(!nextNode.style.paddingLeft) {
				var nextNodePadding = 0;
			} else {				
				var strBuf = nextNode.style.paddingLeft.toString();
				var nextNodePadding = parseInt(strBuf.substring(0,strBuf.length-2));
			}
			//alert(originalTaskPadding + "\n" + nextNodePadding);
			if(nextNodePadding <= originalTaskPadding) //there are no more child tasks
				break;
			var moveThis = nextNode;
			nextNode = moveThis.nextSibling;
			gt_tasks_sync.moveNodeLeft(moveThis);
		}
		
		gt_tasks_sync.queueMoveForTask();
	}
	
	gt_tasks_sync.moveNodeLeft = function(node) {
		//no need to check any conditions because this will only ever be called when the move is valid
		var strBuf = node.style.paddingLeft.toString();
		var currentPadding = parseInt(strBuf.substring(0,strBuf.length-2));
		
		switch(currentPadding) {
			case 20:
				node.style.paddingLeft = "0px";
				break;
			case 30:
				node.style.paddingLeft = "20px";
				break;
			case 40:
				node.style.paddingLeft = "30px";
				break;
			default:
				var newPadding = currentPadding - 5;
				node.style.paddingLeft = newPadding + "px";
				break;
		}
	}
	
	gt_tasks_sync.moveTaskRight = function() {
		var vbox = document.getElementById("gt_tasks_sync_reorderingcontainer");
		var nodes = vbox.childNodes;
		for(var i in nodes) {
			if(nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_selected" || nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_faded_selected")
				var selectedNode = nodes.item(i);
		}
		if(!selectedNode || !selectedNode.previousSibling)
			return;

		if(!selectedNode.style.paddingLeft) {
			var originalTaskPadding = 0;
		} else {
			var strBuf = selectedNode.style.paddingLeft.toString();
			var originalTaskPadding = parseInt(strBuf.substring(0,strBuf.length-2));
		}
		
		var prevSibling = selectedNode.previousSibling;
		if(!prevSibling.style.paddingLeft) {
			var prevSiblingPadding = 0;
		} else {
			var strBuf = prevSibling.style.paddingLeft.toString();
			var prevSiblingPadding = parseInt(strBuf.substring(0,strBuf.length-2));
		}
		
		if(originalTaskPadding > prevSiblingPadding) //task can be indented at most 1 level more than the task above it
			return;
		
		gt_tasks_sync.moveNodeRight(selectedNode);
		
		//now let's move the nodes representing child tasks
		var nextNode = selectedNode.nextSibling;
		while(nextNode) {
			if(!nextNode.style.paddingLeft) {
				var nextNodePadding = 0;
			} else {				
				var strBuf = nextNode.style.paddingLeft.toString();
				var nextNodePadding = parseInt(strBuf.substring(0,strBuf.length-2));
			}
			if(nextNodePadding <= originalTaskPadding) //there are no more child tasks
				break;
			var moveThis = nextNode;
			nextNode = moveThis.nextSibling;
			gt_tasks_sync.moveNodeRight(moveThis);
		}
		
		gt_tasks_sync.queueMoveForTask();
	}
	
	gt_tasks_sync.moveNodeRight = function(node) {
		//this will only ever be called when the move is valid
		if(!node.style.paddingLeft || node.style.paddingLeft == "0px") {
			node.style.paddingLeft = "20px";
			return;
		}
		
		var strBuf = node.style.paddingLeft.toString();
		var currentPadding = parseInt(strBuf.substring(0,strBuf.length-2));
		
		switch(currentPadding) {
			case 20:
				node.style.paddingLeft = "30px";
				break;
			case 30:
				node.style.paddingLeft = "40px";
				break;
			default:
				var newPadding = currentPadding + 5;
				node.style.paddingLeft = newPadding + "px";
				break;
		}
	}
	
	gt_tasks_sync.fixIndent = function() { //called after moving a task up or down; it will move it left if it is too far right
		var vbox = document.getElementById("gt_tasks_sync_reorderingcontainer");
		var nodes = vbox.childNodes;
		for(var i in nodes) {
			if(nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_selected" || nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_faded_selected")
				var selectedNode = nodes.item(i);
		}
		if(!selectedNode)
			return;
		
		var targetPadding = 0;
		
		if(selectedNode.previousSibling) {
			switch(gt_tasks_sync.getNodePadding(selectedNode.previousSibling)) {
				case 0:
					targetPadding = 20;
					break;
				case 20:
					targetPadding = 30;
					break;
				case 30:
					targetPadding = 40;
					break;
				default:
					targetPadding = gt_tasks_sync.getNodePadding(selectedNode.previousSibling) + 5;
					break;
			}
		}
		
		while(gt_tasks_sync.getNodePadding(selectedNode) > targetPadding)
			gt_tasks_sync.moveTaskLeft();
	}
	
	//TODO: incorporate this into more of the above functions
	gt_tasks_sync.getNodePadding = function(node) {
		if(!node.style.paddingLeft) {
			var nodePadding = 0;
		} else {
			var strBuf = node.style.paddingLeft.toString();
			var nodePadding = parseInt(strBuf.substring(0,strBuf.length-2));
		}
		return nodePadding;
	}
	
	gt_tasks_sync.queueMoveForTask = function() {
		var vbox = document.getElementById("gt_tasks_sync_reorderingcontainer");
		var nodes = vbox.childNodes;
		for(var i in nodes) {
			if(nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_selected" || nodes.item(i).getAttribute("class") == "gt_tasks_sync_c_taskwrapper_faded_selected")
				var selectedNode = nodes.item(i);
		}
		if(!selectedNode)
			return;

		var currentTasklistId = document.getElementById("gt_tasks_sync_tasklistmenu").value;
		var currentTaskId = selectedNode.id;

		if(typeof gt_tasks_sync.unconfirmedQueuedMoves[currentTasklistId] === 'undefined')
			gt_tasks_sync.unconfirmedQueuedMoves[currentTasklistId] = new Object();
			
		gt_tasks_sync.unconfirmedQueuedMoves[currentTasklistId][currentTaskId] = new Object();
		
		if(!selectedNode.previousSibling) //leave the queued move empty if we need to move to top level, first position
			return;
		
		
		if(gt_tasks_sync.getNodePadding(selectedNode.previousSibling) < gt_tasks_sync.getNodePadding(selectedNode)) {
			//we found the parent task immediately and therefore should omit the sibling parameter
			gt_tasks_sync.unconfirmedQueuedMoves[currentTasklistId][currentTaskId].newParent = selectedNode.previousSibling.id;
		} else {
			var previousNode = selectedNode.previousSibling;
			var siblingFound = false;
			while(previousNode) {
				if(!siblingFound && gt_tasks_sync.getNodePadding(previousNode) == gt_tasks_sync.getNodePadding(selectedNode)) {
					gt_tasks_sync.unconfirmedQueuedMoves[currentTasklistId][currentTaskId].newSibling = previousNode.id;
					siblingFound = true;
				} else if (gt_tasks_sync.getNodePadding(previousNode) < gt_tasks_sync.getNodePadding(selectedNode)) {
					gt_tasks_sync.unconfirmedQueuedMoves[currentTasklistId][currentTaskId].newParent = previousNode.id;
					break;
				}
				previousNode = previousNode.previousSibling;
			}
		}

	}
