// Client-side Logoot CRDT.

'use strict';

/* global Document: true */
var Document = require('./document');

function load(addr, docId, onLoad) {
  /* jshint nonew: false */
  new Document(addr, docId, onLoad);
}

module.exports = {
  load: load,
  Document: Document
};
