package crdt

import (
	"fmt"
	"strings"
)

// Pid is a Logoot position identifier.
type Pid string

func (p *Pid) Encode() string {
	return string(*p)
}

func DecodePid(s string) *Pid {
	return Pid(s)
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
	Pid     Pid
	Value   string
	NextPid Pid
}

func (op *Insert) Encode() string {
	return fmt.Sprintf("i,%s,%s,%s", op.Pid.Encode(), op.NextPid.Encode(), op.Value)
}

// Delete represents an atom deletion. Pid is the position identifier of the
// deleted atom.
type Delete struct {
	Pid Pid
}

func (op *Delete) Encode() string {
	return fmt.Sprintf("d,%s", op.Pid.Encode())
}

func newParseError(s string) error {
	return fmt.Errorf("Failed to parse op %q", s)
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
		return &Insert{DecodePid(parts[1]), DecodePid(parts[3]), parts[2]}, nil
	case "d":
		parts = strings.SplitN(s, ",", 2)
		if len(parts) < 2 {
			return nil, newParseError(s)
		}
		return &Delete{DecodePid(parts[1])}, nil
	default:
		return nil, fmt.Errorf("Unknown op type %q", t)
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
