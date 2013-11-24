// Defines HtmlSizer, Cursor, and Editor classes, and constructs an Editor
// instance for the #editor div.
//
// TODO:
//  - Add some tests
//    * http://pivotal.github.io/jasmine/
//    * http://sinonjs.org/
//  - Support OT insert/delete text ops and cursor/selection ops
//  - Make select-scroll smooth
//  - Support bold, italics
//  - Support font-size and line-height
//  - Support non-ASCII characters
//  - Make objects and methods private as appropriate
//  - Fancier cut/copy/paste, see http://goo.gl/Xv1YcG
//  - Support screen scaling

'use strict';

var DEBUG = 0;

////////////////////////////////////////////////////////////////////////////////
// Data structures

var HtmlSizer = function(parentEl) {
  this.el = document.createElement('div');
  this.el.style.position = 'fixed';
  this.el.style.top = '-1000px';
  this.el.style.left = '-1000px';
  this.el.style.visibilty = 'hidden';
  parentEl.appendChild(this.el);
};

HtmlSizer.prototype.size = function(html) {
  this.el.innerHTML = html;
  var res = [this.el.offsetWidth, this.el.offsetHeight];
  this.el.innerHTML = '';
  return res;
};

HtmlSizer.prototype.width = function(html) {
  return this.size(html)[0];
};

HtmlSizer.prototype.height = function(html) {
  return this.size(html)[1];
};

var CursorPos = function(p, row, left) {
  this.p = p;        // in [0, text.length]
  this.row = row;    // row (line number), used for up/down arrow keys
  this.left = left;  // left position, in pixels

  // Used for tracking previous left position, needed to implement up and down
  // arrow keys.
  this.prevLeft = null;
};

CursorPos.prototype.copy = function() {
  return new CursorPos(this.p, this.row, this.left);
};

var Cursor = function() {
  this.pos = new CursorPos(0, 0, 0);
  this.sel = null;  // start pos of selection, or null if no selection

  this.hasFocus = true;  // whether the editor has focus
  this.blinkTimer = 0;

  this.el = document.createElement('div');
  this.el.className = 'cursor';

  window.setInterval(function() {
    if (!this.hasFocus || this.blinkTimer === -1) return;
    this.blinkTimer = (this.blinkTimer + 1) % 10;
    // Visible 60% of the time, hidden 40% of the time.
    this.el.style.visibility = (this.blinkTimer < 6) ? 'visible' : 'hidden';
  }.bind(this), 100);
};

// Here, bottom means "distance from top of editor to bottom of cursor".
Cursor.prototype.renderInternal = function(left, bottom, height) {
  if (DEBUG) console.log(this.pos, this.sel, this.hasFocus);
  if (DEBUG) console.log(left, bottom, height);

  this.el.style.left = left + 'px';
  this.el.style.top = bottom - height + 'px';
  this.el.style.height = height + 'px';

  if (!this.hasFocus) {
    this.el.style.visibility = 'hidden';
  } else if (this.sel !== null) {
    this.blinkTimer = -1;
    this.el.style.visibility = (
      this.pos.p === this.sel.p ? 'visible' : 'hidden');
  } else {
    this.blinkTimer = 0;
    this.el.style.visibility = 'visible';
  }

  // If the cursor is not in the window, scroll the window.
  var wTop = window.pageYOffset, wBottom = wTop + window.innerHeight;
  var cRect = this.el.getBoundingClientRect();
  var cTop = wTop + cRect.top, cBottom = wTop + cRect.bottom;
  if (cTop < wTop + 10) {
    window.scrollBy(0, -(wTop - cTop + 100));
  } else if (cBottom > wBottom - 10) {
    window.scrollBy(0, cBottom - wBottom + 100);
  }
};

