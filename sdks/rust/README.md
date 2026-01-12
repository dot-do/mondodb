# dotdo-mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```rust
use dotdo_mongo::mongo;

let users = mongo!("users who haven't logged in this month").await?;
let vips = mongo!("customers with orders over $1000").await?;
```

One import. Natural language queries. Zero infrastructure.

---

## Why dotdo-mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **mongodb crate compatible** - Drop-in replacement for the official MongoDB Rust driver
- **Async-first** - Built on tokio with full async/await support
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Full type safety** - Leverages Rust's type system for compile-time guarantees

```rust
// Three dependent operations, ONE network round trip:
let result = mongo!("customers in Texas")
    .map(|c| mongo!("orders for {}", c))
    .map(|o| mongo!("total revenue from {}", o))
    .await?;
```

---

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
dotdo-mongo = "0.1"
tokio = { version = "1", features = ["full"] }
```

---

## Quick Start

### Natural Language API

```rust
use dotdo_mongo::mongo;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Query in plain English
    let inactive = mongo!("users who haven't logged in this month").await?;
    let vips = mongo!("customers with orders over $1000").await?;
    let trending = mongo!("most popular products this week").await?;

    // Chain like sentences
    let result = mongo!("users in Austin")
        .map(|user| mongo!("recent orders for {}", user))
        .map(|orders| mongo!("shipping status for {}", orders))
        .await?;

    // Search semantically
    let tutorials = mongo!("tutorials similar to machine learning")
        .limit(10)
        .await?;

    Ok(())
}
```

### MongoDB Compatible API

```rust
use dotdo_mongo::{Client, bson::doc};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::with_uri_str("https://your-worker.workers.dev").await?;
    let db = client.database("myapp");
    let users = db.collection::<User>("users");

    // Standard MongoDB operations
    users.insert_one(doc! {
        "name": "Alice",
        "email": "alice@example.com"
    }).await?;

    let user = users.find_one(doc! { "email": "alice@example.com" }).await?;

    Ok(())
}
```

---

## Natural Language Queries

The macro API translates natural language to optimized queries:

```rust
// CRUD Operations
let alice = mongo!("user alice@example.com").await?;
let active = mongo!("active users in Austin").await?;
let vips = mongo!("users with 10+ orders").await?;

// AI infers what you need
mongo!("alice@example.com").await?;              // returns user
mongo!("orders for alice@example.com").await?;   // returns orders
mongo!("alice order history").await?;            // returns full timeline

// Aggregation
let revenue = mongo!("revenue by category this month").await?;
let growth = mongo!("user growth rate last 6 months").await?;
let top = mongo!("top 10 customers by lifetime value").await?;
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```rust
// Build the pipeline - nothing sent yet
let users = mongo!("active users");
let orders = users.map(|u| mongo!("pending orders for {}", u));
let totals = orders.map(|o| o.total);

// NOW we send everything - one round trip
let result = totals.await?;

