// MongoCollectionTests.swift
// MongoDo Tests

import XCTest
@testable import MongoDo

final class MongoCollectionTests: XCTestCase {

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

    // MARK: - Collection Properties Tests

    func testCollectionName() {
        XCTAssertEqual(collection.name, "users")
    }

    func testCollectionNamespace() {
        XCTAssertEqual(collection.namespace, "testdb.users")
    }

    // MARK: - Insert Tests

    func testInsertOne() async throws {
        await mockRpc.setResponse("mongo.insertOne", response: [
            "insertedId": ["$oid": "507f1f77bcf86cd799439011"]
        ])

        let doc: Document = ["name": "John", "email": "john@example.com"]
        let result = try await collection.insertOne(doc)

        XCTAssertNotEqual(result.insertedId, .null)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls[0].method, "mongo.insertOne")
        XCTAssertEqual(calls[0].args[0] as? String, "testdb")
        XCTAssertEqual(calls[0].args[1] as? String, "users")
    }

    func testInsertOneWithDictionaryLiteral() async throws {
        await mockRpc.setResponse("mongo.insertOne", response: [
            "insertedId": 1
        ])

        let result = try await collection.insertOne(["name": "Jane", "age": 25])

        XCTAssertNotEqual(result.insertedId, .null)
    }

    func testInsertMany() async throws {
        await mockRpc.setResponse("mongo.insertMany", response: [
            "insertedIds": ["0": 1, "1": 2, "2": 3]
        ])

        let docs: [Document] = [
            ["name": "Alice"],
            ["name": "Bob"],
            ["name": "Charlie"]
        ]

        let result = try await collection.insertMany(docs)

        XCTAssertEqual(result.insertedIds.count, 3)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.insertMany")
    }

    // MARK: - Find Tests

    func testFindOne() async throws {
        await mockRpc.setResponse("mongo.findOne", response: [
            "name": "John",
            "email": "john@example.com"
        ])

        let result = try await collection.findOne(["email": "john@example.com"])

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.getString("name"), "John")

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.findOne")
    }

    func testFindOneNotFound() async throws {
        await mockRpc.setResponse("mongo.findOne", response: NSNull())

        let result = try await collection.findOne(["email": "nonexistent@example.com"])

        XCTAssertNil(result)
    }

    func testFindOneWithoutFilter() async throws {
        await mockRpc.setResponse("mongo.findOne", response: [
            "name": "First"
        ])

        let result = try await collection.findOne()

        XCTAssertNotNil(result)
    }

    func testFind() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [
                ["name": "Alice"],
                ["name": "Bob"]
            ],
            "cursorId": nil
        ])

        let cursor = collection.find(["status": "active"])
        let docs = try await cursor.toArray()

        XCTAssertEqual(docs.count, 2)
        XCTAssertEqual(docs[0].getString("name"), "Alice")
        XCTAssertEqual(docs[1].getString("name"), "Bob")
    }

    func testFindWithOptions() async throws {
        await mockRpc.setResponse("mongo.find", response: [
            "documents": [["name": "Alice"]],
            "cursorId": nil
        ])

        let options = FindOptions(limit: 10, skip: 5, sort: ["name": 1])
        let cursor = collection.find(["status": "active"], options: options)
        let docs = try await cursor.toArray()

        XCTAssertEqual(docs.count, 1)
    }

    // MARK: - Update Tests

    func testUpdateOne() async throws {
        await mockRpc.setResponse("mongo.updateOne", response: [
            "matchedCount": 1,
            "modifiedCount": 1
        ])

        let result = try await collection.updateOne(
            filter: ["_id": "123"],
            update: ["$set": ["name": "Jane"]]
        )

        XCTAssertEqual(result.matchedCount, 1)
        XCTAssertEqual(result.modifiedCount, 1)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.updateOne")
    }

    func testUpdateOneWithUpsert() async throws {
        await mockRpc.setResponse("mongo.updateOne", response: [
            "matchedCount": 0,
            "modifiedCount": 0,
            "upsertedId": ["$oid": "507f1f77bcf86cd799439011"]
        ])

        let result = try await collection.updateOne(
            filter: ["email": "new@example.com"],
            update: ["$set": ["name": "New User"]],
            options: UpdateOptions(upsert: true)
        )

        XCTAssertEqual(result.matchedCount, 0)
        XCTAssertNotNil(result.upsertedId)
    }

    func testUpdateMany() async throws {
        await mockRpc.setResponse("mongo.updateMany", response: [
            "matchedCount": 5,
            "modifiedCount": 5
        ])

        let result = try await collection.updateMany(
            filter: ["status": "pending"],
            update: ["$set": ["status": "processed"]]
        )

        XCTAssertEqual(result.matchedCount, 5)
        XCTAssertEqual(result.modifiedCount, 5)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.updateMany")
    }

    func testReplaceOne() async throws {
        await mockRpc.setResponse("mongo.replaceOne", response: [
            "matchedCount": 1,
            "modifiedCount": 1
        ])

        let replacement: Document = ["name": "Replaced", "email": "replaced@example.com"]
        let result = try await collection.replaceOne(
            filter: ["_id": "123"],
            replacement: replacement
        )

        XCTAssertEqual(result.matchedCount, 1)
        XCTAssertEqual(result.modifiedCount, 1)
    }

    // MARK: - Delete Tests

    func testDeleteOne() async throws {
        await mockRpc.setResponse("mongo.deleteOne", response: [
            "deletedCount": 1
        ])

        let result = try await collection.deleteOne(["_id": "123"])

        XCTAssertEqual(result.deletedCount, 1)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.deleteOne")
    }

    func testDeleteOneNotFound() async throws {
        await mockRpc.setResponse("mongo.deleteOne", response: [
            "deletedCount": 0
        ])

        let result = try await collection.deleteOne(["_id": "nonexistent"])

        XCTAssertEqual(result.deletedCount, 0)
    }

    func testDeleteMany() async throws {
        await mockRpc.setResponse("mongo.deleteMany", response: [
            "deletedCount": 10
        ])

        let result = try await collection.deleteMany(["status": "deleted"])

        XCTAssertEqual(result.deletedCount, 10)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.deleteMany")
    }

    // MARK: - Find and Modify Tests

    func testFindOneAndUpdate() async throws {
        await mockRpc.setResponse("mongo.findOneAndUpdate", response: [
            "name": "Original",
            "email": "original@example.com"
        ])

        let result = try await collection.findOneAndUpdate(
            filter: ["_id": "123"],
            update: ["$set": ["name": "Updated"]]
        )

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.getString("name"), "Original")
    }

    func testFindOneAndUpdateNotFound() async throws {
        await mockRpc.setResponse("mongo.findOneAndUpdate", response: NSNull())

        let result = try await collection.findOneAndUpdate(
            filter: ["_id": "nonexistent"],
            update: ["$set": ["name": "Updated"]]
        )

        XCTAssertNil(result)
    }

    func testFindOneAndDelete() async throws {
        await mockRpc.setResponse("mongo.findOneAndDelete", response: [
            "name": "Deleted",
            "email": "deleted@example.com"
        ])

        let result = try await collection.findOneAndDelete(["_id": "123"])

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.getString("name"), "Deleted")
    }

    func testFindOneAndReplace() async throws {
        await mockRpc.setResponse("mongo.findOneAndReplace", response: [
            "name": "Original",
            "email": "original@example.com"
        ])

        let replacement: Document = ["name": "Replaced", "email": "replaced@example.com"]
        let result = try await collection.findOneAndReplace(
            filter: ["_id": "123"],
            replacement: replacement
        )

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.getString("name"), "Original")
    }

    // MARK: - Count Tests

    func testCountDocuments() async throws {
        await mockRpc.setResponse("mongo.countDocuments", response: 42)

        let count = try await collection.countDocuments(["status": "active"])

        XCTAssertEqual(count, 42)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.countDocuments")
    }

    func testCountDocumentsAll() async throws {
        await mockRpc.setResponse("mongo.countDocuments", response: 100)

        let count = try await collection.countDocuments()

        XCTAssertEqual(count, 100)
    }

    func testEstimatedDocumentCount() async throws {
        await mockRpc.setResponse("mongo.estimatedDocumentCount", response: 1000)

        let count = try await collection.estimatedDocumentCount()

        XCTAssertEqual(count, 1000)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.estimatedDocumentCount")
    }

    // MARK: - Aggregation Tests

    func testAggregate() async throws {
        await mockRpc.setResponse("mongo.aggregate", response: [
            "documents": [
                ["_id": "electronics", "count": 50],
                ["_id": "clothing", "count": 30]
            ],
            "cursorId": nil
        ])

        let pipeline: [Document] = [
            ["$match": ["status": "active"]],
            ["$group": ["_id": "$category", "count": ["$sum": 1]]]
        ]

        let cursor = collection.aggregate(pipeline)
        let docs = try await cursor.toArray()

        XCTAssertEqual(docs.count, 2)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.aggregate")
    }

    // MARK: - Distinct Tests

    func testDistinct() async throws {
        await mockRpc.setResponse("mongo.distinct", response: ["active", "inactive", "pending"])

        let values = try await collection.distinct("status")

        XCTAssertEqual(values.count, 3)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.distinct")
    }

    func testDistinctWithFilter() async throws {
        await mockRpc.setResponse("mongo.distinct", response: ["admin", "user"])

        let values = try await collection.distinct("role", filter: ["active": true])

        XCTAssertEqual(values.count, 2)
    }

    // MARK: - Index Tests

    func testCreateIndex() async throws {
        await mockRpc.setResponse("mongo.createIndex", response: "email_1")

        let indexName = try await collection.createIndex(["email": 1])

        XCTAssertEqual(indexName, "email_1")

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.createIndex")
    }

    func testCreateIndexWithOptions() async throws {
        await mockRpc.setResponse("mongo.createIndex", response: "email_unique")

        let options = IndexOptions(name: "email_unique", unique: true)
        let indexName = try await collection.createIndex(["email": 1], options: options)

        XCTAssertEqual(indexName, "email_unique")
    }

    func testDropIndex() async throws {
        await mockRpc.setResponse("mongo.dropIndex", response: [:])

        try await collection.dropIndex("email_1")

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.dropIndex")
        XCTAssertEqual(calls[0].args[2] as? String, "email_1")
    }

    func testDropIndexes() async throws {
        await mockRpc.setResponse("mongo.dropIndexes", response: [:])

        try await collection.dropIndexes()

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.dropIndexes")
    }

    func testListIndexes() async throws {
        await mockRpc.setResponse("mongo.listIndexes", response: [
            ["name": "_id_", "key": ["_id": 1]],
            ["name": "email_1", "key": ["email": 1]]
        ])

        let indexes = try await collection.listIndexes()

        XCTAssertEqual(indexes.count, 2)
        XCTAssertEqual(indexes[0].getString("name"), "_id_")
        XCTAssertEqual(indexes[1].getString("name"), "email_1")
    }

    // MARK: - Collection Operations Tests

    func testDropCollection() async throws {
        await mockRpc.setResponse("mongo.dropCollection", response: [:])

        try await collection.drop()

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.dropCollection")
    }

    func testRenameCollection() async throws {
        await mockRpc.setResponse("mongo.renameCollection", response: [:])

        try await collection.rename(to: "new_users")

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.renameCollection")
        XCTAssertEqual(calls[0].args[2] as? String, "new_users")
    }

    // MARK: - Options Tests

    func testFindOptionsDefault() {
        let options = FindOptions()
        XCTAssertNil(options.limit)
        XCTAssertNil(options.skip)
        XCTAssertNil(options.sort)
        XCTAssertNil(options.projection)
        XCTAssertNil(options.batchSize)
    }

    func testFindOptionsCustom() {
        let options = FindOptions(
            limit: 10,
            skip: 5,
            sort: ["name": 1],
            projection: ["name": 1, "email": 1],
            batchSize: 100
        )

        XCTAssertEqual(options.limit, 10)
        XCTAssertEqual(options.skip, 5)
        XCTAssertNotNil(options.sort)
        XCTAssertNotNil(options.projection)
        XCTAssertEqual(options.batchSize, 100)
    }

    func testFindOptionsToDictionary() {
        let options = FindOptions(limit: 10, skip: 5, batchSize: 100)
        let dict = options.toDictionary()

        XCTAssertEqual(dict["limit"] as? Int, 10)
        XCTAssertEqual(dict["skip"] as? Int, 5)
        XCTAssertEqual(dict["batchSize"] as? Int, 100)
    }

    func testUpdateOptionsDefault() {
        let options = UpdateOptions()
        XCTAssertNil(options.upsert)
        XCTAssertNil(options.arrayFilters)
    }

    func testUpdateOptionsCustom() {
        let arrayFilters: [Document] = [
            ["elem.status": "active"]
        ]
        let options = UpdateOptions(upsert: true, arrayFilters: arrayFilters)

        XCTAssertEqual(options.upsert, true)
        XCTAssertNotNil(options.arrayFilters)
        XCTAssertEqual(options.arrayFilters?.count, 1)
    }

    func testIndexOptionsDefault() {
        let options = IndexOptions()
        XCTAssertNil(options.name)
        XCTAssertNil(options.unique)
        XCTAssertNil(options.sparse)
        XCTAssertNil(options.expireAfterSeconds)
        XCTAssertNil(options.partialFilterExpression)
    }

    func testIndexOptionsCustom() {
        let options = IndexOptions(
            name: "my_index",
            unique: true,
            sparse: true,
            expireAfterSeconds: 3600,
            partialFilterExpression: ["status": "active"]
        )

        XCTAssertEqual(options.name, "my_index")
        XCTAssertEqual(options.unique, true)
        XCTAssertEqual(options.sparse, true)
        XCTAssertEqual(options.expireAfterSeconds, 3600)
        XCTAssertNotNil(options.partialFilterExpression)
    }
}

