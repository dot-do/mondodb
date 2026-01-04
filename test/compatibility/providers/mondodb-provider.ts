/**
 * MondoDB Provider
 * Wraps the mondodb in-memory client for compatibility testing
 *
 * This provider uses the in-memory MongoDB-compatible implementation from
 * src/client/MongoClient.ts for testing purposes. It implements the TestProvider
 * interface to allow comparison testing between mondodb and real MongoDB.
 */

import { MongoClient } from '../../../src/client/MongoClient'
import { MongoDatabase } from '../../../src/client/mongo-database'
import { MongoCollection, Document as ClientDocument } from '../../../src/client/mongo-collection'
import { FindCursor } from '../../../src/client/cursor'
import { AggregationCursor } from '../../../src/client/aggregation-cursor'
import {
  TestProvider,
  TestDatabase,
  TestCollection,
  TestCursor,
  Document,
  Filter,
  UpdateFilter,
  SortSpec,
  ProjectionSpec,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  BulkWriteResult,
  InsertOneOptions,
  InsertManyOptions,
  FindOptions,
  UpdateOptions,
  ReplaceOptions,
  DeleteOptions,
  FindOneAndUpdateOptions,
  FindOneAndDeleteOptions,
  FindOneAndReplaceOptions,
  BulkWriteOptions,
  BulkWriteOperation,
} from './types'
import { ObjectId } from '../../../src/types/objectid'

/**
 * Wraps mondodb FindCursor to match TestCursor interface
 */
class MondoDBFindCursor<T> implements TestCursor<T> {
  private cursor: FindCursor<ClientDocument>
  private collection: MongoCollection<ClientDocument>
  private filter: object
  private options: FindOptions

  constructor(cursor: FindCursor<ClientDocument>, collection: MongoCollection<ClientDocument>, filter: object, options: FindOptions = {}) {
    this.cursor = cursor
    this.collection = collection
    this.filter = filter
    this.options = { ...options }
  }

  async toArray(): Promise<T[]> {
    return this.cursor.toArray() as Promise<T[]>
  }

  async next(): Promise<T | null> {
    return this.cursor.next() as Promise<T | null>
  }

  async hasNext(): Promise<boolean> {
    return this.cursor.hasNext()
  }

  limit(n: number): TestCursor<T> {
    this.options.limit = n
    // Create new cursor with updated options
    const newCursor = this.collection.find(this.filter, this.options)
    return new MondoDBFindCursor<T>(newCursor, this.collection, this.filter, this.options)
  }

  skip(n: number): TestCursor<T> {
    this.options.skip = n
    const newCursor = this.collection.find(this.filter, this.options)
    return new MondoDBFindCursor<T>(newCursor, this.collection, this.filter, this.options)
  }

  sort(spec: SortSpec): TestCursor<T> {
    this.options.sort = spec
    const newCursor = this.collection.find(this.filter, this.options)
    return new MondoDBFindCursor<T>(newCursor, this.collection, this.filter, this.options)
  }

  project(spec: ProjectionSpec): TestCursor<T> {
    this.options.projection = spec
    const newCursor = this.collection.find(this.filter, this.options)
    return new MondoDBFindCursor<T>(newCursor, this.collection, this.filter, this.options)
  }

  async close(): Promise<void> {
    // mondodb cursors don't need explicit closing
  }
}

/**
 * Wraps mondodb AggregationCursor to match TestCursor interface
 */
class MondoDBAggregationCursor<T> implements TestCursor<T> {
  private cursor: AggregationCursor<ClientDocument>
  private _limit?: number
  private _skip?: number
  private _sort?: SortSpec
  private _projection?: ProjectionSpec

  constructor(cursor: AggregationCursor<ClientDocument>) {
    this.cursor = cursor
  }

  async toArray(): Promise<T[]> {
    let results = await this.cursor.toArray() as T[]

    // Apply sort if specified (post-processing)
    if (this._sort) {
      results = this.applySortToResults(results, this._sort)
    }

    // Apply skip if specified (post-processing)
    if (this._skip && this._skip > 0) {
      results = results.slice(this._skip)
    }

    // Apply limit if specified (post-processing)
    if (this._limit && this._limit > 0) {
      results = results.slice(0, this._limit)
    }

    // Apply projection if specified (post-processing)
    if (this._projection) {
      results = this.applyProjectionToResults(results, this._projection)
    }

    return results
  }

  async next(): Promise<T | null> {
    return this.cursor.next() as Promise<T | null>
  }

  async hasNext(): Promise<boolean> {
    return this.cursor.hasNext()
  }

  limit(n: number): TestCursor<T> {
    this._limit = n
    return this
  }

  skip(n: number): TestCursor<T> {
    this._skip = n
    return this
  }

  sort(spec: SortSpec): TestCursor<T> {
    this._sort = spec
    return this
  }

