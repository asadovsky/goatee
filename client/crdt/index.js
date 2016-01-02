// Client-side Logoot CRDT.

'use strict';

/* global Document: true */
var Document = require('./document');

function load(addr, docId, onDocLoaded) {
  /* jshint nonew: false */
  new Document(addr, docId, onDocLoaded);
}

module.exports = {
  load: load,
  Document: Document
};
