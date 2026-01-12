package mongo

import (
	"errors"
	"testing"
)

// TestQueryError tests QueryError.
func TestQueryError(t *testing.T) {
	err := &QueryError{
		Message: "invalid query",
		Code:    1,
	}

	expected := "mongo query error (code 1): invalid query"
	if err.Error() != expected {
		t.Errorf("expected %q, got %q", expected, err.Error())
	}
}

// TestQueryErrorWithSuggestion tests QueryError with suggestion.
func TestQueryErrorWithSuggestion(t *testing.T) {
	err := &QueryError{
		Message:    "invalid field",
		Code:       2,
		Suggestion: "use 'name' instead of 'Name'",
	}

	expected := "mongo query error (code 2): invalid field (suggestion: use 'name' instead of 'Name')"
	if err.Error() != expected {
		t.Errorf("expected %q, got %q", expected, err.Error())
	}
}

// TestConnectionError tests ConnectionError.
func TestConnectionError(t *testing.T) {
	err := &ConnectionError{
		Address: "localhost:27017",
	}

	expected := "mongo connection error to localhost:27017"
	if err.Error() != expected {
		t.Errorf("expected %q, got %q", expected, err.Error())
	}
}

// TestConnectionErrorWithWrapped tests ConnectionError with wrapped error.
func TestConnectionErrorWithWrapped(t *testing.T) {
	wrapped := errors.New("connection refused")
	err := &ConnectionError{
		Address: "localhost:27017",
		Wrapped: wrapped,
	}

	expected := "mongo connection error to localhost:27017: connection refused"
	if err.Error() != expected {
		t.Errorf("expected %q, got %q", expected, err.Error())
	}
}

// TestConnectionErrorUnwrap tests unwrapping ConnectionError.
func TestConnectionErrorUnwrap(t *testing.T) {
	wrapped := errors.New("connection refused")
	err := &ConnectionError{
		Address: "localhost:27017",
		Wrapped: wrapped,
	}

	if !errors.Is(err, wrapped) {
		t.Error("expected errors.Is to return true for wrapped error")
	}

	unwrapped := errors.Unwrap(err)
	if unwrapped != wrapped {
		t.Errorf("expected %v, got %v", wrapped, unwrapped)
	}
}

// TestWriteError tests WriteError.
func TestWriteError(t *testing.T) {
	err := &WriteError{
		Index:   0,
		Code:    11000,
		Message: "duplicate key error",
	}

	expected := "mongo write error at index 0 (code 11000): duplicate key error"
	if err.Error() != expected {
		t.Errorf("expected %q, got %q", expected, err.Error())
	}
}

// TestWriteErrors tests WriteErrors.
func TestWriteErrors(t *testing.T) {
	errs := WriteErrors{
		{Index: 0, Code: 11000, Message: "duplicate key"},
	}

	expected := "mongo write error at index 0 (code 11000): duplicate key"
	if errs.Error() != expected {
		t.Errorf("expected %q, got %q", expected, errs.Error())
	}
}

// TestWriteErrorsMultiple tests WriteErrors with multiple errors.
func TestWriteErrorsMultiple(t *testing.T) {
	errs := WriteErrors{
		{Index: 0, Code: 11000, Message: "duplicate key"},
		{Index: 1, Code: 11000, Message: "duplicate key"},
		{Index: 2, Code: 11000, Message: "duplicate key"},
	}

	expected := "mongo: 3 write errors occurred"
	if errs.Error() != expected {
		t.Errorf("expected %q, got %q", expected, errs.Error())
	}
}

// TestBulkWriteError tests BulkWriteError.
func TestBulkWriteError(t *testing.T) {
	err := &BulkWriteError{
		WriteErrors: WriteErrors{
			{Index: 0, Code: 11000, Message: "duplicate key"},
		},
	}

	expected := "mongo write error at index 0 (code 11000): duplicate key"
	if err.Error() != expected {
		t.Errorf("expected %q, got %q", expected, err.Error())
	}
}

