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

// One call to elementResizeEvent. Binding the same function again makes a
// new binding, so a frame already walking the old list does not call it.
interface Binding {
  fn: ResizeListener
  // Set by unbind, so a frame already walking a copy of the list skips it.
  removed?: boolean
}

interface ResizeElement extends Element, ElementCSSInlineStyle {
  __resizeListeners__?: Binding[]
  // The inline position before the sensor made a static element relative.
  __resizePosition__?: string
  __resizeTrigger__?: SensorObject | ResizeElement
  attachEvent?: LegacyEventHandler
  detachEvent?: LegacyEventHandler
}

interface SensorObject extends HTMLObjectElement {
  __resizeElement__?: ResizeElement
  // The sensor's window once it loads: a removed <object> loses its document.
  __resizeView__?: Window & ResizeEventTarget
  // Bound outside the document: decide the position once the sensor loads.
  __resizeCheckPosition__?: boolean
}

// The target of the resize event: the sensor's window, or the element itself
// when using attachEvent.
interface ResizeEventTarget {
  __resizeRAF__?: number
  __resizeTrigger__?: ResizeElement
}

function resizeListener(e: Event) {
  const win = (e.target || e.srcElement) as unknown as ResizeEventTarget
  // Cancelling an id that never ran, or none at all, does nothing.
  cancelAnimationFrame(win.__resizeRAF__!)
  win.__resizeRAF__ = requestAnimationFrame(function () {
    const trigger = win.__resizeTrigger__
    if (!trigger || !trigger.__resizeListeners__) return
    // Walk a copy, so a listener that unbinds itself doesn't shift the next
    // one out of the walk, and skip any binding removed earlier in this
    // frame, as addEventListener does.
    trigger.__resizeListeners__.slice().forEach(function (binding) {
      if (!binding.removed) {
        binding.fn.call(trigger, e)
      }
    })
  })
}

// Makes a static element relative, so the sensor can cover it, and saves the
// inline position to restore. Returns false when the element has no computed
// position yet, as outside the document.
function positionForSensor(element: ResizeElement): boolean {
  const position = getComputedStyle(element).position
  if (position === "static") {
    element.__resizePosition__ = element.style.position
    element.style.position = "relative"
  }
  return position !== ""
}

function objectLoad(this: GlobalEventHandlers) {
  const obj = this as SensorObject
  const view = obj.contentDocument!.defaultView as Window & ResizeEventTarget
  obj.__resizeView__ = view
  view.__resizeTrigger__ = obj.__resizeElement__
  view.addEventListener("resize", resizeListener)
  if (obj.__resizeCheckPosition__) {
    positionForSensor(obj.__resizeElement__!)
  }
}

// Adds the hidden <object> whose window fires `resize` when the element
// changes size, after making a static element relative so it can cover it.
function attachSensor(element: ResizeElement): void {
  const isIE =
    typeof navigator !== "undefined" && /Trident|Edge/.test(navigator.userAgent)
  const obj = document.createElement("object") as SensorObject
  obj.__resizeCheckPosition__ = !positionForSensor(element)
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
  // IE and EdgeHTML need the object in the document before its data is set.
  if (isIE) {
    element.appendChild(obj)
  }
  obj.data = "about:blank"
  if (!isIE) {
    element.appendChild(obj)
  }
}

function addListener(target: Element, fn: ResizeListener): void {
  // Always the global document at call time, whatever `this` the call has,
  // so the module can load before a window exists (SSR, workers).
  const element = target as ResizeElement
  if (!element.__resizeListeners__) {
    element.__resizeListeners__ = []
    if ((document as LegacyDocument).attachEvent) {
      element.__resizeTrigger__ = element
      element.attachEvent!("onresize", resizeListener)
    } else {
      attachSensor(element)
    }
  }
  element.__resizeListeners__.push({ fn })
}

function removeListener(target: Element, fn?: ResizeListener): void {
  const element = target as ResizeElement
  const attachEvent = (document as LegacyDocument).attachEvent
  let listeners = element.__resizeListeners__ || []
  if (fn) {
    for (let index = 0; index < listeners.length; index++) {
      if (listeners[index].fn === fn) {
        listeners[index].removed = true
        listeners.splice(index, 1)
        break
      }
    }
  } else {
    listeners.forEach(function (binding) {
      binding.removed = true
    })
    listeners = element.__resizeListeners__ = []
  }
  if (!listeners.length) {
    if (attachEvent) {
      element.detachEvent!("onresize", resizeListener)
    } else if (element.__resizeTrigger__) {
      const trigger = element.__resizeTrigger__ as SensorObject
      // The detached sensor's window never fires again, but a frame it
      // already requested must find nothing to call.
      if (trigger.__resizeView__) {
        delete trigger.__resizeView__.__resizeTrigger__
      }
      // Other code may have removed the sensor already (el.innerHTML = "").
      if (trigger.parentNode) {
        trigger.parentNode.removeChild(trigger)
      }
      // Put the position back, unless the caller changed it meanwhile.
      if (element.__resizePosition__ !== undefined) {
        if (element.style.position === "relative") {
          element.style.position = element.__resizePosition__
        }
        delete element.__resizePosition__
      }
    }
    delete element.__resizeListeners__
  }
}

const elementResizeEvent = addListener as ElementResizeEvent

elementResizeEvent.unbind = removeListener as ElementResizeEvent["unbind"]

export = elementResizeEvent
