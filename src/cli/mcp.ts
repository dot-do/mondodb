/**
 * CLI MCP Command
 *
 * Implements the `mcp` command for the MondoDB CLI.
 * Starts an MCP (Model Context Protocol) server that communicates via stdio.
 *
 * Features:
 * - --connection <url>: Connect to a remote MondoDB Worker
 * - --local <path>: Use a local SQLite database
 *
 * Usage:
 *   mondodb mcp --connection https://my-worker.workers.dev
 *   mondodb mcp --local ./data/local.db
 *
 * The MCP server exposes tools for AI agents to interact with the database:
 * - search: Query documents
 * - fetch: Retrieve full documents by ID
 * - do: Execute operations (when enabled)
 *
 * @module cli/mcp
 */

import type { DatabaseAccess, FindOptions } from '../mcp/types.js'
import { createMcpServer } from '../mcp/server.js'
import { createStdioTransport } from '../mcp/transport/stdio.js'
import { RpcClient } from '../rpc/rpc-client.js'

// Lazy import for LocalSQLiteBackend to avoid issues in non-Bun environments
let LocalSQLiteBackend: typeof import('../wire/backend/local-sqlite.js').LocalSQLiteBackend | null = null

async function getLocalSQLiteBackend(): Promise<typeof import('../wire/backend/local-sqlite.js').LocalSQLiteBackend> {
  if (!LocalSQLiteBackend) {
    try {
      const module = await import('../wire/backend/local-sqlite.js')
      LocalSQLiteBackend = module.LocalSQLiteBackend
    } catch (error) {
      throw new Error('Local SQLite backend requires Bun runtime. Use --connection for remote database access.')
    }
  }
  return LocalSQLiteBackend
}

/**
 * Options for the MCP command
 */
export interface McpCommandOptions {
  /** Remote connection URL (e.g., https://my-worker.workers.dev) */
  connection?: string
  /** Local database file path */
  local?: string
  /** Custom stdin stream (for testing) */
  stdin?: NodeJS.ReadableStream
  /** Custom stdout stream (for testing) */
  stdout?: NodeJS.WritableStream
}

/**
 * Controller for managing the MCP server lifecycle
 */
export interface McpServerController {
  /** Whether the server is currently running */
  readonly isRunning: boolean
  /** Stop the MCP server */
  stop(): Promise<void>
}

/**
 * Program interface for command registration
 * Compatible with Commander.js Command interface
 */
export interface McpProgram {
  command(name: string): McpProgram
  description(desc: string): McpProgram
  option(flags: string, description?: string, defaultValue?: unknown): McpProgram
  action(fn: (...args: unknown[]) => void | Promise<void>): McpProgram
}

/**
 * Register the MCP command with the CLI program
 *
 * @param program - The CLI program to register the command with
 */
export function registerMcpCommand(program: McpProgram): void {
  program
    .command('mcp')
    .description('Start an MCP server for AI agents to interact with the database via stdio')
    .option('-c, --connection <url>', 'Remote MondoDB Worker URL (e.g., https://my-worker.workers.dev)')
    .option('-l, --local <path>', 'Local SQLite database path')
    .action(async (options: unknown) => {
      const controller = await startMcpServer(options as McpCommandOptions)

      // Handle graceful shutdown on SIGINT/SIGTERM
      const handleSignal = async () => {
        await controller.stop()
        process.exit(0)
      }

      process.on('SIGINT', handleSignal)
      process.on('SIGTERM', handleSignal)
    })
}

/**
 * Validate that a string is a valid HTTP or HTTPS URL.
 *
 * @param urlString - The URL string to validate
 * @returns true if the URL is valid HTTP/HTTPS, false otherwise
 * @internal
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Start the MCP server with the given configuration.
 *
 * The server communicates via stdio using the Model Context Protocol (MCP).
 * It exposes database operations as tools that AI agents can invoke.
 *
 * @param options - Server configuration options
 * @returns Promise resolving to a controller for managing the server lifecycle
 * @throws {Error} If neither --connection nor --local is provided
 * @throws {Error} If both --connection and --local are provided
 * @throws {Error} If the connection URL is invalid
 *
 * @example
 * ```typescript
 * // Remote connection
 * const controller = await startMcpServer({
 *   connection: 'https://my-worker.workers.dev'
 * })
 *
 * // Local SQLite database
 * const controller = await startMcpServer({
 *   local: './data/local.db'
 * })
 *
 * // Graceful shutdown
 * await controller.stop()
 * ```
 */
