// Type-level tests for the published declarations (dist/index.d.ts).
// Checked by `pnpm typecheck`; never executed.
import elementResizeEvent = require("../dist/index.js")
import elementResizeEventDefault from "../dist/index.js"

declare const element: Element
declare const div: HTMLDivElement

// Usage accepted by @types/element-resize-event must keep compiling.
const anyCallback: () => any = () => {}
elementResizeEvent(element, anyCallback)
elementResizeEvent.unbind(element)
elementResizeEvent.unbind(element, anyCallback)

// ESM default import via interop.
elementResizeEventDefault(div, () => {})

// `this` is the element and the listener receives the event.
elementResizeEvent(div, function (event) {
  const width: number = this.offsetWidth
  const e: Event = event
  void width
  void e
})

// @ts-expect-error element is required
elementResizeEvent()
// @ts-expect-error listener is required
elementResizeEvent(element)
// @ts-expect-error element must be an Element
elementResizeEvent("not an element", () => {})
