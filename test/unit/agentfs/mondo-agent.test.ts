import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

/**
 * MonDoAgent - RED Phase Tests
 *
 * These tests define the expected behavior for MonDoAgent, which integrates
 * the AgentFS virtual filesystem, glob, grep, KV store, and tool call auditing
 * with the Cloudflare Agent class.
 *
 * Tests for Cloudflare Agent integration (setState, getState, onConnect, onMessage)
 * will FAIL until the GREEN phase implementation is complete.
 *
 * Tests for existing functionality (fs, kv, audit, glob, grep) should PASS.
 */

// Import the MonDoAgent and types - these should resolve
import {
  MonDoAgent,
  createMonDoAgent,
  type AgentState,
  type AgentEnv,
  type AgentContext,
  type WebSocketConnection,
  type WebSocketMessage,
  type MonDoAgentOptions,
} from '../../../src/agentfs/mondo-agent'
import { createInMemoryBackend } from '../../../src/agentfs/kv-store'
import { createInMemoryAuditBackend } from '../../../src/agentfs/toolcalls'
import type { AgentFSDatabase } from '../../../src/agentfs/vfs'

// ============================================================================
// Mock Database (same pattern as other agentfs tests)
// ============================================================================

/**
 * Create a mock database that stores files and directories in memory
 */
function createMockDatabase(): AgentFSDatabase {
  const collections = new Map<string, Map<string, Record<string, unknown>>>()

  const getCollection = (name: string) => {
    if (!collections.has(name)) {
      collections.set(name, new Map())
    }
    return collections.get(name)!
  }

  return {
    findOne: async (collection: string, query: Record<string, unknown>) => {
      const col = getCollection(collection)
      const id = query._id as string
      return col.get(id) || null
    },

    find: async (collection: string, query: Record<string, unknown>) => {
      const col = getCollection(collection)
      const results: Record<string, unknown>[] = []

      for (const [id, doc] of col) {
        // Handle regex queries on path field
        if (query.path && typeof query.path === 'object' && '$regex' in query.path) {
          const regex = new RegExp((query.path as { $regex: string }).$regex)
          if (regex.test(doc.path as string)) {
            results.push(doc)
          }
        } else if (!query.path && !query._id) {
          results.push(doc)
        } else if (query._id === id) {
          results.push(doc)
        }
      }
      return results
    },

    insertOne: async (collection: string, document: Record<string, unknown>) => {
      const col = getCollection(collection)
      const id = document._id as string
      col.set(id, { ...document })
      return { insertedId: id }
    },

    updateOne: async (
      collection: string,
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
      options?: { upsert?: boolean }
    ) => {
      const col = getCollection(collection)
      const id = filter._id as string
      const existing = col.get(id)

      if (existing) {
        if (update.$set) {
          col.set(id, { ...existing, ...update.$set })
        }
        return { matchedCount: 1, modifiedCount: 1 }
      } else if (options?.upsert) {
        const newDoc = { _id: id, ...update.$set, ...update.$setOnInsert }
        col.set(id, newDoc)
        return { matchedCount: 0, modifiedCount: 0, upsertedId: id }
      }
      return { matchedCount: 0, modifiedCount: 0 }
    },

    deleteOne: async (collection: string, filter: Record<string, unknown>) => {
      const col = getCollection(collection)
      const id = filter._id as string
      const deleted = col.delete(id)
      return { deletedCount: deleted ? 1 : 0 }
    },

    deleteMany: async (collection: string, filter: Record<string, unknown>) => {
      const col = getCollection(collection)
      let count = 0

      if (filter.path && typeof filter.path === 'object' && '$regex' in filter.path) {
        const regex = new RegExp((filter.path as { $regex: string }).$regex)
        for (const [id, doc] of col) {
          if (regex.test(doc.path as string)) {
            col.delete(id)
            count++
          }
        }
      }
      return { deletedCount: count }
    },
  }
}

/**
 * Create a mock WebSocket connection
 */
