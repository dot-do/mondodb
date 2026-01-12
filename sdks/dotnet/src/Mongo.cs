// ============================================================================
// Mongo - Static entry point for natural language queries
// ============================================================================

using System.Runtime.CompilerServices;

namespace Mongo.Do;

// ============================================================================
// Mongo - Static API for natural language database operations
// ============================================================================

/// <summary>
/// Static entry point for natural language MongoDB queries.
/// </summary>
/// <example>
/// <code>
/// // Query in plain English
/// var users = await Mongo.Query("users who haven't logged in this month");
/// var vips = await Mongo.Query("customers with orders over $1000");
///
/// // Chain operations with promise pipelining
/// var result = await Mongo.Query("customers in Texas")
///     .Select(c => Mongo.Query($"orders for {c}"))
///     .Select(o => Mongo.Query($"total revenue from {o}"));
/// </code>
/// </example>
public static class Mongo
{
    private static MongoConfig? _config;
    private static IRpcTransport? _transport;
    private static readonly SemaphoreSlim _lock = new(1, 1);

    // ========================================================================
    // Configuration
    // ========================================================================

    /// <summary>
    /// Configures the Mongo client with the specified options.
    /// </summary>
    /// <param name="config">The configuration options.</param>
    public static void Configure(MongoConfig config)
    {
        _config = config ?? throw new ArgumentNullException(nameof(config));
        _transport = null; // Reset transport to use new config
    }

    /// <summary>
    /// Gets the current configuration.
    /// </summary>
    public static MongoConfig? Configuration => _config;

    // ========================================================================
    // Natural Language Queries
    // ========================================================================

    /// <summary>
    /// Executes a natural language query.
    /// </summary>
    /// <param name="query">The query in natural language.</param>
    /// <returns>A query object that can be awaited or chained.</returns>
    /// <example>
    /// <code>
    /// var users = await Mongo.Query("active users in Austin");
    /// var vips = await Mongo.Query("customers with orders over $1000");
    /// </code>
    /// </example>
    public static MongoQuery<BsonDocument> Query(string query)
    {
        return new MongoQuery<BsonDocument>(GetTransport(), query);
    }

    /// <summary>
    /// Executes a natural language query with a typed result.
    /// </summary>
    /// <typeparam name="T">The expected result type.</typeparam>
    /// <param name="query">The query in natural language.</param>
    /// <returns>A typed query object that can be awaited or chained.</returns>
    public static MongoQuery<T> Query<T>(string query)
    {
        return new MongoQuery<T>(GetTransport(), query);
    }

    // ========================================================================
    // Transactions
    // ========================================================================

    /// <summary>
    /// Executes a block of operations within a transaction.
    /// </summary>
    /// <typeparam name="T">The result type.</typeparam>
    /// <param name="action">The action to execute within the transaction.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The result of the action.</returns>
    /// <example>
    /// <code>
    /// await Mongo.Transaction(async tx =>
    /// {
    ///     await tx.Query("alice account").Debit(100);
    ///     await tx.Query("bob account").Credit(100);
    ///     return true;
    /// });
    /// </code>
    /// </example>
    public static async Task<T> Transaction<T>(
        Func<ITransactionContext, Task<T>> action,
        CancellationToken cancellationToken = default)
    {
        var transport = GetTransport();
        var sessionResult = await transport.CallAsync("startSession", cancellationToken);
        var sessionId = sessionResult?.ToString() ?? Guid.NewGuid().ToString();

        try
        {
            await transport.CallAsync("startTransaction", cancellationToken, sessionId);
            var context = new TransactionContext(transport, sessionId);
            var result = await action(context);
            await transport.CallAsync("commitTransaction", cancellationToken, sessionId);
            return result;
        }
        catch
        {
            await transport.CallAsync("abortTransaction", cancellationToken, sessionId);
            throw;
        }
        finally
        {
            await transport.CallAsync("endSession", CancellationToken.None, sessionId);
        }
    }

