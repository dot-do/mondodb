// ============================================================================
// BsonDocumentTests - Unit tests for BSON document types
// ============================================================================

using Xunit;
using Mongo.Do;

namespace Mongo.Do.Tests;

public class BsonDocumentTests
{
    // ========================================================================
    // ObjectId Tests
    // ========================================================================

    [Fact]
    public void ObjectId_GenerateNewId_CreatesUniqueIds()
    {
        var id1 = ObjectId.GenerateNewId();
        var id2 = ObjectId.GenerateNewId();

        Assert.NotEqual(id1, id2);
        Assert.Equal(24, id1.ToString().Length);
        Assert.Equal(24, id2.ToString().Length);
    }

    [Fact]
    public void ObjectId_FromHexString_ParsesCorrectly()
    {
        var hex = "507f1f77bcf86cd799439011";
        var id = new ObjectId(hex);

        Assert.Equal(hex, id.ToString());
    }

    [Fact]
    public void ObjectId_InvalidHex_ThrowsException()
    {
        Assert.Throws<ArgumentException>(() => new ObjectId("invalid"));
        Assert.Throws<ArgumentException>(() => new ObjectId("123")); // Too short
    }

    [Fact]
    public void ObjectId_Equality_WorksCorrectly()
    {
        var id1 = new ObjectId("507f1f77bcf86cd799439011");
        var id2 = new ObjectId("507f1f77bcf86cd799439011");
        var id3 = new ObjectId("507f1f77bcf86cd799439012");

        Assert.Equal(id1, id2);
        Assert.NotEqual(id1, id3);
        Assert.True(id1 == id2);
        Assert.True(id1 != id3);
    }

    [Fact]
    public void ObjectId_TryParse_ReturnsTrueForValid()
    {
        Assert.True(ObjectId.TryParse("507f1f77bcf86cd799439011", out var id));
        Assert.Equal("507f1f77bcf86cd799439011", id.ToString());
    }

    [Fact]
    public void ObjectId_TryParse_ReturnsFalseForInvalid()
    {
        Assert.False(ObjectId.TryParse("invalid", out _));
        Assert.False(ObjectId.TryParse(null, out _));
        Assert.False(ObjectId.TryParse("", out _));
    }

    [Fact]
    public void ObjectId_Timestamp_ExtractsCorrectly()
    {
        var id = ObjectId.GenerateNewId();
        var now = DateTime.UtcNow;

        // Timestamp should be within a few seconds of now
        var diff = (now - id.Timestamp).TotalSeconds;
        Assert.True(Math.Abs(diff) < 5);
    }

    // ========================================================================
    // BsonValue Tests
    // ========================================================================

    [Fact]
    public void BsonNull_IsSingleton()
    {
        Assert.Same(BsonNull.Instance, BsonNull.Instance);
        Assert.True(BsonNull.Instance.IsNull);
        Assert.Null(BsonNull.Instance.ToObject());
    }

    [Fact]
    public void BsonBoolean_RepresentsBooleansCorrectly()
    {
        Assert.True(BsonBoolean.True.AsBoolean);
        Assert.False(BsonBoolean.False.AsBoolean);
        Assert.Equal(true, BsonBoolean.True.ToObject());
        Assert.Equal(false, BsonBoolean.False.ToObject());
    }

    [Fact]
    public void BsonInt32_ConvertsToOtherNumericTypes()
    {
        var value = new BsonInt32(42);

        Assert.Equal(42, value.AsInt32);
        Assert.Equal(42L, value.AsInt64);
        Assert.Equal(42.0, value.AsDouble);
    }

    [Fact]
    public void BsonInt64_ConvertsToOtherNumericTypes()
    {
        var value = new BsonInt64(42L);

        Assert.Equal(42, value.AsInt32);
        Assert.Equal(42L, value.AsInt64);
        Assert.Equal(42.0, value.AsDouble);
    }

    [Fact]
    public void BsonDouble_ConvertsToOtherNumericTypes()
    {
        var value = new BsonDouble(42.5);

        Assert.Equal(42, value.AsInt32);
        Assert.Equal(42L, value.AsInt64);
        Assert.Equal(42.5, value.AsDouble);
    }

    [Fact]
    public void BsonString_StoresStringCorrectly()
    {
        var value = new BsonString("hello");

        Assert.Equal("hello", value.AsString);
        Assert.Equal("hello", value.ToObject());
    }

    [Fact]
    public void BsonString_NullThrowsException()
    {
        Assert.Throws<ArgumentNullException>(() => new BsonString(null!));
    }

    [Fact]
    public void BsonDateTime_StoresDateCorrectly()
    {
        var date = new DateTime(2024, 1, 15, 10, 30, 0, DateTimeKind.Utc);
        var value = new BsonDateTime(date);

        Assert.Equal(date, value.AsDateTime);
    }

