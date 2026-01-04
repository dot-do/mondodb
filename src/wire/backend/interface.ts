/**
 * MondoBackend Interface
 *
 * Abstraction layer for database operations.
 * Can be implemented by:
 * - LocalSQLiteBackend (for local development/Compass)
 * - CloudflareWorkersBackend (proxy to Durable Objects)
 */

import type { Document } from 'bson'

/** Database info for listDatabases */
export interface DatabaseInfo {
  name: string
  sizeOnDisk: number
  empty: boolean
}

/** Collection info for listCollections */
export interface CollectionInfo {
  name: string
  type: 'collection' | 'view'
  options?: Document
  info?: {
    readOnly: boolean
    uuid?: string
  }
  idIndex?: Document
}

/** Find operation options */
export interface FindOptions {
  filter?: Document
  projection?: Document
  sort?: Document
  limit?: number
  skip?: number
  batchSize?: number
  hint?: Document | string
  comment?: string
  allowDiskUse?: boolean
  collation?: Document
}

/** Find result with cursor info */
export interface FindResult {
  documents: Document[]
  cursorId: bigint
  hasMore: boolean
}

/** Insert result */
export interface InsertResult {
  acknowledged: boolean
  insertedIds: Map<number, unknown>
  insertedCount: number
}

/** Update result */
export interface UpdateResult {
  acknowledged: boolean
  matchedCount: number
  modifiedCount: number
  upsertedId?: unknown
  upsertedCount: number
}

/** Delete result */
export interface DeleteResult {
  acknowledged: boolean
  deletedCount: number
}

/** Aggregate result */
export interface AggregateResult {
  documents: Document[]
  cursorId: bigint
  hasMore: boolean
}

/** Collection statistics */
export interface CollStats {
  ns: string
  count: number
  size: number
  avgObjSize: number
  storageSize: number
  totalIndexSize: number
  nindexes: number
  indexSizes: Record<string, number>
}

/** Database statistics */
export interface DbStats {
  db: string
  collections: number
  views: number
  objects: number
  avgObjSize: number
  dataSize: number
  storageSize: number
  indexes: number
  indexSize: number
}

/** Index information */
export interface IndexInfo {
  v: number
  key: Document
  name: string
  ns?: string
  unique?: boolean
  sparse?: boolean
  background?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: Document
}

/** Index specification for creation */
export interface IndexSpec {
  key: Document
  name?: string
  unique?: boolean
  sparse?: boolean
  background?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: Document
}

/** Cursor state */
export interface CursorState {
  id: bigint
  namespace: string
  documents: Document[]
  position: number
  batchSize: number
  createdAt: number
}

/**
 * Backend interface for database operations
 */
export interface MondoBackend {
  // Database operations
  listDatabases(): Promise<DatabaseInfo[]>
  createDatabase(name: string): Promise<void>
  dropDatabase(name: string): Promise<void>
  databaseExists(name: string): Promise<boolean>

  // Collection operations
  listCollections(db: string, filter?: Document): Promise<CollectionInfo[]>
  createCollection(db: string, name: string, options?: Document): Promise<void>
  dropCollection(db: string, name: string): Promise<void>
  collectionExists(db: string, name: string): Promise<boolean>
  collStats(db: string, collection: string): Promise<CollStats>
  dbStats(db: string): Promise<DbStats>

  // CRUD operations
  find(
    db: string,
    collection: string,
    options: FindOptions
  ): Promise<FindResult>

  insertOne(db: string, collection: string, doc: Document): Promise<InsertResult>
  insertMany(db: string, collection: string, docs: Document[]): Promise<InsertResult>

  updateOne(
    db: string,
    collection: string,
    filter: Document,
    update: Document,
    options?: { upsert?: boolean; arrayFilters?: Document[] }
  ): Promise<UpdateResult>

  updateMany(
    db: string,
    collection: string,
    filter: Document,
    update: Document,
    options?: { upsert?: boolean; arrayFilters?: Document[] }
  ): Promise<UpdateResult>

  deleteOne(db: string, collection: string, filter: Document): Promise<DeleteResult>
  deleteMany(db: string, collection: string, filter: Document): Promise<DeleteResult>

  // Count and distinct
  count(db: string, collection: string, query?: Document): Promise<number>
  distinct(
    db: string,
    collection: string,
    field: string,
    query?: Document
  ): Promise<unknown[]>

  // Aggregation
  aggregate(
    db: string,
    collection: string,
    pipeline: Document[],
    options?: { batchSize?: number; allowDiskUse?: boolean }
  ): Promise<AggregateResult>

  // Index operations
  listIndexes(db: string, collection: string): Promise<IndexInfo[]>
  createIndexes(db: string, collection: string, indexes: IndexSpec[]): Promise<string[]>
  dropIndex(db: string, collection: string, indexName: string): Promise<void>
  dropIndexes(db: string, collection: string): Promise<void>

  // Cursor management
  createCursor(state: CursorState): void
  getCursor(id: bigint): CursorState | undefined
  advanceCursor(id: bigint, count: number): Document[]
  closeCursor(id: bigint): boolean
  cleanupExpiredCursors(): void
}
