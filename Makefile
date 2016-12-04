SHELL := /bin/bash -euo pipefail
PATH := node_modules/.bin:$(PATH)
GOPATH := $(HOME)/dev/go
export GO15VENDOREXPERIMENT := 1

define BROWSERIFY
	@mkdir -p $(dir $2)
	browserify $1 -d -t [ envify purge ] -o $2
endef

.DELETE_ON_ERROR:

all: build

node_modules: package.json
	yarn install
	touch $@

.PHONY: build

build: dist/demo.min.js
dist/demo.min.js: demo/index.js $(shell find client) node_modules
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
	open file://$(shell pwd)/demo/index.html

.PHONY: demo-ot
demo-ot: build
	dist/demo -port=4000 -mode=ot | xargs -n 1 -t open

.PHONY: demo-crdt
demo-crdt: build
	dist/demo -port=4000 -mode=crdt | xargs -n 1 -t open

########################################
# Test, clean, and lint

.PHONY: test
test:
	go test github.com/asadovsky/goatee/...

.PHONY: clean
clean:
	rm -rf dist node_modules

.PHONY: lint
lint: node_modules
	go vet github.com/asadovsky/goatee/...
	jshint .
