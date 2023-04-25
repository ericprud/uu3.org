/****
 Global vars
*******/
var IS_IE = document.all && window.print && !window.opera && ( !document.compatMode || /MSIE 6/.test(navigator.userAgent) || (document.compatMode && document.compatMode=="BackCompat"));
var IE_NG = document.all && window.print && !window.opera && /MSIE [7-9]/.test(navigator.userAgent) && document.compatMode && document.compatMode!="BackCompat";
var IS_quirks = IS_IE && document.compatMode && document.compatMode=="BackCompat"; 
var heightPropertyToUse = IS_IE ? "height" : "minHeight";
var IS_Webkit = /Konqueror|Safari|KHTML/.test(navigator.userAgent); 
//add the hasJS class if JS is present
document.documentElement.className+=" hasJS";
if (IS_IE) document.documentElement.className+=" IS_IE";

function $(str) {
	return (typeof str == "string") ? document.getElementById(str) : str;
}

function addEvent(element, type, handler) {
    if (!handler.$$guid) handler.$$guid = addEvent.guid++;
    if (!element.events) element.events = {};
    var handlers = element.events[type];
    if (!handlers) {
        handlers = element.events[type] = {};
        if (element["on" + type]) {
            handlers[0] = element["on" + type];
        }
    }
    handlers[handler.$$guid] = handler;
    element["on" + type] = handleEvent;
};

function removeEvent(element, type, handler) {
    if (element.events && element.events[type]) {
        delete element.events[type][handler.$$guid];
    }
};

function handleEvent(event) {
    var returnValue = true;
    event = event || fixEvent(window.event);
    var handlers = this.events[event.type];
    for (var i in handlers) {
        this.$$handleEvent = handlers[i];
        if (this.$$handleEvent(event) === false) {
            returnValue = false;
        }
    }
    return returnValue;
};

function fixEvent(event) {
    event.preventDefault = fixEvent.preventDefault;
    event.stopPropagation = fixEvent.stopPropagation;
    return event;
};
fixEvent.preventDefault = function() {
    this.returnValue = false;
};
fixEvent.stopPropagation = function() {
    this.cancelBubble = true;
};
cancelBubble = function(e){
	if (window.event){
		window.event.cancelBubble = true;
		window.event.returnValue = false;
		return;
	}
	if (e){
		e.stopPropagation();
		e.preventDefault();
	}
}
cancelClick = function(e){
	if (window.event){
		window.event.cancelBubble = true;
		return;
	}
	if (e){
		if (e.stopPropagation) {
			e.stopPropagation();
		}
	}
}


function getElementsByClassName(oElm, sTagName, sClassName){
	var aElements = (sTagName == "*" && oElm.all)? oElm.all : oElm.getElementsByTagName(sTagName);
	var aReturnElements = new Array();
	sClassName = sClassName.replace(/\-/g, "\\-");
	var oRegExp = new RegExp("(^|\\s)" + sClassName + "(\\s|$)");
	var oElement;
	for(var i=0; i < aElements.length; i++){
		oElement = aElements[i];
		if(oRegExp.test(oElement.className))
			aReturnElements.push(oElement);
	}
	return aReturnElements
}

// getStyle : return a css property
function getStyle(oElm, strCssRule){
	var strValue = "";
	if(document.defaultView && document.defaultView.getComputedStyle) {
		try{ 
			strValue = document.defaultView.getComputedStyle(oElm, null).getPropertyValue(strCssRule); 
		}
		catch(e) { strValue = ""; }
	}
	else if(oElm.currentStyle) {
		try{
			strCssRule = strCssRule.replace(/\-(\w)/g, function (strMatch, p1){
				return p1.toUpperCase();
			});
			strValue = oElm.currentStyle[strCssRule];
		} catch(e) {
			strValue = "";
		}
	}
	return strValue;
}

/*return the style*/
function intStyle(oElm, strCSSRule) {
	var val = parseInt(getStyle(oElm, strCSSRule));
	if (isNaN(val)) val=0;
	return val;
}

