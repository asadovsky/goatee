// Defines Editor class as well as some private classes.
//
// Model (either local or OT) stores text and selection range.
// Some state (e.g. charSizes_, linePOffsets_, some cursor state) lives in
// Editor, not in model.
//
// TODO:
//  - For faster text mutations, represent text using something like
//    https://github.com/josephg/jumprope
//  - Make select-scroll smooth
//  - Support bold, italics
//  - Support font-size and line-height
//  - Support non-ASCII characters
//  - Fancier cut/copy/paste, see http://goo.gl/Xv1YcG
//  - Support screen scaling
//  - Play with React (http://facebook.github.io/react/)
//
// OT-specific TODO:
//  - Show all cursors and selections
//  - Smarter handling of cursor_.prevLeft on non-local text mutations

'use strict';

var goatee = goatee || {};
goatee.ed = goatee.ed || {};

goatee.ed.DEBUG = 0;

////////////////////////////////////////////////////////////////////////////////
// HtmlSizer_

goatee.ed.HtmlSizer_ = function(parentEl) {
  this.el_ = document.createElement('div');
  this.el_.style.position = 'fixed';
  this.el_.style.top = '-1000px';
  this.el_.style.left = '-1000px';
  this.el_.style.visibilty = 'hidden';
  parentEl.appendChild(this.el_);
};

goatee.ed.HtmlSizer_.prototype.size = function(html) {
  this.el_.innerHTML = html;
  var res = [this.el_.offsetWidth, this.el_.offsetHeight];
  this.el_.innerHTML = '';
  return res;
};

goatee.ed.HtmlSizer_.prototype.width = function(html) {
  return this.size(html)[0];
};

goatee.ed.HtmlSizer_.prototype.height = function(html) {
  return this.size(html)[1];
};

////////////////////////////////////////////////////////////////////////////////
// Model_

goatee.ed.Model_ = function() {
  this.text_ = '';
  this.selStart_ = 0;
  this.selEnd_ = 0;

  this.listeners_ = {};
  this.listeners_[goatee.EventType.TEXT_INSERT] = [];
  this.listeners_[goatee.EventType.TEXT_DELETE] = [];
  this.listeners_[goatee.EventType.SET_SELECTION] = [];
};

goatee.ed.Model_.prototype.getText = function() {
  return this.text_;
};

goatee.ed.Model_.prototype.getSelectionRange = function() {
  return [this.selStart_, this.selEnd_];
};

goatee.ed.Model_.prototype.insertText = function(pos, value) {
  this.text_ = this.text_.substr(0, pos) + value + this.text_.substr(pos);
  this.selStart_ = pos + value.length;
  this.selEnd_ = this.selStart_;

  var arr = this.listeners_[goatee.EventType.TEXT_INSERT];
  for (var i = 0; i < arr.length; i++) {
    arr[i](pos, value, true);
  }
};

goatee.ed.Model_.prototype.deleteText = function(pos, len) {
  this.text_ = this.text_.substr(0, pos) + this.text_.substr(pos + len);
  this.selStart_ = pos;
  this.selEnd_ = this.selStart_;

  var arr = this.listeners_[goatee.EventType.TEXT_DELETE];
  for (var i = 0; i < arr.length; i++) {
    arr[i](pos, len, true);
  }
};

goatee.ed.Model_.prototype.setSelectionRange = function(start, end) {
  this.selStart_ = start;
  this.selEnd_ = end;

  var arr = this.listeners_[goatee.EventType.SET_SELECTION];
  for (var i = 0; i < arr.length; i++) {
    arr[i](start, end, true);
  }
};

goatee.ed.Model_.prototype.addEventListener = function(type, handler) {
  this.listeners_[type].push(handler);
};

goatee.ed.Model_.prototype.removeEventListener = function(type, handler) {
  goatee.removeFromArray(handler, this.listeners_[type]);
};

////////////////////////////////////////////////////////////////////////////////
// Cursor_

goatee.ed.Cursor_ = function() {
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

  this.el_ = document.createElement('div');
  this.el_.className = 'cursor';

  window.setInterval((function() {
    if (this.blinkTimer_ === -1) return;
    this.blinkTimer_ = (this.blinkTimer_ + 1) % 10;
    // Visible 60% of the time, hidden 40% of the time.
    this.el_.style.visibility = (this.blinkTimer_ < 6) ? 'visible' : 'hidden';
  }).bind(this), 100);
};

