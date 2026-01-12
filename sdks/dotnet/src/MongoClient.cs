// ============================================================================
// MongoClient - MongoDB client and Builders API
// ============================================================================

using System.Linq.Expressions;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Mongo.Do;

// ============================================================================
// MongoClient - Main client class
// ============================================================================

/// <summary>
/// MongoDB client for connecting to a mongo.do server.
/// </summary>
public class MongoClient : IAsyncDisposable, IDisposable
{
    private readonly string _connectionString;
    private readonly MongoClientSettings _settings;
    private readonly IRpcTransport _transport;
    private readonly Dictionary<string, MongoDatabase> _databases = new();
    private bool _disposed;

    /// <summary>
    /// Creates a new MongoDB client with the specified connection string.
    /// </summary>
    /// <param name="connectionString">The connection string (URL to the mongo.do server).</param>
    public MongoClient(string connectionString) : this(connectionString, new MongoClientSettings())
    {
    }

    /// <summary>
    /// Creates a new MongoDB client with the specified connection string and settings.
    /// </summary>
    /// <param name="connectionString">The connection string.</param>
    /// <param name="settings">Client settings.</param>
    public MongoClient(string connectionString, MongoClientSettings settings)
    {
        _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
        _settings = settings ?? throw new ArgumentNullException(nameof(settings));
        _transport = new WebSocketRpcTransport(connectionString, settings);
    }

    /// <summary>
    /// Creates a new MongoDB client with a custom RPC transport (for testing).
    /// </summary>
    /// <param name="transport">The RPC transport to use.</param>
    internal MongoClient(IRpcTransport transport)
    {
        _connectionString = "mock://localhost";
        _settings = new MongoClientSettings();
        _transport = transport ?? throw new ArgumentNullException(nameof(transport));
    }

    /// <summary>
    /// Gets the connection string.
    /// </summary>
    public string ConnectionString => _connectionString;

    /// <summary>
    /// Gets the client settings.
    /// </summary>
    public MongoClientSettings Settings => _settings;

    /// <summary>
    /// Gets a database by name.
    /// </summary>
    /// <param name="name">The database name.</param>
    /// <returns>The database.</returns>
    public MongoDatabase GetDatabase(string name)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        if (!_databases.TryGetValue(name, out var database))
        {
            database = new MongoDatabase(_transport, name);
            _databases[name] = database;
        }
        return database;
    }

    /// <summary>
    /// Lists all database names.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Database names.</returns>
    public async Task<List<string>> ListDatabaseNamesAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        var result = await _transport.CallAsync("listDatabaseNames", cancellationToken);
        if (result is IEnumerable<object> names)
        {
            return names.Select(n => n.ToString()!).ToList();
        }
        return [];
    }

    /// <summary>
    /// Lists all databases.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Database information documents.</returns>
    public async Task<List<BsonDocument>> ListDatabasesAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        var result = await _transport.CallAsync("listDatabases", cancellationToken);
        if (result is IEnumerable<object> databases)
        {
            return databases.Select(ConvertToBsonDocument).ToList();
        }
        return [];
    }

    /// <summary>
    /// Drops a database.
    /// </summary>
    /// <param name="name">The database name.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async Task DropDatabaseAsync(string name, CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        await _transport.CallAsync("dropDatabase", cancellationToken, name);
        _databases.Remove(name);
    }

    /// <summary>
    /// Starts a client session.
    /// </summary>
    /// <param name="options">Session options.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A client session.</returns>
    public async Task<IClientSession> StartSessionAsync(
        ClientSessionOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        var sessionId = await _transport.CallAsync("startSession", cancellationToken, options ?? new());
        return new ClientSession(this, _transport, sessionId?.ToString() ?? Guid.NewGuid().ToString(), options);
    }

    /// <summary>
    /// Watches for changes across all collections in all databases.
    /// </summary>
    public ChangeStreamCursor<BsonDocument> Watch(
        IEnumerable<object>? pipeline = null,
        Dictionary<string, object?>? options = null)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        return new ChangeStreamCursor<BsonDocument>(_transport, string.Empty, string.Empty, pipeline?.ToArray(), options);
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        await _transport.CloseAsync();
        GC.SuppressFinalize(this);
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _transport.CloseAsync().GetAwaiter().GetResult();
        GC.SuppressFinalize(this);
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

// ============================================================================
// MongoClientSettings
// ============================================================================

/// <summary>
/// Settings for the MongoDB client.
/// </summary>
public class MongoClientSettings
{
    /// <summary>
    /// Gets or sets the connection timeout.
    /// </summary>
    public TimeSpan ConnectTimeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Gets or sets the server selection timeout.
    /// </summary>
    public TimeSpan ServerSelectionTimeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Gets or sets the socket timeout.
    /// </summary>
    public TimeSpan SocketTimeout { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Gets or sets the maximum connection pool size.
    /// </summary>
    public int MaxConnectionPoolSize { get; set; } = 100;

    /// <summary>
    /// Gets or sets the minimum connection pool size.
    /// </summary>
    public int MinConnectionPoolSize { get; set; } = 0;

    /// <summary>
    /// Gets or sets whether to retry reads.
    /// </summary>
    public bool RetryReads { get; set; } = true;

    /// <summary>
    /// Gets or sets whether to retry writes.
    /// </summary>
    public bool RetryWrites { get; set; } = true;

    /// <summary>
    /// Gets or sets the application name.
    /// </summary>
    public string? ApplicationName { get; set; }

    /// <summary>
    /// Gets or sets the authentication token.
    /// </summary>
    public string? AuthToken { get; set; }
}

// ============================================================================
// ClientSession
// ============================================================================

/// <summary>
/// Interface for client sessions.
/// </summary>
public interface IClientSession : IAsyncDisposable
{
    /// <summary>
    /// Gets the session ID.
    /// </summary>
    string SessionId { get; }

