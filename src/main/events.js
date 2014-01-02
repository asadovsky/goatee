// Model event types and objects.
//
// See also: https://developers.google.com/drive/realtime/handle-events

'use strict';

var goatee = goatee || {};

goatee.EventType = {
  INSERT_TEXT: 'insert_text',
  DELETE_TEXT: 'delete_text',
  SET_SELECTION_RANGE: 'set_selection_range'
};

// Similar to gapi.drive.realtime.BaseModelEvent.
// TODO: Expand to include bubbles, sessionId, and userId.
goatee.BaseModelEvent = function(type, isLocal) {
  this.type = type;
  this.isLocal = isLocal;
};

// Similar to gapi.drive.realtime.TextInsertedEvent.
goatee.InsertTextEvent = function(isLocal, pos, value) {
  goatee.BaseModelEvent.bind(this)(goatee.EventType.INSERT_TEXT, isLocal);
  this.pos = pos;
  this.value = value;
};

// Similar to gapi.drive.realtime.TextDeletedEvent.
goatee.DeleteTextEvent = function(isLocal, pos, len) {
  goatee.BaseModelEvent.bind(this)(goatee.EventType.DELETE_TEXT, isLocal);
  this.pos = pos;
  this.len = len;
};

goatee.SetSelectionRangeEvent = function(isLocal, start, end) {
  goatee.BaseModelEvent.bind(this)(
    goatee.EventType.SET_SELECTION_RANGE, isLocal);
  this.start = start;
  this.end = end;
};
