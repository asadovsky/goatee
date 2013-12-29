// Common utility functions.

'use strict';

var goatee = goatee || {};

// Mutates arr, removing all elements with the given value.
goatee.removeFromArray = function(value, arr) {
  while (true) {
    var i = arr.indexOf(value);
    if (i === -1) break;
    arr.splice(i, 1);
  }
};
