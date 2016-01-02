// Document class.

'use strict';

var AsyncModel = require('../editor').AsyncModel;

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
  };
}

Document.prototype.handleInsert = function(pos, value) {
  throw new Error('not implemented');
};

Document.prototype.handleDelete = function(pos, len) {
  throw new Error('not implemented');
};
