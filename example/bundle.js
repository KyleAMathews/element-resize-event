(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var el = document.querySelectorAll('.CONTAINER')[0];
interact(el)
  .resizable(true)
  .on('resizemove', function (event) {
    var target = event.target;

    // add the change in coords to the previous width of the target element
    var
        newWidth  = parseFloat(target.style.width ) + event.dx,
        newHeight = parseFloat(target.style.height) + event.dy;

    // update the element's style
    target.style.width      = newWidth + 'px';
    target.style.height     = newHeight + 'px';

  });


elementResizeEvent = require('../index.js');

element = document.getElementById("resize");
window.w = w = document.getElementById("width");
window.h = h = document.getElementById("height");
console.log(elementResizeEvent(element, function(size) {
  console.log("resized!");
  w.innerHTML = element.offsetWidth + "px wide";
  h.innerHTML = element.offsetHeight + "px high";
  console.log(size);
  console.log('====================');
  var newClass = 'Box';
  if (size.width < 300) {
    newClass += '  Box--SIZE_small';
  } else {
    newClass += '  Box--SIZE_normal';
  }
  if (size.height > 100) {
    newClass += '  Box--SIZE_thin';
  } else {
    newClass += '  Box--SIZE_thick';
  }
  element.setAttribute('class', newClass);
}));

},{"../index.js":2}],2:[function(require,module,exports){
if (typeof document === "undefined") {
  document = {};
}
if (typeof window === "undefined") {
  window = {};
}

var attachEvent = document.attachEvent;
if (typeof navigator !== "undefined") {
  var isIE = navigator.userAgent.match(/Trident/);
}

var requestFrame = (function() {
  var raf = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || function(fn) {
      return window.setTimeout(fn, 20);
    };
  return function(fn) {
    return raf(fn);
  };
})();

var cancelFrame = (function() {
  var cancel = window.cancelAnimationFrame || window.mozCancelAnimationFrame || window.webkitCancelAnimationFrame ||
    window.clearTimeout;
  return function(id) {
    return cancel(id);
  };
})();

function resizeListener(e) {
  var win = e.target || e.srcElement;
  if (win.__resizeRAF__) {
    cancelFrame(win.__resizeRAF__);
  }
  win.__resizeRAF__ = requestFrame(function() {
    var trigger = win.__resizeTrigger__;
    trigger.__resizeListeners__.forEach(function(fn) {
      fn.call(trigger, /*e,*/ {
        width: trigger.offsetWidth,
        height: trigger.offsetHeight
      });
    });
  });
}

function objectLoad(e) {
  this.contentDocument.defaultView.__resizeTrigger__ = this.__resizeElement__;
  this.contentDocument.defaultView.addEventListener('resize', resizeListener);
}

module.exports = function(element, fn) {
  if (!element.__resizeListeners__) {
    element.__resizeListeners__ = [];
    if (attachEvent) {
      element.__resizeTrigger__ = element;
      element.attachEvent('onresize', resizeListener);
    } else {
      if (getComputedStyle(element).position == 'static') {
        element.style.position = 'relative';
      }
      var obj = element.__resizeTrigger__ = document.createElement('object');
      obj.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; height: 100%; width: 100%; overflow: hidden; pointer-events: none; z-index: -1;');
      obj.setAttribute('class', 'resize-sensor');
      obj.__resizeElement__ = element;
      obj.onload = objectLoad;
      obj.type = 'text/html';
      if (isIE) {
        element.appendChild(obj);
      }
      obj.data = 'about:blank';
      if (!isIE) {
        element.appendChild(obj);
      }
    }
  }
  element.__resizeListeners__.push(fn);
};

},{}]},{},[1]);
