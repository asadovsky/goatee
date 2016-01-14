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

// Binary search. Mimics Go's sort.Search.
// Returns the smallest index i in [0, n) at which f(i) is true, assuming that
// on the range [0, n), f(i) == true implies f(i+1) == true. If there is no such
// index, returns n. Calls f(i) only for i in the range [0, n).
exports.search = function(n, f) {
  var i = 0, j = n;
  while (i < j) {
    var h = i + Math.floor((j-i)/2);
    if (!f(h)) {
      i = h + 1;
    } else {
      j = h;
    }
  }
  return i;
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