    /// <summary>
    /// Gets whether a transaction is in progress.
    /// </summary>
    bool IsInTransaction { get; }

    /// <summary>
    /// Starts a transaction.
    /// </summary>
    void StartTransaction(TransactionOptions? options = null);

    /// <summary>
    /// Commits the current transaction.
    /// </summary>
    Task CommitTransactionAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Aborts the current transaction.
    /// </summary>
    Task AbortTransactionAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Executes a function within a transaction.
    /// </summary>
    Task<TResult> WithTransactionAsync<TResult>(
        Func<IClientSession, CancellationToken, Task<TResult>> callback,
        TransactionOptions? options = null,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Client session implementation.
/// </summary>
internal class ClientSession : IClientSession
{
    private readonly MongoClient _client;
    private readonly IRpcTransport _transport;
    private readonly ClientSessionOptions? _options;
    private bool _inTransaction;
    private bool _disposed;

    public ClientSession(MongoClient client, IRpcTransport transport, string sessionId, ClientSessionOptions? options)
    {
        _client = client;
        _transport = transport;
        SessionId = sessionId;
        _options = options;
    }

    public string SessionId { get; }

    public bool IsInTransaction => _inTransaction;

    public void StartTransaction(TransactionOptions? options = null)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_inTransaction) throw new InvalidOperationException("Transaction already in progress");
        _inTransaction = true;
    }

    public async Task CommitTransactionAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (!_inTransaction) throw new InvalidOperationException("No transaction in progress");

        await _transport.CallAsync("commitTransaction", cancellationToken, SessionId);
        _inTransaction = false;
    }

    public async Task AbortTransactionAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (!_inTransaction) throw new InvalidOperationException("No transaction in progress");

        await _transport.CallAsync("abortTransaction", cancellationToken, SessionId);
        _inTransaction = false;
    }

    public async Task<TResult> WithTransactionAsync<TResult>(
        Func<IClientSession, CancellationToken, Task<TResult>> callback,
        TransactionOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);

        StartTransaction(options);
        try
        {
            var result = await callback(this, cancellationToken);
            await CommitTransactionAsync(cancellationToken);
            return result;
        }
        catch
        {
            await AbortTransactionAsync(cancellationToken);
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;

        if (_inTransaction)
        {
            try
            {
                await AbortTransactionAsync();
            }
            catch
            {
                // Ignore errors during cleanup
            }
        }

        await _transport.CallAsync("endSession", CancellationToken.None, SessionId);
    }
}

/// <summary>
/// Options for client sessions.
/// </summary>
public class ClientSessionOptions
{
    /// <summary>
    /// Gets or sets whether causal consistency is enabled.
    /// </summary>
    public bool CausalConsistency { get; set; } = true;

    /// <summary>
    /// Gets or sets the default transaction options.
    /// </summary>
    public TransactionOptions? DefaultTransactionOptions { get; set; }
}

/// <summary>
/// Options for transactions.
/// </summary>
public class TransactionOptions
{
    /// <summary>
    /// Gets or sets the read concern.
    /// </summary>
    public string? ReadConcern { get; set; }

    /// <summary>
    /// Gets or sets the write concern.
    /// </summary>
    public string? WriteConcern { get; set; }

    /// <summary>
    /// Gets or sets the read preference.
    /// </summary>
    public string? ReadPreference { get; set; }

    /// <summary>
    /// Gets or sets the maximum commit time.
    /// </summary>
    public TimeSpan? MaxCommitTime { get; set; }
}

// ============================================================================
// WebSocketRpcTransport - RPC transport over WebSocket
// ============================================================================

/// <summary>
/// RPC transport implementation using WebSocket.
/// </summary>
internal class WebSocketRpcTransport : IRpcTransport
{
    private readonly string _url;
    private readonly MongoClientSettings _settings;
    private ClientWebSocket? _webSocket;
    private bool _connected;
    private int _messageId;
    private readonly Dictionary<int, TaskCompletionSource<object?>> _pendingRequests = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private CancellationTokenSource? _receiveLoopCts;
    private Task? _receiveLoopTask;

    public WebSocketRpcTransport(string url, MongoClientSettings settings)
    {
        _url = url;
        _settings = settings;
    }

    public async Task<object?> CallAsync(string method, params object?[] args)
    {
        return await CallAsync(method, CancellationToken.None, args);
    }

    public async Task<object?> CallAsync(string method, CancellationToken cancellationToken, params object?[] args)
    {
        await EnsureConnectedAsync(cancellationToken);

        var messageId = Interlocked.Increment(ref _messageId);

        var request = new JsonObject
        {
            ["id"] = messageId,
            ["method"] = method,
            ["params"] = JsonSerializer.SerializeToNode(args)
        };

        var tcs = new TaskCompletionSource<object?>();
        _pendingRequests[messageId] = tcs;

        try
        {
            var json = request.ToJsonString();
            var bytes = Encoding.UTF8.GetBytes(json);

            await _sendLock.WaitAsync(cancellationToken);
            try
            {
                await _webSocket!.SendAsync(
                    new ArraySegment<byte>(bytes),
                    WebSocketMessageType.Text,
                    true,
                    cancellationToken);
            }
            finally
            {
                _sendLock.Release();
            }

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(_settings.SocketTimeout);

            return await tcs.Task.WaitAsync(cts.Token);
        }
        finally
        {
            _pendingRequests.Remove(messageId);
        }
    }

