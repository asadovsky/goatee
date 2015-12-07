// HtmlSizer class.

'use strict';

module.exports = HtmlSizer;

function HtmlSizer(parentEl) {
  this.el_ = document.createElement('div');
  this.el_.style.position = 'fixed';
  this.el_.style.top = '-1000px';
  this.el_.style.left = '-1000px';
  this.el_.style.visibilty = 'hidden';
  parentEl.appendChild(this.el_);
}

HtmlSizer.prototype.size = function(html) {
  this.el_.innerHTML = html;
  var res = [this.el_.offsetWidth, this.el_.offsetHeight];
  this.el_.innerHTML = '';
  return res;
};

HtmlSizer.prototype.width = function(html) {
  return this.size(html)[0];
};

HtmlSizer.prototype.height = function(html) {
  return this.size(html)[1];
};
