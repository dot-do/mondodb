# go.dotdo.dev/mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```go
users, err := mongo.Query(ctx, "users who haven't logged in this month")
vips, err := mongo.Query(ctx, "customers with orders over $1000")
```

One import. Natural language queries. Zero infrastructure.

---

## Why go.dotdo.dev/mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **mongo-go-driver compatible** - Drop-in replacement for the official MongoDB Go driver
- **Context-first** - Every call respects `context.Context` for timeouts and cancellation
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Standard Go patterns** - `(value, error)` returns, interfaces for testing

```go
// Three dependent operations, ONE network round trip:
result, err := mongo.Pipeline(ctx,
    mongo.Query("customers in Texas"),
    mongo.Map(func(c Customer) any { return mongo.Query("orders for %s", c.ID) }),
    mongo.Map(func(o []Order) any { return mongo.Query("total revenue from %v", o) }),
)
```

---

## Installation

```bash
go get go.dotdo.dev/mongo
```

Requires Go 1.21+.

---

## Quick Start

### Natural Language API

```go
package main

import (
    "context"
    "log"

    "go.dotdo.dev/mongo"
)

func main() {
    ctx := context.Background()

    // Query in plain English
    inactive, err := mongo.Query(ctx, "users who haven't logged in this month")
    if err != nil {
        log.Fatal(err)
    }

    vips, err := mongo.Query(ctx, "customers with orders over $1000")
    trending, err := mongo.Query(ctx, "most popular products this week")

    // Search semantically
    tutorials, err := mongo.Query(ctx, "tutorials similar to machine learning",
        mongo.Limit(10))
}
```

### MongoDB Compatible API

```go
package main

import (
    "context"
    "log"

    "go.dotdo.dev/mongo"
    "go.mongodb.org/mongo-driver/bson"
)

func main() {
    ctx := context.Background()

    client, err := mongo.Connect(ctx, "https://your-worker.workers.dev")
    if err != nil {
        log.Fatal(err)
    }
    defer client.Disconnect(ctx)

    db := client.Database("myapp")
    users := db.Collection("users")

    // Standard MongoDB operations
    _, err = users.InsertOne(ctx, bson.M{
        "name":  "Alice",
        "email": "alice@example.com",
    })

    var user User
    err = users.FindOne(ctx, bson.M{"email": "alice@example.com"}).Decode(&user)
}
```

---

## Natural Language Queries

The Query function translates natural language to optimized queries:

```go
// CRUD Operations
alice, _ := mongo.Query(ctx, "user alice@example.com")
active, _ := mongo.Query(ctx, "active users in Austin")
vips, _ := mongo.Query(ctx, "users with 10+ orders")

// AI infers what you need
mongo.Query(ctx, "alice@example.com")              // returns user
mongo.Query(ctx, "orders for alice@example.com")   // returns orders
mongo.Query(ctx, "alice order history")            // returns full timeline

// Aggregation
revenue, _ := mongo.Query(ctx, "revenue by category this month")
growth, _ := mongo.Query(ctx, "user growth rate last 6 months")
top, _ := mongo.Query(ctx, "top 10 customers by lifetime value")
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```go
// Build the pipeline
pipe := mongo.NewPipeline(ctx)
users := pipe.Query("active users")
orders := pipe.Map(users, func(u User) any {
    return mongo.Query("pending orders for %s", u.ID)
})
totals := pipe.Map(orders, func(o []Order) any {
    return o.Total
})

// Execute - ONE round trip
result, err := pipe.Execute()

// Parallel fan-out with errgroup
g, ctx := errgroup.WithContext(ctx)

var users []User
var orders []Order
var products []Product

g.Go(func() error {
    var err error
    users, err = mongo.Query[[]User](ctx, "active users")
    return err
})
g.Go(func() error {
    var err error
    orders, err = mongo.Query[[]Order](ctx, "pending orders")
    return err
})
g.Go(func() error {
    var err error
    products, err = mongo.Query[[]Product](ctx, "low stock products")
    return err
})

if err := g.Wait(); err != nil {
    log.Fatal(err)
}
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```go
// Semantic search in plain English
similar, _ := mongo.Query(ctx, "tutorials similar to machine learning", mongo.Limit(10))
related, _ := mongo.Query(ctx, "products like this hiking backpack")
answers, _ := mongo.Query(ctx, "documents about serverless architecture")

