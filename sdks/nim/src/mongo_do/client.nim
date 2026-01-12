## MongoDB client for the .do platform

import std/[json, options, asyncdispatch, httpclient, tables, strutils, uri, random]
import ./errors
import ./config
import ./database

type
  MongoClient* = ref object
    uri*: string
    config*: MongoConfig
    databases: Table[string, MongoDatabase]
    httpClient: HttpClient
    connected: bool

proc normalizeUri(uri: string): string =
  ## Normalize URI to HTTP(S)
  let parsed = parseUri(uri)

  case parsed.scheme
  of "mongodb", "mongodb+srv":
    # Convert MongoDB URI to HTTPS
    var port = ""
    if parsed.port.len > 0:
      port = ":" & parsed.port
    return "https://" & parsed.hostname & port
  of "http", "https":
    return uri
  of "ws":
    var port = ""
    if parsed.port.len > 0:
      port = ":" & parsed.port
    return "http://" & parsed.hostname & port
  of "wss":
    var port = ""
    if parsed.port.len > 0:
      port = ":" & parsed.port
    return "https://" & parsed.hostname & port
  of "":
    # Assume HTTPS if no scheme
    return "https://" & uri
  else:
    raise newInvalidURIError("Unsupported scheme: " & parsed.scheme)

proc newMongoClient*(uri: string, config: MongoConfig = nil): MongoClient =
  ## Create a new MongoDB client
  let normalizedUri = normalizeUri(uri)
  let cfg = if config.isNil: newMongoConfig(normalizedUri) else: config
  cfg.uri = normalizedUri

  MongoClient(
    uri: normalizedUri,
    config: cfg,
    databases: initTable[string, MongoDatabase](),
    httpClient: newHttpClient(),
    connected: true
  )

proc newMongoClient*(config: MongoConfig): MongoClient =
  ## Create a client from configuration
  newMongoClient(config.uri, config)

proc newMongoClient*(): MongoClient =
  ## Create a client from environment
  let config = newMongoConfig()
  newMongoClient(config.uri, config)

# ---------------------------------------------------------
# Database Access
# ---------------------------------------------------------

proc database*(client: MongoClient, name: string): MongoDatabase =
  ## Get a database by name
  if not client.databases.hasKey(name):
    client.databases[name] = newMongoDatabase(cast[pointer](client), name, client.config)
  return client.databases[name]

proc `[]`*(client: MongoClient, name: string): MongoDatabase =
  ## Get a database using subscript notation
  client.database(name)

proc getDatabase*(client: MongoClient, name: string): MongoDatabase =
  ## Alias for database
  client.database(name)

# ---------------------------------------------------------
# RPC Call Implementation
# ---------------------------------------------------------

proc rpcCall*(client: MongoClient, methodName: string, params: JsonNode): Future[JsonNode] {.async.} =
  ## Make an RPC call to the server
  if not client.connected:
    raise newConnectionError("Client is not connected", client.uri)

  let body = %*{
    "jsonrpc": "2.0",
    "method": methodName,
    "params": params,
    "id": $rand(high(int))
  }

  let response = client.httpClient.request(
    client.uri & "/rpc",
    httpMethod = HttpPost,
    headers = client.config.headers,
    body = $body
  )

  if response.code != Http200:
    case response.code
    of Http401, Http403:
      raise newAuthenticationError("Authentication failed: " & $response.code)
    of Http404:
      raise newConnectionError("Endpoint not found", client.uri)
    of Http408, Http504:
      raise newTimeoutError("Request timed out")
    else:
      raise newConnectionError("Server error: " & $response.code, client.uri)

  let json = parseJson(response.body)

  if json.hasKey("error"):
    let error = json["error"]
    let code = error.getOrDefault("code").getStr("UNKNOWN")
    let message = error.getOrDefault("message").getStr("Unknown error")
    let data = if error.hasKey("data"): some(error["data"]) else: none(JsonNode)

    case code
    of "11000":
      raise newDuplicateKeyError(message, data)
    of "-32600":
      raise newValidationError("Invalid request: " & message)
    of "-32601":
      raise newQueryError("Method not found: " & message)
    of "-32602":
      raise newValidationError("Invalid params: " & message)
    of "-32603":
      raise newMongoError("INTERNAL_ERROR", "Internal error: " & message)
    else:
      let suggestion = if data.isSome:
        data.get.getOrDefault("suggestion").getStr("")
      else:
        ""
      if suggestion.len > 0:
        raise newQueryError(message, some(suggestion), code)
      else:
        raise newQueryError(message, none(string), code)

  return json.getOrDefault("result")

