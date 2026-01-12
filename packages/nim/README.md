# dotdomongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```nim
import dotdomongo

let users = mongo"users who haven't logged in this month"
let vips = mongo"customers with orders over $1000"
```

One import. Natural language queries. Zero infrastructure.

---

## Why dotdomongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **Nim MongoDB driver compatible** - Drop-in replacement for existing MongoDB Nim libraries
- **Nim-native** - Templates, macros, and zero-cost abstractions
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Compile-time safety** - Catch errors at compile time, not runtime

```nim
# Three dependent operations, ONE network round trip:
let result = mongo"customers in Texas"
  .map(c => mongo"orders for {c}")
  .map(o => mongo"total revenue from {o}")
```

---

## Installation

### Nimble

```bash
nimble install dotdomongo
```

Or add to your `.nimble` file:

```nim
requires "dotdomongo >= 0.1.0"
```

Requires Nim 2.0+.

---

## Quick Start

### Natural Language API

```nim
import dotdomongo

# Query in plain English
let inactive = mongo"users who haven't logged in this month"
let vips = mongo"customers with orders over $1000"
let trending = mongo"most popular products this week"

# Chain like sentences
let result = mongo"users in Austin"
  .map(user => mongo"recent orders for {user}")
  .map(orders => mongo"shipping status for {orders}")

# Search semantically
let tutorials = mongo"tutorials similar to machine learning"
  .limit(10)
```

### MongoDB Compatible API

```nim
import dotdomongo

let client = newMongoClient("https://your-worker.workers.dev")
let db = client.database("myapp")
let users = db.collection("users")

# Standard MongoDB operations
discard users.insertOne(%*{
  "name": "Alice",
  "email": "alice@example.com"
})

let user = users.findOne(%*{"email": "alice@example.com"})
```

---

## Natural Language Queries

The mongo string prefix translates natural language to optimized queries:

```nim
# CRUD Operations
let alice = mongo"user alice@example.com"
let active = mongo"active users in Austin"
let vips = mongo"users with 10+ orders"

# AI infers what you need
discard mongo"alice@example.com"              # returns user
discard mongo"orders for alice@example.com"   # returns orders
discard mongo"alice order history"            # returns full timeline

# Aggregation
let revenue = mongo"revenue by category this month"
let growth = mongo"user growth rate last 6 months"
let top = mongo"top 10 customers by lifetime value"
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```nim
# Build the pipeline - nothing sent yet
let users = mongo"active users"
let orders = users.map(u => mongo"pending orders for {u.id}")
let totals = orders.map(o => o["total"])

# NOW we send everything - one round trip
let result = totals.await()

# Parallel fan-out with async
import std/asyncdispatch

proc fetchAll(): Future[tuple[users, orders, products: JsonNode]] {.async.} =
  let
    usersFut = mongo"active users".asyncRun()
    ordersFut = mongo"pending orders".asyncRun()
    productsFut = mongo"low stock products".asyncRun()

  result = (
    users: await usersFut,
    orders: await ordersFut,
    products: await productsFut
  )
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```nim
# Semantic search in plain English
let similar = mongo"tutorials similar to machine learning".limit(10).await()
let related = mongo"products like this hiking backpack".await()
let answers = mongo"documents about serverless architecture".await()

# Embeddings are automatic
discard mongo"index products for semantic search".await()
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```nim
let results = mongo"serverless database in title and content".highlight().await()
let fuzzy = mongo"""find articles matching "kubernets"""".fuzzy().await()
let scored = mongo"""search "edge computing" with relevance scores""".await()
```

---

## Real-Time Changes

Watch for database changes with iterators:

```nim
for change in mongo"watch orders for changes":
  case change["operationType"].getStr
  of "insert":
    notify(change["fullDocument"]["customer"])
  of "update":
    updateDashboard(change["fullDocument"])
  else:
    discard

# Or query changes directly
let recent = mongo"changes to products in last hour".await()
```

---

## Transactions

Atomic operations with natural language:

```nim
discard mongo"""
  transfer $100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer
""".atomic().await()

# Or chain with transactions
transaction:
  query("alice account").debit(100)
  query("bob account").credit(100)
```

---

## Type-Safe Documents

Use Nim objects for strongly-typed documents:

```nim
import dotdomongo
import std/[json, times]

type
  User = object
    id {.bsonId.}: string
    name: string
    email: string
    createdAt: DateTime

let client = newMongoClient("https://db.example.com")
let db = client.database("myapp")
let users = db.typedCollection(User, "users")

# Type-safe operations
let user: Option[User] = users.findOne(%*{"email": "alice@example.com"})

discard users.insertOne(User(
  name: "Bob",
  email: "bob@example.com",
  createdAt: now()
))
```

---

## Templates and Macros

```nim
import dotdomongo

# Use templates for reusable queries
template activeUsers(): MongoQuery =
  mongo"users where status = 'active'"

template usersByCountry(country: string): MongoQuery =
  mongo"users in {country}"

let usActive = activeUsers()
let ukUsers = usersByCountry("UK")

# Macro for compile-time query validation
macro validateQuery(q: static[string]): untyped =
  # Validate query syntax at compile time
  let validated = validateMongoQuery(q)
  if not validated.isValid:
    error validated.message
  result = newCall(bindSym"mongo", newLit(q))
```

