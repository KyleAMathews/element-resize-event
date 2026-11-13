/**
 * This oracle owns loading the library and calling it from any receiver:
 * that the module loads with or without a global `window`, and that a call
 * works the same whatever `this` it is made with. It checks the load, one
 * bind, one resize, and one unbind for each case. It owns `src/index.ts`.
 *
 * ```js
 * require("element-resize-event") // → the function, with .unbind, with or without a window or navigator
 * elementResizeEvent(el, f) // → f.call(el, resizeEvent) after a resize, whatever `this` the call had
 * ({ ere: elementResizeEvent }).ere(el, f) // → the same, also when the module loaded before the window
 * unbind.call({ document: other }, el, f) // → the sensor goes, as with a plain call; `other` is never used
 * ```
 *
 * Why would calling the library as a method fail, when calling it plainly
 * works? A module that loads before the page's window exists cannot bind to
 * it, and a call that then takes its window from `this` finds the owner
 * object instead, which has no `document`.
 *
 * Two parts matter. The load is the first evaluation of the module, which
 * may happen on a server, in a worker, in Node before 21 (no `navigator`), or
 * before a test runner installs its DOM. The receiver is the `this` of a
 * call: `undefined` for a plain call, the window, an unrelated object, the
 * object the function hangs from as a method, or one of those carrying a
 * `document` of its own, which the call must not use.
 *
 * Loads anywhere: with or without a global `window`, and with or without a
 * global `navigator`, loading the library returns the function with its
 * `unbind` (README, Usage and "Unbinding The Event Listener"), and throws
 * nothing (commits 3e4d213, "Don't throw errors in non-browser
 * environments", which added the `navigator` guard, and 2b8abfe, "Avoid bug
 * where JS is loaded when/where window/document aren't defined"). Any
 * receiver: for every receiver, `elementResizeEvent(el, f)` and
 * `unbind(el, f)` behave as a plain call does, with the global document
 * present at call time (commits bbb3bb5, "Fix bug when `this` is not
 * `window`", and 131c4d6, "Assign this to window"). Decision by Kyle Mathews
 * (GitHub KyleAMathews), 2026-11-12: a method call after a load without a
 * window is covered. A caller who attaches the function to a framework
 * object and calls it there gets a TypeError when this breaks.
 *
 * The model is a pure function of the case: the load gives the function, the
 * bind adds one sensor, the resize gives one call with `this` set to the
 * element, and the unbind removes the sensor, with no error anywhere. The
 * histories enumerate every combination of window at load, navigator, and
 * receiver. The driver installs the fake browser of `fake-browser.ts` before
 * or after a fresh import of `src/index.ts`, then makes each call with the
 * case's receiver, and records the exports, every call, every error, and the
 * sensor count. A module that fails to load breaks both laws, since no call
 * can then be made.
 *
 * Limits. One element and one listener per case: sequences belong to
 * `lifecycle.oracle.ts`. The window at call time is the fake's; a page that
 * replaces its window between calls is not modeled. The module loaded is
 * `src/index.ts` through Vite, where the mutants apply; the published
 * `dist/index.js` is the browser suite's. Old IE and Trident/Edge paths are
 * not exercised, by decision of Kyle Mathews (GitHub KyleAMathews),
 * 2026-11-12.
 */
import { oracleProperty, pass, violation } from "@tanstack/oracles"
import type { Observation, Verdict } from "@tanstack/oracles"
import { vi } from "vitest"
import type ElementResizeEvent from "../src/index"
import {
  createFakeBrowser,
  errorData,
  FakeElement,
  sensorsOf,
} from "./fake-browser"

/**
 * The receiver of each call. `decoy` is an object with a `document` of its
 * own, and `decoyMethod` the same object holding the function as a method:
 * a call must still use the global document, not the receiver's.
 */
type Receiver =
  "plain" | "window" | "object" | "method" | "decoy" | "decoyMethod"
interface Case {
  windowAtLoad: boolean
  navigator: boolean
  receiver: Receiver
}

