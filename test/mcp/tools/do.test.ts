import { describe, it, expect, vi } from 'vitest'
import { doTool, doToolDefinition } from '../../../src/mcp/tools/do'
import type { DoResult } from '../../../src/mcp/types'
import type { CodeLoader } from '../../../src/mcp/server'

/**
 * Do Tool Tests
 *
 * Tests for the "do" MCP tool which executes arbitrary JavaScript code
 * using a CodeLoader interface.
 */

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Create a mock code loader that executes code synchronously for testing
 */
function createMockCodeLoader(
  mockResults: Record<string, { success: boolean; result?: unknown; error?: string; logs?: string[] }> = {}
): CodeLoader {
  return {
    execute: vi.fn().mockImplementation(async (code: string) => {
      // Check if we have a predefined result for this code
      if (mockResults[code]) {
        return mockResults[code]
      }

      // Default: simulate simple code execution
      try {
        // Handle some common test cases
        if (code === 'return 42') {
          return { success: true, result: 42 }
        }
        if (code === 'return "hello"') {
          return { success: true, result: 'hello' }
        }
        if (code === 'return 1 + 1') {
          return { success: true, result: 2 }
        }
        if (code.includes('console.log')) {
          return { success: true, result: 'done', logs: ['hello', 'world'] }
        }
        if (code.includes('throw new Error')) {
          const match = code.match(/throw new Error\("(.+?)"\)/)
          const errorMsg = match?.[1] || 'Unknown error'
          return { success: false, error: errorMsg }
        }
        if (code.includes('{{{invalid')) {
          return { success: false, error: 'SyntaxError: Unexpected token' }
        }
        if (code.includes('db.collection')) {
          // Simulate database operations
          if (code.includes('find({})')) {
            return { success: true, result: [{ _id: '1', name: 'Alice' }, { _id: '2', name: 'Bob' }] }
          }
          if (code.includes('findOne')) {
            return { success: true, result: { _id: '1', name: 'Test Item' } }
          }
          if (code.includes('insertOne')) {
            return { success: true, result: { insertedId: 'mock-id-123' } }
          }
          if (code.includes('aggregate')) {
            return { success: true, result: [{ _id: 'Widget', total: 150 }] }
          }
        }

        return { success: true, result: undefined }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) }
      }
    }),
  }
}

// =============================================================================
// Basic Execution Tests
// =============================================================================

describe('doTool', () => {
  describe('Basic Execution', () => {
    it('should execute code and return result', async () => {
      const codeLoader = createMockCodeLoader()

      const result = await doTool(codeLoader, 'return 42')

      expect(result.isError).not.toBe(true)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')

      const doResult: DoResult = JSON.parse(result.content[0].text)
      expect(doResult.success).toBe(true)
      expect(doResult.result).toBe(42)
    })

    it('should include execution duration', async () => {
      const codeLoader = createMockCodeLoader()

      const result = await doTool(codeLoader, 'return "hello"')
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.duration).toBeDefined()
      expect(typeof doResult.duration).toBe('number')
      expect(doResult.duration).toBeGreaterThanOrEqual(0)
    })

    it('should capture console.log output', async () => {
      const codeLoader = createMockCodeLoader()

      const result = await doTool(codeLoader, 'console.log("hello"); console.log("world"); return "done"')
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
      const codeLoader = createMockCodeLoader()

      const result = await doTool(
        codeLoader,
        'return await db.collection("users").find({})'
      )
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(true)
      expect(Array.isArray(doResult.result)).toBe(true)
      expect((doResult.result as Array<unknown>).length).toBe(2)
    })

    it('should allow inserting documents', async () => {
      const codeLoader = createMockCodeLoader()

      const result = await doTool(
        codeLoader,
        'return await db.collection("users").insertOne({ name: "Charlie", email: "charlie@example.com" })'
      )
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(true)
      expect(doResult.result).toHaveProperty('insertedId')
    })

    it('should allow aggregation pipelines', async () => {
      const codeLoader = createMockCodeLoader()

      const result = await doTool(
        codeLoader,
        `return await db.collection("orders").aggregate([
          { $group: { _id: "$product", total: { $sum: { $multiply: ["$quantity", "$price"] } } } }
        ])`
      )
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(true)
      expect(Array.isArray(doResult.result)).toBe(true)
    })
  })

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe('Error Handling', () => {
    it('should return error for syntax errors', async () => {
      const codeLoader = createMockCodeLoader()

      const result = await doTool(codeLoader, 'return {{{invalid syntax')
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(false)
      expect(doResult.error).toBeDefined()
      expect(doResult.error).toMatch(/syntax|unexpected|parse/i)
    })

    it('should return error for runtime exceptions', async () => {
      const codeLoader = createMockCodeLoader()

      const result = await doTool(codeLoader, 'throw new Error("Runtime failure")')
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(doResult.success).toBe(false)
      expect(doResult.error).toBeDefined()
      expect(doResult.error).toContain('Runtime failure')
    })

    it('should set isError flag on MCP response', async () => {
      const codeLoader = createMockCodeLoader()

      const result = await doTool(codeLoader, 'throw new Error("test error")')

      expect(result.isError).toBe(true)
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')

      const doResult: DoResult = JSON.parse(result.content[0].text)
      expect(doResult.success).toBe(false)
    })
  })

  // =============================================================================
  // Validation Tests
  // =============================================================================

  describe('Validation', () => {
    it('should return error for empty code', async () => {
      const codeLoader = createMockCodeLoader()

      const result = await doTool(codeLoader, '')
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(result.isError).toBe(true)
      expect(doResult.success).toBe(false)
      expect(doResult.error).toContain('code')
    })

    it('should return error for whitespace-only code', async () => {
      const codeLoader = createMockCodeLoader()

      const result = await doTool(codeLoader, '   ')
      const doResult: DoResult = JSON.parse(result.content[0].text)

      expect(result.isError).toBe(true)
      expect(doResult.success).toBe(false)
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
