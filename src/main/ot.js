// Client-side OT.
//
// See also: https://developers.google.com/drive/realtime/
//
// TODO:
//  - Track selection ranges in server
//  - Use browser native custom events
//  - Support other ranges (e.g. bold)
//  - Maybe add canUndo and canRedo properties
//  - Check for race conditions

'use strict';

var goatee = goatee || {};
goatee.ot = goatee.ot || {};

goatee.ot.DEBUG_DELAY = 0;
goatee.ot.DEBUG_SOCKET = false;
goatee.ot.DEBUG_EVENTS = false;

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
    this.model_.applyCompound_(ops, false);
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
  // Apply op locally and notify listeners.
  this.model_.apply_(op, true);
  // Schedule op to be sent to server.
  var clientOpIdx = this.clientOps_.length;
  this.clientOps_.push(op);
  // If op is parented off server state space (as opposed to some non-acked
  // client op), send it right away.
  if (clientOpIdx === this.ackedClientOpIdx_ + 1) {
    // Use setTimeout(x, 0) to avoid blocking the client.
    // TODO: Make it so that combo ops (e.g. delete selection + insert
    // replacement text) are sent to the server together.
    window.setTimeout(this.sendBufferedOps_.bind(this), 0);
  }
};

////////////////////////////////////////////////////////////////////////////////
// Model

// Currently, a combination of gapi.drive.realtime.Model and
// gapi.drive.realtime.CollaborativeString.
goatee.ot.Model = function(doc, text) {
  this.doc_ = doc;

  // Note, we assume line breaks have been canonicalized to \n.
  this.text_ = text;
  this.selStart_ = 0;
  this.selEnd_ = 0;

  this.listeners_ = {};
  this.listeners_[goatee.EventType.INSERT_TEXT] = [];
  this.listeners_[goatee.EventType.DELETE_TEXT] = [];
  this.listeners_[goatee.EventType.SET_SELECTION_RANGE] = [];
};

goatee.ot.Model.prototype.getText = function() {
  return this.text_;
};

goatee.ot.Model.prototype.getSelectionRange = function() {
  return [this.selStart_, this.selEnd_];
};

goatee.ot.Model.prototype.insertText = function(pos, value) {
  if (value.length === 0) return;
  this.doc_.pushOp_(new goatee.ot.Insert(pos, value));
};

goatee.ot.Model.prototype.deleteText = function(pos, len) {
  if (len === 0) return;
  this.doc_.pushOp_(new goatee.ot.Delete(pos, len));
};

goatee.ot.Model.prototype.setSelectionRange = function(start, end) {
  if (this.selStart_ === start && this.selEnd_ === end) return;
  // TODO: Push op to server. For now, we simply update local state and notify
  // listeners.
  this.selStart_ = start;
  this.selEnd_ = end;
  this.broadcastEvent_(new goatee.SetSelectionRangeEvent(true, start, end));
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

goatee.ot.Model.prototype.apply_ = function(op, isLocal) {
  var t = this.text_;
  switch (op.typeName()) {
  case 'Insert':
    this.text_ = t.substr(0, op.pos) + op.value + t.substr(op.pos);
    // Update selection range.
    if (isLocal) {
      this.selStart_ = op.pos + op.value.length;
      this.selEnd_ = this.selStart_;
    } else {
      if (this.selStart_ >= op.pos) this.selStart_ += op.value.length;
      if (this.selEnd_ >= op.pos) this.selEnd_ += op.value.length;
    }
    this.broadcastEvent_(new goatee.InsertTextEvent(isLocal, op.pos, op.value));
    break;
  case 'Delete':
    console.assert(op.pos + op.len <= t.length, 'Delete past end');
    this.text_ = t.substr(0, op.pos) + t.substr(op.pos + op.len);
    // Update selection range.
    if (isLocal) {
      this.selStart_ = op.pos;
      this.selEnd_ = this.selStart_;
    } else {
      if (this.selStart_ > op.pos) {
        this.selStart_ = Math.max(op.pos, this.selStart_ - op.len);
      }
      if (this.selEnd_ > op.pos) {
        this.selEnd_ = Math.max(op.pos, this.selEnd_ - op.len);
      }
    }
    this.broadcastEvent_(new goatee.DeleteTextEvent(isLocal, op.pos, op.len));
    break;
  default:
    console.assert(false, 'Unexpected operation type "' + op.typeName() + '"');
  }
};

goatee.ot.Model.prototype.applyCompound_ = function(ops, isLocal) {
  for (var i = 0; i < ops.length; i++) {
    this.apply_(ops[i], isLocal);
  }
};

goatee.ot.Model.prototype.broadcastEvent_ = function(e) {
  if (goatee.ot.DEBUG_EVENTS) console.log(e);
  var arr = this.listeners_[e.type];
  for (var i = 0; i < arr.length; i++) {
    arr[i](e);
  }
};
