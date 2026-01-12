# dotdo_mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```dart
import 'package:dotdo_mongo/dotdo_mongo.dart';

final users = await mongo("users who haven't logged in this month");
final vips = await mongo("customers with orders over \$1000");
```

One import. Natural language queries. Zero infrastructure.

---

## Why dotdo_mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **mongo_dart compatible** - Drop-in replacement for the official MongoDB Dart driver
- **Dart-native** - Futures, Streams, null safety, and full async/await support
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Flutter ready** - Works seamlessly in Flutter applications

```dart
// Three dependent operations, ONE network round trip:
final result = await mongo("customers in Texas")
    .map((c) => mongo("orders for $c"))
    .map((o) => mongo("total revenue from $o"));
```

---

## Installation

Add to your `pubspec.yaml`:

```yaml
dependencies:
  dotdo_mongo: ^0.1.0
```

Then run:

```bash
dart pub get
# or for Flutter
flutter pub get
```

Requires Dart 3.0+ or Flutter 3.10+.

---

## Quick Start

### Natural Language API

```dart
import 'package:dotdo_mongo/dotdo_mongo.dart';

Future<void> main() async {
  // Query in plain English
  final inactive = await mongo("users who haven't logged in this month");
  final vips = await mongo("customers with orders over \$1000");
  final trending = await mongo("most popular products this week");

  // Chain like sentences
  final result = await mongo("users in Austin")
      .map((user) => mongo("recent orders for $user"))
      .map((orders) => mongo("shipping status for $orders"));

  // Search semantically
  final tutorials = await mongo("tutorials similar to machine learning")
      .limit(10);
}
```

### MongoDB Compatible API

```dart
import 'package:dotdo_mongo/dotdo_mongo.dart';

Future<void> main() async {
  final client = await MongoClient.connect('https://your-worker.workers.dev');
  final db = client.db('myapp');
  final users = db.collection('users');

  // Standard MongoDB operations
  await users.insertOne({
    'name': 'Alice',
    'email': 'alice@example.com',
  });

  final user = await users.findOne(where.eq('email', 'alice@example.com'));

  await client.close();
}
```

---

## Natural Language Queries

The mongo function translates natural language to optimized queries:

```dart
// CRUD Operations
final alice = await mongo("user alice@example.com");
final active = await mongo("active users in Austin");
final vips = await mongo("users with 10+ orders");

// AI infers what you need
await mongo("alice@example.com");              // returns user
await mongo("orders for alice@example.com");   // returns orders
await mongo("alice order history");            // returns full timeline

// Aggregation
final revenue = await mongo("revenue by category this month");
final growth = await mongo("user growth rate last 6 months");
final top = await mongo("top 10 customers by lifetime value");
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```dart
// Build the pipeline - nothing sent yet
final users = mongo("active users");
final orders = users.map((u) => mongo("pending orders for ${u['id']}"));
final totals = orders.map((o) => o['total']);

// NOW we send everything - one round trip
final result = await totals;

// Parallel fan-out with Future.wait
final results = await Future.wait([
  mongo("active users"),
  mongo("pending orders"),
  mongo("low stock products"),
]);

final users = results[0];
final orders = results[1];
final products = results[2];
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```dart
// Semantic search in plain English
final similar = await mongo("tutorials similar to machine learning").limit(10);
final related = await mongo("products like this hiking backpack");
final answers = await mongo("documents about serverless architecture");

// Embeddings are automatic
await mongo("index products for semantic search");
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```dart
final results = await mongo("serverless database in title and content").highlight();
final fuzzy = await mongo('find articles matching "kubernets"').fuzzy();
final scored = await mongo('search "edge computing" with relevance scores');
```

---

## Real-Time Changes

Watch for database changes with Streams:

```dart
await for (final change in mongo("watch orders for changes").stream()) {
  switch (change['operationType']) {
    case 'insert':
      notify(change['fullDocument']['customer']);
      break;
    case 'update':
      updateDashboard(change['fullDocument']);
      break;
  }
}

// Or query changes directly
final recent = await mongo("changes to products in last hour");
```

---

## Transactions

Atomic operations with natural language:

```dart
await mongo('''
  transfer \$100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer
''').atomic();

// Or chain with transactions
await transaction((tx) async {
  await tx.query("alice account").debit(100);
  await tx.query("bob account").credit(100);
});
```

---

## Type-Safe Documents

Use classes with json_serializable for strongly-typed documents:

```dart
import 'package:json_annotation/json_annotation.dart';
import 'package:dotdo_mongo/dotdo_mongo.dart';

part 'user.g.dart';

@JsonSerializable()
class User {
  final String? id;
  final String name;
  final String email;
  final DateTime createdAt;

  User({
    this.id,
    required this.name,
    required this.email,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
}

Future<void> main() async {
  final client = await MongoClient.connect('https://db.example.com');
  final db = client.db('myapp');
  final users = db.typedCollection<User>('users');

  // Type-safe operations
  final user = await users.findOne(where.eq('email', 'alice@example.com'));
  // user is User?

  await users.insertOne(User(
    name: 'Bob',
    email: 'bob@example.com',
  ));

  await client.close();
}
```

---

## Error Handling

```dart
import 'package:dotdo_mongo/dotdo_mongo.dart';

try {
  final result = await mongo("complex query here");
} on QueryException catch (e) {
  print('Query failed: ${e.message}');
  if (e.suggestion != null) {
    print('Suggestion: ${e.suggestion}');
  }
} on ConnectionException catch (e) {
  print('Connection lost: ${e.message}');
}
```

---

## Configuration

```dart
import 'package:dotdo_mongo/dotdo_mongo.dart';

Mongo.configure(MongoConfig(
  name: 'my-database',
  domain: 'db.myapp.com',

  // Enable features
  vector: true,           // Vector search with Vectorize
  fulltext: true,         // FTS5 text search
  analytics: true,        // OLAP with ClickHouse

  // Storage tiers
  storage: StorageConfig(
    hot: 'sqlite',        // Recent data, fast queries
    warm: 'r2',           // Historical data
    cold: 'archive',      // Long-term retention
  ),
));
```

---

## Flutter Integration

```dart
import 'package:flutter/material.dart';
import 'package:dotdo_mongo/dotdo_mongo.dart';

class UsersScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<User>>(
      future: mongo("active users").then((data) =>
        (data as List).map((e) => User.fromJson(e)).toList()),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const CircularProgressIndicator();
        }
        if (snapshot.hasError) {
          return Text('Error: ${snapshot.error}');
        }
        final users = snapshot.data!;
        return ListView.builder(
          itemCount: users.length,
          itemBuilder: (context, index) => ListTile(
            title: Text(users[index].name),
            subtitle: Text(users[index].email),
          ),
        );
      },
    );
  }
}
```

---

## API Reference

### Top-Level Functions

```dart
/// Execute a natural language query.
Future<T> mongo<T>(String query);

/// Configure the client.
void configure(MongoConfig config);

/// Execute a block within a transaction.
Future<T> transaction<T>(Future<T> Function(TransactionContext tx) fn);
```

### Client

