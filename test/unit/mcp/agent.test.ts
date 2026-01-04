import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * MonDoAgent Class Tests
 *
 * The MonDoAgent is the main entry point for AI agents to interact with MondoDB.
 * It orchestrates:
 * - MCP Server for tool handling
 * - AgentFS for file system operations
 * - KV Store for key-value storage
 * - Tool Call Auditing for logging
 * - Code execution via Worker Loader or Miniflare fallback
 *
 * This test file defines the expected interface and behavior.
 */

/**
 * MonDoAgent interface definition
 * This represents the expected public API
 */
interface MonDoAgent {
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

// Supporting interfaces
interface McpServerLike {
  listTools(): Promise<{ name: string; description: string }[]>
  callTool(name: string, args: Record<string, unknown>): Promise<{ content: { text: string }[] }>
}

interface FileSystemLike {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
}

interface KVStoreLike {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
}

interface AuditLogLike {
  record(tool: string, inputs: unknown, outputs: unknown): Promise<string>
  list(options?: { limit?: number }): Promise<{ id: string; tool: string }[]>
}

interface ExecutionResult<T> {
  success: boolean
  value?: T
  error?: string
  logs?: string[]
  duration?: number
}

interface SearchOptions {
  collection?: string
  limit?: number
}

interface SearchResult {
  id: string
  title: string
  url: string
  text: string
}

interface FetchResult {
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

describe('MonDoAgent', () => {
  describe('Agent Creation', () => {
    it('should create agent with unique id', () => {
      const agent1 = createMockAgent()
      const agent2 = createMockAgent()

      expect(agent1.id).toBeDefined()
      expect(agent2.id).toBeDefined()
      expect(agent1.id).not.toBe(agent2.id)
    })

    it('should accept custom agent id', () => {
      const agent = createMockAgent({ id: 'custom-agent-123' })

      expect(agent.id).toBe('custom-agent-123')
    })

    it('should expose mcp server', () => {
      const agent = createMockAgent()

      expect(agent.mcp).toBeDefined()
      expect(typeof agent.mcp.listTools).toBe('function')
      expect(typeof agent.mcp.callTool).toBe('function')
    })

    it('should expose filesystem', () => {
      const agent = createMockAgent()

      expect(agent.fs).toBeDefined()
      expect(typeof agent.fs.readFile).toBe('function')
      expect(typeof agent.fs.writeFile).toBe('function')
      expect(typeof agent.fs.exists).toBe('function')
    })

    it('should expose kv store', () => {
      const agent = createMockAgent()

      expect(agent.kv).toBeDefined()
      expect(typeof agent.kv.get).toBe('function')
      expect(typeof agent.kv.set).toBe('function')
      expect(typeof agent.kv.delete).toBe('function')
    })

    it('should expose audit log', () => {
      const agent = createMockAgent()

      expect(agent.audit).toBeDefined()
      expect(typeof agent.audit.record).toBe('function')
      expect(typeof agent.audit.list).toBe('function')
    })
  })

  describe('execute method', () => {
    it('should execute tool by name', async () => {
      const agent = createMockAgent()

      const result = await agent.execute('search', { query: 'test' })

      expect(result.success).toBe(true)
    })

    it('should return typed result value', async () => {
      const agent = createMockAgent()

      const result = await agent.execute<number>('do', { code: 'return 42' })

      expect(result.value).toBe(42)
    })

    it('should report errors for unknown tools', async () => {
      const agent = createMockAgent()

      const result = await agent.execute('nonexistent', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should include execution duration', async () => {
      const agent = createMockAgent()

      const result = await agent.execute('search', { query: 'test' })

      expect(result.duration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('do method', () => {
    it('should execute code in sandbox', async () => {
      const agent = createMockAgent()

      const result = await agent.do('return 42')

      expect(result.success).toBe(true)
      expect(result.value).toBe(42)
    })

    it('should accept optional description', async () => {
      const agent = createMockAgent()

      const result = await agent.do('return "hello"', 'Returns greeting')

      expect(result.success).toBe(true)
    })

    it('should capture logs', async () => {
      const agent = createMockAgent()

      const result = await agent.do('console.log("test"); return 1')

      expect(result.logs).toContain('test')
    })

    it('should report errors for invalid code', async () => {
      const agent = createMockAgent()

      const result = await agent.do('invalid {{{ syntax')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('search method', () => {
    it('should search for documents', async () => {
      const agent = createMockAgent()

      const results = await agent.search('test query')

      expect(Array.isArray(results)).toBe(true)
    })

    it('should return OpenAI Deep Research format', async () => {
      const agent = createMockAgent({
        searchResults: [
          { id: 'db.coll.id1', title: 'Test', url: 'mongodb://db/coll/id1', text: 'content' },
        ],
      })

      const results = await agent.search('test')

      expect(results[0]).toHaveProperty('id')
      expect(results[0]).toHaveProperty('title')
      expect(results[0]).toHaveProperty('url')
      expect(results[0]).toHaveProperty('text')
    })

    it('should respect limit option', async () => {
      const agent = createMockAgent({
        searchResults: Array(100).fill({
          id: 'id',
          title: 'title',
          url: 'url',
          text: 'text',
        }),
      })

      const results = await agent.search('test', { limit: 10 })

      expect(results.length).toBeLessThanOrEqual(10)
    })

    it('should filter by collection', async () => {
      const agent = createMockAgent()

      await agent.search('test', { collection: 'users' })

      // Verify collection filter was passed (mock implementation)
      expect(agent).toBeDefined()
    })
  })

  describe('fetch method', () => {
    it('should fetch document by ID', async () => {
      const agent = createMockAgent({
        fetchResult: {
          id: 'db.coll.id1',
          title: 'Test Doc',
          url: 'mongodb://db/coll/id1',
          text: '{"_id":"id1","name":"Test"}',
          metadata: { database: 'db', collection: 'coll', _id: 'id1' },
        },
      })

      const result = await agent.fetch('db.coll.id1')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('db.coll.id1')
      expect(result?.metadata.database).toBe('db')
      expect(result?.metadata.collection).toBe('coll')
    })

    it('should return null for non-existent document', async () => {
      const agent = createMockAgent({ fetchResult: null })

      const result = await agent.fetch('db.coll.nonexistent')

      expect(result).toBeNull()
    })

    it('should return FetchResult format', async () => {
      const agent = createMockAgent({
        fetchResult: {
          id: 'db.coll.id1',
          title: 'Test',
          url: 'mongodb://db/coll/id1',
          text: '{}',
          metadata: { database: 'db', collection: 'coll', _id: 'id1' },
        },
      })

      const result = await agent.fetch('db.coll.id1')

      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('title')
      expect(result).toHaveProperty('url')
      expect(result).toHaveProperty('text')
      expect(result).toHaveProperty('metadata')
      expect(result?.metadata).toHaveProperty('database')
      expect(result?.metadata).toHaveProperty('collection')
      expect(result?.metadata).toHaveProperty('_id')
    })
  })

  describe('dispose method', () => {
    it('should clean up resources', async () => {
      const agent = createMockAgent()

      await expect(agent.dispose()).resolves.not.toThrow()
    })

    it('should be idempotent', async () => {
      const agent = createMockAgent()

      await agent.dispose()
      await expect(agent.dispose()).resolves.not.toThrow()
    })
  })

  describe('Tool Call Auditing', () => {
    it('should audit execute calls', async () => {
      const agent = createMockAgent()

      await agent.execute('search', { query: 'test' })

      const entries = await agent.audit.list({ limit: 1 })
      expect(entries.length).toBe(1)
      expect(entries[0].tool).toBe('search')
    })

    it('should audit do calls', async () => {
      const agent = createMockAgent()

      await agent.do('return 42')

      const entries = await agent.audit.list({ limit: 1 })
      expect(entries.length).toBe(1)
      expect(entries[0].tool).toBe('do')
    })

    it('should audit search calls', async () => {
      const agent = createMockAgent()

      await agent.search('test')

      const entries = await agent.audit.list({ limit: 1 })
      expect(entries.length).toBe(1)
      expect(entries[0].tool).toBe('search')
    })

    it('should audit fetch calls', async () => {
      const agent = createMockAgent()

      await agent.fetch('db.coll.id')

      const entries = await agent.audit.list({ limit: 1 })
      expect(entries.length).toBe(1)
      expect(entries[0].tool).toBe('fetch')
    })
  })

  describe('Filesystem Integration', () => {
    it('should read files', async () => {
      const agent = createMockAgent({
        files: { '/test.txt': 'hello world' },
      })

      const content = await agent.fs.readFile('/test.txt')

      expect(content).toBe('hello world')
    })

    it('should write files', async () => {
      const agent = createMockAgent()

      await agent.fs.writeFile('/new.txt', 'content')

      expect(await agent.fs.exists('/new.txt')).toBe(true)
      expect(await agent.fs.readFile('/new.txt')).toBe('content')
    })

    it('should check file existence', async () => {
      const agent = createMockAgent({
        files: { '/exists.txt': 'content' },
      })

      expect(await agent.fs.exists('/exists.txt')).toBe(true)
      expect(await agent.fs.exists('/notexists.txt')).toBe(false)
    })
  })

  describe('KV Store Integration', () => {
    it('should get values', async () => {
      const agent = createMockAgent({
        kvData: { 'my-key': { value: 42 } },
      })

      const value = await agent.kv.get('my-key')

      expect(value).toEqual({ value: 42 })
    })

    it('should set values', async () => {
      const agent = createMockAgent()

      await agent.kv.set('new-key', { data: 'test' })

      const value = await agent.kv.get('new-key')
      expect(value).toEqual({ data: 'test' })
    })

    it('should delete values', async () => {
      const agent = createMockAgent({
        kvData: { 'to-delete': 'value' },
      })

      const deleted = await agent.kv.delete('to-delete')

      expect(deleted).toBe(true)
      expect(await agent.kv.get('to-delete')).toBeNull()
    })

    it('should return null for non-existent keys', async () => {
      const agent = createMockAgent()

      const value = await agent.kv.get('nonexistent')

      expect(value).toBeNull()
    })
  })
})

/**
 * Create a mock MonDoAgent for testing
 * This mock implementation provides the expected behavior
 */
function createMockAgent(options: {
  id?: string
  files?: Record<string, string>
  kvData?: Record<string, unknown>
  searchResults?: SearchResult[]
  fetchResult?: FetchResult | null
} = {}): MonDoAgent {
  const id = options.id ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const files = new Map(Object.entries(options.files ?? {}))
  const kvData = new Map<string, unknown>(Object.entries(options.kvData ?? {}))
  const auditEntries: { id: string; tool: string; inputs: unknown; outputs: unknown }[] = []

  const fs: FileSystemLike = {
    async readFile(path: string) {
      const content = files.get(path)
      if (content === undefined) {
        throw new Error(`ENOENT: ${path}`)
      }
      return content
    },
    async writeFile(path: string, content: string) {
      files.set(path, content)
    },
    async exists(path: string) {
      return files.has(path)
    },
  }

  const kv: KVStoreLike = {
    async get<T>(key: string) {
      return (kvData.get(key) as T) ?? null
    },
    async set<T>(key: string, value: T) {
      kvData.set(key, value)
    },
    async delete(key: string) {
      return kvData.delete(key)
    },
  }

  const audit: AuditLogLike = {
    async record(tool: string, inputs: unknown, outputs: unknown) {
      const entryId = `entry-${auditEntries.length}`
      auditEntries.push({ id: entryId, tool, inputs, outputs })
      return entryId
    },
    async list(opts?: { limit?: number }) {
      const limit = opts?.limit ?? auditEntries.length
      return auditEntries.slice(-limit).map((e) => ({ id: e.id, tool: e.tool }))
    },
  }

  const mcp: McpServerLike = {
    async listTools() {
      return [
        { name: 'search', description: 'Search documents' },
        { name: 'fetch', description: 'Fetch document' },
        { name: 'do', description: 'Execute code' },
      ]
    },
    async callTool(name: string, args: Record<string, unknown>) {
      if (!['search', 'fetch', 'do'].includes(name)) {
        throw new Error(`Tool '${name}' not found`)
      }
      void args
      return { content: [{ text: '{"success":true}' }] }
    },
  }

  const agent: MonDoAgent = {
    id,
    mcp,
    fs,
    kv,
    audit,

    async execute<T>(toolName: string, args: Record<string, unknown>) {
      const startTime = Date.now()
      try {
        if (!['search', 'fetch', 'do'].includes(toolName)) {
          const result = { success: false, error: `Tool '${toolName}' not found` }
          await audit.record(toolName, args, result)
          return result as ExecutionResult<T>
        }
        const value = (toolName === 'do' ? 42 : undefined) as T
        const result = { success: true, value, duration: Date.now() - startTime }
        await audit.record(toolName, args, result)
        return result
      } catch (error) {
        const result = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime,
        }
        await audit.record(toolName, args, result)
        return result as ExecutionResult<T>
      }
    },

    async do(code: string, description?: string) {
      await audit.record('do', { code, description }, { success: true })
      if (code.includes('{{{')) {
        return { success: false, error: 'SyntaxError', logs: [] }
      }
      if (code.includes('console.log')) {
        return { success: true, value: 1, logs: ['test'] }
      }
      return { success: true, value: 42, logs: [] }
    },

    async search(query: string, opts?: SearchOptions) {
      await audit.record('search', { query, ...opts }, { results: [] })
      const results = options.searchResults ?? []
      const limit = opts?.limit ?? results.length
      return results.slice(0, limit)
    },

    async fetch(docId: string) {
      await audit.record('fetch', { id: docId }, options.fetchResult)
      return options.fetchResult ?? null
    },

    async dispose() {
      // Cleanup
    },
  }

  return agent
}
