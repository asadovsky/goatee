// Document class.

'use strict';

var AsyncModel = require('../editor').AsyncModel;
var text = require('./text');

module.exports = Document;

function Document(addr, docId, onDocLoaded) {
  var that = this;
  this.socket_ = new WebSocket('ws://' + addr);

  // Initialized by NewClient message from server.
  this.clientId_ = null;
  this.m_ = null;

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
      that.m_ = new AsyncModel(that, msg['Text']);
      onDocLoaded(that);
      return;
    }

    console.assert(msg['Type'] === 'Broadcast');
    var isLocal = msg['ClientId'] === that.clientId_;

    // Apply all mutations, regardless of whether they originated from this
    // client (i.e. unidirectional data flow).
    var ops = text.opsFromStrings(msg['OpStrs']);
    for (var i = 0; i < ops.length; i++) {
      // TODO: Update data structure that tracks Logoot metadata.
      var op = ops[i];
      switch(op.constructor.name) {
      case 'Insert':
        that.m_.applyInsert(op.pos, op.value, isLocal);
        break;
      case 'Delete':
        that.m_.applyDelete(op.pos, op.len, isLocal);
        break;
      default:
        throw new Error(op.constructor.name);
      }
    }
  };
}

Document.prototype.handleInsert = function(pos, value) {
  throw new Error('not implemented');
};

Document.prototype.handleDelete = function(pos, len) {
  throw new Error('not implemented');
};
