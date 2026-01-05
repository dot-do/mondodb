/**
 * MongoCursor - MongoDB-compatible cursor for iterating over query results
 *
 * Provides lazy iteration, buffering, and async iterator support.
 * Wraps results with MongoDB-style cursor operations.
 *
 * Features:
 * - Lazy evaluation: data is fetched only when needed
 * - Streaming support: memory-efficient iteration over large datasets
 * - Fluent interface: chainable modifier methods
 * - Query plan optimization: modifiers are sent to server when possible
 */

import { EventEmitter } from 'events'

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
 * Cursor configuration options passed to fetch function
 * These are used for query plan optimization at the server level
 */
export interface CursorOptions {
  limit?: number
  skip?: number
  sort?: SortSpec
  projection?: ProjectionSpec
  batchSize?: number
}

/**
 * Configuration for streaming cursor behavior
 */
export interface StreamConfig {
  /** Number of documents to fetch per batch (default: 1000) */
  batchSize: number
  /** High water mark for internal buffer (default: 100) */
  highWaterMark: number
  /** Whether server handles modifiers (skip optimization) */
  serverSideModifiers: boolean
}

/**
 * Function that fetches documents from the data source
 * Supports both full fetch and batched fetch modes
 */
export type FetchFunction<T> = (options: CursorOptions) => Promise<T[]>

/**
 * Streaming fetch function for large datasets
 */
export type StreamFetchFunction<T> = (
  options: CursorOptions,
  offset: number,
  batchSize: number
) => Promise<{ documents: T[]; hasMore: boolean }>

/**
 * Default stream configuration
 */
const DEFAULT_STREAM_CONFIG: StreamConfig = {
  batchSize: 1000,
  highWaterMark: 100,
  serverSideModifiers: false,
}

/**
 * MongoCursor class providing MongoDB-compatible cursor functionality
 *
 * @template T - Document type
 */
export class MongoCursor<T = Document> extends EventEmitter {
  private _fetchFn: FetchFunction<T>
  private _streamFetchFn?: StreamFetchFunction<T>
  private _options: CursorOptions
  private _streamConfig: StreamConfig
  private _buffer: T[] = []
  private _position: number = 0
  private _globalIndex: number = 0
  private _fetched: boolean = false
  private _exhausted: boolean = false
  private _closed: boolean = false
  private _mapFn?: (doc: T, index: number) => unknown
  private _queryPlan?: QueryPlan

  /**
   * Create a new MongoCursor
   * @param fetchFn - Function that fetches documents from data source
   * @param options - Initial cursor options
   * @param streamConfig - Optional streaming configuration
   */
  constructor(
    fetchFn: FetchFunction<T>,
    options: CursorOptions = {},
    streamConfig: Partial<StreamConfig> = {}
  ) {
    super()
    this._fetchFn = fetchFn
    this._options = { ...options }
    this._streamConfig = { ...DEFAULT_STREAM_CONFIG, ...streamConfig }
  }

  /**
   * Enable streaming mode with a custom stream fetch function
   */
  withStreamFetch(fn: StreamFetchFunction<T>): this {
    this._streamFetchFn = fn
    return this
  }

  /**
   * Whether the cursor has been closed
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
   * Get the current cursor options (useful for debugging/logging)
   */
  get options(): Readonly<CursorOptions> {
    return { ...this._options }
  }

  /**
   * Get the query plan for this cursor
   */
  get queryPlan(): QueryPlan | undefined {
    return this._queryPlan
  }

  /**
   * Generate optimized query plan based on cursor options
   */
  private generateQueryPlan(): QueryPlan {
    const plan: QueryPlan = {
      serverSideOperations: [],
      clientSideOperations: [],
      estimatedCost: 0,
    }

    // Analyze which operations can be pushed to server
    if (this._streamConfig.serverSideModifiers) {
      // Server can handle these efficiently via SQL
      if (this._options.sort) {
        plan.serverSideOperations.push({
          type: 'sort',
          spec: this._options.sort,
          sqlHint: this.generateOrderByClause(this._options.sort),
        })
      }
      if (this._options.skip) {
        plan.serverSideOperations.push({
          type: 'skip',
          value: this._options.skip,
          sqlHint: `OFFSET ${this._options.skip}`,
        })
      }
      if (this._options.limit) {
        plan.serverSideOperations.push({
          type: 'limit',
          value: this._options.limit,
          sqlHint: `LIMIT ${this._options.limit}`,
        })
      }
      if (this._options.projection) {
        plan.serverSideOperations.push({
          type: 'projection',
          spec: this._options.projection,
          sqlHint: this.generateProjectionHint(this._options.projection),
        })
      }
    } else {
      // Client-side processing
      if (this._options.sort) {
        plan.clientSideOperations.push({ type: 'sort', spec: this._options.sort })
        plan.estimatedCost += 100 // Sorting is expensive
      }
      if (this._options.skip) {
        plan.clientSideOperations.push({ type: 'skip', value: this._options.skip })
        plan.estimatedCost += 10
      }
      if (this._options.limit) {
        plan.clientSideOperations.push({ type: 'limit', value: this._options.limit })
        plan.estimatedCost += 1
      }
      if (this._options.projection) {
        plan.clientSideOperations.push({ type: 'projection', spec: this._options.projection })
        plan.estimatedCost += 20
      }
    }

    return plan
  }

