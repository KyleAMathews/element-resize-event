;(function e(t, n, r) {
  function s(o, u) {
    if (!n[o]) {
      if (!t[o]) {
        var a = typeof require == "function" && require
        if (!u && a) return a(o, !0)
        if (i) return i(o, !0)
        var f = new Error("Cannot find module '" + o + "'")
        throw ((f.code = "MODULE_NOT_FOUND"), f)
      }
      var l = (n[o] = { exports: {} })
      t[o][0].call(
        l.exports,
        function (e) {
          var n = t[o][1][e]
          return s(n ? n : e)
        },
        l,
        l.exports,
        e,
        t,
        n,
        r
      )
    }
    return n[o].exports
  }
  var i = typeof require == "function" && require
  for (var o = 0; o < r.length; o++) s(r[o])
  return s
})(
  {
    1: [
      function (require, module, exports) {
        elementResizeEvent = require("../index.js")

        element = document.getElementById("resize")
        window.p = p = document.getElementById("width")
        console.log(p)
        console.log(elementResizeEvent)

        function onResize() {
          console.log("resized!")
          console.log(element.offsetWidth)
          console.log(p)
          console.log(element.offsetWidth + "px wide")
          p.innerHTML = element.offsetWidth + "px wide"
        }

        //check unbind when nothing is bound
        elementResizeEvent.unbind(element)
        elementResizeEvent.unbind(element, onResize)

        elementResizeEvent(element, onResize)
        //check unbind for bounded function
        elementResizeEvent.unbind(element, onResize)

        //bind again
        console.log(elementResizeEvent(element, onResize))

        //check unbind of non-existent function
        elementResizeEvent.unbind(element, function () {})
      },
      { "../index.js": 2 },
    ],
    2: [
      function (require, module, exports) {
        function resizeListener(e) {
          var win = e.target || e.srcElement
          if (win.__resizeRAF__) {
            cancelAnimationFrame(win.__resizeRAF__)
          }
          win.__resizeRAF__ = requestAnimationFrame(function () {
            var trigger = win.__resizeTrigger__
            var listeners = trigger && trigger.__resizeListeners__
            if (listeners) {
              listeners.forEach(function (fn) {
                fn.call(trigger, e)
              })
            }
          })
        }

        var exports = function exports(element, fn) {
          var window = this
          var document = window.document
          var isIE

          var attachEvent = document.attachEvent
          if (typeof navigator !== "undefined") {
            isIE =
              navigator.userAgent.match(/Trident/) ||
              navigator.userAgent.match(/Edge/)
          }

          function objectLoad() {
            this.contentDocument.defaultView.__resizeTrigger__ =
              this.__resizeElement__
            this.contentDocument.defaultView.addEventListener(
              "resize",
              resizeListener
            )
          }

          if (!element.__resizeListeners__) {
            element.__resizeListeners__ = []
            if (attachEvent) {
              element.__resizeTrigger__ = element
              element.attachEvent("onresize", resizeListener)
            } else {
              if (getComputedStyle(element).position === "static") {
                element.style.position = "relative"
              }
              var obj = (element.__resizeTrigger__ =
                document.createElement("object"))
              obj.setAttribute(
                "style",
                "position: absolute; top: 0; left: 0; height: 100%; width: 100%; pointer-events: none; z-index: -1; opacity: 0;"
              )
              obj.setAttribute("class", "resize-sensor")

              // prevent <object> from stealing keyboard focus
              obj.setAttribute("tabindex", "-1")

              // prevent screenreaders to see this object
              obj.setAttribute("title", "")

              obj.__resizeElement__ = element
              obj.onload = objectLoad
              obj.type = "text/html"
              if (isIE) {
                element.appendChild(obj)
              }
              obj.data = "about:blank"
              if (!isIE) {
                element.appendChild(obj)
              }
            }
          }
          element.__resizeListeners__.push(fn)
        }

        module.exports =
          typeof window === "undefined" ? exports : exports.bind(window)

        module.exports.unbind = function (element, fn) {
          var attachEvent = document.attachEvent
          var listeners = element.__resizeListeners__ || []
          if (fn) {
            var index = listeners.indexOf(fn)
            if (index !== -1) {
              listeners.splice(index, 1)
            }
          } else {
            listeners = element.__resizeListeners__ = []
          }
          if (!listeners.length) {
            if (attachEvent) {
              element.detachEvent("onresize", resizeListener)
            } else if (element.__resizeTrigger__) {
              var contentDocument = element.__resizeTrigger__.contentDocument
              var defaultView = contentDocument && contentDocument.defaultView
              if (defaultView) {
                defaultView.removeEventListener("resize", resizeListener)
                delete defaultView.__resizeTrigger__
              }
              element.__resizeTrigger__ = !element.removeChild(
                element.__resizeTrigger__
              )
            }
            delete element.__resizeListeners__
          }
        }
      },
      {},
    ],
  },
  {},
  [1]
)