    public async Task CloseAsync()
    {
        _receiveLoopCts?.Cancel();

        if (_webSocket is { State: WebSocketState.Open })
        {
            try
            {
                await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Client closed", CancellationToken.None);
            }
            catch
            {
                // Ignore errors during close
            }
        }

        if (_receiveLoopTask is not null)
        {
            try
            {
                await _receiveLoopTask;
            }
            catch
            {
                // Ignore
            }
        }

        _webSocket?.Dispose();
        _receiveLoopCts?.Dispose();
        _sendLock.Dispose();
        _connected = false;
    }

    private async Task EnsureConnectedAsync(CancellationToken cancellationToken)
    {
        if (_connected && _webSocket?.State == WebSocketState.Open) return;

        _webSocket = new ClientWebSocket();

        var wsUrl = _url
            .Replace("http://", "ws://")
            .Replace("https://", "wss://");

        if (_settings.AuthToken is not null)
        {
            _webSocket.Options.SetRequestHeader("Authorization", $"Bearer {_settings.AuthToken}");
        }

        if (_settings.ApplicationName is not null)
        {
            _webSocket.Options.SetRequestHeader("X-Application-Name", _settings.ApplicationName);
        }

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(_settings.ConnectTimeout);

        await _webSocket.ConnectAsync(new Uri(wsUrl), cts.Token);
        _connected = true;

        _receiveLoopCts = new CancellationTokenSource();
        _receiveLoopTask = ReceiveLoopAsync(_receiveLoopCts.Token);
    }

    private async Task ReceiveLoopAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[16384];

        try
        {
            while (!cancellationToken.IsCancellationRequested && _webSocket?.State == WebSocketState.Open)
            {
                var result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    var response = JsonNode.Parse(json);

                    if (response?["id"]?.GetValue<int>() is int id && _pendingRequests.TryGetValue(id, out var tcs))
                    {
                        if (response["error"] is not null)
                        {
                            var errorMessage = response["error"]?["message"]?.GetValue<string>() ?? "Unknown error";
                            tcs.SetException(new MongoException(errorMessage));
                        }
                        else
                        {
                            var resultNode = response["result"];
                            tcs.SetResult(ConvertJsonNode(resultNode));
                        }
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal cancellation
        }
        catch (Exception ex)
        {
            foreach (var (_, tcs) in _pendingRequests)
            {
                tcs.TrySetException(new MongoException($"Connection lost: {ex.Message}"));
            }
        }
    }

    private static object? ConvertJsonNode(JsonNode? node)
    {
        return node switch
        {
            null => null,
            JsonValue val => val.GetValueKind() switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Number when val.TryGetValue<int>(out var i) => i,
                JsonValueKind.Number when val.TryGetValue<long>(out var l) => l,
                JsonValueKind.Number => val.GetValue<double>(),
                JsonValueKind.String => val.GetValue<string>(),
                _ => null
            },
            JsonArray arr => arr.Select(ConvertJsonNode).ToList(),
            JsonObject obj => obj.ToDictionary(kvp => kvp.Key, kvp => ConvertJsonNode(kvp.Value)),
            _ => null
        };
    }
}

// MongoException is defined in MongoExceptions.cs

// ============================================================================
// Builders<TDocument> - Fluent builders for filters, updates, etc.
// ============================================================================

/// <summary>
/// Provides builders for filters, updates, projections, and sorts.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public static class Builders<TDocument>
{
    /// <summary>
    /// Gets the filter builder.
    /// </summary>
    public static FilterDefinitionBuilder<TDocument> Filter => new();

    /// <summary>
    /// Gets the update builder.
    /// </summary>
    public static UpdateDefinitionBuilder<TDocument> Update => new();

    /// <summary>
    /// Gets the projection builder.
    /// </summary>
    public static ProjectionDefinitionBuilder<TDocument> Projection => new();

    /// <summary>
    /// Gets the sort builder.
    /// </summary>
    public static SortDefinitionBuilder<TDocument> Sort => new();

    /// <summary>
    /// Gets the index keys builder.
    /// </summary>
    public static IndexKeysDefinitionBuilder<TDocument> IndexKeys => new();
}

// ============================================================================
// FilterDefinition<TDocument>
// ============================================================================

/// <summary>
/// Represents a filter definition.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public abstract class FilterDefinition<TDocument>
{
    /// <summary>
    /// Gets an empty filter that matches all documents.
    /// </summary>
    public static FilterDefinition<TDocument> Empty => new BsonDocumentFilterDefinition<TDocument>(new BsonDocument());

    /// <summary>
    /// Renders the filter to a BsonDocument.
    /// </summary>
    public abstract BsonDocument Render();

    /// <summary>
    /// Combines filters with AND.
    /// </summary>
    public static FilterDefinition<TDocument> operator &(FilterDefinition<TDocument> a, FilterDefinition<TDocument> b)
    {
        return new CombinedFilterDefinition<TDocument>("$and", a, b);
    }

    /// <summary>
    /// Combines filters with OR.
    /// </summary>
    public static FilterDefinition<TDocument> operator |(FilterDefinition<TDocument> a, FilterDefinition<TDocument> b)
    {
        return new CombinedFilterDefinition<TDocument>("$or", a, b);
    }

    /// <summary>
    /// Negates a filter.
    /// </summary>
    public static FilterDefinition<TDocument> operator !(FilterDefinition<TDocument> filter)
    {
        return new NotFilterDefinition<TDocument>(filter);
    }

    /// <summary>
    /// Implicit conversion from BsonDocument.
    /// </summary>
    public static implicit operator FilterDefinition<TDocument>(BsonDocument document)
    {
        return new BsonDocumentFilterDefinition<TDocument>(document);
    }
}

