# mongo.do Ruby SDK

**MongoDB on the Edge. Natural Language First. AI-Native.**

```ruby
require 'mongo_do'

client = Mongo::Client.new('wss://mongo.do/mydb', token: 'your-token')
users = client.db[:users]

# Standard CRUD
users.insert_one(name: 'Alice', email: 'alice@example.com')
users.find(status: 'active').each { |user| puts user['name'] }

# Natural Language Queries
results = users.ask('find all premium users who signed up this month')

# Change Streams
users.watch.each { |change| process(change) }

client.close
```

One require. MongoDB API. Natural language queries. Zero infrastructure.

---

## Features

- **MongoDB-compatible API** - Drop-in replacement for mongo-ruby-driver
- **Natural language queries** - Query your database like you'd describe it to a colleague
- **Promise pipelining** - Chain operations with minimal round trips via RPC
- **Change streams** - Real-time data change notifications
- **Full BSON support** - ObjectId, Timestamp, Binary, Decimal128, and more
- **Async support** - Works with Ruby 3.2+ fiber scheduler and async gem
- **HTTP and WebSocket transports** - Choose the right protocol for your use case

---

## Installation

Add to your Gemfile:

```ruby
gem 'mongo.do'
```

Then run:

```bash
bundle install
```

Or install directly:

```bash
gem install mongo.do
```

Requires Ruby 3.1+.

---

## Quick Start

### Basic CRUD Operations

```ruby
require 'mongo_do'

# Connect to Mongo.do
client = Mongo::Client.new('wss://mongo.do/myapp', token: ENV['MONGO_DO_TOKEN'])
db = client.database
users = db[:users]

# Insert
result = users.insert_one(name: 'Alice', email: 'alice@example.com', age: 30)
puts "Inserted ID: #{result.inserted_id}"

# Insert multiple
users.insert_many([
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 35 }
])

# Find
users.find(age: { '$gte' => 30 }).each do |user|
  puts "#{user['name']} (#{user['age']})"
end

# Find one
alice = users.find_one(email: 'alice@example.com')

# Update
users.update_one(
  { email: 'alice@example.com' },
  { '$set' => { age: 31 } }
)

# Delete
users.delete_one(email: 'alice@example.com')

client.close
```

### Natural Language Queries

```ruby
require 'mongo_do'

client = Mongo::Client.new('wss://mongo.do/myapp', token: ENV['MONGO_DO_TOKEN'])
users = client.db[:users]

# Query in plain English
result = users.ask('find all active users who haven\'t logged in this month')
result.each { |user| puts user['name'] }

# Get the generated MongoDB query
explained = users.explain_query('find users older than 30 in California')
puts "Generated query: #{explained['generatedQuery']}"

# Aggregation in natural language
stats = users.ask('what is the average age by country?')

# With context
similar = users.ask('find users similar to this one', context: { user_id: '123' })

client.close
```

### Change Streams

```ruby
require 'mongo_do'

client = Mongo::Client.new('wss://mongo.do/myapp', token: ENV['MONGO_DO_TOKEN'])
orders = client.db[:orders]

# Watch for changes
orders.watch.each do |change|
  case change['operationType']
  when 'insert'
    puts "New order: #{change['fullDocument']}"
  when 'update'
    puts "Order updated: #{change['documentKey']}"
  when 'delete'
    puts "Order deleted: #{change['documentKey']}"
  end
end

# Watch with pipeline filter
orders.watch([
  { '$match' => { 'operationType' => 'insert' } }
]).each do |change|
  notify_new_order(change['fullDocument'])
end

# Watch with options
orders.watch(
  full_document: 'updateLookup',
  max_await_time_ms: 5000
).each { |change| process(change) }
```

### BSON Types

```ruby
require 'mongo_do'

client = Mongo::Client.new('wss://mongo.do/myapp', token: ENV['MONGO_DO_TOKEN'])
products = client.db[:products]

# ObjectId
oid = Mongo::ObjectId.new
oid = Mongo::ObjectId.from_string('507f1f77bcf86cd799439011')
oid = Mongo::ObjectId.from_time(Time.now)

puts oid.to_s          # => "507f1f77bcf86cd799439011"
puts oid.timestamp     # => 2024-01-01 12:00:00 UTC

# Insert with ObjectId
products.insert_one(_id: Mongo::ObjectId.new, name: 'Widget')

# Timestamp (for replication oplog)
ts = Mongo::Timestamp.new(Time.now.to_i, 1)

# Binary data
bin = Mongo::Binary.new(File.read('image.png'), :generic)
bin = Mongo::Binary.from_base64('base64data', :uuid)

# Decimal128 for high-precision decimals
price = Mongo::Decimal128.new('19.99')

# Special keys for sorting
min = Mongo::MinKey.instance  # Sorts before all other values
max = Mongo::MaxKey.instance  # Sorts after all other values

# Regex
regex = Mongo::Regex.new('^test', 'i')
```

