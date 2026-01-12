// ============================================================================
// MongoDatabase - MongoDB database operations
// ============================================================================

namespace Mongo.Do;

/// <summary>
/// Represents a MongoDB database.
/// </summary>
public class MongoDatabase
{
    private readonly IRpcTransport _transport;
    private readonly string _name;
    private readonly Dictionary<string, object> _collections = new();

    /// <summary>
    /// Creates a new database reference.
    /// </summary>
    internal MongoDatabase(IRpcTransport transport, string name)
    {
        _transport = transport;
        _name = name;
    }

    /// <summary>
    /// Gets the database name.
    /// </summary>
    public string DatabaseName => _name;

    /// <summary>
    /// Gets a collection with the specified name.
    /// </summary>
    /// <typeparam name="TDocument">The document type.</typeparam>
    /// <param name="name">The collection name.</param>
    /// <returns>The collection.</returns>
    public MongoCollection<TDocument> GetCollection<TDocument>(string name) where TDocument : class
    {
        var key = $"{typeof(TDocument).FullName}:{name}";
        if (!_collections.TryGetValue(key, out var collection))
        {
            collection = new MongoCollection<TDocument>(_transport, _name, name);
            _collections[key] = collection;
        }
        return (MongoCollection<TDocument>)collection;
    }

    /// <summary>
    /// Gets a collection with BsonDocument as the document type.
    /// </summary>
    /// <param name="name">The collection name.</param>
    /// <returns>The collection.</returns>
    public MongoCollection<BsonDocument> GetCollection(string name)
    {
        return GetCollection<BsonDocument>(name);
    }

    /// <summary>
    /// Creates a new collection.
    /// </summary>
    /// <param name="name">The collection name.</param>
    /// <param name="options">Creation options.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async Task CreateCollectionAsync(
        string name,
        CreateCollectionOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var opts = new Dictionary<string, object?>();
        if (options?.Capped == true) opts["capped"] = true;
        if (options?.Size is not null) opts["size"] = options.Size;
        if (options?.MaxDocuments is not null) opts["max"] = options.MaxDocuments;
        if (options?.Validator is not null) opts["validator"] = options.Validator.ToObject();
        if (options?.ValidationLevel is not null) opts["validationLevel"] = options.ValidationLevel;
        if (options?.ValidationAction is not null) opts["validationAction"] = options.ValidationAction;

