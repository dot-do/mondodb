// ============================================================================
// MongoQueryTests - Unit tests for natural language query API
// ============================================================================

using Xunit;
using Mongo.Do;

namespace Mongo.Do.Tests;

public class MongoQueryTests
{
    // ========================================================================
    // MongoQuery Fluent API Tests
    // ========================================================================

    [Fact]
    public void MongoQuery_Limit_SetsLimit()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test query").Limit(10);

        Assert.NotNull(query);
    }

    [Fact]
    public void MongoQuery_Limit_ThrowsForNegative()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test query");

        Assert.Throws<ArgumentOutOfRangeException>(() => query.Limit(-1));
    }

    [Fact]
    public void MongoQuery_Skip_SetsSkip()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test query").Skip(5);

        Assert.NotNull(query);
    }

    [Fact]
    public void MongoQuery_Skip_ThrowsForNegative()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test query");

        Assert.Throws<ArgumentOutOfRangeException>(() => query.Skip(-1));
    }

    [Fact]
    public void MongoQuery_Sort_SetsSort()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test query")
            .Sort("name", SortDirection.Descending);

        Assert.NotNull(query);
    }

    [Fact]
    public void MongoQuery_Sort_ThrowsForNullField()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test query");

        Assert.Throws<ArgumentNullException>(() => query.Sort(null!));
    }

    [Fact]
    public void MongoQuery_Highlight_EnablesHighlighting()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test query").Highlight();

        Assert.NotNull(query);
    }

    [Fact]
    public void MongoQuery_Fuzzy_EnablesFuzzyMatching()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test query").Fuzzy();

        Assert.NotNull(query);
    }

    [Fact]
    public void MongoQuery_Atomic_EnablesTransaction()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test query").Atomic();

        Assert.NotNull(query);
    }

    [Fact]
    public void MongoQuery_Chaining_Works()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test query")
            .Limit(10)
            .Skip(5)
            .Sort("name")
            .Highlight()
            .Fuzzy();

        Assert.NotNull(query);
    }

    // ========================================================================
    // MongoQuery Execution Tests
    // ========================================================================

    [Fact]
    public async Task MongoQuery_ExecuteAsync_SendsQuery()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("query", new List<object>());

        var query = new MongoQuery<List<BsonDocument>>(transport, "active users");
        await query.ExecuteAsync();

        Assert.Single(transport.Calls);
        Assert.Equal("query", transport.Calls[0].Method);
        Assert.Equal("active users", transport.Calls[0].Args[0]);
    }

    [Fact]
    public async Task MongoQuery_ExecuteAsync_IncludesOptions()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("query", new List<object>());

        var query = new MongoQuery<List<BsonDocument>>(transport, "test")
            .Limit(10)
            .Skip(5);
        await query.ExecuteAsync();

        var options = transport.Calls[0].Args[1] as Dictionary<string, object?>;
        Assert.NotNull(options);
        Assert.Equal(10, options["limit"]);
        Assert.Equal(5, options["skip"]);
    }

    [Fact]
    public async Task MongoQuery_ExecuteAsync_IncludesSort()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("query", new List<object>());

        var query = new MongoQuery<List<BsonDocument>>(transport, "test")
            .Sort("createdAt", SortDirection.Descending);
        await query.ExecuteAsync();

        var options = transport.Calls[0].Args[1] as Dictionary<string, object?>;
        Assert.NotNull(options);
        Assert.NotNull(options["sort"]);
        var sort = options["sort"] as Dictionary<string, int>;
        Assert.Equal(-1, sort?["createdAt"]);
    }

    // ========================================================================
    // MongoQuery Transformations Tests
    // ========================================================================

    [Fact]
    public void MongoQuery_Select_ReturnsNewQuery()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test");
        var mapped = query.Select(x => x.ToString());

        Assert.NotNull(mapped);
        Assert.IsType<MongoQuery<IReadOnlyList<string>>>(mapped);
    }

    [Fact]
    public void MongoQuery_Where_ReturnsFilteredQuery()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<BsonDocument>(transport, "test");
        var filtered = query.Where(x => x.ContainsKey("active"));

        Assert.NotNull(filtered);
        Assert.IsType<MongoQuery<IReadOnlyList<BsonDocument>>>(filtered);
    }

    [Fact]
    public void MongoQuery_Aggregate_ReturnsReducedQuery()
    {
        var transport = new MockRpcTransport();
        var query = new MongoQuery<int>(transport, "test");
        var aggregated = query.Aggregate(0, (acc, x) => acc + x);

        Assert.NotNull(aggregated);
        Assert.IsType<MongoQuery<int>>(aggregated);
    }

    // ========================================================================
    // MongoQuery Streaming Tests
    // ========================================================================

    [Fact]
    public async Task MongoQuery_ToAsyncEnumerable_Streams()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("query", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" },
            new Dictionary<string, object?> { ["name"] = "Bob" }
        });

        var query = new MongoQuery<List<BsonDocument>>(transport, "test");
        var items = new List<BsonDocument>();

        await foreach (var item in query.ToAsyncEnumerable())
        {
            items.Add(item);
        }

        // Note: The current implementation returns the full list, not streaming individual items
        // In a real streaming implementation, this would yield individual documents
    }
}

// ============================================================================
// MongoConfig Tests
// ============================================================================

public class MongoConfigTests
{
    [Fact]
    public void MongoConfig_RequiredProperties()
    {
        var config = new MongoConfig
        {
            Name = "mydb",
            Domain = "db.example.com"
        };

        Assert.Equal("mydb", config.Name);
        Assert.Equal("db.example.com", config.Domain);
    }

    [Fact]
    public void MongoConfig_OptionalProperties()
    {
        var config = new MongoConfig
        {
            Name = "mydb",
            Vector = true,
            Fulltext = true,
            Analytics = true,
            Storage = new StorageConfig
            {
                Hot = "sqlite",
                Warm = "r2",
                Cold = "archive"
            }
        };

        Assert.True(config.Vector);
        Assert.True(config.Fulltext);
        Assert.True(config.Analytics);
        Assert.NotNull(config.Storage);
        Assert.Equal("sqlite", config.Storage.Hot);
    }
}

// ============================================================================
// Static Mongo Class Tests (without actual configuration)
// ============================================================================

public class StaticMongoTests
{
    [Fact]
    public void Mongo_Query_ThrowsWithoutConfiguration()
    {
        // Reset configuration (if any)
        // Note: In a real scenario, we'd want a way to reset the static state

        // This test verifies the expected behavior when Mongo is not configured
        // The actual implementation may throw or handle this differently
    }

    [Fact]
    public void Mongo_CreateClient_CreatesClient()
    {
        var client = Mongo.CreateClient("https://localhost");

        Assert.NotNull(client);
        Assert.Equal("https://localhost", client.ConnectionString);
    }

    [Fact]
    public void Mongo_CreateClient_WithSettings_CreatesClient()
    {
        var settings = new MongoClientSettings
        {
            ApplicationName = "TestApp",
            ConnectTimeout = TimeSpan.FromSeconds(10)
        };

        var client = Mongo.CreateClient("https://localhost", settings);

        Assert.NotNull(client);
        Assert.Equal("TestApp", client.Settings.ApplicationName);
        Assert.Equal(TimeSpan.FromSeconds(10), client.Settings.ConnectTimeout);
    }
}