### Async Operations (Ruby 3.2+)

```ruby
require 'mongo_do'
require 'async'

# With async gem
Async do
  client = Mongo::Client.async_connect('wss://mongo.do/myapp', token: ENV['MONGO_DO_TOKEN'])
  users = client.db[:users]
  orders = client.db[:orders]

  # Parallel queries using promises
  user_promise = users.async_find_one(_id: '123')
  orders_promise = orders.async_find(user_id: '123')

  # Wait for both
  user = user_promise.await
  user_orders = orders_promise.await

  client.close
end

# Or use the Mongo.async helper
Mongo.async('wss://mongo.do/myapp', token: ENV['MONGO_DO_TOKEN']) do |client|
  users = client.db[:users]

  # Parallel operations
  users, orders, products = Mongo.gather(
    users.async_find(active: true),
    client.db[:orders].async_find(status: 'pending'),
    client.db[:products].async_find(in_stock: true)
  )
end

# Promise chaining
users.async_find_one(email: 'alice@example.com')
  .then { |user| orders.async_find(user_id: user['_id']) }
  .then { |orders| calculate_total(orders) }
  .await
```

### Aggregation Pipeline

```ruby
require 'mongo_do'

client = Mongo::Client.new('wss://mongo.do/myapp', token: ENV['MONGO_DO_TOKEN'])
orders = client.db[:orders]

# Standard aggregation
results = orders.aggregate([
  { '$match' => { status: 'completed' } },
  { '$group' => {
    '_id' => '$customer_id',
    'total' => { '$sum' => '$amount' },
    'count' => { '$sum' => 1 }
  }},
  { '$sort' => { 'total' => -1 } },
  { '$limit' => 10 }
]).to_a

# With cursor iteration
orders.aggregate([
  { '$match' => { created_at: { '$gte' => 1.week.ago } } }
]).each do |doc|
  process(doc)
end

client.close
```

### Fluent Query API

```ruby
require 'mongo_do'

client = Mongo::Client.new('wss://mongo.do/myapp', token: ENV['MONGO_DO_TOKEN'])
users = client.db[:users]

# Chain query modifiers
users.find(status: 'active')
  .sort(created_at: -1)
  .skip(20)
  .limit(10)
  .project(name: 1, email: 1)
  .each { |user| puts user }

# Get count
count = users.count_documents(status: 'active')

# Get distinct values
countries = users.distinct(:country, status: 'active')

client.close
```

### Index Management

```ruby
require 'mongo_do'

client = Mongo::Client.new('wss://mongo.do/myapp', token: ENV['MONGO_DO_TOKEN'])
users = client.db[:users]

# Create single index
users.create_index({ email: 1 }, unique: true)

# Create compound index
users.create_index({ status: 1, created_at: -1 })

# Create multiple indexes
users.create_indexes([
  { key: { name: 1 } },
  { key: { age: 1, country: 1 } }
])

# List indexes
users.list_indexes.each { |idx| puts idx }

# Drop index
users.drop_index('email_1')

client.close
```

### Bulk Operations

```ruby
require 'mongo_do'

client = Mongo::Client.new('wss://mongo.do/myapp', token: ENV['MONGO_DO_TOKEN'])
users = client.db[:users]

result = users.bulk_write([
  { insertOne: { document: { name: 'Alice' } } },
  { updateOne: { filter: { name: 'Bob' }, update: { '$set' => { active: true } } } },
  { deleteMany: { filter: { status: 'deleted' } } }
])

puts "Inserted: #{result.inserted_count}"
puts "Modified: #{result.modified_count}"
puts "Deleted: #{result.deleted_count}"

client.close
```

---

## Transport Options

### HTTP Transport (default for https:// URLs)

Best for simple request/response patterns:

```ruby
client = Mongo::Client.new('https://mongo.do/myapp',
  token: ENV['MONGO_DO_TOKEN'],
  timeout: 30,
  retry_count: 3
)
```

### WebSocket Transport (default for wss:// URLs)

Best for real-time updates, change streams, and pipelining:

```ruby
client = Mongo::Client.new('wss://mongo.do/myapp',
  token: ENV['MONGO_DO_TOKEN'],
  auto_reconnect: true,
  max_reconnects: 5
)
```

### Force specific transport

```ruby
# Force WebSocket even with https:// URL
client = Mongo::Client.new('https://mongo.do/myapp',
  transport: :websocket,
  token: ENV['MONGO_DO_TOKEN']
)

# Force HTTP even with wss:// URL
client = Mongo::Client.new('wss://mongo.do/myapp',
  transport: :http,
  token: ENV['MONGO_DO_TOKEN']
)
```

---

## Configuration

