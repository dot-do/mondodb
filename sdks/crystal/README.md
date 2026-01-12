# dotdo-mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```crystal
require "dotdo-mongo"

users = Mongo.query "users who haven't logged in this month"
vips = Mongo.query "customers with orders over $1000"
```

One require. Natural language queries. Zero infrastructure.

---

## Why dotdo-mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **mongo.cr compatible** - Drop-in replacement for the official MongoDB Crystal driver
- **Crystal-native** - Fibers, channels, and compile-time type safety
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Blazing fast** - Native performance with zero-overhead abstractions

```crystal
# Three dependent operations, ONE network round trip:
result = Mongo.query("customers in Texas")
  .map { |c| Mongo.query("orders for #{c}") }
  .map { |o| Mongo.query("total revenue from #{o}") }
```

---

## Installation

Add to your `shard.yml`:

```yaml
dependencies:
  dotdo-mongo:
    github: dotdo/mongo-crystal
    version: ~> 0.1.0
```

Then run:

```bash
shards install
```

Requires Crystal 1.10+.

---

## Quick Start

### Natural Language API

```crystal
require "dotdo-mongo"

# Query in plain English
inactive = Mongo.query "users who haven't logged in this month"
vips = Mongo.query "customers with orders over $1000"
trending = Mongo.query "most popular products this week"

# Chain like sentences
result = Mongo.query("users in Austin")
  .map { |user| Mongo.query("recent orders for #{user}") }
  .map { |orders| Mongo.query("shipping status for #{orders}") }

# Search semantically
tutorials = Mongo.query("tutorials similar to machine learning")
  .limit(10)
```

### MongoDB Compatible API

```crystal
require "dotdo-mongo"

client = Mongo::Client.new("https://your-worker.workers.dev")
db = client["myapp"]
users = db["users"]

# Standard MongoDB operations
users.insert_one({name: "Alice", email: "alice@example.com"})

user = users.find_one({email: "alice@example.com"})
```

---

## Natural Language Queries

The query method translates natural language to optimized queries:

```crystal
# CRUD Operations
alice = Mongo.query "user alice@example.com"
active = Mongo.query "active users in Austin"
vips = Mongo.query "users with 10+ orders"

# AI infers what you need
Mongo.query "alice@example.com"              # returns user
Mongo.query "orders for alice@example.com"   # returns orders
Mongo.query "alice order history"            # returns full timeline

# Aggregation
revenue = Mongo.query "revenue by category this month"
growth = Mongo.query "user growth rate last 6 months"
top = Mongo.query "top 10 customers by lifetime value"
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```crystal
# Build the pipeline - nothing sent yet
users = Mongo.query("active users")
orders = users.map { |u| Mongo.query("pending orders for #{u.id}") }
totals = orders.map { |o| o.total }

# NOW we send everything - one round trip
result = totals.get

# Parallel fan-out with fibers
channel = Channel(Array(JSON::Any)).new(3)

spawn { channel.send Mongo.query("active users").get }
spawn { channel.send Mongo.query("pending orders").get }
spawn { channel.send Mongo.query("low stock products").get }

users = channel.receive
orders = channel.receive
products = channel.receive
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```crystal
# Semantic search in plain English
similar = Mongo.query("tutorials similar to machine learning").limit(10).get
related = Mongo.query("products like this hiking backpack").get
answers = Mongo.query("documents about serverless architecture").get

# Embeddings are automatic
Mongo.query("index products for semantic search").get
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```crystal
results = Mongo.query("serverless database in title and content").highlight.get
fuzzy = Mongo.query(%q(find articles matching "kubernets")).fuzzy.get
scored = Mongo.query(%q(search "edge computing" with relevance scores)).get
```

---

## Real-Time Changes

Watch for database changes with channels:

```crystal
Mongo.query("watch orders for changes").each do |change|
  case change["operationType"]
  when "insert"
    notify(change["fullDocument"]["customer"])
  when "update"
    update_dashboard(change["fullDocument"])
  end
end

# Or query changes directly
recent = Mongo.query("changes to products in last hour").get
```

---

## Transactions

Atomic operations with natural language:

```crystal
Mongo.query(%q(
  transfer $100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer
)).atomic.get

# Or chain with transactions
Mongo.transaction do |tx|
  tx.query("alice account").debit(100)
  tx.query("bob account").credit(100)
end
```

---

## Type-Safe Documents

Use Crystal structs for strongly-typed documents:

```crystal
require "dotdo-mongo"
require "json"

struct User
  include JSON::Serializable

  @[JSON::Field(key: "_id")]
  property id : String?
  property name : String
  property email : String
  property created_at : Time

  def initialize(@name, @email, @created_at = Time.utc)
  end
end

client = Mongo::Client.new("https://db.example.com")
db = client["myapp"]
users = db.collection(User, "users")

# Type-safe operations
user : User? = users.find_one({email: "alice@example.com"})

users.insert_one(User.new(
  name: "Bob",
  email: "bob@example.com"
))
```

---

## Error Handling

```crystal
require "dotdo-mongo"

begin
  result = Mongo.query("complex query here").get
rescue ex : Mongo::QueryError
  puts "Query failed: #{ex.message}"
  if suggestion = ex.suggestion
    puts "Suggestion: #{suggestion}"
  end
rescue ex : Mongo::ConnectionError
  puts "Connection lost: #{ex.message}"
end
```

