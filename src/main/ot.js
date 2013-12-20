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
ot.Load = function(docId, onDocLoaded) {
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
  this._onDocLoaded = onDocLoaded;

  // Initialized by NewClient message from server.
  this._clientId = null;
  this._baseTxnId = null;  // last transaction we've gotten from server

  // The most recent clientOps index sent to and acknowledged by the server.
  this._sentClientOpIdx = -1;
  this._ackedClientOpIdx = -1;

  // All past client ops. Bridge from latest server-acked state to client state
  // starts at clientOps[ackedClientOpIdx] + 1.
  this._clientOps = [];

  this._socket = new WebSocket(document.body.getAttribute('data-ws-url'));
  this._model = null;  // initialized in socket.onmessage

  this._socket.onclose = (function(event) {
    if (ot.DEBUG_SOCKET) console.log('socket.close');
  }).bind(this);

  this._socket.onmessage = (function(event) {
    if (ot.DEBUG_SOCKET) console.log('socket.receive ' + event.data);
    var msg = JSON.parse(event.data);
    // TODO: Implement better way to detect message type.
    if (msg.hasOwnProperty('Text')) {  // msg type NewClient
      console.assert(this._clientId === null);
      this._clientId = msg['ClientId'];
      this._baseTxnId = parseInt(msg['BaseTxnId']);
      this._model = new ot.Model(this, msg['Text']);
      this._onDocLoaded(this);
      return;
    }

    console.assert(msg.hasOwnProperty('TxnId'));  // msg type Broadcast
    var newBaseTxnId = parseInt(msg['TxnId']);
    console.assert(newBaseTxnId === this._baseTxnId + 1);
    this._baseTxnId = newBaseTxnId;

    // If txn is from this client, send all buffered ops to server.
    // Otherwise, transform it against all buffered ops and then apply it.
    if (msg['ClientId'] === this._clientId) {
      this._ackedClientOpIdx = this._sentClientOpIdx;
      this._sendBufferedOps();
      return;
    }
    var ops = opsFromStrings(msg['OpStrs']);
    var tup = transformCompound(
      this._clientOps.slice(this._ackedClientOpIdx + 1), ops);
    var bufferedOps = tup[0];
    ops = tup[1];
    // Unfortunately, splice doesn't support Array inputs.
    for (var i = 0; i < bufferedOps.length; i++) {
      this._clientOps[this._ackedClientOpIdx + 1 + i] = bufferedOps[i];
    }
    // Apply the transformed server compound op against the client text.
    this._model._applyCompound(ops);
  }).bind(this);
};

ot.Document.prototype.getCollaborators = function() {
  console.log('getCollaborators');  // FIXME
};

ot.Document.prototype.getModel = function() {
  return this._model;
};

ot.Document.prototype._sendBufferedOps = function() {
  console.assert(this._sentClientOpIdx === this._ackedClientOpIdx);
  if (this._sentClientOpIdx === this._clientOps.length - 1) {
    return;  // no ops to send
  }
  this._sentClientOpIdx = this._clientOps.length - 1;
  // TODO: Compress ops (e.g. combine insertions) before sending.
  var msg = {
    'OpStrs': opsToStrings(this._clientOps.slice(this._ackedClientOpIdx + 1)),
    'ClientId': this._clientId,
    'BaseTxnId': this._baseTxnId
  };
  var send = (function() {
    var json = JSON.stringify(msg);
    if (ot.DEBUG_SOCKET) console.log('socket.send ' + json);
    this._socket.send(json);
  }).bind(this);
  if (ot.DEBUG_DELAY > 0) {
    window.setTimeout(send, ot.DEBUG_DELAY);
  } else {
    send();
  }
};

ot.Document.prototype._pushOp = function(op) {
  var clientOpIdx = this._clientOps.length;
  this._clientOps.push(op);
  // If op is parented off server state space (as opposed to some non-acked
  // client op), send it right away.
  if (clientOpIdx === this._ackedClientOpIdx + 1) {
    this._sendBufferedOps();
  }
};

////////////////////////////////////////////////////////////////////////////////
// Model

// Currently, a combination of gapi.drive.realtime.Model and
// gapi.drive.realtime.CollaborativeString.
ot.Model = function(doc, text) {
  this._doc = doc;
  this._text = text;
  this._listeners = {};
  this._listeners[ot.EventType.TEXT_INSERT] = [];
  this._listeners[ot.EventType.TEXT_DELETE] = [];
};

ot.Model.prototype.pushInsert = function(pos, value) {
  this._doc._pushOp(new Insert(pos, value));
};

ot.Model.prototype.pushDelete = function(pos, len) {
  this._doc._pushOp(new Delete(pos, len));
};

ot.Model.prototype.addEventListener = function(type, handler) {
  this._listeners[type].push(handler);
};

ot.Model.prototype.removeEventListener = function(type, handler) {
  var arr = this._listeners[type];
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
  return this._text;
};

ot.Model.prototype._apply = function(op) {
  var t = this._text;
  switch (op.typeName()) {
  case 'Insert':
    this._text = t.substr(0, op.pos) + op.value + t.substr(op.pos);
    var arr = this._listeners[ot.EventType.TEXT_INSERT];
    for (var i = 0; i < arr.length; i++) {
      arr[i](op.pos, op.value);
    }
    break;
  case 'Delete':
    console.assert(op.pos + op.len <= t.length, 'Delete past end');
    this._text = t.substr(0, op.pos) + t.substr(op.pos + op.len);
    var arr = this._listeners[ot.EventType.TEXT_DELETE];
    for (var i = 0; i < arr.length; i++) {
      arr[i](op.pos, op.len);
    }
    break;
  default:
    console.assert(false, 'Unexpected operation type "' + op.typeName() + '"');
  }
};

ot.Model.prototype._applyCompound = function(ops) {
  for (var i = 0; i < ops.length; i++) {
    this._apply(ops[i]);
  }
};
