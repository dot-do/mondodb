/**
 * HTTP Cursors - MongoDB-compatible cursor implementations for HTTP client
 *
 * These cursors wrap HTTP requests to provide lazy evaluation, streaming,
 * and MongoDB-compatible iteration patterns for find() and aggregate() operations.
 */

import type { Document, Filter, FindOptions, AggregationStage, AggregateOptions } from '../types/mongodb'

/**
 * Sort direction: 1 for ascending, -1 for descending
 */
export type SortDirection = 1 | -1

/**
 * Sort specification with field names and directions
 */
export type SortSpec = Record<string, SortDirection>

/**
 * Projection specification: 1 to include, 0 to exclude
 */
export type ProjectionSpec = Record<string, 0 | 1>

/**
 * HTTP request function type
 */
export type HttpRequestFn<T> = (method: string, path: string, body?: unknown) => Promise<T>

/**
 * HttpFindCursor - Cursor for find() operations via HTTP
 *
 * Provides MongoDB-compatible cursor interface with:
 * - Lazy evaluation (data fetched on first access)
 * - Chainable modifiers (sort, limit, skip, project)
 * - Async iteration support
 * - toArray() for collecting all results
 */
export class HttpFindCursor<TDocument extends Document = Document> {
  private readonly requestFn: HttpRequestFn<TDocument[]>
  private readonly filter: Filter<TDocument>
  private _sort?: SortSpec
  private _limit?: number
  private _skip?: number
  private _projection?: ProjectionSpec
  private _batchSize?: number

  private _buffer: TDocument[] = []
  private _position: number = 0
  private _fetched: boolean = false
  private _closed: boolean = false
  private _error: Error | null = null

  /**
   * Create a new HttpFindCursor
   *
   * @param requestFn - Function to make HTTP requests
   * @param filter - Query filter
   * @param options - Initial find options
   */
  constructor(
    requestFn: HttpRequestFn<TDocument[]>,
    filter: Filter<TDocument> = {},
    options: FindOptions<TDocument> = {}
  ) {
    this.requestFn = requestFn
    this.filter = filter

    // Apply initial options
    if (options.sort) {
      this._sort = options.sort as SortSpec
    }
    if (options.limit !== undefined) {
      this._limit = options.limit
    }
    if (options.skip !== undefined) {
      this._skip = options.skip
    }
    if (options.projection) {
      this._projection = options.projection as ProjectionSpec
    }
  }

  /**
   * Whether the cursor is closed
   */
  get closed(): boolean {
    return this._closed
  }

  /**
   * Number of documents currently buffered
   */
  get bufferedCount(): number {
    return this._closed ? 0 : Math.max(0, this._buffer.length - this._position)
  }

  // =====================
  // Fluent Interface Methods (Modifiers)
  // =====================

  /**
   * Set the sort order for documents
   */
  sort(spec: SortSpec): this {
    this._sort = spec
    return this
  }

  /**
   * Set a limit on the number of documents to return
   */
  limit(count: number): this {
    if (count < 0) {
      throw new Error('Limit must be non-negative')
    }
    this._limit = count
    return this
  }

  /**
   * Set the number of documents to skip
   */
  skip(count: number): this {
    if (count < 0) {
      throw new Error('Skip must be non-negative')
    }
    this._skip = count
    return this
  }

  /**
   * Set the projection for returned documents
   */
  project(spec: ProjectionSpec): this {
    this._projection = spec
    return this
  }

  /**
   * Set the batch size for streaming (hint for server)
   */
  batchSize(size: number): this {
    if (size < 1) {
      throw new Error('Batch size must be at least 1')
    }
    this._batchSize = size
    return this
  }

  // =====================
  // Data Fetching
  // =====================

  /**
   * Ensure data has been fetched from the server
   */
  private async ensureFetched(): Promise<void> {
    if (this._fetched || this._closed) return
    if (this._error) throw this._error

    try {
      // Build options for the request
      const options: FindOptions<TDocument> = {}
      if (this._sort) options.sort = this._sort as FindOptions<TDocument>['sort']
      if (this._limit !== undefined) options.limit = this._limit
      if (this._skip !== undefined) options.skip = this._skip
      if (this._projection) options.projection = this._projection as FindOptions<TDocument>['projection']

      // Make the HTTP request
      this._buffer = await this.requestFn('POST', '/find', { filter: this.filter, options })
      this._fetched = true
    } catch (error) {
      this._error = error instanceof Error ? error : new Error(String(error))
      this._closed = true
      throw this._error
    }
  }

  // =====================
  // Iteration Methods
  // =====================

