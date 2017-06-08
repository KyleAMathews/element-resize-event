element-resize-event
==================

Library to make it easy to listen for element resize events

Code borrowed from a [blog post by
backalleycoder.com](http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/).

## Install
`npm install element-resize-event`

## Dependencies
This library depends on the availability of `requestAnimationFrame` and `cancelAnimationFrame`

## Usage
```javascript
var elementResizeEvent = require('element-resize-event');

var element = document.getElementById("resize");

elementResizeEvent(element, function() {
  console.log("resized!");
  console.log(element.offsetWidth);
});
```

### Unbinding The Event Listener
```javascript
var unbind = require('element-resize-event').unbind;

unbind(element);
```