    /// <summary>
    /// Executes a block of operations within a transaction (void result).
    /// </summary>
    public static async Task Transaction(
        Func<ITransactionContext, Task> action,
        CancellationToken cancellationToken = default)
    {
        await Transaction(async tx =>
        {
            await action(tx);
            return true;
        }, cancellationToken);
    }

    // ========================================================================
    // Client Access
    // ========================================================================

    /// <summary>
    /// Creates a new MongoDB client with the specified connection string.
    /// </summary>
    /// <param name="connectionString">The connection string (URL to the mongo.do server).</param>
    /// <returns>A new MongoDB client.</returns>
    public static MongoClient CreateClient(string connectionString)
    {
        return new MongoClient(connectionString);
    }

    /// <summary>
    /// Creates a new MongoDB client with the specified settings.
    /// </summary>
    /// <param name="connectionString">The connection string.</param>
    /// <param name="settings">Client settings.</param>
    /// <returns>A new MongoDB client.</returns>
    public static MongoClient CreateClient(string connectionString, MongoClientSettings settings)
    {
        return new MongoClient(connectionString, settings);
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private static IRpcTransport GetTransport()
    {
        if (_transport is not null) return _transport;

        _lock.Wait();
        try
        {
            if (_transport is not null) return _transport;

            var config = _config ?? throw new InvalidOperationException(
                "Mongo has not been configured. Call Mongo.Configure() first.");

            var url = config.Domain is not null
                ? $"https://{config.Domain}"
                : "https://mongo.do";

            _transport = new WebSocketRpcTransport(url, new MongoClientSettings
            {
                AuthToken = config.AuthToken,
                ApplicationName = config.Name
            });

            return _transport;
        }
        finally
        {
            _lock.Release();
        }
    }
}

// ============================================================================
// MongoConfig - Configuration options
// ============================================================================

/// <summary>
/// Configuration options for the Mongo client.
/// </summary>
public class MongoConfig
{
    /// <summary>
    /// Gets or sets the database name.
    /// </summary>
    public required string Name { get; init; }

    /// <summary>
    /// Gets or sets the domain for the mongo.do server.
    /// </summary>
    public string? Domain { get; init; }

    /// <summary>
    /// Gets or sets the authentication token.
    /// </summary>
    public string? AuthToken { get; init; }

    /// <summary>
    /// Gets or sets whether vector search is enabled.
    /// </summary>
    public bool Vector { get; init; }

    /// <summary>
    /// Gets or sets whether full-text search is enabled.
    /// </summary>
    public bool Fulltext { get; init; }

    /// <summary>
    /// Gets or sets whether analytics are enabled.
    /// </summary>
    public bool Analytics { get; init; }

    /// <summary>
    /// Gets or sets the storage configuration.
    /// </summary>
    public StorageConfig? Storage { get; init; }
}

/// <summary>
/// Storage tier configuration.
/// </summary>
public class StorageConfig
{
    /// <summary>
    /// Gets or sets the hot storage tier (recent data, fast queries).
    /// </summary>
    public string? Hot { get; init; }

    /// <summary>
    /// Gets or sets the warm storage tier (historical data).
    /// </summary>
    public string? Warm { get; init; }

    /// <summary>
    /// Gets or sets the cold storage tier (long-term retention).
    /// </summary>
    public string? Cold { get; init; }
}

// ============================================================================
// ITransactionContext - Transaction context interface
// ============================================================================

/// <summary>
/// Context for operations within a transaction.
/// </summary>
public interface ITransactionContext
{
    /// <summary>
    /// Executes a natural language query within the transaction.
    /// </summary>
    MongoQuery<BsonDocument> Query(string query);

