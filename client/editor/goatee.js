// Implementation of Editor interface.
//
// TODO:
// - For faster text mutations, represent text using something like
//   https://github.com/josephg/jumprope
// - Make select-scroll smoother
// - Support bold, italics
// - Support font-size and line-height
// - Support non-ASCII characters
// - Fancier cut/copy/paste, see http://stackoverflow.com/q/9658282/316226
// - Support screen scaling
// - Consider using React
//
// OT-specific TODO:
// - Show other users' cursors/selections
// - Retain cursor_.prevLeft when applying non-local text mutations

'use strict';

var _ = require('lodash');
var inherits = require('inherits');

var constants = require('./constants');
var EditorInterface = require('./editor');
var HtmlSizer = require('./html_sizer');
var LocalModel = require('./local_model');
var util = require('../util');

inherits(Editor, EditorInterface);
module.exports = Editor;

var DEBUG = 0;

function createDiv(style) {
  var el = document.createElement('div');
  _.assign(el.style, constants.baseStyle, style);
  return el;
}

////////////////////////////////////////////////////////////////////////////////
// Cursor

function Cursor() {
  // If true, cursor should be rendered to the right of the char at offset p-1
  // rather than at the left edge of the char at offset p. This can happen when
  // user presses the "end" key or clicks past the end of a line.
  this.append = false;

  // Used for tracking previous left position in pixels, needed to implement
  // up/down arrows.
  this.prevLeft = null;

  // Used for rendering. Row is also needed to implement up/down arrows.
  this.row = 0;   // row (line number)
  this.left = 0;  // left position, in pixels

  this.blinkTimer_ = 0;

  this.el_ = createDiv({
    position: 'absolute',
    width: '2px',
    backgroundColor: '#000',
    zIndex: '2'
  });

  window.setInterval((function() {
    if (this.blinkTimer_ === -1) return;
    this.blinkTimer_ = (this.blinkTimer_ + 1) % 10;
    // Visible 60% of the time, hidden 40% of the time.
    this.el_.style.visibility = (this.blinkTimer_ < 6) ? 'visible' : 'hidden';
  }).bind(this), 100);
}

Cursor.prototype.show = function(blink) {
  this.blinkTimer_ = (blink ? 0 : -1);
  this.el_.style.visibility = 'visible';
};

Cursor.prototype.hide = function() {
  this.blinkTimer_ = -1;
  this.el_.style.visibility = 'hidden';
};

// Here, bottom means "distance from top of editor to bottom of cursor".
Cursor.prototype.move = function(left, bottom, height) {
  if (DEBUG) console.log(left, bottom, height);
  this.el_.style.left = left + 'px';
  this.el_.style.top = bottom - height + 'px';
  this.el_.style.height = height + 'px';
};

////////////////////////////////////////////////////////////////////////////////
// Editor

function Editor(el, model) {
  EditorInterface.call(this);
  this.el_ = el;

  // TODO: Use shadow DOM.
  _.assign(this.el_.style, constants.editorStyle);

  // Register input handlers.
  this.boundHandleMouseMove_ = this.handleMouseMove_.bind(this);
  document.addEventListener('keypress', this.handleKeyPress_.bind(this));
  document.addEventListener('keydown', this.handleKeyDown_.bind(this));
  document.addEventListener('mousedown', this.handleMouseDown_.bind(this));
  document.addEventListener('mouseup', this.handleMouseUp_.bind(this));

  // Handle focus and blur events, setting useCapture=true.
  this.el_.tabIndex = '0';
  this.el_.addEventListener('focus', this.handleFocus_.bind(this), true);
  this.el_.addEventListener('blur', this.handleBlur_.bind(this), true);
  window.addEventListener('blur', this.handleBlur_.bind(this));

  this.reset(model);
}

////////////////////////////////////////////////////////////////////////////////
// Public methods