var Editor = function(editorEl) {
  this.text = '';
  this.clipboard = '';
  this.cursor = new Cursor();
  this.mouseIsDown = false;

  // Updated by insertText and deleteText.
  this.charSizes = [];       // array of [width, height]
  // Updated by renderAll.
  this.linePOffsets = null;  // array of [beginP, endP]
  this.lineYOffsets = null;  // array of [begin, end] px relative to window top

  this.textEl = document.createElement('div');
  this.innerEl = document.createElement('div');
  this.innerEl.id = 'editor-inner';
  this.innerEl.appendChild(this.textEl);
  this.innerEl.appendChild(this.cursor.el);
  this.el = editorEl;
  this.el.appendChild(this.innerEl);
  this.hs = new HtmlSizer(this.el);

  // Set fields that depend on DOM.
  this.innerWidth = parseInt(window.getComputedStyle(
    this.innerEl, null).getPropertyValue('width'), 10);
  // Used by handleMouseDown.
  this.padding = parseInt(window.getComputedStyle(
    this.el, null).getPropertyValue('padding'), 10);
  this.border = parseInt(window.getComputedStyle(
    this.el, null).getPropertyValue('border-width'), 10);

  this.renderAll();  // perform initial rendering

  // Finally, set up listeners to handle user input events.
  this.boundHandleMouseMove = this.handleMouseMove.bind(this);
  document.addEventListener('keypress', this.handleKeyPress.bind(this));
  document.addEventListener('keydown', this.handleKeyDown.bind(this));
  document.addEventListener('mousedown', this.handleMouseDown.bind(this));
  document.addEventListener('mouseup', this.handleMouseUp.bind(this));
};

////////////////////////////////////////////////////////////////////////////////
// Utility methods

Editor.prototype.rowFromY = function(y) {
  var row;
  // TODO: Use binary search.
  for (row = 0; row < this.lineYOffsets.length - 1; row++) {
    if (y <= this.lineYOffsets[row][1]) break;
  }
  return row;
};

Editor.prototype.cursorHop = function(p, forward, hop) {
  if (forward) {
    if (hop) {
      while (p < this.text.length && /\s/.test(this.text.charAt(p))) p++;
      while (p < this.text.length && !/\s/.test(this.text.charAt(p))) p++;
    } else if (p < this.text.length) {
      p++;
    }
  } else {  // backward
    if (hop) {
      while (p > 0 && /\s/.test(this.text.charAt(p - 1))) p--;
      while (p > 0 && !/\s/.test(this.text.charAt(p - 1))) p--;
    } else if (p > 0) {
      p--;
    }
  }
  return p;
};

////////////////////////////////////////////////////////////////////////////////
// Model update methods

// Some of these (e.g. insertText) also update data needed only for rendering,
// for efficiency purposes.

