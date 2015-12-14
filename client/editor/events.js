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

// Similar to gapi.drive.realtime.TextInsertedEvent.
function InsertText(isLocal, pos, value) {
  Base.call(this, isLocal);
  this.pos = pos;
  this.value = value;
}
inherits(InsertText, Base);

// Similar to gapi.drive.realtime.TextDeletedEvent.
function DeleteText(isLocal, pos, len) {
  Base.call(this, isLocal);
  this.pos = pos;
  this.len = len;
}
inherits(DeleteText, Base);

function SetSelectionRange(isLocal, start, end) {
  Base.call(this, isLocal);
  this.start = start;
  this.end = end;
}
inherits(SetSelectionRange, Base);

module.exports = {
  InsertText: InsertText,
  DeleteText: DeleteText,
  SetSelectionRange: SetSelectionRange
};
