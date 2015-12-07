// Model event classes.
//
// See also: https://developers.google.com/drive/realtime/handle-events

'use strict';

var inherits = require('inherits');

var EventType = {
  INSERT_TEXT: 'insertText',
  DELETE_TEXT: 'deleteText',
  SET_SELECTION_RANGE: 'setSelectionRange'
};

// Similar to gapi.drive.realtime.BaseModelEvent.
// TODO: Add sessionId and userId.
function BaseModelEvent(type, isLocal) {
  this.type = type;
  this.isLocal = isLocal;
}

// Similar to gapi.drive.realtime.TextInsertedEvent.
function InsertTextEvent(isLocal, pos, value) {
  BaseModelEvent.call(this, EventType.INSERT_TEXT, isLocal);
  this.pos = pos;
  this.value = value;
}
inherits(InsertTextEvent, BaseModelEvent);

// Similar to gapi.drive.realtime.TextDeletedEvent.
function DeleteTextEvent(isLocal, pos, len) {
  BaseModelEvent.call(this, EventType.DELETE_TEXT, isLocal);
  this.pos = pos;
  this.len = len;
}
inherits(DeleteTextEvent, BaseModelEvent);

function SetSelectionRangeEvent(isLocal, start, end) {
  BaseModelEvent.call(this, EventType.SET_SELECTION_RANGE, isLocal);
  this.start = start;
  this.end = end;
}
inherits(SetSelectionRangeEvent, BaseModelEvent);

module.exports = {
  EventType: EventType,
  InsertTextEvent: InsertTextEvent,
  DeleteTextEvent: DeleteTextEvent,
  SetSelectionRangeEvent: SetSelectionRangeEvent
};
