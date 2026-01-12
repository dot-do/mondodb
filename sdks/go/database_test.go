package mongo

import (
	"context"
	"errors"
	"testing"
)

// TestDatabaseName tests getting the database name.
func TestDatabaseName(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	db := client.Database("testdb")

	if db.Name() != "testdb" {
		t.Errorf("expected testdb, got %s", db.Name())
	}
}

// TestDatabaseClient tests getting the parent client.
func TestDatabaseClient(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	db := client.Database("testdb")

	if db.Client() != client {
		t.Error("expected same client instance")
	}
}

// TestDatabaseCollection tests getting a collection.
func TestDatabaseCollection(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	db := client.Database("testdb")
	coll := db.Collection("users")

	if coll.Name() != "users" {
		t.Errorf("expected users, got %s", coll.Name())
	}

	// Getting the same collection should return the same instance
	coll2 := db.Collection("users")
	if coll != coll2 {
		t.Error("expected same collection instance")
	}
}

// TestDatabaseListCollectionNames tests listing collection names.
func TestDatabaseListCollectionNames(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.listCollections", []any{"users", "products", "orders"}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	db := client.Database("testdb")
	names, err := db.ListCollectionNames(ctx)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(names) != 3 {
		t.Errorf("expected 3 names, got %d", len(names))
	}

	if names[0] != "users" {
		t.Errorf("expected users, got %s", names[0])
	}
}

// TestDatabaseListCollectionNamesDisconnected tests listing when disconnected.
func TestDatabaseListCollectionNamesDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	db := client.Database("testdb")
	_, err := db.ListCollectionNames(ctx)

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestDatabaseListCollectionNamesContextCanceled tests with canceled context.
func TestDatabaseListCollectionNamesContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	db := client.Database("testdb")
	_, err := db.ListCollectionNames(ctx)

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestDatabaseListCollectionNamesUnexpectedResult tests with unexpected result type.
func TestDatabaseListCollectionNamesUnexpectedResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.listCollections", "not an array", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	db := client.Database("testdb")
	_, err := db.ListCollectionNames(ctx)

	if err == nil {
		t.Error("expected error for unexpected result type")
	}
}

// TestDatabaseDrop tests dropping a database.
func TestDatabaseDrop(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.dropDatabase", true, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	db := client.Database("testdb")
	err := db.Drop(ctx)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

// TestDatabaseDropDisconnected tests dropping when disconnected.
func TestDatabaseDropDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	db := client.Database("testdb")
	err := db.Drop(ctx)

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestDatabaseDropContextCanceled tests with canceled context.
func TestDatabaseDropContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	db := client.Database("testdb")
	err := db.Drop(ctx)

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestDatabaseCreateCollection tests creating a collection.
func TestDatabaseCreateCollection(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.createCollection", true, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	db := client.Database("testdb")
	err := db.CreateCollection(ctx, "newcollection")

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

// TestDatabaseCreateCollectionDisconnected tests creating collection when disconnected.
func TestDatabaseCreateCollectionDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	db := client.Database("testdb")
	err := db.CreateCollection(ctx, "newcollection")

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestDatabaseCreateCollectionContextCanceled tests with canceled context.
func TestDatabaseCreateCollectionContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	db := client.Database("testdb")
	err := db.CreateCollection(ctx, "newcollection")

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestDatabaseRunCommand tests running a database command.
func TestDatabaseRunCommand(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.runCommand", map[string]any{"ok": float64(1)}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	db := client.Database("testdb")
	result := db.RunCommand(ctx, map[string]any{"ping": 1})

	var doc map[string]any
	err := result.Decode(&doc)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if doc["ok"] != float64(1) {
		t.Errorf("expected ok: 1, got %v", doc["ok"])
	}
}

// TestDatabaseRunCommandDisconnected tests running command when disconnected.
func TestDatabaseRunCommandDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	db := client.Database("testdb")
	result := db.RunCommand(ctx, map[string]any{"ping": 1})

	if !errors.Is(result.Err(), ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", result.Err())
	}
}

// TestDatabaseRunCommandContextCanceled tests with canceled context.
func TestDatabaseRunCommandContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	db := client.Database("testdb")
	result := db.RunCommand(ctx, map[string]any{"ping": 1})

	if result.Err() == nil {
		t.Error("expected error for canceled context")
	}
}

// TestDatabaseRunCommandError tests running command with error.
func TestDatabaseRunCommandError(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.runCommand", nil, errors.New("command failed"))

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	db := client.Database("testdb")
	result := db.RunCommand(ctx, map[string]any{"invalid": 1})

	if result.Err() == nil {
		t.Error("expected error")
	}
}

