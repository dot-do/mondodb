/**
 * MonDoAgent - Cloudflare Agent with integrated AgentFS
 *
 * Provides a unified API for AI agents to interact with:
 * - Virtual filesystem (files, directories)
 * - Glob pattern matching
 * - Grep content search
 * - Key-value storage
 * - Tool call audit logging
 * - WebSocket integration for real-time tool execution
 *
 * Designed for use with Cloudflare's Agent infrastructure.
 */

import { randomUUID } from 'crypto'
import type { FileSystem, GrepMatch, KeyValueStore, FileStat } from './types'

// =============================================================================
// TYPE DEFINITIONS FOR CLOUDFLARE AGENT INTEGRATION
// =============================================================================

/**
 * Agent state interface - extends with custom fields
 */
export interface AgentState {
  initialized: boolean
  [key: string]: unknown
}

/**
 * Agent environment interface - Cloudflare bindings
 */
export interface AgentEnv {
  AI?: {
    run: (model: string, input: unknown) => Promise<unknown>
  }
  VECTORIZE?: {
    query: (query: unknown) => Promise<unknown>
    insert: (data: unknown) => Promise<unknown>
  }
  [key: string]: unknown
}

/**
 * Agent context interface - Durable Object context
 */
export interface AgentContext {
  id: string
  storage: {
    get: (key: string) => Promise<unknown>
    put: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<boolean>
    list: () => Promise<Map<string, unknown>>
  }
  blockConcurrencyWhile: <T>(fn: () => Promise<T>) => Promise<T>
}

/**
 * WebSocket connection interface
 */
export interface WebSocketConnection {
  accept: () => void
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  addEventListener: (event: string, handler: (event: unknown) => void) => void
  removeEventListener: (event: string, handler: (event: unknown) => void) => void
  readyState: number
}

/**
 * WebSocket message interface for tool calls
 */
export interface WebSocketMessage {
  type: string
  id?: string
  tool?: string
  inputs?: Record<string, unknown>
  stream?: boolean
}

/**
 * SQL database interface (from Cloudflare DO)
 */
export interface SqlDatabase {
  exec: (sql: string) => Promise<{ results: unknown[] }>
  prepare: (sql: string) => {
    bind: (...params: unknown[]) => ReturnType<SqlDatabase['prepare']>
    run: () => Promise<{ results: unknown[] }>
    first: () => Promise<unknown | null>
    all: () => Promise<{ results: unknown[] }>
  }
}

// =============================================================================
// IMPORTS
// =============================================================================
import { AgentFilesystem, type AgentFSDatabase } from './vfs'
import { AgentGrep } from './grep'
import { AgentFSKVStore, type KVStorageBackend } from './kv-store'
import { ToolCallAuditLog, type AuditBackend, type ToolCallEntry } from './toolcalls'
import { filterGlob } from './glob'

/**
 * Options for creating a MonDoAgent instance (legacy)
 */
export interface MonDoAgentOptions {
  /** Database backend for filesystem operations */
  database: AgentFSDatabase
  /** Optional: Custom KV storage backend (defaults to database-backed) */
  kvBackend?: KVStorageBackend
  /** Optional: Custom audit backend (defaults to database-backed) */
  auditBackend?: AuditBackend
}

/**
 * Options for glob convenience method
 */
export interface AgentGlobOptions {
  /** Case-insensitive matching */
  nocase?: boolean
  /** Include dot files */
  dot?: boolean
}

/**
 * Options for grep convenience method
 */
export interface AgentGrepOptions {
  /** Glob pattern to filter files */
  glob?: string
  /** Case-insensitive search */
  caseInsensitive?: boolean
  /** Maximum number of results */
  maxResults?: number
  /** Number of context lines before and after */
  contextLines?: number
}

/**
 * Audited filesystem wrapper that automatically records operations
 */
class AuditedFilesystem implements FileSystem {
  private fs: AgentFilesystem
  private audit: ToolCallAuditLog

  constructor(fs: AgentFilesystem, audit: ToolCallAuditLog) {
    this.fs = fs
    this.audit = audit
  }

