// MongoCursor.swift
// MongoDo - MongoDB on the Edge
//
// Cursor for iterating over query results with AsyncSequence.

import Foundation

// MARK: - MongoCursor

/// A cursor for iterating over MongoDB query results.
///
/// Cursors implement `AsyncSequence` and can be used with `for try await`:
///
/// ```swift
/// let cursor = collection.find(["status": "active"])
///
/// for try await doc in cursor {
///     print(doc)
/// }
/// ```
///
/// Or collect all results:
///
/// ```swift
/// let docs = try await cursor.toArray()
/// ```
public final class MongoCursor<T: Codable>: AsyncSequence, @unchecked Sendable {
    public typealias Element = T

    /// The collection this cursor is for.
    private let collection: MongoCollection<T>

    /// The filter for find operations.
    private let filter: Document?

    /// The find options.
    private let options: FindOptions?

    /// The aggregation pipeline (if this is an aggregation cursor).
    private let pipeline: [Document]?

    /// Buffered documents.
    private var buffer: [Any] = []

    /// Current cursor ID from the server.
    private var cursorId: String?

    /// Whether the cursor is exhausted.
    private var exhausted: Bool = false

    /// Whether the cursor has been started.
    private var started: Bool = false

    /// Lock for thread safety.
    private let lock = NSLock()

    /// Create a find cursor.
    internal init(collection: MongoCollection<T>, filter: Document?, options: FindOptions?) {
        self.collection = collection
        self.filter = filter
        self.options = options
        self.pipeline = nil
    }

    /// Create an aggregation cursor.
    internal init(collection: MongoCollection<T>, pipeline: [Document]) where T == Document {
        self.collection = collection
        self.filter = nil
        self.options = nil
        self.pipeline = pipeline
    }

    /// Create an empty cursor.
    public static func empty() -> MongoCursor<T> where T == Document {
        // Create a placeholder collection - this cursor will return no results
        let mockClient = try! MongoClient("mongodb://localhost")
        let db = mockClient.db("_empty")
        let collection = db.collection("_empty")
        let cursor = MongoCursor<Document>(collection: collection, filter: nil, options: nil)
        cursor.exhausted = true
        return cursor
    }

    // MARK: - AsyncSequence

    public struct AsyncIterator: AsyncIteratorProtocol {
        private let cursor: MongoCursor<T>

        init(cursor: MongoCursor<T>) {
            self.cursor = cursor
        }

        public mutating func next() async throws -> T? {
            try await cursor.next()
        }
    }

    public func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(cursor: self)
    }

    // MARK: - Cursor Operations

    /// Get the next document.
    public func next() async throws -> T? {
        lock.lock()
        let needsFetch = buffer.isEmpty && !exhausted
        lock.unlock()

        if needsFetch {
            try await fetchMore()
        }

        lock.lock()
        defer { lock.unlock() }

        guard !buffer.isEmpty else {
            return nil
        }

        let value = buffer.removeFirst()
        return try deserialize(value)
    }

    /// Check if the cursor has more results.
    public var hasNext: Bool {
        lock.lock()
        defer { lock.unlock() }
        return !buffer.isEmpty || !exhausted
    }

    /// Check if the cursor is exhausted.
    public var isExhausted: Bool {
        lock.lock()
        defer { lock.unlock() }
        return exhausted && buffer.isEmpty
    }

    /// Close the cursor.
    public func close() async throws {
        lock.lock()
        let id = cursorId
        exhausted = true
        buffer.removeAll()
        cursorId = nil
        lock.unlock()

        if let id = id {
            _ = try? await collection.database.client.rpcClient.call("mongo.killCursors", args: [collection.namespace, [id]])
        }
    }

    /// Collect all documents into an array.
    public func toArray() async throws -> [T] {
        var results = [T]()

        for try await doc in self {
            results.append(doc)
        }

        return results
    }

    /// Get the first document.
    public func first() async throws -> T? {
        try await next()
    }

    // Note: The standard AsyncSequence extension methods (map, filter, prefix, dropFirst)
    // are automatically available via the AsyncSequence conformance.

    /// Reduce documents to a single value.
    public func reduce<Result>(
        _ initialResult: Result,
        _ nextPartialResult: (Result, T) async throws -> Result
    ) async throws -> Result {
        var result = initialResult
        for try await element in self {
            result = try await nextPartialResult(result, element)
        }
        return result
    }

    /// Check if all documents match a predicate.
    public func allSatisfy(_ predicate: (T) throws -> Bool) async throws -> Bool {
        for try await element in self {
            if try !predicate(element) {
                return false
            }
        }
        return true
    }

    /// Check if any document matches a predicate.
    public func contains(where predicate: (T) throws -> Bool) async throws -> Bool {
        for try await element in self {
            if try predicate(element) {
                return true
            }
        }
        return false
    }

    // MARK: - Helpers

    private func fetchMore() async throws {
        lock.lock()

        if exhausted {
            lock.unlock()
            return
        }

        let currentCursorId = cursorId
        started = true

        lock.unlock()

        let result: (documents: [Any], cursorId: String?)

        if let pipeline = pipeline {
            // Aggregation cursor
            result = try await (collection as! MongoCollection<Document>).fetchAggregation(
                pipeline: pipeline,
                cursorId: currentCursorId
            )
        } else {
            // Find cursor
            result = try await collection.fetchDocuments(
                filter: filter,
                options: options,
                cursorId: currentCursorId
            )
        }

        lock.lock()
        buffer.append(contentsOf: result.documents)
        cursorId = result.cursorId

        if result.cursorId == nil {
            exhausted = true
        }
        lock.unlock()
    }

    private func deserialize(_ value: Any) throws -> T {
        if T.self == Document.self {
            if let dict = value as? [String: Any] {
                return Document(dict) as! T
            }
            throw MongoError.deserializationError("Expected dictionary")
        }

        let data: Data
        if let dict = value as? [String: Any] {
            data = try JSONSerialization.data(withJSONObject: dict)
        } else if let valueData = value as? Data {
            data = valueData
        } else {
            throw MongoError.deserializationError("Unexpected value type")
        }

        return try JSONDecoder().decode(T.self, from: data)
    }
}