goatee.ed.Cursor_.prototype.show = function(blink) {
  this.blinkTimer_ = (blink ? 0 : -1);
  this.el_.style.visibility = 'visible';
};

goatee.ed.Cursor_.prototype.hide = function() {
  this.blinkTimer_ = -1;
  this.el_.style.visibility = 'hidden';
};

// Here, bottom means "distance from top of editor to bottom of cursor".
goatee.ed.Cursor_.prototype.move = function(left, bottom, height) {
  if (goatee.ed.DEBUG) console.log(left, bottom, height);

  this.el_.style.left = left + 'px';
  this.el_.style.top = bottom - height + 'px';
  this.el_.style.height = height + 'px';

  // If the cursor is not in the window, scroll the window.
  var wTop = window.pageYOffset, wBottom = wTop + window.innerHeight;
  var cRect = this.el_.getBoundingClientRect();
  var cTop = wTop + cRect.top, cBottom = wTop + cRect.bottom;
  if (cTop < wTop + 10) {
    window.scrollBy(0, -(wTop - cTop + 100));
  } else if (cBottom > wBottom - 10) {
    window.scrollBy(0, cBottom - wBottom + 100);
  }
};

////////////////////////////////////////////////////////////////////////////////
// Editor

goatee.ed.Editor = function(editorEl, model) {
  this.el_ = editorEl;
  this.el_.className = 'goatee-ed';
  this.reset(model);

  // Register input handlers.
  // TODO: Provide some way to remove these document event handlers.
  this.boundHandleMouseMove_ = this.handleMouseMove_.bind(this);
  document.addEventListener('keypress', this.handleKeyPress_.bind(this));
  document.addEventListener('keydown', this.handleKeyDown_.bind(this));
  document.addEventListener('mousedown', this.handleMouseDown_.bind(this));
  document.addEventListener('mouseup', this.handleMouseUp_.bind(this));
};

goatee.ed.Editor.prototype.reset = function(model) {
  this.m_ = model || new goatee.ed.Model_();

  // Register model event handlers.
  this.m_.addEventListener(
    goatee.EventType.TEXT_INSERT, this.handleInsertText_.bind(this));
  this.m_.addEventListener(
    goatee.EventType.TEXT_DELETE, this.handleDeleteText_.bind(this));
  this.m_.addEventListener(
    goatee.EventType.SET_SELECTION, this.handleSetSelectionRange_.bind(this));

  // Reset internal state.
  this.hasFocus_ = true;
  this.mouseIsDown_ = false;

  this.clipboard_ = '';
  this.cursor_ = new goatee.ed.Cursor_();

  // Updated by insertText_ and deleteText_.
  this.charSizes_ = [];       // array of [width, height]
  // Updated by renderAll_.
  this.linePOffsets_ = null;  // array of [beginP, endP]
  this.lineYOffsets_ = null;  // array of [begin, end] px relative to window top

  this.textEl_ = document.createElement('div');
  this.innerEl_ = document.createElement('div');
  this.innerEl_.className = 'editor-inner';
  this.innerEl_.appendChild(this.textEl_);
  this.innerEl_.appendChild(this.cursor_.el_);

  // Remove any existing children, then add innerEl.
  while (this.el_.firstChild) this.el_.removeChild(this.el_.firstChild);
  this.el_.appendChild(this.innerEl_);
  this.hs_ = new goatee.ed.HtmlSizer_(this.el_);

  // Set fields that depend on DOM.
  this.innerWidth_ = parseInt(window.getComputedStyle(
    this.innerEl_, null).getPropertyValue('width'), 10);

  // Initialize charSizes_ to handle non-empty initial model state.
  this.initCharSizes_();
  this.renderAll_();
};

////////////////////////////////////////////////////////////////////////////////
// Public methods

goatee.ed.Editor.prototype.getText = function() {
  return this.m_.getText();
};

goatee.ed.Editor.prototype.getSelectionRange = function() {
  return this.m_.getSelectionRange();
};

////////////////////////////////////////////////////////////////////////////////
// Model event handlers

goatee.ed.Editor.prototype.handleInsertText_ = function(
  pos, value, isLocal) {
  var valueCharSizes = new Array(value.length);
  for (var i = 0; i < value.length; i++) {
    var c = value.charAt(i);
    valueCharSizes[i] = this.hs_.size(this.makeLineHtml_(c, pos + i));
  }
  this.charSizes_ = this.charSizes_.slice(0, pos).concat(
    valueCharSizes, this.charSizes_.slice(pos));

  this.renderAll_();
};