Editor.prototype.reset = function(model) {
  // Remove any existing children, then add HtmlSizer.
  while (this.el_.firstChild) this.el_.removeChild(this.el_.firstChild);
  this.hs_ = new HtmlSizer(this.el_, constants.baseStyle);

  this.m_ = model || new LocalModel();

  // Register model event handlers.
  this.m_.on('insertText', this.handleInsertText_.bind(this));
  this.m_.on('deleteText', this.handleDeleteText_.bind(this));
  this.m_.on('setSelectionRange', this.handleSetSelectionRange_.bind(this));

  // Note: Internal UI state (e.g. charSizes_, linePOffsets_) lives in Editor,
  // not Model.

  // Reset internal state.
  this.hasFocus_ = false;
  this.mouseIsDown_ = false;

  this.clipboard_ = '';
  this.cursor_ = new Cursor();

  // Updated by insertText_ and deleteText_.
  this.charSizes_ = [];       // array of [width, height]
  // Updated by renderAll_.
  this.linePOffsets_ = null;  // array of [beginP, endP]
  this.lineYOffsets_ = null;  // array of [begin, end] px relative to window top

  this.textEl_ = createDiv();
  this.innerEl_ = createDiv({
    position: 'relative',
    width: '100%',
    minHeight: '100%',
    cursor: 'text'
  });
  this.innerEl_.appendChild(this.textEl_);
  this.innerEl_.appendChild(this.cursor_.el_);
  this.el_.appendChild(this.innerEl_);

  // Set fields that depend on DOM.
  this.borderWidth_ = parseInt(window.getComputedStyle(
    this.el_, null).getPropertyValue('border-top-width'), 10);
  this.width_ = parseInt(window.getComputedStyle(
    this.el_, null).getPropertyValue('width'), 10);
  this.innerWidth_ = parseInt(window.getComputedStyle(
    this.innerEl_, null).getPropertyValue('width'), 10);

  // Initialize charSizes_ to handle non-empty initial model state.
  this.initCharSizes_();
  this.renderAll_(true);
};

Editor.prototype.getText = function() {
  return this.m_.getText();
};

Editor.prototype.getSelectionRange = function() {
  return this.m_.getSelectionRange();
};

////////////////////////////////////////////////////////////////////////////////
// Model event handlers

Editor.prototype.handleInsertText_ = function(e) {
  var valueCharSizes = new Array(e.value.length);
  for (var i = 0; i < e.value.length; i++) {
    var c = e.value.charAt(i);
    valueCharSizes[i] = this.charSize_(c, e.pos + i);
  }
  this.charSizes_ = this.charSizes_.slice(0, e.pos).concat(
    valueCharSizes, this.charSizes_.slice(e.pos));
  this.renderAll_(e.isLocal);
};

Editor.prototype.handleDeleteText_ = function(e) {
  this.charSizes_.splice(e.pos, e.len);
  this.renderAll_(e.isLocal);
};

Editor.prototype.handleSetSelectionRange_ = function(e) {
  console.assert(e.isLocal);
  this.renderSelection_(true);
};

////////////////////////////////////////////////////////////////////////////////
// Utility methods

Editor.prototype.charSize_ = function(c, p) {
  // Note: It turns out that n*width(c) may not be equal to width(c.repeat(n)),
  // so we compute char width as width(c.repeat(n))/n, where n=8.
  var n = 8;
  var width = this.hs_.width(this.makeLineHtml_(c.repeat(n), p));
  // Compute height(c), not height(c.repeat(n)), since c could be a newline
  // character.
  var height = this.hs_.height(this.makeLineHtml_(c, p));
  return [width / n, height];
};

Editor.prototype.lineHeight_ = function(p) {
  return this.hs_.height(this.makeLineHtml_(' ', p));
};

Editor.prototype.initCharSizes_ = function() {
  var text = this.m_.getText();
  this.charSizes_ = new Array(text.length);
  for (var p = 0; p < text.length; p++) {
    var c = text.charAt(p);
    this.charSizes_[p] = this.charSize_(c, p);
  }
};

Editor.prototype.rowFromY_ = function(y) {
  var row;
  // TODO: Use binary search.
  for (row = 0; row < this.lineYOffsets_.length - 1; row++) {
    if (y <= this.lineYOffsets_[row][1]) break;
  }
  return row;
};

Editor.prototype.cursorHop_ = function(p, forward, hop) {
  var text = this.m_.getText();
  if (forward) {
    if (hop) {
      while (p < text.length && !util.isAlphaNum(text.charAt(p))) p++;
      while (p < text.length && util.isAlphaNum(text.charAt(p))) p++;
    } else if (p < text.length) {
      p++;
    }
  } else {  // backward
    if (hop) {
      while (p > 0 && !util.isAlphaNum(text.charAt(p - 1))) p--;
      while (p > 0 && util.isAlphaNum(text.charAt(p - 1))) p--;
    } else if (p > 0) {
      p--;
    }
  }
  return p;
};

