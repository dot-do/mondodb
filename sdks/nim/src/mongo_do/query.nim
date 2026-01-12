## MongoDB natural language query for the .do platform

import std/[json, options, asyncdispatch, httpclient, strutils, random]
import ./errors
import ./config
import ./cursor
import ./results

type
  MongoQuery*[T] = ref object
    queryString*: string
    config*: MongoConfig
    transaction*: pointer  # Transaction reference (forward declared)
    limitN*: int
    skipN*: int
    sortField*: string
    sortDirection*: int
    highlightEnabled*: bool
    fuzzyEnabled*: bool
    atomicEnabled*: bool

proc newMongoQuery*[T](queryString: string, config: MongoConfig, tx: pointer = nil): MongoQuery[T] =
  MongoQuery[T](
    queryString: queryString,
    config: config,
    transaction: tx,
    limitN: 0,
    skipN: 0,
    sortDirection: 1,
    highlightEnabled: false,
    fuzzyEnabled: false,
    atomicEnabled: false
  )

proc newMongoQuery*(queryString: string, config: MongoConfig, tx: pointer = nil): MongoQuery[JsonNode] =
  newMongoQuery[JsonNode](queryString, config, tx)

# Query modifiers

proc limit*[T](q: MongoQuery[T], n: int): MongoQuery[T] =
  ## Limit the number of results
  q.limitN = n
  result = q

proc skip*[T](q: MongoQuery[T], n: int): MongoQuery[T] =
  ## Skip n results
  q.skipN = n
  result = q

proc sort*[T](q: MongoQuery[T], field: string, direction: int = 1): MongoQuery[T] =
  ## Sort by field
  q.sortField = field
  q.sortDirection = direction
  result = q

proc highlight*[T](q: MongoQuery[T]): MongoQuery[T] =
  ## Enable highlighting for text search
  q.highlightEnabled = true
  result = q

proc fuzzy*[T](q: MongoQuery[T]): MongoQuery[T] =
  ## Enable fuzzy matching
  q.fuzzyEnabled = true
  result = q

proc atomic*[T](q: MongoQuery[T]): MongoQuery[T] =
  ## Execute atomically (transaction)
  q.atomicEnabled = true
  result = q

# RPC call helper

proc rpcCall*(config: MongoConfig, methodName: string, params: JsonNode): Future[JsonNode] {.async.} =
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
    of "VALIDATION_ERROR":
      raise newValidationError(message)
    else:
      raise newQueryError(message, none(string), code)

  return json.getOrDefault("result")

# Execution methods

proc await*[T](q: MongoQuery[T]): Future[T] {.async.} =
  ## Execute the query and await results
  let params = %*{
    "query": q.queryString,
    "options": {
      "limit": q.limitN,
      "skip": q.skipN,
      "highlight": q.highlightEnabled,
      "fuzzy": q.fuzzyEnabled,
      "atomic": q.atomicEnabled
    }
  }

  if q.sortField.len > 0:
    params["options"]["sort"] = %*{q.sortField: q.sortDirection}

  let response = await rpcCall(q.config, "mongo.nlQuery", params)

  when T is JsonNode:
    return response
  else:
    return to(response, T)

proc asyncRun*[T](q: MongoQuery[T]): Future[T] =
  ## Alias for await
  q.await()

proc tryAwait*[T](q: MongoQuery[T]): Future[Result[T]] {.async.} =
  ## Execute query with Result type for error handling
  try:
    let value = await q.await()
    return ok[T](value)
  except CatchableError as e:
    return err[T]((ref CatchableError)(e))

# Transformations (server-side)

proc map*[T, R](q: MongoQuery[T], mapper: proc(x: T): R): MongoQuery[R] =
  ## Map results through a transformation
  ## In production, this sends the mapper expression to the server
  result = MongoQuery[R](
    queryString: q.queryString,
    config: q.config,
    transaction: q.transaction,
    limitN: q.limitN,
    skipN: q.skipN,
    sortField: q.sortField,
    sortDirection: q.sortDirection
  )

proc filter*[T](q: MongoQuery[T], predicate: proc(x: T): bool): MongoQuery[T] =
  ## Filter results
  result = q

proc reduce*[T, R](q: MongoQuery[T], initial: R, reducer: proc(acc: R, x: T): R): MongoQuery[R] =
  ## Reduce results
  result = MongoQuery[R](
    queryString: q.queryString,
    config: q.config,
    transaction: q.transaction
  )

# Iterator for sync usage

iterator items*[T](q: MongoQuery[T]): T =
  ## Iterate over query results (blocking)
  let fut = q.await()
  let results = waitFor fut

  when T is JsonNode:
    if results.kind == JArray:
      for item in results:
        yield item
    else:
      yield results

# Watch for changes

iterator watch*[T](q: MongoQuery[T]): JsonNode =
  ## Watch for changes (for change streams)
  ## Note: This is a placeholder - real implementation would use WebSocket
  discard

# Operations on query results

proc debit*[T](q: MongoQuery[T], amount: float): MongoQuery[T] =
  ## Debit amount (for transaction-style queries)
  result = q

proc credit*[T](q: MongoQuery[T], amount: float): MongoQuery[T] =
  ## Credit amount (for transaction-style queries)
  result = q
