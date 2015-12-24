package main

import (
	"flag"
	"fmt"
	"net/url"
	"os"

	"github.com/asadovsky/goatee/server/ot"
	"github.com/asadovsky/gosh"
)

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
	fmt.Printf("file://%s/demo/index.html?mode=ot&addr=%s\n", cwd, url.QueryEscape(addr))
	c.Wait()
}
