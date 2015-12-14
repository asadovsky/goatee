SHELL := /bin/bash -euo pipefail
PATH := node_modules/.bin:$(PATH)

define BROWSERIFY
	@mkdir -p $(dir $2)
	browserify $1 -d -t [ envify purge ] -o $2
endef

define BROWSERIFY_MIN
	@mkdir -p $(dir $2)
	browserify $1 -d -t [ envify purge ] -p [ minifyify --map $(notdir $2).map --output $2.map ] -o $2
endef

.DELETE_ON_ERROR:

node_modules: package.json
	npm prune
	npm install
	touch $@

########################################
# Test, clean, and lint

dist/client/editor/tests/goatee.min.js: client/editor/tests/goatee.js $(shell find client) node_modules
	@mkdir -p $(dir $@)
	$(call BROWSERIFY,$<,$@)

.PHONY: test-editor
test-editor: dist/client/editor/tests/goatee.min.js
	@cp client/editor/tests/goatee.html dist/client/editor/tests
	open file://$(shell pwd)/dist/client/editor/tests/goatee.html

.PHONY: clean
clean:
	rm -rf dist node_modules

.PHONY: lint
lint: node_modules
	jshint .
