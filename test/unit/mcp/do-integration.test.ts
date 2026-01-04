/**
 * MondoDatabase Durable Object MCP Integration Tests
 *
 * Tests for integrating MCP server into the MondoDatabase Durable Object:
 * - Route mounting: /mcp requests go to MCP handler
 * - tools/list returns available tools (search, fetch, do)
 * - Tool execution works correctly
 * - SSE streaming for responses
 * - Error handling for invalid requests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMcpServer, type McpServer } from '../../../src/mcp/server'
import { createHttpMcpHandler } from '../../../src/mcp/transport/http'
import type { DatabaseAccess, McpRequest, McpResponse, McpToolDefinition } from '../../../src/mcp/types'
import type { CodeLoader } from '../../../src/mcp/server'

// =============================================================================
// Mock Types
// =============================================================================

interface MockDurableObjectStorage {
  sql: {
    exec: ReturnType<typeof vi.fn>
  }
  transactionSync: <T>(callback: () => T) => T
}

interface MockDurableObjectState {
  storage: MockDurableObjectStorage
  blockConcurrencyWhile: <T>(callback: () => Promise<T>) => void
}

interface MockEnv {
  LOADER?: {
    execute: (code: string, context?: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>
  }
  ENABLE_DEBUG_ENDPOINTS?: string
}

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockDatabaseAccess(data: Record<string, unknown>[] = []): DatabaseAccess {
  return {
    find: vi.fn().mockResolvedValue(data),
    findOne: vi.fn().mockResolvedValue(data[0] ?? null),
    insertOne: vi.fn().mockResolvedValue({ insertedId: 'test-id' }),
    insertMany: vi.fn().mockResolvedValue({ insertedIds: ['test-id-1', 'test-id-2'] }),
    updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    updateMany: vi.fn().mockResolvedValue({ matchedCount: 2, modifiedCount: 2 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 2 }),
    aggregate: vi.fn().mockResolvedValue(data),
    countDocuments: vi.fn().mockResolvedValue(data.length),
    listCollections: vi.fn().mockResolvedValue(['users', 'products']),
    listDatabases: vi.fn().mockResolvedValue(['test', 'production']),
  }
}

function createMockCodeLoader(): CodeLoader {
  return {
    execute: vi.fn().mockResolvedValue({ success: true, result: 42 }),
  }
}

/**
 * Simulate a MondoDatabase DO with MCP routing
 *
 * This represents the target integration where:
 * - /mcp routes go to the MCP HTTP handler
 * - All other routes work as before
 */
function createMcpRouteHandler(
  dbAccess: DatabaseAccess,
  options: { codeLoader?: CodeLoader } = {}
): (request: Request) => Promise<Response> {
  // Create the MCP server with database access
  const mcpServer = createMcpServer({
    dbAccess,
    codeLoader: options.codeLoader,
    name: 'mondodb-do',
    version: '1.0.0',
  })

  // Create the HTTP handler for MCP
  const mcpHandler = createHttpMcpHandler(mcpServer)

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const path = url.pathname

    // Route /mcp requests to the MCP handler
    if (path === '/mcp' || path.startsWith('/mcp/')) {
      return mcpHandler(request)
    }

    // Simulate existing routes (for non-interference test)
    if (path === '/find') {
      return new Response(JSON.stringify({ documents: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// =============================================================================
// Route Mounting Tests
// =============================================================================

describe('MondoDatabase MCP routes', () => {
  let dbAccess: DatabaseAccess
  let handler: (request: Request) => Promise<Response>

  beforeEach(() => {
    dbAccess = createMockDatabaseAccess()
    handler = createMcpRouteHandler(dbAccess)
  })

  it('should route /mcp GET requests to SSE handler', async () => {
    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      })
    )

    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.status).toBe(200)
  })

  it('should route /mcp POST requests to JSON-RPC handler', async () => {
    const response = await handler(
      new Request('http://internal/mcp', {
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
    )

    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.status).toBe(200)

    const body = (await response.json()) as McpResponse
    expect(body.jsonrpc).toBe('2.0')
    expect(body.result).toBeDefined()
  })

  it('should handle /mcp/tools/list via POST', async () => {
    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      })
    )

    const body = (await response.json()) as McpResponse
    expect(body.result).toBeDefined()
    const result = body.result as { tools: McpToolDefinition[] }
    expect(result.tools).toContainEqual(expect.objectContaining({ name: 'search' }))
    expect(result.tools).toContainEqual(expect.objectContaining({ name: 'fetch' }))
  })

  it('should not affect existing routes', async () => {
    const response = await handler(
      new Request('http://internal/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: 'test', filter: {} }),
      })
    )

    expect(response.ok).toBe(true)
    const body = (await response.json()) as { documents: unknown[] }
    expect(body.documents).toBeDefined()
  })

  it('should return 404 for unknown routes', async () => {
    const response = await handler(
      new Request('http://internal/unknown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    )

    expect(response.status).toBe(404)
  })
})

