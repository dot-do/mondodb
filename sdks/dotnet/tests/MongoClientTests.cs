// ============================================================================
// MongoClientTests - Unit tests for MongoClient and related types
// ============================================================================

using Xunit;
using Moq;
using Mongo.Do;

namespace Mongo.Do.Tests;

public class MongoClientTests
{
    // ========================================================================
    // MongoClient Tests
    // ========================================================================

    [Fact]
    public void MongoClient_Constructor_RequiresConnectionString()
    {
        Assert.Throws<ArgumentNullException>(() => new MongoClient(null!));
    }

    [Fact]
    public void MongoClient_GetDatabase_ReturnsSameInstance()
    {
        var transport = new MockRpcTransport();
        var client = new MongoClient(transport);

        var db1 = client.GetDatabase("test");
        var db2 = client.GetDatabase("test");

        Assert.Same(db1, db2);
    }

    [Fact]
    public void MongoClient_GetDatabase_ReturnsDifferentForDifferentNames()
    {
        var transport = new MockRpcTransport();
        var client = new MongoClient(transport);

        var db1 = client.GetDatabase("test1");
        var db2 = client.GetDatabase("test2");

        Assert.NotSame(db1, db2);
    }

    [Fact]
    public async Task MongoClient_Dispose_PreventsOperations()
    {
        var transport = new MockRpcTransport();
        var client = new MongoClient(transport);

        client.Dispose();

        await Assert.ThrowsAsync<ObjectDisposedException>(() =>
            client.ListDatabaseNamesAsync());
    }

    [Fact]
    public async Task MongoClient_ListDatabaseNamesAsync_ReturnsNames()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("listDatabaseNames", new List<object> { "db1", "db2", "db3" });

        var client = new MongoClient(transport);
        var names = await client.ListDatabaseNamesAsync();

        Assert.Equal(3, names.Count);
        Assert.Contains("db1", names);
        Assert.Contains("db2", names);
        Assert.Contains("db3", names);
    }

    // ========================================================================
    // MongoDatabase Tests
    // ========================================================================

    [Fact]
    public void MongoDatabase_GetCollection_ReturnsSameInstanceForSameTypeAndName()
    {
        var transport = new MockRpcTransport();
        var client = new MongoClient(transport);
        var db = client.GetDatabase("test");

        var col1 = db.GetCollection<BsonDocument>("users");
        var col2 = db.GetCollection<BsonDocument>("users");

        Assert.Same(col1, col2);
    }

    [Fact]
    public void MongoDatabase_GetCollection_ReturnsDifferentForDifferentNames()
    {
        var transport = new MockRpcTransport();
        var client = new MongoClient(transport);
        var db = client.GetDatabase("test");

        var col1 = db.GetCollection<BsonDocument>("users");
        var col2 = db.GetCollection<BsonDocument>("orders");

        Assert.NotSame(col1, col2);
    }

    [Fact]
    public async Task MongoDatabase_ListCollectionNamesAsync_ReturnsNames()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("listCollectionNames", new List<object> { "users", "orders" });

        var client = new MongoClient(transport);
        var db = client.GetDatabase("test");
        var names = await db.ListCollectionNamesAsync();

        Assert.Equal(2, names.Count);
        Assert.Contains("users", names);
        Assert.Contains("orders", names);
    }

    // ========================================================================
    // MongoClientSettings Tests
    // ========================================================================

    [Fact]
    public void MongoClientSettings_DefaultValues()
    {
        var settings = new MongoClientSettings();

        Assert.Equal(TimeSpan.FromSeconds(30), settings.ConnectTimeout);
        Assert.Equal(TimeSpan.FromSeconds(30), settings.ServerSelectionTimeout);
        Assert.Equal(TimeSpan.FromMinutes(5), settings.SocketTimeout);
        Assert.Equal(100, settings.MaxConnectionPoolSize);
        Assert.Equal(0, settings.MinConnectionPoolSize);
        Assert.True(settings.RetryReads);
        Assert.True(settings.RetryWrites);
        Assert.Null(settings.ApplicationName);
        Assert.Null(settings.AuthToken);
    }

    // ========================================================================
    // ClientSession Tests
    // ========================================================================

    [Fact]
    public async Task ClientSession_StartTransaction_SetsInTransaction()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("startSession", "session-123");

        var client = new MongoClient(transport);
        await using var session = await client.StartSessionAsync();

        Assert.False(session.IsInTransaction);

        session.StartTransaction();

        Assert.True(session.IsInTransaction);
    }

    [Fact]
    public async Task ClientSession_StartTransaction_ThrowsIfAlreadyInTransaction()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("startSession", "session-123");

        var client = new MongoClient(transport);
        await using var session = await client.StartSessionAsync();

        session.StartTransaction();

        Assert.Throws<InvalidOperationException>(() => session.StartTransaction());
    }

    [Fact]
    public async Task ClientSession_CommitTransaction_ThrowsIfNotInTransaction()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("startSession", "session-123");

        var client = new MongoClient(transport);
        await using var session = await client.StartSessionAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            session.CommitTransactionAsync());
    }

    [Fact]
    public async Task ClientSession_AbortTransaction_ThrowsIfNotInTransaction()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("startSession", "session-123");

        var client = new MongoClient(transport);
        await using var session = await client.StartSessionAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            session.AbortTransactionAsync());
    }

    [Fact]
    public async Task ClientSession_WithTransactionAsync_CommitsOnSuccess()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("startSession", "session-123");
        transport.SetupResponse("commitTransaction", null);

        var client = new MongoClient(transport);
        await using var session = await client.StartSessionAsync();

        var result = await session.WithTransactionAsync(async (sess, ct) =>
        {
            await Task.Delay(1, ct);
            return 42;
        });

        Assert.Equal(42, result);
        Assert.False(session.IsInTransaction);
    }

    [Fact]
    public async Task ClientSession_WithTransactionAsync_AbortsOnException()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("startSession", "session-123");
        transport.SetupResponse("abortTransaction", null);

        var client = new MongoClient(transport);
        await using var session = await client.StartSessionAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(async () =>
        {
            await session.WithTransactionAsync<int>(async (sess, ct) =>
            {
                await Task.Delay(1, ct);
                throw new InvalidOperationException("Test exception");
            });
        });

        Assert.False(session.IsInTransaction);
    }
}

// ============================================================================
// MockRpcTransport - Mock implementation for testing
// ============================================================================

internal class MockRpcTransport : IRpcTransport
{
    private readonly Dictionary<string, object?> _responses = new();
    private readonly List<(string Method, object?[] Args)> _calls = new();

    public void SetupResponse(string method, object? response)
    {
        _responses[method] = response;
    }

    public IReadOnlyList<(string Method, object?[] Args)> Calls => _calls;

    public Task<object?> CallAsync(string method, params object?[] args)
    {
        return CallAsync(method, CancellationToken.None, args);
    }

    public Task<object?> CallAsync(string method, CancellationToken cancellationToken, params object?[] args)
    {
        _calls.Add((method, args));

        if (_responses.TryGetValue(method, out var response))
        {
            return Task.FromResult(response);
        }

        return Task.FromResult<object?>(null);
    }

    public Task CloseAsync()
    {
        return Task.CompletedTask;
    }
}
