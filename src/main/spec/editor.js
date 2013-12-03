// Unit tests for editor.
// References:
//  - http://pivotal.github.io/jasmine/
//  - http://sinonjs.org/
//
// TODO:
//  - up, down, ctrl+up, ctrl+down
//  - Hit end key when line does not end in \r
//  - Rendering

'use strict';

var W_WIDTH = 15;
var W_HEIGHT = 18;

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
  return ed.text;
};

// Returns the current cursor position.
var curp = function() {
  return ed.cursor.pos.p;
};

// Returns the current selection start position, or null if there's no
// selection.
var selp = function() {
  if (ed.cursor.sel === null) return null;
  return ed.cursor.sel.p;
};

// Returns the current editor state: text, curp, selp, etc.
var state = function() {
  if (selp() === null) {
    return [text(), curp()];
  } else {
    return [text(), curp(), selp()];
  }
};

describe('Editor keyboard basics', function() {
  beforeEach(function() {
    ed.reset();
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

  it('insert and move', function() {
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
    expect(state()).toEqual(['', 0]);
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

  it('ctrl+arrow', function() {
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

    // Non-alphanumeric chars should behave the same way as spaces.
    ed.reset();
    t = 'aa+/|3a';
    type(t);
    expect(state()).toEqual([t, 7]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 5]);
    fireKeyDownSeq('ctrl+left');
    expect(state()).toEqual([t, 0]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 2]);
    fireKeyDownSeq('ctrl+right');
    expect(state()).toEqual([t, 7]);

    // Leading and trailing space.
    ed.reset();
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
    fireKeyDownSeq('ctrl+backspace');
    expect(state()).toEqual(['', 0]);
  });

  it('shift+arrow', function() {
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

  // Mostly copied from ctrl+arrow test.
  it('shift+ctrl+arrow', function() {
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

    // Leading and trailing space.
    ed.reset();
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

  it('select, then arrow', function() {
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

  it('select, then ctrl+arrow', function() {
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

// TODO: Test keyboard shortcuts on non-Mac (i.e. ctrlKey instead of metaKey).
describe('Editor keyboard shortcuts', function() {
  beforeEach(function() {
    ed.reset();
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
    expect(ed.clipboard).toEqual('');
    fireKeyDownSeq('meta+C meta+X meta+V');
    expect(state()).toEqual([t, 8]);
    expect(ed.clipboard).toEqual('');

    fireKeyDownSeq('shift+ctrl+left meta+X');
    expect(state()).toEqual(['aa bb ', 6]);
    expect(ed.clipboard).toEqual('cc');
    fireKeyDownSeq('meta+V');
    expect(state()).toEqual([t, 8]);
    expect(ed.clipboard).toEqual('cc');

    fireKeyDownSeq('ctrl+left left shift+ctrl+left meta+C delete');
    expect(state()).toEqual(['aa  cc', 3]);
    expect(ed.clipboard).toEqual('bb');
    fireKeyDownSeq('meta+V');
    expect(state()).toEqual([t, 5]);
    expect(ed.clipboard).toEqual('bb');

    fireKeyDownSeq('meta+A meta+C');
    expect(ed.clipboard).toEqual(t);
    fireKeyDownSeq('meta+V meta+V');
    expect(state()).toEqual([t + t, 16]);
    expect(ed.clipboard).toEqual(t);
  });

  it('multiple cut/copy commands', function() {
    var t = 'abcd';
    type(t);
    fireKeyDownSeq('shift+left meta+C');
    expect(state()).toEqual([t, 3, 4]);
    expect(ed.clipboard).toEqual('d');
    fireKeyDownSeq('left shift+home meta+C');
    expect(state()).toEqual([t, 0, 3]);
    expect(ed.clipboard).toEqual('abc');
    fireKeyDownSeq('shift+right meta+X');
    expect(state()).toEqual(['ad', 1]);
    expect(ed.clipboard).toEqual('bc');
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
    ed.reset();
    expect(state()).toEqual(['', 0]);
  });
});

describe('HtmlSizer', function() {
  it('size of one char', function() {
    var parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    var htmlSizer = new HtmlSizer(parentEl);
    expect(htmlSizer.size('W')).toEqual([W_WIDTH, W_HEIGHT]);
  });

  it('size of two chars', function() {
    var parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    var htmlSizer = new HtmlSizer(parentEl);
    expect(htmlSizer.size('WW')).toEqual([2 * W_WIDTH, W_HEIGHT]);
  });

  it('width calls size', function() {
    var parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    var htmlSizer = new HtmlSizer(parentEl);
    spyOn(htmlSizer, 'size').andCallThrough();
    htmlSizer.width('hi');
    expect(htmlSizer.size).toHaveBeenCalledWith('hi');
  });
});
