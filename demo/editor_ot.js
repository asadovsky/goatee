'use strict';

var Editor = require('../client/editor');
var load = require('../client/ot').load;

var ed1, ed2;

load(0, function(doc) {
  ed1 = new Editor(document.querySelector('#ed1'), doc.getModel());
});

load(0, function(doc) {
  ed2 = new Editor(document.querySelector('#ed2'), doc.getModel());
});
