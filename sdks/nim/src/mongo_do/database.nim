## MongoDB database for the .do platform

import std/[json, options, asyncdispatch, tables]
import ./errors
import ./config
import ./collection
import ./query

type
  MongoDatabase* = ref object
    client*: pointer  # Forward reference to MongoClient
    name*: string
    config*: MongoConfig
    collections: Table[string, MongoCollection]

# Forward declare for RPC call
proc rpcCall*(config: MongoConfig, methodName: string, params: JsonNode): Future[JsonNode] {.async, importc.}

proc newMongoDatabase*(client: pointer, name: string, config: MongoConfig): MongoDatabase =
  MongoDatabase(
    client: client,
    name: name,
    config: config,
    collections: initTable[string, MongoCollection]()
  )

# ---------------------------------------------------------
# Collection Access
# ---------------------------------------------------------

proc collection*(db: MongoDatabase, name: string): MongoCollection =
  ## Get a collection by name
  if not db.collections.hasKey(name):
    db.collections[name] = newMongoCollection(cast[pointer](db), name, db.config)
  return db.collections[name]

proc `[]`*(db: MongoDatabase, name: string): MongoCollection =
  ## Get a collection using subscript notation
  db.collection(name)

proc typedCollection*[T](db: MongoDatabase, t: typedesc[T], name: string): TypedCollection[T] =
  ## Get a typed collection
  newTypedCollection[T](db.collection(name))

# ---------------------------------------------------------
# Database Operations
# ---------------------------------------------------------

proc listCollectionNames*(db: MongoDatabase): Future[seq[string]] {.async.} =
  ## List all collection names in the database
  let params = %*{"database": db.name}
  let response = await rpcCall(db.config, "mongo.listCollections", params)

  result = @[]
  if response.hasKey("collections"):
    for coll in response["collections"]:
      result.add(coll.getStr())

proc listCollections*(db: MongoDatabase): Future[seq[JsonNode]] {.async.} =
  ## List all collections with metadata
  let params = %*{"database": db.name, "includeStats": true}
  let response = await rpcCall(db.config, "mongo.listCollections", params)

  result = @[]
  if response.hasKey("collections"):
    for coll in response["collections"]:
      result.add(coll)

proc createCollection*(db: MongoDatabase, name: string, options: JsonNode = nil): Future[MongoCollection] {.async.} =
  ## Create a new collection
  let params = %*{
    "database": db.name,
    "collection": name,
    "options": if options.isNil: newJObject() else: options
  }

  discard await rpcCall(db.config, "mongo.createCollection", params)
  return db.collection(name)

proc dropCollection*(db: MongoDatabase, name: string): Future[void] {.async.} =
  ## Drop a collection
  let params = %*{
    "database": db.name,
    "collection": name
  }

  discard await rpcCall(db.config, "mongo.dropCollection", params)
  db.collections.del(name)

# ---------------------------------------------------------
# Database Commands
# ---------------------------------------------------------

proc runCommand*(db: MongoDatabase, command: JsonNode): Future[JsonNode] {.async.} =
  ## Run a database command
  let params = %*{
    "database": db.name,
    "command": command
  }

  return await rpcCall(db.config, "mongo.runCommand", params)

proc stats*(db: MongoDatabase): Future[JsonNode] {.async.} =
  ## Get database statistics
  return await db.runCommand(%*{"dbStats": 1})

# ---------------------------------------------------------
# Aggregation
# ---------------------------------------------------------

proc aggregate*(db: MongoDatabase, pipeline: seq[JsonNode]): Future[seq[JsonNode]] {.async.} =
  ## Run an aggregation pipeline on the database (admin pipeline)
  let params = %*{
    "database": db.name,
    "pipeline": pipeline
  }

  let response = await rpcCall(db.config, "mongo.aggregate", params)

  result = @[]
  if response.hasKey("documents"):
    for doc in response["documents"]:
      result.add(doc)

# ---------------------------------------------------------
# Watch (Change Streams)
# ---------------------------------------------------------

iterator watch*(db: MongoDatabase, pipeline: seq[JsonNode] = @[]): JsonNode =
  ## Watch for changes on the database
  ## Note: Real implementation would use WebSocket
  discard

# ---------------------------------------------------------
# Drop Database
# ---------------------------------------------------------

proc drop*(db: MongoDatabase): Future[void] {.async.} =
  ## Drop the database
  let params = %*{"database": db.name}
  discard await rpcCall(db.config, "mongo.dropDatabase", params)
