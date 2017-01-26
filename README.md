element-resize-event
==================

Library to make it easy to listen for element resize events

Code borrowed from a [blog post by
backalleycoder.com](http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/).

## Install
`npm install element-resize-event`

## Usage
```javascript

elementResizeEvent = require('element-resize-event');
var _elementResizeEvent = new elementResizeEvent.elementResizeEvent(window);

//Or using ES6 syntax 
//import {elementResizeEvent} from "element-resize-event";
//var _elementResizeEvent = new elementResizeEvent(window);

var element = document.getElementById("resize");

var resizeHandler = function() {
  console.log("resized!");
  console.log(element.offsetWidth);
}

//To attach a listener
_elementResizeEvent.addResizeListener(element, resizeHandler);

//To detach the listener
_elementResizeEvent.removeResizeListener(element, resizeHandler);

```
