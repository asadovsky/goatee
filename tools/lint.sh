#!/bin/bash

set -e
set -u

cd $GOPATH

gofmt -w .

find . -name '*.js' \
  -not -path '*/jasmine-*' \
  -print0 | xargs -0 gjslint --nojsdoc --nobeep
