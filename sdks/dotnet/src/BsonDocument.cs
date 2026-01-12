// ============================================================================
// BsonDocument - MongoDB BSON document types for .NET
// ============================================================================

using System.Collections;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Mongo.Do;

// ============================================================================
// ObjectId - MongoDB ObjectId representation
// ============================================================================

/// <summary>
/// Represents a MongoDB ObjectId.
/// </summary>
public readonly struct ObjectId : IEquatable<ObjectId>, IComparable<ObjectId>
{
    private static readonly Random _random = new();
    private static int _counter = _random.Next();
    private static readonly int _machineId = Environment.MachineName.GetHashCode() & 0xFFFFFF;
    private static readonly short _processId = (short)(Environment.ProcessId & 0xFFFF);

    private readonly byte[] _bytes;

    /// <summary>
    /// Gets the empty ObjectId (all zeros).
    /// </summary>
    public static readonly ObjectId Empty = new(new byte[12]);

    /// <summary>
    /// Creates an ObjectId from a 24-character hex string.
    /// </summary>
    public ObjectId(string hex)
    {
        if (string.IsNullOrEmpty(hex) || hex.Length != 24)
            throw new ArgumentException("ObjectId must be a 24-character hex string", nameof(hex));

        _bytes = Convert.FromHexString(hex);
    }

    /// <summary>
    /// Creates an ObjectId from a byte array.
    /// </summary>
    public ObjectId(byte[] bytes)
    {
        if (bytes == null || bytes.Length != 12)
            throw new ArgumentException("ObjectId must be 12 bytes", nameof(bytes));

        _bytes = bytes;
    }

    /// <summary>
    /// Generates a new unique ObjectId.
    /// </summary>
    public static ObjectId GenerateNewId()
    {
        var timestamp = (int)(DateTimeOffset.UtcNow.ToUnixTimeSeconds() & 0xFFFFFFFF);
        var counter = Interlocked.Increment(ref _counter) & 0xFFFFFF;

        var bytes = new byte[12];
        bytes[0] = (byte)(timestamp >> 24);
        bytes[1] = (byte)(timestamp >> 16);
        bytes[2] = (byte)(timestamp >> 8);
        bytes[3] = (byte)timestamp;
        bytes[4] = (byte)(_machineId >> 16);
        bytes[5] = (byte)(_machineId >> 8);
        bytes[6] = (byte)_machineId;
        bytes[7] = (byte)(_processId >> 8);
        bytes[8] = (byte)_processId;
        bytes[9] = (byte)(counter >> 16);
        bytes[10] = (byte)(counter >> 8);
        bytes[11] = (byte)counter;

        return new ObjectId(bytes);
    }

    /// <summary>
    /// Parses an ObjectId from a string.
    /// </summary>
    public static ObjectId Parse(string s) => new(s);

    /// <summary>
    /// Tries to parse an ObjectId from a string.
    /// </summary>
    public static bool TryParse(string? s, out ObjectId result)
    {
        if (string.IsNullOrEmpty(s) || s.Length != 24)
        {
            result = Empty;
            return false;
        }

        try
        {
            result = new ObjectId(s);
            return true;
        }
        catch
        {
            result = Empty;
            return false;
        }
    }

    /// <summary>
    /// Gets the timestamp component of the ObjectId.
    /// </summary>
    public DateTime Timestamp
    {
        get
        {
            var seconds = (_bytes[0] << 24) | (_bytes[1] << 16) | (_bytes[2] << 8) | _bytes[3];
            return DateTimeOffset.FromUnixTimeSeconds(seconds).UtcDateTime;
        }
    }

    /// <inheritdoc />
    public override string ToString() => Convert.ToHexString(_bytes).ToLowerInvariant();

    /// <inheritdoc />
    public override int GetHashCode() => ToString().GetHashCode();

    /// <inheritdoc />
    public override bool Equals(object? obj) => obj is ObjectId other && Equals(other);

    /// <inheritdoc />
    public bool Equals(ObjectId other) => _bytes.AsSpan().SequenceEqual(other._bytes);

    /// <inheritdoc />
    public int CompareTo(ObjectId other)
    {
        for (int i = 0; i < 12; i++)
        {
            int cmp = _bytes[i].CompareTo(other._bytes[i]);
            if (cmp != 0) return cmp;
        }
        return 0;
    }

    public static bool operator ==(ObjectId left, ObjectId right) => left.Equals(right);
    public static bool operator !=(ObjectId left, ObjectId right) => !left.Equals(right);
    public static bool operator <(ObjectId left, ObjectId right) => left.CompareTo(right) < 0;
    public static bool operator >(ObjectId left, ObjectId right) => left.CompareTo(right) > 0;
    public static bool operator <=(ObjectId left, ObjectId right) => left.CompareTo(right) <= 0;
    public static bool operator >=(ObjectId left, ObjectId right) => left.CompareTo(right) >= 0;

    public static implicit operator string(ObjectId id) => id.ToString();
}

