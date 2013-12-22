// Defines Editor class as well as some private classes.
//
// TODO:
//  - Support OT insert/delete text ops and cursor/selection ops
//  - For performance of insert and delete ops, represent text using something
//    like https://github.com/josephg/jumprope
//  - Make select-scroll smooth
//  - Support bold, italics
//  - Support font-size and line-height
//  - Support non-ASCII characters
//  - Fancier cut/copy/paste, see http://goo.gl/Xv1YcG
//  - Support screen scaling
//  - Play with React (http://facebook.github.io/react/)

'use strict';

var goatee = goatee || {};
goatee.ed = goatee.ed || {};

goatee.ed.DEBUG = 0;

////////////////////////////////////////////////////////////////////////////////
// Data structures

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

// Struct for cursor position data.
goatee.ed.CursorPos_ = function(p, row, left) {
  this.p = p;  // in [0, text.length]

  // If true, cursor should be rendered to the right of the char at offset p-1,
  // rather than at the left edge of the char at offset p. This can happen when
  // user presses the "end" key or clicks past the end of a line.
  this.append = false;

  // Used for tracking previous left position, needed to implement up and down
  // arrow keys.
  this.prevLeft = null;

  // Used for rendering. Technically not part of state (i.e. can be derived from
  // state), but kept up-to-date for performance and implementation simplicity
  // reasons.
  this.row = row;    // row (line number)
  this.left = left;  // left position, in pixels
};

goatee.ed.CursorPos_.prototype.copy = function() {
  return new goatee.ed.CursorPos_(this.p, this.row, this.left);
};

goatee.ed.Cursor_ = function() {
  this.pos = new goatee.ed.CursorPos_(0, 0, 0);
  this.sel = null;  // start pos of selection, or null if no selection

  this.hasFocus = true;  // whether the editor has focus
  this.blinkTimer_ = 0;

  this.el_ = document.createElement('div');
  this.el_.className = 'cursor';

  window.setInterval((function() {
    if (!this.hasFocus || this.blinkTimer_ === -1) return;
    this.blinkTimer_ = (this.blinkTimer_ + 1) % 10;
    // Visible 60% of the time, hidden 40% of the time.
    this.el_.style.visibility = (this.blinkTimer_ < 6) ? 'visible' : 'hidden';
  }).bind(this), 100);
};

// Here, bottom means "distance from top of editor to bottom of cursor".
goatee.ed.Cursor_.prototype.render = function(left, bottom, height) {
  if (goatee.ed.DEBUG) console.log(this.pos, this.sel, this.hasFocus);
  if (goatee.ed.DEBUG) console.log(left, bottom, height);

  this.el_.style.left = left + 'px';
  this.el_.style.top = bottom - height + 'px';
  this.el_.style.height = height + 'px';

  if (!this.hasFocus) {
    this.el_.style.visibility = 'hidden';
  } else if (this.sel !== null) {
    this.blinkTimer_ = -1;
    this.el_.style.visibility = (
      this.pos.p === this.sel.p ? 'visible' : 'hidden');
  } else {
    this.blinkTimer_ = 0;
    this.el_.style.visibility = 'visible';
  }

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

goatee.ed.Editor = function(editorEl) {
  this.el_ = editorEl;
  this.reset();

  // Set up listeners to handle user input events.
  this.boundHandleMouseMove_ = this.handleMouseMove_.bind(this);
  document.addEventListener('keypress', this.handleKeyPress_.bind(this));
  document.addEventListener('keydown', this.handleKeyDown_.bind(this));
  document.addEventListener('mousedown', this.handleMouseDown_.bind(this));
  document.addEventListener('mouseup', this.handleMouseUp_.bind(this));
};

goatee.ed.Editor.prototype.reset = function() {
  this.clipboard_ = '';
  this.cursor_ = new goatee.ed.Cursor_();
  this.mouseIsDown_ = false;

  // Updated by insertText_ and deleteText_.
  this.text_ = '';
  this.charSizes_ = [];       // array of [width, height]
  // Updated by renderAll_.
  this.linePOffsets_ = null;  // array of [beginP, endP]
  this.lineYOffsets_ = null;  // array of [begin, end] px relative to window top

  this.textEl_ = document.createElement('div');
  this.innerEl_ = document.createElement('div');
  this.innerEl_.id = 'editor-inner';
  this.innerEl_.appendChild(this.textEl_);
  this.innerEl_.appendChild(this.cursor_.el_);

  // Remove any existing children, then add innerEl.
  while (this.el_.firstChild) this.el_.removeChild(this.el_.firstChild);
  this.el_.appendChild(this.innerEl_);
  this.hs_ = new goatee.ed.HtmlSizer_(this.el_);

  // Set fields that depend on DOM.
  this.innerWidth_ = parseInt(window.getComputedStyle(
    this.innerEl_, null).getPropertyValue('width'), 10);

  this.renderAll_();
};

////////////////////////////////////////////////////////////////////////////////
// Utility methods

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
  var anre = goatee.ed.Editor.ALPHANUM_RE_;
  if (forward) {
    if (hop) {
      while (p < this.text_.length && !anre.test(this.text_.charAt(p))) p++;
      while (p < this.text_.length && anre.test(this.text_.charAt(p))) p++;
    } else if (p < this.text_.length) {
      p++;
    }
  } else {  // backward
    if (hop) {
      while (p > 0 && !anre.test(this.text_.charAt(p - 1))) p--;
      while (p > 0 && anre.test(this.text_.charAt(p - 1))) p--;
    } else if (p > 0) {
      p--;
    }
  }
  return p;
};

