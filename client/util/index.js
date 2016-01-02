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
