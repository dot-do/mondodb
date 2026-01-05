#!/usr/bin/env node
/**
 * MondoDB MCP CLI
 *
 * Command-line interface for running MondoDB as an MCP (Model Context Protocol) server.
 * Uses stdio transport to communicate with MCP clients via stdin/stdout.
 *
 * Usage:
 *   node --experimental-specifier-resolution=node dist/mcp/cli.js
 *   bun src/mcp/cli.ts
 *
 * Environment Variables:
 *   MONGODO_DATA_DIR - Directory for SQLite database files (default: .mongodo)
 *   MONGODO_DEFAULT_DB - Default database name (default: test)
 */

import { createMcpServer, type McpServer } from './server'
import { createStdioTransport, type StdioTransport } from './transport/stdio'
import { LocalSQLiteBackend } from '../wire/backend/local-sqlite'
import type { DatabaseAccess, FindOptions } from './types'
import type { MondoBackend } from '../wire/backend/interface'

/**
 * Configuration for the CLI
 */
export interface CliConfig {
  /** Directory for SQLite database files */
  dataDir: string
  /** Default database name */
  defaultDatabase: string
  /** Server name */
  serverName: string
  /** Server version */
  serverVersion: string
}

/**
 * Get CLI configuration from environment variables
 */
export function getCliConfig(): CliConfig {
  return {
    dataDir: process.env.MONGODO_DATA_DIR || '.mongodo',
    defaultDatabase: process.env.MONGODO_DEFAULT_DB || 'test',
    serverName: 'mongo.do-mcp',
    serverVersion: '1.0.0',
  }
}

/**
 * Create a DatabaseAccess implementation that wraps the LocalSQLiteBackend
 *
 * This adapter translates the simplified DatabaseAccess interface used by MCP tools
 * into the full MondoBackend interface used by LocalSQLiteBackend.
 */
export function createDatabaseAccessFromBackend(
  backend: MondoBackend,
  defaultDatabase: string
): DatabaseAccess {
  /**
   * Parse collection name which may include database prefix (db.collection)
   */
  function parseCollection(collection: string): { db: string; collection: string } {
    if (collection.includes('.')) {
      const parts = collection.split('.')
      const db = parts[0] ?? defaultDatabase
      const coll = parts.slice(1).join('.')
      return { db, collection: coll }
    }
    return { db: defaultDatabase, collection }
  }

  return {
    async findOne(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<Record<string, unknown> | null> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.find(db, coll, {
        filter,
        limit: 1,
      })
      return result.documents.length > 0 ? (result.documents[0] as Record<string, unknown>) : null
    },

    async find(
      collection: string,
      filter: Record<string, unknown>,
      options?: FindOptions
    ): Promise<Record<string, unknown>[]> {
      const { db, collection: coll } = parseCollection(collection)
      // Build find options, only including defined properties
      const findOptions: { filter: Record<string, unknown>; limit?: number; skip?: number; sort?: Record<string, 1 | -1>; projection?: Record<string, 0 | 1> } = { filter }
      if (options?.limit !== undefined) findOptions.limit = options.limit
      if (options?.skip !== undefined) findOptions.skip = options.skip
      if (options?.sort !== undefined) findOptions.sort = options.sort
      if (options?.projection !== undefined) findOptions.projection = options.projection
      const result = await backend.find(db, coll, findOptions)
      return result.documents as Record<string, unknown>[]
    },

    async insertOne(
      collection: string,
      document: Record<string, unknown>
    ): Promise<{ insertedId: string }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.insertOne(db, coll, document)
      const insertedId = result.insertedIds.get(0)
      return {
        insertedId: insertedId ? String(insertedId) : '',
      }
    },

    async insertMany(
      collection: string,
      documents: Record<string, unknown>[]
    ): Promise<{ insertedIds: string[] }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.insertMany(db, coll, documents)
      const insertedIds: string[] = []
      for (let i = 0; i < documents.length; i++) {
        const id = result.insertedIds.get(i)
        if (id) {
          insertedIds.push(String(id))
        }
      }
      return { insertedIds }
    },

    async updateOne(
      collection: string,
      filter: Record<string, unknown>,
      update: Record<string, unknown>
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.updateOne(db, coll, filter, update)
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
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.updateMany(db, coll, filter, update)
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      }
    },

    async deleteOne(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.deleteOne(db, coll, filter)
      return { deletedCount: result.deletedCount }
    },

    async deleteMany(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.deleteMany(db, coll, filter)
      return { deletedCount: result.deletedCount }
    },

    async aggregate(
      collection: string,
      pipeline: Record<string, unknown>[]
    ): Promise<Record<string, unknown>[]> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.aggregate(db, coll, pipeline)
      return result.documents as Record<string, unknown>[]
    },

    async countDocuments(
      collection: string,
      filter?: Record<string, unknown>
    ): Promise<number> {
      const { db, collection: coll } = parseCollection(collection)
      return backend.count(db, coll, filter)
    },

    async listCollections(): Promise<string[]> {
      const collections = await backend.listCollections(defaultDatabase)
      return collections.map((c) => c.name)
    },

    async listDatabases(): Promise<string[]> {
      const databases = await backend.listDatabases()
      return databases.map((d) => d.name)
    },

    getProxy(): DatabaseAccess {
      // Return self for the CLI - no sandboxing needed
      return this
    },
  }
}

/**
 * MCP CLI instance
 */
export interface McpCli {
  /** The MCP server instance */
  server: McpServer
  /** The stdio transport */
  transport: StdioTransport
  /** The SQLite backend */
  backend: LocalSQLiteBackend
  /** Start the CLI (begin reading from stdin) */
  start(): void
  /** Stop the CLI */
  stop(): void
}

/**
 * Create and configure the MCP CLI
 *
 * @param config - CLI configuration (uses defaults if not provided)
 * @returns Configured MCP CLI instance ready to start
 */
export function createMcpCli(config?: Partial<CliConfig>): McpCli {
  const fullConfig = { ...getCliConfig(), ...config }

  // Create the SQLite backend
  const backend = new LocalSQLiteBackend(fullConfig.dataDir)

  // Create DatabaseAccess adapter
  const dbAccess = createDatabaseAccessFromBackend(backend, fullConfig.defaultDatabase)

  // Create the MCP server with search, fetch tools (no code loader for CLI)
  const server = createMcpServer({
    dbAccess,
    name: fullConfig.serverName,
    version: fullConfig.serverVersion,
  })

  // Create stdio transport connected to the server
  const transport = createStdioTransport({
    onMessage: async (request) => {
      return server.handleRequest(request)
    },
    onError: (error) => {
      // Log errors to stderr to not interfere with stdio protocol
      console.error('[MondoDB MCP Error]', error.message)
    },
    onClose: () => {
      // Clean up backend when transport closes
      backend.close()
    },
  })

  return {
    server,
    transport,
    backend,
    start() {
      transport.start()
    },
    stop() {
      transport.close()
      backend.close()
    },
  }
}

/**
 * Main entry point for CLI execution
 */
export function main(): void {
  const cli = createMcpCli()

  // Handle process signals for graceful shutdown
  process.on('SIGINT', () => {
    cli.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    cli.stop()
    process.exit(0)
  })

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[MondoDB MCP Fatal Error]', error.message)
    cli.stop()
    process.exit(1)
  })

  // Start the CLI
  cli.start()
}

// Run if executed directly
// Check if this is the main module being run
const isMainModule = typeof require !== 'undefined'
  ? require.main === module
  : import.meta.url === `file://${process.argv[1]}`

if (isMainModule) {
  main()
}
