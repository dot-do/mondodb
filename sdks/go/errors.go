// Package mongo provides a MongoDB-compatible SDK for DotDo services.
//
// The SDK implements a MongoDB driver compatible API using go.rpc.do
// for the underlying RPC transport. It supports context.Context for
// cancellation and timeouts.
package mongo

import (
	"errors"
	"fmt"
)

// Standard errors that can be checked with errors.Is.
var (
	// ErrNoDocuments is returned when no documents match the query.
	ErrNoDocuments = errors.New("mongo: no documents in result")

	// ErrClientDisconnected is returned when operations are attempted on a disconnected client.
	ErrClientDisconnected = errors.New("mongo: client is disconnected")

	// ErrNilDocument is returned when a nil document is passed to an operation.
	ErrNilDocument = errors.New("mongo: document is nil")

	// ErrEmptyFilter is returned when an empty filter is passed where not allowed.
	ErrEmptyFilter = errors.New("mongo: filter is empty")

	// ErrInvalidCursor is returned when cursor operations fail.
	ErrInvalidCursor = errors.New("mongo: invalid cursor")

	// ErrCursorClosed is returned when operations are attempted on a closed cursor.
	ErrCursorClosed = errors.New("mongo: cursor is closed")

	// ErrInvalidURI is returned when the connection URI is invalid.
	ErrInvalidURI = errors.New("mongo: invalid connection URI")

	// ErrContextCanceled is returned when the context is canceled.
	ErrContextCanceled = errors.New("mongo: context canceled")
)

// QueryError represents an error returned from a query operation.
type QueryError struct {
	Message    string
	Code       int
	Suggestion string
}

// Error implements the error interface.
func (e *QueryError) Error() string {
	if e.Suggestion != "" {
		return fmt.Sprintf("mongo query error (code %d): %s (suggestion: %s)", e.Code, e.Message, e.Suggestion)
	}
	return fmt.Sprintf("mongo query error (code %d): %s", e.Code, e.Message)
}

// ConnectionError represents a connection-related error.
type ConnectionError struct {
	Address string
	Wrapped error
}

// Error implements the error interface.
func (e *ConnectionError) Error() string {
	if e.Wrapped != nil {
		return fmt.Sprintf("mongo connection error to %s: %v", e.Address, e.Wrapped)
	}
	return fmt.Sprintf("mongo connection error to %s", e.Address)
}

// Unwrap implements the errors unwrap interface.
func (e *ConnectionError) Unwrap() error {
	return e.Wrapped
}

// WriteError represents an error from a write operation.
type WriteError struct {
	Index   int
	Code    int
	Message string
}

// Error implements the error interface.
func (e *WriteError) Error() string {
	return fmt.Sprintf("mongo write error at index %d (code %d): %s", e.Index, e.Code, e.Message)
}

// WriteErrors is a collection of write errors.
type WriteErrors []WriteError

// Error implements the error interface.
func (e WriteErrors) Error() string {
	if len(e) == 1 {
		return e[0].Error()
	}
	return fmt.Sprintf("mongo: %d write errors occurred", len(e))
}

// BulkWriteError represents errors from a bulk write operation.
type BulkWriteError struct {
	WriteErrors WriteErrors
}

// Error implements the error interface.
func (e *BulkWriteError) Error() string {
	return e.WriteErrors.Error()
}

// CommandError represents an error from a database command.
type CommandError struct {
	Code    int
	Name    string
	Message string
}

// Error implements the error interface.
func (e *CommandError) Error() string {
	if e.Name != "" {
		return fmt.Sprintf("mongo command error (%s, code %d): %s", e.Name, e.Code, e.Message)
	}
	return fmt.Sprintf("mongo command error (code %d): %s", e.Code, e.Message)
}

// IsNetworkError returns true if the error is a network-related error.
func IsNetworkError(err error) bool {
	var connErr *ConnectionError
	return errors.As(err, &connErr)
}

// IsTimeout returns true if the error is a timeout error.
func IsTimeout(err error) bool {
	return errors.Is(err, ErrContextCanceled)
}

// IsDuplicateKeyError returns true if the error is a duplicate key error.
func IsDuplicateKeyError(err error) bool {
	var writeErr *WriteError
	if errors.As(err, &writeErr) {
		return writeErr.Code == 11000 // MongoDB duplicate key error code
	}
	var cmdErr *CommandError
	if errors.As(err, &cmdErr) {
		return cmdErr.Code == 11000
	}
	return false
}