export async function startMcpServer(options: McpCommandOptions): Promise<McpServerController> {
  // Validate options
  if (!options.connection && !options.local) {
    throw new Error('Either --connection or --local option is required')
  }

  if (options.connection && options.local) {
    throw new Error('Cannot use both --connection and --local options - they are mutually exclusive')
  }

  if (options.connection && !isValidUrl(options.connection)) {
    throw new Error(`Invalid connection URL: ${options.connection}`)
  }

  // Create database access
  const dbAccess = await createMcpDatabaseAccess({
    connection: options.connection,
    local: options.local,
  })

  // Create MCP server
  const mcpServer = createMcpServer({
    dbAccess,
    name: 'mondodb',
    version: '1.0.0',
  })

  // Create stdio transport
  const transport = createStdioTransport({
    stdin: options.stdin ?? process.stdin,
    stdout: options.stdout ?? process.stdout,
    onMessage: async (request) => {
      return await mcpServer.handleRequest(request)
    },
    onError: (error) => {
      // Log errors to stderr to avoid interfering with MCP protocol on stdout
      console.error('MCP transport error:', error.message)
    },
  })

  // Start the transport
  transport.start()

  // Track running state
  let running = true

  // Return controller
  return {
    get isRunning(): boolean {
      return running && transport.isRunning
    },

    async stop(): Promise<void> {
      if (!running) {
        return
      }
      running = false
      transport.close()
    },
  }
}

/**
 * Create a DatabaseAccess instance for the MCP server.
 *
 * This factory function creates the appropriate database access implementation
 * based on the provided options:
 * - Remote: Uses RPC client to communicate with a MondoDB Worker
 * - Local: Uses LocalSQLiteBackend for file-based storage (requires Bun)
 *
 * @param options - Connection options (either connection URL or local path)
 * @returns Promise resolving to a DatabaseAccess instance
 * @throws {Error} If neither connection nor local option is provided
 *
 * @example
 * ```typescript
 * // Remote database access
 * const dbAccess = await createMcpDatabaseAccess({
 *   connection: 'https://my-worker.workers.dev'
 * })
 *
 * // Local database access
 * const dbAccess = await createMcpDatabaseAccess({
 *   local: './data/local.db'
 * })
 * ```
 */
export async function createMcpDatabaseAccess(
  options: { connection?: string | undefined; local?: string | undefined }
): Promise<DatabaseAccess> {
  if (options.connection) {
    // Create remote database access via HTTP
    return createRemoteDatabaseAccess(options.connection)
  }

  if (options.local) {
    // Create local SQLite database access
    return createLocalDatabaseAccess(options.local)
  }

  throw new Error('Either connection or local option must be provided')
}

/**
 * Create a DatabaseAccess implementation for remote MondoDB Workers.
 *
 * Uses RPC over HTTP to communicate with the remote worker.
 * All operations are proxied through the RPC client.
 *
 * @param connectionUrl - Base URL of the MondoDB Worker endpoint
 * @returns DatabaseAccess implementation for remote operations
 * @internal
 */