// ============================================================================
// BsonValue - Base class for BSON values
// ============================================================================

/// <summary>
/// Represents a BSON value.
/// </summary>
public abstract class BsonValue : IEquatable<BsonValue>
{
    /// <summary>
    /// Gets the BSON type of this value.
    /// </summary>
    public abstract BsonType BsonType { get; }

    /// <summary>
    /// Gets whether this value is null.
    /// </summary>
    public virtual bool IsNull => false;

    /// <summary>
    /// Gets this value as a boolean.
    /// </summary>
    public virtual bool AsBoolean => throw new InvalidCastException($"Cannot convert {BsonType} to Boolean");

    /// <summary>
    /// Gets this value as an int32.
    /// </summary>
    public virtual int AsInt32 => throw new InvalidCastException($"Cannot convert {BsonType} to Int32");

    /// <summary>
    /// Gets this value as an int64.
    /// </summary>
    public virtual long AsInt64 => throw new InvalidCastException($"Cannot convert {BsonType} to Int64");

    /// <summary>
    /// Gets this value as a double.
    /// </summary>
    public virtual double AsDouble => throw new InvalidCastException($"Cannot convert {BsonType} to Double");

    /// <summary>
    /// Gets this value as a string.
    /// </summary>
    public virtual string AsString => throw new InvalidCastException($"Cannot convert {BsonType} to String");

    /// <summary>
    /// Gets this value as an ObjectId.
    /// </summary>
    public virtual ObjectId AsObjectId => throw new InvalidCastException($"Cannot convert {BsonType} to ObjectId");

    /// <summary>
    /// Gets this value as a DateTime.
    /// </summary>
    public virtual DateTime AsDateTime => throw new InvalidCastException($"Cannot convert {BsonType} to DateTime");

    /// <summary>
    /// Gets this value as a BsonDocument.
    /// </summary>
    public virtual BsonDocument AsBsonDocument => throw new InvalidCastException($"Cannot convert {BsonType} to BsonDocument");

    /// <summary>
    /// Gets this value as a BsonArray.
    /// </summary>
    public virtual BsonArray AsBsonArray => throw new InvalidCastException($"Cannot convert {BsonType} to BsonArray");

    /// <summary>
    /// Converts this value to a .NET object.
    /// </summary>
    public abstract object? ToObject();

    /// <summary>
    /// Converts this value to a JSON node.
    /// </summary>
    public abstract JsonNode? ToJsonNode();

    /// <inheritdoc />
    public abstract bool Equals(BsonValue? other);

    /// <inheritdoc />
    public override bool Equals(object? obj) => obj is BsonValue other && Equals(other);

    /// <inheritdoc />
    public override abstract int GetHashCode();

    // Implicit conversions from primitives
    public static implicit operator BsonValue(bool value) => new BsonBoolean(value);
    public static implicit operator BsonValue(int value) => new BsonInt32(value);
    public static implicit operator BsonValue(long value) => new BsonInt64(value);
    public static implicit operator BsonValue(double value) => new BsonDouble(value);
    public static implicit operator BsonValue(string value) => value is null ? BsonNull.Instance : new BsonString(value);
    public static implicit operator BsonValue(ObjectId value) => new BsonObjectId(value);
    public static implicit operator BsonValue(DateTime value) => new BsonDateTime(value);
}