Editor.prototype.getSelectionOrNull_ = function() {
  var tup = this.m_.getSelectionRange(), selStart = tup[0], selEnd = tup[1];
  if (selStart === selEnd) {
    return null;
  } else if (selStart < selEnd) {
    return [selStart, selEnd];
  } else {
    return [selEnd, selStart];
  }
};

Editor.prototype.getCursorPos_ = function() {
  var tup = this.m_.getSelectionRange(), selStart = tup[0], selEnd = tup[1];
  console.assert(selStart === selEnd);
  return selEnd;
};

////////////////////////////////////////////////////////////////////////////////
// Selection state update methods

// Updates state given p (offset), then renders selection.
Editor.prototype.setSelectionFromP_ = function(p, updateSelStart) {
  this.cursor_.prevLeft = null;
  this.cursor_.append = false;

  if (!updateSelStart) {
    this.m_.setSelectionRange(this.m_.getSelectionRange()[0], p);
  } else {
    this.m_.setSelectionRange(p, p);
  }
};

// Updates state given row and x position (in pixels), then renders selection.
// Assumes linePOffsets_, lineYOffsets_, and charSizes_ are up-to-date.
Editor.prototype.setSelectionFromRowAndX_ = function(row, x, updateSelStart, clearPrevLeft) {  // jshint ignore: line
  // Find char whose left is closest to x.
  var beginEnd = this.linePOffsets_[row];
  var pEnd = beginEnd[1];
  if (pEnd > 0 && this.m_.getText().charAt(pEnd - 1) === '\n') pEnd--;

  var p = beginEnd[0], left = 0;
  for (; p < pEnd; p++) {
    var newLeft = left + this.charSizes_[p][0];
    if (newLeft >= x) {
      // Pick between left and newLeft.
      if (newLeft - x < x - left) p++;
      break;
    }
    left = newLeft;
  }

  if (clearPrevLeft) this.cursor_.prevLeft = null;
  // If the character at position p is actually on the next line, switch cursor
  // state to "append" mode.
  this.cursor_.append = (p === beginEnd[1] && p > beginEnd[0]);

  if (!updateSelStart) {
    this.m_.setSelectionRange(this.m_.getSelectionRange()[0], p);
  } else {
    this.m_.setSelectionRange(p, p);
  }
};

////////////////////////////////////////////////////////////////////////////////
// Text state update methods

// Generates html for the given text, assuming the text starts at position p.
// Note: We currently don't use p, but eventually we'll need it to determine
// styling (e.g. bold).
// TODO: Switch to returning an Element object.
Editor.prototype.makeLineHtml_ = function(text, p) {
  // Note, selection elements are added as children of lineEl.
  var lineEl = createDiv({
    position: 'relative'
  });
  var lineInnerEl = createDiv({
    position: 'relative',  // needed for zIndex
    padding: '2px 0 1px',
    whiteSpace: 'pre',
    zIndex: '1'
  });
  lineInnerEl.textContent = text;
  lineEl.appendChild(lineInnerEl);
  return lineEl.outerHTML;
};

Editor.prototype.insertText_ = function(p, value) {
  value = util.canonicalizeLineBreaks(value);
  this.cursor_.append = false;
  this.cursor_.prevLeft = null;
  this.m_.insertText(p, value);
};

Editor.prototype.deleteText_ = function(p, len) {
  this.cursor_.append = false;
  this.cursor_.prevLeft = null;
  this.m_.deleteText(p, len);
};

Editor.prototype.deleteSelection_ = function() {
  var sel = this.getSelectionOrNull_();
  console.assert(sel !== null);
  this.deleteText_(sel[0], sel[1] - sel[0]);
};

////////////////////////////////////////////////////////////////////////////////
// Pure render methods

Editor.prototype.computeCursorRowAndLeft_ = function() {
  var numRows = this.linePOffsets_.length;
  var selEnd = this.m_.getSelectionRange()[1];
  var p, row = 0;
  // TODO: Use binary search.
  for (; row < numRows - 1; row++) {
    p = this.linePOffsets_[row][1];
    if (selEnd < p || (selEnd === p && this.cursor_.append)) break;
  }
  var left = 0;
  for (p = this.linePOffsets_[row][0]; p < selEnd; p++) {
    left += this.charSizes_[p][0];
  }
  return [row, left];
};

