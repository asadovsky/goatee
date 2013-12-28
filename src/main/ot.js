// See also: https://developers.google.com/drive/realtime/
//
// TODO:
//  - Expand listener function signatures to include sessionId, isLocal, type,
//    and other arguments
//  - Support >1 Document or Model
//  - Add mechanism to track cursor positions and other ranges (e.g. bold)
//  - Maybe add canUndo and canRedo properties
//  - Check for race conditions
//
// FIXME: Send local ops to listeners and set isLocal correctly.

'use strict';

var goatee = goatee || {};
goatee.ot = goatee.ot || {};

goatee.ot.DEBUG_DELAY = 0;
goatee.ot.DEBUG_SOCKET = false;

// Similar to gapi.drive.realtime.load.
goatee.ot.load = function(docId, onDocLoaded) {
  // TODO: What prevents JS from GCing this object?
  new goatee.ot.Document(onDocLoaded);
};

////////////////////////////////////////////////////////////////////////////////
// Document

// Similar to gapi.drive.realtime.Document.
goatee.ot.Document = function(onDocLoaded) {
  this.onDocLoaded_ = onDocLoaded;

  // Initialized by NewClient message from server.
  this.clientId_ = null;
  this.baseTxnId_ = null;  // last transaction we've gotten from server

  // The most recent clientOps index sent to and acknowledged by the server.
  this.sentClientOpIdx_ = -1;
  this.ackedClientOpIdx_ = -1;

  // All past client ops. Bridge from latest server-acked state to client state
  // starts at clientOps[ackedClientOpIdx] + 1.
  this.clientOps_ = [];

  var data_ws_url = document.body.getAttribute('data-ws-url');
  this.socket_ = new WebSocket(data_ws_url);
  this.model_ = null;  // initialized in socket.onmessage

  this.socket_.onclose = (function(event) {
    if (goatee.ot.DEBUG_SOCKET) console.log('socket.close');
  }).bind(this);

  this.socket_.onmessage = (function(event) {
    if (goatee.ot.DEBUG_SOCKET) console.log('socket.receive ' + event.data);
    var msg = JSON.parse(event.data);
    // TODO: Implement better way to detect message type.
    if (msg.hasOwnProperty('Text')) {  // msg type NewClient
      console.assert(this.clientId_ === null);
      this.clientId_ = msg['ClientId'];
      this.baseTxnId_ = parseInt(msg['BaseTxnId']);
      this.model_ = new goatee.ot.Model(this, msg['Text']);
      this.onDocLoaded_(this);
      return;
    }

    console.assert(msg.hasOwnProperty('TxnId'));  // msg type Broadcast
    var newBaseTxnId = parseInt(msg['TxnId']);
    console.assert(newBaseTxnId === this.baseTxnId_ + 1);
    this.baseTxnId_ = newBaseTxnId;

    // If txn is from this client, send all buffered ops to server.
    // Otherwise, transform it against all buffered ops and then apply it.
    if (msg['ClientId'] === this.clientId_) {
      this.ackedClientOpIdx_ = this.sentClientOpIdx_;
      this.sendBufferedOps_();
      return;
    }
    var ops = goatee.ot.opsFromStrings(msg['OpStrs']);
    var tup = goatee.ot.transformCompound(
      this.clientOps_.slice(this.ackedClientOpIdx_ + 1), ops);
    var bufferedOps = tup[0];
    ops = tup[1];
    // Unfortunately, splice doesn't support Array inputs.
    for (var i = 0; i < bufferedOps.length; i++) {
      this.clientOps_[this.ackedClientOpIdx_ + 1 + i] = bufferedOps[i];
    }
    // Apply the transformed server compound op against the client text.
    this.model_.applyCompound_(ops);
  }).bind(this);
};

goatee.ot.Document.prototype.getCollaborators = function() {
  // TODO: Implement.
  console.log('getCollaborators');
};

goatee.ot.Document.prototype.getModel = function() {
  return this.model_;
};

