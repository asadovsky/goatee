# Next

- Build editor and ot packages
- Update demos to consume packages

# General

- Use ES2015 via https://babeljs.io/

# Editor

- Add Quill-backed editor (http://quilljs.com/)
- Add more tests
- Set up Travis (http://travis-ci.org/)
- See TODOs in goatee.js
- Better separate model from view
- Keep track of model updates since last render, so that render can know which
  parts of view to update

# OT

- Support cursors and selections
- Support undo/redo
- Support offline editing (i.e. if WebSocket closes)
- Fix edge cases, e.g. handle non-ASCII chars
