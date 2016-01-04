package crdt

import (
	"fmt"
	"strings"

	"github.com/asadovsky/goatee/server/common"
)

// Prototype implementation notes:
// - Server: single Logoot document (analog of OT server)
// - An atom is a rune (for now)
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
// 4. Client-server OT.
//
// For now, we go with approach #2. If unidirectional data flow proves too slow,
// we'll likely need to switch to approach #3 or #4.

// Pid is a Logoot position identifier.
type Pid string

func (p *Pid) Encode() string {
	return string(*p)
}

func DecodePid(s string) *Pid {
	p := Pid(s)
	return &p
}

// Op is an operation.
type Op interface {
	Encode() string
}

// Insert represents an atom insertion. For server insertions, Pid is the
// position identifier of the inserted atom, and NextPid is not defined. For
// client insertions, Pid and NextPid are the position identifiers of the atoms
// to the left and right (respectively) of the insertion location.
type Insert struct {
	Pid     *Pid
	Value   string
	NextPid *Pid
}

func (op *Insert) Encode() string {
	return fmt.Sprintf("i,%s,%s,%s", op.Pid.Encode(), op.NextPid.Encode(), op.Value)
}

// Delete represents an atom deletion. Pid is the position identifier of the
// deleted atom.
type Delete struct {
	Pid *Pid
}

func (op *Delete) Encode() string {
	return fmt.Sprintf("d,%s", op.Pid.Encode())
}

func newParseError(s string) error {
	return fmt.Errorf("failed to parse op %q", s)
}

// DecodeOp returns an Op given an encoded op.
func DecodeOp(s string) (Op, error) {
	parts := strings.SplitN(s, ",", 2)
	t := parts[0]
	switch t {
	case "i":
		parts = strings.SplitN(s, ",", 4)
		if len(parts) < 3 {
			return nil, newParseError(s)
		}
		return &Insert{DecodePid(parts[1]), parts[3], DecodePid(parts[2])}, nil
	case "d":
		parts = strings.SplitN(s, ",", 2)
		if len(parts) < 2 {
			return nil, newParseError(s)
		}
		return &Delete{DecodePid(parts[1])}, nil
	default:
		return nil, fmt.Errorf("unknown op type %q", t)
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

// Logoot represents a string that supports Logoot operations.
// FIXME: Implement.
type Logoot struct {
	value       string
	lastPatchId int
}

func NewLogoot() *Logoot {
	return &Logoot{}
}

func (l *Logoot) Value() string {
	return l.value
}

func (l *Logoot) GetSnapshot(s *common.Snapshot) {
	s.Text = l.value
	s.LogootStr = l.Encode()
}

func (t *Logoot) ApplyUpdate(u *common.Update) (*common.Change, error) {
	return &common.Change{}, nil
}

func (l *Logoot) Encode() string {
	return ""
}
