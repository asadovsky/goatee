package ot_test

import (
	"fmt"
	"testing"
)

func fatal(t *testing.T, v ...interface{}) {
	debug.PrintStack()
	t.Fatal(v...)
}

func fatalf(t *testing.T, format string, v ...interface{}) {
	debug.PrintStack()
	t.Fatalf(format, v...)
}

func ok(t *testing.T, err error) {
	if err != nil {
		fatal(t, err)
	}
}

func eq(t *testing.T, got, want interface{}) {
	if !reflect.DeepEqual(got, want) {
		fatalf(t, "got %v, want %v", got, want)
	}
}

// Shorthand for OpFromString.
func ofs(t *testing.T, s string) Op {
	op, err := OpFromString(s)
	ok(t, err)
	return op
}

func TestInsert(t *testing.T) {
	op := Insert{Pos: 0, Value: "foo"}
	ds := op.ToString()
	eq(t, ds, "i0:foo")
	eq(t, ds, ofs(t, ds).ToString())
}

func TestDelete(t *testing.T) {
	op := Delete{Pos: 2, Len: 4}
	ds := op.ToString()
	eq(t, ds, "d2:4")
	eq(t, ds, ofs(t, ds).ToString())
}

func TestOpFromString(t *testing.T) {
	op := ofs(t, "i2:bar")
	eq(t, *op.(*Insert), Insert{Pos: 2, Value: "bar"})

	op = ofs(t, "d5:2")
	eq(t, *op.(*Delete), Delete{Pos: 5, Len: 2})
}

// Assumes OpFromString and Operator.ToString are tested.
// TODO: Share tests between Go and JS, i.e. use data-driven tests.
// TODO: Test TransformCompound.
func TestTransform(t *testing.T) {
	run := func(as, bs, aps, bps string, andReverse bool) {
		ap, bp := Transform(ofs(t, as), ofs(t, bs))
		eq(t, ap.ToString(), aps)
		eq(t, bp.ToString(), bps)

		if andReverse {
			bp, ap = Transform(ofs(t, bs), ofs(t, as))
			eq(t, ap.ToString(), aps)
			eq(t, bp.ToString(), bps)
		}
	}

	// Test insert-insert.
	run("i1:f", "i1:foo", "i4:f", "i1:foo", false)
	run("i1:foo", "i1:f", "i2:foo", "i1:f", false)
	run("i1:foo", "i1:foo", "i4:foo", "i1:foo", false)
	run("i1:foo", "i2:foo", "i1:foo", "i5:foo", true)
	run("i2:foo", "i1:foo", "i5:foo", "i1:foo", true)

	// Test insert-delete and delete-insert.
	run("i2:foo", "d0:1", "i1:foo", "d0:1", true)
	run("i2:foo", "d1:2", "i1:", "d1:5", true)
	run("i2:foo", "d2:2", "i2:foo", "d5:2", true)
	run("i2:foo", "d3:2", "i2:foo", "d6:2", true)
	run("i2:f", "d1:2", "i1:", "d1:3", true)
	run("i2:f", "d2:2", "i2:f", "d3:2", true)
	run("i2:f", "d3:2", "i2:f", "d4:2", true)
	run("i2:foo", "d1:1", "i1:foo", "d1:1", true)
	run("i2:foo", "d2:1", "i2:foo", "d5:1", true)
	run("i2:foo", "d3:1", "i2:foo", "d6:1", true)

	// Test delete-delete.
	run("d0:1", "d0:1", "d0:0", "d0:0", true)
	run("d0:1", "d0:2", "d0:0", "d0:1", true)
	// Hold b="d3:4" while shifting a forward.
	run("d0:2", "d3:4", "d0:2", "d1:4", true)
	run("d1:2", "d3:4", "d1:2", "d1:4", true)
	run("d2:2", "d3:4", "d2:1", "d2:3", true)
	run("d3:2", "d3:4", "d3:0", "d3:2", true)
	run("d4:2", "d3:4", "d3:0", "d3:2", true)
	run("d5:2", "d3:4", "d3:0", "d3:2", true)
	run("d6:2", "d3:4", "d3:1", "d3:3", true)
	run("d7:2", "d3:4", "d3:2", "d3:4", true)
	run("d8:2", "d3:4", "d4:2", "d3:4", true)
}

func textEq(t, text *Text, s string, t *testing.T) {
	if text.Value != s {
		t.Errorf("%q != %q", text.Value, s)
	}
}

func TestNewText(t *testing.T) {
	textEq(t, NewText(""), "")
	textEq(t, NewText("foo"), "foo")
}

func TestApplyToEmpty(t *testing.T) {
	text := NewText("")
	op := &Insert{Pos: 0, Value: "foo"}
	text.Apply(op)
	textEq(t, text, "foo")
}

func TestApplyTwice(t *testing.T) {
	text := NewText("")
	var op Op = &Insert{Pos: 0, Value: "foo"}
	text.Apply(op)
	text.Apply(op)
	op = &Delete{Pos: 2, Len: 1}
	text.Apply(op)
	text.Apply(op)
	textEq(t, text, "fooo")
}

func TestApplyCompound(t *testing.T) {
	text := NewText("foobar")
	ops := []Op{
		&Delete{Pos: 0, Len: 3},
		&Insert{Pos: 2, Value: "seball"},
		&Delete{Pos: 8, Len: 1},
	}
	text.ApplyCompound(ops)
	textEq(t, text, "baseball")
}