// MARK: - Typed Collection Tests

final class TypedCollectionTests: XCTestCase {

    struct User: Codable, Equatable {
        let name: String
        let email: String
        var age: Int?
    }

    var mockRpc: MockRpcClient!
    var client: MongoClient!
    var db: MongoDatabase!
    var collection: MongoCollection<User>!

    override func setUp() async throws {
        mockRpc = MockRpcClient()
        client = MongoClient(uri: "mongodb://localhost", rpcClient: mockRpc)
        db = client.db("testdb")
        collection = db.collection("users", withType: User.self)
    }

    func testInsertOneTyped() async throws {
        await mockRpc.setResponse("mongo.insertOne", response: [
            "insertedId": 1
        ])

        let user = User(name: "John", email: "john@example.com", age: 30)
        let result = try await collection.insertOne(user)

        XCTAssertNotEqual(result.insertedId, .null)

        let calls = await mockRpc.getCalls()
        if let doc = calls[0].args[2] as? [String: Any] {
            XCTAssertEqual(doc["name"] as? String, "John")
            XCTAssertEqual(doc["email"] as? String, "john@example.com")
            XCTAssertEqual(doc["age"] as? Int, 30)
        } else {
            XCTFail("Expected document dictionary")
        }
    }

    func testFindOneTyped() async throws {
        await mockRpc.setResponse("mongo.findOne", response: [
            "name": "Jane",
            "email": "jane@example.com",
            "age": 25
        ])

        let filter: Document = ["email": "jane@example.com"]
        let result = try await collection.findOne(filter)

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.name, "Jane")
        XCTAssertEqual(result?.email, "jane@example.com")
        XCTAssertEqual(result?.age, 25)
    }

    func testInsertManyTyped() async throws {
        await mockRpc.setResponse("mongo.insertMany", response: [
            "insertedIds": ["0": 1, "1": 2]
        ])

        let users = [
            User(name: "Alice", email: "alice@example.com"),
            User(name: "Bob", email: "bob@example.com")
        ]

        let result = try await collection.insertMany(users)

        XCTAssertEqual(result.insertedIds.count, 2)
    }
}

