package mongo

import (
	"context"
	"fmt"
)

// Collection represents a MongoDB collection.
type Collection struct {
	database *Database
	name     string
}

// Name returns the name of the collection.
func (c *Collection) Name() string {
	return c.name
}

// Database returns the database that contains this collection.
func (c *Collection) Database() *Database {
	return c.database
}

// InsertOneResult represents the result of an InsertOne operation.
type InsertOneResult struct {
	InsertedID any
}

// InsertManyResult represents the result of an InsertMany operation.
type InsertManyResult struct {
	InsertedIDs []any
}

// UpdateResult represents the result of an Update operation.
type UpdateResult struct {
	MatchedCount  int64
	ModifiedCount int64
	UpsertedCount int64
	UpsertedID    any
}

// DeleteResult represents the result of a Delete operation.
type DeleteResult struct {
	DeletedCount int64
}

// CountResult represents the result of a Count operation.
type CountResult struct {
	Count int64
}

// BulkWriteResult represents the result of a BulkWrite operation.
type BulkWriteResult struct {
	InsertedCount int64
	MatchedCount  int64
	ModifiedCount int64
	DeletedCount  int64
	UpsertedCount int64
	UpsertedIDs   map[int64]any
}

// IndexModel represents an index to be created.
type IndexModel struct {
	Keys    any
	Options *IndexOptions
}

// IndexOptions configures an index.
type IndexOptions struct {
	Background *bool
	Unique     *bool
	Name       *string
	Sparse     *bool
	ExpireAfterSeconds *int32
}

// InsertOne inserts a single document into the collection.
func (c *Collection) InsertOne(ctx context.Context, document any) (*InsertOneResult, error) {
	if document == nil {
		return nil, ErrNilDocument
	}

	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.insertOne", c.database.name, c.name, document)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	// Parse result
	if r, ok := result.(map[string]any); ok {
		return &InsertOneResult{
			InsertedID: r["insertedId"],
		}, nil
	}

	return &InsertOneResult{InsertedID: result}, nil
}

// InsertMany inserts multiple documents into the collection.
func (c *Collection) InsertMany(ctx context.Context, documents []any) (*InsertManyResult, error) {
	if documents == nil || len(documents) == 0 {
		return nil, ErrNilDocument
	}

	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.insertMany", c.database.name, c.name, documents)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	// Parse result
	if r, ok := result.(map[string]any); ok {
		ids, _ := r["insertedIds"].([]any)
		return &InsertManyResult{
			InsertedIDs: ids,
		}, nil
	}

	return &InsertManyResult{}, nil
}

// FindOne finds a single document matching the filter.
func (c *Collection) FindOne(ctx context.Context, filter any) *SingleResult {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return newSingleResultError(ErrClientDisconnected)
	}

	// Check context
	select {
	case <-ctx.Done():
		return newSingleResultError(ctx.Err())
	default:
	}

	promise := rpcClient.Call("mongo.findOne", c.database.name, c.name, filter)
	result, err := promise.Await()
	if err != nil {
		return newSingleResultError(err)
	}

	if result == nil {
		return newSingleResultError(ErrNoDocuments)
	}

	return newSingleResult(result)
}

// FindOptions configures a Find operation.
type FindOptions struct {
	Sort       any
	Projection any
	Limit      *int64
	Skip       *int64
}

// SetSort sets the sort order.
func (o *FindOptions) SetSort(sort any) *FindOptions {
	o.Sort = sort
	return o
}

// SetProjection sets the projection.
func (o *FindOptions) SetProjection(projection any) *FindOptions {
	o.Projection = projection
	return o
}

// SetLimit sets the maximum number of documents to return.
func (o *FindOptions) SetLimit(limit int64) *FindOptions {
	o.Limit = &limit
	return o
}

// SetSkip sets the number of documents to skip.
func (o *FindOptions) SetSkip(skip int64) *FindOptions {
	o.Skip = &skip
	return o
}

