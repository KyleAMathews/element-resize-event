# element-resize-event

Library to make it easy to listen for element resize events

Code borrowed from a [blog post by
backalleycoder.com](http://www.backalleycoder.com/2013/03/18/cross-browser-event-based-element-resize-detection/).

## Install

`npm install element-resize-event` (or `pnpm add element-resize-event`)

## Dependencies

This library depends on the availability of `requestAnimationFrame` and `cancelAnimationFrame`

## Usage

```javascript
var elementResizeEvent = require("element-resize-event")

var element = document.getElementById("resize")

elementResizeEvent(element, function () {
  console.log("resized!")
  console.log(element.offsetWidth)
})
```

Inside the listener, `this` is the element that resized.

### Unbinding The Event Listener

```javascript
var unbind = require("element-resize-event").unbind

unbind(element)
```

Pass the listener to remove just that one: `unbind(element, listener)`.

### Details

- To measure the element, the library adds a hidden `<object class="resize-sensor">`
  to it, and makes a statically positioned element `position: relative`. The last
  `unbind` removes the sensor and puts the original `position` back, unless you
  changed it in the meantime.
- `unbind` is safe to call even if other code already removed the sensor (for
  example with `element.innerHTML = ""`). Binding again afterwards works as usual.
- Several resizes before an animation frame give one call per listener. Within
  that frame, a listener unbound by an earlier listener is not called, and a
  listener bound during its own element's turn is first called on the next resize.
- You can bind an element before it is in the document. It may get one call when
  it is added, when the sensor first measures it.

### TypeScript

Types are included. You no longer need `@types/element-resize-event`.

```ts
import elementResizeEvent from "element-resize-event"
// or: import elementResizeEvent = require("element-resize-event")
```

## Development

This repo uses [pnpm](https://pnpm.io). Run `corepack enable` once if you don't have it installed.

```sh
pnpm install
pnpm exec playwright install chromium  # first time only, for the browser tests
pnpm build                             # compile src/index.ts to dist/
pnpm test                              # build, then run tests in headless Chromium
pnpm test:oracles                      # quick pass/fail run of the oracles (what CI runs)
pnpm test:oracle-gaps                  # the oracles plus the gap check: use this when changing src/ or an oracle
pnpm typecheck
pnpm lint
pnpm format
pnpm build:example                     # rebuild example/bundle.js for index.html
```

The source is `src/index.ts`. It compiles to ES5 CommonJS so the package keeps
working in old browsers; `pnpm check:es5` verifies the output. The tests run
against the built `dist/index.js`, which is the file that gets published.

### Oracles

`test/*.oracle.ts` hold the library's promises as laws, checked by
[`@tanstack/oracles`](https://github.com/TanStack/oracles) over generated
histories in a fake browser (`test/fake-browser.ts`). `AGENTS.md` has the
rules for changing them.

### Releasing

```sh
pnpm version patch   # or minor / major
git push --follow-tags origin master
pnpm publish        # builds dist/ via prepack
```
