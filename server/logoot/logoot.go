// Package logoot implements Logoot.
package logoot

// Prototype implementation notes:
// - Server-side: single Logoot document (analog of OT server)
// - An atom is a rune (for now)
// - Start with a single node (local editing, unidirectional data flow)
//
// Possible approaches to deal with client-server asynchronicity:
// 1. Client API remains as-is, but all messages (inserts and deletes) include
//    most recently observed op id
//    - Problematic because it means we must be able to generate a Logoot
//      position identifier for a given character position interpreted relative
//      to some past state
//    - Actually, maybe it's not so bad: we just need to scan through ops with
//      local log position <= the given one
//    - Perhaps better yet, given a bound on latency between client event time
//      and server notification time, we only need to keep track of and adjust
//      for remote events that occurred within that window
// 2. Client API remains as-is, but under the hood the client library tracks
//    Logoot position identifiers for the purpose of specifying insert/delete
//    locations when talking to the server
// 3. Client speaks Logoot (e.g. using GopherJS)
//    - Note, we would need to distinguish between clients talking concurrently
//      to the same server
//
// For now, we go with approach #2.