```dart
class MongoClient {
  /// Connect to a MongoDB server.
  static Future<MongoClient> connect(String uri);

  /// Get a database.
  MongoDatabase db(String name);

  /// Close the connection.
  Future<void> close();
}

class MongoDatabase {
  /// Get a collection.
  MongoCollection collection(String name);

  /// Get a typed collection.
  TypedCollection<T> typedCollection<T>(String name);

  /// List collection names.
  Future<List<String>> listCollectionNames();

  /// Drop the database.
  Future<void> drop();
}

class MongoCollection {
  /// Find documents.
  Future<List<Map<String, dynamic>>> find([SelectorBuilder? selector]);

  /// Find one document.
  Future<Map<String, dynamic>?> findOne([SelectorBuilder? selector]);

  /// Insert one document.
  Future<InsertOneResult> insertOne(Map<String, dynamic> document);

  /// Insert many documents.
  Future<InsertManyResult> insertMany(List<Map<String, dynamic>> documents);

  /// Update one document.
  Future<UpdateResult> updateOne(SelectorBuilder selector, ModifierBuilder update);

  /// Update many documents.
  Future<UpdateResult> updateMany(SelectorBuilder selector, ModifierBuilder update);

  /// Delete one document.
  Future<DeleteResult> deleteOne(SelectorBuilder selector);

  /// Delete many documents.
  Future<DeleteResult> deleteMany(SelectorBuilder selector);

  /// Run an aggregation pipeline.
  Future<List<Map<String, dynamic>>> aggregate(List<Map<String, dynamic>> pipeline);
}
```

### MongoQuery

```dart
class MongoQuery<T> implements Future<T> {
  /// Limit results to n documents.
  MongoQuery<T> limit(int n);

  /// Skip the first n documents.
  MongoQuery<T> skip(int n);

  /// Sort results by field.
  MongoQuery<T> sort(String field, [SortDirection direction = SortDirection.asc]);

  /// Enable search result highlighting.
  MongoQuery<T> highlight();

  /// Enable fuzzy matching.
  MongoQuery<T> fuzzy();

  /// Transform results server-side.
  MongoQuery<List<R>> map<R>(R Function(T item) mapper);

  /// Filter results server-side.
  MongoQuery<List<T>> where(bool Function(T item) predicate);

  /// Reduce results server-side.
  MongoQuery<R> reduce<R>(R initial, R Function(R acc, T item) reducer);

  /// Execute as an atomic transaction.
  MongoQuery<T> atomic();

  /// Convert to a Stream.
  Stream<T> stream();
}
```

---

## Complete Example

```dart
import 'package:dotdo_mongo/dotdo_mongo.dart';

class User {
  final String? id;
  final String name;
  final String email;
  final DateTime createdAt;

  User({
    this.id,
    required this.name,
    required this.email,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['_id'],
    name: json['name'],
    email: json['email'],
    createdAt: DateTime.parse(json['createdAt']),
  );

  Map<String, dynamic> toJson() => {
    if (id != null) '_id': id,
    'name': name,
    'email': email,
    'createdAt': createdAt.toIso8601String(),
  };
}

Future<void> main() async {
  // Natural language queries
  print('=== Natural Language API ===');

  final inactive = await mongo("users who haven't logged in this month");
  print('Found ${(inactive as List).length} inactive users');

  final revenue = await mongo("total revenue by category this quarter");
  print('Revenue by category: $revenue');

  // MongoDB compatible API
  print('\n=== MongoDB Compatible API ===');

  final client = await MongoClient.connect('https://db.example.com');
  final db = client.db('myapp');
  final users = db.collection('users');

  // Insert
  await users.insertOne(User(
    name: 'Alice',
    email: 'alice@example.com',
  ).toJson());

  // Query
  final aliceDoc = await users.findOne(where.eq('email', 'alice@example.com'));
  if (aliceDoc != null) {
    final alice = User.fromJson(aliceDoc);
    print('Found user: ${alice.name}');
  }

  // Aggregation
  final stats = await users.aggregate([
    {'\$group': {'_id': null, 'total': {'\$sum': 1}}},
  ]);
  if (stats.isNotEmpty) {
    print('Total users: ${stats.first['total']}');
  }

  await client.close();

  // Pipelining
  print('\n=== Promise Pipelining ===');

  final result = await mongo("active customers")
      .map((c) => mongo("orders for $c"))
      .map((o) => mongo("calculate total from $o"));
  print('Totals: $result');
}
```

---

## License

MIT