// Find finds all documents matching the filter.
func (c *Collection) Find(ctx context.Context, filter any, opts ...*FindOptions) (*Cursor, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Build options map
	options := make(map[string]any)
	for _, opt := range opts {
		if opt != nil {
			if opt.Sort != nil {
				options["sort"] = opt.Sort
			}
			if opt.Projection != nil {
				options["projection"] = opt.Projection
			}
			if opt.Limit != nil {
				options["limit"] = *opt.Limit
			}
			if opt.Skip != nil {
				options["skip"] = *opt.Skip
			}
		}
	}

	promise := rpcClient.Call("mongo.find", c.database.name, c.name, filter, options)
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

// UpdateOptions configures an Update operation.
type UpdateOptions struct {
	Upsert       *bool
	ArrayFilters []any
}

// SetUpsert sets the upsert option.
func (o *UpdateOptions) SetUpsert(upsert bool) *UpdateOptions {
	o.Upsert = &upsert
	return o
}

// SetArrayFilters sets the array filters.
func (o *UpdateOptions) SetArrayFilters(filters []any) *UpdateOptions {
	o.ArrayFilters = filters
	return o
}

// UpdateOne updates a single document matching the filter.
func (c *Collection) UpdateOne(ctx context.Context, filter any, update any, opts ...*UpdateOptions) (*UpdateResult, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Build options map
	options := make(map[string]any)
	for _, opt := range opts {
		if opt != nil {
			if opt.Upsert != nil {
				options["upsert"] = *opt.Upsert
			}
			if opt.ArrayFilters != nil {
				options["arrayFilters"] = opt.ArrayFilters
			}
		}
	}

	promise := rpcClient.Call("mongo.updateOne", c.database.name, c.name, filter, update, options)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	return parseUpdateResult(result), nil
}

// UpdateMany updates all documents matching the filter.
func (c *Collection) UpdateMany(ctx context.Context, filter any, update any, opts ...*UpdateOptions) (*UpdateResult, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Build options map
	options := make(map[string]any)
	for _, opt := range opts {
		if opt != nil {
			if opt.Upsert != nil {
				options["upsert"] = *opt.Upsert
			}
			if opt.ArrayFilters != nil {
				options["arrayFilters"] = opt.ArrayFilters
			}
		}
	}

	promise := rpcClient.Call("mongo.updateMany", c.database.name, c.name, filter, update, options)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	return parseUpdateResult(result), nil
}

// ReplaceOne replaces a single document matching the filter.
func (c *Collection) ReplaceOne(ctx context.Context, filter any, replacement any, opts ...*UpdateOptions) (*UpdateResult, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Build options map
	options := make(map[string]any)
	for _, opt := range opts {
		if opt != nil {
			if opt.Upsert != nil {
				options["upsert"] = *opt.Upsert
			}
		}
	}

	promise := rpcClient.Call("mongo.replaceOne", c.database.name, c.name, filter, replacement, options)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	return parseUpdateResult(result), nil
}

// parseUpdateResult parses an update result from the RPC response.
func parseUpdateResult(result any) *UpdateResult {
	r := &UpdateResult{}
	if m, ok := result.(map[string]any); ok {
		if v, ok := m["matchedCount"].(float64); ok {
			r.MatchedCount = int64(v)
		}
		if v, ok := m["modifiedCount"].(float64); ok {
			r.ModifiedCount = int64(v)
		}
		if v, ok := m["upsertedCount"].(float64); ok {
			r.UpsertedCount = int64(v)
		}
		r.UpsertedID = m["upsertedId"]
	}
	return r
}

// DeleteOptions configures a Delete operation.
type DeleteOptions struct {
	Collation *Collation
}

// Collation specifies language-specific rules for string comparison.
type Collation struct {
	Locale   string
	Strength int
}

// SetCollation sets the collation.
func (o *DeleteOptions) SetCollation(collation *Collation) *DeleteOptions {
	o.Collation = collation
	return o
}

// DeleteOne deletes a single document matching the filter.
func (c *Collection) DeleteOne(ctx context.Context, filter any, opts ...*DeleteOptions) (*DeleteResult, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.deleteOne", c.database.name, c.name, filter)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	return parseDeleteResult(result), nil
}

// DeleteMany deletes all documents matching the filter.
func (c *Collection) DeleteMany(ctx context.Context, filter any, opts ...*DeleteOptions) (*DeleteResult, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.deleteMany", c.database.name, c.name, filter)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	return parseDeleteResult(result), nil
}

// parseDeleteResult parses a delete result from the RPC response.
func parseDeleteResult(result any) *DeleteResult {
	r := &DeleteResult{}
	if m, ok := result.(map[string]any); ok {
		if v, ok := m["deletedCount"].(float64); ok {
			r.DeletedCount = int64(v)
		}
	}
	return r
}

// CountDocuments returns the number of documents matching the filter.
func (c *Collection) CountDocuments(ctx context.Context, filter any) (int64, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return 0, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return 0, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.countDocuments", c.database.name, c.name, filter)
	result, err := promise.Await()
	if err != nil {
		return 0, err
	}

	if v, ok := result.(float64); ok {
		return int64(v), nil
	}

	return 0, fmt.Errorf("unexpected result type: %T", result)
}

// EstimatedDocumentCount returns an estimate of the number of documents in the collection.
func (c *Collection) EstimatedDocumentCount(ctx context.Context) (int64, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return 0, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return 0, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.estimatedDocumentCount", c.database.name, c.name)
	result, err := promise.Await()
	if err != nil {
		return 0, err
	}

	if v, ok := result.(float64); ok {
		return int64(v), nil
	}

	return 0, fmt.Errorf("unexpected result type: %T", result)
}

// Distinct returns distinct values for the given field.
func (c *Collection) Distinct(ctx context.Context, fieldName string, filter any) ([]any, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.distinct", c.database.name, c.name, fieldName, filter)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	if values, ok := result.([]any); ok {
		return values, nil
	}

	return nil, fmt.Errorf("unexpected result type: %T", result)
}

