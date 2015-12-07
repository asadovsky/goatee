// Unit tests for editor.
//
// TODO:
// - Mouse tests
// - Verify that everything still works with 20px border
// - Add tests where we apply the same operations in textarea and editor, then
//   compare state
// - Add tests for rendering, perhaps using
//   - Depicted (https://github.com/bslatkin/dpxdt)
//   - Huxley (https://github.com/facebook/huxley)

'use strict';

var test = require('tape');

var Editor = require('../editor');
var HtmlSizer = require('../html_sizer');
var util = require('../util');

// Override style rules as needed for render-based state tests.
var edEl = document.querySelector('#ed');
edEl.style.overflowY = 'hidden';
edEl.style.width = '580px';

var ed = new Editor(edEl);

// Width and height of 'W' character.
var W_WIDTH = 15;
var W_HEIGHT = 18;

// Widths of various other characters.
var SPACE_WIDTH = 4;
var T_WIDTH = 10;

// Maps key name to character code.
var KEY_CODES = {
  'backspace': 8,
  'end': 35,
  'home': 36,
  'left': 37,
  'up': 38,
  'right': 39,
  'down': 40,
  'delete': 46
};

// Returns a keypress event for the given character.
function makeKeyPressEvent(k) {
  console.assert(k.length === 1, k);
  // https://code.google.com/p/chromium/issues/detail?id=327853
  var e = document.createEvent('Events');
  // KeyboardEvents bubble and are cancelable.
  // https://developer.mozilla.org/en-US/docs/Web/API/Event/initEvent
  e.initEvent('keypress', true, true);
  e.which = util.canonicalizeLineBreaks(k).charCodeAt(0);
  return e;
}

// Returns a keydown event for the given key combination, e.g. 'c', 'left',
// 'end', 'ctrl+c', 'shift+left'.
function makeKeyDownEvent(cmd) {
  console.assert(cmd.length > 0);
  var lastPlus = cmd.lastIndexOf('+');
  var k = lastPlus === -1 ? cmd : cmd.substr(lastPlus + 1);
  // See comments in makeKeyPressEvent.
  var e = document.createEvent('Events');
  e.initEvent('keydown', true, true);
  if (k.length > 1) {
    console.assert(KEY_CODES[k] !== undefined, k);
    e.which = KEY_CODES[k];
  } else {
    e.which = util.canonicalizeLineBreaks(k).charCodeAt(0);
  }
  e.shiftKey = cmd.indexOf('shift') !== -1;
  e.ctrlKey = cmd.indexOf('ctrl') !== -1;
  e.metaKey = cmd.indexOf('meta') !== -1;
  return e;
}

// Simulates typing the given text at the current cursor position.
function type(text) {
  for (var i = 0; i < text.length; i++) {
    document.dispatchEvent(makeKeyPressEvent(text[i]));
  }
}

// Fires the given sequence of keydown commands.
function fireKeyDownSeq(seq) {
  var arr = seq.split(' ');
  for (var i = 0; i < arr.length; i++) {
    document.dispatchEvent(makeKeyDownEvent(arr[i]));
  }
}

// Returns the current text content.
function text() {
  return ed.getText();
}

// Returns the current cursor (selEnd) position.
function cursorPos() {
  return ed.getSelectionRange()[1];
}

// Returns the current cursor (selEnd) [pos, row, left].
function cursorState() {
  return [cursorPos(), ed.cursor_.row, ed.cursor_.left];
}

// Returns the current editor state: text, selection range, etc.
function state() {
  var tup = ed.getSelectionRange(), selStart = tup[0], selEnd = tup[1];
  if (selStart === selEnd) {
    return [text(), selStart];
  } else {
    return [text(), selStart, selEnd];
  }
}

// Returns a string containing s repeated n times.
function repeat(s, n) {
  var res = '';
  for (var i = 0; i < n; i++) res += s;
  return res;
}

function resetEditor() {
  ed.reset();
  ed.focus();
}

////////////////////////////////////////////////////////////////////////////////
// Tests

resetEditor();

function end(t) {
  resetEditor();
  t.end();
}

