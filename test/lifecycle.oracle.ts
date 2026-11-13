/**
 * This oracle owns the listener lifecycle of `elementResizeEvent`: which
 * listeners are called on each animation frame after an element resizes, as
 * listeners are bound and unbound, including from inside a listener. It
 * checks every listener call, and each element's sensor count after every
 * step and inside every call. It owns `src/index.ts`.
 *
 * ```js
 * elementResizeEvent(el, f) // el resizes, then a frame → f.call(el, resizeEvent), once
 * unbind(el, f) // → f is not called again, even later in the same frame; others still are
 * unbind(el) // → nothing bound to el is called again, even later in the same frame
 * elementResizeEvent(el, f) // → one object.resize-sensor in el while anything is bound, none after
 * unbind(el, neverBound) // → returns
 * ```
 *
 * Why would a listener that unbinds itself change whether the next listener
 * hears about a resize? It must not, but removing an entry from the list that
 * a frame is walking moves every later entry down one place, so a walk by
 * index steps over the next one.
 *
 * Three parts make the timing matter. The sensor is the hidden `<object>`
 * whose window fires `resize` when the element changes size; the resizes it
 * saw belong to it, and go when it goes. The frame is the animation frame
 * that delivers those resizes, so several resizes before one frame give one
 * call. The turn is an element's share of a frame: the bindings it had when
 * the turn began, in bind order, each called if it is still bound when the
 * turn reaches it.
 *
 * Delivery: for every element with a loaded sensor, every frame after one or
 * more resizes seen by its current sensor calls each of its bindings exactly
 * once, in bind order, with `this` set to the element ("Inside the listener,
 * `this` is the element that resized", README) and one of those resize
 * events as the argument; an element that did not resize gets no call,
 * except one allowed call when a static element bound outside the document
 * is added and its sensor is sized (decision by Kyle Mathews, GitHub
 * KyleAMathews, 2026-11-13). When
 * the last binding goes, so do the sensor and the resizes it saw, and a
 * listener bound afterwards hears only what its own sensor sees. A binding
 * made during its element's turn is first called on the next resize, even
 * when it binds a function that the turn had already unbound; one made
 * before an element's turn is called in that turn. Decision by Kyle Mathews
 * (GitHub KyleAMathews), 2026-11-12: those last two rules. Unbind one: for
 * every bound `f`, after `unbind(el, f)` that binding is never called again,
 * even later in a frame under way, and every other binding is still called
 * ("Pass the listener to remove just that one", README). Unbind all: after
 * `unbind(el)`, none of el's listeners is called again, even later in the
 * current frame, and other elements are unaffected. One sensor: an element
 * holds exactly one `object.resize-sensor` while it has a binding, and none
 * once its last binding is gone, unless other code removed it; binding again
 * works like the first time. No throw: `unbind` returns for an element with
 * nothing bound, for a listener that was never bound, and after other code
 * removed the sensor. When delivery breaks, a caller misses a
 * resize it was owed; when an unbind law breaks, a torn-down handler runs.
 *
 * The model is a step function over the bindings, the loaded sensors, and the
 * resizes each sensor saw since its element's last turn. The order in which
 * elements take their turns in one frame is not promised, so for a frame with
 * several resized elements the model gives one outcome per order, and the
 * check accepts the trace when some chain of allowed outcomes explains the
 * whole history; reach counts only the states that chain enters. Each law
 * reads its own observations: delivery and the unbind laws the calls, one
 * sensor the sensor counts against the caller's own record of what it bound,
 * and no throw the errors, so a defect under one law cannot hide another.
 * Histories bind and unbind four listeners on three elements, load sensors,
 * resize, and run frames. Each listener, when called, may unbind itself,
 * unbind its whole element, unbind a listener or element elsewhere, or bind
 * a listener anywhere. The driver runs the library against the fake browser
 * in `fake-browser.ts`, in which it decides when sensors load, when a
 * sensor's window fires `resize`, and when a frame runs the animation-frame
 * callbacks. It records each listener call, every error, and each element's
 * sensor count.
 *
 * Limits. The fake browser stands in for layout: whether a real resize fires
 * `resize` is the browser suite's job (test/index.test.ts). A sensor loads
 * when its `data` is set and its element is in the document; elements may be
 * bound before they are added, and a removed `<object>` loses its document,
 * as in Chromium. Resizes come only from the history's resize steps,
 * and only while the element's sensor is loaded; one caused from inside a
 * listener would arrive at a later rendering step, which a later frame
 * stands for. Histories never bind a function already bound to that element
 * and never throw from a listener: the library does not define those cases.
 * Other code may empty the element and remove its sensor: no resize reaches
 * it after that, and `unbind` still returns and cleans up, so binding again
 * works like a first bind (decision by Kyle Mathews, GitHub KyleAMathews,
 * 2026-11-13). The fake has no `attachEvent` and
 * is not old IE or Edge, so those paths are not exercised. What the sensor
 * does to the element is `sensor.oracle.ts`'s, and loading and the receiver
 * of a call are `loading.oracle.ts`'s.
 */
import { oracleProperty, pass, violation } from "@tanstack/oracles"
import type { Observation, Verdict } from "@tanstack/oracles"
import fc from "fast-check"
import elementResizeEvent from "../src/index"
import {
  createFakeBrowser,
  errorData,
  FakeElement,
  sensorsOf,
} from "./fake-browser"
import type { Handler } from "./fake-browser"

// ---------------------------------------------------------------------------
// The history grammar
// ---------------------------------------------------------------------------

const ELEMENTS = 3
const LISTENERS = 4
const MAX_ACTIONS = 30

/** What a listener does each time it is called, besides being recorded. */
type BehaviorKind =
  | "none"
  | "unbindSelf" // unbind(this, itself)
  | "unbindAllOwn" // unbind(this)
  | "unbindOther" // unbind(elements[el], listeners[fn])
  | "unbindAllOf" // unbind(elements[el])
  | "bindOther" // elementResizeEvent(elements[el], listeners[fn]), unless bound
