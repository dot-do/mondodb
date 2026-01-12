# dotdo/mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```php
<?php
use DotDo\Mongo;

$users = Mongo::query("users who haven't logged in this month");
$vips = Mongo::query("customers with orders over $1000");
```

One use. Natural language queries. Zero infrastructure.

---

## Why dotdo/mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **MongoDB PHP Library compatible** - Drop-in replacement for the official MongoDB PHP driver
- **PHP-native** - Generators, iterators, array access, and PSR standards
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Attribute support** - Use PHP 8 attributes for document mapping

```php
// Three dependent operations, ONE network round trip:
$result = Mongo::query("customers in Texas")
    ->map(fn($c) => Mongo::query("orders for {$c->id}"))
    ->map(fn($o) => Mongo::query("total revenue from {$o}"))
    ->get();
```

---

## Installation

```bash
composer require dotdo/mongo
```

Requires PHP 8.2+.

---

## Quick Start

### Natural Language API

```php
<?php
use DotDo\Mongo;

// Query in plain English
$inactive = Mongo::query("users who haven't logged in this month");
$vips = Mongo::query("customers with orders over $1000");
$trending = Mongo::query("most popular products this week");

// Chain like sentences
$result = Mongo::query("users in Austin")
    ->map(fn($user) => Mongo::query("recent orders for $user"))
    ->map(fn($orders) => Mongo::query("shipping status for $orders"))
    ->get();

// Search semantically
$tutorials = Mongo::query("tutorials similar to machine learning")
    ->limit(10)
    ->get();
```

### MongoDB Compatible API

```php
<?php
use DotDo\Mongo\Client;

$client = new Client('https://your-worker.workers.dev');
$db = $client->myapp;
$users = $db->users;

// Standard MongoDB operations
$users->insertOne([
    'name' => 'Alice',
    'email' => 'alice@example.com',
]);

$user = $users->findOne(['email' => 'alice@example.com']);
```

---

## Natural Language Queries

The query method translates natural language to optimized queries:

```php
// CRUD Operations
$alice = Mongo::query("user alice@example.com");
$active = Mongo::query("active users in Austin");
$vips = Mongo::query("users with 10+ orders");

// AI infers what you need
Mongo::query("alice@example.com");              // returns user
Mongo::query("orders for alice@example.com");   // returns orders
Mongo::query("alice order history");            // returns full timeline

// Aggregation
$revenue = Mongo::query("revenue by category this month");
$growth = Mongo::query("user growth rate last 6 months");
$top = Mongo::query("top 10 customers by lifetime value");
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```php
// Build the pipeline - nothing sent yet
$users = Mongo::query("active users");
$orders = $users->map(fn($u) => Mongo::query("pending orders for {$u->id}"));
$totals = $orders->map(fn($o) => $o->total);

// NOW we send everything - one round trip
$result = $totals->get();

// Parallel fan-out with Fiber or ReactPHP
$promises = [
    Mongo::queryAsync("active users"),
    Mongo::queryAsync("pending orders"),
    Mongo::queryAsync("low stock products"),
];

[$users, $orders, $products] = Mongo::all($promises);
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```php
// Semantic search in plain English
$similar = Mongo::query("tutorials similar to machine learning")->limit(10)->get();
$related = Mongo::query("products like this hiking backpack")->get();
$answers = Mongo::query("documents about serverless architecture")->get();

// Embeddings are automatic
Mongo::query("index products for semantic search")->get();
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```php
$results = Mongo::query("serverless database in title and content")->highlight()->get();
$fuzzy = Mongo::query('find articles matching "kubernets"')->fuzzy()->get();
$scored = Mongo::query('search "edge computing" with relevance scores')->get();
```

---

## Real-Time Changes

Watch for database changes with generators:

```php
foreach (Mongo::query("watch orders for changes") as $change) {
    switch ($change->operationType) {
        case 'insert':
            notify($change->fullDocument->customer);
            break;
        case 'update':
            updateDashboard($change->fullDocument);
            break;
    }
}

// Or query changes directly
$recent = Mongo::query("changes to products in last hour")->get();
```

---

## Transactions

Atomic operations with natural language:

```php
Mongo::query(<<<QUERY
    transfer \$100 from alice to bob:
    - subtract from alice balance
    - add to bob balance
    - log the transfer
QUERY)->atomic()->get();

// Or chain with transactions
Mongo::transaction(function ($tx) {
    $tx->query("alice account")->debit(100);
    $tx->query("bob account")->credit(100);
});
```

---

## Type-Safe Documents

Use PHP 8 attributes for strongly-typed documents:

```php
<?php
use DotDo\Mongo\Document;
use DotDo\Mongo\Attribute\{Id, Field, Collection};
use MongoDB\BSON\ObjectId;

#[Collection('users')]
class User extends Document
{
    #[Id]
    public ?ObjectId $id = null;

    #[Field]
    public string $name;

    #[Field]
    public string $email;

    #[Field]
    public \DateTimeImmutable $createdAt;
}

$client = new Client('https://db.example.com');
$db = $client->myapp;
$users = $db->getTypedCollection(User::class);

// Type-safe operations
$user = $users->findOne(['email' => 'alice@example.com']);
// $user is User|null

$users->insertOne(new User(
    name: 'Bob',
    email: 'bob@example.com',
    createdAt: new \DateTimeImmutable(),
));
```

---

## Error Handling

```php
<?php
use DotDo\Mongo;
use DotDo\Mongo\Exception\{QueryException, ConnectionException};

try {
    $result = Mongo::query("complex query here")->get();
} catch (QueryException $e) {
    echo "Query failed: {$e->getMessage()}\n";
    if ($e->getSuggestion()) {
        echo "Suggestion: {$e->getSuggestion()}\n";
    }
} catch (ConnectionException $e) {
    echo "Connection lost: {$e->getMessage()}\n";
}
```

---

## Configuration

```php
<?php
use DotDo\Mongo;

Mongo::configure([
    'name' => 'my-database',
    'domain' => 'db.myapp.com',

    // Enable features
    'vector' => true,           // Vector search with Vectorize
    'fulltext' => true,         // FTS5 text search
    'analytics' => true,        // OLAP with ClickHouse

    // Storage tiers
    'storage' => [
        'hot' => 'sqlite',      // Recent data, fast queries
        'warm' => 'r2',         // Historical data
        'cold' => 'archive',    // Long-term retention
    ],
]);
```

---

## Laravel Integration

```php
<?php
// config/dotdo-mongo.php
return [
    'connection' => env('MONGO_URL', 'https://db.example.com'),
    'database' => env('MONGO_DATABASE', 'myapp'),
];

// In a controller
use DotDo\Mongo\Facades\Mongo;

class UserController extends Controller
{
    public function index()
    {
        $users = Mongo::query("active users")->get();
        return view('users.index', compact('users'));
    }

    public function search(Request $request)
    {
        $results = Mongo::query($request->input('q'))
            ->limit(20)
            ->get();
        return response()->json($results);
    }
}
```

---

## API Reference

### Static Methods

```php
class Mongo
{
    /** Execute a natural language query. */
    public static function query(string $query): MongoQuery;

    /** Execute a natural language query asynchronously. */
    public static function queryAsync(string $query): Promise;

    /** Wait for all promises to resolve. */
    public static function all(array $promises): array;

    /** Execute a block within a transaction. */
    public static function transaction(callable $fn): mixed;

    /** Configure the client. */
    public static function configure(array $config): void;
}
```

### Client

