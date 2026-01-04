import { describe, it, expect, vi, beforeEach } from 'vitest'
import { doTool, doToolDefinition } from '../../../../src/mcp/tools/do'
import type { CodeLoader } from '../../../../src/mcp/server'
import type { DoResult } from '../../../../src/mcp/types'

/**
 * do Tool Unit Tests
 *
 * Tests the standalone 'do' tool which executes arbitrary JavaScript code
 * in a secure sandbox environment via CodeLoader interface.
 *
 * Key behaviors tested:
 * - Successful code execution
 * - Error handling
 * - Log capture
 * - Missing code parameter
 * - Duration tracking
 */

/**
 * Create a mock CodeLoader that returns pre-configured results
 */
function createMockCodeLoader(
  results: Map<string, { success: boolean; result?: unknown; error?: string; logs?: string[] }> = new Map()
): CodeLoader {
  return {
    execute: vi.fn(async (code: string, _context?: Record<string, unknown>) => {
      // Check for pre-configured results
      for (const [pattern, result] of results) {
        if (code.includes(pattern)) {
          return result
        }
      }

      // Default: simple success
      return {
        success: true,
        result: undefined,
      }
    }),
  }
}

describe('doTool', () => {
  describe('Successful Code Execution', () => {
    it('should execute code and return success result', async () => {
      const results = new Map([['return 42', { success: true, result: 42 }]])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'return 42')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed.success).toBe(true)
      expect(parsed.result).toBe(42)
    })

    it('should execute code returning objects', async () => {
      const results = new Map([
        ['return { name: "test" }', { success: true, result: { name: 'test' } }],
      ])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'return { name: "test" }')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed.success).toBe(true)
      expect(parsed.result).toEqual({ name: 'test' })
    })

    it('should execute code returning arrays', async () => {
      const results = new Map([['return [1, 2, 3]', { success: true, result: [1, 2, 3] }]])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'return [1, 2, 3]')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed.success).toBe(true)
      expect(parsed.result).toEqual([1, 2, 3])
    })

    it('should pass code to codeLoader.execute', async () => {
      const mockLoader = createMockCodeLoader()

      await doTool(mockLoader, 'const x = 1; return x;')

      expect(mockLoader.execute).toHaveBeenCalledWith('const x = 1; return x;', { description: undefined })
    })

    it('should pass description in context', async () => {
      const mockLoader = createMockCodeLoader()

      await doTool(mockLoader, 'return 1', 'Returns the number 1')

      expect(mockLoader.execute).toHaveBeenCalledWith('return 1', { description: 'Returns the number 1' })
    })

    it('should not set isError for successful execution', async () => {
      const results = new Map([['success', { success: true, result: 'ok' }]])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'success')

      expect(response.isError).not.toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should report syntax errors from code execution', async () => {
      const results = new Map([
        ['invalid syntax {{{', { success: false, error: 'SyntaxError: Unexpected token' }],
      ])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'invalid syntax {{{')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed.success).toBe(false)
      expect(parsed.error).toContain('SyntaxError')
    })

    it('should report runtime errors from code execution', async () => {
      const results = new Map([
        ['throw new Error("test error")', { success: false, error: 'test error' }],
      ])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'throw new Error("test error")')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed.success).toBe(false)
      expect(parsed.error).toBe('test error')
    })

    it('should set isError flag on failure', async () => {
      const results = new Map([['fail', { success: false, error: 'Execution failed' }]])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'fail')

      expect(response.isError).toBe(true)
    })

    it('should handle codeLoader exceptions gracefully', async () => {
      const mockLoader: CodeLoader = {
        execute: vi.fn().mockRejectedValue(new Error('CodeLoader crashed')),
      }

      const response = await doTool(mockLoader, 'anything')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(response.isError).toBe(true)
      expect(parsed.success).toBe(false)
      expect(parsed.error).toBe('CodeLoader crashed')
    })

    it('should handle non-Error exceptions', async () => {
      const mockLoader: CodeLoader = {
        execute: vi.fn().mockRejectedValue('string error'),
      }

      const response = await doTool(mockLoader, 'anything')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(response.isError).toBe(true)
      expect(parsed.success).toBe(false)
      expect(parsed.error).toBe('Unknown error')
    })
  })

  describe('Log Capture', () => {
    it('should include logs in result when available', async () => {
      const results = new Map([
        ['console.log', { success: true, result: undefined, logs: ['Hello', 'World'] }],
      ])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'console.log("Hello"); console.log("World")')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed.logs).toEqual(['Hello', 'World'])
    })

    it('should not include logs when not provided by code loader', async () => {
      const results = new Map([['no logs', { success: true, result: 42 }]])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'no logs')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed.logs).toBeUndefined()
    })
  })

  describe('Missing Code Parameter', () => {
    it('should return error for empty code string', async () => {
      const mockLoader = createMockCodeLoader()

      const response = await doTool(mockLoader, '')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(response.isError).toBe(true)
      expect(parsed.success).toBe(false)
      expect(parsed.error).toBe('Missing required field: code')
    })

    it('should return error for whitespace-only code', async () => {
      const mockLoader = createMockCodeLoader()

      const response = await doTool(mockLoader, '   \n\t  ')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(response.isError).toBe(true)
      expect(parsed.success).toBe(false)
      expect(parsed.error).toBe('Missing required field: code')
    })

    it('should return error for undefined code', async () => {
      const mockLoader = createMockCodeLoader()

      // @ts-expect-error Testing undefined handling
      const response = await doTool(mockLoader, undefined)
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(response.isError).toBe(true)
      expect(parsed.success).toBe(false)
      expect(parsed.error).toBe('Missing required field: code')
    })

    it('should return error for null code', async () => {
      const mockLoader = createMockCodeLoader()

      // @ts-expect-error Testing null handling
      const response = await doTool(mockLoader, null)
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(response.isError).toBe(true)
      expect(parsed.success).toBe(false)
      expect(parsed.error).toBe('Missing required field: code')
    })

    it('should not call codeLoader.execute for missing code', async () => {
      const mockLoader = createMockCodeLoader()

      await doTool(mockLoader, '')

      expect(mockLoader.execute).not.toHaveBeenCalled()
    })
  })

  describe('Duration Tracking', () => {
    it('should include duration in successful result', async () => {
      const results = new Map([['return 1', { success: true, result: 1 }]])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'return 1')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed.duration).toBeDefined()
      expect(typeof parsed.duration).toBe('number')
      expect(parsed.duration).toBeGreaterThanOrEqual(0)
    })

    it('should include duration in error result', async () => {
      const results = new Map([['fail', { success: false, error: 'Failed' }]])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'fail')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed.duration).toBeDefined()
      expect(typeof parsed.duration).toBe('number')
    })

    it('should include duration when codeLoader throws', async () => {
      const mockLoader: CodeLoader = {
        execute: vi.fn().mockRejectedValue(new Error('Crash')),
      }

      const response = await doTool(mockLoader, 'anything')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed.duration).toBeDefined()
      expect(typeof parsed.duration).toBe('number')
    })
  })

  describe('Response Format', () => {
    it('should return McpToolResponse format', async () => {
      const mockLoader = createMockCodeLoader()

      const response = await doTool(mockLoader, 'return 1')

      expect(response).toHaveProperty('content')
      expect(Array.isArray(response.content)).toBe(true)
      expect(response.content[0]).toHaveProperty('type', 'text')
      expect(response.content[0]).toHaveProperty('text')
    })

    it('should return valid JSON in text field', async () => {
      const mockLoader = createMockCodeLoader()

      const response = await doTool(mockLoader, 'return 1')

      expect(() => JSON.parse(response.content[0].text)).not.toThrow()
    })

    it('should return DoResult structure in response', async () => {
      const results = new Map([['return 1', { success: true, result: 1 }]])
      const mockLoader = createMockCodeLoader(results)

      const response = await doTool(mockLoader, 'return 1')
      const parsed: DoResult = JSON.parse(response.content[0].text)

      expect(parsed).toHaveProperty('success')
      expect(parsed).toHaveProperty('result')
      expect(parsed).toHaveProperty('duration')
    })
  })
})

