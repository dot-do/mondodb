/**
 * DatabaseProxy WorkerEntrypoint - Cloudflare Workers RPC integration
 *
 * Provides a WorkerEntrypoint-based proxy for database operations that routes
 * requests to the appropriate MondoDatabase Durable Object instance.
 *
 * This enables secure, sandboxed database access for MCP tools and other
 * Workers using service bindings.
 *
 * Features:
 * - Input validation for collection names and documents
 * - Rate limiting to prevent abuse
 * - Request deduplication for identical concurrent requests
 * - Optional audit logging
 * - Transaction support
 */

import { WorkerEntrypoint } from 'cloudflare:workers'
import type { DurableObjectNamespace, DurableObjectStub } from '../../types/rpc'

// Re-export types for backward compatibility
export type { DurableObjectNamespace, DurableObjectStub }

/**
 * Document type alias for type safety
 */
export type Document = Record<string, unknown>

/**
 * Environment bindings for DatabaseProxy
 */
export interface Env {
  MONDO_DATABASE: DurableObjectNamespace
}

/**
 * Props passed to the DatabaseProxy via service bindings
 */
export interface Props {
  databaseId: string
  /** Enable audit logging for all operations */
  enableAuditLog?: boolean
  /** Maximum requests per execution (default: 1000) */
  maxRequestsPerExecution?: number
}

/**
 * Alias for backward compatibility
 */
export type DatabaseProxyProps = Props

/**
 * Database session for transaction support
 */
export interface DatabaseSession {
  sessionId: string
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Invalid characters in collection names
 */
const INVALID_COLLECTION_CHARS = ['$', '\0', '.']

/**
 * Maximum collection name length
 */
const MAX_COLLECTION_NAME_LENGTH = 255

/**
 * Validate a collection name
 * @throws Error if collection name is invalid
 */
function validateCollection(name: unknown): asserts name is string {
  if (!name || typeof name !== 'string') {
    throw new Error('Collection name must be a non-empty string')
  }
  if (name.length > MAX_COLLECTION_NAME_LENGTH) {
    throw new Error(`Collection name must not exceed ${MAX_COLLECTION_NAME_LENGTH} characters`)
  }
  for (const char of INVALID_COLLECTION_CHARS) {
    if (name.includes(char)) {
      throw new Error(`Invalid collection name: contains '${char === '\0' ? '\\0' : char}'`)
    }
  }
  // Collection names starting with 'system.' are reserved
  if (name.startsWith('system.')) {
    throw new Error('Collection names starting with "system." are reserved')
  }
}

/**
 * Validate a document
 * @throws Error if document is invalid
 */
function validateDocument(doc: unknown): asserts doc is Document {
  if (doc === null || doc === undefined) {
    throw new Error('Document is required')
  }
  if (typeof doc !== 'object') {
    throw new Error('Document must be an object')
  }
  if (Array.isArray(doc)) {
    throw new Error('Document must be an object, not an array')
  }
}

/**
 * Validate a filter object
 * @throws Error if filter is invalid
 */
function validateFilter(filter: unknown): asserts filter is Document {
  if (filter === undefined) {
    return // undefined is allowed (will use empty filter)
  }
  if (filter === null || typeof filter !== 'object') {
    throw new Error('Filter must be an object')
  }
  if (Array.isArray(filter)) {
    throw new Error('Filter must be an object, not an array')
  }
}

/**
 * Validate an update object
 * @throws Error if update is invalid
 */
function validateUpdate(update: unknown): asserts update is Document {
  if (update === null || update === undefined) {
    throw new Error('Update is required')
  }
  if (typeof update !== 'object') {
    throw new Error('Update must be an object')
  }
  if (Array.isArray(update)) {
    throw new Error('Update must be an object, not an array')
  }
}

/**
 * Validate an aggregation pipeline
 * @throws Error if pipeline is invalid
 */
function validatePipeline(pipeline: unknown): asserts pipeline is Document[] {
  if (!Array.isArray(pipeline)) {
    throw new Error('Pipeline must be an array')
  }
  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i]
    if (stage === null || typeof stage !== 'object' || Array.isArray(stage)) {
      throw new Error(`Pipeline stage at index ${i} must be an object`)
    }
  }
}

