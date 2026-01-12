// ============================================================================
// MongoCursor - Async cursor implementation for MongoDB operations
// ============================================================================

using System.Runtime.CompilerServices;

namespace Mongo.Do;

// ============================================================================
// IRpcTransport - RPC transport abstraction
// ============================================================================

/// <summary>
/// Interface for RPC transport implementations.
/// </summary>
public interface IRpcTransport
{
    /// <summary>
    /// Calls a remote method with the specified arguments.
    /// </summary>
    Task<object?> CallAsync(string method, params object?[] args);

    /// <summary>
    /// Calls a remote method with cancellation support.
    /// </summary>
    Task<object?> CallAsync(string method, CancellationToken cancellationToken, params object?[] args);

    /// <summary>
    /// Closes the transport connection.
    /// </summary>
    Task CloseAsync();
}

// ============================================================================
// AbstractCursor - Base cursor with async enumeration
// ============================================================================

/// <summary>
/// Abstract base class for cursors providing async iteration.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public abstract class AbstractCursor<TDocument> : IAsyncEnumerable<TDocument>, IAsyncDisposable
{
    protected readonly IRpcTransport _transport;
    protected readonly string _dbName;
    protected readonly string _collectionName;
    protected List<TDocument>? _buffer;
    protected int _position;
    protected bool _fetched;
    protected bool _closed;

    /// <summary>
    /// Creates a new cursor.
    /// </summary>
    protected AbstractCursor(IRpcTransport transport, string dbName, string collectionName)
    {
        _transport = transport;
        _dbName = dbName;
        _collectionName = collectionName;
        _position = 0;
        _fetched = false;
        _closed = false;
    }

    /// <summary>
    /// Gets whether the cursor is closed.
    /// </summary>
    public bool IsClosed => _closed;

    /// <summary>
    /// Fetches data from the server.
    /// </summary>
    protected abstract Task<List<TDocument>> FetchDataAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Ensures data has been fetched.
    /// </summary>
    protected async Task EnsureFetchedAsync(CancellationToken cancellationToken)
    {
        if (_fetched || _closed) return;
        _buffer = await FetchDataAsync(cancellationToken);
        _fetched = true;
    }

    /// <summary>
    /// Gets the next document.
    /// </summary>
    public async Task<TDocument?> NextAsync(CancellationToken cancellationToken = default)
    {
        if (_closed) return default;
        await EnsureFetchedAsync(cancellationToken);
        if (_buffer is null || _position >= _buffer.Count) return default;
        return _buffer[_position++];
    }

    /// <summary>
    /// Checks if there are more documents.
    /// </summary>
    public async Task<bool> MoveNextAsync(CancellationToken cancellationToken = default)
    {
        if (_closed) return false;
        await EnsureFetchedAsync(cancellationToken);
        return _buffer is not null && _position < _buffer.Count;
    }

    /// <summary>
    /// Gets the current document.
    /// </summary>
    public TDocument? Current => _buffer is not null && _position > 0 && _position <= _buffer.Count
        ? _buffer[_position - 1]
        : default;

    /// <summary>
    /// Gets all remaining documents as a list.
    /// </summary>
    public async Task<List<TDocument>> ToListAsync(CancellationToken cancellationToken = default)
    {
        if (_closed) return [];
        await EnsureFetchedAsync(cancellationToken);
        if (_buffer is null) return [];
        var remaining = _buffer.Skip(_position).ToList();
        _position = _buffer.Count;
        await CloseAsync();
        return remaining;
    }

    /// <summary>
    /// Gets all remaining documents as an array.
    /// </summary>
    public async Task<TDocument[]> ToArrayAsync(CancellationToken cancellationToken = default)
    {
        var list = await ToListAsync(cancellationToken);
        return [.. list];
    }

    /// <summary>
    /// Gets the first document or null if none.
    /// </summary>
    public async Task<TDocument?> FirstOrDefaultAsync(CancellationToken cancellationToken = default)
    {
        if (_closed) return default;
        await EnsureFetchedAsync(cancellationToken);
        if (_buffer is null || _buffer.Count == 0) return default;
        await CloseAsync();
        return _buffer[0];
    }

    /// <summary>
    /// Gets the first document or throws if none.
    /// </summary>
    public async Task<TDocument> FirstAsync(CancellationToken cancellationToken = default)
    {
        var result = await FirstOrDefaultAsync(cancellationToken);
        return result ?? throw new InvalidOperationException("Cursor contains no elements");
    }

    /// <summary>
    /// Gets the single document or null if none/multiple.
    /// </summary>
    public async Task<TDocument?> SingleOrDefaultAsync(CancellationToken cancellationToken = default)
    {
        if (_closed) return default;
        await EnsureFetchedAsync(cancellationToken);
        if (_buffer is null || _buffer.Count == 0) return default;
        if (_buffer.Count > 1) throw new InvalidOperationException("Cursor contains more than one element");
        await CloseAsync();
        return _buffer[0];
    }

    /// <summary>
    /// Gets the single document or throws if none/multiple.
    /// </summary>
    public async Task<TDocument> SingleAsync(CancellationToken cancellationToken = default)
    {
        var result = await SingleOrDefaultAsync(cancellationToken);
        return result ?? throw new InvalidOperationException("Cursor contains no elements");
    }

    /// <summary>
    /// Checks if any documents exist.
    /// </summary>
    public async Task<bool> AnyAsync(CancellationToken cancellationToken = default)
    {
        if (_closed) return false;
        await EnsureFetchedAsync(cancellationToken);
        return _buffer is not null && _buffer.Count > 0;
    }

    /// <summary>
    /// Counts remaining documents.
    /// </summary>
    public async Task<int> CountAsync(CancellationToken cancellationToken = default)
    {
        if (_closed) return 0;
        await EnsureFetchedAsync(cancellationToken);
        return _buffer?.Count - _position ?? 0;
    }

    /// <summary>
    /// Iterates over all documents.
    /// </summary>
    public async Task ForEachAsync(Func<TDocument, Task> action, CancellationToken cancellationToken = default)
    {
        await foreach (var doc in WithCancellation(cancellationToken))
        {
            await action(doc);
        }
    }

    /// <summary>
    /// Iterates over all documents.
    /// </summary>
    public async Task ForEachAsync(Action<TDocument> action, CancellationToken cancellationToken = default)
    {
        await foreach (var doc in WithCancellation(cancellationToken))
        {
            action(doc);
        }
    }

    /// <summary>
    /// Iterates over all documents with index.
    /// </summary>
    public async Task ForEachAsync(Func<TDocument, int, Task> action, CancellationToken cancellationToken = default)
    {
        var index = 0;
        await foreach (var doc in WithCancellation(cancellationToken))
        {
            await action(doc, index++);
        }
    }

    /// <summary>
    /// Closes the cursor.
    /// </summary>
    public Task CloseAsync()
    {
        if (_closed) return Task.CompletedTask;
        _closed = true;
        _buffer = null;
        _position = 0;
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public ValueTask DisposeAsync()
    {
        return new ValueTask(CloseAsync());
    }

    /// <inheritdoc />
    public async IAsyncEnumerator<TDocument> GetAsyncEnumerator(CancellationToken cancellationToken = default)
    {
        try
        {
            while (await MoveNextAsync(cancellationToken))
            {
                var doc = await NextAsync(cancellationToken);
                if (doc is not null)
                {
                    yield return doc;
                }
            }
        }
        finally
        {
            await CloseAsync();
        }
    }

    /// <summary>
    /// Configures cancellation for async enumeration.
    /// </summary>
    public ConfiguredCancelableAsyncEnumerable<TDocument> WithCancellation(CancellationToken cancellationToken)
    {
        return this.ConfigureAwait(false).WithCancellation(cancellationToken);
    }
}

// ============================================================================
// FindCursor - Cursor for find operations with fluent API
// ============================================================================

/// <summary>
/// Fluent cursor for find operations.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class FindCursor<TDocument> : AbstractCursor<TDocument>
{
    private readonly object _filter;
    private Dictionary<string, int>? _sort;
    private int? _limit;
    private int? _skip;
    private Dictionary<string, int>? _projection;
    private string? _hint;
    private int? _batchSize;
    private int? _maxTimeMS;
    private string? _comment;

    /// <summary>
    /// Creates a new find cursor.
    /// </summary>
    public FindCursor(IRpcTransport transport, string dbName, string collectionName, object filter)
        : base(transport, dbName, collectionName)
    {
        _filter = filter;
    }

    /// <summary>
    /// Sets the sort order.
    /// </summary>
    public FindCursor<TDocument> Sort(Dictionary<string, int> sort)
    {
        ThrowIfFetched();
        _sort = sort;
        return this;
    }

    /// <summary>
    /// Sets the sort order.
    /// </summary>
    public FindCursor<TDocument> Sort(string field, int direction = 1)
    {
        ThrowIfFetched();
        _sort = new Dictionary<string, int> { [field] = direction };
        return this;
    }

    /// <summary>
    /// Sets ascending sort order for a field.
    /// </summary>
    public FindCursor<TDocument> SortAscending(string field) => Sort(field, 1);

    /// <summary>
    /// Sets descending sort order for a field.
    /// </summary>
    public FindCursor<TDocument> SortDescending(string field) => Sort(field, -1);

    /// <summary>
    /// Limits the number of results.
    /// </summary>
    public FindCursor<TDocument> Limit(int limit)
    {
        ThrowIfFetched();
        if (limit < 0) throw new ArgumentOutOfRangeException(nameof(limit), "Limit must be non-negative");
        _limit = limit;
        return this;
    }

    /// <summary>
    /// Skips a number of documents.
    /// </summary>
    public FindCursor<TDocument> Skip(int skip)
    {
        ThrowIfFetched();
        if (skip < 0) throw new ArgumentOutOfRangeException(nameof(skip), "Skip must be non-negative");
        _skip = skip;
        return this;
    }

    /// <summary>
    /// Sets the projection.
    /// </summary>
    public FindCursor<TDocument> Project(Dictionary<string, int> projection)
    {
        ThrowIfFetched();
        _projection = projection;
        return this;
    }

    /// <summary>
    /// Sets the projection to include specific fields.
    /// </summary>
    public FindCursor<TDocument> Project(params string[] fields)
    {
        ThrowIfFetched();
        _projection = fields.ToDictionary(f => f, _ => 1);
        return this;
    }

    /// <summary>
    /// Sets the query hint.
    /// </summary>
    public FindCursor<TDocument> Hint(string hint)
    {
        ThrowIfFetched();
        _hint = hint;
        return this;
    }

    /// <summary>
    /// Sets the batch size.
    /// </summary>
    public FindCursor<TDocument> BatchSize(int batchSize)
    {
        ThrowIfFetched();
        _batchSize = batchSize;
        return this;
    }

    /// <summary>
    /// Sets the maximum execution time.
    /// </summary>
    public FindCursor<TDocument> MaxTimeMS(int maxTimeMS)
    {
        ThrowIfFetched();
        _maxTimeMS = maxTimeMS;
        return this;
    }

    /// <summary>
    /// Sets a comment for the query.
    /// </summary>
    public FindCursor<TDocument> Comment(string comment)
    {
        ThrowIfFetched();
        _comment = comment;
        return this;
    }

    /// <inheritdoc />
    protected override async Task<List<TDocument>> FetchDataAsync(CancellationToken cancellationToken)
    {
        var options = new Dictionary<string, object?>();
        if (_sort is not null) options["sort"] = _sort;
        if (_limit.HasValue) options["limit"] = _limit.Value;
        if (_skip.HasValue) options["skip"] = _skip.Value;
        if (_projection is not null) options["projection"] = _projection;
        if (_hint is not null) options["hint"] = _hint;
        if (_batchSize.HasValue) options["batchSize"] = _batchSize.Value;
        if (_maxTimeMS.HasValue) options["maxTimeMS"] = _maxTimeMS.Value;
        if (_comment is not null) options["comment"] = _comment;

        var result = await _transport.CallAsync("find", cancellationToken, _dbName, _collectionName, _filter, options);
        return ConvertResult(result);
    }

    /// <summary>
    /// Clones the cursor with current options.
    /// </summary>
    public FindCursor<TDocument> Clone()
    {
        var clone = new FindCursor<TDocument>(_transport, _dbName, _collectionName, _filter)
        {
            _sort = _sort is null ? null : new Dictionary<string, int>(_sort),
            _limit = _limit,
            _skip = _skip,
            _projection = _projection is null ? null : new Dictionary<string, int>(_projection),
            _hint = _hint,
            _batchSize = _batchSize,
            _maxTimeMS = _maxTimeMS,
            _comment = _comment
        };
        return clone;
    }

    /// <summary>
    /// Rewinds the cursor to the beginning.
    /// </summary>
    public void Rewind()
    {
        _position = 0;
        _fetched = false;
        _closed = false;
        _buffer = null;
    }

    private void ThrowIfFetched()
    {
        if (_fetched)
            throw new InvalidOperationException("Cannot modify cursor after data has been fetched");
    }

    private static List<TDocument> ConvertResult(object? result)
    {
        if (result is null) return [];
        if (result is List<TDocument> list) return list;
        if (result is IEnumerable<TDocument> enumerable) return enumerable.ToList();
        if (result is IEnumerable<object> objects)
        {
            return objects.Select(o => ConvertDocument(o)).ToList();
        }
        return [];
    }

    private static TDocument ConvertDocument(object obj)
    {
        if (obj is TDocument doc) return doc;
        if (typeof(TDocument) == typeof(BsonDocument) && obj is Dictionary<string, object?> dict)
        {
            var bsonDoc = new BsonDocument();
            foreach (var (key, value) in dict)
            {
                bsonDoc.Add(key, BsonValue.FromObject(value));
            }
            return (TDocument)(object)bsonDoc;
        }
        throw new InvalidCastException($"Cannot convert {obj.GetType()} to {typeof(TDocument)}");
    }
}

// ============================================================================
// AggregationCursor - Cursor for aggregation pipeline results
// ============================================================================

/// <summary>
/// Cursor for aggregation pipeline results.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class AggregationCursor<TDocument> : AbstractCursor<TDocument>
{
    private readonly object[] _pipeline;
    private readonly Dictionary<string, object?>? _options;

    /// <summary>
    /// Creates a new aggregation cursor.
    /// </summary>
    public AggregationCursor(
        IRpcTransport transport,
        string dbName,
        string collectionName,
        object[] pipeline,
        Dictionary<string, object?>? options = null)
        : base(transport, dbName, collectionName)
    {
        _pipeline = pipeline;
        _options = options;
    }

    /// <inheritdoc />
    protected override async Task<List<TDocument>> FetchDataAsync(CancellationToken cancellationToken)
    {
        var result = await _transport.CallAsync("aggregate", cancellationToken, _dbName, _collectionName, _pipeline, _options ?? new());
        return ConvertResult(result);
    }

    private static List<TDocument> ConvertResult(object? result)
    {
        if (result is null) return [];
        if (result is List<TDocument> list) return list;
        if (result is IEnumerable<TDocument> enumerable) return enumerable.ToList();
        if (result is IEnumerable<object> objects)
        {
            return objects.Select(o => ConvertDocument(o)).ToList();
        }
        return [];
    }

    private static TDocument ConvertDocument(object obj)
    {
        if (obj is TDocument doc) return doc;
        if (typeof(TDocument) == typeof(BsonDocument) && obj is Dictionary<string, object?> dict)
        {
            var bsonDoc = new BsonDocument();
            foreach (var (key, value) in dict)
            {
                bsonDoc.Add(key, BsonValue.FromObject(value));
            }
            return (TDocument)(object)bsonDoc;
        }
        throw new InvalidCastException($"Cannot convert {obj.GetType()} to {typeof(TDocument)}");
    }
}

// ============================================================================
// ChangeStreamCursor - Cursor for change stream events
// ============================================================================

/// <summary>
/// Cursor for MongoDB change stream events.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class ChangeStreamCursor<TDocument> : IAsyncEnumerable<ChangeStreamDocument<TDocument>>, IAsyncDisposable
{
    private readonly IRpcTransport _transport;
    private readonly string _dbName;
    private readonly string _collectionName;
    private readonly object[]? _pipeline;
    private readonly Dictionary<string, object?>? _options;
    private bool _closed;

    /// <summary>
    /// Creates a new change stream cursor.
    /// </summary>
    public ChangeStreamCursor(
        IRpcTransport transport,
        string dbName,
        string collectionName,
        object[]? pipeline = null,
        Dictionary<string, object?>? options = null)
    {
        _transport = transport;
        _dbName = dbName;
        _collectionName = collectionName;
        _pipeline = pipeline;
        _options = options;
        _closed = false;
    }

    /// <summary>
    /// Gets whether the cursor is closed.
    /// </summary>
    public bool IsClosed => _closed;

    /// <inheritdoc />
    public async IAsyncEnumerator<ChangeStreamDocument<TDocument>> GetAsyncEnumerator(CancellationToken cancellationToken = default)
    {
        // Subscribe to the change stream
        await _transport.CallAsync("watch", cancellationToken, _dbName, _collectionName, _pipeline ?? [], _options ?? new());

        // In a real implementation, this would receive events from the server
        // For now, we simulate an empty stream that completes
        await Task.Yield();
        yield break;
    }

    /// <summary>
    /// Closes the change stream.
    /// </summary>
    public Task CloseAsync()
    {
        _closed = true;
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public ValueTask DisposeAsync()
    {
        return new ValueTask(CloseAsync());
    }
}

/// <summary>
/// Represents a change stream event document.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class ChangeStreamDocument<TDocument>
{
    /// <summary>
    /// Gets or sets the operation type.
    /// </summary>
    public required string OperationType { get; init; }

    /// <summary>
    /// Gets or sets the document namespace.
    /// </summary>
    public required ChangeStreamNamespace Ns { get; init; }

    /// <summary>
    /// Gets or sets the document key.
    /// </summary>
    public BsonDocument? DocumentKey { get; init; }

    /// <summary>
    /// Gets or sets the full document.
    /// </summary>
    public TDocument? FullDocument { get; init; }

    /// <summary>
    /// Gets or sets the full document before change.
    /// </summary>
    public TDocument? FullDocumentBeforeChange { get; init; }

    /// <summary>
    /// Gets or sets the update description.
    /// </summary>
    public UpdateDescription? UpdateDescription { get; init; }

    /// <summary>
    /// Gets or sets the cluster time.
    /// </summary>
    public BsonValue? ClusterTime { get; init; }

    /// <summary>
    /// Gets or sets the wall time.
    /// </summary>
    public DateTime? WallTime { get; init; }
}

/// <summary>
/// Change stream namespace information.
/// </summary>
public class ChangeStreamNamespace
{
    /// <summary>
    /// Gets or sets the database name.
    /// </summary>
    public required string Db { get; init; }

    /// <summary>
    /// Gets or sets the collection name.
    /// </summary>
    public required string Coll { get; init; }
}

/// <summary>
/// Update description for change stream update events.
/// </summary>
public class UpdateDescription
{
    /// <summary>
    /// Gets or sets the updated fields.
    /// </summary>
    public BsonDocument? UpdatedFields { get; init; }

    /// <summary>
    /// Gets or sets the removed fields.
    /// </summary>
    public List<string>? RemovedFields { get; init; }

    /// <summary>
    /// Gets or sets the truncated arrays.
    /// </summary>
    public List<TruncatedArray>? TruncatedArrays { get; init; }
}

/// <summary>
/// Truncated array information.
/// </summary>
public class TruncatedArray
{
    /// <summary>
    /// Gets or sets the field path.
    /// </summary>
    public required string Field { get; init; }

    /// <summary>
    /// Gets or sets the new size.
    /// </summary>
    public required int NewSize { get; init; }
}