/// <summary>
/// BSON type enumeration.
/// </summary>
public enum BsonType
{
    Null = 0,
    Boolean = 1,
    Int32 = 2,
    Int64 = 3,
    Double = 4,
    String = 5,
    ObjectId = 6,
    DateTime = 7,
    Document = 8,
    Array = 9,
    Binary = 10,
    Undefined = 11,
    Regex = 12,
    Timestamp = 13,
    MinKey = 14,
    MaxKey = 15
}

// ============================================================================
// BsonNull - Null value
// ============================================================================

/// <summary>
/// Represents a BSON null value.
/// </summary>
public sealed class BsonNull : BsonValue
{
    /// <summary>
    /// The singleton null instance.
    /// </summary>
    public static readonly BsonNull Instance = new();

    private BsonNull() { }

    /// <inheritdoc />
    public override BsonType BsonType => BsonType.Null;

    /// <inheritdoc />
    public override bool IsNull => true;

    /// <inheritdoc />
    public override object? ToObject() => null;

    /// <inheritdoc />
    public override JsonNode? ToJsonNode() => null;

    /// <inheritdoc />
    public override bool Equals(BsonValue? other) => other is BsonNull;

    /// <inheritdoc />
    public override int GetHashCode() => 0;

    /// <inheritdoc />
    public override string ToString() => "null";
}

// ============================================================================
// BsonBoolean - Boolean value
// ============================================================================

/// <summary>
/// Represents a BSON boolean value.
/// </summary>
public sealed class BsonBoolean : BsonValue
{
    /// <summary>
    /// The true instance.
    /// </summary>
    public static readonly BsonBoolean True = new(true);

    /// <summary>
    /// The false instance.
    /// </summary>
    public static readonly BsonBoolean False = new(false);

    private readonly bool _value;

    /// <summary>
    /// Creates a BsonBoolean with the specified value.
    /// </summary>
    public BsonBoolean(bool value) => _value = value;

    /// <inheritdoc />
    public override BsonType BsonType => BsonType.Boolean;

    /// <inheritdoc />
    public override bool AsBoolean => _value;

    /// <summary>
    /// Gets the value.
    /// </summary>
    public bool Value => _value;

    /// <inheritdoc />
    public override object ToObject() => _value;

    /// <inheritdoc />
    public override JsonNode ToJsonNode() => JsonValue.Create(_value);

    /// <inheritdoc />
    public override bool Equals(BsonValue? other) => other is BsonBoolean b && b._value == _value;

    /// <inheritdoc />
    public override int GetHashCode() => _value.GetHashCode();

    /// <inheritdoc />
    public override string ToString() => _value ? "true" : "false";
}

// ============================================================================
// BsonInt32 - 32-bit integer
// ============================================================================

/// <summary>
/// Represents a BSON 32-bit integer value.
/// </summary>
public sealed class BsonInt32 : BsonValue
{
    private readonly int _value;

    /// <summary>
    /// Creates a BsonInt32 with the specified value.
    /// </summary>
    public BsonInt32(int value) => _value = value;

    /// <inheritdoc />
    public override BsonType BsonType => BsonType.Int32;

    /// <inheritdoc />
    public override int AsInt32 => _value;

    /// <inheritdoc />
    public override long AsInt64 => _value;

    /// <inheritdoc />
    public override double AsDouble => _value;

    /// <summary>
    /// Gets the value.
    /// </summary>
    public int Value => _value;

    /// <inheritdoc />
    public override object ToObject() => _value;

    /// <inheritdoc />
    public override JsonNode ToJsonNode() => JsonValue.Create(_value);

    /// <inheritdoc />
    public override bool Equals(BsonValue? other) => other switch
    {
        BsonInt32 i32 => i32._value == _value,
        BsonInt64 i64 => i64.Value == _value,
        BsonDouble d => Math.Abs(d.Value - _value) < double.Epsilon,
        _ => false
    };

    /// <inheritdoc />
    public override int GetHashCode() => _value.GetHashCode();

    /// <inheritdoc />
    public override string ToString() => _value.ToString();
}

// ============================================================================
// BsonInt64 - 64-bit integer
// ============================================================================

