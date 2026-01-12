// MongoCollection.swift
// MongoDo - MongoDB on the Edge
//
// Collection with CRUD operations.

import Foundation

// MARK: - FindOptions

/// Options for find operations.
public struct FindOptions: Sendable {
    /// Maximum number of documents to return.
    public var limit: Int?

    /// Number of documents to skip.
    public var skip: Int?

    /// Sort order.
    public var sort: Document?

    /// Projection (fields to include/exclude).
    public var projection: Document?

    /// Batch size for cursor.
    public var batchSize: Int?

    /// Create find options.
    public init(
        limit: Int? = nil,
        skip: Int? = nil,
        sort: Document? = nil,
        projection: Document? = nil,
        batchSize: Int? = nil
    ) {
        self.limit = limit
        self.skip = skip
        self.sort = sort
        self.projection = projection
        self.batchSize = batchSize
    }

    /// Convert to dictionary for RPC.
    internal func toDictionary() -> [String: Any] {
        var dict = [String: Any]()
        if let limit = limit { dict["limit"] = limit }
        if let skip = skip { dict["skip"] = skip }
        if let sort = sort { dict["sort"] = sort.toDictionary() }
        if let projection = projection { dict["projection"] = projection.toDictionary() }
        if let batchSize = batchSize { dict["batchSize"] = batchSize }
        return dict
    }
}

// MARK: - UpdateOptions

/// Options for update operations.
public struct UpdateOptions: Sendable {
    /// Whether to insert if no documents match.
    public var upsert: Bool?

    /// Array filters for updating nested arrays.
    public var arrayFilters: [Document]?

    /// Create update options.
    public init(
        upsert: Bool? = nil,
        arrayFilters: [Document]? = nil
    ) {
        self.upsert = upsert
        self.arrayFilters = arrayFilters
    }

    /// Convert to dictionary for RPC.
    internal func toDictionary() -> [String: Any] {
        var dict = [String: Any]()
        if let upsert = upsert { dict["upsert"] = upsert }
        if let arrayFilters = arrayFilters {
            dict["arrayFilters"] = arrayFilters.map { $0.toDictionary() }
        }
        return dict
    }
}

// MARK: - IndexOptions

/// Options for creating an index.
public struct IndexOptions: Sendable {
    /// The index name.
    public var name: String?

    /// Whether the index is unique.
    public var unique: Bool?

    /// Whether the index is sparse.
    public var sparse: Bool?

    /// TTL in seconds for expiring documents.
    public var expireAfterSeconds: Int?

    /// Partial filter expression.
    public var partialFilterExpression: Document?

    /// Create index options.
    public init(
        name: String? = nil,
        unique: Bool? = nil,
        sparse: Bool? = nil,
        expireAfterSeconds: Int? = nil,
        partialFilterExpression: Document? = nil
    ) {
        self.name = name
        self.unique = unique
        self.sparse = sparse
        self.expireAfterSeconds = expireAfterSeconds
        self.partialFilterExpression = partialFilterExpression
    }

    /// Convert to dictionary for RPC.
    internal func toDictionary() -> [String: Any] {
        var dict = [String: Any]()
        if let name = name { dict["name"] = name }
        if let unique = unique { dict["unique"] = unique }
        if let sparse = sparse { dict["sparse"] = sparse }
        if let expireAfterSeconds = expireAfterSeconds {
            dict["expireAfterSeconds"] = expireAfterSeconds
        }
        if let partialFilterExpression = partialFilterExpression {
            dict["partialFilterExpression"] = partialFilterExpression.toDictionary()
        }
        return dict
    }
}

// MARK: - MongoCollection

