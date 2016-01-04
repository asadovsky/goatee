// Document class.

'use strict';

var AsyncModel = require('../editor').AsyncModel;
var text = require('./text');

module.exports = Document;

// FIXME: Implement handleInsert and handleDelete.
function Document(addr, docId, onDocLoaded) {
  var that = this;
  this.socket_ = new WebSocket('ws://' + addr);

  // Initialized by processSnapshotMsg_.
  this.clientId_ = null;
  this.m_ = null;

  this.socket_.onopen = function(e) {
    if (process.env.DEBUG_SOCKET) {
      console.log('socket.open');
    }
    that.sendMsg_({
      Type: 'Init',
      DocId: docId
    });
  };

  this.socket_.onclose = function(e) {
    if (process.env.DEBUG_SOCKET) {
      console.log('socket.close');
    }
  };

  this.socket_.onmessage = function(e) {
    if (process.env.DEBUG_SOCKET) {
      console.log('socket.recv: ' + e.data);
    }
    var msg = JSON.parse(e.data);
    switch (msg.Type) {
    case 'Snapshot':
      that.processSnapshotMsg_(msg);
      onDocLoaded(that);
      return;
    case 'Change':
      that.processChangeMsg_(msg);
      return;
    default:
      throw new Error('unknown message type "' + msg.Type + '"');
    }
  };
}

////////////////////////////////////////
// Model event handlers

Document.prototype.handleInsert = function(pos, value) {
  throw new Error('not implemented');
};

Document.prototype.handleDelete = function(pos, len) {
  throw new Error('not implemented');
};

////////////////////////////////////////
// Incoming message handlers

Document.prototype.processSnapshotMsg_ = function(msg) {
  console.assert(this.clientId_ === null);
  this.clientId_ = msg['ClientId'];
  // FIXME: Store Logoot metadata.
  this.m_ = new AsyncModel(this, msg['Text']);
};

Document.prototype.processChangeMsg_ = function(msg) {
  var isLocal = msg['ClientId'] === this.clientId_;

  // Apply all mutations, regardless of whether they originated from this client
  // (i.e. unidirectional data flow).
  var ops = text.decodeOps(msg['OpStrs']);
  for (var i = 0; i < ops.length; i++) {
    // FIXME: Update Logoot metadata.
    var op = ops[i];
    switch(op.constructor.name) {
    case 'Insert':
      this.m_.applyInsert(op.pos, op.value, isLocal);
      break;
    case 'Delete':
      this.m_.applyDelete(op.pos, op.len, isLocal);
      break;
    default:
      throw new Error(op.constructor.name);
    }
  }
};
