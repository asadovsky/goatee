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

########################################
# Test, clean, and lint

dist/tests/editor.min.js: client/tests/editor.js $(shell find client) node_modules
	@mkdir -p $(dir $@)
	$(call BROWSERIFY,$<,$@)

.PHONY: test
test: dist/tests/editor.min.js
	@cp client/editor.css client/tests/editor.html dist/tests
	open file://$(shell pwd)/dist/tests/editor.html

.PHONY: clean
clean:
	rm -rf dist node_modules

.PHONY: lint
lint: node_modules
	jshint .
