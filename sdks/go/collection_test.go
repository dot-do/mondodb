package mongo

import (
	"context"
	"errors"
	"testing"
)

// TestCollectionName tests getting the collection name.
func TestCollectionName(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	db := client.Database("testdb")
	coll := db.Collection("users")

	if coll.Name() != "users" {
		t.Errorf("expected users, got %s", coll.Name())
	}
}

// TestCollectionDatabase tests getting the parent database.
func TestCollectionDatabase(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	db := client.Database("testdb")
	coll := db.Collection("users")

	if coll.Database() != db {
		t.Error("expected same database instance")
	}
}

// TestCollectionInsertOne tests inserting a single document.
func TestCollectionInsertOne(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.insertOne", map[string]any{"insertedId": "abc123"}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result, err := coll.InsertOne(ctx, map[string]any{"name": "John"})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.InsertedID != "abc123" {
		t.Errorf("expected abc123, got %v", result.InsertedID)
	}
}

// TestCollectionInsertOneNilDocument tests inserting a nil document.
func TestCollectionInsertOneNilDocument(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.InsertOne(ctx, nil)

	if !errors.Is(err, ErrNilDocument) {
		t.Errorf("expected ErrNilDocument, got %v", err)
	}
}

// TestCollectionInsertOneDisconnected tests inserting when disconnected.
func TestCollectionInsertOneDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.InsertOne(ctx, map[string]any{"name": "John"})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionInsertOneContextCanceled tests with canceled context.
func TestCollectionInsertOneContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.InsertOne(ctx, map[string]any{"name": "John"})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionInsertOneNonMapResult tests with non-map result.
func TestCollectionInsertOneNonMapResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.insertOne", "simple-id", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result, err := coll.InsertOne(ctx, map[string]any{"name": "John"})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.InsertedID != "simple-id" {
		t.Errorf("expected simple-id, got %v", result.InsertedID)
	}
}

// TestCollectionInsertMany tests inserting multiple documents.
func TestCollectionInsertMany(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.insertMany", map[string]any{"insertedIds": []any{"id1", "id2"}}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	docs := []any{
		map[string]any{"name": "John"},
		map[string]any{"name": "Jane"},
	}
	result, err := coll.InsertMany(ctx, docs)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(result.InsertedIDs) != 2 {
		t.Errorf("expected 2 IDs, got %d", len(result.InsertedIDs))
	}
}

// TestCollectionInsertManyNilDocuments tests inserting nil documents.
func TestCollectionInsertManyNilDocuments(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.InsertMany(ctx, nil)

	if !errors.Is(err, ErrNilDocument) {
		t.Errorf("expected ErrNilDocument, got %v", err)
	}
}

// TestCollectionInsertManyEmptyDocuments tests inserting empty documents.
func TestCollectionInsertManyEmptyDocuments(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.InsertMany(ctx, []any{})

	if !errors.Is(err, ErrNilDocument) {
		t.Errorf("expected ErrNilDocument, got %v", err)
	}
}

// TestCollectionInsertManyDisconnected tests inserting when disconnected.
func TestCollectionInsertManyDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.InsertMany(ctx, []any{map[string]any{"name": "John"}})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionInsertManyContextCanceled tests with canceled context.
func TestCollectionInsertManyContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.InsertMany(ctx, []any{map[string]any{"name": "John"}})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionInsertManyNonMapResult tests with non-map result.
func TestCollectionInsertManyNonMapResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.insertMany", "unexpected", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result, err := coll.InsertMany(ctx, []any{map[string]any{"name": "John"}})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.InsertedIDs != nil {
		t.Errorf("expected nil InsertedIDs, got %v", result.InsertedIDs)
	}
}

// TestCollectionFindOne tests finding a single document.
func TestCollectionFindOne(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOne", map[string]any{"_id": "abc123", "name": "John"}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOne(ctx, map[string]any{"_id": "abc123"})

	var doc map[string]any
	err := result.Decode(&doc)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if doc["name"] != "John" {
		t.Errorf("expected John, got %v", doc["name"])
	}
}

