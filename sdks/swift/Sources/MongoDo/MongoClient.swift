// MongoClient.swift
// MongoDo - MongoDB on the Edge
//
// Client for connecting to MongoDB via RPC.

import Foundation

// MARK: - MongoError

/// Errors that can occur during MongoDB operations.
public enum MongoError: Error, Sendable {
    case invalidURI(String)
    case connectionFailed(String)
    case notConnected
    case invalidDocument(String)
    case cursorExhausted
    case operationFailed(String)
    case timeout
    case serializationError(String)
    case deserializationError(String)
    case networkError(String)
    case serverError(code: Int, message: String)
}

extension MongoError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .invalidURI(let uri):
            return "Invalid MongoDB URI: \(uri)"
        case .connectionFailed(let message):
            return "Connection failed: \(message)"
        case .notConnected:
            return "Not connected to MongoDB"
        case .invalidDocument(let message):
            return "Invalid document: \(message)"
        case .cursorExhausted:
            return "Cursor exhausted"
        case .operationFailed(let message):
            return "Operation failed: \(message)"
        case .timeout:
            return "Operation timed out"
        case .serializationError(let message):
            return "Serialization error: \(message)"
        case .deserializationError(let message):
            return "Deserialization error: \(message)"
        case .networkError(let message):
            return "Network error: \(message)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        }
    }
}

// MARK: - RpcClient Protocol

/// Protocol for RPC transport (allows mocking in tests).
public protocol RpcClientProtocol: Sendable {
    /// Call an RPC method and return the result.
    func call(_ method: String, args: [Any]) async throws -> Any

    /// Check if connected.
    var isConnected: Bool { get }

    /// Close the connection.
    func close() async throws
}

// MARK: - MockRpcClient

/// A mock RPC client for testing.
public actor MockRpcClient: RpcClientProtocol {
    public struct CallRecord: Sendable {
        public let method: String
        public let args: [Any]

        public init(method: String, args: [Any]) {
            self.method = method
            self.args = args
        }
    }

    private var responses: [String: Any] = [:]
    private var callRecords: [CallRecord] = []
    private var _isConnected: Bool = true

    public init() {}

    public nonisolated var isConnected: Bool {
        // For simplicity in tests, always return true
        true
    }

    /// Set a response for a method.
    public func setResponse(_ method: String, response: Any) {
        responses[method] = response
    }

    /// Get all call records.
    public func getCalls() -> [CallRecord] {
        callRecords
    }

    /// Clear all call records.
    public func clearCalls() {
        callRecords.removeAll()
    }

    public func call(_ method: String, args: [Any]) async throws -> Any {
        callRecords.append(CallRecord(method: method, args: args))

        if let response = responses[method] {
            return response
        }

        // Default responses
        switch method {
        case "mongo.ping":
            return ["ok": 1.0]
        case "mongo.listDatabases":
            return ["admin", "local", "test"]
        case "mongo.listCollections":
            return ["users", "orders", "products"]
        default:
            return [String: Any]()
        }
    }

    public func close() async throws {
        _isConnected = false
    }
}

// MARK: - ClientOptions

/// Options for configuring the MongoDB client.
public struct ClientOptions: Sendable {
    /// Connection timeout in seconds.
    public var connectTimeoutSeconds: TimeInterval

    /// Server selection timeout in seconds.
    public var serverSelectionTimeoutSeconds: TimeInterval

    /// Maximum number of connections in the pool.
    public var maxPoolSize: Int

    /// Minimum number of connections in the pool.
    public var minPoolSize: Int

    /// Application name for server logs.
    public var appName: String?

    /// Whether to use TLS.
    public var tls: Bool?

    /// Direct connection (bypass replica set discovery).
    public var directConnection: Bool?

