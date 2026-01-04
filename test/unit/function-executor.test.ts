import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FunctionExecutor } from '../../src/executor/function-executor'
import type { WorkerLoader, WorkerCode, WorkerStub, WorkerEntrypoint } from '../../src/types/function'

// ============================================================================
// Mock WorkerLoader for Testing
// ============================================================================

/**
 * Creates a simple mock that returns configured results
 */
function createMockLoader(options: {
  result?: unknown
  batchResults?: unknown[]
  error?: string
  capturedCode?: { value: WorkerCode | null }
  capturedRequest?: { value: Request | null; body: unknown }
  capturedIds?: string[]
} = {}): WorkerLoader {
  return {
    get(id: string, getCode: () => Promise<WorkerCode>): WorkerStub {
      if (options.capturedIds) {
        options.capturedIds.push(id)
      }
      return {
        getEntrypoint(): WorkerEntrypoint {
          return {
            async fetch(request: Request): Promise<Response> {
              // Capture code if requested
              if (options.capturedCode) {
                options.capturedCode.value = await getCode()
              }

              // Capture request
              if (options.capturedRequest) {
                options.capturedRequest.value = request
                options.capturedRequest.body = await request.clone().json()
              }

              // Simulate error if specified
              if (options.error) {
                return Response.json({ error: options.error })
              }

              // Parse request to determine if batch
              const body = await request.json() as { args?: unknown[]; argsArray?: unknown[][] }
              const isBatch = body.argsArray !== undefined

              if (isBatch) {
                return Response.json({ results: options.batchResults ?? [] })
              }
              return Response.json({ result: options.result })
            }
          }
        }
      }
    }
  }
}

// ============================================================================
// FunctionExecutor Tests
// ============================================================================

