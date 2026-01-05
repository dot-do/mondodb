/**
 * MonDoAgent - Main Entry Point for AI Agents
 *
 * The MonDoAgent orchestrates:
 * - MCP Server for tool handling (search, fetch, do)
 * - AgentFS for file system operations
 * - KV Store for key-value storage
 * - Tool Call Auditing for logging
 * - Code execution via Worker Loader or Miniflare fallback
 */

import { randomUUID } from 'crypto'
import { createMcpServer, type CodeLoader, type McpServerConfig } from './server'
import { AgentFilesystem, type AgentFSDatabase } from '../agentfs/vfs'
import { AgentFSKVStore, type KVStorageBackend, createInMemoryBackend } from '../agentfs/kv-store'
import { ToolCallAuditLog, createInMemoryAuditBackend, type AuditBackend } from '../agentfs/toolcalls'
import type { DatabaseAccess, McpToolResponse } from './types'

/**
 * Execution result from tool or code execution
 */
export interface ExecutionResult<T = unknown> {
  success: boolean
  value?: T
  error?: string
  logs?: string[]
  duration?: number
}

/**
 * Search options for the search method
 */
export interface SearchOptions {
  collection?: string
  database?: string
  limit?: number
}

/**
 * Search result in OpenAI Deep Research format
 */
export interface SearchResult {
  id: string
  title: string
  url: string
  text: string
}

/**
 * Fetch result with document metadata
 */
export interface FetchResult {
  id: string
  title: string
  url: string
  text: string
  metadata: {
    database: string
    collection: string
    _id: string
  }
}

/**
 * MCP server interface exposed by the agent
 */
export interface McpServerLike {
  listTools(): Promise<{ name: string; description: string }[]>
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResponse>
}

/**
 * File system interface exposed by the agent
 */
export interface FileSystemLike {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<boolean>
  exists(path: string): Promise<boolean>
  stat(path: string): Promise<{ type: string; size: number } | null>
  readdir(path: string): Promise<string[]>
  mkdir(path: string): Promise<void>
  glob(pattern: string): Promise<string[]>
}

/**
 * Key-Value store interface exposed by the agent
 */
export interface KVStoreLike {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
  has(key: string): Promise<boolean>
  keys(prefix?: string): Promise<string[]>
}

/**
 * Audit log interface exposed by the agent
 */
export interface AuditLogLike {
  record(tool: string, inputs: unknown, outputs: unknown, durationMs?: number): Promise<string>
  list(options?: { limit?: number; offset?: number; tool?: string }): Promise<{ id: string; tool: string; timestamp: Date }[]>
  count(): Promise<number>
}

/**
 * Configuration for creating a MonDoAgent
 */
export interface MonDoAgentConfig {
  /** Unique agent identifier */
  id?: string
  /** Database access for MCP tools */
  dbAccess: DatabaseAccess
  /** Optional code loader for 'do' tool */
  codeLoader?: CodeLoader
  /** Optional custom filesystem database */
  fsDatabase?: AgentFSDatabase
  /** Optional custom KV storage backend */
  kvBackend?: KVStorageBackend
  /** Optional custom audit storage backend */
  auditBackend?: AuditBackend
}

/**
 * MonDoAgent - AI Agent interface for mongo.do
 */
export interface MonDoAgent {
  /** Agent identifier */
  readonly id: string

  /** Access to MCP server for tool handling */
  readonly mcp: McpServerLike

  /** Access to virtual filesystem */
  readonly fs: FileSystemLike

  /** Access to key-value store */
  readonly kv: KVStoreLike

  /** Access to tool call audit log */
  readonly audit: AuditLogLike

  /**
   * Execute a tool by name with given arguments
   */
  execute<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<ExecutionResult<T>>

  /**
   * Execute code in the secure sandbox
   */
  do(code: string, description?: string): Promise<ExecutionResult<unknown>>

  /**
   * Search for documents
   */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>

  /**
   * Fetch a document by ID
   */
  fetch(id: string): Promise<FetchResult | null>

  /**
   * Dispose agent resources
   */
  dispose(): Promise<void>
}

/**
 * Create a new MonDoAgent instance
 *
 * @param config - Agent configuration
 * @returns MonDoAgent instance
 *
 * @example
 * ```typescript
 * const agent = createMonDoAgent({
 *   dbAccess: myDatabaseAccess,
 *   codeLoader: myCodeLoader,
 * });
 *
 * // Execute code
 * const result = await agent.do('return await db.collection("users").count()');
 *
 * // Search documents
 * const results = await agent.search('users with admin role');
 *
 * // Use filesystem
 * await agent.fs.writeFile('/data/output.json', JSON.stringify(data));
 *
 * // Use KV store
 * await agent.kv.set('session-state', { step: 1 });
 *
 * // Clean up
 * await agent.dispose();
 * ```
 */