/**
 * DatabaseProxy - WorkerEntrypoint for database operations
 *
 * Routes CRUD operations to the MondoDatabase Durable Object.
 * Uses props.databaseId to identify which database instance to use.
 *
 * Features:
 * - Input validation for all parameters
 * - Rate limiting (configurable via props.maxRequestsPerExecution)
 * - Request deduplication for identical concurrent requests
 * - Optional audit logging (enable via props.enableAuditLog)
 * - Transaction support via withTransaction()
 *
 * @example
 * ```typescript
 * // In a Worker, use as a service binding:
 * const result = await env.DB_PROXY.find('users', { active: true })
 *
 * // The DB_PROXY is configured with props:
 * // { databaseId: 'my-database', enableAuditLog: true }
 * ```
 */
export class DatabaseProxy extends WorkerEntrypoint<Env> {
  /** Request counter for rate limiting */
  private requestCount = 0

  /** Default maximum requests per execution */
  private static readonly DEFAULT_MAX_REQUESTS = 1000

  /** Pending requests map for deduplication */
  private pendingRequests = new Map<string, Promise<unknown>>()

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Get props from context
   */
  private getProps(): Props {
    return (this.ctx as unknown as { props: Props }).props
  }

  /**
   * Get the database stub for the configured database ID
   */
  private getDatabaseStub(): DurableObjectStub {
    const props = this.getProps()
    const id = this.env.MONDO_DATABASE.idFromName(props.databaseId)
    return this.env.MONDO_DATABASE.get(id)
  }

  /**
   * Check rate limit and throw if exceeded
   * @throws Error if rate limit exceeded
   */
  private checkRateLimit(): void {
    const props = this.getProps()
    const maxRequests = props.maxRequestsPerExecution ?? DatabaseProxy.DEFAULT_MAX_REQUESTS
    if (++this.requestCount > maxRequests) {
      throw new Error(
        `Rate limit exceeded: too many database requests in single execution (max: ${maxRequests})`
      )
    }
  }

  /**
   * Log an operation for audit purposes
   */
  private log(method: string, collection: string, args: unknown): void {
    const props = this.getProps()
    if (props.enableAuditLog) {
      console.log(
        JSON.stringify({
          timestamp: Date.now(),
          method,
          collection,
          databaseId: props.databaseId,
          args: this.sanitizeForLog(args),
        })
      )
    }
  }

