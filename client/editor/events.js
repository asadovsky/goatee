// Model event classes.
//
// See also: https://developers.google.com/google-apps/realtime/handle-events

'use strict';

var inherits = require('inherits');

// Similar to gapi.drive.realtime.BaseModelEvent.
// TODO: Add sessionId and userId.
function Base(isLocal) {
  this.isLocal = isLocal;
}

function ReplaceText(isLocal, pos, len, value) {
  Base.call(this, isLocal);
  this.pos = pos;
  this.len = len;
  this.value = value;
}
inherits(ReplaceText, Base);

function SetSelectionRange(isLocal, start, end) {
  Base.call(this, isLocal);
  this.start = start;
  this.end = end;
}
inherits(SetSelectionRange, Base);

module.exports = {
  ReplaceText: ReplaceText,
  SetSelectionRange: SetSelectionRange
};
