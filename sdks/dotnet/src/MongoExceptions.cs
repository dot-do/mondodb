// ============================================================================
// MongoExceptions - Exception types for MongoDB operations
// ============================================================================

namespace Mongo.Do;

// ============================================================================
// Base Exception
// ============================================================================

/// <summary>
/// Base exception for all MongoDB operations.
/// </summary>
public class MongoException : Exception
{
    /// <summary>
    /// Gets the error code, if available.
    /// </summary>
    public int? Code { get; init; }

    /// <summary>
    /// Creates a new MongoException.
    /// </summary>
    public MongoException(string message) : base(message) { }

    /// <summary>
    /// Creates a new MongoException with an inner exception.
    /// </summary>
    public MongoException(string message, Exception innerException) : base(message, innerException) { }

    /// <summary>
    /// Creates a new MongoException with a code.
    /// </summary>
    public MongoException(string message, int code) : base(message)
    {
        Code = code;
    }
}

// ============================================================================
// QueryException - Errors during query execution
// ============================================================================

/// <summary>
/// Exception thrown when a query fails.
/// </summary>
public class QueryException : MongoException
{
    /// <summary>
    /// Gets a suggested fix for the query, if available.
    /// </summary>
    public string? Suggestion { get; init; }

    /// <summary>
    /// Gets the original query that failed.
    /// </summary>
    public string? Query { get; init; }

    /// <summary>
    /// Creates a new QueryException.
    /// </summary>
    public QueryException(string message) : base(message) { }

    /// <summary>
    /// Creates a new QueryException with an inner exception.
    /// </summary>
    public QueryException(string message, Exception innerException) : base(message, innerException) { }

    /// <summary>
    /// Creates a new QueryException with query details.
    /// </summary>
    public QueryException(string message, string? query = null, string? suggestion = null) : base(message)
    {
        Query = query;
        Suggestion = suggestion;
    }
}

// ============================================================================
// ConnectionException - Connection-related errors
// ============================================================================

/// <summary>
/// Exception thrown when a connection fails.
/// </summary>
public class ConnectionException : MongoException
{
    /// <summary>
    /// Gets the server address that failed.
    /// </summary>
    public string? Address { get; init; }

    /// <summary>
    /// Gets whether this is a transient error that can be retried.
    /// </summary>
    public bool IsTransient { get; init; }

    /// <summary>
    /// Creates a new ConnectionException.
    /// </summary>
    public ConnectionException(string message) : base(message) { }

    /// <summary>
    /// Creates a new ConnectionException with an inner exception.
    /// </summary>
    public ConnectionException(string message, Exception innerException) : base(message, innerException) { }

    /// <summary>
    /// Creates a new ConnectionException with address details.
    /// </summary>
    public ConnectionException(string message, string address, bool isTransient = false) : base(message)
    {
        Address = address;
        IsTransient = isTransient;
    }
}

// ============================================================================
// WriteException - Write operation errors
// ============================================================================

/// <summary>
/// Exception thrown when a write operation fails.
/// </summary>
public class WriteException : MongoException
{
    /// <summary>
    /// Gets the individual write errors.
    /// </summary>
    public IReadOnlyList<WriteError> WriteErrors { get; init; } = [];

    /// <summary>
    /// Gets the write concern error, if any.
    /// </summary>
    public WriteConcernError? WriteConcernError { get; init; }

    /// <summary>
    /// Creates a new WriteException.
    /// </summary>
    public WriteException(string message) : base(message) { }

    /// <summary>
    /// Creates a new WriteException with errors.
    /// </summary>
    public WriteException(string message, IEnumerable<WriteError> errors) : base(message)
    {
        WriteErrors = errors.ToList().AsReadOnly();
    }
}

/// <summary>
/// Represents a single write error.
/// </summary>
public class WriteError
{
    /// <summary>
    /// Gets the index of the operation that failed.
    /// </summary>
    public required int Index { get; init; }

    /// <summary>
    /// Gets the error code.
    /// </summary>
    public required int Code { get; init; }

