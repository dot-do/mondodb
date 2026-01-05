/**
 * Client exports
 *
 * This module provides the main client API for mongo.do:
 * - MongoClient: Main entry point (supports both URI and Env modes)
 * - Database: Durable Objects database class
 * - Collection: Durable Objects collection class
 * - MongoDatabase: In-memory database class (for testing)
 * - MongoCollection: In-memory collection class (for testing)
 * - Session types for transaction support
 */

// Main client
export {
  MongoClient,
  type MongoClientOptions,
  // Session types re-exported from MongoClient
  ClientSession,
  type ClientSessionOptions,
  type TransactionOptions,
  type ReadConcern,
  type WriteConcern,
  type TransactionState,
  SessionId,
} from './MongoClient'

// Durable Objects backed classes
export { Database } from './Database'
export { Collection } from './Collection'

// In-memory classes (for testing)
export { MongoDatabase } from './mongo-database'
export { MongoCollection } from './mongo-collection'

// HTTP cursors for lazy evaluation
export { HttpFindCursor, HttpAggregationCursor } from './http-cursor'
