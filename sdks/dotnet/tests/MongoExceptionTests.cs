// ============================================================================
// MongoExceptionTests - Unit tests for exception types
// ============================================================================

using Xunit;
using Mongo.Do;

namespace Mongo.Do.Tests;

public class MongoExceptionTests
{
    // ========================================================================
    // MongoException Tests
    // ========================================================================

    [Fact]
    public void MongoException_StoresMessage()
    {
        var ex = new MongoException("Test error");

        Assert.Equal("Test error", ex.Message);
        Assert.Null(ex.Code);
    }

    [Fact]
    public void MongoException_StoresCodeAndMessage()
    {
        var ex = new MongoException("Test error", 123);

        Assert.Equal("Test error", ex.Message);
        Assert.Equal(123, ex.Code);
    }

    [Fact]
    public void MongoException_StoresInnerException()
    {
        var inner = new InvalidOperationException("Inner error");
        var ex = new MongoException("Outer error", inner);

        Assert.Equal("Outer error", ex.Message);
        Assert.Same(inner, ex.InnerException);
    }

    // ========================================================================
    // QueryException Tests
    // ========================================================================

    [Fact]
    public void QueryException_StoresSuggestion()
    {
        var ex = new QueryException("Invalid query", query: "bad query", suggestion: "Try this instead");

        Assert.Equal("Invalid query", ex.Message);
        Assert.Equal("bad query", ex.Query);
        Assert.Equal("Try this instead", ex.Suggestion);
    }

    [Fact]
    public void QueryException_SuggestionCanBeNull()
    {
        var ex = new QueryException("Invalid query");

        Assert.Null(ex.Suggestion);
        Assert.Null(ex.Query);
    }

    // ========================================================================
    // ConnectionException Tests
    // ========================================================================

    [Fact]
    public void ConnectionException_StoresAddress()
    {
        var ex = new ConnectionException("Connection failed", "localhost:27017", isTransient: true);

        Assert.Equal("Connection failed", ex.Message);
        Assert.Equal("localhost:27017", ex.Address);
        Assert.True(ex.IsTransient);
    }

    [Fact]
    public void ConnectionException_DefaultIsNotTransient()
    {
        var ex = new ConnectionException("Connection failed");

        Assert.False(ex.IsTransient);
    }

    // ========================================================================
    // WriteException Tests
    // ========================================================================

    [Fact]
    public void WriteException_StoresWriteErrors()
    {
        var errors = new List<WriteError>
        {
            new WriteError { Index = 0, Code = 11000, Message = "Duplicate key" },
            new WriteError { Index = 1, Code = 121, Message = "Validation failed" }
        };

        var ex = new WriteException("Write failed", errors);

        Assert.Equal(2, ex.WriteErrors.Count);
        Assert.Equal(11000, ex.WriteErrors[0].Code);
        Assert.Equal(121, ex.WriteErrors[1].Code);
    }

    [Fact]
    public void WriteException_WriteErrorsIsEmptyByDefault()
    {
        var ex = new WriteException("Write failed");

        Assert.Empty(ex.WriteErrors);
    }

    // ========================================================================
    // BulkWriteException Tests
    // ========================================================================

    [Fact]
    public void BulkWriteException_StoresCounts()
    {
        var ex = new BulkWriteException("Bulk write failed", [])
        {
            InsertedCount = 5,
            MatchedCount = 10,
            ModifiedCount = 8,
            DeletedCount = 3,
            UpsertedCount = 2
        };

        Assert.Equal(5, ex.InsertedCount);
        Assert.Equal(10, ex.MatchedCount);
        Assert.Equal(8, ex.ModifiedCount);
        Assert.Equal(3, ex.DeletedCount);
        Assert.Equal(2, ex.UpsertedCount);
    }

    // ========================================================================
    // CommandException Tests
    // ========================================================================

    [Fact]
    public void CommandException_StoresCommandName()
    {
        var ex = new CommandException("Command failed", "find", 59);

        Assert.Equal("Command failed", ex.Message);
        Assert.Equal("find", ex.CommandName);
        Assert.Equal(59, ex.Code);
    }

    // ========================================================================
    // MongoTimeoutException Tests
    // ========================================================================

    [Fact]
    public void MongoTimeoutException_StoresTimeoutInfo()
    {
        var ex = new MongoTimeoutException("Operation timed out", TimeSpan.FromSeconds(30), "find");

        Assert.Equal("Operation timed out", ex.Message);
        Assert.Equal(TimeSpan.FromSeconds(30), ex.Timeout);
        Assert.Equal("find", ex.Operation);
    }

    // ========================================================================
    // AuthenticationException Tests
    // ========================================================================

