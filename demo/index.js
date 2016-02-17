/* jshint newcap: false */

var _ = require('lodash');
var eddie = require('eddie');
var React = require('react'), h = require('react-h-function')(React);
var ReactDOM = require('react-dom');
var url = require('url');

var crdt = require('../client/crdt');
var ot = require('../client/ot');

function newEditor(el, type, model) {
  if (type === 'eddie') {
    return new eddie.EddieEditor(el, model);
  } else {
    console.assert(type === 'textarea');
    return new eddie.TextareaEditor(el, model);
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
      ot.load(this.props.addr, 0, onLoad);
      break;
    case 'crdt':
      crdt.load(this.props.addr, 0, onLoad);
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
  type: u.query.type || 'eddie',
  addr: u.query.addr || 'localhost:4000'
}), document.getElementById('page'));