  private async recordOperation<T>(
    tool: string,
    inputs: Record<string, unknown>,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = new Date()
    try {
      const result = await operation()
      const endTime = new Date()

      // Build success output
      const outputs: Record<string, unknown> = { success: true }
      if (tool === 'fs.readFile' && typeof result === 'string') {
        outputs.content = result
      }

      await this.audit.record(tool, inputs, outputs, { startTime, endTime })
      return result
    } catch (error) {
      const endTime = new Date()

      // Build error output
      const outputs: Record<string, unknown> = {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          code: this.extractErrorCode(error),
        },
      }

      await this.audit.record(tool, inputs, outputs, { startTime, endTime })
      throw error
    }
  }

  private extractErrorCode(error: unknown): string | undefined {
    if (error instanceof Error && error.message) {
      // Extract error code from message like "ENOENT: no such file..."
      const match = error.message.match(/^([A-Z]+):/)
      if (match) {
        return match[1]
      }
    }
    return undefined
  }

  async readFile(path: string): Promise<string> {
    return this.recordOperation('fs.readFile', { path }, () => this.fs.readFile(path))
  }

  async writeFile(path: string, content: string): Promise<void> {
    return this.recordOperation('fs.writeFile', { path, content }, () => this.fs.writeFile(path, content))
  }

  async deleteFile(path: string): Promise<void> {
    return this.recordOperation('fs.deleteFile', { path }, () => this.fs.deleteFile(path))
  }

  async readdir(path: string): Promise<string[]> {
    return this.recordOperation('fs.readdir', { path }, () => this.fs.readdir(path))
  }

  async mkdir(path: string): Promise<void> {
    return this.recordOperation('fs.mkdir', { path }, () => this.fs.mkdir(path))
  }

  async rmdir(path: string): Promise<void> {
    return this.recordOperation('fs.rmdir', { path }, () => this.fs.rmdir(path))
  }

  async stat(path: string): Promise<FileStat> {
    return this.recordOperation('fs.stat', { path }, () => this.fs.stat(path))
  }

  async exists(path: string): Promise<boolean> {
    // exists doesn't throw, so we record it differently
    const startTime = new Date()
    const result = await this.fs.exists(path)
    const endTime = new Date()
    await this.audit.record('fs.exists', { path }, { exists: result, success: true }, { startTime, endTime })
    return result
  }

  async glob(pattern: string): Promise<string[]> {
    return this.recordOperation('fs.glob', { pattern }, () => this.fs.glob(pattern))
  }
}

/**
 * Audited KV store wrapper that automatically records operations
 */
class AuditedKVStore implements KeyValueStore {
  private kv: AgentFSKVStore
  private audit: ToolCallAuditLog

  constructor(kv: AgentFSKVStore, audit: ToolCallAuditLog) {
    this.kv = kv
    this.audit = audit
  }

  private async recordOperation<T>(
    tool: string,
    inputs: Record<string, unknown>,
    operation: () => Promise<T>,
    outputBuilder?: (result: T) => Record<string, unknown>
  ): Promise<T> {
    const startTime = new Date()
    try {
      const result = await operation()
      const endTime = new Date()

      const outputs = outputBuilder ? outputBuilder(result) : { success: true }
      await this.audit.record(tool, inputs, outputs, { startTime, endTime })
      return result
    } catch (error) {
      const endTime = new Date()

      await this.audit.record(tool, inputs, {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      }, { startTime, endTime })
      throw error
    }
  }

  async get(key: string): Promise<unknown | undefined> {
    return this.recordOperation('kv.get', { key }, () => this.kv.get(key), (result) => ({ value: result, success: true }))
  }

  async set(key: string, value: unknown): Promise<void> {
    return this.recordOperation('kv.set', { key, value }, () => this.kv.set(key, value))
  }

  async delete(key: string): Promise<boolean> {
    return this.recordOperation('kv.delete', { key }, () => this.kv.delete(key), (result) => ({ deleted: result, success: true }))
  }