    [Fact]
    public void AuthenticationException_StoresMechanism()
    {
        var ex = new AuthenticationException("Auth failed")
        {
            Mechanism = "SCRAM-SHA-256"
        };

        Assert.Equal("Auth failed", ex.Message);
        Assert.Equal("SCRAM-SHA-256", ex.Mechanism);
    }

    // ========================================================================
    // TransactionException Tests
    // ========================================================================

    [Fact]
    public void TransactionException_StoresLabel()
    {
        var ex = new TransactionException("Transaction failed", "TransientTransactionError", isRetryable: true);

        Assert.Equal("Transaction failed", ex.Message);
        Assert.Equal("TransientTransactionError", ex.Label);
        Assert.True(ex.IsRetryable);
    }

    // ========================================================================
    // DuplicateKeyException Tests
    // ========================================================================

    [Fact]
    public void DuplicateKeyException_HasCorrectErrorCode()
    {
        Assert.Equal(11000, DuplicateKeyException.DuplicateKeyErrorCode);
    }

    [Fact]
    public void DuplicateKeyException_StoresKeyInfo()
    {
        var keyPattern = new BsonDocument("email", new BsonInt32(1));
        var keyValue = new BsonDocument("email", new BsonString("test@example.com"));

        var ex = new DuplicateKeyException("Duplicate key error", keyPattern, keyValue)
        {
            IndexName = "email_1"
        };

        Assert.Equal("email_1", ex.IndexName);
        Assert.Equal("email", ex.KeyPattern?.Keys.First());
        Assert.Equal("test@example.com", ex.KeyValue?["email"].AsString);
    }

    // ========================================================================
    // DocumentValidationException Tests
    // ========================================================================

    [Fact]
    public void DocumentValidationException_StoresDetails()
    {
        var details = new BsonDocument("failingDocumentId", new BsonObjectId(ObjectId.GenerateNewId()));

        var ex = new DocumentValidationException("Validation failed", details);

        Assert.NotNull(ex.ValidationDetails);
        Assert.True(ex.ValidationDetails.ContainsKey("failingDocumentId"));
    }

    // ========================================================================
    // Extension Method Tests
    // ========================================================================

    [Fact]
    public void IsDuplicateKeyError_ReturnsTrueForDuplicateKeyException()
    {
        var ex = new DuplicateKeyException("Duplicate");

        Assert.True(ex.IsDuplicateKeyError());
    }

    [Fact]
    public void IsDuplicateKeyError_ReturnsTrueForMongoExceptionWithCode11000()
    {
        var ex = new MongoException("Duplicate", 11000);

        Assert.True(ex.IsDuplicateKeyError());
    }

    [Fact]
    public void IsDuplicateKeyError_ReturnsFalseForOtherErrors()
    {
        var ex = new MongoException("Other error");

        Assert.False(ex.IsDuplicateKeyError());
    }

    [Fact]
    public void IsNetworkError_ReturnsTrueForConnectionException()
    {
        var ex = new ConnectionException("Network error");

        Assert.True(ex.IsNetworkError());
    }

    [Fact]
    public void IsNetworkError_ReturnsFalseForOtherErrors()
    {
        var ex = new MongoException("Other error");

        Assert.False(ex.IsNetworkError());
    }

    [Fact]
    public void IsRetryable_ReturnsTrueForTransientConnectionError()
    {
        var ex = new ConnectionException("Transient error", "localhost", isTransient: true);

        Assert.True(ex.IsRetryable());
    }

    [Fact]
    public void IsRetryable_ReturnsTrueForRetryableTransactionError()
    {
        var ex = new TransactionException("Transient", isRetryable: true);

        Assert.True(ex.IsRetryable());
    }

    [Fact]
    public void IsRetryable_ReturnsTrueForTimeout()
    {
        var ex = new MongoTimeoutException("Timeout");

        Assert.True(ex.IsRetryable());
    }

    [Fact]
    public void IsRetryable_ReturnsFalseForPermanentErrors()
    {
        var ex = new MongoException("Permanent error");

        Assert.False(ex.IsRetryable());
    }

    [Fact]
    public void IsTimeout_ReturnsTrueForMongoTimeoutException()
    {
        var ex = new MongoTimeoutException("Timeout");

        Assert.True(ex.IsTimeout());
    }

    [Fact]
    public void IsTimeout_ReturnsTrueForOperationCanceledException()
    {
        var ex = new OperationCanceledException();

        Assert.True(ex.IsTimeout());
    }

    [Fact]
    public void IsTimeout_ReturnsFalseForOtherErrors()
    {
        var ex = new MongoException("Other");

        Assert.False(ex.IsTimeout());
    }
}