  /**
   * Get the next document from the cursor
   * Returns null when exhausted
   */
  async next(): Promise<TDocument | null> {
    if (this._closed) return null
    if (this._error) throw this._error

    await this.ensureFetched()

    if (this._position >= this._buffer.length) {
      return null
    }

    return this._buffer[this._position++]
  }

  /**
   * Check if there are more documents
   */
  async hasNext(): Promise<boolean> {
    if (this._closed) return false
    if (this._error) return false

    await this.ensureFetched()
    return this._position < this._buffer.length
  }

  /**
   * Get all documents as an array
   */
  async toArray(): Promise<TDocument[]> {
    if (this._closed) return []
    if (this._error) throw this._error

    await this.ensureFetched()

    const remaining = this._buffer.slice(this._position)
    this._position = this._buffer.length

    // Close cursor after consuming
    await this.close()

    return remaining
  }

  /**
   * Iterate over all documents with a callback
   * Return false from callback to stop iteration
   */
  async forEach(
    callback: (doc: TDocument, index: number) => void | false | Promise<void | false>
  ): Promise<void> {
    if (this._closed) return
    if (this._error) throw this._error

    await this.ensureFetched()

    let index = 0
    while (this._position < this._buffer.length) {
      const doc = this._buffer[this._position++]
      const result = await callback(doc, index++)
      if (result === false) break
    }
  }

  /**
   * Transform documents with a mapping function
   */
  map<U>(fn: (doc: TDocument, index: number) => U): MappedHttpCursor<TDocument, U> {
    return new MappedHttpCursor(this, fn)
  }

  /**
   * Count documents without consuming the cursor
   */
  async count(): Promise<number> {
    await this.ensureFetched()
    return this._buffer.length - this._position
  }

  /**
   * Close the cursor and release resources
   */
  async close(): Promise<void> {
    if (this._closed) return

    this._closed = true
    this._buffer = []
    this._position = 0
  }

  /**
   * Clone this cursor with the same options
   */
  clone(): HttpFindCursor<TDocument> {
    const cloned = new HttpFindCursor<TDocument>(this.requestFn, this.filter)
    if (this._sort) cloned._sort = { ...this._sort }
    if (this._limit !== undefined) cloned._limit = this._limit
    if (this._skip !== undefined) cloned._skip = this._skip
    if (this._projection) cloned._projection = { ...this._projection }
    if (this._batchSize) cloned._batchSize = this._batchSize
    return cloned
  }

  /**
   * Async iterator implementation
   * Supports for-await-of syntax
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<TDocument> {
    try {
      while (await this.hasNext()) {
        const doc = await this.next()
        if (doc !== null) {
          yield doc
        }
      }
    } finally {
      await this.close()
    }
  }
}

/**
 * Mapped cursor for transformed results
 */
class MappedHttpCursor<TDocument extends Document, U> {
  private readonly _cursor: HttpFindCursor<TDocument>
  private readonly _mapFn: (doc: TDocument, index: number) => U

  constructor(cursor: HttpFindCursor<TDocument>, mapFn: (doc: TDocument, index: number) => U) {
    this._cursor = cursor
    this._mapFn = mapFn
  }

  async toArray(): Promise<U[]> {
    const docs = await this._cursor.toArray()
    return docs.map(this._mapFn)
  }

  async forEach(
    callback: (doc: U, index: number) => void | false | Promise<void | false>
  ): Promise<void> {
    let index = 0
    await this._cursor.forEach(async (doc) => {
      const mapped = this._mapFn(doc, index)
      return callback(mapped, index++)
    })
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<U> {
    let index = 0
    for await (const doc of this._cursor) {
      yield this._mapFn(doc, index++)
    }
  }
}

/**
 * HttpAggregationCursor - Cursor for aggregate() operations via HTTP
 *
 * Provides MongoDB-compatible cursor interface with:
 * - Lazy evaluation (pipeline executed on first access)
 * - Async iteration support
 * - toArray() for collecting all results
 */
export class HttpAggregationCursor<TResult extends Document = Document> {
  private readonly requestFn: HttpRequestFn<TResult[]>
  private readonly pipeline: AggregationStage[]
  private readonly options: AggregateOptions

  private _buffer: TResult[] = []
  private _position: number = 0
  private _fetched: boolean = false
  private _closed: boolean = false
  private _error: Error | null = null

  /**
   * Create a new HttpAggregationCursor
   *
   * @param requestFn - Function to make HTTP requests
   * @param pipeline - Aggregation pipeline stages
   * @param options - Aggregation options
   */
  constructor(
    requestFn: HttpRequestFn<TResult[]>,
    pipeline: AggregationStage[],
    options: AggregateOptions = {}
  ) {
    this.requestFn = requestFn
    this.pipeline = pipeline
    this.options = options
  }

