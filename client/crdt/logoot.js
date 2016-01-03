// Mirrors server/crdt/logoot.go.

'use strict';

var inherits = require('inherits');

var util = require('../util');

function Op() {}

Op.prototype.encode = function() {
  throw new Error('not implemented');
};

inherits(Insert, Op);
function Insert(pid, value, nextPid) {
  this.pid = pid;
  this.value = value;
  this.nextPid = nextPid || '';
}

Insert.prototype.encode = function() {
  return ['i', this.pid, this.nextPid, this.value].join(',');
};

inherits(Delete, Op);
function Delete(pid) {
  this.pid = pid;
}

Delete.prototype.encode = function() {
  return ['d', this.pid].join(',');
};

function newParseError(s) {
  return new Error('Failed to parse op "' + s + '"');
}

function decodeOp(s) {
  var parts;
  var t = s.split(',', 1);
  switch (t) {
  case 'i':
    parts = util.splitN(s, ',', 4);
    if (parts.length < 3) {
      throw newParseError(s);
    }
    return new Insert(parts[1], parts[3], parts[2]);
  case 'd':
    parts = util.splitN(s, ',', 2);
    if (parts.length < 2) {
      throw newParseError(s);
    }
    return new Delete(parts[1]);
  default:
    throw new Error('Unknown op type "' + t + '"');
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

module.exports = {
  Insert: Insert,
  Delete: Delete,
  encodeOps: encodeOps,
  decodeOps: decodeOps
};