  async has(key: string): Promise<boolean> {
    return this.recordOperation('kv.has', { key }, () => this.kv.has(key), (result) => ({ exists: result, success: true }))
  }

  async keys(prefix?: string): Promise<string[]> {
    return this.recordOperation('kv.keys', { prefix }, () => this.kv.keys(prefix), (result) => ({ keys: result, success: true }))
  }

  async entries(prefix?: string): Promise<import('./types').AgentFSKVEntry[]> {
    return this.recordOperation('kv.entries', { prefix }, () => this.kv.entries(prefix), (result) => ({ entries: result, success: true }))
  }

  async clear(prefix?: string): Promise<number> {
    return this.recordOperation('kv.clear', { prefix }, () => this.kv.clear(prefix), (result) => ({ cleared: result, success: true }))
  }
}

/**
 * In-memory database for AgentFS operations
 * Used when no external database is provided
 */
function createInMemoryDatabase(): AgentFSDatabase {
  const collections = new Map<string, Map<string, Record<string, unknown>>>()

  const getCollection = (name: string): Map<string, Record<string, unknown>> => {
    if (!collections.has(name)) {
      collections.set(name, new Map())
    }
    return collections.get(name)!
  }

  return {
    async findOne(collection: string, query: Record<string, unknown>): Promise<Record<string, unknown> | null> {
      const col = getCollection(collection)
      if (query._id) {
        return col.get(query._id as string) ?? null
      }
      // Simple query matching
      for (const doc of col.values()) {
        if (matchesQuery(doc, query)) {
          return doc
        }
      }
      return null
    },

    async find(collection: string, query: Record<string, unknown>): Promise<Record<string, unknown>[]> {
      const col = getCollection(collection)
      const results: Record<string, unknown>[] = []
      for (const doc of col.values()) {
        if (matchesQuery(doc, query)) {
          results.push(doc)
        }
      }
      return results
    },

    async insertOne(collection: string, document: Record<string, unknown>): Promise<{ insertedId: string }> {
      const col = getCollection(collection)
      const id = (document._id as string) ?? randomUUID()
      const docWithId = { ...document, _id: id }
      col.set(id, docWithId)
      return { insertedId: id }
    },

    async updateOne(
      collection: string,
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
      options?: { upsert?: boolean }
    ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: string }> {
      const col = getCollection(collection)
      let matched = false

      for (const [id, doc] of col.entries()) {
        if (matchesQuery(doc, filter)) {
          matched = true
          if (update.$set) {
            col.set(id, { ...doc, ...update.$set })
          }
          return { matchedCount: 1, modifiedCount: 1 }
        }
      }

      if (!matched && options?.upsert) {
        const id = (filter._id as string) ?? randomUUID()
        const newDoc = { ...filter, ...update.$set, ...update.$setOnInsert, _id: id }
        col.set(id, newDoc)
        return { matchedCount: 0, modifiedCount: 0, upsertedId: id }
      }

      return { matchedCount: 0, modifiedCount: 0 }
    },

    async deleteOne(collection: string, filter: Record<string, unknown>): Promise<{ deletedCount: number }> {
      const col = getCollection(collection)
      if (filter._id) {
        const existed = col.has(filter._id as string)
        col.delete(filter._id as string)
        return { deletedCount: existed ? 1 : 0 }
      }
      for (const [id, doc] of col.entries()) {
        if (matchesQuery(doc, filter)) {
          col.delete(id)
          return { deletedCount: 1 }
        }
      }
      return { deletedCount: 0 }
    },

    async deleteMany(collection: string, filter: Record<string, unknown>): Promise<{ deletedCount: number }> {
      const col = getCollection(collection)
      let count = 0
      for (const [id, doc] of Array.from(col.entries())) {
        if (matchesQuery(doc, filter)) {
          col.delete(id)
          count++
        }
      }
      return { deletedCount: count }
    },
  }
}

/**
 * Maximum allowed regex pattern length to prevent DoS
 */
const MAX_REGEX_LENGTH = 1000