interface Behavior {
  kind: BehaviorKind
  el: number
  fn: number
}
type ActionKind =
  | "attach"
  | "bind"
  | "unbindOne"
  | "unbindAll"
  | "load"
  | "resize"
  | "frame"
  | "removeSensor" // other code empties the element (el.innerHTML = "")
interface Action {
  kind: ActionKind
  el: number
  fn: number
}
interface History {
  behaviors: Behavior[]
  /** Which elements start outside the document, until an attach step. */
  detached: boolean[]
  actions: Action[]
}

const behaviorArbitrary = fc.record({
  kind: fc.constantFrom<BehaviorKind>(
    "none",
    "unbindSelf",
    "unbindAllOwn",
    "unbindOther",
    "unbindAllOf",
    "bindOther"
  ),
  el: fc.integer({ min: 0, max: ELEMENTS - 1 }),
  fn: fc.integer({ min: 0, max: LISTENERS - 1 }),
})

// Loads, resizes, and frames are weighted up: a resize counts only once its
// sensor has loaded, and a frame is where the laws are owed.
const actionArbitrary = fc.record({
  kind: fc.oneof(
    { weight: 4, arbitrary: fc.constant<ActionKind>("bind") },
    { weight: 2, arbitrary: fc.constant<ActionKind>("unbindOne") },
    { weight: 1, arbitrary: fc.constant<ActionKind>("unbindAll") },
    { weight: 3, arbitrary: fc.constant<ActionKind>("load") },
    { weight: 1, arbitrary: fc.constant<ActionKind>("attach") },
    { weight: 1, arbitrary: fc.constant<ActionKind>("removeSensor") },
    { weight: 4, arbitrary: fc.constant<ActionKind>("resize") },
    { weight: 3, arbitrary: fc.constant<ActionKind>("frame") }
  ),
  el: fc.integer({ min: 0, max: ELEMENTS - 1 }),
  fn: fc.integer({ min: 0, max: LISTENERS - 1 }),
})

const historyArbitrary = fc.record({
  behaviors: fc.array(behaviorArbitrary, {
    minLength: LISTENERS,
    maxLength: LISTENERS,
  }),
  // Most elements start in the document; some are bound before they are.
  detached: fc.array(
    fc.oneof(
      { weight: 3, arbitrary: fc.constant(false) },
      { weight: 1, arbitrary: fc.constant(true) }
    ),
    { minLength: ELEMENTS, maxLength: ELEMENTS }
  ),
  actions: fc.array(actionArbitrary, { maxLength: MAX_ACTIONS }),
})

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** One concrete step. A resize carries the id of the event it fires. */
type Step =
  | { kind: "attach"; el: number }
  | { kind: "removeSensor"; el: number }
  | { kind: "bind" | "unbindOne"; el: number; fn: number }
  | { kind: "unbindAll"; el: number }
  | { kind: "load" }
  | { kind: "resize"; el: number; event: number }
  | { kind: "frame" }
interface Plan {
  behaviors: Behavior[]
  detached: boolean[]
  steps: Step[]
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/**
 * Model-only state. `bound` is each element's bindings in bind order (the
 * library's listener list). `loaded` is whether the element's current sensor
 * has loaded. `pending` is the ids of the resize events that sensor saw since
 * the element's last turn. `removed` says how each binding was last removed,
 * so the check can name the law a late call breaks.
 */
interface State {
  bound: number[][]
  attached: boolean[]
  loaded: boolean[]
  /** Whether other code removed the element's sensor while it is bound. */
  orphaned: boolean[]
  pending: number[][]
  removed: Record<string, "one" | "all">
}

interface ExpectedCall {
  checkpoint: "call"
  el: number
  fn: number
  /** The resize events the call may carry: any seen since the last turn. */
  events: number[]
  /** Whether an `unbind(el, f)` or an `unbind(el)` ran earlier in this frame. */
  afterUnbindOne: boolean
  afterUnbindAll: boolean
  removed: Record<string, "one" | "all">
}
/** The end of a step. Sensor counts are the one-sensor law's, not the model's. */
interface ExpectedSensors {
  checkpoint: "sensors"
  removed: Record<string, "one" | "all">
}
type Entry = ExpectedCall | ExpectedSensors

/** One allowed outcome of a step: what is observed, and the state it leaves. */
interface Outcome {
  entries: Entry[]
  state: State
  /** The declared states this outcome enters. */
  reached: string[]
}
interface Alternative {
  entries: Entry[]
  to: number
  reached: string[]
}
interface Expected {
  /** For each step, the allowed outcomes from each possible state id. */
  steps: Array<Record<number, Alternative[]>>
}

const key = (el: number, fn: number) => `${el}:${fn}`

function initialState(detached: boolean[]): State {
  return {
    bound: Array.from({ length: ELEMENTS }, () => []),
    attached: detached.map(out => !out),
    orphaned: Array.from({ length: ELEMENTS }, () => false),
    loaded: Array.from({ length: ELEMENTS }, () => false),
    pending: Array.from({ length: ELEMENTS }, () => []),
    removed: {},
  }
}

function copy(state: State): State {
  return {
    bound: state.bound.map(list => list.slice()),
    attached: state.attached.slice(),
    orphaned: state.orphaned.slice(),
    loaded: state.loaded.slice(),
    pending: state.pending.map(list => list.slice()),
    removed: { ...state.removed },
  }
}

// A first binding brings a new sensor, which has not loaded yet.
function bind(state: State, el: number, fn: number) {
  if (state.bound[el].length === 0) state.loaded[el] = false
  state.bound[el].push(fn)
  delete state.removed[key(el, fn)]
}

// Delivery: the last unbind removes the sensor, and the resizes it saw.
function discardSensor(state: State, el: number) {
  state.loaded[el] = false
  state.pending[el] = []
  state.orphaned[el] = false
}

// Unbind one: one binding of `fn` leaves `el`; the sensor goes with the last.
function removeOne(state: State, el: number, fn: number) {
  const index = state.bound[el].indexOf(fn)
  if (index !== -1) {
    state.bound[el].splice(index, 1)
    state.removed[key(el, fn)] = "one"
  }
  if (state.bound[el].length === 0) discardSensor(state, el)
}

// Unbind all: every binding leaves `el`, and the sensor with them.
function removeAll(state: State, el: number) {
  for (const fn of state.bound[el]) state.removed[key(el, fn)] = "all"
  state.bound[el] = []
  discardSensor(state, el)
}

function stepEnd(state: State): ExpectedSensors {
  return { checkpoint: "sensors", removed: { ...state.removed } }
}

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      rest => [item, ...rest]
    )
  )
}