        await _transport.CallAsync("createCollection", cancellationToken, _name, name, opts);
    }

    /// <summary>
    /// Lists all collection names in the database.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Collection names.</returns>
    public async Task<List<string>> ListCollectionNamesAsync(CancellationToken cancellationToken = default)
    {
        var result = await _transport.CallAsync("listCollectionNames", cancellationToken, _name);
        if (result is IEnumerable<object> names)
        {
            return names.Select(n => n.ToString()!).ToList();
        }
        return [];
    }

    /// <summary>
    /// Lists all collections in the database.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Collection information documents.</returns>
    public async Task<List<BsonDocument>> ListCollectionsAsync(CancellationToken cancellationToken = default)
    {
        var result = await _transport.CallAsync("listCollections", cancellationToken, _name);
        if (result is IEnumerable<object> collections)
        {
            return collections.Select(ConvertToBsonDocument).ToList();
        }
        return [];
    }

    /// <summary>
    /// Drops a collection.
    /// </summary>
    /// <param name="name">The collection name.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async Task DropCollectionAsync(string name, CancellationToken cancellationToken = default)
    {
        await _transport.CallAsync("dropCollection", cancellationToken, _name, name);
    }

    /// <summary>
    /// Renames a collection.
    /// </summary>
    /// <param name="oldName">The current collection name.</param>
    /// <param name="newName">The new collection name.</param>
    /// <param name="dropTarget">Whether to drop the target collection if it exists.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async Task RenameCollectionAsync(
        string oldName,
        string newName,
        bool dropTarget = false,
        CancellationToken cancellationToken = default)
    {
        await _transport.CallAsync("renameCollection", cancellationToken, _name, oldName, newName, dropTarget);
    }

    /// <summary>
    /// Drops the database.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async Task DropAsync(CancellationToken cancellationToken = default)
    {
        await _transport.CallAsync("dropDatabase", cancellationToken, _name);
    }

    /// <summary>
    /// Runs a command against the database.
    /// </summary>
    /// <typeparam name="TResult">The result type.</typeparam>
    /// <param name="command">The command document.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The command result.</returns>
    public async Task<TResult> RunCommandAsync<TResult>(
        BsonDocument command,
        CancellationToken cancellationToken = default) where TResult : class
    {
        var result = await _transport.CallAsync("runCommand", cancellationToken, _name, command.ToObject());
        if (result is TResult typedResult) return typedResult;
        if (typeof(TResult) == typeof(BsonDocument))
        {
            return (TResult)(object)ConvertToBsonDocument(result!);
        }
        throw new InvalidCastException($"Cannot convert result to {typeof(TResult)}");
    }

    /// <summary>
    /// Runs a command and returns a BsonDocument.
    /// </summary>
    /// <param name="command">The command document.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The command result.</returns>
    public Task<BsonDocument> RunCommandAsync(BsonDocument command, CancellationToken cancellationToken = default)
    {
        return RunCommandAsync<BsonDocument>(command, cancellationToken);
    }

    /// <summary>
    /// Runs an aggregation pipeline against the database.
    /// </summary>
    /// <typeparam name="TResult">The result type.</typeparam>
    /// <param name="pipeline">The aggregation pipeline.</param>
    /// <param name="options">Aggregation options.</param>
    /// <returns>An aggregation cursor.</returns>
    public AggregationCursor<TResult> Aggregate<TResult>(
        IEnumerable<object> pipeline,
        AggregateOptions? options = null)
    {
        var opts = new Dictionary<string, object?>();
        if (options?.AllowDiskUse == true) opts["allowDiskUse"] = true;
        if (options?.MaxTimeMS is not null) opts["maxTimeMS"] = options.MaxTimeMS;
        if (options?.BatchSize is not null) opts["batchSize"] = options.BatchSize;

        return new AggregationCursor<TResult>(_transport, _name, "$cmd.aggregate", pipeline.ToArray(), opts);
    }

    /// <summary>
    /// Watches for changes in the database.
    /// </summary>
    /// <typeparam name="TDocument">The document type.</typeparam>
    /// <param name="pipeline">Optional aggregation pipeline for filtering.</param>
    /// <param name="options">Watch options.</param>
    /// <returns>A change stream cursor.</returns>
    public ChangeStreamCursor<TDocument> Watch<TDocument>(
        IEnumerable<object>? pipeline = null,
        Dictionary<string, object?>? options = null)
    {
        return new ChangeStreamCursor<TDocument>(_transport, _name, string.Empty, pipeline?.ToArray(), options);
    }

    /// <summary>
    /// Watches for changes in the database with BsonDocument.
    /// </summary>
    public ChangeStreamCursor<BsonDocument> Watch(
        IEnumerable<object>? pipeline = null,
        Dictionary<string, object?>? options = null)
    {
        return Watch<BsonDocument>(pipeline, options);
    }

    /// <summary>
    /// Gets database statistics.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Database statistics.</returns>
    public async Task<DatabaseStats> GetStatsAsync(CancellationToken cancellationToken = default)
    {
        var result = await RunCommandAsync(new BsonDocument("dbStats", 1), cancellationToken);
        return new DatabaseStats
        {
            Database = result["db"]?.AsString ?? _name,
            Collections = result["collections"]?.AsInt32 ?? 0,
            Views = result["views"]?.AsInt32 ?? 0,
            Objects = result["objects"]?.AsInt64 ?? 0,
            AvgObjSize = result["avgObjSize"]?.AsDouble ?? 0,
            DataSize = result["dataSize"]?.AsInt64 ?? 0,
            StorageSize = result["storageSize"]?.AsInt64 ?? 0,
            Indexes = result["indexes"]?.AsInt32 ?? 0,
            IndexSize = result["indexSize"]?.AsInt64 ?? 0,
            TotalSize = result["totalSize"]?.AsInt64 ?? 0,
            Ok = result["ok"]?.AsDouble == 1
        };
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
}

/// <summary>
/// Options for creating a collection.
/// </summary>
public class CreateCollectionOptions
{
    /// <summary>
    /// Gets or sets whether the collection is capped.
    /// </summary>
    public bool? Capped { get; set; }

    /// <summary>
    /// Gets or sets the maximum size in bytes for a capped collection.
    /// </summary>
    public long? Size { get; set; }

    /// <summary>
    /// Gets or sets the maximum number of documents for a capped collection.
    /// </summary>
    public long? MaxDocuments { get; set; }

    /// <summary>
    /// Gets or sets the validator document.
    /// </summary>
    public BsonDocument? Validator { get; set; }

    /// <summary>
    /// Gets or sets the validation level.
    /// </summary>
    public string? ValidationLevel { get; set; }

    /// <summary>
    /// Gets or sets the validation action.
    /// </summary>
    public string? ValidationAction { get; set; }
}

/// <summary>
/// Database statistics.
/// </summary>
public class DatabaseStats
{
    /// <summary>
    /// Gets or sets the database name.
    /// </summary>
    public required string Database { get; init; }

    /// <summary>
    /// Gets or sets the number of collections.
    /// </summary>
    public int Collections { get; init; }

    /// <summary>
    /// Gets or sets the number of views.
    /// </summary>
    public int Views { get; init; }

    /// <summary>
    /// Gets or sets the number of objects.
    /// </summary>
    public long Objects { get; init; }

    /// <summary>
    /// Gets or sets the average object size.
    /// </summary>
    public double AvgObjSize { get; init; }

    /// <summary>
    /// Gets or sets the data size in bytes.
    /// </summary>
    public long DataSize { get; init; }

    /// <summary>
    /// Gets or sets the storage size in bytes.
    /// </summary>
    public long StorageSize { get; init; }

    /// <summary>
    /// Gets or sets the number of indexes.
    /// </summary>
    public int Indexes { get; init; }

    /// <summary>
    /// Gets or sets the index size in bytes.
    /// </summary>
    public long IndexSize { get; init; }

    /// <summary>
    /// Gets or sets the total size in bytes.
    /// </summary>
    public long TotalSize { get; init; }

    /// <summary>
    /// Gets or sets whether the command succeeded.
    /// </summary>
    public bool Ok { get; init; }
}
