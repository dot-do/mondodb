# DotDo.Mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```csharp
using DotDo.Mongo;

var users = await Mongo.Query("users who haven't logged in this month");
var vips = await Mongo.Query("customers with orders over $1000");
```

One using. Natural language queries. Zero infrastructure.

---

## Why DotDo.Mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **MongoDB.Driver compatible** - Drop-in replacement for the official MongoDB C# driver
- **Async/await** - Full Task-based async support with CancellationToken
- **Promise pipelining** - Chain operations with single round trip via RPC
- **LINQ support** - Use familiar LINQ syntax for queries

```csharp
// Three dependent operations, ONE network round trip:
var result = await Mongo.Query("customers in Texas")
    .Select(c => Mongo.Query($"orders for {c}"))
    .Select(o => Mongo.Query($"total revenue from {o}"));
```

---

## Installation

### NuGet Package Manager

```bash
Install-Package DotDo.Mongo
```

### .NET CLI

```bash
dotnet add package DotDo.Mongo
```

Requires .NET 8.0+.

---

## Quick Start

### Natural Language API

```csharp
using DotDo.Mongo;

// Query in plain English
var inactive = await Mongo.Query("users who haven't logged in this month");
var vips = await Mongo.Query("customers with orders over $1000");
var trending = await Mongo.Query("most popular products this week");

// Chain like sentences
var result = await Mongo.Query("users in Austin")
    .Select(user => Mongo.Query($"recent orders for {user}"))
    .Select(orders => Mongo.Query($"shipping status for {orders}"));

// Search semantically
var tutorials = await Mongo.Query("tutorials similar to machine learning")
    .Limit(10);
```

### MongoDB Compatible API

```csharp
using DotDo.Mongo;
using MongoDB.Bson;

var client = new MongoClient("https://your-worker.workers.dev");
var db = client.GetDatabase("myapp");
var users = db.GetCollection<User>("users");

// Standard MongoDB operations
await users.InsertOneAsync(new User
{
    Name = "Alice",
    Email = "alice@example.com"
});

var user = await users.Find(u => u.Email == "alice@example.com").FirstOrDefaultAsync();
```

---

## Natural Language Queries

The Query method translates natural language to optimized queries:

```csharp
// CRUD Operations
var alice = await Mongo.Query("user alice@example.com");
var active = await Mongo.Query("active users in Austin");
var vips = await Mongo.Query("users with 10+ orders");

// AI infers what you need
await Mongo.Query("alice@example.com");              // returns user
await Mongo.Query("orders for alice@example.com");   // returns orders
await Mongo.Query("alice order history");            // returns full timeline

// Aggregation
var revenue = await Mongo.Query("revenue by category this month");
var growth = await Mongo.Query("user growth rate last 6 months");
var top = await Mongo.Query("top 10 customers by lifetime value");
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```csharp
// Build the pipeline - nothing sent yet
var users = Mongo.Query("active users");
var orders = users.Select(u => Mongo.Query($"pending orders for {u.Id}"));
var totals = orders.Select(o => o.Total);

// NOW we send everything - one round trip
var result = await totals;

// Parallel fan-out with Task.WhenAll
var results = await Task.WhenAll(
    Mongo.Query("active users"),
    Mongo.Query("pending orders"),
    Mongo.Query("low stock products")
);

var (users, orders, products) = (results[0], results[1], results[2]);
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```csharp
// Semantic search in plain English
var similar = await Mongo.Query("tutorials similar to machine learning").Limit(10);
var related = await Mongo.Query("products like this hiking backpack");
var answers = await Mongo.Query("documents about serverless architecture");

// Embeddings are automatic
await Mongo.Query("index products for semantic search");
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```csharp
var results = await Mongo.Query("serverless database in title and content").Highlight();
var fuzzy = await Mongo.Query("find articles matching \"kubernets\"").Fuzzy();
var scored = await Mongo.Query("search \"edge computing\" with relevance scores");
```

---

## Real-Time Changes

Watch for database changes with IAsyncEnumerable:

```csharp
await foreach (var change in Mongo.Query("watch orders for changes").ToAsyncEnumerable())
{
    switch (change.OperationType)
    {
        case "insert":
            await Notify(change.FullDocument.Customer);
            break;
        case "update":
            await UpdateDashboard(change.FullDocument);
            break;
    }
}

// Or query changes directly
var recent = await Mongo.Query("changes to products in last hour");
```

