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
pnpm typecheck
pnpm lint
pnpm format
pnpm build:example                     # rebuild example/bundle.js for index.html
```

The source is `src/index.ts`. It compiles to ES5 CommonJS so the package keeps
working in old browsers; `pnpm check:es5` verifies the output. The tests run
against the built `dist/index.js`, which is the file that gets published.

### Releasing

```sh
pnpm version patch   # or minor / major
git push --follow-tags origin master
pnpm publish        # builds dist/ via prepack
```
