// Mostly mirrors server/crdt/logoot.go.
// TODO: Shared, data-driven unit tests.

var _ = require('lodash');
var inherits = require('inherits');

var lib = require('../lib');

function Id(pos, agentId) {
  this.pos = pos;
  this.agentId = agentId;
}

function Pid(ids, seq) {
  this.ids = ids;
  this.seq = seq;
}

Pid.prototype.less = function(other) {
  for (var i = 0; i < this.ids.length; i++) {
    if (i === other.ids.length) {
      return false;
    }
    var v = this.ids[i], vo = other.ids[i];
    if (v.pos !== vo.pos) {
      return v.pos < vo.pos;
    } else if (v.agentId !== vo.agentId) {
      return v.agentId < vo.agentId;
    }
  }
  if (this.ids.length === other.ids.length) {
    return this.seq < other.seq;
  }
  return true;
};

Pid.prototype.encode = function() {
  return _.map(this.ids, function(id) {
    return [id.pos, id.agentId].join('.');
  }).join(':') + '~' + this.seq;
};

function decodePid(s) {
  var idsAndSeq = s.split('~');
  if (idsAndSeq.length !== 2 ) {
    throw new Error('invalid pid: ' + s);
  }
  var seq = lib.atoi(idsAndSeq[1]);
  var ids = _.map(idsAndSeq[0].split(':'), function(idStr) {
    var parts = idStr.split('.');
    if (parts.length !== 2) {
      throw new Error('invalid id: ' + idStr);
    }
    return new Id(lib.atoi(parts[0]), lib.atoi(parts[1]));
  });
  return new Pid(ids, seq);
}

function Op() {}

Op.prototype.encode = function() {
  throw new Error('not implemented');
};

inherits(ClientInsert, Op);
function ClientInsert(prevPid, nextPid, value) {
  Op.call(this);
  this.prevPid = prevPid;
  this.nextPid = nextPid;
  this.value = value;
}

ClientInsert.prototype.encode = function() {
  var prevPid = this.prevPid ? this.prevPid.encode() : '';
  var nextPid = this.nextPid ? this.nextPid.encode() : '';
  return ['ci', prevPid, nextPid, this.value].join(',');
};

inherits(Insert, Op);
function Insert(pid, value) {
  Op.call(this);
  this.pid = pid;
  this.value = value;
}

Insert.prototype.encode = function() {
  return ['i', this.pid.encode(), this.value].join(',');
};

inherits(Delete, Op);
function Delete(pid) {
  Op.call(this);
  this.pid = pid;
}

Delete.prototype.encode = function() {
  return ['d', this.pid.encode()].join(',');
};

function newParseError(s) {
  return new Error('failed to parse op: ' + s);
}

function decodeOp(s) {
  var parts;
  var t = s.split(',', 1)[0];
  switch (t) {
  case 'ci':
    parts = lib.splitN(s, ',', 4);
    if (parts.length < 4) {
      throw newParseError(s);
    }
    return new ClientInsert(decodePid(parts[1]), decodePid(parts[2]), parts[3]);
  case 'i':
    parts = lib.splitN(s, ',', 3);
    if (parts.length < 3) {
      throw newParseError(s);
    }
    return new Insert(decodePid(parts[1]), parts[2]);
  case 'd':
    parts = lib.splitN(s, ',', 2);
    if (parts.length < 2) {
      throw newParseError(s);
    }
    return new Delete(decodePid(parts[1]));
  default:
    throw new Error('unknown op type: ' + t);
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

function Atom(pid, value) {
  this.pid = pid;
  this.value = value;
}

function Logoot(atoms) {
  this.atoms_ = atoms;
}

function decode(s) {
  var atoms = JSON.parse(s);
  return new Logoot(_.map(atoms, function(atom) {
    return new Atom(decodePid(atom.Pid), atom.Value);
  }));
}

Logoot.prototype.len = function() {
  return this.atoms_.length;
};

Logoot.prototype.pid = function(i) {
  return this.atoms_[i].pid;
};

Logoot.prototype.applyInsertText = function(op) {
  var p = this.search_(op.pid);
  this.atoms_.splice(p, 0, {pid: op.pid, value: op.value});
  return p;
};

Logoot.prototype.applyDeleteText = function(op) {
  var p = this.search_(op.pid);
  this.atoms_.splice(p, 1);
  return p;
};

Logoot.prototype.search_ = function(pid) {
  var that = this;
  return lib.search(this.atoms_.length, function(i) {
    return !that.atoms_[i].pid.less(pid);
  });
};

module.exports = {
  ClientInsert: ClientInsert,
  Insert: Insert,
  Delete: Delete,
  encodeOps: encodeOps,
  decodeOps: decodeOps,
  Logoot: Logoot,
  decode: decode
};