---

## Transactions

Atomic operations with natural language:

```csharp
await Mongo.Query(@"
    transfer $100 from alice to bob:
    - subtract from alice balance
    - add to bob balance
    - log the transfer
").Atomic();

// Or chain with transactions
await Mongo.Transaction(async tx =>
{
    await tx.Query("alice account").Debit(100);
    await tx.Query("bob account").Credit(100);
});
```

---

## Type-Safe Documents

Use C# records or classes for strongly-typed documents:

```csharp
using DotDo.Mongo;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

public record User(
    [property: BsonId] ObjectId Id,
    string Name,
    string Email,
    DateTime CreatedAt
);

var client = new MongoClient("https://db.example.com");
var db = client.GetDatabase("myapp");
var users = db.GetCollection<User>("users");

// Type-safe operations
var user = await users.Find(u => u.Email == "alice@example.com").FirstOrDefaultAsync();

await users.InsertOneAsync(new User(
    ObjectId.GenerateNewId(),
    "Bob",
    "bob@example.com",
    DateTime.UtcNow
));
```

---

## LINQ Queries

Use LINQ for type-safe MongoDB queries:

```csharp
var adults = await users
    .AsQueryable()
    .Where(u => u.Age >= 18 && u.Status == "active")
    .ToListAsync();

var stats = await users
    .AsQueryable()
    .Where(u => u.CreatedAt >= lastMonth)
    .GroupBy(u => u.Country)
    .Select(g => new { Country = g.Key, Count = g.Count(), AvgAge = g.Average(u => u.Age) })
    .OrderByDescending(s => s.Count)
    .ToListAsync();
```

---

## Error Handling

```csharp
using DotDo.Mongo;

try
{
    var result = await Mongo.Query("complex query here");
}
catch (QueryException ex)
{
    Console.WriteLine($"Query failed: {ex.Message}");
    if (ex.Suggestion is not null)
    {
        Console.WriteLine($"Suggestion: {ex.Suggestion}");
    }
}
catch (ConnectionException ex)
{
    Console.WriteLine($"Connection lost: {ex.Message}");
}
```

---

## Configuration

```csharp
using DotDo.Mongo;

Mongo.Configure(new MongoConfig
{
    Name = "my-database",
    Domain = "db.myapp.com",

    // Enable features
    Vector = true,           // Vector search with Vectorize
    Fulltext = true,         // FTS5 text search
    Analytics = true,        // OLAP with ClickHouse

    // Storage tiers
    Storage = new StorageConfig
    {
        Hot = "sqlite",      // Recent data, fast queries
        Warm = "r2",         // Historical data
        Cold = "archive"     // Long-term retention
    }
});
```

---

## Dependency Injection

```csharp
using DotDo.Mongo;

// In Program.cs or Startup.cs
builder.Services.AddDotDoMongo(options =>
{
    options.ConnectionString = "https://db.example.com";
    options.DatabaseName = "myapp";
});

// In your service
public class UserService
{
    private readonly IMongoCollection<User> _users;

    public UserService(IMongoDatabase database)
    {
        _users = database.GetCollection<User>("users");
    }

    public async Task<User?> GetByEmail(string email)
    {
        return await _users.Find(u => u.Email == email).FirstOrDefaultAsync();
    }
}
```

---

## API Reference

### Static Methods

```csharp
public static class Mongo
{
    /// <summary>Execute a natural language query.</summary>
    public static MongoQuery<T> Query<T>(string query);

    /// <summary>Execute a block within a transaction.</summary>
    public static Task<T> Transaction<T>(Func<ITransactionContext, Task<T>> action);

    /// <summary>Configure the client.</summary>
    public static void Configure(MongoConfig config);
}
```

### Client