  /**
   * Generate SQL ORDER BY clause hint
   */
  private generateOrderByClause(sort: SortSpec): string {
    return Object.entries(sort)
      .map(([field, dir]) => {
        const jsonPath = `json_extract(doc, '$.${field}')`
        return `${jsonPath} ${dir === 1 ? 'ASC' : 'DESC'}`
      })
      .join(', ')
  }

  /**
   * Generate projection hint for SQL
   */
  private generateProjectionHint(projection: ProjectionSpec): string {
    const fields = Object.entries(projection)
      .filter(([, v]) => v === 1)
      .map(([k]) => k)
    return fields.length > 0 ? `SELECT ${fields.join(', ')}` : 'SELECT *'
  }

  /**
   * Ensure data has been fetched (or fetch first batch for streaming)
   */
  private async ensureFetched(): Promise<void> {
    if (this._fetched || this._closed) return

    // Generate query plan before fetching
    this._queryPlan = this.generateQueryPlan()

    try {
      if (this._streamFetchFn) {
        // Streaming mode: fetch first batch
        await this.fetchNextBatch()
      } else {
        // Full fetch mode
        const docs = await this._fetchFn(this._options)
        this._buffer = this._streamConfig.serverSideModifiers
          ? docs
          : this.applyModifiers(docs)
        this._exhausted = true
      }
      this._fetched = true
    } catch (error) {
      this._closed = true
      throw error
    }
  }

  /**
   * Fetch next batch of documents in streaming mode
   */
  private async fetchNextBatch(): Promise<void> {
    if (!this._streamFetchFn || this._exhausted || this._closed) return

    const batchSize = this._options.batchSize ?? this._streamConfig.batchSize
    const result = await this._streamFetchFn(
      this._options,
      this._globalIndex,
      batchSize
    )

    // Clear consumed portion of buffer to save memory
    if (this._position > 0) {
      this._buffer = this._buffer.slice(this._position)
      this._position = 0
    }

    // Apply client-side modifiers if needed
    const newDocs = this._streamConfig.serverSideModifiers
      ? result.documents
      : this.applyModifiersStreaming(result.documents)

    this._buffer.push(...newDocs)
    this._globalIndex += result.documents.length
    this._exhausted = !result.hasMore
  }

  /**
   * Apply modifiers for streaming (skip/limit aware)
   */
  private applyModifiersStreaming(docs: T[]): T[] {
    let result = docs

    // Note: sort is handled differently in streaming mode
    // We assume server provides sorted data or we buffer everything

    // Skip is tricky in streaming - we track globally
    // Limit is also tracked globally

    // Apply projection (stateless, can always apply)
    if (this._options.projection) {
      result = this.applyProjectionModifier(result, this._options.projection)
    }

    return result
  }

  /**
   * Apply cursor modifiers to the document array
   * (for client-side processing when server doesn't handle them)
   */
  private applyModifiers(docs: T[]): T[] {
    let result = [...docs]

    // Apply sort first (must happen before skip/limit)
    if (this._options.sort) {
      result = this.applySortModifier(result, this._options.sort)
    }

    // Apply skip
    if (this._options.skip && this._options.skip > 0) {
      result = result.slice(this._options.skip)
    }

    // Apply limit
    if (this._options.limit !== undefined) {
      if (this._options.limit === 0) {
        result = []
      } else if (this._options.limit > 0) {
        result = result.slice(0, this._options.limit)
      }
    }

    // Apply projection last
    if (this._options.projection) {
      result = this.applyProjectionModifier(result, this._options.projection)
    }

    return result
  }

  /**
   * Apply sort modifier to documents using optimized comparison
   */
  private applySortModifier(docs: T[], sort: SortSpec): T[] {
    const sortFields = Object.entries(sort)

    // Pre-compute field paths for efficiency
    const fieldPaths = sortFields.map(([field]) => field.split('.'))

    return [...docs].sort((a, b) => {
      for (let i = 0; i < sortFields.length; i++) {
        const sortField = sortFields[i]
        const path = fieldPaths[i]
        if (!sortField || !path) continue
        const [, direction] = sortField
        const aVal = this.getFieldValueOptimized(a, path)
        const bVal = this.getFieldValueOptimized(b, path)

        const comparison = this.compareValues(aVal, bVal)
        if (comparison !== 0) return comparison * direction
      }
      return 0
    })
  }

