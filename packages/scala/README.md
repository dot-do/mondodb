# com.dotdo::mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```scala
import com.dotdo.mongo._

val users = mongo"users who haven't logged in this month"
val vips = mongo"customers with orders over $$1000"
```

One import. Natural language queries. Zero infrastructure.

---

## Why com.dotdo::mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **ReactiveMongo/Mongo Scala Driver compatible** - Drop-in replacement for official MongoDB drivers
- **Scala-native** - String interpolation, for-comprehensions, pattern matching
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Full Scala 3 support** - Given instances, extension methods, and enums

```scala
// Three dependent operations, ONE network round trip:
val result = for
  customers <- mongo"customers in Texas"
  orders <- mongo"orders for $customers"
  revenue <- mongo"total revenue from $orders"
yield revenue
```

---

## Installation

### sbt

```scala
libraryDependencies += "com.dotdo" %% "mongo" % "0.1.0"
```

### Mill

```scala
ivy"com.dotdo::mongo:0.1.0"
```

Requires Scala 3.3+ and JVM 17+.

---

## Quick Start

### Natural Language API

```scala
import com.dotdo.mongo._
import scala.concurrent.ExecutionContext.Implicits.global

@main def run(): Unit =
  // Query in plain English
  val inactive = mongo"users who haven't logged in this month"
  val vips = mongo"customers with orders over $$1000"
  val trending = mongo"most popular products this week"

  // Chain with for-comprehensions
  val result = for
    users <- mongo"users in Austin"
    orders <- mongo"recent orders for $users"
    status <- mongo"shipping status for $orders"
  yield status

  // Search semantically
  val tutorials = mongo"tutorials similar to machine learning".limit(10)
```

### MongoDB Compatible API

```scala
import com.dotdo.mongo._
import org.mongodb.scala._

@main def run(): Unit =
  val client = MongoClient("https://your-worker.workers.dev")
  val db = client.getDatabase("myapp")
  val users = db.getCollection("users")

  // Standard MongoDB operations
  users.insertOne(Document(
    "name" -> "Alice",
    "email" -> "alice@example.com"
  )).toFuture()

  val user = users.find(equal("email", "alice@example.com")).first().toFuture()
```

---

## Natural Language Queries

The string interpolator translates natural language to optimized queries:

```scala
// CRUD Operations
val alice = mongo"user alice@example.com"
val active = mongo"active users in Austin"
val vips = mongo"users with 10+ orders"

// AI infers what you need
mongo"alice@example.com"              // returns user
mongo"orders for alice@example.com"   // returns orders
mongo"alice order history"            // returns full timeline

// Aggregation
val revenue = mongo"revenue by category this month"
val growth = mongo"user growth rate last 6 months"
val top = mongo"top 10 customers by lifetime value"
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```scala
// Build the pipeline - nothing sent yet
val users = mongo"active users"
val orders = users.map(u => mongo"pending orders for ${u.id}")
val totals = orders.map(_.total)

// NOW we send everything - one round trip
val result = totals.run()

// Parallel fan-out with Future.sequence
val futures = Seq(
  mongo"active users".run(),
  mongo"pending orders".run(),
  mongo"low stock products".run()
)

val Seq(users, orders, products) = Future.sequence(futures).await
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```scala
// Semantic search in plain English
val similar = mongo"tutorials similar to machine learning".limit(10)
val related = mongo"products like this hiking backpack"
val answers = mongo"documents about serverless architecture"

// Embeddings are automatic
mongo"index products for semantic search".run()
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```scala
val results = mongo"serverless database in title and content".highlight
val fuzzy = mongo"""find articles matching "kubernets"""".fuzzy
val scored = mongo"""search "edge computing" with relevance scores"""
```

---

## Real-Time Changes

Watch for database changes with Akka Streams or FS2:

```scala
// With Akka Streams
import akka.stream.scaladsl._

mongo"watch orders for changes"
  .toSource
  .runForeach { change =>
    change.operationType match
      case "insert" => notify(change.fullDocument.customer)
      case "update" => updateDashboard(change.fullDocument)
      case _ => ()
  }

// Or query changes directly
val recent = mongo"changes to products in last hour"
```

---

## Transactions

Atomic operations with natural language:

```scala
mongo"""
  transfer $$100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer
""".atomic.run()

// Or chain with transactions
transaction { tx =>
  for
    _ <- tx.query("alice account").debit(100)
    _ <- tx.query("bob account").credit(100)
  yield ()
}
```

---

## Type-Safe Documents

Use case classes for strongly-typed documents:

```scala
import com.dotdo.mongo._
import java.time.Instant
import org.bson.types.ObjectId

case class User(
  _id: ObjectId,
  name: String,
  email: String,
  createdAt: Instant
) derives MongoCodec

val client = MongoClient("https://db.example.com")
val db = client.getDatabase("myapp")
val users = db.getTypedCollection[User]("users")

// Type-safe operations
val user: Option[User] = users.findOne(equal("email", "alice@example.com")).await

users.insertOne(User(
  _id = ObjectId(),
  name = "Bob",
  email = "bob@example.com",
  createdAt = Instant.now()
)).await
```

---

## For-Comprehension Support

