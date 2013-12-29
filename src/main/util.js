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

goatee.isAlphaNum = function(s) {
  return (/[A-Za-z0-9]/g).test(s);
};

goatee.canonicalizeLineBreaks = function(s) {
  return s.replace(/(\r\n|\r|\n)/g, '\n');
};
