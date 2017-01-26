(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

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

},{"../index.js":2}],2:[function(require,module,exports){
function elementResizeEvent(window) {
    this.document = window.document;
    this.isIE = null;
    var that = this;

    this.attachEvent = document.attachEvent;
    if (typeof navigator !== 'undefined') {
        this.isIE = navigator.userAgent.match(/Trident/) || navigator.userAgent.match(/Edge/)
    }

    this.requestFrame = (function () {
        var raf = window.requestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            function fallbackRAF(func) {
                return window.setTimeout(func, 20)
            }
        return function requestFrameFunction(func) {
            return raf(func)
        }
    })()

    this.cancelFrame = (function () {
        var cancel = window.cancelAnimationFrame ||
            window.mozCancelAnimationFrame ||
            window.webkitCancelAnimationFrame ||
            window.clearTimeout
        return function cancelFrameFunction(id) {
            return cancel(id)
        }
    })()

    this.resizeListener = function(e) {
        var win = e.target || e.srcElement
        if (win.__resizeRAF__) {
            that.cancelFrame(win.__resizeRAF__)
        }
        win.__resizeRAF__ = that.requestFrame(function () {
            var trigger = win.__resizeTrigger__
            if (trigger !== undefined) {
                trigger.__resizeListeners__.forEach(function (fn) {
                    fn.call(trigger, e)
                })
            }
        })
    }

    this.objectLoad = function() {
        this.contentDocument.defaultView.__resizeTrigger__ = this.__resizeElement__
        this.contentDocument.defaultView.addEventListener('resize', that.resizeListener)
    }
}
elementResizeEvent.prototype.addResizeListener = function (element, fn) {
    if (!element.__resizeListeners__) {
        element.__resizeListeners__ = []
        if (this.attachEvent) {
            element.__resizeTrigger__ = element
            element.attachEvent('onresize', resizeListener)
        } else {
            if (getComputedStyle(element).position === 'static') {
                element.style.position = 'relative'
            }
            var obj = element.__resizeTrigger__ = this.document.createElement('object')
            obj.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; height: 100%; width: 100%; overflow: hidden; pointer-events: none; z-index: -1; opacity: 0;')
            obj.setAttribute('class', 'resize-sensor')
            obj.__resizeElement__ = element
            obj.onload = this.objectLoad
            obj.type = 'text/html'
            if (this.isIE) {
                element.appendChild(obj)
            }
            obj.data = 'about:blank'
            if (!this.isIE) {
                element.appendChild(obj)
            }
        }
    }
    element.__resizeListeners__.push(fn)
}

elementResizeEvent.prototype.removeResizeListener = function (element, fn) {
    var attachEvent = this.document.attachEvent;
    element.__resizeListeners__.splice(element.__resizeListeners__.indexOf(fn), 1);
    if (!element.__resizeListeners__.length) {
        if (this.attachEvent) {
            element.detachEvent('onresize', this.resizeListener);
        } else {
            if(element.__resizeTrigger__.contentDocument){
                element.__resizeTrigger__.contentDocument.defaultView.removeEventListener('resize', this.resizeListener);
                element.__resizeTrigger__.contentDocument.defaultView.__resizeTrigger__ = false;
                element.__resizeTrigger__ = !element.removeChild(element.__resizeTrigger__);
            }
        }
    }
}

module.exports = {elementResizeEvent};
},{}]},{},[1]);
