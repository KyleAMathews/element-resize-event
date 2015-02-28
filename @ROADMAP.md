
## Roadmap

1. Use https://github.com/chrisdickinson/raf to make fastdom better
2. Make https://github.com/wilsonpage/fastdom use rAF
    Reflows/layouts will occur whenever a change is made to the DOM.
    When you manipulate the DOM (change attributes, add/remove nodes) layout is 'invalidated'.
    Once this happens the browser will redraw the view at the end of the synchronous operation that caused it.
    But if you request geometric data (width, height, position, etc) from the DOM
    before the end of the synchronous operation, the browser will have to perform an
    early 'synchronous layout' to calculate the value you have requested.
    It is this scenario that we refer to as 'Layout Thrashing', and it is particularly costly.
    If you wrap your DOM operations in fastdom.read and fastdom.write, this will be avoided.
    Hope that makes sense :)
3. Use resize detector (which reads from DOM), using fastdom
    RESIZE DETECTOR
    https://github.com/wnr/element-resize-detector
    https://github.com/KyleAMathews/element-resize-event
    https://bitbucket.org/sparklinlabs/perfect-resize/src/25e54a13ddb98f4a6197855fbf755adb9f99fc2f/src/index.coffee?at=default
    https://github.com/dfcreative/resizable
    https://github.com/legomushroom/resize
    https://github.com/wnr/element-resize-detector
    https://github.com/nk-components/dom-fit
    But how does their performance compare?
    Are there more?
    Why is this problem not solved in 2015? :-(

4. => whenever an element resize is detected, a RESPONSIVE CLASS can be attached
   to the Element


5. Use http://interactjs.io/ (https://github.com/taye/interact.js)
    to TEST a Responsive Component
    https://github.com/dfcreative/resizable