/// A handle to a MongoDB collection.
///
/// Example usage:
/// ```swift
/// let client = try MongoClient("mongodb://localhost")
/// let db = client.db("mydb")
/// let users = db.collection("users")
///
/// // Insert
/// try await users.insertOne(["name": "John", "email": "john@example.com"])
///
/// // Find
/// for try await doc in users.find(["status": "active"]) {
///     print(doc)
/// }
///
/// // Update
/// try await users.updateOne(filter: ["_id": id], update: ["$set": ["name": "Jane"]])
///
/// // Delete
/// try await users.deleteOne(["_id": id])
/// ```
public final class MongoCollection<T: Codable>: @unchecked Sendable {
    /// The collection name.
    public let name: String

    /// The database that owns this collection.
    internal let database: MongoDatabase

    /// The full namespace (db.collection).
    public var namespace: String {
        "\(database.name).\(name)"
    }

    internal init(name: String, database: MongoDatabase) {
        self.name = name
        self.database = database
    }

    // MARK: - RPC Helper

    private var rpcClient: any RpcClientProtocol {
        database.client.rpcClient
    }

    private var dbName: String {
        database.name
    }

    // MARK: - Insert Operations

    /// Insert a single document.
    ///
    /// - Parameter document: The document to insert
    /// - Returns: The insert result with the inserted ID
    @discardableResult
    public func insertOne(_ document: T) async throws -> InsertOneResult {
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

        let result = try await rpcClient.call("mongo.insertOne", args: [dbName, name, docDict])

        var insertedId: BsonValue = .null
        if let dict = result as? [String: Any] {
            if let id = dict["insertedId"] {
                insertedId = BsonValue.fromAny(id)
            }
        }

        return InsertOneResult(insertedId: insertedId)
    }

    /// Insert a document from a dictionary literal.
    @discardableResult
    public func insertOne(_ document: [String: BsonValue]) async throws -> InsertOneResult where T == Document {
        let doc = Document(document.map { ($0.key, $0.value) })
        return try await insertOne(doc)
    }

    /// Insert multiple documents.
    ///
    /// - Parameter documents: The documents to insert
    /// - Returns: The insert result with inserted IDs
    @discardableResult
    public func insertMany(_ documents: [T]) async throws -> InsertManyResult {
        var docDicts = [[String: Any]]()

        for document in documents {
            if let doc = document as? Document {
                docDicts.append(doc.toDictionary())
            } else {
                let data = try JSONEncoder().encode(document)
                guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    throw MongoError.serializationError("Failed to serialize document")
                }
                docDicts.append(dict)
            }
        }

        let result = try await rpcClient.call("mongo.insertMany", args: [dbName, name, docDicts])

        var insertedIds = [Int: BsonValue]()
        if let dict = result as? [String: Any],
           let ids = dict["insertedIds"] as? [String: Any] {
            for (key, value) in ids {
                if let idx = Int(key) {
                    insertedIds[idx] = BsonValue.fromAny(value)
                }
            }
        }