/// <summary>
/// Represents a BSON 64-bit integer value.
/// </summary>
public sealed class BsonInt64 : BsonValue
{
    private readonly long _value;

    /// <summary>
    /// Creates a BsonInt64 with the specified value.
    /// </summary>
    public BsonInt64(long value) => _value = value;

    /// <inheritdoc />
    public override BsonType BsonType => BsonType.Int64;

    /// <inheritdoc />
    public override int AsInt32 => (int)_value;

    /// <inheritdoc />
    public override long AsInt64 => _value;

    /// <inheritdoc />
    public override double AsDouble => _value;

    /// <summary>
    /// Gets the value.
    /// </summary>
    public long Value => _value;

    /// <inheritdoc />
    public override object ToObject() => _value;

    /// <inheritdoc />
    public override JsonNode ToJsonNode() => JsonValue.Create(_value);

    /// <inheritdoc />
    public override bool Equals(BsonValue? other) => other switch
    {
        BsonInt64 i64 => i64._value == _value,
        BsonInt32 i32 => i32.Value == _value,
        BsonDouble d => Math.Abs(d.Value - _value) < double.Epsilon,
        _ => false
    };

    /// <inheritdoc />
    public override int GetHashCode() => _value.GetHashCode();

    /// <inheritdoc />
    public override string ToString() => _value.ToString();
}

// ============================================================================
// BsonDouble - Double precision floating point
// ============================================================================

/// <summary>
/// Represents a BSON double value.
/// </summary>
public sealed class BsonDouble : BsonValue
{
    private readonly double _value;

    /// <summary>
    /// Creates a BsonDouble with the specified value.
    /// </summary>
    public BsonDouble(double value) => _value = value;

    /// <inheritdoc />
    public override BsonType BsonType => BsonType.Double;

    /// <inheritdoc />
    public override int AsInt32 => (int)_value;

    /// <inheritdoc />
    public override long AsInt64 => (long)_value;

    /// <inheritdoc />
    public override double AsDouble => _value;

    /// <summary>
    /// Gets the value.
    /// </summary>
    public double Value => _value;

    /// <inheritdoc />
    public override object ToObject() => _value;

    /// <inheritdoc />
    public override JsonNode ToJsonNode() => JsonValue.Create(_value);

    /// <inheritdoc />
    public override bool Equals(BsonValue? other) => other switch
    {
        BsonDouble d => Math.Abs(d._value - _value) < double.Epsilon,
        BsonInt32 i32 => Math.Abs(i32.Value - _value) < double.Epsilon,
        BsonInt64 i64 => Math.Abs(i64.Value - _value) < double.Epsilon,
        _ => false
    };

    /// <inheritdoc />
    public override int GetHashCode() => _value.GetHashCode();

    /// <inheritdoc />
    public override string ToString() => _value.ToString();
}

// ============================================================================
// BsonString - UTF-8 string
// ============================================================================

/// <summary>
/// Represents a BSON string value.
/// </summary>
public sealed class BsonString : BsonValue
{
    private readonly string _value;

    /// <summary>
    /// Creates a BsonString with the specified value.
    /// </summary>
    public BsonString(string value) => _value = value ?? throw new ArgumentNullException(nameof(value));

    /// <inheritdoc />
    public override BsonType BsonType => BsonType.String;

    /// <inheritdoc />
    public override string AsString => _value;

    /// <summary>
    /// Gets the value.
    /// </summary>
    public string Value => _value;

    /// <inheritdoc />
    public override object ToObject() => _value;

    /// <inheritdoc />
    public override JsonNode ToJsonNode() => JsonValue.Create(_value)!;

    /// <inheritdoc />
    public override bool Equals(BsonValue? other) => other is BsonString s && s._value == _value;

    /// <inheritdoc />
    public override int GetHashCode() => _value.GetHashCode();

    /// <inheritdoc />
    public override string ToString() => $"\"{_value}\"";
}

// ============================================================================
// BsonObjectId - ObjectId value
// ============================================================================

/// <summary>
/// Represents a BSON ObjectId value.
/// </summary>
public sealed class BsonObjectId : BsonValue
{
    private readonly ObjectId _value;