goatee.ot.Document.prototype.sendBufferedOps_ = function() {
  console.assert(this.sentClientOpIdx_ === this.ackedClientOpIdx_);
  if (this.sentClientOpIdx_ === this.clientOps_.length - 1) {
    return;  // no ops to send
  }
  this.sentClientOpIdx_ = this.clientOps_.length - 1;
  // TODO: Compress ops (e.g. combine insertions) before sending.
  var msg = {
    'OpStrs': goatee.ot.opsToStrings(
      this.clientOps_.slice(this.ackedClientOpIdx_ + 1)),
    'ClientId': this.clientId_,
    'BaseTxnId': this.baseTxnId_
  };
  var send = (function() {
    var json = JSON.stringify(msg);
    if (goatee.ot.DEBUG_SOCKET) console.log('socket.send ' + json);
    this.socket_.send(json);
  }).bind(this);
  if (goatee.ot.DEBUG_DELAY > 0) {
    window.setTimeout(send, goatee.ot.DEBUG_DELAY);
  } else {
    send();
  }
};

goatee.ot.Document.prototype.pushOp_ = function(op) {
  var clientOpIdx = this.clientOps_.length;
  this.clientOps_.push(op);
  // If op is parented off server state space (as opposed to some non-acked
  // client op), send it right away.
  if (clientOpIdx === this.ackedClientOpIdx_ + 1) {
    // Use setTimeout(x, 0) to avoid blocking the client, and to ensure that
    // combo ops (e.g. delete selection + insert replacement text) are packaged
    // together.
    window.setTimeout(this.sendBufferedOps_.bind(this), 0);
  }
};

////////////////////////////////////////////////////////////////////////////////
// Model

// Currently, a combination of gapi.drive.realtime.Model and
// gapi.drive.realtime.CollaborativeString.
goatee.ot.Model = function(doc, text) {
  this.doc_ = doc;

  this.text_ = text;
  this.selStart_ = 0;
  this.selEnd_ = 0;

  this.listeners_ = {};
  this.listeners_[goatee.EventType.TEXT_INSERT] = [];
  this.listeners_[goatee.EventType.TEXT_DELETE] = [];
  this.listeners_[goatee.EventType.SET_SELECTION] = [];
};

goatee.ot.Model.prototype.getText = function() {
  return this.text_;
};

goatee.ot.Model.prototype.getSelectionRange = function() {
  return [this.selStart_, this.selEnd_];
};

goatee.ot.Model.prototype.insertText = function(pos, value) {
  var t = this.text_;
  this.text_ = t.substr(0, pos) + value + t.substr(pos);
  this.doc_.pushOp_(new goatee.ot.Insert(pos, value));
};

goatee.ot.Model.prototype.deleteText = function(pos, len) {
  var t = this.text_;
  console.assert(pos + len <= t.length, 'Delete past end');
  this.text_ = t.substr(0, pos) + t.substr(pos + len);
  this.doc_.pushOp_(new goatee.ot.Delete(pos, len));
};

goatee.ot.Model.prototype.setSelectionRange = function(start, end) {
  // TODO: Push op to server.
  this.selStart_ = start;
  this.selEnd_ = end;
};

goatee.ot.Model.prototype.addEventListener = function(type, handler) {
  this.listeners_[type].push(handler);
};

goatee.ot.Model.prototype.removeEventListener = function(type, handler) {
  goatee.removeFromArray(handler, this.listeners_[type]);
};

goatee.ot.Model.prototype.undo = function() {
  // TODO: Implement.
  console.log('undo');
};

goatee.ot.Model.prototype.redo = function() {
  // TODO: Implement.
  console.log('redo');
};

goatee.ot.Model.prototype.apply_ = function(op) {
  var t = this.text_;
  switch (op.typeName()) {
  case 'Insert':
    this.text_ = t.substr(0, op.pos) + op.value + t.substr(op.pos);
    var arr = this.listeners_[goatee.EventType.TEXT_INSERT];
    for (var i = 0; i < arr.length; i++) {
      arr[i](op.pos, op.value);
    }
    break;
  case 'Delete':
    console.assert(op.pos + op.len <= t.length, 'Delete past end');
    this.text_ = t.substr(0, op.pos) + t.substr(op.pos + op.len);
    var arr = this.listeners_[goatee.EventType.TEXT_DELETE];
    for (var i = 0; i < arr.length; i++) {
      arr[i](op.pos, op.len);
    }
    break;
  default:
    console.assert(false, 'Unexpected operation type "' + op.typeName() + '"');
  }
};

goatee.ot.Model.prototype.applyCompound_ = function(ops) {
  for (var i = 0; i < ops.length; i++) {
    this.apply_(ops[i]);
  }
};
