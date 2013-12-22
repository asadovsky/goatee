// Defines TextAreaEditor class.
//
// Public methods setText, insertText, and deleteText update the view.
//
// TODO:
//  - Catch undo/redo, maybe using 'input' event
//  - Update cursor position in insertText and deleteText

'use strict';

var goatee = goatee || {};

goatee.TextAreaEditor = function(editorEl) {
  this.el_ = editorEl;

  // Bind public methods to this instance.
  this.setText = this.setText.bind(this);
  this.insertText = this.insertText.bind(this);
  this.deleteText = this.deleteText.bind(this);

  this.listeners_ = {};
  this.listeners_[goatee.EventType.TEXT_INSERT] = [];
  this.listeners_[goatee.EventType.TEXT_DELETE] = [];

  // Set up listeners to handle user input events. Use keypress to catch char
  // insertions, keydown to catch backspace/delete. Also catch cut and paste.
  this.el_.addEventListener('keypress', this.handleKeyPress_.bind(this));
  this.el_.addEventListener('keydown', this.handleKeyDown_.bind(this));
  this.el_.addEventListener('cut', this.handleCut_.bind(this));
  this.el_.addEventListener('paste', this.handlePaste_.bind(this));
};

goatee.TextAreaEditor.prototype.setText = function(text) {
  this.el_.value = text;
};

goatee.TextAreaEditor.prototype.insertText = function(pos, value) {
  var t = this.el_.value;
  this.el_.value = t.substr(0, pos) + value + t.substr(pos);
};

goatee.TextAreaEditor.prototype.deleteText = function(pos, len) {
  var t = this.el_.value;
  this.el_.value = t.substr(0, pos) + t.substr(pos + len);
};

goatee.TextAreaEditor.prototype.addEventListener = function(type, handler) {
  this.listeners_[type].push(handler);
};

goatee.TextAreaEditor.prototype.removeEventListener = function(type, handler) {
  goatee.removeFromArray(handler, this.listeners_[type]);
};

goatee.TextAreaEditor.prototype.logInsertText_ = function(pos, value) {
  var arr = this.listeners_[goatee.EventType.TEXT_INSERT];
  for (var i = 0; i < arr.length; i++) {
    arr[i](pos, value);
  }
};

goatee.TextAreaEditor.prototype.logDeleteText_ = function(pos, len) {
  var arr = this.listeners_[goatee.EventType.TEXT_DELETE];
  for (var i = 0; i < arr.length; i++) {
    arr[i](pos, len);
  }
};

goatee.TextAreaEditor.prototype.handleKeyDown_ = function(e) {
  var selStart = this.el_.selectionStart, selEnd = this.el_.selectionEnd;
  switch (e.which) {
  case 8:  // backspace
    // Handles ctrl+backspace.
    window.setTimeout((function() {
      var newSelStart = this.el_.selectionStart;
      var len = selEnd - newSelStart;
      if (len > 0) {
        this.logDeleteText_(newSelStart, len);
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
        this.logDeleteText_(selStart, len);
      }
    }).bind(this), 0);
    break;
  }
};

goatee.TextAreaEditor.prototype.handleKeyPress_ = function(e) {
  var selStart = this.el_.selectionStart, selEnd = this.el_.selectionEnd;
  // If there was a prior selection, log the deletion.
  if (selStart < selEnd) {
    this.logDeleteText_(selStart, selEnd - selStart);
  }
  this.logInsertText_(selStart, String.fromCharCode(event.which));
};

goatee.TextAreaEditor.prototype.handleCut_ = function(e) {
  var selStart = this.el_.selectionStart, selEnd = this.el_.selectionEnd;
  if (selStart < selEnd) {
    this.logDeleteText_(selStart, selEnd - selStart);
  }
};

goatee.TextAreaEditor.prototype.handlePaste_ = function(e) {
  var selStart = this.el_.selectionStart, selEnd = this.el_.selectionEnd;
  // If there was a prior selection, log the deletion.
  if (selStart < selEnd) {
    this.logDeleteText_(selStart, selEnd - selStart);
  }
  // Get the pasted content.
  window.setTimeout((function() {
    var newSelStart = this.el_.selectionStart;
    this.logInsertText_(selStart, this.el_.value.substr(selStart, newSelStart));
  }).bind(this), 0);
};
