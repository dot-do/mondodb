# dotdo-mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```ruby
require 'dotdo/mongo'

users = Mongo.query "users who haven't logged in this month"
vips = Mongo.query "customers with orders over $1000"
```

One require. Natural language queries. Zero infrastructure.

---

## Why dotdo-mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **Mongoid/mongo-ruby-driver compatible** - Drop-in replacement for the official MongoDB Ruby driver
- **Ruby-native** - Blocks, symbols, method chaining - the Ruby way
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Full async support** - Works with async-await gems

```ruby
# Three dependent operations, ONE network round trip:
result = Mongo.query("customers in Texas")
  .remap { |c| Mongo.query("orders for #{c}") }
  .remap { |o| Mongo.query("total revenue from #{o}") }
```

---

## Installation

Add to your Gemfile:

```ruby
gem 'dotdo-mongo'
```

Then run:

```bash
bundle install
```

Or install directly:

```bash
gem install dotdo-mongo
```

Requires Ruby 3.0+.

---

## Quick Start

### Natural Language API

```ruby
require 'dotdo/mongo'

# Query in plain English
inactive = Mongo.query "users who haven't logged in this month"
vips = Mongo.query "customers with orders over $1000"
trending = Mongo.query "most popular products this week"

# Chain like sentences
result = Mongo.query("users in Austin")
  .remap { |user| Mongo.query("recent orders for #{user}") }
  .remap { |orders| Mongo.query("shipping status for #{orders}") }

# Search semantically
tutorials = Mongo.query("tutorials similar to machine learning").limit(10)
```

### MongoDB Compatible API

```ruby
require 'dotdo/mongo'

client = Mongo::Client.new('https://your-worker.workers.dev')
db = client[:myapp]
users = db[:users]

# Standard MongoDB operations
users.insert_one(name: 'Alice', email: 'alice@example.com')
user = users.find(email: 'alice@example.com').first
results = users.aggregate([...]).to_a
```

---

## Natural Language Queries

The query method translates natural language to optimized queries:

```ruby
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

```ruby
# Build the pipeline - nothing sent yet
users = Mongo.query("active users")
orders = users.remap { |u| Mongo.query("pending orders for #{u}") }
totals = orders.remap { |o| o[:total] }

# NOW we send everything - one round trip
result = totals.resolve

# Parallel fan-out with concurrent-ruby
require 'concurrent'

futures = [
  Concurrent::Promise.execute { Mongo.query("active users") },
  Concurrent::Promise.execute { Mongo.query("pending orders") },
  Concurrent::Promise.execute { Mongo.query("low stock products") }
]

users, orders, products = futures.map(&:value)
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```ruby
# Semantic search in plain English
similar = Mongo.query("tutorials similar to machine learning").limit(10)
related = Mongo.query("products like this hiking backpack")
answers = Mongo.query("documents about serverless architecture")

# Embeddings are automatic
Mongo.query("index products for semantic search")
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```ruby
results = Mongo.query("serverless database in title and content").highlight
fuzzy = Mongo.query('find articles matching "kubernets"').fuzzy
scored = Mongo.query('search "edge computing" with relevance scores')
```

---

## Real-Time Changes

Watch for database changes with blocks:

```ruby
Mongo.query("watch orders for changes").each do |change|
  case change[:operation_type]
  when 'insert'
    notify(change[:full_document][:customer])
  when 'update'
    update_dashboard(change[:full_document])
  end
end

# Or query changes directly
recent = Mongo.query("changes to products in last hour")
```

---

## Transactions

Atomic operations with natural language:

```ruby
Mongo.query(<<~QUERY).atomic
  transfer $100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer
QUERY

# Or chain with transactions
Mongo.transaction do |tx|
  tx.query("alice account").debit(100)
  tx.query("bob account").credit(100)
end
```

---

## Document Models

Use Ruby classes for structured documents:

```ruby
require 'dotdo/mongo'

class User
  include Mongo::Document

  field :name, type: String
  field :email, type: String
  field :created_at, type: Time, default: -> { Time.now }

  validates :email, presence: true, uniqueness: true
end

# Type-safe operations
user = User.find_by(email: 'alice@example.com')

User.create!(
  name: 'Bob',
  email: 'bob@example.com'
)
```

