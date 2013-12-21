// Unit tests for editor.
// References:
//  - http://pivotal.github.io/jasmine/
//  - http://sinonjs.org/
//
// TODO:
//  - Mouse tests
//  - Add tests where we apply the same operations in textarea and editor, then
//    compare state
//  - Add tests for rendering, perhaps using Depicted
//    https://github.com/bslatkin/dpxdt

'use strict';

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
var makeKeyPressEvent = function(k) {
  console.assert(k.length === 1, k);
  // http://stackoverflow.com/questions/8942678/keyboardevent-in-chrome-keycode-is-0
  // This is a good example of where using jQuery would've probably saved time.
  var e = document.createEvent('Events');
  // KeyboardEvents bubble and are cancelable.
  // https://developer.mozilla.org/en-US/docs/Web/API/event.initEvent
  e.initEvent('keypress', true, true);
  e.which = k.charCodeAt(0);
  return e;
};

// Returns a keydown event for the given key combination. Here, cmd can be
// 'ctrl+c', 'shift+left', 'end', etc. or a single character. Modifier keys must
// precede the primary key.
var makeKeyDownEvent = function(cmd) {
  console.assert(cmd.length > 0);
  var lastPlus = cmd.lastIndexOf('+');
  var key = lastPlus === -1 ? cmd : cmd.substr(lastPlus + 1);
  // See comments in makeKeyPressEvent.
  var e = document.createEvent('Events');
  e.initEvent('keydown', true, true);
  if (key.length > 1) {
    console.assert(KEY_CODES[key] !== undefined, key);
    e.which = KEY_CODES[key];
  } else {
    e.which = key.charCodeAt(0);
  }
  e.shiftKey = cmd.indexOf('shift') !== -1;
  e.ctrlKey = cmd.indexOf('ctrl') !== -1;
  e.metaKey = cmd.indexOf('meta') !== -1;
  return e;
};

// Simulates typing the given text at the current cursor position.
var type = function(text) {
  for (var i = 0; i < text.length; i++) {
    document.dispatchEvent(makeKeyPressEvent(text[i]));
  }
};

// Fires the given sequence of keydown commands.
var fireKeyDownSeq = function(seq) {
  var arr = seq.split(' ');
  for (var i = 0; i < arr.length; i++) {
    document.dispatchEvent(makeKeyDownEvent(arr[i]));
  }
};

// Returns the current text content.
var text = function() {
  return editor.text_;
};

// Returns the current cursor position.
var curp = function() {
  return editor.cursor_.pos.p;
};

// Returns the current cursor [p, row, left].
var curState = function() {
  var pos = editor.cursor_.pos;
  return [pos.p, pos.row, pos.left];
};

// Returns the current selection start position, or null if there's no
// selection.
var selp = function() {
  if (editor.cursor_.sel === null) return null;
  return editor.cursor_.sel.p;
};

// Returns the current editor state: text, curp, selp, etc.
var state = function() {
  if (selp() === null) {
    return [text(), curp()];
  } else {
    return [text(), curp(), selp()];
  }
};

// Returns a string containing s repeated n times.
var repeat = function(s, n) {
  var res = '';
  for (var i = 0; i < n; i++) res += s;
  return res;
};

