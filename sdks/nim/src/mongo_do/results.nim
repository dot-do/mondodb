## MongoDB operation results for the .do platform

import std/[json, options]

type
  # Insert results
  InsertOneResult* = object
    acknowledged*: bool
    insertedId*: JsonNode

  InsertManyResult* = object
    acknowledged*: bool
    insertedIds*: seq[JsonNode]
    insertedCount*: int

  # Update results
  UpdateResult* = object
    acknowledged*: bool
    matchedCount*: int
    modifiedCount*: int
    upsertedId*: Option[JsonNode]
    upsertedCount*: int

  # Delete results
  DeleteResult* = object
    acknowledged*: bool
    deletedCount*: int

  # Replace result
  ReplaceResult* = object
    acknowledged*: bool
    matchedCount*: int
    modifiedCount*: int
    upsertedId*: Option[JsonNode]

  # Bulk write result
  BulkWriteResult* = object
    acknowledged*: bool
    insertedCount*: int
    matchedCount*: int
    modifiedCount*: int
    deletedCount*: int
    upsertedCount*: int
    upsertedIds*: seq[JsonNode]

  # Result type for operations
  ResultKind* = enum
    rkOk
    rkError

  Result*[T] = object
    case kind*: ResultKind
    of rkOk:
      value*: T
    of rkError:
      error*: ref CatchableError

# InsertOneResult

proc newInsertOneResult*(insertedId: JsonNode, acknowledged: bool = true): InsertOneResult =
  InsertOneResult(acknowledged: acknowledged, insertedId: insertedId)

proc fromJson*(T: typedesc[InsertOneResult], json: JsonNode): InsertOneResult =
  InsertOneResult(
    acknowledged: json.getOrDefault("acknowledged").getBool(true),
    insertedId: json.getOrDefault("insertedId")
  )

# InsertManyResult

proc newInsertManyResult*(insertedIds: seq[JsonNode], acknowledged: bool = true): InsertManyResult =
  InsertManyResult(
    acknowledged: acknowledged,
    insertedIds: insertedIds,
    insertedCount: insertedIds.len
  )

proc fromJson*(T: typedesc[InsertManyResult], json: JsonNode): InsertManyResult =
  var ids: seq[JsonNode] = @[]
  for id in json.getOrDefault("insertedIds"):
    ids.add(id)

  InsertManyResult(
    acknowledged: json.getOrDefault("acknowledged").getBool(true),
    insertedIds: ids,
    insertedCount: json.getOrDefault("insertedCount").getInt(ids.len)
  )

# UpdateResult

proc newUpdateResult*(matchedCount, modifiedCount: int, upsertedId: Option[JsonNode] = none(JsonNode)): UpdateResult =
  UpdateResult(
    acknowledged: true,
    matchedCount: matchedCount,
    modifiedCount: modifiedCount,
    upsertedId: upsertedId,
    upsertedCount: if upsertedId.isSome: 1 else: 0
  )

proc fromJson*(T: typedesc[UpdateResult], json: JsonNode): UpdateResult =
  let upsertedId = if json.hasKey("upsertedId") and json["upsertedId"].kind != JNull:
    some(json["upsertedId"])
  else:
    none(JsonNode)

  UpdateResult(
    acknowledged: json.getOrDefault("acknowledged").getBool(true),
    matchedCount: json.getOrDefault("matchedCount").getInt(0),
    modifiedCount: json.getOrDefault("modifiedCount").getInt(0),
    upsertedId: upsertedId,
    upsertedCount: json.getOrDefault("upsertedCount").getInt(0)
  )

# DeleteResult

proc newDeleteResult*(deletedCount: int): DeleteResult =
  DeleteResult(acknowledged: true, deletedCount: deletedCount)

proc fromJson*(T: typedesc[DeleteResult], json: JsonNode): DeleteResult =
  DeleteResult(
    acknowledged: json.getOrDefault("acknowledged").getBool(true),
    deletedCount: json.getOrDefault("deletedCount").getInt(0)
  )

# ReplaceResult

proc fromJson*(T: typedesc[ReplaceResult], json: JsonNode): ReplaceResult =
  let upsertedId = if json.hasKey("upsertedId") and json["upsertedId"].kind != JNull:
    some(json["upsertedId"])
  else:
    none(JsonNode)

  ReplaceResult(
    acknowledged: json.getOrDefault("acknowledged").getBool(true),
    matchedCount: json.getOrDefault("matchedCount").getInt(0),
    modifiedCount: json.getOrDefault("modifiedCount").getInt(0),
    upsertedId: upsertedId
  )

# BulkWriteResult

proc fromJson*(T: typedesc[BulkWriteResult], json: JsonNode): BulkWriteResult =
  var ids: seq[JsonNode] = @[]
  for id in json.getOrDefault("upsertedIds"):
    ids.add(id)

  BulkWriteResult(
    acknowledged: json.getOrDefault("acknowledged").getBool(true),
    insertedCount: json.getOrDefault("insertedCount").getInt(0),
    matchedCount: json.getOrDefault("matchedCount").getInt(0),
    modifiedCount: json.getOrDefault("modifiedCount").getInt(0),
    deletedCount: json.getOrDefault("deletedCount").getInt(0),
    upsertedCount: json.getOrDefault("upsertedCount").getInt(0),
    upsertedIds: ids
  )

# Result type helpers

proc ok*[T](value: T): Result[T] =
  Result[T](kind: rkOk, value: value)

proc err*[T](error: ref CatchableError): Result[T] =
  Result[T](kind: rkError, error: error)

proc isOk*[T](r: Result[T]): bool =
  r.kind == rkOk

proc isErr*[T](r: Result[T]): bool =
  r.kind == rkError

proc get*[T](r: Result[T]): T =
  if r.isErr:
    raise r.error
  r.value

proc getOrDefault*[T](r: Result[T], default: T): T =
  if r.isOk: r.value else: default