/* the sum of all heights (border-width+padding) */ 
function getVStyles(elm) {
	return IS_quirks ? 0 : intStyle(elm, "border-top-width")+intStyle(elm, "border-bottom-width")+intStyle(elm, "padding-top")+intStyle(elm, "padding-bottom");
}
function getHStyles(elm) {
	return IS_quirks ? 0 : intStyle(elm, "border-left-width")+intStyle(elm, "border-right-width")+intStyle(elm, "padding-left")+intStyle(elm, "padding-right");
}
//removeClass
function removeClass(element, className) {
	element.className = element.className.replace(new RegExp("\\b"+className+"\\b","g"),"");
};
//addClass
function addClass(element, className) {
	element.className += " " + className;
};
//toggleClass
function toggleClass(element, className, classNameReplace) {
	element.className = element.className.replace(new RegExp("\\b"+className+"\\b","g"), classNameReplace);
};
function findPos(obj) {
	var curleft = curtop = 0;
	if (obj.offsetParent) {
		curleft = obj.offsetLeft
		curtop = obj.offsetTop
		while (obj = obj.offsetParent) {
			curleft += obj.offsetLeft
			curtop += obj.offsetTop
		}
	}
	return [curleft,curtop];
}


var $n = {
	hasAttr : function(n, a, not) {
		var re, at;
		if (n.nodeType!=1) return false;
		function check(attr) {
			for (var i in attr) {
				at = (typeof n[i]) !="undefined" ? n[i] : n.getAttribute(i);
				re = attr[i] instanceof RegExp ? re : new RegExp("\\b" + attr[i] + "\\b","i");
				if (!at || !re.test(at)) 
					return false;
			}
			return true;
		};
		if (not && check(not))	return false;
		if (check(a)) return true;
		return false;
	},
	getByTagName : function(n, tag) {
		return  (tag=="*") ? (n.all ? n.all : n.getElementsByTagName("*")) : n.getElementsByTagName(tag);
	},
	node : function(n, a, not) {
		return $n.nodes(n, a, not, true);
	},
	nodes : function(n, a, not, oneNode, arrElms) {
		var aRetElms=[];
		if (!a) a = {};
		if (typeof a == "string") a = {nodeName:a}; 
		if (a.nodeName && a.nodeName=="*") delete a.nodeName;
		var elms = arrElms || $n.getByTagName(n, (a.nodeName || "*"));
		for (var i=0; i<elms.length; i++) {
			var x = elms[i];
			if ($n.hasAttr(x, a, not)) {
				if (oneNode) return x;
				else aRetElms.push(x);
			}
		}
		if (oneNode) return null;
		return aRetElms;
	},
	/* childs : retourne tous les noeuds enfants de l'element  */
	childs : function(n, a, not) {
		return $n.nodes(n, a, not, false, n.childNodes);
	},
	firstChild : function(n, a, not) {
		return $n.nodes(n, a, not, true, n.childNodes);
	},
	lastChild : function(n, a, not) {
		var node = $n.nodes(n, a, not, false, n.childNodes);
		return node[node.length-1];
	},
	move : function(n, a, not, action) {
		while (n) {
			if ($n.hasAttr(n, a, not)) return n;
			n = n[action];
		}
		return null;
	},
	after : function(n, a, not) { 
		return $n.move(n, a, not, "nextSibling");
	},
	before : function(n, a, not) {
		return $n.move(n, a, not, "previousSibling");
	},
	parent : function(n, a, not) {
		return $n.move(n, a, not, "parentNode");
	}
}
var getNode = $n.node,
	getNodes = $n.nodes,
	getChildNodes = $n.childs,
	getNextSibling = $n.after,
	getPreviousSibling = $n.before,
	getParent = $n.parent,
	hasAttributes = $n.hasAttr,
	getElementsByTagName = $n.getByTagName;



