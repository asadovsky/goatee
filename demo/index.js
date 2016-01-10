'use strict';

/* jshint newcap: false */

var _ = require('lodash');
var React = require('react');
var ReactDOM = require('react-dom');
var url = require('url');

var h = require('./util').h;

function newEditor(el, type, model) {
  if (type === 'goatee') {
    return new goatee.editor.GoateeEditor(el, model);
  } else {
    console.assert(type === 'textarea');
    return new goatee.editor.TextareaEditor(el, model);
  }
}

var Editor = React.createFactory(React.createClass({
  displayName: 'Editor',
  componentDidMount: function() {
    var that = this, el = ReactDOM.findDOMNode(this);
    function onLoad(doc) {
      var model = doc ? doc.getModel() : null;
      var ed = newEditor(el, that.props.type, model);
      if (that.props.focus) ed.focus();
    }
    switch (this.props.mode) {
    case 'local':
      onLoad(null);
      break;
    case 'ot':
      goatee.ot.load(this.props.addr, 0, onLoad);
      break;
    case 'crdt':
      goatee.crdt.load(this.props.addr, 0, onLoad);
      break;
    default:
      throw new Error(this.props.mode);
    }
  },
  render: function() {
    return h('div');
  }
}));

// TODO: Add toggle buttons for mode and type.
var Page = React.createFactory(React.createClass({
  displayName: 'Page',
  render: function() {
    var props = _.pick(this.props, ['mode', 'type', 'addr']);
    return h('div', [
      h('pre', JSON.stringify(props, null, 2)),
      h('div', props.mode === 'local' ? [
        Editor(_.assign({focus: true}, props))
      ] : [
        Editor(_.assign({focus: true}, props)), h('br'), Editor(props)
      ])
    ]);
  }
}));

var u = url.parse(window.location.href, true);

ReactDOM.render(Page({
  mode: u.query.mode || 'local',
  type: u.query.type || 'goatee',
  addr: u.query.addr || 'localhost:4000'
}), document.getElementById('page'));
