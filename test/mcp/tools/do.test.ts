import { describe, it, expect, vi, beforeEach } from 'vitest'
import { doTool, doToolDefinition } from '../../../src/mcp/tools/do'
import type { DatabaseAccess, McpToolResponse, DoResult } from '../../../src/mcp/types'

/**
 * Do Tool Integration Tests
 *
 * Tests for the "do" MCP tool which executes arbitrary JavaScript code
 * in a sandboxed environment with database access.
 *
 * This is the RED phase - tests are written for functionality that
 * doesn't exist yet. All tests should fail with "not defined" errors.
 */

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Create a mock database access interface
 */
function createMockDbAccess(
  mockData: Record<string, Array<Record<string, unknown>>> = {}
): DatabaseAccess {
  return {
    findOne: vi.fn().mockImplementation(async (collection: string) => {
      const docs = mockData[collection] || []
      return docs[0] ?? null
    }),
    find: vi.fn().mockImplementation(async (collection: string) => {
      return mockData[collection] || []
    }),
    insertOne: vi.fn().mockResolvedValue({ insertedId: 'mock-id-123' }),
    insertMany: vi.fn().mockResolvedValue({ insertedIds: ['mock-id-1', 'mock-id-2'] }),
    updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    updateMany: vi.fn().mockResolvedValue({ matchedCount: 2, modifiedCount: 2 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 2 }),
    aggregate: vi.fn().mockImplementation(async (collection: string) => {
      return mockData[collection] || []
    }),
    countDocuments: vi.fn().mockImplementation(async (collection: string) => {
      return (mockData[collection] || []).length
    }),
    listCollections: vi.fn().mockResolvedValue(Object.keys(mockData)),
    listDatabases: vi.fn().mockResolvedValue(['testdb']),
    getProxy: vi.fn().mockReturnValue({
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))),
    }),
  }
}

/**
 * Create a mock Worker Loader for sandbox execution
 */
function createMockLoader(
  mockResults: Map<string, { success: boolean; value?: unknown; error?: string; logs: string[] }> = new Map()
) {
  const capturedIds: string[] = []
  let lastConfig: Record<string, unknown> | null = null

  const loader = {
    get(id: string, getCode: () => { modules: Record<string, unknown>; mainModule: string }) {
      capturedIds.push(id)
      const code = getCode()
      lastConfig = code as Record<string, unknown>

      return {
        getEntrypoint() {
          return {
            async fetch() {
              const result = mockResults.get(id) || { success: true, value: undefined, logs: [] }
              return new Response(JSON.stringify(result))
            },
          }
        },
      }
    },
  }

  return {
    loader,
    getCapturedIds: () => capturedIds,
    getLastConfig: async () => lastConfig,
  }
}

// =============================================================================
// Basic Execution Tests
// =============================================================================

