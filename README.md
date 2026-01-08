# mongo.do

> MongoDB on the Edge. Natural Language First. AI-Native.

## Getting Started

### 1. Install

```bash
npm install mongo.do
```

### 2. Import and Use

```typescript
import { mongo } from 'mongo.do'

const users = await mongo`users who haven't logged in this month`
const vips = await mongo`customers with orders over $1000`
```

### 3. Deploy Your Own

```bash
npx create-dotdo mongo
```

### What's Next

- [mongo.do](https://mongo.do) - Full documentation
- [Docs](https://docs.mongo.do) - API reference
- [Discord](https://discord.gg/dotdo) - Community support

---

MongoDB Atlas costs $57/month for a shared cluster. Self-hosting means connection pools, replica sets, and ops burden. Every query requires remembering `$match`, `$group`, `$lookup` syntax. Developers write database code instead of building products.

**mongo.do** is the edge-native alternative. MongoDB-compatible. Deploys in seconds. Queries in plain English.

## AI-Native API

```typescript
import { mongo } from 'mongo.do'           // Full SDK
import { mongo } from 'mongo.do/tiny'      // Minimal client
import { mongo } from 'mongo.do/vector'    // Vector search operations
```

Natural language for database operations:

```typescript
import { mongo } from 'mongo.do'

// Talk to it like a colleague
const inactive = await mongo`users who haven't logged in this month`
const vips = await mongo`customers with orders over $1000`
const trending = await mongo`most popular products this week`

// Chain like sentences
await mongo`users in Austin`
  .map(user => mongo`recent orders for ${user}`)
  .map(orders => mongo`shipping status for ${orders}`)

