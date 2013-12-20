'use strict';

var ed = document.querySelector('#editor');

var applyInsert = function(pos, value) {
  var t = ed.value;
  ed.value = t.substr(0, pos) + value + t.substr(pos);
};

var applyDelete = function(pos, len) {
  var t = ed.value;
  ed.value = t.substr(0, pos) + t.substr(pos + len);
};

var onDocLoaded = function(doc) {
  var model = doc.getModel();
  ed.value = model.getText();

  model.addEventListener(ot.EventType.TEXT_INSERT, applyInsert);
  model.addEventListener(ot.EventType.TEXT_DELETE, applyDelete);

  // Use keypress to catch char insertions, keydown to catch backspace/delete.
  // Also catch cut and paste.
  // TODO: Catch undo/redo, maybe using 'input' event.
  ed.addEventListener('keydown', function(e) {
    var selStart = ed.selectionStart, selEnd = ed.selectionEnd;
    switch (e.which) {
    case 8:  // backspace
      // Handles ctrl+backspace.
      window.setTimeout(function() {
        var newSelStart = ed.selectionStart;
        var len = selEnd - newSelStart;
        if (len > 0) {
          model.pushDelete(newSelStart, len);
        }
      }, 0);
      break;
    case 46:  // delete
      // Handles ctrl+delete.
      var size = ed.value.length;
      window.setTimeout(function() {
        var newSize = ed.value.length;
        var len = size - newSize;
        if (len > 0) {
          model.pushDelete(selStart, len);
        }
      }, 0);
      break;
    }
  });

  ed.addEventListener('keypress', function(e) {
    var selStart = ed.selectionStart, selEnd = ed.selectionEnd;
    // If there was a prior selection, log the deletion.
    if (selStart < selEnd) {
      model.pushDelete(selStart, selEnd - selStart);
    }
    model.pushInsert(selStart, String.fromCharCode(event.which));
  });

  ed.addEventListener('cut', function(e) {
    var selStart = ed.selectionStart, selEnd = ed.selectionEnd;
    if (selStart < selEnd) {
      model.pushDelete(selStart, selEnd - selStart);
    }
  });

  ed.addEventListener('paste', function(e) {
    var selStart = ed.selectionStart, selEnd = ed.selectionEnd;
    // If there was a prior selection, log the deletion.
    if (selStart < selEnd) {
      model.pushDelete(selStart, selEnd - selStart);
    }
    // Get the pasted content.
    window.setTimeout(function() {
      var newSelStart = ed.selectionStart;
      model.pushInsert(selStart, ed.value.substr(selStart, newSelStart));
    }, 0);
  });
};

ot.Load(0, onDocLoaded);
