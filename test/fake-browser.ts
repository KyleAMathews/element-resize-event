// A fake browser for the oracle files. It registers no tests. It stands in
// for the parts of a browser that `elementResizeEvent` touches, and lets the
// driver decide when a sensor loads, when its window fires `resize`, and when
// a frame runs the animation-frame callbacks.
//
// One rule stands in for layout. A sensor's window resizes with its element
// only when the sensor covers the element: `position: absolute` at
// `top: 0; left: 0` with `width` and `height` at 100%, inside an element whose
// computed position is not `static` (CSS 2.1 §10.1: an absolutely positioned
// box is laid out against its nearest positioned ancestor). A sensor that
// does not cover its element measures something else, so its resizes say
// nothing about the element, and the fake fires none.

export class FakeNode {
  parentNode: FakeElement | null = null
}

/**
 * A DOM element: children, inline style, a position from a stylesheet, and
 * whether it is in the document. An element outside the document has no
 * computed style (Chromium gives `position: ""`), no layout, and its
 * `<object>` children do not load.
 */
export class FakeElement extends FakeNode {
  readonly style = { position: "" }
  readonly childNodes: FakeNode[] = []
  constructor(
    readonly sheetPosition = "",
    public attached = true
  ) {
    super()
  }
  get computedPosition() {
    if (!this.attached) return ""
    return this.style.position || this.sheetPosition || "static"
  }
  appendChild(child: FakeNode) {
    if (child.parentNode) child.parentNode.removeChild(child)
    this.childNodes.push(child)
    child.parentNode = this
    return child
  }
  removeChild(child: FakeNode) {
    const index = this.childNodes.indexOf(child)
    if (index === -1) {
      const error = new Error(
        "The node to be removed is not a child of this node."
      )
      error.name = "NotFoundError"
      throw error
    }
    this.childNodes.splice(index, 1)
    child.parentNode = null
    // A removed <object> loses its document, as in Chromium.
    if (child instanceof FakeObject) child.contentDocument = null
    return child
  }
}

export type Handler = (this: unknown, event: unknown) => void

/** The window inside a sensor: it fires `resize` when told to. */
export class FakeSensorWindow {
  private readonly handlers: Handler[] = []
  addEventListener(type: string, handler: Handler) {
    if (type === "resize" && !this.handlers.includes(handler))
      this.handlers.push(handler)
  }
  removeEventListener(type: string, handler: Handler) {
    const index = this.handlers.indexOf(handler)
    if (type === "resize" && index !== -1) this.handlers.splice(index, 1)
  }
  dispatch(event: unknown) {
    for (const handler of this.handlers.slice()) handler.call(this, event)
  }
}

/** An `<object>`: attributes, and a document once it loads. */
export class FakeObject extends FakeNode {
  readonly attributes = new Map<string, string>()
  contentDocument: { defaultView: FakeSensorWindow } | null = null
  onload: Handler | null = null
  type = ""
  data = ""
  setAttribute(name: string, value: unknown) {
    this.attributes.set(name, String(value))
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }
}

/** The declarations of an inline style, by property, lowercased. */
export function styleDeclarations(text: string | null): Record<string, string> {
  const declarations: Record<string, string> = {}
  for (const part of (text ?? "").split(";")) {
    const colon = part.indexOf(":")
    if (colon === -1) continue
    const name = part.slice(0, colon).trim().toLowerCase()
    if (name)
      declarations[name] = part
        .slice(colon + 1)
        .trim()
        .toLowerCase()
  }
  return declarations
}

const zero = (value: string | undefined) => value === "0" || value === "0px"

/** The layout rule above: whether `sensor` measures `element`. */
export function covers(element: FakeElement, sensor: FakeObject) {
  const style = styleDeclarations(sensor.getAttribute("style"))
  return (
    element.computedPosition !== "static" &&
    style.position === "absolute" &&
    zero(style.top) &&
    zero(style.left) &&
    style.width === "100%" &&
    style.height === "100%"
  )
}

/** The `<object class="resize-sensor">` children of an element. */
export const sensorsOf = (element: FakeElement) =>
  element.childNodes.filter(
    (child): child is FakeObject =>
      child instanceof FakeObject &&
      child.getAttribute("class") === "resize-sensor"
  )

const GLOBALS = [
  "window",
  "document",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const

/**
 * The fake browser's globals, and the driver's controls over it. With
 * `navigator: false`, `install` also removes the global `navigator`, as in
 * Node before 21 and other environments without one.
 */
export function createFakeBrowser(
  onError: (where: string, error: unknown) => void,
  options: { navigator?: boolean } = {}
) {
  const document = {
    createElement: (tag: string) => {
      if (tag !== "object") throw new Error(`unexpected createElement(${tag})`)
      return new FakeObject()
    },
  }
  const window = { document }
  const callbacks = new Map<number, (time: number) => void>()
  let nextId = 1
  const fakes = {
    window,
    document,
    getComputedStyle: (element: FakeElement) => ({
      position: element.computedPosition,
    }),
    requestAnimationFrame: (callback: (time: number) => void) => {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    cancelAnimationFrame: (id: number) => {
      callbacks.delete(id)
    },
  }
  const names: ReadonlyArray<string> =
    options.navigator === false ? [...GLOBALS, "navigator"] : GLOBALS
  let saved: Array<PropertyDescriptor | undefined> | undefined
  return {
    window,
    /** Puts the fake's globals in place. */
    install() {
      saved = names.map(name =>
        Object.getOwnPropertyDescriptor(globalThis, name)
      )
      for (const name of GLOBALS)
        Object.defineProperty(globalThis, name, {
          value: fakes[name],
          configurable: true,
          writable: true,
        })
      if (options.navigator === false)
        delete (globalThis as Record<string, unknown>).navigator
    },
    /** Puts back whatever globals were there before `install`. */
    restore() {
      if (!saved) return
      const before = saved
      saved = undefined
      names.forEach((name, index) => {
        const descriptor = before[index]
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete (globalThis as Record<string, unknown>)[name]
      })
    },
    /** Loads every child `<object>` whose `data` is set and that has not loaded yet. */
    load(elements: FakeElement[]) {
      for (const element of elements)
        for (const child of element.attached ? element.childNodes.slice() : [])
          if (
            child instanceof FakeObject &&
            !child.contentDocument &&
            child.data
          ) {
            child.contentDocument = { defaultView: new FakeSensorWindow() }
            try {
              child.onload?.call(child, { type: "load" })
            } catch (error) {
              onError("sensor load", error)
            }
          }
    },
    /** The element changes size: each loaded `<object>` that covers it fires `resize`. */
    resize(element: FakeElement, eventId: number) {
      if (!element.attached) return
      for (const child of element.childNodes.slice())
        if (
          child instanceof FakeObject &&
          child.contentDocument &&
          covers(element, child)
        ) {
          const view = child.contentDocument.defaultView
          view.dispatch({ type: "resize", target: view, eventId })
        }
    },
    /** Runs the callbacks requested before this frame, as a browser does. */
    frame() {
      for (const id of [...callbacks.keys()]) {
        const callback = callbacks.get(id)
        if (!callback) continue
        callbacks.delete(id)
        try {
          callback(0)
        } catch (error) {
          onError("frame", error)
        }
      }
    },
  }
}

export const errorData = (error: unknown) =>
  error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "thrown", message: String(error) }