  project(spec: ProjectionSpec): TestCursor<T> {
    this._projection = spec
    return this
  }

  async close(): Promise<void> {
    await this.cursor.close()
  }

  /**
   * Apply sort to results (post-processing for aggregation cursors)
   */
  private applySortToResults(results: T[], sort: SortSpec): T[] {
    return [...results].sort((a, b) => {
      for (const [field, direction] of Object.entries(sort)) {
        const aVal = this.getNestedValue(a as unknown as ClientDocument, field)
        const bVal = this.getNestedValue(b as unknown as ClientDocument, field)

        let comparison = 0
        if (aVal === bVal) {
          comparison = 0
        } else if (aVal === null || aVal === undefined) {
          comparison = -1
        } else if (bVal === null || bVal === undefined) {
          comparison = 1
        } else if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal)
        } else if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal
        } else {
          comparison = String(aVal).localeCompare(String(bVal))
        }

        if (comparison !== 0) {
          return comparison * direction
        }
      }
      return 0
    })
  }

  /**
   * Apply projection to results (post-processing for aggregation cursors)
   */
  private applyProjectionToResults(results: T[], projection: ProjectionSpec): T[] {
    const hasInclusions = Object.values(projection).some(v => v === 1)

    return results.map(doc => {
      const result: ClientDocument = {}
      const docAsRecord = doc as unknown as ClientDocument

      if (hasInclusions) {
        // Inclusion mode - include only specified fields
        if (projection._id !== 0 && '_id' in docAsRecord) {
          result._id = docAsRecord._id
        }
        for (const [key, value] of Object.entries(projection)) {
          if (value === 1 && key !== '_id') {
            result[key] = this.getNestedValue(docAsRecord, key)
          }
        }
      } else {
        // Exclusion mode - exclude specified fields
        for (const [key, val] of Object.entries(docAsRecord)) {
          if (projection[key] !== 0) {
            result[key] = val
          }
        }
      }

      return result as T
    })
  }

  /**
   * Get nested value from document using dot notation
   */
  private getNestedValue(doc: ClientDocument, path: string): unknown {
    const parts = path.split('.')
    let current: unknown = doc

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      current = (current as Record<string, unknown>)[part]
    }

    return current
  }
}

/**
 * Wraps mondodb Collection to match TestCollection interface
 */
class MondoDBCollection<T extends Document = Document> implements TestCollection<T> {
  private col: MongoCollection<ClientDocument>

  constructor(collection: MongoCollection<ClientDocument>) {
    this.col = collection
  }

  get collectionName(): string {
    return this.col.collectionName
  }

  async insertOne(doc: T, options?: InsertOneOptions): Promise<InsertOneResult> {
    return this.col.insertOne(doc as ClientDocument, options)
  }

  async insertMany(docs: T[], options?: InsertManyOptions): Promise<InsertManyResult> {
    return this.col.insertMany(docs as ClientDocument[], options)
  }

  async findOne(filter: Filter<T>, options?: FindOptions): Promise<(T & { _id: ObjectId }) | null> {
    return this.col.findOne(filter as object, options) as Promise<(T & { _id: ObjectId }) | null>
  }

  find(filter: Filter<T>, options?: FindOptions): TestCursor<T & { _id: ObjectId }> {
    const cursor = this.col.find(filter as object, options)
    return new MondoDBFindCursor<T & { _id: ObjectId }>(cursor, this.col, filter as object, options)
  }

