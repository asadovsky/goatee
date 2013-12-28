// Defines TextAreaEditor class.
//
// TODO:
//  - Catch undo/redo, maybe using 'input' event

'use strict';

var goatee = goatee || {};
goatee.ta = goatee.ta || {};

////////////////////////////////////////////////////////////////////////////////
// Model_

goatee.ta.Model_ = function() {
  this.insertText = function(pos, value) {};
  this.deleteText = function(pos, len) {};
};

////////////////////////////////////////////////////////////////////////////////
// TextAreaEditor

goatee.ta.TextAreaEditor = function(editorEl, model) {
  this.el_ = editorEl;
  this.reset(model);

  // Register input handlers. Use keypress to catch char insertions, keydown to
  // catch backspace/delete. Also catch cut and paste.
  this.el_.addEventListener('keypress', this.handleKeyPress_.bind(this));
  this.el_.addEventListener('keydown', this.handleKeyDown_.bind(this));
  this.el_.addEventListener('cut', this.handleCut_.bind(this));
  this.el_.addEventListener('paste', this.handlePaste_.bind(this));
};

goatee.ta.TextAreaEditor.prototype.reset = function(model) {
  this.m_ = model || new goatee.ta.Model_();

  if (model) {
    // Register model event handlers.
    this.m_.addEventListener(
      goatee.EventType.TEXT_INSERT, this.handleInsertText_.bind(this));
    this.m_.addEventListener(
      goatee.EventType.TEXT_DELETE, this.handleDeleteText_.bind(this));

    this.el_.value = this.m_.getText();
  }
};

////////////////////////////////////////////////////////////////////////////////
// Model event handlers

goatee.ta.TextAreaEditor.prototype.handleInsertText_ = function(
  pos, value, isLocal) {
  if (isLocal) return;
  var selStart = this.el_.selectionStart, selEnd = this.el_.selectionEnd;
  var t = this.el_.value;
  this.el_.value = t.substr(0, pos) + value + t.substr(pos);
  // If this editor has focus, update its cursor position.
  if (document.activeElement === this.el_) {
    if (selStart >= pos) selStart += value.length;
    if (selEnd >= pos) selEnd += value.length;
    this.el_.setSelectionRange(selStart, selEnd);
  }
};

goatee.ta.TextAreaEditor.prototype.handleDeleteText_ = function(
  pos, len, isLocal) {
  if (isLocal) return;
  var selStart = this.el_.selectionStart, selEnd = this.el_.selectionEnd;
  var t = this.el_.value;
  this.el_.value = t.substr(0, pos) + t.substr(pos + len);
  // If this editor has focus, update its cursor position.
  if (document.activeElement === this.el_) {
    if (selStart > pos) selStart = Math.max(pos, selStart - len);
    if (selEnd > pos) selEnd = Math.max(pos, selEnd - len);
    this.el_.setSelectionRange(selStart, selEnd);
  }
};

////////////////////////////////////////////////////////////////////////////////
// Input handlers

goatee.ta.TextAreaEditor.prototype.handleKeyDown_ = function(e) {
  var selStart = this.el_.selectionStart, selEnd = this.el_.selectionEnd;
  switch (e.which) {
  case 8:  // backspace
    // Handles ctrl+backspace.
    window.setTimeout((function() {
      var newSelStart = this.el_.selectionStart;
      var len = selEnd - newSelStart;
      if (len > 0) {
        this.m_.deleteText(newSelStart, len);
      }
    }).bind(this), 0);
    break;
  case 46:  // delete
    // Handles ctrl+delete.
    var size = this.el_.value.length;
    window.setTimeout((function() {
      var newSize = this.el_.value.length;
      var len = size - newSize;
      if (len > 0) {
        this.m_.deleteText(selStart, len);
      }
    }).bind(this), 0);
    break;
  }
};

goatee.ta.TextAreaEditor.prototype.handleKeyPress_ = function(e) {
  var selStart = this.el_.selectionStart, selEnd = this.el_.selectionEnd;
  // If there was a prior selection, log the deletion.
  if (selStart < selEnd) {
    this.m_.deleteText(selStart, selEnd - selStart);
  }
  this.m_.insertText(selStart, String.fromCharCode(event.which));
};

goatee.ta.TextAreaEditor.prototype.handleCut_ = function(e) {
  var selStart = this.el_.selectionStart, selEnd = this.el_.selectionEnd;
  if (selStart < selEnd) {
    this.m_.deleteText(selStart, selEnd - selStart);
  }
};

goatee.ta.TextAreaEditor.prototype.handlePaste_ = function(e) {
  var selStart = this.el_.selectionStart, selEnd = this.el_.selectionEnd;
  // If there was a prior selection, log the deletion.
  if (selStart < selEnd) {
    this.m_.deleteText(selStart, selEnd - selStart);
  }
  // Get the pasted content.
  window.setTimeout((function() {
    var newSelStart = this.el_.selectionStart;
    this.m_.insertText(selStart, this.el_.value.substr(selStart, newSelStart));
  }).bind(this), 0);
};