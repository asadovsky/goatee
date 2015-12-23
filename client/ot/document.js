// Document class.
//
// TODO:
// - Track selection ranges in server
// - Support other ranges (e.g. bold)
// - Support undo/redo
// - Maybe add canUndo/canRedo properties
// - Check for race conditions

'use strict';

var Model = require('./model');
var text = require('./text');

var DEBUG_DELAY = 0;
var DEBUG_SOCKET = false;

module.exports = Document;

// Similar to gapi.drive.realtime.Document.
function Document(addr, docId, onDocLoaded) {
  // Initialized by NewClient message from server.
  this.clientId_ = null;
  this.baseCopId_ = null;  // last compound op we've gotten from server

  // The most recent clientOps index sent to and acknowledged by the server.
  this.sentClientOpIdx_ = -1;
  this.ackedClientOpIdx_ = -1;

  // All past client ops. Bridge from latest server-acked state to client state
  // starts at clientOps[ackedClientOpIdx] + 1.
  this.clientOps_ = [];

  this.socket_ = new WebSocket('ws://' + addr);
  this.model_ = null;  // initialized in socket.onmessage

  this.socket_.onclose = (function(event) {
    if (DEBUG_SOCKET) console.log('socket.close');
  }).bind(this);

  this.socket_.onmessage = (function(event) {
    if (DEBUG_SOCKET) console.log('socket.recv ' + event.data);
    var msg = JSON.parse(event.data);
    // TODO: Implement better way to detect message type.
    if (msg.hasOwnProperty('Text')) {  // msg type NewClient
      console.assert(this.clientId_ === null);
      this.clientId_ = msg['ClientId'];
      this.baseCopId_ = parseInt(msg['BaseCopId']);
      this.model_ = new Model(this, msg['Text']);
      onDocLoaded(this);
      return;
    }

    console.assert(msg.hasOwnProperty('CopId'));  // msg type Broadcast
    var newBaseCopId = parseInt(msg['CopId']);
    console.assert(newBaseCopId === this.baseCopId_ + 1);
    this.baseCopId_ = newBaseCopId;

    // If the compound op is from this client, send all buffered ops to server.
    // Otherwise, transform it against all buffered ops and then apply it.
    if (msg['ClientId'] === this.clientId_) {
      this.ackedClientOpIdx_ = this.sentClientOpIdx_;
      this.sendBufferedOps_();
      return;
    }
    var ops = text.opsFromStrings(msg['OpStrs']);
    var tup = text.transformCompound(
      this.clientOps_.slice(this.ackedClientOpIdx_ + 1), ops);
    var bufferedOps = tup[0];
    ops = tup[1];
    // Unfortunately, splice doesn't support Array inputs.
    for (var i = 0; i < bufferedOps.length; i++) {
      this.clientOps_[this.ackedClientOpIdx_ + 1 + i] = bufferedOps[i];
    }
    // Apply the transformed server compound op against the client text.
    this.model_.applyCompound_(ops, false);
  }).bind(this);
}

Document.prototype.getCollaborators = function() {
  throw new Error('not implemented');
};

Document.prototype.getModel = function() {
  return this.model_;
};

Document.prototype.sendBufferedOps_ = function() {
  console.assert(this.sentClientOpIdx_ === this.ackedClientOpIdx_);
  if (this.sentClientOpIdx_ === this.clientOps_.length - 1) {
    return;  // no ops to send
  }
  this.sentClientOpIdx_ = this.clientOps_.length - 1;
  // TODO: Compress ops (e.g. combine insertions) before sending.
  var msg = {
    OpStrs: text.opsToStrings(
      this.clientOps_.slice(this.ackedClientOpIdx_ + 1)),
    ClientId: this.clientId_,
    BaseCopId: this.baseCopId_
  };
  var send = (function() {
    var json = JSON.stringify(msg);
    if (DEBUG_SOCKET) console.log('socket.send ' + json);
    this.socket_.send(json);
  }).bind(this);
  if (DEBUG_DELAY > 0) {
    window.setTimeout(send, DEBUG_DELAY);
  } else {
    send();
  }
};

Document.prototype.pushOp_ = function(op) {
  // Apply op locally and notify listeners.
  this.model_.apply_(op, true);
  // Schedule op to be sent to server.
  var clientOpIdx = this.clientOps_.length;
  this.clientOps_.push(op);
  // If op is parented off server state (as opposed to some non-acked client
  // op), send it right away.
  if (clientOpIdx === this.ackedClientOpIdx_ + 1) {
    // Use setTimeout(x, 0) to avoid blocking the client.
    // TODO: Make it so that combo ops (e.g. delete selection + insert
    // replacement text) are sent to the server together.
    window.setTimeout(this.sendBufferedOps_.bind(this), 0);
  }
};
