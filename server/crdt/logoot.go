package crdt

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strconv"
	"strings"

	"github.com/asadovsky/goatee/server/common"
)

func assert(b bool, v ...interface{}) {
	if !b {
		panic(fmt.Sprint(v...))
	}
}

// Prototype implementation notes:
// - Server: single Logoot document (analog of OT server)
// - An atom is a string (for now)
// - Start with a single node (local editing, unidirectional data flow)
//
// Possible approaches to deal with client-server asynchronicity:
// 1. Client API remains as-is, but all messages (inserts and deletes) include
//    most recently observed op id
//    - Problematic because it means we must be able to generate a Logoot
//      position identifier for a given character position interpreted relative
//      to past state
//    - Actually, maybe it's not so bad: we just need to scan through ops with
//      local log position <= the given one
//    - Better yet: Given a bound on latency between client event time and
//      server notification time, we only need to track and adjust for remote
//      events that occurred within that window
// 2. Client API remains as-is, but under the hood the client library tracks
//    Logoot position identifiers for the purpose of specifying insert/delete
//    locations when talking to the server
// 3. Client speaks Logoot (e.g. using GopherJS)
//    - Note, we would need to distinguish between clients talking concurrently
//      to the same server
// 4. Client-server OT
//
// For now, we go with approach #2. If unidirectional data flow proves too slow,
// we'll likely need to switch to approach #3 or #4.

type Id struct {
	Pos     uint32
	AgentId int
}

// Pid is a Logoot position identifier.
// TODO: Add logical clock value.
type Pid struct {
	Ids []Id
}

// Less returns true if p is less than other.
func (p *Pid) Less(other *Pid) bool {
	for i, v := range p.Ids {
		if i == len(other.Ids) {
			return false
		}
		vo := other.Ids[i]
		if v.Pos != vo.Pos {
			return v.Pos < vo.Pos
		} else if v.AgentId != vo.AgentId {
			return v.AgentId < vo.AgentId
		}
	}
	return len(p.Ids) < len(other.Ids)
}

// Equal returns true if p is equal to other.
func (p *Pid) Equal(other *Pid) bool {
	if len(p.Ids) != len(other.Ids) {
		return false
	}
	for i, v := range p.Ids {
		vo := other.Ids[i]
		if v.Pos != vo.Pos || v.AgentId != vo.AgentId {
			return false
		}
	}
	return true
}

func (p *Pid) Encode() string {
	idStrs := make([]string, len(p.Ids))
	for i, v := range p.Ids {
		idStrs[i] = fmt.Sprintf("%d.%d", v.Pos, v.AgentId)
	}
	return strings.Join(idStrs, ":")
}

func DecodePid(s string) (*Pid, error) {
	idStrs := strings.Split(s, ":")
	ids := make([]Id, len(idStrs))
	for i, v := range idStrs {
		parts := strings.Split(v, ".")
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid pid: %s", v)
		}
		pos, err := strconv.ParseUint(parts[0], 10, 32)
		if err != nil {
			return nil, fmt.Errorf("invalid pos: %s", v)
		}
		agentId, err := strconv.Atoi(parts[1])
		if err != nil {
			return nil, fmt.Errorf("invalid agentId: %s", v)
		}
		ids[i] = Id{Pos: uint32(pos), AgentId: agentId}
	}
	return &Pid{Ids: ids}, nil
}

// Op is an operation.
type Op interface {
	Encode() string
}

// ClientInsert represents an atom insertion from a client.
type ClientInsert struct {
	PrevPid *Pid   // nil means start of document
	NextPid *Pid   // nil means end of document
	Value   string // may contain multiple characters
}

func (op *ClientInsert) Encode() string {
	var prevPidStr, nextPidStr string
	if op.PrevPid != nil {
		prevPidStr = op.PrevPid.Encode()
	}
	if op.NextPid != nil {
		nextPidStr = op.NextPid.Encode()
	}
	return fmt.Sprintf("ci,%s,%s,%s", prevPidStr, nextPidStr, op.Value)
}

// Insert represents an atom insertion.
type Insert struct {
	Pid   *Pid
	Value string
}

func (op *Insert) Encode() string {
	return fmt.Sprintf("i,%s,%s", op.Pid.Encode(), op.Value)
}

// Delete represents an atom deletion. Pid is the position identifier of the
// deleted atom. Note, Delete cannot be defined as a [start, end] range because
// it must commute with Insert.
// TODO: To reduce client->server message size, maybe add a ClientDelete
// operation defined as a [start, end] range.
type Delete struct {
	Pid *Pid
}

func (op *Delete) Encode() string {
	return fmt.Sprintf("d,%s", op.Pid.Encode())
}

func newParseError(s string) error {
	return fmt.Errorf("failed to parse op: %s", s)
}

// DecodeOp returns an Op given an encoded op.
func DecodeOp(s string) (Op, error) {
	parts := strings.SplitN(s, ",", 2)
	t := parts[0]
	switch t {
	case "ci":
		parts = strings.SplitN(s, ",", 4)
		if len(parts) < 4 {
			return nil, newParseError(s)
		}
		var prevPid, nextPid *Pid
		var err error
		if parts[1] != "" {
			if prevPid, err = DecodePid(parts[1]); err != nil {
				return nil, newParseError(s)
			}
		}
		if parts[2] != "" {
			if nextPid, err = DecodePid(parts[2]); err != nil {
				return nil, newParseError(s)
			}
		}
		if err != nil {
			return nil, newParseError(s)
		}
		return &ClientInsert{prevPid, nextPid, parts[3]}, nil
	case "i":
		parts = strings.SplitN(s, ",", 3)
		if len(parts) < 3 {
			return nil, newParseError(s)
		}
		pid, err := DecodePid(parts[1])
		if err != nil {
			return nil, newParseError(s)
		}
		return &Insert{pid, parts[2]}, nil
	case "d":
		parts = strings.SplitN(s, ",", 2)
		if len(parts) < 2 {
			return nil, newParseError(s)
		}
		pid, err := DecodePid(parts[1])
		if err != nil {
			return nil, newParseError(s)
		}
		return &Delete{pid}, nil
	default:
		return nil, fmt.Errorf("unknown op type: %s", t)
	}
}