    /// <summary>
    /// Creates a BsonObjectId with the specified value.
    /// </summary>
    public BsonObjectId(ObjectId value) => _value = value;

    /// <summary>
    /// Creates a BsonObjectId from a hex string.
    /// </summary>
    public BsonObjectId(string hex) => _value = new ObjectId(hex);

    /// <inheritdoc />
    public override BsonType BsonType => BsonType.ObjectId;

    /// <inheritdoc />
    public override ObjectId AsObjectId => _value;

    /// <inheritdoc />
    public override string AsString => _value.ToString();

    /// <summary>
    /// Gets the value.
    /// </summary>
    public ObjectId Value => _value;

    /// <inheritdoc />
    public override object ToObject() => _value.ToString();

    /// <inheritdoc />
    public override JsonNode ToJsonNode() => new JsonObject { ["$oid"] = _value.ToString() };

    /// <inheritdoc />
    public override bool Equals(BsonValue? other) => other is BsonObjectId o && o._value == _value;

    /// <inheritdoc />
    public override int GetHashCode() => _value.GetHashCode();

    /// <inheritdoc />
    public override string ToString() => $"ObjectId(\"{_value}\")";
}

// ============================================================================
// BsonDateTime - DateTime value
// ============================================================================

/// <summary>
/// Represents a BSON DateTime value.
/// </summary>
public sealed class BsonDateTime : BsonValue
{
    private readonly DateTime _value;

    /// <summary>
    /// Creates a BsonDateTime with the specified value.
    /// </summary>
    public BsonDateTime(DateTime value) => _value = value.Kind == DateTimeKind.Utc ? value : value.ToUniversalTime();

    /// <summary>
    /// Creates a BsonDateTime from milliseconds since Unix epoch.
    /// </summary>
    public BsonDateTime(long milliseconds) => _value = DateTimeOffset.FromUnixTimeMilliseconds(milliseconds).UtcDateTime;

    /// <inheritdoc />
    public override BsonType BsonType => BsonType.DateTime;

    /// <inheritdoc />
    public override DateTime AsDateTime => _value;

    /// <summary>
    /// Gets the value.
    /// </summary>
    public DateTime Value => _value;

    /// <summary>
    /// Gets the milliseconds since Unix epoch.
    /// </summary>
    public long Milliseconds => new DateTimeOffset(_value).ToUnixTimeMilliseconds();

    /// <inheritdoc />
    public override object ToObject() => _value;

    /// <inheritdoc />
    public override JsonNode ToJsonNode() => new JsonObject { ["$date"] = Milliseconds };

    /// <inheritdoc />
    public override bool Equals(BsonValue? other) => other is BsonDateTime d && d._value == _value;

    /// <inheritdoc />
    public override int GetHashCode() => _value.GetHashCode();

    /// <inheritdoc />
    public override string ToString() => $"ISODate(\"{_value:O}\")";
}

// ============================================================================
// BsonArray - Array of BSON values
// ============================================================================

/// <summary>
/// Represents a BSON array.
/// </summary>
public sealed class BsonArray : BsonValue, IList<BsonValue>
{
    private readonly List<BsonValue> _items;

    /// <summary>
    /// Creates an empty BsonArray.
    /// </summary>
    public BsonArray() => _items = [];

    /// <summary>
    /// Creates a BsonArray from a collection.
    /// </summary>
    public BsonArray(IEnumerable<BsonValue> items) => _items = [.. items];

    /// <summary>
    /// Creates a BsonArray from objects.
    /// </summary>
    public BsonArray(params object?[] items) : this()
    {
        foreach (var item in items)
        {
            Add(BsonValue.FromObject(item));
        }
    }

    /// <inheritdoc />
    public override BsonType BsonType => BsonType.Array;

    /// <inheritdoc />
    public override BsonArray AsBsonArray => this;

    /// <summary>
    /// Gets the number of items in the array.
    /// </summary>
    public int Count => _items.Count;

    /// <inheritdoc />
    public bool IsReadOnly => false;

