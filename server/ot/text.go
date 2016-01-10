package ot

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/asadovsky/goatee/server/common"
)

func assert(b bool, v ...interface{}) {
	if !b {
		panic(fmt.Sprint(v...))
	}
}

// Op is an operation.
type Op interface {
	Encode() string
	Apply(s string) (string, error)
}

// Insert represents a text insertion.
type Insert struct {
	Pos   int
	Value string
}

func (op *Insert) Encode() string {
	return fmt.Sprintf("i,%d,%s", op.Pos, op.Value)
}

func (op *Insert) Apply(s string) (string, error) {
	if op.Pos < 0 || op.Pos > len(s) {
		return "", errors.New("insert out of bounds")
	}
	return s[:op.Pos] + op.Value + s[op.Pos:], nil
}

// Delete represents a text deletion.
type Delete struct {
	Pos int
	Len int
}

func (op *Delete) Encode() string {
	return fmt.Sprintf("d,%d,%d", op.Pos, op.Len)
}

func (op *Delete) Apply(s string) (string, error) {
	if op.Pos < 0 || op.Pos+op.Len > len(s) {
		return "", errors.New("delete out of bounds")
	}
	return s[:op.Pos] + s[op.Pos+op.Len:], nil
}

// DecodeOp returns an Op given an encoded op.
func DecodeOp(s string) (Op, error) {
	parts := strings.SplitN(s, ",", 3)
	if len(parts) < 3 {
		return nil, fmt.Errorf("failed to parse op: %s", s)
	}
	pos, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, err
	}
	t := parts[0]
	switch t {
	case "i":
		return &Insert{pos, parts[2]}, nil
	case "d":
		length, err := strconv.Atoi(parts[2])
		if err != nil {
			return nil, err
		}
		return &Delete{pos, length}, nil
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

// transformInsertDelete derives the bottom two sides of the OT diamond, where
// the top two sides are an insert and a delete.
func transformInsertDelete(a *Insert, b *Delete) (ap, bp Op) {
	if a.Pos <= b.Pos {
		// Insert before delete. Delete shifts forward.
		return a, &Delete{b.Pos + len(a.Value), b.Len}
	} else if a.Pos >= b.Pos+b.Len {
		// Insert after delete. Insert shifts backward.
		return &Insert{a.Pos - b.Len, a.Value}, b
	} else {
		// Insert inside the delete range. Delete expands to include the insert,
		// and insert collapses to nothing.
		return &Insert{b.Pos, ""}, &Delete{b.Pos, b.Len + len(a.Value)}
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
			// When insert positions are equal, a' shifts forward.
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

type patch struct {
	clientId int
	ops      []Op
}

// Text represents a string that supports OT operations.
// TODO: Support cursors and rich text (using annotated ranges).
type Text struct {
	patches     []patch
	value       string
	lastPatchId int
}

func NewText(s string) *Text {
	return &Text{value: s}
}

func (t *Text) Value() string {
	return t.value
}

// PopulateSnapshot populates s.
func (t *Text) PopulateSnapshot(s *common.Snapshot) error {
	s.BasePatchId = t.lastPatchId
	s.Text = t.value
	return nil
}

// ApplyUpdate applies u and populates c.
func (t *Text) ApplyUpdate(u *common.Update, c *common.Change) error {
	ops, err := DecodeOps(u.OpStrs)
	if err != nil {
		return err
	}
	// Transform against past ops as needed.
	for i := u.BasePatchId + 1; i < len(t.patches); i++ {
		p := t.patches[i]
		if u.ClientId == p.clientId {
			// Note: Clients are responsible for buffering.
			return errors.New("patch is not parented off server state")
		}
		ops, _ = TransformPatch(ops, p.ops)
	}
	value := t.value
	for _, op := range ops {
		var err error
		if value, err = op.Apply(value); err != nil {
			return err
		}
	}
	t.patches = append(t.patches, patch{u.ClientId, ops})
	t.value = value
	t.lastPatchId++
	c.PatchId = t.lastPatchId
	c.OpStrs = EncodeOps(ops)
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
