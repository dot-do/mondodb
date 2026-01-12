// DocumentTests.swift
// MongoDo Tests

import XCTest
@testable import MongoDo

final class DocumentTests: XCTestCase {

    // MARK: - ObjectId Tests

    func testObjectIdCreation() {
        let oid = ObjectId()
        XCTAssertEqual(oid.bytes.count, 12)
        XCTAssertEqual(oid.hexString.count, 24)
    }

    func testObjectIdFromHexString() {
        let hexString = "507f1f77bcf86cd799439011"
        let oid = ObjectId(hexString: hexString)
        XCTAssertNotNil(oid)
        XCTAssertEqual(oid?.hexString, hexString)
    }

    func testObjectIdFromInvalidHexString() {
        let invalid1 = ObjectId(hexString: "invalid")
        XCTAssertNil(invalid1)

        let invalid2 = ObjectId(hexString: "507f1f77bcf86cd79943901") // 23 chars
        XCTAssertNil(invalid2)

        let invalid3 = ObjectId(hexString: "507f1f77bcf86cd7994390111") // 25 chars
        XCTAssertNil(invalid3)

        let invalid4 = ObjectId(hexString: "zzzzzzzzzzzzzzzzzzzzzzzz") // non-hex
        XCTAssertNil(invalid4)
    }

    func testObjectIdFromBytes() {
        let bytes: [UInt8] = [80, 127, 31, 119, 188, 248, 108, 215, 153, 67, 144, 17]
        let oid = ObjectId(bytes: bytes)
        XCTAssertNotNil(oid)
        XCTAssertEqual(oid?.hexString, "507f1f77bcf86cd799439011")
    }

    func testObjectIdFromInvalidBytes() {
        let invalid = ObjectId(bytes: [1, 2, 3]) // too short
        XCTAssertNil(invalid)
    }

    func testObjectIdTimestamp() {
        let oid = ObjectId()
        let timestamp = oid.timestamp
        let now = Date()

        // Timestamp should be within a few seconds of now
        XCTAssertLessThan(abs(timestamp.timeIntervalSince(now)), 5)
    }

    func testObjectIdEquality() {
        let hexString = "507f1f77bcf86cd799439011"
        let oid1 = ObjectId(hexString: hexString)
        let oid2 = ObjectId(hexString: hexString)
        XCTAssertEqual(oid1, oid2)

        let oid3 = ObjectId()
        XCTAssertNotEqual(oid1, oid3)
    }

    func testObjectIdHashable() {
        let oid1 = ObjectId()
        let oid2 = ObjectId()

        var set = Set<ObjectId>()
        set.insert(oid1)
        set.insert(oid2)
        set.insert(oid1) // duplicate

        XCTAssertEqual(set.count, 2)
    }

    func testObjectIdCodable() throws {
        let oid = ObjectId()

        let encoder = JSONEncoder()
        let data = try encoder.encode(oid)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(ObjectId.self, from: data)

        XCTAssertEqual(oid, decoded)
    }

    // MARK: - BsonValue Tests

    func testBsonValueNull() {
        let value: BsonValue = .null
        XCTAssertTrue(value.anyValue is NSNull)
    }

    func testBsonValueBool() {
        let value: BsonValue = .bool(true)
        XCTAssertEqual(value.anyValue as? Bool, true)
    }

    func testBsonValueInt32() {
        let value: BsonValue = .int32(42)
        XCTAssertEqual(value.anyValue as? Int32, 42)
    }

    func testBsonValueInt64() {
        let value: BsonValue = .int64(9_000_000_000)
        XCTAssertEqual(value.anyValue as? Int64, 9_000_000_000)
    }

    func testBsonValueDouble() {
        let value: BsonValue = .double(3.14)
        XCTAssertEqual(value.anyValue as? Double, 3.14)
    }

    func testBsonValueString() {
        let value: BsonValue = .string("hello")
        XCTAssertEqual(value.anyValue as? String, "hello")
    }

    func testBsonValueObjectId() {
        let oid = ObjectId()
        let value: BsonValue = .objectId(oid)

        guard let dict = value.anyValue as? [String: String],
              let hexString = dict["$oid"] else {
            XCTFail("Expected ObjectId extended JSON")
            return
        }

        XCTAssertEqual(hexString, oid.hexString)
    }

    func testBsonValueDate() {
        let date = Date(timeIntervalSince1970: 1704067200) // 2024-01-01
        let value: BsonValue = .date(date)

        guard let dict = value.anyValue as? [String: Int64],
              let millis = dict["$date"] else {
            XCTFail("Expected Date extended JSON")
            return
        }

        XCTAssertEqual(millis, 1704067200000)
    }

    func testBsonValueArray() {
        let value: BsonValue = .array([.int64(1), .int64(2), .int64(3)])

        guard let array = value.anyValue as? [Any] else {
            XCTFail("Expected array")
            return
        }

        XCTAssertEqual(array.count, 3)
    }

