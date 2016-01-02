// Mirrors server/crdt/logoot.go.

'use strict';

var util = require('../util');

function newParseError(s) {
  return new Error('Failed to parse op "' + s + '"');
}

function opFromString(s) {
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

function opsFromStrings(strs) {
  var ops = new Array(strs.length);
  for (var i = 0; i < strs.length; i++) {
    ops[i] = opFromString(strs[i]);
  }
  return ops;
}

function opsToStrings(ops) {
  var strs = new Array(ops.length);
  for (var i = 0; i < ops.length; i++) {
    strs[i] = ops[i].toString();
  }
  return strs;
}

// For server insertions, id is the id of the inserted atom, and nextId is not
// defined. For client insertions, id and nextId are the atoms to the left and
// right of the insertion location.
function Insert(id, value, nextId) {
  this.id = id;
  this.value = value;
  this.nextId = nextId || '';
}

Insert.prototype.toString = function() {
  return ['i', this.id, this.nextId, this.value].join(',');
};

function Delete(id) {
  this.id = id;
}

Delete.prototype.toString = function() {
  return ['d', this.id].join(',');
};

module.exports = {
  opsFromStrings: opsFromStrings,
  opsToStrings: opsToStrings,
  Insert: Insert,
  Delete: Delete
};
