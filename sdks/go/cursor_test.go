package mongo

import (
	"context"
	"errors"
	"testing"
)

// TestCursorNext tests advancing the cursor.
func TestCursorNext(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
		map[string]any{"_id": "2", "name": "Jane"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	// First document
	if !cursor.Next(ctx) {
		t.Error("expected Next to return true")
	}

	var doc1 map[string]any
	if err := cursor.Decode(&doc1); err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if doc1["name"] != "John" {
		t.Errorf("expected John, got %v", doc1["name"])
	}

	// Second document
	if !cursor.Next(ctx) {
		t.Error("expected Next to return true")
	}

	var doc2 map[string]any
	if err := cursor.Decode(&doc2); err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if doc2["name"] != "Jane" {
		t.Errorf("expected Jane, got %v", doc2["name"])
	}

	// No more documents
	if cursor.Next(ctx) {
		t.Error("expected Next to return false")
	}
}

// TestCursorTryNext tests TryNext method.
func TestCursorTryNext(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	if !cursor.TryNext(ctx) {
		t.Error("expected TryNext to return true")
	}

	if cursor.TryNext(ctx) {
		t.Error("expected TryNext to return false")
	}
}

// TestCursorNextClosed tests advancing a closed cursor.
func TestCursorNextClosed(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	cursor.Close(ctx)

	if cursor.Next(ctx) {
		t.Error("expected Next to return false on closed cursor")
	}

	if !errors.Is(cursor.Err(), ErrCursorClosed) {
		t.Errorf("expected ErrCursorClosed, got %v", cursor.Err())
	}
}

// TestCursorNextContextCanceled tests with canceled context.
func TestCursorNextContextCanceled(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if cursor.Next(ctx) {
		t.Error("expected Next to return false with canceled context")
	}

	if cursor.Err() == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCursorNextWithError tests cursor with pre-existing error.
func TestCursorNextWithError(t *testing.T) {
	cursor := newErrorCursor(errors.New("test error"))
	ctx := context.Background()

	if cursor.Next(ctx) {
		t.Error("expected Next to return false with error")
	}

	if cursor.Err() == nil {
		t.Error("expected error")
	}
}

// TestCursorDecode tests decoding documents.
func TestCursorDecode(t *testing.T) {
	type User struct {
		ID   string `json:"_id"`
		Name string `json:"name"`
	}

	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	cursor.Next(ctx)

	var user User
	if err := cursor.Decode(&user); err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if user.Name != "John" {
		t.Errorf("expected John, got %s", user.Name)
	}
}

// TestCursorDecodeClosed tests decoding on a closed cursor.
func TestCursorDecodeClosed(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	cursor.Next(ctx)
	cursor.Close(ctx)

	var doc map[string]any
	err := cursor.Decode(&doc)

	if !errors.Is(err, ErrCursorClosed) {
		t.Errorf("expected ErrCursorClosed, got %v", err)
	}
}

// TestCursorDecodeWithError tests decoding with pre-existing error.
func TestCursorDecodeWithError(t *testing.T) {
	cursor := newErrorCursor(errors.New("test error"))

	var doc map[string]any
	err := cursor.Decode(&doc)

	if err == nil {
		t.Error("expected error")
	}
}

// TestCursorDecodeInvalidIndex tests decoding before Next.
func TestCursorDecodeInvalidIndex(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)

	var doc map[string]any
	err := cursor.Decode(&doc)

	if !errors.Is(err, ErrInvalidCursor) {
		t.Errorf("expected ErrInvalidCursor, got %v", err)
	}
}

// TestCursorDecodeAfterExhausted tests decoding after cursor is exhausted.
func TestCursorDecodeAfterExhausted(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	cursor.Next(ctx)
	cursor.Next(ctx) // Exhaust

	var doc map[string]any
	err := cursor.Decode(&doc)

	if !errors.Is(err, ErrInvalidCursor) {
		t.Errorf("expected ErrInvalidCursor, got %v", err)
	}
}

// TestCursorCurrent tests getting current document bytes.
func TestCursorCurrent(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	cursor.Next(ctx)

	current := cursor.Current()
	if current == nil {
		t.Error("expected current to be non-nil")
	}
}

// TestCursorAll tests getting all remaining documents.
func TestCursorAll(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
		map[string]any{"_id": "2", "name": "Jane"},
		map[string]any{"_id": "3", "name": "Bob"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	var results []map[string]any
	err := cursor.All(ctx, &results)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(results) != 3 {
		t.Errorf("expected 3 results, got %d", len(results))
	}
}

// TestCursorAllPartial tests getting remaining documents after some iteration.
func TestCursorAllPartial(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
		map[string]any{"_id": "2", "name": "Jane"},
		map[string]any{"_id": "3", "name": "Bob"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	// Read first document
	cursor.Next(ctx)

	var results []map[string]any
	err := cursor.All(ctx, &results)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(results) != 2 {
		t.Errorf("expected 2 results, got %d", len(results))
	}
}

// TestCursorAllClosed tests All on a closed cursor.
func TestCursorAllClosed(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	cursor.Close(ctx)

	var results []map[string]any
	err := cursor.All(ctx, &results)

	if !errors.Is(err, ErrCursorClosed) {
		t.Errorf("expected ErrCursorClosed, got %v", err)
	}
}

// TestCursorAllContextCanceled tests with canceled context.
func TestCursorAllContextCanceled(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	var results []map[string]any
	err := cursor.All(ctx, &results)

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCursorAllWithError tests All with pre-existing error.
func TestCursorAllWithError(t *testing.T) {
	cursor := newErrorCursor(errors.New("test error"))
	ctx := context.Background()

	var results []map[string]any
	err := cursor.All(ctx, &results)

	if err == nil {
		t.Error("expected error")
	}
}

// TestCursorID tests getting cursor ID.
func TestCursorID(t *testing.T) {
	cursor := newCursor([]any{})

	if cursor.ID() != 0 {
		t.Errorf("expected ID 0, got %d", cursor.ID())
	}
}

// TestCursorRemainingBatchLength tests getting remaining batch length.
func TestCursorRemainingBatchLength(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
		map[string]any{"_id": "2", "name": "Jane"},
		map[string]any{"_id": "3", "name": "Bob"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	if cursor.RemainingBatchLength() != 3 {
		t.Errorf("expected 3, got %d", cursor.RemainingBatchLength())
	}

	cursor.Next(ctx)

	if cursor.RemainingBatchLength() != 2 {
		t.Errorf("expected 2, got %d", cursor.RemainingBatchLength())
	}
}

// TestCursorErr tests getting cursor error.
func TestCursorErr(t *testing.T) {
	cursor := newCursor([]any{})

	if cursor.Err() != nil {
		t.Errorf("expected nil error, got %v", cursor.Err())
	}
}

// TestCursorClose tests closing the cursor.
func TestCursorClose(t *testing.T) {
	docs := []any{
		map[string]any{"_id": "1", "name": "John"},
	}
	cursor := newCursor(docs)
	ctx := context.Background()

	err := cursor.Close(ctx)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// Close again should be no-op
	err = cursor.Close(ctx)
	if err != nil {
		t.Errorf("unexpected error on second close: %v", err)
	}
}

// TestEmptyCursor tests an empty cursor.
func TestEmptyCursor(t *testing.T) {
	cursor := newEmptyCursor()
	ctx := context.Background()

	if cursor.Next(ctx) {
		t.Error("expected Next to return false on empty cursor")
	}

	if cursor.RemainingBatchLength() != 0 {
		t.Errorf("expected 0, got %d", cursor.RemainingBatchLength())
	}
}

// TestSingleResult tests SingleResult.
func TestSingleResult(t *testing.T) {
	doc := map[string]any{"_id": "1", "name": "John"}
	result := newSingleResult(doc)

	var decoded map[string]any
	err := result.Decode(&decoded)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if decoded["name"] != "John" {
		t.Errorf("expected John, got %v", decoded["name"])
	}
}

// TestSingleResultNil tests SingleResult with nil document.
func TestSingleResultNil(t *testing.T) {
	result := newSingleResult(nil)

	if !errors.Is(result.Err(), ErrNoDocuments) {
		t.Errorf("expected ErrNoDocuments, got %v", result.Err())
	}

	var decoded map[string]any
	err := result.Decode(&decoded)

	if !errors.Is(err, ErrNoDocuments) {
		t.Errorf("expected ErrNoDocuments, got %v", err)
	}
}

// TestSingleResultError tests SingleResult with error.
func TestSingleResultError(t *testing.T) {
	testErr := errors.New("test error")
	result := newSingleResultError(testErr)

	if result.Err() != testErr {
		t.Errorf("expected test error, got %v", result.Err())
	}

	var decoded map[string]any
	err := result.Decode(&decoded)

	if err != testErr {
		t.Errorf("expected test error, got %v", err)
	}
}

// TestSingleResultRaw tests getting raw bytes.
func TestSingleResultRaw(t *testing.T) {
	doc := map[string]any{"_id": "1", "name": "John"}
	result := newSingleResult(doc)

	raw, err := result.Raw()

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if raw == nil {
		t.Error("expected raw bytes")
	}
}

// TestSingleResultRawError tests getting raw bytes with error.
func TestSingleResultRawError(t *testing.T) {
	testErr := errors.New("test error")
	result := newSingleResultError(testErr)

	raw, err := result.Raw()

	if err != testErr {
		t.Errorf("expected test error, got %v", err)
	}

	if raw != nil {
		t.Error("expected nil raw bytes")
	}
}

// TestSingleResultDecodeNilData tests decoding when data is nil.
func TestSingleResultDecodeNilData(t *testing.T) {
	result := &SingleResult{data: nil}

	var decoded map[string]any
	err := result.Decode(&decoded)

	if !errors.Is(err, ErrNoDocuments) {
		t.Errorf("expected ErrNoDocuments, got %v", err)
	}
}

// TestCursorDecodeNilCurrent tests decoding when current is nil.
func TestCursorDecodeNilCurrent(t *testing.T) {
	cursor := &Cursor{
		documents: []any{map[string]any{"_id": "1"}},
		index:     0,
		current:   nil,
	}

	var doc map[string]any
	err := cursor.Decode(&doc)

	if !errors.Is(err, ErrInvalidCursor) {
		t.Errorf("expected ErrInvalidCursor, got %v", err)
	}
}