    /// <summary>
    /// Executes a typed natural language query within the transaction.
    /// </summary>
    MongoQuery<T> Query<T>(string query);
}

/// <summary>
/// Implementation of the transaction context.
/// </summary>
internal class TransactionContext : ITransactionContext
{
    private readonly IRpcTransport _transport;
    private readonly string _sessionId;

    public TransactionContext(IRpcTransport transport, string sessionId)
    {
        _transport = transport;
        _sessionId = sessionId;
    }

    public MongoQuery<BsonDocument> Query(string query)
    {
        return new MongoQuery<BsonDocument>(_transport, query, _sessionId);
    }

    public MongoQuery<T> Query<T>(string query)
    {
        return new MongoQuery<T>(_transport, query, _sessionId);
    }
}

// ============================================================================
// MongoQuery<T> - Fluent query builder with promise pipelining
// ============================================================================

/// <summary>
/// Represents a natural language MongoDB query with fluent chaining and promise pipelining.
/// </summary>
/// <typeparam name="T">The result type.</typeparam>
/// <remarks>
/// MongoQuery supports promise pipelining - operations are batched and sent in a single
/// network round trip when the result is awaited.
/// </remarks>
/// <example>
/// <code>
/// // Build the pipeline - nothing sent yet
/// var users = Mongo.Query("active users");
/// var orders = users.Select(u => Mongo.Query($"pending orders for {u.Id}"));
/// var totals = orders.Select(o => o.Total);
///
/// // NOW we send everything - one round trip
/// var result = await totals;
/// </code>
/// </example>
public class MongoQuery<T>
{
    private readonly IRpcTransport _transport;
    private readonly string _query;
    private readonly string? _sessionId;
    private readonly List<QueryOperation> _operations = [];
    private int? _limit;
    private int? _skip;
    private string? _sortField;
    private SortDirection _sortDirection = SortDirection.Ascending;
    private bool _highlight;
    private bool _fuzzy;
    private bool _atomic;

    internal MongoQuery(IRpcTransport transport, string query, string? sessionId = null)
    {
        _transport = transport;
        _query = query;
        _sessionId = sessionId;
    }

    // ========================================================================
    // Fluent Modifiers
    // ========================================================================

    /// <summary>
    /// Limits the number of results.
    /// </summary>
    public MongoQuery<T> Limit(int n)
    {
        if (n < 0) throw new ArgumentOutOfRangeException(nameof(n), "Limit must be non-negative");
        _limit = n;
        return this;
    }

    /// <summary>
    /// Skips the first n documents.
    /// </summary>
    public MongoQuery<T> Skip(int n)
    {
        if (n < 0) throw new ArgumentOutOfRangeException(nameof(n), "Skip must be non-negative");
        _skip = n;
        return this;
    }

    /// <summary>
    /// Sorts results by field.
    /// </summary>
    public MongoQuery<T> Sort(string field, SortDirection direction = SortDirection.Ascending)
    {
        _sortField = field ?? throw new ArgumentNullException(nameof(field));
        _sortDirection = direction;
        return this;
    }

    /// <summary>
    /// Enables search result highlighting.
    /// </summary>
    public MongoQuery<T> Highlight()
    {
        _highlight = true;
        return this;
    }

    /// <summary>
    /// Enables fuzzy matching.
    /// </summary>
    public MongoQuery<T> Fuzzy()
    {
        _fuzzy = true;
        return this;
    }

    /// <summary>
    /// Executes the query as an atomic transaction.
    /// </summary>
    public MongoQuery<T> Atomic()
    {
        _atomic = true;
        return this;
    }

    // ========================================================================
    // Transformations (Promise Pipelining)
    // ========================================================================

    /// <summary>
    /// Transforms each result using a selector function.
    /// Operations are batched and sent in a single round trip.
    /// </summary>
    public MongoQuery<IReadOnlyList<TResult>> Select<TResult>(Func<T, TResult> selector)
    {
        var result = new MongoQuery<IReadOnlyList<TResult>>(_transport, _query, _sessionId)
        {
            _limit = _limit,
            _skip = _skip,
            _sortField = _sortField,
            _sortDirection = _sortDirection,
            _highlight = _highlight,
            _fuzzy = _fuzzy,
            _atomic = _atomic
        };
        result._operations.AddRange(_operations);
        result._operations.Add(new MapOperation(selector));
        return result;
    }