Editor.prototype.renderSelection_ = function(updateScroll) {
  var els = this.textEl_.querySelectorAll('.selection');
  var el;
  for (var i = 0; i < els.length; i++) {
    el = els[i];
    el.parentNode.removeChild(el);
  }

  var tup = this.computeCursorRowAndLeft_(), row = tup[0], left = tup[1];
  this.cursor_.row = row;
  this.cursor_.left = left;

  tup = this.lineYOffsets_[row];
  var top = tup[0], bottom = tup[1];
  this.cursor_.move(left, bottom, bottom - top);

  if (updateScroll) {
    // If the cursor is not visible within the editor, scroll the editor.
    var rect = this.el_.getBoundingClientRect();
    var cursorRect = this.cursor_.el_.getBoundingClientRect();
    var BW = this.borderWidth_, SLACK = 10, BONUS = 20;
    if (cursorRect.top - SLACK < rect.top + BW) {
      this.el_.scrollTop += (
        (cursorRect.top - SLACK) - (rect.top + BW) - BONUS);
    } else if (cursorRect.bottom + SLACK > rect.bottom - BW) {
      this.el_.scrollTop += (
        (cursorRect.bottom + SLACK) - (rect.bottom - BW) + BONUS);
    }
    // Same as above, but s/editor/window/. Useful if using "min-height" rather
    // than "height" for this.el_.
    if (cursorRect.top - SLACK < 0) {
      window.scrollBy(
        0, (cursorRect.top - SLACK) - BONUS);
    } else if (cursorRect.bottom + SLACK > window.innerHeight) {
      window.scrollBy(
        0, (cursorRect.bottom + SLACK) - window.innerHeight + BONUS);
    }
  }

  // Display the selection or cursor.
  var sel = this.getSelectionOrNull_();
  if (sel === null) {
    if (this.hasFocus_) {
      this.cursor_.show(!this.mouseIsDown_);
    } else {
      this.cursor_.hide();
    }
  } else {
    this.cursor_.hide();
    if (!this.hasFocus_) return;  // hide selection

    var text = this.m_.getText();
    var numRows = this.linePOffsets_.length;
    console.assert(numRows === this.textEl_.children.length);

    for (row = 0; row < numRows; row++) {
      var beginEnd = this.linePOffsets_[row];
      if (sel[0] >= beginEnd[1]) continue;
      if (sel[1] <= beginEnd[0]) break;

      el = createDiv({
        position: 'absolute',
        top: '0',
        backgroundColor: '#bbdefb',
        height: '100%'
      });
      el.className = 'selection';

      // Compute left.
      var p = beginEnd[0];
      left = 0;
      for (; p < sel[0]; p++) left += this.charSizes_[p][0];
      el.style.left = left + 'px';

      // Compute right (or width).
      if (sel[1] > beginEnd[1] ||
          (sel[1] === beginEnd[1] && text.charAt(beginEnd[1] - 1) === '\n')) {
        el.style.right = '0';
      } else {
        var width = 0;
        for (; p < sel[1]; p++) width += this.charSizes_[p][0];
        el.style.width = width + 'px';
      }

      this.textEl_.children[row].appendChild(el);
    }
  }
};