function createRemoteDatabaseAccess(connectionUrl: string): DatabaseAccess {
  const rpcClient = new RpcClient(connectionUrl + '/rpc')

  return {
    async findOne(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<Record<string, unknown> | null> {
      const results = await this.find(collection, filter, { limit: 1 })
      return results[0] ?? null
    },

    async find(
      collection: string,
      filter: Record<string, unknown>,
      options?: FindOptions
    ): Promise<Record<string, unknown>[]> {
      try {
        const result = await rpcClient.call('find', ['test', collection, filter, options])
        return (result as { documents?: Record<string, unknown>[] })?.documents ?? []
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    async insertOne(
      collection: string,
      document: Record<string, unknown>
    ): Promise<{ insertedId: string }> {
      try {
        const result = await rpcClient.call('insertOne', ['test', collection, document])
        return result as { insertedId: string }
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    async insertMany(
      collection: string,
      documents: Record<string, unknown>[]
    ): Promise<{ insertedIds: string[] }> {
      try {
        const result = await rpcClient.call('insertMany', ['test', collection, documents])
        const insertResult = result as { insertedIds: Map<number, unknown> }
        const ids: string[] = []
        if (insertResult.insertedIds instanceof Map) {
          for (const [, id] of insertResult.insertedIds) {
            ids.push(String(id))
          }
        }
        return { insertedIds: ids }
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    async updateOne(
      collection: string,
      filter: Record<string, unknown>,
      update: Record<string, unknown>
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      try {
        const result = await rpcClient.call('updateOne', ['test', collection, filter, update])
        return result as { matchedCount: number; modifiedCount: number }
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    async updateMany(
      collection: string,
      filter: Record<string, unknown>,
      update: Record<string, unknown>
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      try {
        const result = await rpcClient.call('updateMany', ['test', collection, filter, update])
        return result as { matchedCount: number; modifiedCount: number }
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    async deleteOne(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      try {
        const result = await rpcClient.call('deleteOne', ['test', collection, filter])
        return result as { deletedCount: number }
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    async deleteMany(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      try {
        const result = await rpcClient.call('deleteMany', ['test', collection, filter])
        return result as { deletedCount: number }
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    async aggregate(
      collection: string,
      pipeline: Record<string, unknown>[]
    ): Promise<Record<string, unknown>[]> {
      try {
        const result = await rpcClient.call('aggregate', ['test', collection, pipeline])
        return (result as { documents?: Record<string, unknown>[] })?.documents ?? []
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    async countDocuments(
      collection: string,
      filter?: Record<string, unknown>
    ): Promise<number> {
      try {
        const result = await rpcClient.call('count', ['test', collection, filter ?? {}])
        return result as number
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    async listCollections(): Promise<string[]> {
      try {
        const result = await rpcClient.call('listCollections', ['test'])
        return (result as Array<{ name: string }>).map((c) => c.name)
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    async listDatabases(): Promise<string[]> {
      try {
        const result = await rpcClient.call('listDatabases', [])
        return (result as Array<{ name: string }>).map((d) => d.name)
      } catch (error) {
        throw new Error(`Failed to connect to remote database: ${error instanceof Error ? error.message : 'Network error'}`)
      }
    },

    getProxy(): DatabaseAccess {
      return this
    },
  }
}

/**
 * Create a DatabaseAccess implementation for local SQLite database.
 *
 * Uses LocalSQLiteBackend which requires the Bun runtime.
 * The database file is created in the specified directory.
 *
 * @param localPath - Path to the local database file
 * @returns Promise resolving to a DatabaseAccess implementation
 * @throws {Error} If Bun runtime is not available
 * @internal
 */
async function createLocalDatabaseAccess(localPath: string): Promise<DatabaseAccess> {
  // Extract directory from path for the backend
  const path = await import('path')
  const dataDir = path.dirname(localPath)

  const BackendClass = await getLocalSQLiteBackend()
  const backend = new BackendClass(dataDir)

  // Default database name
  const dbName = 'test'

  const dbAccess: DatabaseAccess = {
    async findOne(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<Record<string, unknown> | null> {
      const result = await backend.find(dbName, collection, {
        filter,
        limit: 1,
      })
      return result.documents[0] ?? null
    },

    async find(
      collection: string,
      filter: Record<string, unknown>,
      options?: FindOptions
    ): Promise<Record<string, unknown>[]> {
      // Build find options, only including defined properties
      const findOptions: {
        filter: Record<string, unknown>
        limit?: number
        skip?: number
        sort?: Record<string, 1 | -1>
        projection?: Record<string, 0 | 1>
      } = { filter }

      if (options?.limit !== undefined) findOptions.limit = options.limit
      if (options?.skip !== undefined) findOptions.skip = options.skip
      if (options?.sort !== undefined) findOptions.sort = options.sort
      if (options?.projection !== undefined) findOptions.projection = options.projection

      const result = await backend.find(dbName, collection, findOptions)
      return result.documents
    },

    async insertOne(
      collection: string,
      document: Record<string, unknown>
    ): Promise<{ insertedId: string }> {
      const result = await backend.insertOne(dbName, collection, document)
      const insertedId = result.insertedIds.get(0)
      return { insertedId: String(insertedId) }
    },

    async insertMany(
      collection: string,
      documents: Record<string, unknown>[]
    ): Promise<{ insertedIds: string[] }> {
      const result = await backend.insertMany(dbName, collection, documents)
      const ids: string[] = []
      for (const [, id] of result.insertedIds) {
        ids.push(String(id))
      }
      return { insertedIds: ids }
    },

    async updateOne(
      collection: string,
      filter: Record<string, unknown>,
      update: Record<string, unknown>
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      const result = await backend.updateOne(dbName, collection, filter, update)
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
      const result = await backend.updateMany(dbName, collection, filter, update)
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      }
    },

    async deleteOne(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      const result = await backend.deleteOne(dbName, collection, filter)
      return { deletedCount: result.deletedCount }
    },

    async deleteMany(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      const result = await backend.deleteMany(dbName, collection, filter)
      return { deletedCount: result.deletedCount }
    },

    async aggregate(
      collection: string,
      pipeline: Record<string, unknown>[]
    ): Promise<Record<string, unknown>[]> {
      const result = await backend.aggregate(dbName, collection, pipeline)
      return result.documents
    },

    async countDocuments(
      collection: string,
      filter?: Record<string, unknown>
    ): Promise<number> {
      return await backend.count(dbName, collection, filter)
    },

    async listCollections(): Promise<string[]> {
      const collections = await backend.listCollections(dbName)
      return collections.map((c) => c.name)
    },

    async listDatabases(): Promise<string[]> {
      const databases = await backend.listDatabases()
      return databases.map((d) => d.name)
    },

    getProxy(): DatabaseAccess {
      return dbAccess
    },
  }

  return dbAccess
}