/**
 * One frame, with elements taking their turns in `order`. Each turn walks the
 * bindings the element had when its turn began, and calls each one that is
 * still bound when the walk reaches it (delivery, unbind one, unbind all).
 */
function frame(start: State, order: number[], behaviors: Behavior[]): Outcome {
  const reached = new Set<string>()
  const state = copy(start)
  const entries: Entry[] = []
  let afterUnbindOne = false
  let afterUnbindAll = false
  order.forEach((el, turn) => {
    const events = state.pending[el]
    state.pending[el] = []
    // Its sensor went earlier in this frame, and its resizes with it.
    if (events.length === 0) return
    if (events.length > 1) reached.add("coalesced-resizes")
    const walk = state.bound[el].slice()
    // Bindings of this element removed during the turn. Binding the same
    // function again makes a new binding, which this walk does not hold.
    const gone = new Set<number>()
    const noteGone = () => {
      for (const later of walk)
        if (!state.bound[el].includes(later)) gone.add(later)
    }
    walk.forEach((fn, position) => {
      if (gone.has(fn) || !state.bound[el].includes(fn)) return
      entries.push({
        checkpoint: "call",
        el,
        fn,
        events,
        afterUnbindOne,
        afterUnbindAll,
        removed: { ...state.removed },
      })
      const laterInWalk = (target: number) =>
        walk.slice(position + 1).some(later => later !== fn && later === target)
      const stillToRun = walk
        .slice(position + 1)
        .some(later => state.bound[el].includes(later))
      const behavior = behaviors[fn]
      switch (behavior.kind) {
        case "none":
          break
        case "unbindSelf":
          if (stillToRun) reached.add("self-unbind-before-later")
          removeOne(state, el, fn)
          afterUnbindOne = true
          break
        case "unbindAllOwn":
          if (stillToRun) reached.add("unbind-all-before-later")
          removeAll(state, el)
          afterUnbindAll = true
          break
        case "unbindOther":
          if (
            behavior.el === el &&
            laterInWalk(behavior.fn) &&
            state.bound[el].includes(behavior.fn)
          )
            reached.add("unbind-later-mid-frame")
          if (
            behavior.el !== el &&
            order.slice(turn + 1).includes(behavior.el) &&
            state.bound[behavior.el].includes(behavior.fn)
          )
            reached.add("cross-element-unbind-mid-frame")
          removeOne(state, behavior.el, behavior.fn)
          afterUnbindOne = true
          break
        case "unbindAllOf":
          if (
            behavior.el !== el &&
            order.slice(turn + 1).includes(behavior.el) &&
            state.bound[behavior.el].length > 0
          )
            reached.add("cross-element-unbind-mid-frame")
          removeAll(state, behavior.el)
          afterUnbindAll = true
          break
        case "bindOther":
          // Delivery: a binding made during its element's turn is not in
          // that turn's walk; one made before an element's turn is.
          if (state.bound[behavior.el].includes(behavior.fn)) break
          if (behavior.el === el && gone.has(behavior.fn))
            reached.add("rebound-mid-turn")
          if (behavior.el === el) reached.add("bind-mid-frame-own")
          else if (
            order.slice(turn + 1).includes(behavior.el) &&
            state.bound[behavior.el].length > 0
          )
            reached.add("bind-mid-frame-other")
          bind(state, behavior.el, behavior.fn)
          break
      }
      noteGone()
    })
  })
  state.bound.forEach((list, el) => {
    if (list.length === 0 && start.bound[el].length > 0)
      reached.add("last-unbound-mid-frame")
  })
  entries.push(stepEnd(state))
  return { entries, state, reached: [...reached] }
}

/** Whether `el` has nothing bound now, after something was bound before. */
const unboundBefore = (state: State, el: number) =>
  state.bound[el].length === 0 &&
  Object.keys(state.removed).some(k => k.startsWith(`${el}:`))

/** Whether removing `fns` from `el` empties it while its sensor saw a resize. */
const discards = (state: State, el: number, fns: number[]) =>
  state.pending[el].length > 0 &&
  state.bound[el].length > 0 &&
  state.bound[el].every(fn => fns.includes(fn))

