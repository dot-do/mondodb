// ============================================================================
// MongoCollectionTests - Unit tests for MongoCollection operations
// ============================================================================

using Xunit;
using Mongo.Do;

namespace Mongo.Do.Tests;

public class MongoCollectionTests
{
    private static MongoCollection<BsonDocument> CreateTestCollection(MockRpcTransport? transport = null)
    {
        transport ??= new MockRpcTransport();
        var client = new MongoClient(transport);
        var db = client.GetDatabase("testdb");
        return db.GetCollection<BsonDocument>("testcol");
    }

    // ========================================================================
    // Collection Properties
    // ========================================================================

    [Fact]
    public void Collection_HasCorrectNamespace()
    {
        var collection = CreateTestCollection();

        Assert.Equal("testcol", collection.CollectionName);
        Assert.Equal("testdb", collection.DatabaseName);
        Assert.Equal("testdb.testcol", collection.Namespace);
    }

    // ========================================================================
    // Insert Operations
    // ========================================================================

    [Fact]
    public async Task InsertOneAsync_ReturnsInsertedId()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("insertOne", new Dictionary<string, object?>
        {
            ["acknowledged"] = true,
            ["insertedId"] = "507f1f77bcf86cd799439011"
        });

        var collection = CreateTestCollection(transport);
        var doc = new BsonDocument("name", new BsonString("Alice"));

        var result = await collection.InsertOneAsync(doc);

