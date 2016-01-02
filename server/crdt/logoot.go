package crdt

import (
	"fmt"
	"strings"
)

type Op interface {
	ToString() string
}

func newParseError(s string) error {
	return fmt.Errorf("Failed to parse op %q", s)
}

// OpFromString returns an Op given an encoded op.
func OpFromString(s string) (Op, error) {
	parts := strings.SplitN(s, ",", 2)
	t := parts[0]
	switch t {
	case "i":
		parts = strings.SplitN(s, ",", 4)
		if len(parts) < 3 {
			return nil, newParseError(s)
		}
		return nil, fmt.Errorf("FIXME")
	case "d":
		parts = strings.SplitN(s, ",", 2)
		if len(parts) < 2 {
			return nil, newParseError(s)
		}
		return nil, fmt.Errorf("FIXME")
	default:
		return nil, fmt.Errorf("Unknown op type %q", t)
	}
}

func OpsFromStrings(strs []string) ([]Op, error) {
	ops := make([]Op, len(strs))
	for i, v := range strs {
		op, err := OpFromString(v)
		if err != nil {
			return nil, err
		}
		ops[i] = op
	}
	return ops, nil
}

func OpsToStrings(ops []Op) []string {
	strs := make([]string, len(ops))
	for i, v := range ops {
		strs[i] = v.ToString()
	}
	return strs
}

type Insert struct {
	Pos   int
	Value string
}

func (op *Insert) ToString() string {
	return fmt.Sprintf("i,%d,%s", op.Pos, op.Value)
}

type Delete struct {
	Pos int
	Len int
}

func (op *Delete) ToString() string {
	return fmt.Sprintf("d,%d,%d", op.Pos, op.Len)
}
