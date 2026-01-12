// Document.swift
// MongoDo - MongoDB on the Edge
//
// BSON-like document type for MongoDB operations.

import Foundation

// MARK: - ObjectId

/// A MongoDB ObjectId.
public struct ObjectId: Hashable, Codable, CustomStringConvertible, Sendable {
    /// The raw bytes of the ObjectId (12 bytes).
    public let bytes: [UInt8]

    /// Create a new ObjectId with the current timestamp.
    public init() {
        var bytes = [UInt8](repeating: 0, count: 12)

        // First 4 bytes: Unix timestamp
        let timestamp = UInt32(Date().timeIntervalSince1970)
        bytes[0] = UInt8((timestamp >> 24) & 0xFF)
        bytes[1] = UInt8((timestamp >> 16) & 0xFF)
        bytes[2] = UInt8((timestamp >> 8) & 0xFF)
        bytes[3] = UInt8(timestamp & 0xFF)

        // Next 5 bytes: random value
        for i in 4..<9 {
            bytes[i] = UInt8.random(in: 0...255)
        }

        // Last 3 bytes: incrementing counter
        let counter = ObjectId.nextCounter()
        bytes[9] = UInt8((counter >> 16) & 0xFF)
        bytes[10] = UInt8((counter >> 8) & 0xFF)
        bytes[11] = UInt8(counter & 0xFF)

        self.bytes = bytes
    }

    /// Create an ObjectId from a hex string.
    public init?(hexString: String) {
        guard hexString.count == 24 else { return nil }

        var bytes = [UInt8]()
        bytes.reserveCapacity(12)

        var index = hexString.startIndex
        for _ in 0..<12 {
            let nextIndex = hexString.index(index, offsetBy: 2)
            guard let byte = UInt8(hexString[index..<nextIndex], radix: 16) else {
                return nil
            }
            bytes.append(byte)
            index = nextIndex
        }

        self.bytes = bytes
    }

    /// Create an ObjectId from raw bytes.
    public init?(bytes: [UInt8]) {
        guard bytes.count == 12 else { return nil }
        self.bytes = bytes
    }

    /// The hex string representation.
    public var hexString: String {
        bytes.map { String(format: "%02x", $0) }.joined()
    }

    /// The timestamp when this ObjectId was created.
    public var timestamp: Date {
        let seconds = (UInt32(bytes[0]) << 24) | (UInt32(bytes[1]) << 16) |
                      (UInt32(bytes[2]) << 8) | UInt32(bytes[3])
        return Date(timeIntervalSince1970: TimeInterval(seconds))
    }

    public var description: String {
        hexString
    }

    // MARK: - Codable

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let hexString = try container.decode(String.self)
        guard let oid = ObjectId(hexString: hexString) else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ObjectId hex string"
            )
        }
        self = oid
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(hexString)
    }

    // MARK: - Counter

    private static var counter: UInt32 = UInt32.random(in: 0..<0xFFFFFF)
    private static let counterLock = NSLock()

    private static func nextCounter() -> UInt32 {
        counterLock.lock()
        defer { counterLock.unlock() }
        counter = (counter + 1) & 0xFFFFFF
        return counter
    }
}

// MARK: - BsonValue

/// A BSON value that can be stored in a document.
public enum BsonValue: Hashable, Sendable {
    case null
    case bool(Bool)
    case int32(Int32)
    case int64(Int64)
    case double(Double)
    case string(String)
    case objectId(ObjectId)
    case date(Date)
    case array([BsonValue])
    case document(Document)
    case binary(Data)
    case regex(pattern: String, options: String)

    /// Convert to Any for JSON serialization.
    public var anyValue: Any {
        switch self {
        case .null:
            return NSNull()
        case .bool(let v):
            return v
        case .int32(let v):
            return v
        case .int64(let v):
            return v
        case .double(let v):
            return v
        case .string(let v):
            return v
        case .objectId(let v):
            return ["$oid": v.hexString]
        case .date(let v):
            return ["$date": Int64(v.timeIntervalSince1970 * 1000)]
        case .array(let v):
            return v.map { $0.anyValue }
        case .document(let v):
            return v.toDictionary()
        case .binary(let v):
            return ["$binary": ["base64": v.base64EncodedString(), "subType": "00"]]
        case .regex(let pattern, let options):
            return ["$regex": pattern, "$options": options]
        }
    }

