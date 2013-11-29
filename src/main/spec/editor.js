// Unit tests for editor.
// References:
//  - http://pivotal.github.io/jasmine/
//  - http://sinonjs.org/
//
// TODO:
//  - shift+arrow, shift+ctrl+arrow
//  - hit key when there's a selection
//  - up, down, ctrl+up, ctrl+down
//  - hit end key when line does not end in \r
//  - rendering

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

// Returns the editor text content.
var text = function() {
  return ed.text;
};

// Returns the editor cursor position.
var cpos = function() {
  return ed.cursor.pos.p;
};

var tc = function() {
  return [text(), cpos()];
};

describe('Editor', function() {
  beforeEach(function() {
    ed.reset();
    expect(tc()).toEqual(['', 0]);
  });

  it('inserts keypress chars', function() {
    type('a');
    expect(tc()).toEqual(['a', 1]);
    type('a');
    expect(tc()).toEqual(['aa', 2]);
  });

  it('ignores keydown chars', function() {
    fireKeyDownSeq('a');
    expect(tc()).toEqual(['', 0]);
  });

  it('insert, move', function() {
    fireKeyDownSeq('left right left');
    expect(tc()).toEqual(['', 0]);
    type('abc');
    expect(tc()).toEqual(['abc', 3]);
    fireKeyDownSeq('right');
    expect(cpos()).toEqual(3);
    fireKeyDownSeq('left');
    expect(cpos()).toEqual(2);
    type('de');
    expect(tc()).toEqual(['abdec', 4]);
    fireKeyDownSeq('left left left left');
    expect(cpos()).toEqual(0);
    fireKeyDownSeq('left');
    expect(cpos()).toEqual(0);
    type('fg');
    expect(tc()).toEqual(['fgabdec', 2]);
    fireKeyDownSeq('right right left right');
    expect(cpos()).toEqual(4);
  });

  it('delete, backspace', function() {
    fireKeyDownSeq('delete backspace');
    expect(tc()).toEqual(['', 0]);
    type('abc');
    fireKeyDownSeq('backspace');
    expect(tc()).toEqual(['ab', 2]);
    fireKeyDownSeq('delete left left');
    expect(tc()).toEqual(['ab', 0]);
    fireKeyDownSeq('delete');
    expect(tc()).toEqual(['b', 0]);
    fireKeyDownSeq('backspace right');
    expect(tc()).toEqual(['b', 1]);
    fireKeyDownSeq('backspace');
    expect(tc()).toEqual(['', 0]);
    expect(tc()).toEqual(['', 0]);
  });

  it('home, end', function() {
    fireKeyDownSeq('home end home');
    expect(tc()).toEqual(['', 0]);
    type('123');
    fireKeyDownSeq('home');
    expect(cpos()).toEqual(0);
    fireKeyDownSeq('end');
    expect(cpos()).toEqual(3);
    fireKeyDownSeq('left home');
    expect(cpos()).toEqual(0);
    fireKeyDownSeq('right end');
    expect(cpos()).toEqual(3);
  });

  it('ctrl+arrow', function() {
    type('aa bb  cc');
    expect(cpos()).toEqual(9);
    fireKeyDownSeq('ctrl+left');
    expect(cpos()).toEqual(7);
    fireKeyDownSeq('ctrl+left');
    expect(cpos()).toEqual(3);
    fireKeyDownSeq('ctrl+left');
    expect(cpos()).toEqual(0);
    fireKeyDownSeq('ctrl+left');
    expect(cpos()).toEqual(0);
    fireKeyDownSeq('ctrl+right');
    expect(cpos()).toEqual(2);
    fireKeyDownSeq('ctrl+right');
    expect(cpos()).toEqual(5);
    fireKeyDownSeq('ctrl+right');
    expect(cpos()).toEqual(9);
    fireKeyDownSeq('ctrl+right');
    expect(cpos()).toEqual(9);

    ed.reset();
    type('  ');
    expect(cpos()).toEqual(2);
    fireKeyDownSeq('ctrl+left');
    expect(cpos()).toEqual(0);
    fireKeyDownSeq('ctrl+right');
    expect(cpos()).toEqual(2);
    fireKeyDownSeq('left ctrl+right');
    expect(cpos()).toEqual(2);
    fireKeyDownSeq('left ctrl+left');
    expect(cpos()).toEqual(0);
  });

  it('ctrl+delete, ctrl+backspace', function() {
    fireKeyDownSeq('ctrl+backspace ctrl+delete');
    expect(tc()).toEqual(['', 0]);

    type('aa bb  cc');
    expect(cpos()).toEqual(9);
    fireKeyDownSeq('ctrl+delete');
    expect(tc()).toEqual(['aa bb  cc', 9]);
    fireKeyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['aa bb  ', 7]);
    fireKeyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['aa ', 3]);
    fireKeyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['', 0]);

    type('aa bb  cc');
    fireKeyDownSeq('home');
    expect(cpos()).toEqual(0);
    fireKeyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['aa bb  cc', 0]);
    fireKeyDownSeq('ctrl+delete');
    expect(tc()).toEqual([' bb  cc', 0]);
    fireKeyDownSeq('ctrl+delete');
    expect(tc()).toEqual(['  cc', 0]);
    fireKeyDownSeq('ctrl+delete');
    expect(tc()).toEqual(['', 0]);

    type(' ');
    expect(cpos()).toEqual(1);
    fireKeyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['', 0]);
    type(' ');
    expect(cpos()).toEqual(1);
    fireKeyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['', 0]);
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