// Renders text and selection/cursor.
// Algorithm:
//  - Build html and array of line p-offsets, based on char widths
//  - Build array of line y-offsets
//  - Process arrays to place selection/cursor
Editor.prototype.renderAll_ = function(updateScroll) {
  var text = this.m_.getText();
  console.assert(this.charSizes_.length === text.length);

  // Global state.
  this.linePOffsets_ = [];
  var html = '';  // final html string
  var row = 0;    // current line number

  // Per-line state.
  var lineText = '';       // text of current line
  var lineBegin = 0;       // position of line in text
  var lineWidth = 0;       // width in pixels of current line
  var lineLastSpace = -1;  // position of last seen ' ' char in this line

  // Apply word-wrap: add chars one by one until too wide, figure out where to
  // add a newline, add it, then rinse and repeat.
  var p = 0;
  while (p < text.length) {
    var c = text.charAt(p);
    lineText += c;
    if (c === '\n') {
      p++;
    } else {
      lineWidth += this.charSizes_[p][0];
      if (c === ' ') lineLastSpace = p - lineBegin;
      // Note: Supporting an "on-demand" native scroll bar would be tricky. For
      // now, we make the scroll bar "always-on".
      if (lineWidth <= this.innerWidth_) {
        p++;
        continue;
      } else {
        if (lineLastSpace >= 0) {
          lineText = lineText.substr(0, lineLastSpace);
          p = lineBegin + lineLastSpace + 1;
        } else {
          // This line is one long word (no spaces), so we insert a line break
          // in the middle of the word.
          lineText = lineText.substr(0, lineText.length - 1);
        }
      }
    }
    // Update global state.
    this.linePOffsets_[row] = [lineBegin, p];
    html += this.makeLineHtml_(lineText, lineBegin);
    row++;
    // Reset per-line state.
    lineText = '';
    lineBegin = p;
    lineWidth = 0;
    lineLastSpace = -1;
  }
  // Add last line.
  console.assert(p === text.length);
  this.linePOffsets_[row] = [lineBegin, p];
  html += this.makeLineHtml_(lineText, lineBegin);

  this.textEl_.innerHTML = html;

  // Compute lineYOffsets.
  var numRows = this.linePOffsets_.length;
  var beginPx = 0;
  // The first and only line of an empty document, and the last line of any
  // document that ends in a newline character, contains zero characters, but a
  // cursor positioned at the start of such a line should still have non-zero
  // height.
  var emptyLineHeight = this.lineHeight_(p);
  this.lineYOffsets_ = new Array(numRows);
  for (row = 0; row < numRows; row++) {
    var lineHeight = emptyLineHeight;
    var beginEnd = this.linePOffsets_[row];
    for (p = beginEnd[0]; p < beginEnd[1]; p++) {
      lineHeight = Math.max(lineHeight, this.charSizes_[p][1]);
    }
    this.lineYOffsets_[row] = [beginPx, beginPx + lineHeight];
    beginPx += lineHeight;
  }

  // Assumes linePOffsets_, lineYOffsets_, and charSizes_ are up-to-date.
  this.renderSelection_(updateScroll);
};

////////////////////////////////////////////////////////////////////////////////
// Input event handlers

var IGNORED_KEYPRESS_CODES = {
  63232: true,  // ctrl up
  63233: true,  // ctrl down
  63234: true,  // ctrl left
  63235: true,  // ctrl right
  63272: true   // ctrl delete
};

Editor.prototype.handleKeyPress_ = function(e) {
  if (!this.hasFocus_ || this.mouseIsDown_) return;

  if (IGNORED_KEYPRESS_CODES[e.which]) return;
  if (e.which > 127) return;  // require ASCII for now
  e.preventDefault();
  if (this.getSelectionOrNull_() !== null) this.deleteSelection_();

  var p = this.getCursorPos_();
  this.insertText_(p, String.fromCharCode(e.which));
};

