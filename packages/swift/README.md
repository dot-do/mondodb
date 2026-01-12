# DotDoMongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```swift
import DotDoMongo

let users = try await mongo("users who haven't logged in this month")
let vips = try await mongo("customers with orders over $1000")
```

One import. Natural language queries. Zero infrastructure.

---

## Why DotDoMongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **MongoSwift compatible** - Drop-in replacement for the official MongoDB Swift driver
- **Swift Concurrency** - Full async/await and actor support
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Codable support** - Use your existing Codable types seamlessly

```swift
// Three dependent operations, ONE network round trip:
let result = try await mongo("customers in Texas")
    .map { mongo("orders for \($0)") }
    .map { mongo("total revenue from \($0)") }
```

---

## Installation

### Swift Package Manager

Add to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/dotdo/mongo-swift", from: "0.1.0")
]
```

Or in Xcode: File > Add Packages... and enter the repository URL.

Requires Swift 5.9+ and iOS 15+ / macOS 12+.

---

## Quick Start

### Natural Language API

```swift
import DotDoMongo

func main() async throws {
    // Query in plain English
    let inactive = try await mongo("users who haven't logged in this month")
    let vips = try await mongo("customers with orders over $1000")
    let trending = try await mongo("most popular products this week")

    // Chain like sentences
    let result = try await mongo("users in Austin")
        .map { user in mongo("recent orders for \(user)") }
        .map { orders in mongo("shipping status for \(orders)") }

    // Search semantically
    let tutorials = try await mongo("tutorials similar to machine learning")
        .limit(10)
}
```

### MongoDB Compatible API

```swift
import DotDoMongo

func main() async throws {
    let client = try MongoClient("https://your-worker.workers.dev")
    let db = client.db("myapp")
    let users = db.collection("users", withType: User.self)

    // Standard MongoDB operations
    try await users.insertOne(User(name: "Alice", email: "alice@example.com"))
    let user = try await users.findOne(["email": "alice@example.com"])

    try await client.close()
}
```

---

## Natural Language Queries

The mongo function translates natural language to optimized queries:

```swift
// CRUD Operations
let alice = try await mongo("user alice@example.com")
let active = try await mongo("active users in Austin")
let vips = try await mongo("users with 10+ orders")

// AI infers what you need
try await mongo("alice@example.com")              // returns user
try await mongo("orders for alice@example.com")   // returns orders
try await mongo("alice order history")            // returns full timeline

// Aggregation
let revenue = try await mongo("revenue by category this month")
let growth = try await mongo("user growth rate last 6 months")
let top = try await mongo("top 10 customers by lifetime value")
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```swift
// Build the pipeline - nothing sent yet
let users = mongo("active users")
let orders = users.map { mongo("pending orders for \($0.id)") }
let totals = orders.map { $0.total }

// NOW we send everything - one round trip
let result = try await totals

// Parallel fan-out with async let
async let usersTask = mongo("active users")
async let ordersTask = mongo("pending orders")
async let productsTask = mongo("low stock products")

