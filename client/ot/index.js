// Client-side OT.
//
// See also: https://developers.google.com/google-apps/realtime/overview

var Doc = require('./document');

// Similar to gapi.drive.realtime.load.
function load(addr, docId, onLoad) {
  /* jshint nonew: false */
  new Doc(addr, docId, onLoad);
}

module.exports = {
  load: load,
  Document: Doc
};