```php
class Client
{
    /** Create a new client. */
    public function __construct(string $uri);

    /** Get a database (magic property access). */
    public function __get(string $name): Database;

    /** Get a database. */
    public function selectDatabase(string $name): Database;
}

class Database
{
    /** Get a collection (magic property access). */
    public function __get(string $name): Collection;

    /** Get a collection. */
    public function selectCollection(string $name): Collection;

    /** Get a typed collection. */
    public function getTypedCollection(string $class): TypedCollection;

    /** List collection names. */
    public function listCollectionNames(): array;

    /** Drop the database. */
    public function drop(): void;
}

class Collection
{
    /** Find documents. */
    public function find(array $filter = [], array $options = []): Cursor;

    /** Find one document. */
    public function findOne(array $filter = [], array $options = []): ?array;

    /** Insert one document. */
    public function insertOne(array $document): InsertOneResult;

    /** Insert many documents. */
    public function insertMany(array $documents): InsertManyResult;

    /** Update one document. */
    public function updateOne(array $filter, array $update): UpdateResult;

    /** Update many documents. */
    public function updateMany(array $filter, array $update): UpdateResult;

    /** Delete one document. */
    public function deleteOne(array $filter): DeleteResult;

    /** Delete many documents. */
    public function deleteMany(array $filter): DeleteResult;

    /** Run an aggregation pipeline. */
    public function aggregate(array $pipeline): Cursor;
}
```

### MongoQuery

```php
class MongoQuery implements \IteratorAggregate
{
    /** Limit results to n documents. */
    public function limit(int $n): self;

    /** Skip the first n documents. */
    public function skip(int $n): self;

    /** Sort results by field. */
    public function sort(string $field, string $direction = 'asc'): self;

    /** Enable search result highlighting. */
    public function highlight(): self;

    /** Enable fuzzy matching. */
    public function fuzzy(): self;

    /** Transform results server-side. */
    public function map(callable $fn): self;

    /** Filter results server-side. */
    public function filter(callable $fn): self;

    /** Reduce results server-side. */
    public function reduce(mixed $initial, callable $fn): self;

    /** Execute as an atomic transaction. */
    public function atomic(): self;

    /** Get the query result. */
    public function get(): mixed;

    /** Iterate over results. */
    public function getIterator(): \Traversable;
}
```

---

## Complete Example

```php
<?php
require_once __DIR__ . '/vendor/autoload.php';

use DotDo\Mongo;
use DotDo\Mongo\Client;

class User
{
    public function __construct(
        public ?string $id = null,
        public string $name = '',
        public string $email = '',
        public ?\DateTimeImmutable $createdAt = null,
    ) {
        $this->createdAt ??= new \DateTimeImmutable();
    }
}

// Natural language queries
echo "=== Natural Language API ===\n";

$inactive = Mongo::query("users who haven't logged in this month")->get();
echo "Found " . count($inactive) . " inactive users\n";

$revenue = Mongo::query("total revenue by category this quarter")->get();
echo "Revenue by category: " . json_encode($revenue) . "\n";

// MongoDB compatible API
echo "\n=== MongoDB Compatible API ===\n";

$client = new Client('https://db.example.com');
$db = $client->myapp;
$users = $db->users;

// Insert
$users->insertOne([
    'name' => 'Alice',
    'email' => 'alice@example.com',
    'createdAt' => new \DateTimeImmutable(),
]);

// Query
$alice = $users->findOne(['email' => 'alice@example.com']);
if ($alice) {
    echo "Found user: {$alice['name']}\n";
}

// Aggregation
$stats = $users->aggregate([
    ['$group' => ['_id' => null, 'total' => ['$sum' => 1]]],
])->toArray();
echo "Total users: " . ($stats[0]['total'] ?? 0) . "\n";

// Pipelining
echo "\n=== Promise Pipelining ===\n";

$result = Mongo::query("active customers")
    ->map(fn($c) => Mongo::query("orders for $c"))
    ->map(fn($o) => Mongo::query("calculate total from $o"))
    ->get();
echo "Totals: " . json_encode($result) . "\n";
```

---

## License

MIT
