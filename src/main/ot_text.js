// Mirrors text.go.
// TODO: Shared, data-driven unit tests.

'use strict';

var opFromString = function(s) {
  var colon = s.indexOf(':');
  if (colon === -1) {
    console.assert(false, 'Failed to parse operation "' + s + '"');
  }
  var pos = parseInt(s.substr(1, colon));
  if (s[0] === 'i') {
    return new Insert(pos, s.substr(colon + 1));
  } else if (s[0] === 'd') {
    return new Delete(pos, parseInt(s.substr(colon + 1)));
  }
  console.assert(false, 'Unknown operation "' + s[0] + '"');
};

var opsFromStrings = function(strs) {
  var ops = new Array(strs.length);
  for (var i = 0; i < strs.length; i++) {
    ops[i] = opFromString(strs[i]);
  }
  return ops;
};

var opsToStrings = function(ops) {
  var strs = new Array(ops.length);
  for (var i = 0; i < ops.length; i++) {
    strs[i] = ops[i].toString();
  }
  return strs;
};

var Insert = function(pos, value) {
  this.pos = pos;
  this.value = value;
};

Insert.prototype.toString = function() {
  return 'i' + this.pos + ':' + this.value;
};

Insert.prototype.typeName = function() {
  return 'Insert';
};

var Delete = function(pos, len) {
  this.pos = pos;
  this.len = len;
};

Delete.prototype.toString = function() {
  return 'd' + this.pos + ':' + this.len;
};

Delete.prototype.typeName = function() {
  return 'Delete';
};

var transformInsertDelete = function(a, b) {
  if (a.pos <= b.pos) {
    return [a, new Delete(b.pos + a.value.length, b.len)];
  } else if (a.pos < b.pos + b.len) {
    return [new Insert(b.pos, ''), new Delete(b.pos, b.len + a.value.length)];
  } else {
    return [new Insert(a.pos - b.len, a.value), b];
  }
};

var transform = function(a, b) {
  console.log('transform(' + a + ', ' + b + ')');
  switch (a.typeName()) {
  case 'Insert':
    switch (b.typeName()) {
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
    switch (b.typeName()) {
    case 'Insert':
      var ins_del = transformInsertDelete(b, a);
      return [ins_del[1], ins_del[0]];
    case 'Delete':
      var aEnd = a.pos + a.len;
      var bEnd = b.pos + b.len;
      if (aEnd <= b.pos) {
        return [a, new Delete(b.pos - a.len, b.len)];
      } else if (bEnd <= a.pos) {
        return [new Delete(a.pos - b.len, a.len), b];
      }
      var pos = Math.min(a.pos, b.pos);
      var overlap = Math.max(0, Math.min(aEnd, bEnd) - math.Max(a.pos, b.pos));
      console.assert(overlap > 0);
      return [new Delete(pos, a.len - overlap),
              new Delete(pos, b.len - overlap)];
    }
  }
};

var transformCompound = function(a, b) {
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
};

var Text = function(s) {
  this.value = s;
};

Text.prototype.apply = function(op) {
  var v = this.value;
  switch (op.typeName()) {
  case 'Insert':
    this.value = v.substr(0, op.pos) + op.value + v.substr(op.pos);
    break;
  case 'Delete':
    console.assert(op.pos + op.len <= v.length, 'Delete past end');
    this.value = v.substr(0, op.pos) + v.substr(op.pos + op.len);
    break;
  default:
    console.assert(false, 'Unexpected operation type "' + op.typeName() + '"');
  }
};

Text.prototype.applyCompound = function(ops) {
  for (var i = 0; i < ops.length; i++) {
    this.apply(ops[i]);
  }
};
