# dotdo-mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```python
from dotdo_mongo import mongo

users = await mongo("users who haven't logged in this month")
vips = await mongo("customers with orders over $1000")
```

One import. Natural language queries. Zero infrastructure.

---

## Why dotdo-mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **PyMongo compatible** - Drop-in replacement for the official PyMongo driver
- **Async-first** - Built on asyncio with full async/await support
- **Promise pipelining** - Chain operations with single round trip via RPC
- **Type hints** - Full typing support for IDE autocomplete

```python
# Three dependent operations, ONE network round trip:
result = await mongo("customers in Texas") \
    .map(lambda c: mongo(f"orders for {c}")) \
    .map(lambda o: mongo(f"total revenue from {o}"))
```

---

## Installation

```bash
pip install dotdo-mongo
```

Or with Poetry:

```bash
poetry add dotdo-mongo
```

Requires Python 3.10+.

---

## Quick Start

### Natural Language API

```python
import asyncio
from dotdo_mongo import mongo

async def main():
    # Query in plain English
    inactive = await mongo("users who haven't logged in this month")
    vips = await mongo("customers with orders over $1000")
    trending = await mongo("most popular products this week")

    # Chain like sentences
    result = await mongo("users in Austin") \
        .map(lambda user: mongo(f"recent orders for {user}")) \
        .map(lambda orders: mongo(f"shipping status for {orders}"))

    # Search semantically
    tutorials = await mongo("tutorials similar to machine learning").limit(10)

if __name__ == "__main__":
    asyncio.run(main())
```

### PyMongo Compatible API

```python
from dotdo_mongo import MongoClient

client = MongoClient("https://your-worker.workers.dev")
db = client["myapp"]
users = db.users

# Standard PyMongo operations
users.insert_one({"name": "Alice", "email": "alice@example.com"})
user = users.find_one({"email": "alice@example.com"})
results = list(users.aggregate([...]))
```

---

## Natural Language Queries

The function API translates natural language to optimized queries:

```python
# CRUD Operations
alice = await mongo("user alice@example.com")
active = await mongo("active users in Austin")
vips = await mongo("users with 10+ orders")

# AI infers what you need
await mongo("alice@example.com")              # returns user
await mongo("orders for alice@example.com")   # returns orders
await mongo("alice order history")            # returns full timeline

# Aggregation
revenue = await mongo("revenue by category this month")
growth = await mongo("user growth rate last 6 months")
top = await mongo("top 10 customers by lifetime value")
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```python
# Build the pipeline - nothing sent yet
users = mongo("active users")
orders = users.map(lambda u: mongo(f"pending orders for {u}"))
totals = orders.map(lambda o: o["total"])

# NOW we send everything - one round trip
result = await totals

# Parallel fan-out with asyncio.gather
users, orders, products = await asyncio.gather(
    mongo("active users"),
    mongo("pending orders"),
    mongo("low stock products"),
)
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```python
# Semantic search in plain English
similar = await mongo("tutorials similar to machine learning").limit(10)
related = await mongo("products like this hiking backpack")
answers = await mongo("documents about serverless architecture")

# Embeddings are automatic
await mongo("index products for semantic search")
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```python
results = await mongo("serverless database in title and content").highlight()
fuzzy = await mongo('find articles matching "kubernets"').fuzzy()
scored = await mongo('search "edge computing" with relevance scores')
```

---

## Real-Time Changes

Watch for database changes with async iterators:

```python
async for change in mongo("watch orders for changes"):
    if change["operationType"] == "insert":
        await notify(change["fullDocument"]["customer"])
    elif change["operationType"] == "update":
        await update_dashboard(change["fullDocument"])

# Or query changes directly
recent = await mongo("changes to products in last hour")
```

---

## Transactions

Atomic operations with natural language:

```python
await mongo("""
  transfer $100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer
""").atomic()

# Or chain with transactions
await mongo("alice account").debit(100) \
    .then(mongo("bob account").credit(100)) \
    .atomic()
```

---

## Geospatial Queries

Location-based queries:

```python
nearby = await mongo("coffee shops within 1km of Times Square")
delivery = await mongo("restaurants that deliver to 10001")
route = await mongo("stores along my commute from Brooklyn to Manhattan")
```

---

## MCP Protocol Integration

Enable AI agents to query your database:

```python
from dotdo_mongo.mcp import create_mcp_server

server = create_mcp_server(mongo)

# AI agents can now query your database
# "Find all orders over $1000"
# "Show me user growth this quarter"
# "Which products are trending?"
```

---

## AgentFS

Virtual filesystem interface for AI agents:

```python
from dotdo_mongo.agent import MongoAgent

agent = MongoAgent(mongo)

# Glob pattern matching
files = await agent.glob("src/**/*.py")

# Content search
matches = await agent.grep("TODO", path="src/", type="py")

# Key-value with TTL
await agent.kv.set("session:123", {"user": "alice"}, ttl=3600)

# Immutable audit log
await agent.log({"action": "query", "query": "users", "agent": "claude"})
```

---

## Type Hints

Full typing support with TypedDict and dataclasses:

```python
from typing import TypedDict
from datetime import datetime
from dotdo_mongo import MongoClient

class User(TypedDict):
    _id: str
    name: str
    email: str
    created_at: datetime

client = MongoClient()
db = client["myapp"]
users = db.get_collection("users", User)

# Type-safe operations
user: User | None = users.find_one({"email": "alice@example.com"})

users.insert_one({
    "name": "Bob",
    "email": "bob@example.com",
    "created_at": datetime.now()
})
```