export function createMonDoAgent(config: MonDoAgentConfig): MonDoAgent {
  const agentId = config.id ?? `agent-${randomUUID()}`

  // Create MCP server
  const mcpServerConfig: McpServerConfig = {
    dbAccess: config.dbAccess,
  }
  if (config.codeLoader) {
    mcpServerConfig.codeLoader = config.codeLoader
  }
  const mcpServer = createMcpServer(mcpServerConfig)

  // Create filesystem (use in-memory database if not provided)
  const fsDatabase = config.fsDatabase ?? createInMemoryFsDatabase()
  const filesystem = new AgentFilesystem(fsDatabase)

  // Create KV store (use in-memory backend if not provided)
  const kvBackend = config.kvBackend ?? createInMemoryBackend()
  const kvStore = new AgentFSKVStore(kvBackend)

  // Create audit log (use in-memory backend if not provided)
  const auditBackend = config.auditBackend ?? createInMemoryAuditBackend()
  const auditLog = new ToolCallAuditLog(auditBackend)

  // Wrap MCP server for the interface
  const mcp: McpServerLike = {
    async listTools() {
      const tools = await mcpServer.listTools()
      return tools.map((t) => ({ name: t.name, description: t.description }))
    },
    async callTool(name: string, args: Record<string, unknown>) {
      return mcpServer.callTool(name, args)
    },
  }

  // Wrap filesystem for the interface
  const fs: FileSystemLike = {
    async readFile(path: string) {
      return filesystem.readFile(path)
    },
    async writeFile(path: string, content: string) {
      await filesystem.writeFile(path, content)
    },
    async deleteFile(path: string): Promise<boolean> {
      await filesystem.deleteFile(path)
      return true
    },
    async exists(path: string) {
      return filesystem.exists(path)
    },
    async stat(path: string) {
      const result = await filesystem.stat(path)
      if (!result) return null
      return { type: result.type, size: result.size }
    },
    async readdir(path: string) {
      return filesystem.readdir(path)
    },
    async mkdir(path: string) {
      await filesystem.mkdir(path)
    },
    async glob(pattern: string) {
      return filesystem.glob(pattern)
    },
  }

  // Wrap KV store for the interface
  const kv: KVStoreLike = {
    async get<T>(key: string): Promise<T | null> {
      return kvStore.get(key) as Promise<T | null>
    },
    async set<T>(key: string, value: T) {
      await kvStore.set(key, value)
    },
    async delete(key: string) {
      return kvStore.delete(key)
    },
    async has(key: string) {
      return kvStore.has(key)
    },
    async keys(prefix?: string) {
      return kvStore.keys(prefix)
    },
  }

  // Wrap audit log for the interface
  const audit: AuditLogLike = {
    async record(tool: string, inputs: unknown, outputs: unknown, durationMs?: number) {
      const inputsRecord = inputs as Record<string, unknown>
      const outputsRecord = outputs as Record<string, unknown>
      if (durationMs !== undefined) {
        const startTime = new Date(Date.now() - durationMs)
        const endTime = new Date()
        return auditLog.record(tool, inputsRecord, outputsRecord, { startTime, endTime })
      }
      return auditLog.record(tool, inputsRecord, outputsRecord)
    },
    async list(options?: { limit?: number; offset?: number; tool?: string }) {
      const listOptions: { limit?: number; offset?: number; tool?: string } = {}
      if (options?.limit !== undefined) {
        listOptions.limit = options.limit
      }
      if (options?.offset !== undefined) {
        listOptions.offset = options.offset
      }
      if (options?.tool !== undefined) {
        listOptions.tool = options.tool
      }
      const entries = await auditLog.list(listOptions)
      return entries.map((e) => ({ id: e.id, tool: e.tool, timestamp: new Date(e.timestamp) }))
    },
    async count() {
      return auditLog.count()
    },
  }

  // Create the agent
  const agent: MonDoAgent = {
    id: agentId,
    mcp,
    fs,
    kv,
    audit,

    async execute<T>(toolName: string, args: Record<string, unknown>): Promise<ExecutionResult<T>> {
      const startTime = Date.now()
      try {
        const response = await mcpServer.callTool(toolName, args)
        const duration = Date.now() - startTime

        // Parse the result
        const resultText = response.content[0]?.text ?? '{}'
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(resultText)
        } catch {
          parsed = { value: resultText }
        }

        const result: ExecutionResult<T> = {
          success: !response.isError,
          duration,
        }
        if (parsed.value !== undefined) {
          result.value = parsed.value as T
        }
        if (response.isError && parsed.error) {
          result.error = parsed.error as string
        }
        if (parsed.logs) {
          result.logs = parsed.logs as string[]
        }

        // Record in audit log
        await audit.record(toolName, args, result, duration)

        return result
      } catch (error) {
        const duration = Date.now() - startTime
        const result: ExecutionResult<T> = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration,
        }
        await audit.record(toolName, args, result, duration)
        return result
      }
    },

    async do(code: string, description?: string): Promise<ExecutionResult<unknown>> {
      return agent.execute('do', { code, description })
    },

    async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
      const result = await agent.execute<{ results?: SearchResult[] }>('search', {
        query,
        ...options,
      })

      if (result.success && result.value?.results) {
        return result.value.results
      }

      return []
    },

    async fetch(docId: string): Promise<FetchResult | null> {
      const result = await agent.execute<FetchResult>('fetch', { id: docId })

      if (result.success && result.value && !result.error) {
        return result.value
      }

      return null
    },

    async dispose(): Promise<void> {
      // Clean up resources if needed
      // Currently no async cleanup required
    },
  }

  return agent
}