    /// Create options with defaults.
    public init(
        connectTimeoutSeconds: TimeInterval = 30,
        serverSelectionTimeoutSeconds: TimeInterval = 30,
        maxPoolSize: Int = 100,
        minPoolSize: Int = 0,
        appName: String? = nil,
        tls: Bool? = nil,
        directConnection: Bool? = nil
    ) {
        self.connectTimeoutSeconds = connectTimeoutSeconds
        self.serverSelectionTimeoutSeconds = serverSelectionTimeoutSeconds
        self.maxPoolSize = maxPoolSize
        self.minPoolSize = minPoolSize
        self.appName = appName
        self.tls = tls
        self.directConnection = directConnection
    }

    /// Parse options from a connection string.
    public static func parse(from uri: String) -> ClientOptions {
        var options = ClientOptions()

        guard let url = URL(string: uri),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            return options
        }

        for item in queryItems {
            guard let value = item.value else { continue }

            switch item.name {
            case "connectTimeoutMS":
                if let ms = Double(value) {
                    options.connectTimeoutSeconds = ms / 1000
                }
            case "serverSelectionTimeoutMS":
                if let ms = Double(value) {
                    options.serverSelectionTimeoutSeconds = ms / 1000
                }
            case "maxPoolSize":
                if let size = Int(value) {
                    options.maxPoolSize = size
                }
            case "minPoolSize":
                if let size = Int(value) {
                    options.minPoolSize = size
                }
            case "appName":
                options.appName = value
            case "tls", "ssl":
                options.tls = value == "true"
            case "directConnection":
                options.directConnection = value == "true"
            default:
                break
            }
        }

        return options
    }
}

// MARK: - MongoClient

/// A MongoDB client that uses RPC transport.
///
/// Example usage:
/// ```swift
/// let client = try MongoClient("mongodb://localhost:27017")
/// let db = client.db("myapp")
/// let users = db.collection("users")
///
/// try await users.insertOne(["name": "John", "email": "john@example.com"])
/// let user = try await users.findOne(["email": "john@example.com"])
///
/// try await client.close()
/// ```
public final class MongoClient: @unchecked Sendable {
    /// The RPC client for transport.
    internal let rpcClient: any RpcClientProtocol

    /// The connection URI.
    public let uri: String

    /// Client options.
    public let options: ClientOptions

    /// Cache of database handles.
    private var databases: [String: MongoDatabase] = [:]
    private let lock = NSLock()

    /// Create a new MongoDB client with the given URI.
    ///
    /// - Parameter uri: A MongoDB connection string (mongodb:// or https:// for RPC)
    /// - Throws: `MongoError.invalidURI` if the URI is invalid
    public init(_ uri: String) throws {
        guard !uri.isEmpty else {
            throw MongoError.invalidURI(uri)
        }

        // Validate URI scheme
        let validSchemes = ["mongodb://", "mongodb+srv://", "https://", "http://", "ws://", "wss://"]
        let hasValidScheme = validSchemes.contains { uri.hasPrefix($0) }

        if !hasValidScheme && !uri.contains("://") {
            // Assume it's a host:port, prepend mongodb://
            self.uri = "mongodb://\(uri)"
        } else if !hasValidScheme {
            throw MongoError.invalidURI(uri)
        } else {
            self.uri = uri
        }

        self.options = ClientOptions.parse(from: self.uri)

        // Create a mock RPC client for now (real implementation would connect)
        self.rpcClient = MockRpcClient()
    }

    /// Create a client with custom options.
    public init(_ uri: String, options: ClientOptions) throws {
        guard !uri.isEmpty else {
            throw MongoError.invalidURI(uri)
        }

        self.uri = uri
        self.options = options
        self.rpcClient = MockRpcClient()
    }

    /// Create a client with a custom RPC client (for testing).
    public init(uri: String, rpcClient: any RpcClientProtocol, options: ClientOptions = ClientOptions()) {
        self.uri = uri
        self.rpcClient = rpcClient
        self.options = options
    }