    func testBsonValueDocument() {
        var doc = Document()
        doc["key"] = .string("value")

        let value: BsonValue = .document(doc)

        guard let dict = value.anyValue as? [String: Any],
              let key = dict["key"] as? String else {
            XCTFail("Expected dictionary")
            return
        }

        XCTAssertEqual(key, "value")
    }

    func testBsonValueBinary() {
        let data = Data([1, 2, 3, 4])
        let value: BsonValue = .binary(data)

        guard let dict = value.anyValue as? [String: Any],
              let binary = dict["$binary"] as? [String: String],
              let base64 = binary["base64"] else {
            XCTFail("Expected binary extended JSON")
            return
        }

        XCTAssertEqual(base64, data.base64EncodedString())
    }

    func testBsonValueFromAny() {
        XCTAssertEqual(BsonValue.fromAny(NSNull()), .null)
        XCTAssertEqual(BsonValue.fromAny(true), .bool(true))
        XCTAssertEqual(BsonValue.fromAny(42), .int64(42))
        XCTAssertEqual(BsonValue.fromAny(3.14), .double(3.14))
        XCTAssertEqual(BsonValue.fromAny("hello"), .string("hello"))

        let oid = ObjectId()
        XCTAssertEqual(BsonValue.fromAny(["$oid": oid.hexString]), .objectId(oid))

        let dateMillis: Int64 = 1704067200000
        if case .date(let date) = BsonValue.fromAny(["$date": dateMillis]) {
            XCTAssertEqual(Int64(date.timeIntervalSince1970 * 1000), dateMillis)
        } else {
            XCTFail("Expected date")
        }
    }

    // MARK: - BsonValue Literals Tests

    func testBsonValueNilLiteral() {
        let value: BsonValue = nil
        XCTAssertEqual(value, .null)
    }

    func testBsonValueBoolLiteral() {
        let value: BsonValue = true
        XCTAssertEqual(value, .bool(true))
    }

    func testBsonValueIntLiteral() {
        let value: BsonValue = 42
        XCTAssertEqual(value, .int64(42))
    }

    func testBsonValueFloatLiteral() {
        let value: BsonValue = 3.14
        XCTAssertEqual(value, .double(3.14))
    }

    func testBsonValueStringLiteral() {
        let value: BsonValue = "hello"
        XCTAssertEqual(value, .string("hello"))
    }

    func testBsonValueArrayLiteral() {
        let value: BsonValue = [1, 2, 3]
        if case .array(let arr) = value {
            XCTAssertEqual(arr.count, 3)
        } else {
            XCTFail("Expected array")
        }
    }

    func testBsonValueDictionaryLiteral() {
        let value: BsonValue = ["key": "value"]
        if case .document(let doc) = value {
            XCTAssertEqual(doc.getString("key"), "value")
        } else {
            XCTFail("Expected document")
        }
    }

    // MARK: - Document Tests

    func testDocumentEmpty() {
        let doc = Document()
        XCTAssertTrue(doc.isEmpty)
        XCTAssertEqual(doc.count, 0)
    }

    func testDocumentSubscript() {
        var doc = Document()
        doc["name"] = .string("John")
        doc["age"] = .int64(30)

        XCTAssertEqual(doc["name"], .string("John"))
        XCTAssertEqual(doc["age"], .int64(30))
        XCTAssertNil(doc["nonexistent"])
    }

    func testDocumentSubscriptRemove() {
        var doc = Document()
        doc["key"] = .string("value")
        XCTAssertNotNil(doc["key"])

        doc["key"] = nil
        XCTAssertNil(doc["key"])
    }

    func testDocumentGetString() {
        var doc = Document()
        doc["name"] = .string("John")
        doc["age"] = .int64(30)

        XCTAssertEqual(doc.getString("name"), "John")
        XCTAssertNil(doc.getString("age")) // wrong type
        XCTAssertNil(doc.getString("nonexistent"))
    }

    func testDocumentGetInt() {
        var doc = Document()
        doc["count32"] = .int32(42)
        doc["count64"] = .int64(9_000_000_000)
        doc["name"] = .string("John")

        XCTAssertEqual(doc.getInt("count32"), 42)
        XCTAssertEqual(doc.getInt("count64"), 9_000_000_000)
        XCTAssertNil(doc.getInt("name"))
    }

    func testDocumentGetDouble() {
        var doc = Document()
        doc["price"] = .double(19.99)
        doc["count"] = .int64(5)
        doc["name"] = .string("Item")

        XCTAssertEqual(doc.getDouble("price"), 19.99)
        XCTAssertEqual(doc.getDouble("count"), 5.0)
        XCTAssertNil(doc.getDouble("name"))
    }

    func testDocumentGetBool() {
        var doc = Document()
        doc["active"] = .bool(true)
        doc["name"] = .string("John")

        XCTAssertEqual(doc.getBool("active"), true)
        XCTAssertNil(doc.getBool("name"))
    }

    func testDocumentGetDate() {
        let date = Date()
        var doc = Document()
        doc["created"] = .date(date)

        XCTAssertNotNil(doc.getDate("created"))
    }