```ruby
require 'mongo_do'

Mongo.configure do |config|
  config.default_url = 'wss://mongo.do'
  config.default_transport_class = MongoDo::WebSocketRpcTransport
end

# Now connections use defaults
client = Mongo::Client.new('/myapp', token: ENV['MONGO_DO_TOKEN'])
```

---

## Error Handling

```ruby
require 'mongo_do'

begin
  client = Mongo::Client.new('wss://mongo.do/myapp', token: 'invalid')
  result = client.db[:users].find.to_a
rescue Mongo::ConnectionError => e
  puts "Connection failed: #{e.message}"
rescue Mongo::QueryError => e
  puts "Query failed: #{e.message}"
  puts "Suggestion: #{e.suggestion}" if e.suggestion
rescue Mongo::Error => e
  puts "Error [#{e.code}]: #{e.message}"
end
```

---

## Development

```bash
# Install dependencies
bundle install

# Run tests
bundle exec rake spec

# Run with coverage
bundle exec rake coverage

# Run linter
bundle exec rake rubocop

# Start console
bundle exec rake console

# Generate docs
bundle exec rake doc
```

---

## API Reference

### Mongo::Client

```ruby
client = Mongo::Client.new(uri, options = {})
client.connect                    # Connect to server
client.database(name = nil)       # Get database
client.db                         # Alias for database
client[name]                      # Get collection from default db
client.watch(pipeline, options)   # Watch cluster for changes
client.connected?                 # Check connection status
client.close                      # Close connection
```

### Mongo::Database

```ruby
db = client.database('mydb')
db[name]                          # Get collection
db.collection(name)               # Get collection
db.create_collection(name, opts)  # Create collection
db.drop                           # Drop database
db.list_collections               # List collections
db.collection_names               # Get collection names
db.command(cmd)                   # Run command
db.stats                          # Get database stats
db.watch(pipeline, options)       # Watch database for changes
db.ask(question, options)         # Natural language query
```

### Mongo::Collection

```ruby
coll = db[:users]
coll.insert_one(doc)              # Insert one document
coll.insert_many(docs)            # Insert multiple documents
coll.find(filter, options)        # Find documents (returns cursor)
coll.find_one(filter, options)    # Find one document
coll.find_one_and_update(...)     # Find and update atomically
coll.find_one_and_delete(...)     # Find and delete atomically
coll.find_one_and_replace(...)    # Find and replace atomically
coll.update_one(filter, update)   # Update one document
coll.update_many(filter, update)  # Update multiple documents
coll.replace_one(filter, doc)     # Replace one document
coll.delete_one(filter)           # Delete one document
coll.delete_many(filter)          # Delete multiple documents
coll.count_documents(filter)      # Count matching documents
coll.estimated_document_count     # Fast estimated count
coll.distinct(field, filter)      # Get distinct values
coll.aggregate(pipeline)          # Run aggregation pipeline
coll.bulk_write(operations)       # Bulk write operations
coll.create_index(keys, options)  # Create index
coll.create_indexes(specs)        # Create multiple indexes
coll.drop_index(name)             # Drop index
coll.drop_indexes                 # Drop all indexes
coll.list_indexes                 # List indexes
coll.drop                         # Drop collection
coll.rename(new_name)             # Rename collection
coll.watch(pipeline, options)     # Watch for changes
coll.ask(question, options)       # Natural language query
coll.explain_query(question)      # Explain natural language query
coll.suggest_queries(partial)     # Get query suggestions
```

### Mongo::FindCursor

```ruby
cursor = coll.find(filter)
cursor.sort(spec)                 # Set sort order
cursor.limit(n)                   # Limit results
cursor.skip(n)                    # Skip results
cursor.project(spec)              # Set projection
cursor.batch_size(n)              # Set batch size
cursor.max_time_ms(ms)            # Set max execution time
cursor.hint(hint)                 # Set index hint
cursor.comment(text)              # Set query comment
cursor.each { |doc| ... }         # Iterate documents
cursor.to_a                       # Get all as array
cursor.first                      # Get first document
cursor.next                       # Get next document
cursor.has_next?                  # Check for more documents
cursor.count                      # Count remaining
cursor.close                      # Close cursor
cursor.rewind                     # Reset cursor
```

### Mongo::ChangeStream

```ruby
stream = coll.watch(pipeline, options)
stream.each { |change| ... }      # Iterate changes
stream.next                       # Get next change
stream.has_next?                  # Check for changes
stream.try_next                   # Non-blocking next
stream.resume_token               # Get resume token
stream.close                      # Close stream
```

### Mongo::Promise

```ruby
promise = coll.async_find_one(filter)
promise.await                     # Wait for result
promise.then { |v| ... }          # Chain callback
promise.catch { |e| ... }         # Handle errors
Promise.all(p1, p2, p3)           # Wait for all
Promise.race(p1, p2, p3)          # Wait for first
```

---

## License

MIT
