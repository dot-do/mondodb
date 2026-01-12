# com.dotdo:mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```kotlin
import com.dotdo.mongo

val users = mongo("users who haven't logged in this month")
val vips = mongo("customers with orders over $1000")
```

One import. Natural language queries. Zero infrastructure.

---

## Why com.dotdo:mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **Kotlin Coroutines** - Full suspend function support for async operations
- **MongoDB KMongo compatible** - Drop-in replacement with idiomatic Kotlin extensions
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Type-safe** - Full Kotlin type inference and null safety

```kotlin
// Three dependent operations, ONE network round trip:
val result = mongo("customers in Texas")
    .map { mongo("orders for $it") }
    .map { mongo("total revenue from $it") }
```

---

## Installation

### Gradle Kotlin DSL

```kotlin
dependencies {
    implementation("com.dotdo:mongo:0.1.0")
}
```

### Gradle Groovy

```groovy
implementation 'com.dotdo:mongo:0.1.0'
```

Requires Kotlin 1.9+ and Java 17+.

---

## Quick Start

### Natural Language API

```kotlin
import com.dotdo.mongo

suspend fun main() {
    // Query in plain English
    val inactive = mongo("users who haven't logged in this month")
    val vips = mongo("customers with orders over $1000")
    val trending = mongo("most popular products this week")

    // Chain like sentences
    val result = mongo("users in Austin")
        .map { user -> mongo("recent orders for $user") }
        .map { orders -> mongo("shipping status for $orders") }

    // Search semantically
    val tutorials = mongo("tutorials similar to machine learning").limit(10)
}
```

### MongoDB Compatible API

```kotlin
import com.dotdo.mongo.MongoClient

suspend fun main() {
    val client = MongoClient.create("https://your-worker.workers.dev")
    val db = client.getDatabase("myapp")
    val users = db.getCollection<User>("users")

    // Standard MongoDB operations with Kotlin extensions
    users.insertOne(User(name = "Alice", email = "alice@example.com"))
    val user = users.findOne { User::email eq "alice@example.com" }
}
```

---

## Natural Language Queries

The mongo function translates natural language to optimized queries:

```kotlin
// CRUD Operations
val alice = mongo("user alice@example.com")
val active = mongo("active users in Austin")
val vips = mongo("users with 10+ orders")

// AI infers what you need
mongo("alice@example.com")              // returns user
mongo("orders for alice@example.com")   // returns orders
mongo("alice order history")            // returns full timeline

// Aggregation
val revenue = mongo("revenue by category this month")
val growth = mongo("user growth rate last 6 months")
val top = mongo("top 10 customers by lifetime value")
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```kotlin
// Build the pipeline - nothing sent yet
val users = mongo("active users")
val orders = users.map { mongo("pending orders for ${it.id}") }
val totals = orders.map { it.total }

// NOW we send everything - one round trip
val result = totals.await()

// Parallel fan-out with coroutines
coroutineScope {
    val users = async { mongo("active users") }
    val orders = async { mongo("pending orders") }
    val products = async { mongo("low stock products") }

    println("Users: ${users.await()}")
    println("Orders: ${orders.await()}")
    println("Products: ${products.await()}")
}
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```kotlin
// Semantic search in plain English
val similar = mongo("tutorials similar to machine learning").limit(10)
val related = mongo("products like this hiking backpack")
val answers = mongo("documents about serverless architecture")

// Embeddings are automatic
mongo("index products for semantic search")
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```kotlin
val results = mongo("serverless database in title and content").highlight()
val fuzzy = mongo("""find articles matching "kubernets"""").fuzzy()
val scored = mongo("""search "edge computing" with relevance scores""")
```

---

## Real-Time Changes

Watch for database changes with Flow:

```kotlin
mongo("watch orders for changes")
    .asFlow()
    .collect { change ->
        when (change.operationType) {
            "insert" -> notify(change.fullDocument.customer)
            "update" -> updateDashboard(change.fullDocument)
        }
    }

// Or query changes directly
val recent = mongo("changes to products in last hour")
```

---

## Transactions

Atomic operations with natural language:

```kotlin
mongo("""
    transfer $100 from alice to bob:
    - subtract from alice balance
    - add to bob balance
    - log the transfer
""").atomic()

// Or with DSL
transaction {
    query("alice account").debit(100)
    query("bob account").credit(100)
}
```

---

## Type-Safe Documents

Use data classes for strongly-typed documents:

```kotlin
import com.dotdo.mongo.*
import kotlinx.serialization.Serializable
import org.bson.codecs.pojo.annotations.BsonId
import org.bson.types.ObjectId

@Serializable
data class User(
    @BsonId val id: ObjectId? = null,
    val name: String,
    val email: String,
    val createdAt: Instant = Instant.now()
)

val client = MongoClient.create("https://db.example.com")
val db = client.getDatabase("myapp")
val users = db.getCollection<User>()

// Type-safe operations with Kotlin extensions
val user: User? = users.findOne { User::email eq "alice@example.com" }

users.insertOne(User(
    name = "Bob",
    email = "bob@example.com"
))
```

---

## DSL Queries

Kotlin DSL for type-safe MongoDB queries:

```kotlin
// Find with DSL
val adults = users.find {
    User::age gte 18
    User::status eq "active"
}

// Aggregation with DSL
val stats = users.aggregate {
    match { User::createdAt gte lastMonth }
    group(User::country) {
        count()
        avg(User::age)
    }
    sort { User::count descending }
}

// Update with DSL
users.updateMany(
    filter = { User::status eq "inactive" },
    update = {
        set(User::status, "archived")
        inc(User::loginAttempts, 1)
    }
)
```

---

## Error Handling

```kotlin
import com.dotdo.mongo.*

try {
    val result = mongo("complex query here")
} catch (e: QueryException) {
    println("Query failed: ${e.message}")
    e.suggestion?.let { println("Suggestion: $it") }
} catch (e: ConnectionException) {
    println("Connection lost: ${e.message}")
}

// Or with Result
val result = runCatching { mongo("complex query here") }
result.fold(
    onSuccess = { println("Result: $it") },
    onFailure = { println("Error: ${it.message}") }
)
```

---

## Configuration

```kotlin
import com.dotdo.mongo.*

Mongo.configure {
    name = "my-database"
    domain = "db.myapp.com"

    // Enable features
    vector = true           // Vector search with Vectorize
    fulltext = true         // FTS5 text search
    analytics = true        // OLAP with ClickHouse

    // Storage tiers
    storage {
        hot = "sqlite"      // Recent data, fast queries
        warm = "r2"         // Historical data
        cold = "archive"    // Long-term retention
    }
}
```

---

## API Reference

### Top-Level Functions

```kotlin
// Execute a natural language query
suspend fun <T> mongo(query: String): T

// Execute a natural language query with options
suspend fun <T> mongo(query: String, builder: QueryBuilder.() -> Unit): T

// Configure the client
fun Mongo.configure(builder: MongoConfig.() -> Unit)

// Execute a block within a transaction
suspend fun <T> transaction(block: suspend TransactionScope.() -> T): T
```

### Client

```kotlin
interface MongoClient : Closeable {
    fun getDatabase(name: String): MongoDatabase
    suspend fun close()
}

interface MongoDatabase {
    fun <T : Any> getCollection(name: String = T::class.simpleName!!): MongoCollection<T>
    suspend fun listCollectionNames(): List<String>
    suspend fun drop()
}

interface MongoCollection<T : Any> {
    // Find operations
    suspend fun find(filter: FilterBuilder.() -> Unit = {}): List<T>
    suspend fun findOne(filter: FilterBuilder.() -> Unit = {}): T?

    // Insert operations
    suspend fun insertOne(document: T): InsertOneResult
    suspend fun insertMany(documents: List<T>): InsertManyResult

    // Update operations
    suspend fun updateOne(
        filter: FilterBuilder.() -> Unit,
        update: UpdateBuilder.() -> Unit
    ): UpdateResult

    suspend fun updateMany(
        filter: FilterBuilder.() -> Unit,
        update: UpdateBuilder.() -> Unit
    ): UpdateResult

    // Delete operations
    suspend fun deleteOne(filter: FilterBuilder.() -> Unit): DeleteResult
    suspend fun deleteMany(filter: FilterBuilder.() -> Unit): DeleteResult

    // Aggregation
    suspend fun aggregate(pipeline: AggregateBuilder.() -> Unit): List<Document>
}
```

### MongoQuery

```kotlin
interface MongoQuery<T> {
    // Modifiers
    fun limit(n: Int): MongoQuery<T>
    fun skip(n: Int): MongoQuery<T>
    fun sort(field: String, direction: SortDirection = SortDirection.ASC): MongoQuery<T>

    // Search modifiers
    fun highlight(): MongoQuery<T>
    fun fuzzy(): MongoQuery<T>

    // Transformations (server-side via RPC pipelining)
    fun <R> map(transform: (T) -> R): MongoQuery<List<R>>
    fun filter(predicate: (T) -> Boolean): MongoQuery<List<T>>
    fun <R> reduce(initial: R, operation: (R, T) -> R): MongoQuery<R>

    // Transactions
    fun atomic(): MongoQuery<T>

    // Resolve the query
    suspend fun await(): T
    fun asFlow(): Flow<T>
}
```

---

## Complete Example

```kotlin
import com.dotdo.mongo.*
import kotlinx.coroutines.runBlocking
import java.time.Instant

data class User(
    val name: String,
    val email: String,
    val createdAt: Instant = Instant.now()
)

fun main() = runBlocking {
    // Natural language queries
    println("=== Natural Language API ===")

    val inactive: List<User> = mongo("users who haven't logged in this month")
    println("Found ${inactive.size} inactive users")

    val revenue = mongo("total revenue by category this quarter")
    println("Revenue by category: $revenue")

    // MongoDB compatible API
    println("\n=== MongoDB Compatible API ===")

    MongoClient.create("https://db.example.com").use { client ->
        val db = client.getDatabase("myapp")
        val users = db.getCollection<User>()

        // Insert
        users.insertOne(User(
            name = "Alice",
            email = "alice@example.com"
        ))

        // Query
        val alice = users.findOne { User::email eq "alice@example.com" }
        println("Found user: ${alice?.name}")

        // Aggregation
        val stats = users.aggregate {
            group(null) {
                count()
            }
        }
        println("Total users: ${stats.firstOrNull()?.getInteger("count")}")
    }

    // Pipelining
    println("\n=== Promise Pipelining ===")

    val result = mongo("active customers")
        .map { mongo("orders for $it") }
        .map { mongo("calculate total from $it") }
        .await()
    println("Totals: $result")
}
```

---

## License

MIT
