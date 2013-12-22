'use strict';

var editorEl = document.querySelector('#editor');
var editor = new goatee.TextAreaEditor(editorEl);

var onDocLoaded = function(doc) {
  var model = doc.getModel();
  editor.setText(model.getText());

  model.addEventListener(goatee.EventType.TEXT_INSERT, editor.insertText);
  model.addEventListener(goatee.EventType.TEXT_DELETE, editor.deleteText);

  editor.addEventListener(goatee.EventType.TEXT_INSERT, model.insertText);
  editor.addEventListener(goatee.EventType.TEXT_DELETE, model.deleteText);
};

goatee.ot.load(0, onDocLoaded);
