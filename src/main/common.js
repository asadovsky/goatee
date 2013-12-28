// Common constants and utility functions.

'use strict';

var goatee = goatee || {};

goatee.EventType = {
  TEXT_INSERT: 'text_insert',
  TEXT_DELETE: 'text_delete',
  SET_SELECTION: 'set_selection'
};

// Mutates arr, removing all elements with the given value.
goatee.removeFromArray = function(value, arr) {
  while (true) {
    var i = arr.indexOf(value);
    if (i === -1) break;
    arr.splice(i, 1);
  }
};
