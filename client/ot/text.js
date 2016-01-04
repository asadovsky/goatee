// Mirrors server/ot/text.go.
//
// TODO: Shared, data-driven unit tests.

'use strict';

var inherits = require('inherits');

var util = require('../util');

function Op() {}

Op.prototype.encode = function() {
  throw new Error('not implemented');
};

inherits(Insert, Op);
function Insert(pos, value) {
  this.pos = pos;
  this.value = value;
}

Insert.prototype.encode = function() {
  return ['i', this.pos, this.value].join(',');
};

inherits(Delete, Op);
function Delete(pos, len) {
  this.pos = pos;
  this.len = len;
}

Delete.prototype.encode = function() {
  return ['d', this.pos, this.len].join(',');
};

function decodeOp(s) {
  var parts = util.splitN(s, ',', 3);
  if (parts.length < 3) {
    throw new Error('failed to parse op "' + s + '"');
  }
  var pos = Number(parts[1]);
  var t = parts[0];
  switch (t) {
  case 'i':
    return new Insert(pos, parts[2]);
  case 'd':
    return new Delete(pos, Number(parts[2]));
  default:
    throw new Error('unknown op type "' + t + '"');
  }
}

function encodeOps(ops) {
  var strs = new Array(ops.length);
  for (var i = 0; i < ops.length; i++) {
    strs[i] = ops[i].encode();
  }
  return strs;
}

function decodeOps(strs) {
  var ops = new Array(strs.length);
  for (var i = 0; i < strs.length; i++) {
    ops[i] = decodeOp(strs[i]);
  }
  return ops;
}

function transformInsertDelete(a, b) {
  if (a.pos <= b.pos) {
    return [a, new Delete(b.pos + a.value.length, b.len)];
  } else if (a.pos >= b.pos + b.len) {
    return [new Insert(a.pos - b.len, a.value), b];
  } else {
    return [new Insert(b.pos, ''), new Delete(b.pos, b.len + a.value.length)];
  }
}

function transform(a, b) {
  /* jshint -W086 */
  // https://github.com/jshint/jshint/blob/master/src/messages.js
  if (process.env.DEBUG_OT) {
    console.log('transform(' + a + ', ' + b + ')');
  }
  switch (a.constructor.name) {
  case 'Insert':
    switch (b.constructor.name) {
    case 'Insert':
      if (b.pos <= a.pos) {
        return [new Insert(a.pos + b.value.length, a.value), b];
      } else {
        return [a, new Insert(b.pos + a.value.length, b.value)];
      }
    case 'Delete':
      return transformInsertDelete(a, b);
    }
  case 'Delete':
    switch (b.constructor.name) {
    case 'Insert':
      var insDel = transformInsertDelete(b, a);
      return [insDel[1], insDel[0]];
    case 'Delete':
      var aEnd = a.pos + a.len;
      var bEnd = b.pos + b.len;
      if (aEnd <= b.pos) {
        return [a, new Delete(b.pos - a.len, b.len)];
      } else if (bEnd <= a.pos) {
        return [new Delete(a.pos - b.len, a.len), b];
      }
      var pos = Math.min(a.pos, b.pos);
      var overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(a.pos, b.pos));
      console.assert(overlap > 0);
      return [new Delete(pos, a.len - overlap),
              new Delete(pos, b.len - overlap)];
    }
  }
}

function transformPatch(a, b) {
  var aNew = a.slice(0);
  var bNew = new Array(b.length);
  for (var i = 0; i < b.length; i++) {
    var bOp = b[i];
    for (var j = 0; j < aNew.length; j++) {
      var tup = transform(aNew[j], bOp);
      aNew[j] = tup[0];
      bOp = tup[1];
    }
    bNew[i] = bOp;
  }
  return [aNew, bNew];
}

module.exports = {
  Insert: Insert,
  Delete: Delete,
  encodeOps: encodeOps,
  decodeOps: decodeOps,
  transform: transform,
  transformPatch: transformPatch,
};
