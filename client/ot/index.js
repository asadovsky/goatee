// Client-side OT.
//
// See also: https://developers.google.com/google-apps/realtime/overview

'use strict';

/* global Document: true */
var Document = require('./document');

// Similar to gapi.drive.realtime.load.
function load(docId, onDocLoaded) {
  /* jshint nonew: false */
  new Document(onDocLoaded);
}

module.exports = {
  load: load,
  Document: Document,
  Model: require('./model')
};
