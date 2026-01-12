# @dotdo/mongo

**MongoDB on the Edge. Natural Language First. AI-Native.**

```typescript
import { mongo } from '@dotdo/mongo'

const users = await mongo`users who haven't logged in this month`
const vips = await mongo`customers with orders over $1000`
```

One import. Natural language queries. Zero infrastructure.

---

## Why @dotdo/mongo?

- **Natural language queries** - Query your database like you'd describe it to a colleague
- **Promise pipelining** - Chain operations with single round trip via RPC
- **MongoDB compatible** - Drop-in replacement for the official MongoDB driver
- **Edge-native** - Built for Cloudflare Workers with Durable Objects storage
- **Full TypeScript** - Complete type safety and IntelliSense support

```typescript
// Three dependent operations, ONE network round trip:
const result = await mongo`customers in Texas`
  .map(customer => mongo`orders for ${customer}`)
  .map(orders => mongo`total revenue from ${orders}`)
```

---

## Installation

```bash
npm install @dotdo/mongo
```

Or with other package managers:

```bash
pnpm add @dotdo/mongo
yarn add @dotdo/mongo
bun add @dotdo/mongo
```

---

## Quick Start

### Natural Language API

```typescript
import { mongo } from '@dotdo/mongo'

// Query in plain English
const inactive = await mongo`users who haven't logged in this month`
const vips = await mongo`customers with orders over $1000`
const trending = await mongo`most popular products this week`

// Chain like sentences
await mongo`users in Austin`
  .map(user => mongo`recent orders for ${user}`)
  .map(orders => mongo`shipping status for ${orders}`)

// Search like you think
const tutorials = await mongo`tutorials similar to machine learning`.limit(10)
```

### MongoDB Compatible API

```typescript
import { MongoClient } from '@dotdo/mongo'

const client = new MongoClient('https://your-worker.workers.dev')
const db = client.db('myapp')
const users = db.collection('users')

// Standard MongoDB operations
await users.insertOne({ name: 'Alice', email: 'alice@example.com' })
await users.findOne({ email: 'alice@example.com' })
await users.aggregate([...]).toArray()
```

---

## Natural Language Queries

The tagged template API translates natural language to optimized queries:

```typescript
// CRUD Operations
const alice = await mongo`user alice@example.com`
const active = await mongo`active users in Austin`
const vips = await mongo`users with 10+ orders`

// AI infers what you need
await mongo`alice@example.com`              // returns user
await mongo`orders for alice@example.com`   // returns orders
await mongo`alice order history`            // returns full timeline

// Aggregation
const revenue = await mongo`revenue by category this month`
const growth = await mongo`user growth rate last 6 months`
const top = await mongo`top 10 customers by lifetime value`
```

---

## Promise Pipelining

Chain operations with minimal round trips using RPC pipelining:

```typescript
// Build the pipeline - nothing sent yet
const users = mongo`active users`
const orders = users.map(u => mongo`pending orders for ${u}`)
const totals = orders.map(o => o.total)

// NOW we send everything - one round trip
const result = await totals

// Parallel fan-out
const [users, orders, products] = await Promise.all([
  mongo`active users`,
  mongo`pending orders`,
  mongo`low stock products`,
])
```

---

## Vector Search

Semantic similarity search powered by Vectorize:

```typescript
// Semantic search in plain English
const similar = await mongo`tutorials similar to machine learning`.limit(10)
const related = await mongo`products like this hiking backpack`
const answers = await mongo`documents about serverless architecture`

// Embeddings are automatic
await mongo`index products for semantic search`
```

---

## Full-Text Search

FTS5-powered text search with highlighting:

```typescript
const results = await mongo`serverless database in title and content`.highlight()
const fuzzy = await mongo`find articles matching "kubernets"`.fuzzy()
const scored = await mongo`search "edge computing" with relevance scores`
```

---

## Real-Time Changes

Watch for database changes with change streams:

```typescript
await mongo`watch orders for changes`
  .on('insert', order => notify(order.customer))
  .on('update', order => updateDashboard(order))

// Or query changes directly
const recent = await mongo`changes to products in last hour`
```

---

## Transactions

Atomic operations with natural language:

```typescript
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

---

## Geospatial Queries

Location-based queries:

```typescript
const nearby = await mongo`coffee shops within 1km of Times Square`
const delivery = await mongo`restaurants that deliver to 10001`
const route = await mongo`stores along my commute from Brooklyn to Manhattan`
```

---

## MCP Protocol Integration

Enable AI agents to query your database:

```typescript
import { createMcpServer } from '@dotdo/mongo/mcp'

const server = createMcpServer({ mongo })

// AI agents can now query your database
// "Find all orders over $1000"
// "Show me user growth this quarter"
// "Which products are trending?"
```

---

## AgentFS