// Embeddings are automatic
mongo.Query(ctx, "index products for semantic search")
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```go
results, _ := mongo.Query(ctx, "serverless database in title and content", mongo.Highlight())
fuzzy, _ := mongo.Query(ctx, `find articles matching "kubernets"`, mongo.Fuzzy())
scored, _ := mongo.Query(ctx, `search "edge computing" with relevance scores`)
```

---

## Real-Time Changes

Watch for database changes with channels:

```go
changes, err := mongo.Watch(ctx, "orders for changes")
if err != nil {
    log.Fatal(err)
}
defer changes.Close()

for change := range changes.C {
    switch change.OperationType {
    case "insert":
        notify(change.FullDocument.Customer)
    case "update":
        updateDashboard(change.FullDocument)
    }
}

// Or query changes directly
recent, _ := mongo.Query(ctx, "changes to products in last hour")
```

---

## Transactions

Atomic operations with natural language:

```go
err := mongo.Atomic(ctx, `
  transfer $100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer
`)

// Or chain with transactions
err := mongo.Transaction(ctx, func(tx *mongo.Tx) error {
    if err := tx.Query("alice account").Debit(100); err != nil {
        return err
    }
    return tx.Query("bob account").Credit(100)
})
```

---

## Type-Safe Documents

Use Go structs for strongly-typed documents:

```go
type User struct {
    ID        primitive.ObjectID `bson:"_id,omitempty"`
    Name      string             `bson:"name"`
    Email     string             `bson:"email"`
    CreatedAt time.Time          `bson:"created_at"`
}

client, _ := mongo.Connect(ctx, "https://db.example.com")
db := client.Database("myapp")
users := mongo.Collection[User](db, "users")

// Type-safe operations
user, err := users.FindOne(ctx, bson.M{"email": "alice@example.com"})
// user is *User

_, err = users.InsertOne(ctx, &User{
    Name:      "Bob",
    Email:     "bob@example.com",
    CreatedAt: time.Now(),
})
```

---

## Error Handling

```go
import "go.dotdo.dev/mongo"

result, err := mongo.Query(ctx, "complex query here")
if err != nil {
    var queryErr *mongo.QueryError
    if errors.As(err, &queryErr) {
        log.Printf("Query failed: %s", queryErr.Message)
        if queryErr.Suggestion != "" {
            log.Printf("Suggestion: %s", queryErr.Suggestion)
        }
        return
    }

    var connErr *mongo.ConnectionError
    if errors.As(err, &connErr) {
        log.Printf("Connection lost: %s", connErr)
        return
    }

    if errors.Is(err, context.DeadlineExceeded) {
        log.Printf("Query timed out")
        return
    }

    log.Fatal(err)
}
```

---

## Configuration

```go
import "go.dotdo.dev/mongo"

db, err := mongo.New(
    mongo.WithName("my-database"),
    mongo.WithDomain("db.myapp.com"),
    mongo.WithVector(true),           // Vector search with Vectorize
    mongo.WithFulltext(true),         // FTS5 text search
    mongo.WithAnalytics(true),        // OLAP with ClickHouse
    mongo.WithStorage(mongo.StorageConfig{
        Hot:  "sqlite",   // Recent data, fast queries
        Warm: "r2",       // Historical data
        Cold: "archive",  // Long-term retention
    }),
)
```

---

## API Reference

### Functions

```go
// Query executes a natural language query.
func Query[T any](ctx context.Context, query string, opts ...QueryOption) (T, error)

// Connect creates a MongoDB-compatible client.
func Connect(ctx context.Context, uri string, opts ...ClientOption) (*Client, error)

// Watch creates a change stream for the given query.
func Watch(ctx context.Context, query string) (*ChangeStream, error)

// Atomic executes a natural language query as an atomic transaction.
func Atomic(ctx context.Context, query string) error

// Transaction executes a function within a transaction.
func Transaction(ctx context.Context, fn func(*Tx) error) error
```

### Types

