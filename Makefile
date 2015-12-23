SHELL := /bin/bash -euo pipefail
PATH := node_modules/.bin:$(PATH)
GOPATH := $(HOME)/dev/go

define BROWSERIFY
	@mkdir -p $(dir $2)
	browserify $1 -d -t [ envify purge ] -o $2
endef

define BROWSERIFY_STANDALONE
	@mkdir -p $(dir $2)
	browserify $1 -s goatee.$3 -d -t [ envify purge ] -o $2
endef

.DELETE_ON_ERROR:

all: build

.PHONY: build

node_modules: package.json
	npm prune
	npm install
	touch $@

build: dist/editor.min.js
dist/editor.min.js: client/editor/index.js $(shell find client) node_modules
	$(call BROWSERIFY_STANDALONE,$<,$@,editor)

build: dist/ot.min.js
dist/ot.min.js: client/ot/index.js $(shell find client) node_modules
	$(call BROWSERIFY_STANDALONE,$<,$@,ot)

build: dist/demo.min.js
dist/demo.min.js: demo/index.js node_modules
	$(call BROWSERIFY,$<,$@)

build: dist/demo
dist/demo: $(shell find demo server)
	go build -o $@ github.com/asadovsky/goatee/demo

build: dist/server
dist/server: $(shell find server)
	go build -o $@ github.com/asadovsky/goatee/server

########################################
# Demos

.PHONY: demo-local
demo-local: build
	open file://$(shell pwd)/demo/goatee_local.html

.PHONY: demo-ot
demo-ot: build
	dist/demo -port=4000

########################################
# Test, clean, and lint

dist/client/editor/tests/goatee.min.js: client/editor/tests/goatee.js $(shell find client) node_modules
	$(call BROWSERIFY,$<,$@)

# TODO: Use https://github.com/hughsk/smokestack.
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