Virtual filesystem interface for AI agents:

```typescript
import { MongoAgent } from '@dotdo/mongo/agent'

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

---

## Connection Options

### Service Bindings (Cloudflare Workers)

```typescript
export default {
  async fetch(request: Request, env: Env) {
    const users = await env.MONGO`active users in Austin`
    return Response.json(users)
  }
}
```

### HTTP RPC

```typescript
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

---

## Type Definitions

Full TypeScript support with type inference:

```typescript
interface User {
  _id: ObjectId
  name: string
  email: string
  createdAt: Date
}

const db = client.db('myapp')
const users = db.collection<User>('users')

// Type-safe operations
const user = await users.findOne({ email: 'alice@example.com' })
// user is User | null

await users.insertOne({
  name: 'Bob',
  email: 'bob@example.com',
  createdAt: new Date()
})
```

---

## Error Handling

```typescript
import { MongoError, ConnectionError, QueryError } from '@dotdo/mongo'

try {
  const result = await mongo`complex query here`
} catch (error) {
  if (error instanceof QueryError) {
    console.error('Query failed:', error.message)
    console.error('Suggestion:', error.suggestion)
  } else if (error instanceof ConnectionError) {
    console.error('Connection lost:', error.message)
  }
}
```

---

## Configuration

```typescript
import { Mongo } from '@dotdo/mongo'

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

---

## API Reference

### Module Exports

```typescript
// Tagged template for natural language queries
export function mongo(strings: TemplateStringsArray, ...values: any[]): MongoQuery

// MongoDB-compatible client
export class MongoClient {
  constructor(url?: string, options?: MongoClientOptions)
  db(name: string): Db
  close(): Promise<void>
}

// Database operations
export class Db {
  collection<T>(name: string): Collection<T>
  listCollections(): Promise<CollectionInfo[]>
  dropDatabase(): Promise<void>
}

// Collection operations
export class Collection<T> {
  find(filter?: Filter<T>): Cursor<T>
  findOne(filter?: Filter<T>): Promise<T | null>
  insertOne(doc: T): Promise<InsertOneResult>
  insertMany(docs: T[]): Promise<InsertManyResult>
  updateOne(filter: Filter<T>, update: Update<T>): Promise<UpdateResult>
  updateMany(filter: Filter<T>, update: Update<T>): Promise<UpdateResult>
  deleteOne(filter: Filter<T>): Promise<DeleteResult>
  deleteMany(filter: Filter<T>): Promise<DeleteResult>
  aggregate<R>(pipeline: AggregationStage[]): Cursor<R>
}
```

### MongoQuery Methods

```typescript
interface MongoQuery<T> extends Promise<T> {
  // Modifiers
  limit(n: number): MongoQuery<T>
  skip(n: number): MongoQuery<T>
  sort(field: string, direction?: 'asc' | 'desc'): MongoQuery<T>

  // Search modifiers
  highlight(): MongoQuery<T>
  fuzzy(options?: FuzzyOptions): MongoQuery<T>

  // Transformations (server-side via RPC pipelining)
  map<R>(fn: (item: T) => R): MongoQuery<R[]>
  filter(fn: (item: T) => boolean): MongoQuery<T[]>
  reduce<R>(fn: (acc: R, item: T) => R, initial: R): MongoQuery<R>

  // Real-time
  on(event: string, handler: (data: any) => void): MongoQuery<T>

  // Transactions
  atomic(): MongoQuery<T>
}
```

---

## Complete Example

```typescript
import { mongo, MongoClient } from '@dotdo/mongo'

async function main() {
  // Natural language queries
  console.log('=== Natural Language API ===')

  const inactive = await mongo`users who haven't logged in this month`
  console.log(`Found ${inactive.length} inactive users`)

  const revenue = await mongo`total revenue by category this quarter`
  console.log('Revenue by category:', revenue)

  // MongoDB compatible API
  console.log('\n=== MongoDB Compatible API ===')

  const client = new MongoClient()
  const db = client.db('myapp')
  const users = db.collection('users')

  // Insert
  await users.insertOne({
    name: 'Alice',
    email: 'alice@example.com',
    createdAt: new Date()
  })

  // Query
  const alice = await users.findOne({ email: 'alice@example.com' })
  console.log('Found user:', alice?.name)

  // Aggregation
  const stats = await users.aggregate([
    { $group: { _id: null, total: { $sum: 1 } } }
  ]).toArray()
  console.log('Total users:', stats[0]?.total)

  // Pipelining
  console.log('\n=== Promise Pipelining ===')

  const result = await mongo`active customers`
    .map(customer => mongo`orders for ${customer}`)
    .map(orders => mongo`calculate total from ${orders}`)
  console.log('Totals:', result)

  await client.close()
}

main().catch(console.error)
```

---

## License

MIT