---

## Configuration

```crystal
require "dotdo-mongo"

Mongo.configure do |config|
  config.name = "my-database"
  config.domain = "db.myapp.com"

  # Enable features
  config.vector = true           # Vector search with Vectorize
  config.fulltext = true         # FTS5 text search
  config.analytics = true        # OLAP with ClickHouse

  # Storage tiers
  config.storage.hot = "sqlite"  # Recent data, fast queries
  config.storage.warm = "r2"     # Historical data
  config.storage.cold = "archive" # Long-term retention
end
```

---

## Concurrency with Fibers

```crystal
require "dotdo-mongo"

# Spawn multiple queries concurrently
channel = Channel(Nil).new

spawn do
  inactive = Mongo.query("users who haven't logged in this month").get
  puts "Found #{inactive.size} inactive users"
  channel.send nil
end

spawn do
  revenue = Mongo.query("total revenue by category this quarter").get
  puts "Revenue: #{revenue}"
  channel.send nil
end

# Wait for both to complete
2.times { channel.receive }
```

---

## API Reference

### Module Methods

```crystal
module Mongo
  # Execute a natural language query
  def self.query(query : String) : MongoQuery

  # Execute a block within a transaction
  def self.transaction(&block : Transaction -> T) : T forall T

  # Configure the client
  def self.configure(&block : Config -> Nil)
end
```

### Client

```crystal
class Mongo::Client
  # Create a new client
  def initialize(uri : String)

  # Get a database
  def [](name : String) : Database

  # Close the connection
  def close : Nil
end

class Mongo::Database
  # Get a collection
  def [](name : String) : Collection

  # Get a typed collection
  def collection(type : T.class, name : String) : TypedCollection(T) forall T

  # List collection names
  def collection_names : Array(String)

  # Drop the database
  def drop : Nil
end

class Mongo::Collection
  # Find documents
  def find(filter = {} of String => JSON::Any) : Cursor

  # Find one document
  def find_one(filter = {} of String => JSON::Any) : JSON::Any?

  # Insert one document
  def insert_one(document) : InsertOneResult

  # Insert many documents
  def insert_many(documents : Array) : InsertManyResult

  # Update one document
  def update_one(filter, update) : UpdateResult

  # Update many documents
  def update_many(filter, update) : UpdateResult

  # Delete one document
  def delete_one(filter) : DeleteResult

  # Delete many documents
  def delete_many(filter) : DeleteResult

  # Run an aggregation pipeline
  def aggregate(pipeline : Array) : Cursor
end
```

### MongoQuery

```crystal
class Mongo::MongoQuery(T)
  # Limit results to n documents
  def limit(n : Int32) : MongoQuery(T)

  # Skip the first n documents
  def skip(n : Int32) : MongoQuery(T)

  # Sort results by field
  def sort(field : String, direction : SortDirection = :asc) : MongoQuery(T)

  # Enable search result highlighting
  def highlight : MongoQuery(T)

  # Enable fuzzy matching
  def fuzzy : MongoQuery(T)

  # Transform results server-side
  def map(&block : T -> R) : MongoQuery(Array(R)) forall R

  # Filter results server-side
  def select(&block : T -> Bool) : MongoQuery(Array(T))

  # Reduce results server-side
  def reduce(initial : R, &block : R, T -> R) : MongoQuery(R) forall R

  # Execute as an atomic transaction
  def atomic : MongoQuery(T)

  # Get the query result
  def get : T

  # Iterate over results
  def each(&block : T -> Nil) : Nil
end
```

---

## Complete Example

```crystal
require "dotdo-mongo"
require "json"

struct User
  include JSON::Serializable

  @[JSON::Field(key: "_id")]
  property id : String?
  property name : String
  property email : String
  property created_at : Time

  def initialize(@name, @email, @created_at = Time.utc)
  end
end

# Natural language queries
puts "=== Natural Language API ==="

inactive = Mongo.query("users who haven't logged in this month").get
puts "Found #{inactive.as_a.size} inactive users"

revenue = Mongo.query("total revenue by category this quarter").get
puts "Revenue by category: #{revenue}"

# MongoDB compatible API
puts "\n=== MongoDB Compatible API ==="

client = Mongo::Client.new("https://db.example.com")

begin
  db = client["myapp"]
  users = db.collection(User, "users")

  # Insert
  users.insert_one(User.new(
    name: "Alice",
    email: "alice@example.com"
  ))

  # Query
  if alice = users.find_one({email: "alice@example.com"})
    puts "Found user: #{alice.name}"
  else
    puts "User not found"
  end

  # Aggregation
  stats = db["users"].aggregate([
    {"$group" => {"_id" => nil, "total" => {"$sum" => 1}}}
  ]).to_a
  if stat = stats.first?
    puts "Total users: #{stat["total"]}"
  end
ensure
  client.close
end

# Pipelining
puts "\n=== Promise Pipelining ==="

result = Mongo.query("active customers")
  .map { |c| Mongo.query("orders for #{c}") }
  .map { |o| Mongo.query("calculate total from #{o}") }
  .get
puts "Totals: #{result}"
```

---

## License

MIT