    [Fact]
    public void BsonDateTime_ConvertsToUtc()
    {
        var localDate = new DateTime(2024, 1, 15, 10, 30, 0, DateTimeKind.Local);
        var value = new BsonDateTime(localDate);

        Assert.Equal(DateTimeKind.Utc, value.AsDateTime.Kind);
    }

    [Fact]
    public void BsonObjectId_StoresIdCorrectly()
    {
        var id = ObjectId.GenerateNewId();
        var value = new BsonObjectId(id);

        Assert.Equal(id, value.AsObjectId);
        Assert.Equal(id.ToString(), value.AsString);
    }

    // ========================================================================
    // BsonArray Tests
    // ========================================================================

    [Fact]
    public void BsonArray_AddAndAccess()
    {
        var array = new BsonArray();
        array.Add(new BsonInt32(1));
        array.Add(new BsonString("hello"));
        array.Add(BsonBoolean.True);

        Assert.Equal(3, array.Count);
        Assert.Equal(1, array[0].AsInt32);
        Assert.Equal("hello", array[1].AsString);
        Assert.True(array[2].AsBoolean);
    }

    [Fact]
    public void BsonArray_FromObjects()
    {
        var array = new BsonArray(1, "hello", true);

        Assert.Equal(3, array.Count);
        Assert.Equal(1, array[0].AsInt32);
        Assert.Equal("hello", array[1].AsString);
        Assert.True(array[2].AsBoolean);
    }

    [Fact]
    public void BsonArray_ToObject_ReturnsListOfObjects()
    {
        var array = new BsonArray(1, 2, 3);
        var obj = array.ToObject();

        Assert.IsType<List<object?>>(obj);
        var list = (List<object?>)obj;
        Assert.Equal(3, list.Count);
        Assert.Equal(1, list[0]);
        Assert.Equal(2, list[1]);
        Assert.Equal(3, list[2]);
    }

    [Fact]
    public void BsonArray_Equality()
    {
        var array1 = new BsonArray(1, 2, 3);
        var array2 = new BsonArray(1, 2, 3);
        var array3 = new BsonArray(1, 2, 4);

        Assert.True(array1.Equals(array2));
        Assert.False(array1.Equals(array3));
    }

    // ========================================================================
    // BsonDocument Tests
    // ========================================================================

    [Fact]
    public void BsonDocument_AddAndAccess()
    {
        var doc = new BsonDocument();
        doc.Add("name", new BsonString("Alice"));
        doc.Add("age", new BsonInt32(30));

        Assert.Equal("Alice", doc["name"].AsString);
        Assert.Equal(30, doc["age"].AsInt32);
        Assert.Equal(2, doc.Count);
    }

    [Fact]
    public void BsonDocument_InitializerSyntax()
    {
        var doc = new BsonDocument("name", new BsonString("Bob"));

        Assert.Equal("Bob", doc["name"].AsString);
    }

    [Fact]
    public void BsonDocument_IndexerSets()
    {
        var doc = new BsonDocument();
        doc["name"] = new BsonString("Charlie");

        Assert.Equal("Charlie", doc["name"].AsString);
    }

    [Fact]
    public void BsonDocument_MissingKey_ReturnsNull()
    {
        var doc = new BsonDocument();

        Assert.True(doc["missing"].IsNull);
    }

    [Fact]
    public void BsonDocument_ContainsKey()
    {
        var doc = new BsonDocument();
        doc.Add("exists", BsonBoolean.True);

        Assert.True(doc.ContainsKey("exists"));
        Assert.False(doc.ContainsKey("missing"));
    }

    [Fact]
    public void BsonDocument_Remove()
    {
        var doc = new BsonDocument();
        doc.Add("key", new BsonString("value"));

        Assert.True(doc.Remove("key"));
        Assert.False(doc.ContainsKey("key"));
        Assert.False(doc.Remove("key")); // Already removed
    }

    [Fact]
    public void BsonDocument_ToObject_ReturnsDictionary()
    {
        var doc = new BsonDocument();
        doc.Add("name", new BsonString("David"));
        doc.Add("active", BsonBoolean.True);

        var obj = doc.ToObject();
        Assert.IsType<Dictionary<string, object?>>(obj);

        var dict = (Dictionary<string, object?>)obj;
        Assert.Equal("David", dict["name"]);
        Assert.Equal(true, dict["active"]);
    }

    [Fact]
    public void BsonDocument_ToJson_ProducesValidJson()
    {
        var doc = new BsonDocument();
        doc.Add("name", new BsonString("Eve"));
        doc.Add("count", new BsonInt32(42));

        var json = doc.ToJson();

        Assert.Contains("\"name\"", json);
        Assert.Contains("\"Eve\"", json);
        Assert.Contains("\"count\"", json);
        Assert.Contains("42", json);
    }

