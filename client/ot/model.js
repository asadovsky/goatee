// Implementation of Model interface.

'use strict';

var inherits = require('inherits');

var ev = require('../editor/events');
var ModelInterface = require('../editor/model');
var text = require('./text');

inherits(Model, ModelInterface);
module.exports = Model;

// Currently, a combination of gapi.drive.realtime.Model and
// gapi.drive.realtime.CollaborativeString.
function Model(doc, text) {
  ModelInterface.call(this);
  this.doc_ = doc;

  // Note, we assume line breaks have been canonicalized to \n.
  this.text_ = text;
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
  this.doc_.pushOp_(new text.Insert(pos, value));
};

Model.prototype.deleteText = function(pos, len) {
  if (len === 0) return;
  this.doc_.pushOp_(new text.Delete(pos, len));
};

Model.prototype.setSelectionRange = function(start, end) {
  if (this.selStart_ === start && this.selEnd_ === end) return;
  // TODO: Push op to server. For now, we simply update local state and notify
  // listeners.
  this.selStart_ = start;
  this.selEnd_ = end;
  this.emit('setSelectionRange', new ev.SetSelectionRange(true, start, end));
};

Model.prototype.undo = function() {
  throw new Error('not implemented');
};

Model.prototype.redo = function() {
  throw new Error('not implemented');
};

Model.prototype.apply_ = function(op, isLocal) {
  var t = this.text_;
  switch (op.typeName()) {
  case 'Insert':
    this.text_ = t.substr(0, op.pos) + op.value + t.substr(op.pos);
    // Update selection range.
    if (isLocal) {
      this.selStart_ = op.pos + op.value.length;
      this.selEnd_ = this.selStart_;
    } else {
      if (this.selStart_ >= op.pos) this.selStart_ += op.value.length;
      if (this.selEnd_ >= op.pos) this.selEnd_ += op.value.length;
    }
    this.emit('insertText', new ev.InsertText(isLocal, op.pos, op.value));
    break;
  case 'Delete':
    console.assert(op.pos + op.len <= t.length, 'Delete past end');
    this.text_ = t.substr(0, op.pos) + t.substr(op.pos + op.len);
    // Update selection range.
    if (isLocal) {
      this.selStart_ = op.pos;
      this.selEnd_ = this.selStart_;
    } else {
      if (this.selStart_ > op.pos) {
        this.selStart_ = Math.max(op.pos, this.selStart_ - op.len);
      }
      if (this.selEnd_ > op.pos) {
        this.selEnd_ = Math.max(op.pos, this.selEnd_ - op.len);
      }
    }
    this.emit('deleteText', new ev.DeleteText(isLocal, op.pos, op.len));
    break;
  default:
    console.assert(false, 'Unexpected operation type "' + op.typeName() + '"');
  }
};

Model.prototype.applyCompound_ = function(ops, isLocal) {
  for (var i = 0; i < ops.length; i++) {
    this.apply_(ops[i], isLocal);
  }
};
