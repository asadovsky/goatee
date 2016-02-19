// Client-side Logoot CRDT.

var Doc = require('./document');

function load(addr, docId, onLoad) {
  /* jshint nonew: false */
  new Doc(addr, docId, onLoad);
}

module.exports = {
  load: load,
  Document: Doc
};