---

## Error Handling

```ruby
require 'dotdo/mongo'

begin
  result = Mongo.query("complex query here")
rescue Mongo::QueryError => e
  puts "Query failed: #{e.message}"
  puts "Suggestion: #{e.suggestion}" if e.suggestion
rescue Mongo::ConnectionError => e
  puts "Connection lost: #{e.message}"
end
```

---

## Configuration

```ruby
require 'dotdo/mongo'

Mongo.configure do |config|
  config.name = 'my-database'
  config.domain = 'db.myapp.com'

  # Enable features
  config.vector = true           # Vector search with Vectorize
  config.fulltext = true         # FTS5 text search
  config.analytics = true        # OLAP with ClickHouse

  # Storage tiers
  config.storage = {
    hot: 'sqlite',    # Recent data, fast queries
    warm: 'r2',       # Historical data
    cold: 'archive'   # Long-term retention
  }
end
```

---

## API Reference

### Module Methods

```ruby
module Mongo
  # Execute a natural language query
  def self.query(query_string, **options) -> MongoQuery

  # Execute a block within a transaction
  def self.transaction(&block) -> result

  # Configure the client
  def self.configure(&block) -> nil
end
```

### Client

```ruby
class Mongo::Client
  # Create a new client
  def initialize(uri, **options)

  # Get a database
  def [](name) -> Database
  def database(name) -> Database

  # Close the connection
  def close -> nil
end

class Mongo::Database
  # Get a collection
  def [](name) -> Collection
  def collection(name) -> Collection

  # List collections
  def collection_names -> Array<String>

  # Drop database
  def drop -> nil
end

class Mongo::Collection
  # Find documents
  def find(filter = {}) -> Cursor

  # Find one document
  def find_one(filter = {}) -> Hash | nil

  # Insert documents
  def insert_one(doc) -> InsertOneResult
  def insert_many(docs) -> InsertManyResult

  # Update documents
  def update_one(filter, update) -> UpdateResult
  def update_many(filter, update) -> UpdateResult

  # Delete documents
  def delete_one(filter) -> DeleteResult
  def delete_many(filter) -> DeleteResult

  # Aggregation
  def aggregate(pipeline) -> Cursor
end
```

### MongoQuery

```ruby
class MongoQuery
  # Modifiers
  def limit(n) -> MongoQuery
  def skip(n) -> MongoQuery
  def sort(field, direction = :asc) -> MongoQuery

  # Search modifiers
  def highlight -> MongoQuery
  def fuzzy(**options) -> MongoQuery

  # Transformations (server-side via RPC pipelining)
  def remap(&block) -> MongoQuery
  def select(&block) -> MongoQuery
  def reduce(initial, &block) -> MongoQuery

  # Transactions
  def atomic -> result

  # Resolve the query
  def resolve -> result
  def to_a -> Array
end
```

---

## Complete Example

```ruby
require 'dotdo/mongo'

# Natural language queries
puts "=== Natural Language API ==="

inactive = Mongo.query("users who haven't logged in this month")
puts "Found #{inactive.count} inactive users"

revenue = Mongo.query("total revenue by category this quarter")
puts "Revenue by category: #{revenue}"

# MongoDB compatible API
puts "\n=== MongoDB Compatible API ==="

client = Mongo::Client.new('https://db.example.com')
db = client[:myapp]
users = db[:users]

# Insert
users.insert_one(
  name: 'Alice',
  email: 'alice@example.com',
  created_at: Time.now
)

# Query
alice = users.find(email: 'alice@example.com').first
puts "Found user: #{alice[:name]}" if alice

# Aggregation
stats = users.aggregate([
  { '$group' => { '_id' => nil, 'total' => { '$sum' => 1 } } }
]).to_a
puts "Total users: #{stats.first&.dig('total')}"

# Pipelining
puts "\n=== Promise Pipelining ==="

result = Mongo.query("active customers")
  .remap { |c| Mongo.query("orders for #{c}") }
  .remap { |o| Mongo.query("calculate total from #{o}") }
  .resolve
puts "Totals: #{result}"

client.close
```

---

## License

MIT
