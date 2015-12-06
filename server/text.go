package main

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

type Op interface {
	ToString() string
}

// Given an encoded op like "i4:foo" or "d2:2", returns an Op.
func OpFromString(s string) (Op, error) {
	colon := strings.Index(s, ":")
	if colon == -1 {
		return nil, errors.New(fmt.Sprintf("Failed to parse operation %q", s))
	}
	pos, err := strconv.Atoi(s[1:colon])
	if err != nil {
		return nil, err
	}
	if s[0] == 'i' {
		return &Insert{Pos: pos, Value: s[colon+1:]}, nil
	} else if s[0] == 'd' {
		length, err := strconv.Atoi(s[colon+1:])
		if err != nil {
			return nil, err
		}
		return &Delete{pos, length}, nil
	}
	return nil, errors.New(fmt.Sprintf("Unknown operation %q", s[0]))
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
	return fmt.Sprintf("i%d:%v", op.Pos, op.Value)
}

type Delete struct {
	Pos int
	Len int
}

func (op *Delete) ToString() string {
	return fmt.Sprintf("d%d:%d", op.Pos, op.Len)
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

// Derives the bottom two sides of the OT diamond. I.e. transforms (a, b) into
// (a', b'), assuming b takes priority over a. Handles situations where the
// operations conflict. Note that priority matters only for i-i.
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
			pos := MinInt(ai.Pos, bi.Pos)
			overlap := MaxInt(0, MinInt(aEnd, bEnd)-MaxInt(ai.Pos, bi.Pos))
			Assert(overlap > 0)
			return &Delete{pos, ai.Len - overlap}, &Delete{pos, bi.Len - overlap}
		}
	}
	return nil, nil
}

// Same as Transform, but for compound operations.
func TransformCompound(a, b []Op) (ap, bp []Op) {
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

// Represents text against which operations can be applied.
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
		return errors.New(fmt.Sprintf("Unexpected operation type %T", t))
	}
	return nil
}

func (t *Text) ApplyCompound(ops []Op) error {
	for _, op := range ops {
		if err := t.Apply(op); err != nil {
			return err
		}
	}
	return nil
}