// Parallel fan-out with tokio::join!
let (users, orders, products) = tokio::join!(
    mongo!("active users"),
    mongo!("pending orders"),
    mongo!("low stock products"),
);
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```rust
// Semantic search in plain English
let similar = mongo!("tutorials similar to machine learning").limit(10).await?;
let related = mongo!("products like this hiking backpack").await?;
let answers = mongo!("documents about serverless architecture").await?;

// Embeddings are automatic
mongo!("index products for semantic search").await?;
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```rust
let results = mongo!("serverless database in title and content").highlight().await?;
let fuzzy = mongo!(r#"find articles matching "kubernets""#).fuzzy().await?;
let scored = mongo!(r#"search "edge computing" with relevance scores"#).await?;
```

---

## Real-Time Changes

Watch for database changes with async streams:

```rust
use futures::StreamExt;

let mut stream = mongo!("watch orders for changes").stream();

while let Some(change) = stream.next().await {
    match change?.operation_type.as_str() {
        "insert" => notify(&change.full_document.customer).await,
        "update" => update_dashboard(&change.full_document).await,
        _ => {}
    }
}

// Or query changes directly
let recent = mongo!("changes to products in last hour").await?;
```

---

## Transactions

Atomic operations with natural language:

```rust
mongo!(r#"
  transfer $100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer
"#).atomic().await?;

// Or chain with transactions
mongo!("alice account").debit(100)
    .then(mongo!("bob account").credit(100))
    .atomic()
    .await?;
```

---

## Type-Safe Documents

Use serde for strongly-typed documents:

```rust
use serde::{Deserialize, Serialize};
use dotdo_mongo::{Client, bson::oid::ObjectId};

#[derive(Debug, Serialize, Deserialize)]
struct User {
    #[serde(rename = "_id")]
    id: ObjectId,
    name: String,
    email: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

let client = Client::with_uri_str("https://db.example.com").await?;
let db = client.database("myapp");
let users = db.collection::<User>("users");

// Type-safe operations
let user: Option<User> = users.find_one(doc! { "email": "alice@example.com" }).await?;

users.insert_one(User {
    id: ObjectId::new(),
    name: "Bob".to_string(),
    email: "bob@example.com".to_string(),
    created_at: chrono::Utc::now(),
}).await?;
```

---

## Error Handling

```rust
use dotdo_mongo::{Error, ErrorKind};

match mongo!("complex query here").await {
    Ok(result) => println!("Result: {:?}", result),
    Err(e) => match e.kind() {
        ErrorKind::Query { message, suggestion } => {
            eprintln!("Query failed: {}", message);
            if let Some(s) = suggestion {
                eprintln!("Suggestion: {}", s);
            }
        }
        ErrorKind::Connection(msg) => {
            eprintln!("Connection lost: {}", msg);
        }
        _ => eprintln!("Error: {}", e),
    }
}
```

---

## Configuration

```rust
use dotdo_mongo::{Mongo, StorageConfig};

let db = Mongo::builder()
    .name("my-database")
    .domain("db.myapp.com")
    .vector(true)           // Vector search with Vectorize
    .fulltext(true)         // FTS5 text search
    .analytics(true)        // OLAP with ClickHouse
    .storage(StorageConfig {
        hot: "sqlite",      // Recent data, fast queries
        warm: "r2",         // Historical data
        cold: "archive",    // Long-term retention
    })
    .build()?;
```

---

## API Reference

### Macros

```rust
/// Execute a natural language query.
///
/// # Examples
/// ```
/// let users = mongo!("active users").await?;
/// let user = mongo!("user with email {}", email).await?;
/// ```
macro_rules! mongo {
    ($query:expr) => { ... };
    ($query:expr, $($arg:tt)*) => { ... };
}
```

### Client

```rust
/// MongoDB-compatible client.
pub struct Client { ... }

impl Client {
    /// Create a client from a connection string.
    pub async fn with_uri_str(uri: &str) -> Result<Self>;

    /// Get a database handle.
    pub fn database(&self, name: &str) -> Database;

    /// Close the client connection.
    pub async fn close(self) -> Result<()>;
}

/// Database operations.
pub struct Database { ... }

impl Database {
    /// Get a collection handle.
    pub fn collection<T>(&self, name: &str) -> Collection<T>;

    /// List all collection names.
    pub async fn list_collection_names(&self) -> Result<Vec<String>>;

    /// Drop the database.
    pub async fn drop(&self) -> Result<()>;
}

/// Collection operations with type parameter.
pub struct Collection<T> { ... }

impl<T: Serialize + DeserializeOwned> Collection<T> {
    /// Find documents matching the filter.
    pub fn find(&self, filter: impl Into<Option<Document>>) -> Find<T>;

    /// Find a single document.
    pub async fn find_one(&self, filter: impl Into<Option<Document>>) -> Result<Option<T>>;

    /// Insert a document.
    pub async fn insert_one(&self, doc: T) -> Result<InsertOneResult>;

    /// Insert multiple documents.
    pub async fn insert_many(&self, docs: impl IntoIterator<Item = T>) -> Result<InsertManyResult>;

    /// Update a single document.
    pub async fn update_one(&self, filter: Document, update: Document) -> Result<UpdateResult>;

    /// Update multiple documents.
    pub async fn update_many(&self, filter: Document, update: Document) -> Result<UpdateResult>;

    /// Delete a single document.
    pub async fn delete_one(&self, filter: Document) -> Result<DeleteResult>;

    /// Delete multiple documents.
    pub async fn delete_many(&self, filter: Document) -> Result<DeleteResult>;

    /// Run an aggregation pipeline.
    pub fn aggregate(&self, pipeline: impl IntoIterator<Item = Document>) -> Aggregate<Document>;
}
```

### MongoQuery

```rust
/// A lazy query that supports chaining and pipelining.
pub struct MongoQuery<T> { ... }

impl<T> MongoQuery<T> {
    /// Limit results to n documents.
    pub fn limit(self, n: i64) -> Self;

    /// Skip the first n documents.
    pub fn skip(self, n: u64) -> Self;

    /// Sort results by field.
    pub fn sort(self, field: &str, direction: i32) -> Self;

    /// Enable search result highlighting.
    pub fn highlight(self) -> Self;

    /// Enable fuzzy matching.
    pub fn fuzzy(self) -> Self;

    /// Transform results server-side.
    pub fn map<R, F: Fn(T) -> R>(self, f: F) -> MongoQuery<Vec<R>>;

    /// Filter results server-side.
    pub fn filter<F: Fn(&T) -> bool>(self, f: F) -> MongoQuery<Vec<T>>;

    /// Execute as an atomic transaction.
    pub fn atomic(self) -> Self;

    /// Convert to an async stream.
    pub fn stream(self) -> impl Stream<Item = Result<T>>;
}

impl<T> Future for MongoQuery<T> {
    type Output = Result<T>;
    // ...
}
```

---

## Complete Example

```rust
use dotdo_mongo::{mongo, Client, bson::doc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct User {
    name: String,
    email: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Natural language queries
    println!("=== Natural Language API ===");

    let inactive: Vec<User> = mongo!("users who haven't logged in this month").await?;
    println!("Found {} inactive users", inactive.len());

    let revenue = mongo!("total revenue by category this quarter").await?;
    println!("Revenue by category: {:?}", revenue);

    // MongoDB compatible API
    println!("\n=== MongoDB Compatible API ===");

    let client = Client::with_uri_str("https://db.example.com").await?;
    let db = client.database("myapp");
    let users = db.collection::<User>("users");

    // Insert
    users.insert_one(User {
        name: "Alice".to_string(),
        email: "alice@example.com".to_string(),
    }).await?;

    // Query
    if let Some(alice) = users.find_one(doc! { "email": "alice@example.com" }).await? {
        println!("Found user: {}", alice.name);
    }

    // Aggregation
    let mut stats = users.aggregate([
        doc! { "$group": { "_id": null, "total": { "$sum": 1 } } }
    ]);
    if let Some(doc) = stats.next().await {
        println!("Total users: {}", doc?.get_i32("total")?);
    }

    // Pipelining
    println!("\n=== Promise Pipelining ===");

    let result = mongo!("active customers")
        .map(|c| mongo!("orders for {}", c))
        .map(|o| mongo!("calculate total from {}", o))
        .await?;
    println!("Totals: {:?}", result);

    client.close().await?;
    Ok(())
}
```

---

## License

MIT