    func testDocumentGetObjectId() {
        let oid = ObjectId()
        var doc = Document()
        doc["_id"] = .objectId(oid)

        XCTAssertEqual(doc.getObjectId("_id"), oid)
    }

    func testDocumentGetDocument() {
        var nested = Document()
        nested["city"] = .string("Austin")

        var doc = Document()
        doc["address"] = .document(nested)

        XCTAssertEqual(doc.getDocument("address")?.getString("city"), "Austin")
    }

    func testDocumentGetArray() {
        var doc = Document()
        doc["tags"] = .array([.string("swift"), .string("mongodb")])

        guard let tags = doc.getArray("tags") else {
            XCTFail("Expected array")
            return
        }

        XCTAssertEqual(tags.count, 2)
    }

    func testDocumentKeys() {
        var doc = Document()
        doc["a"] = .int64(1)
        doc["b"] = .int64(2)
        doc["c"] = .int64(3)

        XCTAssertEqual(doc.keys, ["a", "b", "c"])
    }

    func testDocumentValues() {
        var doc = Document()
        doc["a"] = .int64(1)
        doc["b"] = .int64(2)

        XCTAssertEqual(doc.values.count, 2)
    }

    func testDocumentFromDictionary() {
        let dict: [String: Any] = [
            "name": "John",
            "age": 30,
            "active": true
        ]

        let doc = Document(dict)
        XCTAssertEqual(doc.getString("name"), "John")
        XCTAssertNotNil(doc.getInt("age"))
        XCTAssertEqual(doc.getBool("active"), true)
    }

    func testDocumentToDictionary() {
        var doc = Document()
        doc["name"] = .string("John")
        doc["age"] = .int64(30)

        let dict = doc.toDictionary()
        XCTAssertEqual(dict["name"] as? String, "John")
        XCTAssertEqual(dict["age"] as? Int64, 30)
    }

    func testDocumentLiteral() {
        let doc: Document = [
            "name": "John",
            "age": 30,
            "active": true
        ]

        XCTAssertEqual(doc.getString("name"), "John")
        XCTAssertEqual(doc.getInt("age"), 30)
        XCTAssertEqual(doc.getBool("active"), true)
    }

    func testDocumentSequence() {
        let doc: Document = ["a": 1, "b": 2, "c": 3]

        var count = 0
        for (key, value) in doc {
            XCTAssertFalse(key.isEmpty)
            XCTAssertNotEqual(value, .null)
            count += 1
        }

        XCTAssertEqual(count, 3)
    }

    func testDocumentEquality() {
        let doc1: Document = ["a": 1, "b": 2]
        let doc2: Document = ["a": 1, "b": 2]
        let doc3: Document = ["a": 1, "c": 2]

        XCTAssertEqual(doc1, doc2)
        XCTAssertNotEqual(doc1, doc3)
    }

    func testDocumentHashable() {
        let doc1: Document = ["a": 1]
        let doc2: Document = ["b": 2]
        let doc3: Document = ["a": 1]

        var set = Set<Document>()
        set.insert(doc1)
        set.insert(doc2)
        set.insert(doc3) // duplicate of doc1

        XCTAssertEqual(set.count, 2)
    }

    func testDocumentJSON() throws {
        let doc: Document = [
            "name": "John",
            "age": 30
        ]

        let json = try doc.toJSON()
        let decoded = try Document.fromJSON(json)

        XCTAssertEqual(decoded.getString("name"), "John")
        XCTAssertEqual(decoded.getInt("age"), 30)
    }

    func testDocumentCodable() throws {
        let doc: Document = [
            "name": "John",
            "age": 30,
            "active": true
        ]

        let encoder = JSONEncoder()
        let data = try encoder.encode(doc)

        let decoder = JSONDecoder()
        let decoded = try decoder.decode(Document.self, from: data)

        XCTAssertEqual(decoded.getString("name"), "John")
    }

    // MARK: - Result Types Tests

    func testInsertOneResult() {
        let oid = ObjectId()
        let result = InsertOneResult(insertedId: .objectId(oid))
        XCTAssertEqual(result.insertedId, .objectId(oid))
    }

    func testInsertManyResult() {
        let result = InsertManyResult(insertedIds: [0: .int64(1), 1: .int64(2)])
        XCTAssertEqual(result.insertedIds.count, 2)
    }

    func testUpdateResult() {
        let result = UpdateResult(matchedCount: 5, modifiedCount: 3, upsertedId: nil)
        XCTAssertEqual(result.matchedCount, 5)
        XCTAssertEqual(result.modifiedCount, 3)
        XCTAssertNil(result.upsertedId)
    }

    func testUpdateResultWithUpsert() {
        let oid = ObjectId()
        let result = UpdateResult(matchedCount: 0, modifiedCount: 0, upsertedId: .objectId(oid))
        XCTAssertEqual(result.matchedCount, 0)
        XCTAssertNotNil(result.upsertedId)
    }

    func testDeleteResult() {
        let result = DeleteResult(deletedCount: 10)
        XCTAssertEqual(result.deletedCount, 10)
    }
}