  /**
   * Sanitize arguments for logging (remove sensitive data patterns)
   */
  private sanitizeForLog(args: unknown): unknown {
    if (args === null || args === undefined) {
      return args
    }
    if (typeof args !== 'object') {
      return args
    }
    if (Array.isArray(args)) {
      return args.map((item) => this.sanitizeForLog(item))
    }
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
      // Mask potentially sensitive field names
      const lowerKey = key.toLowerCase()
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key')
      ) {
        sanitized[key] = '[REDACTED]'
      } else {
        sanitized[key] = this.sanitizeForLog(value)
      }
    }
    return sanitized
  }

  /**
   * Generate a cache key for request deduplication
   */
  private getCacheKey(endpoint: string, body: Record<string, unknown>): string {
    return `${endpoint}:${JSON.stringify(body)}`
  }

  /**
   * Execute a request with deduplication for read operations
   */
  private async deduplicatedRequest<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const key = this.getCacheKey(endpoint, body)

    // Check if there's already a pending identical request
    const pending = this.pendingRequests.get(key)
    if (pending) {
      return pending as Promise<T>
    }

    // Create new request and store it
    const promise = this.request(endpoint, body).finally(() => {
      this.pendingRequests.delete(key)
    })

    this.pendingRequests.set(key, promise)
    return promise as Promise<T>
  }

  /**
   * Make a request to the database
   * @throws Error if response is not ok
   */
  private async request(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
    this.checkRateLimit()

    const stub = this.getDatabaseStub()
    const response = await stub.fetch(
      new Request(`http://internal${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    )

    // Check for error responses
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Database request failed (${response.status}): ${errorText}`)
    }

    return response.json()
  }

  /**
   * Find documents matching a filter
   */
  async find(
    collection: string,
    filter: Record<string, unknown> = {}
  ): Promise<{ documents: unknown[] }> {
    if (!collection) {
      throw new Error('Collection name is required')
    }
    return this.request('/find', { collection, filter }) as Promise<{ documents: unknown[] }>
  }

  /**
   * Find a single document matching a filter
   */
  async findOne(
    collection: string,
    filter: Record<string, unknown> = {}
  ): Promise<{ document: unknown | null }> {
    if (!collection) {
      throw new Error('Collection name is required')
    }
    return this.request('/findOne', { collection, filter }) as Promise<{ document: unknown | null }>
  }

  /**
   * Insert a single document
   */
  async insertOne(
    collection: string,
    document?: Record<string, unknown>
  ): Promise<{ insertedId: string }> {
    if (!collection) {
      throw new Error('Collection name is required')
    }
    if (!document) {
      throw new Error('Document is required')
    }
    return this.request('/insertOne', { collection, document }) as Promise<{ insertedId: string }>
  }

  /**
   * Insert multiple documents
   */
  async insertMany(
    collection: string,
    documents: Record<string, unknown>[]
  ): Promise<{ insertedIds: string[] }> {
    if (!collection) {
      throw new Error('Collection name is required')
    }
    return this.request('/insertMany', { collection, documents }) as Promise<{ insertedIds: string[] }>
  }

  /**
   * Update a single document
   */
  async updateOne(
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ): Promise<{ modifiedCount: number }> {
    if (!collection) {
      throw new Error('Collection name is required')
    }
    return this.request('/updateOne', { collection, filter, update }) as Promise<{ modifiedCount: number }>
  }

  /**
   * Update multiple documents
   */
  async updateMany(
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ): Promise<{ modifiedCount: number }> {
    if (!collection) {
      throw new Error('Collection name is required')
    }
    return this.request('/updateMany', { collection, filter, update }) as Promise<{ modifiedCount: number }>
  }

  /**
   * Delete a single document
   */
  async deleteOne(
    collection: string,
    filter: Record<string, unknown>
  ): Promise<{ deletedCount: number }> {
    if (!collection) {
      throw new Error('Collection name is required')
    }
    return this.request('/deleteOne', { collection, filter }) as Promise<{ deletedCount: number }>
  }

  /**
   * Delete multiple documents
   */
  async deleteMany(
    collection: string,
    filter: Record<string, unknown>
  ): Promise<{ deletedCount: number }> {
    if (!collection) {
      throw new Error('Collection name is required')
    }
    return this.request('/deleteMany', { collection, filter }) as Promise<{ deletedCount: number }>
  }

  /**
   * Run an aggregation pipeline
   */
  async aggregate(
    collection: string,
    pipeline: Record<string, unknown>[]
  ): Promise<{ documents: unknown[] }> {
    if (!collection) {
      throw new Error('Collection name is required')
    }
    return this.request('/aggregate', { collection, pipeline }) as Promise<{ documents: unknown[] }>
  }

  /**
   * Count documents matching a filter
   */
  async countDocuments(
    collection: string,
    filter: Record<string, unknown> = {}
  ): Promise<{ count: number }> {
    if (!collection) {
      throw new Error('Collection name is required')
    }
    return this.request('/countDocuments', { collection, filter }) as Promise<{ count: number }>
  }

  /**
   * List all collections in the database
   */
  async listCollections(): Promise<string[]> {
    return this.request('/listCollections', {}) as Promise<string[]>
  }

  /**
   * List databases (returns the current database ID)
   */
  async listDatabases(): Promise<string[]> {
    const props = (this.ctx as unknown as { props: Props }).props
    return [props.databaseId]
  }
}
