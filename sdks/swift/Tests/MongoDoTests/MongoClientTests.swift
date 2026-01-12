// MongoClientTests.swift
// MongoDo Tests

import XCTest
@testable import MongoDo

final class MongoClientTests: XCTestCase {

    // MARK: - Client Creation Tests

    func testClientCreationWithMongoDBURI() throws {
        let client = try MongoClient("mongodb://localhost:27017")
        XCTAssertEqual(client.uri, "mongodb://localhost:27017")
    }

    func testClientCreationWithMongoDBSrvURI() throws {
        let client = try MongoClient("mongodb+srv://cluster.example.com")
        XCTAssertEqual(client.uri, "mongodb+srv://cluster.example.com")
    }

    func testClientCreationWithHTTPSURI() throws {
        let client = try MongoClient("https://api.example.com")
        XCTAssertEqual(client.uri, "https://api.example.com")
    }

    func testClientCreationWithWebSocketURI() throws {
        let client = try MongoClient("wss://api.example.com")
        XCTAssertEqual(client.uri, "wss://api.example.com")
    }

    func testClientCreationWithHostPort() throws {
        let client = try MongoClient("localhost:27017")
        XCTAssertEqual(client.uri, "mongodb://localhost:27017")
    }

    func testClientCreationWithEmptyURI() {
        XCTAssertThrowsError(try MongoClient("")) { error in
            guard case MongoError.invalidURI = error else {
                XCTFail("Expected invalidURI error")
                return
            }
        }
    }

    func testClientCreationWithInvalidScheme() {
        XCTAssertThrowsError(try MongoClient("ftp://localhost")) { error in
            guard case MongoError.invalidURI = error else {
                XCTFail("Expected invalidURI error")
                return
            }
        }
    }

    // MARK: - Client Options Tests

    func testClientOptionsDefault() {
        let options = ClientOptions()
        XCTAssertEqual(options.connectTimeoutSeconds, 30)
        XCTAssertEqual(options.serverSelectionTimeoutSeconds, 30)
        XCTAssertEqual(options.maxPoolSize, 100)
        XCTAssertEqual(options.minPoolSize, 0)
        XCTAssertNil(options.appName)
        XCTAssertNil(options.tls)
        XCTAssertNil(options.directConnection)
    }

    func testClientOptionsCustom() {
        let options = ClientOptions(
            connectTimeoutSeconds: 10,
            serverSelectionTimeoutSeconds: 5,
            maxPoolSize: 50,
            minPoolSize: 5,
            appName: "test-app",
            tls: true,
            directConnection: false
        )

        XCTAssertEqual(options.connectTimeoutSeconds, 10)
        XCTAssertEqual(options.serverSelectionTimeoutSeconds, 5)
        XCTAssertEqual(options.maxPoolSize, 50)
        XCTAssertEqual(options.minPoolSize, 5)
        XCTAssertEqual(options.appName, "test-app")
        XCTAssertEqual(options.tls, true)
        XCTAssertEqual(options.directConnection, false)
    }

    func testClientOptionsParse() {
        let uri = "mongodb://localhost:27017/mydb?connectTimeoutMS=5000&maxPoolSize=50&appName=myapp&tls=true&directConnection=true"
        let options = ClientOptions.parse(from: uri)

        XCTAssertEqual(options.connectTimeoutSeconds, 5)
        XCTAssertEqual(options.maxPoolSize, 50)
        XCTAssertEqual(options.appName, "myapp")
        XCTAssertEqual(options.tls, true)
        XCTAssertEqual(options.directConnection, true)
    }

    func testClientOptionsParseSSL() {
        let uri = "mongodb://localhost:27017/mydb?ssl=true"
        let options = ClientOptions.parse(from: uri)
        XCTAssertEqual(options.tls, true)
    }

    func testClientOptionsParseNoParams() {
        let uri = "mongodb://localhost:27017/mydb"
        let options = ClientOptions.parse(from: uri)
        XCTAssertEqual(options.connectTimeoutSeconds, 30) // default
    }

    // MARK: - URI Conversion Tests

    func testConvertURIToWebSocketMongoDB() {
        let result = MongoClient.convertURIToWebSocket("mongodb://localhost:27017")
        XCTAssertEqual(result, "ws://localhost:27017")
    }

    func testConvertURIToWebSocketMongoDBSrv() {
        let result = MongoClient.convertURIToWebSocket("mongodb+srv://cluster.example.com")
        XCTAssertEqual(result, "wss://cluster.example.com")
    }

    func testConvertURIToWebSocketHTTPS() {
        let result = MongoClient.convertURIToWebSocket("https://api.example.com")
        XCTAssertEqual(result, "wss://api.example.com")
    }

    func testConvertURIToWebSocketHTTP() {
        let result = MongoClient.convertURIToWebSocket("http://localhost:8080")
        XCTAssertEqual(result, "ws://localhost:8080")
    }

    func testConvertURIToWebSocketAlreadyWS() {
        let result = MongoClient.convertURIToWebSocket("ws://localhost:8080")
        XCTAssertEqual(result, "ws://localhost:8080")
    }

