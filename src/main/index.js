'use strict';

var editor = $('#editor');

// Initialized by NewClient message from server.
var clientId = null;
var baseTxnId = null;  // last transaction we've gotten from server

// The most recent clientOps index sent to and acknowledged by the server.
var sentClientOpIdx = -1;
var ackedClientOpIdx = -1;

// All past client ops. Bridge from latest server-acked state to client state
// starts at clientOps[ackedClientOpIdx] + 1.
var clientOps = [];

// TODO: Add an object to encapsulate a client (textarea) and its connection to
// the server.
var socket = new WebSocket($('body').attr('data-ws-url'));

var sendBufferedOps = function() {
  console.assert(sentClientOpIdx === ackedClientOpIdx);
  if (sentClientOpIdx === clientOps.length - 1) {
    return;  // no ops to send
  }
  sentClientOpIdx = clientOps.length - 1;
  // TODO: Compress ops (e.g. combine insertions) before sending.
  var msg = {
    'OpStrs': opsToStrings(clientOps.slice(ackedClientOpIdx + 1)),
    'ClientId': clientId,
    'BaseTxnId': baseTxnId
  };
  var json = JSON.stringify(msg);
  console.log('socket.send ' + json);
  window.setTimeout(function() {
    socket.send(json);
  }, 3000);
};

// TODO: Check for race conditions.
var pushOp = function(op) {
  //console.log(op.toString());
  var clientOpIdx = clientOps.length;
  clientOps.push(op);
  // If op is parented off server state space (as opposed to some non-acked
  // client op), send it right away.
  if (clientOpIdx === ackedClientOpIdx + 1) {
    sendBufferedOps();
  }
};
var pushInsert = function(pos, value) {
  pushOp(new Insert(pos, value));
};
var pushDelete = function(pos, len) {
  pushOp(new Delete(pos, len));
};

socket.onclose = function(event) {
  console.log('socket.close');
};
socket.onmessage = function(event) {
  console.log('socket.receive ' + event.data);
  var msg = JSON.parse(event.data);
  // TODO: Implement better way to detect message type.
  if (msg.hasOwnProperty('Text')) {  // NewClient
    console.assert(clientId === null);
    clientId = msg['ClientId'];
    baseTxnId = parseInt(msg['BaseTxnId']);
    editor.val(msg['Text']);
    return;
  }

  console.assert(msg.hasOwnProperty('TxnId'));  // Broadcast
  var newBaseTxnId = parseInt(msg['TxnId']);
  console.assert(newBaseTxnId === baseTxnId + 1);
  baseTxnId = newBaseTxnId;

  // If op is from this client, send all buffered ops to server.
  // Otherwise, transform it against all buffered ops and then apply it.
  if (msg['ClientId'] === clientId) {
    ackedClientOpIdx = sentClientOpIdx;
    sendBufferedOps();
    return;
  }
  var ops = opsFromStrings(msg['OpStrs']);
  var tup = transformCompound(clientOps.slice(ackedClientOpIdx + 1), ops);
  var bufferedOps = tup[0];
  ops = tup[1];
  // Unfortunately, splice doesn't support Array inputs.
  for (var i = 0; i < bufferedOps.length; i++) {
    clientOps[ackedClientOpIdx + 1 + i] = bufferedOps[i];
  }
  // Apply the transformed server compound op against the client text.
  var text = new Text(editor.val());
  text.applyCompound(ops);
  editor.val(text.value);
};

// Use keypress to catch char insertions, keydown to catch backspace/delete.
// Also catch cut and paste.
// TODO: Catch undo/redo, maybe using 'input' event.
editor.on('keydown keypress cut paste', function(event) {
  var selStart = editor.get(0).selectionStart;
  var selEnd = editor.get(0).selectionEnd;
  switch (event.type) {
  case 'keydown':
    switch (event.which) {
    case 8:  // backspace
      // Handles ctrl+backspace.
      window.setTimeout(function() {
        var newSelStart = editor.get(0).selectionStart;
        var len = selEnd - newSelStart;
        if (len > 0) {
          pushDelete(newSelStart, len);
        }
      }, 0);
      break;
    case 46:  // delete
      // Handles ctrl+delete.
      var size = editor.val().length;
      window.setTimeout(function() {
        var newSize = editor.val().length;
        var len = size - newSize;
        if (len > 0) {
          pushDelete(selStart, len);
        }
      }, 0);
      break;
    }
    break;
  case 'keypress':
    // If there was a prior selection, log the deletion.
    if (selStart < selEnd) {
      pushDelete(selStart, selEnd - selStart);
    }
    pushInsert(selStart, String.fromCharCode(event.which));
    break;
  case 'cut':
    if (selStart < selEnd) {
      pushDelete(selStart, selEnd - selStart);
    }
    break;
  case 'paste':
    // If there was a prior selection, log the deletion.
    if (selStart < selEnd) {
      pushDelete(selStart, selEnd - selStart);
    }
    // Get the pasted content.
    window.setTimeout(function() {
      var newSelStart = editor.get(0).selectionStart;
      pushInsert(selStart, editor.val().substr(selStart, newSelStart));
    }, 0);
    break;
  }
});
