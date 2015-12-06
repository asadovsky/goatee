'use strict';

var Editor = require('../client/editor');
var load = require('../client/ot').load;

var editor1, editor2;

function qs(selector) {
  return document.querySelector(selector);
}

load(0, function(doc) {
  editor1 = new Editor(qs('#editor1'), doc.getModel());
});

load(0, function(doc) {
  editor2 = new Editor(qs('#editor2'), doc.getModel());
});