/// <summary>
/// Filter definition from a BsonDocument.
/// </summary>
internal class BsonDocumentFilterDefinition<TDocument> : FilterDefinition<TDocument>
{
    private readonly BsonDocument _document;

    public BsonDocumentFilterDefinition(BsonDocument document) => _document = document;

    public override BsonDocument Render() => _document;
}

/// <summary>
/// Filter definition from an expression.
/// </summary>
internal class ExpressionFilterDefinition<TDocument> : FilterDefinition<TDocument>
{
    private readonly Expression<Func<TDocument, bool>> _expression;

    public ExpressionFilterDefinition(Expression<Func<TDocument, bool>> expression) => _expression = expression;

    public override BsonDocument Render()
    {
        // Simple expression rendering - in a full implementation, this would
        // parse the expression tree and convert to MongoDB query operators
        return new BsonDocument("$expr", new BsonString(_expression.ToString()));
    }
}

/// <summary>
/// Combined filter definition.
/// </summary>
internal class CombinedFilterDefinition<TDocument> : FilterDefinition<TDocument>
{
    private readonly string _operator;
    private readonly FilterDefinition<TDocument> _a;
    private readonly FilterDefinition<TDocument> _b;

    public CombinedFilterDefinition(string op, FilterDefinition<TDocument> a, FilterDefinition<TDocument> b)
    {
        _operator = op;
        _a = a;
        _b = b;
    }

    public override BsonDocument Render()
    {
        return new BsonDocument(_operator, new BsonArray { _a.Render(), _b.Render() });
    }
}

/// <summary>
/// Negated filter definition.
/// </summary>
internal class NotFilterDefinition<TDocument> : FilterDefinition<TDocument>
{
    private readonly FilterDefinition<TDocument> _filter;

    public NotFilterDefinition(FilterDefinition<TDocument> filter) => _filter = filter;

    public override BsonDocument Render()
    {
        return new BsonDocument("$nor", new BsonArray { _filter.Render() });
    }
}

/// <summary>
/// Simple field filter definition.
/// </summary>
internal class SimpleFilterDefinition<TDocument> : FilterDefinition<TDocument>
{
    private readonly string _field;
    private readonly string? _operator;
    private readonly BsonValue _value;

    public SimpleFilterDefinition(string field, BsonValue value)
    {
        _field = field;
        _operator = null;
        _value = value;
    }

    public SimpleFilterDefinition(string field, string op, BsonValue value)
    {
        _field = field;
        _operator = op;
        _value = value;
    }

    public override BsonDocument Render()
    {
        if (_operator is null)
        {
            return new BsonDocument(_field, _value);
        }
        return new BsonDocument(_field, new BsonDocument(_operator, _value));
    }
}

// ============================================================================
// FilterDefinitionBuilder<TDocument>
// ============================================================================