goatee.ed.Editor.prototype.handleDeleteText_ = function(
  pos, len, isLocal) {
  this.charSizes_.splice(pos, len);
  this.renderAll_();
};

goatee.ed.Editor.prototype.handleSetSelectionRange_ = function(
  start, end, isLocal) {
  this.renderSelection_();
};

////////////////////////////////////////////////////////////////////////////////
// Utility methods

goatee.ed.Editor.prototype.initCharSizes_ = function() {
  var text = this.m_.getText();
  this.charSizes_ = new Array(text.length);
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    this.charSizes_[i] = this.hs_.size(this.makeLineHtml_(c, i));
  }
};

goatee.ed.Editor.prototype.rowFromY_ = function(y) {
  var row;
  // TODO: Use binary search.
  for (row = 0; row < this.lineYOffsets_.length - 1; row++) {
    if (y <= this.lineYOffsets_[row][1]) break;
  }
  return row;
};

goatee.ed.Editor.ALPHANUM_RE_ = /[A-Za-z0-9]/;

goatee.ed.Editor.prototype.cursorHop_ = function(p, forward, hop) {
  var text = this.m_.getText(), anre = goatee.ed.Editor.ALPHANUM_RE_;
  if (forward) {
    if (hop) {
      while (p < text.length && !anre.test(text.charAt(p))) p++;
      while (p < text.length && anre.test(text.charAt(p))) p++;
    } else if (p < text.length) {
      p++;
    }
  } else {  // backward
    if (hop) {
      while (p > 0 && !anre.test(text.charAt(p - 1))) p--;
      while (p > 0 && anre.test(text.charAt(p - 1))) p--;
    } else if (p > 0) {
      p--;
    }
  }
  return p;
};

goatee.ed.Editor.prototype.getSelectionOrNull_ = function() {
  var tup = this.m_.getSelectionRange(), selStart = tup[0], selEnd = tup[1];
  if (selStart === selEnd) {
    return null;
  } else if (selStart < selEnd) {
    return [selStart, selEnd];
  } else {
    return [selEnd, selStart];
  }
};

goatee.ed.Editor.prototype.getCursorPos_ = function() {
  var tup = this.m_.getSelectionRange(), selStart = tup[0], selEnd = tup[1];
  console.assert(selStart === selEnd);
  return selEnd;
};

////////////////////////////////////////////////////////////////////////////////
// Selection state update methods

