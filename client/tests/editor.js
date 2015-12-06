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
  e.which = goatee.canonicalizeLineBreaks(k).charCodeAt(0);
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
    e.which = goatee.canonicalizeLineBreaks(k).charCodeAt(0);
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
  return editor.getText();
}

// Returns the current cursor (selEnd) position.
function curPos() {
  return editor.getSelectionRange()[1];
}

// Returns the current cursor (selEnd) [pos, row, left].
function curState() {
  return [curPos(), editor.cursor_.row, editor.cursor_.left];
}

// Returns the current editor state: text, selection range, etc.
function state() {
  var tup = editor.getSelectionRange(), selStart = tup[0], selEnd = tup[1];
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
  editor.reset();
  editor.focus();
}

function describe() {
  return;
}

////////////////////////////////////////////////////////////////////////////////
// Tests

test('foo', function(t) {
  t.end();
});

describe('Editor keyboard basics', function() {
  beforeEach(function() {
    resetEditor();
    t.deepEqual((state()), (['', 0]));
  });

  it('keypress inserts chars', function() {
    type('a');
    t.deepEqual((state()), (['a', 1]));
    type('a');
    t.deepEqual((state()), (['aa', 2]));
  });

  it('keydown ignores chars', function() {
    fireKeyDownSeq('a');
    t.deepEqual((state()), (['', 0]));
  });

  it('insert and left/right', function() {
    fireKeyDownSeq('left right left');
    t.deepEqual((state()), (['', 0]));
    type('abc');
    t.deepEqual((state()), (['abc', 3]));
    fireKeyDownSeq('right');
    t.deepEqual((curPos()), (3));
    fireKeyDownSeq('left');
    t.deepEqual((curPos()), (2));
    type('de');
    t.deepEqual((state()), (['abdec', 4]));
    fireKeyDownSeq('left left left left');
    t.deepEqual((curPos()), (0));
    fireKeyDownSeq('left');
    t.deepEqual((curPos()), (0));
    type('fg');
    t.deepEqual((state()), (['fgabdec', 2]));
    fireKeyDownSeq('right right left right');
    t.deepEqual((curPos()), (4));

    // Now with some newline chars.
    type('h\nij\n');
    t.deepEqual((state()), (['fgabh\nij\ndec', 9]));
    fireKeyDownSeq('left left left left left');
    t.deepEqual((curPos()), (4));
    fireKeyDownSeq('right right right right right');
    t.deepEqual((curPos()), (9));
  });

  it('delete/backspace', function() {
    fireKeyDownSeq('delete backspace');
    t.deepEqual((state()), (['', 0]));
    type('abc');
    fireKeyDownSeq('backspace');
    t.deepEqual((state()), (['ab', 2]));
    fireKeyDownSeq('delete left left');
    t.deepEqual((state()), (['ab', 0]));
    fireKeyDownSeq('delete');
    t.deepEqual((state()), (['b', 0]));
    fireKeyDownSeq('backspace right');
    t.deepEqual((state()), (['b', 1]));
    fireKeyDownSeq('backspace');
    t.deepEqual((state()), (['', 0]));

    // Now with some newline chars.
    type('h\nij\nk');
    fireKeyDownSeq('left left left');
    t.deepEqual((state()), (['h\nij\nk', 3]));
    fireKeyDownSeq('backspace backspace delete delete');
    t.deepEqual((state()), (['hk', 1]));
  });

  it('home/end', function() {
    fireKeyDownSeq('home end home');
    t.deepEqual((state()), (['', 0]));
    type('123');
    fireKeyDownSeq('home');
    t.deepEqual((curPos()), (0));
    fireKeyDownSeq('end');
    t.deepEqual((curPos()), (3));
    fireKeyDownSeq('left home');
    t.deepEqual((curPos()), (0));
    fireKeyDownSeq('right end');
    t.deepEqual((curPos()), (3));
  });

  it('home/end with newlines', function() {
    type('123\n456\n789');
    t.deepEqual((curPos()), (11));
    fireKeyDownSeq('end');
    t.deepEqual((curPos()), (11));
    fireKeyDownSeq('home');
    t.deepEqual((curPos()), (8));
    fireKeyDownSeq('home');
    t.deepEqual((curPos()), (8));
    fireKeyDownSeq('left');
    t.deepEqual((curPos()), (7));
    fireKeyDownSeq('end');
    t.deepEqual((curPos()), (7));
    fireKeyDownSeq('home');
    t.deepEqual((curPos()), (4));
    fireKeyDownSeq('home');
    t.deepEqual((curPos()), (4));
    fireKeyDownSeq('left');
    t.deepEqual((curPos()), (3));
    fireKeyDownSeq('end');
    t.deepEqual((curPos()), (3));
    fireKeyDownSeq('home');
    t.deepEqual((curPos()), (0));
    fireKeyDownSeq('home');
    t.deepEqual((curPos()), (0));
  });

  it('ctrl+left/right', function() {
    var s = 'aa bb  cc';
    type(s);
    t.deepEqual((state()), ([s, 9]));
    fireKeyDownSeq('ctrl+left');
    t.deepEqual((state()), ([s, 7]));
    fireKeyDownSeq('ctrl+left');
    t.deepEqual((state()), ([s, 3]));
    fireKeyDownSeq('ctrl+left');
    t.deepEqual((state()), ([s, 0]));
    fireKeyDownSeq('ctrl+left');
    t.deepEqual((state()), ([s, 0]));
    fireKeyDownSeq('ctrl+right');
    t.deepEqual((state()), ([s, 2]));
    fireKeyDownSeq('ctrl+right');
    t.deepEqual((state()), ([s, 5]));
    fireKeyDownSeq('ctrl+right');
    t.deepEqual((state()), ([s, 9]));
    fireKeyDownSeq('ctrl+right');
    t.deepEqual((state()), ([s, 9]));

    // Non-alphanumeric chars (including newlines and periods) should behave the
    // same way as spaces.
    resetEditor();
    t = 'aa+/.\n|3a';
    type(s);
    t.deepEqual((state()), ([s, 9]));
    fireKeyDownSeq('ctrl+left');
    t.deepEqual((state()), ([s, 7]));
    fireKeyDownSeq('ctrl+left');
    t.deepEqual((state()), ([s, 0]));
    fireKeyDownSeq('ctrl+right');
    t.deepEqual((state()), ([s, 2]));
    fireKeyDownSeq('ctrl+right');
    t.deepEqual((state()), ([s, 9]));

    // Leading and trailing spaces.
    resetEditor();
    t = '  ';
    type(s);
    t.deepEqual((state()), ([s, 2]));
    fireKeyDownSeq('ctrl+left');
    t.deepEqual((state()), ([s, 0]));
    fireKeyDownSeq('ctrl+right');
    t.deepEqual((state()), ([s, 2]));
    fireKeyDownSeq('left ctrl+right');
    t.deepEqual((state()), ([s, 2]));
    fireKeyDownSeq('left ctrl+left');
    t.deepEqual((state()), ([s, 0]));
  });

  it('ctrl+delete, ctrl+backspace', function() {
    fireKeyDownSeq('ctrl+backspace ctrl+delete');
    t.deepEqual((state()), (['', 0]));

    type('aa bb  cc');
    t.deepEqual((curPos()), (9));
    fireKeyDownSeq('ctrl+delete');
    t.deepEqual((state()), (['aa bb  cc', 9]));
    fireKeyDownSeq('ctrl+backspace');
    t.deepEqual((state()), (['aa bb  ', 7]));
    fireKeyDownSeq('ctrl+backspace');
    t.deepEqual((state()), (['aa ', 3]));
    fireKeyDownSeq('ctrl+backspace');
    t.deepEqual((state()), (['', 0]));

    type('aa bb  cc');
    fireKeyDownSeq('home');
    t.deepEqual((curPos()), (0));
    fireKeyDownSeq('ctrl+backspace');
    t.deepEqual((state()), (['aa bb  cc', 0]));
    fireKeyDownSeq('ctrl+delete');
    t.deepEqual((state()), ([' bb  cc', 0]));
    fireKeyDownSeq('ctrl+delete');
    t.deepEqual((state()), (['  cc', 0]));
    fireKeyDownSeq('ctrl+delete');
    t.deepEqual((state()), (['', 0]));

    type(' ');
    t.deepEqual((curPos()), (1));
    fireKeyDownSeq('ctrl+backspace');
    t.deepEqual((state()), (['', 0]));
    type(' ');
    t.deepEqual((curPos()), (1));
    fireKeyDownSeq('home ctrl+delete');
    t.deepEqual((state()), (['', 0]));
  });

  it('shift+left/right', function() {
    fireKeyDownSeq('shift+left shift+right shift+left');
    t.deepEqual((state()), (['', 0]));

    var s = 'abc';
    type(s);
    t.deepEqual((state()), ([s, 3]));
    fireKeyDownSeq('shift+left');
    t.deepEqual((state()), ([s, 3, 2]));
    fireKeyDownSeq('shift+left');
    t.deepEqual((state()), ([s, 3, 1]));
    fireKeyDownSeq('shift+right');
    t.deepEqual((state()), ([s, 3, 2]));
    fireKeyDownSeq('shift+right');
    t.deepEqual((state()), ([s, 3]));
    fireKeyDownSeq('home shift+right');
    t.deepEqual((state()), ([s, 0, 1]));
    fireKeyDownSeq('shift+left');
    t.deepEqual((state()), ([s, 0]));
  });

  // Mostly copied from ctrl+left/right test.
  it('shift+ctrl+left/right', function() {
    var s = 'aa bb  cc';
    type(s);
    t.deepEqual((state()), ([s, 9]));
    fireKeyDownSeq('shift+ctrl+left');
    t.deepEqual((state()), ([s, 9, 7]));
    fireKeyDownSeq('shift+ctrl+left');
    t.deepEqual((state()), ([s, 9, 3]));
    fireKeyDownSeq('shift+ctrl+left');
    t.deepEqual((state()), ([s, 9, 0]));
    fireKeyDownSeq('shift+ctrl+left');
    t.deepEqual((state()), ([s, 9, 0]));
    fireKeyDownSeq('shift+ctrl+right');
    t.deepEqual((state()), ([s, 9, 2]));
    fireKeyDownSeq('shift+ctrl+right');
    t.deepEqual((state()), ([s, 9, 5]));
    fireKeyDownSeq('shift+ctrl+right');
    t.deepEqual((state()), ([s, 9]));
    fireKeyDownSeq('shift+ctrl+right');
    t.deepEqual((state()), ([s, 9]));

    // Make sure that shift+ctrl+left can also drop the selection.
    fireKeyDownSeq('home right right right');
    t.deepEqual((state()), ([s, 3]));
    fireKeyDownSeq('shift+ctrl+right');
    t.deepEqual((state()), ([s, 3, 5]));
    fireKeyDownSeq('shift+ctrl+left');
    t.deepEqual((state()), ([s, 3]));

    // Leading and trailing spaces.
    resetEditor();
    t = '  ';
    type(s);
    t.deepEqual((state()), ([s, 2]));
    fireKeyDownSeq('shift+ctrl+left');
    t.deepEqual((state()), ([s, 2, 0]));
    fireKeyDownSeq('shift+ctrl+right');
    t.deepEqual((state()), ([s, 2]));
    fireKeyDownSeq('left shift+ctrl+right');
    t.deepEqual((state()), ([s, 1, 2]));
    fireKeyDownSeq('left shift+ctrl+left');
    t.deepEqual((state()), ([s, 1, 0]));
  });

  it('shift+home/end', function() {
    fireKeyDownSeq('shift+home shift+end shift+home');
    t.deepEqual((state()), (['', 0]));

    var s = 'abc';
    type(s);
    t.deepEqual((state()), ([s, 3]));
    fireKeyDownSeq('shift+home');
    t.deepEqual((state()), ([s, 3, 0]));
    fireKeyDownSeq('shift+end');
    t.deepEqual((state()), ([s, 3]));
    fireKeyDownSeq('ctrl+left shift+end');
    t.deepEqual((state()), ([s, 0, 3]));
    fireKeyDownSeq('shift+home');
    t.deepEqual((state()), ([s, 0]));
  });

  it('select, then type', function() {
    type('abc');
    fireKeyDownSeq('shift+left');
    type('de');
    t.deepEqual((state()), (['abde', 4]));
    fireKeyDownSeq('shift+ctrl+left shift+right');
    type('fg');
    t.deepEqual((state()), (['afg', 3]));
  });

  it('select, then left/right', function() {
    var s = ' aa bb cc ';
    type(s);

    fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
    t.deepEqual((state()), ([s, 6, 4]));
    fireKeyDownSeq('left');
    t.deepEqual((state()), ([s, 4]));
    fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
    t.deepEqual((state()), ([s, 6, 4]));
    fireKeyDownSeq('right');
    t.deepEqual((state()), ([s, 6]));

    fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
    t.deepEqual((state()), ([s, 4, 6]));
    fireKeyDownSeq('left');
    t.deepEqual((state()), ([s, 4]));
    fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
    t.deepEqual((state()), ([s, 4, 6]));
    fireKeyDownSeq('right');
    t.deepEqual((state()), ([s, 6]));
  });

  it('select, then ctrl+left/right', function() {
    var s = ' aa bb cc ';
    type(s);

    fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
    t.deepEqual((state()), ([s, 6, 4]));
    fireKeyDownSeq('ctrl+left');
    t.deepEqual((state()), ([s, 1]));
    fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
    t.deepEqual((state()), ([s, 6, 4]));
    fireKeyDownSeq('ctrl+right');
    t.deepEqual((state()), ([s, 9]));

    fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
    t.deepEqual((state()), ([s, 4, 6]));
    fireKeyDownSeq('ctrl+left');
    t.deepEqual((state()), ([s, 1]));
    fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
    t.deepEqual((state()), ([s, 4, 6]));
    fireKeyDownSeq('ctrl+right');
    t.deepEqual((state()), ([s, 9]));
  });

  it('select, then home/end', function() {
    var s = ' ab ';
    type(s);

    fireKeyDownSeq('shift+left home');
    t.deepEqual((state()), ([s, 0]));
    fireKeyDownSeq('shift+right home');
    t.deepEqual((state()), ([s, 0]));
    fireKeyDownSeq('ctrl+shift+right home');
    t.deepEqual((state()), ([s, 0]));
    fireKeyDownSeq('ctrl+right ctrl+shift+left home');
    t.deepEqual((state()), ([s, 0]));

    fireKeyDownSeq('shift+right end');
    t.deepEqual((state()), ([s, 4]));
    fireKeyDownSeq('shift+left end');
    t.deepEqual((state()), ([s, 4]));
    fireKeyDownSeq('ctrl+shift+left end');
    t.deepEqual((state()), ([s, 4]));
    fireKeyDownSeq('ctrl+left ctrl+shift+right end');
    t.deepEqual((state()), ([s, 4]));
  });
});

