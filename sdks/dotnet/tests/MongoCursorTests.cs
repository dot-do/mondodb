// ============================================================================
// MongoCursorTests - Unit tests for cursor implementations
// ============================================================================

using Xunit;
using Mongo.Do;

namespace Mongo.Do.Tests;

public class MongoCursorTests
{
    // ========================================================================
    // FindCursor Tests
    // ========================================================================

    [Fact]
    public async Task FindCursor_ToListAsync_ReturnsAllDocuments()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" },
            new Dictionary<string, object?> { ["name"] = "Bob" },
            new Dictionary<string, object?> { ["name"] = "Charlie" }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var results = await cursor.ToListAsync();

        Assert.Equal(3, results.Count);
    }

    [Fact]
    public async Task FindCursor_ToArrayAsync_ReturnsArray()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var results = await cursor.ToArrayAsync();

        Assert.IsType<BsonDocument[]>(results);
        Assert.Single(results);
    }

    [Fact]
    public async Task FindCursor_FirstOrDefaultAsync_ReturnsFirstDocument()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" },
            new Dictionary<string, object?> { ["name"] = "Bob" }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var result = await cursor.FirstOrDefaultAsync();

        Assert.NotNull(result);
        Assert.Equal("Alice", result["name"].AsString);
    }

    [Fact]
    public async Task FindCursor_FirstOrDefaultAsync_ReturnsNullForEmpty()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>());

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var result = await cursor.FirstOrDefaultAsync();

        Assert.Null(result);
    }

    [Fact]
    public async Task FindCursor_FirstAsync_ThrowsForEmpty()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>());

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        await Assert.ThrowsAsync<InvalidOperationException>(() => cursor.FirstAsync());
    }

    [Fact]
    public async Task FindCursor_SingleOrDefaultAsync_ReturnsSingleDocument()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var result = await cursor.SingleOrDefaultAsync();

        Assert.NotNull(result);
        Assert.Equal("Alice", result["name"].AsString);
    }

    [Fact]
    public async Task FindCursor_SingleOrDefaultAsync_ThrowsForMultiple()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" },
            new Dictionary<string, object?> { ["name"] = "Bob" }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        await Assert.ThrowsAsync<InvalidOperationException>(() => cursor.SingleOrDefaultAsync());
    }

    [Fact]
    public async Task FindCursor_AnyAsync_ReturnsTrueForNonEmpty()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var result = await cursor.AnyAsync();

        Assert.True(result);
    }

    [Fact]
    public async Task FindCursor_AnyAsync_ReturnsFalseForEmpty()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>());

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var result = await cursor.AnyAsync();

        Assert.False(result);
    }

    [Fact]
    public async Task FindCursor_CountAsync_ReturnsCount()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" },
            new Dictionary<string, object?> { ["name"] = "Bob" }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var count = await cursor.CountAsync();

        Assert.Equal(2, count);
    }

    [Fact]
    public async Task FindCursor_ForEachAsync_IteratesAllDocuments()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["value"] = 1 },
            new Dictionary<string, object?> { ["value"] = 2 },
            new Dictionary<string, object?> { ["value"] = 3 }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var sum = 0;

        await cursor.ForEachAsync(doc =>
        {
            sum += doc["value"].AsInt32;
        });

        Assert.Equal(6, sum);
    }

    [Fact]
    public async Task FindCursor_ForEachAsync_WithIndex_ProvidesIndex()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "A" },
            new Dictionary<string, object?> { ["name"] = "B" },
            new Dictionary<string, object?> { ["name"] = "C" }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var indices = new List<int>();

        await cursor.ForEachAsync(async (doc, index) =>
        {
            indices.Add(index);
            await Task.CompletedTask;
        });

        Assert.Equal([0, 1, 2], indices);
    }

    // ========================================================================
    // FindCursor Fluent API Tests
    // ========================================================================

    [Fact]
    public void FindCursor_Sort_ReturnsSameCursor()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var sorted = cursor.Sort("name", 1);

        Assert.Same(cursor, sorted);
    }

    [Fact]
    public void FindCursor_SortAscending_Sets1()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var sorted = cursor.SortAscending("name");

        Assert.Same(cursor, sorted);
    }

    [Fact]
    public void FindCursor_SortDescending_SetsMinus1()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var sorted = cursor.SortDescending("name");

        Assert.Same(cursor, sorted);
    }

    [Fact]
    public void FindCursor_Limit_ReturnsSameCursor()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var limited = cursor.Limit(10);

        Assert.Same(cursor, limited);
    }

    [Fact]
    public void FindCursor_Limit_ThrowsForNegative()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        Assert.Throws<ArgumentOutOfRangeException>(() => cursor.Limit(-1));
    }

    [Fact]
    public void FindCursor_Skip_ReturnsSameCursor()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var skipped = cursor.Skip(5);

        Assert.Same(cursor, skipped);
    }

    [Fact]
    public void FindCursor_Skip_ThrowsForNegative()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        Assert.Throws<ArgumentOutOfRangeException>(() => cursor.Skip(-1));
    }

    [Fact]
    public void FindCursor_Project_ReturnsSameCursor()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var projected = cursor.Project("name", "email");

        Assert.Same(cursor, projected);
    }

    [Fact]
    public void FindCursor_ProjectWithDictionary_ReturnsSameCursor()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var projected = cursor.Project(new Dictionary<string, int>
        {
            ["name"] = 1,
            ["email"] = 1,
            ["_id"] = 0
        });

        Assert.Same(cursor, projected);
    }

    [Fact]
    public void FindCursor_Hint_ReturnsSameCursor()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var hinted = cursor.Hint("name_1");

        Assert.Same(cursor, hinted);
    }

    [Fact]
    public void FindCursor_BatchSize_ReturnsSameCursor()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var batched = cursor.BatchSize(100);

        Assert.Same(cursor, batched);
    }

    [Fact]
    public void FindCursor_MaxTimeMS_ReturnsSameCursor()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var timed = cursor.MaxTimeMS(5000);

        Assert.Same(cursor, timed);
    }

    [Fact]
    public void FindCursor_Comment_ReturnsSameCursor()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        var commented = cursor.Comment("Debug query");

        Assert.Same(cursor, commented);
    }

    [Fact]
    public async Task FindCursor_ModifyAfterFetch_Throws()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>());

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        await cursor.ToListAsync(); // Trigger fetch

        Assert.Throws<InvalidOperationException>(() => cursor.Sort("name"));
        Assert.Throws<InvalidOperationException>(() => cursor.Limit(10));
        Assert.Throws<InvalidOperationException>(() => cursor.Skip(5));
    }

    [Fact]
    public void FindCursor_Clone_CreatesNewCursor()
    {
        var transport = new MockRpcTransport();
        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument())
            .Sort("name")
            .Limit(10);

        var cloned = cursor.Clone();

        Assert.NotSame(cursor, cloned);
    }

    [Fact]
    public async Task FindCursor_Rewind_AllowsReQuery()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        await cursor.ToListAsync();

        cursor.Rewind();

        // After rewind, should be able to modify and re-fetch
        var results = await cursor.Limit(5).ToListAsync();
        Assert.Single(results);
    }

    // ========================================================================
    // Async Enumeration Tests
    // ========================================================================

    [Fact]
    public async Task FindCursor_AsyncEnumeration_Works()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" },
            new Dictionary<string, object?> { ["name"] = "Bob" }
        });

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());
        var names = new List<string>();

        await foreach (var doc in cursor)
        {
            names.Add(doc["name"].AsString);
        }

        Assert.Equal(2, names.Count);
        Assert.Contains("Alice", names);
        Assert.Contains("Bob", names);
    }

    [Fact]
    public async Task FindCursor_DisposeAsync_ClosesCursor()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>());

        var cursor = new FindCursor<BsonDocument>(transport, "testdb", "users", new BsonDocument());

        await cursor.DisposeAsync();

        Assert.True(cursor.IsClosed);
    }

    // ========================================================================
    // AggregationCursor Tests
    // ========================================================================

    [Fact]
    public async Task AggregationCursor_ToListAsync_ReturnsAggregatedResults()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("aggregate", new List<object>
        {
            new Dictionary<string, object?> { ["_id"] = "category1", ["count"] = 10 },
            new Dictionary<string, object?> { ["_id"] = "category2", ["count"] = 20 }
        });

        var pipeline = new object[]
        {
            new Dictionary<string, object?> { ["$group"] = new Dictionary<string, object?> { ["_id"] = "$category", ["count"] = new Dictionary<string, object?> { ["$sum"] = 1 } } }
        };

        var cursor = new AggregationCursor<BsonDocument>(transport, "testdb", "items", pipeline);
        var results = await cursor.ToListAsync();

        Assert.Equal(2, results.Count);
    }

    // ========================================================================
    // ChangeStreamCursor Tests
    // ========================================================================

    [Fact]
    public void ChangeStreamCursor_IsClosed_InitiallyFalse()
    {
        var transport = new MockRpcTransport();
        var cursor = new ChangeStreamCursor<BsonDocument>(transport, "testdb", "users");

        Assert.False(cursor.IsClosed);
    }

    [Fact]
    public async Task ChangeStreamCursor_CloseAsync_SetsClosed()
    {
        var transport = new MockRpcTransport();
        var cursor = new ChangeStreamCursor<BsonDocument>(transport, "testdb", "users");

        await cursor.CloseAsync();

        Assert.True(cursor.IsClosed);
    }
}