// TestCollectionFindOneNoDocuments tests finding when no documents match.
func TestCollectionFindOneNoDocuments(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOne", nil, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOne(ctx, map[string]any{"_id": "nonexistent"})

	err := result.Err()
	if !errors.Is(err, ErrNoDocuments) {
		t.Errorf("expected ErrNoDocuments, got %v", err)
	}
}

// TestCollectionFindOneDisconnected tests finding when disconnected.
func TestCollectionFindOneDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOne(ctx, map[string]any{"_id": "abc123"})

	err := result.Err()
	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionFindOneContextCanceled tests with canceled context.
func TestCollectionFindOneContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOne(ctx, map[string]any{"_id": "abc123"})

	err := result.Err()
	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionFindOneError tests finding with an error.
func TestCollectionFindOneError(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOne", nil, errors.New("query failed"))

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOne(ctx, map[string]any{"_id": "abc123"})

	err := result.Err()
	if err == nil {
		t.Error("expected error")
	}
}

// TestCollectionFind tests finding multiple documents.
func TestCollectionFind(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.find", []any{
		map[string]any{"_id": "1", "name": "John"},
		map[string]any{"_id": "2", "name": "Jane"},
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	cursor, err := coll.Find(ctx, map[string]any{"status": "active"})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	var docs []map[string]any
	err = cursor.All(ctx, &docs)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(docs) != 2 {
		t.Errorf("expected 2 docs, got %d", len(docs))
	}
}

// TestCollectionFindWithOptions tests finding with options.
func TestCollectionFindWithOptions(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.find", []any{
		map[string]any{"_id": "1", "name": "John"},
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	opts := &FindOptions{}
	opts.SetSort(map[string]any{"name": 1})
	opts.SetProjection(map[string]any{"name": 1})
	opts.SetLimit(10)
	opts.SetSkip(5)

	coll := client.Database("testdb").Collection("users")
	cursor, err := coll.Find(ctx, map[string]any{}, opts)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if cursor == nil {
		t.Fatal("expected cursor, got nil")
	}
}

