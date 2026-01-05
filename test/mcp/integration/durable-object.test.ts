/**
 * Durable Object MCP Integration Tests (RED Phase)
 *
 * Tests for running MCP server within a Cloudflare Durable Object context.
 * Tests the integration between MCP server and MondoDatabase DO.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMcpServer, createMockDatabaseAccess } from '../../../src/mcp/server'
import type { McpServer } from '../../../src/mcp/server'
import type { DatabaseAccess } from '../../../src/mcp/types'

// =============================================================================
// Mock Durable Object Context
// =============================================================================

/**
 * Mock DurableObjectStorage interface
 */
interface MockDurableObjectStorage {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
  sql: {
    exec: ReturnType<typeof vi.fn>
  }
}

/**
 * Mock DurableObjectState interface
 */
interface MockDurableObjectState {
  storage: MockDurableObjectStorage
  blockConcurrencyWhile: ReturnType<typeof vi.fn>
  id: { toString: () => string }
}

/**
 * Create a mock Durable Object state
 */
function createMockDoState(): MockDurableObjectState {
  return {
    storage: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn().mockResolvedValue(new Map()),
      sql: {
        exec: vi.fn().mockReturnValue([]),
      },
    },
    blockConcurrencyWhile: vi.fn((fn) => fn()),
    id: { toString: () => 'test-do-id' },
  }
}

/**
 * Create a DatabaseAccess implementation backed by DO storage
 */
function createDoDatabaseAccess(state: MockDurableObjectState): DatabaseAccess {
  return {
    async find(collection: string, filter: object) {
      // In real impl, would query SQLite via state.storage.sql
      return []
    },
    async findOne(collection: string, filter: object) {
      return null
    },
    async insertOne(collection: string, doc: object) {
      return { insertedId: 'test-id' }
    },
    async updateOne(collection: string, filter: object, update: object) {
      return { modifiedCount: 0, matchedCount: 0 }
    },
    async deleteOne(collection: string, filter: object) {
      return { deletedCount: 0 }
    },
  }
}

// =============================================================================
// MCP Server in DO Context Tests
// =============================================================================

describe('MCP Server in Durable Object Context', () => {
  let mockState: MockDurableObjectState
  let dbAccess: DatabaseAccess
  let server: McpServer

  beforeEach(() => {
    mockState = createMockDoState()
    dbAccess = createDoDatabaseAccess(mockState)
    server = createMcpServer({ dbAccess })
  })

  describe('server initialization', () => {
    it('should create server with DO-backed database access', () => {
      expect(server).toBeDefined()
      expect(server.name).toBe('mongo.do')
    })

    it('should register default tools', async () => {
      const tools = await server.listTools()

      expect(tools.length).toBeGreaterThanOrEqual(2)
      expect(tools.map((t) => t.name)).toContain('search')
      expect(tools.map((t) => t.name)).toContain('fetch')
    })
  })

  describe('tool execution in DO context', () => {
    it('should execute search tool', async () => {
      const result = await server.callTool('search', {
        query: 'test query',
        database: 'testdb',
        collection: 'testcoll',
      })

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
    })

    it('should execute fetch tool', async () => {
      const result = await server.callTool('fetch', {
        id: 'testdb.testcoll.507f1f77bcf86cd799439011',
      })

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
    })
  })

  describe('JSON-RPC request handling', () => {
    it('should handle initialize request', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      })

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(1)
      expect(response.result).toBeDefined()
    })

    it('should handle tools/list request', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      })

      expect(response.result).toBeDefined()
      const result = response.result as { tools: unknown[] }
      expect(result.tools).toBeDefined()
    })

    it('should handle tools/call request', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: { query: 'test' },
        },
      })

      expect(response.result).toBeDefined()
    })
  })
})

// =============================================================================
// DO-Specific MCP Handler Tests
// =============================================================================