const RECEIVERS: Receiver[] = [
  "plain",
  "window",
  "object",
  "method",
  "decoy",
  "decoyMethod",
]
const cases: Case[] = [false, true].flatMap(windowAtLoad =>
  [true, false].flatMap(navigator =>
    RECEIVERS.map(receiver => ({ windowAtLoad, navigator, receiver }))
  )
)

interface Expected {
  exports: { function: boolean; unbind: boolean }
  sensorsAfterBind: number
  calls: Array<{ thisIsElement: boolean; event: number }>
  sensorsAfterUnbind: number
}

// The model: every case owes the same result.
const model = (): Expected => ({
  exports: { function: true, unbind: true },
  sensorsAfterBind: 1,
  calls: [{ thisIsElement: true, event: 1 }],
  sensorsAfterUnbind: 0,
})

async function driver(
  plan: Case,
  observe: (checkpoint: string, value: unknown) => void
) {
  const browser = createFakeBrowser(
    (where, error) => observe("error", { where, ...errorData(error) }),
    { navigator: plan.navigator }
  )
  if (plan.windowAtLoad) browser.install()
  try {
    observe("reach", plan.windowAtLoad ? "with-window" : "without-window")
    observe("reach", `receiver-${plan.receiver}`)
    observe("reach", plan.navigator ? "with-navigator" : "without-navigator")
    vi.resetModules()
    let library: typeof ElementResizeEvent
    try {
      library = (await import("../src/index")).default
    } catch (error) {
      observe("error", { where: "module", ...errorData(error) })
      return
    }
    observe("exports", {
      function: typeof library === "function",
      unbind: typeof library?.unbind === "function",
    })
    if (!plan.windowAtLoad) browser.install()
    const element = new FakeElement()
    const asElement = element as unknown as Element
    const listener = function (this: unknown, event: unknown) {
      observe("call", {
        thisIsElement: this === element,
        event: (event as { eventId?: unknown } | undefined)?.eventId ?? null,
      })
    }
    // A document that must never be used: it has attachEvent, so a library
    // that read it would take the old IE path, and it cannot create elements.
    const decoyDocument = {
      attachEvent: () => {},
      createElement: () => {
        throw new Error("the receiver's document was used")
      },
    }
    const receivers = {
      plain: undefined,
      window: browser.window,
      object: {},
      decoy: { document: decoyDocument },
    }
    const bind = () =>
      plan.receiver === "method"
        ? { attach: library }.attach(asElement, listener)
        : plan.receiver === "decoyMethod"
          ? { attach: library, document: decoyDocument }.attach(
              asElement,
              listener
            )
          : library.call(receivers[plan.receiver], asElement, listener)
    const unbind = () =>
      plan.receiver === "method"
        ? { detach: library.unbind }.detach(asElement, listener)
        : plan.receiver === "decoyMethod"
          ? { detach: library.unbind, document: decoyDocument }.detach(
              asElement,
              listener
            )
          : library.unbind.call(receivers[plan.receiver], asElement, listener)
    const attempt = (where: string, run: () => void) => {
      try {
        run()
      } catch (error) {
        observe("error", { where, ...errorData(error) })
      }
    }
    attempt("bind", bind)
    observe("sensorsAfterBind", sensorsOf(element).length)
    attempt("load", () => browser.load([element]))
    attempt("resize", () => browser.resize(element, 1))
    attempt("frame", () => browser.frame())
    attempt("unbind", unbind)
    observe("sensorsAfterUnbind", sensorsOf(element).length)
  } finally {
    browser.restore()
  }
}

const LOADS = "loads anywhere"
const RECEIVER = "any receiver"

