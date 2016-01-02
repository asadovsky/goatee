// Client-side OT.
//
// See also: https://developers.google.com/google-apps/realtime/overview

'use strict';

/* global Document: true */
var Document = require('./document');

// Similar to gapi.drive.realtime.load.
function load(addr, docId, onDocLoaded) {
  /* jshint nonew: false */
  new Document(addr, docId, onDocLoaded);
}

module.exports = {
  load: load,
  Document: Document
};