var TG = {
  hs: 'HtmlSizer: ',
  k: 'keyboard: ',
  ks: 'keyboard shortcuts: ',
  m: 'mouse: ',
  rbs: 'render-based state: ',
};

////////////////////////////////////////
// Keyboard

test(TG.k + 'keypress inserts chars', function(t) {
  type('a');
  t.deepEqual(state(), ['a', 1]);
  type('a');
  t.deepEqual(state(), ['aa', 2]);
  end(t);
});

test(TG.k + 'keydown ignores chars', function(t) {
  fireKeyDownSeq('a');
  t.deepEqual(state(), ['', 0]);
  end(t);
});

test(TG.k + 'insert and left/right', function(t) {
  fireKeyDownSeq('left right left');
  t.deepEqual(state(), ['', 0]);
  type('abc');
  t.deepEqual(state(), ['abc', 3]);
  fireKeyDownSeq('right');
  t.deepEqual(cursorPos(), 3);
  fireKeyDownSeq('left');
  t.deepEqual(cursorPos(), 2);
  type('de');
  t.deepEqual(state(), ['abdec', 4]);
  fireKeyDownSeq('left left left left');
  t.deepEqual(cursorPos(), 0);
  fireKeyDownSeq('left');
  t.deepEqual(cursorPos(), 0);
  type('fg');
  t.deepEqual(state(), ['fgabdec', 2]);
  fireKeyDownSeq('right right left right');
  t.deepEqual(cursorPos(), 4);

  // Now with some newline chars.
  type('h\nij\n');
  t.deepEqual(state(), ['fgabh\nij\ndec', 9]);
  fireKeyDownSeq('left left left left left');
  t.deepEqual(cursorPos(), 4);
  fireKeyDownSeq('right right right right right');
  t.deepEqual(cursorPos(), 9);
  end(t);
});

test(TG.k + 'delete/backspace', function(t) {
  fireKeyDownSeq('delete backspace');
  t.deepEqual(state(), ['', 0]);
  type('abc');
  fireKeyDownSeq('backspace');
  t.deepEqual(state(), ['ab', 2]);
  fireKeyDownSeq('delete left left');
  t.deepEqual(state(), ['ab', 0]);
  fireKeyDownSeq('delete');
  t.deepEqual(state(), ['b', 0]);
  fireKeyDownSeq('backspace right');
  t.deepEqual(state(), ['b', 1]);
  fireKeyDownSeq('backspace');
  t.deepEqual(state(), ['', 0]);

  // Now with some newline chars.
  type('h\nij\nk');
  fireKeyDownSeq('left left left');
  t.deepEqual(state(), ['h\nij\nk', 3]);
  fireKeyDownSeq('backspace backspace delete delete');
  t.deepEqual(state(), ['hk', 1]);
  end(t);
});

test(TG.k + 'home/end', function(t) {
  fireKeyDownSeq('home end home');
  t.deepEqual(state(), ['', 0]);
  type('123');
  fireKeyDownSeq('home');
  t.deepEqual(cursorPos(), 0);
  fireKeyDownSeq('end');
  t.deepEqual(cursorPos(), 3);
  fireKeyDownSeq('left home');
  t.deepEqual(cursorPos(), 0);
  fireKeyDownSeq('right end');
  t.deepEqual(cursorPos(), 3);
  end(t);
});

test(TG.k + 'home/end with newlines', function(t) {
  type('123\n456\n789');
  t.deepEqual(cursorPos(), 11);
  fireKeyDownSeq('end');
  t.deepEqual(cursorPos(), 11);
  fireKeyDownSeq('home');
  t.deepEqual(cursorPos(), 8);
  fireKeyDownSeq('home');
  t.deepEqual(cursorPos(), 8);
  fireKeyDownSeq('left');
  t.deepEqual(cursorPos(), 7);
  fireKeyDownSeq('end');
  t.deepEqual(cursorPos(), 7);
  fireKeyDownSeq('home');
  t.deepEqual(cursorPos(), 4);
  fireKeyDownSeq('home');
  t.deepEqual(cursorPos(), 4);
  fireKeyDownSeq('left');
  t.deepEqual(cursorPos(), 3);
  fireKeyDownSeq('end');
  t.deepEqual(cursorPos(), 3);
  fireKeyDownSeq('home');
  t.deepEqual(cursorPos(), 0);
  fireKeyDownSeq('home');
  t.deepEqual(cursorPos(), 0);
  end(t);
});

