// ============================================================================
// MongoLinqTests - Unit tests for LINQ query provider
// ============================================================================

using Xunit;
using Mongo.Do;

namespace Mongo.Do.Tests;

public class MongoLinqTests
{
    // ========================================================================
    // MongoQueryable Tests
    // ========================================================================

    [Fact]
    public void MongoQueryable_ImplementsIQueryable()
    {
        var transport = new MockRpcTransport();
        var provider = new MongoQueryProvider(transport, "testdb", "users");
        var queryable = new MongoQueryable<BsonDocument>(provider);

        Assert.IsAssignableFrom<IQueryable<BsonDocument>>(queryable);
    }

    [Fact]
    public void MongoQueryable_ElementType_IsCorrect()
    {
        var transport = new MockRpcTransport();
        var provider = new MongoQueryProvider(transport, "testdb", "users");
        var queryable = new MongoQueryable<BsonDocument>(provider);

        Assert.Equal(typeof(BsonDocument), queryable.ElementType);
    }

    [Fact]
    public void MongoQueryable_ImplementsIAsyncEnumerable()
    {
        var transport = new MockRpcTransport();
        var provider = new MongoQueryProvider(transport, "testdb", "users");
        var queryable = new MongoQueryable<BsonDocument>(provider);

        Assert.IsAssignableFrom<IAsyncEnumerable<BsonDocument>>(queryable);
    }

    // ========================================================================
    // MongoQueryProvider Tests
    // ========================================================================

    [Fact]
    public void MongoQueryProvider_CreateQuery_ReturnsMongoQueryable()
    {
        var transport = new MockRpcTransport();
        var provider = new MongoQueryProvider(transport, "testdb", "users");

        var queryable = provider.CreateQuery<BsonDocument>(System.Linq.Expressions.Expression.Constant(null));

        Assert.IsType<MongoQueryable<BsonDocument>>(queryable);
    }

    // ========================================================================
    // MongoExpressionVisitor Tests
    // ========================================================================

    [Fact]
    public void MongoExpressionVisitor_TranslateEmpty_ReturnsEmptyFilter()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable();

        var result = visitor.Translate(queryable.Expression);

