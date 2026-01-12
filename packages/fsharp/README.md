# DotDo.Mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```fsharp
open DotDo.Mongo

let users = mongo "users who haven't logged in this month"
let vips = mongo "customers with orders over $1000"
```

One open. Natural language queries. Zero infrastructure.

---

## Why DotDo.Mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **MongoDB.Driver compatible** - Drop-in replacement for the official MongoDB F# driver
- **F#-native** - Pipelines, computation expressions, discriminated unions
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Type providers** - Optional type provider for schema-aware queries

```fsharp
// Three dependent operations, ONE network round trip:
let result =
    mongo "customers in Texas"
    |> Query.map (fun c -> mongo $"orders for {c}")
    |> Query.map (fun o -> mongo $"total revenue from {o}")
    |> Query.run
```

---

## Installation

### NuGet

```bash
dotnet add package DotDo.Mongo
```

### Paket

```
nuget DotDo.Mongo
```

Requires .NET 8.0+ and F# 8.0+.

---

## Quick Start

### Natural Language API

```fsharp
open DotDo.Mongo

// Query in plain English
let inactive = mongo "users who haven't logged in this month"
let vips = mongo "customers with orders over $1000"
let trending = mongo "most popular products this week"

// Chain with pipelines
let result =
    mongo "users in Austin"
    |> Query.map (fun user -> mongo $"recent orders for {user}")
    |> Query.map (fun orders -> mongo $"shipping status for {orders}")
    |> Query.run

// Search semantically
let tutorials =
    mongo "tutorials similar to machine learning"
    |> Query.limit 10
    |> Query.run
```

### MongoDB Compatible API

```fsharp
open DotDo.Mongo
open MongoDB.Bson

let client = MongoClient "https://your-worker.workers.dev"
let db = client.GetDatabase "myapp"
let users = db.GetCollection<User> "users"

// Standard MongoDB operations
users.InsertOne { Name = "Alice"; Email = "alice@example.com" }

let user = users.Find(fun u -> u.Email = "alice@example.com").FirstOrDefault()
```

---

## Natural Language Queries

The mongo function translates natural language to optimized queries:

```fsharp
// CRUD Operations
let alice = mongo "user alice@example.com"
let active = mongo "active users in Austin"
let vips = mongo "users with 10+ orders"

// AI infers what you need
mongo "alice@example.com"              // returns user
mongo "orders for alice@example.com"   // returns orders
mongo "alice order history"            // returns full timeline

// Aggregation
let revenue = mongo "revenue by category this month"
let growth = mongo "user growth rate last 6 months"
let top = mongo "top 10 customers by lifetime value"
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```fsharp
// Build the pipeline - nothing sent yet
let users = mongo "active users"
let orders = users |> Query.map (fun u -> mongo $"pending orders for {u.Id}")
let totals = orders |> Query.map (fun o -> o.Total)

// NOW we send everything - one round trip
let result = totals |> Query.run

// Parallel fan-out with Async.Parallel
let! results =
    [| mongo "active users" |> Query.runAsync
       mongo "pending orders" |> Query.runAsync
       mongo "low stock products" |> Query.runAsync |]
    |> Async.Parallel

let [| users; orders; products |] = results
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```fsharp
// Semantic search in plain English
let similar = mongo "tutorials similar to machine learning" |> Query.limit 10 |> Query.run
let related = mongo "products like this hiking backpack" |> Query.run
let answers = mongo "documents about serverless architecture" |> Query.run

// Embeddings are automatic
mongo "index products for semantic search" |> Query.run
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```fsharp
let results = mongo "serverless database in title and content" |> Query.highlight |> Query.run
let fuzzy = mongo """find articles matching "kubernets" """ |> Query.fuzzy |> Query.run
let scored = mongo """search "edge computing" with relevance scores""" |> Query.run
```

---

## Real-Time Changes

Watch for database changes with IAsyncEnumerable:

```fsharp
// With AsyncSeq
mongo "watch orders for changes"
|> Query.toAsyncSeq
|> AsyncSeq.iter (fun change ->
    match change.OperationType with
    | "insert" -> notify change.FullDocument.Customer
    | "update" -> updateDashboard change.FullDocument
    | _ -> ())

// Or query changes directly
let recent = mongo "changes to products in last hour" |> Query.run
```

