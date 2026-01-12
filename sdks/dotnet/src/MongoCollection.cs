// ============================================================================
// MongoCollection - MongoDB collection operations
// ============================================================================

using System.Linq.Expressions;

namespace Mongo.Do;

// ============================================================================
// Result Types
// ============================================================================

/// <summary>
/// Result of an insert one operation.
/// </summary>
public class InsertOneResult
{
    /// <summary>
    /// Gets whether the operation was acknowledged.
    /// </summary>
    public bool Acknowledged { get; init; } = true;

    /// <summary>
    /// Gets the inserted document ID.
    /// </summary>
    public required BsonValue InsertedId { get; init; }
}

/// <summary>
/// Result of an insert many operation.
/// </summary>
public class InsertManyResult
{
    /// <summary>
    /// Gets whether the operation was acknowledged.
    /// </summary>
    public bool Acknowledged { get; init; } = true;

    /// <summary>
    /// Gets the number of inserted documents.
    /// </summary>
    public int InsertedCount { get; init; }

    /// <summary>
    /// Gets the inserted document IDs.
    /// </summary>
    public required IReadOnlyDictionary<int, BsonValue> InsertedIds { get; init; }
}

/// <summary>
/// Result of an update operation.
/// </summary>
public class UpdateResult
{
    /// <summary>
    /// Gets whether the operation was acknowledged.
    /// </summary>
    public bool Acknowledged { get; init; } = true;

    /// <summary>
    /// Gets the number of matched documents.
    /// </summary>
    public long MatchedCount { get; init; }

    /// <summary>
    /// Gets the number of modified documents.
    /// </summary>
    public long ModifiedCount { get; init; }

    /// <summary>
    /// Gets the upserted document ID if an upsert occurred.
    /// </summary>
    public BsonValue? UpsertedId { get; init; }

    /// <summary>
    /// Gets whether a document was upserted.
    /// </summary>
    public bool IsUpserted => UpsertedId is not null;
}

/// <summary>
/// Result of a delete operation.
/// </summary>
public class DeleteResult
{
    /// <summary>
    /// Gets whether the operation was acknowledged.
    /// </summary>
    public bool Acknowledged { get; init; } = true;

    /// <summary>
    /// Gets the number of deleted documents.
    /// </summary>
    public long DeletedCount { get; init; }
}

/// <summary>
/// Result of a bulk write operation.
/// </summary>
public class BulkWriteResult
{
    /// <summary>
    /// Gets whether the operation was acknowledged.
    /// </summary>
    public bool Acknowledged { get; init; } = true;

    /// <summary>
    /// Gets the number of inserted documents.
    /// </summary>
    public long InsertedCount { get; init; }

    /// <summary>
    /// Gets the number of matched documents.
    /// </summary>
    public long MatchedCount { get; init; }

    /// <summary>
    /// Gets the number of modified documents.
    /// </summary>
    public long ModifiedCount { get; init; }

    /// <summary>
    /// Gets the number of deleted documents.
    /// </summary>
    public long DeletedCount { get; init; }

    /// <summary>
    /// Gets the number of upserted documents.
    /// </summary>
    public long UpsertedCount { get; init; }

    /// <summary>
    /// Gets the upserted document IDs.
    /// </summary>
    public IReadOnlyDictionary<int, BsonValue>? UpsertedIds { get; init; }
}

// ============================================================================
// Options Types
// ============================================================================

/// <summary>
/// Options for find operations.
/// </summary>
public class FindOptions
{
    /// <summary>
    /// Gets or sets the sort specification.
    /// </summary>
    public Dictionary<string, int>? Sort { get; set; }

    /// <summary>
    /// Gets or sets the maximum number of documents to return.
    /// </summary>
    public int? Limit { get; set; }

    /// <summary>
    /// Gets or sets the number of documents to skip.
    /// </summary>
    public int? Skip { get; set; }

    /// <summary>
    /// Gets or sets the projection specification.
    /// </summary>
    public Dictionary<string, int>? Projection { get; set; }

    /// <summary>
    /// Gets or sets the hint for query optimization.
    /// </summary>
    public string? Hint { get; set; }

    /// <summary>
    /// Gets or sets the maximum execution time in milliseconds.
    /// </summary>
    public int? MaxTimeMS { get; set; }

    /// <summary>
    /// Gets or sets the batch size.
    /// </summary>
    public int? BatchSize { get; set; }