// =============================================================================
// MCP Server Lifecycle Tests
// =============================================================================

describe('MCP server lifecycle', () => {
  it('should create MCP server with database access', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    // Initialize the MCP session
    const initResponse = await handler(
      new Request('http://internal/mcp', {
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
    )

    const body = (await initResponse.json()) as McpResponse
    const result = body.result as { serverInfo: { name: string; version: string } }
    expect(result.serverInfo.name).toBe('mondodb-do')
    expect(result.serverInfo.version).toBe('1.0.0')
  })

  it('should reuse MCP server across requests', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    // First request
    const response1 = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      })
    )
    expect(response1.ok).toBe(true)

    // Second request should also succeed
    const response2 = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        }),
      })
    )
    expect(response2.ok).toBe(true)
  })
})

// =============================================================================
// Tool Execution Tests
// =============================================================================

describe('MCP tool execution', () => {
  it('should execute search tool', async () => {
    const testData = [{ _id: 'doc1', name: 'Alice', email: 'alice@example.com' }]
    const dbAccess = createMockDatabaseAccess(testData)
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: { query: 'Alice', collection: 'users' },
          },
        }),
      })
    )

    const body = (await response.json()) as McpResponse
    expect(body.result).toBeDefined()
    // Search tool returns content array
    const result = body.result as { content: Array<{ type: string; text: string }> }
    expect(result.content).toBeDefined()
    expect(Array.isArray(result.content)).toBe(true)
  })

  it('should execute fetch tool', async () => {
    const dbAccess = createMockDatabaseAccess([{ _id: 'doc1', name: 'Alice' }])
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'fetch',
            arguments: { id: 'test.users.doc1' },
          },
        }),
      })
    )

    const body = (await response.json()) as McpResponse
    expect(body.result).toBeDefined()
  })

  it('should execute do tool when codeLoader is available', async () => {
    const dbAccess = createMockDatabaseAccess()
    const codeLoader = createMockCodeLoader()
    const handler = createMcpRouteHandler(dbAccess, { codeLoader })

    // First verify the do tool is available
    const listResponse = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      })
    )

    const listBody = (await listResponse.json()) as McpResponse
    const listResult = listBody.result as { tools: McpToolDefinition[] }
    expect(listResult.tools).toContainEqual(expect.objectContaining({ name: 'do' }))

    // Now execute the do tool
    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'do',
            arguments: { code: 'return 42' },
          },
        }),
      })
    )

    const body = (await response.json()) as McpResponse
    expect(body.result).toBeDefined()
    const result = body.result as { content: Array<{ text: string }> }
    const parsed = JSON.parse(result.content[0].text)
    expect(parsed.success).toBe(true)
    expect(parsed.result).toBe(42)
  })

  it('should not have do tool when codeLoader is not available', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess) // No codeLoader

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      })
    )

    const body = (await response.json()) as McpResponse
    const result = body.result as { tools: McpToolDefinition[] }
    const doTool = result.tools.find((t) => t.name === 'do')
    expect(doTool).toBeUndefined()
  })
})

// =============================================================================
// SSE Streaming Tests
// =============================================================================