---

## Transactions

Atomic operations with natural language:

```fsharp
mongo """
    transfer $100 from alice to bob:
    - subtract from alice balance
    - add to bob balance
    - log the transfer
"""
|> Query.atomic
|> Query.run

// Or chain with computation expression
transaction {
    do! query "alice account" |> debit 100
    do! query "bob account" |> credit 100
}
```

---

## Type-Safe Documents

Use F# records for strongly-typed documents:

```fsharp
open DotDo.Mongo
open MongoDB.Bson
open System

[<CLIMutable>]
type User =
    { Id: ObjectId
      Name: string
      Email: string
      CreatedAt: DateTime }

let client = MongoClient "https://db.example.com"
let db = client.GetDatabase "myapp"
let users = db.GetCollection<User> "users"

// Type-safe operations
let user = users.Find(fun u -> u.Email = "alice@example.com").FirstOrDefault()
// user is User

users.InsertOne
    { Id = ObjectId.GenerateNewId()
      Name = "Bob"
      Email = "bob@example.com"
      CreatedAt = DateTime.UtcNow }
```

---

## Computation Expressions

```fsharp
// Query computation expression
let result = query {
    from "users"
    where (fun u -> u.Age >= 18 && u.Status = "active")
    orderBy "name"
    take 10
}

// Pipeline computation expression
let enriched = pipeline {
    let! user = mongo "user alice@example.com"
    let! orders = mongo $"orders for {user.Id}"
    let! total = mongo $"calculate total from {orders}"
    return {| User = user; Orders = orders; Total = total |}
}
```

---

## Pattern Matching

```fsharp
// Pattern match on query results
match mongo "user alice@example.com" |> Query.run with
| Some { Status = "active" } as user -> processActive user
| Some { Status = "inactive" } as user -> reactivate user
| None -> createUser "alice@example.com"

// With Result type
match mongo "complex query" |> Query.tryRun with
| Ok result -> printfn "Result: %A" result
| Error (QueryError (msg, suggestion)) ->
    printfn "Query failed: %s" msg
    suggestion |> Option.iter (printfn "Suggestion: %s")
| Error (ConnectionError msg) ->
    printfn "Connection lost: %s" msg
```

---

## Error Handling

```fsharp
open DotDo.Mongo

try
    let result = mongo "complex query here" |> Query.run
    printfn "Result: %A" result
with
| :? QueryException as e ->
    printfn "Query failed: %s" e.Message
    e.Suggestion |> Option.iter (printfn "Suggestion: %s")
| :? ConnectionException as e ->
    printfn "Connection lost: %s" e.Message

// Or with Result
let result =
    mongo "complex query here"
    |> Query.tryRun
    |> Result.map (fun r -> printfn "Success: %A" r)
    |> Result.mapError (fun e -> printfn "Error: %A" e)
```

---

## Configuration

```fsharp
open DotDo.Mongo

Mongo.configure
    { Name = "my-database"
      Domain = "db.myapp.com"
      Vector = true           // Vector search with Vectorize
      Fulltext = true         // FTS5 text search
      Analytics = true        // OLAP with ClickHouse
      Storage =
          { Hot = "sqlite"    // Recent data, fast queries
            Warm = "r2"       // Historical data
            Cold = "archive" } }
```

---

## API Reference

### Functions

```fsharp
/// Execute a natural language query.
val mongo : query:string -> MongoQuery<'T>

/// Configure the client.
val configure : config:MongoConfig -> unit

/// Execute a block within a transaction.
val transaction : (TransactionContext -> Async<'T>) -> Async<'T>
```

### Client

```fsharp
type MongoClient =
    new : uri:string -> MongoClient
    member GetDatabase : name:string -> MongoDatabase
    member Close : unit -> Async<unit>

type MongoDatabase =
    member GetCollection<'T> : name:string -> MongoCollection<'T>
    member ListCollectionNames : unit -> Async<string list>
    member Drop : unit -> Async<unit>

type MongoCollection<'T> =
    member Find : filter:('T -> bool) -> FindFluent<'T>
    member FindOne : filter:('T -> bool) -> Async<'T option>
    member InsertOne : document:'T -> Async<InsertOneResult>
    member InsertMany : documents:'T seq -> Async<InsertManyResult>
    member UpdateOne : filter:('T -> bool) * update:UpdateDefinition -> Async<UpdateResult>
    member UpdateMany : filter:('T -> bool) * update:UpdateDefinition -> Async<UpdateResult>
    member DeleteOne : filter:('T -> bool) -> Async<DeleteResult>
    member DeleteMany : filter:('T -> bool) -> Async<DeleteResult>
    member Aggregate : pipeline:BsonDocument list -> Async<BsonDocument list>
```