/** The allowed outcomes of one step from one state. */
function outcomes(start: State, step: Step, behaviors: Behavior[]): Outcome[] {
  const reached = new Set<string>()
  const state = copy(start)
  switch (step.kind) {
    case "bind":
      if (
        state.bound[step.el].length === 0 &&
        Object.keys(state.removed).some(k => k.startsWith(`${step.el}:`))
      )
        reached.add("rebind-after-unbind")
      if (state.bound[step.el].length > 0 && state.pending[step.el].length > 0)
        reached.add("bind-after-resize")
      bind(state, step.el, step.fn)
      break
    case "unbindOne":
      if (!state.bound[step.el].includes(step.fn)) reached.add("unbind-unbound")
      if (unboundBefore(state, step.el)) reached.add("unbind-after-unbind")
      if (
        !state.loaded[step.el] &&
        state.bound[step.el].length === 1 &&
        state.bound[step.el][0] === step.fn
      )
        reached.add("unbind-before-load")
      if (discards(state, step.el, [step.fn]))
        reached.add("unbind-discards-resize")
      removeOne(state, step.el, step.fn)
      break
    case "unbindAll":
      if (state.bound[step.el].length === 0) reached.add("unbind-unbound")
      if (unboundBefore(state, step.el)) reached.add("unbind-after-unbind")
      if (!state.loaded[step.el] && state.bound[step.el].length > 0)
        reached.add("unbind-before-load")
      if (discards(state, step.el, state.bound[step.el]))
        reached.add("unbind-discards-resize")
      removeAll(state, step.el)
      break
    case "removeSensor":
      // The sensor is gone: no resize reaches the element until its last
      // binding goes and a bind brings a new sensor. A frame already
      // requested still delivers what the old sensor saw.
      if (state.bound[step.el].length > 0) {
        reached.add("sensor-removed-by-other-code")
        state.orphaned[step.el] = true
        state.loaded[step.el] = false
      }
      break
    case "attach":
      if (state.bound[step.el].length > 0 && !state.attached[step.el])
        reached.add("bound-before-attached")
      state.attached[step.el] = true
      break
    case "load":
      // A sensor loads once its element is in the document.
      state.bound.forEach((list, el) => {
        if (list.length > 0 && state.attached[el] && !state.orphaned[el])
          state.loaded[el] = true
      })
      break
    case "resize":
      state.pending[step.el].push(step.event)
      break
    case "frame": {
      const due = state.pending
        .map((events, el) => (events.length > 0 ? el : -1))
        .filter(el => el !== -1)
      return permutations(due).map(order => frame(state, order, behaviors))
    }
  }
  return [{ entries: [stepEnd(state)], state, reached: [...reached] }]
}

function model(plan: Plan): Expected {
  const ids = new Map<string, number>()
  const states: State[] = []
  const idOf = (state: State) => {
    const text = JSON.stringify(state)
    let id = ids.get(text)
    if (id === undefined) {
      id = states.length
      ids.set(text, id)
      states.push(state)
    }
    return id
  }
  let current = [idOf(initialState(plan.detached))]
  const steps: Array<Record<number, Alternative[]>> = []
  for (const step of plan.steps) {
    const table: Record<number, Alternative[]> = {}
    const next = new Set<number>()
    for (const id of current) {
      // Orders that give the same observations and state are one outcome;
      // it enters only the states that every one of them enters.
      const byText = new Map<string, Alternative>()
      for (const outcome of outcomes(states[id], step, plan.behaviors)) {
        const to = idOf(outcome.state)
        const text = JSON.stringify([outcome.entries, to])
        const known = byText.get(text)
        if (known)
          known.reached = known.reached.filter(name =>
            outcome.reached.includes(name)
          )
        else
          byText.set(text, {
            entries: outcome.entries,
            to,
            reached: outcome.reached,
          })
      }
      table[id] = [...byText.values()]
      for (const alternative of table[id]) next.add(alternative.to)
    }
    steps.push(table)
    current = [...next]
  }
  return { steps }
}

/**
 * Legality. The plan keeps only the actions whose outcome the laws decide in
 * every state the history can be in (the states differ only by the order of
 * turns in a frame), and ends with a frame, so every resize is owed a call.
 */
function resolve(history: History): Plan {
  const behaviors = history.behaviors
  const steps: Step[] = []
  let possible = [initialState(history.detached)]
  const push = (step: Step) => {
    steps.push(step)
    possible = possible.flatMap(state =>
      outcomes(state, step, behaviors).map(outcome => outcome.state)
    )
    const unique = new Map(
      possible.map(state => [JSON.stringify(state), state])
    )
    possible = [...unique.values()]
  }
  for (const action of history.actions) {
    const { el, fn } = action
    switch (action.kind) {
      case "bind":
        // Limit: binding a function already bound to the element.
        if (possible.some(state => state.bound[el].includes(fn))) break
        push({ kind: "bind", el, fn })
        break
      case "unbindOne":
        push({ kind: "unbindOne", el, fn })
        break
      case "unbindAll":
        push({ kind: "unbindAll", el })
        break
      case "attach":
        push({ kind: "attach", el })
        break
      case "removeSensor":
        push({ kind: "removeSensor", el })
        break
      case "load":
        push({ kind: "load" })
        break
      case "resize":
        // Limit: resizes only while the element's sensor is loaded.
        if (possible.every(state => state.loaded[el]))
          push({ kind: "resize", el, event: steps.length })
        break
      case "frame":
        push({ kind: "frame" })
        break
    }
  }
  push({ kind: "frame" })
  return { behaviors, detached: history.detached, steps }
}

// ---------------------------------------------------------------------------
// The driver: the real library in a fake browser
// ---------------------------------------------------------------------------

