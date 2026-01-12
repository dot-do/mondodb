# :dotdo_mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```elixir
import DotDo.Mongo

users = mongo("users who haven't logged in this month")
vips = mongo("customers with orders over $1000")
```

One import. Natural language queries. Zero infrastructure.

---

## Why :dotdo_mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **mongodb/mongodb-driver compatible** - Drop-in replacement for official MongoDB Elixir drivers
- **Elixir-native** - Pipes, pattern matching, and OTP patterns
- **Promise pipelining** - Chain operations with single round trip via RPC
- **GenServer integration** - Works seamlessly with OTP supervision trees

```elixir
# Three dependent operations, ONE network round trip:
result =
  mongo("customers in Texas")
  |> DotDo.rmap(fn c -> mongo("orders for #{c}") end)
  |> DotDo.rmap(fn o -> mongo("total revenue from #{o}") end)
```

---

## Installation

Add to your `mix.exs`:

```elixir
defp deps do
  [
    {:dotdo_mongo, "~> 0.1.0"}
  ]
end
```

Then run:

```bash
mix deps.get
```

Requires Elixir 1.15+ and OTP 26+.

---

## Quick Start

### Natural Language API

```elixir
import DotDo.Mongo

# Query in plain English
inactive = mongo("users who haven't logged in this month")
vips = mongo("customers with orders over $1000")
trending = mongo("most popular products this week")

# Chain with pipes
result =
  mongo("users in Austin")
  |> DotDo.rmap(fn user -> mongo("recent orders for #{user}") end)
  |> DotDo.rmap(fn orders -> mongo("shipping status for #{orders}") end)

# Search semantically
tutorials =
  mongo("tutorials similar to machine learning")
  |> limit(10)
```

### MongoDB Compatible API

```elixir
alias DotDo.Mongo.{Client, Collection}

{:ok, client} = Client.connect("https://your-worker.workers.dev")
db = Client.database(client, "myapp")
users = Collection.new(db, "users")

# Standard MongoDB operations
{:ok, _} = Collection.insert_one(users, %{
  name: "Alice",
  email: "alice@example.com"
})

{:ok, user} = Collection.find_one(users, %{email: "alice@example.com"})
```

---

## Natural Language Queries

The mongo function translates natural language to optimized queries:

```elixir
# CRUD Operations
alice = mongo("user alice@example.com")
active = mongo("active users in Austin")
vips = mongo("users with 10+ orders")

# AI infers what you need
mongo("alice@example.com")              # returns user
mongo("orders for alice@example.com")   # returns orders
mongo("alice order history")            # returns full timeline

# Aggregation
revenue = mongo("revenue by category this month")
growth = mongo("user growth rate last 6 months")
top = mongo("top 10 customers by lifetime value")
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```elixir
# Build the pipeline - nothing sent yet
users = mongo("active users")
orders = users |> DotDo.rmap(fn u -> mongo("pending orders for #{u.id}") end)
totals = orders |> DotDo.rmap(fn o -> o.total end)

# NOW we send everything - one round trip
result = DotDo.await(totals)

# Parallel fan-out with Task.async_stream
tasks = [
  Task.async(fn -> mongo("active users") end),
  Task.async(fn -> mongo("pending orders") end),
  Task.async(fn -> mongo("low stock products") end)
]

[users, orders, products] = Task.await_many(tasks)
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```elixir
# Semantic search in plain English
similar = mongo("tutorials similar to machine learning") |> limit(10)
related = mongo("products like this hiking backpack")
answers = mongo("documents about serverless architecture")

# Embeddings are automatic
mongo("index products for semantic search")
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```elixir
results = mongo("serverless database in title and content") |> highlight()
fuzzy = mongo(~s(find articles matching "kubernets")) |> fuzzy()
scored = mongo(~s(search "edge computing" with relevance scores))
```

---

## Real-Time Changes

Watch for database changes with GenStage or Flow:

```elixir
# With Flow
mongo("watch orders for changes")
|> Flow.from_enumerable()
|> Flow.each(fn change ->
  case change.operation_type do
    "insert" -> notify(change.full_document.customer)
    "update" -> update_dashboard(change.full_document)
    _ -> :ok
  end
end)
|> Flow.run()

# Or query changes directly
recent = mongo("changes to products in last hour")
```

---

## Transactions

Atomic operations with natural language:

```elixir
mongo("""
  transfer $100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer
""")
|> atomic()

# Or chain with transactions
DotDo.Mongo.transaction(fn tx ->
  tx |> query("alice account") |> debit(100)
  tx |> query("bob account") |> credit(100)
end)
```

---

## Type-Safe Documents

Use Ecto-style schemas for strongly-typed documents:

```elixir
defmodule User do
  use DotDo.Mongo.Document

  document do
    field :_id, :object_id
    field :name, :string
    field :email, :string
    field :created_at, :datetime, default: &DateTime.utc_now/0
  end
end

{:ok, client} = Client.connect("https://db.example.com")
db = Client.database(client, "myapp")
users = Collection.new(db, "users", schema: User)

# Type-safe operations
{:ok, user} = Collection.find_one(users, %{email: "alice@example.com"})
# user is %User{}

{:ok, _} = Collection.insert_one(users, %User{
  name: "Bob",
  email: "bob@example.com"
})
```

---

## Pattern Matching

```elixir
# Pattern match on query results
case mongo("user alice@example.com") do
  %{status: "active"} = user -> process_active(user)
  %{status: "inactive"} = user -> reactivate(user)
  nil -> create_user("alice@example.com")
end

# With with/1 for error handling
with {:ok, user} <- mongo("user alice@example.com"),
     {:ok, orders} <- mongo("orders for #{user.id}"),
     {:ok, total} <- calculate_total(orders) do
  {:ok, %{user: user, total: total}}
else
  {:error, reason} -> {:error, reason}
  nil -> {:error, :not_found}
end
```

---

## Error Handling

```elixir
import DotDo.Mongo

case mongo("complex query here") do
  {:ok, result} ->
    IO.inspect(result, label: "Result")

  {:error, %QueryError{message: msg, suggestion: suggestion}} ->
    IO.puts("Query failed: #{msg}")
    if suggestion, do: IO.puts("Suggestion: #{suggestion}")

  {:error, %ConnectionError{message: msg}} ->
    IO.puts("Connection lost: #{msg}")
end

# Or with bang functions
try do
  result = mongo!("complex query here")
  IO.inspect(result)
rescue
  e in QueryError -> IO.puts("Query failed: #{e.message}")
  e in ConnectionError -> IO.puts("Connection lost: #{e.message}")
end
```

---

## Configuration

```elixir
# config/config.exs
config :dotdo_mongo,
  name: "my-database",
  domain: "db.myapp.com",
  vector: true,           # Vector search with Vectorize
  fulltext: true,         # FTS5 text search
  analytics: true,        # OLAP with ClickHouse
  storage: [
    hot: "sqlite",        # Recent data, fast queries
    warm: "r2",           # Historical data
    cold: "archive"       # Long-term retention
  ]
```

---

## OTP Integration

```elixir
defmodule MyApp.MongoSupervisor do
  use Supervisor

  def start_link(opts) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    children = [
      {DotDo.Mongo.Pool, [
        name: :mongo_pool,
        size: 10,
        url: "https://db.example.com"
      ]},
      {DotDo.Mongo.ChangeWatcher, [
        query: "watch orders for changes",
        handler: MyApp.OrderHandler
      ]}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end
```

---

## API Reference

### Functions

```elixir
# Execute a natural language query
@spec mongo(String.t()) :: term() | {:error, term()}
def mongo(query)

# Execute with options
@spec mongo(String.t(), keyword()) :: term() | {:error, term()}
def mongo(query, opts)

# Bang version that raises on error
@spec mongo!(String.t()) :: term()
def mongo!(query)

# Execute within a transaction
@spec transaction((Transaction.t() -> term())) :: {:ok, term()} | {:error, term()}
def transaction(fun)
```

### Client

