'use strict';

goatee.ot.load(0, function(doc) {
  new goatee.ed.Editor(document.querySelector('#editor1'), doc.getModel());
});

goatee.ot.load(0, function(doc) {
  new goatee.ed.Editor(document.querySelector('#editor2'), doc.getModel());
});