function driver(
  plan: Plan,
  observe: (checkpoint: string, value: unknown) => void
) {
  let at = -1
  const recordError = (where: string, error: unknown) =>
    observe("error", { step: at, where, ...errorData(error) })
  const browser = createFakeBrowser(recordError)
  browser.install()
  const elements = plan.detached.map(out => new FakeElement("", !out))
  const asElement = (index: number) => elements[index] as unknown as Element
  // What this caller has bound, by its own calls: a listener that binds
  // checks it, so it never binds a function twice to one element.
  const userBound = new Set<string>()
  const bind = (el: number, fn: number) => {
    userBound.add(key(el, fn))
    elementResizeEvent(asElement(el), listeners[fn])
  }
  // `this` goes to unbind as it came: a wrong `this` must not be corrected.
  const unbindThis = (target: unknown, fn?: number) => {
    const el = elements.indexOf(target as FakeElement)
    if (fn === undefined) {
      for (let other = 0; other < LISTENERS; other++)
        userBound.delete(key(el, other))
      elementResizeEvent.unbind(target as Element)
    } else {
      userBound.delete(key(el, fn))
      elementResizeEvent.unbind(target as Element, listeners[fn])
    }
  }
  const unbind = (el: number, fn?: number) => unbindThis(asElement(el), fn)
  // Each element's sensor count, beside whether the caller has it bound.
  // The elements whose sensor this caller removed while they were bound;
  // an element leaves the set when the caller's last binding on it goes.
  const orphaned = new Set<number>()
  const hasBinding = (el: number) =>
    Array.from({ length: LISTENERS }, (__, fn) => key(el, fn)).some(k =>
      userBound.has(k)
    )
  const sensorRecord = () => {
    for (const el of [...orphaned]) if (!hasBinding(el)) orphaned.delete(el)
    return {
      counts: elements.map(element => sensorsOf(element).length),
      bound: elements.map((_, el) => hasBinding(el)),
      orphaned: elements.map((_, el) => orphaned.has(el)),
    }
  }
  const listeners: Handler[] = plan.behaviors.map((behavior, fn) => {
    const listener: Handler = function (event) {
      const eventId =
        typeof event === "object" && event !== null && "eventId" in event
          ? (event as { eventId: unknown }).eventId
          : null
      observe("call", {
        el: elements.indexOf(this as FakeElement),
        fn,
        event: eventId,
        ...sensorRecord(),
      })
      try {
        switch (behavior.kind) {
          case "none":
            break
          case "unbindSelf":
            unbindThis(this, fn)
            break
          case "unbindAllOwn":
            unbindThis(this)
            break
          case "unbindOther":
            unbind(behavior.el, behavior.fn)
            break
          case "unbindAllOf":
            unbind(behavior.el)
            break
          case "bindOther":
            if (!userBound.has(key(behavior.el, behavior.fn)))
              bind(behavior.el, behavior.fn)
            break
        }
      } catch (error) {
        recordError("listener", error)
      }
    }
    return listener
  })
  try {
    plan.steps.forEach((step, index) => {
      at = index
      try {
        switch (step.kind) {
          case "bind":
            bind(step.el, step.fn)
            break
          case "unbindOne":
            unbind(step.el, step.fn)
            break
          case "unbindAll":
            unbind(step.el)
            break
          case "attach":
            elements[step.el].attached = true
            break
          case "removeSensor":
            for (const child of elements[step.el].childNodes.slice())
              elements[step.el].removeChild(child)
            if (
              elements[step.el].childNodes.length === 0 &&
              hasBinding(step.el)
            )
              orphaned.add(step.el)
            break
          case "load":
            browser.load(elements)
            break
          case "resize":
            browser.resize(elements[step.el], step.event)
            break
          case "frame":
            browser.frame()
            break
        }
      } catch (error) {
        recordError(step.kind, error)
      }
      observe("sensors", sensorRecord())
    })
  } finally {
    browser.restore()
  }
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

const DELIVERY = "delivery"
const UNBIND_ONE = "unbind one"
const UNBIND_ALL = "unbind all"
const ONE_SENSOR = "one sensor"
const NO_THROW = "no throw"

interface SensorRecord {
  counts: number[]
  bound: boolean[]
  orphaned: boolean[]
}
interface CallValue extends SensorRecord {
  el: number
  fn: number
  event: unknown
}

// Delivery and the unbind laws compare calls, and only calls: a step end
// matches any step end, so a sensor or error defect cannot hide a call one.
function matches(observation: Observation, entry: Entry | undefined) {
  if (!entry || observation.checkpoint !== entry.checkpoint) return false
  if (entry.checkpoint === "sensors") return true
  const call = observation.value as CallValue
  return (
    call.el === entry.el &&
    call.fn === entry.fn &&
    entry.events.includes(call.event as number)
  )
}

const describe = (entry: Entry | undefined) =>
  entry === undefined
    ? "nothing"
    : entry.checkpoint === "sensors"
      ? "the end of the step"
      : { el: entry.el, fn: entry.fn, event: entry.events }

interface Difference {
  /** Every law the difference breaks. */
  laws: string[]
  checkpoint: string
  difference: string
  values: { actual: unknown; expected: unknown }
}

/** The laws that the first difference between a segment and an outcome breaks. */
function diagnose(
  step: number,
  segment: ReadonlyArray<Observation>,
  entries: Entry[],
  at: number
): Difference {
  const observed = segment[at] as Observation | undefined
  const owed = entries[at]
  const call =
    observed?.checkpoint === "call" ? (observed.value as CallValue) : undefined
  const values = {
    actual: call
      ? { el: call.el, fn: call.fn, event: call.event }
      : "the end of the step",
    expected: describe(owed),
  }
  if (
    owed?.checkpoint === "call" &&
    !segment.slice(at).some(o => {
      const later = o.value as CallValue
      return (
        o.checkpoint === "call" && later.el === owed.el && later.fn === owed.fn
      )
    })
  )
    // A missing call breaks delivery, and the unbind laws too when an
    // unbind earlier in the frame should have left it alone.
    return {
      laws: [
        DELIVERY,
        ...(owed.afterUnbindOne ? [UNBIND_ONE] : []),
        ...(owed.afterUnbindAll ? [UNBIND_ALL] : []),
      ],
      checkpoint: "call",
      difference: `step ${step}: listener ${owed.fn} on element ${owed.el} was owed a call and was not called`,
      values,
    }
  if (call) {
    const how = owed?.removed[key(call.el, call.fn)]
    return {
      laws: [
        how === "one" ? UNBIND_ONE : how === "all" ? UNBIND_ALL : DELIVERY,
      ],
      checkpoint: "call",
      difference: how
        ? `step ${step}: listener ${call.fn} on element ${call.el} was called after it was unbound`
        : `step ${step}: a call that no resize owed, or with the wrong this, event, or order`,
      values,
    }
  }
  return {
    laws: [DELIVERY],
    checkpoint: "call",
    difference: `step ${step}: the step ended before an owed call`,
    values,
  }
}

/** Splits the calls and step ends of a trace into one segment per step. */
function segmentsOf(observations: ReadonlyArray<Observation>) {
  const segments: Observation[][] = []
  let segment: Observation[] = []
  for (const observation of observations) {
    if (
      observation.checkpoint !== "call" &&
      observation.checkpoint !== "sensors"
    )
      continue
    segment.push(observation)
    if (observation.checkpoint === "sensors") {
      segments.push(segment)
      segment = []
    }
  }
  return segments
}

/**
 * Walks the trace step by step through the allowed outcomes. Returns the
 * first difference no allowed outcome explains, and the states the matched
 * outcomes entered.
 */
function walkTrace(
  plan: Plan,
  observations: ReadonlyArray<Observation>,
  expected: Expected
): { difference?: Difference; reached: Set<string> } {
  const segments = segmentsOf(observations)
  const reached = new Set<string>()
  let current = new Set([0])
  for (let step = 0; step < plan.steps.length; step++) {
    const observed = segments[step] ?? []
    const next = new Set<number>()
    let best: { entries: Entry[]; at: number } | undefined
    let entered: string[] | undefined
    for (const id of current)
      for (const alternative of expected.steps[step][id]) {
        let at = 0
        while (
          at < observed.length &&
          matches(observed[at], alternative.entries[at])
        )
          at++
        if (at === observed.length && at === alternative.entries.length) {
          next.add(alternative.to)
          entered = entered
            ? entered.filter(name => alternative.reached.includes(name))
            : alternative.reached
        } else if (!best || at > best.at)
          best = { entries: alternative.entries, at }
      }
    if (next.size === 0 && best)
      return {
        difference: diagnose(step, observed, best.entries, best.at),
        reached,
      }
    for (const name of entered ?? []) reached.add(name)
    current = next
  }
  return { reached }
}

/** One sensor: at every record, one sensor where the caller has a binding (and the sensor was not removed by other code), none elsewhere. */
function sensorDifference(observations: ReadonlyArray<Observation>): Verdict {
  for (const [index, observation] of observations.entries()) {
    if (
      observation.checkpoint !== "sensors" &&
      observation.checkpoint !== "call"
    )
      continue
    const record = observation.value as SensorRecord
    // An element whose sensor other code removed has none until its last
    // binding goes; binding again after that brings one, as a first bind.
    const owed = record.bound.map((bound, el) =>
      bound && !record.orphaned[el] ? 1 : 0
    )
    if (JSON.stringify(record.counts) !== JSON.stringify(owed))
      return violation(
        observation.checkpoint,
        `observation ${index}: the number of object.resize-sensor children differs`,
        ONE_SENSOR,
        { actual: record.counts, expected: owed }
      )
  }
  return pass
}

const checkFor =
  (law: string) =>
  (
    plan: Plan,
    observations: ReadonlyArray<Observation>,
    expected: Expected
  ): Verdict => {
    if (law === NO_THROW) {
      const error = observations.find(o => o.checkpoint === "error")
      return error
        ? violation("error", "an elementResizeEvent call threw", NO_THROW, {
            actual: error.value,
            expected: "no error",
          })
        : pass
    }
    if (law === ONE_SENSOR) return sensorDifference(observations)
    const { difference } = walkTrace(plan, observations, expected)
    return difference && difference.laws.includes(law)
      ? violation(
          difference.checkpoint,
          difference.difference,
          law,
          difference.values
        )
      : pass
  }

// ---------------------------------------------------------------------------
// Constructed histories: each enters the state it names on every run
// ---------------------------------------------------------------------------

const none: Behavior = { kind: "none", el: 0, fn: 0 }
const act = (kind: ActionKind, el = 0, fn = 0): Action => ({ kind, el, fn })
const withBehaviors = (generated: History, first: Behavior[]): Behavior[] => [
  ...first,
  ...generated.behaviors.slice(first.length),
]
// Every element in the document from the start.
const inDocument = [false, false, false]
const threeOnElementZero = [
  act("bind", 0, 0),
  act("bind", 0, 1),
  act("bind", 0, 2),
  act("load"),
  act("resize", 0),
  act("frame"),
]

const constructed = [
  {
    name: "other code removes the sensor, then unbind and bind again",
    enters: ["sensor-removed-by-other-code"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [none, none]),
      detached: inDocument,
      actions: [
        act("bind", 0, 0),
        act("load"),
        act("removeSensor", 0),
        act("unbindOne", 0, 0),
        act("bind", 0, 1),
        act("load"),
        act("resize", 0),
        act("frame"),
      ],
    }),
  },
  {
    name: "bound before the element is in the document",
    enters: ["bound-before-attached"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [none]),
      detached: [true, false, false],
      actions: [
        act("bind", 0, 0),
        act("load"),
        act("attach", 0),
        act("load"),
        act("resize", 0),
        act("frame"),
      ],
    }),
  },
  {
    name: "a listener unbinds itself before a later one runs",
    enters: ["self-unbind-before-later"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [
        { kind: "unbindSelf", el: 0, fn: 0 },
        none,
        none,
      ]),
      detached: inDocument,
      actions: threeOnElementZero,
    }),
  },
  {
    name: "a listener unbinds its element before later ones run",
    enters: ["unbind-all-before-later"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [
        { kind: "unbindAllOwn", el: 0, fn: 0 },
        none,
        none,
      ]),
      detached: inDocument,
      actions: threeOnElementZero,
    }),
  },
  {
    name: "a listener unbinds a later listener",
    enters: ["unbind-later-mid-frame"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [
        { kind: "unbindOther", el: 0, fn: 2 },
        none,
        none,
      ]),
      detached: inDocument,
      actions: threeOnElementZero,
    }),
  },
  {
    name: "a listener unbinds another element's listener in the same frame",
    enters: ["cross-element-unbind-mid-frame"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [
        { kind: "unbindOther", el: 1, fn: 1 },
        none,
      ]),
      detached: inDocument,
      actions: [
        act("bind", 0, 0),
        act("bind", 1, 1),
        act("load"),
        act("resize", 0),
        act("resize", 1),
        act("frame"),
      ],
    }),
  },
  {
    name: "the only listener unbinds itself",
    enters: ["last-unbound-mid-frame"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [
        { kind: "unbindSelf", el: 0, fn: 0 },
      ]),
      detached: inDocument,
      actions: [act("bind", 0, 0), act("load"), act("resize", 0), act("frame")],
    }),
  },
  {
    name: "unbind before the sensor loads",
    enters: ["unbind-before-load"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [none]),
      detached: inDocument,
      actions: [
        act("bind", 0, 0),
        act("unbindOne", 0, 0),
        act("load"),
        act("frame"),
      ],
    }),
  },
  {
    name: "bind again after unbinding everything",
    enters: ["rebind-after-unbind"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [none, none, none]),
      detached: inDocument,
      actions: [
        act("bind", 0, 0),
        act("bind", 0, 1),
        act("load"),
        act("unbindAll", 0),
        act("bind", 0, 2),
        act("load"),
        act("resize", 0),
        act("frame"),
      ],
    }),
  },
  {
    name: "three resizes before one frame",
    enters: ["coalesced-resizes"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [none]),
      detached: inDocument,
      actions: [
        act("bind", 0, 0),
        act("load"),
        act("resize", 0),
        act("resize", 0),
        act("resize", 0),
        act("frame"),
      ],
    }),
  },
  {
    name: "a listener bound after a resize, before the frame",
    enters: ["bind-after-resize"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [none, none]),
      detached: inDocument,
      actions: [
        act("bind", 0, 0),
        act("load"),
        act("resize", 0),
        act("bind", 0, 1),
        act("frame"),
      ],
    }),
  },
  {
    name: "a resize, unbind(el), and a rebind before the frame",
    enters: ["unbind-discards-resize"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [none, none]),
      detached: inDocument,
      actions: [
        act("bind", 0, 0),
        act("load"),
        act("resize", 0),
        act("unbindAll", 0),
        act("bind", 0, 1),
        act("load"),
        act("frame"),
      ],
    }),
  },
  {
    name: "a listener unbinds a later one, and the next binds it again",
    enters: ["rebound-mid-turn"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [
        { kind: "unbindOther", el: 0, fn: 2 },
        { kind: "bindOther", el: 0, fn: 2 },
        none,
      ]),
      detached: inDocument,
      actions: [...threeOnElementZero, act("resize", 0), act("frame")],
    }),
  },
  {
    name: "a listener binds another listener to its own element",
    enters: ["bind-mid-frame-own"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [
        { kind: "bindOther", el: 0, fn: 1 },
        none,
      ]),
      detached: inDocument,
      actions: [
        act("bind", 0, 0),
        act("load"),
        act("resize", 0),
        act("frame"),
        act("resize", 0),
        act("frame"),
      ],
    }),
  },
  {
    name: "a listener binds to another element whose turn is still to come",
    enters: ["bind-mid-frame-other"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [
        { kind: "bindOther", el: 1, fn: 2 },
        none,
        none,
      ]),
      detached: inDocument,
      actions: [
        act("bind", 0, 0),
        act("bind", 1, 1),
        act("load"),
        act("resize", 0),
        act("resize", 1),
        act("frame"),
      ],
    }),
  },
  {
    name: "unbind again after unbinding everything",
    enters: ["unbind-after-unbind"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [none]),
      detached: inDocument,
      actions: [
        act("bind", 0, 0),
        act("load"),
        act("unbindAll", 0),
        act("unbindAll", 0),
        act("unbindOne", 0, 0),
      ],
    }),
  },
  {
    name: "unbind with nothing bound, and a listener never bound",
    enters: ["unbind-unbound"],
    build: (generated: History): History => ({
      behaviors: withBehaviors(generated, [none, none]),
      detached: inDocument,
      actions: [
        act("unbindAll", 0),
        act("unbindOne", 1, 0),
        act("bind", 0, 0),
        act("unbindOne", 0, 1),
      ],
    }),
  },
]