function check(
  _plan: Case,
  observations: ReadonlyArray<Observation>,
  expected: Expected,
  law: string
): Verdict {
  const loadError = observations.find(
    o =>
      o.checkpoint === "error" &&
      (o.value as { where: string }).where === "module"
  )
  // A module that did not load breaks both laws: no call could be made.
  if (loadError)
    return violation(
      "error",
      law === LOADS
        ? "loading the module threw"
        : "the module did not load, so no call behaved as a plain call",
      law,
      { actual: loadError.value, expected: "no error" }
    )
  const value = (checkpoint: string) =>
    observations.find(o => o.checkpoint === checkpoint)?.value
  if (law === LOADS) {
    const exports = value("exports")
    return JSON.stringify(exports) === JSON.stringify(expected.exports)
      ? pass
      : violation(
          "exports",
          "the module did not give the function with unbind",
          LOADS,
          {
            actual: exports,
            expected: expected.exports,
          }
        )
  }
  const actual = {
    errors: observations
      .filter(o => o.checkpoint === "error")
      .map(o => o.value),
    sensorsAfterBind: value("sensorsAfterBind"),
    calls: observations.filter(o => o.checkpoint === "call").map(o => o.value),
    sensorsAfterUnbind: value("sensorsAfterUnbind"),
  }
  const owed = {
    errors: [],
    sensorsAfterBind: expected.sensorsAfterBind,
    calls: expected.calls,
    sensorsAfterUnbind: expected.sensorsAfterUnbind,
  }
  return JSON.stringify(actual) === JSON.stringify(owed)
    ? pass
    : violation(
        "calls",
        "a call with this receiver did not behave as a plain call does",
        RECEIVER,
        { actual, expected: owed }
      )
}

const histories = {
  enumerated: cases,
  states: [
    "with-window",
    "without-window",
    "receiver-plain",
    "receiver-window",
    "receiver-object",
    "receiver-method",
    "receiver-decoy",
    "receiver-decoyMethod",
    "with-navigator",
    "without-navigator",
  ],
}
const label = (c: Case) =>
  `${c.windowAtLoad ? "window at load" : "no window at load"}, ${c.navigator ? "navigator" : "no navigator"}, ${c.receiver} receiver`

oracleProperty({
  id: "loading.loads-anywhere",
  owns: ["src/index.ts"],
  law: {
    statement:
      "With or without a global window, and with or without a global navigator, loading the library returns the function with its unbind and throws nothing.",
    authority:
      'Commits 3e4d213 ("Don\'t throw errors in non-browser environments", which added the navigator guard) and 2b8abfe ("Avoid bug where JS is loaded when/where window/document aren\'t defined"); the function and its unbind are the public API (README, Usage and "Unbinding The Event Listener"; the ElementResizeEvent type in src/index.ts).',
    limits:
      "The environment varies only in whether the fake's window and Node's navigator exist. The module loaded is src/index.ts through Vite, where the mutants apply; the published dist/index.js is the browser suite's (test/index.test.ts).",
  },
  histories,
  label,
  model,
  driver,
  check: (plan, observations, expected) =>
    check(plan, observations, expected, LOADS),
  calibrations: [
    {
      name: "the module loads without unbind",
      law: LOADS,
      history: { enumerated: 0 },
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === "exports"
            ? { ...o, value: { function: true, unbind: false } }
            : o
        ),
    },
  ],
})

oracleProperty({
  id: "loading.any-receiver",
  owns: ["src/index.ts"],
  law: {
    statement:
      "For every receiver (undefined, the window, an unrelated object, a method's owner, or either of those carrying a document of its own), elementResizeEvent(el, f) and unbind(el, f) behave as a plain call does, with the global document present at call time.",
    authority:
      'Commits bbb3bb5 ("Fix bug when `this` is not `window`") and 131c4d6 ("Assign this to window"); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: a method call after a load without a window is covered.',
    limits:
      "One bind, resize, and unbind per case, made with the same receiver. Old IE and Trident/Edge paths are not exercised (decision, 2026-11-12).",
  },
  histories,
  label,
  model,
  driver,
  check: (plan, observations, expected) =>
    check(plan, observations, expected, RECEIVER),
  calibrations: [
    {
      name: "the listener is called with the wrong this",
      law: RECEIVER,
      history: { enumerated: 12 },
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === "call"
            ? { ...o, value: { ...(o.value as object), thisIsElement: false } }
            : o
        ),
    },
  ],
})