// MARK: - Bulk Write Tests

final class BulkWriteTests: XCTestCase {

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

    // MARK: - Basic Bulk Write Tests

    func testBulkWriteInsertOne() async throws {
        await mockRpc.setResponse("mongo.bulkWrite", response: [
            "insertedCount": 1,
            "matchedCount": 0,
            "modifiedCount": 0,
            "deletedCount": 0,
            "upsertedCount": 0,
            "insertedIds": ["0": 1]
        ])

        let result = try await collection.bulkWrite([
            .insertOne(["name": "Alice", "email": "alice@example.com"])
        ])

        XCTAssertEqual(result.insertedCount, 1)
        XCTAssertEqual(result.insertedIds.count, 1)

        let calls = await mockRpc.getCalls()
        XCTAssertEqual(calls[0].method, "mongo.bulkWrite")
    }

    func testBulkWriteMultipleInserts() async throws {
        await mockRpc.setResponse("mongo.bulkWrite", response: [
            "insertedCount": 3,
            "matchedCount": 0,
            "modifiedCount": 0,
            "deletedCount": 0,
            "upsertedCount": 0,
            "insertedIds": ["0": 1, "1": 2, "2": 3]
        ])

        let result = try await collection.bulkWrite([
            .insertOne(["name": "Alice"]),
            .insertOne(["name": "Bob"]),
            .insertOne(["name": "Charlie"])
        ])

        XCTAssertEqual(result.insertedCount, 3)
        XCTAssertEqual(result.insertedIds.count, 3)
    }