    [Fact]
    public void BsonDocument_Parse_FromJson()
    {
        var json = "{\"name\": \"Frank\", \"age\": 25}";
        var doc = BsonDocument.Parse(json);

        Assert.Equal("Frank", doc["name"].AsString);
        Assert.Equal(25, doc["age"].AsInt32);
    }

    [Fact]
    public void BsonDocument_Parse_InvalidJson_ThrowsException()
    {
        Assert.Throws<ArgumentException>(() => BsonDocument.Parse("not valid json"));
    }

    [Fact]
    public void BsonDocument_Equality()
    {
        var doc1 = new BsonDocument();
        doc1.Add("key", new BsonString("value"));

        var doc2 = new BsonDocument();
        doc2.Add("key", new BsonString("value"));

        var doc3 = new BsonDocument();
        doc3.Add("key", new BsonString("different"));

        Assert.True(doc1.Equals(doc2));
        Assert.False(doc1.Equals(doc3));
    }

    [Fact]
    public void BsonDocument_PreservesKeyOrder()
    {
        var doc = new BsonDocument();
        doc.Add("c", new BsonInt32(3));
        doc.Add("a", new BsonInt32(1));
        doc.Add("b", new BsonInt32(2));

        var keys = doc.Keys.ToList();
        Assert.Equal("c", keys[0]);
        Assert.Equal("a", keys[1]);
        Assert.Equal("b", keys[2]);
    }

    // ========================================================================
    // BsonValue.FromObject Tests
    // ========================================================================

    [Fact]
    public void BsonValue_FromObject_Null()
    {
        var value = BsonValue.FromObject(null);
        Assert.Same(BsonNull.Instance, value);
    }

    [Fact]
    public void BsonValue_FromObject_Primitives()
    {
        Assert.IsType<BsonBoolean>(BsonValue.FromObject(true));
        Assert.IsType<BsonInt32>(BsonValue.FromObject(42));
        Assert.IsType<BsonInt64>(BsonValue.FromObject(42L));
        Assert.IsType<BsonDouble>(BsonValue.FromObject(42.5));
        Assert.IsType<BsonString>(BsonValue.FromObject("hello"));
    }

    [Fact]
    public void BsonValue_FromObject_DateTime()
    {
        var date = DateTime.UtcNow;
        var value = BsonValue.FromObject(date);

        Assert.IsType<BsonDateTime>(value);
    }

    [Fact]
    public void BsonValue_FromObject_ObjectId()
    {
        var id = ObjectId.GenerateNewId();
        var value = BsonValue.FromObject(id);

        Assert.IsType<BsonObjectId>(value);
        Assert.Equal(id, ((BsonObjectId)value).Value);
    }

    [Fact]
    public void BsonValue_FromObject_Dictionary()
    {
        var dict = new Dictionary<string, object?>
        {
            ["name"] = "Grace",
            ["age"] = 28
        };

        var value = BsonValue.FromObject(dict);

        Assert.IsType<BsonDocument>(value);
        var doc = (BsonDocument)value;
        Assert.Equal("Grace", doc["name"].AsString);
        Assert.Equal(28, doc["age"].AsInt32);
    }

    [Fact]
    public void BsonValue_FromObject_List()
    {
        var list = new List<object?> { 1, 2, 3 };
        var value = BsonValue.FromObject(list);

        Assert.IsType<BsonArray>(value);
        var array = (BsonArray)value;
        Assert.Equal(3, array.Count);
    }

    // ========================================================================
    // Implicit Conversions
    // ========================================================================

    [Fact]
    public void BsonValue_ImplicitConversions()
    {
        BsonValue boolVal = true;
        BsonValue intVal = 42;
        BsonValue longVal = 42L;
        BsonValue doubleVal = 42.5;
        BsonValue stringVal = "hello";
        BsonValue idVal = ObjectId.GenerateNewId();
        BsonValue dateVal = DateTime.UtcNow;

        Assert.IsType<BsonBoolean>(boolVal);
        Assert.IsType<BsonInt32>(intVal);
        Assert.IsType<BsonInt64>(longVal);
        Assert.IsType<BsonDouble>(doubleVal);
        Assert.IsType<BsonString>(stringVal);
        Assert.IsType<BsonObjectId>(idVal);
        Assert.IsType<BsonDateTime>(dateVal);
    }

    [Fact]
    public void BsonValue_NullStringConvertsToNull()
    {
        string? nullStr = null;
        BsonValue value = nullStr;

        Assert.Same(BsonNull.Instance, value);
    }
}
