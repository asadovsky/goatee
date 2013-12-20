// See also: https://developers.google.com/drive/realtime/

// TODO:
//  - Support >1 Document or Model
//  - Add mechanism to track cursor positions and other ranges (e.g. bold)
//  - Maybe add canUndo and canRedo properties
//  - Check for race conditions

'use strict';

var ot = ot || {};

ot.DEBUG_DELAY = 0;
ot.DEBUG_SOCKET = false;

// Similar to gapi.drive.realtime.load.
ot.load = function(docId, onDocLoaded) {
  // TODO: What prevents JS from GCing this object?
  new ot.Document(onDocLoaded);
};

////////////////////////////////////////////////////////////////////////////////
// Event types

ot.EventType = {
  TEXT_INSERT: 'text_insert',
  TEXT_DELETE: 'text_delete'
};

////////////////////////////////////////////////////////////////////////////////
// Document

// Similar to gapi.drive.realtime.Document.
ot.Document = function(onDocLoaded) {
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

  this.socket_ = new WebSocket(document.body.getAttribute('data-ws-url'));
  this.model_ = null;  // initialized in socket.onmessage

  this.socket_.onclose = (function(event) {
    if (ot.DEBUG_SOCKET) console.log('socket.close');
  }).bind(this);

  this.socket_.onmessage = (function(event) {
    if (ot.DEBUG_SOCKET) console.log('socket.receive ' + event.data);
    var msg = JSON.parse(event.data);
    // TODO: Implement better way to detect message type.
    if (msg.hasOwnProperty('Text')) {  // msg type NewClient
      console.assert(this.clientId_ === null);
      this.clientId_ = msg['ClientId'];
      this.baseTxnId_ = parseInt(msg['BaseTxnId']);
      this.model_ = new ot.Model(this, msg['Text']);
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
      this._sendBufferedOps();
      return;
    }
    var ops = opsFromStrings(msg['OpStrs']);
    var tup = transformCompound(
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

ot.Document.prototype.getCollaborators = function() {
  console.log('getCollaborators');  // FIXME
};

ot.Document.prototype.getModel = function() {
  return this.model_;
};

ot.Document.prototype._sendBufferedOps = function() {
  console.assert(this.sentClientOpIdx_ === this.ackedClientOpIdx_);
  if (this.sentClientOpIdx_ === this.clientOps_.length - 1) {
    return;  // no ops to send
  }
  this.sentClientOpIdx_ = this.clientOps_.length - 1;
  // TODO: Compress ops (e.g. combine insertions) before sending.
  var msg = {
    'OpStrs': opsToStrings(this.clientOps_.slice(this.ackedClientOpIdx_ + 1)),
    'ClientId': this.clientId_,
    'BaseTxnId': this.baseTxnId_
  };
  var send = (function() {
    var json = JSON.stringify(msg);
    if (ot.DEBUG_SOCKET) console.log('socket.send ' + json);
    this.socket_.send(json);
  }).bind(this);
  if (ot.DEBUG_DELAY > 0) {
    window.setTimeout(send, ot.DEBUG_DELAY);
  } else {
    send();
  }
};

ot.Document.prototype._pushOp = function(op) {
  var clientOpIdx = this.clientOps_.length;
  this.clientOps_.push(op);
  // If op is parented off server state space (as opposed to some non-acked
  // client op), send it right away.
  if (clientOpIdx === this.ackedClientOpIdx_ + 1) {
    this._sendBufferedOps();
  }
};

////////////////////////////////////////////////////////////////////////////////
// Model

// Currently, a combination of gapi.drive.realtime.Model and
// gapi.drive.realtime.CollaborativeString.
ot.Model = function(doc, text) {
  this.doc_ = doc;
  this.text_ = text;
  this.listeners_ = {};
  this.listeners_[ot.EventType.TEXT_INSERT] = [];
  this.listeners_[ot.EventType.TEXT_DELETE] = [];
};

ot.Model.prototype.insertText = function(pos, value) {
  this.doc_._pushOp(new Insert(pos, value));
};

ot.Model.prototype.deleteText = function(pos, len) {
  this.doc_._pushOp(new Delete(pos, len));
};

ot.Model.prototype.addEventListener = function(type, handler) {
  this.listeners_[type].push(handler);
};

ot.Model.prototype.removeEventListener = function(type, handler) {
  var arr = this.listeners_[type];
  while (true) {
    var i = arr.indexOf(handler);
    if (i === -1) break;
    arr.splice(i, 1);
  }
};

ot.Model.prototype.undo = function() {
  console.log('undo');  // FIXME
};

ot.Model.prototype.redo = function() {
  console.log('redo');  // FIXME
};

ot.Model.prototype.getText = function() {
  return this.text_;
};

ot.Model.prototype.apply_ = function(op) {
  var t = this.text_;
  switch (op.typeName()) {
  case 'Insert':
    this.text_ = t.substr(0, op.pos) + op.value + t.substr(op.pos);
    var arr = this.listeners_[ot.EventType.TEXT_INSERT];
    for (var i = 0; i < arr.length; i++) {
      arr[i](op.pos, op.value);
    }
    break;
  case 'Delete':
    console.assert(op.pos + op.len <= t.length, 'Delete past end');
    this.text_ = t.substr(0, op.pos) + t.substr(op.pos + op.len);
    var arr = this.listeners_[ot.EventType.TEXT_DELETE];
    for (var i = 0; i < arr.length; i++) {
      arr[i](op.pos, op.len);
    }
    break;
  default:
    console.assert(false, 'Unexpected operation type "' + op.typeName() + '"');
  }
};

ot.Model.prototype.applyCompound_ = function(ops) {
  for (var i = 0; i < ops.length; i++) {
    this.apply_(ops[i]);
  }
};
