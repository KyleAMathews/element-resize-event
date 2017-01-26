
elementResizeEvent = require('../index.js');
var _elementResizeEvent = new elementResizeEvent.elementResizeEvent(window);

//Or using ES6 syntax 
//import {elementResizeEvent} from "element-resize-event";
//var _elementResizeEvent = new elementResizeEvent(window);

element = document.getElementById("resize");
window.p = p = document.getElementById("width");

var resizeHandler = function() {
  console.log("resized!");
  console.log(element.offsetWidth);
  console.log(p);
  console.log(element.offsetWidth + "px wide");
  p.innerHTML = element.offsetWidth + "px wide";
}

console.log(p);
console.log(_elementResizeEvent);
_elementResizeEvent.addResizeListener(element, resizeHandler);

//To detach the listener
//_elementResizeEvent.removeResizeListener(element, resizeHandler);
