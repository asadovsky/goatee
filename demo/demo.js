'use strict';

function newEditor(type, selector, model) {
  var el = document.querySelector(selector);
  if (type === 'goatee') {
    return new goatee.editor.GoateeEditor(el, model);
  } else {
    console.assert(type === 'textarea');
    return new goatee.editor.TextareaEditor(el, model);
  }
}

var demo = window.demo;
if (demo.mode === 'local') {
  newEditor(demo.type, '#ed');
} else {
  console.assert(demo.mode === 'ot');
  goatee.ot.load(0, function(doc) {
    newEditor(demo.type, '#ed1');
  });
  goatee.ot.load(0, function(doc) {
    newEditor(demo.type, '#ed2');
  });
}