// TestCommandError tests CommandError.
func TestCommandError(t *testing.T) {
	err := &CommandError{
		Code:    59,
		Message: "command not found",
	}

	expected := "mongo command error (code 59): command not found"
	if err.Error() != expected {
		t.Errorf("expected %q, got %q", expected, err.Error())
	}
}

// TestCommandErrorWithName tests CommandError with name.
func TestCommandErrorWithName(t *testing.T) {
	err := &CommandError{
		Code:    59,
		Name:    "CommandNotFound",
		Message: "command not found",
	}

	expected := "mongo command error (CommandNotFound, code 59): command not found"
	if err.Error() != expected {
		t.Errorf("expected %q, got %q", expected, err.Error())
	}
}

// TestIsNetworkError tests IsNetworkError.
func TestIsNetworkError(t *testing.T) {
	connErr := &ConnectionError{Address: "localhost:27017"}
	if !IsNetworkError(connErr) {
		t.Error("expected IsNetworkError to return true for ConnectionError")
	}

	otherErr := errors.New("other error")
	if IsNetworkError(otherErr) {
		t.Error("expected IsNetworkError to return false for non-connection error")
	}
}

// TestIsTimeout tests IsTimeout.
func TestIsTimeout(t *testing.T) {
	if !IsTimeout(ErrContextCanceled) {
		t.Error("expected IsTimeout to return true for ErrContextCanceled")
	}

	otherErr := errors.New("other error")
	if IsTimeout(otherErr) {
		t.Error("expected IsTimeout to return false for non-timeout error")
	}
}

// TestIsDuplicateKeyError tests IsDuplicateKeyError.
func TestIsDuplicateKeyError(t *testing.T) {
	writeErr := &WriteError{Code: 11000, Message: "duplicate key"}
	if !IsDuplicateKeyError(writeErr) {
		t.Error("expected IsDuplicateKeyError to return true for WriteError with code 11000")
	}

	cmdErr := &CommandError{Code: 11000, Message: "duplicate key"}
	if !IsDuplicateKeyError(cmdErr) {
		t.Error("expected IsDuplicateKeyError to return true for CommandError with code 11000")
	}

	otherWriteErr := &WriteError{Code: 100, Message: "other error"}
	if IsDuplicateKeyError(otherWriteErr) {
		t.Error("expected IsDuplicateKeyError to return false for non-duplicate WriteError")
	}

	otherCmdErr := &CommandError{Code: 100, Message: "other error"}
	if IsDuplicateKeyError(otherCmdErr) {
		t.Error("expected IsDuplicateKeyError to return false for non-duplicate CommandError")
	}

	otherErr := errors.New("other error")
	if IsDuplicateKeyError(otherErr) {
		t.Error("expected IsDuplicateKeyError to return false for generic error")
	}
}

// TestStandardErrors tests standard error values.
func TestStandardErrors(t *testing.T) {
	tests := []struct {
		err      error
		expected string
	}{
		{ErrNoDocuments, "mongo: no documents in result"},
		{ErrClientDisconnected, "mongo: client is disconnected"},
		{ErrNilDocument, "mongo: document is nil"},
		{ErrEmptyFilter, "mongo: filter is empty"},
		{ErrInvalidCursor, "mongo: invalid cursor"},
		{ErrCursorClosed, "mongo: cursor is closed"},
		{ErrInvalidURI, "mongo: invalid connection URI"},
		{ErrContextCanceled, "mongo: context canceled"},
	}

	for _, tt := range tests {
		if tt.err.Error() != tt.expected {
			t.Errorf("expected %q, got %q", tt.expected, tt.err.Error())
		}
	}
}

// TestErrorsIs tests errors.Is compatibility.
func TestErrorsIs(t *testing.T) {
	if !errors.Is(ErrNoDocuments, ErrNoDocuments) {
		t.Error("expected errors.Is to return true for ErrNoDocuments")
	}

	if errors.Is(ErrNoDocuments, ErrClientDisconnected) {
		t.Error("expected errors.Is to return false for different errors")
	}
}
