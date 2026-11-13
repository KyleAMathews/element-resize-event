/**
 * This oracle owns what binding does to the element itself: the sensor it
 * adds, and the element's inline `position`, checked after every bind,
 * unbind, and sensor load. It owns `src/index.ts#addListener` and
 * `src/index.ts#removeListener`.
 *
 * ```js
 * elementResizeEvent(el, f) // → one object.resize-sensor: tabindex -1, title "", opacity 0, pointer-events none, z-index -1
 * elementResizeEvent(el, f) // → el.style.position "relative", when el's computed position is static
 * elementResizeEvent(el, f) // → el.style.position unchanged, when el is already positioned
 * unbind(el) // → el.style.position back to what it was, once the last listener goes
 * ```
 *
 * Why does an element with no inline `position` become `relative`, but one
 * positioned by a stylesheet stay as it is? The library reads the computed
 * position, not the inline one: only a static element needs a positioned
 * box for the sensor to measure, and the stylesheet already gave the other
 * one.
 *
 * Two parts carry the promise. The sensor is the `<object>` that measures the
 * element: it must stay out of sight, out of the pointer's way, out of the
 * tab order, and unnamed for screen readers (an empty title), yet it must not use
 * `visibility: hidden` or `display: none`, since Firefox does not fire
 * `resize` in a hidden `<object>` (PR #31, Bugzilla 1430709). The saved
 * position is what the element's inline `position` was before the library
 * made it `relative`, and what the last unbind puts back.
 *
 * Footprint: for every element with a binding, each `<object>` child is an
 * `object.resize-sensor` with `tabindex="-1"` and `title=""`, styled
 * `opacity: 0; pointer-events: none; z-index: -1`, and neither
 * `visibility: hidden` nor `display: none`, and there is at least one
 * (test/index.test.ts, "adds one hidden, unfocusable sensor per element";
 * commits cb93a0e, a59cc50, 24238f9; PR #31). A sensor that breaks it steals
 * keyboard focus, is read out by a screen reader, shows a white box, or eats
 * clicks. Positioning: for every element, a bind that brings its sensor
 * changes a computed `static` position to an inline `relative`, and leaves
 * any other position, inline or from a stylesheet, as it was
 * (test/index.test.ts, "makes statically positioned elements relative",
 * "leaves non-static positioning alone"). An element outside the document
 * has no computed position yet, so its check waits until its sensor loads,
 * which happens once it is in the document. When its last binding goes, the
 * element's inline `position` is put back to what it was before, unless the
 * caller changed it from `relative` meanwhile. Decisions by Kyle Mathews
 * (GitHub KyleAMathews): the last unbind restores the position (2026-11-12);
 * only while it is still `relative`, and the check waits for the sensor to
 * load outside the document (2026-11-13). A caller whose layout depends on
 * the element staying static sees it change only while something listens.
 *
 * The model is a step function over each element's bindings and inline
 * position. Histories give three elements each an inline position (none,
 * `static`, `relative`, `absolute`, `fixed`, `sticky`) and a stylesheet
 * position (none, `absolute`, `relative`, `fixed`, `sticky`), and some start
 * outside the document; then they bind, unbind, load sensors, add elements to
 * the document, and set the inline position, bound or not.
 * The driver runs the library in the fake browser of `fake-browser.ts`, and
 * records each element's inline position and the attributes and style
 * declarations of each `<object>` child. Each law reads its own part of
 * every record: positioning the position, exactly, and footprint the
 * sensors. Opacity is compared as a CSS number or percentage (`0`, `0.0`,
 * `0%`); `z-index` takes an integer only, so `-1.0` is rejected, as a
 * browser computes it to `auto`.
 *
 * Limits. The sensor's covering geometry (absolute, at 0/0, 100% by 100%) is
 * not this oracle's: in the fake, a sensor without it hears no resizes, so
 * `lifecycle.oracle.ts`'s delivery law rejects it. How many sensors an
 * element holds is that oracle's too. A function is never bound twice to one
 * element. A caller who sets `relative` while bound looks the same as the
 * library's own `relative`, so the saved position is restored. A call that
 * throws breaks both laws, since neither result is
 * delivered. Old IE (`attachEvent`, which adds no sensor) and Trident or Edge
 * (which append the sensor before setting its `data`) are not exercised: by
 * decision of Kyle Mathews (GitHub KyleAMathews), 2026-11-12, those paths
 * stay a stated limit, and their gaps stay open.
 */