        Assert.True(result.Acknowledged);
        Assert.Equal("507f1f77bcf86cd799439011", result.InsertedId.AsString);
    }

    [Fact]
    public async Task InsertManyAsync_ReturnsInsertedCount()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("insertMany", new Dictionary<string, object?>
        {
            ["acknowledged"] = true,
            ["insertedCount"] = 3,
            ["insertedIds"] = new Dictionary<string, object?>
            {
                ["0"] = "id1",
                ["1"] = "id2",
                ["2"] = "id3"
            }
        });

        var collection = CreateTestCollection(transport);
        var docs = new[]
        {
            new BsonDocument("name", new BsonString("Alice")),
            new BsonDocument("name", new BsonString("Bob")),
            new BsonDocument("name", new BsonString("Charlie"))
        };

        var result = await collection.InsertManyAsync(docs);

        Assert.True(result.Acknowledged);
        Assert.Equal(3, result.InsertedCount);
        Assert.Equal(3, result.InsertedIds.Count);
    }

    // ========================================================================
    // Update Operations
    // ========================================================================

    [Fact]
    public async Task UpdateOneAsync_ReturnsMatchedAndModifiedCount()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("updateOne", new Dictionary<string, object?>
        {
            ["acknowledged"] = true,
            ["matchedCount"] = 1L,
            ["modifiedCount"] = 1L
        });

        var collection = CreateTestCollection(transport);
        var filter = Builders<BsonDocument>.Filter.Eq("name", "Alice");
        var update = Builders<BsonDocument>.Update.Set("age", 30);

        var result = await collection.UpdateOneAsync(filter, update);

        Assert.True(result.Acknowledged);
        Assert.Equal(1, result.MatchedCount);
        Assert.Equal(1, result.ModifiedCount);
        Assert.False(result.IsUpserted);
    }

    [Fact]
    public async Task UpdateOneAsync_WithUpsert_ReturnsUpsertedId()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("updateOne", new Dictionary<string, object?>
        {
            ["acknowledged"] = true,
            ["matchedCount"] = 0L,
            ["modifiedCount"] = 0L,
            ["upsertedId"] = "new-id-123"
        });

        var collection = CreateTestCollection(transport);
        var filter = Builders<BsonDocument>.Filter.Eq("name", "David");
        var update = Builders<BsonDocument>.Update.Set("age", 25);

        var result = await collection.UpdateOneAsync(filter, update, new UpdateOptions { Upsert = true });

        Assert.True(result.IsUpserted);
        Assert.Equal("new-id-123", result.UpsertedId?.AsString);
    }

    [Fact]
    public async Task UpdateManyAsync_ReturnsModifiedCount()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("updateMany", new Dictionary<string, object?>
        {
            ["acknowledged"] = true,
            ["matchedCount"] = 5L,
            ["modifiedCount"] = 5L
        });

        var collection = CreateTestCollection(transport);
        var filter = Builders<BsonDocument>.Filter.Gt("age", 18);
        var update = Builders<BsonDocument>.Update.Set("status", "adult");

        var result = await collection.UpdateManyAsync(filter, update);

        Assert.Equal(5, result.MatchedCount);
        Assert.Equal(5, result.ModifiedCount);
    }

    // ========================================================================
    // Delete Operations
    // ========================================================================

    [Fact]
    public async Task DeleteOneAsync_ReturnsDeletedCount()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("deleteOne", new Dictionary<string, object?>
        {
            ["acknowledged"] = true,
            ["deletedCount"] = 1L
        });

        var collection = CreateTestCollection(transport);
        var filter = Builders<BsonDocument>.Filter.Eq("name", "Alice");

        var result = await collection.DeleteOneAsync(filter);

        Assert.True(result.Acknowledged);
        Assert.Equal(1, result.DeletedCount);
    }

    [Fact]
    public async Task DeleteManyAsync_ReturnsDeletedCount()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("deleteMany", new Dictionary<string, object?>
        {
            ["acknowledged"] = true,
            ["deletedCount"] = 10L
        });

        var collection = CreateTestCollection(transport);
        var filter = Builders<BsonDocument>.Filter.Lt("age", 18);

        var result = await collection.DeleteManyAsync(filter);

        Assert.Equal(10, result.DeletedCount);
    }

    // ========================================================================
    // Count Operations
    // ========================================================================

    [Fact]
    public async Task CountDocumentsAsync_ReturnsCount()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("countDocuments", 42L);

        var collection = CreateTestCollection(transport);

        var count = await collection.CountDocumentsAsync();

        Assert.Equal(42, count);
    }

    [Fact]
    public async Task CountDocumentsAsync_WithFilter_ReturnsFilteredCount()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("countDocuments", 10L);

        var collection = CreateTestCollection(transport);
        var filter = Builders<BsonDocument>.Filter.Eq("status", "active");

        var count = await collection.CountDocumentsAsync(filter);

        Assert.Equal(10, count);
    }

    [Fact]
    public async Task EstimatedDocumentCountAsync_ReturnsEstimate()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("estimatedDocumentCount", 1000L);

        var collection = CreateTestCollection(transport);

        var count = await collection.EstimatedDocumentCountAsync();

        Assert.Equal(1000, count);
    }

    // ========================================================================
    // Index Operations
    // ========================================================================

    [Fact]
    public async Task CreateIndexAsync_ReturnsIndexName()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("createIndex", "name_1");

        var collection = CreateTestCollection(transport);

        var name = await collection.CreateIndexAsync(new Dictionary<string, int> { ["name"] = 1 });

        Assert.Equal("name_1", name);
    }

    [Fact]
    public async Task CreateIndexAsync_WithOptions()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("createIndex", "email_unique");

        var collection = CreateTestCollection(transport);

        var name = await collection.CreateIndexAsync(
            new Dictionary<string, int> { ["email"] = 1 },
            new CreateIndexOptions { Name = "email_unique", Unique = true });

        Assert.Equal("email_unique", name);
    }

    [Fact]
    public async Task ListIndexesAsync_ReturnsIndexes()
    {
        var transport = new MockRpcTransport();
        transport.SetupResponse("listIndexes", new List<object>
        {
            new Dictionary<string, object?> { ["name"] = "_id_", ["key"] = new Dictionary<string, object?> { ["_id"] = 1 } },
            new Dictionary<string, object?> { ["name"] = "name_1", ["key"] = new Dictionary<string, object?> { ["name"] = 1 } }
        });

        var collection = CreateTestCollection(transport);

        var indexes = await collection.ListIndexesAsync();

        Assert.Equal(2, indexes.Count);
    }

    // ========================================================================
    // Find Operations
    // ========================================================================

    [Fact]
    public void Find_ReturnsFluentCursor()
    {
        var collection = CreateTestCollection();
        var filter = Builders<BsonDocument>.Filter.Eq("name", "Alice");

        var cursor = collection.Find(filter);

        Assert.NotNull(cursor);
    }

    [Fact]
    public void Find_Empty_ReturnsAllDocuments()
    {
        var collection = CreateTestCollection();

        var cursor = collection.Find();

        Assert.NotNull(cursor);
    }
}

// ============================================================================
// Filter Builder Tests
// ============================================================================

public class FilterBuilderTests
{
    [Fact]
    public void Filter_Eq_CreatesEqualityFilter()
    {
        var filter = Builders<BsonDocument>.Filter.Eq("name", "Alice");
        var rendered = filter.Render();

        Assert.Equal("Alice", rendered["name"].AsString);
    }

