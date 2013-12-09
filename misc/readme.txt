Go: http://golang.org/doc/install
Closure Linter: https://developers.google.com/closure/utilities/docs/linter_howto

export GOPATH=${HOME}/dev/goatee

${GOPATH}/tools/lint.sh

cd ${GOPATH}/src/main
go run main.go

go get code.google.com/p/go.net/websocket