const histories = {
  arbitrary: historyArbitrary,
  states: constructed.flatMap(history => history.enters),
  constructed,
  runs: 100,
  fixedSeeds: [20261112],
}

// Reach follows the outcomes that explain the trace, so a state counts only
// when the turn order production took enters it.
const reached = (
  plan: Plan,
  trace: ReadonlyArray<Observation>,
  expected: Expected
) => walkTrace(plan, trace, expected).reached

// ---------------------------------------------------------------------------
// Calibrations: corrupted traces of clean histories
// ---------------------------------------------------------------------------

const lastCallIndex = (trace: ReadonlyArray<Observation>) =>
  trace.map(o => o.checkpoint).lastIndexOf("call")

/** Adds a call to `fn` on the element of the last call, right after it. */
function addCallAfterLast(trace: ReadonlyArray<Observation>, fn: number) {
  const index = lastCallIndex(trace)
  if (index === -1) return undefined
  const last = trace[index].value as CallValue
  return [
    ...trace.slice(0, index + 1),
    { checkpoint: "call", value: { ...last, fn } },
    ...trace.slice(index + 1),
  ]
}

const shared = {
  histories,
  resolve,
  model,
  reached,
  driver,
}

oracleProperty({
  ...shared,
  owns: ["src/index.ts"],
  id: "lifecycle.delivery",
  law: {
    statement:
      "For every element with a loaded sensor, every frame after one or more resizes seen by its current sensor calls each of its bindings exactly once, in bind order, with this set to the element and one of those resize events as the argument; an element that did not resize gets no call, except that a static element bound outside the document may get one call when it is added and its sensor is sized. When the last binding goes, the sensor and the resizes it saw go with it. A binding made during its element's turn is first called on the element's next resize; one made before an element's turn is called in that turn.",
    authority:
      'README, Usage ("Inside the listener, `this` is the element that resized"); test/index.test.ts "calls every bound listener"; commit e9b26c4 ("Handles case where request frame is not cancelled") for one call per frame; decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: resizes seen by a removed sensor are not delivered, and a binding made during its element\'s turn waits for the next resize; decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-13: an element bound outside the document is positioned when its sensor loads, and may get one call when it is added.',
    limits:
      "Layout is faked: a sensor's window fires resize when the driver says so, and only when the sensor covers a positioned element. The fake does not resize a sensor when its element's positioning changes, so the one call allowed when a static element bound outside the document is added is never generated; test/index.test.ts (\"elements outside the document\") covers it in Chromium. Resizes come only from the history's resize steps, never from inside a listener (in a browser those arrive at a later rendering step, which a later frame stands for), and only while the element's sensor is loaded. Listeners never throw, and other code removes a sensor only by emptying the element. A function is never bound twice to one element. The order of different elements' turns within one frame is left free.",
  },
  check: checkFor(DELIVERY),
  calibrations: [
    {
      name: "the call to the only listener goes missing",
      law: DELIVERY,
      history: { constructed: "three resizes before one frame" },
      corrupt: trace => {
        const index = lastCallIndex(trace)
        return index === -1 ? undefined : trace.filter((_, i) => i !== index)
      },
    },
  ],
})