    [Fact]
    public void Filter_Ne_CreatesNotEqualFilter()
    {
        var filter = Builders<BsonDocument>.Filter.Ne("status", "inactive");
        var rendered = filter.Render();

        Assert.True(rendered["status"] is BsonDocument);
        Assert.Equal("inactive", rendered["status"].AsBsonDocument["$ne"].AsString);
    }

    [Fact]
    public void Filter_Gt_CreatesGreaterThanFilter()
    {
        var filter = Builders<BsonDocument>.Filter.Gt("age", 18);
        var rendered = filter.Render();

        Assert.Equal(18, rendered["age"].AsBsonDocument["$gt"].AsInt32);
    }

    [Fact]
    public void Filter_Gte_CreatesGreaterThanOrEqualFilter()
    {
        var filter = Builders<BsonDocument>.Filter.Gte("score", 90);
        var rendered = filter.Render();

        Assert.Equal(90, rendered["score"].AsBsonDocument["$gte"].AsInt32);
    }

    [Fact]
    public void Filter_Lt_CreatesLessThanFilter()
    {
        var filter = Builders<BsonDocument>.Filter.Lt("price", 100);
        var rendered = filter.Render();

        Assert.Equal(100, rendered["price"].AsBsonDocument["$lt"].AsInt32);
    }

    [Fact]
    public void Filter_Lte_CreatesLessThanOrEqualFilter()
    {
        var filter = Builders<BsonDocument>.Filter.Lte("quantity", 0);
        var rendered = filter.Render();

        Assert.Equal(0, rendered["quantity"].AsBsonDocument["$lte"].AsInt32);
    }

    [Fact]
    public void Filter_In_CreatesInFilter()
    {
        var filter = Builders<BsonDocument>.Filter.In("status", new[] { "active", "pending" });
        var rendered = filter.Render();

        var inArray = rendered["status"].AsBsonDocument["$in"].AsBsonArray;
        Assert.Equal(2, inArray.Count);
        Assert.Equal("active", inArray[0].AsString);
        Assert.Equal("pending", inArray[1].AsString);
    }

    [Fact]
    public void Filter_Exists_CreatesExistsFilter()
    {
        var filter = Builders<BsonDocument>.Filter.Exists("deletedAt", false);
        var rendered = filter.Render();

        Assert.False(rendered["deletedAt"].AsBsonDocument["$exists"].AsBoolean);
    }

    [Fact]
    public void Filter_Regex_CreatesRegexFilter()
    {
        var filter = Builders<BsonDocument>.Filter.Regex("email", ".*@example\\.com");
        var rendered = filter.Render();

        Assert.Contains("$regex", ((BsonDocument)rendered["email"]).Keys);
    }

    [Fact]
    public void Filter_And_CombinesFilters()
    {
        var filter = Builders<BsonDocument>.Filter.And(
            Builders<BsonDocument>.Filter.Eq("status", "active"),
            Builders<BsonDocument>.Filter.Gt("age", 18));
        var rendered = filter.Render();

        Assert.True(rendered.ContainsKey("$and"));
        Assert.Equal(2, rendered["$and"].AsBsonArray.Count);
    }

    [Fact]
    public void Filter_Or_CombinesFilters()
    {
        var filter = Builders<BsonDocument>.Filter.Or(
            Builders<BsonDocument>.Filter.Eq("role", "admin"),
            Builders<BsonDocument>.Filter.Eq("role", "moderator"));
        var rendered = filter.Render();

        Assert.True(rendered.ContainsKey("$or"));
        Assert.Equal(2, rendered["$or"].AsBsonArray.Count);
    }

    [Fact]
    public void Filter_OperatorAnd_CombinesFilters()
    {
        var filter1 = Builders<BsonDocument>.Filter.Eq("a", 1);
        var filter2 = Builders<BsonDocument>.Filter.Eq("b", 2);
        var combined = filter1 & filter2;
        var rendered = combined.Render();

        Assert.True(rendered.ContainsKey("$and"));
    }

    [Fact]
    public void Filter_OperatorOr_CombinesFilters()
    {
        var filter1 = Builders<BsonDocument>.Filter.Eq("a", 1);
        var filter2 = Builders<BsonDocument>.Filter.Eq("b", 2);
        var combined = filter1 | filter2;
        var rendered = combined.Render();

        Assert.True(rendered.ContainsKey("$or"));
    }

    [Fact]
    public void Filter_OperatorNot_NegatesFilter()
    {
        var filter = !Builders<BsonDocument>.Filter.Eq("deleted", true);
        var rendered = filter.Render();

        Assert.True(rendered.ContainsKey("$nor"));
    }
}

