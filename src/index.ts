// Event-based element resize detection, adapted from
// http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/
//
// The package still supports old browsers, so this file compiles to ES5 and
// `lib` is limited to ES5 + DOM. `pnpm check:es5` verifies the output.

/** Called with `this` set to the element that resized. */
type ResizeListener<T extends Element = Element> = (
  this: T,
  event: Event
) => unknown

interface ElementResizeEvent {
  /**
   * Call `listener` whenever `element` changes size.
   *
   * @example
   * const elementResizeEvent = require("element-resize-event")
   *
   * elementResizeEvent(element, () => {
   *   console.log(element.offsetWidth)
   * })
   */
  <T extends Element>(element: T, listener: ResizeListener<T>): void

  /**
   * Remove `listener` from `element`, or remove all listeners if `listener`
   * is omitted. The sensor is removed when no listeners remain.
   */
  unbind<T extends Element>(element: T, listener?: ResizeListener<T>): void
}

type LegacyEventHandler = (
  type: string,
  listener: (event: Event) => void
) => void

// Old IE (<= 10) has native resize events on elements via attachEvent.
interface LegacyDocument extends Document {
  attachEvent?: LegacyEventHandler
}

interface ResizeElement extends Element {
  __resizeListeners__?: ResizeListener[]
  __resizeTrigger__?: SensorObject | ResizeElement | false
  attachEvent?: LegacyEventHandler
  detachEvent?: LegacyEventHandler
}

interface SensorObject extends HTMLObjectElement {
  __resizeElement__?: ResizeElement
}

// The target of the resize event: the sensor's window, or the element itself
// when using attachEvent.
interface ResizeEventTarget {
  __resizeRAF__?: number
  __resizeTrigger__?: ResizeElement
}

function resizeListener(e: Event) {
  const win = (e.target || e.srcElement) as unknown as ResizeEventTarget
  if (win.__resizeRAF__) {
    cancelAnimationFrame(win.__resizeRAF__)
  }
  win.__resizeRAF__ = requestAnimationFrame(function () {
    const trigger = win.__resizeTrigger__
    const listeners = trigger && trigger.__resizeListeners__
    if (trigger && listeners) {
      listeners.forEach(function (fn) {
        fn.call(trigger, e)
      })
    }
  })
}

function objectLoad(this: GlobalEventHandlers) {
  const obj = this as SensorObject
  const view = obj.contentDocument!.defaultView as Window & ResizeEventTarget
  view.__resizeTrigger__ = obj.__resizeElement__
  view.addEventListener("resize", resizeListener)
}

function addListener(
  this: Window | void,
  target: Element,
  fn: ResizeListener
): void {
  // In browsers this is bound to `window`. When loaded without a global
  // `window` (e.g. SSR), it is unbound; the original sloppy-mode code then
  // fell back to the global object, so fall back to `window` at call time.
  const win = this || window
  const document = win.document as LegacyDocument
  const element = target as ResizeElement & ElementCSSInlineStyle
  let isIE: boolean | undefined

  const attachEvent = document.attachEvent
  if (typeof navigator !== "undefined") {
    isIE =
      /Trident/.test(navigator.userAgent) || /Edge/.test(navigator.userAgent)
  }

  if (!element.__resizeListeners__) {
    element.__resizeListeners__ = []
    if (attachEvent) {
      element.__resizeTrigger__ = element
      element.attachEvent!("onresize", resizeListener)
    } else {
      if (getComputedStyle(element).position === "static") {
        element.style.position = "relative"
      }
      const obj = document.createElement("object") as SensorObject
      element.__resizeTrigger__ = obj
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

function removeListener(target: Element, fn?: ResizeListener): void {
  const element = target as ResizeElement
  const attachEvent = (document as LegacyDocument).attachEvent
  let listeners = element.__resizeListeners__ || []
  if (fn) {
    const index = listeners.indexOf(fn)
    if (index !== -1) {
      listeners.splice(index, 1)
    }
  } else {
    listeners = element.__resizeListeners__ = []
  }
  if (!listeners.length) {
    if (attachEvent) {
      element.detachEvent!("onresize", resizeListener)
    } else if (element.__resizeTrigger__) {
      const trigger = element.__resizeTrigger__ as SensorObject
      const contentDocument = trigger.contentDocument
      const defaultView = (contentDocument && contentDocument.defaultView) as
        (Window & ResizeEventTarget) | null
      if (defaultView) {
        defaultView.removeEventListener("resize", resizeListener)
        delete defaultView.__resizeTrigger__
      }
      element.removeChild(trigger)
      element.__resizeTrigger__ = false
    }
    delete element.__resizeListeners__
  }
}

const elementResizeEvent = (
  typeof window === "undefined" ? addListener : addListener.bind(window)
) as ElementResizeEvent

elementResizeEvent.unbind = removeListener as ElementResizeEvent["unbind"]

export = elementResizeEvent