describe('doTool', () => {
  describe('Basic Execution', () => {
    it('should execute code and return result', async () => {
      const mockDb = createMockDbAccess()

      const result = await doTool(mockDb, 'return 42')

      expect(result.isError).not.toBe(true)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')

      const doResult: DoResult = JSON.parse(result.content[0].text)
      expect(doResult.success).toBe(true)
      expect(doResult.result).toBe(42)
    })

    it('should include execution duration', async () => {
      const mockDb = createMockDbAccess()

      const result = await doTool(mockDb, 'return "hello"')
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.duration).toBeDefined()
      expect(typeof doResult.duration).toBe('number')
      expect(doResult.duration).toBeGreaterThanOrEqual(0)
    })

    it('should capture console.log output', async () => {
      const mockDb = createMockDbAccess()

      const result = await doTool(mockDb, 'console.log("hello"); console.log("world"); return "done"')
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(true)
      expect(doResult.logs).toBeDefined()
      expect(doResult.logs).toContain('hello')
      expect(doResult.logs).toContain('world')
    })
  })

  // =============================================================================
  // Database Operations Tests
  // =============================================================================

  describe('Database Operations', () => {
    it('should allow querying documents', async () => {
      const mockDb = createMockDbAccess({
        users: [
          { _id: '1', name: 'Alice', email: 'alice@example.com' },
          { _id: '2', name: 'Bob', email: 'bob@example.com' },
        ],
      })

      const result = await doTool(
        mockDb,
        'return await db.collection("users").find({})'
      )
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(true)
      expect(Array.isArray(doResult.result)).toBe(true)
      expect((doResult.result as Array<unknown>).length).toBe(2)
    })

    it('should allow inserting documents', async () => {
      const mockDb = createMockDbAccess({ users: [] })

      const result = await doTool(
        mockDb,
        'return await db.collection("users").insertOne({ name: "Charlie", email: "charlie@example.com" })'
      )
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(true)
      expect(doResult.result).toHaveProperty('insertedId')
      expect(mockDb.insertOne).toHaveBeenCalledWith('users', {
        name: 'Charlie',
        email: 'charlie@example.com',
      })
    })

    it('should allow aggregation pipelines', async () => {
      const mockDb = createMockDbAccess({
        orders: [
          { _id: '1', product: 'Widget', quantity: 10, price: 5 },
          { _id: '2', product: 'Widget', quantity: 20, price: 5 },
          { _id: '3', product: 'Gadget', quantity: 15, price: 10 },
        ],
      })

      const result = await doTool(
        mockDb,
        `return await db.collection("orders").aggregate([
          { $group: { _id: "$product", total: { $sum: { $multiply: ["$quantity", "$price"] } } } }
        ])`
      )
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(true)
      expect(mockDb.aggregate).toHaveBeenCalled()
    })
  })

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe('Error Handling', () => {
    it('should return error for syntax errors', async () => {
      const mockDb = createMockDbAccess()

      const result = await doTool(mockDb, 'return {{{invalid syntax')
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(false)
      expect(doResult.error).toBeDefined()
      expect(doResult.error).toMatch(/syntax|unexpected|parse/i)
    })

    it('should return error for runtime exceptions', async () => {
      const mockDb = createMockDbAccess()

      const result = await doTool(mockDb, 'throw new Error("Runtime failure")')
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(false)
      expect(doResult.error).toBeDefined()
      expect(doResult.error).toContain('Runtime failure')
    })

    it('should set isError flag on MCP response', async () => {
      const mockDb = createMockDbAccess()

      const result = await doTool(mockDb, 'throw new Error("test error")')

      expect(result.isError).toBe(true)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')

      const doResult: DoResult = JSON.parse(result.content[0].text)
      expect(doResult.success).toBe(false)
    })
  })

  // =============================================================================
  // Fallback Behavior Tests
  // =============================================================================

  describe('Fallback Behavior', () => {
    it('should use Miniflare when loader is undefined', async () => {
      const mockDb = createMockDbAccess()

      // When no loader is provided, doTool should fall back to Miniflare
      const result = await doTool(mockDb, 'return 1 + 1', { loader: undefined })
      const doResult: DoResult = JSON.parse(result.content[0].text)

      // Should still execute successfully using Miniflare fallback
      expect(doResult.success).toBe(true)
      expect(doResult.result).toBe(2)
    })

    it('should work identically with Miniflare fallback', async () => {
      const mockDb = createMockDbAccess({
        items: [{ _id: '1', name: 'Test Item' }],
      })

      // Execute with explicit no loader (Miniflare fallback)
      const result = await doTool(
        mockDb,
        'return await db.collection("items").findOne({})',
        { loader: undefined }
      )
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(true)
      expect(doResult.result).toHaveProperty('name', 'Test Item')
    })
  })
})

// =============================================================================
// Tool Definition Tests
// =============================================================================

describe('doToolDefinition', () => {
  it('should have correct name', () => {
    expect(doToolDefinition.name).toBe('do')
  })

  it('should have description', () => {
    expect(doToolDefinition.description).toBeDefined()
    expect(typeof doToolDefinition.description).toBe('string')
    expect(doToolDefinition.description.length).toBeGreaterThan(0)
  })

  it('should have correct input schema', () => {
    expect(doToolDefinition.inputSchema.type).toBe('object')
    expect(doToolDefinition.inputSchema.properties).toBeDefined()
    expect(doToolDefinition.inputSchema.properties?.code).toBeDefined()
    expect(doToolDefinition.inputSchema.properties?.code.type).toBe('string')
    expect(doToolDefinition.inputSchema.required).toContain('code')
  })

  it('should have correct annotations', () => {
    expect(doToolDefinition.annotations?.readOnlyHint).toBe(false)
    expect(doToolDefinition.annotations?.destructiveHint).toBe(true)
    expect(doToolDefinition.annotations?.idempotentHint).toBe(false)
  })
})