        Assert.NotNull(result.Filter);
        Assert.Empty(result.Filter);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateWhere_Equality()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => d.Name == "Alice");

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("name"));
        Assert.Equal("Alice", result.Filter["name"].AsString);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateWhere_GreaterThan()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => d.Age > 18);

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("age"));
        var ageFilter = result.Filter["age"].AsBsonDocument;
        Assert.True(ageFilter.ContainsKey("$gt"));
        Assert.Equal(18, ageFilter["$gt"].AsInt32);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateWhere_LessThan()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => d.Age < 65);

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("age"));
        var ageFilter = result.Filter["age"].AsBsonDocument;
        Assert.True(ageFilter.ContainsKey("$lt"));
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateWhere_NotEqual()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => d.Status != "deleted");

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("status"));
        var statusFilter = result.Filter["status"].AsBsonDocument;
        Assert.True(statusFilter.ContainsKey("$ne"));
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateWhere_AndCombination()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => d.Name == "Alice" && d.Age > 18);

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("$and"));
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateWhere_OrCombination()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => d.Status == "active" || d.Status == "pending");

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("$or"));
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateOrderBy_Ascending()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .OrderBy(d => d.Name);

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Options.ContainsKey("sort"));
        var sort = result.Options["sort"] as Dictionary<string, int>;
        Assert.NotNull(sort);
        Assert.Equal(1, sort["name"]);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateOrderByDescending()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .OrderByDescending(d => d.CreatedAt);

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Options.ContainsKey("sort"));
        var sort = result.Options["sort"] as Dictionary<string, int>;
        Assert.NotNull(sort);
        Assert.Equal(-1, sort["createdAt"]);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateTake()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Take(10);

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Options.ContainsKey("limit"));
        Assert.Equal(10, result.Options["limit"]);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateSkip()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Skip(20);

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Options.ContainsKey("skip"));
        Assert.Equal(20, result.Options["skip"]);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateFirst()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Take(1); // First() gets transformed to Take(1)

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Options.ContainsKey("limit"));
        Assert.Equal(1, result.Options["limit"]);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateStringContains()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => d.Name.Contains("test"));

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("name"));
        var nameFilter = result.Filter["name"].AsBsonDocument;
        Assert.True(nameFilter.ContainsKey("$regex"));
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateStringStartsWith()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => d.Name.StartsWith("A"));

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("name"));
        var nameFilter = result.Filter["name"].AsBsonDocument;
        Assert.True(nameFilter.ContainsKey("$regex"));
        Assert.StartsWith("^", nameFilter["$regex"].AsString);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateStringEndsWith()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => d.Name.EndsWith("son"));

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("name"));
        var nameFilter = result.Filter["name"].AsBsonDocument;
        Assert.True(nameFilter.ContainsKey("$regex"));
        Assert.EndsWith("$", nameFilter["$regex"].AsString);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateListContains()
    {
        var statuses = new[] { "active", "pending" };
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => statuses.Contains(d.Status));

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("status"));
        var statusFilter = result.Filter["status"].AsBsonDocument;
        Assert.True(statusFilter.ContainsKey("$in"));
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateBooleanMember()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => d.IsActive);

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("isActive"));
        Assert.True(result.Filter["isActive"].AsBoolean);
    }

    [Fact]
    public void MongoExpressionVisitor_TranslateNot()
    {
        var visitor = new MongoExpressionVisitor();
        var queryable = Array.Empty<TestDocument>().AsQueryable()
            .Where(d => !d.IsDeleted);

        var result = visitor.Translate(queryable.Expression);

        Assert.True(result.Filter.ContainsKey("$nor"));
    }

    // ========================================================================
    // Async Extension Tests
    // ========================================================================

    [Fact]
    public async Task ToListAsync_Extension_Works()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" },
            new Dictionary<string, object?> { ["name"] = "Bob" }
        });

        var provider = new MongoQueryProvider(transport, "testdb", "users");
        var queryable = new MongoQueryable<BsonDocument>(provider);

        var results = await queryable.ToListAsync();

        Assert.Equal(2, results.Count);
    }

    [Fact]
    public async Task FirstOrDefaultAsync_Extension_ReturnsFirst()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" }
        });

        var provider = new MongoQueryProvider(transport, "testdb", "users");
        var queryable = new MongoQueryable<BsonDocument>(provider);

        var result = await queryable.FirstOrDefaultAsync();

        Assert.NotNull(result);
    }

    [Fact]
    public async Task FirstOrDefaultAsync_Extension_ReturnsNullForEmpty()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>());

        var provider = new MongoQueryProvider(transport, "testdb", "users");
        var queryable = new MongoQueryable<BsonDocument>(provider);

        var result = await queryable.FirstOrDefaultAsync();

        Assert.Null(result);
    }

    [Fact]
    public async Task AnyAsync_Extension_ReturnsTrueForNonEmpty()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" }
        });

        var provider = new MongoQueryProvider(transport, "testdb", "users");
        var queryable = new MongoQueryable<BsonDocument>(provider);

        var result = await queryable.AnyAsync();

        Assert.True(result);
    }

    [Fact]
    public async Task CountAsync_Extension_ReturnsCount()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("find", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "Alice" },
            new Dictionary<string, object?> { ["name"] = "Bob" },
            new Dictionary<string, object?> { ["name"] = "Charlie" }
        });

        var provider = new MongoQueryProvider(transport, "testdb", "users");
        var queryable = new MongoQueryable<BsonDocument>(provider);

        var count = await queryable.CountAsync();

        Assert.Equal(3, count);
    }
}

// ============================================================================
// Test Document Class
// ============================================================================

public class TestDocument
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Age { get; set; }
    public string Status { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime CreatedAt { get; set; }
}
