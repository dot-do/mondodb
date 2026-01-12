// MongoDatabase.swift
// MongoDo - MongoDB on the Edge
//
// Database handle for MongoDB operations.

import Foundation

// MARK: - MongoDatabase

/// A handle to a MongoDB database.
///
/// Example usage:
/// ```swift
/// let client = try MongoClient("mongodb://localhost")
/// let db = client.db("myapp")
///
/// // Get a collection
/// let users = db.collection("users")
///
/// // List collections
/// let names = try await db.listCollectionNames()
///
/// // Drop the database
/// try await db.drop()
/// ```
public final class MongoDatabase: @unchecked Sendable {
    /// The database name.
    public let name: String

    /// The client that owns this database.
    internal let client: MongoClient

    /// Cache of collection handles.
    private var collections: [String: Any] = [:]
    private let lock = NSLock()

    internal init(name: String, client: MongoClient) {
        self.name = name
        self.client = client
    }

    /// Get a collection handle.
    ///
    /// - Parameter name: The collection name
    /// - Returns: A collection handle
    public func collection(_ name: String) -> MongoCollection<Document> {
        lock.lock()
        defer { lock.unlock() }

        let key = name
        if let collection = collections[key] as? MongoCollection<Document> {
            return collection
        }

        let collection = MongoCollection<Document>(name: name, database: self)
        collections[key] = collection
        return collection
    }

    /// Get a typed collection handle.
    ///
    /// - Parameters:
    ///   - name: The collection name
    ///   - type: The document type
    /// - Returns: A typed collection handle
    public func collection<T: Codable>(_ name: String, withType type: T.Type) -> MongoCollection<T> {
        MongoCollection<T>(name: name, database: self)
    }

    /// List all collection names in this database.
    public func listCollectionNames() async throws -> [String] {
        let result = try await client.rpcClient.call("mongo.listCollections", args: [name])

        if let names = result as? [String] {
            return names
        }

        if let names = result as? [Any] {
            return names.compactMap { $0 as? String }
        }

        return []
    }

    /// List all collections with their info.
    public func listCollections() async throws -> [Document] {
        let result = try await client.rpcClient.call("mongo.listCollectionsWithInfo", args: [name])

        if let docs = result as? [[String: Any]] {
            return docs.map { Document($0) }
        }

        return []
    }

    /// Create a collection.
    ///
    /// - Parameters:
    ///   - name: The collection name
    ///   - options: Collection creation options
    public func createCollection(_ name: String, options: CreateCollectionOptions? = nil) async throws {
        var args: [Any] = [self.name, name]

        if let opts = options {
            var optsDict = [String: Any]()
            if let capped = opts.capped {
                optsDict["capped"] = capped
            }
            if let size = opts.size {
                optsDict["size"] = size
            }
            if let max = opts.max {
                optsDict["max"] = max
            }
            if let validator = opts.validator {
                optsDict["validator"] = validator.toDictionary()
            }
            args.append(optsDict)
        }

        _ = try await client.rpcClient.call("mongo.createCollection", args: args)
    }

    /// Drop this database.
    public func drop() async throws {
        _ = try await client.rpcClient.call("mongo.dropDatabase", args: [name])
    }

    /// Run a command on this database.
    ///
    /// - Parameter command: The command document
    /// - Returns: The command result
    public func runCommand(_ command: Document) async throws -> Document {
        let result = try await client.rpcClient.call("mongo.runCommand", args: [name, command.toDictionary()])

        if let dict = result as? [String: Any] {
            return Document(dict)
        }

        return Document()
    }

    /// Get database stats.
    public func stats() async throws -> Document {
        try await runCommand(["dbStats": 1])
    }

    /// Get the current operation.
    public func currentOp() async throws -> Document {
        try await runCommand(["currentOp": 1])
    }
}

// MARK: - CreateCollectionOptions

/// Options for creating a collection.
public struct CreateCollectionOptions: Sendable {
    /// Whether the collection is capped.
    public var capped: Bool?

    /// The maximum size in bytes (for capped collections).
    public var size: Int?

    /// The maximum number of documents (for capped collections).
    public var max: Int?

    /// Validation rules for the collection.
    public var validator: Document?

    /// Create options.
    public init(
        capped: Bool? = nil,
        size: Int? = nil,
        max: Int? = nil,
        validator: Document? = nil
    ) {
        self.capped = capped
        self.size = size
        self.max = max
        self.validator = validator
    }
}