func EncodeOps(ops []Op) []string {
	strs := make([]string, len(ops))
	for i, v := range ops {
		strs[i] = v.Encode()
	}
	return strs
}

func DecodeOps(strs []string) ([]Op, error) {
	ops := make([]Op, len(strs))
	for i, v := range strs {
		op, err := DecodeOp(v)
		if err != nil {
			return nil, err
		}
		ops[i] = op
	}
	return ops, nil
}

// Exported (along with Pid and Id) to support Logoot.Encode.
type Atom struct {
	Pid *Pid
	// TODO: Switch to rune?
	Value string
}

// Logoot represents a string that supports Logoot operations.
type Logoot struct {
	atoms       []Atom
	value       string
	lastPatchId int
}

func NewLogoot() *Logoot {
	return &Logoot{}
}

func (l *Logoot) Value() string {
	return l.value
}

// PopulateSnapshot populates s.
func (l *Logoot) PopulateSnapshot(s *common.Snapshot) error {
	logootStr, err := l.Encode()
	if err != nil {
		return err
	}
	s.Text = l.value
	s.LogootStr = logootStr
	return nil
}

// ApplyUpdate applies u and populates c.
func (l *Logoot) ApplyUpdate(u *common.Update, c *common.Change) error {
	ops, err := DecodeOps(u.OpStrs)
	if err != nil {
		return err
	}
	appliedOps := make([]Op, 0, len(ops))
	gotClientInsert := false
	for _, op := range ops {
		switch v := op.(type) {
		case *ClientInsert:
			if gotClientInsert {
				return errors.New("cannot have multiple ClientInsert ops")
			}
			gotClientInsert = true
			// TODO: Smarter pid allocation.
			prevPid := v.PrevPid
			for j := 0; j < len(v.Value); j++ {
				x := &Insert{genPid(u.ClientId, prevPid, v.NextPid), string(v.Value[j])}
				l.applyInsertText(x)
				appliedOps = append(appliedOps, x)
				prevPid = x.Pid
			}
		case *Insert:
			l.applyInsertText(v)
			appliedOps = append(appliedOps, op)
		case *Delete:
			l.applyDeleteText(v)
			appliedOps = append(appliedOps, op)
		}
	}
	c.OpStrs = EncodeOps(appliedOps)
	return nil
}

// Encode encodes this Logoot as needed for use in the client library.
func (l *Logoot) Encode() (string, error) {
	atoms := l.atoms
	if atoms == nil {
		atoms = []Atom{}
	}
	buf, err := json.Marshal(atoms)
	if err != nil {
		return "", err
	}
	return string(buf), nil
}

func randUint32Between(prev, next uint32) uint32 {
	return prev + 1 + uint32(rand.Int63n(int64(next-prev-1)))
}

// TODO: Smarter pid allocation, e.g. LSEQ. Also, maybe do something to ensure
// that concurrent multi-atom insertions from different agents do not get
// interleaved.
func genIds(agentId int, prev, next []Id) []Id {
	if len(prev) == 0 {
		prev = []Id{{Pos: 0, AgentId: agentId}}
	}
	if len(next) == 0 {
		next = []Id{{Pos: math.MaxUint32, AgentId: agentId}}
	}
	if prev[0].Pos+1 < next[0].Pos {
		return []Id{{Pos: randUint32Between(prev[0].Pos, next[0].Pos), AgentId: agentId}}
	}
	return append([]Id{prev[0]}, genIds(agentId, prev[1:], next[1:])...)
}

func genPid(agentId int, prev, next *Pid) *Pid {
	prevIds, nextIds := []Id{}, []Id{}
	if prev != nil {
		prevIds = prev.Ids
	}
	if next != nil {
		nextIds = next.Ids
	}
	return &Pid{Ids: genIds(agentId, prevIds, nextIds)}
}

func (l *Logoot) applyInsertText(op *Insert) {
	a := l.atoms
	p := l.search(op.Pid)
	if p != len(a) && a[p].Pid.Equal(op.Pid) {
		assert(a[p].Value == op.Value)
		return
	}
	// https://github.com/golang/go/wiki/SliceTricks
	a = append(a, Atom{})
	copy(a[p+1:], a[p:])
	a[p] = Atom{Pid: op.Pid, Value: op.Value}
	l.atoms = a
	l.value = l.value[:p] + op.Value + l.value[p:]
}

func (l *Logoot) applyDeleteText(op *Delete) {
	a := l.atoms
	p := l.search(op.Pid)
	if p == len(a) || !a[p].Pid.Equal(op.Pid) {
		return
	}
	// https://github.com/golang/go/wiki/SliceTricks
	a, a[len(a)-1] = append(a[:p], a[p+1:]...), Atom{}
	l.atoms = a
	l.value = l.value[:p] + l.value[p+1:]
}

// search returns the position of the first atom with pid >= the given pid.
func (l *Logoot) search(pid *Pid) int {
	return sort.Search(len(l.atoms), func(i int) bool { return !l.atoms[i].Pid.Less(pid) })
}