```scala
// Complex pipelines with for-comprehensions
val result = for
  user <- mongo"user alice@example.com"
  orders <- mongo"orders for ${user.id}"
  if orders.nonEmpty
  total = orders.map(_.amount).sum
  _ <- mongo"update user ${user.id} with total $total"
yield (user, total)

// Pattern matching on results
mongo"recent orders" match
  case orders if orders.isEmpty => println("No orders")
  case orders => orders.foreach(println)
```

---

## Error Handling

```scala
import com.dotdo.mongo._
import scala.util.{Try, Success, Failure}

Try(mongo"complex query here".run()) match
  case Success(result) => println(s"Result: $result")
  case Failure(e: QueryException) =>
    println(s"Query failed: ${e.message}")
    e.suggestion.foreach(s => println(s"Suggestion: $s"))
  case Failure(e: ConnectionException) =>
    println(s"Connection lost: ${e.message}")
  case Failure(e) =>
    println(s"Error: ${e.getMessage}")
```

---

## Configuration

```scala
import com.dotdo.mongo._

Mongo.configure(
  name = "my-database",
  domain = "db.myapp.com",
  options = MongoOptions(
    vector = true,           // Vector search with Vectorize
    fulltext = true,         // FTS5 text search
    analytics = true,        // OLAP with ClickHouse
    storage = StorageConfig(
      hot = "sqlite",        // Recent data, fast queries
      warm = "r2",           // Historical data
      cold = "archive"       // Long-term retention
    )
  )
)
```

---

## API Reference

### String Interpolators

```scala
// Natural language query interpolator
extension (sc: StringContext)
  def mongo(args: Any*): MongoQuery[Any]
```

### Client

```scala
class MongoClient:
  def getDatabase(name: String): MongoDatabase
  def close(): Future[Unit]

class MongoDatabase:
  def getCollection(name: String): MongoCollection[Document]
  def getTypedCollection[T: MongoCodec](name: String): MongoCollection[T]
  def listCollectionNames(): Future[Seq[String]]
  def drop(): Future[Unit]

class MongoCollection[T]:
  def find(filter: Bson): FindObservable[T]
  def findOne(filter: Bson): Future[Option[T]]
  def insertOne(document: T): Future[InsertOneResult]
  def insertMany(documents: Seq[T]): Future[InsertManyResult]
  def updateOne(filter: Bson, update: Bson): Future[UpdateResult]
  def updateMany(filter: Bson, update: Bson): Future[UpdateResult]
  def deleteOne(filter: Bson): Future[DeleteResult]
  def deleteMany(filter: Bson): Future[DeleteResult]
  def aggregate(pipeline: Seq[Bson]): AggregateObservable[Document]
```

### MongoQuery

```scala
trait MongoQuery[T]:
  // Modifiers
  def limit(n: Int): MongoQuery[T]
  def skip(n: Int): MongoQuery[T]
  def sort(field: String, direction: SortDirection = Ascending): MongoQuery[T]

  // Search modifiers
  def highlight: MongoQuery[T]
  def fuzzy: MongoQuery[T]

  // Transformations (server-side via RPC pipelining)
  def map[R](f: T => R): MongoQuery[Seq[R]]
  def flatMap[R](f: T => MongoQuery[R]): MongoQuery[R]
  def filter(p: T => Boolean): MongoQuery[Seq[T]]
  def foldLeft[R](z: R)(op: (R, T) => R): MongoQuery[R]

  // Transactions
  def atomic: MongoQuery[T]

  // Execution
  def run(): Future[T]
  def toSource: Source[T, NotUsed]  // Akka Streams
  def toStream: Stream[IO, T]        // FS2
```

---

## Complete Example

```scala
import com.dotdo.mongo._
import java.time.Instant
import org.bson.types.ObjectId
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Await
import scala.concurrent.duration._

case class User(
  _id: ObjectId,
  name: String,
  email: String,
  createdAt: Instant
) derives MongoCodec

@main def run(): Unit =
  // Natural language queries
  println("=== Natural Language API ===")

  val inactive = mongo"users who haven't logged in this month".run().await
  println(s"Found ${inactive.size} inactive users")

  val revenue = mongo"total revenue by category this quarter".run().await
  println(s"Revenue by category: $revenue")

  // MongoDB compatible API
  println("\n=== MongoDB Compatible API ===")

  val client = MongoClient("https://db.example.com")

  try
    val db = client.getDatabase("myapp")
    val users = db.getTypedCollection[User]("users")

    // Insert
    users.insertOne(User(
      _id = ObjectId(),
      name = "Alice",
      email = "alice@example.com",
      createdAt = Instant.now()
    )).await

    // Query
    users.findOne(equal("email", "alice@example.com")).await match
      case Some(alice) => println(s"Found user: ${alice.name}")
      case None => println("User not found")

    // Aggregation
    val stats = users.aggregate(Seq(
      Document("$group" -> Document("_id" -> null, "total" -> Document("$sum" -> 1)))
    )).toFuture().await
    println(s"Total users: ${stats.headOption.flatMap(_.get[Int]("total"))}")

  finally
    client.close().await

  // Pipelining
  println("\n=== Promise Pipelining ===")

  val result = (for
    customers <- mongo"active customers"
    orders <- mongo"orders for $customers"
    totals <- mongo"calculate total from $orders"
  yield totals).run().await

  println(s"Totals: $result")

extension [T](f: Future[T])
  def await: T = Await.result(f, 30.seconds)
```

---

## License

MIT