### Query Module

```fsharp
module Query =
    /// Limit results to n documents.
    val limit : n:int -> MongoQuery<'T> -> MongoQuery<'T>

    /// Skip the first n documents.
    val skip : n:int -> MongoQuery<'T> -> MongoQuery<'T>

    /// Sort results by field.
    val sort : field:string -> direction:SortDirection -> MongoQuery<'T> -> MongoQuery<'T>

    /// Enable search result highlighting.
    val highlight : MongoQuery<'T> -> MongoQuery<'T>

    /// Enable fuzzy matching.
    val fuzzy : MongoQuery<'T> -> MongoQuery<'T>

    /// Transform results server-side.
    val map : mapper:('T -> 'R) -> MongoQuery<'T> -> MongoQuery<'R list>

    /// Filter results server-side.
    val filter : predicate:('T -> bool) -> MongoQuery<'T> -> MongoQuery<'T list>

    /// Reduce results server-side.
    val fold : folder:('State -> 'T -> 'State) -> state:'State -> MongoQuery<'T> -> MongoQuery<'State>

    /// Execute as an atomic transaction.
    val atomic : MongoQuery<'T> -> MongoQuery<'T>

    /// Run the query synchronously.
    val run : MongoQuery<'T> -> 'T

    /// Run the query asynchronously.
    val runAsync : MongoQuery<'T> -> Async<'T>

    /// Try to run the query, returning Result.
    val tryRun : MongoQuery<'T> -> Result<'T, MongoError>

    /// Convert to AsyncSeq for streaming.
    val toAsyncSeq : MongoQuery<'T> -> AsyncSeq<'T>
```

---

## Complete Example

```fsharp
open DotDo.Mongo
open MongoDB.Bson
open System

[<CLIMutable>]
type User =
    { Id: ObjectId
      Name: string
      Email: string
      CreatedAt: DateTime }

[<EntryPoint>]
let main _ =
    // Natural language queries
    printfn "=== Natural Language API ==="

    let inactive : User list = mongo "users who haven't logged in this month" |> Query.run
    printfn "Found %d inactive users" inactive.Length

    let revenue = mongo "total revenue by category this quarter" |> Query.run
    printfn "Revenue by category: %A" revenue

    // MongoDB compatible API
    printfn "\n=== MongoDB Compatible API ==="

    let client = MongoClient "https://db.example.com"

    try
        let db = client.GetDatabase "myapp"
        let users = db.GetCollection<User> "users"

        // Insert
        users.InsertOne
            { Id = ObjectId.GenerateNewId()
              Name = "Alice"
              Email = "alice@example.com"
              CreatedAt = DateTime.UtcNow }

        // Query
        match users.Find(fun u -> u.Email = "alice@example.com").FirstOrDefault() with
        | null -> printfn "User not found"
        | alice -> printfn "Found user: %s" alice.Name

        // Aggregation
        let stats =
            users.Aggregate
                [ BsonDocument("$group", BsonDocument([
                    BsonElement("_id", BsonNull.Value)
                    BsonElement("total", BsonDocument("$sum", BsonInt32 1))
                  ])) ]
            |> Async.RunSynchronously

        match stats with
        | [doc] -> printfn "Total users: %d" (doc.["total"].AsInt32)
        | _ -> ()

    finally
        client.Close() |> Async.RunSynchronously

    // Pipelining
    printfn "\n=== Promise Pipelining ==="

    let result =
        mongo "active customers"
        |> Query.map (fun c -> mongo $"orders for {c}")
        |> Query.map (fun o -> mongo $"calculate total from {o}")
        |> Query.run

    printfn "Totals: %A" result

    0
```

---

## License

MIT
