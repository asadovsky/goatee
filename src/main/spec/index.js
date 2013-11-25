// Unit tests for editor.
// References:
//  - http://pivotal.github.io/jasmine/
//  - http://sinonjs.org/
//
// TODO:
//  - up, down, ctrl+up, ctrl+down
//  - ctrl+backspace, ctrl+delete
//  - shift+arrow, shift+ctrl+arrow
//  - hit key when there's a selection
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
  console.assert(k.length === 1);
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
  var lastPlus = cmd.lastIndexOf('+');
  var key = lastPlus === -1 ? cmd : cmd.substr(lastPlus + 1);
  var e = document.createEvent('Events');
  e.initEvent('keydown', true, true);
  if (key.length > 1) {
    e.which = KEY_CODES[key];
  } else {
    e.which = key.charCodeAt(0);
  }
  e.shiftKey = cmd.indexOf('shift') !== -1;
  e.ctrlKey = cmd.indexOf('ctrl') !== -1;
  e.metaKey = cmd.indexOf('meta') !== -1;
  return e;
};

// For single chars, dispatches keypress. For all others, dispatches keydown.
var doKeySeq = function(seq) {
  var arr = seq.split(' ');
  for (var i = 0; i < arr.length; i++) {
    var s = arr[i];
    console.assert(s.length > 0);
    var e;
    if (s.length === 1) {
      e = makeKeyPressEvent(s);
    } else {
      e = makeKeyDownEvent(s);
    }
    document.dispatchEvent(e);
  }
};

var type = function(text) {
  for (var i = 0; i < text.length; i++) {
    document.dispatchEvent(makeKeyPressEvent(text[i]));
  }
};

var text = function() {
  var re = new RegExp(String.fromCharCode(160), 'g');  // &nbsp;
  return document.querySelector('#editor').textContent.replace(re, ' ');
};

var cpos = function() {
  return ed.cursor.pos.p;
};

describe('Editor', function() {
  beforeEach(function() {
    ed.reset();
  });

  it('handles keypress', function() {
    type('a');
    expect(text()).toEqual('a');
    type('a');
    expect(text()).toEqual('aa');
  });

  it('ignores keydown characters', function() {
    document.dispatchEvent(makeKeyDownEvent('a'));
    expect(text()).toEqual('');
  });

  it('basic key sequence', function() {
    type('abc');
    expect(text()).toEqual('abc');
    doKeySeq('backspace');
    expect(text()).toEqual('ab');
    doKeySeq('left left delete');
    expect(text()).toEqual('b');
    doKeySeq('delete');
    expect(text()).toEqual('');
    doKeySeq('delete backspace');
    expect(text()).toEqual('');
  });

  it('home end', function() {
    type('123');
    doKeySeq('home');
    expect(cpos()).toEqual(0);
    type('0');
    doKeySeq('end');
    expect(cpos()).toEqual(4);
    type('4');
    expect(text()).toEqual('01234');
  });

  it('ctrl arrow basics', function() {
    type('foo bar');
    doKeySeq('ctrl+left');
    type('a  ');
    expect(text()).toEqual('foo a  bar');
    doKeySeq('ctrl+left');
    doKeySeq('ctrl+left');
    doKeySeq('ctrl+right');
    type('b');
    expect(text()).toEqual('foob a  bar');
  });

  it('ctrl arrow cpos', function() {
    type('aa bb  cc');
    expect(cpos()).toEqual(9);
    doKeySeq('ctrl+left');
    expect(cpos()).toEqual(7);
    doKeySeq('ctrl+left');
    expect(cpos()).toEqual(3);
    doKeySeq('ctrl+left');
    expect(cpos()).toEqual(0);
    doKeySeq('ctrl+left');
    expect(cpos()).toEqual(0);
    doKeySeq('ctrl+right');
    expect(cpos()).toEqual(2);
    doKeySeq('ctrl+right');
    expect(cpos()).toEqual(5);
    doKeySeq('ctrl+right');
    expect(cpos()).toEqual(9);
    doKeySeq('ctrl+right');
    expect(cpos()).toEqual(9);
  });

  it('ctrl arrow cpos with space at end', function() {
    type(' ');
    expect(cpos()).toEqual(1);
    doKeySeq('ctrl+left');
    expect(cpos()).toEqual(0);
    doKeySeq('ctrl+right');
    expect(cpos()).toEqual(1);
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
