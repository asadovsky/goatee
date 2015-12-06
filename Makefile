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

.PHONY: test
test:
	open file:///Users/sadovsky/dev/go/src/github.com/asadovsky/goatee/client/tests/editor.html

.PHONY: lint
lint: node_modules
	jshint .
