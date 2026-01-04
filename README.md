# mondodb

A MongoDB-compatible database backed by Cloudflare Durable Objects and SQLite.

## Overview

mondodb provides a MongoDB-compatible API that runs entirely on Cloudflare Workers. It translates MongoDB queries to SQLite, leveraging Cloudflare Durable Objects for persistent storage. This allows you to use familiar MongoDB patterns while benefiting from Cloudflare's global edge network.

## Features

- **MongoDB-compatible API** - Use familiar MongoDB operations like `find`, `insertOne`, `updateMany`, `aggregate`, and more
- **Aggregation Pipeline** - Support for common aggregation stages including `$match`, `$group`, `$project`, `$lookup`, `$sort`, `$limit`, `$skip`, `$unwind`, `$facet`, and more
- **Cloudflare Native** - Built on Durable Objects with SQLite storage for persistence
- **TypeScript Support** - Full TypeScript definitions included
- **Index Support** - Create and manage indexes for optimized queries
- **Vector Search** - Support for vector similarity search with Cloudflare Vectorize integration
- **Change Streams** - Real-time change notifications
- **Transactions** - Support for multi-document transactions

## Installation

```bash
npm install mondodb
```

## Quick Start

### As a Cloudflare Worker

```typescript
import { MondoEntrypoint, MondoDatabase } from 'mondodb';

export { MondoDatabase };

export default MondoEntrypoint;
```

Configure your `wrangler.toml`:

```toml
name = "my-mondodb-worker"
main = "src/index.ts"

[[durable_objects.bindings]]
name = "MONDO_DATABASE"
class_name = "MondoDatabase"

[[migrations]]
tag = "v1"
new_classes = ["MondoDatabase"]
```

### Client Usage

```typescript
import { MongoClient } from 'mondodb';

// Connect to your mondodb instance
const client = new MongoClient('http://localhost:8787');
const db = client.db('myDatabase');
const collection = db.collection('users');

// Insert documents
await collection.insertOne({ name: 'Alice', age: 30 });
await collection.insertMany([
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 35 }
]);

// Find documents
const user = await collection.findOne({ name: 'Alice' });
const adults = await collection.find({ age: { $gte: 18 } }).toArray();

// Update documents
await collection.updateOne(
  { name: 'Alice' },
  { $set: { age: 31 } }
);

// Aggregation pipeline
const results = await collection.aggregate([
  { $match: { age: { $gte: 25 } } },
  { $group: { _id: null, avgAge: { $avg: '$age' } } }
]).toArray();

// Delete documents
await collection.deleteOne({ name: 'Charlie' });
```

## Supported Operations

### CRUD Operations

- `insertOne`, `insertMany`
- `findOne`, `find`
- `updateOne`, `updateMany`
- `deleteOne`, `deleteMany`
- `replaceOne`
- `countDocuments`, `estimatedDocumentCount`
- `distinct`

### Aggregation Stages

- `$match` - Filter documents
- `$project` - Reshape documents
- `$group` - Group documents and compute aggregates
- `$sort` - Sort documents
- `$limit` - Limit number of documents
- `$skip` - Skip documents
- `$unwind` - Deconstruct arrays
- `$lookup` - Join with another collection
- `$facet` - Multi-faceted aggregation
- `$addFields` / `$set` - Add new fields
- `$count` - Count documents
- `$bucket` / `$bucketAuto` - Categorize documents

### Index Operations

- `createIndex`
- `createIndexes`
- `dropIndex`
- `dropIndexes`
- `listIndexes`

## Configuration

### Environment Variables

Configure your mondodb worker with these environment bindings:

```toml
[vars]
# Optional: Configure database settings
MONDO_MAX_BATCH_SIZE = 1000
```

### Durable Object Bindings

```toml
[[durable_objects.bindings]]
name = "MONDO_DATABASE"
class_name = "MondoDatabase"
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Start local development server
npm run dev
```

## Architecture

mondodb translates MongoDB queries into SQLite queries at runtime:

1. **Query Translation** - MongoDB queries are parsed and converted to equivalent SQLite statements
2. **Durable Object Storage** - Each database is backed by a Cloudflare Durable Object with SQLite
3. **RPC Communication** - Clients communicate with the worker via HTTP/WebSocket RPC

## License

MIT - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/nathanclevenger/mondodb).

## Author

Nathan Clevenger
