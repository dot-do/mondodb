/**
 * Collection - MongoDB-compatible collection interface
 *
 * Provides CRUD operations on documents within a collection.
 */

import type { Env } from '../types/env'
import type {
  Document,
  Filter,
  UpdateFilter,
  FindOptions,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  AggregationStage,
  AggregateOptions,
  IndexSpecification,
} from '../types/mongodb'
import { HttpFindCursor, HttpAggregationCursor } from './http-cursor'

/**
 * Collection class
 *
 * Provides MongoDB-compatible operations on a collection of documents.
 */
export class Collection<TDocument extends Document = Document> {
  private env: Env
  private dbName: string
  private collectionName: string

  /**
   * Create a new Collection instance
   *
   * @param env - Cloudflare Workers environment with MONDO_DATABASE binding
   * @param dbName - The name of the database
   * @param collectionName - The name of the collection
   */
  constructor(env: Env, dbName: string, collectionName: string) {
    this.env = env
    this.dbName = dbName
    this.collectionName = collectionName
  }

  /**
   * Get the Durable Object stub for this collection's database
   */
  private getStub() {
    const id = this.env.MONDO_DATABASE.idFromName(this.dbName)
    return this.env.MONDO_DATABASE.get(id)
  }

  /**
   * Make a request to the Durable Object
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const stub = this.getStub()
    const url = `https://mondo.internal/${this.dbName}/${this.collectionName}${path}`

    const response = await stub.fetch(
      new Request(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Operation failed: ${error}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * Insert a single document
   *
   * @param doc - The document to insert
   * @returns InsertOneResult with the inserted document's _id
   */
  async insertOne(doc: Omit<TDocument, '_id'> | TDocument): Promise<InsertOneResult> {
    return this.request<InsertOneResult>('POST', '/insertOne', { document: doc })
  }

  /**
   * Insert multiple documents
   *
   * @param docs - Array of documents to insert
   * @returns InsertManyResult with count and inserted IDs
   */
  async insertMany(docs: Array<Omit<TDocument, '_id'> | TDocument>): Promise<InsertManyResult> {
    return this.request<InsertManyResult>('POST', '/insertMany', { documents: docs })
  }

  /**
   * Find a single document matching the filter
   *
   * @param filter - Query filter
   * @param options - Find options (projection, sort, etc.)
   * @returns The matching document or null
   */
  async findOne(
    filter: Filter<TDocument> = {},
    options: FindOptions<TDocument> = {}
  ): Promise<TDocument | null> {
    return this.request<TDocument | null>('POST', '/findOne', { filter, options })
  }

  /**
   * Find all documents matching the filter
   *
   * Returns a cursor that supports:
   * - Async iteration with `for await (const doc of cursor)`
   * - Converting to array with `await cursor.toArray()`
   * - Chainable modifiers: sort(), limit(), skip(), project()
   *
   * @param filter - Query filter
   * @param options - Find options (projection, sort, skip, limit, etc.)
   * @returns HttpFindCursor for iterating over results
   *
   * @example
   * ```typescript
   * // Using toArray
   * const docs = await collection.find({ status: 'active' }).toArray()
   *
   * // Using async iterator
   * for await (const doc of collection.find({ status: 'active' })) {
   *   console.log(doc)
   * }
   *
   * // Using chainable modifiers
   * const docs = await collection.find({})
   *   .sort({ name: 1 })
   *   .limit(10)
   *   .skip(5)
   *   .toArray()
   * ```
   */
  find(
    filter: Filter<TDocument> = {},
    options: FindOptions<TDocument> = {}
  ): HttpFindCursor<TDocument> {
    return new HttpFindCursor<TDocument>(
      (method, path, body) => this.request<TDocument[]>(method, path, body),
      filter,
      options
    )
  }

  /**
   * Update a single document matching the filter
   *
   * @param filter - Query filter
   * @param update - Update operations
   * @returns UpdateResult with match and modify counts
   */
  async updateOne(
    filter: Filter<TDocument>,
    update: UpdateFilter<TDocument>
  ): Promise<UpdateResult> {
    return this.request<UpdateResult>('POST', '/updateOne', { filter, update })
  }