// MARK: - ChangeStream

/// A change stream for watching collection changes.
///
/// Example usage:
/// ```swift
/// for try await change in collection.watch() {
///     switch change.operationType {
///     case "insert":
///         print("New document: \(change.fullDocument)")
///     case "update":
///         print("Updated: \(change.documentKey)")
///     case "delete":
///         print("Deleted: \(change.documentKey)")
///     default:
///         break
///     }
/// }
/// ```
public final class ChangeStream<T: Codable>: AsyncSequence, @unchecked Sendable {
    public typealias Element = ChangeEvent<T>

    /// The collection being watched.
    private let collection: MongoCollection<T>

    /// The aggregation pipeline for filtering changes.
    private let pipeline: [Document]

    /// The resume token.
    private var resumeToken: Document?

    /// Whether the stream is closed.
    private var closed: Bool = false

    /// Lock for thread safety.
    private let lock = NSLock()

    internal init(collection: MongoCollection<T>, pipeline: [Document] = []) {
        self.collection = collection
        self.pipeline = pipeline
    }

    // MARK: - AsyncSequence

    public struct AsyncIterator: AsyncIteratorProtocol {
        private let stream: ChangeStream<T>

        init(stream: ChangeStream<T>) {
            self.stream = stream
        }

        public mutating func next() async throws -> ChangeEvent<T>? {
            try await stream.next()
        }
    }

    public func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(stream: self)
    }

    // MARK: - Operations

    /// Get the next change event.
    public func next() async throws -> ChangeEvent<T>? {
        lock.lock()
        if closed {
            lock.unlock()
            return nil
        }
        let token = resumeToken
        lock.unlock()

        var args: [Any] = [
            collection.database.name,
            collection.name,
            pipeline.map { $0.toDictionary() }
        ]

        if let token = token {
            args.append(["resumeAfter": token.toDictionary()])
        }

        let result = try await collection.database.client.rpcClient.call("mongo.watch", args: args)

        guard let dict = result as? [String: Any] else {
            return nil
        }

        // Parse change event
        let operationType = dict["operationType"] as? String ?? ""
        let documentKey = (dict["documentKey"] as? [String: Any]).map { Document($0) }
        let fullDocument = try parseDocument(dict["fullDocument"])
        let updateDescription = parseUpdateDescription(dict["updateDescription"])
        let clusterTime = dict["clusterTime"] as? Int64

        if let tokenDict = dict["_id"] as? [String: Any] {
            lock.lock()
            resumeToken = Document(tokenDict)
            lock.unlock()
        }

        return ChangeEvent(
            operationType: operationType,
            documentKey: documentKey,
            fullDocument: fullDocument,
            updateDescription: updateDescription,
            clusterTime: clusterTime
        )
    }

    /// Close the change stream.
    public func close() {
        lock.lock()
        closed = true
        lock.unlock()
    }

    /// Get the current resume token.
    public var currentResumeToken: Document? {
        lock.lock()
        defer { lock.unlock() }
        return resumeToken
    }

    private func parseDocument(_ value: Any?) throws -> T? {
        guard let value = value else { return nil }

        if T.self == Document.self {
            if let dict = value as? [String: Any] {
                return Document(dict) as? T
            }
            return nil
        }

        if let dict = value as? [String: Any] {
            let data = try JSONSerialization.data(withJSONObject: dict)
            return try JSONDecoder().decode(T.self, from: data)
        }

        return nil
    }

    private func parseUpdateDescription(_ value: Any?) -> UpdateDescription? {
        guard let dict = value as? [String: Any] else { return nil }

        let updatedFields = (dict["updatedFields"] as? [String: Any]).map { Document($0) }
        let removedFields = dict["removedFields"] as? [String]

        return UpdateDescription(updatedFields: updatedFields, removedFields: removedFields)
    }
}

// MARK: - ChangeEvent

/// A change event from a change stream.
public struct ChangeEvent<T: Codable>: Sendable where T: Sendable {
    /// The type of operation (insert, update, replace, delete, etc.).
    public let operationType: String

    /// The document key (_id).
    public let documentKey: Document?

    /// The full document (for insert, update, replace).
    public let fullDocument: T?

    /// Description of the update (for update operations).
    public let updateDescription: UpdateDescription?

    /// The cluster time of the change.
    public let clusterTime: Int64?
}

// MARK: - UpdateDescription

/// Description of an update operation.
public struct UpdateDescription: Sendable {
    /// The fields that were updated.
    public let updatedFields: Document?

    /// The fields that were removed.
    public let removedFields: [String]?
}

// MARK: - Collection Extension for Watch

extension MongoCollection {
    /// Watch for changes to this collection.
    ///
    /// - Parameter pipeline: Optional aggregation pipeline to filter changes
    /// - Returns: A change stream
    public func watch(pipeline: [Document] = []) -> ChangeStream<T> {
        ChangeStream(collection: self, pipeline: pipeline)
    }
}
