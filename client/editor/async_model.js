// Implementation of Model interface.

'use strict';

var inherits = require('inherits');

var ev = require('./events');
var ModelInterface = require('./model');

inherits(Model, ModelInterface);
module.exports = Model;

// Currently, a combination of gapi.drive.realtime.Model and
// gapi.drive.realtime.CollaborativeString.
function Model(handler, initialText) {
  ModelInterface.call(this);
  this.handler_ = handler;
  // Note, we assume line breaks have been canonicalized to \n.
  this.text_ = initialText || '';
  this.selStart_ = 0;
  this.selEnd_ = 0;
}

Model.prototype.getText = function() {
  return this.text_;
};

Model.prototype.getSelectionRange = function() {
  return [this.selStart_, this.selEnd_];
};

Model.prototype.insertText = function(pos, value) {
  if (value.length === 0) return;
  this.handler_.handleInsert(pos, value);
};

Model.prototype.deleteText = function(pos, len) {
  if (len === 0) return;
  this.handler_.handleDelete(pos, len);
};

Model.prototype.setSelectionRange = function(start, end) {
  if (this.selStart_ === start && this.selEnd_ === end) return;
  // TODO: Notify handler. For now, we simply update local state and emit an
  // event.
  this.selStart_ = start;
  this.selEnd_ = end;
  this.emit('setSelectionRange', new ev.SetSelectionRange(true, start, end));
};

Model.prototype.applyInsert = function(pos, value, isLocal) {
  var t = this.text_;
  this.text_ = t.substr(0, pos) + value + t.substr(pos);
  // Update selection range.
  if (isLocal) {
    this.selStart_ = pos + value.length;
    this.selEnd_ = this.selStart_;
  } else {
    if (this.selStart_ >= pos) {
      this.selStart_ += value.length;
    }
    if (this.selEnd_ >= pos) {
      this.selEnd_ += value.length;
    }
  }
  this.emit('insertText', new ev.InsertText(isLocal, pos, value));
};

Model.prototype.applyDelete = function(pos, len, isLocal) {
  var t = this.text_;
  console.assert(pos + len <= t.length, 'Delete past end');
  this.text_ = t.substr(0, pos) + t.substr(pos + len);
  // Update selection range.
  if (isLocal) {
    this.selStart_ = pos;
    this.selEnd_ = this.selStart_;
  } else {
    if (this.selStart_ > pos) {
      this.selStart_ = Math.max(pos, this.selStart_ - len);
    }
    if (this.selEnd_ > pos) {
      this.selEnd_ = Math.max(pos, this.selEnd_ - len);
    }
  }
  this.emit('deleteText', new ev.DeleteText(isLocal, pos, len));
};
