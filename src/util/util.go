// Package util provides various utility functions.
package util

import (
	"errors"
	"fmt"
)

func MaxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func MinInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func PanicOnError(err error) {
	if err != nil {
		panic(err)
	}
}

func Assert(condition bool, v ...interface{}) {
	if !condition {
		panic(errors.New(fmt.Sprint(v...)))
	}
}