// Aggregate runs an aggregation pipeline on the collection.
func (c *Collection) Aggregate(ctx context.Context, pipeline any) (*Cursor, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.aggregate", c.database.name, c.name, pipeline)
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

// FindOneAndUpdate finds a single document and updates it.
func (c *Collection) FindOneAndUpdate(ctx context.Context, filter any, update any, opts ...*FindOneAndUpdateOptions) *SingleResult {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return newSingleResultError(ErrClientDisconnected)
	}

	// Check context
	select {
	case <-ctx.Done():
		return newSingleResultError(ctx.Err())
	default:
	}

	// Build options map
	options := make(map[string]any)
	for _, opt := range opts {
		if opt != nil {
			if opt.Upsert != nil {
				options["upsert"] = *opt.Upsert
			}
			if opt.ReturnDocument != nil {
				options["returnDocument"] = *opt.ReturnDocument
			}
			if opt.Projection != nil {
				options["projection"] = opt.Projection
			}
			if opt.Sort != nil {
				options["sort"] = opt.Sort
			}
		}
	}

	promise := rpcClient.Call("mongo.findOneAndUpdate", c.database.name, c.name, filter, update, options)
	result, err := promise.Await()
	if err != nil {
		return newSingleResultError(err)
	}

	if result == nil {
		return newSingleResultError(ErrNoDocuments)
	}

	return newSingleResult(result)
}

// FindOneAndUpdateOptions configures a FindOneAndUpdate operation.
type FindOneAndUpdateOptions struct {
	Upsert         *bool
	ReturnDocument *string
	Projection     any
	Sort           any
}