```csharp
public class MongoClient : IDisposable
{
    public MongoClient(string connectionString);
    public IMongoDatabase GetDatabase(string name);
    public void Dispose();
}

public interface IMongoDatabase
{
    IMongoCollection<T> GetCollection<T>(string name);
    Task<IReadOnlyList<string>> ListCollectionNamesAsync();
    Task DropAsync();
}

public interface IMongoCollection<T>
{
    IFindFluent<T, T> Find(Expression<Func<T, bool>> filter);
    Task<T?> FindOneAsync(Expression<Func<T, bool>> filter);
    Task<InsertOneResult> InsertOneAsync(T document);
    Task<InsertManyResult> InsertManyAsync(IEnumerable<T> documents);
    Task<UpdateResult> UpdateOneAsync(Expression<Func<T, bool>> filter, UpdateDefinition<T> update);
    Task<UpdateResult> UpdateManyAsync(Expression<Func<T, bool>> filter, UpdateDefinition<T> update);
    Task<DeleteResult> DeleteOneAsync(Expression<Func<T, bool>> filter);
    Task<DeleteResult> DeleteManyAsync(Expression<Func<T, bool>> filter);
    IAggregateFluent<T> Aggregate();
    IQueryable<T> AsQueryable();
}
```

### MongoQuery

```csharp
public class MongoQuery<T>
{
    /// <summary>Limit results to n documents.</summary>
    public MongoQuery<T> Limit(int n);

    /// <summary>Skip the first n documents.</summary>
    public MongoQuery<T> Skip(int n);

    /// <summary>Sort results by field.</summary>
    public MongoQuery<T> Sort(string field, SortDirection direction = SortDirection.Ascending);

    /// <summary>Enable search result highlighting.</summary>
    public MongoQuery<T> Highlight();

    /// <summary>Enable fuzzy matching.</summary>
    public MongoQuery<T> Fuzzy();

    /// <summary>Transform results server-side.</summary>
    public MongoQuery<IReadOnlyList<R>> Select<R>(Func<T, R> selector);

    /// <summary>Filter results server-side.</summary>
    public MongoQuery<IReadOnlyList<T>> Where(Func<T, bool> predicate);

    /// <summary>Reduce results server-side.</summary>
    public MongoQuery<R> Aggregate<R>(R seed, Func<R, T, R> accumulator);

    /// <summary>Execute as an atomic transaction.</summary>
    public MongoQuery<T> Atomic();

    /// <summary>Convert to IAsyncEnumerable for streaming.</summary>
    public IAsyncEnumerable<T> ToAsyncEnumerable();

    /// <summary>Await the query result.</summary>
    public TaskAwaiter<T> GetAwaiter();
}
```

---

## Complete Example

```csharp
using DotDo.Mongo;
using MongoDB.Bson;

public record User(
    ObjectId Id,
    string Name,
    string Email,
    DateTime CreatedAt
);

public class Program
{
    public static async Task Main()
    {
        // Natural language queries
        Console.WriteLine("=== Natural Language API ===");

        var inactive = await Mongo.Query<List<User>>(
            "users who haven't logged in this month");
        Console.WriteLine($"Found {inactive.Count} inactive users");

        var revenue = await Mongo.Query<Dictionary<string, decimal>>(
            "total revenue by category this quarter");
        Console.WriteLine($"Revenue by category: {string.Join(", ", revenue)}");

        // MongoDB compatible API
        Console.WriteLine("\n=== MongoDB Compatible API ===");

        using var client = new MongoClient("https://db.example.com");
        var db = client.GetDatabase("myapp");
        var users = db.GetCollection<User>("users");

        // Insert
        await users.InsertOneAsync(new User(
            ObjectId.GenerateNewId(),
            "Alice",
            "alice@example.com",
            DateTime.UtcNow
        ));

        // Query
        var alice = await users.Find(u => u.Email == "alice@example.com").FirstOrDefaultAsync();
        if (alice is not null)
        {
            Console.WriteLine($"Found user: {alice.Name}");
        }

        // Aggregation with LINQ
        var stats = await users
            .AsQueryable()
            .GroupBy(u => 1)
            .Select(g => new { Total = g.Count() })
            .FirstOrDefaultAsync();
        Console.WriteLine($"Total users: {stats?.Total}");

        // Pipelining
        Console.WriteLine("\n=== Promise Pipelining ===");

        var result = await Mongo.Query("active customers")
            .Select(c => Mongo.Query($"orders for {c}"))
            .Select(o => Mongo.Query($"calculate total from {o}"));
        Console.WriteLine($"Totals: {result}");
    }
}
```

---

## License

MIT