oracleProperty({
  ...shared,
  owns: ["src/index.ts"],
  id: "lifecycle.unbind-one",
  law: {
    statement:
      "For every bound listener f, after unbind(el, f) that binding is never called again, even later in a frame under way, and every other binding is still called as delivery says.",
    authority:
      'README, Unbinding ("Pass the listener to remove just that one: unbind(element, listener)"); commit 314db43; decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: this holds for unbind called from inside a listener.',
    limits:
      "A function bound twice to one element is not generated, so which copy unbind removes is not checked.",
  },
  check: checkFor(UNBIND_ONE),
  calibrations: [
    {
      name: "the unbound later listener is called anyway",
      law: UNBIND_ONE,
      history: { constructed: "a listener unbinds a later listener" },
      corrupt: trace => addCallAfterLast(trace, 2),
    },
  ],
})

oracleProperty({
  ...shared,
  owns: ["src/index.ts"],
  id: "lifecycle.unbind-all",
  law: {
    statement:
      "For every element, after unbind(el) none of its listeners is called again, even later in the current frame, and other elements are unaffected.",
    authority:
      "README, Unbinding (unbind(element)); commit 314db43; decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: this holds for unbind called from inside a listener.",
    limits:
      "Calls to unbind made from other code between frames and from inside listeners are covered; calls from other event handlers are modeled as calls between steps.",
  },
  check: checkFor(UNBIND_ALL),
  calibrations: [
    {
      name: "a listener removed by unbind(el) is called after the rebind",
      law: UNBIND_ALL,
      history: { constructed: "bind again after unbinding everything" },
      corrupt: trace => addCallAfterLast(trace, 0),
    },
  ],
})

