element-resize-event
==================

Polyfill to make it easy to listen for element resize events

## Install
`npm install element-resize-event`

## Usage
```javascript
var elementResizeEvent = require('../index.js');

var element = document.getElementById("resize");

elementResizeEvent(element, function() {
  console.log("resized!");
  console.log(element.offsetWidth);
});
```