    /// <summary>
    /// Gets the error message.
    /// </summary>
    public required string Message { get; init; }

    /// <summary>
    /// Gets the key pattern if this is a duplicate key error.
    /// </summary>
    public BsonDocument? KeyPattern { get; init; }

    /// <summary>
    /// Gets the key value if this is a duplicate key error.
    /// </summary>
    public BsonDocument? KeyValue { get; init; }
}

/// <summary>
/// Represents a write concern error.
/// </summary>
public class WriteConcernError
{
    /// <summary>
    /// Gets the error code.
    /// </summary>
    public required int Code { get; init; }

    /// <summary>
    /// Gets the error message.
    /// </summary>
    public required string Message { get; init; }

    /// <summary>
    /// Gets additional error information.
    /// </summary>
    public BsonDocument? Details { get; init; }
}

// ============================================================================
// BulkWriteException - Bulk write operation errors
// ============================================================================

/// <summary>
/// Exception thrown when a bulk write operation fails.
/// </summary>
public class BulkWriteException : WriteException
{
    /// <summary>
    /// Gets the number of successful inserts.
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
    /// Creates a new BulkWriteException.
    /// </summary>
    public BulkWriteException(string message, IEnumerable<WriteError> errors) : base(message, errors) { }
}

// ============================================================================
// CommandException - Database command errors
// ============================================================================

/// <summary>
/// Exception thrown when a database command fails.
/// </summary>
public class CommandException : MongoException
{
    /// <summary>
    /// Gets the command name that failed.
    /// </summary>
    public string? CommandName { get; init; }

    /// <summary>
    /// Gets the error name (e.g., "OperationNotSupportedInTransaction").
    /// </summary>
    public string? ErrorName { get; init; }

    /// <summary>
    /// Creates a new CommandException.
    /// </summary>
    public CommandException(string message) : base(message) { }

    /// <summary>
    /// Creates a new CommandException with an inner exception.
    /// </summary>
    public CommandException(string message, Exception innerException) : base(message, innerException) { }

    /// <summary>
    /// Creates a new CommandException with command details.
    /// </summary>
    public CommandException(string message, string commandName, int code) : base(message, code)
    {
        CommandName = commandName;
    }
}

// ============================================================================
// TimeoutException - Operation timeout errors
// ============================================================================

/// <summary>
/// Exception thrown when an operation times out.
/// </summary>
public class MongoTimeoutException : MongoException
{
    /// <summary>
    /// Gets the timeout duration.
    /// </summary>
    public TimeSpan Timeout { get; init; }

    /// <summary>
    /// Gets the operation that timed out.
    /// </summary>
    public string? Operation { get; init; }

    /// <summary>
    /// Creates a new MongoTimeoutException.
    /// </summary>
    public MongoTimeoutException(string message) : base(message) { }

    /// <summary>
    /// Creates a new MongoTimeoutException with timeout details.
    /// </summary>
    public MongoTimeoutException(string message, TimeSpan timeout, string? operation = null) : base(message)
    {
        Timeout = timeout;
        Operation = operation;
    }
}

// ============================================================================
// AuthenticationException - Authentication errors
// ============================================================================

/// <summary>
/// Exception thrown when authentication fails.
/// </summary>
public class AuthenticationException : MongoException
{
    /// <summary>
    /// Gets the authentication mechanism that failed.
    /// </summary>
    public string? Mechanism { get; init; }

    /// <summary>
    /// Creates a new AuthenticationException.
    /// </summary>
    public AuthenticationException(string message) : base(message) { }

    /// <summary>
    /// Creates a new AuthenticationException with an inner exception.
    /// </summary>
    public AuthenticationException(string message, Exception innerException) : base(message, innerException) { }
}

// ============================================================================
// TransactionException - Transaction errors
// ============================================================================

/// <summary>
/// Exception thrown when a transaction operation fails.
/// </summary>
public class TransactionException : MongoException
{
    /// <summary>
    /// Gets whether the transaction can be retried.
    /// </summary>
    public bool IsRetryable { get; init; }

