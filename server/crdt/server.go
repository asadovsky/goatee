// Package crdt implements (for now) Logoot and (eventually) other CRDTs.
package crdt

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/asadovsky/gosh"
	"golang.org/x/net/websocket"
)

// Prototype implementation notes:
// - Server-side: single Logoot document (analog of OT server)
// - An atom is a rune (for now)
// - Start with a single node (local editing, unidirectional data flow)
//
// Possible approaches to deal with client-server asynchronicity:
// 1. Client API remains as-is, but all messages (inserts and deletes) include
//    most recently observed op id
//    - Problematic because it means we must be able to generate a Logoot
//      position identifier for a given character position interpreted relative
//      to some past state
//    - Actually, maybe it's not so bad: we just need to scan through ops with
//      local log position <= the given one
//    - Perhaps better yet, given a bound on latency between client event time
//      and server notification time, we only need to keep track of and adjust
//      for remote events that occurred within that window
// 2. Client API remains as-is, but under the hood the client library tracks
//    Logoot position identifiers for the purpose of specifying insert/delete
//    locations when talking to the server
// 3. Client speaks Logoot (e.g. using GopherJS)
//    - Note, we would need to distinguish between clients talking concurrently
//      to the same server
//
// For now, we go with approach #2.

func ok(err error) {
	if err != nil {
		panic(err)
	}
}

// Sent from server to clients.
type NewClient struct {
	Type        string
	ClientId    int
	BasePatchId int    // client's initial BasePatchId
	Text        string // client's initial text
}

// Sent from client to server.
type Update struct {
	OpStrs      []string // encoded patch
	ClientId    int      // client that performed this patch
	BasePatchId int      // PatchId against which this patch was performed
}

// Sent from server to clients.
type Broadcast struct {
	Type     string
	PatchId  int
	OpStrs   []string // encoded patch
	ClientId int      // client that performed this patch
}

func marshalOrPanic(v interface{}) string {
	b, err := json.Marshal(v)
	ok(err)
	return string(b)
}

type patch struct {
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
	patches      []patch
}

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
	basePatchId := len(h.patches) - 1
	text := NewText("")
	for _, v := range h.patches {
		text.ApplyPatch(v.ops)
	}
	h.mu.Unlock()

	ok(websocket.Message.Send(ws, marshalOrPanic(NewClient{
		Type:        "NewClient",
		ClientId:    clientId,
		BasePatchId: basePatchId,
		Text:        text.Value,
	})))

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
			patchId := len(h.patches)
			// Transform against past ops as needed.
			for i := u.BasePatchId + 1; i < len(h.patches); i++ {
				patch := h.patches[i]
				// We assume that this patch is parented off server state, i.e. its
				// BasePatchId should be past all other patches from this client.
				// Clients are responsible for buffering.
				assert(patch.clientId != u.ClientId)
				ops, _ = TransformPatch(ops, patch.ops)
			}
			opStrs := OpsToStrings(ops)
			log.Printf("%q -> %q", u.OpStrs, opStrs)
			h.patches = append(h.patches, patch{ops, u.ClientId})
			h.mu.Unlock()

			h.broadcast <- marshalOrPanic(Broadcast{
				Type:     "Broadcast",
				PatchId:  patchId,
				OpStrs:   opStrs,
				ClientId: u.ClientId,
			})
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