describe('SSE streaming', () => {
  it('should establish SSE connection', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
  })

  it('should return mcp-session-id header', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      })
    )

    const sessionId = response.headers.get('mcp-session-id')
    expect(sessionId).toBeDefined()
    expect(sessionId).toBeTruthy()
  })

  it('should reject GET without Accept: text/event-stream', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'GET',
        // No Accept header
      })
    )

    expect(response.status).toBe(400)
  })

  it('should send connection event on stream start', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      })
    )

    // Read from the stream
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()

    const { value } = await reader!.read()
    const text = new TextDecoder().decode(value)

    // Should contain endpoint event with connection info
    expect(text).toContain('event: endpoint')
    expect(text).toContain('connection')
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error handling', () => {
  it('should return error for invalid JSON', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      })
    )

    const body = (await response.json()) as McpResponse
    expect(body.error).toBeDefined()
    expect(body.error?.code).toBe(-32700) // Parse error
  })

  it('should return error for invalid Content-Type', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    )

    const body = (await response.json()) as McpResponse
    expect(body.error).toBeDefined()
  })

  it('should return error for unknown method', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'unknown/method',
        }),
      })
    )

    const body = (await response.json()) as McpResponse
    expect(body.error).toBeDefined()
    expect(body.error?.code).toBe(-32601) // Method not found
  })

  it('should return error for unknown tool', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'unknown-tool', arguments: {} },
        }),
      })
    )

    const body = (await response.json()) as McpResponse
    expect(body.result).toBeDefined()
    const result = body.result as { isError: boolean }
    expect(result.isError).toBe(true)
  })

  it('should return error for invalid JSON-RPC version', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '1.0',
          id: 1,
          method: 'tools/list',
        }),
      })
    )

    const body = (await response.json()) as McpResponse
    expect(body.error).toBeDefined()
    expect(body.error?.code).toBe(-32600) // Invalid request
  })

  it('should handle OPTIONS request for CORS', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'OPTIONS',
      })
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined()
    expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined()
  })
})

// =============================================================================
// Batch Request Tests
// =============================================================================

describe('Batch requests', () => {
  it('should handle batch JSON-RPC requests', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 1, method: 'tools/list' },
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'search', arguments: { query: 'test' } },
          },
        ]),
      })
    )

    const body = (await response.json()) as McpResponse[]
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(2)
    expect(body[0].id).toBe(1)
    expect(body[1].id).toBe(2)
  })
})

// =============================================================================
// Session Management Tests
// =============================================================================

describe('Session management', () => {
  it('should create new session when no session header provided', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      })
    )

    const sessionId = response.headers.get('mcp-session-id')
    expect(sessionId).toBeDefined()
    expect(typeof sessionId).toBe('string')
    expect(sessionId!.length).toBeGreaterThan(0)
  })

  it('should preserve session when header provided', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const existingSessionId = 'existing-session-123'

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': existingSessionId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      })
    )

    // Session ID should be echoed back
    const sessionId = response.headers.get('mcp-session-id')
    expect(sessionId).toBe(existingSessionId)
  })

  it('should handle DELETE request for session termination', async () => {
    const dbAccess = createMockDatabaseAccess()
    const handler = createMcpRouteHandler(dbAccess)

    const response = await handler(
      new Request('http://internal/mcp', {
        method: 'DELETE',
        headers: { 'mcp-session-id': 'session-to-delete' },
      })
    )

    expect(response.status).toBe(204)
  })
})

// =============================================================================
// createMondoMcpHandler Tests (from src/durable-object/mcp-handler.ts)
// =============================================================================

import {
  createMondoMcpHandler,
  createDatabaseAccess,
  getMcpServer,
} from '../../../src/durable-object/mcp-handler'
import type { MondoDatabase, Document } from '../../../src/durable-object/mondo-database'

function createMockMondoDatabase(): MondoDatabase {
  const mockSql = {
    exec: vi.fn().mockReturnValue({
      toArray: () => [],
    }),
  }

  const mockStorage = {
    sql: mockSql,
  }

  const mockSchemaManager = {
    initializeSchema: vi.fn(),
    validateSchema: vi.fn().mockResolvedValue(true),
    getSchemaVersion: vi.fn().mockResolvedValue(1),
  }

  return {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'test-id' }),
    insertMany: vi.fn().mockResolvedValue({ acknowledged: true, insertedCount: 0, insertedIds: [] }),
    updateOne: vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 0, modifiedCount: 0 }),
    deleteOne: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 }),
    countDocuments: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue([]),
    getSchemaManager: vi.fn().mockReturnValue(mockSchemaManager),
    getStorage: vi.fn().mockReturnValue(mockStorage),
    isInitialized: vi.fn().mockReturnValue(true),
  } as unknown as MondoDatabase
}

