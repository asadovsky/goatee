package main_test

import (
	"fmt"
	"testing"
)

func checkEq(a, b interface{}, t *testing.T) {
	if a != b {
		t.Error(fmt.Sprintf("%v != %v", a, b))
	}
}

// Shorthand for OpFromString.
func ofs(s string) Op {
	op, err := OpFromString(s)
	PanicOnError(err)
	return op
}

func TestInsert(t *testing.T) {
	op := Insert{Pos: 0, Value: "foo"}
	ds := op.ToString()
	checkEq(ds, "i0:foo", t)
	checkEq(ds, ofs(ds).ToString(), t)
}

func TestDelete(t *testing.T) {
	op := Delete{Pos: 2, Len: 4}
	ds := op.ToString()
	checkEq(ds, "d2:4", t)
	checkEq(ds, ofs(ds).ToString(), t)
}

func TestOpFromString(t *testing.T) {
	op := ofs("i2:bar")
	checkEq(*op.(*Insert), Insert{Pos: 2, Value: "bar"}, t)

	op = ofs("d5:2")
	checkEq(*op.(*Delete), Delete{Pos: 5, Len: 2}, t)
}

// Assumes OpFromString and Operator.ToString are tested.
// TODO: Share tests between Go and JS, i.e. use data-driven tests.
// TODO: Test TransformCompound.
func TestTransform(t *testing.T) {
	checkTransform := func(as, bs, aps, bps string, andReverse bool) {
		ap, bp := Transform(ofs(as), ofs(bs))
		checkEq(ap.ToString(), aps, t)
		checkEq(bp.ToString(), bps, t)

		if andReverse {
			bp, ap = Transform(ofs(bs), ofs(as))
			checkEq(ap.ToString(), aps, t)
			checkEq(bp.ToString(), bps, t)
		}
	}

	// Test insert-insert.
	checkTransform("i1:f", "i1:foo", "i4:f", "i1:foo", false)
	checkTransform("i1:foo", "i1:f", "i2:foo", "i1:f", false)
	checkTransform("i1:foo", "i1:foo", "i4:foo", "i1:foo", false)
	checkTransform("i1:foo", "i2:foo", "i1:foo", "i5:foo", true)
	checkTransform("i2:foo", "i1:foo", "i5:foo", "i1:foo", true)

	// Test insert-delete and delete-insert.
	checkTransform("i2:foo", "d0:1", "i1:foo", "d0:1", true)
	checkTransform("i2:foo", "d1:2", "i1:", "d1:5", true)
	checkTransform("i2:foo", "d2:2", "i2:foo", "d5:2", true)
	checkTransform("i2:foo", "d3:2", "i2:foo", "d6:2", true)
	checkTransform("i2:f", "d1:2", "i1:", "d1:3", true)
	checkTransform("i2:f", "d2:2", "i2:f", "d3:2", true)
	checkTransform("i2:f", "d3:2", "i2:f", "d4:2", true)
	checkTransform("i2:foo", "d1:1", "i1:foo", "d1:1", true)
	checkTransform("i2:foo", "d2:1", "i2:foo", "d5:1", true)
	checkTransform("i2:foo", "d3:1", "i2:foo", "d6:1", true)

	// Test delete-delete.
	checkTransform("d0:1", "d0:1", "d0:0", "d0:0", true)
	checkTransform("d0:1", "d0:2", "d0:0", "d0:1", true)
	// Hold b="d3:4" while shifting a forward.
	checkTransform("d0:2", "d3:4", "d0:2", "d1:4", true)
	checkTransform("d1:2", "d3:4", "d1:2", "d1:4", true)
	checkTransform("d2:2", "d3:4", "d2:1", "d2:3", true)
	checkTransform("d3:2", "d3:4", "d3:0", "d3:2", true)
	checkTransform("d4:2", "d3:4", "d3:0", "d3:2", true)
	checkTransform("d5:2", "d3:4", "d3:0", "d3:2", true)
	checkTransform("d6:2", "d3:4", "d3:1", "d3:3", true)
	checkTransform("d7:2", "d3:4", "d3:2", "d3:4", true)
	checkTransform("d8:2", "d3:4", "d4:2", "d3:4", true)
}

func checkTextEq(text *Text, s string, t *testing.T) {
	if text.Value != s {
		t.Error(fmt.Sprintf("%q != %q", text.Value, s))
	}
}

func TestNewText(t *testing.T) {
	checkTextEq(NewText(""), "", t)
	checkTextEq(NewText("foo"), "foo", t)
}

func TestApplyToEmpty(t *testing.T) {
	text := NewText("")
	op := &Insert{Pos: 0, Value: "foo"}
	text.Apply(op)
	checkTextEq(text, "foo", t)
}

func TestApplyTwice(t *testing.T) {
	text := NewText("")
	var op Op = &Insert{Pos: 0, Value: "foo"}
	text.Apply(op)
	text.Apply(op)
	op = &Delete{Pos: 2, Len: 1}
	text.Apply(op)
	text.Apply(op)
	checkTextEq(text, "fooo", t)
}

func TestApplyCompound(t *testing.T) {
	text := NewText("foobar")
	ops := []Op{
		&Delete{Pos: 0, Len: 3},
		&Insert{Pos: 2, Value: "seball"},
		&Delete{Pos: 8, Len: 1},
	}
	text.ApplyCompound(ops)
	checkTextEq(text, "baseball", t)
}