    func testBulkWriteUpdateOne() async throws {
        await mockRpc.setResponse("mongo.bulkWrite", response: [
            "insertedCount": 0,
            "matchedCount": 1,
            "modifiedCount": 1,
            "deletedCount": 0,
            "upsertedCount": 0
        ])

        let result = try await collection.bulkWrite([
            .updateOne(
                filter: ["_id": "123"],
                update: ["$set": ["name": "Updated"]]
            )
        ])

        XCTAssertEqual(result.matchedCount, 1)
        XCTAssertEqual(result.modifiedCount, 1)
    }

    func testBulkWriteUpdateMany() async throws {
        await mockRpc.setResponse("mongo.bulkWrite", response: [
            "insertedCount": 0,
            "matchedCount": 5,
            "modifiedCount": 5,
            "deletedCount": 0,
            "upsertedCount": 0
        ])

        let result = try await collection.bulkWrite([
            .updateMany(
                filter: ["status": "pending"],
                update: ["$set": ["status": "processed"]]
            )
        ])

        XCTAssertEqual(result.matchedCount, 5)
        XCTAssertEqual(result.modifiedCount, 5)
    }

    func testBulkWriteDeleteOne() async throws {
        await mockRpc.setResponse("mongo.bulkWrite", response: [
            "insertedCount": 0,
            "matchedCount": 0,
            "modifiedCount": 0,
            "deletedCount": 1,
            "upsertedCount": 0
        ])

        let result = try await collection.bulkWrite([
            .deleteOne(["_id": "123"])
        ])

        XCTAssertEqual(result.deletedCount, 1)
    }