Editor.prototype.handleKeyDown_ = function(e) {
  if (!this.hasFocus_ || this.mouseIsDown_) return;

  var sel = this.getSelectionOrNull_();
  // TODO: On Linux and Windows, require ctrlKey instead of metaKey.
  if (e.metaKey) {
    var c = String.fromCharCode(e.which);
    switch (c) {
    case 'V':
      if (sel !== null) this.deleteSelection_();
      this.insertText_(this.getCursorPos_(), this.clipboard_);
      break;
    case 'A':
      this.setSelectionFromP_(0, true);
      this.setSelectionFromP_(this.m_.getText().length, false);
      break;
    case 'X':
    case 'C':
      if (sel !== null) {
        this.clipboard_ = this.m_.getText().substr(sel[0], sel[1] - sel[0]);
        if (c === 'X') this.deleteSelection_();
      }
      break;
    default:
      return;
    }
    e.preventDefault();
    return;
  }

  var selEnd, p;
  switch (e.which) {
  case 35:  // end
    // Note, we use setSelectionFromRowAndX_ because we want to place the cursor
    // at EOL.
    this.setSelectionFromRowAndX_(
      this.cursor_.row, this.width_, !e.shiftKey, true);
    break;
  case 36:  // home
    this.setSelectionFromP_(
      this.linePOffsets_[this.cursor_.row][0], !e.shiftKey);
    break;
  case 37:  // left arrow
    if (e.shiftKey) {
      selEnd = this.m_.getSelectionRange()[1];
      this.setSelectionFromP_(this.cursorHop_(selEnd, false, e.ctrlKey), false);
    } else if (sel === null) {
      p = this.getCursorPos_();
      this.setSelectionFromP_(this.cursorHop_(p, false, e.ctrlKey), true);
    } else if (e.ctrlKey) {
      this.setSelectionFromP_(this.cursorHop_(sel[0], false, true), true);
    } else {
      this.setSelectionFromP_(sel[0], true);
    }
    break;
  case 38:  // up arrow
    if (this.cursor_.row > 0) {
      if (this.cursor_.prevLeft === null) {
        this.cursor_.prevLeft = this.cursor_.left;
      }
      this.setSelectionFromRowAndX_(
        this.cursor_.row - 1, this.cursor_.prevLeft, !e.shiftKey, false);
    }
    break;
  case 39:  // right arrow
    if (e.shiftKey) {
      selEnd = this.m_.getSelectionRange()[1];
      this.setSelectionFromP_(this.cursorHop_(selEnd, true, e.ctrlKey), false);
    } else if (sel === null) {
      p = this.getCursorPos_();
      this.setSelectionFromP_(this.cursorHop_(p, true, e.ctrlKey), true);
    } else if (e.ctrlKey) {
      this.setSelectionFromP_(this.cursorHop_(sel[1], true, true), true);
    } else {
      this.setSelectionFromP_(sel[1], true);
    }
    break;
  case 40:  // down arrow
    if (this.cursor_.row < this.linePOffsets_.length - 1) {
      if (this.cursor_.prevLeft === null) {
        this.cursor_.prevLeft = this.cursor_.left;
      }
      this.setSelectionFromRowAndX_(
        this.cursor_.row + 1, this.cursor_.prevLeft, !e.shiftKey, false);
    }
    break;
  case 8:  // backspace
    if (sel !== null) {
      this.deleteSelection_();
    } else {
      p = this.getCursorPos_();
      var beginP = this.cursorHop_(p, false, e.ctrlKey);
      this.deleteText_(beginP, p - beginP);
    }
    break;
  case 46:  // delete
    if (sel !== null) {
      this.deleteSelection_();
    } else {
      p = this.getCursorPos_();
      var endP = this.cursorHop_(p, true, e.ctrlKey);
      this.deleteText_(p, endP - p);
    }
    break;
  default:
    return;
  }
  e.preventDefault();
};

Editor.prototype.handleMouseDown_ = function(e) {
  var rect = this.el_.getBoundingClientRect();
  var BW = this.borderWidth_;
  if (e.clientX < rect.left + BW || e.clientX > rect.right - BW ||
      e.clientY < rect.top + BW || e.clientY > rect.bottom - BW) {
    this.hasFocus_ = false;
    this.mouseIsDown_ = false;
    this.renderSelection_(false);
    return;
  }
  e.preventDefault();

  var innerRect = this.innerEl_.getBoundingClientRect();

  // If the click's x position was outside innerRect, the click must have been
  // on el_'s scroll bar.
  if (e.clientX < innerRect.left || e.clientX > innerRect.right) {
    this.mouseIsDown_ = false;
    return;
  }

  this.hasFocus_ = true;
  this.mouseIsDown_ = true;

  var x = e.clientX - innerRect.left;
  var y = e.clientY - innerRect.top;
  this.setSelectionFromRowAndX_(this.rowFromY_(y), x, true, true);

  document.addEventListener('mousemove', this.boundHandleMouseMove_);
};

Editor.prototype.handleMouseUp_ = function(e) {
  if (!this.mouseIsDown_) return;
  console.assert(this.hasFocus_);
  e.preventDefault();

  this.mouseIsDown_ = false;
  this.renderSelection_(false);

  document.removeEventListener('mousemove', this.boundHandleMouseMove_);
};

Editor.prototype.handleMouseMove_ = function(e) {
  if (!this.mouseIsDown_) return;
  console.assert(this.hasFocus_);
  e.preventDefault();

  var innerRect = this.innerEl_.getBoundingClientRect();
  var x = e.clientX - innerRect.left;
  var y = e.clientY - innerRect.top;
  this.setSelectionFromRowAndX_(this.rowFromY_(y), x, false, true);
};

Editor.prototype.handleFocus_ = function() {
  this.hasFocus_ = true;
  this.renderSelection_(false);
};

Editor.prototype.handleBlur_ = function() {
  this.hasFocus_ = false;
  this.renderSelection_(false);
};