'use strict';

var editor1, editor2;

goatee.ot.load(0, function(doc) {
  editor1 = new goatee.ed.Editor(
    document.querySelector('#editor1'), doc.getModel());
});

goatee.ot.load(0, function(doc) {
  editor2 = new goatee.ed.Editor(
    document.querySelector('#editor2'), doc.getModel());
});