let (users, orders, products) = try await (usersTask, ordersTask, productsTask)
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```swift
// Semantic search in plain English
let similar = try await mongo("tutorials similar to machine learning").limit(10)
let related = try await mongo("products like this hiking backpack")
let answers = try await mongo("documents about serverless architecture")

// Embeddings are automatic
try await mongo("index products for semantic search")
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```swift
let results = try await mongo("serverless database in title and content").highlight()
let fuzzy = try await mongo(#"find articles matching "kubernets""#).fuzzy()
let scored = try await mongo(#"search "edge computing" with relevance scores"#)
```

---

## Real-Time Changes

Watch for database changes with AsyncSequence:

```swift
for try await change in mongo("watch orders for changes") {
    switch change.operationType {
    case "insert":
        await notify(change.fullDocument.customer)
    case "update":
        await updateDashboard(change.fullDocument)
    default:
        break
    }
}

// Or query changes directly
let recent = try await mongo("changes to products in last hour")
```

---

## Transactions

Atomic operations with natural language:

```swift
try await mongo("""
    transfer $100 from alice to bob:
    - subtract from alice balance
    - add to bob balance
    - log the transfer
""").atomic()

// Or chain with transactions
try await transaction { tx in
    try await tx.query("alice account").debit(100)
    try await tx.query("bob account").credit(100)
}
```

---

## Type-Safe Documents

Use Codable structs for strongly-typed documents:

```swift
import DotDoMongo
import Foundation

struct User: Codable {
    var id: ObjectId?
    let name: String
    let email: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, email, createdAt
    }
}

let client = try MongoClient("https://db.example.com")
let db = client.db("myapp")
let users = db.collection("users", withType: User.self)

// Type-safe operations
let user: User? = try await users.findOne(["email": "alice@example.com"])

try await users.insertOne(User(
    name: "Bob",
    email: "bob@example.com",
    createdAt: Date()
))

try await client.close()
```

---

## SwiftUI Integration

```swift
import SwiftUI
import DotDoMongo

struct UsersView: View {
    @State private var users: [User] = []
    @State private var isLoading = true
    @State private var error: Error?

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else if let error {
                Text("Error: \(error.localizedDescription)")
            } else {
                List(users) { user in
                    VStack(alignment: .leading) {
                        Text(user.name)
                            .font(.headline)
                        Text(user.email)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
        .task {
            do {
                users = try await mongo("active users")
                isLoading = false
            } catch {
                self.error = error
                isLoading = false
            }
        }
    }
}
```

---

## Error Handling

```swift
import DotDoMongo

do {
    let result = try await mongo("complex query here")
} catch let error as QueryError {
    print("Query failed: \(error.message)")
    if let suggestion = error.suggestion {
        print("Suggestion: \(suggestion)")
    }
} catch let error as ConnectionError {
    print("Connection lost: \(error.message)")
}
```

---

## Configuration

```swift
import DotDoMongo

Mongo.configure(
    name: "my-database",
    domain: "db.myapp.com",
    options: .init(
        vector: true,           // Vector search with Vectorize
        fulltext: true,         // FTS5 text search
        analytics: true,        // OLAP with ClickHouse
        storage: .init(
            hot: "sqlite",      // Recent data, fast queries
            warm: "r2",         // Historical data
            cold: "archive"     // Long-term retention
        )
    )
)
```

---

## API Reference

### Top-Level Functions

```swift
/// Execute a natural language query.
func mongo<T: Decodable>(_ query: String) -> MongoQuery<T>

/// Configure the client.
func configure(name: String, domain: String, options: MongoOptions)

/// Execute a block within a transaction.
func transaction<T>(_ block: (TransactionContext) async throws -> T) async throws -> T
```

### Client

```swift
class MongoClient {
    /// Create a client from a connection string.
    init(_ uri: String) throws

    /// Get a database.
    func db(_ name: String) -> MongoDatabase

    /// Close the connection.
    func close() async throws
}

class MongoDatabase {
    /// Get a collection.
    func collection<T: Codable>(_ name: String, withType: T.Type) -> MongoCollection<T>

    /// List collection names.
    func listCollectionNames() async throws -> [String]

    /// Drop the database.
    func drop() async throws
}

class MongoCollection<T: Codable> {
    /// Find documents.
    func find(_ filter: Document?) -> FindCursor<T>

    /// Find one document.
    func findOne(_ filter: Document?) async throws -> T?

    /// Insert one document.
    func insertOne(_ document: T) async throws -> InsertOneResult

    /// Insert many documents.
    func insertMany(_ documents: [T]) async throws -> InsertManyResult

    /// Update one document.
    func updateOne(filter: Document, update: Document) async throws -> UpdateResult

    /// Update many documents.
    func updateMany(filter: Document, update: Document) async throws -> UpdateResult

    /// Delete one document.
    func deleteOne(_ filter: Document) async throws -> DeleteResult

    /// Delete many documents.
    func deleteMany(_ filter: Document) async throws -> DeleteResult

    /// Run an aggregation pipeline.
    func aggregate(_ pipeline: [Document]) -> AggregateCursor<Document>
}
```

### MongoQuery

```swift
struct MongoQuery<T: Decodable>: AsyncSequence {
    /// Limit results to n documents.
    func limit(_ n: Int) -> MongoQuery<T>

    /// Skip the first n documents.
    func skip(_ n: Int) -> MongoQuery<T>

    /// Sort results by field.
    func sort(_ field: String, _ direction: SortDirection = .ascending) -> MongoQuery<T>

    /// Enable search result highlighting.
    func highlight() -> MongoQuery<T>

    /// Enable fuzzy matching.
    func fuzzy() -> MongoQuery<T>

    /// Transform results server-side.
    func map<R>(_ transform: @escaping (T) -> R) -> MongoQuery<[R]>

    /// Filter results server-side.
    func filter(_ predicate: @escaping (T) -> Bool) -> MongoQuery<[T]>

    /// Reduce results server-side.
    func reduce<R>(_ initial: R, _ operation: @escaping (R, T) -> R) -> MongoQuery<R>

    /// Execute as an atomic transaction.
    func atomic() -> MongoQuery<T>
}
```

---

## Complete Example

```swift
import DotDoMongo
import Foundation

struct User: Codable, Identifiable {
    var id: ObjectId?
    let name: String
    let email: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case name, email, createdAt
    }
}

@main
struct App {
    static func main() async throws {
        // Natural language queries
        print("=== Natural Language API ===")

        let inactive: [User] = try await mongo("users who haven't logged in this month")
        print("Found \(inactive.count) inactive users")

        let revenue: [String: Decimal] = try await mongo("total revenue by category this quarter")
        print("Revenue by category: \(revenue)")

        // MongoDB compatible API
        print("\n=== MongoDB Compatible API ===")

        let client = try MongoClient("https://db.example.com")
        defer { Task { try? await client.close() } }

        let db = client.db("myapp")
        let users = db.collection("users", withType: User.self)

        // Insert
        try await users.insertOne(User(
            name: "Alice",
            email: "alice@example.com",
            createdAt: Date()
        ))

        // Query
        if let alice = try await users.findOne(["email": "alice@example.com"]) {
            print("Found user: \(alice.name)")
        }

        // Aggregation
        var count = 0
        for try await doc in users.aggregate([
            ["$group": ["_id": nil, "total": ["$sum": 1]]]
        ]) {
            count = doc["total"] as? Int ?? 0
        }
        print("Total users: \(count)")

        // Pipelining
        print("\n=== Promise Pipelining ===")

        let result = try await mongo("active customers")
            .map { mongo("orders for \($0)") }
            .map { mongo("calculate total from \($0)") }
        print("Totals: \(result)")
    }
}
```

---

## License

MIT
