/**
 * DatabaseProxy WorkerEntrypoint - Cloudflare Workers RPC integration
 *
 * Provides a WorkerEntrypoint-based proxy for database operations that routes
 * requests to the appropriate MondoDatabase Durable Object instance.
 *
 * This enables secure, sandboxed database access for MCP tools and other
 * Workers using service bindings.
 */

import { WorkerEntrypoint } from 'cloudflare:workers'
import type { DurableObjectNamespace, DurableObjectStub } from '../../types/rpc'

// Re-export types for backward compatibility
export type { DurableObjectNamespace, DurableObjectStub }

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
}

/**
 * DatabaseProxy - WorkerEntrypoint for database operations
 *
 * Routes CRUD operations to the MondoDatabase Durable Object.
 * Uses props.databaseId to identify which database instance to use.
 *
 * @example
 * ```typescript
 * // In a Worker, use as a service binding:
 * const result = await env.DB_PROXY.find('users', { active: true })
 *
 * // The DB_PROXY is configured with props:
 * // { databaseId: 'my-database' }
 * ```
 */
export class DatabaseProxy extends WorkerEntrypoint<Env> {
  /**
   * Get the database stub for the configured database ID
   */
  private getDatabaseStub(): DurableObjectStub {
    const props = (this.ctx as unknown as { props: Props }).props
    const id = this.env.MONDO_DATABASE.idFromName(props.databaseId)
    return this.env.MONDO_DATABASE.get(id)
  }

  /**
   * Make a request to the database
   */
  private async request(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<unknown> {
    const stub = this.getDatabaseStub()
    const response = await stub.fetch(
      new Request(`http://internal${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    )
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
