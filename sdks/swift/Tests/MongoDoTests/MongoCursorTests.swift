// MongoCursorTests.swift
// MongoDo Tests

import XCTest
@testable import MongoDo

final class MongoCursorTests: XCTestCase {

    var mockRpc: MockRpcClient!
    var client: MongoClient!
    var db: MongoDatabase!
    var collection: MongoCollection<Document>!

    override func setUp() async throws {
        mockRpc = MockRpcClient()
        client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)
        db = client.db("testdb")
        collection = db.collection("users")
    }

    // MARK: - Basic Cursor Tests

    func testCursorToArray() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice", "age": 25],
                ["name": "Bob", "age": 30],
                ["name": "Charlie", "age": 35]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        let docs = try await cursor.toArray()

        XCTAssertEqual(docs.count, 3)
        XCTAssertEqual(docs[0].getString("name"), "Alice")
        XCTAssertEqual(docs[1].getString("name"), "Bob")
        XCTAssertEqual(docs[2].getString("name"), "Charlie")
    }

    func testCursorForAwait() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice"],
                ["name": "Bob"]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()

        var names = [String]()
        for try await doc in cursor {
            if let name = doc.getString("name") {
                names.append(name)
            }
        }

        XCTAssertEqual(names, ["Alice", "Bob"])
    }

    func testCursorEmpty() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [],
            "cursorId": nil
        ])

        let cursor = collection.find(["status": "nonexistent"])
        let docs = try await cursor.toArray()

        XCTAssertTrue(docs.isEmpty)
    }

    func testCursorFirst() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "First"],
                ["name": "Second"]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        let first = try await cursor.first()

        XCTAssertNotNil(first)
        XCTAssertEqual(first?.getString("name"), "First")
    }

    func testCursorFirstEmpty() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [],
            "cursorId": nil
        ])

        let cursor = collection.find()
        let first = try await cursor.first()

        XCTAssertNil(first)
    }

    func testCursorHasNext() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [["name": "Alice"]],
            "cursorId": nil
        ])

        let cursor = collection.find()

        // Before fetching
        XCTAssertTrue(cursor.hasNext)

        // Consume the cursor
        _ = try await cursor.toArray()

        // After exhausting
        XCTAssertFalse(cursor.hasNext)
    }

    func testCursorIsExhausted() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [["name": "Alice"]],
            "cursorId": nil
        ])

        let cursor = collection.find()

        XCTAssertFalse(cursor.isExhausted)

        _ = try await cursor.toArray()

        XCTAssertTrue(cursor.isExhausted)
    }

    // MARK: - Cursor with Pagination Tests

    func testCursorWithCursorId() async throws {
        // First batch
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice"],
                ["name": "Bob"]
            ],
            "cursorId": "cursor123"
        ])

        // Second batch (getMore)
        await mockRpc.setResponse("mongo.getMore", response: [
            "documents": [
                ["name": "Charlie"]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        let docs = try await cursor.toArray()

        XCTAssertEqual(docs.count, 3)

        let calls = await mockRpc.getCalls()
        let methods = calls.map { $0.method }
        XCTAssertTrue(methods.contains("mongo.find"))
        XCTAssertTrue(methods.contains("mongo.getMore"))
    }

    // MARK: - Cursor Transformation Tests

    func testCursorMap() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice", "age": 25],
                ["name": "Bob", "age": 30]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        var names = [String]()

        for try await name in cursor.map({ $0.getString("name") ?? "" }) {
            names.append(name)
        }

        XCTAssertEqual(names, ["Alice", "Bob"])
    }

    func testCursorFilter() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice", "age": 25],
                ["name": "Bob", "age": 30],
                ["name": "Charlie", "age": 20]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        var names = [String]()

        for try await doc in cursor.filter({ ($0.getInt("age") ?? 0) >= 25 }) {
            if let name = doc.getString("name") {
                names.append(name)
            }
        }

        XCTAssertEqual(names, ["Alice", "Bob"])
    }

    func testCursorPrefix() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice"],
                ["name": "Bob"],
                ["name": "Charlie"],
                ["name": "David"]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        var names = [String]()

        for try await doc in cursor.prefix(2) {
            if let name = doc.getString("name") {
                names.append(name)
            }
        }

        XCTAssertEqual(names, ["Alice", "Bob"])
    }

    func testCursorDropFirst() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice"],
                ["name": "Bob"],
                ["name": "Charlie"]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        var names = [String]()

        for try await doc in cursor.dropFirst(1) {
            if let name = doc.getString("name") {
                names.append(name)
            }
        }

        XCTAssertEqual(names, ["Bob", "Charlie"])
    }

    func testCursorReduce() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["value": 10],
                ["value": 20],
                ["value": 30]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        let total = try await cursor.reduce(0) { sum, doc in
            sum + (doc.getInt("value") ?? 0)
        }

        XCTAssertEqual(total, 60)
    }

    func testCursorAllSatisfy() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["age": 25],
                ["age": 30],
                ["age": 35]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        let allAdults = try await cursor.allSatisfy { ($0.getInt("age") ?? 0) >= 18 }

        XCTAssertTrue(allAdults)
    }

    func testCursorAllSatisfyFalse() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["age": 25],
                ["age": 15],
                ["age": 35]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        let allAdults = try await cursor.allSatisfy { ($0.getInt("age") ?? 0) >= 18 }

        XCTAssertFalse(allAdults)
    }

    func testCursorContainsWhere() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice"],
                ["name": "Bob"],
                ["name": "Charlie"]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        let hasBob = try await cursor.contains { $0.getString("name") == "Bob" }

        XCTAssertTrue(hasBob)
    }

    func testCursorContainsWhereFalse() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice"],
                ["name": "Charlie"]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find()
        let hasBob = try await cursor.contains { $0.getString("name") == "Bob" }

        XCTAssertFalse(hasBob)
    }

    // MARK: - Cursor Close Tests

    func testCursorClose() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [["name": "Alice"]],
            "cursorId": "cursor123"
        ])
        await mockRpc.setResponse("mongo.killCursors", response: [:])

        let cursor = collection.find()
        _ = try await cursor.next() // Fetch first batch

        try await cursor.close()

        XCTAssertTrue(cursor.isExhausted)
    }

    // MARK: - Aggregation Cursor Tests

    func testAggregationCursor() async throws {
        await mockRpc.setResponse("mongo.aggregate", response: [
            "documents": [
                ["_id": "electronics", "count": 50],
                ["_id": "clothing", "count": 30]
            ],
            "cursorId": nil
        ])

        let pipeline: [Document] = [
            ["$group": ["_id": "$category", "count": ["$sum": 1]]]
        ]

        let cursor = collection.aggregate(pipeline)
        let docs = try await cursor.toArray()

        XCTAssertEqual(docs.count, 2)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.aggregate")
    }

    // MARK: - Typed Cursor Tests

    func testTypedCursor() async throws {
        struct User: Codable {
            let name: String
            let age: Int
        }

        let typedCollection = db.collection("users", withType: User.self)

        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice", "age": 25],
                ["name": "Bob", "age": 30]
            ],
            "cursorId": nil
        ])

        let cursor = typedCollection.find()
        let users = try await cursor.toArray()

        XCTAssertEqual(users.count, 2)
        XCTAssertEqual(users[0].name, "Alice")
        XCTAssertEqual(users[0].age, 25)
        XCTAssertEqual(users[1].name, "Bob")
        XCTAssertEqual(users[1].age, 30)
    }
}