    /// <summary>
    /// Filters results using a predicate function.
    /// </summary>
    public MongoQuery<IReadOnlyList<T>> Where(Func<T, bool> predicate)
    {
        var result = new MongoQuery<IReadOnlyList<T>>(_transport, _query, _sessionId)
        {
            _limit = _limit,
            _skip = _skip,
            _sortField = _sortField,
            _sortDirection = _sortDirection,
            _highlight = _highlight,
            _fuzzy = _fuzzy,
            _atomic = _atomic
        };
        result._operations.AddRange(_operations);
        result._operations.Add(new FilterOperation(predicate));
        return result;
    }

    /// <summary>
    /// Reduces results to a single value using an accumulator.
    /// </summary>
    public MongoQuery<TResult> Aggregate<TResult>(TResult seed, Func<TResult, T, TResult> accumulator)
    {
        var result = new MongoQuery<TResult>(_transport, _query, _sessionId)
        {
            _limit = _limit,
            _skip = _skip,
            _sortField = _sortField,
            _sortDirection = _sortDirection,
            _highlight = _highlight,
            _fuzzy = _fuzzy,
            _atomic = _atomic
        };
        result._operations.AddRange(_operations);
        result._operations.Add(new ReduceOperation(seed, accumulator));
        return result;
    }

    // ========================================================================
    // Domain-Specific Operations
    // ========================================================================

    /// <summary>
    /// Debits an amount from an account (for financial operations).
    /// </summary>
    public MongoQuery<T> Debit(decimal amount)
    {
        _operations.Add(new UpdateOperation("debit", amount));
        return this;
    }

    /// <summary>
    /// Credits an amount to an account (for financial operations).
    /// </summary>
    public MongoQuery<T> Credit(decimal amount)
    {
        _operations.Add(new UpdateOperation("credit", amount));
        return this;
    }

    // ========================================================================
    // Streaming
    // ========================================================================