describe('Editor render-based state', function() {
  beforeEach(function() {
    resetEditor();
    t.deepEqual((state()), (['', 0]));
  });

  it('innerWidth', function() {
    // Tests below assume that one line can fit 37 W's.
    t.deepEqual((Math.floor(editor.innerWidth_ / W_WIDTH)), (37));
  });

  it('home/end with wrapped line', function() {
    var s = repeat('W', 50);
    type(s);
    t.deepEqual((state()), ([s, 50]));

    fireKeyDownSeq('end');
    t.deepEqual((curState()), ([50, 1, 13 * W_WIDTH]));
    fireKeyDownSeq('home');
    t.deepEqual((curState()), ([37, 1, 0]));
    fireKeyDownSeq('home');
    t.deepEqual((curState()), ([37, 1, 0]));
    fireKeyDownSeq('left');
    t.deepEqual((curState()), ([36, 0, 36 * W_WIDTH]));
    fireKeyDownSeq('end');
    t.deepEqual((curState()), ([37, 0, 37 * W_WIDTH]));
    fireKeyDownSeq('end');
    t.deepEqual((curState()), ([37, 0, 37 * W_WIDTH]));
    fireKeyDownSeq('right');
    t.deepEqual((curState()), ([38, 1, W_WIDTH]));
    fireKeyDownSeq('home');
    t.deepEqual((curState()), ([37, 1, 0]));
    fireKeyDownSeq('end');
    t.deepEqual((curState()), ([50, 1, 13 * W_WIDTH]));

    // This time, a wrapped line with a space.
    resetEditor();
    var w29_w20 = repeat('W', 29) + ' ' + repeat('W', 20);
    type(w29_w20);
    t.deepEqual((state()), ([w29_w20, 50]));

    fireKeyDownSeq('end');
    t.deepEqual((curState()), ([50, 1, 20 * W_WIDTH]));
    fireKeyDownSeq('home');
    t.deepEqual((curState()), ([30, 1, 0]));
    fireKeyDownSeq('home');
    t.deepEqual((curState()), ([30, 1, 0]));
    fireKeyDownSeq('left');
    t.deepEqual((curState()), ([29, 0, 29 * W_WIDTH]));
    fireKeyDownSeq('end');
    t.deepEqual((curState()), ([30, 0, 29 * W_WIDTH + SPACE_WIDTH]));
    fireKeyDownSeq('end');
    t.deepEqual((curState()), ([30, 0, 29 * W_WIDTH + SPACE_WIDTH]));
    fireKeyDownSeq('right');
    t.deepEqual((curState()), ([31, 1, W_WIDTH]));
    fireKeyDownSeq('home');
    t.deepEqual((curState()), ([30, 1, 0]));
    fireKeyDownSeq('end');
    t.deepEqual((curState()), ([50, 1, 20 * W_WIDTH]));
  });

  it('up/down', function() {
    var w10 = repeat('W', 10);
    type(w10 + '\n' +
         w10 + w10 + '\n' +
         w10 + '\n' +
         '\n' +
         w10 + w10);

    t.deepEqual((curState()), ([64, 4, 20 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([43, 3, 0]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([42, 2, 10 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([31, 1, 20 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([10, 0, 10 * W_WIDTH]));
    // Extra up.
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([10, 0, 10 * W_WIDTH]));

    fireKeyDownSeq('left');
    t.deepEqual((curState()), ([9, 0, 9 * W_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([20, 1, 9 * W_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([41, 2, 9 * W_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([43, 3, 0]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([53, 4, 9 * W_WIDTH]));
    // Extra down.
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([53, 4, 9 * W_WIDTH]));

    fireKeyDownSeq('home');
    t.deepEqual((curState()), ([44, 4, 0]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([43, 3, 0]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([32, 2, 0]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([11, 1, 0]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([0, 0, 0]));
  });

  it('up/down with wrapped line', function() {
    var w10 = repeat('W', 10), w50 = repeat('W', 50);
    type(w50 + '\n\n' + w50 + '\n' + w10);

    t.deepEqual((curState()), ([52 + 51 + 10, 5, 10 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([52 + 37 + 10, 4, 10 * W_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([52 + 51 + 10, 5, 10 * W_WIDTH]));
    fireKeyDownSeq('up up');
    t.deepEqual((curState()), ([52 + 10, 3, 10 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([51, 2, 0]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([37 + 10, 1, 10 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([10, 0, 10 * W_WIDTH]));

    fireKeyDownSeq('end');
    t.deepEqual((curState()), ([37, 0, 37 * W_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([50, 1, 13 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([37, 0, 37 * W_WIDTH]));
    fireKeyDownSeq('down down');
    t.deepEqual((curState()), ([51, 2, 0]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([52 + 37, 3, 37 * W_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([52 + 50, 4, 13 * W_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([52 + 51 + 10, 5, 10 * W_WIDTH]));

    // This time, a wrapped line with a space.
    resetEditor();
    var w10 = repeat('W', 10);
    var w29_w18_w = repeat('W', 29) + ' ' + repeat('W', 18) + ' ' + 'W';
    type(w29_w18_w + '\n\n' + w29_w18_w + '\n' + w10);

    t.deepEqual((curState()), ([52 + 51 + 10, 5, 10 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([52 + 30 + 10, 4, 10 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([52 + 10, 3, 10 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([51, 2, 0]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([30 + 10, 1, 10 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([10, 0, 10 * W_WIDTH]));

    fireKeyDownSeq('end');
    t.deepEqual((curState()), ([30, 0, 29 * W_WIDTH + SPACE_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([50, 1, 19 * W_WIDTH + SPACE_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([51, 2, 0]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([52 + 30, 3, 29 * W_WIDTH + SPACE_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([52 + 50, 4, 19 * W_WIDTH + SPACE_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([52 + 51 + 10, 5, 10 * W_WIDTH]));
  });

  it('up/down with chars of different widths', function() {
    type('W\nTT\nW \nTW\n    \nW\n');
    // This test relies on the following invariants.
    t.deepEqual((T_WIDTH * 1.5), (W_WIDTH));
    t.deepEqual((SPACE_WIDTH * 2.5), (T_WIDTH));
    // Initial cursor left is 0px.
    t.deepEqual((curState()), ([18, 6, 0]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([16, 5, 0]));
    fireKeyDownSeq('end');
    // Now, cursor left is 15px.
    t.deepEqual((curState()), ([17, 5, W_WIDTH]));
    fireKeyDownSeq('up');
    // 16px is closer than 12px.
    t.deepEqual((curState()), ([15, 4, 4 * SPACE_WIDTH]));
    fireKeyDownSeq('up');
    // 10px is closer than 25px.
    t.deepEqual((curState()), ([9, 3, T_WIDTH]));
    fireKeyDownSeq('down');
    // prevLeft should still be 15px (i.e. W_WIDTH).
    t.deepEqual((curState()), ([15, 4, 4 * SPACE_WIDTH]));
    fireKeyDownSeq('up up');
    t.deepEqual((curState()), ([6, 2, W_WIDTH]));
    fireKeyDownSeq('up');
    // 10px is closer than 20px (lower number wins ties).
    t.deepEqual((curState()), ([3, 1, T_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([1, 0, W_WIDTH]));
    fireKeyDownSeq('down home right down');
    t.deepEqual((curState()), ([6, 2, W_WIDTH]));
    fireKeyDownSeq('down down');
    // This time, prevLeft is 10px (i.e. T_WIDTH).
    // 8px is closer than 12px (lower number wins ties).
    t.deepEqual((curState()), ([13, 4, 2 * SPACE_WIDTH]));
    fireKeyDownSeq('down down down');
    t.deepEqual((curState()), ([18, 6, 0]));
  });

  it('select to end of wrapped line, then up/down', function() {
    var w10 = repeat('W', 10), w50 = repeat('W', 50);
    type(w50);
    fireKeyDownSeq('home left home');
    t.deepEqual((curState()), ([0, 0, 0]));
    fireKeyDownSeq('shift+end');
    t.deepEqual((curState()), ([37, 0, 37 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([37, 0, 37 * W_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([50, 1, 13 * W_WIDTH]));

    resetEditor();
    type(w10 + '\n' + w50);
    fireKeyDownSeq('home left home');
    t.deepEqual((curState()), ([11, 1, 0]));
    fireKeyDownSeq('shift+end');
    t.deepEqual((curState()), ([11 + 37, 1, 37 * W_WIDTH]));
    fireKeyDownSeq('up');
    t.deepEqual((curState()), ([10, 0, 10 * W_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([11 + 37, 1, 37 * W_WIDTH]));
    fireKeyDownSeq('down');
    t.deepEqual((curState()), ([11 + 50, 2, 13 * W_WIDTH]));
  });

  it('ctrl+up/down', function() {
    // TODO
  });

  it('shift+up/down', function() {
    // TODO
  });

  it('shift+ctrl+up/down', function() {
    // TODO
  });

  it('reset prevLeft', function() {
    // TODO: Make sure prevLeft gets reset on shift+left/right.
  });
});

// TODO: Test keyboard shortcuts on non-Mac (i.e. ctrlKey instead of metaKey).
describe('Editor keyboard shortcuts', function() {
  beforeEach(function() {
    resetEditor();
    t.deepEqual((state()), (['', 0]));
  });

  it('select-all', function() {
    var s = ' aa bb ';
    type(s);
    t.deepEqual((state()), ([s, 7]));
    fireKeyDownSeq('meta+A');
    // TODO: Check that the cursor is hidden.
    t.deepEqual((state()), ([s, 0, 7]));
  });

  it('cut, copy, paste', function() {
    var s = 'aa bb cc';
    type(s);

    t.deepEqual((state()), ([s, 8]));
    t.deepEqual((editor.clipboard_), (''));
    fireKeyDownSeq('meta+C meta+X meta+V');
    t.deepEqual((state()), ([s, 8]));
    t.deepEqual((editor.clipboard_), (''));

    fireKeyDownSeq('shift+ctrl+left meta+X');
    t.deepEqual((state()), (['aa bb ', 6]));
    t.deepEqual((editor.clipboard_), ('cc'));
    fireKeyDownSeq('meta+V');
    t.deepEqual((state()), ([s, 8]));
    t.deepEqual((editor.clipboard_), ('cc'));

    fireKeyDownSeq('ctrl+left left shift+ctrl+left meta+C delete');
    t.deepEqual((state()), (['aa  cc', 3]));
    t.deepEqual((editor.clipboard_), ('bb'));
    fireKeyDownSeq('meta+V');
    t.deepEqual((state()), ([s, 5]));
    t.deepEqual((editor.clipboard_), ('bb'));

    fireKeyDownSeq('meta+A meta+C');
    t.deepEqual((editor.clipboard_), (t));
    fireKeyDownSeq('meta+V meta+V');
    t.deepEqual((state()), ([t + t, 16]));
    t.deepEqual((editor.clipboard_), (t));
  });

  it('multiple cut/copy commands', function() {
    var s = 'abcd';
    type(s);
    fireKeyDownSeq('shift+left meta+C');
    t.deepEqual((state()), ([s, 4, 3]));
    t.deepEqual((editor.clipboard_), ('d'));
    fireKeyDownSeq('left shift+home meta+C');
    t.deepEqual((state()), ([s, 3, 0]));
    t.deepEqual((editor.clipboard_), ('abc'));
    fireKeyDownSeq('shift+right meta+X');
    t.deepEqual((state()), (['ad', 1]));
    t.deepEqual((editor.clipboard_), ('bc'));
  });

  it('change selection, then paste', function() {
    type('ab');
    fireKeyDownSeq('shift+left meta+C left meta+V');
    t.deepEqual((state()), (['abb', 2]));
    fireKeyDownSeq('ctrl+shift+left meta+V');
    t.deepEqual((state()), (['bb', 1]));
  });
});

describe('Editor mouse', function() {
  beforeEach(function() {
    resetEditor();
    t.deepEqual((state()), (['', 0]));
  });
});

describe('HtmlSizer_', function() {
  var hs;

  beforeEach(function() {
    var parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    hs = new goatee.ed.HtmlSizer_(parentEl);
  });

  it('size of one char', function() {
    t.deepEqual((hs.size('W')), ([W_WIDTH, W_HEIGHT]));
  });

  it('size of two chars', function() {
    t.deepEqual((hs.size('WW')), ([2 * W_WIDTH, W_HEIGHT]));
  });

  it('width calls size', function() {
    spyOn(hs, 'size').andCallThrough();
    hs.width('hi');
    expect(hs.size).toHaveBeenCalledWith('hi');
  });
});