// SetUpsert sets the upsert option.
func (o *FindOneAndUpdateOptions) SetUpsert(upsert bool) *FindOneAndUpdateOptions {
	o.Upsert = &upsert
	return o
}

// SetReturnDocument sets which document to return.
func (o *FindOneAndUpdateOptions) SetReturnDocument(rd string) *FindOneAndUpdateOptions {
	o.ReturnDocument = &rd
	return o
}

// SetProjection sets the projection.
func (o *FindOneAndUpdateOptions) SetProjection(projection any) *FindOneAndUpdateOptions {
	o.Projection = projection
	return o
}

// SetSort sets the sort order.
func (o *FindOneAndUpdateOptions) SetSort(sort any) *FindOneAndUpdateOptions {
	o.Sort = sort
	return o
}

// FindOneAndDelete finds a single document and deletes it.
func (c *Collection) FindOneAndDelete(ctx context.Context, filter any) *SingleResult {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return newSingleResultError(ErrClientDisconnected)
	}

	// Check context
	select {
	case <-ctx.Done():
		return newSingleResultError(ctx.Err())
	default:
	}

	promise := rpcClient.Call("mongo.findOneAndDelete", c.database.name, c.name, filter)
	result, err := promise.Await()
	if err != nil {
		return newSingleResultError(err)
	}

	if result == nil {
		return newSingleResultError(ErrNoDocuments)
	}

	return newSingleResult(result)
}

// FindOneAndReplace finds a single document and replaces it.
func (c *Collection) FindOneAndReplace(ctx context.Context, filter any, replacement any) *SingleResult {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return newSingleResultError(ErrClientDisconnected)
	}

	// Check context
	select {
	case <-ctx.Done():
		return newSingleResultError(ctx.Err())
	default:
	}

	promise := rpcClient.Call("mongo.findOneAndReplace", c.database.name, c.name, filter, replacement)
	result, err := promise.Await()
	if err != nil {
		return newSingleResultError(err)
	}

	if result == nil {
		return newSingleResultError(ErrNoDocuments)
	}

	return newSingleResult(result)
}

// Drop drops the collection.
func (c *Collection) Drop(ctx context.Context) error {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.dropCollection", c.database.name, c.name)
	_, err := promise.Await()
	return err
}

// CreateIndex creates an index on the collection.
func (c *Collection) CreateIndex(ctx context.Context, model IndexModel) (string, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return "", ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	default:
	}

	// Build options map
	options := make(map[string]any)
	if model.Options != nil {
		if model.Options.Background != nil {
			options["background"] = *model.Options.Background
		}
		if model.Options.Unique != nil {
			options["unique"] = *model.Options.Unique
		}
		if model.Options.Name != nil {
			options["name"] = *model.Options.Name
		}
		if model.Options.Sparse != nil {
			options["sparse"] = *model.Options.Sparse
		}
		if model.Options.ExpireAfterSeconds != nil {
			options["expireAfterSeconds"] = *model.Options.ExpireAfterSeconds
		}
	}

	promise := rpcClient.Call("mongo.createIndex", c.database.name, c.name, model.Keys, options)
	result, err := promise.Await()
	if err != nil {
		return "", err
	}

	if name, ok := result.(string); ok {
		return name, nil
	}

	return "", nil
}

// DropIndex drops an index from the collection.
func (c *Collection) DropIndex(ctx context.Context, name string) error {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.dropIndex", c.database.name, c.name, name)
	_, err := promise.Await()
	return err
}