    func testBulkWriteDeleteMany() async throws {
        await mockRpc.setResponse("mongo.bulkWrite", response: [
            "insertedCount": 0,
            "matchedCount": 0,
            "modifiedCount": 0,
            "deletedCount": 10,
            "upsertedCount": 0
        ])

        let result = try await collection.bulkWrite([
            .deleteMany(["status": "deleted"])
        ])

        XCTAssertEqual(result.deletedCount, 10)
    }

    func testBulkWriteReplaceOne() async throws {
        await mockRpc.setResponse("mongo.bulkWrite", response: [
            "insertedCount": 0,
            "matchedCount": 1,
            "modifiedCount": 1,
            "deletedCount": 0,
            "upsertedCount": 0
        ])

        let replacement: Document = ["name": "NewName", "email": "new@example.com"]
        let result = try await collection.bulkWrite([
            .replaceOne(filter: ["_id": "123"], replacement: replacement)
        ])

        XCTAssertEqual(result.matchedCount, 1)
        XCTAssertEqual(result.modifiedCount, 1)
    }

    func testBulkWriteWithUpsert() async throws {
        await mockRpc.setResponse("mongo.bulkWrite", response: [
            "insertedCount": 0,
            "matchedCount": 0,
            "modifiedCount": 0,
            "deletedCount": 0,
            "upsertedCount": 1,
            "upsertedIds": ["0": ["$oid": "507f1f77bcf86cd799439011"]]
        ])

        let result = try await collection.bulkWrite([
            .updateOne(
                filter: ["email": "new@example.com"],
                update: ["$set": ["name": "New User"]],
                upsert: true
            )
        ])

        XCTAssertEqual(result.upsertedCount, 1)
        XCTAssertEqual(result.upsertedIds.count, 1)
    }

    // MARK: - Mixed Operations Tests

    func testBulkWriteMixedOperations() async throws {
        await mockRpc.setResponse("mongo.bulkWrite", response: [
            "insertedCount": 2,
            "matchedCount": 1,
            "modifiedCount": 1,
            "deletedCount": 1,
            "upsertedCount": 0,
            "insertedIds": ["0": 1, "1": 2]
        ])

        let result = try await collection.bulkWrite([
            .insertOne(["name": "Alice"]),
            .insertOne(["name": "Bob"]),
            .updateOne(filter: ["name": "Charlie"], update: ["$set": ["age": 30]]),
            .deleteOne(["name": "Dave"])
        ])

        XCTAssertEqual(result.insertedCount, 2)
        XCTAssertEqual(result.matchedCount, 1)
        XCTAssertEqual(result.modifiedCount, 1)
        XCTAssertEqual(result.deletedCount, 1)
    }

    // MARK: - Bulk Write Options Tests

