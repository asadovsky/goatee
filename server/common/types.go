package common

// For detecting message type.
type MsgType struct {
	Type string
}

// Sent from client to server.
type Init struct {
	Type  string // "Init"
	DocId int
}

// Sent from server to client.
type Snapshot struct {
	Type     string // "Snapshot"
	ClientId int    // id for this client

	// Type-specific data.
	BasePatchId int    // initial BasePatchId
	Text        string // initial text
	LogootStr   string // encoded crdt.Logoot
}

// Sent from client to server.
type Update struct {
	Type     string // "Update"
	ClientId int    // client that performed this patch

	// Type-specific data.
	BasePatchId int      // PatchId against which this patch was performed
	OpStrs      []string // encoded ops
}

// Sent from server to client.
type Change struct {
	Type     string // "Change"
	ClientId int    // client that performed this patch

	// Type-specific data.
	PatchId int
	OpStrs  []string // encoded ops
}