/// <summary>
/// Builder for filter definitions.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class FilterDefinitionBuilder<TDocument>
{
    /// <summary>
    /// Gets an empty filter that matches all documents.
    /// </summary>
    public FilterDefinition<TDocument> Empty => FilterDefinition<TDocument>.Empty;

    /// <summary>
    /// Creates an equality filter.
    /// </summary>
    public FilterDefinition<TDocument> Eq<TField>(string field, TField value)
    {
        return new SimpleFilterDefinition<TDocument>(field, BsonValue.FromObject(value));
    }

    /// <summary>
    /// Creates a not-equal filter.
    /// </summary>
    public FilterDefinition<TDocument> Ne<TField>(string field, TField value)
    {
        return new SimpleFilterDefinition<TDocument>(field, "$ne", BsonValue.FromObject(value));
    }

    /// <summary>
    /// Creates a greater-than filter.
    /// </summary>
    public FilterDefinition<TDocument> Gt<TField>(string field, TField value)
    {
        return new SimpleFilterDefinition<TDocument>(field, "$gt", BsonValue.FromObject(value));
    }

    /// <summary>
    /// Creates a greater-than-or-equal filter.
    /// </summary>
    public FilterDefinition<TDocument> Gte<TField>(string field, TField value)
    {
        return new SimpleFilterDefinition<TDocument>(field, "$gte", BsonValue.FromObject(value));
    }

    /// <summary>
    /// Creates a less-than filter.
    /// </summary>
    public FilterDefinition<TDocument> Lt<TField>(string field, TField value)
    {
        return new SimpleFilterDefinition<TDocument>(field, "$lt", BsonValue.FromObject(value));
    }

    /// <summary>
    /// Creates a less-than-or-equal filter.
    /// </summary>
    public FilterDefinition<TDocument> Lte<TField>(string field, TField value)
    {
        return new SimpleFilterDefinition<TDocument>(field, "$lte", BsonValue.FromObject(value));
    }

    /// <summary>
    /// Creates an in filter.
    /// </summary>
    public FilterDefinition<TDocument> In<TField>(string field, IEnumerable<TField> values)
    {
        var array = new BsonArray(values.Select(v => BsonValue.FromObject(v)));
        return new SimpleFilterDefinition<TDocument>(field, "$in", array);
    }

    /// <summary>
    /// Creates a not-in filter.
    /// </summary>
    public FilterDefinition<TDocument> Nin<TField>(string field, IEnumerable<TField> values)
    {
        var array = new BsonArray(values.Select(v => BsonValue.FromObject(v)));
        return new SimpleFilterDefinition<TDocument>(field, "$nin", array);
    }

    /// <summary>
    /// Creates an exists filter.
    /// </summary>
    public FilterDefinition<TDocument> Exists(string field, bool exists = true)
    {
        return new SimpleFilterDefinition<TDocument>(field, "$exists", exists ? BsonBoolean.True : BsonBoolean.False);
    }

    /// <summary>
    /// Creates a type filter.
    /// </summary>
    public FilterDefinition<TDocument> Type(string field, BsonType type)
    {
        return new SimpleFilterDefinition<TDocument>(field, "$type", new BsonInt32((int)type));
    }

    /// <summary>
    /// Creates a regex filter.
    /// </summary>
    public FilterDefinition<TDocument> Regex(string field, string pattern, string? options = null)
    {
        var doc = new BsonDocument("$regex", new BsonString(pattern));
        if (options is not null) doc.Add("$options", new BsonString(options));
        return new BsonDocumentFilterDefinition<TDocument>(new BsonDocument(field, doc));
    }

    /// <summary>
    /// Creates a text search filter.
    /// </summary>
    public FilterDefinition<TDocument> Text(string search, string? language = null)
    {
        var doc = new BsonDocument("$search", new BsonString(search));
        if (language is not null) doc.Add("$language", new BsonString(language));
        return new BsonDocumentFilterDefinition<TDocument>(new BsonDocument("$text", doc));
    }

    /// <summary>
    /// Creates an AND filter.
    /// </summary>
    public FilterDefinition<TDocument> And(params FilterDefinition<TDocument>[] filters)
    {
        var array = new BsonArray(filters.Select(f => f.Render()));
        return new BsonDocumentFilterDefinition<TDocument>(new BsonDocument("$and", array));
    }

    /// <summary>
    /// Creates an OR filter.
    /// </summary>
    public FilterDefinition<TDocument> Or(params FilterDefinition<TDocument>[] filters)
    {
        var array = new BsonArray(filters.Select(f => f.Render()));
        return new BsonDocumentFilterDefinition<TDocument>(new BsonDocument("$or", array));
    }

    /// <summary>
    /// Creates a NOR filter.
    /// </summary>
    public FilterDefinition<TDocument> Nor(params FilterDefinition<TDocument>[] filters)
    {
        var array = new BsonArray(filters.Select(f => f.Render()));
        return new BsonDocumentFilterDefinition<TDocument>(new BsonDocument("$nor", array));
    }

    /// <summary>
    /// Creates a NOT filter.
    /// </summary>
    public FilterDefinition<TDocument> Not(FilterDefinition<TDocument> filter)
    {
        return new NotFilterDefinition<TDocument>(filter);
    }

    /// <summary>
    /// Creates an elemMatch filter for arrays.
    /// </summary>
    public FilterDefinition<TDocument> ElemMatch<TItem>(string field, FilterDefinition<TItem> filter)
    {
        return new SimpleFilterDefinition<TDocument>(field, "$elemMatch", filter.Render());
    }

    /// <summary>
    /// Creates a size filter for arrays.
    /// </summary>
    public FilterDefinition<TDocument> Size(string field, int size)
    {
        return new SimpleFilterDefinition<TDocument>(field, "$size", new BsonInt32(size));
    }

    /// <summary>
    /// Creates an all filter for arrays.
    /// </summary>
    public FilterDefinition<TDocument> All<TItem>(string field, IEnumerable<TItem> values)
    {
        var array = new BsonArray(values.Select(v => BsonValue.FromObject(v)));
        return new SimpleFilterDefinition<TDocument>(field, "$all", array);
    }

    /// <summary>
    /// Creates a where filter.
    /// </summary>
    public FilterDefinition<TDocument> Where(string javascript)
    {
        return new BsonDocumentFilterDefinition<TDocument>(new BsonDocument("$where", new BsonString(javascript)));
    }
}

// ============================================================================
// UpdateDefinition<TDocument>
// ============================================================================

/// <summary>
/// Represents an update definition.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public abstract class UpdateDefinition<TDocument>
{
    /// <summary>
    /// Renders the update to a BsonDocument.
    /// </summary>
    public abstract BsonDocument Render();

    /// <summary>
    /// Combines update definitions.
    /// </summary>
    public static UpdateDefinition<TDocument> operator +(UpdateDefinition<TDocument> a, UpdateDefinition<TDocument> b)
    {
        return new CombinedUpdateDefinition<TDocument>(a, b);
    }

    /// <summary>
    /// Implicit conversion from BsonDocument.
    /// </summary>
    public static implicit operator UpdateDefinition<TDocument>(BsonDocument document)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(document);
    }
}