/**
 * Patterns that indicate potential ReDoS vulnerability
 * These detect nested quantifiers and other dangerous constructs
 */
const REDOS_PATTERNS = [
  /\([^)]*[+*]\)[+*]/, // Nested quantifiers like (a+)+
  /\([^)]*[+*]\)\{/, // Quantifier followed by {n,m} like (a+){2,}
  /\([^)]*\|[^)]*\)[+*]/, // Alternation with quantifier like (a|b)+
  /\.\*.*\.\*/, // Multiple .* patterns
  /\.\+.*\.\+/, // Multiple .+ patterns
  /\([^)]*\.\*[^)]*\)[+*]/, // .* inside quantified group
  /\([^)]*\.\+[^)]*\)[+*]/, // .+ inside quantified group
]

/**
 * Validates a regex pattern for safety and creates a RegExp if valid
 * Protects against ReDoS attacks and invalid patterns
 *
 * @param pattern - The regex pattern string to validate
 * @param flags - Optional regex flags
 * @returns The compiled RegExp or null if invalid/unsafe
 */
function createSafeRegex(pattern: string, flags?: string): RegExp | null {
  // Check pattern length
  if (pattern.length > MAX_REGEX_LENGTH) {
    return null
  }

  // Check for potential ReDoS patterns
  for (const redosPattern of REDOS_PATTERNS) {
    if (redosPattern.test(pattern)) {
      return null
    }
  }

  // Try to compile the regex
  try {
    return new RegExp(pattern, flags)
  } catch {
    // Invalid regex syntax
    return null
  }
}

/**
 * Simple query matching helper
 */
function matchesQuery(doc: Record<string, unknown>, query: Record<string, unknown>): boolean {
  if (Object.keys(query).length === 0) {
    return true
  }

  for (const [key, condition] of Object.entries(query)) {
    const value = doc[key]

    if (typeof condition === 'object' && condition !== null) {
      const operators = condition as Record<string, unknown>

      if ('$regex' in operators) {
        const regex = createSafeRegex(operators.$regex as string)
        if (regex === null) {
          // Invalid or unsafe regex pattern - treat as non-match
          return false
        }
        if (typeof value !== 'string' || !regex.test(value)) {
          return false
        }
      }
    } else {
      if (value !== condition) {
        return false
      }
    }
  }

  return true
}

/**
 * Database adapter for KV storage
 * Wraps AgentFSDatabase to provide KVStorageBackend interface
 */
function createKVBackendFromDatabase(db: AgentFSDatabase): KVStorageBackend {
  const collection = '__agentfs.kv'

  return {
    async findOne(query: { key: string }) {
      const doc = await db.findOne(collection, { _id: query.key })
      if (!doc) return null
      return {
        _id: doc._id as string,
        key: doc.key as string,
        value: doc.value,
        createdAt: doc.createdAt as Date,
        updatedAt: doc.updatedAt as Date,
      }
    },

    async find(query: Record<string, unknown>) {
      const docs = await db.find(collection, query)
      return docs.map((doc) => ({
        _id: doc._id as string,
        key: doc.key as string,
        value: doc.value,
        createdAt: doc.createdAt as Date,
        updatedAt: doc.updatedAt as Date,
      }))
    },

    async insertOne(document) {
      const result = await db.insertOne(collection, {
        _id: document.key,
        ...document,
      })
      return { insertedId: result.insertedId }
    },

    async updateOne(query: { key: string }, update: { $set: Record<string, unknown> }) {
      const result = await db.updateOne(collection, { _id: query.key }, update)
      return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }
    },

    async deleteOne(query: { key: string }) {
      const result = await db.deleteOne(collection, { _id: query.key })
      return { deletedCount: result.deletedCount }
    },

    async deleteMany(query: Record<string, unknown>) {
      const result = await db.deleteMany(collection, query)
      return { deletedCount: result.deletedCount }
    },

    async countDocuments(query: Record<string, unknown>) {
      const docs = await db.find(collection, query)
      return docs.length
    },
  }
}

