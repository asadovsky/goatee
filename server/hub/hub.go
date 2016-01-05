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

func jsonMarshal(v interface{}) string {
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

type stream struct {
	h           *hub
	ws          *websocket.Conn
	send        chan string
	initialized bool
	isLogoot    bool
}

func (s *stream) processInitMsg(msg *common.Init) {
	s.h.mu.Lock()
	if s.initialized {
		panic("already initialized")
	}
	s.initialized = true
	s.isLogoot = msg.DataType == "crdt.Logoot"
	if !s.isLogoot {
		assert(msg.DataType == "ot.Text")
	}
	sn := &common.Snapshot{
		Type:     "Snapshot",
		ClientId: s.h.nextClientId,
	}
	if s.isLogoot {
		s.h.logoot.PopulateSnapshot(sn)
	} else {
		s.h.text.PopulateSnapshot(sn)
	}
	ok(websocket.Message.Send(s.ws, jsonMarshal(sn)))
	s.h.nextClientId++
	s.h.subscribe <- s.send
	s.h.mu.Unlock()
}

func (s *stream) processUpdateMsg(msg *common.Update) {
	s.h.mu.Lock()
	if !s.initialized {
		panic("not initialized")
	}
	ch := &common.Change{
		Type:     "Change",
		ClientId: msg.ClientId,
	}
	if s.isLogoot {
		ok(s.h.logoot.ApplyUpdate(msg, ch))
	} else {
		ok(s.h.text.ApplyUpdate(msg, ch))
	}
	s.h.mu.Unlock()
	s.h.broadcast <- jsonMarshal(ch)
}

func (h *hub) handleConn(ws *websocket.Conn) {
	s := &stream{h: h, ws: ws, send: make(chan string)}
	eof, done := make(chan bool), make(chan bool)

	go func() {
		for {
			var buf []byte
			if err := websocket.Message.Receive(ws, &buf); err != nil {
				if err == io.EOF {
					eof <- true
					return
				}
				ok(err)
			}
			var mt common.MsgType
			ok(json.Unmarshal(buf, &mt))
			switch mt.Type {
			case "Init":
				var msg common.Init
				ok(json.Unmarshal(buf, &msg))
				s.processInitMsg(&msg)
			case "Update":
				var msg common.Update
				ok(json.Unmarshal(buf, &msg))
				s.processUpdateMsg(&msg)
			default:
				panic(fmt.Errorf("unknown message type %q", mt.Type))
			}
		}
	}()

	go func() {
		for {
			select {
			case msg := <-s.send:
				ok(websocket.Message.Send(ws, msg))
			case <-eof:
				done <- true
				return
			}
		}
	}()

	log.Printf("WAIT %v", s.send)
	<-done
	log.Printf("EXIT %v", s.send)

	h.mu.Lock()
	if s.initialized {
		h.unsubscribe <- s.send
	}
	h.mu.Unlock()
	close(s.send)
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