        return InsertManyResult(insertedIds: insertedIds)
    }

    // MARK: - Find Operations

    /// Find documents matching a filter.
    ///
    /// - Parameter filter: The filter document (nil for all documents)
    /// - Returns: A cursor for iterating over results
    public func find(_ filter: Document? = nil) -> MongoCursor<T> {
        MongoCursor(collection: self, filter: filter, options: nil)
    }

    /// Find documents with options.
    ///
    /// - Parameters:
    ///   - filter: The filter document
    ///   - options: Find options
    /// - Returns: A cursor for iterating over results
    public func find(_ filter: Document?, options: FindOptions) -> MongoCursor<T> {
        MongoCursor(collection: self, filter: filter, options: options)
    }

    /// Find documents using a dictionary literal filter.
    public func find(_ filter: [String: BsonValue]) -> MongoCursor<T> {
        find(Document(filter.map { ($0.key, $0.value) }))
    }

    /// Find a single document.
    ///
    /// - Parameter filter: The filter document
    /// - Returns: The first matching document, or nil
    public func findOne(_ filter: Document? = nil) async throws -> T? {
        let filterDict = filter?.toDictionary() ?? [:]

        let result = try await rpcClient.call("mongo.findOne", args: [dbName, name, filterDict])

        if result is NSNull || (result as? [String: Any])?.isEmpty == true {
            return nil
        }

        return try deserialize(result)
    }

    /// Find a single document using a dictionary literal filter.
    public func findOne(_ filter: [String: BsonValue]) async throws -> T? {
        try await findOne(Document(filter.map { ($0.key, $0.value) }))
    }

    // MARK: - Update Operations

    /// Update a single document.
    ///
    /// - Parameters:
    ///   - filter: The filter to match documents
    ///   - update: The update operations
    ///   - options: Update options
    /// - Returns: The update result
    @discardableResult
    public func updateOne(
        filter: Document,
        update: Document,
        options: UpdateOptions? = nil
    ) async throws -> UpdateResult {
        var args: [Any] = [
            dbName,
            name,
            filter.toDictionary(),
            update.toDictionary()
        ]

        if let opts = options {
            args.append(opts.toDictionary())
        }

        let result = try await rpcClient.call("mongo.updateOne", args: args)

        return parseUpdateResult(result)
    }

    /// Update a single document using dictionary literals.
    @discardableResult
    public func updateOne(
        filter: [String: BsonValue],
        update: [String: BsonValue],
        options: UpdateOptions? = nil
    ) async throws -> UpdateResult {
        try await updateOne(
            filter: Document(filter.map { ($0.key, $0.value) }),
            update: Document(update.map { ($0.key, $0.value) }),
            options: options
        )
    }

    /// Update multiple documents.
    ///
    /// - Parameters:
    ///   - filter: The filter to match documents
    ///   - update: The update operations
    ///   - options: Update options
    /// - Returns: The update result
    @discardableResult
    public func updateMany(
        filter: Document,
        update: Document,
        options: UpdateOptions? = nil
    ) async throws -> UpdateResult {
        var args: [Any] = [
            dbName,
            name,
            filter.toDictionary(),
            update.toDictionary()
        ]

        if let opts = options {
            args.append(opts.toDictionary())
        }

        let result = try await rpcClient.call("mongo.updateMany", args: args)

        return parseUpdateResult(result)
    }

    /// Replace a single document.
    ///
    /// - Parameters:
    ///   - filter: The filter to match documents
    ///   - replacement: The replacement document
    ///   - options: Update options
    /// - Returns: The update result
    @discardableResult
    public func replaceOne(
        filter: Document,
        replacement: T,
        options: UpdateOptions? = nil
    ) async throws -> UpdateResult {
        let replacementDict: [String: Any]
        if let doc = replacement as? Document {
            replacementDict = doc.toDictionary()
        } else {
            let data = try JSONEncoder().encode(replacement)
            guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw MongoError.serializationError("Failed to serialize replacement")
            }
            replacementDict = dict
        }

        var args: [Any] = [dbName, name, filter.toDictionary(), replacementDict]

        if let opts = options {
            args.append(opts.toDictionary())
        }

        let result = try await rpcClient.call("mongo.replaceOne", args: args)

        return parseUpdateResult(result)
    }

    // MARK: - Delete Operations

    /// Delete a single document.
    ///
    /// - Parameter filter: The filter to match documents
    /// - Returns: The delete result
    @discardableResult
    public func deleteOne(_ filter: Document) async throws -> DeleteResult {
        let result = try await rpcClient.call("mongo.deleteOne", args: [dbName, name, filter.toDictionary()])

        return parseDeleteResult(result)
    }

    /// Delete a single document using a dictionary literal.
    @discardableResult
    public func deleteOne(_ filter: [String: BsonValue]) async throws -> DeleteResult {
        try await deleteOne(Document(filter.map { ($0.key, $0.value) }))
    }

    /// Delete multiple documents.
    ///
    /// - Parameter filter: The filter to match documents
    /// - Returns: The delete result
    @discardableResult
    public func deleteMany(_ filter: Document) async throws -> DeleteResult {
        let result = try await rpcClient.call("mongo.deleteMany", args: [dbName, name, filter.toDictionary()])

        return parseDeleteResult(result)
    }

    // MARK: - Find and Modify Operations

    /// Find one document and update it.
    ///
    /// - Parameters:
    ///   - filter: The filter to match documents
    ///   - update: The update operations
    /// - Returns: The original document, or nil if not found
    public func findOneAndUpdate(filter: Document, update: Document) async throws -> T? {
        let result = try await rpcClient.call(
            "mongo.findOneAndUpdate",
            args: [dbName, name, filter.toDictionary(), update.toDictionary()]
        )

        if result is NSNull {
            return nil
        }

        return try deserialize(result)
    }

    /// Find one document and delete it.
    ///
    /// - Parameter filter: The filter to match documents
    /// - Returns: The deleted document, or nil if not found
    public func findOneAndDelete(_ filter: Document) async throws -> T? {
        let result = try await rpcClient.call(
            "mongo.findOneAndDelete",
            args: [dbName, name, filter.toDictionary()]
        )

        if result is NSNull {
            return nil
        }

        return try deserialize(result)
    }

    /// Find one document and replace it.
    ///
    /// - Parameters:
    ///   - filter: The filter to match documents
    ///   - replacement: The replacement document
    /// - Returns: The original document, or nil if not found
    public func findOneAndReplace(filter: Document, replacement: T) async throws -> T? {
        let replacementDict: [String: Any]
        if let doc = replacement as? Document {
            replacementDict = doc.toDictionary()
        } else {
            let data = try JSONEncoder().encode(replacement)
            guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw MongoError.serializationError("Failed to serialize replacement")
            }
            replacementDict = dict
        }

        let result = try await rpcClient.call(
            "mongo.findOneAndReplace",
            args: [dbName, name, filter.toDictionary(), replacementDict]
        )

        if result is NSNull {
            return nil
        }

        return try deserialize(result)
    }

    // MARK: - Count Operations

    /// Count documents matching a filter.
    ///
    /// - Parameter filter: The filter document (nil for all documents)
    /// - Returns: The count
    public func countDocuments(_ filter: Document? = nil) async throws -> Int {
        let filterDict = filter?.toDictionary() ?? [:]

        let result = try await rpcClient.call("mongo.countDocuments", args: [dbName, name, filterDict])

        if let count = result as? Int {
            return count
        }
        if let count = result as? Int64 {
            return Int(count)
        }
        if let count = result as? Double {
            return Int(count)
        }

        return 0
    }

    /// Estimated document count (fast).
    public func estimatedDocumentCount() async throws -> Int {
        let result = try await rpcClient.call("mongo.estimatedDocumentCount", args: [dbName, name])

        if let count = result as? Int {
            return count
        }
        if let count = result as? Int64 {
            return Int(count)
        }
        if let count = result as? Double {
            return Int(count)
        }

        return 0
    }

    // MARK: - Aggregation

    /// Run an aggregation pipeline.
    ///
    /// - Parameter pipeline: The aggregation pipeline stages
    /// - Returns: A cursor for iterating over results
    public func aggregate(_ pipeline: [Document]) -> MongoCursor<Document> {
        MongoCursor(collection: self as! MongoCollection<Document>, pipeline: pipeline)
    }

    // MARK: - Distinct

    /// Get distinct values for a field.
    ///
    /// - Parameters:
    ///   - fieldName: The field to get distinct values for
    ///   - filter: Optional filter
    /// - Returns: Array of distinct values
    public func distinct(_ fieldName: String, filter: Document? = nil) async throws -> [BsonValue] {
        let filterDict = filter?.toDictionary() ?? [:]

        let result = try await rpcClient.call("mongo.distinct", args: [dbName, name, fieldName, filterDict])

        if let values = result as? [Any] {
            return values.map { BsonValue.fromAny($0) }
        }

        return []
    }

    // MARK: - Index Operations

    /// Create an index.
    ///
    /// - Parameters:
    ///   - keys: The index keys
    ///   - options: Index options
    /// - Returns: The index name
    @discardableResult
    public func createIndex(_ keys: Document, options: IndexOptions? = nil) async throws -> String {
        var args: [Any] = [dbName, name, keys.toDictionary()]

        if let opts = options {
            args.append(opts.toDictionary())
        }

        let result = try await rpcClient.call("mongo.createIndex", args: args)

        if let indexName = result as? String {
            return indexName
        }

        return ""
    }

    /// Drop an index.
    ///
    /// - Parameter indexName: The name of the index to drop
    public func dropIndex(_ indexName: String) async throws {
        _ = try await rpcClient.call("mongo.dropIndex", args: [dbName, name, indexName])
    }

    /// Drop all indexes (except _id).
    public func dropIndexes() async throws {
        _ = try await rpcClient.call("mongo.dropIndexes", args: [dbName, name])
    }

    /// List all indexes.
    public func listIndexes() async throws -> [Document] {
        let result = try await rpcClient.call("mongo.listIndexes", args: [dbName, name])

        if let indexes = result as? [[String: Any]] {
            return indexes.map { Document($0) }
        }

        return []
    }

    // MARK: - Collection Operations

    /// Drop this collection.
    public func drop() async throws {
        _ = try await rpcClient.call("mongo.dropCollection", args: [dbName, name])
    }

    /// Rename this collection.
    ///
    /// - Parameter newName: The new collection name
    public func rename(to newName: String) async throws {
        _ = try await rpcClient.call("mongo.renameCollection", args: [dbName, name, newName])
    }

    // MARK: - Bulk Write Operations

    /// Perform multiple write operations in bulk.
    ///
    /// - Parameters:
    ///   - operations: The write operations to perform
    ///   - options: Bulk write options
    /// - Returns: The bulk write result
    ///
    /// Example:
    /// ```swift
    /// let result = try await collection.bulkWrite([
    ///     .insertOne(["name": "Alice"]),
    ///     .updateOne(filter: ["name": "Bob"], update: ["$set": ["age": 30]]),
    ///     .deleteOne(["name": "Charlie"])
    /// ])
    /// ```
    @discardableResult
    public func bulkWrite(
        _ operations: [WriteModel<T>],
        options: BulkWriteOptions? = nil
    ) async throws -> BulkWriteResult {
        var opsArray = [[String: Any]]()

        for op in operations {
            opsArray.append(try op.toRpcFormat())
        }

        var args: [Any] = [dbName, name, opsArray]

        if let opts = options {
            args.append(opts.toDictionary())
        }

        let result = try await rpcClient.call("mongo.bulkWrite", args: args)

        return parseBulkWriteResult(result)
    }

    private func parseBulkWriteResult(_ result: Any) -> BulkWriteResult {
        guard let dict = result as? [String: Any] else {
            return BulkWriteResult(
                insertedCount: 0,
                matchedCount: 0,
                modifiedCount: 0,
                deletedCount: 0,
                upsertedCount: 0,
                insertedIds: [:],
                upsertedIds: [:]
            )
        }

        let insertedCount = (dict["insertedCount"] as? Int) ?? 0
        let matchedCount = (dict["matchedCount"] as? Int) ?? 0
        let modifiedCount = (dict["modifiedCount"] as? Int) ?? 0
        let deletedCount = (dict["deletedCount"] as? Int) ?? 0
        let upsertedCount = (dict["upsertedCount"] as? Int) ?? 0

        var insertedIds = [Int: BsonValue]()
        if let ids = dict["insertedIds"] as? [String: Any] {
            for (key, value) in ids {
                if let idx = Int(key) {
                    insertedIds[idx] = BsonValue.fromAny(value)
                }
            }
        }

        var upsertedIds = [Int: BsonValue]()
        if let ids = dict["upsertedIds"] as? [String: Any] {
            for (key, value) in ids {
                if let idx = Int(key) {
                    upsertedIds[idx] = BsonValue.fromAny(value)
                }
            }
        }

        return BulkWriteResult(
            insertedCount: insertedCount,
            matchedCount: matchedCount,
            modifiedCount: modifiedCount,
            deletedCount: deletedCount,
            upsertedCount: upsertedCount,
            insertedIds: insertedIds,
            upsertedIds: upsertedIds
        )
    }

    // MARK: - Helpers

    private func deserialize(_ result: Any) throws -> T? {
        if T.self == Document.self {
            if let dict = result as? [String: Any] {
                return Document(dict) as? T
            }
            return nil
        }

        let data: Data
        if let dict = result as? [String: Any] {
            data = try JSONSerialization.data(withJSONObject: dict)
        } else if let resultData = result as? Data {
            data = resultData
        } else {
            throw MongoError.deserializationError("Unexpected result type")
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    private func parseUpdateResult(_ result: Any) -> UpdateResult {
        guard let dict = result as? [String: Any] else {
            return UpdateResult(matchedCount: 0, modifiedCount: 0)
        }

        let matchedCount = (dict["matchedCount"] as? Int) ?? 0
        let modifiedCount = (dict["modifiedCount"] as? Int) ?? 0
        let upsertedId = dict["upsertedId"].map { BsonValue.fromAny($0) }

        return UpdateResult(
            matchedCount: matchedCount,
            modifiedCount: modifiedCount,
            upsertedId: upsertedId
        )
    }

    private func parseDeleteResult(_ result: Any) -> DeleteResult {
        guard let dict = result as? [String: Any] else {
            return DeleteResult(deletedCount: 0)
        }

        let deletedCount = (dict["deletedCount"] as? Int) ?? 0

        return DeleteResult(deletedCount: deletedCount)
    }

    // MARK: - Internal Fetch

    /// Fetch documents for cursor (internal use).
    internal func fetchDocuments(
        filter: Document?,
        options: FindOptions?,
        cursorId: String?
    ) async throws -> (documents: [Any], cursorId: String?) {
        if let cursorId = cursorId {
            // Get more from existing cursor
            let result = try await rpcClient.call("mongo.getMore", args: [cursorId, namespace, options?.batchSize ?? 100])

            if let dict = result as? [String: Any] {
                let documents = (dict["documents"] as? [Any]) ?? []
                let newCursorId = dict["cursorId"] as? String
                return (documents, newCursorId)
            }

            return ([], nil)
        }

        // Initial find
        var args: [Any] = [dbName, name, filter?.toDictionary() ?? [:]]

        if let opts = options {
            args.append(opts.toDictionary())
        }

        let result = try await rpcClient.call("mongo.find", args: args)

        if let dict = result as? [String: Any] {
            let documents = (dict["documents"] as? [Any]) ?? []
            let newCursorId = dict["cursorId"] as? String
            return (documents, newCursorId)
        }

        return ([], nil)
    }

    /// Fetch aggregation results (internal use).
    internal func fetchAggregation(
        pipeline: [Document],
        cursorId: String?
    ) async throws -> (documents: [Any], cursorId: String?) {
        if let cursorId = cursorId {
            // Get more from existing cursor
            let result = try await rpcClient.call("mongo.getMore", args: [cursorId, namespace, 100])

            if let dict = result as? [String: Any] {
                let documents = (dict["documents"] as? [Any]) ?? []
                let newCursorId = dict["cursorId"] as? String
                return (documents, newCursorId)
            }

            return ([], nil)
        }

        // Initial aggregate
        let pipelineArray = pipeline.map { $0.toDictionary() }
        let result = try await rpcClient.call("mongo.aggregate", args: [dbName, name, pipelineArray])

        if let dict = result as? [String: Any] {
            let documents = (dict["documents"] as? [Any]) ?? []
            let newCursorId = dict["cursorId"] as? String
            return (documents, newCursorId)
        }

        return ([], nil)
    }
}
