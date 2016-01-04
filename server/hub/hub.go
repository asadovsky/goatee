package hub

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/asadovsky/gosh"
	"golang.org/x/net/websocket"

	"github.com/asadovsky/goatee/server/common"
	"github.com/asadovsky/goatee/server/crdt"
	"github.com/asadovsky/goatee/server/ot"
)

var (
	useLogoot = flag.Bool("use-logoot", false, "")
)

func ok(err error) {
	if err != nil {
		panic(err)
	}
}

func assert(b bool, v ...interface{}) {
	if !b {
		panic(fmt.Sprint(v...))
	}
}

func jsonMarshalOrPanic(v interface{}) string {
	b, err := json.Marshal(v)
	ok(err)
	return string(b)
}

type hub struct {
	clients      map[chan<- string]bool // set of active clients
	subscribe    chan chan<- string
	unsubscribe  chan chan<- string
	broadcast    chan string
	mu           sync.Mutex // protects the fields below
	nextClientId int
	text         *ot.Text
	logoot       *crdt.Logoot
}

func newHub() *hub {
	return &hub{
		clients:     make(map[chan<- string]bool),
		subscribe:   make(chan chan<- string),
		unsubscribe: make(chan chan<- string),
		broadcast:   make(chan string),
		text:        ot.NewText(""),
		logoot:      crdt.NewLogoot(),
	}
}

func (h *hub) run() {
	for {
		select {
		case c := <-h.subscribe:
			h.clients[c] = true
		case c := <-h.unsubscribe:
			delete(h.clients, c)
		case msg := <-h.broadcast:
			for send := range h.clients {
				send <- msg
			}
		}
	}
}

func (h *hub) processInitMsg(ws *websocket.Conn, m *common.Init, send chan string) {
	h.mu.Lock()
	s := &common.Snapshot{
		Type:     "Snapshot",
		ClientId: h.nextClientId,
	}
	if *useLogoot {
		h.logoot.GetSnapshot(s)
	} else {
		h.text.GetSnapshot(s)
	}
	ok(websocket.Message.Send(ws, jsonMarshalOrPanic(s)))
	h.nextClientId++
	h.subscribe <- send
	h.mu.Unlock()
}

func (h *hub) processUpdateMsg(ws *websocket.Conn, m *common.Update) {
	var c *common.Change
	var err error
	h.mu.Lock()
	if *useLogoot {
		c, err = h.logoot.ApplyUpdate(m)
	} else {
		c, err = h.text.ApplyUpdate(m)
	}
	h.mu.Unlock()
	ok(err)
	c.Type = "Change"
	c.ClientId = m.ClientId
	h.broadcast <- jsonMarshalOrPanic(c)
}

func (h *hub) handleConn(ws *websocket.Conn) {
	initialized := false
	send := make(chan string)
	eof, done := make(chan bool), make(chan bool)

	go func() {
		for {
			var b []byte
			if err := websocket.Message.Receive(ws, &b); err != nil {
				if err == io.EOF {
					eof <- true
					return
				}
				ok(err)
			}
			var t common.MsgType
			ok(json.Unmarshal(b, &t))
			switch t.Type {
			case "Init":
				if initialized {
					panic("already initialized")
				}
				var m common.Init
				ok(json.Unmarshal(b, &m))
				h.processInitMsg(ws, &m, send)
				initialized = true
			case "Update":
				if !initialized {
					panic("not initialized")
				}
				var m common.Update
				ok(json.Unmarshal(b, &m))
				h.processUpdateMsg(ws, &m)
			default:
				panic(fmt.Errorf("unknown message type %q", t.Type))
			}
		}
	}()

	go func() {
		for {
			select {
			case msg := <-send:
				ok(websocket.Message.Send(ws, msg))
			case <-eof:
				done <- true
				return
			}
		}
	}()

	log.Printf("WAIT %v", send)
	<-done
	log.Printf("EXIT %v", send)

	if initialized {
		h.unsubscribe <- send
	}
	close(send)
	close(eof)
	close(done)
	ws.Close()
}

func Serve(addr string) error {
	h := newHub()
	go h.run()
	http.Handle("/", websocket.Handler(h.handleConn))
	go func() {
		time.Sleep(100 * time.Millisecond)
		gosh.SendReady()
	}()
	return http.ListenAndServe(addr, nil)
}
