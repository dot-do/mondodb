/**
 * MCP Handler for MondoDatabase Durable Object
 *
 * Creates an MCP HTTP handler that wraps MondoDatabase methods,
 * allowing AI agents to access the database via MCP protocol.
 */

import { createMcpServer, type McpServer } from '../mcp/server'
import { createHttpMcpHandler } from '../mcp/transport/http'
import type { HttpHandler } from '../mcp/transport/http'
import type { DatabaseAccess, FindOptions } from '../mcp/types'
import type { MondoDatabase, Document } from './mondo-database'
import type { PipelineStage } from '../translator/aggregation-translator'

// Re-export HttpHandler for convenience
export type { HttpHandler }

/**
 * Create a DatabaseAccess implementation that wraps MondoDatabase methods
 *
 * @param db - The MondoDatabase instance to wrap
 * @returns DatabaseAccess interface for MCP tools
 */
export function createDatabaseAccess(db: MondoDatabase): DatabaseAccess {
  return {
    async findOne(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<Record<string, unknown> | null> {
      return db.findOne(collection, filter as Document)
    },

    async find(
      collection: string,
      filter: Record<string, unknown>,
      options?: FindOptions
    ): Promise<Record<string, unknown>[]> {
      // MondoDatabase.find() doesn't support options yet, so we fetch all and apply in memory
      const results = await db.find(collection, filter as Document)

      let processed = results as Record<string, unknown>[]

      // Apply skip
      if (options?.skip) {
        processed = processed.slice(options.skip)
      }

      // Apply limit
      if (options?.limit) {
        processed = processed.slice(0, options.limit)
      }

      // Apply sort (simple in-memory sort)
      if (options?.sort) {
        const sortEntries = Object.entries(options.sort)
        if (sortEntries.length > 0) {
          processed.sort((a, b) => {
            for (const [field, order] of sortEntries) {
              const aVal = a[field] as string | number | boolean | null | undefined
              const bVal = b[field] as string | number | boolean | null | undefined
              if (aVal != null && bVal != null && aVal < bVal) return order === 1 ? -1 : 1
              if (aVal != null && bVal != null && aVal > bVal) return order === 1 ? 1 : -1
            }
            return 0
          })
        }
      }

      // Apply projection
      if (options?.projection) {
        const projEntries = Object.entries(options.projection)
        const isInclusive = projEntries.some(([, v]) => v === 1)

        processed = processed.map((doc) => {
          if (isInclusive) {
            // Include only specified fields (plus _id unless excluded)
            const projected: Record<string, unknown> = {}
            if (options.projection!['_id'] !== 0) {
              projected['_id'] = doc['_id']
            }
            for (const [field, include] of projEntries) {
              if (include === 1 && field !== '_id') {
                projected[field] = doc[field]
              }
            }
            return projected
          } else {
            // Exclude specified fields
            const projected = { ...doc }
            for (const [field, exclude] of projEntries) {
              if (exclude === 0) {
                delete projected[field]
              }
            }
            return projected
          }
        })
      }

      return processed
    },

    async insertOne(
      collection: string,
      document: Record<string, unknown>
    ): Promise<{ insertedId: string }> {
      const result = await db.insertOne(collection, document as Document)
      return { insertedId: result.insertedId }
    },

    async insertMany(
      collection: string,
      documents: Record<string, unknown>[]
    ): Promise<{ insertedIds: string[] }> {
      const result = await db.insertMany(collection, documents as Document[])
      return { insertedIds: result.insertedIds }
    },

    async updateOne(
      collection: string,
      filter: Record<string, unknown>,
      update: Record<string, unknown>
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      const result = await db.updateOne(
        collection,
        filter as Document,
        update as { $set?: Document; $unset?: Record<string, unknown> }
      )
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      }
    },

    async updateMany(
      collection: string,
      filter: Record<string, unknown>,
      update: Record<string, unknown>
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      // MondoDatabase doesn't have updateMany yet, so we implement it via find + updateOne
      const docs = await db.find(collection, filter as Document)
      let matchedCount = 0
      let modifiedCount = 0

      for (const doc of docs) {
        if (doc._id) {
          const result = await db.updateOne(
            collection,
            { _id: doc._id },
            update as { $set?: Document; $unset?: Record<string, unknown> }
          )
          matchedCount += result.matchedCount
          modifiedCount += result.modifiedCount
        }
      }

      return { matchedCount, modifiedCount }
    },

    async deleteOne(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      const result = await db.deleteOne(collection, filter as Document)
      return { deletedCount: result.deletedCount }
    },

    async deleteMany(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      const result = await db.deleteMany(collection, filter as Document)
      return { deletedCount: result.deletedCount }
    },

    async aggregate(
      collection: string,
      pipeline: Record<string, unknown>[]
    ): Promise<Record<string, unknown>[]> {
      const result = await db.aggregate(collection, pipeline as PipelineStage[])
      return result as Record<string, unknown>[]
    },

    async countDocuments(
      collection: string,
      filter?: Record<string, unknown>
    ): Promise<number> {
      return db.countDocuments(collection, (filter || {}) as Document)
    },

    async listCollections(): Promise<string[]> {
      // Get collections from the storage
      const storage = db.getStorage()
      const sql = storage.sql

      const result = sql.exec(`SELECT name FROM collections`).toArray() as { name: string }[]
      return result.map((row) => row.name)
    },

    async listDatabases(): Promise<string[]> {
      // In MondoDatabase, each DO instance is essentially a database
      // Return a single database name
      return ['default']
    },

    getProxy(): DatabaseAccess {
      // Return self as proxy - the MondoDatabase already provides isolation
      return this
    },
  }
}

/**
 * Create an MCP HTTP handler for a MondoDatabase instance
 *
 * @param db - The MondoDatabase instance
 * @param options - Optional configuration
 * @returns HTTP handler function for MCP requests
 *
 * @example
 * ```typescript
 * // In MondoDatabase.fetch()
 * if (url.pathname.startsWith('/mcp')) {
 *   const mcpHandler = createMondoMcpHandler(this)
 *   return mcpHandler(request)
 * }
 * ```
 */
export function createMondoMcpHandler(
  db: MondoDatabase,
  options?: {
    /** Server name for MCP initialization (default: 'mondodb') */
    name?: string
    /** Server version (default: '1.0.0') */
    version?: string
  }
): HttpHandler {
  // Create DatabaseAccess wrapper
  const dbAccess = createDatabaseAccess(db)

  // Create MCP server with database access
  const server = createMcpServer({
    dbAccess,
    name: options?.name ?? 'mondodb',
    version: options?.version ?? '1.0.0',
  })

  // Create and return HTTP handler
  return createHttpMcpHandler(server)
}

/**
 * Get the MCP server instance for advanced usage
 *
 * @param db - The MondoDatabase instance
 * @param options - Optional configuration
 * @returns MCP server instance
 */
export function getMcpServer(
  db: MondoDatabase,
  options?: {
    name?: string
    version?: string
  }
): McpServer {
  const dbAccess = createDatabaseAccess(db)
  return createMcpServer({
    dbAccess,
    name: options?.name ?? 'mondodb',
    version: options?.version ?? '1.0.0',
  })
}