describe('createDatabaseAccess', () => {
  let mockDb: MondoDatabase

  beforeEach(() => {
    mockDb = createMockMondoDatabase()
  })

  describe('findOne', () => {
    it('should delegate to MondoDatabase.findOne', async () => {
      const dbAccess = createDatabaseAccess(mockDb)
      const expectedDoc = { _id: 'doc1', name: 'Test' }
      vi.mocked(mockDb.findOne).mockResolvedValue(expectedDoc)

      const result = await dbAccess.findOne('users', { name: 'Test' })

      expect(mockDb.findOne).toHaveBeenCalledWith('users', { name: 'Test' })
      expect(result).toEqual(expectedDoc)
    })

    it('should return null when document not found', async () => {
      const dbAccess = createDatabaseAccess(mockDb)
      vi.mocked(mockDb.findOne).mockResolvedValue(null)

      const result = await dbAccess.findOne('users', { name: 'Unknown' })

      expect(result).toBeNull()
    })
  })

  describe('find', () => {
    it('should delegate to MondoDatabase.find', async () => {
      const dbAccess = createDatabaseAccess(mockDb)
      const expectedDocs = [
        { _id: 'doc1', name: 'Alice' },
        { _id: 'doc2', name: 'Bob' },
      ]
      vi.mocked(mockDb.find).mockResolvedValue(expectedDocs)

      const result = await dbAccess.find('users', {})

      expect(mockDb.find).toHaveBeenCalledWith('users', {})
      expect(result).toEqual(expectedDocs)
    })

    it('should apply limit option', async () => {
      const dbAccess = createDatabaseAccess(mockDb)
      const allDocs = [
        { _id: 'doc1', name: 'Alice' },
        { _id: 'doc2', name: 'Bob' },
        { _id: 'doc3', name: 'Charlie' },
      ]
      vi.mocked(mockDb.find).mockResolvedValue(allDocs)

      const result = await dbAccess.find('users', {}, { limit: 2 })

      expect(result).toHaveLength(2)
    })

    it('should apply skip option', async () => {
      const dbAccess = createDatabaseAccess(mockDb)
      const allDocs = [
        { _id: 'doc1', name: 'Alice' },
        { _id: 'doc2', name: 'Bob' },
        { _id: 'doc3', name: 'Charlie' },
      ]
      vi.mocked(mockDb.find).mockResolvedValue(allDocs)

      const result = await dbAccess.find('users', {}, { skip: 1 })

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ _id: 'doc2', name: 'Bob' })
    })

    it('should apply sort option', async () => {
      const dbAccess = createDatabaseAccess(mockDb)
      const unsortedDocs = [
        { _id: 'doc1', name: 'Charlie', age: 30 },
        { _id: 'doc2', name: 'Alice', age: 25 },
        { _id: 'doc3', name: 'Bob', age: 35 },
      ]
      vi.mocked(mockDb.find).mockResolvedValue(unsortedDocs)

      const result = await dbAccess.find('users', {}, { sort: { name: 1 } })

      expect(result[0].name).toBe('Alice')
      expect(result[1].name).toBe('Bob')
      expect(result[2].name).toBe('Charlie')
    })
  })

  describe('insertOne', () => {
    it('should delegate to MondoDatabase.insertOne', async () => {
      const dbAccess = createDatabaseAccess(mockDb)
      vi.mocked(mockDb.insertOne).mockResolvedValue({
        acknowledged: true,
        insertedId: 'new-id-123',
      })

      const result = await dbAccess.insertOne('users', { name: 'New User' })

      expect(mockDb.insertOne).toHaveBeenCalledWith('users', { name: 'New User' })
      expect(result).toEqual({ insertedId: 'new-id-123' })
    })
  })

  describe('updateMany', () => {
    it('should update multiple documents via find + updateOne', async () => {
      const dbAccess = createDatabaseAccess(mockDb)
      vi.mocked(mockDb.find).mockResolvedValue([
        { _id: 'doc1', status: 'pending' },
        { _id: 'doc2', status: 'pending' },
      ])
      vi.mocked(mockDb.updateOne).mockResolvedValue({
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 1,
      })

      const result = await dbAccess.updateMany(
        'orders',
        { status: 'pending' },
        { $set: { status: 'processed' } }
      )

      expect(mockDb.find).toHaveBeenCalledWith('orders', { status: 'pending' })
      expect(mockDb.updateOne).toHaveBeenCalledTimes(2)
      expect(result).toEqual({ matchedCount: 2, modifiedCount: 2 })
    })
  })

  describe('listCollections', () => {
    it('should query collections from storage', async () => {
      const dbAccess = createDatabaseAccess(mockDb)
      const mockStorage = mockDb.getStorage()
      vi.mocked(mockStorage.sql.exec).mockReturnValue({
        toArray: () => [{ name: 'users' }, { name: 'orders' }],
      } as any)

      const result = await dbAccess.listCollections()

      expect(mockStorage.sql.exec).toHaveBeenCalledWith('SELECT name FROM collections')
      expect(result).toEqual(['users', 'orders'])
    })
  })

  describe('listDatabases', () => {
    it('should return default database', async () => {
      const dbAccess = createDatabaseAccess(mockDb)

      const result = await dbAccess.listDatabases()

      expect(result).toEqual(['default'])
    })
  })

  describe('getProxy', () => {
    it('should return itself as proxy', () => {
      const dbAccess = createDatabaseAccess(mockDb)

      const proxy = dbAccess.getProxy()

      expect(proxy).toBe(dbAccess)
    })
  })
})

