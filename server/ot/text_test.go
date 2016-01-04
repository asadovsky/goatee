package ot_test

import (
	"reflect"
	"runtime/debug"
	"testing"

	"github.com/asadovsky/goatee/server/common"
	"github.com/asadovsky/goatee/server/ot"
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

func neq(t *testing.T, got, notWant interface{}) {
	if reflect.DeepEqual(got, notWant) {
		fatalf(t, "got %v", got)
	}
}

func decodeOp(t *testing.T, s string) ot.Op {
	op, err := ot.DecodeOp(s)
	ok(t, err)
	return op
}

func TestInsert(t *testing.T) {
	op := ot.Insert{Pos: 0, Value: "foo"}
	ds := op.Encode()
	eq(t, ds, "i,0,foo")
	eq(t, ds, decodeOp(t, ds).Encode())
}

func TestDelete(t *testing.T) {
	op := ot.Delete{Pos: 2, Len: 4}
	ds := op.Encode()
	eq(t, ds, "d,2,4")
	eq(t, ds, decodeOp(t, ds).Encode())
}

func TestApply(t *testing.T) {
	s := ""
	var err error
	var op ot.Op = &ot.Insert{Pos: 0, Value: "foo"}
	s, err = op.Apply(s)
	ok(t, err)
	s, err = op.Apply(s)
	ok(t, err)
	op = &ot.Delete{Pos: 2, Len: 1}
	s, err = op.Apply(s)
	ok(t, err)
	s, err = op.Apply(s)
	ok(t, err)
	eq(t, s, "fooo")
}

func TestDecodeOp(t *testing.T) {
	op := decodeOp(t, "i,2,bar")
	eq(t, *op.(*ot.Insert), ot.Insert{Pos: 2, Value: "bar"})

	op = decodeOp(t, "d,5,2")
	eq(t, *op.(*ot.Delete), ot.Delete{Pos: 5, Len: 2})
}

// Assumes DecodeOp and Op.Encode are tested.
// TODO: Share tests between Go and JS, i.e. use data-driven tests.
// TODO: Test TransformPatch.
func TestTransform(t *testing.T) {
	run := func(as, bs, aps, bps string, andReverse bool) {
		ap, bp := ot.Transform(decodeOp(t, as), decodeOp(t, bs))
		eq(t, ap.Encode(), aps)
		eq(t, bp.Encode(), bps)

		if andReverse {
			bp, ap = ot.Transform(decodeOp(t, bs), decodeOp(t, as))
			eq(t, ap.Encode(), aps)
			eq(t, bp.Encode(), bps)
		}
	}

	// Test insert-insert.
	run("i,1,f", "i,1,foo", "i,4,f", "i,1,foo", false)
	run("i,1,foo", "i,1,f", "i,2,foo", "i,1,f", false)
	run("i,1,foo", "i,1,foo", "i,4,foo", "i,1,foo", false)
	run("i,1,foo", "i,2,foo", "i,1,foo", "i,5,foo", true)
	run("i,2,foo", "i,1,foo", "i,5,foo", "i,1,foo", true)

	// Test insert-delete and delete-insert.
	run("i,2,foo", "d,0,1", "i,1,foo", "d,0,1", true)
	run("i,2,foo", "d,1,2", "i,1,", "d,1,5", true)
	run("i,2,foo", "d,2,2", "i,2,foo", "d,5,2", true)
	run("i,2,foo", "d,3,2", "i,2,foo", "d,6,2", true)
	run("i,2,f", "d,1,2", "i,1,", "d,1,3", true)
	run("i,2,f", "d,2,2", "i,2,f", "d,3,2", true)
	run("i,2,f", "d,3,2", "i,2,f", "d,4,2", true)
	run("i,2,foo", "d,1,1", "i,1,foo", "d,1,1", true)
	run("i,2,foo", "d,2,1", "i,2,foo", "d,5,1", true)
	run("i,2,foo", "d,3,1", "i,2,foo", "d,6,1", true)

	// Test delete-delete.
	run("d,0,1", "d,0,1", "d,0,0", "d,0,0", true)
	run("d,0,1", "d,0,2", "d,0,0", "d,0,1", true)
	// Hold b="d,3,4" while shifting a forward.
	run("d,0,2", "d,3,4", "d,0,2", "d,1,4", true)
	run("d,1,2", "d,3,4", "d,1,2", "d,1,4", true)
	run("d,2,2", "d,3,4", "d,2,1", "d,2,3", true)
	run("d,3,2", "d,3,4", "d,3,0", "d,3,2", true)
	run("d,4,2", "d,3,4", "d,3,0", "d,3,2", true)
	run("d,5,2", "d,3,4", "d,3,0", "d,3,2", true)
	run("d,6,2", "d,3,4", "d,3,1", "d,3,3", true)
	run("d,7,2", "d,3,4", "d,3,2", "d,3,4", true)
	run("d,8,2", "d,3,4", "d,4,2", "d,3,4", true)
}

func TestTextValue(t *testing.T) {
	eq(t, ot.NewText("").Value(), "")
	eq(t, ot.NewText("foo").Value(), "foo")
}

func TestTextGetSnapshot(t *testing.T) {
	var s common.Snapshot
	ot.NewText("").GetSnapshot(&s)
	eq(t, s, common.Snapshot{Text: "", BasePatchId: 0})
	ot.NewText("foo").GetSnapshot(&s)
	eq(t, s, common.Snapshot{Text: "foo", BasePatchId: 0})
}

func TestTextApplyUpdate(t *testing.T) {
	text := ot.NewText("foobar")
	opStrs := ot.EncodeOps([]ot.Op{
		&ot.Delete{Pos: 0, Len: 3},
		&ot.Insert{Pos: 2, Value: "seball"},
		&ot.Delete{Pos: 8, Len: 1},
	})
	c, err := text.ApplyUpdate(&common.Update{
		BasePatchId: 0,
		OpStrs:      opStrs,
	})
	ok(t, err)
	neq(t, c.PatchId, 0)
	eq(t, c.OpStrs, opStrs)
	eq(t, text.Value(), "baseball")
}
