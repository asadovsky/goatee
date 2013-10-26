// Defines HtmlSizer, Cursor, and Editor classes, and constructs an Editor
// instance for the #editor div.
//
// TODO:
//  - Add some tests
//    * http://pivotal.github.io/jasmine/
//    * http://sinonjs.org/
//  - Make select-scroll smooth
//  - Make select-scroll work when mouse goes below window
//  - Make shift arrow (keyboard-based selection) work
//  - Support OT insert/delete text ops and cursor/selection ops
//  - Support bold, italics
//  - Support font-size and line-height
//  - Support non-ASCII characters
//  - Make objects and methods private as appropriate
//  - Fancier cut/copy/paste, see http://goo.gl/Xv1YcG
//  - Support screen scaling

'use strict';

var DEBUG = 0;

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

var Cursor = function() {
  this.p = 0;     // in [0, text.length]
  this.row = 0;   // row (line number), used for up/down arrow keys
  this.left = 0;  // left position, in pixels

  this.hasFocus = true;  // whether the editor has focus
  this.blinkTimer = 0;

  // If not null, the region between p and selP is selected.
  // Note, selP may be bigger than p.
  this.selP = null;
  // If not null, the row and left from start of selection.
  this.selRowLeft = null;

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
  if (DEBUG) console.log(this.p, this.selP, this.row, this.hasFocus);
  if (DEBUG) console.log(left, bottom, height);

  this.el.style.left = left + 'px';
  this.el.style.top = bottom - height + 'px';
  this.el.style.height = height + 'px';

  if (!this.hasFocus) {
    this.el.style.visibility = 'hidden';
  } else if (this.selP !== null) {
    this.blinkTimer = -1;
    this.el.style.visibility = (this.p === this.selP ? 'visible' : 'hidden');
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

  // Populated by renderAll.
  this.charSizes = [];     // array of [width, height]
  this.linePOffsets = [];  // array of [beginP, endP]
  this.lineYOffsets = [];  // array of [begin, end] px relative to window top

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

Editor.prototype.insertText = function(p, value) {
  this.text = this.text.substr(0, p) + value + this.text.substr(p);
  this.cursor.p += value.length;
  var valueCharSizes = new Array(value.length);
  for (var i = 0; i < value.length; i++) {
    var c = value.charAt(i);
    valueCharSizes[i] = this.hs.size(this.makeLineHtml(c, p + i));
  }
  this.charSizes = this.charSizes.slice(0, p).concat(
    valueCharSizes, this.charSizes.slice(p));
};

Editor.prototype.deleteText = function(p, len) {
  this.text = this.text.substr(0, p) + this.text.substr(p + len);
  this.cursor.p = p;
  this.charSizes.splice(p, len);
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

Editor.prototype.renderCursor = function() {
  var beginEnd = this.lineYOffsets[this.cursor.row];
  this.cursor.renderInternal(
    this.cursor.left, beginEnd[1], beginEnd[1] - beginEnd[0]);
};

// Updates cursor state (p, left), then renders cursor.
Editor.prototype.updateCursorFromRowAndX = function(row, x, updateLeft) {
  var tup = this.charPosFromRowAndX(row, x);
  var p = tup[0], left = tup[1];
  var beginEnd = this.lineYOffsets[row];

  this.cursor.p = p;
  this.cursor.row = row;
  if (updateLeft) this.cursor.left = left;
  this.cursor.renderInternal(left, beginEnd[1], beginEnd[1] - beginEnd[0]);
};

// Updates cursor state (row, left), then renders cursor.
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
  var beginEnd = this.lineYOffsets[row];

  this.cursor.p = p;
  this.cursor.row = row;
  this.cursor.left = left;
  this.cursor.renderInternal(left, beginEnd[1], beginEnd[1] - beginEnd[0]);
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

  // Can only happen on mousedown + mousemove, with 0 chars selected.
  if (sel === null && this.cursor.selRowLeft !== null) {
    // Use row and left from start of selection so that this location is used
    // even if it's EOL.
    this.cursor.row = this.cursor.selRowLeft[0];
    this.cursor.left = this.cursor.selRowLeft[1];
    this.renderCursor();
  } else {
    this.updateCursorFromP(this.cursor.p);
  }
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

  this.renderSelectionAndCursor();
};

Editor.prototype.rowFromY = function(y) {
  var row;
  // TODO: Use binary search.
  for (row = 0; row < this.lineYOffsets.length - 1; row++) {
    if (y <= this.lineYOffsets[row][1]) break;
  }
  return row;
};

// Returns [p, left] for character.
Editor.prototype.charPosFromRowAndX = function(row, x) {
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
  return [p, left];
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

// We ignore these keypress codes.
Editor.ignore = {
  63232: true,  // ctrl up
  63233: true,  // ctrl down
  63234: true,  // ctrl left
  63235: true,  // ctrl right
  63272: true   // ctrl delete
};

Editor.prototype.getSelection = function() {
  if (this.cursor.selP === null || this.cursor.p === this.cursor.selP) {
    return null;
  } else if (this.cursor.p < this.cursor.selP) {
    return [this.cursor.p, this.cursor.selP];
  } else {
    return [this.cursor.selP, this.cursor.p];
  }
};

Editor.prototype.clearSelection = function() {
  console.assert(this.cursor.selP !== null);
  this.cursor.selP = null;
  this.cursor.selRowLeft = null;
};

Editor.prototype.deleteSelection = function() {
  var sel = this.getSelection();
  console.assert(sel !== null);
  this.deleteText(sel[0], sel[1] - sel[0]);
  this.cursor.selP = null;
  this.cursor.selRowLeft = null;
};

Editor.prototype.handleKeyPress = function(e) {
  if (!this.cursor.hasFocus) return;
  if (Editor.ignore[e.which]) return;
  if (e.which > 127) return;  // require ASCII for now
  e.preventDefault();
  if (this.cursor.selP !== null) this.deleteSelection();
  this.insertText(this.cursor.p, String.fromCharCode(e.which));
  this.renderAll();
};

Editor.prototype.handleKeyDown = function(e) {
  if (!this.cursor.hasFocus) return;

  var sel = this.getSelection();
  if (e.metaKey) {
    var c = String.fromCharCode(e.which);
    switch (c) {
    case 'V':
      if (sel !== null) this.deleteSelection();
      this.insertText(this.cursor.p, this.clipboard);
      this.renderAll();
      break;
    case 'A':
      if (this.text.length > 0) {
        this.cursor.p = 0;
        this.cursor.selP = this.text.length;
        this.cursor.selRowLeft = null;
      }
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
    if (sel !== null) {
      this.clearSelection();
      this.renderSelectionAndCursor();
    }
    // Note, we use updateCursorFromRowAndX because we want to place the cursor
    // at EOL.
    this.updateCursorFromRowAndX(this.cursor.row, this.innerWidth, true);
    break;
  case 36:  // home
    if (sel !== null) {
      this.clearSelection();
      this.renderSelectionAndCursor();
    }
    this.updateCursorFromP(this.linePOffsets[this.cursor.row][0]);
    break;
  case 37:  // left arrow
    if (sel !== null) {
      this.cursor.p = sel[0];
      this.clearSelection();
      this.renderSelectionAndCursor();
    } else {
      this.updateCursorFromP(this.cursorHop(this.cursor.p, false, e.ctrlKey));
    }
    break;
  case 38:  // up arrow
    if (sel !== null) {
      this.clearSelection();
      this.renderSelectionAndCursor();
    }
    if (this.cursor.row !== 0) {
      this.updateCursorFromRowAndX(
        this.cursor.row - 1, this.cursor.left, false);
    }
    break;
  case 39:  // right arrow
    if (sel !== null) {
      this.cursor.p = sel[1];
      this.clearSelection();
      this.renderSelectionAndCursor();
    } else {
      this.updateCursorFromP(this.cursorHop(this.cursor.p, true, e.ctrlKey));
    }
    break;
  case 40:  // down arrow
    if (sel !== null) {
      this.clearSelection();
      this.renderSelectionAndCursor();
    }
    if (this.cursor.row !== this.linePOffsets.length - 1) {
      this.updateCursorFromRowAndX(
        this.cursor.row + 1, this.cursor.left, false);
    }
    break;
  case 8:  // backspace
    if (sel !== null) {
      this.deleteSelection();
    } else {
      var beginP = this.cursorHop(this.cursor.p, false, e.ctrlKey);
      this.deleteText(beginP, this.cursor.p - beginP);
    }
    this.renderAll();
    break;
  case 46:  // delete
    if (sel !== null) {
      this.deleteSelection();
    } else {
      var endP = this.cursorHop(this.cursor.p, true, e.ctrlKey);
      this.deleteText(this.cursor.p, endP - this.cursor.p);
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
  e.preventDefault();

  if (this.cursor.selP !== null) {
    this.clearSelection();
    this.renderSelectionAndCursor();
  }

  var innerRect = this.innerEl.getBoundingClientRect();
  var x = viewportX - innerRect.left;
  var y = viewportY - innerRect.top;
  this.updateCursorFromRowAndX(this.rowFromY(y), x, true);
  this.cursor.selP = this.cursor.p;
  this.cursor.selRowLeft = [this.cursor.row, this.cursor.left];

  document.addEventListener('mousemove', this.boundHandleMouseMove);
};

Editor.prototype.handleMouseUp = function(e) {
  if (!this.cursor.hasFocus) return;
  e.preventDefault();
  console.assert(this.cursor.selP !== null);
  if (this.cursor.p === this.cursor.selP) {
    this.clearSelection();
    this.renderCursor();
  }
  document.removeEventListener('mousemove', this.boundHandleMouseMove);
};

Editor.prototype.handleMouseMove = function(e) {
  console.assert(this.cursor.hasFocus);
  e.preventDefault();
  console.assert(this.cursor.selP !== null);
  var viewportX = e.pageX - window.pageXOffset;
  var viewportY = e.pageY - window.pageYOffset;

  var innerRect = this.innerEl.getBoundingClientRect();
  var x = viewportX - innerRect.left;
  var y = viewportY - innerRect.top;
  this.cursor.p = this.charPosFromRowAndX(this.rowFromY(y), x)[0];

  this.renderSelectionAndCursor();
};

var ed = new Editor(document.querySelector('#editor'));