// Search like you think
const tutorials = await mongo`tutorials similar to machine learning`.limit(10)
const articles = await mongo`serverless database in title and content`.highlight()
```

## The Problem

MongoDB Atlas dominates hosted MongoDB:

| What Atlas Charges | The Reality |
|--------------------|-------------|
| **Shared Cluster** | $57/month minimum |
| **Dedicated** | $95-2000+/month |
| **Serverless** | $0.10/million reads + storage + transfer |
| **Connection Limits** | 500-3000 depending on tier |
| **Cold Starts** | Serverless has unpredictable latency |
| **Vendor Lock-in** | Atlas-specific features trap you |

### The Ops Tax

Self-hosting means:

- Replica set configuration
- Connection pool management
- Backup orchestration
- Security patches
- Scaling headaches
- 3am pages

### The Syntax Tax

Every MongoDB query requires ceremony:

```typescript
// What you want: "users who haven't logged in this month"
// What you write:
db.users.aggregate([
  { $match: { lastLogin: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
  { $project: { name: 1, email: 1, lastLogin: 1 } }
])

// What you want: "orders over $1000 by category"
// What you write:
db.orders.aggregate([
  { $match: { amount: { $gt: 1000 } } },
  { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  { $sort: { total: -1 } }
])
```

Developers memorize operators instead of building products.

## The Solution

**mongo.do** reimagines MongoDB for the edge:

```
MongoDB Atlas                  mongo.do
-----------------------------------------------------------------
$57/month minimum              $0 - run your own
Connection pool limits         Unlimited edge connections
Cold starts                    Always warm at the edge
Verbose aggregation syntax     Natural language queries
Atlas-specific features        Open source, no lock-in
Ops burden                     Zero infrastructure
```

## One-Click Deploy

```bash
npx create-dotdo mongo
```

A MongoDB-compatible database. Running on infrastructure you control. Natural language from day one.

```typescript
import { Mongo } from 'mongo.do'

export default Mongo({
  name: 'my-database',
  domain: 'db.myapp.com',
  vector: true,  // Enable vector search
})
```

## Features

### CRUD Operations

```typescript
// Find anyone
const alice = await mongo`user alice@example.com`
const active = await mongo`active users in Austin`
const vips = await mongo`users with 10+ orders`

// AI infers what you need
await mongo`alice@example.com`              // returns user
await mongo`orders for alice@example.com`   // returns orders
await mongo`alice order history`            // returns full timeline
```

### Aggregation

```typescript
// Complex queries are one line
const revenue = await mongo`revenue by category this month`
const growth = await mongo`user growth rate last 6 months`
const top = await mongo`top 10 customers by lifetime value`

// Joins read like relationships
const enriched = await mongo`orders with customer and product details`
```

### Vector Search

```typescript
// Semantic search in plain English
const similar = await mongo`tutorials similar to machine learning`.limit(10)
const related = await mongo`products like this hiking backpack`
const answers = await mongo`documents about serverless architecture`

// Embeddings are automatic
await mongo`index products for semantic search`
```

### Full-Text Search

```typescript
// Search with highlighting
const results = await mongo`serverless database in title and content`.highlight()
const fuzzy = await mongo`find articles matching "kubernets"`.fuzzy()
const scored = await mongo`search "edge computing" with relevance scores`
```

### Real-Time Changes

```typescript
// Watch for changes naturally
await mongo`watch orders for changes`
  .on('insert', order => notify(order.customer))
  .on('update', order => updateDashboard(order))

// Or ask directly
const recent = await mongo`changes to products in last hour`
```

### Transactions

```typescript
// Atomic operations read like instructions
await mongo`
  transfer $100 from alice to bob:
  - subtract from alice balance
  - add to bob balance
  - log the transfer
`.atomic()

// Or chain with transactions
await mongo`alice account`.debit(100)
  .then(mongo`bob account`.credit(100))
  .atomic()
```

### Geospatial

```typescript
// Location queries are natural
const nearby = await mongo`coffee shops within 1km of Times Square`
const delivery = await mongo`restaurants that deliver to 10001`
const route = await mongo`stores along my commute from Brooklyn to Manhattan`
```

### Indexes

```typescript
// Index creation is conversational
await mongo`index users by email for fast lookup`
await mongo`index products for full-text search on name and description`
await mongo`index locations for geospatial queries`
await mongo`index embeddings for vector similarity`
```

## AI-Native Database

### Natural Language Queries

```typescript
// Complex analytics in plain English
const insights = await mongo`
  users who signed up last month
  but haven't made a purchase
  grouped by referral source
`

const cohort = await mongo`
  retention rate for users who
  signed up in January compared to February
`

const forecast = await mongo`
  predict next month revenue based on
  order trends from last 6 months
`
```

### MCP Protocol

```typescript
import { createMcpServer } from 'mongo.do/mcp'

const server = createMcpServer({ mongo })

// AI agents can now query your database
// "Find all orders over $1000"
// "Show me user growth this quarter"
// "Which products are trending?"
```

### AgentFS

```typescript
import { MongoAgent } from 'mongo.do/agent'

const agent = new MongoAgent(mongo)

// Glob pattern matching
const files = await agent.glob('src/**/*.ts')

// Content search
const matches = await agent.grep('TODO', { path: 'src/', type: 'ts' })

// Key-value with TTL
await agent.kv.set('session:123', { user: 'alice' }, { ttl: 3600 })

// Immutable audit log
await agent.log({ action: 'query', query: 'users', agent: 'claude' })
```

## Promise Pipelining

One network round trip. Record-replay pipelining.

```typescript
// Chain operations without await waterfalls
const result = await mongo`customers in Texas`
  .map(customer => mongo`orders for ${customer}`)
  .map(orders => mongo`total revenue from ${orders}`)
  .reduce((a, b) => a + b)

// Parallel fan-out
const [users, orders, products] = await Promise.all([
  mongo`active users`,
  mongo`pending orders`,
  mongo`low stock products`,
])

// Pipeline with transformations
await mongo`new signups this week`
  .map(user => mongo`send welcome email to ${user}`)
  .map(result => mongo`log email sent ${result}`)
```

## MongoDB Compatibility

Full compatibility with MongoDB drivers:

```typescript
// Drop-in replacement
import { MongoClient } from 'mongo.do'

const client = new MongoClient('https://your-worker.workers.dev')
const db = client.db('myapp')
const users = db.collection('users')

// Standard MongoDB operations work
await users.insertOne({ name: 'Alice', email: 'alice@example.com' })
await users.findOne({ email: 'alice@example.com' })
await users.aggregate([...]).toArray()
```

### Wire Protocol Support

```bash
# Connect with mongosh
mongosh mongodb://your-worker.workers.dev/mydb

# Connect with Compass
# mongodb://your-worker.workers.dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Applications                           │
├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
│  Tagged Template│   MongoDB       │   HTTP/RPC      │  Service Binding  │
│  mongo`query`   │   Wire Protocol │   JSON-RPC      │  Worker-to-Worker │
├─────────────────┴─────────────────┴─────────────────┴───────────────────┤
│                         mongo.do Worker (Edge)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  Natural Language  │  Query Engine  │  MCP Server  │  Vector Search     │
├─────────────────────────────────────────────────────────────────────────┤
│                      Durable Objects (SQLite Storage)                   │
├──────────────────────────┬──────────────────────────────────────────────┤
│     Vectorize            │           R2 / Analytics                     │
│  (Vector Embeddings)     │    (Large Objects, OLAP)                     │
└──────────────────────────┴──────────────────────────────────────────────┘
```

### Query Translation

Natural language queries translate to optimized SQL:

```typescript
// You write:
await mongo`users who haven't logged in this month`

// Translates to:
SELECT * FROM users
WHERE lastLogin < datetime('now', '-30 days')

// You write:
await mongo`revenue by category this quarter`

// Translates to:
SELECT category, SUM(amount) as revenue
FROM orders
WHERE createdAt >= datetime('now', 'start of quarter')
GROUP BY category
ORDER BY revenue DESC
```

## Connectivity Options

### Service Bindings (Zero Latency)

```typescript
// In your consuming worker
export default {
  async fetch(request: Request, env: Env) {
    const users = await env.MONGO`active users in Austin`
    return Response.json(users)
  }
}
```

### HTTP RPC

```typescript
// Direct HTTP with natural language
const response = await fetch('https://db.myapp.com/query', {
  method: 'POST',
  body: JSON.stringify({
    query: 'orders over $1000 this week'
  })
})
```

### WebSocket (Real-Time)

```typescript
const ws = new WebSocket('wss://db.myapp.com/stream')
ws.send(JSON.stringify({ watch: 'orders for changes' }))
ws.onmessage = (event) => handleChange(JSON.parse(event.data))
```

## vs MongoDB Atlas

| Feature | MongoDB Atlas | mongo.do |
|---------|---------------|----------|
| **Minimum Cost** | $57/month | $0 - run your own |
| **Query Syntax** | Verbose operators | Natural language |
| **Cold Starts** | Serverless has latency | Always at the edge |
| **Connection Limits** | 500-3000 | Unlimited |
| **Vector Search** | Atlas Search (paid) | Built-in with Vectorize |
| **Data Location** | Atlas regions | Your Cloudflare account |
| **Customization** | Limited | Full control |
| **Lock-in** | Atlas features | MIT licensed |

## Local Development

```bash
# Start a local server with SQLite backend
npx mongo.do serve --port 27017 --backend sqlite

# Connect with natural language
mongo`users in Austin`

# Or connect with mongosh
mongosh mongodb://localhost:27017/mydb
```

## Configuration

```typescript
import { Mongo } from 'mongo.do'

export default Mongo({
  name: 'my-database',
  domain: 'db.myapp.com',

  // Enable features
  vector: true,           // Vector search with Vectorize
  fulltext: true,         // FTS5 text search
  analytics: true,        // OLAP with ClickHouse

  // Storage tiers
  storage: {
    hot: 'sqlite',        // Recent data, fast queries
    warm: 'r2',           // Historical data
    cold: 'archive',      // Long-term retention
  }
})
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Natural Language Queries](docs/natural-language.mdx) | How to write queries in plain English |
| [Vector Search](docs/vector-search.mdx) | Semantic similarity with Vectorize |
| [Full-Text Search](docs/full-text-search.mdx) | FTS5-powered text search |
| [Real-Time Changes](docs/change-streams.mdx) | Watch for database changes |
| [Transactions](docs/transactions.mdx) | Atomic multi-document operations |
| [Geospatial](docs/geospatial.mdx) | Location-based queries |
| [AgentFS](docs/agentfs.mdx) | Virtual filesystem for AI agents |
| [MCP Protocol](docs/mcp-protocol.mdx) | Model Context Protocol integration |
| [MongoDB Compatibility](docs/mongodb-compat.mdx) | Wire protocol and driver support |
| [Studio UI](docs/studio.mdx) | Web-based database browser |

## Roadmap

### Core Database
- [x] Natural Language Queries
- [x] CRUD Operations
- [x] Aggregation Pipeline
- [x] Indexing
- [x] Transactions
- [x] Change Streams

### Search
- [x] Vector Search (Vectorize)
- [x] Full-Text Search (FTS5)
- [x] Geospatial Queries

### AI
- [x] Natural Language to SQL
- [x] MCP Protocol Server
- [x] AgentFS Virtual Filesystem
- [ ] Query Optimization Suggestions
- [ ] Schema Inference

### Connectivity
- [x] HTTP/RPC
- [x] WebSocket
- [x] Service Bindings
- [x] MongoDB Wire Protocol

### Ops
- [ ] Multi-Region Replication
- [ ] Horizontal Sharding

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Local development
npm run dev
```

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

## License

MIT License - Build something great.

---

<p align="center">
  <strong>MongoDB, reimagined for the edge.</strong>
  <br />
  Natural language. Zero infrastructure. AI-native.
  <br /><br />
  <a href="https://mongo.do">Website</a> |
  <a href="https://docs.mongo.do">Docs</a> |
  <a href="https://discord.gg/dotdo">Discord</a> |
  <a href="https://github.com/dotdo/mongo.do">GitHub</a>
</p>