/**
 * Database adapter for audit logging
 * Wraps AgentFSDatabase to provide AuditBackend interface
 */
function createAuditBackendFromDatabase(db: AgentFSDatabase): AuditBackend {
  const collection = '__agentfs.audit'
  let sequence = 0

  return {
    async append(entry) {
      sequence++
      const id = `tc_${sequence}_${Date.now()}`
      const timestamp = new Date()
      await db.insertOne(collection, {
        _id: id,
        ...entry,
        id,
        timestamp,
      })
      return id
    },

    async findById(id: string) {
      const doc = await db.findOne(collection, { _id: id })
      if (!doc) return null
      const entry: ToolCallEntry = {
        id: doc.id as string,
        tool: doc.tool as string,
        inputs: doc.inputs as Record<string, unknown>,
        outputs: doc.outputs as Record<string, unknown>,
        timestamp: new Date(doc.timestamp as Date),
      }
      if (doc.durationMs !== undefined) entry.durationMs = doc.durationMs as number
      if (doc.metadata !== undefined) entry.metadata = doc.metadata as Record<string, unknown>
      return entry
    },

    async list(options) {
      const docs = await db.find(collection, {})
      const entries = docs.map((doc) => {
        const entry: ToolCallEntry = {
          id: doc.id as string,
          tool: doc.tool as string,
          inputs: doc.inputs as Record<string, unknown>,
          outputs: doc.outputs as Record<string, unknown>,
          timestamp: new Date(doc.timestamp as Date),
        }
        if (doc.durationMs !== undefined) entry.durationMs = doc.durationMs as number
        if (doc.metadata !== undefined) entry.metadata = doc.metadata as Record<string, unknown>
        return entry
      })

      // Sort by timestamp
      entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

      const offset = options?.offset ?? 0
      const limit = options?.limit ?? entries.length
      return entries.slice(offset, offset + limit)
    },

    async findByTool(toolName: string) {
      const docs = await db.find(collection, { tool: toolName })
      return docs.map((doc) => {
        const entry: ToolCallEntry = {
          id: doc.id as string,
          tool: doc.tool as string,
          inputs: doc.inputs as Record<string, unknown>,
          outputs: doc.outputs as Record<string, unknown>,
          timestamp: new Date(doc.timestamp as Date),
        }
        if (doc.durationMs !== undefined) entry.durationMs = doc.durationMs as number
        if (doc.metadata !== undefined) entry.metadata = doc.metadata as Record<string, unknown>
        return entry
      })
    },

    async findByTimeRange(start: Date, end: Date) {
      const docs = await db.find(collection, {})
      return docs
        .map((doc) => {
          const entry: ToolCallEntry = {
            id: doc.id as string,
            tool: doc.tool as string,
            inputs: doc.inputs as Record<string, unknown>,
            outputs: doc.outputs as Record<string, unknown>,
            timestamp: new Date(doc.timestamp as Date),
          }
          if (doc.durationMs !== undefined) entry.durationMs = doc.durationMs as number
          if (doc.metadata !== undefined) entry.metadata = doc.metadata as Record<string, unknown>
          return entry
        })
        .filter((e) => e.timestamp >= start && e.timestamp <= end)
    },

    async count() {
      const docs = await db.find(collection, {})
      return docs.length
    },

    async update() {
      throw new Error('Cannot update audit log entries')
    },

    async delete() {
      throw new Error('Cannot delete audit log entries')
    },
  }
}

/**
 * MonDoAgent - Unified interface for AI agent operations
 *
 * Integrates the AgentFS virtual filesystem, glob, grep, KV store, and tool call
 * auditing with Cloudflare Agent infrastructure.
 *
 * @example
 * ```typescript
 * const agent = new MonDoAgent(ctx, env)
 * await agent.init()
 *
 * // Filesystem operations
 * await agent.fs.writeFile('/config.json', '{}')
 * const content = await agent.fs.readFile('/config.json')
 *
 * // Glob matching
 * const tsFiles = await agent.glob('**\/*.ts')
 *
 * // Content search
 * const matches = await agent.grep('TODO', { glob: '**\/*.ts' })
 *
 * // Key-value storage
 * await agent.kv.set('session:123', { user: 'alice' })
 * const session = await agent.kv.get('session:123')
 *
 * // Audit logging
 * await agent.audit.record('read_file', { path: '/test.txt' }, { content: 'hello' })
 * ```
 */
