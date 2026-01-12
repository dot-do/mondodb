## Tests for MongoDB SDK

import std/[unittest, json, options]
import ../src/mongo_do

suite "MongoConfig":
  test "creates with defaults":
    let config = newMongoConfig()
    check config.uri == "https://mongo.do"
    check config.timeout == DefaultTimeout
    check config.maxRetries == DefaultMaxRetries

  test "creates with custom URI":
    let config = newMongoConfig("https://custom.example.com", "test-api-key")
    check config.uri == "https://custom.example.com"
    check config.apiKey == "test-api-key"

  test "generates headers":
    let config = newMongoConfig()
    config.apiKey = "test-key"
    let headers = config.headers
    check headers["Authorization"] == "Bearer test-key"
    check headers["Content-Type"] == "application/json"

suite "MongoQuery":
  test "creates query":
    let q = newMongoQuery("users who are active")
    check q.queryString == "users who are active"

  test "chains modifiers":
    let q = newMongoQuery("users")
      .limit(10)
      .skip(5)
      .sort("name", 1)

    check q.limitN == 10
    check q.skipN == 5
    check q.sortField == "name"
    check q.sortDirection == 1

  test "enables features":
    let q = newMongoQuery("search term")
      .highlight()
      .fuzzy()
      .atomic()

    check q.highlightEnabled == true
    check q.fuzzyEnabled == true
    check q.atomicEnabled == true

suite "Cursor":
  test "creates empty cursor":
    let cursor = newCursor()
    check cursor.documents.len == 0
    check cursor.hasNext == false

  test "creates cursor with documents":
    let docs = @[%*{"_id": 1}, %*{"_id": 2}, %*{"_id": 3}]
    let cursor = newCursor(docs)
    check cursor.documents.len == 3
    check cursor.hasNext == true

  test "iterates documents":
    let docs = @[%*{"_id": 1}, %*{"_id": 2}]
    var cursor = newCursor(docs)

    let first = cursor.next()
    check first.isSome
    check first.get["_id"].getInt == 1

    let second = cursor.next()
    check second.isSome
    check second.get["_id"].getInt == 2

    let third = cursor.next()
    check third.isNone

  test "converts to sequence":
    let docs = @[%*{"a": 1}, %*{"a": 2}]
    let cursor = newCursor(docs)
    check cursor.toSeq.len == 2

suite "CursorBuilder":
  test "builds find options":
    let builder = newCursorBuilder()
      .sort("name", Ascending)
      .skip(10)
      .limit(20)
      .project(%*{"name": 1, "_id": 0})

    let options = builder.toFindOptions()
    check options["skip"].getInt == 10
    check options["limit"].getInt == 20
    check options.hasKey("projection")
    check options.hasKey("sort")

suite "Results":
  test "InsertOneResult from JSON":
    let json = %*{"acknowledged": true, "insertedId": "abc123"}
    let result = InsertOneResult.fromJson(json)
    check result.acknowledged == true
    check result.insertedId.getStr == "abc123"

  test "UpdateResult from JSON":
    let json = %*{
      "acknowledged": true,
      "matchedCount": 5,
      "modifiedCount": 3,
      "upsertedCount": 0
    }
    let result = UpdateResult.fromJson(json)
    check result.matchedCount == 5
    check result.modifiedCount == 3
    check result.upsertedId.isNone

  test "UpdateResult with upsert":
    let json = %*{
      "acknowledged": true,
      "matchedCount": 0,
      "modifiedCount": 0,
      "upsertedId": "new123",
      "upsertedCount": 1
    }
    let result = UpdateResult.fromJson(json)
    check result.upsertedId.isSome
    check result.upsertedId.get.getStr == "new123"

  test "DeleteResult from JSON":
    let json = %*{"acknowledged": true, "deletedCount": 10}
    let result = DeleteResult.fromJson(json)
    check result.deletedCount == 10

suite "Result type":
  test "ok result":
    let r = ok[int](42)
    check r.isOk == true
    check r.isErr == false
    check r.get == 42

  test "error result":
    let err = newException(ValueError, "test error")
    let r = err[int](err)
    check r.isErr == true
    check r.isOk == false

  test "getOrDefault":
    let okResult = ok[int](42)
    let errResult = err[int](newException(ValueError, ""))

    check okResult.getOrDefault(0) == 42
    check errResult.getOrDefault(0) == 0

suite "Errors":
  test "creates MongoError":
    let e = newMongoError("TEST_CODE", "Test message")
    check e.code == "TEST_CODE"
    check e.msg == "Test message"

  test "creates QueryError with suggestion":
    let e = newQueryError("Invalid query", some("Try using X instead"))
    check e.suggestion.isSome
    check e.suggestion.get == "Try using X instead"

  test "creates ConnectionError":
    let e = newConnectionError("Connection failed", "https://example.com")
    check e.uri == "https://example.com"
    check e.code == "CONNECTION_ERROR"

  test "creates DuplicateKeyError":
    let e = newDuplicateKeyError("Duplicate key error")
    check e.code == "11000"

suite "Transaction":
  test "creates transaction":
    let tx = newTransaction()
    check tx.committed == false

  test "adds operations":
    let tx = newTransaction()
    tx.addOperation(%*{"type": "insert"})
    tx.addOperation(%*{"type": "update"})
    check tx.operations.len == 2

  test "commits transaction":
    let tx = newTransaction()
    tx.commit()
    check tx.committed == true

  test "rollback clears operations":
    let tx = newTransaction()
    tx.addOperation(%*{"type": "insert"})
    tx.rollback()
    check tx.operations.len == 0
    check tx.committed == true