    /// <summary>
    /// Gets or sets the item at the specified index.
    /// </summary>
    public BsonValue this[int index]
    {
        get => _items[index];
        set => _items[index] = value ?? BsonNull.Instance;
    }

    /// <inheritdoc />
    public void Add(BsonValue item) => _items.Add(item ?? BsonNull.Instance);

    /// <inheritdoc />
    public void Clear() => _items.Clear();

    /// <inheritdoc />
    public bool Contains(BsonValue item) => _items.Contains(item);

    /// <inheritdoc />
    public void CopyTo(BsonValue[] array, int arrayIndex) => _items.CopyTo(array, arrayIndex);

    /// <inheritdoc />
    public int IndexOf(BsonValue item) => _items.IndexOf(item);

    /// <inheritdoc />
    public void Insert(int index, BsonValue item) => _items.Insert(index, item ?? BsonNull.Instance);

    /// <inheritdoc />
    public bool Remove(BsonValue item) => _items.Remove(item);

    /// <inheritdoc />
    public void RemoveAt(int index) => _items.RemoveAt(index);

    /// <inheritdoc />
    public IEnumerator<BsonValue> GetEnumerator() => _items.GetEnumerator();

    /// <inheritdoc />
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    /// <inheritdoc />
    public override object ToObject() => _items.Select(i => i.ToObject()).ToList();

    /// <inheritdoc />
    public override JsonNode ToJsonNode()
    {
        var array = new JsonArray();
        foreach (var item in _items)
        {
            array.Add(item.ToJsonNode());
        }
        return array;
    }

    /// <inheritdoc />
    public override bool Equals(BsonValue? other)
    {
        if (other is not BsonArray arr || arr.Count != Count) return false;
        for (int i = 0; i < Count; i++)
        {
            if (!_items[i].Equals(arr._items[i])) return false;
        }
        return true;
    }

    /// <inheritdoc />
    public override int GetHashCode()
    {
        var hash = new HashCode();
        foreach (var item in _items)
        {
            hash.Add(item);
        }
        return hash.ToHashCode();
    }

    /// <inheritdoc />
    public override string ToString() => $"[{string.Join(", ", _items)}]";
}

// ============================================================================
// BsonDocument - Document (object) of key-value pairs
// ============================================================================

/// <summary>
/// Represents a BSON document (equivalent to a MongoDB document).
/// </summary>
public sealed class BsonDocument : BsonValue, IDictionary<string, BsonValue>
{
    private readonly Dictionary<string, BsonValue> _elements;
    private readonly List<string> _orderedKeys;

    /// <summary>
    /// Creates an empty BsonDocument.
    /// </summary>
    public BsonDocument()
    {
        _elements = [];
        _orderedKeys = [];
    }

    /// <summary>
    /// Creates a BsonDocument with a single key-value pair.
    /// </summary>
    public BsonDocument(string name, BsonValue value) : this()
    {
        Add(name, value);
    }

    /// <summary>
    /// Creates a BsonDocument from key-value pairs.
    /// </summary>
    public BsonDocument(IEnumerable<KeyValuePair<string, BsonValue>> elements) : this()
    {
        foreach (var (key, value) in elements)
        {
            Add(key, value);
        }
    }

    /// <summary>
    /// Creates a BsonDocument from an anonymous object or dictionary.
    /// </summary>
    public BsonDocument(object obj) : this()
    {
        if (obj is IDictionary<string, object?> dict)
        {
            foreach (var (key, value) in dict)
            {
                Add(key, BsonValue.FromObject(value));
            }
        }
        else
        {
            foreach (var prop in obj.GetType().GetProperties())
            {
                var value = prop.GetValue(obj);
                Add(prop.Name, BsonValue.FromObject(value));
            }
        }
    }

    /// <inheritdoc />
    public override BsonType BsonType => BsonType.Document;

    /// <inheritdoc />
    public override BsonDocument AsBsonDocument => this;

    /// <summary>
    /// Gets the number of elements in the document.
    /// </summary>
    public int Count => _elements.Count;

    /// <inheritdoc />
    public bool IsReadOnly => false;

    /// <inheritdoc />
    public ICollection<string> Keys => _orderedKeys.AsReadOnly();