export class MonDoAgent {
  /** Virtual filesystem for file and directory operations (with auto-auditing) */
  readonly fs: FileSystem

  /** Key-value store for session data, caches, etc. (with auto-auditing) */
  readonly kv: KeyValueStore

  /** Append-only audit log for tool call tracking */
  readonly audit: ToolCallAuditLog

  /** Internal raw filesystem (without auditing wrapper) */
  private readonly _rawFs: AgentFilesystem

  /** Internal raw KV store (without auditing wrapper) */
  private readonly _rawKv: AgentFSKVStore

  /** Agent state */
  private _state: AgentState = { initialized: false }

  /** SQL database from Cloudflare Agent */
  readonly sql: SqlDatabase

  /** Agent context */
  protected readonly ctx: AgentContext

  /** Agent environment */
  protected readonly env: AgentEnv

  /** Active WebSocket connections */
  private readonly _connections = new Set<WebSocketConnection>()

  /**
   * Create a new MonDoAgent instance
   *
   * @param ctx - Agent context (from Cloudflare Agent)
   * @param env - Agent environment (Cloudflare bindings)
   */
  constructor(ctx: AgentContext, env: AgentEnv) {
    this.ctx = ctx
    this.env = env

    // Create mock SQL interface (simulating Cloudflare Agent's this.sql)
    this.sql = this.createSqlInterface()

    // Create in-memory database for filesystem operations
    const database = createInMemoryDatabase()

    // Initialize raw components
    this._rawFs = new AgentFilesystem(database)

    const kvBackend = createKVBackendFromDatabase(database)
    this._rawKv = new AgentFSKVStore(kvBackend)

    const auditBackend = createAuditBackendFromDatabase(database)
    this.audit = new ToolCallAuditLog(auditBackend)

    // Create audited wrappers
    this.fs = new AuditedFilesystem(this._rawFs, this.audit)
    this.kv = new AuditedKVStore(this._rawKv, this.audit)
  }

  /**
   * Create SQL interface (simulating Cloudflare Agent's this.sql)
   */
  private createSqlInterface(): SqlDatabase {
    return {
      exec: async (_sql: string) => ({ results: [] }),
      prepare: (_sql: string) => ({
        bind: function (..._params: unknown[]) { return this },
        run: async () => ({ results: [] }),
        first: async () => null,
        all: async () => ({ results: [] }),
      }),
    }
  }

  /**
   * Set agent state (Cloudflare Agent compatibility)
   */
  setState(newState: Partial<AgentState>): void {
    this._state = { ...this._state, ...newState }
  }

  /**
   * Get agent state (Cloudflare Agent compatibility)
   */
  getState(): AgentState {
    return this._state
  }

  /**
   * Initialize the agent
   * Sets up all resources and marks state as initialized
   */
  async init(): Promise<void> {
    // Perform any initialization tasks here
    this.setState({ initialized: true })
  }