/**
 * Create an in-memory filesystem database for testing
 */
function createInMemoryFsDatabase(): AgentFSDatabase {
  const files = new Map<string, { content: string; createdAt: Date; updatedAt: Date }>()

  return {
    async findOne(collection: string, filter: Record<string, unknown>) {
      if (collection !== 'files') return null
      const path = filter._id as string ?? filter.path as string
      if (!path) return null
      const file = files.get(path)
      if (!file) return null
      return { _id: path, path, content: file.content, createdAt: file.createdAt, updatedAt: file.updatedAt }
    },

    async insertOne(collection: string, doc: Record<string, unknown>) {
      if (collection !== 'files') return { insertedId: '' }
      const path = doc._id as string ?? doc.path as string
      const now = new Date()
      files.set(path, {
        content: doc.content as string,
        createdAt: now,
        updatedAt: now,
      })
      return { insertedId: path }
    },

    async updateOne(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>) {
      if (collection !== 'files') return { matchedCount: 0, modifiedCount: 0 }
      const path = filter._id as string ?? filter.path as string
      if (!path) return { matchedCount: 0, modifiedCount: 0 }
      const file = files.get(path)
      if (!file) return { matchedCount: 0, modifiedCount: 0 }

      const $set = update.$set as Record<string, unknown> | undefined
      if ($set) {
        if ($set.content !== undefined) file.content = $set.content as string
        file.updatedAt = new Date()
      }

      return { matchedCount: 1, modifiedCount: 1 }
    },

    async deleteOne(collection: string, filter: Record<string, unknown>) {
      if (collection !== 'files') return { deletedCount: 0 }
      const path = filter._id as string ?? filter.path as string
      if (!path) return { deletedCount: 0 }
      const deleted = files.delete(path)
      return { deletedCount: deleted ? 1 : 0 }
    },

    async deleteMany(collection: string, filter: Record<string, unknown>) {
      if (collection !== 'files') return { deletedCount: 0 }
      let deletedCount = 0
      for (const [path] of files) {
        const pathFilter = filter.path as Record<string, unknown> | string | undefined
        if (pathFilter) {
          if (typeof pathFilter === 'string') {
            if (path === pathFilter) {
              files.delete(path)
              deletedCount++
            }
          } else if (pathFilter.$regex) {
            const regex = new RegExp(pathFilter.$regex as string)
            if (regex.test(path)) {
              files.delete(path)
              deletedCount++
            }
          }
        }
      }
      return { deletedCount }
    },

    async find(collection: string, filter: Record<string, unknown>) {
      if (collection !== 'files') return []

      const results: Record<string, unknown>[] = []
      for (const [path, file] of files) {
        // Simple prefix matching for directory listing
        const pathFilter = filter.path as Record<string, unknown> | string | undefined
        if (pathFilter) {
          if (typeof pathFilter === 'string') {
            if (path !== pathFilter) continue
          } else if (pathFilter.$regex) {
            const regex = new RegExp(pathFilter.$regex as string)
            if (!regex.test(path)) continue
          }
        }
        results.push({
          _id: path,
          path,
          content: file.content,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        })
      }

      return results
    },
  }
}

// Re-export types for convenience
export type { DatabaseAccess, CodeLoader, McpServerConfig }