    /// <inheritdoc />
    public ICollection<BsonValue> Values => _orderedKeys.Select(k => _elements[k]).ToList().AsReadOnly();

    /// <summary>
    /// Gets or sets the value for the specified key.
    /// </summary>
    public BsonValue this[string key]
    {
        get => _elements.TryGetValue(key, out var value) ? value : BsonNull.Instance;
        set
        {
            if (!_elements.ContainsKey(key))
            {
                _orderedKeys.Add(key);
            }
            _elements[key] = value ?? BsonNull.Instance;
        }
    }

    /// <summary>
    /// Gets or sets the value at the specified index.
    /// </summary>
    public BsonValue this[int index]
    {
        get => _elements[_orderedKeys[index]];
        set => _elements[_orderedKeys[index]] = value ?? BsonNull.Instance;
    }

    /// <summary>
    /// Adds a key-value pair to the document.
    /// </summary>
    public BsonDocument Add(string key, BsonValue value)
    {
        if (!_elements.ContainsKey(key))
        {
            _orderedKeys.Add(key);
        }
        _elements[key] = value ?? BsonNull.Instance;
        return this;
    }

    /// <inheritdoc />
    void IDictionary<string, BsonValue>.Add(string key, BsonValue value) => Add(key, value);

    /// <inheritdoc />
    void ICollection<KeyValuePair<string, BsonValue>>.Add(KeyValuePair<string, BsonValue> item) => Add(item.Key, item.Value);

    /// <inheritdoc />
    public void Clear()
    {
        _elements.Clear();
        _orderedKeys.Clear();
    }

    /// <inheritdoc />
    public bool Contains(string key) => _elements.ContainsKey(key);

    /// <inheritdoc />
    public bool ContainsKey(string key) => _elements.ContainsKey(key);

    /// <inheritdoc />
    bool ICollection<KeyValuePair<string, BsonValue>>.Contains(KeyValuePair<string, BsonValue> item) =>
        _elements.TryGetValue(item.Key, out var value) && value.Equals(item.Value);

    /// <inheritdoc />
    public void CopyTo(KeyValuePair<string, BsonValue>[] array, int arrayIndex)
    {
        foreach (var key in _orderedKeys)
        {
            array[arrayIndex++] = new KeyValuePair<string, BsonValue>(key, _elements[key]);
        }
    }

    /// <inheritdoc />
    public bool Remove(string key)
    {
        if (_elements.Remove(key))
        {
            _orderedKeys.Remove(key);
            return true;
        }
        return false;
    }

    /// <inheritdoc />
    bool ICollection<KeyValuePair<string, BsonValue>>.Remove(KeyValuePair<string, BsonValue> item) =>
        _elements.TryGetValue(item.Key, out var value) && value.Equals(item.Value) && Remove(item.Key);

    /// <inheritdoc />
    public bool TryGetValue(string key, out BsonValue value) => _elements.TryGetValue(key, out value!);

    /// <summary>
    /// Gets the value for the specified key, or a default value if not found.
    /// </summary>
    public BsonValue GetValue(string key, BsonValue defaultValue) =>
        _elements.TryGetValue(key, out var value) ? value : defaultValue;

    /// <inheritdoc />
    public IEnumerator<KeyValuePair<string, BsonValue>> GetEnumerator()
    {
        foreach (var key in _orderedKeys)
        {
            yield return new KeyValuePair<string, BsonValue>(key, _elements[key]);
        }
    }

    /// <inheritdoc />
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    /// <inheritdoc />
    public override object ToObject()
    {
        var dict = new Dictionary<string, object?>();
        foreach (var key in _orderedKeys)
        {
            dict[key] = _elements[key].ToObject();
        }
        return dict;
    }

    /// <inheritdoc />
    public override JsonNode ToJsonNode()
    {
        var obj = new JsonObject();
        foreach (var key in _orderedKeys)
        {
            obj[key] = _elements[key].ToJsonNode();
        }
        return obj;
    }

    /// <summary>
    /// Converts this document to a JSON string.
    /// </summary>
    public string ToJson() => ToJsonNode().ToJsonString();

