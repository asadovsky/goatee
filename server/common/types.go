package common

// For detecting incoming message type. Each struct below has Type set to the
// struct type name.
type MsgType struct {
	Type string
}

// Sent from client to server.
type Init struct {
	Type     string
	DocId    uint32
	DataType string // "ot.Text" or "crdt.Logoot"
}

// Sent from server to client.
type Snapshot struct {
	Type     string
	ClientId uint32 // id for this client

	// Type-specific data.
	BasePatchId uint32 // initial BasePatchId
	Text        string // initial text
	LogootStr   string // encoded crdt.Logoot
}

// Sent from client to server.
type Update struct {
	Type     string
	ClientId uint32 // client that created this patch

	// Type-specific data.
	BasePatchId uint32   // PatchId against which this patch was performed
	OpStrs      []string // encoded ops
}

// Sent from server to client.
type Change struct {
	Type     string
	ClientId uint32 // client that created this patch

	// Type-specific data.
	PatchId uint32
	OpStrs  []string // encoded ops
}
