package ot

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

type Op interface {
	ToString() string
}

// OpFromString returns an Op given an encoded op.
func OpFromString(s string) (Op, error) {
	parts := strings.SplitN(s, ",", 3)
	if len(parts) < 3 {
		return nil, fmt.Errorf("Failed to parse op %q", s)
	}
	pos, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, err
	}
	t := parts[0]
	switch t {
	case "i":
		return &Insert{Pos: pos, Value: parts[2]}, nil
	case "d":
		length, err := strconv.Atoi(parts[2])
		if err != nil {
			return nil, err
		}
		return &Delete{Pos: pos, Len: length}, nil
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

// If insert starts at or before delete start position, delete shifts forward.
// If insert starts at or after delete end position, insert shifts backward.
// Otherwise, insert falls inside delete range; delete expands to include the
// insert, and insert collapses to nothing.
func transformInsertDelete(a *Insert, b *Delete) (ap, bp Op) {
	if a.Pos <= b.Pos {
		return a, &Delete{b.Pos + len(a.Value), b.Len}
	} else if a.Pos < b.Pos+b.Len {
		return &Insert{b.Pos, ""}, &Delete{b.Pos, b.Len + len(a.Value)}
	} else { // a.Pos >= b.Pos+b.Len
		return &Insert{a.Pos - b.Len, a.Value}, b
	}
}

// Transform derives the bottom two sides of the OT diamond. In other words, it
// transforms (a, b) into (a', b'). Assumes b takes priority over a, e.g. for
// insert-insert conflicts.
func Transform(a, b Op) (ap, bp Op) {
	switch ai := a.(type) {
	case *Insert:
		switch bi := b.(type) {
		case *Insert:
			// When positions are equal, a' shifts forward.
			if bi.Pos <= ai.Pos {
				return &Insert{ai.Pos + len(bi.Value), ai.Value}, b
			} else {
				return a, &Insert{bi.Pos + len(ai.Value), bi.Value}
			}
		case *Delete:
			return transformInsertDelete(ai, bi)
		}
	case *Delete:
		switch bi := b.(type) {
		case *Insert:
			ins, del := transformInsertDelete(bi, ai)
			return del, ins
		case *Delete:
			aEnd, bEnd := ai.Pos+ai.Len, bi.Pos+bi.Len
			if aEnd <= bi.Pos {
				return a, &Delete{bi.Pos - ai.Len, bi.Len}
			} else if bEnd <= ai.Pos {
				return &Delete{ai.Pos - bi.Len, ai.Len}, b
			}
			// Deletions overlap.
			pos := minInt(ai.Pos, bi.Pos)
			overlap := maxInt(0, minInt(aEnd, bEnd)-maxInt(ai.Pos, bi.Pos))
			assert(overlap > 0)
			return &Delete{pos, ai.Len - overlap}, &Delete{pos, bi.Len - overlap}
		}
	}
	return nil, nil
}

func TransformPatch(a, b []Op) (ap, bp []Op) {
	aNew, bNew := make([]Op, len(a)), make([]Op, len(b))
	copy(aNew, a)
	for i, bOp := range b {
		for j, aOp := range aNew {
			aNew[j], bOp = Transform(aOp, bOp)
		}
		bNew[i] = bOp
	}
	return aNew, bNew
}

// Text represents a string that supports OT operations.
// TODO: Support cursors and rich text (using annotated ranges).
type Text struct {
	Value string
}

func NewText(s string) *Text {
	return &Text{Value: s}
}

func (t *Text) Apply(op Op) error {
	switch op := op.(type) {
	case *Insert:
		t.Value = t.Value[0:op.Pos] + op.Value + t.Value[op.Pos:]
	case *Delete:
		if op.Pos+op.Len > len(t.Value) {
			return errors.New("Delete past end")
		}
		t.Value = t.Value[0:op.Pos] + t.Value[op.Pos+op.Len:]
	default:
		return fmt.Errorf("%T", t)
	}
	return nil
}

func (t *Text) ApplyPatch(ops []Op) error {
	for _, op := range ops {
		if err := t.Apply(op); err != nil {
			return err
		}
	}
	return nil
}

////////////////////////////////////////
// Internal helpers

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
