'use strict';

var editorEl = document.querySelector('#editor');

var applyInsert = function(pos, value) {
  var t = editorEl.value;
  editorEl.value = t.substr(0, pos) + value + t.substr(pos);
};

var applyDelete = function(pos, len) {
  var t = editorEl.value;
  editorEl.value = t.substr(0, pos) + t.substr(pos + len);
};

var onDocLoaded = function(doc) {
  var model = doc.getModel();
  editorEl.value = model.getText();

  model.addEventListener(ot.EventType.TEXT_INSERT, applyInsert);
  model.addEventListener(ot.EventType.TEXT_DELETE, applyDelete);

  // Use keypress to catch char insertions, keydown to catch backspace/delete.
  // Also catch cut and paste.
  // TODO: Catch undo/redo, maybe using 'input' event.
  editorEl.addEventListener('keydown', function(e) {
    var selStart = editorEl.selectionStart, selEnd = editorEl.selectionEnd;
    switch (e.which) {
    case 8:  // backspace
      // Handles ctrl+backspace.
      window.setTimeout(function() {
        var newSelStart = editorEl.selectionStart;
        var len = selEnd - newSelStart;
        if (len > 0) {
          model.deleteText(newSelStart, len);
        }
      }, 0);
      break;
    case 46:  // delete
      // Handles ctrl+delete.
      var size = editorEl.value.length;
      window.setTimeout(function() {
        var newSize = editorEl.value.length;
        var len = size - newSize;
        if (len > 0) {
          model.deleteText(selStart, len);
        }
      }, 0);
      break;
    }
  });

  editorEl.addEventListener('keypress', function(e) {
    var selStart = editorEl.selectionStart, selEnd = editorEl.selectionEnd;
    // If there was a prior selection, log the deletion.
    if (selStart < selEnd) {
      model.deleteText(selStart, selEnd - selStart);
    }
    model.insertText(selStart, String.fromCharCode(event.which));
  });

  editorEl.addEventListener('cut', function(e) {
    var selStart = editorEl.selectionStart, selEnd = editorEl.selectionEnd;
    if (selStart < selEnd) {
      model.deleteText(selStart, selEnd - selStart);
    }
  });

  editorEl.addEventListener('paste', function(e) {
    var selStart = editorEl.selectionStart, selEnd = editorEl.selectionEnd;
    // If there was a prior selection, log the deletion.
    if (selStart < selEnd) {
      model.deleteText(selStart, selEnd - selStart);
    }
    // Get the pasted content.
    window.setTimeout(function() {
      var newSelStart = editorEl.selectionStart;
      model.insertText(selStart, editorEl.value.substr(selStart, newSelStart));
    }, 0);
  });
};

ot.load(0, onDocLoaded);