  /**
   * Update all documents matching the filter
   *
   * @param filter - Query filter
   * @param update - Update operations
   * @returns UpdateResult with match and modify counts
   */
  async updateMany(
    filter: Filter<TDocument>,
    update: UpdateFilter<TDocument>
  ): Promise<UpdateResult> {
    return this.request<UpdateResult>('POST', '/updateMany', { filter, update })
  }

  /**
   * Replace a single document matching the filter
   *
   * @param filter - Query filter
   * @param replacement - The replacement document
   * @returns UpdateResult
   */
  async replaceOne(
    filter: Filter<TDocument>,
    replacement: Omit<TDocument, '_id'>
  ): Promise<UpdateResult> {
    return this.request<UpdateResult>('POST', '/replaceOne', { filter, replacement })
  }

  /**
   * Delete a single document matching the filter
   *
   * @param filter - Query filter
   * @returns DeleteResult with deleted count
   */
  async deleteOne(filter: Filter<TDocument>): Promise<DeleteResult> {
    return this.request<DeleteResult>('POST', '/deleteOne', { filter })
  }

  /**
   * Delete all documents matching the filter
   *
   * @param filter - Query filter
   * @returns DeleteResult with deleted count
   */
  async deleteMany(filter: Filter<TDocument>): Promise<DeleteResult> {
    return this.request<DeleteResult>('POST', '/deleteMany', { filter })
  }

  /**
   * Count documents matching the filter
   *
   * @param filter - Query filter
   * @returns Number of matching documents
   */
  async countDocuments(filter: Filter<TDocument> = {}): Promise<number> {
    const result = await this.request<{ count: number }>('POST', '/count', { filter })
    return result.count
  }

  /**
   * Get estimated document count (faster but less accurate)
   *
   * @returns Estimated number of documents
   */
  async estimatedDocumentCount(): Promise<number> {
    const result = await this.request<{ count: number }>('GET', '/estimatedCount')
    return result.count
  }

  /**
   * Execute an aggregation pipeline
   *
   * Returns a cursor that supports:
   * - Async iteration with `for await (const doc of cursor)`
   * - Converting to array with `await cursor.toArray()`
   * - forEach iteration with `await cursor.forEach(callback)`
   *
   * @param pipeline - Array of aggregation stages
   * @param options - Aggregation options
   * @returns HttpAggregationCursor for iterating over results
   *
   * @example
   * ```typescript
   * // Using toArray
   * const results = await collection.aggregate([
   *   { $match: { status: 'active' } },
   *   { $group: { _id: '$category', count: { $sum: 1 } } }
   * ]).toArray()
   *
   * // Using async iterator
   * for await (const doc of collection.aggregate([
   *   { $match: { status: 'active' } }
   * ])) {
   *   console.log(doc)
   * }
   * ```
   */
  aggregate<TResult extends Document = Document>(
    pipeline: AggregationStage[],
    options: AggregateOptions = {}
  ): HttpAggregationCursor<TResult> {
    return new HttpAggregationCursor<TResult>(
      (method, path, body) => this.request<TResult[]>(method, path, body),
      pipeline,
      options
    )
  }

  /**
   * Get distinct values for a field
   *
   * @param field - The field to get distinct values for
   * @param filter - Optional filter
   * @returns Array of distinct values
   */
  async distinct<TValue = unknown>(
    field: keyof TDocument,
    filter: Filter<TDocument> = {}
  ): Promise<TValue[]> {
    return this.request<TValue[]>('POST', '/distinct', { field, filter })
  }

  /**
   * Create an index on this collection
   *
   * @param indexSpec - Index specification
   * @returns Name of the created index
   */
  async createIndex(indexSpec: IndexSpecification): Promise<string> {
    const result = await this.request<{ name: string }>('POST', '/createIndex', indexSpec)
    return result.name
  }

  /**
   * Drop an index from this collection
   *
   * @param indexName - Name of the index to drop
   */
  async dropIndex(indexName: string): Promise<void> {
    await this.request<void>('POST', '/dropIndex', { name: indexName })
  }

  /**
   * List all indexes on this collection
   *
   * @returns Array of index information
   */
  async listIndexes(): Promise<IndexSpecification[]> {
    return this.request<IndexSpecification[]>('GET', '/listIndexes')
  }

  /**
   * Drop this collection
   */
  async drop(): Promise<void> {
    await this.request<void>('POST', '/_drop')
  }
}
