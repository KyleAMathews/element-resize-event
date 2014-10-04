(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
elementResizeEvent = require('../index.js');

element = document.getElementById("resize");
window.p = p = document.getElementById("width");
console.log(p);
console.log(elementResizeEvent);
console.log(elementResizeEvent(element, function() {
  console.log("resized!");
  console.log(element.offsetWidth);
  console.log(p);
  console.log(element.offsetWidth + "px wide");
  p.innerHTML = element.offsetWidth + "px wide";
}));

},{"../index.js":2}],2:[function(require,module,exports){
/**
 * Copyright Marc J. Schmidt. See the LICENSE file at the top-level
 * directory of this distribution and at
 * https://github.com/marcj/css-element-queries/blob/master/LICENSE.
 */
/**
 * Class for dimension change detection.
 *
 * @param {Element|Element[]|Elements|jQuery} element
 * @param {Function} callback
 *
 * @constructor
 */
module.exports = function(element, callback) {
  /**
   *
   * @constructor
   */
  function EventQueue() {
    this.q = [];
    this.add = function(ev) {
      this.q.push(ev);
    };

    var i, j;
    this.call = function() {
      for (i = 0, j = this.q.length; i < j; i++) {
        this.q[i].call();
      }
    };
  }

  /**
   * @param {HTMLElement} element
   * @param {String}      prop
   * @returns {String|Number}
   */
  function getComputedStyle(element, prop) {
    if (element.currentStyle) {
      return element.currentStyle[prop];
    } else if (window.getComputedStyle) {
      return window.getComputedStyle(element, null).getPropertyValue(prop);
    } else {
      return element.style[prop];
    }
  }

  /**
   *
   * @param {HTMLElement} element
   * @param {Function}    resized
   */
  function attachResizeEvent(element, resized) {
    if (!element.resizedAttached) {
      element.resizedAttached = new EventQueue();
      element.resizedAttached.add(resized);
    } else if (element.resizedAttached) {
      element.resizedAttached.add(resized);
      return;
    }

    element.resizeSensor = document.createElement('div');
    element.resizeSensor.className = 'resize-sensor';
    var style = 'position: absolute; left: 0; top: 0; right: 0; bottom: 0; overflow: scroll; z-index: -1; visibility: hidden;';
    var styleChild = 'position: absolute; left: 0; top: 0;';

    element.resizeSensor.style.cssText = style;
    element.resizeSensor.innerHTML = '<div class="resize-sensor-expand" style="' + style + '">' +
    '<div style="' + styleChild + '"></div>' +
    '</div>' +
    '<div class="resize-sensor-shrink" style="' + style + '">' +
    '<div style="' + styleChild + ' width: 200%; height: 200%"></div>' +
    '</div>';
    element.appendChild(element.resizeSensor);

    if ('absolute' !== getComputedStyle(element, 'position')) {
      element.style.position = 'relative';
    }

    var expand = element.resizeSensor.childNodes[0];
    var expandChild = expand.childNodes[0];
    var shrink = element.resizeSensor.childNodes[1];
    var shrinkChild = shrink.childNodes[0];

    var lastWidth, lastHeight;

    var reset = function() {
      expandChild.style.width = expand.offsetWidth + 10 + 'px';
      expandChild.style.height = expand.offsetHeight + 10 + 'px';
      expand.scrollLeft = expand.scrollWidth;
      expand.scrollTop = expand.scrollHeight;
      shrink.scrollLeft = shrink.scrollWidth;
      shrink.scrollTop = shrink.scrollHeight;
      lastWidth = element.offsetWidth;
      lastHeight = element.offsetHeight;
    };

    reset();

    var changed = function() {
      element.resizedAttached.call();
    };

    var addEvent = function(el, name, cb) {
      if (el.attachEvent) {
        el.attachEvent('on' + name, cb);
      } else {
        el.addEventListener(name, cb);
      }
    };

    addEvent(expand, 'scroll', function() {
      if (element.offsetWidth > lastWidth || element.offsetHeight > lastHeight) {
        changed();
      }
      reset();
    });

    addEvent(shrink, 'scroll', function() {
      if (element.offsetWidth < lastWidth || element.offsetHeight < lastHeight) {
        changed();
      }
      reset();
    });
  }

  if (Object.prototype.toString.call(element) === "[object Array]" ||
    ('undefined' !== typeof jQuery && element instanceof jQuery) || //jquery
    ('undefined' !== typeof Elements && element instanceof Elements) //mootools
  ) {
    var i = 0,
      j = element.length;
    for (; i < j; i++) {
      attachResizeEvent(element[i], callback);
    }
  } else {
    attachResizeEvent(element, callback);
  }
};


},{}]},{},[1]);