// Watch opens a change stream on the collection.
func (c *Collection) Watch(ctx context.Context, pipeline any) (*ChangeStream, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	promise := rpcClient.Call("mongo.watch", c.database.name, c.name, pipeline)
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

// BulkWrite performs multiple write operations.
type WriteModel interface {
	writeModel()
}

// InsertOneModel represents an insert operation.
type InsertOneModel struct {
	Document any
}

func (m *InsertOneModel) writeModel() {}

// UpdateOneModel represents an update operation.
type UpdateOneModel struct {
	Filter any
	Update any
	Upsert *bool
}

func (m *UpdateOneModel) writeModel() {}

// UpdateManyModel represents an update many operation.
type UpdateManyModel struct {
	Filter any
	Update any
	Upsert *bool
}

func (m *UpdateManyModel) writeModel() {}

// DeleteOneModel represents a delete operation.
type DeleteOneModel struct {
	Filter any
}

func (m *DeleteOneModel) writeModel() {}

// DeleteManyModel represents a delete many operation.
type DeleteManyModel struct {
	Filter any
}

func (m *DeleteManyModel) writeModel() {}

// ReplaceOneModel represents a replace operation.
type ReplaceOneModel struct {
	Filter      any
	Replacement any
	Upsert      *bool
}

func (m *ReplaceOneModel) writeModel() {}

// BulkWrite performs multiple write operations.
func (c *Collection) BulkWrite(ctx context.Context, models []WriteModel) (*BulkWriteResult, error) {
	c.database.client.mu.RLock()
	connected := c.database.client.connected
	rpcClient := c.database.client.rpcClient
	c.database.client.mu.RUnlock()

	if !connected {
		return nil, ErrClientDisconnected
	}

	// Check context
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Convert models to wire format
	operations := make([]map[string]any, len(models))
	for i, model := range models {
		switch m := model.(type) {
		case *InsertOneModel:
			operations[i] = map[string]any{"insertOne": map[string]any{"document": m.Document}}
		case *UpdateOneModel:
			op := map[string]any{"filter": m.Filter, "update": m.Update}
			if m.Upsert != nil {
				op["upsert"] = *m.Upsert
			}
			operations[i] = map[string]any{"updateOne": op}
		case *UpdateManyModel:
			op := map[string]any{"filter": m.Filter, "update": m.Update}
			if m.Upsert != nil {
				op["upsert"] = *m.Upsert
			}
			operations[i] = map[string]any{"updateMany": op}
		case *DeleteOneModel:
			operations[i] = map[string]any{"deleteOne": map[string]any{"filter": m.Filter}}
		case *DeleteManyModel:
			operations[i] = map[string]any{"deleteMany": map[string]any{"filter": m.Filter}}
		case *ReplaceOneModel:
			op := map[string]any{"filter": m.Filter, "replacement": m.Replacement}
			if m.Upsert != nil {
				op["upsert"] = *m.Upsert
			}
			operations[i] = map[string]any{"replaceOne": op}
		}
	}

	promise := rpcClient.Call("mongo.bulkWrite", c.database.name, c.name, operations)
	result, err := promise.Await()
	if err != nil {
		return nil, err
	}

	return parseBulkWriteResult(result), nil
}

// parseBulkWriteResult parses a bulk write result from the RPC response.
func parseBulkWriteResult(result any) *BulkWriteResult {
	r := &BulkWriteResult{
		UpsertedIDs: make(map[int64]any),
	}
	if m, ok := result.(map[string]any); ok {
		if v, ok := m["insertedCount"].(float64); ok {
			r.InsertedCount = int64(v)
		}
		if v, ok := m["matchedCount"].(float64); ok {
			r.MatchedCount = int64(v)
		}
		if v, ok := m["modifiedCount"].(float64); ok {
			r.ModifiedCount = int64(v)
		}
		if v, ok := m["deletedCount"].(float64); ok {
			r.DeletedCount = int64(v)
		}
		if v, ok := m["upsertedCount"].(float64); ok {
			r.UpsertedCount = int64(v)
		}
		if upserted, ok := m["upsertedIds"].(map[string]any); ok {
			for k, v := range upserted {
				var idx int64
				fmt.Sscanf(k, "%d", &idx)
				r.UpsertedIDs[idx] = v
			}
		}
	}
	return r
}