////////////////////////////////////////////////////////////////////////////////
// Model update methods

// Some of these (e.g. insertText_) also update data needed only for rendering,
// for efficiency purposes.

// Updates cursor state given row and x position (in pixels).
// Assumes text, charSizes, linePOffsets, etc. are up-to-date.
goatee.ed.Editor.prototype.updateCursorFromRowAndX_ = function(
  row, x, clearPrevLeft) {
  // Find char whose left is closest to x.
  var beginEnd = this.linePOffsets_[row];
  var pEnd = beginEnd[1];
  if (pEnd > 0 && this.text_.charAt(pEnd - 1) === '\r') pEnd--;

  var p = beginEnd[0], left = 0;
  for (; p < pEnd; p++) {
    var newLeft = left + this.charSizes_[p][0];
    if (newLeft >= x) {
      // Pick between left and newLeft.
      if (newLeft - x < x - left) {
        left = newLeft;
        p++;
      }
      break;
    }
    left = newLeft;
  }

  this.cursor_.pos.p = p;
  // If the character at position p is actually on the next line, switch cursor
  // state to "append" mode.
  this.cursor_.pos.append = (p === beginEnd[1]);
  if (clearPrevLeft) this.cursor_.pos.prevLeft = null;

  this.cursor_.pos.row = row;
  this.cursor_.pos.left = left;
};

// Updates cursor state given p (offset).
// Assumes text, charSizes, linePOffsets, etc. are up-to-date.
goatee.ed.Editor.prototype.updateCursorFromP_ = function(p) {
  var numRows = this.linePOffsets_.length;
  var row = 0;
  // TODO: Use binary search.
  for (; row < numRows - 1; row++) {
    if (p < this.linePOffsets_[row][1]) break;
  }
  var left = 0;
  for (var q = this.linePOffsets_[row][0]; q < p; q++) {
    left += this.charSizes_[q][0];
  }

  this.cursor_.pos.p = p;
  this.cursor_.pos.append = false;
  this.cursor_.pos.prevLeft = null;

  this.cursor_.pos.row = row;
  this.cursor_.pos.left = left;
};

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

// Generates html for the given line of text, assuming the text starts at
// position p.
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