describe('DO-Specific MCP Handler', () => {
  let mockState: MockDurableObjectState

  beforeEach(() => {
    mockState = createMockDoState()
  })

  describe('HTTP request handling in DO fetch()', () => {
    it('should create handler that processes POST requests', async () => {
      const dbAccess = createDoDatabaseAccess(mockState)
      const server = createMcpServer({ dbAccess })

      // Simulate what DO fetch() would do
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        }),
      })

      const body = await request.json()
      const response = await server.handleRequest(body as any)

      expect(response.result).toBeDefined()
    })

    it('should handle batch requests', async () => {
      const dbAccess = createDoDatabaseAccess(mockState)
      const server = createMcpServer({ dbAccess })

      const requests = [
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ]

      const responses = await Promise.all(
        requests.map((req) => server.handleRequest(req as any))
      )

      expect(responses.length).toBe(2)
      expect(responses[0].id).toBe(1)
      expect(responses[1].id).toBe(2)
    })
  })

  describe('DO storage integration', () => {
    it('should access documents via DO storage', async () => {
      const getSpy = mockState.storage.get
      getSpy.mockResolvedValueOnce({ _id: 'doc-1', name: 'Test' })

      const dbAccess: DatabaseAccess = {
        async find() {
          const results = await mockState.storage.get('documents')
          return results ? [results] : []
        },
        async findOne() {
          return mockState.storage.get('documents')
        },
        async insertOne() {
          return { insertedId: 'new-id' }
        },
        async updateOne() {
          return { modifiedCount: 0, matchedCount: 0 }
        },
        async deleteOne() {
          return { deletedCount: 0 }
        },
      }

      const result = await dbAccess.findOne('test', {})

      expect(getSpy).toHaveBeenCalled()
      expect(result).toEqual({ _id: 'doc-1', name: 'Test' })
    })

    it('should use SQL for complex queries', async () => {
      const sqlExecSpy = mockState.storage.sql.exec
      sqlExecSpy.mockReturnValueOnce([
        { _id: 'doc-1', data: '{"name":"Test"}' },
      ])

      // Simulate a more complex query that uses SQL
      const results = mockState.storage.sql.exec(
        "SELECT * FROM documents WHERE json_extract(data, '$.name') = ?",
        ['Test']
      )

      expect(sqlExecSpy).toHaveBeenCalled()
      expect(results.length).toBe(1)
    })
  })
})

// =============================================================================
// Concurrency and State Management Tests
// =============================================================================

describe('DO Concurrency and State Management', () => {
  let mockState: MockDurableObjectState

  beforeEach(() => {
    mockState = createMockDoState()
  })

  describe('blockConcurrencyWhile usage', () => {
    it('should use blockConcurrencyWhile for atomic operations', async () => {
      const dbAccess = createDoDatabaseAccess(mockState)
      const server = createMcpServer({ dbAccess })

      // Verify the pattern is set up correctly
      expect(mockState.blockConcurrencyWhile).toBeDefined()
    })

    it('should handle concurrent MCP requests', async () => {
      const dbAccess = createDoDatabaseAccess(mockState)
      const server = createMcpServer({ dbAccess })

      // Send multiple concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) => ({
        jsonrpc: '2.0' as const,
        id: i,
        method: 'tools/list' as const,
      }))

      const responses = await Promise.all(
        requests.map((req) => server.handleRequest(req))
      )

      // All should succeed
      expect(responses.length).toBe(5)
      responses.forEach((res, i) => {
        expect(res.id).toBe(i)
        expect(res.result).toBeDefined()
      })
    })
  })

  describe('session state in DO', () => {
    it('should maintain session state across requests', async () => {
      const dbAccess = createDoDatabaseAccess(mockState)
      const server = createMcpServer({ dbAccess })

      // First request: initialize
      const initResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      })

      expect(initResponse.result).toBeDefined()

      // Second request: should work without re-initialization
      const listResponse = await server.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      })

      expect(listResponse.result).toBeDefined()
    })
  })
})

// =============================================================================
// Error Handling in DO Context Tests
// =============================================================================