describe('FunctionExecutor', () => {
  describe('capability detection', () => {
    it('throws helpful error when LOADER binding missing', async () => {
      const executor = new FunctionExecutor({})
      await expect(executor.execute('x => x * 2', [5]))
        .rejects.toThrow('$function requires worker_loaders binding')
    })

    it('includes wrangler config hint in error', async () => {
      const executor = new FunctionExecutor({})
      await expect(executor.execute('x => x', []))
        .rejects.toThrow('wrangler.jsonc')
    })

    it('initializes successfully when LOADER present', () => {
      const mockLoader = { get: vi.fn() }
      const executor = new FunctionExecutor({ LOADER: mockLoader as unknown as WorkerLoader })
      expect(executor).toBeDefined()
    })

    it('throws on executeBatch when LOADER missing', async () => {
      const executor = new FunctionExecutor({})
      await expect(executor.executeBatch('x => x', [[]]))
        .rejects.toThrow('$function requires worker_loaders binding')
    })
  })

  // ==========================================================================
  // Basic Function Execution
  // ==========================================================================

  describe('basic function execution', () => {
    it('executes and returns result from worker', async () => {
      const executor = new FunctionExecutor({ LOADER: createMockLoader({ result: 42 }) })
      const result = await executor.execute('() => 42', [])
      expect(result).toBe(42)
    })

    it('returns string values', async () => {
      const executor = new FunctionExecutor({ LOADER: createMockLoader({ result: 'hello world' }) })
      const result = await executor.execute('() => "hello world"', [])
      expect(result).toBe('hello world')
    })

    it('returns object values', async () => {
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: { foo: 'bar', num: 123 } })
      })
      const result = await executor.execute('() => ({ foo: "bar" })', [])
      expect(result).toEqual({ foo: 'bar', num: 123 })
    })

    it('returns array values', async () => {
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: [1, 2, 3] })
      })
      const result = await executor.execute('() => [1, 2, 3]', [])
      expect(result).toEqual([1, 2, 3])
    })

    it('returns null values', async () => {
      const executor = new FunctionExecutor({ LOADER: createMockLoader({ result: null }) })
      const result = await executor.execute('() => null', [])
      expect(result).toBe(null)
    })

    it('returns boolean values', async () => {
      const executor = new FunctionExecutor({ LOADER: createMockLoader({ result: true }) })
      const result = await executor.execute('() => true', [])
      expect(result).toBe(true)
    })
  })

  // ==========================================================================
  // Argument Passing
  // ==========================================================================

  describe('argument passing', () => {
    it('passes arguments in request body', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 10, capturedRequest })
      })

      await executor.execute('(x) => x * 2', [5])

      expect((capturedRequest.body as { args: unknown[] }).args).toEqual([5])
    })

    it('passes multiple arguments', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 6, capturedRequest })
      })

      await executor.execute('(a, b, c) => a + b + c', [1, 2, 3])

      expect((capturedRequest.body as { args: unknown[] }).args).toEqual([1, 2, 3])
    })

    it('passes complex object arguments', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 30, capturedRequest })
      })

      const arg = { x: 10, y: 20 }
      await executor.execute('(obj) => obj.x + obj.y', [arg])

      expect((capturedRequest.body as { args: unknown[] }).args).toEqual([arg])
    })

    it('passes array arguments', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 10, capturedRequest })
      })

      await executor.execute('(arr) => arr.reduce((a, b) => a + b, 0)', [[1, 2, 3, 4]])

      expect((capturedRequest.body as { args: unknown[] }).args).toEqual([[1, 2, 3, 4]])
    })

    it('handles empty args array', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 'no args', capturedRequest })
      })

      await executor.execute('() => "no args"', [])

      expect((capturedRequest.body as { args: unknown[] }).args).toEqual([])
    })
  })

  // ==========================================================================
  // Timeout Behavior
  // ==========================================================================

  describe('timeout behavior', () => {
    it('uses default timeout of 5000ms', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 'done', capturedRequest })
      })

      await executor.execute('() => 1', [])

      expect((capturedRequest.body as { timeout: number }).timeout).toBe(5000)
    })

    it('accepts custom timeout parameter', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 'done', capturedRequest })
      })

      await executor.execute('() => 1', [], 3000)

      expect((capturedRequest.body as { timeout: number }).timeout).toBe(3000)
    })

    it('uses default timeout of 10000ms for batch', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ batchResults: [], capturedRequest })
      })

      await executor.executeBatch('() => 1', [[]])

      expect((capturedRequest.body as { timeout: number }).timeout).toBe(10000)
    })

    it('accepts custom timeout for batch', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ batchResults: [], capturedRequest })
      })

      await executor.executeBatch('() => 1', [[]], 20000)

      expect((capturedRequest.body as { timeout: number }).timeout).toBe(20000)
    })
  })

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('throws on function execution error from worker', async () => {
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ error: 'Test error' })
      })
      await expect(executor.execute('() => 1', []))
        .rejects.toThrow('$function execution failed: Test error')
    })

    it('error message includes $function prefix', async () => {
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ error: 'custom error' })
      })
      await expect(executor.execute('() => 1', []))
        .rejects.toThrow('$function execution failed')
    })

    it('throws on batch execution error', async () => {
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ error: 'Batch error' })
      })
      await expect(executor.executeBatch('() => 1', [[]]))
        .rejects.toThrow('$function batch execution failed')
    })

    it('handles ReferenceError gracefully', async () => {
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ error: 'ReferenceError: x is not defined' })
      })
      await expect(executor.execute('() => x', []))
        .rejects.toThrow('ReferenceError')
    })
  })

  // ==========================================================================
  // Batch Execution
  // ==========================================================================

  describe('batch execution', () => {
    it('sends argsArray in request body', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ batchResults: [2, 4, 6], capturedRequest })
      })

      await executor.executeBatch('(x) => x * 2', [[1], [2], [3]])

      expect((capturedRequest.body as { argsArray: unknown[][] }).argsArray)
        .toEqual([[1], [2], [3]])
    })

    it('returns all results from batch', async () => {
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ batchResults: [2, 4, 6, 8, 10] })
      })

      const results = await executor.executeBatch('(x) => x * 2', [[1], [2], [3], [4], [5]])

      expect(results).toEqual([2, 4, 6, 8, 10])
    })

    it('handles empty argsArray', async () => {
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ batchResults: [] })
      })

      const results = await executor.executeBatch('() => 1', [])

      expect(results).toEqual([])
    })

    it('handles multiple arguments per invocation', async () => {
      const capturedRequest = { value: null as Request | null, body: null as unknown }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ batchResults: [3, 7, 11], capturedRequest })
      })

      await executor.executeBatch('(a, b) => a + b', [[1, 2], [3, 4], [5, 6]])

      expect((capturedRequest.body as { argsArray: unknown[][] }).argsArray)
        .toEqual([[1, 2], [3, 4], [5, 6]])
    })
  })

  // ==========================================================================
  // Function Body Normalization
  // ==========================================================================

  describe('function body normalization', () => {
    it('wraps function declarations in parens', async () => {
      const capturedCode: { value: WorkerCode | null } = { value: null }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 3, capturedCode })
      })

      await executor.execute('function add(a, b) { return a + b; }', [1, 2])

      const moduleCode = capturedCode.value!.modules['fn.js'] as string
      expect(moduleCode).toContain('(function add(a, b) { return a + b; })')
    })

    it('does not modify arrow functions', async () => {
      const capturedCode: { value: WorkerCode | null } = { value: null }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 42, capturedCode })
      })

      await executor.execute('(x) => x + 1', [41])

      const moduleCode = capturedCode.value!.modules['fn.js'] as string
      expect(moduleCode).toContain('(x) => x + 1')
      expect(moduleCode).not.toContain('((x) => x + 1)')
    })

    it('trims whitespace from body', async () => {
      const capturedCode: { value: WorkerCode | null } = { value: null }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 42, capturedCode })
      })

      await executor.execute('  \n  () => 42  \n  ', [])

      const moduleCode = capturedCode.value!.modules['fn.js'] as string
      expect(moduleCode).toContain('() => 42')
    })
  })

  // ==========================================================================
  // Worker Code Generation (Sandboxing)
  // ==========================================================================

  describe('worker code generation', () => {
    it('generates code with globalOutbound null', async () => {
      const capturedCode: { value: WorkerCode | null } = { value: null }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 1, capturedCode })
      })

      await executor.execute('() => 1', [])

      expect(capturedCode.value).not.toBeNull()
      expect(capturedCode.value!.globalOutbound).toBe(null)
    })

    it('generates code with empty env', async () => {
      const capturedCode: { value: WorkerCode | null } = { value: null }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 1, capturedCode })
      })

      await executor.execute('() => 1', [])

      expect(capturedCode.value!.env).toEqual({})
    })

    it('uses compatibility date 2024-09-25', async () => {
      const capturedCode: { value: WorkerCode | null } = { value: null }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 1, capturedCode })
      })

      await executor.execute('() => 1', [])

      expect(capturedCode.value!.compatibilityDate).toBe('2024-09-25')
    })

    it('uses fn.js as main module', async () => {
      const capturedCode: { value: WorkerCode | null } = { value: null }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 1, capturedCode })
      })

      await executor.execute('() => 1', [])

      expect(capturedCode.value!.mainModule).toBe('fn.js')
      expect(capturedCode.value!.modules).toHaveProperty('fn.js')
    })

    it('generates single execution code', async () => {
      const capturedCode: { value: WorkerCode | null } = { value: null }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 1, capturedCode })
      })

      await executor.execute('() => 1', [])

      const moduleCode = capturedCode.value!.modules['fn.js'] as string
      expect(moduleCode).toContain('const fn =')
      expect(moduleCode).toContain('fn(...args)')
      expect(moduleCode).toContain('Response.json({ result })')
    })

    it('generates batch execution code', async () => {
      const capturedCode: { value: WorkerCode | null } = { value: null }
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ batchResults: [1], capturedCode })
      })

      await executor.executeBatch('() => 1', [[]])

      const moduleCode = capturedCode.value!.modules['fn.js'] as string
      expect(moduleCode).toContain('argsArray.map')
      expect(moduleCode).toContain('Response.json({ results })')
    })
  })

  // ==========================================================================
  // Worker ID Generation (Hashing)
  // ==========================================================================

  describe('worker ID generation', () => {
    it('generates consistent IDs for same function body', async () => {
      const capturedIds: string[] = []
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 42, capturedIds })
      })

      await executor.execute('() => 42', [])
      await executor.execute('() => 42', [])

      expect(capturedIds[0]).toBe(capturedIds[1])
    })

    it('generates different IDs for different function bodies', async () => {
      const capturedIds: string[] = []
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 1, capturedIds })
      })

      await executor.execute('() => 1', [])
      await executor.execute('() => 2', [])

      expect(capturedIds[0]).not.toBe(capturedIds[1])
    })

    it('generates IDs with fn- prefix for single execution', async () => {
      const capturedIds: string[] = []
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ result: 1, capturedIds })
      })

      await executor.execute('() => 1', [])

      expect(capturedIds[0]).toMatch(/^fn-[a-f0-9]+$/)
    })

    it('generates IDs with fn-batch- prefix for batch execution', async () => {
      const capturedIds: string[] = []
      const executor = new FunctionExecutor({
        LOADER: createMockLoader({ batchResults: [1], capturedIds })
      })

      await executor.executeBatch('() => 1', [[]])

      expect(capturedIds[0]).toMatch(/^fn-batch-[a-f0-9]+$/)
    })
  })
})
