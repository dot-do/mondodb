/**
 * Unified test provider interface for compatibility testing
 * Both MongoDB (via mongo-memory-server) and mongo.do implement this interface
 */

import { ObjectId } from '../../../src/types/objectid'

// ============================================================================
// Base Types
// ============================================================================

export type Document = Record<string, unknown>
export type Filter<T> = Partial<T> | Record<string, unknown>
export type UpdateFilter<T> = Record<string, unknown>
export type SortSpec = Record<string, 1 | -1>
export type ProjectionSpec = Record<string, 0 | 1>

// ============================================================================
// Result Types
// ============================================================================

export interface InsertOneResult {
  acknowledged: boolean
  insertedId: ObjectId
}

export interface InsertManyResult {
  acknowledged: boolean
  insertedCount: number
  insertedIds: Record<number, ObjectId>
}

export interface UpdateResult {
  acknowledged: boolean
  matchedCount: number
  modifiedCount: number
  upsertedId?: ObjectId
  upsertedCount?: number
}

export interface DeleteResult {
  acknowledged: boolean
  deletedCount: number
}

export interface BulkWriteResult {
  acknowledged: boolean
  insertedCount: number
  matchedCount: number
  modifiedCount: number
  deletedCount: number
  upsertedCount: number
  insertedIds: Record<number, ObjectId>
  upsertedIds: Record<number, ObjectId>
}

// ============================================================================
// Options Types
// ============================================================================

export interface InsertOneOptions {}
export interface InsertManyOptions {}

export interface FindOptions {
  projection?: ProjectionSpec
  sort?: SortSpec
  limit?: number
  skip?: number
}

export interface UpdateOptions {
  upsert?: boolean
  arrayFilters?: object[]
}

export interface ReplaceOptions {
  upsert?: boolean
}

export interface DeleteOptions {}

export interface FindOneAndUpdateOptions {
  projection?: ProjectionSpec
  sort?: SortSpec
  upsert?: boolean
  returnDocument?: 'before' | 'after'
}

export interface FindOneAndDeleteOptions {
  projection?: ProjectionSpec
  sort?: SortSpec
}

export interface FindOneAndReplaceOptions {
  projection?: ProjectionSpec
  sort?: SortSpec
  upsert?: boolean
  returnDocument?: 'before' | 'after'
}

export interface BulkWriteOptions {
  ordered?: boolean
}

// ============================================================================
// Bulk Write Operation Types
// ============================================================================

export interface InsertOneModel<T> {
  insertOne: { document: T }
}

export interface UpdateOneModel<T> {
  updateOne: {
    filter: Filter<T>
    update: UpdateFilter<T>
    upsert?: boolean
    arrayFilters?: object[]
  }
}

export interface UpdateManyModel<T> {
  updateMany: {
    filter: Filter<T>
    update: UpdateFilter<T>
    upsert?: boolean
    arrayFilters?: object[]
  }
}

export interface ReplaceOneModel<T> {
  replaceOne: {
    filter: Filter<T>
    replacement: T
    upsert?: boolean
  }
}

export interface DeleteOneModel<T> {
  deleteOne: { filter: Filter<T> }
}

export interface DeleteManyModel<T> {
  deleteMany: { filter: Filter<T> }
}

export type BulkWriteOperation<T> =
  | InsertOneModel<T>
  | UpdateOneModel<T>
  | UpdateManyModel<T>
  | ReplaceOneModel<T>
  | DeleteOneModel<T>
  | DeleteManyModel<T>

// ============================================================================
// Provider Interfaces
// ============================================================================

/**
 * Cursor interface for iterating over query results
 */
export interface TestCursor<T> {
  toArray(): Promise<T[]>
  next(): Promise<T | null>
  hasNext(): Promise<boolean>
  limit(n: number): TestCursor<T>
  skip(n: number): TestCursor<T>
  sort(spec: SortSpec): TestCursor<T>
  project(spec: ProjectionSpec): TestCursor<T>
  close(): Promise<void>
}

/**
 * Collection interface with MongoDB-compatible methods
 */
export interface TestCollection<T = Document> {
  readonly collectionName: string

  // Insert operations
  insertOne(doc: T, options?: InsertOneOptions): Promise<InsertOneResult>
  insertMany(docs: T[], options?: InsertManyOptions): Promise<InsertManyResult>

  // Find operations
  findOne(filter: Filter<T>, options?: FindOptions): Promise<(T & { _id: ObjectId }) | null>
  find(filter: Filter<T>, options?: FindOptions): TestCursor<T & { _id: ObjectId }>

  // Update operations
  updateOne(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<UpdateResult>
  updateMany(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<UpdateResult>
  replaceOne(filter: Filter<T>, replacement: T, options?: ReplaceOptions): Promise<UpdateResult>

  // Delete operations
  deleteOne(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult>
  deleteMany(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult>

  // FindAndModify operations
  findOneAndUpdate(filter: Filter<T>, update: UpdateFilter<T>, options?: FindOneAndUpdateOptions): Promise<(T & { _id: ObjectId }) | null>
  findOneAndDelete(filter: Filter<T>, options?: FindOneAndDeleteOptions): Promise<(T & { _id: ObjectId }) | null>
  findOneAndReplace(filter: Filter<T>, replacement: T, options?: FindOneAndReplaceOptions): Promise<(T & { _id: ObjectId }) | null>

  // Other operations
  countDocuments(filter?: Filter<T>): Promise<number>
  aggregate<R = Document>(pipeline: Document[]): TestCursor<R>
  bulkWrite(operations: BulkWriteOperation<T>[], options?: BulkWriteOptions): Promise<BulkWriteResult>
  drop(): Promise<void>
}

/**
 * Database interface
 */
export interface TestDatabase {
  readonly databaseName: string
  collection<T = Document>(name: string): TestCollection<T>
  dropCollection(name: string): Promise<void>
}

/**
 * Top-level provider interface
 * Implementations: MongoDBProvider, MondoDBProvider
 */
export interface TestProvider {
  readonly name: 'mongo.do' | 'mongodb'
  connect(): Promise<void>
  disconnect(): Promise<void>
  database(name: string): TestDatabase
  dropDatabase(name: string): Promise<void>
}
