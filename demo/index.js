'use strict';

var url = require('url');

function newEditor(type, selector, model) {
  var el = document.querySelector(selector);
  if (type === 'goatee') {
    return new goatee.editor.GoateeEditor(el, model);
  } else {
    console.assert(type === 'textarea');
    return new goatee.editor.TextareaEditor(el, model);
  }
}

var addr = url.parse(window.location.href, true).query['addr'];

var opts = window.opts;
if (opts.mode === 'local') {
  newEditor(opts.type, '#ed').focus();
} else {
  console.assert(opts.mode === 'ot');
  goatee.ot.load(addr, 0, function(doc) {
    newEditor(opts.type, '#ed1', doc.getModel()).focus();
  });
  goatee.ot.load(addr, 0, function(doc) {
    newEditor(opts.type, '#ed2', doc.getModel());
  });
}
