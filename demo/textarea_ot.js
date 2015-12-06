'use strict';

var TextAreaEditor = require('../client/textarea_editor');
var load = require('../client/ot').load;

var editor1, editor2;

function qs(selector) {
  return document.querySelector(selector);
}

load(0, function(doc) {
  editor1 = new TextAreaEditor(qs('#editor1'), doc.getModel());
});

load(0, function(doc) {
  editor2 = new TextAreaEditor(qs('#editor2'), doc.getModel());
});
