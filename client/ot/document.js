// Document class.
//
// TODO:
// - Track selection ranges at the server
// - Support other ranges (e.g. bold)
// - Support undo/redo
// - Maybe add canUndo/canRedo properties
// - Check for race conditions

'use strict';

var AsyncModel = require('../editor').AsyncModel;
var text = require('./text');

module.exports = Document;

// Similar to gapi.drive.realtime.Document.
function Document(addr, docId, onDocLoaded) {
  var that = this;
  this.socket_ = new WebSocket('ws://' + addr);

  // Initialized by NewClient message from server.
  this.clientId_ = null;
  this.basePatchId_ = null;  // last patch we've gotten from server
  this.m_ = null;

  // The most recent clientOps index sent to and acknowledged by the server.
  this.sentClientOpIdx_ = -1;
  this.ackedClientOpIdx_ = -1;

  // All past client ops. Bridge from latest server-acked state to client state
  // starts at clientOps[ackedClientOpIdx] + 1.
  this.clientOps_ = [];

  this.socket_.onclose = function(e) {
    if (process.env.DEBUG_SOCKET) {
      console.log('socket.close');
    }
  };

  this.socket_.onmessage = function(e) {
    if (process.env.DEBUG_SOCKET) {
      console.log('socket.recv ' + e.data);
    }
    var msg = JSON.parse(e.data);
    if (msg['Type'] === 'NewClient') {
      console.assert(that.clientId_ === null);
      that.clientId_ = msg['ClientId'];
      that.basePatchId_ = Number(msg['BasePatchId']);
      that.m_ = new AsyncModel(that, msg['Text']);
      onDocLoaded(that);
      return;
    }

    console.assert(msg['Type'] === 'Broadcast');
    var newBasePatchId = Number(msg['PatchId']);
    console.assert(newBasePatchId === that.basePatchId_ + 1);
    that.basePatchId_ = newBasePatchId;

    // If the patch is from this client, send all buffered ops to server.
    // Otherwise, transform it against all buffered ops and then apply it.
    if (msg['ClientId'] === that.clientId_) {
      that.ackedClientOpIdx_ = that.sentClientOpIdx_;
      that.sendBufferedOps_();
      return;
    }
    var ops = text.decodeOps(msg['OpStrs']);
    var tup = text.transformPatch(
      that.clientOps_.slice(that.ackedClientOpIdx_ + 1), ops);
    var bufferedOps = tup[0];
    ops = tup[1];
    // Unfortunately, splice doesn't support Array inputs.
    var i;
    for (i = 0; i < bufferedOps.length; i++) {
      that.clientOps_[that.ackedClientOpIdx_ + 1 + i] = bufferedOps[i];
    }
    // Apply the transformed server patch against the client text.
    for (i = 0; i < ops.length; i++) {
      var op = ops[i];
      switch (op.constructor.name) {
      case 'Insert':
        that.m_.applyInsert(op.pos, op.value, false);
        break;
      case 'Delete':
        that.m_.applyDelete(op.pos, op.len, false);
        break;
      default:
        throw new Error(op.constructor.name);
      }
    }
  };
}

Document.prototype.getCollaborators = function() {
  throw new Error('not implemented');
};

Document.prototype.getModel = function() {
  return this.m_;
};

Document.prototype.handleInsert = function(pos, value) {
  this.m_.applyInsert(pos, value);
  this.pushOp_(new text.Insert(pos, value));
};

Document.prototype.handleDelete = function(pos, len) {
  this.m_.applyDelete(pos, len);
  this.pushOp_(new text.Delete(pos, len));
};

Document.prototype.sendBufferedOps_ = function() {
  var that = this;
  console.assert(this.sentClientOpIdx_ === this.ackedClientOpIdx_);
  if (this.sentClientOpIdx_ === this.clientOps_.length - 1) {
    return;  // no ops to send
  }
  this.sentClientOpIdx_ = this.clientOps_.length - 1;
  // TODO: Compress ops (e.g. combine insertions) before sending.
  var msg = {
    OpStrs: text.encodeOps(this.clientOps_.slice(this.ackedClientOpIdx_ + 1)),
    ClientId: this.clientId_,
    BasePatchId: this.basePatchId_
  };
  var send = function() {
    var json = JSON.stringify(msg);
    if (process.env.DEBUG_SOCKET) {
      console.log('socket.send ' + json);
    }
    that.socket_.send(json);
  };
  if (process.env.DEBUG_DELAY > 0) {
    window.setTimeout(send, Number(process.env.DEBUG_DELAY));
  } else {
    send();
  }
};

Document.prototype.pushOp_ = function(op) {
  // Schedule op to be sent to server.
  var clientOpIdx = this.clientOps_.length;
  this.clientOps_.push(op);
  // If op is parented off server state (as opposed to some not-yet-acked client
  // state), send it right away.
  if (clientOpIdx === this.ackedClientOpIdx_ + 1) {
    // Use setTimeout(x, 0) to avoid blocking the client.
    // TODO: Make it so that combo ops (e.g. delete selection + insert
    // replacement text) are sent to the server together.
    window.setTimeout(this.sendBufferedOps_.bind(this), 0);
  }
};
