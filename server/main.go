package main

import (
	"flag"
	"fmt"
	"log"

	"github.com/asadovsky/goatee/server/ot"
)

var port = flag.Int("port", 0, "")

func main() {
	flag.Parse()
	addr := fmt.Sprintf("localhost:%d", *port)
	if err := ot.Serve(addr); err != nil {
		log.Fatal(err)
	}
}
