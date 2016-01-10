'use strict';

exports.isAlphaNum = function(s) {
  return (/[A-Za-z0-9]/g).test(s);
};

exports.canonicalizeLineBreaks = function(s) {
  return s.replace(/(\r\n|\r|\n)/g, '\n');
};

// Mimics Go's strings.SplitN.
exports.splitN = function(s, sep, n) {
  var parts = s.split(sep);
  if (parts.length >= n) {
    parts[n - 1] = parts.slice(n - 1).join(',');
    parts = parts.slice(0, 3);
  }
  return parts;
};

exports.decorateWebSocket = function(ws) {
  var onopen = ws.onopen;
  ws.onopen = function(e) {
    if (process.env.DEBUG_SOCKET) {
      console.log('socket.open');
    }
    if (onopen) {
      onopen(e);
    }
  };

  var onclose = ws.onclose;
  ws.onclose = function(e) {
    if (process.env.DEBUG_SOCKET) {
      console.log('socket.close');
    }
    if (onclose) {
      onclose(e);
    }
  };

  var onmessage = ws.onmessage;
  ws.onmessage = function(e) {
    if (process.env.DEBUG_SOCKET) {
      console.log('socket.recv: ' + e.data);
    }
    if (onmessage) {
      onmessage(e);
    }
  };

  ws.sendMessage = function(msg) {
    var json = JSON.stringify(msg);
    if (process.env.DEBUG_SOCKET) {
      console.log('socket.send: ' + json);
    }
    function send() {
      ws.send(json);
    }
    if (process.env.DEBUG_DELAY) {
      window.setTimeout(send, Number(process.env.DEBUG_DELAY));
    } else {
      send();
    }
  };

  return ws;
};