// ============================================================================
// Update Builder Tests
// ============================================================================

public class UpdateBuilderTests
{
    [Fact]
    public void Update_Set_CreatesSetUpdate()
    {
        var update = Builders<BsonDocument>.Update.Set("name", "Bob");
        var rendered = update.Render();

        Assert.Equal("Bob", rendered["$set"].AsBsonDocument["name"].AsString);
    }

    [Fact]
    public void Update_Inc_CreatesIncrementUpdate()
    {
        var update = Builders<BsonDocument>.Update.Inc("count", 1);
        var rendered = update.Render();

        Assert.Equal(1, rendered["$inc"].AsBsonDocument["count"].AsInt64);
    }

    [Fact]
    public void Update_Unset_CreatesUnsetUpdate()
    {
        var update = Builders<BsonDocument>.Update.Unset("tempField");
        var rendered = update.Render();

        Assert.True(rendered.ContainsKey("$unset"));
    }

    [Fact]
    public void Update_Push_CreatesPushUpdate()
    {
        var update = Builders<BsonDocument>.Update.Push("tags", "new-tag");
        var rendered = update.Render();

        Assert.Equal("new-tag", rendered["$push"].AsBsonDocument["tags"].AsString);
    }

    [Fact]
    public void Update_Pull_CreatesPullUpdate()
    {
        var update = Builders<BsonDocument>.Update.Pull("tags", "old-tag");
        var rendered = update.Render();

        Assert.Equal("old-tag", rendered["$pull"].AsBsonDocument["tags"].AsString);
    }

    [Fact]
    public void Update_Combine_MergesUpdates()
    {
        var update = Builders<BsonDocument>.Update.Combine(
            Builders<BsonDocument>.Update.Set("name", "Alice"),
            Builders<BsonDocument>.Update.Inc("visits", 1));
        var rendered = update.Render();

        Assert.True(rendered.ContainsKey("$set"));
        Assert.True(rendered.ContainsKey("$inc"));
    }

    [Fact]
    public void Update_OperatorPlus_CombinesUpdates()
    {
        var update1 = Builders<BsonDocument>.Update.Set("a", 1);
        var update2 = Builders<BsonDocument>.Update.Set("b", 2);
        var combined = update1 + update2;
        var rendered = combined.Render();

        Assert.Equal(1, rendered["$set"].AsBsonDocument["a"].AsInt32);
        Assert.Equal(2, rendered["$set"].AsBsonDocument["b"].AsInt32);
    }
}

// ============================================================================
// Projection Builder Tests
// ============================================================================

public class ProjectionBuilderTests
{
    [Fact]
    public void Projection_Include_CreatesIncludeProjection()
    {
        var projection = Builders<BsonDocument>.Projection.Include("name");
        var rendered = projection.Render();

        Assert.Equal(1, rendered["name"].AsInt32);
    }

    [Fact]
    public void Projection_Exclude_CreatesExcludeProjection()
    {
        var projection = Builders<BsonDocument>.Projection.Exclude("password");
        var rendered = projection.Render();

        Assert.Equal(0, rendered["password"].AsInt32);
    }

    [Fact]
    public void Projection_ExcludeId_ExcludesIdField()
    {
        var projection = Builders<BsonDocument>.Projection.ExcludeId();
        var rendered = projection.Render();

        Assert.Equal(0, rendered["_id"].AsInt32);
    }
}

// ============================================================================
// Sort Builder Tests
// ============================================================================

public class SortBuilderTests
{
    [Fact]
    public void Sort_Ascending_CreatesAscendingSort()
    {
        var sort = Builders<BsonDocument>.Sort.Ascending("name");
        var rendered = sort.Render();

        Assert.Equal(1, rendered["name"].AsInt32);
    }

    [Fact]
    public void Sort_Descending_CreatesDescendingSort()
    {
        var sort = Builders<BsonDocument>.Sort.Descending("createdAt");
        var rendered = sort.Render();

        Assert.Equal(-1, rendered["createdAt"].AsInt32);
    }

    [Fact]
    public void Sort_Combine_CombinesSorts()
    {
        var sort = Builders<BsonDocument>.Sort.Combine(
            Builders<BsonDocument>.Sort.Ascending("category"),
            Builders<BsonDocument>.Sort.Descending("createdAt"));
        var rendered = sort.Render();

        Assert.Equal(1, rendered["category"].AsInt32);
        Assert.Equal(-1, rendered["createdAt"].AsInt32);
    }
}