```elixir
defmodule DotDo.Mongo.Client do
  @spec connect(String.t()) :: {:ok, t()} | {:error, term()}
  def connect(uri)

  @spec database(t(), String.t()) :: Database.t()
  def database(client, name)

  @spec close(t()) :: :ok
  def close(client)
end

defmodule DotDo.Mongo.Collection do
  @spec new(Database.t(), String.t(), keyword()) :: t()
  def new(database, name, opts \\ [])

  @spec find(t(), map()) :: {:ok, [map()]} | {:error, term()}
  def find(collection, filter \\ %{})

  @spec find_one(t(), map()) :: {:ok, map() | nil} | {:error, term()}
  def find_one(collection, filter)

  @spec insert_one(t(), map()) :: {:ok, InsertOneResult.t()} | {:error, term()}
  def insert_one(collection, document)

  @spec insert_many(t(), [map()]) :: {:ok, InsertManyResult.t()} | {:error, term()}
  def insert_many(collection, documents)

  @spec update_one(t(), map(), map()) :: {:ok, UpdateResult.t()} | {:error, term()}
  def update_one(collection, filter, update)

  @spec update_many(t(), map(), map()) :: {:ok, UpdateResult.t()} | {:error, term()}
  def update_many(collection, filter, update)

  @spec delete_one(t(), map()) :: {:ok, DeleteResult.t()} | {:error, term()}
  def delete_one(collection, filter)

  @spec delete_many(t(), map()) :: {:ok, DeleteResult.t()} | {:error, term()}
  def delete_many(collection, filter)

  @spec aggregate(t(), [map()]) :: {:ok, [map()]} | {:error, term()}
  def aggregate(collection, pipeline)
end
```

### MongoQuery

```elixir
defmodule DotDo.Mongo.Query do
  @spec limit(t(), integer()) :: t()
  def limit(query, n)

  @spec skip(t(), integer()) :: t()
  def skip(query, n)

  @spec sort(t(), String.t(), :asc | :desc) :: t()
  def sort(query, field, direction \\ :asc)

  @spec highlight(t()) :: t()
  def highlight(query)

  @spec fuzzy(t()) :: t()
  def fuzzy(query)

  @spec atomic(t()) :: t()
  def atomic(query)
end
```

---

## Complete Example

```elixir
defmodule MyApp do
  import DotDo.Mongo
  alias DotDo.Mongo.{Client, Collection}

  defmodule User do
    defstruct [:_id, :name, :email, :created_at]
  end

  def run do
    # Natural language queries
    IO.puts("=== Natural Language API ===")

    inactive = mongo("users who haven't logged in this month")
    IO.puts("Found #{length(inactive)} inactive users")

    revenue = mongo("total revenue by category this quarter")
    IO.puts("Revenue by category: #{inspect(revenue)}")

    # MongoDB compatible API
    IO.puts("\n=== MongoDB Compatible API ===")

    {:ok, client} = Client.connect("https://db.example.com")

    try do
      db = Client.database(client, "myapp")
      users = Collection.new(db, "users")

      # Insert
      {:ok, _} = Collection.insert_one(users, %{
        name: "Alice",
        email: "alice@example.com",
        created_at: DateTime.utc_now()
      })

      # Query
      case Collection.find_one(users, %{email: "alice@example.com"}) do
        {:ok, alice} when not is_nil(alice) ->
          IO.puts("Found user: #{alice.name}")
        _ ->
          IO.puts("User not found")
      end

      # Aggregation
      {:ok, stats} = Collection.aggregate(users, [
        %{"$group" => %{"_id" => nil, "total" => %{"$sum" => 1}}}
      ])
      IO.puts("Total users: #{hd(stats)["total"]}")

    after
      Client.close(client)
    end

    # Pipelining
    IO.puts("\n=== Promise Pipelining ===")

    result =
      mongo("active customers")
      |> DotDo.rmap(fn c -> mongo("orders for #{c}") end)
      |> DotDo.rmap(fn o -> mongo("calculate total from #{o}") end)
      |> DotDo.await()

    IO.puts("Totals: #{inspect(result)}")
  end
end

MyApp.run()
```

---

## License

MIT