---

## Error Handling

```nim
import dotdomongo

try:
  let result = mongo"complex query here".await()
  echo "Result: ", result
except QueryError as e:
  echo "Query failed: ", e.message
  if e.suggestion.isSome:
    echo "Suggestion: ", e.suggestion.get
except ConnectionError as e:
  echo "Connection lost: ", e.message

# Or with Option/Result types
let result = mongo"complex query here".tryAwait()
case result.kind
of rkOk:
  echo "Success: ", result.value
of rkError:
  echo "Error: ", result.error
```

---

## Configuration

```nim
import dotdomongo

configureMongo:
  name = "my-database"
  domain = "db.myapp.com"

  # Enable features
  vector = true           # Vector search with Vectorize
  fulltext = true         # FTS5 text search
  analytics = true        # OLAP with ClickHouse

  # Storage tiers
  storage:
    hot = "sqlite"        # Recent data, fast queries
    warm = "r2"           # Historical data
    cold = "archive"      # Long-term retention
```

---

## API Reference

### String Prefix

```nim
# Natural language query prefix
mongo"query string"  # => MongoQuery
```

### Client

```nim
proc newMongoClient(uri: string): MongoClient

proc database(client: MongoClient, name: string): MongoDatabase

proc close(client: MongoClient)

proc collection(db: MongoDatabase, name: string): MongoCollection

proc typedCollection[T](db: MongoDatabase, t: typedesc[T], name: string): TypedCollection[T]

proc find(coll: MongoCollection, filter: JsonNode = nil): Cursor

proc findOne(coll: MongoCollection, filter: JsonNode = nil): Option[JsonNode]

proc insertOne(coll: MongoCollection, document: JsonNode): InsertOneResult

proc insertMany(coll: MongoCollection, documents: seq[JsonNode]): InsertManyResult

proc updateOne(coll: MongoCollection, filter, update: JsonNode): UpdateResult

proc updateMany(coll: MongoCollection, filter, update: JsonNode): UpdateResult

proc deleteOne(coll: MongoCollection, filter: JsonNode): DeleteResult

proc deleteMany(coll: MongoCollection, filter: JsonNode): DeleteResult

proc aggregate(coll: MongoCollection, pipeline: seq[JsonNode]): Cursor
```

### MongoQuery

```nim
type MongoQuery[T] = ref object

proc limit[T](q: MongoQuery[T], n: int): MongoQuery[T]

proc skip[T](q: MongoQuery[T], n: int): MongoQuery[T]

proc sort[T](q: MongoQuery[T], field: string, direction: SortDirection = Ascending): MongoQuery[T]

proc highlight[T](q: MongoQuery[T]): MongoQuery[T]

proc fuzzy[T](q: MongoQuery[T]): MongoQuery[T]

proc map[T, R](q: MongoQuery[T], fn: proc(x: T): R): MongoQuery[seq[R]]

proc filter[T](q: MongoQuery[T], fn: proc(x: T): bool): MongoQuery[seq[T]]

proc reduce[T, R](q: MongoQuery[T], initial: R, fn: proc(acc: R, x: T): R): MongoQuery[R]

proc atomic[T](q: MongoQuery[T]): MongoQuery[T]

proc await[T](q: MongoQuery[T]): T

proc asyncRun[T](q: MongoQuery[T]): Future[T]

proc tryAwait[T](q: MongoQuery[T]): Result[T, MongoError]

iterator items[T](q: MongoQuery[T]): T
```

---

## Complete Example

```nim
import dotdomongo
import std/[json, times, options]

type
  User = object
    id: string
    name: string
    email: string
    createdAt: DateTime

proc main() =
  # Natural language queries
  echo "=== Natural Language API ==="

  let inactive = mongo"users who haven't logged in this month".await()
  echo "Found ", inactive.len, " inactive users"

  let revenue = mongo"total revenue by category this quarter".await()
  echo "Revenue by category: ", revenue

  # MongoDB compatible API
  echo "\n=== MongoDB Compatible API ==="

  let client = newMongoClient("https://db.example.com")
  defer: client.close()

  let db = client.database("myapp")
  let users = db.collection("users")

  # Insert
  discard users.insertOne(%*{
    "name": "Alice",
    "email": "alice@example.com",
    "createdAt": $now()
  })

  # Query
  let alice = users.findOne(%*{"email": "alice@example.com"})
  if alice.isSome:
    echo "Found user: ", alice.get["name"]
  else:
    echo "User not found"

  # Aggregation
  var count = 0
  for doc in users.aggregate(@[
    %*{"$group": {"_id": nil, "total": {"$sum": 1}}}
  ]):
    count = doc["total"].getInt

  echo "Total users: ", count

  # Pipelining
  echo "\n=== Promise Pipelining ==="

  let result = mongo"active customers"
    .map(c => mongo"orders for {c}")
    .map(o => mongo"calculate total from {o}")
    .await()
  echo "Totals: ", result

when isMainModule:
  main()
```

---

## License

MIT