// TestDatabaseAggregate tests running database aggregation.
func TestDatabaseAggregate(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.aggregate", []any{
		map[string]any{"databases": float64(5)},
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	db := client.Database("admin")
	cursor, err := db.Aggregate(ctx, []map[string]any{
		{"$listLocalSessions": map[string]any{}},
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if cursor == nil {
		t.Fatal("expected cursor, got nil")
	}
}

// TestDatabaseAggregateDisconnected tests aggregation when disconnected.
func TestDatabaseAggregateDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	db := client.Database("admin")
	_, err := db.Aggregate(ctx, []map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestDatabaseAggregateContextCanceled tests with canceled context.
func TestDatabaseAggregateContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	db := client.Database("admin")
	_, err := db.Aggregate(ctx, []map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestDatabaseAggregateUnexpectedResult tests with unexpected result type.
func TestDatabaseAggregateUnexpectedResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.aggregate", "not an array", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	db := client.Database("admin")
	_, err := db.Aggregate(ctx, []map[string]any{})

	if err == nil {
		t.Error("expected error for unexpected result type")
	}
}

// TestDatabaseWatch tests watching a database.
func TestDatabaseWatch(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.watch", "stream-123", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	db := client.Database("testdb")
	stream, err := db.Watch(ctx, []map[string]any{})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if stream == nil {
		t.Fatal("expected stream, got nil")
	}

	stream.Close(ctx)
}

// TestDatabaseWatchDisconnected tests watching when disconnected.
func TestDatabaseWatchDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	db := client.Database("testdb")
	_, err := db.Watch(ctx, []map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestDatabaseWatchContextCanceled tests with canceled context.
func TestDatabaseWatchContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	db := client.Database("testdb")
	_, err := db.Watch(ctx, []map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestDatabaseWatchUnexpectedResult tests with unexpected result type.
func TestDatabaseWatchUnexpectedResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.watch", 123, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	db := client.Database("testdb")
	_, err := db.Watch(ctx, []map[string]any{})

	if err == nil {
		t.Error("expected error for unexpected result type")
	}
}

// TestChangeStreamNext tests advancing change stream.
func TestChangeStreamNext(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.changeStreamNext", map[string]any{
		"_id":           "change-1",
		"operationType": "insert",
		"fullDocument":  map[string]any{"name": "John"},
		"ns":            map[string]any{"db": "testdb", "coll": "users"},
	}, nil)
	mock.addCall("mongo.changeStreamNext", nil, nil)
	mock.addCall("mongo.changeStreamClose", true, nil)

	stream := newChangeStream(mock, "stream-123")
	ctx := context.Background()

	if !stream.Next(ctx) {
		t.Error("expected Next to return true")
	}

	current := stream.Current()
	if current == nil {
		t.Fatal("expected current event")
	}

	if current.OperationType != "insert" {
		t.Errorf("expected insert, got %s", current.OperationType)
	}

	if current.Ns.DB != "testdb" {
		t.Errorf("expected testdb, got %s", current.Ns.DB)
	}

	if current.Ns.Coll != "users" {
		t.Errorf("expected users, got %s", current.Ns.Coll)
	}

	if stream.Next(ctx) {
		t.Error("expected Next to return false")
	}

	stream.Close(ctx)
}

// TestChangeStreamNextClosed tests advancing a closed change stream.
func TestChangeStreamNextClosed(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.changeStreamClose", true, nil)

	stream := newChangeStream(mock, "stream-123")
	ctx := context.Background()

	stream.Close(ctx)

	if stream.Next(ctx) {
		t.Error("expected Next to return false on closed stream")
	}

	if !errors.Is(stream.Err(), ErrCursorClosed) {
		t.Errorf("expected ErrCursorClosed, got %v", stream.Err())
	}
}

// TestChangeStreamNextContextCanceled tests with canceled context.
func TestChangeStreamNextContextCanceled(t *testing.T) {
	mock := newMockRPCClient()

	stream := newChangeStream(mock, "stream-123")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if stream.Next(ctx) {
		t.Error("expected Next to return false with canceled context")
	}

	if stream.Err() == nil {
		t.Error("expected error for canceled context")
	}
}

// TestChangeStreamNextError tests with RPC error.
func TestChangeStreamNextError(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.changeStreamNext", nil, errors.New("stream error"))

	stream := newChangeStream(mock, "stream-123")
	ctx := context.Background()

	if stream.Next(ctx) {
		t.Error("expected Next to return false with error")
	}

	if stream.Err() == nil {
		t.Error("expected error")
	}
}

// TestChangeStreamDecode tests decoding change event.
func TestChangeStreamDecode(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.changeStreamNext", map[string]any{
		"_id":           "change-1",
		"operationType": "insert",
		"fullDocument":  map[string]any{"name": "John"},
	}, nil)

	stream := newChangeStream(mock, "stream-123")
	ctx := context.Background()

	stream.Next(ctx)

	var event ChangeEvent
	err := stream.Decode(&event)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if event.OperationType != "insert" {
		t.Errorf("expected insert, got %s", event.OperationType)
	}
}

// TestChangeStreamDecodeNoCurrent tests decoding without current event.
func TestChangeStreamDecodeNoCurrent(t *testing.T) {
	mock := newMockRPCClient()

	stream := newChangeStream(mock, "stream-123")

	var event ChangeEvent
	err := stream.Decode(&event)

	if !errors.Is(err, ErrNoDocuments) {
		t.Errorf("expected ErrNoDocuments, got %v", err)
	}
}

// TestChangeStreamDecodeInvalidType tests decoding into invalid type.
func TestChangeStreamDecodeInvalidType(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.changeStreamNext", map[string]any{
		"_id":           "change-1",
		"operationType": "insert",
	}, nil)

	stream := newChangeStream(mock, "stream-123")
	ctx := context.Background()

	stream.Next(ctx)

	var doc map[string]any
	err := stream.Decode(&doc)

	if err == nil {
		t.Error("expected error for invalid type")
	}
}

// TestChangeStreamClose tests closing change stream.
func TestChangeStreamClose(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.changeStreamClose", true, nil)

	stream := newChangeStream(mock, "stream-123")
	ctx := context.Background()

	err := stream.Close(ctx)
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// Close again should be no-op
	err = stream.Close(ctx)
	if err != nil {
		t.Errorf("unexpected error on second close: %v", err)
	}
}

// TestChangeStreamErr tests getting stream error.
func TestChangeStreamErr(t *testing.T) {
	mock := newMockRPCClient()

	stream := newChangeStream(mock, "stream-123")

	if stream.Err() != nil {
		t.Errorf("expected nil error, got %v", stream.Err())
	}
}