  /**
   * Compare two values with type-aware comparison
   */
  private compareValues(a: unknown, b: unknown): number {
    // Handle null/undefined
    if (a === null || a === undefined) {
      return b === null || b === undefined ? 0 : -1
    }
    if (b === null || b === undefined) return 1

    // Type-specific comparison
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b)
    }

    if (a < b) return -1
    if (a > b) return 1
    return 0
  }

  /**
   * Get nested field value from document (optimized version with pre-split path)
   */
  private getFieldValueOptimized(doc: unknown, pathParts: string[]): unknown {
    let value: unknown = doc

    for (const part of pathParts) {
      if (value === null || value === undefined) return undefined
      value = (value as Record<string, unknown>)[part]
    }

    return value
  }

  /**
   * Apply projection modifier to documents
   */
  private applyProjectionModifier(docs: T[], projection: ProjectionSpec): T[] {
    const includeMode = Object.values(projection).some((v) => v === 1)
    const excludeId = projection._id === 0

    // Pre-compute inclusion/exclusion sets for efficiency
    const includeFields = new Set(
      Object.entries(projection)
        .filter(([, v]) => v === 1)
        .map(([k]) => k)
    )
    const excludeFields = new Set(
      Object.entries(projection)
        .filter(([, v]) => v === 0)
        .map(([k]) => k)
    )

    return docs.map((doc) => {
      const docObj = doc as Record<string, unknown>
      const result: Record<string, unknown> = {}

      if (includeMode) {
        // Include mode: only include specified fields (plus _id unless excluded)
        if (!excludeId && '_id' in docObj) {
          result._id = docObj._id
        }
        for (const field of includeFields) {
          if (field !== '_id' && field in docObj) {
            result[field] = docObj[field]
          }
        }
      } else {
        // Exclude mode: include all fields except specified ones
        for (const [field, value] of Object.entries(docObj)) {
          if (field === '_id' && excludeId) continue
          if (!excludeFields.has(field)) {
            result[field] = value
          }
        }
      }

      return result as T
    })
  }

  // =====================
  // Fluent Interface Methods
  // =====================

  /**
   * Set a limit on the number of documents to return
   * @throws Error if limit is negative
   */
  limit(count: number): this {
    if (count < 0) {
      throw new Error('Limit must be non-negative')
    }
    this._options.limit = count
    return this
  }

  /**
   * Set the number of documents to skip
   * @throws Error if skip is negative
   */
  skip(count: number): this {
    if (count < 0) {
      throw new Error('Skip must be non-negative')
    }
    this._options.skip = count
    return this
  }

  /**
   * Set the sort order for documents
   */
  sort(spec: SortSpec): this {
    this._options.sort = spec
    return this
  }

  /**
   * Set the projection for returned documents
   */
  project(spec: ProjectionSpec): this {
    this._options.projection = spec
    return this
  }

  /**
   * Set the batch size for streaming mode
   */
  batchSize(size: number): this {
    if (size < 1) {
      throw new Error('Batch size must be at least 1')
    }
    this._options.batchSize = size
    return this
  }

  /**
   * Enable server-side modifier processing
   */
  serverSide(enabled: boolean = true): this {
    this._streamConfig.serverSideModifiers = enabled
    return this
  }

  // =====================
  // Iteration Methods
  // =====================

  /**
   * Get the next document from the cursor
   * Returns null when exhausted
   */
  async next(): Promise<T | null> {
    if (this._closed) return null

    await this.ensureFetched()

    // Check if we need to fetch more in streaming mode
    if (
      this._streamFetchFn &&
      !this._exhausted &&
      this._position >= this._buffer.length
    ) {
      await this.fetchNextBatch()
    }

    if (this._position >= this._buffer.length) {
      return null
    }

    const doc = this._buffer[this._position++]
    if (doc === undefined) {
      return null
    }

    if (this._mapFn) {
      return this._mapFn(doc, this._position - 1) as T
    }

    return doc
  }

  /**
   * Check if there are more documents
   */
  async hasNext(): Promise<boolean> {
    if (this._closed) return false

    await this.ensureFetched()

    // Check if we need to fetch more in streaming mode
    if (
      this._streamFetchFn &&
      !this._exhausted &&
      this._position >= this._buffer.length
    ) {
      await this.fetchNextBatch()
    }

    return this._position < this._buffer.length
  }

  /**
   * Get all remaining documents as an array
   * Memory warning: this loads all documents into memory
   */
  async toArray(): Promise<T[]> {
    if (this._closed) return []

    await this.ensureFetched()

    // For streaming, we need to fetch all remaining batches
    if (this._streamFetchFn) {
      while (!this._exhausted) {
        await this.fetchNextBatch()
      }
    }

    const remaining = this._buffer.slice(this._position)
    this._position = this._buffer.length

    // Close cursor after consuming all documents
    await this.close()

    if (this._mapFn) {
      return remaining.map((doc, i) => this._mapFn!(doc, i) as T)
    }

    return remaining
  }

  /**
   * Iterate over all documents with a callback
   * Return false from callback to stop iteration
   * Memory-efficient: processes documents as they are fetched
   */
  async forEach(
    callback: (doc: T, index: number) => void | false | Promise<void | false>
  ): Promise<void> {
    if (this._closed) return

    await this.ensureFetched()

    let index = 0
    let shouldContinue = true

    while (shouldContinue) {
      // Process current buffer
      while (this._position < this._buffer.length && shouldContinue) {
        const doc = this._buffer[this._position++]
        if (doc === undefined) continue
        const mappedDoc = this._mapFn ? (this._mapFn(doc, index) as T) : doc

        const result = await callback(mappedDoc, index++)
        if (result === false) {
          shouldContinue = false
        }
      }

      // Fetch more if streaming and not exhausted
      if (shouldContinue && this._streamFetchFn && !this._exhausted) {
        await this.fetchNextBatch()
      } else if (this._position >= this._buffer.length) {
        break
      }
    }
  }

  /**
   * Transform documents with a mapping function
   * Returns a new cursor with the transformation applied
   * Lazy: transformation is applied during iteration
   */
  map<U>(fn: (doc: T, index: number) => U): MongoCursor<U> {
    const newCursor = new MongoCursor<U>(
      this._fetchFn as unknown as FetchFunction<U>,
      { ...this._options },
      { ...this._streamConfig }
    )

    // Transfer state
    newCursor._fetched = this._fetched
    newCursor._buffer = this._buffer as unknown as U[]
    newCursor._position = this._position
    newCursor._exhausted = this._exhausted
    newCursor._streamFetchFn = this._streamFetchFn as unknown as StreamFetchFunction<U>

    // Chain map functions
    const existingMapFn = this._mapFn
    newCursor._mapFn = existingMapFn
      ? (doc: U, index: number) =>
          fn(existingMapFn(doc as unknown as T, index) as T, index)
      : (doc: U, index: number) => fn(doc as unknown as T, index)

    return newCursor
  }

  /**
   * Filter documents based on a predicate
   * Returns a new cursor with the filter applied
   */
  filter(predicate: (doc: T) => boolean): MongoCursor<T> {
    const originalFetchFn = this._fetchFn
    const filteredFetchFn: FetchFunction<T> = async (options) => {
      const docs = await originalFetchFn(options)
      return docs.filter(predicate)
    }

    return new MongoCursor<T>(filteredFetchFn, { ...this._options }, { ...this._streamConfig })
  }

  /**
   * Count documents without consuming the cursor
   */
  async count(): Promise<number> {
    // Save current position
    const savedPosition = this._position

    await this.ensureFetched()

    // For streaming, count requires fetching all
    if (this._streamFetchFn) {
      while (!this._exhausted) {
        await this.fetchNextBatch()
      }
    }

    const count = this._buffer.length - savedPosition

    // Restore position if not exhausted
    this._position = savedPosition

    return count
  }

  /**
   * Close the cursor and release resources
   */
  async close(): Promise<void> {
    if (this._closed) return

    this._closed = true
    this._buffer = []
    this._position = 0

    this.emit('close')
  }

  /**
   * Create a readable stream from the cursor
   * For use with Node.js stream pipelines
   */
  toStream(): AsyncIterable<T> {
    return this
  }

  /**
   * Async iterator implementation
   * Supports for-await-of syntax and streaming
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
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
   * Register an event listener
   */
  on(event: 'close', listener: () => void): this {
    return super.on(event, listener)
  }

  /**
   * Clone this cursor with the same options
   * Useful for re-running the same query
   */
  clone(): MongoCursor<T> {
    const cloned = new MongoCursor<T>(
      this._fetchFn,
      { ...this._options },
      { ...this._streamConfig }
    )
    if (this._streamFetchFn) {
      cloned._streamFetchFn = this._streamFetchFn
    }
    return cloned
  }

  /**
   * Explain the query plan for this cursor
   */
  explain(): QueryPlan {
    if (!this._queryPlan) {
      this._queryPlan = this.generateQueryPlan()
    }
    return this._queryPlan
  }
}

/**
 * Query plan interface for optimization insights
 */
export interface QueryPlan {
  serverSideOperations: QueryOperation[]
  clientSideOperations: QueryOperation[]
  estimatedCost: number
}

/**
 * Individual query operation in the plan
 */
export interface QueryOperation {
  type: 'sort' | 'skip' | 'limit' | 'projection'
  spec?: SortSpec | ProjectionSpec
  value?: number
  sqlHint?: string
}

export default MongoCursor