  async updateOne(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<UpdateResult> {
    return this.col.updateOne(filter as object, update as object, options)
  }

  async updateMany(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<UpdateResult> {
    return this.col.updateMany(filter as object, update as object, options)
  }

  async replaceOne(filter: Filter<T>, replacement: T, options?: ReplaceOptions): Promise<UpdateResult> {
    return this.col.replaceOne(filter as object, replacement as ClientDocument, options)
  }

  async deleteOne(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult> {
    return this.col.deleteOne(filter as object, options)
  }

  async deleteMany(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult> {
    return this.col.deleteMany(filter as object, options)
  }

  async findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options?: FindOneAndUpdateOptions
  ): Promise<(T & { _id: ObjectId }) | null> {
    return this.col.findOneAndUpdate(filter as object, update as object, options) as Promise<(T & { _id: ObjectId }) | null>
  }

  async findOneAndDelete(
    filter: Filter<T>,
    options?: FindOneAndDeleteOptions
  ): Promise<(T & { _id: ObjectId }) | null> {
    return this.col.findOneAndDelete(filter as object, options) as Promise<(T & { _id: ObjectId }) | null>
  }

  async findOneAndReplace(
    filter: Filter<T>,
    replacement: T,
    options?: FindOneAndReplaceOptions
  ): Promise<(T & { _id: ObjectId }) | null> {
    return this.col.findOneAndReplace(filter as object, replacement as ClientDocument, options) as Promise<(T & { _id: ObjectId }) | null>
  }

  async countDocuments(filter?: Filter<T>): Promise<number> {
    return this.col.countDocuments(filter as object || {})
  }

  aggregate<R = Document>(pipeline: Document[]): TestCursor<R> {
    // Use the mondodb aggregation cursor
    const cursor = this.col.aggregate(pipeline as any)
    return new MondoDBAggregationCursor<R>(cursor)
  }

  async bulkWrite(operations: BulkWriteOperation<T>[], options?: BulkWriteOptions): Promise<BulkWriteResult> {
    // Convert to mondodb's bulk write format
    const mondoOps = operations.map(op => {
      if ('insertOne' in op) return op
      if ('updateOne' in op) return op
      if ('updateMany' in op) return op
      if ('replaceOne' in op) return op
      if ('deleteOne' in op) return op
      if ('deleteMany' in op) return op
      return op
    })
    const result = await this.col.bulkWrite(mondoOps as any, options)

    // Convert insertedIds and upsertedIds to use ObjectId (not string)
    const convertedResult: BulkWriteResult = {
      acknowledged: result.acknowledged,
      insertedCount: result.insertedCount,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      deletedCount: result.deletedCount,
      upsertedCount: result.upsertedCount,
      insertedIds: {},
      upsertedIds: {},
    }

    // Convert insertedIds
    for (const [key, value] of Object.entries(result.insertedIds)) {
      convertedResult.insertedIds[Number(key)] = value instanceof ObjectId
        ? value
        : new ObjectId(value as string)
    }

    // Convert upsertedIds
    for (const [key, value] of Object.entries(result.upsertedIds)) {
      convertedResult.upsertedIds[Number(key)] = value instanceof ObjectId
        ? value
        : new ObjectId(value as string)
    }

    return convertedResult
  }

  async drop(): Promise<void> {
    await this.col.drop()
  }
}

/**
 * Wraps mondodb Database to match TestDatabase interface
 */
class MondoDBDatabase implements TestDatabase {
  private db: MongoDatabase
  private collectionCache: Map<string, TestCollection<Document>> = new Map()

  constructor(db: MongoDatabase) {
    this.db = db
  }

  get databaseName(): string {
    return this.db.databaseName
  }

  collection<T = Document>(name: string): TestCollection<T> {
    if (!this.collectionCache.has(name)) {
      // Get the underlying collection and wrap it
      // Use 'any' to bridge the type gap between ClientDocument and Document
      const col = this.db.collection(name) as any
      this.collectionCache.set(name, new MondoDBCollection<Document>(col) as TestCollection<Document>)
    }
    return this.collectionCache.get(name) as TestCollection<T>
  }

  async dropCollection(name: string): Promise<void> {
    const col = this.db.collection(name)
    await col.drop()
    this.collectionCache.delete(name)
  }
}

/**
 * MondoDB Provider
 *
 * Uses the in-memory MongoDB-compatible client from src/client/MongoClient.ts
 * for compatibility testing. This allows comparing mondodb behavior against
 * real MongoDB using the same test interface.
 */
export class MondoDBProvider implements TestProvider {
  readonly name = 'mondodb' as const
  private client: MongoClient | null = null
  private databases: Map<string, MondoDBDatabase> = new Map()

  /**
   * Connect to the mondodb in-memory database
   *
   * The connection string is used for configuration but actual connections
   * are handled lazily since mondodb uses Durable Objects as backing store.
   */
  async connect(): Promise<void> {
    // Create a new MongoClient with a mondodb:// URI
    // This initializes the in-memory database system
    this.client = new MongoClient('mondodb://localhost:27017/test')
    await this.client.connect()
  }

  /**
   * Disconnect from the database and clean up resources
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      // Drop all databases to clean up test data
      const dbNames = Array.from(this.databases.keys())
      for (const dbName of dbNames) {
        try {
          const db = this.client.db(dbName)
          await db.dropDatabase()
        } catch {
          // Ignore errors during cleanup
        }
      }

      await this.client.close()
      this.client = null
    }
    this.databases.clear()
  }

  /**
   * Get a database instance by name
   */
  database(name: string): TestDatabase {
    if (!this.client) {
      throw new Error('MondoDBProvider not connected. Call connect() first.')
    }
    if (!this.databases.has(name)) {
      this.databases.set(name, new MondoDBDatabase(this.client.db(name)))
    }
    return this.databases.get(name) as TestDatabase
  }

  /**
   * Drop a database and all its collections
   */
  async dropDatabase(name: string): Promise<void> {
    if (!this.client) {
      throw new Error('MondoDBProvider not connected. Call connect() first.')
    }

    // Get the database and drop it
    const db = this.client.db(name)
    await db.dropDatabase()

    // Clear from cache
    this.databases.delete(name)
  }
}