describe('doToolDefinition', () => {
  it('should have correct name', () => {
    expect(doToolDefinition.name).toBe('do')
  })

  it('should have description', () => {
    expect(doToolDefinition.description).toBeDefined()
    expect(typeof doToolDefinition.description).toBe('string')
    expect(doToolDefinition.description).toContain('JavaScript')
  })

  it('should have correct input schema type', () => {
    expect(doToolDefinition.inputSchema.type).toBe('object')
  })

  it('should have code property in schema', () => {
    expect(doToolDefinition.inputSchema.properties).toBeDefined()
    expect(doToolDefinition.inputSchema.properties?.code).toBeDefined()
    expect(doToolDefinition.inputSchema.properties?.code.type).toBe('string')
  })

  it('should have description property in schema', () => {
    expect(doToolDefinition.inputSchema.properties?.description).toBeDefined()
    expect(doToolDefinition.inputSchema.properties?.description.type).toBe('string')
  })

  it('should require code parameter', () => {
    expect(doToolDefinition.inputSchema.required).toContain('code')
  })

  it('should not require description parameter', () => {
    expect(doToolDefinition.inputSchema.required).not.toContain('description')
  })

  it('should have correct annotations', () => {
    expect(doToolDefinition.annotations?.title).toBe('Execute Code')
    expect(doToolDefinition.annotations?.readOnlyHint).toBe(false)
    expect(doToolDefinition.annotations?.destructiveHint).toBe(true)
    expect(doToolDefinition.annotations?.idempotentHint).toBe(false)
    expect(doToolDefinition.annotations?.openWorldHint).toBe(false)
  })
})
