// Implementation of Model interface.

'use strict';

var inherits = require('inherits');

var ev = require('./events');
var ModelInterface = require('./model');

inherits(Model, ModelInterface);
module.exports = Model;

function Model() {
  ModelInterface.call(this);
  this.text_ = '';
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
  this.text_ = this.text_.substr(0, pos) + value + this.text_.substr(pos);
  this.selStart_ = pos + value.length;
  this.selEnd_ = this.selStart_;
  this.emit('insertText', new ev.InsertText(true, pos, value));
};

Model.prototype.deleteText = function(pos, len) {
  this.text_ = this.text_.substr(0, pos) + this.text_.substr(pos + len);
  this.selStart_ = pos;
  this.selEnd_ = this.selStart_;
  this.emit('deleteText', new ev.DeleteText(true, pos, len));
};

Model.prototype.setSelectionRange = function(start, end) {
  this.selStart_ = start;
  this.selEnd_ = end;
  this.emit('setSelectionRange', new ev.SetSelectionRange(true, start, end));
};