/// <summary>
/// Update definition from a BsonDocument.
/// </summary>
internal class BsonDocumentUpdateDefinition<TDocument> : UpdateDefinition<TDocument>
{
    private readonly BsonDocument _document;

    public BsonDocumentUpdateDefinition(BsonDocument document) => _document = document;

    public override BsonDocument Render() => _document;
}

/// <summary>
/// Combined update definition.
/// </summary>
internal class CombinedUpdateDefinition<TDocument> : UpdateDefinition<TDocument>
{
    private readonly UpdateDefinition<TDocument> _a;
    private readonly UpdateDefinition<TDocument> _b;

    public CombinedUpdateDefinition(UpdateDefinition<TDocument> a, UpdateDefinition<TDocument> b)
    {
        _a = a;
        _b = b;
    }

    public override BsonDocument Render()
    {
        var result = new BsonDocument();
        MergeUpdate(result, _a.Render());
        MergeUpdate(result, _b.Render());
        return result;
    }

    private static void MergeUpdate(BsonDocument target, BsonDocument source)
    {
        foreach (var (key, value) in source)
        {
            if (target.ContainsKey(key) && target[key] is BsonDocument existing && value is BsonDocument toMerge)
            {
                foreach (var (k, v) in toMerge)
                {
                    existing[k] = v;
                }
            }
            else
            {
                target[key] = value;
            }
        }
    }
}

// ============================================================================
// UpdateDefinitionBuilder<TDocument>
// ============================================================================

/// <summary>
/// Builder for update definitions.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class UpdateDefinitionBuilder<TDocument>
{
    /// <summary>
    /// Creates a $set update.
    /// </summary>
    public UpdateDefinition<TDocument> Set<TField>(string field, TField value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$set", new BsonDocument(field, BsonValue.FromObject(value))));
    }

    /// <summary>
    /// Creates a $setOnInsert update.
    /// </summary>
    public UpdateDefinition<TDocument> SetOnInsert<TField>(string field, TField value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$setOnInsert", new BsonDocument(field, BsonValue.FromObject(value))));
    }

    /// <summary>
    /// Creates an $unset update.
    /// </summary>
    public UpdateDefinition<TDocument> Unset(string field)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$unset", new BsonDocument(field, "")));
    }

    /// <summary>
    /// Creates an $inc update.
    /// </summary>
    public UpdateDefinition<TDocument> Inc(string field, long value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$inc", new BsonDocument(field, new BsonInt64(value))));
    }

    /// <summary>
    /// Creates an $inc update with double.
    /// </summary>
    public UpdateDefinition<TDocument> Inc(string field, double value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$inc", new BsonDocument(field, new BsonDouble(value))));
    }

    /// <summary>
    /// Creates a $mul update.
    /// </summary>
    public UpdateDefinition<TDocument> Mul(string field, long value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$mul", new BsonDocument(field, new BsonInt64(value))));
    }

    /// <summary>
    /// Creates a $mul update with double.
    /// </summary>
    public UpdateDefinition<TDocument> Mul(string field, double value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$mul", new BsonDocument(field, new BsonDouble(value))));
    }

    /// <summary>
    /// Creates a $min update.
    /// </summary>
    public UpdateDefinition<TDocument> Min<TField>(string field, TField value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$min", new BsonDocument(field, BsonValue.FromObject(value))));
    }

    /// <summary>
    /// Creates a $max update.
    /// </summary>
    public UpdateDefinition<TDocument> Max<TField>(string field, TField value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$max", new BsonDocument(field, BsonValue.FromObject(value))));
    }

    /// <summary>
    /// Creates a $rename update.
    /// </summary>
    public UpdateDefinition<TDocument> Rename(string field, string newName)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$rename", new BsonDocument(field, new BsonString(newName))));
    }

    /// <summary>
    /// Creates a $currentDate update.
    /// </summary>
    public UpdateDefinition<TDocument> CurrentDate(string field, bool useTimestamp = false)
    {
        var value = useTimestamp
            ? (BsonValue)new BsonDocument("$type", "timestamp")
            : BsonBoolean.True;
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$currentDate", new BsonDocument(field, value)));
    }

    /// <summary>
    /// Creates a $push update.
    /// </summary>
    public UpdateDefinition<TDocument> Push<TItem>(string field, TItem value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$push", new BsonDocument(field, BsonValue.FromObject(value))));
    }

    /// <summary>
    /// Creates a $push update with $each modifier.
    /// </summary>
    public UpdateDefinition<TDocument> PushEach<TItem>(string field, IEnumerable<TItem> values, int? slice = null, int? position = null)
    {
        var each = new BsonDocument("$each", new BsonArray(values.Select(v => BsonValue.FromObject(v))));
        if (slice.HasValue) each.Add("$slice", new BsonInt32(slice.Value));
        if (position.HasValue) each.Add("$position", new BsonInt32(position.Value));
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$push", new BsonDocument(field, each)));
    }

    /// <summary>
    /// Creates a $pull update.
    /// </summary>
    public UpdateDefinition<TDocument> Pull<TItem>(string field, TItem value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$pull", new BsonDocument(field, BsonValue.FromObject(value))));
    }

    /// <summary>
    /// Creates a $pullAll update.
    /// </summary>
    public UpdateDefinition<TDocument> PullAll<TItem>(string field, IEnumerable<TItem> values)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$pullAll", new BsonDocument(field, new BsonArray(values.Select(v => BsonValue.FromObject(v))))));
    }

    /// <summary>
    /// Creates a $pop update.
    /// </summary>
    public UpdateDefinition<TDocument> Pop(string field, bool fromEnd = true)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$pop", new BsonDocument(field, new BsonInt32(fromEnd ? 1 : -1))));
    }

    /// <summary>
    /// Creates an $addToSet update.
    /// </summary>
    public UpdateDefinition<TDocument> AddToSet<TItem>(string field, TItem value)
    {
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$addToSet", new BsonDocument(field, BsonValue.FromObject(value))));
    }

    /// <summary>
    /// Creates an $addToSet update with $each modifier.
    /// </summary>
    public UpdateDefinition<TDocument> AddToSetEach<TItem>(string field, IEnumerable<TItem> values)
    {
        var each = new BsonDocument("$each", new BsonArray(values.Select(v => BsonValue.FromObject(v))));
        return new BsonDocumentUpdateDefinition<TDocument>(
            new BsonDocument("$addToSet", new BsonDocument(field, each)));
    }

    /// <summary>
    /// Creates a combined update from multiple updates.
    /// </summary>
    public UpdateDefinition<TDocument> Combine(params UpdateDefinition<TDocument>[] updates)
    {
        if (updates.Length == 0) return new BsonDocumentUpdateDefinition<TDocument>(new BsonDocument());
        if (updates.Length == 1) return updates[0];

        UpdateDefinition<TDocument> result = updates[0];
        for (int i = 1; i < updates.Length; i++)
        {
            result = result + updates[i];
        }
        return result;
    }
}