import { oracleProperty, pass, violation } from "@tanstack/oracles"
import type { Observation, Verdict } from "@tanstack/oracles"
import fc from "fast-check"
import elementResizeEvent from "../src/index"
import {
  createFakeBrowser,
  errorData,
  FakeElement,
  FakeObject,
  styleDeclarations,
} from "./fake-browser"

// ---------------------------------------------------------------------------
// The history grammar
// ---------------------------------------------------------------------------

const ELEMENTS = 3
const LISTENERS = 3
const INLINE = ["", "static", "relative", "absolute", "fixed", "sticky"]
const SHEET = ["", "absolute", "relative", "fixed", "sticky"]

/** `setInline` is the caller setting the inline position to INLINE[value]. */
type ActionKind =
  "bind" | "unbindOne" | "unbindAll" | "load" | "setInline" | "attach"
interface Action {
  kind: ActionKind
  el: number
  fn: number
  value: number
}
interface Start {
  inline: string
  sheet: string
  /** Whether the element starts outside the document, until an attach step. */
  detached: boolean
}
interface History {
  starts: Start[]
  actions: Action[]
}

const historyArbitrary = fc.record({
  starts: fc.array(
    fc.record({
      inline: fc.constantFrom(...INLINE),
      sheet: fc.constantFrom(...SHEET),
      detached: fc.oneof(
        { weight: 3, arbitrary: fc.constant(false) },
        { weight: 1, arbitrary: fc.constant(true) }
      ),
    }),
    { minLength: ELEMENTS, maxLength: ELEMENTS }
  ),
  actions: fc.array(
    fc.record({
      kind: fc.oneof(
        { weight: 4, arbitrary: fc.constant<ActionKind>("bind") },
        { weight: 2, arbitrary: fc.constant<ActionKind>("unbindOne") },
        { weight: 2, arbitrary: fc.constant<ActionKind>("unbindAll") },
        { weight: 2, arbitrary: fc.constant<ActionKind>("load") },
        { weight: 2, arbitrary: fc.constant<ActionKind>("setInline") },
        { weight: 1, arbitrary: fc.constant<ActionKind>("attach") }
      ),
      el: fc.integer({ min: 0, max: ELEMENTS - 1 }),
      fn: fc.integer({ min: 0, max: LISTENERS - 1 }),
      value: fc.integer({ min: 0, max: INLINE.length - 1 }),
    }),
    { maxLength: 20 }
  ),
})