describe('Editor keyboard basics', function() {
  beforeEach(function() {
    editor.reset();
    expect(state()).toEqual(['', 0]);
  });

  it('keypress inserts chars', function() {
    type('a');
    expect(state()).toEqual(['a', 1]);
    type('a');
    expect(state()).toEqual(['aa', 2]);
  });

  it('keydown ignores chars', function() {
    fireKeyDownSeq('a');
    expect(state()).toEqual(['', 0]);
  });

  it('insert and left/right', function() {
    fireKeyDownSeq('left right left');
    expect(state()).toEqual(['', 0]);
    type('abc');
    expect(state()).toEqual(['abc', 3]);
    fireKeyDownSeq('right');
    expect(curp()).toEqual(3);
    fireKeyDownSeq('left');
    expect(curp()).toEqual(2);
    type('de');
    expect(state()).toEqual(['abdec', 4]);
    fireKeyDownSeq('left left left left');
    expect(curp()).toEqual(0);
    fireKeyDownSeq('left');
    expect(curp()).toEqual(0);
    type('fg');
    expect(state()).toEqual(['fgabdec', 2]);
    fireKeyDownSeq('right right left right');
    expect(curp()).toEqual(4);

    // Now with some newline chars.
    type('h\rij\r');
    expect(state()).toEqual(['fgabh\rij\rdec', 9]);
    fireKeyDownSeq('left left left left left');
    expect(curp()).toEqual(4);
    fireKeyDownSeq('right right right right right');
    expect(curp()).toEqual(9);
  });

  it('delete/backspace', function() {
    fireKeyDownSeq('delete backspace');
    expect(state()).toEqual(['', 0]);
    type('abc');
    fireKeyDownSeq('backspace');
    expect(state()).toEqual(['ab', 2]);
    fireKeyDownSeq('delete left left');
    expect(state()).toEqual(['ab', 0]);
    fireKeyDownSeq('delete');
    expect(state()).toEqual(['b', 0]);
    fireKeyDownSeq('backspace right');
    expect(state()).toEqual(['b', 1]);
    fireKeyDownSeq('backspace');
    expect(state()).toEqual(['', 0]);

    // Now with some newline chars.
    type('h\rij\rk');
    fireKeyDownSeq('left left left');
    expect(state()).toEqual(['h\rij\rk', 3]);
    fireKeyDownSeq('backspace backspace delete delete');
    expect(state()).toEqual(['hk', 1]);
  });

  it('home/end', function() {
    fireKeyDownSeq('home end home');
    expect(state()).toEqual(['', 0]);
    type('123');
    fireKeyDownSeq('home');
    expect(curp()).toEqual(0);
    fireKeyDownSeq('end');
    expect(curp()).toEqual(3);
    fireKeyDownSeq('left home');
    expect(curp()).toEqual(0);
    fireKeyDownSeq('right end');
    expect(curp()).toEqual(3);
  });

  it('home/end with newlines', function() {
    type('123\r456\r789');
    expect(curp()).toEqual(11);
    fireKeyDownSeq('end');
    expect(curp()).toEqual(11);
    fireKeyDownSeq('home');
    expect(curp()).toEqual(8);
    fireKeyDownSeq('home');
    expect(curp()).toEqual(8);
    fireKeyDownSeq('left');
    expect(curp()).toEqual(7);
    fireKeyDownSeq('end');
    expect(curp()).toEqual(7);
    fireKeyDownSeq('home');
    expect(curp()).toEqual(4);
    fireKeyDownSeq('home');
    expect(curp()).toEqual(4);
    fireKeyDownSeq('left');
    expect(curp()).toEqual(3);
    fireKeyDownSeq('end');
    expect(curp()).toEqual(3);
    fireKeyDownSeq('home');
    expect(curp()).toEqual(0);
    fireKeyDownSeq('home');
    expect(curp()).toEqual(0);
  });

  it('ctrl+left/right', function() {
    var t = 'aa bb  cc';
    type(t);
    expect(state()).toEqual([t, 9]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 7]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 3]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 0]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 0]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 2]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 5]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 9]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 9]);

    // Non-alphanumeric chars (including newlines and periods) should behave the
    // same way as spaces.
    editor.reset();
    t = 'aa+/.\r|3a';
    type(t);
    expect(state()).toEqual([t, 9]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 7]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 0]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 2]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 9]);

    // Leading and trailing spaces.
    editor.reset();
    t = '  ';
    type(t);
    expect(state()).toEqual([t, 2]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 0]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 2]);
    fireKeyDownSeq('left ctrl+right');
    expect(state()).toEqual([t, 2]);
    fireKeyDownSeq('left ctrl+left');
    expect(state()).toEqual([t, 0]);
  });

  it('ctrl+delete, ctrl+backspace', function() {
    fireKeyDownSeq('ctrl+backspace ctrl+delete');
    expect(state()).toEqual(['', 0]);

    type('aa bb  cc');
    expect(curp()).toEqual(9);
    fireKeyDownSeq('ctrl+delete');
    expect(state()).toEqual(['aa bb  cc', 9]);
    fireKeyDownSeq('ctrl+backspace');
    expect(state()).toEqual(['aa bb  ', 7]);
    fireKeyDownSeq('ctrl+backspace');
    expect(state()).toEqual(['aa ', 3]);
    fireKeyDownSeq('ctrl+backspace');
    expect(state()).toEqual(['', 0]);

    type('aa bb  cc');
    fireKeyDownSeq('home');
    expect(curp()).toEqual(0);
    fireKeyDownSeq('ctrl+backspace');
    expect(state()).toEqual(['aa bb  cc', 0]);
    fireKeyDownSeq('ctrl+delete');
    expect(state()).toEqual([' bb  cc', 0]);
    fireKeyDownSeq('ctrl+delete');
    expect(state()).toEqual(['  cc', 0]);
    fireKeyDownSeq('ctrl+delete');
    expect(state()).toEqual(['', 0]);

    type(' ');
    expect(curp()).toEqual(1);
    fireKeyDownSeq('ctrl+backspace');
    expect(state()).toEqual(['', 0]);
    type(' ');
    expect(curp()).toEqual(1);
    fireKeyDownSeq('home ctrl+delete');
    expect(state()).toEqual(['', 0]);
  });

  it('shift+left/right', function() {
    fireKeyDownSeq('shift+left shift+right shift+left');
    expect(state()).toEqual(['', 0]);

    var t = 'abc';
    type(t);
    expect(state()).toEqual([t, 3]);
    fireKeyDownSeq('shift+left');
    expect(state()).toEqual([t, 2, 3]);
    fireKeyDownSeq('shift+left');
    expect(state()).toEqual([t, 1, 3]);
    fireKeyDownSeq('shift+right');
    expect(state()).toEqual([t, 2, 3]);
    fireKeyDownSeq('shift+right');
    expect(state()).toEqual([t, 3]);
    fireKeyDownSeq('home shift+right');
    expect(state()).toEqual([t, 1, 0]);
    fireKeyDownSeq('shift+left');
    expect(state()).toEqual([t, 0]);
  });

  // Mostly copied from ctrl+left/right test.
  it('shift+ctrl+left/right', function() {
    var t = 'aa bb  cc';
    type(t);
    expect(state()).toEqual([t, 9]);
    fireKeyDownSeq('shift+ctrl+left');
    expect(state()).toEqual([t, 7, 9]);
    fireKeyDownSeq('shift+ctrl+left');
    expect(state()).toEqual([t, 3, 9]);
    fireKeyDownSeq('shift+ctrl+left');
    expect(state()).toEqual([t, 0, 9]);
    fireKeyDownSeq('shift+ctrl+left');
    expect(state()).toEqual([t, 0, 9]);
    fireKeyDownSeq('shift+ctrl+right');
    expect(state()).toEqual([t, 2, 9]);
    fireKeyDownSeq('shift+ctrl+right');
    expect(state()).toEqual([t, 5, 9]);
    fireKeyDownSeq('shift+ctrl+right');
    expect(state()).toEqual([t, 9]);
    fireKeyDownSeq('shift+ctrl+right');
    expect(state()).toEqual([t, 9]);

    // Make sure that shift+ctrl+left can also drop the selection.
    fireKeyDownSeq('home right right right');
    expect(state()).toEqual([t, 3]);
    fireKeyDownSeq('shift+ctrl+right');
    expect(state()).toEqual([t, 5, 3]);
    fireKeyDownSeq('shift+ctrl+left');
    expect(state()).toEqual([t, 3]);

    // Leading and trailing spaces.
    editor.reset();
    t = '  ';
    type(t);
    expect(state()).toEqual([t, 2]);
    fireKeyDownSeq('shift+ctrl+left');
    expect(state()).toEqual([t, 0, 2]);
    fireKeyDownSeq('shift+ctrl+right');
    expect(state()).toEqual([t, 2]);
    fireKeyDownSeq('left shift+ctrl+right');
    expect(state()).toEqual([t, 2, 1]);
    fireKeyDownSeq('left shift+ctrl+left');
    expect(state()).toEqual([t, 0, 1]);
  });

  it('shift+home/end', function() {
    fireKeyDownSeq('shift+home shift+end shift+home');
    expect(state()).toEqual(['', 0]);

    var t = 'abc';
    type(t);
    expect(state()).toEqual([t, 3]);
    fireKeyDownSeq('shift+home');
    expect(state()).toEqual([t, 0, 3]);
    fireKeyDownSeq('shift+end');
    expect(state()).toEqual([t, 3]);
    fireKeyDownSeq('ctrl+left shift+end');
    expect(state()).toEqual([t, 3, 0]);
    fireKeyDownSeq('shift+home');
    expect(state()).toEqual([t, 0]);
  });

  it('select, then type', function() {
    type('abc');
    fireKeyDownSeq('shift+left');
    type('de');
    expect(state()).toEqual(['abde', 4]);
    fireKeyDownSeq('shift+ctrl+left shift+right');
    type('fg');
    expect(state()).toEqual(['afg', 3]);
  });

  it('select, then left/right', function() {
    var t = ' aa bb cc ';
    type(t);

    fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
    expect(state()).toEqual([t, 4, 6]);
    fireKeyDownSeq('left');
    expect(state()).toEqual([t, 4]);
    fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
    expect(state()).toEqual([t, 4, 6]);
    fireKeyDownSeq('right');
    expect(state()).toEqual([t, 6]);

    fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
    expect(state()).toEqual([t, 6, 4]);
    fireKeyDownSeq('left');
    expect(state()).toEqual([t, 4]);
    fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
    expect(state()).toEqual([t, 6, 4]);
    fireKeyDownSeq('right');
    expect(state()).toEqual([t, 6]);
  });

  it('select, then ctrl+left/right', function() {
    var t = ' aa bb cc ';
    type(t);

    fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
    expect(state()).toEqual([t, 4, 6]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 1]);
    fireKeyDownSeq('end ctrl+left left shift+ctrl+left');
    expect(state()).toEqual([t, 4, 6]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 9]);

    fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
    expect(state()).toEqual([t, 6, 4]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 1]);
    fireKeyDownSeq('home ctrl+right right shift+ctrl+right');
    expect(state()).toEqual([t, 6, 4]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 9]);
  });

  it('select, then home/end', function() {
    var t = ' ab ';
    type(t);

    fireKeyDownSeq('shift+left home');
    expect(state()).toEqual([t, 0]);
    fireKeyDownSeq('shift+right home');
    expect(state()).toEqual([t, 0]);
    fireKeyDownSeq('ctrl+shift+right home');
    expect(state()).toEqual([t, 0]);
    fireKeyDownSeq('ctrl+right ctrl+shift+left home');
    expect(state()).toEqual([t, 0]);

    fireKeyDownSeq('shift+right end');
    expect(state()).toEqual([t, 4]);
    fireKeyDownSeq('shift+left end');
    expect(state()).toEqual([t, 4]);
    fireKeyDownSeq('ctrl+shift+left end');
    expect(state()).toEqual([t, 4]);
    fireKeyDownSeq('ctrl+left ctrl+shift+right end');
    expect(state()).toEqual([t, 4]);
  });
});

