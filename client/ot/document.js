// Document class.
//
// TODO:
// - Track selection ranges at server
// - Support other ranges (e.g. bold)
// - Support undo/redo
// - Maybe add canUndo/canRedo properties
// - Check for race conditions

'use strict';

var eddie = require('eddie');

var text = require('./text');
var util = require('../util');

module.exports = Document;

// Similar to gapi.drive.realtime.Document.
function Document(addr, docId, onLoad) {
  var that = this;

  // Initialized by processSnapshotMsg_.
  this.clientId_ = null;
  this.m_ = null;
  this.basePatchId_ = null;  // last patch we've gotten from server

  // All past client ops. Bridge from latest server-acked state to client state
  // starts at clientOps[ackedClientOpIdx] + 1.
  this.clientOps_ = [];

  // The most recent clientOps index sent to and acknowledged by the server.
  this.sentClientOpIdx_ = -1;
  this.ackedClientOpIdx_ = -1;

  // Initialize WebSocket connection.
  var ws = new WebSocket('ws://' + addr);

  ws.onopen = function(e) {
    that.ws_.sendMessage({
      Type: 'Init',
      DocId: docId,
      DataType: 'ot.Text'
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

Document.prototype.getCollaborators = function() {
  throw new Error('not implemented');
};

Document.prototype.getModel = function() {
  return this.m_;
};

////////////////////////////////////////
// Model event handlers

Document.prototype.handleReplaceText = function(pos, len, value) {
  this.m_.applyReplaceText(true, pos, len, value);
  var ops = [];
  if (len) {
    ops.push(new text.Delete(pos, len));
  }
  if (value.length) {
    ops.push(new text.Insert(pos, value));
  }
  this.pushOps_(ops);
};

////////////////////////////////////////
// Incoming message handlers

Document.prototype.processSnapshotMsg_ = function(msg) {
  console.assert(this.clientId_ === null);
  this.clientId_ = msg.ClientId;
  this.basePatchId_ = Number(msg.BasePatchId);
  this.m_ = new eddie.AsyncModel(this, msg.Text);
};

Document.prototype.processChangeMsg_ = function(msg) {
  var newBasePatchId = Number(msg.PatchId);
  console.assert(newBasePatchId === this.basePatchId_ + 1);
  this.basePatchId_ = newBasePatchId;

  // If the patch is from this client, send all buffered ops to server.
  // Otherwise, transform it against all buffered ops and then apply it.
  if (msg.ClientId === this.clientId_) {
    this.ackedClientOpIdx_ = this.sentClientOpIdx_;
    this.sendBufferedOps_();
    return;
  }
  var ops = text.decodeOps(msg.OpStrs);
  var tup = text.transformPatch(
    this.clientOps_.slice(this.ackedClientOpIdx_ + 1), ops);
  var bufferedOps = tup[0];
  ops = tup[1];
  // Splice bufferedOps into this.clientOps_.
  var i;
  for (i = 0; i < bufferedOps.length; i++) {
    this.clientOps_[this.ackedClientOpIdx_ + 1 + i] = bufferedOps[i];
  }
  // Apply the transformed server patch against the client text.
  for (i = 0; i < ops.length; i++) {
    var op = ops[i];
    switch (op.constructor.name) {
    case 'Insert':
      this.m_.applyReplaceText(false, op.pos, 0, op.value);
      break;
    case 'Delete':
      this.m_.applyReplaceText(false, op.pos, op.len, '');
      break;
    default:
      throw new Error(op.constructor.name);
    }
  }
};

////////////////////////////////////////
// Other private helpers

Document.prototype.sendBufferedOps_ = function() {
  console.assert(this.sentClientOpIdx_ === this.ackedClientOpIdx_);
  if (this.sentClientOpIdx_ === this.clientOps_.length - 1) {
    return;  // no ops to send
  }
  this.sentClientOpIdx_ = this.clientOps_.length - 1;
  // TODO: Compact ops (e.g. combine insertions) before sending.
  this.ws_.sendMessage({
    Type: 'Update',
    ClientId: this.clientId_,
    BasePatchId: this.basePatchId_,
    OpStrs: text.encodeOps(this.clientOps_.slice(this.ackedClientOpIdx_ + 1))
  });
};

Document.prototype.pushOps_ = function(ops) {
  // Schedule ops to be sent to server.
  var clientOpIdx = this.clientOps_.length;
  Array.prototype.push.apply(this.clientOps_, ops);
  // If ops are parented off server state (as opposed to some not-yet-acked
  // client state), send them right away.
  if (clientOpIdx === this.ackedClientOpIdx_ + 1) {
    // Use setTimeout to avoid blocking the client.
    window.setTimeout(this.sendBufferedOps_.bind(this), 0);
  }
};
