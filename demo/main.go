package main

import (
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"

	"github.com/asadovsky/goatee/server/ot"
	"github.com/asadovsky/gosh"
)

const httpAddr = "localhost:8080"

var (
	port    = flag.Int("port", 0, "")
	serveFn = gosh.Register("serve", ot.Serve)
)

func main() {
	gosh.MaybeRunFnAndExit()
	flag.Parse()
	sh := gosh.NewShell(gosh.Opts{})
	defer sh.Cleanup()
	cwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	addr := fmt.Sprintf("localhost:%d", *port)
	c := sh.Fn(serveFn, addr)
	c.Start()
	c.AwaitReady()
	// Note, the "open" command doesn't support query strings in file urls.
	fmt.Printf("http://%s/demo/index.html?mode=ot&addr=%s\n", httpAddr, url.QueryEscape(addr))
	http.ListenAndServe(httpAddr, http.FileServer(http.Dir(filepath.Join(cwd))))
	c.Wait()
}
