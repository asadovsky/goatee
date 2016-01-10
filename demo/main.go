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

	"github.com/asadovsky/gosh"

	"github.com/asadovsky/goatee/server/hub"
)

var (
	loopback = flag.Bool("loopback", true, "")
	port     = flag.Int("port", 4000, "")
	mode     = flag.String("mode", "ot", "")
	serveFn  = gosh.Register("serve", hub.Serve)
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
	hostname := "localhost"
	if !*loopback {
		hostname, err = ip()
		ok(err)
	}
	addr := fmt.Sprintf("%s:%d", hostname, *port)
	httpAddr := fmt.Sprintf("%s:8080", hostname)
	c := sh.Fn(serveFn, addr)
	c.AddStderrWriter(gosh.NopWriteCloser(os.Stderr))
	c.Start()
	c.AwaitReady()
	// Note, the "open" command doesn't support query strings in file urls.
	fmt.Printf("http://%s/demo/index.html?mode=%s&addr=%s\n", httpAddr, *mode, url.QueryEscape(addr))
	ok(http.ListenAndServe(httpAddr, http.FileServer(http.Dir(filepath.Join(cwd)))))
	c.Wait()
}
