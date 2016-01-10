// Document class.

'use strict';

var AsyncModel = require('../editor').AsyncModel;
var logoot = require('./logoot');
var util = require('../util');

module.exports = Document;

function Document(addr, docId, onLoad) {
  var that = this;

  // Initialized by processSnapshotMsg_.
  this.clientId_ = null;
  this.m_ = null;

  // Initialize WebSocket connection.
  var ws = new WebSocket('ws://' + addr);

  ws.onopen = function(e) {
    that.ws_.sendMessage({
      Type: 'Init',
      DocId: docId,
      DataType: 'crdt.Logoot'
    });
  };

  ws.onmessage = function(e) {
    var msg = JSON.parse(e.data);
    switch (msg.Type) {
    case 'Snapshot':
      that.processSnapshotMsg_(msg);
      onLoad(that);
      return;
    case 'Change':
      that.processChangeMsg_(msg);
      return;
    default:
      throw new Error('unknown message type: ' + msg.Type);
    }
  };

  this.ws_ = util.decorateWebSocket(ws);
}

Document.prototype.getModel = function() {
  return this.m_;
};

////////////////////////////////////////
// Model event handlers

// FIXME: In both handleInsert and handleDelete, block (i.e. do not return)
// until the server acks the op.
Document.prototype.handleInsert = function(pos, value) {
  console.assert(value.length === 1);
  var prevPid = pos === 0 ? '' : this.logoot_.pid(pos - 1);
  var nextPid = pos === this.m_.getText().length ? '' : this.logoot_.pid(pos);
  this.sendOps_([new logoot.ClientInsert(prevPid, nextPid, value)]);
};

Document.prototype.handleDelete = function(pos, len) {
  var ops = new Array(len);
  for (var i = 0; i < len; i++) {
    ops[i] = new logoot.Delete(this.logoot_.pid(pos + i));
  }
  this.sendOps_(ops);
};

////////////////////////////////////////
// Incoming message handlers

Document.prototype.processSnapshotMsg_ = function(msg) {
  console.assert(this.clientId_ === null);
  this.clientId_ = msg.ClientId;
  this.logoot_ = logoot.decodeLogoot(msg.LogootStr);
  this.m_ = new AsyncModel(this, msg.Text);
};

Document.prototype.processChangeMsg_ = function(msg) {
  var isLocal = msg.ClientId === this.clientId_;

  // Apply all mutations, regardless of whether they originated from this client
  // (i.e. unidirectional data flow).
  var ops = logoot.decodeOps(msg.OpStrs);
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    switch(op.constructor.name) {
    case 'Insert':
      this.m_.applyInsert(this.logoot_.applyInsert(op), op.value, isLocal);
      break;
    case 'Delete':
      this.m_.applyDelete(this.logoot_.applyDelete(op), 1, isLocal);
      break;
    default:
      throw new Error(op.constructor.name);
    }
  }
};

////////////////////////////////////////
// Other private helpers

Document.prototype.sendOps_ = function(ops) {
  this.ws_.sendMessage({
    Type: 'Update',
    ClientId: this.clientId_,
    OpStrs: logoot.encodeOps(ops)
  });
};