function createMockWebSocket(): WebSocketConnection {
  return {
    accept: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 1, // WebSocket.OPEN
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('MonDoAgent', () => {
  let agent: MonDoAgent
  let mockDb: AgentFSDatabase

  beforeEach(() => {
    mockDb = createMockDatabase()
    agent = createMonDoAgent({
      database: mockDb,
      kvBackend: createInMemoryBackend(),
      auditBackend: createInMemoryAuditBackend(),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ==========================================================================
  // INITIALIZATION TESTS
  // ==========================================================================

  describe('Initialization', () => {
    it('creates a MonDoAgent instance', () => {
      expect(agent).toBeInstanceOf(MonDoAgent)
    })

    it('initializes filesystem', () => {
      // The filesystem should be initialized and accessible
      expect(agent.fs).toBeDefined()
      expect(typeof agent.fs.readFile).toBe('function')
      expect(typeof agent.fs.writeFile).toBe('function')
      expect(typeof agent.fs.deleteFile).toBe('function')
      expect(typeof agent.fs.readdir).toBe('function')
      expect(typeof agent.fs.mkdir).toBe('function')
      expect(typeof agent.fs.rmdir).toBe('function')
      expect(typeof agent.fs.stat).toBe('function')
      expect(typeof agent.fs.exists).toBe('function')
    })

    it('initializes glob functionality', () => {
      // Glob method should be available as a convenience method
      expect(typeof agent.glob).toBe('function')
    })

    it('initializes grep functionality', () => {
      // Grep method should be available as a convenience method
      expect(typeof agent.grep).toBe('function')
    })

    it('initializes KV store', () => {
      // KV store should be initialized and accessible
      expect(agent.kv).toBeDefined()
      expect(typeof agent.kv.get).toBe('function')
      expect(typeof agent.kv.set).toBe('function')
      expect(typeof agent.kv.delete).toBe('function')
      expect(typeof agent.kv.has).toBe('function')
      expect(typeof agent.kv.keys).toBe('function')
    })

    it('initializes tool call auditing', () => {
      // Audit log should be initialized and accessible
      expect(agent.audit).toBeDefined()
      expect(typeof agent.audit.record).toBe('function')
      expect(typeof agent.audit.findById).toBe('function')
      expect(typeof agent.audit.list).toBe('function')
      expect(typeof agent.audit.count).toBe('function')
    })

    // RED PHASE: These tests will FAIL until Cloudflare Agent extension is implemented
    describe('Cloudflare Agent Integration (RED PHASE - will fail)', () => {
      it('extends Cloudflare Agent class with setState', () => {
        // MonDoAgent should have setState from Agent base class
        expect(typeof agent.setState).toBe('function')
        // Should not throw when called
        expect(() => agent.setState({ customField: 'test-value' })).not.toThrow()
      })

      it('extends Cloudflare Agent class with getState', () => {
        // MonDoAgent should have getState from Agent base class
        expect(typeof agent.getState).toBe('function')
        // Should return state object
        const state = agent.getState()
        expect(state).toBeDefined()
        expect(typeof state).toBe('object')
      })

      it('has access to this.sql from Agent', () => {
        // The sql property should be accessible (inherited from Agent)
        expect(agent.sql).toBeDefined()
        expect(typeof agent.sql.exec).toBe('function')
        expect(typeof agent.sql.prepare).toBe('function')
      })

      it('setState updates state correctly', () => {
        agent.setState({ customField: 'test-value' })
        const state = agent.getState()
        expect(state.customField).toBe('test-value')
      })

      it('sets initial state as not initialized', () => {
        const state = agent.getState()
        expect(state.initialized).toBe(false)
      })

      it('marks state as initialized after init() is called', async () => {
        await agent.init()
        const state = agent.getState()
        expect(state.initialized).toBe(true)
      })
    })
  })

  // ==========================================================================
  // UNIFIED API TESTS (These should PASS with current implementation)
  // ==========================================================================

  describe('Unified API', () => {
    describe('agent.fs - Filesystem access', () => {
      it('provides access to filesystem operations', () => {
        expect(agent.fs).toBeDefined()
      })

      it('writes and reads files', async () => {
        await agent.fs.writeFile('/test.txt', 'hello world')
        const content = await agent.fs.readFile('/test.txt')
        expect(content).toBe('hello world')
      })

      it('checks file existence', async () => {
        await agent.fs.writeFile('/exists.txt', 'content')
        expect(await agent.fs.exists('/exists.txt')).toBe(true)
        expect(await agent.fs.exists('/nonexistent.txt')).toBe(false)
      })

      it('lists directory contents', async () => {
        await agent.fs.writeFile('/dir/file1.txt', 'content1')
        await agent.fs.writeFile('/dir/file2.txt', 'content2')
        const entries = await agent.fs.readdir('/dir')
        expect(entries).toContain('file1.txt')
        expect(entries).toContain('file2.txt')
      })

      it('gets file stats', async () => {
        await agent.fs.writeFile('/stats.txt', 'test content')
        const stat = await agent.fs.stat('/stats.txt')
        expect(stat.type).toBe('file')
        expect(stat.size).toBe(12) // 'test content'.length
        expect(stat.createdAt).toBeInstanceOf(Date)
        expect(stat.updatedAt).toBeInstanceOf(Date)
      })
    })

    describe('agent.glob(pattern) - Convenience method', () => {
      it('matches files by glob pattern', async () => {
        await agent.fs.writeFile('/src/index.ts', 'export {}')
        await agent.fs.writeFile('/src/app.ts', 'export {}')
        await agent.fs.writeFile('/src/styles.css', 'body {}')

        const matches = await agent.glob('/src/*.ts')
        expect(matches).toContain('/src/index.ts')
        expect(matches).toContain('/src/app.ts')
        expect(matches).not.toContain('/src/styles.css')
      })

      it('returns empty array for no matches', async () => {
        const matches = await agent.glob('/nonexistent/**/*.xyz')
        expect(matches).toEqual([])
      })
    })

    describe('agent.grep(pattern, options) - Convenience method', () => {
      it('searches for pattern in files', async () => {
        await agent.fs.writeFile('/src/index.ts', 'const hello = "world"')

        const matches = await agent.grep('hello')
        expect(matches.length).toBeGreaterThanOrEqual(1)
        expect(matches[0].file).toBe('/src/index.ts')
      })

      it('supports regex patterns', async () => {
        await agent.fs.writeFile('/test.ts', 'function greet() {}\nfunction sayHello() {}')

        const matches = await agent.grep('function\\s+\\w+')
        expect(matches).toHaveLength(2)
      })
    })

    describe('agent.kv - KV store access', () => {
      it('provides access to KV store operations', () => {
        expect(agent.kv).toBeDefined()
      })

      it('sets and gets string values', async () => {
        await agent.kv.set('key', 'value')
        const result = await agent.kv.get('key')
        expect(result).toBe('value')
      })

      it('sets and gets object values', async () => {
        const obj = { name: 'Alice', age: 30 }
        await agent.kv.set('user', obj)
        const result = await agent.kv.get('user')
        expect(result).toEqual(obj)
      })

      it('deletes keys', async () => {
        await agent.kv.set('toDelete', 'value')
        const deleted = await agent.kv.delete('toDelete')
        expect(deleted).toBe(true)
        expect(await agent.kv.has('toDelete')).toBe(false)
      })

      it('checks key existence', async () => {
        await agent.kv.set('exists', 'value')
        expect(await agent.kv.has('exists')).toBe(true)
        expect(await agent.kv.has('nonexistent')).toBe(false)
      })

      it('lists keys with prefix', async () => {
        await agent.kv.set('user:1', 'Alice')
        await agent.kv.set('user:2', 'Bob')
        await agent.kv.set('session:abc', 'token')

        const userKeys = await agent.kv.keys('user:')
        expect(userKeys).toContain('user:1')
        expect(userKeys).toContain('user:2')
        expect(userKeys).not.toContain('session:abc')
      })
    })

    describe('agent.audit - Tool call auditing', () => {
      it('provides access to audit log operations', () => {
        expect(agent.audit).toBeDefined()
      })

      it('records tool calls', async () => {
        const id = await agent.audit.record(
          'read_file',
          { path: '/test.txt' },
          { content: 'hello', success: true }
        )

        expect(id).toBeDefined()
        expect(typeof id).toBe('string')
      })

      it('retrieves recorded entries', async () => {
        const id = await agent.audit.record(
          'write_file',
          { path: '/output.txt', content: 'data' },
          { success: true }
        )

        const entry = await agent.audit.findById(id)
        expect(entry).not.toBeNull()
        expect(entry?.tool).toBe('write_file')
        expect(entry?.inputs).toEqual({ path: '/output.txt', content: 'data' })
        expect(entry?.outputs).toEqual({ success: true })
      })

      it('lists all audit entries', async () => {
        await agent.audit.record('tool1', {}, {})
        await agent.audit.record('tool2', {}, {})
        await agent.audit.record('tool3', {}, {})

        const entries = await agent.audit.list()
        expect(entries).toHaveLength(3)
      })

      it('counts audit entries', async () => {
        await agent.audit.record('tool1', {}, {})
        await agent.audit.record('tool2', {}, {})

        const count = await agent.audit.count()
        expect(count).toBe(2)
      })
    })
  })

  // ==========================================================================
  // TOOL EXECUTION WITH AUDITING TESTS (RED PHASE - will fail)
  // ==========================================================================

  describe('Tool Execution with Auditing (RED PHASE - will fail)', () => {
    describe('Automatic audit recording', () => {
      it('automatically records filesystem operations', async () => {
        await agent.fs.writeFile('/auto-audit.txt', 'content')

        const entries = await agent.audit.list()
        const writeEntry = entries.find((e) => e.tool === 'fs.writeFile')
        expect(writeEntry).toBeDefined()
        expect(writeEntry?.inputs).toEqual({ path: '/auto-audit.txt', content: 'content' })
      })

      it('automatically records glob operations', async () => {
        await agent.fs.writeFile('/src/index.ts', 'export {}')
        await agent.glob('/src/*.ts')

        const entries = await agent.audit.list()
        const globEntry = entries.find((e) => e.tool === 'glob')
        expect(globEntry).toBeDefined()
        expect(globEntry?.inputs).toHaveProperty('pattern', '/src/*.ts')
      })

      it('automatically records grep operations', async () => {
        await agent.fs.writeFile('/test.txt', 'hello world')
        await agent.grep('hello')

        const entries = await agent.audit.list()
        const grepEntry = entries.find((e) => e.tool === 'grep')
        expect(grepEntry).toBeDefined()
        expect(grepEntry?.inputs).toHaveProperty('pattern', 'hello')
      })

      it('automatically records KV operations', async () => {
        await agent.kv.set('key', 'value')

        const entries = await agent.audit.list()
        const kvEntry = entries.find((e) => e.tool === 'kv.set')
        expect(kvEntry).toBeDefined()
        expect(kvEntry?.inputs).toEqual({ key: 'key', value: 'value' })
      })

      it('records outputs for successful operations', async () => {
        await agent.fs.writeFile('/success.txt', 'content')

        const entries = await agent.audit.list()
        const writeEntry = entries.find((e) => e.tool === 'fs.writeFile')
        expect(writeEntry).toBeDefined()
        expect(writeEntry?.outputs).toEqual({ success: true })
      })
    })

    describe('Duration tracking', () => {
      it('tracks duration for each operation', async () => {
        await agent.fs.writeFile('/timed.txt', 'content')

        const entries = await agent.audit.list()
        const entry = entries.find((e) => e.tool === 'fs.writeFile')
        expect(entry?.durationMs).toBeDefined()
        expect(typeof entry?.durationMs).toBe('number')
        expect(entry?.durationMs).toBeGreaterThanOrEqual(0)
      })

      it('records duration even when operation fails', async () => {
        try {
          await agent.fs.readFile('/nonexistent-for-timing.txt')
        } catch {
          // Expected to fail
        }

        const entries = await agent.audit.list()
        const entry = entries.find((e) => (e.inputs as Record<string, unknown>)?.path === '/nonexistent-for-timing.txt')
        expect(entry?.durationMs).toBeDefined()
      })
    })

    describe('Error recording', () => {
      it('records errors with stack trace', async () => {
        try {
          await agent.fs.readFile('/nonexistent-file.txt')
        } catch {
          // Expected to fail
        }

        const entries = await agent.audit.list()
        const errorEntry = entries.find((e) => (e.inputs as Record<string, unknown>)?.path === '/nonexistent-file.txt')
        expect(errorEntry).toBeDefined()
        expect((errorEntry?.outputs as Record<string, unknown>)?.success).toBe(false)
        expect((errorEntry?.outputs as Record<string, unknown>)?.error).toBeDefined()
      })

      it('error output includes error message', async () => {
        try {
          await agent.fs.readFile('/no-such-file.txt')
        } catch {
          // Expected
        }

        const entries = await agent.audit.list()
        const errorEntry = entries.find((e) => (e.inputs as Record<string, unknown>)?.path === '/no-such-file.txt')
        const errorOutput = (errorEntry?.outputs as Record<string, unknown>)?.error as Record<string, unknown>
        expect(errorOutput?.message).toBeDefined()
        expect(typeof errorOutput?.message).toBe('string')
      })

      it('error output includes stack trace', async () => {
        try {
          await agent.fs.readFile('/missing-for-stack.txt')
        } catch {
          // Expected
        }

        const entries = await agent.audit.list()
        const errorEntry = entries.find((e) => (e.inputs as Record<string, unknown>)?.path === '/missing-for-stack.txt')
        const errorOutput = (errorEntry?.outputs as Record<string, unknown>)?.error as Record<string, unknown>
        expect(errorOutput?.stack).toBeDefined()
        expect(typeof errorOutput?.stack).toBe('string')
      })
    })
  })

  // ==========================================================================
  // WEBSOCKET INTEGRATION TESTS (RED PHASE - will fail)
  // ==========================================================================

  describe('WebSocket Integration (RED PHASE - will fail)', () => {
    let mockWs: WebSocketConnection

    beforeEach(() => {
      mockWs = createMockWebSocket()
    })

    describe('onConnect handler', () => {
      it('has onConnect method', () => {
        expect(typeof agent.onConnect).toBe('function')
      })

      it('accepts websocket connection', async () => {
        await agent.onConnect(mockWs, new Request('https://example.com'))
        expect(mockWs.accept).toHaveBeenCalled()
      })

      it('sends welcome message on connect', async () => {
        await agent.onConnect(mockWs, new Request('https://example.com'))
        expect(mockWs.send).toHaveBeenCalled()
        const sentMessage = JSON.parse((mockWs.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
        expect(sentMessage.type).toBe('connected')
      })

      it('sets up message handler', async () => {
        await agent.onConnect(mockWs, new Request('https://example.com'))
        expect(mockWs.addEventListener).toHaveBeenCalledWith('message', expect.any(Function))
      })

      it('sets up close handler', async () => {
        await agent.onConnect(mockWs, new Request('https://example.com'))
        expect(mockWs.addEventListener).toHaveBeenCalledWith('close', expect.any(Function))
      })

      it('records connection in audit log', async () => {
        await agent.onConnect(mockWs, new Request('https://example.com'))

        const entries = await agent.audit.list()
        const connectEntry = entries.find((e) => e.tool === 'websocket.connect')
        expect(connectEntry).toBeDefined()
      })
    })

    describe('onMessage handler for tool calls', () => {
      it('has onMessage method', () => {
        expect(typeof agent.onMessage).toBe('function')
      })

      it('handles fs.readFile tool call', async () => {
        await agent.fs.writeFile('/ws-read.txt', 'websocket content')

        const message: WebSocketMessage = {
          type: 'tool_call',
          id: 'call-1',
          tool: 'fs.readFile',
          inputs: { path: '/ws-read.txt' },
        }

        await agent.onConnect(mockWs, new Request('https://example.com'))
        await agent.onMessage(mockWs, message)

        // Should send response back via websocket
        const calls = (mockWs.send as ReturnType<typeof vi.fn>).mock.calls
        const responseCall = calls.find((call) => {
          const msg = JSON.parse(call[0])
          return msg.type === 'tool_result' && msg.id === 'call-1'
        })
        expect(responseCall).toBeDefined()

        const response = JSON.parse(responseCall![0])
        expect(response.result.content).toBe('websocket content')
      })

      it('handles fs.writeFile tool call', async () => {
        const message: WebSocketMessage = {
          type: 'tool_call',
          id: 'call-2',
          tool: 'fs.writeFile',
          inputs: { path: '/ws-write.txt', content: 'written via ws' },
        }

        await agent.onConnect(mockWs, new Request('https://example.com'))
        await agent.onMessage(mockWs, message)

        // Verify file was written
        const content = await agent.fs.readFile('/ws-write.txt')
        expect(content).toBe('written via ws')
      })

      it('handles glob tool call', async () => {
        await agent.fs.writeFile('/src/index.ts', 'export {}')
        await agent.fs.writeFile('/src/app.ts', 'export {}')

        const message: WebSocketMessage = {
          type: 'tool_call',
          id: 'call-3',
          tool: 'glob',
          inputs: { pattern: '/src/*.ts' },
        }

        await agent.onConnect(mockWs, new Request('https://example.com'))
        await agent.onMessage(mockWs, message)

        const calls = (mockWs.send as ReturnType<typeof vi.fn>).mock.calls
        const responseCall = calls.find((call) => {
          const msg = JSON.parse(call[0])
          return msg.type === 'tool_result' && msg.id === 'call-3'
        })

        const response = JSON.parse(responseCall![0])
        expect(response.result.files).toContain('/src/index.ts')
        expect(response.result.files).toContain('/src/app.ts')
      })

      it('handles grep tool call', async () => {
        await agent.fs.writeFile('/search.txt', 'find this pattern')

        const message: WebSocketMessage = {
          type: 'tool_call',
          id: 'call-4',
          tool: 'grep',
          inputs: { pattern: 'pattern' },
        }

        await agent.onConnect(mockWs, new Request('https://example.com'))
        await agent.onMessage(mockWs, message)

        const calls = (mockWs.send as ReturnType<typeof vi.fn>).mock.calls
        const responseCall = calls.find((call) => {
          const msg = JSON.parse(call[0])
          return msg.type === 'tool_result' && msg.id === 'call-4'
        })

        const response = JSON.parse(responseCall![0])
        expect(response.result.matches).toHaveLength(1)
      })

      it('handles kv.set tool call', async () => {
        const message: WebSocketMessage = {
          type: 'tool_call',
          id: 'call-5',
          tool: 'kv.set',
          inputs: { key: 'ws-key', value: 'ws-value' },
        }

        await agent.onConnect(mockWs, new Request('https://example.com'))
        await agent.onMessage(mockWs, message)

        // Verify value was set
        const value = await agent.kv.get('ws-key')
        expect(value).toBe('ws-value')
      })

      it('handles kv.get tool call', async () => {
        await agent.kv.set('existing-key', 'existing-value')

        const message: WebSocketMessage = {
          type: 'tool_call',
          id: 'call-6',
          tool: 'kv.get',
          inputs: { key: 'existing-key' },
        }

        await agent.onConnect(mockWs, new Request('https://example.com'))
        await agent.onMessage(mockWs, message)

        const calls = (mockWs.send as ReturnType<typeof vi.fn>).mock.calls
        const responseCall = calls.find((call) => {
          const msg = JSON.parse(call[0])
          return msg.type === 'tool_result' && msg.id === 'call-6'
        })

        const response = JSON.parse(responseCall![0])
        expect(response.result.value).toBe('existing-value')
      })

      it('sends error response for invalid tool', async () => {
        const message: WebSocketMessage = {
          type: 'tool_call',
          id: 'call-err',
          tool: 'invalid.tool',
          inputs: {},
        }

        await agent.onConnect(mockWs, new Request('https://example.com'))
        await agent.onMessage(mockWs, message)

        const calls = (mockWs.send as ReturnType<typeof vi.fn>).mock.calls
        const responseCall = calls.find((call) => {
          const msg = JSON.parse(call[0])
          return msg.type === 'tool_error' && msg.id === 'call-err'
        })
        expect(responseCall).toBeDefined()

        const response = JSON.parse(responseCall![0])
        expect(response.error).toBeDefined()
      })

      it('records tool calls made via websocket', async () => {
        const message: WebSocketMessage = {
          type: 'tool_call',
          id: 'call-audit',
          tool: 'kv.set',
          inputs: { key: 'audited-key', value: 'audited-value' },
        }

        await agent.onConnect(mockWs, new Request('https://example.com'))
        await agent.onMessage(mockWs, message)

        const entries = await agent.audit.list()
        const kvEntry = entries.find(
          (e) => e.tool === 'kv.set' && (e.inputs as Record<string, unknown>)?.key === 'audited-key'
        )
        expect(kvEntry).toBeDefined()
      })
    })

    describe('Streaming responses', () => {
      it('supports streaming for long operations', async () => {
        // Write multiple files to create work
        for (let i = 0; i < 10; i++) {
          await agent.fs.writeFile(`/stream/file${i}.ts`, `content ${i}`)
        }

        const message: WebSocketMessage = {
          type: 'tool_call',
          id: 'stream-call',
          tool: 'glob',
          inputs: { pattern: '/stream/*.ts' },
          stream: true,
        }

        await agent.onConnect(mockWs, new Request('https://example.com'))
        await agent.onMessage(mockWs, message)

        // Should receive progress updates or final result
        const calls = (mockWs.send as ReturnType<typeof vi.fn>).mock.calls
        const resultMessage = calls.find((call) => {
          const msg = JSON.parse(call[0])
          return msg.type === 'tool_result' && msg.id === 'stream-call'
        })
        expect(resultMessage).toBeDefined()
      })

      it('sends partial results for grep with many matches', async () => {
        // Create files with many matches
        for (let i = 0; i < 50; i++) {
          await agent.fs.writeFile(`/grep-stream/file${i}.txt`, 'findme pattern here')
        }

        const message: WebSocketMessage = {
          type: 'tool_call',
          id: 'grep-stream',
          tool: 'grep',
          inputs: { pattern: 'findme' },
          stream: true,
        }

        await agent.onConnect(mockWs, new Request('https://example.com'))
        await agent.onMessage(mockWs, message)

        // Should receive at least one message
        const calls = (mockWs.send as ReturnType<typeof vi.fn>).mock.calls
        const grepMessages = calls.filter((call) => {
          const msg = JSON.parse(call[0])
          return msg.id === 'grep-stream'
        })

        expect(grepMessages.length).toBeGreaterThanOrEqual(1)
      })
    })

    describe('Connection lifecycle', () => {
      it('handles disconnect gracefully', async () => {
        await agent.onConnect(mockWs, new Request('https://example.com'))

        // Simulate disconnect
        const closeHandler = (mockWs.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
          (call) => call[0] === 'close'
        )?.[1]

        expect(closeHandler).toBeDefined()

        // Should not throw
        await closeHandler({ code: 1000, reason: 'Normal closure' })
      })

      it('records disconnect in audit log', async () => {
        await agent.onConnect(mockWs, new Request('https://example.com'))

        // Simulate disconnect
        const closeHandler = (mockWs.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
          (call) => call[0] === 'close'
        )?.[1]

        await closeHandler({ code: 1000, reason: 'Normal closure' })

        const entries = await agent.audit.list()
        const disconnectEntry = entries.find((e) => e.tool === 'websocket.disconnect')
        expect(disconnectEntry).toBeDefined()
      })
    })
  })

  // ==========================================================================
  // EDGE CASES AND ERROR HANDLING
  // ==========================================================================

  describe('Edge Cases and Error Handling', () => {
    it('handles concurrent operations', async () => {
      const operations = Array.from({ length: 20 }, (_, i) =>
        agent.fs.writeFile(`/concurrent/${i}.txt`, `content ${i}`)
      )

      await Promise.all(operations)

      const files = await agent.glob('/concurrent/*.txt')
      expect(files).toHaveLength(20)
    })

    // RED PHASE: This test will fail until automatic auditing is implemented
    it('maintains audit log integrity during errors (RED PHASE)', async () => {
      const beforeCount = await agent.audit.count()

      try {
        await agent.fs.readFile('/guaranteed-missing.txt')
      } catch {
        // Expected
      }

      const afterCount = await agent.audit.count()
      // With automatic auditing, this should increase by 1
      expect(afterCount).toBe(beforeCount + 1)
    })

    // RED PHASE: This test will fail until WebSocket is implemented
    it('handles malformed websocket messages (RED PHASE)', async () => {
      const mockWs = createMockWebSocket()
      await agent.onConnect(mockWs, new Request('https://example.com'))

      // Send malformed message (missing required fields)
      const malformedMessage = { type: 'tool_call' } as WebSocketMessage

      // Should not throw, but should send error response
      await agent.onMessage(mockWs, malformedMessage)

      const calls = (mockWs.send as ReturnType<typeof vi.fn>).mock.calls
      const errorResponse = calls.find((call) => {
        const msg = JSON.parse(call[0])
        return msg.type === 'error'
      })
      expect(errorResponse).toBeDefined()
    })

    // RED PHASE: This test will fail until WebSocket is implemented
    it('handles rapid websocket messages (RED PHASE)', async () => {
      const mockWs = createMockWebSocket()
      await agent.onConnect(mockWs, new Request('https://example.com'))

      const messages: WebSocketMessage[] = Array.from({ length: 50 }, (_, i) => ({
        type: 'tool_call',
        id: `rapid-${i}`,
        tool: 'kv.set',
        inputs: { key: `rapid-key-${i}`, value: `rapid-value-${i}` },
      }))

      // Send all messages concurrently
      await Promise.all(messages.map((msg) => agent.onMessage(mockWs, msg)))

      // All should be processed
      for (let i = 0; i < 50; i++) {
        const value = await agent.kv.get(`rapid-key-${i}`)
        expect(value).toBe(`rapid-value-${i}`)
      }
    })
  })
})