    /// <summary>
    /// Gets the transaction label (e.g., "TransientTransactionError").
    /// </summary>
    public string? Label { get; init; }

    /// <summary>
    /// Creates a new TransactionException.
    /// </summary>
    public TransactionException(string message) : base(message) { }

    /// <summary>
    /// Creates a new TransactionException with an inner exception.
    /// </summary>
    public TransactionException(string message, Exception innerException) : base(message, innerException) { }

    /// <summary>
    /// Creates a new TransactionException with transaction details.
    /// </summary>
    public TransactionException(string message, string? label = null, bool isRetryable = false) : base(message)
    {
        Label = label;
        IsRetryable = isRetryable;
    }
}

// ============================================================================
// DuplicateKeyException - Unique constraint violation
// ============================================================================

/// <summary>
/// Exception thrown when a duplicate key violation occurs.
/// </summary>
public class DuplicateKeyException : WriteException
{
    /// <summary>
    /// MongoDB error code for duplicate key errors.
    /// </summary>
    public const int DuplicateKeyErrorCode = 11000;

    /// <summary>
    /// Gets the key pattern that caused the violation.
    /// </summary>
    public BsonDocument? KeyPattern { get; init; }

    /// <summary>
    /// Gets the key value that caused the violation.
    /// </summary>
    public BsonDocument? KeyValue { get; init; }

    /// <summary>
    /// Gets the index name that was violated.
    /// </summary>
    public string? IndexName { get; init; }

    /// <summary>
    /// Creates a new DuplicateKeyException.
    /// </summary>
    public DuplicateKeyException(string message) : base(message) { }

    /// <summary>
    /// Creates a new DuplicateKeyException with key details.
    /// </summary>
    public DuplicateKeyException(string message, BsonDocument? keyPattern = null, BsonDocument? keyValue = null)
        : base(message)
    {
        KeyPattern = keyPattern;
        KeyValue = keyValue;
    }
}

// ============================================================================
// DocumentValidationException - Schema validation errors
// ============================================================================

/// <summary>
/// Exception thrown when document validation fails.
/// </summary>
public class DocumentValidationException : WriteException
{
    /// <summary>
    /// Gets the validation error details.
    /// </summary>
    public BsonDocument? ValidationDetails { get; init; }

    /// <summary>
    /// Creates a new DocumentValidationException.
    /// </summary>
    public DocumentValidationException(string message) : base(message) { }

    /// <summary>
    /// Creates a new DocumentValidationException with details.
    /// </summary>
    public DocumentValidationException(string message, BsonDocument? details) : base(message)
    {
        ValidationDetails = details;
    }
}

// ============================================================================
// Exception Helper Methods
// ============================================================================

/// <summary>
/// Extension methods for exception handling.
/// </summary>
public static class MongoExceptionExtensions
{
    /// <summary>
    /// Checks if an exception is a duplicate key error.
    /// </summary>
    public static bool IsDuplicateKeyError(this Exception ex)
    {
        return ex is DuplicateKeyException ||
               (ex is MongoException me && me.Code == DuplicateKeyException.DuplicateKeyErrorCode);
    }

    /// <summary>
    /// Checks if an exception is a network-related error.
    /// </summary>
    public static bool IsNetworkError(this Exception ex)
    {
        return ex is ConnectionException;
    }

    /// <summary>
    /// Checks if an exception is retryable.
    /// </summary>
    public static bool IsRetryable(this Exception ex)
    {
        return ex switch
        {
            ConnectionException { IsTransient: true } => true,
            TransactionException { IsRetryable: true } => true,
            MongoTimeoutException => true,
            _ => false
        };
    }

    /// <summary>
    /// Checks if an exception is a timeout error.
    /// </summary>
    public static bool IsTimeout(this Exception ex)
    {
        return ex is MongoTimeoutException or OperationCanceledException;
    }
}