    /// Create a BsonValue from an Any value.
    public static func fromAny(_ value: Any) -> BsonValue {
        switch value {
        case is NSNull:
            return .null
        case let v as Bool:
            return .bool(v)
        case let v as Int:
            return .int64(Int64(v))
        case let v as Int32:
            return .int32(v)
        case let v as Int64:
            return .int64(v)
        case let v as Double:
            return .double(v)
        case let v as Float:
            return .double(Double(v))
        case let v as String:
            return .string(v)
        case let v as Date:
            return .date(v)
        case let v as Data:
            return .binary(v)
        case let v as ObjectId:
            return .objectId(v)
        case let v as [Any]:
            return .array(v.map { fromAny($0) })
        case let v as [String: Any]:
            // Check for extended JSON types
            if let oid = v["$oid"] as? String {
                return .objectId(ObjectId(hexString: oid) ?? ObjectId())
            }
            if let dateMillis = v["$date"] as? Int64 {
                return .date(Date(timeIntervalSince1970: TimeInterval(dateMillis) / 1000))
            }
            if let dateMillis = v["$date"] as? Int {
                return .date(Date(timeIntervalSince1970: TimeInterval(dateMillis) / 1000))
            }
            return .document(Document(v))
        case let v as Document:
            return .document(v)
        default:
            return .null
        }
    }
}

// MARK: - ExpressibleByLiterals

extension BsonValue: ExpressibleByNilLiteral {
    public init(nilLiteral: ()) {
        self = .null
    }
}

extension BsonValue: ExpressibleByBooleanLiteral {
    public init(booleanLiteral value: Bool) {
        self = .bool(value)
    }
}

extension BsonValue: ExpressibleByIntegerLiteral {
    public init(integerLiteral value: Int) {
        self = .int64(Int64(value))
    }
}

extension BsonValue: ExpressibleByFloatLiteral {
    public init(floatLiteral value: Double) {
        self = .double(value)
    }
}

extension BsonValue: ExpressibleByStringLiteral {
    public init(stringLiteral value: String) {
        self = .string(value)
    }
}

extension BsonValue: ExpressibleByArrayLiteral {
    public init(arrayLiteral elements: BsonValue...) {
        self = .array(elements)
    }
}

extension BsonValue: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (String, BsonValue)...) {
        var doc = Document()
        for (key, value) in elements {
            doc[key] = value
        }
        self = .document(doc)
    }
}

// MARK: - Document

/// A MongoDB document (ordered key-value pairs).
public struct Document: Hashable, Sendable {
    /// The underlying storage.
    private var storage: [(key: String, value: BsonValue)]

    /// Create an empty document.
    public init() {
        self.storage = []
    }

    /// Create a document from a dictionary.
    public init(_ dictionary: [String: Any]) {
        self.storage = dictionary.map { (key: $0.key, value: BsonValue.fromAny($0.value)) }
    }

    /// Create a document from key-value pairs.
    public init(_ elements: [(String, BsonValue)]) {
        self.storage = elements.map { (key: $0.0, value: $0.1) }
    }

    /// Get or set a value by key.
    public subscript(key: String) -> BsonValue? {
        get {
            storage.first { $0.key == key }?.value
        }
        set {
            if let index = storage.firstIndex(where: { $0.key == key }) {
                if let newValue = newValue {
                    storage[index] = (key: key, value: newValue)
                } else {
                    storage.remove(at: index)
                }
            } else if let newValue = newValue {
                storage.append((key: key, value: newValue))
            }
        }
    }

    /// Get a string value.
    public func getString(_ key: String) -> String? {
        if case .string(let v) = self[key] {
            return v
        }
        return nil
    }

    /// Get an integer value.
    public func getInt(_ key: String) -> Int? {
        switch self[key] {
        case .int32(let v): return Int(v)
        case .int64(let v): return Int(v)
        default: return nil
        }
    }

    /// Get a double value.
    public func getDouble(_ key: String) -> Double? {
        switch self[key] {
        case .double(let v): return v
        case .int32(let v): return Double(v)
        case .int64(let v): return Double(v)
        default: return nil
        }
    }

    /// Get a boolean value.
    public func getBool(_ key: String) -> Bool? {
        if case .bool(let v) = self[key] {
            return v
        }
        return nil
    }

    /// Get a date value.
    public func getDate(_ key: String) -> Date? {
        if case .date(let v) = self[key] {
            return v
        }
        return nil
    }

    /// Get an ObjectId value.
    public func getObjectId(_ key: String) -> ObjectId? {
        if case .objectId(let v) = self[key] {
            return v
        }
        return nil
    }

    /// Get a nested document.
    public func getDocument(_ key: String) -> Document? {
        if case .document(let v) = self[key] {
            return v
        }
        return nil
    }

    /// Get an array value.
    public func getArray(_ key: String) -> [BsonValue]? {
        if case .array(let v) = self[key] {
            return v
        }
        return nil
    }

    /// All keys in the document.
    public var keys: [String] {
        storage.map { $0.key }
    }

    /// All values in the document.
    public var values: [BsonValue] {
        storage.map { $0.value }
    }