---

## Error Handling

```python
from dotdo_mongo import MongoError, ConnectionError, QueryError

try:
    result = await mongo("complex query here")
except QueryError as e:
    print(f"Query failed: {e.message}")
    print(f"Suggestion: {e.suggestion}")
except ConnectionError as e:
    print(f"Connection lost: {e}")
```

---

## Configuration

```python
from dotdo_mongo import Mongo

db = Mongo(
    name="my-database",
    domain="db.myapp.com",

    # Enable features
    vector=True,           # Vector search with Vectorize
    fulltext=True,         # FTS5 text search
    analytics=True,        # OLAP with ClickHouse

    # Storage tiers
    storage={
        "hot": "sqlite",   # Recent data, fast queries
        "warm": "r2",      # Historical data
        "cold": "archive", # Long-term retention
    }
)
```

---

## API Reference

### Module Functions

```python
async def mongo(query: str, **params) -> MongoQuery:
    """
    Execute a natural language query.

    Args:
        query: Natural language query string
        **params: Parameters to interpolate into the query

    Returns:
        MongoQuery promise that resolves to query results
    """

class MongoClient:
    """MongoDB-compatible client."""

    def __init__(self, url: str | None = None, **options):
        """
        Create a new client.

        Args:
            url: Connection URL (optional, uses MONGO_URL env var if not provided)
            **options: Additional connection options
        """

    def __getitem__(self, name: str) -> Database:
        """Get a database by name."""

    async def close(self) -> None:
        """Close the client connection."""

class Database:
    """Database operations."""

    def __getitem__(self, name: str) -> Collection:
        """Get a collection by name."""

    def get_collection(self, name: str, document_class: type[T]) -> Collection[T]:
        """Get a typed collection."""

    async def list_collection_names(self) -> list[str]:
        """List all collection names."""

    async def drop_database(self) -> None:
        """Drop the database."""

class Collection[T]:
    """Collection operations with type parameter."""

    async def find(self, filter: dict = None) -> AsyncIterator[T]:
        """Find documents matching the filter."""

    async def find_one(self, filter: dict = None) -> T | None:
        """Find a single document."""

    async def insert_one(self, document: T) -> InsertOneResult:
        """Insert a document."""

    async def insert_many(self, documents: list[T]) -> InsertManyResult:
        """Insert multiple documents."""

    async def update_one(self, filter: dict, update: dict) -> UpdateResult:
        """Update a single document."""

    async def update_many(self, filter: dict, update: dict) -> UpdateResult:
        """Update multiple documents."""

    async def delete_one(self, filter: dict) -> DeleteResult:
        """Delete a single document."""

    async def delete_many(self, filter: dict) -> DeleteResult:
        """Delete multiple documents."""

    async def aggregate(self, pipeline: list[dict]) -> AsyncIterator[dict]:
        """Run an aggregation pipeline."""
```

### MongoQuery Methods

```python
class MongoQuery[T]:
    """A lazy query that supports chaining and pipelining."""

    def limit(self, n: int) -> MongoQuery[T]:
        """Limit results to n documents."""

    def skip(self, n: int) -> MongoQuery[T]:
        """Skip the first n documents."""

    def sort(self, field: str, direction: int = 1) -> MongoQuery[T]:
        """Sort results by field."""

    def highlight(self) -> MongoQuery[T]:
        """Enable search result highlighting."""

    def fuzzy(self, **options) -> MongoQuery[T]:
        """Enable fuzzy matching."""

    def map(self, fn: Callable[[T], R]) -> MongoQuery[list[R]]:
        """Transform results server-side."""

    def filter(self, fn: Callable[[T], bool]) -> MongoQuery[list[T]]:
        """Filter results server-side."""

    def reduce(self, fn: Callable[[R, T], R], initial: R) -> MongoQuery[R]:
        """Reduce results server-side."""

    def atomic(self) -> MongoQuery[T]:
        """Execute as an atomic transaction."""

    def __await__(self) -> Generator[Any, None, T]:
        """Await the query result."""
```

---

## Complete Example

```python
import asyncio
from dotdo_mongo import mongo, MongoClient

async def main():
    # Natural language queries
    print("=== Natural Language API ===")

    inactive = await mongo("users who haven't logged in this month")
    print(f"Found {len(inactive)} inactive users")

    revenue = await mongo("total revenue by category this quarter")
    print("Revenue by category:", revenue)

    # PyMongo compatible API
    print("\n=== PyMongo Compatible API ===")

    client = MongoClient()
    db = client["myapp"]
    users = db.users

    # Insert
    await users.insert_one({
        "name": "Alice",
        "email": "alice@example.com",
        "created_at": datetime.now()
    })

    # Query
    alice = await users.find_one({"email": "alice@example.com"})
    print("Found user:", alice["name"] if alice else None)

    # Aggregation
    stats = list(await users.aggregate([
        {"$group": {"_id": None, "total": {"$sum": 1}}}
    ]))
    print("Total users:", stats[0]["total"] if stats else 0)

    # Pipelining
    print("\n=== Promise Pipelining ===")

    result = await mongo("active customers") \
        .map(lambda c: mongo(f"orders for {c}")) \
        .map(lambda o: mongo(f"calculate total from {o}"))
    print("Totals:", result)

    await client.close()

if __name__ == "__main__":
    asyncio.run(main())
```

---

## License

MIT
