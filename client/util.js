// Common utility functions.

'use strict';

// Mutates arr, removing all elements with the given value.
exports.removeFromArray = function(value, arr) {
  while (true) {
    var i = arr.indexOf(value);
    if (i === -1) break;
    arr.splice(i, 1);
  }
};

exports.isAlphaNum = function(s) {
  return (/[A-Za-z0-9]/g).test(s);
};

exports.canonicalizeLineBreaks = function(s) {
  return s.replace(/(\r\n|\r|\n)/g, '\n');
};