    /// The number of key-value pairs.
    public var count: Int {
        storage.count
    }

    /// Whether the document is empty.
    public var isEmpty: Bool {
        storage.isEmpty
    }

    /// Convert to a dictionary.
    public func toDictionary() -> [String: Any] {
        var dict = [String: Any]()
        for (key, value) in storage {
            dict[key] = value.anyValue
        }
        return dict
    }

    /// Convert to JSON data.
    public func toJSON() throws -> Data {
        try JSONSerialization.data(withJSONObject: toDictionary(), options: [])
    }

    /// Create from JSON data.
    public static func fromJSON(_ data: Data) throws -> Document {
        guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw MongoError.invalidDocument("Expected dictionary")
        }
        return Document(dict)
    }

    // MARK: - Hashable

    public func hash(into hasher: inout Hasher) {
        for (key, value) in storage {
            hasher.combine(key)
            hasher.combine(value)
        }
    }

    public static func == (lhs: Document, rhs: Document) -> Bool {
        guard lhs.count == rhs.count else { return false }
        for (lhsPair, rhsPair) in zip(lhs.storage, rhs.storage) {
            if lhsPair.key != rhsPair.key || lhsPair.value != rhsPair.value {
                return false
            }
        }
        return true
    }
}

// MARK: - ExpressibleByDictionaryLiteral

extension Document: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (String, BsonValue)...) {
        self.storage = elements.map { (key: $0.0, value: $0.1) }
    }
}

// MARK: - Sequence

extension Document: Sequence {
    public func makeIterator() -> AnyIterator<(key: String, value: BsonValue)> {
        var index = 0
        return AnyIterator {
            guard index < self.storage.count else { return nil }
            let element = self.storage[index]
            index += 1
            return element
        }
    }
}

// MARK: - Codable

extension Document: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let dict = try container.decode([String: AnyCodable].self)
        self.storage = dict.map { (key: $0.key, value: $0.value.bsonValue) }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        var dict = [String: AnyCodable]()
        for (key, value) in storage {
            dict[key] = AnyCodable(value)
        }
        try container.encode(dict)
    }
}

// MARK: - AnyCodable Helper

/// A type-erased Codable wrapper for BsonValue.
internal struct AnyCodable: Codable {
    let bsonValue: BsonValue

    init(_ value: BsonValue) {
        self.bsonValue = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            bsonValue = .null
        } else if let bool = try? container.decode(Bool.self) {
            bsonValue = .bool(bool)
        } else if let int = try? container.decode(Int64.self) {
            bsonValue = .int64(int)
        } else if let double = try? container.decode(Double.self) {
            bsonValue = .double(double)
        } else if let string = try? container.decode(String.self) {
            bsonValue = .string(string)
        } else if let array = try? container.decode([AnyCodable].self) {
            bsonValue = .array(array.map { $0.bsonValue })
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            // Check for extended JSON types
            if let oidValue = dict["$oid"]?.bsonValue, case .string(let oid) = oidValue {
                bsonValue = .objectId(ObjectId(hexString: oid) ?? ObjectId())
            } else if let dateValue = dict["$date"]?.bsonValue, case .int64(let millis) = dateValue {
                bsonValue = .date(Date(timeIntervalSince1970: TimeInterval(millis) / 1000))
            } else {
                var doc = Document()
                for (key, value) in dict {
                    doc[key] = value.bsonValue
                }
                bsonValue = .document(doc)
            }
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported type")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch bsonValue {
        case .null:
            try container.encodeNil()
        case .bool(let v):
            try container.encode(v)
        case .int32(let v):
            try container.encode(v)
        case .int64(let v):
            try container.encode(v)
        case .double(let v):
            try container.encode(v)
        case .string(let v):
            try container.encode(v)
        case .objectId(let v):
            try container.encode(["$oid": v.hexString])
        case .date(let v):
            try container.encode(["$date": Int64(v.timeIntervalSince1970 * 1000)])
        case .array(let v):
            try container.encode(v.map { AnyCodable($0) })
        case .document(let v):
            var dict = [String: AnyCodable]()
            for (key, value) in v {
                dict[key] = AnyCodable(value)
            }
            try container.encode(dict)
        case .binary(let v):
            try container.encode(["$binary": ["base64": v.base64EncodedString(), "subType": "00"]])
        case .regex(let pattern, let options):
            try container.encode(["$regex": pattern, "$options": options])
        }
    }
}

// MARK: - Result Types

/// Result of an insertOne operation.
public struct InsertOneResult: Sendable {
    /// The ID of the inserted document.
    public let insertedId: BsonValue

    public init(insertedId: BsonValue) {
        self.insertedId = insertedId
    }
}

/// Result of an insertMany operation.
public struct InsertManyResult: Sendable {
    /// Map of index to inserted ID.
    public let insertedIds: [Int: BsonValue]

