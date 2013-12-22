'use strict';

var editor1 = new goatee.TextAreaEditor(document.querySelector('#editor1'));
var editor2 = new goatee.TextAreaEditor(document.querySelector('#editor2'));

var onDocLoaded = function(doc, editor) {
  var model = doc.getModel();
  editor.setText(model.getText());

  model.addEventListener(goatee.EventType.TEXT_INSERT, editor.insertText);
  model.addEventListener(goatee.EventType.TEXT_DELETE, editor.deleteText);

  editor.addEventListener(goatee.EventType.TEXT_INSERT, model.insertText);
  editor.addEventListener(goatee.EventType.TEXT_DELETE, model.deleteText);
};

goatee.ot.load(0, function(doc) { onDocLoaded(doc, editor1); });
goatee.ot.load(0, function(doc) { onDocLoaded(doc, editor2); });
