/**********
* Corners
**********/
/* generates corners */
function generateElements(parent, stringClasses) {
	var i, x;
	parent = (typeof parent == "string") ? document.getElementById(parent) : parent;
	var content = parent || document.body;
	var div = content.getElementsByTagName("div");
	//get inner
	function getIsd(node, className) { return getNode(node, {className: (className || "inner")})};
	// create corner 
	function nc(clN) {var b = document.createElement("b");b.className=clN;return b;};
	function add(x, c) {
		var i=0; if (!x) return; 
		if (c.length) for (i=0; i<c.length; i++) x.appendChild(c[i].cloneNode(true));
		else x.appendChild(c.cloneNode(true));
	};
	
	// create corners
	var corners = [nc("tl"), nc("tr"), nc("bl"), nc("br")]; //corners 	
	// add corners to blocks
	for (i=div.length-1; i>=0; i--) {
		x=div[i];
		if (!x.alreadyProcessed) {
			if (x.className.match(/\bblock\b/)) //default
				add(getIsd(x), corners);
			x.alreadyProcessed = true;	
		}
	}
}
/***********
* Init
************/
function domLoadFunctions() {
	generateElements();
}
function onLoadFunctions() {
	fixCorners();
}