  /**
   * Whether the cursor is closed
   */
  get closed(): boolean {
    return this._closed
  }

  /**
   * Number of documents currently buffered
   */
  get bufferedCount(): number {
    return this._closed ? 0 : Math.max(0, this._buffer.length - this._position)
  }

  /**
   * Ensure data has been fetched from the server
   */
  private async ensureFetched(): Promise<void> {
    if (this._fetched || this._closed) return
    if (this._error) throw this._error

    try {
      // Make the HTTP request
      this._buffer = await this.requestFn('POST', '/aggregate', {
        pipeline: this.pipeline,
        options: this.options
      })
      this._fetched = true
    } catch (error) {
      this._error = error instanceof Error ? error : new Error(String(error))
      this._closed = true
      throw this._error
    }
  }

  // =====================
  // Iteration Methods
  // =====================

  /**
   * Get the next document from the cursor
   * Returns null when exhausted
   */
  async next(): Promise<TResult | null> {
    if (this._closed) return null
    if (this._error) throw this._error

    await this.ensureFetched()

    if (this._position >= this._buffer.length) {
      return null
    }

    return this._buffer[this._position++]
  }

  /**
   * Check if there are more documents
   */
  async hasNext(): Promise<boolean> {
    if (this._closed) return false
    if (this._error) return false

    await this.ensureFetched()
    return this._position < this._buffer.length
  }

  /**
   * Get all documents as an array
   */
  async toArray(): Promise<TResult[]> {
    if (this._closed) return []
    if (this._error) throw this._error

    await this.ensureFetched()

    const remaining = this._buffer.slice(this._position)
    this._position = this._buffer.length

    // Close cursor after consuming
    await this.close()

    return remaining
  }

  /**
   * Iterate over all documents with a callback
   * Return false from callback to stop iteration
   */
  async forEach(
    callback: (doc: TResult, index: number) => void | false | Promise<void | false>
  ): Promise<void> {
    if (this._closed) return
    if (this._error) throw this._error

    await this.ensureFetched()

    let index = 0
    while (this._position < this._buffer.length) {
      const doc = this._buffer[this._position++]
      const result = await callback(doc, index++)
      if (result === false) break
    }
  }

  /**
   * Transform documents with a mapping function
   */
  map<U>(fn: (doc: TResult, index: number) => U): MappedHttpAggregationCursor<TResult, U> {
    return new MappedHttpAggregationCursor(this, fn)
  }

  /**
   * Close the cursor and release resources
   */
  async close(): Promise<void> {
    if (this._closed) return

    this._closed = true
    this._buffer = []
    this._position = 0
  }

  /**
   * Clone this cursor with the same options
   */
  clone(): HttpAggregationCursor<TResult> {
    return new HttpAggregationCursor<TResult>(
      this.requestFn,
      [...this.pipeline],
      { ...this.options }
    )
  }

  /**
   * Async iterator implementation
   * Supports for-await-of syntax
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<TResult> {
    try {
      while (await this.hasNext()) {
        const doc = await this.next()
        if (doc !== null) {
          yield doc
        }
      }
    } finally {
      await this.close()
    }
  }

  /**
   * Explain the aggregation plan (returns pipeline stages)
   */
  explain(): { pipeline: AggregationStage[]; options: AggregateOptions } {
    return {
      pipeline: [...this.pipeline],
      options: { ...this.options }
    }
  }
}

/**
 * Mapped aggregation cursor for transformed results
 */
class MappedHttpAggregationCursor<TResult extends Document, U> {
  private readonly _cursor: HttpAggregationCursor<TResult>
  private readonly _mapFn: (doc: TResult, index: number) => U

  constructor(cursor: HttpAggregationCursor<TResult>, mapFn: (doc: TResult, index: number) => U) {
    this._cursor = cursor
    this._mapFn = mapFn
  }

  async toArray(): Promise<U[]> {
    const docs = await this._cursor.toArray()
    return docs.map(this._mapFn)
  }

  async forEach(
    callback: (doc: U, index: number) => void | false | Promise<void | false>
  ): Promise<void> {
    let index = 0
    await this._cursor.forEach(async (doc) => {
      const mapped = this._mapFn(doc, index)
      return callback(mapped, index++)
    })
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<U> {
    let index = 0
    for await (const doc of this._cursor) {
      yield this._mapFn(doc, index++)
    }
  }
}

export default { HttpFindCursor, HttpAggregationCursor }
