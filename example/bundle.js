"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/index.ts
  var require_src = __commonJS({
    "src/index.ts"(exports, module) {
      "use strict";
      function resizeListener(e) {
        const win = e.target || e.srcElement;
        if (win.__resizeRAF__) {
          cancelAnimationFrame(win.__resizeRAF__);
        }
        win.__resizeRAF__ = requestAnimationFrame(function() {
          const trigger = win.__resizeTrigger__;
          const listeners = trigger && trigger.__resizeListeners__;
          if (trigger && listeners) {
            listeners.forEach(function(fn) {
              fn.call(trigger, e);
            });
          }
        });
      }
      function objectLoad() {
        const obj = this;
        const view = obj.contentDocument.defaultView;
        view.__resizeTrigger__ = obj.__resizeElement__;
        view.addEventListener("resize", resizeListener);
      }
      function addListener(target, fn) {
        const win = this || window;
        const document2 = win.document;
        const element2 = target;
        let isIE;
        const attachEvent = document2.attachEvent;
        if (typeof navigator !== "undefined") {
          isIE = /Trident/.test(navigator.userAgent) || /Edge/.test(navigator.userAgent);
        }
        if (!element2.__resizeListeners__) {
          element2.__resizeListeners__ = [];
          if (attachEvent) {
            element2.__resizeTrigger__ = element2;
            element2.attachEvent("onresize", resizeListener);
          } else {
            if (getComputedStyle(element2).position === "static") {
              element2.style.position = "relative";
            }
            const obj = document2.createElement("object");
            element2.__resizeTrigger__ = obj;
            obj.setAttribute(
              "style",
              "position: absolute; top: 0; left: 0; height: 100%; width: 100%; pointer-events: none; z-index: -1; opacity: 0;"
            );
            obj.setAttribute("class", "resize-sensor");
            obj.setAttribute("tabindex", "-1");
            obj.setAttribute("title", "");
            obj.__resizeElement__ = element2;
            obj.onload = objectLoad;
            obj.type = "text/html";
            if (isIE) {
              element2.appendChild(obj);
            }
            obj.data = "about:blank";
            if (!isIE) {
              element2.appendChild(obj);
            }
          }
        }
        element2.__resizeListeners__.push(fn);
      }
      function removeListener(target, fn) {
        const element2 = target;
        const attachEvent = document.attachEvent;
        let listeners = element2.__resizeListeners__ || [];
        if (fn) {
          const index = listeners.indexOf(fn);
          if (index !== -1) {
            listeners.splice(index, 1);
          }
        } else {
          listeners = element2.__resizeListeners__ = [];
        }
        if (!listeners.length) {
          if (attachEvent) {
            element2.detachEvent("onresize", resizeListener);
          } else if (element2.__resizeTrigger__) {
            const trigger = element2.__resizeTrigger__;
            const contentDocument = trigger.contentDocument;
            const defaultView = contentDocument && contentDocument.defaultView;
            if (defaultView) {
              defaultView.removeEventListener("resize", resizeListener);
              delete defaultView.__resizeTrigger__;
            }
            element2.removeChild(trigger);
            element2.__resizeTrigger__ = false;
          }
          delete element2.__resizeListeners__;
        }
      }
      var elementResizeEvent2 = typeof window === "undefined" ? addListener : addListener.bind(window);
      elementResizeEvent2.unbind = removeListener;
      module.exports = elementResizeEvent2;
    }
  });

  // example/index.ts
  var import_src = __toESM(require_src());
  var element = document.getElementById("resize");
  var label = document.getElementById("width");
  function onResize() {
    console.log("resized!", element.offsetWidth);
    label.innerHTML = element.offsetWidth + "px wide";
  }
  import_src.default.unbind(element);
  import_src.default.unbind(element, onResize);
  (0, import_src.default)(element, onResize);
  import_src.default.unbind(element, onResize);
  (0, import_src.default)(element, onResize);
  import_src.default.unbind(element, function() {
  });
})();