// Updates text, charSizes, and cursor offset. Other cursor state (row and left)
// must be updated by renderAll_, since that's where we update linePOffsets and
// lineYOffsets.
goatee.ed.Editor.prototype.insertText_ = function(p, value) {
  this.text_ = this.text_.substr(0, p) + value + this.text_.substr(p);
  var valueCharSizes = new Array(value.length);
  for (var i = 0; i < value.length; i++) {
    var c = value.charAt(i);
    valueCharSizes[i] = this.hs_.size(this.makeLineHtml_(c, p + i));
  }
  this.charSizes_ = this.charSizes_.slice(0, p).concat(
    valueCharSizes, this.charSizes_.slice(p));
  this.cursor_.pos.p += value.length;
};

// See comment for insertText_.
goatee.ed.Editor.prototype.deleteText_ = function(p, len) {
  this.text_ = this.text_.substr(0, p) + this.text_.substr(p + len);
  this.charSizes_.splice(p, len);
  this.cursor_.pos.p = p;
};

////////////////////////////////////////////////////////////////////////////////
// Selection-specific model update methods

goatee.ed.Editor.prototype.getSelection_ = function() {
  if (this.cursor_.sel === null || this.cursor_.pos.p === this.cursor_.sel.p) {
    return null;
  } else if (this.cursor_.pos.p < this.cursor_.sel.p) {
    return [this.cursor_.pos.p, this.cursor_.sel.p];
  } else {
    return [this.cursor_.sel.p, this.cursor_.pos.p];
  }
};

goatee.ed.Editor.prototype.clearSelection_ = function() {
  this.cursor_.sel = null;
};

// See comment for insertText_.
goatee.ed.Editor.prototype.deleteSelection_ = function() {
  var sel = this.getSelection_();
  console.assert(sel !== null);
  this.deleteText_(sel[0], sel[1] - sel[0]);
  this.cursor_.sel = null;
};

////////////////////////////////////////////////////////////////////////////////
// Pure rendering methods

goatee.ed.Editor.prototype.renderCursor_ = function() {
  var beginEnd = this.lineYOffsets_[this.cursor_.pos.row];
  this.cursor_.render(
    this.cursor_.pos.left, beginEnd[1], beginEnd[1] - beginEnd[0]);
};

goatee.ed.Editor.prototype.renderSelectionAndCursor_ = function() {
  var els = this.textEl_.querySelectorAll('.highlight');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    el.parentNode.removeChild(el);
  }

  var sel = this.getSelection_();
  if (sel !== null) {
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
          (sel[1] === beginEnd[1] &&
           this.text_.charAt(beginEnd[1] - 1) === '\r')) {
        el.style.right = '0';
      } else {
        var width = 0;
        for (; p < sel[1]; p++) width += this.charSizes_[p][0];
        el.style.width = width + 'px';
      }

      this.textEl_.children[row].appendChild(el);
    }
  }

  this.renderCursor_();
};