  /**
   * Handle WebSocket connection
   * Accepts connection, sets up handlers, and sends welcome message
   */
  async onConnect(ws: WebSocketConnection, _request: Request): Promise<void> {
    // Accept the connection
    ws.accept()

    // Track connection
    this._connections.add(ws)

    // Send welcome message
    ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }))

    // Set up message handler
    ws.addEventListener('message', async (event: unknown) => {
      const messageEvent = event as { data: string }
      try {
        const message = JSON.parse(messageEvent.data) as WebSocketMessage
        await this.onMessage(ws, message)
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          error: { message: 'Invalid message format' },
        }))
      }
    })

    // Set up close handler
    ws.addEventListener('close', async (event: unknown) => {
      const closeEvent = event as { code: number; reason: string }
      this._connections.delete(ws)

      // Record disconnect in audit log
      await this.audit.record('websocket.disconnect', {
        code: closeEvent.code,
        reason: closeEvent.reason,
      }, { success: true })
    })

    // Record connection in audit log
    await this.audit.record('websocket.connect', {
      url: _request.url,
    }, { success: true })
  }

  /**
   * Handle WebSocket message
   * Parses tool call, executes it, and sends response
   */
  async onMessage(ws: WebSocketConnection, message: WebSocketMessage): Promise<void> {
    // Validate message
    if (!message.id || !message.tool) {
      ws.send(JSON.stringify({
        type: 'error',
        error: { message: 'Missing required fields: id and tool' },
      }))
      return
    }

    const { id, tool, inputs = {}, stream = false } = message

    try {
      const result = await this.executeToolCall(tool, inputs, stream, ws, id)
      ws.send(JSON.stringify({
        type: 'tool_result',
        id,
        result,
      }))
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'tool_error',
        id,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      }))
    }
  }

  /**
   * Execute a tool call and return the result
   */
  private async executeToolCall(
    tool: string,
    inputs: Record<string, unknown>,
    _stream: boolean,
    _ws: WebSocketConnection,
    _callId: string
  ): Promise<Record<string, unknown>> {
    switch (tool) {
      case 'fs.readFile': {
        const content = await this.fs.readFile(inputs.path as string)
        return { content, success: true }
      }

      case 'fs.writeFile': {
        await this.fs.writeFile(inputs.path as string, inputs.content as string)
        return { success: true }
      }

      case 'fs.deleteFile': {
        await this.fs.deleteFile(inputs.path as string)
        return { success: true }
      }

      case 'fs.readdir': {
        const entries = await this.fs.readdir(inputs.path as string)
        return { entries, success: true }
      }

      case 'fs.mkdir': {
        await this.fs.mkdir(inputs.path as string)
        return { success: true }
      }

      case 'fs.rmdir': {
        await this.fs.rmdir(inputs.path as string)
        return { success: true }
      }

      case 'fs.stat': {
        const stat = await this.fs.stat(inputs.path as string)
        return { stat, success: true }
      }

      case 'fs.exists': {
        const exists = await this.fs.exists(inputs.path as string)
        return { exists, success: true }
      }

      case 'glob': {
        const files = await this.glob(inputs.pattern as string, inputs.options as AgentGlobOptions)
        return { files, success: true }
      }

      case 'grep': {
        const matches = await this.grep(inputs.pattern as string, inputs.options as AgentGrepOptions)
        return { matches, success: true }
      }

      case 'kv.get': {
        const value = await this.kv.get(inputs.key as string)
        return { value, success: true }
      }

      case 'kv.set': {
        await this.kv.set(inputs.key as string, inputs.value)
        return { success: true }
      }

      case 'kv.delete': {
        const deleted = await this.kv.delete(inputs.key as string)
        return { deleted, success: true }
      }

      case 'kv.has': {
        const exists = await this.kv.has(inputs.key as string)
        return { exists, success: true }
      }

      case 'kv.keys': {
        const keys = await this.kv.keys(inputs.prefix as string | undefined)
        return { keys, success: true }
      }

      default:
        throw new Error(`Unknown tool: ${tool}`)
    }
  }

  /**
   * Find files matching a glob pattern (with auto-auditing)
   *
   * @param pattern - Glob pattern (e.g., '**\/*.ts', 'src/*.js')
   * @param options - Optional glob options
   * @returns Array of matching file paths
   */
  async glob(pattern: string, options?: AgentGlobOptions): Promise<string[]> {
    const startTime = new Date()

    try {
      // Use raw filesystem's glob to avoid double auditing
      const allFiles = await this._rawFs.glob(pattern)

      // Apply additional filtering if options provided
      let result: string[]
      if (!options?.nocase && !options?.dot) {
        result = allFiles
      } else {
        result = filterGlob(pattern, allFiles, options)
      }

      const endTime = new Date()

      // Record in audit log
      await this.audit.record('glob', { pattern, options }, { files: result, count: result.length, success: true }, { startTime, endTime })

      return result
    } catch (error) {
      const endTime = new Date()

      await this.audit.record('glob', { pattern, options }, {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      }, { startTime, endTime })

      throw error
    }
  }

  /**
   * Search file contents for a pattern (with auto-auditing)
   *
   * @param pattern - Regular expression pattern to search for
   * @param options - Optional grep options
   * @returns Array of grep matches
   */
  async grep(pattern: string, options?: AgentGrepOptions): Promise<GrepMatch[]> {
    const startTime = new Date()

    try {
      // Create a custom glob matcher that properly handles root-level files
      // The default **/* pattern doesn't match files at root level
      const customGlobMatcher = {
        glob: async (globPattern: string): Promise<string[]> => {
          // If pattern is **/* or similar, we need to also check root level
          if (globPattern === '**/*' || globPattern === '/**/*') {
            // Get all files by using a pattern that matches everything
            const allFiles = await this._rawFs.glob('**/*')
            // Also get root level files with a simple pattern
            const rootFiles = await this._rawFs.glob('/*')
            // Combine and dedupe
            const combined = new Set([...allFiles, ...rootFiles])
            return Array.from(combined).sort()
          }
          return this._rawFs.glob(globPattern)
        }
      }

      // Create a new AgentGrep with raw filesystem to avoid double auditing of file reads
      const rawGrep = new AgentGrep(this._rawFs, customGlobMatcher)
      const matches = await rawGrep.grep(pattern, options)

      const endTime = new Date()

      // Record in audit log
      await this.audit.record('grep', { pattern, ...options }, { matches, count: matches.length, success: true }, { startTime, endTime })

      return matches
    } catch (error) {
      const endTime = new Date()

      await this.audit.record('grep', { pattern, ...options }, {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      }, { startTime, endTime })

      throw error
    }
  }

  /**
   * Search and return only file paths containing matches
   *
   * @param pattern - Regular expression pattern to search for
   * @param options - Optional grep options
   * @returns Array of unique file paths
   */
  async grepFiles(pattern: string, options?: AgentGrepOptions): Promise<string[]> {
    const matches = await this.grep(pattern, options)
    const uniqueFiles = new Set(matches.map((m) => m.file))
    return Array.from(uniqueFiles)
  }

  /**
   * Count matches per file
   *
   * @param pattern - Regular expression pattern to search for
   * @param options - Optional grep options
   * @returns Map of file path to match count
   */
  async grepCount(pattern: string, options?: AgentGrepOptions): Promise<Map<string, number>> {
    // Remove maxResults to get all matches for counting
    const { maxResults: _maxResults, ...restOptions } = options ?? {}
    const matches = await this.grep(pattern, restOptions)
    const counts = new Map<string, number>()

    for (const match of matches) {
      counts.set(match.file, (counts.get(match.file) ?? 0) + 1)
    }

    return counts
  }
}

/**
 * Create a new MonDoAgent instance (legacy factory function)
 *
 * @param options - Configuration options
 * @returns Configured MonDoAgent instance
 */
export function createMonDoAgent(_options: MonDoAgentOptions): MonDoAgent {
  // Create a mock context and env for legacy compatibility
  const ctx: AgentContext = {
    id: 'legacy-agent',
    storage: {
      get: async () => null,
      put: async () => {},
      delete: async () => false,
      list: async () => new Map(),
    },
    blockConcurrencyWhile: async (fn) => fn(),
  }
  const env: AgentEnv = {}

  return new MonDoAgent(ctx, env)
}

/**
 * Type guard to check if an object is a MonDoAgent
 */
export function isMonDoAgent(obj: unknown): obj is MonDoAgent {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'fs' in obj &&
    'kv' in obj &&
    'audit' in obj &&
    typeof (obj as MonDoAgent).glob === 'function' &&
    typeof (obj as MonDoAgent).grep === 'function'
  )
}