test(TG.k + 'ctrl+left/right', function(t) {
  var s = 'aa bb  cc';
  type(s);
  t.deepEqual(state(), [s, 9]);
  fireKeyDownSeq('ctrl+left');
  t.deepEqual(state(), [s, 7]);
  fireKeyDownSeq('ctrl+left');
  t.deepEqual(state(), [s, 3]);
  fireKeyDownSeq('ctrl+left');
  t.deepEqual(state(), [s, 0]);
  fireKeyDownSeq('ctrl+left');
  t.deepEqual(state(), [s, 0]);
  fireKeyDownSeq('ctrl+right');
  t.deepEqual(state(), [s, 2]);
  fireKeyDownSeq('ctrl+right');
  t.deepEqual(state(), [s, 5]);
  fireKeyDownSeq('ctrl+right');
  t.deepEqual(state(), [s, 9]);
  fireKeyDownSeq('ctrl+right');
  t.deepEqual(state(), [s, 9]);

  // Non-alphanumeric chars (including newlines and periods) should behave the
  // same way as spaces.
  resetEditor();
  s = 'aa+/.\n|3a';
  type(s);
  t.deepEqual(state(), [s, 9]);
  fireKeyDownSeq('ctrl+left');
  t.deepEqual(state(), [s, 7]);
  fireKeyDownSeq('ctrl+left');
  t.deepEqual(state(), [s, 0]);
  fireKeyDownSeq('ctrl+right');
  t.deepEqual(state(), [s, 2]);
  fireKeyDownSeq('ctrl+right');
  t.deepEqual(state(), [s, 9]);

  // Leading and trailing spaces.
  resetEditor();
  s = '  ';
  type(s);
  t.deepEqual(state(), [s, 2]);
  fireKeyDownSeq('ctrl+left');
  t.deepEqual(state(), [s, 0]);
  fireKeyDownSeq('ctrl+right');
  t.deepEqual(state(), [s, 2]);
  fireKeyDownSeq('left ctrl+right');
  t.deepEqual(state(), [s, 2]);
  fireKeyDownSeq('left ctrl+left');
  t.deepEqual(state(), [s, 0]);
  end(t);
});

test(TG.k + 'ctrl+delete, ctrl+backspace', function(t) {
  fireKeyDownSeq('ctrl+backspace ctrl+delete');
  t.deepEqual(state(), ['', 0]);

  type('aa bb  cc');
  t.deepEqual(cursorPos(), 9);
  fireKeyDownSeq('ctrl+delete');
  t.deepEqual(state(), ['aa bb  cc', 9]);
  fireKeyDownSeq('ctrl+backspace');
  t.deepEqual(state(), ['aa bb  ', 7]);
  fireKeyDownSeq('ctrl+backspace');
  t.deepEqual(state(), ['aa ', 3]);
  fireKeyDownSeq('ctrl+backspace');
  t.deepEqual(state(), ['', 0]);

  type('aa bb  cc');
  fireKeyDownSeq('home');
  t.deepEqual(cursorPos(), 0);
  fireKeyDownSeq('ctrl+backspace');
  t.deepEqual(state(), ['aa bb  cc', 0]);
  fireKeyDownSeq('ctrl+delete');
  t.deepEqual(state(), [' bb  cc', 0]);
  fireKeyDownSeq('ctrl+delete');
  t.deepEqual(state(), ['  cc', 0]);
  fireKeyDownSeq('ctrl+delete');
  t.deepEqual(state(), ['', 0]);

  type(' ');
  t.deepEqual(cursorPos(), 1);
  fireKeyDownSeq('ctrl+backspace');
  t.deepEqual(state(), ['', 0]);
  type(' ');
  t.deepEqual(cursorPos(), 1);
  fireKeyDownSeq('home ctrl+delete');
  t.deepEqual(state(), ['', 0]);
  end(t);
});