// Renders text, selection, and cursor.
// Algorithm:
//  - Build html and array of line p-offsets, based on char widths
//  - Build array of line y-offsets
//  - Process arrays to place cursor
goatee.ed.Editor.prototype.renderAll_ = function() {
  console.assert(this.charSizes_.length === this.text_.length);

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
  while (p < this.text_.length) {
    var c = this.text_.charAt(p);
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
  console.assert(p === this.text_.length);
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

  // Now that we've updated linePOffsets and lineYOffsets, we can update cursor
  // row and left.
  this.updateCursorFromP_(this.cursor_.pos.p);
  this.renderSelectionAndCursor_();
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
  if (!this.cursor_.hasFocus || this.mouseIsDown_) return;

  if (goatee.ed.Editor.IGNORE_KEYPRESS_[e.which]) return;
  if (e.which > 127) return;  // require ASCII for now
  e.preventDefault();
  if (this.cursor_.sel !== null) this.deleteSelection_();
  this.insertText_(this.cursor_.pos.p, String.fromCharCode(e.which));
  this.renderAll_();
};

goatee.ed.Editor.prototype.handleKeyDown_ = function(e) {
  if (!this.cursor_.hasFocus || this.mouseIsDown_) return;

  var sel = this.getSelection_();
  // TODO: For Linux and Windows, require ctrlKey instead of metaKey.
  if (e.metaKey) {
    var c = String.fromCharCode(e.which);
    switch (c) {
    case 'V':
      if (sel !== null) this.deleteSelection_();
      this.insertText_(this.cursor_.pos.p, this.clipboard_);
      this.renderAll_();
      break;
    case 'A':
      this.cursor_.sel = new goatee.ed.CursorPos_(
        this.text_.length, null, null);
      this.updateCursorFromP_(0);
      if (this.cursor_.sel.p === this.cursor_.pos.p) this.cursor_.sel = null;
      this.renderSelectionAndCursor_();
      break;
    case 'X':
    case 'C':
      if (sel !== null) {
        this.clipboard_ = this.text_.substr(sel[0], sel[1] - sel[0]);
        if (c === 'X') {
          this.deleteSelection_();
          this.renderAll_();
        }
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
    // Note, we use updateCursorFromRowAndX_ because we want to place the cursor
    // at EOL.
    if (e.shiftKey) {
      if (this.cursor_.sel === null) this.cursor_.sel = this.cursor_.pos.copy();
      this.updateCursorFromRowAndX_(
        this.cursor_.pos.row, this.innerWidth_, true);
      if (this.cursor_.sel.p === this.cursor_.pos.p) this.cursor_.sel = null;
    } else {
      this.updateCursorFromRowAndX_(
        this.cursor_.pos.row, this.innerWidth_, true);
      this.clearSelection_();
    }
    this.renderSelectionAndCursor_();
    break;
  case 36:  // home
    if (e.shiftKey) {
      if (this.cursor_.sel === null) this.cursor_.sel = this.cursor_.pos.copy();
      this.updateCursorFromP_(this.linePOffsets_[this.cursor_.pos.row][0]);
      if (this.cursor_.sel.p === this.cursor_.pos.p) this.cursor_.sel = null;
    } else {
      this.updateCursorFromP_(this.linePOffsets_[this.cursor_.pos.row][0]);
      this.clearSelection_();
    }
    this.renderSelectionAndCursor_();
    break;
  case 37:  // left arrow
    if (e.shiftKey) {
      if (this.cursor_.sel === null) this.cursor_.sel = this.cursor_.pos.copy();
      this.updateCursorFromP_(
        this.cursorHop_(this.cursor_.pos.p, false, e.ctrlKey));
      if (this.cursor_.sel.p === this.cursor_.pos.p) this.clearSelection_();
    } else {
      if (sel !== null) {
        if (e.ctrlKey) {
          this.updateCursorFromP_(this.cursorHop_(sel[0], false, true));
        } else {
          this.updateCursorFromP_(sel[0]);
        }
        this.clearSelection_();
      } else {
        this.updateCursorFromP_(
          this.cursorHop_(this.cursor_.pos.p, false, e.ctrlKey));
      }
    }
    this.renderSelectionAndCursor_();
    break;
  case 38:  // up arrow
    var maybeMoveCursor = (function() {
      if (this.cursor_.pos.row > 0) {
        if (this.cursor_.pos.prevLeft === null) {
          this.cursor_.pos.prevLeft = this.cursor_.pos.left;
        }
        this.updateCursorFromRowAndX_(
          this.cursor_.pos.row - 1, this.cursor_.pos.prevLeft, false);
      }
    }).bind(this);
    if (e.shiftKey) {
      if (this.cursor_.sel === null) this.cursor_.sel = this.cursor_.pos.copy();
      maybeMoveCursor();
      if (this.cursor_.sel.p === this.cursor_.pos.p) this.clearSelection_();
    } else {
      maybeMoveCursor();
      this.clearSelection_();
    }
    this.renderSelectionAndCursor_();
    break;
  case 39:  // right arrow
    if (e.shiftKey) {
      if (this.cursor_.sel === null) this.cursor_.sel = this.cursor_.pos.copy();
      this.updateCursorFromP_(
        this.cursorHop_(this.cursor_.pos.p, true, e.ctrlKey));
      if (this.cursor_.sel.p === this.cursor_.pos.p) this.clearSelection_();
    } else {
      if (sel !== null) {
        if (e.ctrlKey) {
          this.updateCursorFromP_(this.cursorHop_(sel[1], true, true));
        } else {
          this.updateCursorFromP_(sel[1]);
        }
        this.clearSelection_();
      } else {
        this.updateCursorFromP_(
          this.cursorHop_(this.cursor_.pos.p, true, e.ctrlKey));
      }
    }
    this.renderSelectionAndCursor_();
    break;
  case 40:  // down arrow
    var maybeMoveCursor = (function() {
      if (this.cursor_.pos.row < this.linePOffsets_.length - 1) {
        if (this.cursor_.pos.prevLeft === null) {
          this.cursor_.pos.prevLeft = this.cursor_.pos.left;
        }
        this.updateCursorFromRowAndX_(
          this.cursor_.pos.row + 1, this.cursor_.pos.prevLeft, false);
      }
    }).bind(this);
    if (e.shiftKey) {
      if (this.cursor_.sel === null) this.cursor_.sel = this.cursor_.pos.copy();
      maybeMoveCursor();
      if (this.cursor_.sel.p === this.cursor_.pos.p) this.clearSelection_();
    } else {
      maybeMoveCursor();
      this.clearSelection_();
    }
    this.renderSelectionAndCursor_();
    break;
  case 8:  // backspace
    if (sel !== null) {
      this.deleteSelection_();
    } else {
      var beginP = this.cursorHop_(this.cursor_.pos.p, false, e.ctrlKey);
      this.deleteText_(beginP, this.cursor_.pos.p - beginP);
    }
    this.renderAll_();
    break;
  case 46:  // delete
    if (sel !== null) {
      this.deleteSelection_();
    } else {
      var endP = this.cursorHop_(this.cursor_.pos.p, true, e.ctrlKey);
      this.deleteText_(this.cursor_.pos.p, endP - this.cursor_.pos.p);
    }
    this.renderAll_();
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
    this.cursor_.hasFocus = false;
    this.renderCursor_();
    return;
  }
  this.cursor_.hasFocus = true;
  this.mouseIsDown_ = true;
  e.preventDefault();

  var innerRect = this.innerEl_.getBoundingClientRect();
  var x = viewportX - innerRect.left;
  var y = viewportY - innerRect.top;
  this.updateCursorFromRowAndX_(this.rowFromY_(y), x, true);
  this.cursor_.sel = this.cursor_.pos.copy();
  this.renderSelectionAndCursor_();

  document.addEventListener('mousemove', this.boundHandleMouseMove_);
};

goatee.ed.Editor.prototype.handleMouseUp_ = function(e) {
  if (!this.cursor_.hasFocus) return;
  this.mouseIsDown_ = false;
  console.assert(this.cursor_.sel !== null);
  e.preventDefault();

  if (this.cursor_.pos.p === this.cursor_.sel.p) {
    this.clearSelection_();
    this.renderCursor_();
  }

  document.removeEventListener('mousemove', this.boundHandleMouseMove_);
};

goatee.ed.Editor.prototype.handleMouseMove_ = function(e) {
  console.assert(this.cursor_.hasFocus);
  console.assert(this.mouseIsDown_);
  console.assert(this.cursor_.sel !== null);
  e.preventDefault();

  var viewportX = e.pageX - window.pageXOffset;
  var viewportY = e.pageY - window.pageYOffset;

  var innerRect = this.innerEl_.getBoundingClientRect();
  var x = viewportX - innerRect.left;
  var y = viewportY - innerRect.top;
  this.updateCursorFromRowAndX_(this.rowFromY_(y), x, true);
  if (this.cursor_.pos.p === this.cursor_.sel.p) {
    // Mouse is down, with 0 chars selected. Copy CursorPos_ from start of
    // selection so that this location is used for rendering the cursor even if
    // it's EOL.
    this.cursor_.pos = this.cursor_.sel.copy();
  }
  this.renderSelectionAndCursor_();
};
