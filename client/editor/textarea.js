// Implementation of Editor interface.
//
// TODO:
// - Disallow non-ASCII characters
// - Check for race conditions

'use strict';

var inherits = require('inherits');

var EditorInterface = require('./editor');
var LocalModel = require('./local_model');
var util = require('./util');

inherits(Editor, EditorInterface);
module.exports = Editor;

////////////////////////////////////////////////////////////////////////////////
// Editor

function Editor(el, model) {
  EditorInterface.call(this);
  this.el_ = el;
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

Editor.prototype.reset = function(model) {
  this.m_ = model || new LocalModel();

  // Register model event handlers.
  var handler = this.handleModifyText_.bind(this);
  this.m_.on('insertText', handler);
  this.m_.on('deleteText', handler);

  // Handle non-empty initial model state.
  this.el_.value = this.m_.getText();
};

////////////////////////////////////////////////////////////////////////////////
// Model event handlers

Editor.prototype.handleModifyText_ = function(e) {
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
// Input event handlers

Editor.prototype.handleInput_ = function(e) {
  var oldText = this.m_.getText();
  var newText = util.canonicalizeLineBreaks(this.el_.value);

  // Note, oldText may be equal to newText, e.g. if user selects all, then
  // copies, then pastes.
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

Editor.prototype.updateSelection_ = function() {
  var that = this;
  window.setTimeout(function() {
    // TODO: Canonicalize line breaks.
    that.m_.setSelectionRange(that.el_.selectionStart, that.el_.selectionEnd);
  }, 0);
};