# Global rpcCall for other modules
proc rpcCall*(config: MongoConfig, methodName: string, params: JsonNode): Future[JsonNode] {.async.} =
  ## Make an RPC call using config (creates temporary client)
  let client = newHttpClient()
  defer: client.close()

  let body = %*{
    "jsonrpc": "2.0",
    "method": methodName,
    "params": params,
    "id": $rand(high(int))
  }

  let response = client.request(
    config.uri & "/rpc",
    httpMethod = HttpPost,
    headers = config.headers,
    body = $body
  )

  if response.code != Http200:
    case response.code
    of Http401, Http403:
      raise newAuthenticationError("Authentication failed: " & $response.code)
    of Http404:
      raise newConnectionError("Endpoint not found", config.uri)
    of Http408, Http504:
      raise newTimeoutError("Request timed out")
    else:
      raise newConnectionError("Server error: " & $response.code, config.uri)

  let json = parseJson(response.body)

  if json.hasKey("error"):
    let error = json["error"]
    let code = error.getOrDefault("code").getStr("UNKNOWN")
    let message = error.getOrDefault("message").getStr("Unknown error")

    case code
    of "11000":
      raise newDuplicateKeyError(message)
    else:
      raise newQueryError(message, none(string), code)

  return json.getOrDefault("result")

# ---------------------------------------------------------
# Client Operations
# ---------------------------------------------------------

proc listDatabaseNames*(client: MongoClient): Future[seq[string]] {.async.} =
  ## List all database names
  let response = await client.rpcCall("mongo.listDatabases", %*{})

  result = @[]
  if response.hasKey("databases"):
    for db in response["databases"]:
      if db.kind == JString:
        result.add(db.getStr())
      elif db.hasKey("name"):
        result.add(db["name"].getStr())

proc listDatabases*(client: MongoClient): Future[seq[JsonNode]] {.async.} =
  ## List all databases with metadata
  let response = await client.rpcCall("mongo.listDatabases", %*{"includeStats": true})

  result = @[]
  if response.hasKey("databases"):
    for db in response["databases"]:
      result.add(db)

proc ping*(client: MongoClient): Future[bool] {.async.} =
  ## Ping the server
  try:
    let response = await client.rpcCall("mongo.ping", %*{})
    return response.getOrDefault("ok").getInt(0) == 1
  except CatchableError:
    return false

proc connected*(client: MongoClient): bool =
  ## Check if connected
  client.connected

proc close*(client: MongoClient) =
  ## Close the client
  client.httpClient.close()
  client.connected = false

# ---------------------------------------------------------
# Session and Transaction Support
# ---------------------------------------------------------

type
  ClientSession* = ref object
    client*: MongoClient
    sessionId: string

proc startSession*(client: MongoClient): ClientSession =
  ## Start a new session
  ClientSession(
    client: client,
    sessionId: $rand(high(int))
  )

proc endSession*(session: ClientSession) =
  ## End the session
  discard

proc withTransaction*[T](session: ClientSession, body: proc(): T): T =
  ## Run a function within a transaction
  try:
    result = body()
  except CatchableError as e:
    raise newTransactionError("Transaction failed: " & e.msg)

# ---------------------------------------------------------
# Admin Commands
# ---------------------------------------------------------

proc adminCommand*(client: MongoClient, command: JsonNode): Future[JsonNode] {.async.} =
  ## Run a command on the admin database
  return await client.database("admin").runCommand(command)

# ---------------------------------------------------------
# Context Manager Pattern
# ---------------------------------------------------------

template withMongoClient*(uri: string, body: untyped): untyped =
  ## Context manager for client connection
  ##
  ## Example:
  ## ```nim
  ## withMongoClient("https://db.example.com"):
  ##   let db = client.database("myapp")
  ##   let users = db.collection("users")
  ##   echo await users.countDocuments()
  ## ```
  block:
    let client {.inject.} = newMongoClient(uri)
    try:
      body
    finally:
      client.close()

# ---------------------------------------------------------
# Module-level Helpers
# ---------------------------------------------------------

proc connect*(uri: string, apiKey: string = ""): MongoClient =
  ## Connect to MongoDB
  let config = if apiKey.len > 0:
    newMongoConfig(uri, apiKey)
  else:
    newMongoConfig(uri)
  newMongoClient(config)

proc connect*(): MongoClient =
  ## Connect using environment configuration
  newMongoClient()
