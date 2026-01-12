package mongo

import (
	"context"
	"encoding/json"
	"sync"
)

// Cursor provides iteration over a result set.
type Cursor struct {
	mu        sync.Mutex
	documents []any
	index     int
	closed    bool
	err       error
	current   []byte
}

// newCursor creates a new cursor with the given documents.
func newCursor(docs []any) *Cursor {
	return &Cursor{
		documents: docs,
		index:     -1,
	}
}

// newEmptyCursor creates a cursor with no documents.
func newEmptyCursor() *Cursor {
	return &Cursor{
		documents: []any{},
		index:     -1,
	}
}

// newErrorCursor creates a cursor that returns an error.
func newErrorCursor(err error) *Cursor {
	return &Cursor{
		documents: []any{},
		index:     -1,
		err:       err,
	}
}

// Next advances the cursor to the next document.
// It returns true if there is another document, or false if the iteration is complete.
func (c *Cursor) Next(ctx context.Context) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check context cancellation
	select {
	case <-ctx.Done():
		c.err = ctx.Err()
		return false
	default:
	}

	if c.closed {
		c.err = ErrCursorClosed
		return false
	}

	if c.err != nil {
		return false
	}

	c.index++
	if c.index >= len(c.documents) {
		return false
	}

	// Marshal current document to bytes for Decode
	doc := c.documents[c.index]
	data, err := json.Marshal(doc)
	if err != nil {
		c.err = err
		return false
	}
	c.current = data

	return true
}

// TryNext attempts to advance without blocking.
// Returns true if advanced, false otherwise.
func (c *Cursor) TryNext(ctx context.Context) bool {
	return c.Next(ctx)
}

// Decode decodes the current document into the provided value.
func (c *Cursor) Decode(val any) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return ErrCursorClosed
	}

	if c.err != nil {
		return c.err
	}

	if c.index < 0 || c.index >= len(c.documents) {
		return ErrInvalidCursor
	}

	if c.current == nil {
		return ErrInvalidCursor
	}

	return json.Unmarshal(c.current, val)
}

// Current returns the current document as raw bytes.
func (c *Cursor) Current() []byte {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.current
}

// All decodes all remaining documents into the provided slice.
func (c *Cursor) All(ctx context.Context, results any) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check context cancellation
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	if c.closed {
		return ErrCursorClosed
	}

	if c.err != nil {
		return c.err
	}

	// Get remaining documents
	remaining := c.documents
	if c.index >= 0 {
		remaining = c.documents[c.index+1:]
	}

	// Marshal all remaining documents
	data, err := json.Marshal(remaining)
	if err != nil {
		return err
	}

	// Unmarshal into the results slice
	if err := json.Unmarshal(data, results); err != nil {
		return err
	}

	// Mark cursor as exhausted
	c.index = len(c.documents)

	return nil
}

// ID returns the cursor ID (for compatibility).
func (c *Cursor) ID() int64 {
	return 0 // Not applicable for RPC-based cursor
}

// RemainingBatchLength returns the number of documents in the current batch.
func (c *Cursor) RemainingBatchLength() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.index < 0 {
		return len(c.documents)
	}
	return len(c.documents) - c.index - 1
}

// Err returns any error that occurred during iteration.
func (c *Cursor) Err() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.err
}

// Close closes the cursor and releases resources.
func (c *Cursor) Close(ctx context.Context) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return nil
	}

	c.closed = true
	c.documents = nil
	c.current = nil

	return nil
}

// SingleResult represents the result of a single document query.
type SingleResult struct {
	err  error
	data []byte
}

// newSingleResult creates a new SingleResult from a document.
func newSingleResult(doc any) *SingleResult {
	if doc == nil {
		return &SingleResult{err: ErrNoDocuments}
	}

	data, err := json.Marshal(doc)
	if err != nil {
		return &SingleResult{err: err}
	}

	return &SingleResult{data: data}
}

// newSingleResultError creates a SingleResult with an error.
func newSingleResultError(err error) *SingleResult {
	return &SingleResult{err: err}
}

// Decode decodes the document into the provided value.
func (sr *SingleResult) Decode(val any) error {
	if sr.err != nil {
		return sr.err
	}

	if sr.data == nil {
		return ErrNoDocuments
	}

	return json.Unmarshal(sr.data, val)
}

// Raw returns the raw document bytes.
func (sr *SingleResult) Raw() ([]byte, error) {
	if sr.err != nil {
		return nil, sr.err
	}
	return sr.data, nil
}

// Err returns any error from the operation.
func (sr *SingleResult) Err() error {
	return sr.err
}
