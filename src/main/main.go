package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"io"
	"io/ioutil"
	"log"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"sync"

	"code.google.com/p/go.net/websocket"

	"ot"
	"util"
)

// Current operation encoding is "iP:str" and "dP:len", where "i" means insert,
// "d" means delete, and "P" is the position (numerical offset) at which the
// operation was performed.
// TODO: Make offset understand utf-8?

// Sent from server to clients.
type NewClient struct {
	ClientId  int
	BaseTxnId int    // client's initial BaseTxnId
	Text      string // client's initial text
}

// Sent from client to server.
type Update struct {
	OpStrs    []string // encoded compound op
	ClientId  int      // client that performed this compound op
	BaseTxnId int      // TxnId against which this compound op was performed
}

// Sent from server to clients.
type Broadcast struct {
	TxnId    int
	OpStrs   []string // encoded compound op
	ClientId int      // client that performed this compound op
}

var port = flag.Int("port", 4000, "")

var listenAddr string

func init() {
	listenAddr = fmt.Sprintf("localhost:%d", *port)
	//listenAddr = fmt.Sprintf("0.0.0.0:%d", *port)
}

func marshalOrPanic(v interface{}) string {
	b, err := json.Marshal(v)
	util.PanicOnError(err)
	return string(b)
}

type transaction struct {
	ops      []ot.Op
	clientId int
}

type hub struct {
	clients     map[chan<- string]bool // set of active clients
	subscribe   chan chan<- string
	unsubscribe chan chan<- string
	broadcast   chan string

	mu           sync.Mutex // protects the fields below
	nextClientId int
	txns         []transaction
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

func wsHandler(h *hub, ws *websocket.Conn) {
	h.mu.Lock()
	clientId := h.nextClientId
	h.nextClientId++
	baseTxnId := len(h.txns) - 1
	text := ot.NewText("")
	for _, v := range h.txns {
		text.ApplyCompound(v.ops)
	}
	h.mu.Unlock()

	nc := &NewClient{ClientId: clientId, BaseTxnId: baseTxnId, Text: text.Value}
	util.PanicOnError(websocket.Message.Send(ws, marshalOrPanic(nc)))

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
				util.PanicOnError(err)
			}
			var u Update
			util.PanicOnError(json.Unmarshal(b, &u))
			ops, err := ot.OpsFromStrings(u.OpStrs)
			util.PanicOnError(err)
			log.Printf("%+v", u)

			h.mu.Lock()
			txnId := len(h.txns)
			// If there are ops to transform against, do so.
			// TODO: Maybe avoid holding lock during transform.
			for i := u.BaseTxnId + 1; i < len(h.txns); i++ {
				txn := h.txns[i]
				// We assume that this compound op is parented off server state, i.e.
				// its BaseTxnId should be past all other transactions from this client.
				// Clients are responsible for buffering.
				util.Assert(txn.clientId != u.ClientId)
				ops, _ = ot.TransformCompound(ops, txn.ops)
			}
			opStrs := ot.OpsToStrings(ops)
			log.Printf("%q -> %q", u.OpStrs, opStrs)
			h.txns = append(h.txns, transaction{ops, u.ClientId})
			h.mu.Unlock()

			bc := Broadcast{
				TxnId:    txnId,
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
				util.PanicOnError(websocket.Message.Send(ws, msg))
			case <-eof:
				break outer
			}
		}
		done <- true
	}()

	log.Printf("wsHandler WAIT, send=%v", send)
	<-done
	log.Printf("wsHandler EXIT, send=%v", send)

	// Clean up.
	h.unsubscribe <- send
	close(send)
	close(eof)
	close(done)
	ws.Close()
}

func rootHandler(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Path[1:]
	if name == "" {
		name = "index.html"
	}

	ctype := mime.TypeByExtension(filepath.Ext(name))
	w.Header().Set("Content-Type", ctype)

	if strings.HasSuffix(name, "html") {
		tmpl := template.Must(template.ParseGlob("demo/*.html"))
		data := struct {
			Name   string
			Socket template.URL
		}{
			name,
			template.URL(fmt.Sprintf("ws://%s/ws", listenAddr)),
			//template.URL("ws://192.168.1.239:4000/ws"),
		}
		util.PanicOnError(tmpl.ExecuteTemplate(w, filepath.Base(name), data))
	} else {
		b, err := ioutil.ReadFile(name)
		util.PanicOnError(err)
		w.Write(b)
	}
}

func main() {
	flag.Parse()
	h := newHub()
	go h.run()
	http.HandleFunc("/", rootHandler)
	http.Handle("/ws", websocket.Handler(func(ws *websocket.Conn) { wsHandler(h, ws) }))
	log.Printf("Serving http://%s", listenAddr)
	if err := http.ListenAndServe(listenAddr, nil); err != nil {
		log.Fatal(err)
	}
}