    /// <summary>
    /// Gets or sets a comment for the query.
    /// </summary>
    public string? Comment { get; set; }
}

/// <summary>
/// Options for update operations.
/// </summary>
public class UpdateOptions
{
    /// <summary>
    /// Gets or sets whether to insert if no document matches.
    /// </summary>
    public bool Upsert { get; set; }

    /// <summary>
    /// Gets or sets array filters for array updates.
    /// </summary>
    public List<object>? ArrayFilters { get; set; }

    /// <summary>
    /// Gets or sets the hint for query optimization.
    /// </summary>
    public string? Hint { get; set; }
}

/// <summary>
/// Options for replace operations.
/// </summary>
public class ReplaceOptions
{
    /// <summary>
    /// Gets or sets whether to insert if no document matches.
    /// </summary>
    public bool Upsert { get; set; }

    /// <summary>
    /// Gets or sets the hint for query optimization.
    /// </summary>
    public string? Hint { get; set; }
}

/// <summary>
/// Options for delete operations.
/// </summary>
public class DeleteOptions
{
    /// <summary>
    /// Gets or sets the hint for query optimization.
    /// </summary>
    public string? Hint { get; set; }
}

/// <summary>
/// Options for count operations.
/// </summary>
public class CountOptions
{
    /// <summary>
    /// Gets or sets the number of documents to skip.
    /// </summary>
    public int? Skip { get; set; }

    /// <summary>
    /// Gets or sets the maximum number of documents to count.
    /// </summary>
    public int? Limit { get; set; }

    /// <summary>
    /// Gets or sets the maximum execution time in milliseconds.
    /// </summary>
    public int? MaxTimeMS { get; set; }

    /// <summary>
    /// Gets or sets the hint for query optimization.
    /// </summary>
    public string? Hint { get; set; }
}

/// <summary>
/// Options for aggregation operations.
/// </summary>
public class AggregateOptions
{
    /// <summary>
    /// Gets or sets whether to allow disk use.
    /// </summary>
    public bool AllowDiskUse { get; set; }

    /// <summary>
    /// Gets or sets the maximum execution time in milliseconds.
    /// </summary>
    public int? MaxTimeMS { get; set; }

    /// <summary>
    /// Gets or sets the batch size.
    /// </summary>
    public int? BatchSize { get; set; }

    /// <summary>
    /// Gets or sets whether to bypass document validation.
    /// </summary>
    public bool BypassDocumentValidation { get; set; }

    /// <summary>
    /// Gets or sets the hint for query optimization.
    /// </summary>
    public string? Hint { get; set; }

    /// <summary>
    /// Gets or sets a comment for the aggregation.
    /// </summary>
    public string? Comment { get; set; }

    /// <summary>
    /// Gets or sets variables for the aggregation.
    /// </summary>
    public BsonDocument? Let { get; set; }
}

/// <summary>
/// Options for find one and modify operations.
/// </summary>
public class FindOneAndModifyOptions
{
    /// <summary>
    /// Gets or sets whether to return the document before or after modification.
    /// </summary>
    public ReturnDocument ReturnDocument { get; set; } = ReturnDocument.Before;

    /// <summary>
    /// Gets or sets whether to insert if no document matches.
    /// </summary>
    public bool Upsert { get; set; }

    /// <summary>
    /// Gets or sets the projection specification.
    /// </summary>
    public Dictionary<string, int>? Projection { get; set; }

    /// <summary>
    /// Gets or sets the sort specification.
    /// </summary>
    public Dictionary<string, int>? Sort { get; set; }
}

/// <summary>
/// Specifies which document to return for find and modify operations.
/// </summary>
public enum ReturnDocument
{
    /// <summary>
    /// Return the document before modification.
    /// </summary>
    Before,

    /// <summary>
    /// Return the document after modification.
    /// </summary>
    After
}

// ============================================================================
// MongoCollection<TDocument>
// ============================================================================

