## MongoDB SDK for the .do platform
## Natural Language First, AI-Native
##
## Example usage:
## ```nim
## import mongo_do
##
## # Natural language queries
## let users = mongo"users who haven't logged in this month"
## let vips = mongo"customers with orders over $1000"
##
## # MongoDB compatible API
## let client = newMongoClient("https://db.example.com")
## let db = client.database("myapp")
## let coll = db.collection("users")
##
## let alice = coll.findOne(%*{"email": "alice@example.com"})
## ```

import std/[asyncdispatch, json, tables, options, strutils, sequtils, locks, times, uri, httpclient, random]

import ./mongo_do/errors
import ./mongo_do/config
import ./mongo_do/cursor
import ./mongo_do/results
import ./mongo_do/query
import ./mongo_do/collection
import ./mongo_do/database
import ./mongo_do/client

export errors, config, cursor, results, query, collection, database, client
export asyncdispatch, json, options, tables, times

const Version* = "0.1.0"

# Global configuration
var globalConfig {.threadvar.}: MongoConfig

proc getGlobalConfig*(): MongoConfig =
  if globalConfig.isNil:
    globalConfig = newMongoConfig()
  result = globalConfig

proc configure*(config: MongoConfig) =
  ## Set global configuration
  globalConfig = config

# ---------------------------------------------------------
# Natural Language Query Macro
# ---------------------------------------------------------

template mongo*(queryString: static[string]): MongoQuery =
  ## Natural language query prefix
  ##
  ## Example:
  ## ```nim
  ## let inactive = mongo"users who haven't logged in this month"
  ## let vips = mongo"customers with orders over $1000"
  ## ```
  newMongoQuery(queryString, getGlobalConfig())

template mongo*(queryString: string): MongoQuery =
  ## Natural language query (runtime string)
  newMongoQuery(queryString, getGlobalConfig())

# ---------------------------------------------------------
# Transaction Support
# ---------------------------------------------------------

type
  Transaction* = ref object
    config*: MongoConfig
    operations: seq[JsonNode]
    committed: bool

proc newTransaction*(config: MongoConfig = nil): Transaction =
  Transaction(
    config: if config.isNil: getGlobalConfig() else: config,
    operations: @[],
    committed: false
  )

proc query*(tx: Transaction, queryString: string): MongoQuery =
  ## Execute a query within a transaction
  newMongoQuery(queryString, tx.config, tx)

proc addOperation*(tx: Transaction, op: JsonNode) =
  if not tx.committed:
    tx.operations.add(op)

proc commit*(tx: Transaction) =
  ## Commit the transaction
  if tx.committed:
    return
  # In real implementation, send operations atomically
  tx.committed = true

proc rollback*(tx: Transaction) =
  ## Rollback the transaction
  tx.operations = @[]
  tx.committed = true

template transaction*(body: untyped): untyped =
  ## Execute operations in a transaction
  ##
  ## Example:
  ## ```nim
  ## transaction:
  ##   query("alice account").debit(100)
  ##   query("bob account").credit(100)
  ## ```
  block:
    let tx {.inject.} = newTransaction()
    try:
      body
      tx.commit()
    except CatchableError as e:
      tx.rollback()
      raise e
