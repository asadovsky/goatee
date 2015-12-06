// TextAreaEditor class.
//
// TODO:
// - Disallow non-ASCII characters
// - Check for race conditions

'use strict';

var events = require('./events');
var util = require('./util');

module.exports = TextAreaEditor;

////////////////////////////////////////////////////////////////////////////////
// TextAreaEditor

function TextAreaEditor(editorEl, model) {
  this.el_ = editorEl;
  this.reset(model);

  // Register input handlers. Use 'input' event to catch text mutations, and
  // various other events to catch selection mutations.
  this.el_.addEventListener('input', this.handleInput_.bind(this));

  var handler = this.updateSelection_.bind(this);
  this.el_.addEventListener('input', handler);
  this.el_.addEventListener('keydown', handler);
  this.el_.addEventListener('mousedown', handler);
  this.el_.addEventListener('mousemove', handler);
  this.el_.addEventListener('select', handler);
}

TextAreaEditor.prototype.reset = function(model) {
  this.m_ = model;

  // Register model event handlers.
  var handler = this.handleModifyText_.bind(this);
  this.m_.addEventListener(events.EventType.INSERT_TEXT, handler);
  this.m_.addEventListener(events.EventType.DELETE_TEXT, handler);

  // Handle non-empty initial model state.
  this.el_.value = this.m_.getText();
};

////////////////////////////////////////////////////////////////////////////////
// Model event handlers

// Handles both INSERT_TEXT and DELETE_TEXT.
TextAreaEditor.prototype.handleModifyText_ = function(e) {
  if (e.isLocal) return;
  this.el_.value = this.m_.getText();
  // If this editor has focus, update its selection/cursor position.
  if (document.activeElement === this.el_) {
    var selRange = this.m_.getSelectionRange();
    this.el_.setSelectionRange(Math.min(selRange[0], selRange[1]),
                               Math.max(selRange[0], selRange[1]));
  }
};

////////////////////////////////////////////////////////////////////////////////
// Input handlers

TextAreaEditor.prototype.handleInput_ = function(e) {
  var oldText = this.m_.getText();
  var newText = util.canonicalizeLineBreaks(this.el_.value);

  // Note, oldText can equal newText, e.g. if user selects all, then copies,
  // then pastes.
  var minLen = Math.min(oldText.length, newText.length);
  var l = 0, r = 0;
  while (l < minLen && oldText.charAt(l) === newText.charAt(l)) l++;
  while (l + r < minLen && (oldText.charAt(oldText.length - 1 - r) ===
                            newText.charAt(newText.length - 1 - r))) r++;

  var insertLen = newText.length - r - l;
  var deleteLen = oldText.length - r - l;
  console.assert(insertLen >= 0, insertLen);
  console.assert(deleteLen >= 0, deleteLen);

  if (insertLen > 0) this.m_.insertText(l, newText.substr(l, insertLen));
  if (deleteLen > 0) this.m_.deleteText(l, deleteLen);
};

TextAreaEditor.prototype.updateSelection_ = function() {
  // TODO: Potential race condition. Alice hits the right arrow key, triggering
  // updateSelection_ (via keydown), but then Bob inserts 'x' before the timeout
  // below triggers.
  var that = this;
  window.setTimeout(function() {
    // TODO: Do we need to canonicalize line breaks first, to avoid having
    // '\r\n' count as two chars?
    that.m_.setSelectionRange(that.el_.selectionStart, that.el_.selectionEnd);
  }, 0);
};