// ============================================================================
// ProjectionDefinition<TDocument>
// ============================================================================

/// <summary>
/// Represents a projection definition.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public abstract class ProjectionDefinition<TDocument>
{
    /// <summary>
    /// Renders the projection to a BsonDocument.
    /// </summary>
    public abstract BsonDocument Render();

    /// <summary>
    /// Implicit conversion from BsonDocument.
    /// </summary>
    public static implicit operator ProjectionDefinition<TDocument>(BsonDocument document)
    {
        return new BsonDocumentProjectionDefinition<TDocument>(document);
    }
}

/// <summary>
/// Projection definition from a BsonDocument.
/// </summary>
internal class BsonDocumentProjectionDefinition<TDocument> : ProjectionDefinition<TDocument>
{
    private readonly BsonDocument _document;

    public BsonDocumentProjectionDefinition(BsonDocument document) => _document = document;

    public override BsonDocument Render() => _document;
}

/// <summary>
/// Builder for projection definitions.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class ProjectionDefinitionBuilder<TDocument>
{
    /// <summary>
    /// Includes a field.
    /// </summary>
    public ProjectionDefinition<TDocument> Include(string field)
    {
        return new BsonDocumentProjectionDefinition<TDocument>(new BsonDocument(field, 1));
    }

    /// <summary>
    /// Includes multiple fields.
    /// </summary>
    public ProjectionDefinition<TDocument> Include(params string[] fields)
    {
        var doc = new BsonDocument();
        foreach (var field in fields)
        {
            doc.Add(field, 1);
        }
        return new BsonDocumentProjectionDefinition<TDocument>(doc);
    }

    /// <summary>
    /// Excludes a field.
    /// </summary>
    public ProjectionDefinition<TDocument> Exclude(string field)
    {
        return new BsonDocumentProjectionDefinition<TDocument>(new BsonDocument(field, 0));
    }

    /// <summary>
    /// Excludes multiple fields.
    /// </summary>
    public ProjectionDefinition<TDocument> Exclude(params string[] fields)
    {
        var doc = new BsonDocument();
        foreach (var field in fields)
        {
            doc.Add(field, 0);
        }
        return new BsonDocumentProjectionDefinition<TDocument>(doc);
    }

    /// <summary>
    /// Excludes the _id field.
    /// </summary>
    public ProjectionDefinition<TDocument> ExcludeId()
    {
        return Exclude("_id");
    }

    /// <summary>
    /// Projects an array slice.
    /// </summary>
    public ProjectionDefinition<TDocument> Slice(string field, int count)
    {
        return new BsonDocumentProjectionDefinition<TDocument>(new BsonDocument(field, new BsonDocument("$slice", new BsonInt32(count))));
    }

    /// <summary>
    /// Projects an array slice with skip.
    /// </summary>
    public ProjectionDefinition<TDocument> Slice(string field, int skip, int count)
    {
        return new BsonDocumentProjectionDefinition<TDocument>(new BsonDocument(field, new BsonDocument("$slice", new BsonArray { skip, count })));
    }

    /// <summary>
    /// Projects using $elemMatch.
    /// </summary>
    public ProjectionDefinition<TDocument> ElemMatch(string field, FilterDefinition<TDocument> filter)
    {
        return new BsonDocumentProjectionDefinition<TDocument>(new BsonDocument(field, new BsonDocument("$elemMatch", filter.Render())));
    }

    /// <summary>
    /// Projects $meta text score.
    /// </summary>
    public ProjectionDefinition<TDocument> MetaTextScore(string field)
    {
        return new BsonDocumentProjectionDefinition<TDocument>(new BsonDocument(field, new BsonDocument("$meta", "textScore")));
    }
}

// ============================================================================
// SortDefinition<TDocument>
// ============================================================================