    public init(insertedIds: [Int: BsonValue]) {
        self.insertedIds = insertedIds
    }
}

/// Result of an update operation.
public struct UpdateResult: Sendable {
    /// Number of documents matched.
    public let matchedCount: Int
    /// Number of documents modified.
    public let modifiedCount: Int
    /// The ID of the upserted document, if any.
    public let upsertedId: BsonValue?

    public init(matchedCount: Int, modifiedCount: Int, upsertedId: BsonValue? = nil) {
        self.matchedCount = matchedCount
        self.modifiedCount = modifiedCount
        self.upsertedId = upsertedId
    }
}

/// Result of a delete operation.
public struct DeleteResult: Sendable {
    /// Number of documents deleted.
    public let deletedCount: Int

    public init(deletedCount: Int) {
        self.deletedCount = deletedCount
    }
}

/// Result of a bulk write operation.
public struct BulkWriteResult: Sendable {
    /// Number of documents inserted.
    public let insertedCount: Int
    /// Number of documents matched by update/replace operations.
    public let matchedCount: Int
    /// Number of documents modified.
    public let modifiedCount: Int
    /// Number of documents deleted.
    public let deletedCount: Int
    /// Number of documents upserted.
    public let upsertedCount: Int
    /// Map of index to inserted ID.
    public let insertedIds: [Int: BsonValue]
    /// Map of index to upserted ID.
    public let upsertedIds: [Int: BsonValue]

    public init(
        insertedCount: Int,
        matchedCount: Int,
        modifiedCount: Int,
        deletedCount: Int,
        upsertedCount: Int,
        insertedIds: [Int: BsonValue],
        upsertedIds: [Int: BsonValue]
    ) {
        self.insertedCount = insertedCount
        self.matchedCount = matchedCount
        self.modifiedCount = modifiedCount
        self.deletedCount = deletedCount
        self.upsertedCount = upsertedCount
        self.insertedIds = insertedIds
        self.upsertedIds = upsertedIds
    }
}

/// Options for bulk write operations.
public struct BulkWriteOptions: Sendable {
    /// Whether to continue processing after an error.
    public var ordered: Bool?

    /// Create bulk write options.
    public init(ordered: Bool? = nil) {
        self.ordered = ordered
    }

    /// Convert to dictionary for RPC.
    internal func toDictionary() -> [String: Any] {
        var dict = [String: Any]()
        if let ordered = ordered { dict["ordered"] = ordered }
        return dict
    }
}

/// A write model for bulk write operations.
public enum WriteModel<T: Codable>: Sendable {
    /// Insert a document.
    case insertOne(T)
    /// Update a single document.
    case updateOne(filter: Document, update: Document, upsert: Bool = false)
    /// Update multiple documents.
    case updateMany(filter: Document, update: Document, upsert: Bool = false)
    /// Replace a document.
    case replaceOne(filter: Document, replacement: T, upsert: Bool = false)
    /// Delete a single document.
    case deleteOne(Document)
    /// Delete multiple documents.
    case deleteMany(Document)

    /// Convert to RPC format.
    internal func toRpcFormat() throws -> [String: Any] {
        switch self {
        case .insertOne(let document):
            let docDict: [String: Any]
            if let doc = document as? Document {
                docDict = doc.toDictionary()
            } else {
                let data = try JSONEncoder().encode(document)
                guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    throw MongoError.serializationError("Failed to serialize document")
                }
                docDict = dict
            }
            return ["insertOne": ["document": docDict]]

        case .updateOne(let filter, let update, let upsert):
            var op: [String: Any] = [
                "filter": filter.toDictionary(),
                "update": update.toDictionary()
            ]
            if upsert { op["upsert"] = true }
            return ["updateOne": op]

        case .updateMany(let filter, let update, let upsert):
            var op: [String: Any] = [
                "filter": filter.toDictionary(),
                "update": update.toDictionary()
            ]
            if upsert { op["upsert"] = true }
            return ["updateMany": op]

        case .replaceOne(let filter, let replacement, let upsert):
            let repDict: [String: Any]
            if let doc = replacement as? Document {
                repDict = doc.toDictionary()
            } else {
                let data = try JSONEncoder().encode(replacement)
                guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    throw MongoError.serializationError("Failed to serialize replacement")
                }
                repDict = dict
            }
            var op: [String: Any] = [
                "filter": filter.toDictionary(),
                "replacement": repDict
            ]
            if upsert { op["upsert"] = true }
            return ["replaceOne": op]

        case .deleteOne(let filter):
            return ["deleteOne": ["filter": filter.toDictionary()]]

        case .deleteMany(let filter):
            return ["deleteMany": ["filter": filter.toDictionary()]]
        }
    }
}