test(TG.k + 'shift+left/right', function(t) {
  fireKeyDownSeq('shift+left shift+right shift+left');
  t.deepEqual(state(), ['', 0]);

  var s = 'abc';
  type(s);
  t.deepEqual(state(), [s, 3]);
  fireKeyDownSeq('shift+left');
  t.deepEqual(state(), [s, 3, 2]);
  fireKeyDownSeq('shift+left');
  t.deepEqual(state(), [s, 3, 1]);
  fireKeyDownSeq('shift+right');
  t.deepEqual(state(), [s, 3, 2]);
  fireKeyDownSeq('shift+right');
  t.deepEqual(state(), [s, 3]);
  fireKeyDownSeq('home shift+right');
  t.deepEqual(state(), [s, 0, 1]);
  fireKeyDownSeq('shift+left');
  t.deepEqual(state(), [s, 0]);
  end(t);
});

// Mostly copied from ctrl+left/right test.
test(TG.k + 'shift+ctrl+left/right', function(t) {
  var s = 'aa bb  cc';
  type(s);
  t.deepEqual(state(), [s, 9]);
  fireKeyDownSeq('shift+ctrl+left');
  t.deepEqual(state(), [s, 9, 7]);
  fireKeyDownSeq('shift+ctrl+left');
  t.deepEqual(state(), [s, 9, 3]);
  fireKeyDownSeq('shift+ctrl+left');
  t.deepEqual(state(), [s, 9, 0]);
  fireKeyDownSeq('shift+ctrl+left');
  t.deepEqual(state(), [s, 9, 0]);
  fireKeyDownSeq('shift+ctrl+right');
  t.deepEqual(state(), [s, 9, 2]);
  fireKeyDownSeq('shift+ctrl+right');
  t.deepEqual(state(), [s, 9, 5]);
  fireKeyDownSeq('shift+ctrl+right');
  t.deepEqual(state(), [s, 9]);
  fireKeyDownSeq('shift+ctrl+right');
  t.deepEqual(state(), [s, 9]);

  // Make sure that shift+ctrl+left can also drop the selection.
  fireKeyDownSeq('home right right right');
  t.deepEqual(state(), [s, 3]);
  fireKeyDownSeq('shift+ctrl+right');
  t.deepEqual(state(), [s, 3, 5]);
  fireKeyDownSeq('shift+ctrl+left');
  t.deepEqual(state(), [s, 3]);

  // Leading and trailing spaces.
  resetEditor();
  s = '  ';
  type(s);
  t.deepEqual(state(), [s, 2]);
  fireKeyDownSeq('shift+ctrl+left');
  t.deepEqual(state(), [s, 2, 0]);
  fireKeyDownSeq('shift+ctrl+right');
  t.deepEqual(state(), [s, 2]);
  fireKeyDownSeq('left shift+ctrl+right');
  t.deepEqual(state(), [s, 1, 2]);
  fireKeyDownSeq('left shift+ctrl+left');
  t.deepEqual(state(), [s, 1, 0]);
  end(t);
});

test(TG.k + 'shift+home/end', function(t) {
  fireKeyDownSeq('shift+home shift+end shift+home');
  t.deepEqual(state(), ['', 0]);

  var s = 'abc';
  type(s);
  t.deepEqual(state(), [s, 3]);
  fireKeyDownSeq('shift+home');
  t.deepEqual(state(), [s, 3, 0]);
  fireKeyDownSeq('shift+end');
  t.deepEqual(state(), [s, 3]);
  fireKeyDownSeq('ctrl+left shift+end');
  t.deepEqual(state(), [s, 0, 3]);
  fireKeyDownSeq('shift+home');
  t.deepEqual(state(), [s, 0]);
  end(t);
});

