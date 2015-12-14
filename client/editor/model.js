// Model interface.

'use strict';

var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Model, EventEmitter);
module.exports = Model;

function Model() {
  EventEmitter.call(this);
}

Model.prototype.getText = function() {
  throw new Error('not implemented');
};

Model.prototype.getSelectionRange = function() {
  throw new Error('not implemented');
};

Model.prototype.insertText = function(pos, value) {
  throw new Error('not implemented');
};

Model.prototype.deleteText = function(pos, len) {
  throw new Error('not implemented');
};

Model.prototype.setSelectionRange = function(start, end) {
  throw new Error('not implemented');
};
