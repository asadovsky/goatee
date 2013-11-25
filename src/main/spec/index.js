// Unit tests for editor.

'use strict';

var W_WIDTH = 15;
var W_HEIGHT = 18;

var ED = $('#editor');

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
var makeKeyPressEvent = function(c) {
  var e = document.createEvent('Events');
  // KeyboardEvents bubble and are cancelable.
  // https://developer.mozilla.org/en-US/docs/Web/API/event.initEvent
  e.initEvent('keypress', true, true);
  e.which = c.charCodeAt(0);
  return e;
};

// See comments for makeKeyPressEvent.
// Here, key can be a name like 'delete' or a character like 'c', and extras
// should contain any extra keys ('shift', 'ctrl', 'meta').
var makeKeyDownEvent = function(key, extras) {
  var e = document.createEvent('Events');
  e.initEvent('keydown', true, true);
  if (key.length > 1) {
    e.which = KEY_CODES[key];
  } else {
    e.which = key.charCodeAt(0);
  }
  e.shiftKey = extras.indexOf('shift') !== -1;
  e.ctrlKey = extras.indexOf('shift') !== -1;
  e.metaKey = extras.indexOf('shift') !== -1;
  return e;
};

describe('Editor', function() {
  beforeEach(function() {
    ed.reset();
  });

  it('handles keypress', function() {
    var e = makeKeyPressEvent('W');
    document.dispatchEvent(e);
    expect(ED.text()).toEqual('W');
    document.dispatchEvent(e);
    expect(ED.text()).toEqual('WW');
  });

  it('ignores keydown characters', function() {
    var e = makeKeyDownEvent('W', '');
    document.dispatchEvent(e);
    expect(ED.text()).toEqual('');
  });
});

describe('HtmlSizer', function() {
  it('calculates a size of a W correctly', function() {
    var parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    var htmlSizer = new HtmlSizer(parentEl);
    expect(htmlSizer.size('W')).toEqual([W_WIDTH, W_HEIGHT]);
  });

  it('calls size when width is called', function() {
    var parentEl = document.createElement('div');
    document.body.appendChild(parentEl);
    var htmlSizer = new HtmlSizer(parentEl);
    spyOn(htmlSizer, 'size').andCallThrough();
    htmlSizer.width('hi');
    expect(htmlSizer.size).toHaveBeenCalledWith('hi');
  });
});
