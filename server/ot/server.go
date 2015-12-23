package ot

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/asadovsky/gosh"
	"golang.org/x/net/websocket"
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

// Current operation encoding is "iP:value" and "dP:len", where "i" means
// insert, "d" means delete, and "P" is the position (integer offset) at which
// the operation was performed.
// TODO: Make offset understand utf-8?

// Sent from server to clients.
type NewClient struct {
	ClientId  int
	BaseCopId int    // client's initial BaseCopId
	Text      string // client's initial text
}

// Sent from client to server.
type Update struct {
	OpStrs    []string // encoded compound op
	ClientId  int      // client that performed this compound op
	BaseCopId int      // CopId against which this compound op was performed
}

// Sent from server to clients.
type Broadcast struct {
	CopId    int
	OpStrs   []string // encoded compound op
	ClientId int      // client that performed this compound op
}

func marshalOrPanic(v interface{}) string {
	b, err := json.Marshal(v)
	ok(err)
	return string(b)
}

type compoundOp struct {
	ops      []Op
	clientId int
}

type hub struct {
	clients      map[chan<- string]bool // set of active clients
	subscribe    chan chan<- string
	unsubscribe  chan chan<- string
	broadcast    chan string
	mu           sync.Mutex // protects the fields below
	nextClientId int
	cops         []compoundOp
}

// TODO: Use buffer for broadcast channel?
func newHub() *hub {
	return &hub{
		clients:     make(map[chan<- string]bool),
		subscribe:   make(chan chan<- string),
		unsubscribe: make(chan chan<- string),
		broadcast:   make(chan string),
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

func handle(h *hub, ws *websocket.Conn) {
	h.mu.Lock()
	clientId := h.nextClientId
	h.nextClientId++
	baseCopId := len(h.cops) - 1
	text := NewText("")
	for _, v := range h.cops {
		text.ApplyCompound(v.ops)
	}
	h.mu.Unlock()

	nc := &NewClient{ClientId: clientId, BaseCopId: baseCopId, Text: text.Value}
	ok(websocket.Message.Send(ws, marshalOrPanic(nc)))

	send := make(chan string)
	eof, done := make(chan bool), make(chan bool)
	h.subscribe <- send

	go func() {
		for {
			var b []byte
			if err := websocket.Message.Receive(ws, &b); err != nil {
				if err == io.EOF {
					eof <- true
					break
				}
				ok(err)
			}
			var u Update
			ok(json.Unmarshal(b, &u))
			ops, err := OpsFromStrings(u.OpStrs)
			ok(err)
			log.Printf("%+v", u)

			h.mu.Lock()
			copId := len(h.cops)
			// Transform against past ops as needed.
			for i := u.BaseCopId + 1; i < len(h.cops); i++ {
				cop := h.cops[i]
				// We assume that this compound op is parented off server state, i.e.
				// its BaseCopId should be past all other compound ops from this client.
				// Clients are responsible for buffering.
				assert(cop.clientId != u.ClientId)
				ops, _ = TransformCompound(ops, cop.ops)
			}
			opStrs := OpsToStrings(ops)
			log.Printf("%q -> %q", u.OpStrs, opStrs)
			h.cops = append(h.cops, compoundOp{ops, u.ClientId})
			h.mu.Unlock()

			bc := Broadcast{
				CopId:    copId,
				OpStrs:   opStrs,
				ClientId: u.ClientId,
			}
			h.broadcast <- marshalOrPanic(bc)
		}
	}()

	go func() {
	outer:
		for {
			select {
			case msg := <-send:
				ok(websocket.Message.Send(ws, msg))
			case <-eof:
				break outer
			}
		}
		done <- true
	}()

	log.Printf("WAIT %v", send)
	<-done
	log.Printf("EXIT %v", send)

	h.unsubscribe <- send
	close(send)
	close(eof)
	close(done)
	ws.Close()
}

func Serve(addr string) error {
	h := newHub()
	go h.run()
	http.Handle("/", websocket.Handler(func(ws *websocket.Conn) {
		handle(h, ws)
	}))
	go func() {
		time.Sleep(100 * time.Millisecond)
		gosh.SendReady()
	}()
	return http.ListenAndServe(addr, nil)
}