/// <summary>
/// Represents a sort definition.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public abstract class SortDefinition<TDocument>
{
    /// <summary>
    /// Renders the sort to a BsonDocument.
    /// </summary>
    public abstract BsonDocument Render();

    /// <summary>
    /// Combines sort definitions.
    /// </summary>
    public static SortDefinition<TDocument> operator +(SortDefinition<TDocument> a, SortDefinition<TDocument> b)
    {
        return new CombinedSortDefinition<TDocument>(a, b);
    }

    /// <summary>
    /// Implicit conversion from BsonDocument.
    /// </summary>
    public static implicit operator SortDefinition<TDocument>(BsonDocument document)
    {
        return new BsonDocumentSortDefinition<TDocument>(document);
    }
}

/// <summary>
/// Sort definition from a BsonDocument.
/// </summary>
internal class BsonDocumentSortDefinition<TDocument> : SortDefinition<TDocument>
{
    private readonly BsonDocument _document;

    public BsonDocumentSortDefinition(BsonDocument document) => _document = document;

    public override BsonDocument Render() => _document;
}

/// <summary>
/// Combined sort definition.
/// </summary>
internal class CombinedSortDefinition<TDocument> : SortDefinition<TDocument>
{
    private readonly SortDefinition<TDocument> _a;
    private readonly SortDefinition<TDocument> _b;

    public CombinedSortDefinition(SortDefinition<TDocument> a, SortDefinition<TDocument> b)
    {
        _a = a;
        _b = b;
    }

    public override BsonDocument Render()
    {
        var result = new BsonDocument();
        foreach (var (key, value) in _a.Render())
        {
            result[key] = value;
        }
        foreach (var (key, value) in _b.Render())
        {
            result[key] = value;
        }
        return result;
    }
}

/// <summary>
/// Builder for sort definitions.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class SortDefinitionBuilder<TDocument>
{
    /// <summary>
    /// Sorts ascending by field.
    /// </summary>
    public SortDefinition<TDocument> Ascending(string field)
    {
        return new BsonDocumentSortDefinition<TDocument>(new BsonDocument(field, 1));
    }

    /// <summary>
    /// Sorts descending by field.
    /// </summary>
    public SortDefinition<TDocument> Descending(string field)
    {
        return new BsonDocumentSortDefinition<TDocument>(new BsonDocument(field, -1));
    }

    /// <summary>
    /// Sorts by text score.
    /// </summary>
    public SortDefinition<TDocument> MetaTextScore(string field)
    {
        return new BsonDocumentSortDefinition<TDocument>(new BsonDocument(field, new BsonDocument("$meta", "textScore")));
    }

    /// <summary>
    /// Combines multiple sort definitions.
    /// </summary>
    public SortDefinition<TDocument> Combine(params SortDefinition<TDocument>[] sorts)
    {
        if (sorts.Length == 0) return new BsonDocumentSortDefinition<TDocument>(new BsonDocument());
        if (sorts.Length == 1) return sorts[0];

        SortDefinition<TDocument> result = sorts[0];
        for (int i = 1; i < sorts.Length; i++)
        {
            result = result + sorts[i];
        }
        return result;
    }
}

// ============================================================================
// IndexKeysDefinition<TDocument>
// ============================================================================

/// <summary>
/// Represents an index keys definition.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public abstract class IndexKeysDefinition<TDocument>
{
    /// <summary>
    /// Renders the index keys to a BsonDocument.
    /// </summary>
    public abstract BsonDocument Render();
}

/// <summary>
/// Index keys definition from a BsonDocument.
/// </summary>
internal class BsonDocumentIndexKeysDefinition<TDocument> : IndexKeysDefinition<TDocument>
{
    private readonly BsonDocument _document;

    public BsonDocumentIndexKeysDefinition(BsonDocument document) => _document = document;

    public override BsonDocument Render() => _document;
}

/// <summary>
/// Builder for index keys definitions.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class IndexKeysDefinitionBuilder<TDocument>
{
    /// <summary>
    /// Creates an ascending index on a field.
    /// </summary>
    public IndexKeysDefinition<TDocument> Ascending(string field)
    {
        return new BsonDocumentIndexKeysDefinition<TDocument>(new BsonDocument(field, 1));
    }

    /// <summary>
    /// Creates a descending index on a field.
    /// </summary>
    public IndexKeysDefinition<TDocument> Descending(string field)
    {
        return new BsonDocumentIndexKeysDefinition<TDocument>(new BsonDocument(field, -1));
    }

    /// <summary>
    /// Creates a text index on a field.
    /// </summary>
    public IndexKeysDefinition<TDocument> Text(string field)
    {
        return new BsonDocumentIndexKeysDefinition<TDocument>(new BsonDocument(field, "text"));
    }

    /// <summary>
    /// Creates a hashed index on a field.
    /// </summary>
    public IndexKeysDefinition<TDocument> Hashed(string field)
    {
        return new BsonDocumentIndexKeysDefinition<TDocument>(new BsonDocument(field, "hashed"));
    }

    /// <summary>
    /// Creates a 2d geo index on a field.
    /// </summary>
    public IndexKeysDefinition<TDocument> Geo2D(string field)
    {
        return new BsonDocumentIndexKeysDefinition<TDocument>(new BsonDocument(field, "2d"));
    }

    /// <summary>
    /// Creates a 2dsphere geo index on a field.
    /// </summary>
    public IndexKeysDefinition<TDocument> Geo2DSphere(string field)
    {
        return new BsonDocumentIndexKeysDefinition<TDocument>(new BsonDocument(field, "2dsphere"));
    }
}