// Updates state given p (offset), then renders selection.
goatee.ed.Editor.prototype.setSelectionFromP_ = function(p, updateSelStart) {
  // TODO: If nothing has changed, don't update model or render.
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
goatee.ed.Editor.prototype.setSelectionFromRowAndX_ = function(
  row, x, updateSelStart, clearPrevLeft) {
  // Find char whose left is closest to x.
  var beginEnd = this.linePOffsets_[row];
  var pEnd = beginEnd[1];
  if (pEnd > 0 && this.m_.getText().charAt(pEnd - 1) === '\r') pEnd--;

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

  // TODO: If nothing has changed, don't update model or render.
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

goatee.ed.Editor.ESCAPE_CHAR_MAP_ = {
  ' ': '&nbsp;',
  '"': '&quot;',
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
};

goatee.ed.Editor.escapeChar_ = function(c) {
  var x = goatee.ed.Editor.ESCAPE_CHAR_MAP_[c];
  return x ? x : c;
};

// Generates html for the given text, assuming the text starts at position p.
// Note, currently we don't use p, but eventually we'll need it to determine
// styling (e.g. bold).
goatee.ed.Editor.prototype.makeLineHtml_ = function(text, p) {
  var res = '';
  var len = text.length;
  for (var i = 0; i < len; i++) {
    var c = text.charAt(i);
    if (c === '\r') {
      c = '';
    } else {
      c = goatee.ed.Editor.escapeChar_(c);
    }
    console.assert(!/\s/.test(c));
    res += c;
  }
  return '<div class="line"><div class="line-inner">' + res + '</div></div>';
};

goatee.ed.Editor.prototype.insertText_ = function(p, value) {
  this.cursor_.append = false;
  this.cursor_.prevLeft = null;
  this.m_.insertText(p, value);
};

goatee.ed.Editor.prototype.deleteText_ = function(p, len) {
  this.cursor_.append = false;
  this.cursor_.prevLeft = null;
  this.m_.deleteText(p, len);
};

goatee.ed.Editor.prototype.deleteSelection_ = function() {
  var sel = this.getSelectionOrNull_();
  console.assert(sel !== null);
  this.deleteText_(sel[0], sel[1] - sel[0]);
};

////////////////////////////////////////////////////////////////////////////////
// Pure rendering methods

goatee.ed.Editor.prototype.computeCursorRowAndLeft_ = function() {
  var numRows = this.linePOffsets_.length;
  var selEnd = this.m_.getSelectionRange()[1];
  var row = 0;
  // TODO: Use binary search.
  for (; row < numRows - 1; row++) {
    var p = this.linePOffsets_[row][1];
    if (selEnd < p || (selEnd === p && this.cursor_.append)) break;
  }
  var left = 0;
  for (var p = this.linePOffsets_[row][0]; p < selEnd; p++) {
    left += this.charSizes_[p][0];
  }
  return [row, left];
};

goatee.ed.Editor.prototype.renderSelection_ = function() {
  var els = this.textEl_.querySelectorAll('.highlight');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    el.parentNode.removeChild(el);
  }

  var tup = this.computeCursorRowAndLeft_(), row = tup[0], left = tup[1];
  this.cursor_.row = row;
  this.cursor_.left = left;

  var tup = this.lineYOffsets_[row], top = tup[0], bottom = tup[1];
  this.cursor_.move(left, bottom, bottom - top);

  var sel = this.getSelectionOrNull_();
  if (sel === null) {
    if (this.hasFocus_) {
      this.cursor_.show(!this.mouseIsDown_);
    } else {
      this.cursor_.hide();
    }
  } else {
    // TODO: If !this.hasFocus_, make the selection gray.
    var text = this.m_.getText();
    var numRows = this.linePOffsets_.length;
    console.assert(numRows === this.textEl_.children.length);

    for (var row = 0; row < numRows; row++) {
      var beginEnd = this.linePOffsets_[row];
      if (sel[0] >= beginEnd[1]) continue;
      if (sel[1] <= beginEnd[0]) break;

      var el = document.createElement('div');
      el.className = 'highlight';

      // Compute left.
      var p = beginEnd[0], left = 0;
      for (; p < sel[0]; p++) left += this.charSizes_[p][0];
      el.style.left = left + 'px';

      // Compute right (or width).
      if (sel[1] > beginEnd[1] ||
          (sel[1] === beginEnd[1] && text.charAt(beginEnd[1] - 1) === '\r')) {
        el.style.right = '0';
      } else {
        var width = 0;
        for (; p < sel[1]; p++) width += this.charSizes_[p][0];
        el.style.width = width + 'px';
      }

      this.textEl_.children[row].appendChild(el);
    }

    this.cursor_.hide();
  }
};

// Renders text and selection/cursor.
// Algorithm:
//  - Build html and array of line p-offsets, based on char widths
//  - Build array of line y-offsets
//  - Process arrays to place selection/cursor
goatee.ed.Editor.prototype.renderAll_ = function() {
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
    if (c === '\r') {
      p++;
    } else {
      lineWidth += this.charSizes_[p][0];
      if (c === ' ') lineLastSpace = p - lineBegin;
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
  this.lineYOffsets_ = new Array(numRows);
  var numRows = this.linePOffsets_.length;
  var beginPx = 0;
  var emptyLineHeight = this.hs_.height(this.makeLineHtml_('', p));
  for (var row = 0; row < numRows; row++) {
    var lineHeight = emptyLineHeight;
    var beginEnd = this.linePOffsets_[row];
    for (var p = beginEnd[0]; p < beginEnd[1]; p++) {
      lineHeight = Math.max(lineHeight, this.charSizes_[p][1]);
    }
    this.lineYOffsets_[row] = [beginPx, beginPx + lineHeight];
    beginPx += lineHeight;
  }

  // Assumes linePOffsets_, lineYOffsets_, and charSizes_ are up-to-date.
  this.renderSelection_();
};

////////////////////////////////////////////////////////////////////////////////
// Input handlers

// We ignore these keypress codes.
goatee.ed.Editor.IGNORE_KEYPRESS_ = {
  63232: true,  // ctrl up
  63233: true,  // ctrl down
  63234: true,  // ctrl left
  63235: true,  // ctrl right
  63272: true   // ctrl delete
};

goatee.ed.Editor.prototype.handleKeyPress_ = function(e) {
  if (!this.hasFocus_ || this.mouseIsDown_) return;

  if (goatee.ed.Editor.IGNORE_KEYPRESS_[e.which]) return;
  if (e.which > 127) return;  // require ASCII for now
  e.preventDefault();
  if (this.getSelectionOrNull_() !== null) this.deleteSelection_();

  var p = this.getCursorPos_();
  this.insertText_(p, String.fromCharCode(e.which));
};

goatee.ed.Editor.prototype.handleKeyDown_ = function(e) {
  if (!this.hasFocus_ || this.mouseIsDown_) return;

  var sel = this.getSelectionOrNull_();
  // TODO: For Linux and Windows, require ctrlKey instead of metaKey.
  if (e.metaKey) {
    var c = String.fromCharCode(e.which);
    switch (c) {
    case 'V':
      if (sel !== null) this.deleteSelection_();
      var p = this.getCursorPos_();
      this.insertText_(p, this.clipboard_);
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

  switch (e.which) {
  case 35:  // end
    // Note, we use setSelectionFromRowAndX_ because we want to place the
    // cursor at EOL.
    this.setSelectionFromRowAndX_(
      this.cursor_.row, this.innerWidth_, !e.shiftKey, true);
    break;
  case 36:  // home
    this.setSelectionFromP_(
      this.linePOffsets_[this.cursor_.row][0], !e.shiftKey);
    break;
  case 37:  // left arrow
    if (e.shiftKey) {
      var selEnd = this.m_.getSelectionRange()[1];
      this.setSelectionFromP_(this.cursorHop_(selEnd, false, e.ctrlKey), false);
    } else if (sel === null) {
      var p = this.getCursorPos_();
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
      this.renderSelection_();
    }
    break;
  case 39:  // right arrow
    if (e.shiftKey) {
      var selEnd = this.m_.getSelectionRange()[1];
      this.setSelectionFromP_(this.cursorHop_(selEnd, true, e.ctrlKey), false);
    } else if (sel === null) {
      var p = this.getCursorPos_();
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
      var p = this.getCursorPos_();
      var beginP = this.cursorHop_(p, false, e.ctrlKey);
      this.deleteText_(beginP, p - beginP);
    }
    break;
  case 46:  // delete
    if (sel !== null) {
      this.deleteSelection_();
    } else {
      var p = this.getCursorPos_();
      var endP = this.cursorHop_(p, true, e.ctrlKey);
      this.deleteText_(p, endP - p);
    }
    break;
  default:
    return;
  }
  e.preventDefault();
};

goatee.ed.Editor.prototype.handleMouseDown_ = function(e) {
  var viewportX = e.pageX - window.pageXOffset;
  var viewportY = e.pageY - window.pageYOffset;

  var rect = this.el_.getBoundingClientRect();
  if (viewportX < rect.left || viewportX > rect.right ||
      viewportY < rect.top || viewportY > rect.bottom) {
    this.hasFocus_ = false;
    this.renderSelection_();
    return;
  }
  this.hasFocus_ = true;
  this.mouseIsDown_ = true;
  e.preventDefault();

  var innerRect = this.innerEl_.getBoundingClientRect();
  var x = viewportX - innerRect.left;
  var y = viewportY - innerRect.top;
  this.setSelectionFromRowAndX_(this.rowFromY_(y), x, true, true);

  document.addEventListener('mousemove', this.boundHandleMouseMove_);
};

goatee.ed.Editor.prototype.handleMouseUp_ = function(e) {
  if (!this.hasFocus_) return;
  this.mouseIsDown_ = false;
  e.preventDefault();
  this.renderSelection_();

  document.removeEventListener('mousemove', this.boundHandleMouseMove_);
};

goatee.ed.Editor.prototype.handleMouseMove_ = function(e) {
  console.assert(this.hasFocus_);
  console.assert(this.mouseIsDown_);
  e.preventDefault();

  var viewportX = e.pageX - window.pageXOffset;
  var viewportY = e.pageY - window.pageYOffset;

  var innerRect = this.innerEl_.getBoundingClientRect();
  var x = viewportX - innerRect.left;
  var y = viewportY - innerRect.top;
  this.setSelectionFromRowAndX_(this.rowFromY_(y), x, false, true);
};