test(TG.k + 'select, then type', function(t) {
  type('abc');
  fireKeyDownSeq('shift+left');
  type('de');
  t.deepEqual(state(), ['abde', 4]);
  fireKeyDownSeq('shift+ctrl+left shift+right');
  type('fg');
  t.deepEqual(state(), ['afg', 3]);
  end(t);
});

test(TG.k + 'select, then left/right', function(t) {
  var s = ' aa bb cc ';
  type(s);

  fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
  t.deepEqual(state(), [s, 6, 4]);
  fireKeyDownSeq('left');
  t.deepEqual(state(), [s, 4]);
  fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
  t.deepEqual(state(), [s, 6, 4]);
  fireKeyDownSeq('right');
  t.deepEqual(state(), [s, 6]);

  fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
  t.deepEqual(state(), [s, 4, 6]);
  fireKeyDownSeq('left');
  t.deepEqual(state(), [s, 4]);
  fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
  t.deepEqual(state(), [s, 4, 6]);
  fireKeyDownSeq('right');
  t.deepEqual(state(), [s, 6]);
  end(t);
});

test(TG.k + 'select, then ctrl+left/right', function(t) {
  var s = ' aa bb cc ';
  type(s);

  fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
  t.deepEqual(state(), [s, 6, 4]);
  fireKeyDownSeq('ctrl+left');
  t.deepEqual(state(), [s, 1]);
  fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
  t.deepEqual(state(), [s, 6, 4]);
  fireKeyDownSeq('ctrl+right');
  t.deepEqual(state(), [s, 9]);

  fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
  t.deepEqual(state(), [s, 4, 6]);
  fireKeyDownSeq('ctrl+left');
  t.deepEqual(state(), [s, 1]);
  fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
  t.deepEqual(state(), [s, 4, 6]);
  fireKeyDownSeq('ctrl+right');
  t.deepEqual(state(), [s, 9]);
  end(t);
});

test(TG.k + 'select, then home/end', function(t) {
  var s = ' ab ';
  type(s);

  fireKeyDownSeq('shift+left home');
  t.deepEqual(state(), [s, 0]);
  fireKeyDownSeq('shift+right home');
  t.deepEqual(state(), [s, 0]);
  fireKeyDownSeq('ctrl+shift+right home');
  t.deepEqual(state(), [s, 0]);
  fireKeyDownSeq('ctrl+right ctrl+shift+left home');
  t.deepEqual(state(), [s, 0]);

  fireKeyDownSeq('shift+right end');
  t.deepEqual(state(), [s, 4]);
  fireKeyDownSeq('shift+left end');
  t.deepEqual(state(), [s, 4]);
  fireKeyDownSeq('ctrl+shift+left end');
  t.deepEqual(state(), [s, 4]);
  fireKeyDownSeq('ctrl+left ctrl+shift+right end');
  t.deepEqual(state(), [s, 4]);
  end(t);
});

////////////////////////////////////////
// Render-based state

test(TG.rbs + 'innerWidth', function(t) {
  // Tests below assume that one line can fit 37 W's.
  t.deepEqual(Math.floor(ed.innerWidth_ / W_WIDTH), 37);
  end(t);
});