/// <summary>
/// Represents a MongoDB collection.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class MongoCollection<TDocument> where TDocument : class
{
    private readonly IRpcTransport _transport;
    private readonly string _dbName;
    private readonly string _name;

    /// <summary>
    /// Creates a new collection reference.
    /// </summary>
    internal MongoCollection(IRpcTransport transport, string dbName, string name)
    {
        _transport = transport;
        _dbName = dbName;
        _name = name;
    }

    /// <summary>
    /// Gets the collection name.
    /// </summary>
    public string CollectionName => _name;

    /// <summary>
    /// Gets the database name.
    /// </summary>
    public string DatabaseName => _dbName;

    /// <summary>
    /// Gets the full namespace (database.collection).
    /// </summary>
    public string Namespace => $"{_dbName}.{_name}";

    // ========================================================================
    // Insert Operations
    // ========================================================================

    /// <summary>
    /// Inserts a single document.
    /// </summary>
    public async Task<InsertOneResult> InsertOneAsync(TDocument document, CancellationToken cancellationToken = default)
    {
        var result = await _transport.CallAsync("insertOne", cancellationToken, _dbName, _name, ConvertToTransport(document));
        return ParseInsertOneResult(result);
    }

    /// <summary>
    /// Inserts multiple documents.
    /// </summary>
    public async Task<InsertManyResult> InsertManyAsync(IEnumerable<TDocument> documents, CancellationToken cancellationToken = default)
    {
        var docs = documents.Select(ConvertToTransport).ToArray();
        var result = await _transport.CallAsync("insertMany", cancellationToken, _dbName, _name, docs);
        return ParseInsertManyResult(result);
    }

    // ========================================================================
    // Find Operations
    // ========================================================================

    /// <summary>
    /// Finds documents matching a filter.
    /// </summary>
    public FindCursor<TDocument> Find(FilterDefinition<TDocument> filter)
    {
        return new FindCursor<TDocument>(_transport, _dbName, _name, filter.Render());
    }

    /// <summary>
    /// Finds documents matching a filter expression.
    /// </summary>
    public FindCursor<TDocument> Find(Expression<Func<TDocument, bool>> filter)
    {
        return Find(new ExpressionFilterDefinition<TDocument>(filter));
    }

    /// <summary>
    /// Finds all documents in the collection.
    /// </summary>
    public FindCursor<TDocument> Find()
    {
        return new FindCursor<TDocument>(_transport, _dbName, _name, new BsonDocument());
    }

    /// <summary>
    /// Finds a single document matching a filter.
    /// </summary>
    public async Task<TDocument?> FindOneAsync(FilterDefinition<TDocument> filter, CancellationToken cancellationToken = default)
    {
        return await Find(filter).Limit(1).FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// Finds a single document matching a filter expression.
    /// </summary>
    public async Task<TDocument?> FindOneAsync(Expression<Func<TDocument, bool>> filter, CancellationToken cancellationToken = default)
    {
        return await Find(filter).Limit(1).FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// Finds a document and updates it.
    /// </summary>
    public async Task<TDocument?> FindOneAndUpdateAsync(
        FilterDefinition<TDocument> filter,
        UpdateDefinition<TDocument> update,
        FindOneAndModifyOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var opts = new Dictionary<string, object?>
        {
            ["returnDocument"] = (options?.ReturnDocument ?? ReturnDocument.Before) == ReturnDocument.After ? "after" : "before",
            ["upsert"] = options?.Upsert ?? false
        };
        if (options?.Projection is not null) opts["projection"] = options.Projection;
        if (options?.Sort is not null) opts["sort"] = options.Sort;

        var result = await _transport.CallAsync("findOneAndUpdate", cancellationToken, _dbName, _name, filter.Render(), update.Render(), opts);
        return ConvertFromTransport(result);
    }

    /// <summary>
    /// Finds a document and replaces it.
    /// </summary>
    public async Task<TDocument?> FindOneAndReplaceAsync(
        FilterDefinition<TDocument> filter,
        TDocument replacement,
        FindOneAndModifyOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var opts = new Dictionary<string, object?>
        {
            ["returnDocument"] = (options?.ReturnDocument ?? ReturnDocument.Before) == ReturnDocument.After ? "after" : "before",
            ["upsert"] = options?.Upsert ?? false
        };
        if (options?.Projection is not null) opts["projection"] = options.Projection;
        if (options?.Sort is not null) opts["sort"] = options.Sort;

        var result = await _transport.CallAsync("findOneAndReplace", cancellationToken, _dbName, _name, filter.Render(), ConvertToTransport(replacement), opts);
        return ConvertFromTransport(result);
    }

    /// <summary>
    /// Finds a document and deletes it.
    /// </summary>
    public async Task<TDocument?> FindOneAndDeleteAsync(
        FilterDefinition<TDocument> filter,
        FindOneAndModifyOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var opts = new Dictionary<string, object?>();
        if (options?.Projection is not null) opts["projection"] = options.Projection;
        if (options?.Sort is not null) opts["sort"] = options.Sort;

        var result = await _transport.CallAsync("findOneAndDelete", cancellationToken, _dbName, _name, filter.Render(), opts);
        return ConvertFromTransport(result);
    }

    // ========================================================================
    // Update Operations
    // ========================================================================

    /// <summary>
    /// Updates a single document.
    /// </summary>
    public async Task<UpdateResult> UpdateOneAsync(
        FilterDefinition<TDocument> filter,
        UpdateDefinition<TDocument> update,
        UpdateOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var opts = new Dictionary<string, object?>
        {
            ["upsert"] = options?.Upsert ?? false
        };
        if (options?.ArrayFilters is not null) opts["arrayFilters"] = options.ArrayFilters;
        if (options?.Hint is not null) opts["hint"] = options.Hint;

        var result = await _transport.CallAsync("updateOne", cancellationToken, _dbName, _name, filter.Render(), update.Render(), opts);
        return ParseUpdateResult(result);
    }

    /// <summary>
    /// Updates a single document using an expression filter.
    /// </summary>
    public Task<UpdateResult> UpdateOneAsync(
        Expression<Func<TDocument, bool>> filter,
        UpdateDefinition<TDocument> update,
        UpdateOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        return UpdateOneAsync(new ExpressionFilterDefinition<TDocument>(filter), update, options, cancellationToken);
    }

    /// <summary>
    /// Updates multiple documents.
    /// </summary>
    public async Task<UpdateResult> UpdateManyAsync(
        FilterDefinition<TDocument> filter,
        UpdateDefinition<TDocument> update,
        UpdateOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var opts = new Dictionary<string, object?>
        {
            ["upsert"] = options?.Upsert ?? false
        };
        if (options?.ArrayFilters is not null) opts["arrayFilters"] = options.ArrayFilters;
        if (options?.Hint is not null) opts["hint"] = options.Hint;

        var result = await _transport.CallAsync("updateMany", cancellationToken, _dbName, _name, filter.Render(), update.Render(), opts);
        return ParseUpdateResult(result);
    }

    /// <summary>
    /// Replaces a single document.
    /// </summary>
    public async Task<UpdateResult> ReplaceOneAsync(
        FilterDefinition<TDocument> filter,
        TDocument replacement,
        ReplaceOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var opts = new Dictionary<string, object?>
        {
            ["upsert"] = options?.Upsert ?? false
        };
        if (options?.Hint is not null) opts["hint"] = options.Hint;

        var result = await _transport.CallAsync("replaceOne", cancellationToken, _dbName, _name, filter.Render(), ConvertToTransport(replacement), opts);
        return ParseUpdateResult(result);
    }

    // ========================================================================
    // Delete Operations
    // ========================================================================

    /// <summary>
    /// Deletes a single document.
    /// </summary>
    public async Task<DeleteResult> DeleteOneAsync(FilterDefinition<TDocument> filter, CancellationToken cancellationToken = default)
    {
        var result = await _transport.CallAsync("deleteOne", cancellationToken, _dbName, _name, filter.Render());
        return ParseDeleteResult(result);
    }

    /// <summary>
    /// Deletes a single document using an expression filter.
    /// </summary>
    public Task<DeleteResult> DeleteOneAsync(Expression<Func<TDocument, bool>> filter, CancellationToken cancellationToken = default)
    {
        return DeleteOneAsync(new ExpressionFilterDefinition<TDocument>(filter), cancellationToken);
    }

    /// <summary>
    /// Deletes multiple documents.
    /// </summary>
    public async Task<DeleteResult> DeleteManyAsync(FilterDefinition<TDocument> filter, CancellationToken cancellationToken = default)
    {
        var result = await _transport.CallAsync("deleteMany", cancellationToken, _dbName, _name, filter.Render());
        return ParseDeleteResult(result);
    }

    /// <summary>
    /// Deletes multiple documents using an expression filter.
    /// </summary>
    public Task<DeleteResult> DeleteManyAsync(Expression<Func<TDocument, bool>> filter, CancellationToken cancellationToken = default)
    {
        return DeleteManyAsync(new ExpressionFilterDefinition<TDocument>(filter), cancellationToken);
    }

    // ========================================================================
    // Count Operations
    // ========================================================================

    /// <summary>
    /// Counts documents matching a filter.
    /// </summary>
    public async Task<long> CountDocumentsAsync(
        FilterDefinition<TDocument>? filter = null,
        CountOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var opts = new Dictionary<string, object?>();
        if (options?.Skip is not null) opts["skip"] = options.Skip;
        if (options?.Limit is not null) opts["limit"] = options.Limit;
        if (options?.MaxTimeMS is not null) opts["maxTimeMS"] = options.MaxTimeMS;
        if (options?.Hint is not null) opts["hint"] = options.Hint;

        var result = await _transport.CallAsync("countDocuments", cancellationToken, _dbName, _name, filter?.Render() ?? new BsonDocument(), opts);
        return Convert.ToInt64(result);
    }

    /// <summary>
    /// Counts documents using an expression filter.
    /// </summary>
    public Task<long> CountDocumentsAsync(
        Expression<Func<TDocument, bool>> filter,
        CountOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        return CountDocumentsAsync(new ExpressionFilterDefinition<TDocument>(filter), options, cancellationToken);
    }

    /// <summary>
    /// Gets an estimated document count.
    /// </summary>
    public async Task<long> EstimatedDocumentCountAsync(CancellationToken cancellationToken = default)
    {
        var result = await _transport.CallAsync("estimatedDocumentCount", cancellationToken, _dbName, _name);
        return Convert.ToInt64(result);
    }

    // ========================================================================
    // Aggregation Operations
    // ========================================================================

    /// <summary>
    /// Runs an aggregation pipeline.
    /// </summary>
    public AggregationCursor<TResult> Aggregate<TResult>(
        IEnumerable<object> pipeline,
        AggregateOptions? options = null)
    {
        var opts = new Dictionary<string, object?>();
        if (options?.AllowDiskUse == true) opts["allowDiskUse"] = true;
        if (options?.MaxTimeMS is not null) opts["maxTimeMS"] = options.MaxTimeMS;
        if (options?.BatchSize is not null) opts["batchSize"] = options.BatchSize;
        if (options?.BypassDocumentValidation == true) opts["bypassDocumentValidation"] = true;
        if (options?.Hint is not null) opts["hint"] = options.Hint;
        if (options?.Comment is not null) opts["comment"] = options.Comment;
        if (options?.Let is not null) opts["let"] = options.Let;

        return new AggregationCursor<TResult>(_transport, _dbName, _name, pipeline.ToArray(), opts);
    }

    /// <summary>
    /// Runs an aggregation pipeline returning BsonDocuments.
    /// </summary>
    public AggregationCursor<BsonDocument> Aggregate(
        IEnumerable<object> pipeline,
        AggregateOptions? options = null)
    {
        return Aggregate<BsonDocument>(pipeline, options);
    }

    /// <summary>
    /// Gets distinct values for a field.
    /// </summary>
    public async Task<List<TField>> DistinctAsync<TField>(
        string fieldName,
        FilterDefinition<TDocument>? filter = null,
        CancellationToken cancellationToken = default)
    {
        var result = await _transport.CallAsync("distinct", cancellationToken, _dbName, _name, fieldName, filter?.Render() ?? new BsonDocument());
        if (result is IEnumerable<object> enumerable)
        {
            return enumerable.Select(o => (TField)Convert.ChangeType(o, typeof(TField))!).ToList();
        }
        return [];
    }

    // ========================================================================
    // Change Streams
    // ========================================================================

    /// <summary>
    /// Watches for changes in the collection.
    /// </summary>
    public ChangeStreamCursor<TDocument> Watch(
        IEnumerable<object>? pipeline = null,
        Dictionary<string, object?>? options = null)
    {
        return new ChangeStreamCursor<TDocument>(_transport, _dbName, _name, pipeline?.ToArray(), options);
    }

    // ========================================================================
    // Index Operations
    // ========================================================================

    /// <summary>
    /// Creates an index.
    /// </summary>
    public async Task<string> CreateIndexAsync(
        Dictionary<string, int> keys,
        CreateIndexOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var opts = new Dictionary<string, object?>();
        if (options?.Name is not null) opts["name"] = options.Name;
        if (options?.Unique == true) opts["unique"] = true;
        if (options?.Background == true) opts["background"] = true;
        if (options?.Sparse == true) opts["sparse"] = true;
        if (options?.ExpireAfterSeconds is not null) opts["expireAfterSeconds"] = options.ExpireAfterSeconds;

        var result = await _transport.CallAsync("createIndex", cancellationToken, _dbName, _name, keys, opts);
        return result?.ToString() ?? string.Empty;
    }

    /// <summary>
    /// Creates multiple indexes.
    /// </summary>
    public async Task<List<string>> CreateIndexesAsync(
        IEnumerable<CreateIndexModel> indexes,
        CancellationToken cancellationToken = default)
    {
        var indexArray = indexes.Select(i => new Dictionary<string, object?>
        {
            ["key"] = i.Keys,
            ["options"] = i.Options
        }).ToArray();

        var result = await _transport.CallAsync("createIndexes", cancellationToken, _dbName, _name, indexArray);
        if (result is IEnumerable<object> names)
        {
            return names.Select(n => n.ToString()!).ToList();
        }
        return [];
    }

    /// <summary>
    /// Drops an index by name.
    /// </summary>
    public async Task DropIndexAsync(string indexName, CancellationToken cancellationToken = default)
    {
        await _transport.CallAsync("dropIndex", cancellationToken, _dbName, _name, indexName);
    }

    /// <summary>
    /// Drops all indexes except _id.
    /// </summary>
    public async Task DropIndexesAsync(CancellationToken cancellationToken = default)
    {
        await _transport.CallAsync("dropIndexes", cancellationToken, _dbName, _name);
    }

    /// <summary>
    /// Lists all indexes.
    /// </summary>
    public async Task<List<BsonDocument>> ListIndexesAsync(CancellationToken cancellationToken = default)
    {
        var result = await _transport.CallAsync("listIndexes", cancellationToken, _dbName, _name);
        if (result is IEnumerable<object> indexes)
        {
            return indexes.Select(i => ConvertToBsonDocument(i)).ToList();
        }
        return [];
    }

    // ========================================================================
    // Collection Operations
    // ========================================================================

    /// <summary>
    /// Drops the collection.
    /// </summary>
    public async Task<bool> DropAsync(CancellationToken cancellationToken = default)
    {
        var result = await _transport.CallAsync("dropCollection", cancellationToken, _dbName, _name);
        return Convert.ToBoolean(result);
    }

    /// <summary>
    /// Renames the collection.
    /// </summary>
    public async Task RenameAsync(string newName, bool dropTarget = false, CancellationToken cancellationToken = default)
    {
        await _transport.CallAsync("renameCollection", cancellationToken, _dbName, _name, newName, dropTarget);
    }

    // ========================================================================
    // Bulk Operations
    // ========================================================================

    /// <summary>
    /// Performs bulk write operations.
    /// </summary>
    public async Task<BulkWriteResult> BulkWriteAsync(
        IEnumerable<WriteModel<TDocument>> requests,
        BulkWriteOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var operations = requests.Select(r => r.Render()).ToArray();
        var opts = new Dictionary<string, object?>
        {
            ["ordered"] = options?.IsOrdered ?? true
        };

        var result = await _transport.CallAsync("bulkWrite", cancellationToken, _dbName, _name, operations, opts);
        return ParseBulkWriteResult(result);
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private static object ConvertToTransport(TDocument document)
    {
        if (document is BsonDocument bson) return bson.ToObject()!;
        return document;
    }

    private static TDocument? ConvertFromTransport(object? result)
    {
        if (result is null) return default;
        if (result is TDocument doc) return doc;
        if (typeof(TDocument) == typeof(BsonDocument) && result is Dictionary<string, object?> dict)
        {
            var bsonDoc = new BsonDocument();
            foreach (var (key, value) in dict)
            {
                bsonDoc.Add(key, BsonValue.FromObject(value));
            }
            return (TDocument)(object)bsonDoc;
        }
        return default;
    }

    private static BsonDocument ConvertToBsonDocument(object obj)
    {
        if (obj is BsonDocument bson) return bson;
        if (obj is Dictionary<string, object?> dict)
        {
            var doc = new BsonDocument();
            foreach (var (key, value) in dict)
            {
                doc.Add(key, BsonValue.FromObject(value));
            }
            return doc;
        }
        return new BsonDocument();
    }

    private static InsertOneResult ParseInsertOneResult(object? result)
    {
        if (result is Dictionary<string, object?> dict)
        {
            return new InsertOneResult
            {
                Acknowledged = dict.TryGetValue("acknowledged", out var ack) && Convert.ToBoolean(ack),
                InsertedId = dict.TryGetValue("insertedId", out var id) ? BsonValue.FromObject(id) : BsonNull.Instance
            };
        }
        return new InsertOneResult { InsertedId = BsonNull.Instance };
    }

    private static InsertManyResult ParseInsertManyResult(object? result)
    {
        if (result is Dictionary<string, object?> dict)
        {
            var ids = new Dictionary<int, BsonValue>();
            if (dict.TryGetValue("insertedIds", out var idsObj) && idsObj is Dictionary<string, object?> idsDict)
            {
                foreach (var (key, value) in idsDict)
                {
                    if (int.TryParse(key, out var index))
                    {
                        ids[index] = BsonValue.FromObject(value);
                    }
                }
            }
            return new InsertManyResult
            {
                Acknowledged = dict.TryGetValue("acknowledged", out var ack) && Convert.ToBoolean(ack),
                InsertedCount = dict.TryGetValue("insertedCount", out var count) ? Convert.ToInt32(count) : 0,
                InsertedIds = ids
            };
        }
        return new InsertManyResult { InsertedIds = new Dictionary<int, BsonValue>() };
    }

    private static UpdateResult ParseUpdateResult(object? result)
    {
        if (result is Dictionary<string, object?> dict)
        {
            return new UpdateResult
            {
                Acknowledged = dict.TryGetValue("acknowledged", out var ack) && Convert.ToBoolean(ack),
                MatchedCount = dict.TryGetValue("matchedCount", out var matched) ? Convert.ToInt64(matched) : 0,
                ModifiedCount = dict.TryGetValue("modifiedCount", out var modified) ? Convert.ToInt64(modified) : 0,
                UpsertedId = dict.TryGetValue("upsertedId", out var id) && id is not null ? BsonValue.FromObject(id) : null
            };
        }
        return new UpdateResult();
    }

    private static DeleteResult ParseDeleteResult(object? result)
    {
        if (result is Dictionary<string, object?> dict)
        {
            return new DeleteResult
            {
                Acknowledged = dict.TryGetValue("acknowledged", out var ack) && Convert.ToBoolean(ack),
                DeletedCount = dict.TryGetValue("deletedCount", out var count) ? Convert.ToInt64(count) : 0
            };
        }
        return new DeleteResult();
    }

    private static BulkWriteResult ParseBulkWriteResult(object? result)
    {
        if (result is Dictionary<string, object?> dict)
        {
            return new BulkWriteResult
            {
                Acknowledged = dict.TryGetValue("acknowledged", out var ack) && Convert.ToBoolean(ack),
                InsertedCount = dict.TryGetValue("insertedCount", out var inserted) ? Convert.ToInt64(inserted) : 0,
                MatchedCount = dict.TryGetValue("matchedCount", out var matched) ? Convert.ToInt64(matched) : 0,
                ModifiedCount = dict.TryGetValue("modifiedCount", out var modified) ? Convert.ToInt64(modified) : 0,
                DeletedCount = dict.TryGetValue("deletedCount", out var deleted) ? Convert.ToInt64(deleted) : 0,
                UpsertedCount = dict.TryGetValue("upsertedCount", out var upserted) ? Convert.ToInt64(upserted) : 0
            };
        }
        return new BulkWriteResult();
    }
}

// ============================================================================
// CreateIndexOptions and CreateIndexModel
// ============================================================================

/// <summary>
/// Options for creating an index.
/// </summary>
public class CreateIndexOptions
{
    /// <summary>
    /// Gets or sets the index name.
    /// </summary>
    public string? Name { get; set; }

    /// <summary>
    /// Gets or sets whether the index enforces uniqueness.
    /// </summary>
    public bool? Unique { get; set; }

    /// <summary>
    /// Gets or sets whether to build the index in the background.
    /// </summary>
    public bool? Background { get; set; }

    /// <summary>
    /// Gets or sets whether the index is sparse.
    /// </summary>
    public bool? Sparse { get; set; }

    /// <summary>
    /// Gets or sets the TTL in seconds.
    /// </summary>
    public int? ExpireAfterSeconds { get; set; }
}

/// <summary>
/// Model for creating an index.
/// </summary>
public class CreateIndexModel
{
    /// <summary>
    /// Gets or sets the index keys.
    /// </summary>
    public required Dictionary<string, int> Keys { get; init; }

    /// <summary>
    /// Gets or sets the index options.
    /// </summary>
    public CreateIndexOptions? Options { get; init; }
}

// ============================================================================
// BulkWriteOptions
// ============================================================================

/// <summary>
/// Options for bulk write operations.
/// </summary>
public class BulkWriteOptions
{
    /// <summary>
    /// Gets or sets whether operations are executed in order.
    /// </summary>
    public bool IsOrdered { get; set; } = true;

    /// <summary>
    /// Gets or sets whether to bypass document validation.
    /// </summary>
    public bool BypassDocumentValidation { get; set; }
}

// ============================================================================
// WriteModel - Base class for bulk write operations
// ============================================================================

/// <summary>
/// Base class for write models.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public abstract class WriteModel<TDocument>
{
    /// <summary>
    /// Renders the write model to a dictionary.
    /// </summary>
    public abstract Dictionary<string, object?> Render();
}

/// <summary>
/// Insert one write model.
/// </summary>
public class InsertOneModel<TDocument> : WriteModel<TDocument>
{
    /// <summary>
    /// Gets the document to insert.
    /// </summary>
    public required TDocument Document { get; init; }

    /// <inheritdoc />
    public override Dictionary<string, object?> Render() => new()
    {
        ["insertOne"] = new Dictionary<string, object?> { ["document"] = Document }
    };
}

/// <summary>
/// Update one write model.
/// </summary>
public class UpdateOneModel<TDocument> : WriteModel<TDocument>
{
    /// <summary>
    /// Gets the filter.
    /// </summary>
    public required FilterDefinition<TDocument> Filter { get; init; }

    /// <summary>
    /// Gets the update.
    /// </summary>
    public required UpdateDefinition<TDocument> Update { get; init; }

    /// <summary>
    /// Gets or sets whether to upsert.
    /// </summary>
    public bool Upsert { get; set; }

    /// <inheritdoc />
    public override Dictionary<string, object?> Render() => new()
    {
        ["updateOne"] = new Dictionary<string, object?>
        {
            ["filter"] = Filter.Render(),
            ["update"] = Update.Render(),
            ["upsert"] = Upsert
        }
    };
}

/// <summary>
/// Update many write model.
/// </summary>
public class UpdateManyModel<TDocument> : WriteModel<TDocument>
{
    /// <summary>
    /// Gets the filter.
    /// </summary>
    public required FilterDefinition<TDocument> Filter { get; init; }

    /// <summary>
    /// Gets the update.
    /// </summary>
    public required UpdateDefinition<TDocument> Update { get; init; }

    /// <summary>
    /// Gets or sets whether to upsert.
    /// </summary>
    public bool Upsert { get; set; }

    /// <inheritdoc />
    public override Dictionary<string, object?> Render() => new()
    {
        ["updateMany"] = new Dictionary<string, object?>
        {
            ["filter"] = Filter.Render(),
            ["update"] = Update.Render(),
            ["upsert"] = Upsert
        }
    };
}

/// <summary>
/// Delete one write model.
/// </summary>
public class DeleteOneModel<TDocument> : WriteModel<TDocument>
{
    /// <summary>
    /// Gets the filter.
    /// </summary>
    public required FilterDefinition<TDocument> Filter { get; init; }

    /// <inheritdoc />
    public override Dictionary<string, object?> Render() => new()
    {
        ["deleteOne"] = new Dictionary<string, object?> { ["filter"] = Filter.Render() }
    };
}

/// <summary>
/// Delete many write model.
/// </summary>
public class DeleteManyModel<TDocument> : WriteModel<TDocument>
{
    /// <summary>
    /// Gets the filter.
    /// </summary>
    public required FilterDefinition<TDocument> Filter { get; init; }

    /// <inheritdoc />
    public override Dictionary<string, object?> Render() => new()
    {
        ["deleteMany"] = new Dictionary<string, object?> { ["filter"] = Filter.Render() }
    };
}

/// <summary>
/// Replace one write model.
/// </summary>
public class ReplaceOneModel<TDocument> : WriteModel<TDocument>
{
    /// <summary>
    /// Gets the filter.
    /// </summary>
    public required FilterDefinition<TDocument> Filter { get; init; }

    /// <summary>
    /// Gets the replacement document.
    /// </summary>
    public required TDocument Replacement { get; init; }

    /// <summary>
    /// Gets or sets whether to upsert.
    /// </summary>
    public bool Upsert { get; set; }

    /// <inheritdoc />
    public override Dictionary<string, object?> Render() => new()
    {
        ["replaceOne"] = new Dictionary<string, object?>
        {
            ["filter"] = Filter.Render(),
            ["replacement"] = Replacement,
            ["upsert"] = Upsert
        }
    };
}