    func testConvertURIToWebSocketAlreadyWSS() {
        let result = MongoClient.convertURIToWebSocket("wss://secure.example.com")
        XCTAssertEqual(result, "wss://secure.example.com")
    }

    // MARK: - Database Access Tests

    func testGetDatabase() throws {
        let client = try MongoClient("mongodb://localhost")
        let db = client.db("mydb")
        XCTAssertEqual(db.name, "mydb")
    }

    func testGetDatabaseCaching() throws {
        let client = try MongoClient("mongodb://localhost")
        let db1 = client.db("mydb")
        let db2 = client.db("mydb")
        XCTAssertTrue(db1 === db2, "Database handles should be cached")
    }

    func testGetDifferentDatabases() throws {
        let client = try MongoClient("mongodb://localhost")
        let db1 = client.db("db1")
        let db2 = client.db("db2")
        XCTAssertFalse(db1 === db2, "Different databases should be different handles")
    }

    func testDefaultDatabase() throws {
        let client = try MongoClient("mongodb://localhost:27017/mydb")
        XCTAssertNotNil(client.defaultDatabase)
        XCTAssertEqual(client.defaultDatabase?.name, "mydb")
    }

    func testDefaultDatabaseNone() throws {
        let client = try MongoClient("mongodb://localhost:27017")
        XCTAssertNil(client.defaultDatabase)
    }

    // MARK: - Connection Tests

    func testIsConnected() throws {
        let client = try MongoClient("mongodb://localhost")
        XCTAssertTrue(client.isConnected)
    }

    func testPing() async throws {
        let mockRpc = MockRpcClient()
        await mockRpc.setResponse("mongo.ping", response: ["ok": 1.0])

        let client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)
        try await client.ping()

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls[0].method, "mongo.ping")
    }

    func testPingFailed() async throws {
        let mockRpc = MockRpcClient()
        await mockRpc.setResponse("mongo.ping", response: ["ok": 0.0])

        let client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)

        do {
            try await client.ping()
            XCTFail("Expected error")
        } catch {
            guard case MongoError.connectionFailed = error else {
                XCTFail("Expected connectionFailed error")
                return
            }
        }
    }

    func testListDatabaseNames() async throws {
        let mockRpc = MockRpcClient()
        await mockRpc.setResponse("mongo.listDatabases", response: ["admin", "local", "mydb"])

        let client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)
        let names = try await client.listDatabaseNames()

        XCTAssertEqual(names, ["admin", "local", "mydb"])
    }

    func testClose() async throws {
        let mockRpc = MockRpcClient()
        let client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)
        try await client.close()
        // Should not throw
    }

    // MARK: - Session Tests

    func testStartSession() async throws {
        let mockRpc = MockRpcClient()
        await mockRpc.setResponse("mongo.startSession", response: ["sessionId": "session123"])

        let client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)
        let session = try await client.startSession()

        XCTAssertEqual(session.sessionId, "session123")
    }

    func testSessionTransaction() async throws {
        let mockRpc = MockRpcClient()
        await mockRpc.setResponse("mongo.startSession", response: ["sessionId": "session123"])
        await mockRpc.setResponse("mongo.startTransaction", response: [:])
        await mockRpc.setResponse("mongo.commitTransaction", response: [:])

        let client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)
        let session = try await client.startSession()

        let result = try await session.withTransaction {
            return "success"
        }

        XCTAssertEqual(result, "success")

        let calls = await mockRpc.getCalls()
        let methods = calls.map { $0.method }
        XCTAssertTrue(methods.contains("mongo.startTransaction"))
        XCTAssertTrue(methods.contains("mongo.commitTransaction"))
    }

    func testSessionTransactionRollback() async throws {
        let mockRpc = MockRpcClient()
        await mockRpc.setResponse("mongo.startSession", response: ["sessionId": "session123"])
        await mockRpc.setResponse("mongo.startTransaction", response: [:])
        await mockRpc.setResponse("mongo.abortTransaction", response: [:])

        let client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)
        let session = try await client.startSession()

        do {
            _ = try await session.withTransaction {
                throw MongoError.operationFailed("Test error")
            }
            XCTFail("Expected error")
        } catch {
            // Expected
        }

        let calls = await mockRpc.getCalls()
        let methods = calls.map { $0.method }
        XCTAssertTrue(methods.contains("mongo.abortTransaction"))
    }

    // MARK: - Error Tests

    func testMongoErrorDescriptions() {
        let errors: [MongoError] = [
            .invalidURI("test"),
            .connectionFailed("test"),
            .notConnected,
            .invalidDocument("test"),
            .cursorExhausted,
            .operationFailed("test"),
            .timeout,
            .serializationError("test"),
            .deserializationError("test"),
            .networkError("test"),
            .serverError(code: 123, message: "test")
        ]

        for error in errors {
            XCTAssertNotNil(error.errorDescription)
            XCTAssertFalse(error.errorDescription!.isEmpty)
        }
    }
}