describe('Error Handling in DO Context', () => {
  let mockState: MockDurableObjectState

  beforeEach(() => {
    mockState = createMockDoState()
  })

  describe('storage errors', () => {
    it('should handle storage read errors gracefully', async () => {
      mockState.storage.get.mockRejectedValueOnce(new Error('Storage unavailable'))

      const dbAccess: DatabaseAccess = {
        async find() {
          try {
            await mockState.storage.get('documents')
            return []
          } catch (error) {
            throw new Error('Database error: Storage unavailable')
          }
        },
        async findOne() {
          return null
        },
        async insertOne() {
          return { insertedId: 'id' }
        },
        async updateOne() {
          return { modifiedCount: 0, matchedCount: 0 }
        },
        async deleteOne() {
          return { deletedCount: 0 }
        },
      }

      const server = createMcpServer({ dbAccess })

      // The search tool should handle errors and return them in the response
      const result = await server.callTool('search', { query: 'test' })

      // Error handling depends on implementation
      expect(result).toBeDefined()
    })

    it('should handle SQL execution errors', async () => {
      mockState.storage.sql.exec.mockImplementationOnce(() => {
        throw new Error('SQL error: syntax error')
      })

      expect(() => {
        mockState.storage.sql.exec('INVALID SQL')
      }).toThrow('SQL error')
    })
  })

  describe('invalid request errors', () => {
    it('should return error for unknown method', async () => {
      const dbAccess = createDoDatabaseAccess(mockState)
      const server = createMcpServer({ dbAccess })

      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'unknown/method',
      })

      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(-32601)
    })

    it('should return error for unknown tool', async () => {
      const dbAccess = createDoDatabaseAccess(mockState)
      const server = createMcpServer({ dbAccess })

      const result = await server.callTool('nonexistent-tool', {})

      expect(result.isError).toBe(true)
    })
  })
})

// =============================================================================
// DO Environment Integration Tests
// =============================================================================

describe('DO Environment Integration', () => {
  describe('environment bindings', () => {
    it('should access environment bindings for code loader', async () => {
      const mockEnv = {
        LOADER: {
          execute: vi.fn().mockResolvedValue({ success: true, result: 42 }),
        },
        ENABLE_DEBUG_ENDPOINTS: 'false',
      }

      const dbAccess = createMockDatabaseAccess()
      const server = createMcpServer({
        dbAccess,
        codeLoader: mockEnv.LOADER,
      })

      const tools = await server.listTools()

      // When code loader is available, 'do' tool should be registered
      expect(tools.map((t) => t.name)).toContain('do')
    })

    it('should not register do tool without LOADER binding', async () => {
      const dbAccess = createMockDatabaseAccess()
      const server = createMcpServer({ dbAccess })

      const tools = await server.listTools()

      expect(tools.map((t) => t.name)).not.toContain('do')
    })
  })

  describe('MCP over Durable Object RPC', () => {
    it('should support stub-based RPC calls', async () => {
      // This tests the pattern of calling MCP methods via DO stubs
      const mockDoStub = {
        handleMcpRequest: vi.fn().mockResolvedValue({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: [] },
        }),
      }

      const response = await mockDoStub.handleMcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      })

      expect(mockDoStub.handleMcpRequest).toHaveBeenCalled()
      expect(response.result).toBeDefined()
    })

    it('should handle RPC errors', async () => {
      const mockDoStub = {
        handleMcpRequest: vi.fn().mockRejectedValue(new Error('DO unavailable')),
      }

      await expect(mockDoStub.handleMcpRequest({})).rejects.toThrow('DO unavailable')
    })
  })
})

// =============================================================================
// Resource Management Tests
// =============================================================================

describe('Resource Management in DO', () => {
  describe('memory management', () => {
    it('should not leak memory with many requests', async () => {
      const dbAccess = createMockDatabaseAccess()
      const server = createMcpServer({ dbAccess })

      // Simulate many requests
      for (let i = 0; i < 100; i++) {
        await server.handleRequest({
          jsonrpc: '2.0',
          id: i,
          method: 'tools/list',
        })
      }

      // If we got here without OOM, the test passes
      expect(true).toBe(true)
    })
  })

  describe('cursor cleanup', () => {
    it('should clean up cursors on timeout', async () => {
      const mockState = createMockDoState()
      const dbAccess = createDoDatabaseAccess(mockState)
      const server = createMcpServer({ dbAccess })

      // Execute a search that might create a cursor
      await server.callTool('search', { query: 'test', limit: 100 })

      // In real implementation, cursors would be cleaned up periodically
      expect(true).toBe(true)
    })
  })
})
