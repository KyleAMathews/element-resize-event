import { afterEach, describe, expect, it, vi } from "vitest"
import type ElementResizeEvent from "../dist/index.js"
// Test the built CommonJS file that is published: load it as text and
// evaluate it with a CommonJS-style `module` object. `pnpm test` builds first.
import source from "../dist/index.js?raw"

function load(): typeof ElementResizeEvent {
  const module = { exports: {} }
  new Function("module", "exports", source)(module, module.exports)
  return module.exports as typeof ElementResizeEvent
}

const elementResizeEvent = load()

function createElement(style = "width: 100px; height: 100px;") {
  const element = document.createElement("div")
  element.setAttribute("style", style)
  document.body.appendChild(element)
  return element
}

type Sensor = HTMLObjectElement & {
  contentDocument:
    (Document & { defaultView: { __resizeTrigger__?: Element } }) | null
}
type Bound = HTMLElement & { __resizeListeners__?: unknown }

function sensorOf(element: Element) {
  return element.querySelector<Sensor>("object.resize-sensor")
}

// Wait until the sensor <object> has loaded and attached its resize listener.
async function waitForSensor(element: Element) {
  await expect
    .poll(
      () => sensorOf(element)?.contentDocument?.defaultView?.__resizeTrigger__
    )
    .toBe(element)
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("elementResizeEvent", () => {
  it("calls the listener when the element resizes", async () => {
    const element = createElement()
    const listener = vi.fn()

    elementResizeEvent(element, listener)
    await waitForSensor(element)

    element.style.width = "200px"

    await expect.poll(() => listener.mock.calls.length).toBeGreaterThan(0)
    expect(listener.mock.contexts[0]).toBe(element)
  })

  it("calls every bound listener", async () => {
    const element = createElement()
    const first = vi.fn()
    const second = vi.fn()

    elementResizeEvent(element, first)
    elementResizeEvent(element, second)
    await waitForSensor(element)

    element.style.height = "300px"

    await expect.poll(() => first.mock.calls.length).toBeGreaterThan(0)
    await expect.poll(() => second.mock.calls.length).toBeGreaterThan(0)
  })

  it("adds one hidden, unfocusable sensor per element", () => {
    const element = createElement()

    elementResizeEvent(element, () => {})
    elementResizeEvent(element, () => {})

    const sensors = element.querySelectorAll("object.resize-sensor")
    expect(sensors).toHaveLength(1)
    expect(sensors[0].getAttribute("tabindex")).toBe("-1")
    expect(sensors[0].getAttribute("title")).toBe("")
  })

  it("makes statically positioned elements relative", () => {
    const element = createElement()
    elementResizeEvent(element, () => {})
    expect(element.style.position).toBe("relative")
  })

  it("leaves non-static positioning alone", () => {
    const element = createElement("position: absolute; width: 100px;")
    elementResizeEvent(element, () => {})
    expect(element.style.position).toBe("absolute")
  })
})

describe("unbind", () => {
  it("removes only the given listener", async () => {
    const element = createElement()
    const kept = vi.fn()
    const removed = vi.fn()

    elementResizeEvent(element, kept)
    elementResizeEvent(element, removed)
    await waitForSensor(element)

    elementResizeEvent.unbind(element, removed)
    element.style.width = "250px"

    await expect.poll(() => kept.mock.calls.length).toBeGreaterThan(0)
    expect(removed).not.toHaveBeenCalled()
    expect(sensorOf(element)).not.toBeNull()
  })

  it("removes the sensor when the last listener is removed", async () => {
    const element = createElement()
    const listener = vi.fn()

    elementResizeEvent(element, listener)
    await waitForSensor(element)
    elementResizeEvent.unbind(element, listener)

    expect(sensorOf(element)).toBeNull()
    expect((element as Bound).__resizeListeners__).toBeUndefined()
  })

  it("removes all listeners and the sensor when called without a listener", async () => {
    const element = createElement()

    elementResizeEvent(element, () => {})
    elementResizeEvent(element, () => {})
    await waitForSensor(element)
    elementResizeEvent.unbind(element)

    expect(sensorOf(element)).toBeNull()
    expect((element as Bound).__resizeListeners__).toBeUndefined()
  })

  it("does not throw for elements with nothing bound", () => {
    const element = createElement()
    expect(() => elementResizeEvent.unbind(element)).not.toThrow()
    expect(() => elementResizeEvent.unbind(element, () => {})).not.toThrow()
  })

  it("does not throw for a listener that was never bound", () => {
    const element = createElement()
    elementResizeEvent(element, () => {})
    expect(() => elementResizeEvent.unbind(element, () => {})).not.toThrow()
    expect(sensorOf(element)).not.toBeNull()
  })

  it("can rebind after unbinding", async () => {
    const element = createElement()
    const listener = vi.fn()

    elementResizeEvent(element, listener)
    elementResizeEvent.unbind(element, listener)
    elementResizeEvent(element, listener)
    await waitForSensor(element)

    element.style.width = "150px"

    await expect.poll(() => listener.mock.calls.length).toBeGreaterThan(0)
  })
})
