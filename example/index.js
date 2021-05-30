elementResizeEvent = require("../index.js")

element = document.getElementById("resize")
window.p = p = document.getElementById("width")
console.log(p)
console.log(elementResizeEvent)

function onResize() {
  console.log("resized!")
  console.log(element.offsetWidth)
  console.log(p)
  console.log(element.offsetWidth + "px wide")
  p.innerHTML = element.offsetWidth + "px wide"
}

//check unbind when nothing is bound
elementResizeEvent.unbind(element)
elementResizeEvent.unbind(element, onResize)

elementResizeEvent(element, onResize)
//check unbind for bounded function
elementResizeEvent.unbind(element, onResize)

//bind again
console.log(elementResizeEvent(element, onResize))

//check unbind of non-existent function
elementResizeEvent.unbind(element, function () {})
