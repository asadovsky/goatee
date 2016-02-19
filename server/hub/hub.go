package hub

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/asadovsky/gosh"
	"github.com/gorilla/websocket"

	"github.com/asadovsky/goatee/server/common"
	"github.com/asadovsky/goatee/server/crdt"
	"github.com/asadovsky/goatee/server/ot"
)

func ok(err error, v ...interface{}) {
	if err != nil {
		panic(fmt.Sprintf("%v: %s", err, fmt.Sprint(v...)))
	}
}

func assert(b bool, v ...interface{}) {
	if !b {
		panic(fmt.Sprint(v...))
	}
}

func jsonMarshal(v interface{}) []byte {
	buf, err := json.Marshal(v)
	ok(err)
	return buf
}

type hub struct {
	clients      map[chan<- []byte]bool // set of active clients
	subscribe    chan chan<- []byte
	unsubscribe  chan chan<- []byte
	broadcast    chan []byte
	mu           sync.Mutex // protects the fields below
	nextClientId uint32
	text         *ot.Text
	logoot       *crdt.Logoot
}

func newHub() *hub {
	return &hub{
		clients:     make(map[chan<- []byte]bool),
		subscribe:   make(chan chan<- []byte),
		unsubscribe: make(chan chan<- []byte),
		broadcast:   make(chan []byte),
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
	conn        *websocket.Conn
	send        chan []byte
	initialized bool
	isLogoot    bool
}

func (s *stream) processInitMsg(msg *common.Init) error {
	s.h.mu.Lock()
	defer s.h.mu.Unlock()
	if s.initialized {
		return errors.New("already initialized")
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
	if err := s.conn.WriteJSON(sn); err != nil {
		return err
	}
	s.h.nextClientId++
	go s.streamChanges()
	s.h.subscribe <- s.send
	return nil
}

func (s *stream) processUpdateMsg(msg *common.Update) error {
	s.h.mu.Lock()
	if !s.initialized {
		s.h.mu.Unlock()
		return errors.New("not initialized")
	}
	ch := &common.Change{
		Type:     "Change",
		ClientId: msg.ClientId,
	}
	var err error
	if s.isLogoot {
		err = s.h.logoot.ApplyUpdate(msg, ch)
	} else {
		err = s.h.text.ApplyUpdate(msg, ch)
	}
	s.h.mu.Unlock()
	if err != nil {
		return err
	}
	s.h.broadcast <- jsonMarshal(ch)
	return nil
}

// streamChanges streams changes to the client until the connection is closed.
func (s *stream) streamChanges() {
	for {
		err := s.conn.WriteMessage(websocket.TextMessage, <-s.send)
		if err == websocket.ErrCloseSent {
			break
		}
		ok(err)
	}
}

func (h *hub) handleConn(w http.ResponseWriter, r *http.Request) {
	const bufSize = 1024
	conn, err := websocket.Upgrade(w, r, nil, bufSize, bufSize)
	ok(err)
	s := &stream{h: h, conn: conn, send: make(chan []byte)}
	done := make(chan struct{})

	go func() {
		for {
			_, buf, err := conn.ReadMessage()
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				close(done)
				return
			}
			ok(err)
			// TODO: Avoid decoding multiple times.
			var mt common.MsgType
			ok(json.Unmarshal(buf, &mt))
			switch mt.Type {
			case "Init":
				var msg common.Init
				ok(json.Unmarshal(buf, &msg))
				ok(s.processInitMsg(&msg))
			case "Update":
				var msg common.Update
				ok(json.Unmarshal(buf, &msg))
				ok(s.processUpdateMsg(&msg))
			default:
				panic(fmt.Errorf("unknown message type: %s", mt.Type))
			}
		}
	}()

	<-done
	h.mu.Lock()
	if s.initialized {
		h.unsubscribe <- s.send
	}
	h.mu.Unlock()
	close(s.send)
	conn.Close()
}

func Serve(addr string) error {
	h := newHub()
	go h.run()
	http.HandleFunc("/", h.handleConn)
	go func() {
		time.Sleep(100 * time.Millisecond)
		gosh.SendVars(map[string]string{"ready": ""})
	}()
	return http.ListenAndServe(addr, nil)
}