test(TG.rbs + 'home/end with wrapped line', function(t) {
  var s = repeat('W', 50);
  type(s);
  t.deepEqual(state(), [s, 50]);

  fireKeyDownSeq('end');
  t.deepEqual(cursorState(), [50, 1, 13 * W_WIDTH]);
  fireKeyDownSeq('home');
  t.deepEqual(cursorState(), [37, 1, 0]);
  fireKeyDownSeq('home');
  t.deepEqual(cursorState(), [37, 1, 0]);
  fireKeyDownSeq('left');
  t.deepEqual(cursorState(), [36, 0, 36 * W_WIDTH]);
  fireKeyDownSeq('end');
  t.deepEqual(cursorState(), [37, 0, 37 * W_WIDTH]);
  fireKeyDownSeq('end');
  t.deepEqual(cursorState(), [37, 0, 37 * W_WIDTH]);
  fireKeyDownSeq('right');
  t.deepEqual(cursorState(), [38, 1, W_WIDTH]);
  fireKeyDownSeq('home');
  t.deepEqual(cursorState(), [37, 1, 0]);
  fireKeyDownSeq('end');
  t.deepEqual(cursorState(), [50, 1, 13 * W_WIDTH]);

  // This time, a wrapped line with a space.
  resetEditor();
  var c29c20 = repeat('W', 29) + ' ' + repeat('W', 20);
  type(c29c20);
  t.deepEqual(state(), [c29c20, 50]);

  fireKeyDownSeq('end');
  t.deepEqual(cursorState(), [50, 1, 20 * W_WIDTH]);
  fireKeyDownSeq('home');
  t.deepEqual(cursorState(), [30, 1, 0]);
  fireKeyDownSeq('home');
  t.deepEqual(cursorState(), [30, 1, 0]);
  fireKeyDownSeq('left');
  t.deepEqual(cursorState(), [29, 0, 29 * W_WIDTH]);
  fireKeyDownSeq('end');
  t.deepEqual(cursorState(), [30, 0, 29 * W_WIDTH + SPACE_WIDTH]);
  fireKeyDownSeq('end');
  t.deepEqual(cursorState(), [30, 0, 29 * W_WIDTH + SPACE_WIDTH]);
  fireKeyDownSeq('right');
  t.deepEqual(cursorState(), [31, 1, W_WIDTH]);
  fireKeyDownSeq('home');
  t.deepEqual(cursorState(), [30, 1, 0]);
  fireKeyDownSeq('end');
  t.deepEqual(cursorState(), [50, 1, 20 * W_WIDTH]);
  end(t);
});

