// MongoDatabaseTests.swift
// MongoDo Tests

import XCTest
@testable import MongoDo

final class MongoDatabaseTests: XCTestCase {

    var mockRpc: MockRpcClient!
    var client: MongoClient!
    var db: MongoDatabase!

    override func setUp() async throws {
        mockRpc = MockRpcClient()
        client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)
        db = client.db("testdb")
    }

    // MARK: - Database Properties Tests

    func testDatabaseName() {
        XCTAssertEqual(db.name, "testdb")
    }

    // MARK: - Collection Access Tests

    func testGetCollection() {
        let collection = db.collection("users")
        XCTAssertEqual(collection.name, "users")
    }

    func testGetCollectionCaching() {
        let col1 = db.collection("users")
        let col2 = db.collection("users")
        XCTAssertTrue(col1 === col2, "Collection handles should be cached")
    }

    func testGetDifferentCollections() {
        let col1 = db.collection("users")
        let col2 = db.collection("orders")
        XCTAssertFalse(col1 === col2, "Different collections should be different handles")
    }

    func testGetTypedCollection() {
        struct User: Codable {
            let name: String
            let email: String
        }

        let collection = db.collection("users", withType: User.self)
        XCTAssertEqual(collection.name, "users")
    }

    // MARK: - Collection Listing Tests

    func testListCollectionNames() async throws {
        await mockRpc.setResponse("mongo.listCollections", response: ["users", "orders", "products"])

        let names = try await db.listCollectionNames()
        XCTAssertEqual(names, ["users", "orders", "products"])

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls[0].method, "mongo.listCollections")
        XCTAssertEqual(calls[0].args[0] as? String, "testdb")
    }

    func testListCollectionNamesEmpty() async throws {
        await mockRpc.setResponse("mongo.listCollections", response: [])

        let names = try await db.listCollectionNames()
        XCTAssertTrue(names.isEmpty)
    }

    func testListCollections() async throws {
        await mockRpc.setResponse("mongo.listCollectionsWithInfo", response: [
            ["name": "users", "type": "collection"],
            ["name": "orders", "type": "collection"]
        ])

        let collections = try await db.listCollections()
        XCTAssertEqual(collections.count, 2)
        XCTAssertEqual(collections[0].getString("name"), "users")
        XCTAssertEqual(collections[1].getString("name"), "orders")
    }

    // MARK: - Collection Creation Tests

    func testCreateCollection() async throws {
        await mockRpc.setResponse("mongo.createCollection", response: [:])

        try await db.createCollection("newcollection")

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls[0].method, "mongo.createCollection")
        XCTAssertEqual(calls[0].args[0] as? String, "testdb")
        XCTAssertEqual(calls[0].args[1] as? String, "newcollection")
    }

    func testCreateCollectionWithOptions() async throws {
        await mockRpc.setResponse("mongo.createCollection", response: [:])

        let options = CreateCollectionOptions(
            capped: true,
            size: 1024 * 1024,
            max: 1000
        )

        try await db.createCollection("cappedcollection", options: options)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls[0].method, "mongo.createCollection")

        if let opts = calls[0].args[2] as? [String: Any] {
            XCTAssertEqual(opts["capped"] as? Bool, true)
            XCTAssertEqual(opts["size"] as? Int, 1024 * 1024)
            XCTAssertEqual(opts["max"] as? Int, 1000)
        } else {
            XCTFail("Expected options dictionary")
        }
    }

    func testCreateCollectionWithValidator() async throws {
        await mockRpc.setResponse("mongo.createCollection", response: [:])

        let validator: Document = [
            "$jsonSchema": [
                "bsonType": "object",
                "required": ["name", "email"]
            ]
        ]

        let options = CreateCollectionOptions(validator: validator)

        try await db.createCollection("validated", options: options)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls.count, 1)

        if let opts = calls[0].args[2] as? [String: Any],
           let validatorDict = opts["validator"] as? [String: Any] {
            XCTAssertNotNil(validatorDict["$jsonSchema"])
        } else {
            XCTFail("Expected validator in options")
        }
    }

    // MARK: - Database Operations Tests

    func testDropDatabase() async throws {
        await mockRpc.setResponse("mongo.dropDatabase", response: [:])

        try await db.drop()

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls[0].method, "mongo.dropDatabase")
        XCTAssertEqual(calls[0].args[0] as? String, "testdb")
    }

    func testRunCommand() async throws {
        await mockRpc.setResponse("mongo.runCommand", response: [
            "ok": 1.0,
            "version": "5.0.0"
        ])

        let command: Document = ["buildInfo": 1]
        let result = try await db.runCommand(command)

        XCTAssertEqual(result.getDouble("ok"), 1.0)
        XCTAssertEqual(result.getString("version"), "5.0.0")
    }

    func testStats() async throws {
        await mockRpc.setResponse("mongo.runCommand", response: [
            "ok": 1.0,
            "db": "testdb",
            "collections": 5,
            "objects": 1000,
            "dataSize": 524288
        ])

        let stats = try await db.stats()

        XCTAssertEqual(stats.getDouble("ok"), 1.0)
        XCTAssertEqual(stats.getString("db"), "testdb")
        XCTAssertEqual(stats.getInt("collections"), 5)
    }

    func testCurrentOp() async throws {
        await mockRpc.setResponse("mongo.runCommand", response: [
            "ok": 1.0,
            "inprog": []
        ])

        let result = try await db.currentOp()

        XCTAssertEqual(result.getDouble("ok"), 1.0)
        XCTAssertNotNil(result.getArray("inprog"))
    }

    // MARK: - CreateCollectionOptions Tests

    func testCreateCollectionOptionsDefault() {
        let options = CreateCollectionOptions()
        XCTAssertNil(options.capped)
        XCTAssertNil(options.size)
        XCTAssertNil(options.max)
        XCTAssertNil(options.validator)
    }

    func testCreateCollectionOptionsCustom() {
        let options = CreateCollectionOptions(
            capped: true,
            size: 1024,
            max: 100,
            validator: ["field": "value"]
        )

        XCTAssertEqual(options.capped, true)
        XCTAssertEqual(options.size, 1024)
        XCTAssertEqual(options.max, 100)
        XCTAssertNotNil(options.validator)
    }
}