describe('Editor rendering', function() {
  beforeEach(function() {
    editor.reset();
    expect(state()).toEqual(['', 0]);
  });

  it('innerWidth', function() {
    // Tests below assume that one line can fit 37 W's.
    expect(Math.floor(editor.innerWidth_ / W_WIDTH)).toEqual(37);
  });

  it('home/end with wrapped line', function() {
    var t = repeat('W', 50);
    type(t);
    expect(state()).toEqual([t, 50]);

    fireKeyDownSeq('end');
    expect(curState()).toEqual([50, 1, 13 * W_WIDTH]);
    fireKeyDownSeq('home');
    expect(curState()).toEqual([37, 1, 0]);
    fireKeyDownSeq('home');
    expect(curState()).toEqual([37, 1, 0]);
    fireKeyDownSeq('left');
    expect(curState()).toEqual([36, 0, 36 * W_WIDTH]);
    fireKeyDownSeq('end');
    expect(curState()).toEqual([37, 0, 37 * W_WIDTH]);
    fireKeyDownSeq('end');
    expect(curState()).toEqual([37, 0, 37 * W_WIDTH]);
    fireKeyDownSeq('right');
    expect(curState()).toEqual([38, 1, W_WIDTH]);
    fireKeyDownSeq('home');
    expect(curState()).toEqual([37, 1, 0]);
    fireKeyDownSeq('end');
    expect(curState()).toEqual([50, 1, 13 * W_WIDTH]);

    // This time, a wrapped line with a space.
    editor.reset();
    var w29_w20 = repeat('W', 29) + ' ' + repeat('W', 20);
    type(w29_w20);
    expect(state()).toEqual([w29_w20, 50]);

    fireKeyDownSeq('end');
    expect(curState()).toEqual([50, 1, 20 * W_WIDTH]);
    fireKeyDownSeq('home');
    expect(curState()).toEqual([30, 1, 0]);
    fireKeyDownSeq('home');
    expect(curState()).toEqual([30, 1, 0]);
    fireKeyDownSeq('left');
    expect(curState()).toEqual([29, 0, 29 * W_WIDTH]);
    fireKeyDownSeq('end');
    expect(curState()).toEqual([30, 0, 29 * W_WIDTH + SPACE_WIDTH]);
    fireKeyDownSeq('end');
    expect(curState()).toEqual([30, 0, 29 * W_WIDTH + SPACE_WIDTH]);
    fireKeyDownSeq('right');
    expect(curState()).toEqual([31, 1, W_WIDTH]);
    fireKeyDownSeq('home');
    expect(curState()).toEqual([30, 1, 0]);
    fireKeyDownSeq('end');
    expect(curState()).toEqual([50, 1, 20 * W_WIDTH]);
  });

  it('up/down', function() {
    var w10 = repeat('W', 10);
    type(w10 + '\r' +
         w10 + w10 + '\r' +
         w10 + '\r' +
         '\r' +
         w10 + w10);

    expect(curState()).toEqual([64, 4, 20 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([43, 3, 0]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([42, 2, 10 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([31, 1, 20 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([10, 0, 10 * W_WIDTH]);
    // Extra up.
    fireKeyDownSeq('up');
    expect(curState()).toEqual([10, 0, 10 * W_WIDTH]);

    fireKeyDownSeq('left');
    expect(curState()).toEqual([9, 0, 9 * W_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([20, 1, 9 * W_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([41, 2, 9 * W_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([43, 3, 0]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([53, 4, 9 * W_WIDTH]);
    // Extra down.
    fireKeyDownSeq('down');
    expect(curState()).toEqual([53, 4, 9 * W_WIDTH]);

    fireKeyDownSeq('home');
    expect(curState()).toEqual([44, 4, 0]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([43, 3, 0]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([32, 2, 0]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([11, 1, 0]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([0, 0, 0]);
  });

  it('up/down with wrapped line', function() {
    var w10 = repeat('W', 10);
    var w50 = repeat('W', 50);
    type(w50 + '\r\r' + w50 + '\r' + w10);

    expect(curState()).toEqual([52 + 51 + 10, 5, 10 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([52 + 37 + 10, 4, 10 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([52 + 10, 3, 10 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([51, 2, 0]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([37 + 10, 1, 10 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([10, 0, 10 * W_WIDTH]);

    fireKeyDownSeq('end');
    expect(curState()).toEqual([37, 0, 37 * W_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([50, 1, 13 * W_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([51, 2, 0]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([52 + 37, 3, 37 * W_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([52 + 50, 4, 13 * W_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([52 + 51 + 10, 5, 10 * W_WIDTH]);

    // This time, a wrapped line with a space.
    editor.reset();
    var w10 = repeat('W', 10);
    var w29_w18_w = repeat('W', 29) + ' ' + repeat('W', 18) + ' ' + 'W';
    type(w29_w18_w + '\r\r' + w29_w18_w + '\r' + w10);

    expect(curState()).toEqual([52 + 51 + 10, 5, 10 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([52 + 30 + 10, 4, 10 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([52 + 10, 3, 10 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([51, 2, 0]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([30 + 10, 1, 10 * W_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([10, 0, 10 * W_WIDTH]);

    fireKeyDownSeq('end');
    expect(curState()).toEqual([30, 0, 29 * W_WIDTH + SPACE_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([50, 1, 19 * W_WIDTH + SPACE_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([51, 2, 0]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([52 + 30, 3, 29 * W_WIDTH + SPACE_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([52 + 50, 4, 19 * W_WIDTH + SPACE_WIDTH]);
    fireKeyDownSeq('down');
    expect(curState()).toEqual([52 + 51 + 10, 5, 10 * W_WIDTH]);
  });

  it('up/down with chars of different widths', function() {
    type('W\rTT\rW \rTW\r    \rW\r');
    // This test relies on the following invariants.
    expect(T_WIDTH * 1.5).toEqual(W_WIDTH);
    expect(SPACE_WIDTH * 2.5).toEqual(T_WIDTH);
    // Initial cursor left is 0px.
    expect(curState()).toEqual([18, 6, 0]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([16, 5, 0]);
    fireKeyDownSeq('end');
    // Now, cursor left is 15px.
    expect(curState()).toEqual([17, 5, W_WIDTH]);
    fireKeyDownSeq('up');
    // 16px is closer than 12px.
    expect(curState()).toEqual([15, 4, 4 * SPACE_WIDTH]);
    fireKeyDownSeq('up');
    // 10px is closer than 25px.
    expect(curState()).toEqual([9, 3, T_WIDTH]);
    fireKeyDownSeq('down');
    // prevLeft should still be 15px (i.e. W_WIDTH).
    expect(curState()).toEqual([15, 4, 4 * SPACE_WIDTH]);
    fireKeyDownSeq('up up');
    expect(curState()).toEqual([6, 2, W_WIDTH]);
    fireKeyDownSeq('up');
    // 10px is closer than 20px (lower number wins ties).
    expect(curState()).toEqual([3, 1, T_WIDTH]);
    fireKeyDownSeq('up');
    expect(curState()).toEqual([1, 0, W_WIDTH]);
    fireKeyDownSeq('down home right down');
    expect(curState()).toEqual([6, 2, W_WIDTH]);
    fireKeyDownSeq('down down');
    // This time, prevLeft is 10px (i.e. T_WIDTH).
    // 8px is closer than 12px (lower number wins ties).
    expect(curState()).toEqual([13, 4, 2 * SPACE_WIDTH]);
    fireKeyDownSeq('down down down');
    expect(curState()).toEqual([18, 6, 0]);
  });

  it('ctrl+up/down', function() {
    // TODO
  });
});

// TODO: Test keyboard shortcuts on non-Mac (i.e. ctrlKey instead of metaKey).
describe('Editor keyboard shortcuts', function() {
  beforeEach(function() {
    editor.reset();
    expect(state()).toEqual(['', 0]);
  });

  it('select-all', function() {
    var t = ' aa bb ';
    type(t);
    expect(state()).toEqual([t, 7]);
    fireKeyDownSeq('meta+A');
    expect(state()).toEqual([t, 0, 7]);
  });

  it('cut, copy, paste', function() {
    var t = 'aa bb cc';
    type(t);

    expect(state()).toEqual([t, 8]);
    expect(editor.clipboard_).toEqual('');
    fireKeyDownSeq('meta+C meta+X meta+V');
    expect(state()).toEqual([t, 8]);
    expect(editor.clipboard_).toEqual('');

    fireKeyDownSeq('shift+ctrl+left meta+X');
    expect(state()).toEqual(['aa bb ', 6]);
    expect(editor.clipboard_).toEqual('cc');
    fireKeyDownSeq('meta+V');
    expect(state()).toEqual([t, 8]);
    expect(editor.clipboard_).toEqual('cc');

    fireKeyDownSeq('ctrl+left left shift+ctrl+left meta+C delete');
    expect(state()).toEqual(['aa  cc', 3]);
    expect(editor.clipboard_).toEqual('bb');
    fireKeyDownSeq('meta+V');
    expect(state()).toEqual([t, 5]);
    expect(editor.clipboard_).toEqual('bb');

    fireKeyDownSeq('meta+A meta+C');
    expect(editor.clipboard_).toEqual(t);
    fireKeyDownSeq('meta+V meta+V');
    expect(state()).toEqual([t + t, 16]);
    expect(editor.clipboard_).toEqual(t);
  });

  it('multiple cut/copy commands', function() {
    var t = 'abcd';
    type(t);
    fireKeyDownSeq('shift+left meta+C');
    expect(state()).toEqual([t, 3, 4]);
    expect(editor.clipboard_).toEqual('d');
    fireKeyDownSeq('left shift+home meta+C');
    expect(state()).toEqual([t, 0, 3]);
    expect(editor.clipboard_).toEqual('abc');
    fireKeyDownSeq('shift+right meta+X');
    expect(state()).toEqual(['ad', 1]);
    expect(editor.clipboard_).toEqual('bc');
  });

  it('change selection, then paste', function() {
    type('ab');
    fireKeyDownSeq('shift+left meta+C left meta+V');
    expect(state()).toEqual(['abb', 2]);
    fireKeyDownSeq('ctrl+shift+left meta+V');
    expect(state()).toEqual(['bb', 1]);
  });
});

describe('Editor mouse', function() {
  beforeEach(function() {
    editor.reset();
    expect(state()).toEqual(['', 0]);
  });
});

describe('HtmlSizer_', function() {
  var hs;

  beforeEach(function() {
    var parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    hs = new ed.HtmlSizer_(parentEl);
  });

  it('size of one char', function() {
    expect(hs.size('W')).toEqual([W_WIDTH, W_HEIGHT]);
  });

  it('size of two chars', function() {
    expect(hs.size('WW')).toEqual([2 * W_WIDTH, W_HEIGHT]);
  });

  it('width calls size', function() {
    spyOn(hs, 'size').andCallThrough();
    hs.width('hi');
    expect(hs.size).toHaveBeenCalledWith('hi');
  });
});