    /// <summary>
    /// Converts the query to an async enumerable for streaming results.
    /// </summary>
    public async IAsyncEnumerable<T> ToAsyncEnumerable([EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var results = await ExecuteAsync(cancellationToken);
        if (results is IEnumerable<T> enumerable)
        {
            foreach (var item in enumerable)
            {
                yield return item;
            }
        }
        else if (results is not null)
        {
            yield return results;
        }
    }

    // ========================================================================
    // Execution
    // ========================================================================

    /// <summary>
    /// Gets the awaiter for this query.
    /// </summary>
    public TaskAwaiter<T> GetAwaiter() => ExecuteAsync().GetAwaiter();

    /// <summary>
    /// Executes the query and returns the result.
    /// </summary>
    public async Task<T> ExecuteAsync(CancellationToken cancellationToken = default)
    {
        var options = new Dictionary<string, object?>();

        if (_limit.HasValue) options["limit"] = _limit.Value;
        if (_skip.HasValue) options["skip"] = _skip.Value;
        if (_sortField is not null)
        {
            options["sort"] = new Dictionary<string, int>
            {
                [_sortField] = _sortDirection == SortDirection.Ascending ? 1 : -1
            };
        }
        if (_highlight) options["highlight"] = true;
        if (_fuzzy) options["fuzzy"] = true;
        if (_atomic) options["atomic"] = true;
        if (_sessionId is not null) options["session"] = _sessionId;

        // Add operations for promise pipelining
        if (_operations.Count > 0)
        {
            options["pipeline"] = _operations.Select(op => op.ToObject()).ToArray();
        }

        var result = await _transport.CallAsync("query", cancellationToken, _query, options);
        return ConvertResult(result);
    }

    private static T ConvertResult(object? result)
    {
        if (result is null) return default!;
        if (result is T typed) return typed;

        // Handle BsonDocument conversion
        if (typeof(T) == typeof(BsonDocument) && result is Dictionary<string, object?> dict)
        {
            var doc = new BsonDocument();
            foreach (var (key, value) in dict)
            {
                doc.Add(key, BsonValue.FromObject(value));
            }
            return (T)(object)doc;
        }

        // Handle list conversion
        if (result is IEnumerable<object> enumerable)
        {
            if (typeof(T).IsGenericType && typeof(T).GetGenericTypeDefinition() == typeof(IReadOnlyList<>))
            {
                var elementType = typeof(T).GetGenericArguments()[0];
                var list = (System.Collections.IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(elementType))!;
                foreach (var item in enumerable)
                {
                    if (item is Dictionary<string, object?> itemDict && elementType == typeof(BsonDocument))
                    {
                        var bsonDoc = new BsonDocument();
                        foreach (var (key, value) in itemDict)
                        {
                            bsonDoc.Add(key, BsonValue.FromObject(value));
                        }
                        list.Add(bsonDoc);
                    }
                    else
                    {
                        list.Add(item);
                    }
                }
                return (T)list;
            }
            if (typeof(T) == typeof(List<BsonDocument>))
            {
                var docs = enumerable.Select(item =>
                {
                    if (item is Dictionary<string, object?> dict)
                    {
                        var doc = new BsonDocument();
                        foreach (var (key, value) in dict)
                        {
                            doc.Add(key, BsonValue.FromObject(value));
                        }
                        return doc;
                    }
                    return new BsonDocument();
                }).ToList();
                return (T)(object)docs;
            }
        }

        // Try direct conversion
        try
        {
            return (T)Convert.ChangeType(result, typeof(T));
        }
        catch
        {
            return default!;
        }
    }
}

// ============================================================================
// Sort Direction
// ============================================================================

/// <summary>
/// Specifies the sort direction.
/// </summary>
public enum SortDirection
{
    /// <summary>
    /// Ascending order (A-Z, 0-9).
    /// </summary>
    Ascending,

    /// <summary>
    /// Descending order (Z-A, 9-0).
    /// </summary>
    Descending
}

// ============================================================================
// Query Operations (for promise pipelining)
// ============================================================================

internal abstract class QueryOperation
{
    public abstract Dictionary<string, object?> ToObject();
}

internal class MapOperation : QueryOperation
{
    private readonly Delegate _selector;

    public MapOperation(Delegate selector) => _selector = selector;

    public override Dictionary<string, object?> ToObject() => new()
    {
        ["type"] = "map",
        ["expression"] = _selector.ToString()
    };
}

internal class FilterOperation : QueryOperation
{
    private readonly Delegate _predicate;

    public FilterOperation(Delegate predicate) => _predicate = predicate;

    public override Dictionary<string, object?> ToObject() => new()
    {
        ["type"] = "filter",
        ["expression"] = _predicate.ToString()
    };
}

internal class ReduceOperation : QueryOperation
{
    private readonly object _seed;
    private readonly Delegate _accumulator;

    public ReduceOperation(object seed, Delegate accumulator)
    {
        _seed = seed;
        _accumulator = accumulator;
    }

    public override Dictionary<string, object?> ToObject() => new()
    {
        ["type"] = "reduce",
        ["seed"] = _seed,
        ["expression"] = _accumulator.ToString()
    };
}

internal class UpdateOperation : QueryOperation
{
    private readonly string _operation;
    private readonly object _value;

    public UpdateOperation(string operation, object value)
    {
        _operation = operation;
        _value = value;
    }

    public override Dictionary<string, object?> ToObject() => new()
    {
        ["type"] = _operation,
        ["value"] = _value
    };
}