// Updates cursor state given row and x position (in pixels).
// Assumes text, charSizes, etc. are up-to-date.
Editor.prototype.updateCursorFromRowAndX = function(row, x, clearPrevLeft) {
  // Find char whose left is closest to x.
  var beginEnd = this.linePOffsets[row];
  var pEnd = beginEnd[1];
  if (pEnd > 0 && this.text.charAt(pEnd - 1) === '\r') pEnd--;

  var p = beginEnd[0], left = 0;
  for (; p < pEnd; p++) {
    var newLeft = left + this.charSizes[p][0];
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

  this.cursor.pos.p = p;
  this.cursor.pos.row = row;
  this.cursor.pos.left = left;
  if (clearPrevLeft) this.cursor.pos.prevLeft = null;
};

// Updates cursor state given p (offset).
// Assumes text, charSizes, etc. are up-to-date.
Editor.prototype.updateCursorFromP = function(p) {
  var numRows = this.linePOffsets.length;
  var row = 0;
  // TODO: Use binary search.
  for (; row < numRows - 1; row++) {
    if (p < this.linePOffsets[row][1]) break;
  }
  var left = 0;
  for (var q = this.linePOffsets[row][0]; q < p; q++) {
    left += this.charSizes[q][0];
  }

  this.cursor.pos.p = p;
  this.cursor.pos.row = row;
  this.cursor.pos.left = left;
  this.cursor.pos.prevLeft = null;
};

Editor.escapeCharMap = {
  ' ': '&nbsp;',
  '"': '&quot;',
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
};

Editor.escapeChar = function(c) {
  var x = Editor.escapeCharMap[c];
  return x ? x : c;
};

// Generates html for the given line of text, assuming the text starts at
// position p.
Editor.prototype.makeLineHtml = function(text, p) {
  var res = '';
  var len = text.length;
  for (var i = 0; i < len; i++) {
    var c = text.charAt(i);
    if (c === '\r') {
      c = '';
    } else {
      c = Editor.escapeChar(c);
    }
    console.assert(!/\s/.test(c));
    res += c;
  }
  return '<div class="line"><div class="line-inner">' + res + '</div></div>';
};

// Updates text, charSizes, and cursor offset. Other cursor state (row and left)
// must be updated by renderAll, since that's where we update linePOffsets and
// lineYOffsets.
Editor.prototype.insertText = function(p, value) {
  this.text = this.text.substr(0, p) + value + this.text.substr(p);
  var valueCharSizes = new Array(value.length);
  for (var i = 0; i < value.length; i++) {
    var c = value.charAt(i);
    valueCharSizes[i] = this.hs.size(this.makeLineHtml(c, p + i));
  }
  this.charSizes = this.charSizes.slice(0, p).concat(
    valueCharSizes, this.charSizes.slice(p));
  this.cursor.pos.p += value.length;
};

// See comment for insertText.
Editor.prototype.deleteText = function(p, len) {
  this.text = this.text.substr(0, p) + this.text.substr(p + len);
  this.charSizes.splice(p, len);
  this.cursor.pos.p = p;
};

////////////////////////////////////////////////////////////////////////////////
// Selection-specific model update methods

Editor.prototype.getSelection = function() {
  if (this.cursor.sel === null || this.cursor.pos.p === this.cursor.sel.p) {
    return null;
  } else if (this.cursor.pos.p < this.cursor.sel.p) {
    return [this.cursor.pos.p, this.cursor.sel.p];
  } else {
    return [this.cursor.sel.p, this.cursor.pos.p];
  }
};

Editor.prototype.clearSelection = function() {
  this.cursor.sel = null;
};

// See comment for insertText.
Editor.prototype.deleteSelection = function() {
  var sel = this.getSelection();
  console.assert(sel !== null);
  this.deleteText(sel[0], sel[1] - sel[0]);
  this.cursor.sel = null;
};

////////////////////////////////////////////////////////////////////////////////
// Pure rendering methods

Editor.prototype.renderCursor = function() {
  var beginEnd = this.lineYOffsets[this.cursor.pos.row];
  this.cursor.renderInternal(
    this.cursor.pos.left, beginEnd[1], beginEnd[1] - beginEnd[0]);
};

Editor.prototype.renderSelectionAndCursor = function() {
  var els = this.textEl.querySelectorAll('.highlight');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    el.parentNode.removeChild(el);
  }

  var sel = this.getSelection();
  if (sel !== null) {
    var numRows = this.linePOffsets.length;
    console.assert(numRows === this.textEl.children.length);
    for (var row = 0; row < numRows; row++) {
      var beginEnd = this.linePOffsets[row];
      if (sel[0] >= beginEnd[1]) continue;
      if (sel[1] <= beginEnd[0]) break;

      var el = document.createElement('div');
      el.className = 'highlight';

      // Compute left.
      var p = beginEnd[0], left = 0;
      for (; p < sel[0]; p++) left += this.charSizes[p][0];
      el.style.left = left + 'px';

      // Compute right (or width).
      if (sel[1] > beginEnd[1] ||
          (sel[1] === beginEnd[1] &&
           this.text.charAt(beginEnd[1] - 1) === '\r')) {
        el.style.right = '0';
      } else {
        var width = 0;
        for (; p < sel[1]; p++) width += this.charSizes[p][0];
        el.style.width = width + 'px';
      }

      this.textEl.children[row].appendChild(el);
    }
  }

  this.renderCursor();
};