test(TG.rbs + 'up/down', function(t) {
  var c10 = repeat('W', 10);
  type(c10 + '\n' +
       c10 + c10 + '\n' +
       c10 + '\n' +
       '\n' +
       c10 + c10);

  t.deepEqual(cursorState(), [64, 4, 20 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [43, 3, 0]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [42, 2, 10 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [31, 1, 20 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [10, 0, 10 * W_WIDTH]);
  // Extra up.
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [10, 0, 10 * W_WIDTH]);

  fireKeyDownSeq('left');
  t.deepEqual(cursorState(), [9, 0, 9 * W_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [20, 1, 9 * W_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [41, 2, 9 * W_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [43, 3, 0]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [53, 4, 9 * W_WIDTH]);
  // Extra down.
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [53, 4, 9 * W_WIDTH]);

  fireKeyDownSeq('home');
  t.deepEqual(cursorState(), [44, 4, 0]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [43, 3, 0]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [32, 2, 0]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [11, 1, 0]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [0, 0, 0]);
  end(t);
});

test(TG.rbs + 'up/down with wrapped line', function(t) {
  var c10 = repeat('W', 10), c50 = repeat('W', 50);
  type(c50 + '\n\n' + c50 + '\n' + c10);

  t.deepEqual(cursorState(), [52 + 51 + 10, 5, 10 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [52 + 37 + 10, 4, 10 * W_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [52 + 51 + 10, 5, 10 * W_WIDTH]);
  fireKeyDownSeq('up up');
  t.deepEqual(cursorState(), [52 + 10, 3, 10 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [51, 2, 0]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [37 + 10, 1, 10 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [10, 0, 10 * W_WIDTH]);

  fireKeyDownSeq('end');
  t.deepEqual(cursorState(), [37, 0, 37 * W_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [50, 1, 13 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [37, 0, 37 * W_WIDTH]);
  fireKeyDownSeq('down down');
  t.deepEqual(cursorState(), [51, 2, 0]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [52 + 37, 3, 37 * W_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [52 + 50, 4, 13 * W_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [52 + 51 + 10, 5, 10 * W_WIDTH]);

  // This time, a wrapped line with a space.
  resetEditor();
  var c29c18c1 = repeat('W', 29) + ' ' + repeat('W', 18) + ' ' + 'W';
  type(c29c18c1 + '\n\n' + c29c18c1 + '\n' + c10);

  t.deepEqual(cursorState(), [52 + 51 + 10, 5, 10 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [52 + 30 + 10, 4, 10 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [52 + 10, 3, 10 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [51, 2, 0]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [30 + 10, 1, 10 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [10, 0, 10 * W_WIDTH]);

  fireKeyDownSeq('end');
  t.deepEqual(cursorState(), [30, 0, 29 * W_WIDTH + SPACE_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [50, 1, 19 * W_WIDTH + SPACE_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [51, 2, 0]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [52 + 30, 3, 29 * W_WIDTH + SPACE_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [52 + 50, 4, 19 * W_WIDTH + SPACE_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [52 + 51 + 10, 5, 10 * W_WIDTH]);
  end(t);
});

test(TG.rbs + 'up/down with chars of different widths', function(t) {
  type('W\nTT\nW \nTW\n    \nW\n');
  // This test relies on the following invariants.
  t.deepEqual(T_WIDTH * 1.5, W_WIDTH);
  t.deepEqual(SPACE_WIDTH * 2.5, T_WIDTH);
  // Initial cursor left is 0px.
  t.deepEqual(cursorState(), [18, 6, 0]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [16, 5, 0]);
  fireKeyDownSeq('end');
  // Now, cursor left is 15px.
  t.deepEqual(cursorState(), [17, 5, W_WIDTH]);
  fireKeyDownSeq('up');
  // 16px is closer than 12px.
  t.deepEqual(cursorState(), [15, 4, 4 * SPACE_WIDTH]);
  fireKeyDownSeq('up');
  // 10px is closer than 25px.
  t.deepEqual(cursorState(), [9, 3, T_WIDTH]);
  fireKeyDownSeq('down');
  // prevLeft should still be 15px (i.e. W_WIDTH).
  t.deepEqual(cursorState(), [15, 4, 4 * SPACE_WIDTH]);
  fireKeyDownSeq('up up');
  t.deepEqual(cursorState(), [6, 2, W_WIDTH]);
  fireKeyDownSeq('up');
  // 10px is closer than 20px (lower number wins ties).
  t.deepEqual(cursorState(), [3, 1, T_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [1, 0, W_WIDTH]);
  fireKeyDownSeq('down home right down');
  t.deepEqual(cursorState(), [6, 2, W_WIDTH]);
  fireKeyDownSeq('down down');
  // This time, prevLeft is 10px (i.e. T_WIDTH).
  // 8px is closer than 12px (lower number wins ties).
  t.deepEqual(cursorState(), [13, 4, 2 * SPACE_WIDTH]);
  fireKeyDownSeq('down down down');
  t.deepEqual(cursorState(), [18, 6, 0]);
  end(t);
});

test(TG.rbs + 'select to end of wrapped line, then up/down', function(t) {
  var c10 = repeat('W', 10), c50 = repeat('W', 50);
  type(c50);
  fireKeyDownSeq('home left home');
  t.deepEqual(cursorState(), [0, 0, 0]);
  fireKeyDownSeq('shift+end');
  t.deepEqual(cursorState(), [37, 0, 37 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [37, 0, 37 * W_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [50, 1, 13 * W_WIDTH]);

  resetEditor();
  type(c10 + '\n' + c50);
  fireKeyDownSeq('home left home');
  t.deepEqual(cursorState(), [11, 1, 0]);
  fireKeyDownSeq('shift+end');
  t.deepEqual(cursorState(), [11 + 37, 1, 37 * W_WIDTH]);
  fireKeyDownSeq('up');
  t.deepEqual(cursorState(), [10, 0, 10 * W_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [11 + 37, 1, 37 * W_WIDTH]);
  fireKeyDownSeq('down');
  t.deepEqual(cursorState(), [11 + 50, 2, 13 * W_WIDTH]);
  end(t);
});

// TODO: Implement the four tests below.

test(TG.rbs + 'ctrl+up/down', function(t) {
  end(t);
});

test(TG.rbs + 'shift+up/down', function(t) {
  end(t);
});

test(TG.rbs + 'shift+ctrl+up/down', function(t) {
  end(t);
});

test(TG.rbs + 'reset prevLeft', function(t) {
  // TODO: Make sure prevLeft gets reset on shift+left/right.
  end(t);
});

////////////////////////////////////////
// Keyboard shortcuts

// TODO: Test keyboard shortcuts on non-Mac (i.e. ctrlKey instead of metaKey).

test(TG.ks + 'select-all', function(t) {
  var s = ' aa bb ';
  type(s);
  t.deepEqual(state(), [s, 7]);
  fireKeyDownSeq('meta+A');
  // TODO: Check that the cursor is hidden.
  t.deepEqual(state(), [s, 0, 7]);
  end(t);
});

test(TG.ks + 'cut, copy, paste', function(t) {
  var s = 'aa bb cc';
  type(s);

  t.deepEqual(state(), [s, 8]);
  t.deepEqual(ed.clipboard_, '');
  fireKeyDownSeq('meta+C meta+X meta+V');
  t.deepEqual(state(), [s, 8]);
  t.deepEqual(ed.clipboard_, '');

  fireKeyDownSeq('shift+ctrl+left meta+X');
  t.deepEqual(state(), ['aa bb ', 6]);
  t.deepEqual(ed.clipboard_, 'cc');
  fireKeyDownSeq('meta+V');
  t.deepEqual(state(), [s, 8]);
  t.deepEqual(ed.clipboard_, 'cc');

  fireKeyDownSeq('ctrl+left left shift+ctrl+left meta+C delete');
  t.deepEqual(state(), ['aa  cc', 3]);
  t.deepEqual(ed.clipboard_, 'bb');
  fireKeyDownSeq('meta+V');
  t.deepEqual(state(), [s, 5]);
  t.deepEqual(ed.clipboard_, 'bb');

  fireKeyDownSeq('meta+A meta+C');
  t.deepEqual(ed.clipboard_, s);
  fireKeyDownSeq('meta+V meta+V');
  t.deepEqual(state(), [s + s, 16]);
  t.deepEqual(ed.clipboard_, s);
  end(t);
});

test(TG.ks + 'multiple cut/copy commands', function(t) {
  var s = 'abcd';
  type(s);
  fireKeyDownSeq('shift+left meta+C');
  t.deepEqual(state(), [s, 4, 3]);
  t.deepEqual(ed.clipboard_, 'd');
  fireKeyDownSeq('left shift+home meta+C');
  t.deepEqual(state(), [s, 3, 0]);
  t.deepEqual(ed.clipboard_, 'abc');
  fireKeyDownSeq('shift+right meta+X');
  t.deepEqual(state(), ['ad', 1]);
  t.deepEqual(ed.clipboard_, 'bc');
  end(t);
});

test(TG.ks + 'change selection, then paste', function(t) {
  type('ab');
  fireKeyDownSeq('shift+left meta+C left meta+V');
  t.deepEqual(state(), ['abb', 2]);
  fireKeyDownSeq('ctrl+shift+left meta+V');
  t.deepEqual(state(), ['bb', 1]);
  end(t);
});

////////////////////////////////////////
// HtmlSizer

var hs = new HtmlSizer(document.body);

test(TG.hs + 'size of one char', function(t) {
  t.deepEqual(hs.size('W'), [W_WIDTH, W_HEIGHT]);
  t.end();
});

test(TG.hs + 'size of two chars', function(t) {
  t.deepEqual(hs.size('WW'), [2 * W_WIDTH, W_HEIGHT]);
  t.end();
});

test(TG.hs + 'width and height', function(t) {
  t.deepEqual(hs.width('W'), W_WIDTH);
  t.deepEqual(hs.height('W'), W_HEIGHT);
  t.end();
});

////////////////////////////////////////
// Uncaught exceptions

var uncaughtExceptions = false;
window.addEventListener('error', function() {
  uncaughtExceptions = true;
});
var consoleAssert = console.assert.bind(console);
console.assert = function(assertion) {
  if (!assertion) uncaughtExceptions = true;
  consoleAssert.apply(this, arguments);
};

test('uncaughtExceptions', function(t) {
  t.ok(!uncaughtExceptions);
  t.end();
});