    /// <summary>
    /// Parses a BsonDocument from a JSON string.
    /// </summary>
    public static BsonDocument Parse(string json)
    {
        var node = JsonNode.Parse(json) ?? throw new ArgumentException("Invalid JSON", nameof(json));
        return FromJsonNode(node) as BsonDocument ?? throw new ArgumentException("JSON must be an object", nameof(json));
    }

    /// <inheritdoc />
    public override bool Equals(BsonValue? other)
    {
        if (other is not BsonDocument doc || doc.Count != Count) return false;
        foreach (var key in _orderedKeys)
        {
            if (!doc._elements.TryGetValue(key, out var value) || !_elements[key].Equals(value))
                return false;
        }
        return true;
    }

    /// <inheritdoc />
    public override int GetHashCode()
    {
        var hash = new HashCode();
        foreach (var key in _orderedKeys)
        {
            hash.Add(key);
            hash.Add(_elements[key]);
        }
        return hash.ToHashCode();
    }

    /// <inheritdoc />
    public override string ToString()
    {
        var pairs = _orderedKeys.Select(k => $"\"{k}\": {_elements[k]}");
        return $"{{ {string.Join(", ", pairs)} }}";
    }

    /// <summary>
    /// Creates a BsonDocument from a JsonNode.
    /// </summary>
    internal static BsonValue FromJsonNode(JsonNode? node)
    {
        return node switch
        {
            null => BsonNull.Instance,
            JsonObject obj when obj.ContainsKey("$oid") => new BsonObjectId(obj["$oid"]!.GetValue<string>()),
            JsonObject obj when obj.ContainsKey("$date") => new BsonDateTime(obj["$date"]!.GetValue<long>()),
            JsonObject obj => new BsonDocument(obj.Select(kvp => new KeyValuePair<string, BsonValue>(kvp.Key, FromJsonNode(kvp.Value)))),
            JsonArray arr => new BsonArray(arr.Select(FromJsonNode)),
            JsonValue val => val.GetValueKind() switch
            {
                JsonValueKind.True => BsonBoolean.True,
                JsonValueKind.False => BsonBoolean.False,
                JsonValueKind.Number when val.TryGetValue<int>(out var i) => new BsonInt32(i),
                JsonValueKind.Number when val.TryGetValue<long>(out var l) => new BsonInt64(l),
                JsonValueKind.Number => new BsonDouble(val.GetValue<double>()),
                JsonValueKind.String => new BsonString(val.GetValue<string>()!),
                _ => BsonNull.Instance
            },
            _ => BsonNull.Instance
        };
    }
}

// ============================================================================
// BsonValue Factory Methods
// ============================================================================

public abstract partial class BsonValue
{
    /// <summary>
    /// Creates a BsonValue from any .NET object.
    /// </summary>
    public static BsonValue FromObject(object? value)
    {
        return value switch
        {
            null => BsonNull.Instance,
            BsonValue bv => bv,
            bool b => b ? BsonBoolean.True : BsonBoolean.False,
            int i => new BsonInt32(i),
            long l => new BsonInt64(l),
            float f => new BsonDouble(f),
            double d => new BsonDouble(d),
            decimal dec => new BsonDouble((double)dec),
            string s => new BsonString(s),
            ObjectId oid => new BsonObjectId(oid),
            DateTime dt => new BsonDateTime(dt),
            DateTimeOffset dto => new BsonDateTime(dto.UtcDateTime),
            Guid g => new BsonString(g.ToString()),
            IEnumerable<KeyValuePair<string, object?>> dict => new BsonDocument(dict.Select(kvp =>
                new KeyValuePair<string, BsonValue>(kvp.Key, FromObject(kvp.Value)))),
            IEnumerable<object?> enumerable => new BsonArray(enumerable.Select(FromObject)),
            JsonNode jn => BsonDocument.FromJsonNode(jn),
            _ => FromReflection(value)
        };
    }

    private static BsonValue FromReflection(object value)
    {
        var doc = new BsonDocument();
        foreach (var prop in value.GetType().GetProperties())
        {
            if (prop.CanRead)
            {
                doc.Add(prop.Name, FromObject(prop.GetValue(value)));
            }
        }
        return doc;
    }
}