oracleProperty({
  ...shared,
  owns: ["src/index.ts"],
  id: "lifecycle.one-sensor",
  law: {
    statement:
      "For every history, an element holds exactly one object.resize-sensor while it has at least one binding and none once its last binding is removed; binding again works like a first bind.",
    authority:
      'test/index.test.ts: "adds one hidden, unfocusable sensor per element", "removes the sensor when the last listener is removed", "can rebind after unbinding".',
    limits:
      "Counted after each step and inside every listener call, against the caller's own record of what it bound. The sensor's attributes and the element's positioning are sensor.oracle.ts's.",
  },
  check: checkFor(ONE_SENSOR),
  calibrations: [
    {
      name: "a second sensor appears",
      law: ONE_SENSOR,
      history: { constructed: "unbind before the sensor loads" },
      corrupt: trace => {
        const index = trace.findIndex(o => o.checkpoint === "sensors")
        return trace.map((o, i) =>
          i === index
            ? {
                checkpoint: "sensors",
                value: { ...(o.value as SensorRecord), counts: [2, 0, 0] },
              }
            : o
        )
      },
    },
  ],
})

oracleProperty({
  ...shared,
  owns: ["src/index.ts"],
  id: "lifecycle.no-throw",
  law: {
    statement:
      "For every element, elementResizeEvent(el, f), unbind(el) and unbind(el, f) return without throwing, including when nothing is bound, f was never bound, or other code already removed the sensor, and so does every frame and sensor load.",
    authority:
      'test/index.test.ts: "does not throw for elements with nothing bound", "does not throw for a listener that was never bound"; decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-13: unbind after other code removed the sensor finishes its cleanup and returns, and binding again works like a first bind.',
    limits:
      "Other code removes the sensor only by emptying the element; moving the sensor elsewhere is not generated.",
  },
  check: checkFor(NO_THROW),
  calibrations: [
    {
      name: "unbind throws",
      law: NO_THROW,
      history: {
        constructed: "unbind with nothing bound, and a listener never bound",
      },
      corrupt: trace => [
        {
          checkpoint: "error",
          value: {
            step: 0,
            where: "unbindAll",
            name: "TypeError",
            message: "x",
          },
        },
        ...trace,
      ],
    },
  ],
})