// Renders text, selection, and cursor.
// Algorithm:
//  - Build html and array of line p-offsets, based on char widths
//  - Build array of line y-offsets
//  - Process arrays to place cursor
Editor.prototype.renderAll = function() {
  console.assert(this.charSizes.length === this.text.length);

  // Global state.
  this.linePOffsets = [];
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
  while (p < this.text.length) {
    var c = this.text.charAt(p);
    lineText += c;
    if (c === '\r') {
      p++;
    } else {
      lineWidth += this.charSizes[p][0];
      if (c === ' ') lineLastSpace = p - lineBegin;
      if (lineWidth <= this.innerWidth) {
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
    this.linePOffsets[row] = [lineBegin, p];
    html += this.makeLineHtml(lineText, lineBegin);
    row++;
    // Reset per-line state.
    lineText = '';
    lineBegin = p;
    lineWidth = 0;
    lineLastSpace = -1;
  }
  // Add last line.
  console.assert(p === this.text.length);
  this.linePOffsets[row] = [lineBegin, p];
  html += this.makeLineHtml(lineText, lineBegin);

  this.textEl.innerHTML = html;

  // Compute lineYOffsets.
  this.lineYOffsets = new Array(numRows);
  var numRows = this.linePOffsets.length;
  var beginPx = 0;
  var emptyLineHeight = this.hs.height(this.makeLineHtml('', p));
  for (var row = 0; row < numRows; row++) {
    var lineHeight = emptyLineHeight;
    var beginEnd = this.linePOffsets[row];
    for (var p = beginEnd[0]; p < beginEnd[1]; p++) {
      lineHeight = Math.max(lineHeight, this.charSizes[p][1]);
    }
    this.lineYOffsets[row] = [beginPx, beginPx + lineHeight];
    beginPx += lineHeight;
  }

  // Now that we've updated linePOffsets and lineYOffsets, we can update cursor
  // row and left.
  this.updateCursorFromP(this.cursor.pos.p);
  this.renderSelectionAndCursor();
};

////////////////////////////////////////////////////////////////////////////////
// Input handlers

// We ignore these keypress codes.
Editor.ignore = {
  63232: true,  // ctrl up
  63233: true,  // ctrl down
  63234: true,  // ctrl left
  63235: true,  // ctrl right
  63272: true   // ctrl delete
};

Editor.prototype.handleKeyPress = function(e) {
  if (!this.cursor.hasFocus || this.mouseIsDown) return;

  if (Editor.ignore[e.which]) return;
  if (e.which > 127) return;  // require ASCII for now
  e.preventDefault();
  if (this.cursor.sel !== null) this.deleteSelection();
  this.insertText(this.cursor.pos.p, String.fromCharCode(e.which));
  this.renderAll();
};

Editor.prototype.handleKeyDown = function(e) {
  if (!this.cursor.hasFocus || this.mouseIsDown) return;

  var sel = this.getSelection();
  if (e.metaKey) {
    var c = String.fromCharCode(e.which);
    switch (c) {
    case 'V':
      if (sel !== null) this.deleteSelection();
      this.insertText(this.cursor.pos.p, this.clipboard);
      this.renderAll();
      break;
    case 'A':
      this.cursor.sel = new CursorPos(this.text.length, null, null);
      this.updateCursorFromP(0);
      if (this.cursor.sel.p === this.cursor.pos.p) this.cursor.sel = null;
      this.renderSelectionAndCursor();
      break;
    case 'X':
    case 'C':
      if (sel !== null) {
        this.clipboard = this.text.substr(sel[0], sel[1]);
        if (c === 'X') {
          this.deleteSelection();
          this.renderAll();
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
    // Note, we use updateCursorFromRowAndX because we want to place the cursor
    // at EOL.
    if (e.shiftKey) {
      if (this.cursor.sel === null) this.cursor.sel = this.cursor.pos.copy();
      this.updateCursorFromRowAndX(this.cursor.pos.row, this.innerWidth, true);
      if (this.cursor.sel.p === this.cursor.pos.p) this.cursor.sel = null;
    } else {
      this.updateCursorFromRowAndX(this.cursor.pos.row, this.innerWidth, true);
      this.clearSelection();
    }
    this.renderSelectionAndCursor();
    break;
  case 36:  // home
    if (e.shiftKey) {
      if (this.cursor.sel === null) this.cursor.sel = this.cursor.pos.copy();
      this.updateCursorFromP(this.linePOffsets[this.cursor.pos.row][0]);
      if (this.cursor.sel.p === this.cursor.pos.p) this.cursor.sel = null;
    } else {
      this.updateCursorFromP(this.linePOffsets[this.cursor.pos.row][0]);
      this.clearSelection();
    }
    this.renderSelectionAndCursor();
    break;
  case 37:  // left arrow
    if (e.shiftKey) {
      if (this.cursor.sel === null) this.cursor.sel = this.cursor.pos.copy();
      this.updateCursorFromP(
        this.cursorHop(this.cursor.pos.p, false, e.ctrlKey));
      if (this.cursor.sel.p === this.cursor.pos.p) this.clearSelection();
    } else {
      if (sel !== null) {
        this.updateCursorFromP(sel[0]);
        this.clearSelection();
      } else {
        this.updateCursorFromP(
          this.cursorHop(this.cursor.pos.p, false, e.ctrlKey));
      }
    }
    this.renderSelectionAndCursor();
    break;
  case 38:  // up arrow
    var maybeMoveCursor = function() {
      if (this.cursor.pos.row > 0) {
        if (this.cursor.pos.prevLeft === null) {
          this.cursor.pos.prevLeft = this.cursor.pos.left;
        }
        this.updateCursorFromRowAndX(
          this.cursor.pos.row - 1, this.cursor.pos.prevLeft, false);
      }
    }.bind(this);
    if (e.shiftKey) {
      if (this.cursor.sel === null) this.cursor.sel = this.cursor.pos.copy();
      maybeMoveCursor();
      if (this.cursor.sel.p === this.cursor.pos.p) this.clearSelection();
    } else {
      maybeMoveCursor();
      this.clearSelection();
    }
    this.renderSelectionAndCursor();
    break;
  case 39:  // right arrow
    if (e.shiftKey) {
      if (this.cursor.sel === null) this.cursor.sel = this.cursor.pos.copy();
      this.updateCursorFromP(
        this.cursorHop(this.cursor.pos.p, true, e.ctrlKey));
      if (this.cursor.sel.p === this.cursor.pos.p) this.clearSelection();
    } else {
      if (sel !== null) {
        this.updateCursorFromP(sel[1]);
        this.clearSelection();
      } else {
        this.updateCursorFromP(
          this.cursorHop(this.cursor.pos.p, true, e.ctrlKey));
      }
    }
    this.renderSelectionAndCursor();
    break;
  case 40:  // down arrow
    var maybeMoveCursor = function() {
      if (this.cursor.pos.row < this.linePOffsets.length - 1) {
        if (this.cursor.pos.prevLeft === null) {
          this.cursor.pos.prevLeft = this.cursor.pos.left;
        }
        this.updateCursorFromRowAndX(
          this.cursor.pos.row + 1, this.cursor.pos.prevLeft, false);
      }
    }.bind(this);
    if (e.shiftKey) {
      if (this.cursor.sel === null) this.cursor.sel = this.cursor.pos.copy();
      maybeMoveCursor();
      if (this.cursor.sel.p === this.cursor.pos.p) this.clearSelection();
    } else {
      maybeMoveCursor();
      this.clearSelection();
    }
    this.renderSelectionAndCursor();
    break;
  case 8:  // backspace
    if (sel !== null) {
      this.deleteSelection();
    } else {
      var beginP = this.cursorHop(this.cursor.pos.p, false, e.ctrlKey);
      this.deleteText(beginP, this.cursor.pos.p - beginP);
    }
    this.renderAll();
    break;
  case 46:  // delete
    if (sel !== null) {
      this.deleteSelection();
    } else {
      var endP = this.cursorHop(this.cursor.pos.p, true, e.ctrlKey);
      this.deleteText(this.cursor.pos.p, endP - this.cursor.pos.p);
    }
    this.renderAll();
    break;
  default:
    return;
  }
  e.preventDefault();
};

Editor.prototype.handleMouseDown = function(e) {
  var viewportX = e.pageX - window.pageXOffset;
  var viewportY = e.pageY - window.pageYOffset;

  var rect = this.el.getBoundingClientRect();
  if (viewportX < rect.left || viewportX > rect.right ||
      viewportY < rect.top || viewportY > rect.bottom) {
    this.cursor.hasFocus = false;
    this.renderCursor();
    return;
  }
  this.cursor.hasFocus = true;
  this.mouseIsDown = true;
  e.preventDefault();

  var innerRect = this.innerEl.getBoundingClientRect();
  var x = viewportX - innerRect.left;
  var y = viewportY - innerRect.top;
  this.updateCursorFromRowAndX(this.rowFromY(y), x, true);
  this.cursor.sel = this.cursor.pos.copy();
  this.renderSelectionAndCursor();

  document.addEventListener('mousemove', this.boundHandleMouseMove);
};

Editor.prototype.handleMouseUp = function(e) {
  if (!this.cursor.hasFocus) return;
  this.mouseIsDown = false;
  console.assert(this.cursor.sel !== null);
  e.preventDefault();

  if (this.cursor.pos.p === this.cursor.sel.p) {
    this.clearSelection();
    this.renderCursor();
  }

  document.removeEventListener('mousemove', this.boundHandleMouseMove);
};

Editor.prototype.handleMouseMove = function(e) {
  console.assert(this.cursor.hasFocus);
  console.assert(this.mouseIsDown);
  console.assert(this.cursor.sel !== null);
  e.preventDefault();

  var viewportX = e.pageX - window.pageXOffset;
  var viewportY = e.pageY - window.pageYOffset;

  var innerRect = this.innerEl.getBoundingClientRect();
  var x = viewportX - innerRect.left;
  var y = viewportY - innerRect.top;
  this.updateCursorFromRowAndX(this.rowFromY(y), x, true);
  if (this.cursor.pos.p === this.cursor.sel.p) {
    // Mouse is down, with 0 chars selected. Use row and left from start of
    // selection so that this location is used for rendering the cursor even if
    // it's EOL.
    this.cursor.pos.row = this.cursor.sel.row;
    this.cursor.pos.left = this.cursor.sel.left;
  }
  this.renderSelectionAndCursor();
};

var ed = new Editor(document.querySelector('#editor'));
