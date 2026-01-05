/**
 * FindCursor - MongoDB-compatible cursor for query results
 *
 * Provides chainable methods for sorting, limiting, skipping, and projecting
 * query results. Supports async iteration and array conversion.
 */

import type { MongoCollection } from './mongo-collection'

// Base document type
export type Document = Record<string, unknown>

export interface FindOptions {
  projection?: Record<string, 0 | 1>
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
}

/**
 * FindCursor provides lazy evaluation of MongoDB queries
 */
export class FindCursor<TSchema extends Document = Document> {
  private readonly collection: MongoCollection<any>
  private readonly filter: object
  private _projection?: Record<string, 0 | 1>
  private _sort?: Record<string, 1 | -1>
  private _limit?: number
  private _skip?: number
  private _executed: boolean = false
  private _results: TSchema[] = []

  constructor(
    collection: MongoCollection<any>,
    filter: object,
    options?: FindOptions
  ) {
    this.collection = collection
    this.filter = filter
    if (options) {
      if (options.projection !== undefined) this._projection = options.projection
      if (options.sort !== undefined) this._sort = options.sort
      if (options.limit !== undefined) this._limit = options.limit
      if (options.skip !== undefined) this._skip = options.skip
    }
  }

  /**
   * Set the sort order
   */
  sort(spec: Record<string, 1 | -1>): this {
    this._sort = spec
    return this
  }

  /**
   * Set the maximum number of documents to return
   */
  limit(count: number): this {
    this._limit = count
    return this
  }

  /**
   * Set the number of documents to skip
   */
  skip(count: number): this {
    this._skip = count
    return this
  }

  /**
   * Set the projection for returned documents
   */
  project(spec: Record<string, 0 | 1>): this {
    this._projection = spec
    return this
  }

  /**
   * Execute the query and return all documents as an array
   */
  async toArray(): Promise<TSchema[]> {
    if (!this._executed) {
      const options: { sort?: Record<string, 1 | -1>; skip?: number; limit?: number } = {}
      if (this._sort !== undefined) options.sort = this._sort
      if (this._skip !== undefined) options.skip = this._skip
      if (this._limit !== undefined) options.limit = this._limit
      this._results = this.collection._findDocuments(this.filter, options)

      // Apply projection
      if (this._projection) {
        this._results = this._results.map(doc =>
          this.collection._applyProjection(doc, this._projection!)
        )
      }

      this._executed = true
    }
    return [...this._results]
  }

  /**
   * Execute callback for each document
   */
  async forEach(callback: (doc: TSchema) => void): Promise<void> {
    const docs = await this.toArray()
    for (const doc of docs) {
      callback(doc)
    }
  }

  /**
   * Count documents matching the query
   */
  async count(): Promise<number> {
    const docs = await this.toArray()
    return docs.length
  }

  /**
   * Check if there are any documents
   */
  async hasNext(): Promise<boolean> {
    const docs = await this.toArray()
    return docs.length > 0
  }

  /**
   * Get the next document (simple implementation)
   */
  async next(): Promise<TSchema | null> {
    const docs = await this.toArray()
    return docs.length > 0 ? docs[0] ?? null : null
  }

  /**
   * Map over documents
   */
  map<U>(fn: (doc: TSchema) => U): MappedCursor<TSchema, U> {
    return new MappedCursor(this, fn)
  }

  /**
   * Async iterator support
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<TSchema> {
    const docs = await this.toArray()
    for (const doc of docs) {
      yield doc
    }
  }
}

/**
 * Cursor with map transformation applied
 */
class MappedCursor<TSchema extends Document, U> {
  private readonly cursor: FindCursor<TSchema>
  private readonly mapFn: (doc: TSchema) => U

  constructor(cursor: FindCursor<TSchema>, mapFn: (doc: TSchema) => U) {
    this.cursor = cursor
    this.mapFn = mapFn
  }

  async toArray(): Promise<U[]> {
    const docs = await this.cursor.toArray()
    return docs.map(this.mapFn)
  }

  async forEach(callback: (doc: U) => void): Promise<void> {
    const docs = await this.toArray()
    for (const doc of docs) {
      callback(doc)
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<U> {
    const docs = await this.toArray()
    for (const doc of docs) {
      yield doc
    }
  }
}

export default FindCursor
