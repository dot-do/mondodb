package mongo

import (
	"context"
	"fmt"
	"sync"
)

// Database represents a MongoDB database.
type Database struct {
	client      *Client
	name        string
	mu          sync.RWMutex
	collections map[string]*Collection
}

// Name returns the name of the database.
func (d *Database) Name() string {
	return d.name
}

// Client returns the client that created this database handle.
func (d *Database) Client() *Client {
	return d.client
}

// Collection returns a handle for the specified collection.
func (d *Database) Collection(name string) *Collection {
	d.mu.Lock()
	defer d.mu.Unlock()

	if coll, ok := d.collections[name]; ok {
		return coll
	}

	coll := &Collection{
		database: d,
		name:     name,
	}
	d.collections[name] = coll

	return coll
}

// ListCollectionNames returns the names of all collections in the database.
func (d *Database) ListCollectionNames(ctx context.Context) ([]string, error) {
	d.client.mu.RLock()
	connected := d.client.connected
	rpcClient := d.client.rpcClient
	d.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.listCollections", d.name)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	// Parse result
	if names, ok := result.([]any); ok {
		result := make([]string, len(names))
		for i, name := range names {
			if s, ok := name.(string); ok {
				result[i] = s
			}
		}
		return result, nil
	}

	return nil, fmt.Errorf("unexpected result type: %T", result)
}

// Drop drops the database.
func (d *Database) Drop(ctx context.Context) error {
	d.client.mu.RLock()
	connected := d.client.connected
	rpcClient := d.client.rpcClient
	d.client.mu.RUnlock()

	if !connected {
		return ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.dropDatabase", d.name)
	_, err := promise.Await()
	return err
}

// CreateCollection creates a new collection in the database.
func (d *Database) CreateCollection(ctx context.Context, name string) error {
	d.client.mu.RLock()
	connected := d.client.connected
	rpcClient := d.client.rpcClient
	d.client.mu.RUnlock()

	if !connected {
		return ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.createCollection", d.name, name)
	_, err := promise.Await()
	return err
}

// RunCommand runs a database command.
func (d *Database) RunCommand(ctx context.Context, command any) *SingleResult {
	d.client.mu.RLock()
	connected := d.client.connected
	rpcClient := d.client.rpcClient
	d.client.mu.RUnlock()

	if !connected {
		return newSingleResultError(ErrClientDisconnected)
	}

	// Check context
	select {
	case <-ctx.Done():
		return newSingleResultError(ctx.Err())
	default:
	}

	promise := rpcClient.Call("mongo.runCommand", d.name, command)
	result, err := promise.Await()
	if err != nil {
		return newSingleResultError(err)
	}

	return newSingleResult(result)
}

// Aggregate runs an aggregation pipeline on the database.
func (d *Database) Aggregate(ctx context.Context, pipeline any) (*Cursor, error) {
	d.client.mu.RLock()
	connected := d.client.connected
	rpcClient := d.client.rpcClient
	d.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.aggregate", d.name, "", pipeline)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	// Parse result as documents array
	docs, ok := result.([]any)
	if !ok {
		return nil, fmt.Errorf("unexpected result type: %T", result)
	}

	return newCursor(docs), nil
}

// Watch opens a change stream on the database.
func (d *Database) Watch(ctx context.Context, pipeline any) (*ChangeStream, error) {
	d.client.mu.RLock()
	connected := d.client.connected
	rpcClient := d.client.rpcClient
	d.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.watch", d.name, "", pipeline)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	// Parse stream ID from result
	streamID, ok := result.(string)
	if !ok {
		return nil, fmt.Errorf("unexpected result type: %T", result)
	}

	return newChangeStream(rpcClient, streamID), nil
}

// ChangeStream represents a change stream for watching database changes.
type ChangeStream struct {
	rpcClient RPCClient
	streamID  string
	closed    bool
	mu        sync.Mutex
	current   *ChangeEvent
	err       error
}

// ChangeEvent represents a change event from a change stream.
type ChangeEvent struct {
	ID                any    `json:"_id"`
	OperationType     string `json:"operationType"`
	FullDocument      any    `json:"fullDocument"`
	Ns                struct {
		DB   string `json:"db"`
		Coll string `json:"coll"`
	} `json:"ns"`
	DocumentKey       any `json:"documentKey"`
	UpdateDescription struct {
		UpdatedFields map[string]any `json:"updatedFields"`
		RemovedFields []string       `json:"removedFields"`
	} `json:"updateDescription"`
}

// newChangeStream creates a new change stream.
func newChangeStream(rpcClient RPCClient, streamID string) *ChangeStream {
	return &ChangeStream{
		rpcClient: rpcClient,
		streamID:  streamID,
	}
}

// Next advances to the next change event.
func (cs *ChangeStream) Next(ctx context.Context) bool {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	if cs.closed {
		cs.err = ErrCursorClosed
		return false
	}

	// Check context
	select {
	case <-ctx.Done():
		cs.err = ctx.Err()
		return false
	default:
	}

	promise := cs.rpcClient.Call("mongo.changeStreamNext", cs.streamID)
	result, err := promise.Await()
	if err != nil {
		cs.err = err
		return false
	}

	if result == nil {
		return false
	}

	// Parse result as ChangeEvent
	if event, ok := result.(map[string]any); ok {
		cs.current = &ChangeEvent{
			ID:            event["_id"],
			OperationType: event["operationType"].(string),
			FullDocument:  event["fullDocument"],
		}
		if ns, ok := event["ns"].(map[string]any); ok {
			if db, ok := ns["db"].(string); ok {
				cs.current.Ns.DB = db
			}
			if coll, ok := ns["coll"].(string); ok {
				cs.current.Ns.Coll = coll
			}
		}
		return true
	}

	return false
}

// Decode decodes the current change event.
func (cs *ChangeStream) Decode(val any) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	if cs.current == nil {
		return ErrNoDocuments
	}

	// Type assert to *ChangeEvent
	if ce, ok := val.(*ChangeEvent); ok {
		*ce = *cs.current
		return nil
	}

	return fmt.Errorf("cannot decode into %T", val)
}

// Current returns the current change event.
func (cs *ChangeStream) Current() *ChangeEvent {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	return cs.current
}

// Err returns any error from the change stream.
func (cs *ChangeStream) Err() error {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	return cs.err
}

// Close closes the change stream.
func (cs *ChangeStream) Close(ctx context.Context) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	if cs.closed {
		return nil
	}

	cs.closed = true

	// Notify server to close the stream
	promise := cs.rpcClient.Call("mongo.changeStreamClose", cs.streamID)
	_, err := promise.Await()
	return err
}
