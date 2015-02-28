var el = document.querySelectorAll('.CONTAINER')[0];
interact(el)
  .resizable(true)
  .on('resizemove', function (event) {
    var target = event.target;

    // add the change in coords to the previous width of the target element
    var
        newWidth  = parseFloat(target.style.width ) + event.dx,
        newHeight = parseFloat(target.style.height) + event.dy;

    // update the element's style
    target.style.width      = newWidth + 'px';
    target.style.height     = newHeight + 'px';

  });


elementResizeEvent = require('../index.js');

element = document.getElementById("resize");
window.w = w = document.getElementById("width");
window.h = h = document.getElementById("height");
console.log(elementResizeEvent(element, function(size) {
  console.log("resized!");
  w.innerHTML = element.offsetWidth + "px wide";
  h.innerHTML = element.offsetHeight + "px high";
  console.log(size);
  console.log('====================');
  var newClass = 'Box';
  if (size.width < 300) {
    newClass += '  Box--SIZE_small';
  } else {
    newClass += '  Box--SIZE_normal';
  }
  if (size.height > 100) {
    newClass += '  Box--SIZE_thin';
  } else {
    newClass += '  Box--SIZE_thick';
  }
  element.setAttribute('class', newClass);
}));