// TestCollectionFindDisconnected tests finding when disconnected.
func TestCollectionFindDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Find(ctx, map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionFindContextCanceled tests with canceled context.
func TestCollectionFindContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Find(ctx, map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionFindUnexpectedResult tests with unexpected result type.
func TestCollectionFindUnexpectedResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.find", "not an array", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Find(ctx, map[string]any{})

	if err == nil {
		t.Error("expected error for unexpected result type")
	}
}

// TestCollectionUpdateOne tests updating a single document.
func TestCollectionUpdateOne(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.updateOne", map[string]any{
		"matchedCount":  float64(1),
		"modifiedCount": float64(1),
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result, err := coll.UpdateOne(ctx, map[string]any{"_id": "abc123"}, map[string]any{"$set": map[string]any{"name": "Jane"}})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.MatchedCount != 1 {
		t.Errorf("expected 1 matched, got %d", result.MatchedCount)
	}

	if result.ModifiedCount != 1 {
		t.Errorf("expected 1 modified, got %d", result.ModifiedCount)
	}
}

// TestCollectionUpdateOneWithOptions tests updating with options.
func TestCollectionUpdateOneWithOptions(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.updateOne", map[string]any{
		"matchedCount":  float64(0),
		"upsertedCount": float64(1),
		"upsertedId":    "new-id",
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	opts := &UpdateOptions{}
	opts.SetUpsert(true)
	opts.SetArrayFilters([]any{map[string]any{"elem.x": 1}})

	coll := client.Database("testdb").Collection("users")
	result, err := coll.UpdateOne(ctx, map[string]any{"_id": "abc123"}, map[string]any{"$set": map[string]any{"name": "Jane"}}, opts)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.UpsertedCount != 1 {
		t.Errorf("expected 1 upserted, got %d", result.UpsertedCount)
	}

	if result.UpsertedID != "new-id" {
		t.Errorf("expected new-id, got %v", result.UpsertedID)
	}
}

// TestCollectionUpdateOneDisconnected tests updating when disconnected.
func TestCollectionUpdateOneDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.UpdateOne(ctx, map[string]any{}, map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionUpdateOneContextCanceled tests with canceled context.
func TestCollectionUpdateOneContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.UpdateOne(ctx, map[string]any{}, map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionUpdateMany tests updating multiple documents.
func TestCollectionUpdateMany(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.updateMany", map[string]any{
		"matchedCount":  float64(5),
		"modifiedCount": float64(5),
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result, err := coll.UpdateMany(ctx, map[string]any{"status": "active"}, map[string]any{"$set": map[string]any{"verified": true}})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.MatchedCount != 5 {
		t.Errorf("expected 5 matched, got %d", result.MatchedCount)
	}
}

// TestCollectionUpdateManyWithOptions tests updating many with options.
func TestCollectionUpdateManyWithOptions(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.updateMany", map[string]any{
		"matchedCount":  float64(3),
		"modifiedCount": float64(3),
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	opts := &UpdateOptions{}
	opts.SetUpsert(false)

	coll := client.Database("testdb").Collection("users")
	result, err := coll.UpdateMany(ctx, map[string]any{}, map[string]any{}, opts)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.ModifiedCount != 3 {
		t.Errorf("expected 3 modified, got %d", result.ModifiedCount)
	}
}

// TestCollectionUpdateManyDisconnected tests updating many when disconnected.
func TestCollectionUpdateManyDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.UpdateMany(ctx, map[string]any{}, map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionUpdateManyContextCanceled tests with canceled context.
func TestCollectionUpdateManyContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.UpdateMany(ctx, map[string]any{}, map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionReplaceOne tests replacing a single document.
func TestCollectionReplaceOne(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.replaceOne", map[string]any{
		"matchedCount":  float64(1),
		"modifiedCount": float64(1),
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result, err := coll.ReplaceOne(ctx, map[string]any{"_id": "abc123"}, map[string]any{"name": "Jane", "age": 30})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.MatchedCount != 1 {
		t.Errorf("expected 1 matched, got %d", result.MatchedCount)
	}
}

// TestCollectionReplaceOneWithOptions tests replacing with options.
func TestCollectionReplaceOneWithOptions(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.replaceOne", map[string]any{
		"matchedCount":  float64(0),
		"upsertedCount": float64(1),
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	opts := &UpdateOptions{}
	opts.SetUpsert(true)

	coll := client.Database("testdb").Collection("users")
	result, err := coll.ReplaceOne(ctx, map[string]any{"_id": "new"}, map[string]any{"name": "New"}, opts)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.UpsertedCount != 1 {
		t.Errorf("expected 1 upserted, got %d", result.UpsertedCount)
	}
}

// TestCollectionReplaceOneDisconnected tests replacing when disconnected.
func TestCollectionReplaceOneDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.ReplaceOne(ctx, map[string]any{}, map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionReplaceOneContextCanceled tests with canceled context.
func TestCollectionReplaceOneContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.ReplaceOne(ctx, map[string]any{}, map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionDeleteOne tests deleting a single document.
func TestCollectionDeleteOne(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.deleteOne", map[string]any{"deletedCount": float64(1)}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result, err := coll.DeleteOne(ctx, map[string]any{"_id": "abc123"})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.DeletedCount != 1 {
		t.Errorf("expected 1 deleted, got %d", result.DeletedCount)
	}
}

// TestCollectionDeleteOneDisconnected tests deleting when disconnected.
func TestCollectionDeleteOneDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.DeleteOne(ctx, map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionDeleteOneContextCanceled tests with canceled context.
func TestCollectionDeleteOneContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.DeleteOne(ctx, map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionDeleteMany tests deleting multiple documents.
func TestCollectionDeleteMany(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.deleteMany", map[string]any{"deletedCount": float64(10)}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result, err := coll.DeleteMany(ctx, map[string]any{"status": "inactive"})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.DeletedCount != 10 {
		t.Errorf("expected 10 deleted, got %d", result.DeletedCount)
	}
}

// TestCollectionDeleteManyDisconnected tests deleting many when disconnected.
func TestCollectionDeleteManyDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.DeleteMany(ctx, map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionDeleteManyContextCanceled tests with canceled context.
func TestCollectionDeleteManyContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.DeleteMany(ctx, map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionCountDocuments tests counting documents.
func TestCollectionCountDocuments(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.countDocuments", float64(42), nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	count, err := coll.CountDocuments(ctx, map[string]any{})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if count != 42 {
		t.Errorf("expected 42, got %d", count)
	}
}

// TestCollectionCountDocumentsDisconnected tests counting when disconnected.
func TestCollectionCountDocumentsDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.CountDocuments(ctx, map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionCountDocumentsContextCanceled tests with canceled context.
func TestCollectionCountDocumentsContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.CountDocuments(ctx, map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionCountDocumentsUnexpectedResult tests with unexpected result type.
func TestCollectionCountDocumentsUnexpectedResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.countDocuments", "not a number", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.CountDocuments(ctx, map[string]any{})

	if err == nil {
		t.Error("expected error for unexpected result type")
	}
}

// TestCollectionEstimatedDocumentCount tests estimated count.
func TestCollectionEstimatedDocumentCount(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.estimatedDocumentCount", float64(1000), nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	count, err := coll.EstimatedDocumentCount(ctx)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if count != 1000 {
		t.Errorf("expected 1000, got %d", count)
	}
}

// TestCollectionEstimatedDocumentCountDisconnected tests estimated count when disconnected.
func TestCollectionEstimatedDocumentCountDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.EstimatedDocumentCount(ctx)

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionEstimatedDocumentCountContextCanceled tests with canceled context.
func TestCollectionEstimatedDocumentCountContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.EstimatedDocumentCount(ctx)

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionEstimatedDocumentCountUnexpectedResult tests with unexpected result type.
func TestCollectionEstimatedDocumentCountUnexpectedResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.estimatedDocumentCount", "not a number", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.EstimatedDocumentCount(ctx)

	if err == nil {
		t.Error("expected error for unexpected result type")
	}
}

// TestCollectionDistinct tests getting distinct values.
func TestCollectionDistinct(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.distinct", []any{"value1", "value2", "value3"}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	values, err := coll.Distinct(ctx, "status", map[string]any{})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(values) != 3 {
		t.Errorf("expected 3 values, got %d", len(values))
	}
}

// TestCollectionDistinctDisconnected tests distinct when disconnected.
func TestCollectionDistinctDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Distinct(ctx, "status", map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionDistinctContextCanceled tests with canceled context.
func TestCollectionDistinctContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Distinct(ctx, "status", map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionDistinctUnexpectedResult tests with unexpected result type.
func TestCollectionDistinctUnexpectedResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.distinct", "not an array", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Distinct(ctx, "status", map[string]any{})

	if err == nil {
		t.Error("expected error for unexpected result type")
	}
}

// TestCollectionAggregate tests running an aggregation.
func TestCollectionAggregate(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.aggregate", []any{
		map[string]any{"_id": "status1", "count": float64(10)},
		map[string]any{"_id": "status2", "count": float64(20)},
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	cursor, err := coll.Aggregate(ctx, []map[string]any{
		{"$group": map[string]any{"_id": "$status", "count": map[string]any{"$sum": 1}}},
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	var results []map[string]any
	err = cursor.All(ctx, &results)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if len(results) != 2 {
		t.Errorf("expected 2 results, got %d", len(results))
	}
}

// TestCollectionAggregateDisconnected tests aggregation when disconnected.
func TestCollectionAggregateDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Aggregate(ctx, []map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionAggregateContextCanceled tests with canceled context.
func TestCollectionAggregateContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Aggregate(ctx, []map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionAggregateUnexpectedResult tests with unexpected result type.
func TestCollectionAggregateUnexpectedResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.aggregate", "not an array", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Aggregate(ctx, []map[string]any{})

	if err == nil {
		t.Error("expected error for unexpected result type")
	}
}

// TestCollectionFindOneAndUpdate tests find and update.
func TestCollectionFindOneAndUpdate(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOneAndUpdate", map[string]any{"_id": "abc123", "name": "Updated"}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndUpdate(ctx, map[string]any{"_id": "abc123"}, map[string]any{"$set": map[string]any{"name": "Updated"}})

	var doc map[string]any
	err := result.Decode(&doc)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if doc["name"] != "Updated" {
		t.Errorf("expected Updated, got %v", doc["name"])
	}
}

// TestCollectionFindOneAndUpdateWithOptions tests with options.
func TestCollectionFindOneAndUpdateWithOptions(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOneAndUpdate", map[string]any{"_id": "abc123", "name": "Updated"}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	opts := &FindOneAndUpdateOptions{}
	opts.SetUpsert(true)
	opts.SetReturnDocument("after")
	opts.SetProjection(map[string]any{"name": 1})
	opts.SetSort(map[string]any{"_id": 1})

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndUpdate(ctx, map[string]any{"_id": "abc123"}, map[string]any{"$set": map[string]any{"name": "Updated"}}, opts)

	if result.Err() != nil {
		t.Errorf("unexpected error: %v", result.Err())
	}
}

// TestCollectionFindOneAndUpdateNoDocuments tests when no document matches.
func TestCollectionFindOneAndUpdateNoDocuments(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOneAndUpdate", nil, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndUpdate(ctx, map[string]any{"_id": "nonexistent"}, map[string]any{})

	err := result.Err()
	if !errors.Is(err, ErrNoDocuments) {
		t.Errorf("expected ErrNoDocuments, got %v", err)
	}
}

// TestCollectionFindOneAndUpdateDisconnected tests when disconnected.
func TestCollectionFindOneAndUpdateDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndUpdate(ctx, map[string]any{}, map[string]any{})

	err := result.Err()
	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionFindOneAndUpdateContextCanceled tests with canceled context.
func TestCollectionFindOneAndUpdateContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndUpdate(ctx, map[string]any{}, map[string]any{})

	err := result.Err()
	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionFindOneAndUpdateError tests with an error.
func TestCollectionFindOneAndUpdateError(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOneAndUpdate", nil, errors.New("update failed"))

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndUpdate(ctx, map[string]any{}, map[string]any{})

	err := result.Err()
	if err == nil {
		t.Error("expected error")
	}
}

// TestCollectionFindOneAndDelete tests find and delete.
func TestCollectionFindOneAndDelete(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOneAndDelete", map[string]any{"_id": "abc123", "name": "John"}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndDelete(ctx, map[string]any{"_id": "abc123"})

	var doc map[string]any
	err := result.Decode(&doc)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if doc["name"] != "John" {
		t.Errorf("expected John, got %v", doc["name"])
	}
}

// TestCollectionFindOneAndDeleteNoDocuments tests when no document matches.
func TestCollectionFindOneAndDeleteNoDocuments(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOneAndDelete", nil, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndDelete(ctx, map[string]any{"_id": "nonexistent"})

	err := result.Err()
	if !errors.Is(err, ErrNoDocuments) {
		t.Errorf("expected ErrNoDocuments, got %v", err)
	}
}

// TestCollectionFindOneAndDeleteDisconnected tests when disconnected.
func TestCollectionFindOneAndDeleteDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndDelete(ctx, map[string]any{})

	err := result.Err()
	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionFindOneAndDeleteContextCanceled tests with canceled context.
func TestCollectionFindOneAndDeleteContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndDelete(ctx, map[string]any{})

	err := result.Err()
	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionFindOneAndReplace tests find and replace.
func TestCollectionFindOneAndReplace(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOneAndReplace", map[string]any{"_id": "abc123", "name": "Jane"}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndReplace(ctx, map[string]any{"_id": "abc123"}, map[string]any{"name": "Jane"})

	var doc map[string]any
	err := result.Decode(&doc)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if doc["name"] != "Jane" {
		t.Errorf("expected Jane, got %v", doc["name"])
	}
}

// TestCollectionFindOneAndReplaceNoDocuments tests when no document matches.
func TestCollectionFindOneAndReplaceNoDocuments(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.findOneAndReplace", nil, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndReplace(ctx, map[string]any{"_id": "nonexistent"}, map[string]any{})

	err := result.Err()
	if !errors.Is(err, ErrNoDocuments) {
		t.Errorf("expected ErrNoDocuments, got %v", err)
	}
}

// TestCollectionFindOneAndReplaceDisconnected tests when disconnected.
func TestCollectionFindOneAndReplaceDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndReplace(ctx, map[string]any{}, map[string]any{})

	err := result.Err()
	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionFindOneAndReplaceContextCanceled tests with canceled context.
func TestCollectionFindOneAndReplaceContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	result := coll.FindOneAndReplace(ctx, map[string]any{}, map[string]any{})

	err := result.Err()
	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionDrop tests dropping a collection.
func TestCollectionDrop(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.dropCollection", true, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	err := coll.Drop(ctx)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

// TestCollectionDropDisconnected tests dropping when disconnected.
func TestCollectionDropDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	err := coll.Drop(ctx)

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionDropContextCanceled tests with canceled context.
func TestCollectionDropContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	err := coll.Drop(ctx)

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionCreateIndex tests creating an index.
func TestCollectionCreateIndex(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.createIndex", "name_1", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	name, err := coll.CreateIndex(ctx, IndexModel{
		Keys: map[string]any{"name": 1},
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if name != "name_1" {
		t.Errorf("expected name_1, got %s", name)
	}
}

// TestCollectionCreateIndexWithOptions tests creating an index with options.
func TestCollectionCreateIndexWithOptions(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.createIndex", "email_1", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	unique := true
	sparse := true
	background := true
	indexName := "email_unique"
	expireAfter := int32(3600)

	coll := client.Database("testdb").Collection("users")
	name, err := coll.CreateIndex(ctx, IndexModel{
		Keys: map[string]any{"email": 1},
		Options: &IndexOptions{
			Unique:             &unique,
			Sparse:             &sparse,
			Background:         &background,
			Name:               &indexName,
			ExpireAfterSeconds: &expireAfter,
		},
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if name != "email_1" {
		t.Errorf("expected email_1, got %s", name)
	}
}

// TestCollectionCreateIndexDisconnected tests creating index when disconnected.
func TestCollectionCreateIndexDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.CreateIndex(ctx, IndexModel{Keys: map[string]any{"name": 1}})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionCreateIndexContextCanceled tests with canceled context.
func TestCollectionCreateIndexContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.CreateIndex(ctx, IndexModel{Keys: map[string]any{"name": 1}})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionCreateIndexNonStringResult tests with non-string result.
func TestCollectionCreateIndexNonStringResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.createIndex", 123, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	name, err := coll.CreateIndex(ctx, IndexModel{Keys: map[string]any{"name": 1}})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if name != "" {
		t.Errorf("expected empty string, got %s", name)
	}
}

// TestCollectionDropIndex tests dropping an index.
func TestCollectionDropIndex(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.dropIndex", true, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	err := coll.DropIndex(ctx, "name_1")

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

// TestCollectionDropIndexDisconnected tests dropping index when disconnected.
func TestCollectionDropIndexDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	err := coll.DropIndex(ctx, "name_1")

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionDropIndexContextCanceled tests with canceled context.
func TestCollectionDropIndexContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	err := coll.DropIndex(ctx, "name_1")

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionWatch tests watching a collection.
func TestCollectionWatch(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.watch", "stream-123", nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	stream, err := coll.Watch(ctx, []map[string]any{})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if stream == nil {
		t.Fatal("expected stream, got nil")
	}

	stream.Close(ctx)
}

// TestCollectionWatchDisconnected tests watching when disconnected.
func TestCollectionWatchDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Watch(ctx, []map[string]any{})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionWatchContextCanceled tests with canceled context.
func TestCollectionWatchContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Watch(ctx, []map[string]any{})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestCollectionWatchUnexpectedResult tests with unexpected result type.
func TestCollectionWatchUnexpectedResult(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.watch", 123, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.Watch(ctx, []map[string]any{})

	if err == nil {
		t.Error("expected error for unexpected result type")
	}
}

// TestCollectionBulkWrite tests bulk write operations.
func TestCollectionBulkWrite(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.bulkWrite", map[string]any{
		"insertedCount": float64(2),
		"matchedCount":  float64(1),
		"modifiedCount": float64(1),
		"deletedCount":  float64(1),
		"upsertedCount": float64(0),
		"upsertedIds":   map[string]any{},
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	coll := client.Database("testdb").Collection("users")
	result, err := coll.BulkWrite(ctx, []WriteModel{
		&InsertOneModel{Document: map[string]any{"name": "John"}},
		&InsertOneModel{Document: map[string]any{"name": "Jane"}},
		&UpdateOneModel{Filter: map[string]any{"_id": "1"}, Update: map[string]any{"$set": map[string]any{"name": "Updated"}}},
		&DeleteOneModel{Filter: map[string]any{"_id": "2"}},
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.InsertedCount != 2 {
		t.Errorf("expected 2 inserted, got %d", result.InsertedCount)
	}

	if result.DeletedCount != 1 {
		t.Errorf("expected 1 deleted, got %d", result.DeletedCount)
	}
}

// TestCollectionBulkWriteAllModels tests all write model types.
func TestCollectionBulkWriteAllModels(t *testing.T) {
	mock := newMockRPCClient()
	mock.addCall("mongo.bulkWrite", map[string]any{
		"insertedCount": float64(1),
		"matchedCount":  float64(3),
		"modifiedCount": float64(3),
		"deletedCount":  float64(2),
		"upsertedCount": float64(1),
		"upsertedIds":   map[string]any{"5": "new-id"},
	}, nil)

	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	upsert := true

	coll := client.Database("testdb").Collection("users")
	result, err := coll.BulkWrite(ctx, []WriteModel{
		&InsertOneModel{Document: map[string]any{"name": "John"}},
		&UpdateOneModel{Filter: map[string]any{"_id": "1"}, Update: map[string]any{}, Upsert: &upsert},
		&UpdateManyModel{Filter: map[string]any{"status": "active"}, Update: map[string]any{}, Upsert: &upsert},
		&DeleteOneModel{Filter: map[string]any{"_id": "2"}},
		&DeleteManyModel{Filter: map[string]any{"status": "inactive"}},
		&ReplaceOneModel{Filter: map[string]any{"_id": "3"}, Replacement: map[string]any{}, Upsert: &upsert},
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	if result.UpsertedCount != 1 {
		t.Errorf("expected 1 upserted, got %d", result.UpsertedCount)
	}

	if result.UpsertedIDs[5] != "new-id" {
		t.Errorf("expected new-id at index 5, got %v", result.UpsertedIDs[5])
	}
}

// TestCollectionBulkWriteDisconnected tests bulk write when disconnected.
func TestCollectionBulkWriteDisconnected(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")
	ctx := context.Background()

	client.Disconnect(ctx)

	coll := client.Database("testdb").Collection("users")
	_, err := coll.BulkWrite(ctx, []WriteModel{
		&InsertOneModel{Document: map[string]any{"name": "John"}},
	})

	if !errors.Is(err, ErrClientDisconnected) {
		t.Errorf("expected ErrClientDisconnected, got %v", err)
	}
}

// TestCollectionBulkWriteContextCanceled tests with canceled context.
func TestCollectionBulkWriteContextCanceled(t *testing.T) {
	mock := newMockRPCClient()
	client := newClientWithRPC(mock, "mongodb://localhost:27017")

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	coll := client.Database("testdb").Collection("users")
	_, err := coll.BulkWrite(ctx, []WriteModel{
		&InsertOneModel{Document: map[string]any{"name": "John"}},
	})

	if err == nil {
		t.Error("expected error for canceled context")
	}
}

// TestDeleteOptions tests delete options.
func TestDeleteOptions(t *testing.T) {
	opts := &DeleteOptions{}
	opts.SetCollation(&Collation{Locale: "en", Strength: 2})

	if opts.Collation == nil {
		t.Error("expected collation to be set")
	}

	if opts.Collation.Locale != "en" {
		t.Errorf("expected locale en, got %s", opts.Collation.Locale)
	}
}
