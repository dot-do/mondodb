## MongoDB collection for the .do platform

import std/[json, options, asyncdispatch, sequtils]
import ./errors
import ./config
import ./cursor
import ./results
import ./query

type
  MongoCollection* = ref object
    database*: pointer  # Forward reference to MongoDatabase
    name*: string
    config*: MongoConfig

  TypedCollection*[T] = ref object
    collection*: MongoCollection

# Forward declare for RPC call
proc rpcCall*(config: MongoConfig, methodName: string, params: JsonNode): Future[JsonNode] {.async, importc.}

proc newMongoCollection*(database: pointer, name: string, config: MongoConfig): MongoCollection =
  MongoCollection(database: database, name: name, config: config)

proc newTypedCollection*[T](collection: MongoCollection): TypedCollection[T] =
  TypedCollection[T](collection: collection)

# Collection full name helper
proc fullName*(coll: MongoCollection): string =
  # Note: in real impl, would get db name from database ref
  coll.name

# ---------------------------------------------------------
# Find Operations
# ---------------------------------------------------------

proc find*(coll: MongoCollection, filter: JsonNode = nil, options: JsonNode = nil): Future[Cursor] {.async.} =
  ## Find documents matching filter
  let params = %*{
    "collection": coll.name,
    "filter": if filter.isNil: newJObject() else: filter,
    "options": if options.isNil: newJObject() else: options
  }

  let response = await rpcCall(coll.config, "mongo.find", params)

  var docs: seq[JsonNode] = @[]
  if response.hasKey("documents"):
    for doc in response["documents"]:
      docs.add(doc)

  return newCursor(docs)

proc findOne*(coll: MongoCollection, filter: JsonNode = nil): Future[Option[JsonNode]] {.async.} =
  ## Find a single document
  let params = %*{
    "collection": coll.name,
    "filter": if filter.isNil: newJObject() else: filter
  }

  let response = await rpcCall(coll.config, "mongo.findOne", params)

  if response.isNil or response.kind == JNull:
    return none(JsonNode)
  return some(response)

proc findById*(coll: MongoCollection, id: string): Future[Option[JsonNode]] {.async.} =
  ## Find document by ID
  return await coll.findOne(%*{"_id": id})

proc countDocuments*(coll: MongoCollection, filter: JsonNode = nil): Future[int64] {.async.} =
  ## Count matching documents
  let params = %*{
    "collection": coll.name,
    "filter": if filter.isNil: newJObject() else: filter
  }

  let response = await rpcCall(coll.config, "mongo.countDocuments", params)
  return response.getOrDefault("count").getBiggestInt(0)

proc estimatedDocumentCount*(coll: MongoCollection): Future[int64] {.async.} =
  ## Get estimated document count
  let params = %*{"collection": coll.name}
  let response = await rpcCall(coll.config, "mongo.estimatedDocumentCount", params)
  return response.getOrDefault("count").getBiggestInt(0)

# ---------------------------------------------------------
# Insert Operations
# ---------------------------------------------------------

proc insertOne*(coll: MongoCollection, document: JsonNode): Future[InsertOneResult] {.async.} =
  ## Insert a single document
  let params = %*{
    "collection": coll.name,
    "document": document
  }

  let response = await rpcCall(coll.config, "mongo.insertOne", params)
  return InsertOneResult.fromJson(response)

proc insertMany*(coll: MongoCollection, documents: seq[JsonNode]): Future[InsertManyResult] {.async.} =
  ## Insert multiple documents
  let params = %*{
    "collection": coll.name,
    "documents": documents
  }

  let response = await rpcCall(coll.config, "mongo.insertMany", params)
  return InsertManyResult.fromJson(response)

# ---------------------------------------------------------
# Update Operations
# ---------------------------------------------------------

proc updateOne*(coll: MongoCollection, filter, update: JsonNode, upsert: bool = false): Future[UpdateResult] {.async.} =
  ## Update a single document
  let params = %*{
    "collection": coll.name,
    "filter": filter,
    "update": update,
    "options": {"upsert": upsert}
  }

  let response = await rpcCall(coll.config, "mongo.updateOne", params)
  return UpdateResult.fromJson(response)

proc updateMany*(coll: MongoCollection, filter, update: JsonNode, upsert: bool = false): Future[UpdateResult] {.async.} =
  ## Update multiple documents
  let params = %*{
    "collection": coll.name,
    "filter": filter,
    "update": update,
    "options": {"upsert": upsert}
  }

  let response = await rpcCall(coll.config, "mongo.updateMany", params)
  return UpdateResult.fromJson(response)

proc replaceOne*(coll: MongoCollection, filter, replacement: JsonNode, upsert: bool = false): Future[ReplaceResult] {.async.} =
  ## Replace a single document
  let params = %*{
    "collection": coll.name,
    "filter": filter,
    "replacement": replacement,
    "options": {"upsert": upsert}
  }

  let response = await rpcCall(coll.config, "mongo.replaceOne", params)
  return ReplaceResult.fromJson(response)