/*****************
* domLoad and onload functions
*****************/
domLoadBottomDivId = "footer"; 
var domLoaded=false;
var domMustLaunch=false;
var domLoadFunctionLaunched=false;
var domLoadTimer=null;
var domLoadArrFunctions=[];
var onLoadArrFunctions=[];
function domLoad() {
	if(document.getElementById(domLoadBottomDivId)) {
		domLoadCaller();
	} else {
		domLoadTimer=setTimeout("domLoad()",10);
	}
};
domLoad();
function domLoadCaller() {
	domLoadFunctionLaunched=true;
	for (var i=0; i<domLoadArrFunctions.length; i++) {
		domLoadArrFunctions[i]();
	}
	domLoadFunctions();
	domLoaded=true;
	if(domMustLaunch) {
		onloadCaller();
	}
};
function onloadCaller() {
	clearTimeout(domLoadTimer);
	if (!domLoadFunctionLaunched) {
		domLoadCaller();
	}
	if (!domLoaded) {
		domMustLaunch=true;
		return;
	}
	for (var i=0; i<onLoadArrFunctions.length; i++) {
		onLoadArrFunctions[i]();
	}
	onLoadFunctions();
}
function addDomLoadFunc(f) {
	domLoadArrFunctions.push(f);
}
function addOnLoadFunc(f) {
	onLoadArrFunctions.push(f);
}
addEvent(window, "load", onloadCaller);




/*************
* Functions to fix IE absolute position bug.  If height/width is even versus odd, 
it can't calculate absolute position and has a 1px gap.
* Safari 2.0, Opera 8.5 and FF 1.0
**************/
var CSSBottomCorners=[]; //array pouvant contenir les coins absolu positionnes en bottom
var CSSHeightCorners=[]; //array pouvant contenir les listes des blocks dont les coins font 100% de la hauteur
var currentBlockToFixCorners=null; //variable gloable utilisee lorsqu'on veux fixer les coins sur un seul bloc

/*  cssRight : Find true right for IE
*/
function cssRight(elm) {
	if (elm.currentStyle.right!="auto") {
		elm.style.right = (parseInt(elm.currentStyle.right)-(elm.parentNode.offsetWidth%2))+"px";
	} else {
		elm.style.right = "auto";
	}
}
 
/*  find true bottom for IE 
*/
function cssBottom(elm, pushElement) {
	if (pushElement && !elm.CSSBottomAlreadyCSS) {
		CSSBottomCorners.push(elm);
		elm.CSSBottomAlreadyCSS=true;
	}
	if (elm.currentStyle.bottom!="auto") {
		elm.style.bottom = (parseInt(elm.currentStyle.bottom)-(elm.parentNode.offsetHeight%2))+"px";
	} else {
		elm.style.bottom = "auto";
	}
}

/*  
	fixCorners of the entire page
*/
function fixCorners(block) {
	if (IS_IE) {
		for (var i=CSSBottomCorners.length-1; i>-1; --i) {
			CSSBottomCorners[i].style.bottom="";
		}
	} else {
		if (IS_Webkit || /Gecko\/200[56]|Opera 8.5/i.test(navigator.userAgent)) fixCornersOnBlocks(block);
	}
}

/* 
	blink - hide to rerender
*/
function fixCornersOnBlocks(block) {
	var currentBlockToFixCorners = block || document.body;
	currentBlockToFixCorners.className+=" hidecorners";
	setTimeout(fixCornersOnBlocksShowCorners,5);
}

/* 
	blink - show to rerender
*/
function fixCornersOnBlocksShowCorners() {
	if (currentBlockToFixCorners) currentBlockToFixCorners.className=currentBlockToFixCorners.className.replace(/\bhidecorners\b/g,"");
	currentBlockToFixCorners=null;
}


/********************
* Extend obj 
 ********************/
var extend = function (object, extender) {
	var props = extender || {}; // fail-safe
	for (var property in props) {
		object.prototype[property] = props[property];
	}
	return object;
};

Array.Utils = {
	each : function(f) {
		var i;
		for(i=0;i<this.length;i++) {
			f.apply(this[i]);
		}
	},
	eachInv : function(f) {
		var i;
		for(i=this.length-1;i>=0;i--) {
			f.apply(this[i]);
		}
	},
	last : function() {
		return this.length>0 ? this[this.length-1] : null;
	}
};
extend(Array,Array.Utils);


/* ********************************************************************************************************** */