// MARK: - Change Stream Tests

final class ChangeStreamTests: XCTestCase {

    var mockRpc: MockRpcClient!
    var client: MongoClient!
    var db: MongoDatabase!
    var collection: MongoCollection<Document>!

    override func setUp() async throws {
        mockRpc = MockRpcClient()
        client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)
        db = client.db("testdb")
        collection = db.collection("users")
    }

    func testWatchInsert() async throws {
        await mockRpc.setResponse("mongo.watch", response: [
            "operationType": "insert",
            "documentKey": ["_id": ["$oid": "507f1f77bcf86cd799439011"]],
            "fullDocument": ["name": "Alice", "email": "alice@example.com"],
            "_id": ["_data": "resumetoken123"]
        ])

        let stream = collection.watch()

        // Get first event
        let event = try await stream.next()

        XCTAssertNotNil(event)
        XCTAssertEqual(event?.operationType, "insert")
        XCTAssertNotNil(event?.fullDocument)
        XCTAssertEqual(event?.fullDocument?.getString("name"), "Alice")
    }

    func testWatchUpdate() async throws {
        await mockRpc.setResponse("mongo.watch", response: [
            "operationType": "update",
            "documentKey": ["_id": ["$oid": "507f1f77bcf86cd799439011"]],
            "updateDescription": [
                "updatedFields": ["name": "Updated Alice"],
                "removedFields": ["oldField"]
            ],
            "_id": ["_data": "resumetoken456"]
        ])

        let stream = collection.watch()
        let event = try await stream.next()

        XCTAssertNotNil(event)
        XCTAssertEqual(event?.operationType, "update")
        XCTAssertNotNil(event?.updateDescription)
        XCTAssertEqual(event?.updateDescription?.updatedFields?.getString("name"), "Updated Alice")
        XCTAssertEqual(event?.updateDescription?.removedFields, ["oldField"])
    }

    func testWatchDelete() async throws {
        await mockRpc.setResponse("mongo.watch", response: [
            "operationType": "delete",
            "documentKey": ["_id": ["$oid": "507f1f77bcf86cd799439011"]],
            "_id": ["_data": "resumetoken789"]
        ])

        let stream = collection.watch()
        let event = try await stream.next()

        XCTAssertNotNil(event)
        XCTAssertEqual(event?.operationType, "delete")
        XCTAssertNotNil(event?.documentKey)
        XCTAssertNil(event?.fullDocument)
    }

    func testWatchWithPipeline() async throws {
        await mockRpc.setResponse("mongo.watch", response: [
            "operationType": "insert",
            "fullDocument": ["name": "VIP User", "status": "vip"],
            "_id": ["_data": "resumetoken"]
        ])

        let pipeline: [Document] = [
            ["$match": ["fullDocument.status": "vip"]]
        ]

        let stream = collection.watch(pipeline: pipeline)
        let event = try await stream.next()

        XCTAssertNotNil(event)

        let calls = await mockRpc.getCalls()
        if let pipelineArg = calls[0].args[2] as? [[String: Any]] {
            XCTAssertFalse(pipelineArg.isEmpty)
        }
    }

    func testWatchClose() async throws {
        await mockRpc.setResponse("mongo.watch", response: [
            "operationType": "insert",
            "fullDocument": ["name": "Test"],
            "_id": ["_data": "token"]
        ])

        let stream = collection.watch()
        stream.close()

        let event = try await stream.next()
        XCTAssertNil(event)
    }

    func testWatchResumeToken() async throws {
        await mockRpc.setResponse("mongo.watch", response: [
            "operationType": "insert",
            "fullDocument": ["name": "Test"],
            "_id": ["_data": "myResumeToken"]
        ])

        let stream = collection.watch()
        _ = try await stream.next()

        XCTAssertNotNil(stream.currentResumeToken)
    }

    // MARK: - ChangeEvent Tests

    func testChangeEventProperties() {
        let event = ChangeEvent<Document>(
            operationType: "insert",
            documentKey: ["_id": "123"],
            fullDocument: ["name": "Test"],
            updateDescription: nil,
            clusterTime: 1234567890
        )

        XCTAssertEqual(event.operationType, "insert")
        XCTAssertNotNil(event.documentKey)
        XCTAssertNotNil(event.fullDocument)
        XCTAssertNil(event.updateDescription)
        XCTAssertEqual(event.clusterTime, 1234567890)
    }

    // MARK: - UpdateDescription Tests

    func testUpdateDescription() {
        let desc = UpdateDescription(
            updatedFields: ["name": "NewName"],
            removedFields: ["oldField1", "oldField2"]
        )

        XCTAssertNotNil(desc.updatedFields)
        XCTAssertEqual(desc.removedFields?.count, 2)
    }
}
