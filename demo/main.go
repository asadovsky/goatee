package main

import (
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"

	"github.com/asadovsky/goatee/server/ot"
	"github.com/asadovsky/gosh"
)

var (
	port    = flag.Int("port", 4000, "")
	serveFn = gosh.Register("serve", ot.Serve)
)

func ok(err error) {
	if err != nil {
		panic(err)
	}
}

func ip() (string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", err
	}
	for _, a := range addrs {
		if x, ok := a.(*net.IPNet); ok && !x.IP.IsLoopback() && x.IP.To4() != nil {
			return x.IP.String(), nil
		}
	}
	return "", errors.New("not found")
}

func main() {
	gosh.MaybeRunFnAndExit()
	flag.Parse()
	sh := gosh.NewShell(gosh.Opts{})
	defer sh.Cleanup()
	cwd, err := os.Getwd()
	ok(err)
	hostname, err := ip()
	ok(err)
	addr := fmt.Sprintf("%s:%d", hostname, *port)
	httpAddr := fmt.Sprintf("%s:8080", hostname)
	c := sh.Fn(serveFn, addr)
	c.Start()
	c.AwaitReady()
	// Note, the "open" command doesn't support query strings in file urls.
	fmt.Printf("http://%s/demo/index.html?mode=ot&addr=%s\n", httpAddr, url.QueryEscape(addr))
	ok(http.ListenAndServe(httpAddr, http.FileServer(http.Dir(filepath.Join(cwd)))))
	c.Wait()
}
