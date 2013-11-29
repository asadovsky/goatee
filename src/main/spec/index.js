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

// http://stackoverflow.com/questions/8942678/keyboardevent-in-chrome-keycode-is-0
// This is a good example of where using jQuery would've saved time.
var makeKeyPressEvent = function(k) {
  console.assert(k.length === 1, k);
  var e = document.createEvent('Events');
  // KeyboardEvents bubble and are cancelable.
  // https://developer.mozilla.org/en-US/docs/Web/API/event.initEvent
  e.initEvent('keypress', true, true);
  e.which = k.charCodeAt(0);
  return e;
};

// See comments for makeKeyPressEvent.
// Here, cmd can be 'ctrl+c', 'shift+left', etc. Modifier keys must come before
// the actual key.
var makeKeyDownEvent = function(cmd) {
  console.assert(cmd.length > 0);
  var lastPlus = cmd.lastIndexOf('+');
  var key = lastPlus === -1 ? cmd : cmd.substr(lastPlus + 1);
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

var type = function(text) {
  for (var i = 0; i < text.length; i++) {
    document.dispatchEvent(makeKeyPressEvent(text[i]));
  }
};

var keyDownSeq = function(seq) {
  var arr = seq.split(' ');
  for (var i = 0; i < arr.length; i++) {
    document.dispatchEvent(makeKeyDownEvent(arr[i]));
  }
};

var text = function() {
  return ed.text;
};

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
    keyDownSeq('a');
    expect(tc()).toEqual(['', 0]);
  });

  it('insert, move', function() {
    keyDownSeq('left right left');
    expect(tc()).toEqual(['', 0]);
    type('abc');
    expect(tc()).toEqual(['abc', 3]);
    keyDownSeq('right');
    expect(cpos()).toEqual(3);
    keyDownSeq('left');
    expect(cpos()).toEqual(2);
    type('de');
    expect(tc()).toEqual(['abdec', 4]);
    keyDownSeq('left left left left');
    expect(cpos()).toEqual(0);
    keyDownSeq('left');
    expect(cpos()).toEqual(0);
    type('fg');
    expect(tc()).toEqual(['fgabdec', 2]);
    keyDownSeq('right right left right');
    expect(cpos()).toEqual(4);
  });

  it('delete, backspace', function() {
    keyDownSeq('delete backspace');
    expect(tc()).toEqual(['', 0]);
    type('abc');
    keyDownSeq('backspace');
    expect(tc()).toEqual(['ab', 2]);
    keyDownSeq('delete left left');
    expect(tc()).toEqual(['ab', 0]);
    keyDownSeq('delete');
    expect(tc()).toEqual(['b', 0]);
    keyDownSeq('backspace right');
    expect(tc()).toEqual(['b', 1]);
    keyDownSeq('backspace');
    expect(tc()).toEqual(['', 0]);
    expect(tc()).toEqual(['', 0]);
  });

  it('home, end', function() {
    keyDownSeq('home end home');
    expect(tc()).toEqual(['', 0]);
    type('123');
    keyDownSeq('home');
    expect(cpos()).toEqual(0);
    keyDownSeq('end');
    expect(cpos()).toEqual(3);
    keyDownSeq('left home');
    expect(cpos()).toEqual(0);
    keyDownSeq('right end');
    expect(cpos()).toEqual(3);
  });

  it('ctrl+arrow', function() {
    type('aa bb  cc');
    expect(cpos()).toEqual(9);
    keyDownSeq('ctrl+left');
    expect(cpos()).toEqual(7);
    keyDownSeq('ctrl+left');
    expect(cpos()).toEqual(3);
    keyDownSeq('ctrl+left');
    expect(cpos()).toEqual(0);
    keyDownSeq('ctrl+left');
    expect(cpos()).toEqual(0);
    keyDownSeq('ctrl+right');
    expect(cpos()).toEqual(2);
    keyDownSeq('ctrl+right');
    expect(cpos()).toEqual(5);
    keyDownSeq('ctrl+right');
    expect(cpos()).toEqual(9);
    keyDownSeq('ctrl+right');
    expect(cpos()).toEqual(9);

    ed.reset();
    type('  ');
    expect(cpos()).toEqual(2);
    keyDownSeq('ctrl+left');
    expect(cpos()).toEqual(0);
    keyDownSeq('ctrl+right');
    expect(cpos()).toEqual(2);
    keyDownSeq('left ctrl+right');
    expect(cpos()).toEqual(2);
    keyDownSeq('left ctrl+left');
    expect(cpos()).toEqual(0);
  });

  it('ctrl+delete, ctrl+backspace', function() {
    keyDownSeq('ctrl+backspace ctrl+delete');
    expect(tc()).toEqual(['', 0]);

    type('aa bb  cc');
    expect(cpos()).toEqual(9);
    keyDownSeq('ctrl+delete');
    expect(tc()).toEqual(['aa bb  cc', 9]);
    keyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['aa bb  ', 7]);
    keyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['aa ', 3]);
    keyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['', 0]);

    type('aa bb  cc');
    keyDownSeq('home');
    expect(cpos()).toEqual(0);
    keyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['aa bb  cc', 0]);
    keyDownSeq('ctrl+delete');
    expect(tc()).toEqual([' bb  cc', 0]);
    keyDownSeq('ctrl+delete');
    expect(tc()).toEqual(['  cc', 0]);
    keyDownSeq('ctrl+delete');
    expect(tc()).toEqual(['', 0]);

    type(' ');
    expect(cpos()).toEqual(1);
    keyDownSeq('ctrl+backspace');
    expect(tc()).toEqual(['', 0]);
    type(' ');
    expect(cpos()).toEqual(1);
    keyDownSeq('ctrl+backspace');
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