// Legality: no function is bound twice to one element (not decided).
function resolve(history: History): History {
  const bound = history.starts.map(() => new Set<number>())
  const actions = history.actions.filter(action => {
    const set = bound[action.el]
    if (action.kind === "bind") {
      if (set.has(action.fn)) return false
      set.add(action.fn)
    }
    if (action.kind === "unbindOne") set.delete(action.fn)
    if (action.kind === "unbindAll") set.clear()
    return true
  })
  return { starts: history.starts, actions }
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/**
 * Model-only state, per element. `bound` is its bindings. `position` is its
 * inline position. `saved` is the saved position: the inline position before
 * the library made it relative, or null when the library did not.
 */
interface ElementState {
  bound: number[]
  position: string
  saved: string | null
  attached: boolean
  /** Whether its sensor has loaded. */
  loaded: boolean
  /** Bound outside the document: the static check waits for the sensor to load. */
  checkPending: boolean
}
interface Expected {
  /** After each step, each element's inline position and whether it is bound. */
  steps: Array<Array<{ position: string; bound: boolean }>>
  states: string[]
}

function model(plan: History): Expected {
  const reached = new Set<string>()
  // For reach only: the elements bound at some earlier step.
  const everBound = new Set<number>()
  const elements: ElementState[] = plan.starts.map(start => ({
    bound: [],
    position: start.inline,
    saved: null,
    attached: !start.detached,
    loaded: false,
    checkPending: false,
  }))
  // Outside the document an element has no computed position at all.
  const computed = (index: number) =>
    elements[index].attached
      ? elements[index].position || plan.starts[index].sheet || "static"
      : ""
  // Positioning: a static element becomes relative, any other stays.
  const check = (index: number) => {
    const state = elements[index]
    if (computed(index) === "static") {
      reached.add(state.position === "" ? "static-no-inline" : "static-inline")
      state.saved = state.position
      state.position = "relative"
    } else
      reached.add(
        state.position ? "positioned-inline" : "positioned-by-stylesheet"
      )
  }
  // Positioning: the last binding puts the saved position back, unless the
  // caller changed it from the library's relative in the meantime.
  const release = (state: ElementState) => {
    if (state.saved === null && state.position === "relative")
      reached.add("already-relative-kept")
    if (state.saved !== null) {
      if (state.position === "relative") {
        reached.add("restored-on-last-unbind")
        state.position = state.saved
      } else reached.add("kept-caller-position")
      state.saved = null
    }
    state.loaded = false
    state.checkPending = false
  }
  const steps = plan.actions.map(action => {
    const state = elements[action.el]
    switch (action.kind) {
      case "bind":
        // Positioning: a bind that brings the sensor makes a static element
        // relative, and leaves any other position alone.
        if (state.bound.length === 0) {
          if (state.attached) check(action.el)
          else {
            reached.add("bound-outside-document")
            state.checkPending = true
          }
          if (everBound.has(action.el)) reached.add("rebound")
        }
        everBound.add(action.el)
        state.bound.push(action.fn)
        break
      case "unbindOne":
        if (state.bound.includes(action.fn)) {
          state.bound = state.bound.filter(fn => fn !== action.fn)
          if (state.bound.length === 0) release(state)
        }
        break
      case "unbindAll":
        if (state.bound.length > 0) {
          state.bound = []
          release(state)
        }
        break
      case "load":
        // Sensors of bound elements in the document load; a check that
        // waited for this runs now (decision, 2026-11-13).
        elements.forEach((element, index) => {
          if (element.bound.length === 0 || !element.attached || element.loaded)
            return
          element.loaded = true
          if (element.checkPending) {
            reached.add("checked-on-load")
            element.checkPending = false
            check(index)
          }
        })
        break
      case "setInline":
        if (state.bound.length > 0) reached.add("repositioned-while-bound")
        else if (everBound.has(action.el))
          reached.add("repositioned-while-unbound")
        state.position = INLINE[action.value]
        break
      case "attach":
        state.attached = true
        break
    }
    return elements.map(e => ({
      position: e.position,
      bound: e.bound.length > 0,
    }))
  })
  return { steps, states: [...reached] }
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

function driver(
  plan: History,
  observe: (checkpoint: string, value: unknown) => void
) {
  let at = -1
  const browser = createFakeBrowser((where, error) =>
    observe("error", { step: at, where, ...errorData(error) })
  )
  browser.install()
  const elements = plan.starts.map(start => {
    const element = new FakeElement(start.sheet, !start.detached)
    element.style.position = start.inline
    return element
  })
  const asElement = (index: number) => elements[index] as unknown as Element
  const listeners = Array.from({ length: LISTENERS }, () => () => {})
  try {
    plan.actions.forEach((action, index) => {
      at = index
      try {
        switch (action.kind) {
          case "bind":
            elementResizeEvent(asElement(action.el), listeners[action.fn])
            break
          case "unbindOne":
            elementResizeEvent.unbind(
              asElement(action.el),
              listeners[action.fn]
            )
            break
          case "unbindAll":
            elementResizeEvent.unbind(asElement(action.el))
            break
          case "load":
            browser.load(elements)
            break
          case "setInline":
            elements[action.el].style.position = INLINE[action.value]
            break
          case "attach":
            elements[action.el].attached = true
            break
        }
      } catch (error) {
        observe("error", {
          step: index,
          where: action.kind,
          ...errorData(error),
        })
      }
      observe(
        "elements",
        elements.map(element => ({
          position: element.style.position,
          objects: element.childNodes
            .filter(child => child instanceof FakeObject)
            .map(object => ({
              class: object.getAttribute("class"),
              tabindex: object.getAttribute("tabindex"),
              title: object.getAttribute("title"),
              style: styleDeclarations(object.getAttribute("style")),
            })),
        }))
      )
    })
  } finally {
    browser.restore()
  }
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

const FOOTPRINT = "footprint"
const POSITIONING = "positioning"

interface ObservedObject {
  class: string | null
  tabindex: string | null
  title: string | null
  style: Record<string, string>
}
interface ObservedElement {
  position: string
  objects: ObservedObject[]
}

// Opacity takes a number or a percentage, so 0, 0.0, .0, and 0% are all 0.
// z-index takes an integer only: -1.0 is invalid and computes to auto.
const isZero = (value: string | undefined) =>
  value !== undefined &&
  /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?%?$/.test(value) &&
  Number.parseFloat(value) === 0

/** What a sensor owes, field by field; the first one it breaks. */
function footprintBreak(object: ObservedObject): string | undefined {
  const style = object.style
  if (object.class !== "resize-sensor") return "class is not resize-sensor"
  if (object.tabindex !== "-1") return "tabindex is not -1"
  if (object.title !== "") return 'title is not ""'
  if (!isZero(style.opacity)) return "opacity is not 0"
  if (style["pointer-events"] !== "none") return "pointer-events is not none"
  if (style["z-index"] !== "-1") return "z-index is not -1"
  if (style.visibility === "hidden") return "visibility is hidden"
  if (style.display === "none") return "display is none"
  return undefined
}

/** Each law reads its own observations over every step. */
function judge(
  plan: History,
  observations: ReadonlyArray<Observation>,
  expected: Expected,
  law: string
): Verdict {
  // A call that throws never delivers the result either law owes after it.
  const error = observations.find(o => o.checkpoint === "error")
  if (error)
    return violation("error", "a call threw", law, {
      actual: error.value,
      expected: "no error",
    })
  const steps = observations.filter(o => o.checkpoint === "elements")
  for (let step = 0; step < plan.actions.length; step++) {
    const observed = (steps[step]?.value ?? []) as ObservedElement[]
    for (let el = 0; el < ELEMENTS; el++) {
      const owed = expected.steps[step][el]
      const seen = observed[el]
      if (!seen) return violation("elements", `step ${step}: no record`, law)
      if (law === POSITIONING && seen.position !== owed.position)
        return violation(
          "elements",
          `step ${step}: element ${el} has inline position ${JSON.stringify(seen.position)}`,
          POSITIONING,
          { actual: seen.position, expected: owed.position }
        )
      if (law !== FOOTPRINT) continue
      if (owed.bound && seen.objects.length === 0)
        return violation(
          "elements",
          `step ${step}: bound element ${el} has no sensor`,
          FOOTPRINT,
          { actual: seen.objects, expected: "a sensor" }
        )
      for (const object of seen.objects) {
        const broken = footprintBreak(object)
        if (broken)
          return violation(
            "elements",
            `step ${step}: element ${el}'s sensor: ${broken}`,
            FOOTPRINT,
            { actual: object, expected: "the footprint" }
          )
      }
    }
  }
  return pass
}

const checkFor =
  (law: string) =>
  (
    plan: History,
    observations: ReadonlyArray<Observation>,
    expected: Expected
  ) =>
    judge(plan, observations, expected, law)

// ---------------------------------------------------------------------------
// Constructed histories
// ---------------------------------------------------------------------------

const act = (kind: ActionKind, el = 0, fn = 0, value = 0): Action => ({
  kind,
  el,
  fn,
  value,
})
const startsWith = (generated: History, first: Start[]): Start[] => [
  ...first,
  ...generated.starts.slice(first.length),
]

const constructed = [
  {
    name: "a static element with no inline position, bound and unbound",
    enters: ["static-no-inline", "restored-on-last-unbind"],
    build: (generated: History): History => ({
      starts: startsWith(generated, [
        { inline: "", sheet: "", detached: false },
      ]),
      actions: [act("bind"), act("load"), act("unbindOne")],
    }),
  },
  {
    name: "an element with an explicit static position, bound twice and unbound",
    enters: ["static-inline", "restored-on-last-unbind"],
    build: (generated: History): History => ({
      starts: startsWith(generated, [
        { inline: "static", sheet: "", detached: false },
      ]),
      actions: [
        act("bind", 0, 0),
        act("bind", 0, 1),
        act("load"),
        act("unbindOne", 0, 0),
        act("unbindAll", 0),
      ],
    }),
  },
  {
    name: "an inline absolute element and a stylesheet-relative element",
    enters: ["positioned-inline", "positioned-by-stylesheet"],
    build: (generated: History): History => ({
      starts: startsWith(generated, [
        { inline: "absolute", sheet: "", detached: false },
        { inline: "", sheet: "relative", detached: false },
      ]),
      actions: [
        act("bind", 0),
        act("bind", 1),
        act("load"),
        act("unbindAll", 0),
      ],
    }),
  },
  {
    name: "repositioned between bindings",
    enters: ["repositioned-while-unbound", "restored-on-last-unbind"],
    build: (generated: History): History => ({
      starts: startsWith(generated, [
        { inline: "", sheet: "", detached: false },
      ]),
      actions: [
        act("bind"),
        act("unbindAll"),
        act("setInline", 0, 0, INLINE.indexOf("absolute")),
        act("bind"),
        act("unbindAll"),
      ],
    }),
  },
  {
    name: "bound outside the document, then added",
    enters: [
      "bound-outside-document",
      "checked-on-load",
      "restored-on-last-unbind",
    ],
    build: (generated: History): History => ({
      starts: startsWith(generated, [
        { inline: "", sheet: "", detached: true },
      ]),
      actions: [
        act("bind"),
        act("load"),
        act("attach"),
        act("load"),
        act("unbindAll"),
      ],
    }),
  },
  {
    name: "positioned by a stylesheet, bound outside the document",
    enters: [
      "bound-outside-document",
      "checked-on-load",
      "positioned-by-stylesheet",
    ],
    build: (generated: History): History => ({
      starts: startsWith(generated, [
        { inline: "", sheet: "absolute", detached: true },
      ]),
      actions: [act("bind"), act("attach"), act("load"), act("unbindAll")],
    }),
  },
  {
    name: "repositioned by the caller while bound",
    enters: ["repositioned-while-bound", "kept-caller-position"],
    build: (generated: History): History => ({
      starts: startsWith(generated, [
        { inline: "", sheet: "", detached: false },
      ]),
      actions: [
        act("bind"),
        act("setInline", 0, 0, INLINE.indexOf("absolute")),
        act("unbindAll"),
      ],
    }),
  },
  {
    name: "repositioned before the sensor loads",
    enters: ["repositioned-while-bound", "static-no-inline"],
    build: (generated: History): History => ({
      starts: startsWith(generated, [
        { inline: "", sheet: "", detached: false },
      ]),
      actions: [
        act("bind"),
        act("setInline", 0, 0, INLINE.indexOf("static")),
        act("load"),
        act("unbindAll"),
      ],
    }),
  },
  {
    name: "an element already relative inline, bound and unbound",
    enters: ["already-relative-kept"],
    build: (generated: History): History => ({
      starts: startsWith(generated, [
        { inline: "relative", sheet: "", detached: false },
      ]),
      actions: [act("bind"), act("load"), act("unbindAll")],
    }),
  },
  {
    name: "bound again after the position was restored",
    enters: ["rebound"],
    build: (generated: History): History => ({
      starts: startsWith(generated, [
        { inline: "", sheet: "", detached: false },
      ]),
      actions: [act("bind"), act("unbindAll"), act("bind"), act("load")],
    }),
  },
]

const histories = {
  arbitrary: historyArbitrary,
  states: [...new Set(constructed.flatMap(history => history.enters))],
  constructed,
  runs: 100,
  fixedSeeds: [20261112],
}

const reached = (
  _plan: History,
  _trace: ReadonlyArray<Observation>,
  expected: Expected
) => expected.states

/** Replaces the first sensor record in the trace with `change(record)`. */
function corruptFirstSensor(
  trace: ReadonlyArray<Observation>,
  change: (object: ObservedObject) => ObservedObject
) {
  const index = trace.findIndex(
    o =>
      o.checkpoint === "elements" &&
      (o.value as ObservedElement[]).some(e => e.objects.length > 0)
  )
  if (index === -1) return undefined
  const value = (trace[index].value as ObservedElement[]).map(e =>
    e.objects.length > 0
      ? { ...e, objects: [change(e.objects[0]), ...e.objects.slice(1)] }
      : e
  )
  return trace.map((o, i) => (i === index ? { ...o, value } : o))
}

oracleProperty({
  id: "sensor.footprint",
  owns: ["src/index.ts#addListener", "src/index.ts#removeListener"],
  law: {
    statement:
      'For every element with a binding, each <object> child is an object.resize-sensor with tabindex="-1" and title="", styled opacity 0, pointer-events none, and z-index -1, and neither visibility: hidden nor display: none, and there is at least one.',
    authority:
      'test/index.test.ts "adds one hidden, unfocusable sensor per element"; commits cb93a0e (negative tabindex against keyboard focus), a59cc50 (empty title for screen readers), 24238f9 (opacity 0, issue #9); PR #31 discussion (visibility: hidden stops Firefox firing resize, Bugzilla 1430709).',
    limits:
      "The covering geometry is judged by lifecycle.oracle.ts's delivery law through the fake's layout rule; the number of sensors is its one-sensor law's. Opacity is compared as a CSS number or percentage; z-index as written, since -1.0 is invalid. Old IE and Trident/Edge paths are not exercised (decision, 2026-11-12).",
  },
  histories,
  resolve,
  model,
  reached,
  driver,
  check: checkFor(FOOTPRINT),
  calibrations: [
    {
      name: "the sensor joins the tab order",
      law: FOOTPRINT,
      difference: "tabindex",
      history: {
        constructed:
          "an inline absolute element and a stylesheet-relative element",
      },
      corrupt: trace =>
        corruptFirstSensor(trace, o => ({ ...o, tabindex: "0" })),
    },
    {
      name: "the sensor is hidden with visibility",
      law: FOOTPRINT,
      difference: "visibility",
      history: {
        constructed:
          "an inline absolute element and a stylesheet-relative element",
      },
      corrupt: trace =>
        corruptFirstSensor(trace, o => ({
          ...o,
          style: { ...o.style, visibility: "hidden" },
        })),
    },
  ],
})

oracleProperty({
  id: "sensor.positioning",
  owns: ["src/index.ts#addListener", "src/index.ts#removeListener"],
  law: {
    statement:
      "For every element, a bind that brings its sensor changes a computed static position to an inline relative and leaves any other position, inline or from a stylesheet, as it was; an element outside the document gets that check when its sensor loads. When its last binding goes, its inline position is put back to what it was before, unless the caller changed it from relative in the meantime.",
    authority:
      'test/index.test.ts "makes statically positioned elements relative", "leaves non-static positioning alone"; decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: the last unbind restores the position; decisions by Kyle Mathews (GitHub KyleAMathews), 2026-11-13: only while it is still relative, and an element bound outside the document is checked when its sensor loads.',
    limits:
      "A function is never bound twice to one element. Positions come from a fixed list of inline and stylesheet values. A caller who sets relative while bound is indistinguishable from the library's relative, so the saved position is restored.",
  },
  histories,
  resolve,
  model,
  reached,
  driver,
  check: checkFor(POSITIONING),
  calibrations: [
    {
      name: "a static element is left static",
      law: POSITIONING,
      history: {
        constructed:
          "a static element with no inline position, bound and unbound",
      },
      corrupt: trace => {
        const index = trace.findIndex(o => o.checkpoint === "elements")
        if (index === -1) return undefined
        const value = (trace[index].value as ObservedElement[]).map((e, i) =>
          i === 0 ? { ...e, position: "" } : e
        )
        return trace.map((o, i) => (i === index ? { ...o, value } : o))
      },
    },
  ],
})
