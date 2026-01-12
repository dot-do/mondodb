# com.dotdo:mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```java
import com.dotdo.Mongo;

var users = Mongo.query("users who haven't logged in this month");
var vips = Mongo.query("customers with orders over $1000");
```

One import. Natural language queries. Zero infrastructure.

---

## Why com.dotdo:mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **MongoDB Java Driver compatible** - Drop-in replacement for the official MongoDB Java driver
- **CompletableFuture support** - Full async/reactive support with Project Reactor integration
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Type-safe** - Full generics support for compile-time type checking

```java
// Three dependent operations, ONE network round trip:
var result = Mongo.query("customers in Texas")
    .map(c -> Mongo.query("orders for " + c))
    .map(o -> Mongo.query("total revenue from " + o))
    .get();
```

---

## Installation

### Maven

```xml
<dependency>
    <groupId>com.dotdo</groupId>
    <artifactId>mongo</artifactId>
    <version>0.1.0</version>
</dependency>
```

### Gradle

```kotlin
implementation("com.dotdo:mongo:0.1.0")
```

Requires Java 17+.

---

## Quick Start

### Natural Language API

```java
import com.dotdo.Mongo;

public class Main {
    public static void main(String[] args) {
        // Query in plain English
        var inactive = Mongo.query("users who haven't logged in this month");
        var vips = Mongo.query("customers with orders over $1000");
        var trending = Mongo.query("most popular products this week");

        // Chain like sentences
        var result = Mongo.query("users in Austin")
            .map(user -> Mongo.query("recent orders for " + user))
            .map(orders -> Mongo.query("shipping status for " + orders))
            .get();

        // Search semantically
        var tutorials = Mongo.query("tutorials similar to machine learning")
            .limit(10)
            .get();
    }
}
```

### MongoDB Compatible API

```java
import com.dotdo.mongo.MongoClient;
import com.dotdo.mongo.MongoClients;
import org.bson.Document;

public class Main {
    public static void main(String[] args) {
        var client = MongoClients.create("https://your-worker.workers.dev");
        var db = client.getDatabase("myapp");
        var users = db.getCollection("users");

        // Standard MongoDB operations
        users.insertOne(new Document()
            .append("name", "Alice")
            .append("email", "alice@example.com"));

        var user = users.find(eq("email", "alice@example.com")).first();
    }
}
```

---

## Natural Language Queries

The query method translates natural language to optimized queries:

```java
// CRUD Operations
var alice = Mongo.query("user alice@example.com");
var active = Mongo.query("active users in Austin");
var vips = Mongo.query("users with 10+ orders");

// AI infers what you need
Mongo.query("alice@example.com");              // returns user
Mongo.query("orders for alice@example.com");   // returns orders
Mongo.query("alice order history");            // returns full timeline

// Aggregation
var revenue = Mongo.query("revenue by category this month");
var growth = Mongo.query("user growth rate last 6 months");
var top = Mongo.query("top 10 customers by lifetime value");
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```java
// Build the pipeline - nothing sent yet
var users = Mongo.query("active users");
var orders = users.map(u -> Mongo.query("pending orders for " + u.getId()));
var totals = orders.map(Order::getTotal);

// NOW we send everything - one round trip
var result = totals.get();

// Parallel fan-out with CompletableFuture
var usersFuture = Mongo.queryAsync("active users");
var ordersFuture = Mongo.queryAsync("pending orders");
var productsFuture = Mongo.queryAsync("low stock products");

CompletableFuture.allOf(usersFuture, ordersFuture, productsFuture).join();

var users = usersFuture.get();
var orders = ordersFuture.get();
var products = productsFuture.get();
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```java
// Semantic search in plain English
var similar = Mongo.query("tutorials similar to machine learning").limit(10).get();
var related = Mongo.query("products like this hiking backpack").get();
var answers = Mongo.query("documents about serverless architecture").get();

// Embeddings are automatic
Mongo.query("index products for semantic search").get();
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```java
var results = Mongo.query("serverless database in title and content").highlight().get();
var fuzzy = Mongo.query("find articles matching \"kubernets\"").fuzzy().get();
var scored = Mongo.query("search \"edge computing\" with relevance scores").get();
```

---

## Real-Time Changes

Watch for database changes with reactive streams:

```java
Mongo.query("watch orders for changes")
    .subscribe(change -> {
        switch (change.getOperationType()) {
            case "insert" -> notify(change.getFullDocument().getCustomer());
            case "update" -> updateDashboard(change.getFullDocument());
        }
    });

// Or query changes directly
var recent = Mongo.query("changes to products in last hour").get();
```

---

## Transactions

Atomic operations with natural language:

```java
Mongo.query("""
    transfer $100 from alice to bob:
    - subtract from alice balance
    - add to bob balance
    - log the transfer
    """).atomic().get();

// Or chain with transactions
Mongo.transaction(tx -> {
    tx.query("alice account").debit(100);
    tx.query("bob account").credit(100);
    return tx.commit();
});
```

---

## Type-Safe Documents

Use POJOs or records for strongly-typed documents:

```java
import com.dotdo.mongo.annotations.*;

public record User(
    @BsonId ObjectId id,
    String name,
    String email,
    Instant createdAt
) {}

var client = MongoClients.create("https://db.example.com");
var db = client.getDatabase("myapp");
var users = db.getCollection("users", User.class);

// Type-safe operations
User user = users.find(eq("email", "alice@example.com")).first();

users.insertOne(new User(
    null,
    "Bob",
    "bob@example.com",
    Instant.now()
));
```

---

## Error Handling

```java
import com.dotdo.mongo.*;

try {
    var result = Mongo.query("complex query here").get();
} catch (QueryException e) {
    System.err.println("Query failed: " + e.getMessage());
    if (e.getSuggestion() != null) {
        System.err.println("Suggestion: " + e.getSuggestion());
    }
} catch (ConnectionException e) {
    System.err.println("Connection lost: " + e.getMessage());
}
```

---

## Configuration

```java
import com.dotdo.Mongo;
import com.dotdo.mongo.MongoConfig;

var config = MongoConfig.builder()
    .name("my-database")
    .domain("db.myapp.com")
    .vector(true)           // Vector search with Vectorize
    .fulltext(true)         // FTS5 text search
    .analytics(true)        // OLAP with ClickHouse
    .storage(StorageConfig.builder()
        .hot("sqlite")      // Recent data, fast queries
        .warm("r2")         // Historical data
        .cold("archive")    // Long-term retention
        .build())
    .build();

Mongo.configure(config);
```

---

## API Reference

### Static Methods

```java
public final class Mongo {
    // Execute a natural language query
    public static <T> MongoQuery<T> query(String query);

    // Execute a natural language query asynchronously
    public static <T> CompletableFuture<T> queryAsync(String query);

    // Execute a block within a transaction
    public static <T> T transaction(Function<Transaction, T> fn);

    // Configure the client
    public static void configure(MongoConfig config);
}
```

### Client

```java
public interface MongoClient extends Closeable {
    MongoDatabase getDatabase(String name);
    void close();
}

public interface MongoDatabase {
    <T> MongoCollection<T> getCollection(String name, Class<T> documentClass);
    MongoCollection<Document> getCollection(String name);
    List<String> listCollectionNames();
    void drop();
}

public interface MongoCollection<T> {
    FindIterable<T> find();
    FindIterable<T> find(Bson filter);
    T findOne(Bson filter);
    InsertOneResult insertOne(T document);
    InsertManyResult insertMany(List<T> documents);
    UpdateResult updateOne(Bson filter, Bson update);
    UpdateResult updateMany(Bson filter, Bson update);
    DeleteResult deleteOne(Bson filter);
    DeleteResult deleteMany(Bson filter);
    AggregateIterable<Document> aggregate(List<Bson> pipeline);
}
```

### MongoQuery

```java
public interface MongoQuery<T> {
    // Modifiers
    MongoQuery<T> limit(int n);
    MongoQuery<T> skip(int n);
    MongoQuery<T> sort(String field, SortDirection direction);

    // Search modifiers
    MongoQuery<T> highlight();
    MongoQuery<T> fuzzy();

    // Transformations (server-side via RPC pipelining)
    <R> MongoQuery<List<R>> map(Function<T, R> mapper);
    MongoQuery<List<T>> filter(Predicate<T> predicate);
    <R> MongoQuery<R> reduce(R identity, BiFunction<R, T, R> accumulator);

    // Transactions
    MongoQuery<T> atomic();

    // Resolve the query
    T get();
    CompletableFuture<T> getAsync();

    // Reactive support
    Publisher<T> toPublisher();
}
```

---

## Complete Example

```java
import com.dotdo.Mongo;
import com.dotdo.mongo.*;
import org.bson.Document;
import java.time.Instant;
import java.util.List;

public record User(String name, String email, Instant createdAt) {}

public class Main {
    public static void main(String[] args) {
        // Natural language queries
        System.out.println("=== Natural Language API ===");

        List<User> inactive = Mongo.<List<User>>query(
            "users who haven't logged in this month").get();
        System.out.println("Found " + inactive.size() + " inactive users");

        var revenue = Mongo.query("total revenue by category this quarter").get();
        System.out.println("Revenue by category: " + revenue);

        // MongoDB compatible API
        System.out.println("\n=== MongoDB Compatible API ===");

        try (var client = MongoClients.create("https://db.example.com")) {
            var db = client.getDatabase("myapp");
            var users = db.getCollection("users", User.class);

            // Insert
            users.insertOne(new User(
                "Alice",
                "alice@example.com",
                Instant.now()
            ));

            // Query
            var alice = users.findOne(eq("email", "alice@example.com"));
            if (alice != null) {
                System.out.println("Found user: " + alice.name());
            }

            // Aggregation
            var stats = users.aggregate(List.of(
                new Document("$group", new Document()
                    .append("_id", null)
                    .append("total", new Document("$sum", 1)))
            )).first();
            if (stats != null) {
                System.out.println("Total users: " + stats.getInteger("total"));
            }
        }

        // Pipelining
        System.out.println("\n=== Promise Pipelining ===");

        var result = Mongo.query("active customers")
            .map(c -> Mongo.query("orders for " + c))
            .map(o -> Mongo.query("calculate total from " + o))
            .get();
        System.out.println("Totals: " + result);
    }
}
```

---

## License

MIT