    /// Get a database handle.
    ///
    /// - Parameter name: The database name
    /// - Returns: A database handle
    public func db(_ name: String) -> MongoDatabase {
        lock.lock()
        defer { lock.unlock() }

        if let db = databases[name] {
            return db
        }

        let db = MongoDatabase(name: name, client: self)
        databases[name] = db
        return db
    }

    /// Get the default database from the connection URI.
    ///
    /// Returns `nil` if no default database is specified in the URI.
    public var defaultDatabase: MongoDatabase? {
        guard let url = URL(string: uri) else { return nil }

        // Get the path component, removing the leading /
        let path = url.path
        guard path.count > 1 else { return nil }

        let dbName = String(path.dropFirst())

        // Remove query string if present
        let cleanDbName = dbName.components(separatedBy: "?").first ?? dbName

        guard !cleanDbName.isEmpty else { return nil }

        return db(cleanDbName)
    }

    /// List all database names.
    public func listDatabaseNames() async throws -> [String] {
        let result = try await rpcClient.call("mongo.listDatabases", args: [])

        if let names = result as? [String] {
            return names
        }

        if let names = result as? [Any] {
            return names.compactMap { $0 as? String }
        }

        return []
    }

    /// Ping the server to check connectivity.
    public func ping() async throws {
        let result = try await rpcClient.call("mongo.ping", args: [])

        if let dict = result as? [String: Any],
           let ok = dict["ok"] as? Double,
           ok >= 1.0 {
            return
        }

        throw MongoError.connectionFailed("Ping failed")
    }

    /// Check if the client is connected.
    public var isConnected: Bool {
        rpcClient.isConnected
    }

    /// Close the client connection.
    public func close() async throws {
        try await rpcClient.close()
    }

    /// Start a client session.
    public func startSession() async throws -> ClientSession {
        let result = try await rpcClient.call("mongo.startSession", args: [])

        guard let dict = result as? [String: Any],
              let sessionId = dict["sessionId"] as? String else {
            throw MongoError.operationFailed("Failed to start session")
        }

        return ClientSession(sessionId: sessionId, client: self)
    }

    /// Convert a MongoDB URI to a WebSocket URL for RPC.
    internal static func convertURIToWebSocket(_ uri: String) -> String {
        var result = uri

        if uri.hasPrefix("mongodb+srv://") {
            result = uri.replacingOccurrences(of: "mongodb+srv://", with: "wss://")
        } else if uri.hasPrefix("mongodb://") {
            result = uri.replacingOccurrences(of: "mongodb://", with: "ws://")
        } else if uri.hasPrefix("https://") {
            result = uri.replacingOccurrences(of: "https://", with: "wss://")
        } else if uri.hasPrefix("http://") {
            result = uri.replacingOccurrences(of: "http://", with: "ws://")
        }

        return result
    }
}

// MARK: - ClientSession

/// A client session for causal consistency and transactions.
public final class ClientSession: @unchecked Sendable {
    /// The session ID.
    public let sessionId: String

    /// The client that owns this session.
    private let client: MongoClient

    internal init(sessionId: String, client: MongoClient) {
        self.sessionId = sessionId
        self.client = client
    }

    /// Start a transaction.
    public func startTransaction() async throws {
        _ = try await client.rpcClient.call("mongo.startTransaction", args: [sessionId])
    }

    /// Commit the current transaction.
    public func commitTransaction() async throws {
        _ = try await client.rpcClient.call("mongo.commitTransaction", args: [sessionId])
    }

    /// Abort the current transaction.
    public func abortTransaction() async throws {
        _ = try await client.rpcClient.call("mongo.abortTransaction", args: [sessionId])
    }

    /// End the session.
    public func endSession() async throws {
        _ = try await client.rpcClient.call("mongo.endSession", args: [sessionId])
    }

    /// Execute a block within a transaction.
    public func withTransaction<T>(_ block: () async throws -> T) async throws -> T {
        try await startTransaction()
        do {
            let result = try await block()
            try await commitTransaction()
            return result
        } catch {
            try await abortTransaction()
            throw error
        }
    }
}