```go
// Client is a MongoDB-compatible client.
type Client struct { ... }

func (c *Client) Database(name string) *Database
func (c *Client) Disconnect(ctx context.Context) error

// Database represents a MongoDB database.
type Database struct { ... }

func (d *Database) Collection(name string) *Collection
func (d *Database) ListCollectionNames(ctx context.Context) ([]string, error)
func (d *Database) Drop(ctx context.Context) error

// Collection represents a MongoDB collection.
type Collection struct { ... }

func (c *Collection) Find(ctx context.Context, filter any) (*Cursor, error)
func (c *Collection) FindOne(ctx context.Context, filter any) *SingleResult
func (c *Collection) InsertOne(ctx context.Context, doc any) (*InsertOneResult, error)
func (c *Collection) InsertMany(ctx context.Context, docs []any) (*InsertManyResult, error)
func (c *Collection) UpdateOne(ctx context.Context, filter, update any) (*UpdateResult, error)
func (c *Collection) UpdateMany(ctx context.Context, filter, update any) (*UpdateResult, error)
func (c *Collection) DeleteOne(ctx context.Context, filter any) (*DeleteResult, error)
func (c *Collection) DeleteMany(ctx context.Context, filter any) (*DeleteResult, error)
func (c *Collection) Aggregate(ctx context.Context, pipeline any) (*Cursor, error)

// Pipeline builds multi-call pipelines for single round trips.
type Pipeline struct { ... }

func NewPipeline(ctx context.Context) *Pipeline
func (p *Pipeline) Query(query string, args ...any) *Ref
func (p *Pipeline) Map(ref *Ref, fn any) *Ref
func (p *Pipeline) Execute() (any, error)

// ChangeStream represents a real-time change stream.
type ChangeStream struct {
    C <-chan ChangeEvent
}

func (s *ChangeStream) Close() error

// QueryOption configures a query.
type QueryOption func(*queryOptions)

func Limit(n int64) QueryOption
func Skip(n int64) QueryOption
func Sort(field string, direction int) QueryOption
func Highlight() QueryOption
func Fuzzy() QueryOption
```

---

## Complete Example

```go
package main

import (
    "context"
    "fmt"
    "log"
    "time"

    "go.dotdo.dev/mongo"
    "go.mongodb.org/mongo-driver/bson"
)

type User struct {
    Name  string `bson:"name"`
    Email string `bson:"email"`
}

func main() {
    ctx := context.Background()

    // Natural language queries
    fmt.Println("=== Natural Language API ===")

    inactive, err := mongo.Query[[]User](ctx, "users who haven't logged in this month")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Found %d inactive users\n", len(inactive))

    revenue, err := mongo.Query[map[string]float64](ctx, "total revenue by category this quarter")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Revenue by category: %v\n", revenue)

    // MongoDB compatible API
    fmt.Println("\n=== MongoDB Compatible API ===")

    client, err := mongo.Connect(ctx, "https://db.example.com")
    if err != nil {
        log.Fatal(err)
    }
    defer client.Disconnect(ctx)

    db := client.Database("myapp")
    users := db.Collection("users")

    // Insert
    _, err = users.InsertOne(ctx, User{
        Name:  "Alice",
        Email: "alice@example.com",
    })
    if err != nil {
        log.Fatal(err)
    }

    // Query
    var alice User
    err = users.FindOne(ctx, bson.M{"email": "alice@example.com"}).Decode(&alice)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Found user: %s\n", alice.Name)

    // Aggregation
    cursor, err := users.Aggregate(ctx, []bson.M{
        {"$group": bson.M{"_id": nil, "total": bson.M{"$sum": 1}}},
    })
    if err != nil {
        log.Fatal(err)
    }
    defer cursor.Close(ctx)

    if cursor.Next(ctx) {
        var result struct{ Total int }
        cursor.Decode(&result)
        fmt.Printf("Total users: %d\n", result.Total)
    }

    // Pipelining
    fmt.Println("\n=== Promise Pipelining ===")

    pipe := mongo.NewPipeline(ctx)
    customersRef := pipe.Query("active customers")
    ordersRef := pipe.Map(customersRef, func(c User) any {
        return mongo.Query("orders for %s", c.Email)
    })
    totalsRef := pipe.Map(ordersRef, func(orders []any) any {
        return mongo.Query("calculate total from %v", orders)
    })

    result, err := pipe.Execute()
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Totals: %v\n", result)
}
```

---

## License

MIT
