/**
 * mongo.do - MongoDB-compatible client SDK built on rpc.do
 *
 * Zero-schema MongoDB API over RPC with the $ proxy pattern for dynamic access.
 *
 * @example
 * ```typescript
 * import { MongoClient } from 'mongo.do'
 *
 * // Connect to a mongo.do service
 * const client = await MongoClient.connect('mongodb://api.mongo.do/mydb')
 *
 * // Get database and collection
 * const db = client.db('mydb')
 * const users = db.collection('users')
 *
 * // CRUD operations
 * await users.insertOne({ name: 'John', age: 30 })
 * const user = await users.findOne({ name: 'John' })
 * await users.updateOne({ name: 'John' }, { $set: { age: 31 } })
 * await users.deleteOne({ name: 'John' })
 *
 * // Close connection
 * await client.close()
 * ```
 *
 * @packageDocumentation
 */

// Client
export { MongoClient, parseConnectionUri, MockRpcTransport } from './client.js';

// Database
export { Db, AdminDb } from './db.js';
export type { CreateCollectionOptions, CollectionInfo } from './db.js';

// Collection
export { Collection } from './collection.js';

// Cursors
export { FindCursor, AggregationCursor, AbstractCursor } from './cursor.js';

// Types
export type {
  // Document types
  Document,
  WithId,
  ObjectId,
  // Filter types
  Filter,
  FilterOperators,
  RootFilterOperators,
  // Update types
  UpdateFilter,
  PushModifiers,
  // Query options
  Sort,
  SortDirection,
  Projection,
  FindOptions,
  // Result types
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  // Options types
  CountDocumentsOptions,
  UpdateOptions,
  ReplaceOptions,
  DeleteOptions,
  // Aggregation types
  AggregationStage,
  AggregateOptions,
  // Client types
  MongoClientOptions,
  RpcTransport,
  // Callback types
  ForEachCallback,
} from './types.js';

/**
 * Version of the SDK
 */
export const VERSION = '0.1.0';

/**
 * Error class for MongoDB operations
 */
export class MongoError extends Error {
  constructor(
    message: string,
    public readonly code?: string | number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'MongoError';
  }
}

/**
 * Error class for connection failures
 */
export class MongoConnectionError extends MongoError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'MongoConnectionError';
  }
}

/**
 * Error class for invalid operations
 */
export class MongoInvalidOperationError extends MongoError {
  constructor(message: string, details?: unknown) {
    super(message, 'INVALID_OPERATION', details);
    this.name = 'MongoInvalidOperationError';
  }
}

/**
 * Error class for write concerns
 */
export class MongoWriteConcernError extends MongoError {
  constructor(message: string, details?: unknown) {
    super(message, 'WRITE_CONCERN_ERROR', details);
    this.name = 'MongoWriteConcernError';
  }
}