# ---------------------------------------------------------
# Delete Operations
# ---------------------------------------------------------

proc deleteOne*(coll: MongoCollection, filter: JsonNode): Future[DeleteResult] {.async.} =
  ## Delete a single document
  let params = %*{
    "collection": coll.name,
    "filter": filter
  }

  let response = await rpcCall(coll.config, "mongo.deleteOne", params)
  return DeleteResult.fromJson(response)

proc deleteMany*(coll: MongoCollection, filter: JsonNode): Future[DeleteResult] {.async.} =
  ## Delete multiple documents
  let params = %*{
    "collection": coll.name,
    "filter": filter
  }

  let response = await rpcCall(coll.config, "mongo.deleteMany", params)
  return DeleteResult.fromJson(response)

# ---------------------------------------------------------
# Aggregation
# ---------------------------------------------------------

proc aggregate*(coll: MongoCollection, pipeline: seq[JsonNode]): Future[Cursor] {.async.} =
  ## Execute an aggregation pipeline
  let params = %*{
    "collection": coll.name,
    "pipeline": pipeline
  }

  let response = await rpcCall(coll.config, "mongo.aggregate", params)

  var docs: seq[JsonNode] = @[]
  if response.hasKey("documents"):
    for doc in response["documents"]:
      docs.add(doc)

  return newCursor(docs)

# ---------------------------------------------------------
# Distinct
# ---------------------------------------------------------

proc distinct*(coll: MongoCollection, field: string, filter: JsonNode = nil): Future[seq[JsonNode]] {.async.} =
  ## Get distinct values for a field
  let params = %*{
    "collection": coll.name,
    "field": field,
    "filter": if filter.isNil: newJObject() else: filter
  }

  let response = await rpcCall(coll.config, "mongo.distinct", params)

  result = @[]
  if response.hasKey("values"):
    for val in response["values"]:
      result.add(val)

# ---------------------------------------------------------
# Indexes
# ---------------------------------------------------------

proc createIndex*(coll: MongoCollection, keys: JsonNode, options: JsonNode = nil): Future[string] {.async.} =
  ## Create an index
  let params = %*{
    "collection": coll.name,
    "keys": keys,
    "options": if options.isNil: newJObject() else: options
  }

  let response = await rpcCall(coll.config, "mongo.createIndex", params)
  return response.getOrDefault("indexName").getStr("")

proc dropIndex*(coll: MongoCollection, indexName: string): Future[void] {.async.} =
  ## Drop an index by name
  let params = %*{
    "collection": coll.name,
    "indexName": indexName
  }

  discard await rpcCall(coll.config, "mongo.dropIndex", params)

proc listIndexes*(coll: MongoCollection): Future[seq[JsonNode]] {.async.} =
  ## List all indexes on the collection
  let params = %*{"collection": coll.name}
  let response = await rpcCall(coll.config, "mongo.listIndexes", params)

  result = @[]
  if response.hasKey("indexes"):
    for idx in response["indexes"]:
      result.add(idx)

# ---------------------------------------------------------
# Watch (Change Streams)
# ---------------------------------------------------------

iterator watch*(coll: MongoCollection, pipeline: seq[JsonNode] = @[]): JsonNode =
  ## Watch for changes on the collection
  ## Note: Real implementation would use WebSocket
  discard

# ---------------------------------------------------------
# Drop
# ---------------------------------------------------------

proc drop*(coll: MongoCollection): Future[void] {.async.} =
  ## Drop the collection
  let params = %*{"collection": coll.name}
  discard await rpcCall(coll.config, "mongo.dropCollection", params)

# ---------------------------------------------------------
# Typed Collection Methods
# ---------------------------------------------------------

proc find*[T](tc: TypedCollection[T], filter: JsonNode = nil, options: JsonNode = nil): Future[seq[T]] {.async.} =
  ## Find documents and parse as type T
  let cursor = await tc.collection.find(filter, options)
  result = @[]
  for doc in cursor:
    result.add(to(doc, T))

proc findOne*[T](tc: TypedCollection[T], filter: JsonNode = nil): Future[Option[T]] {.async.} =
  ## Find one document and parse as type T
  let doc = await tc.collection.findOne(filter)
  if doc.isSome:
    return some(to(doc.get, T))
  return none(T)

proc insertOne*[T](tc: TypedCollection[T], document: T): Future[InsertOneResult] {.async.} =
  ## Insert a typed document
  return await tc.collection.insertOne(%document)

proc insertMany*[T](tc: TypedCollection[T], documents: seq[T]): Future[InsertManyResult] {.async.} =
  ## Insert multiple typed documents
  let docs = documents.mapIt(%it)
  return await tc.collection.insertMany(docs)
