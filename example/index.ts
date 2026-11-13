import elementResizeEvent from "../src/index"

const element = document.getElementById("resize")!
const label = document.getElementById("width")!

function onResize() {
  console.log("resized!", element.offsetWidth)
  label.innerHTML = element.offsetWidth + "px wide"
}

// check unbind when nothing is bound
elementResizeEvent.unbind(element)
elementResizeEvent.unbind(element, onResize)

elementResizeEvent(element, onResize)
// check unbind for bound function
elementResizeEvent.unbind(element, onResize)

// bind again
elementResizeEvent(element, onResize)

// check unbind of non-existent function
elementResizeEvent.unbind(element, function () {})