    func testBulkWriteWithOrderedOption() async throws {
        await mockRpc.setResponse("mongo.bulkWrite", response: [
            "insertedCount": 1,
            "matchedCount": 0,
            "modifiedCount": 0,
            "deletedCount": 0,
            "upsertedCount": 0
        ])

        let options = BulkWriteOptions(ordered: false)
        let result = try await collection.bulkWrite(
            [.insertOne(["name": "Test"])],
            options: options
        )

        XCTAssertEqual(result.insertedCount, 1)

        let calls = await mockRpc.getCalls()
        if let opts = calls[0].args[3] as? [String: Any] {
            XCTAssertEqual(opts["ordered"] as? Bool, false)
        }
    }

    // MARK: - BulkWriteResult Tests

    func testBulkWriteResultProperties() {
        let result = BulkWriteResult(
            insertedCount: 2,
            matchedCount: 3,
            modifiedCount: 3,
            deletedCount: 1,
            upsertedCount: 1,
            insertedIds: [0: .int(1), 1: .int(2)],
            upsertedIds: [4: .string("abc")]
        )

        XCTAssertEqual(result.insertedCount, 2)
        XCTAssertEqual(result.matchedCount, 3)
        XCTAssertEqual(result.modifiedCount, 3)
        XCTAssertEqual(result.deletedCount, 1)
        XCTAssertEqual(result.upsertedCount, 1)
        XCTAssertEqual(result.insertedIds.count, 2)
        XCTAssertEqual(result.upsertedIds.count, 1)
    }

    // MARK: - BulkWriteOptions Tests

    func testBulkWriteOptionsDefault() {
        let options = BulkWriteOptions()
        XCTAssertNil(options.ordered)
    }

    func testBulkWriteOptionsCustom() {
        let options = BulkWriteOptions(ordered: true)
        XCTAssertEqual(options.ordered, true)
    }

    func testBulkWriteOptionsToDictionary() {
        let options = BulkWriteOptions(ordered: false)
        let dict = options.toDictionary()
        XCTAssertEqual(dict["ordered"] as? Bool, false)
    }

    // MARK: - WriteModel Tests

    func testWriteModelInsertOne() throws {
        let model: WriteModel<Document> = .insertOne(["name": "Test"])
        let format = try model.toRpcFormat()

        XCTAssertNotNil(format["insertOne"])
        if let op = format["insertOne"] as? [String: Any],
           let doc = op["document"] as? [String: Any] {
            XCTAssertEqual(doc["name"] as? String, "Test")
        } else {
            XCTFail("Expected insertOne format")
        }
    }

    func testWriteModelUpdateOne() throws {
        let model: WriteModel<Document> = .updateOne(
            filter: ["_id": "123"],
            update: ["$set": ["name": "Updated"]]
        )
        let format = try model.toRpcFormat()

        XCTAssertNotNil(format["updateOne"])
        if let op = format["updateOne"] as? [String: Any] {
            XCTAssertNotNil(op["filter"])
            XCTAssertNotNil(op["update"])
        } else {
            XCTFail("Expected updateOne format")
        }
    }

    func testWriteModelUpdateOneWithUpsert() throws {
        let model: WriteModel<Document> = .updateOne(
            filter: ["_id": "123"],
            update: ["$set": ["name": "Updated"]],
            upsert: true
        )
        let format = try model.toRpcFormat()

        if let op = format["updateOne"] as? [String: Any] {
            XCTAssertEqual(op["upsert"] as? Bool, true)
        } else {
            XCTFail("Expected updateOne format with upsert")
        }
    }

    func testWriteModelDeleteOne() throws {
        let model: WriteModel<Document> = .deleteOne(["_id": "123"])
        let format = try model.toRpcFormat()

        XCTAssertNotNil(format["deleteOne"])
        if let op = format["deleteOne"] as? [String: Any] {
            XCTAssertNotNil(op["filter"])
        } else {
            XCTFail("Expected deleteOne format")
        }
    }

    func testWriteModelDeleteMany() throws {
        let model: WriteModel<Document> = .deleteMany(["status": "deleted"])
        let format = try model.toRpcFormat()

        XCTAssertNotNil(format["deleteMany"])
    }

    func testWriteModelReplaceOne() throws {
        let model: WriteModel<Document> = .replaceOne(
            filter: ["_id": "123"],
            replacement: ["name": "New", "email": "new@example.com"]
        )
        let format = try model.toRpcFormat()

        XCTAssertNotNil(format["replaceOne"])
        if let op = format["replaceOne"] as? [String: Any] {
            XCTAssertNotNil(op["filter"])
            XCTAssertNotNil(op["replacement"])
        } else {
            XCTFail("Expected replaceOne format")
        }
    }
}