describe('createMondoMcpHandler', () => {
  let mockDb: MondoDatabase

  beforeEach(() => {
    mockDb = createMockMondoDatabase()
  })

  it('should create an HTTP handler function', () => {
    const handler = createMondoMcpHandler(mockDb)

    expect(typeof handler).toBe('function')
  })

  it('should handle OPTIONS request for CORS', async () => {
    const handler = createMondoMcpHandler(mockDb)
    const request = new Request('http://localhost/mcp', {
      method: 'OPTIONS',
    })

    const response = await handler(request)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  it('should handle initialize request', async () => {
    const handler = createMondoMcpHandler(mockDb)
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.jsonrpc).toBe('2.0')
    expect(data.id).toBe(1)
    expect(data.result).toBeDefined()
    expect(data.result.serverInfo.name).toBe('mondodb')
  })

  it('should handle tools/list request', async () => {
    const handler = createMondoMcpHandler(mockDb)
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      }),
    })

    const response = await handler(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.result.tools).toBeDefined()
    expect(Array.isArray(data.result.tools)).toBe(true)
    expect(data.result.tools.length).toBeGreaterThan(0)
  })

  it('should accept custom server name and version', async () => {
    const handler = createMondoMcpHandler(mockDb, {
      name: 'custom-server',
      version: '2.0.0',
    })
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    })

    const response = await handler(request)
    const data = await response.json()

    expect(data.result.serverInfo.name).toBe('custom-server')
    expect(data.result.serverInfo.version).toBe('2.0.0')
  })
})

describe('getMcpServer', () => {
  let mockDb: MondoDatabase

  beforeEach(() => {
    mockDb = createMockMondoDatabase()
  })

  it('should return an MCP server instance', () => {
    const server = getMcpServer(mockDb)

    expect(server).toBeDefined()
    expect(server.name).toBe('mondodb')
    expect(server.version).toBe('1.0.0')
  })

  it('should accept custom options', () => {
    const server = getMcpServer(mockDb, {
      name: 'custom-db',
      version: '3.0.0',
    })

    expect(server.name).toBe('custom-db')
    expect(server.version).toBe('3.0.0')
  })

  it('should have registered tools', async () => {
    const server = getMcpServer(mockDb)
    const tools = await server.listTools()

    expect(tools.length).toBeGreaterThan(0)

    const toolNames = tools.map((t) => t.name)
    expect(toolNames).toContain('search')
    expect(toolNames).toContain('fetch')
  })
})
