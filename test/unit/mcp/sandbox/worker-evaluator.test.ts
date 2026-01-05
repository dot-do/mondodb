import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createWorkerEvaluator,
  createMockLoader,
  createMockDbAccess,
  EvaluatorResult,
  DatabaseAccess,
  WorkerEvaluator,
} from '../../../../src/mcp/sandbox/worker-evaluator'
import type { WorkerLoader, WorkerCode } from '../../../../src/types/function'

describe('Worker Loader Evaluator', () => {
  describe('createWorkerEvaluator', () => {
    it('should create worker with Worker Loader', () => {
      const { loader } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 42')

      expect(evaluator).toBeDefined()
      expect(evaluator.execute).toBeInstanceOf(Function)
    })

    it('should configure compatibility date 2025-06-01', async () => {
      const { loader, getLastConfig } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 1')

      await evaluator.execute()

      const config = await getLastConfig()
      expect(config).not.toBeNull()
      expect(config!.compatibilityDate).toBe('2025-06-01')
    })

    it('should set globalOutbound to null for network isolation', async () => {
      const { loader, getLastConfig } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'fetch("http://evil.com")')

      await evaluator.execute()

      const config = await getLastConfig()
      expect(config).not.toBeNull()
      expect(config!.globalOutbound).toBeNull()
    })

    it('should include DB_PROXY binding in env', async () => {
      const { loader, getLastConfig } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 1')

      await evaluator.execute()

      const config = await getLastConfig()
      expect(config).not.toBeNull()
      expect(config!.env).toBeDefined()
      expect(config!.env!.DB_PROXY).toBeDefined()
    })

    it('should use sandbox.js as main module', async () => {
      const { loader, getLastConfig } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 1')

      await evaluator.execute()

      const config = await getLastConfig()
      expect(config).not.toBeNull()
      expect(config!.mainModule).toBe('sandbox.js')
      expect(config!.modules).toHaveProperty('sandbox.js')
    })

    it('should include nodejs_compat compatibility flag', async () => {
      const { loader, getLastConfig } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 1')

      await evaluator.execute()

      const config = await getLastConfig()
      expect(config).not.toBeNull()
      expect(config!.compatibilityFlags).toContain('nodejs_compat')
    })

    it('should accept custom worker ID', async () => {
      const { loader, getCapturedIds } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 1', {
        id: 'custom-worker-123'
      })

      await evaluator.execute()

      const ids = getCapturedIds()
      expect(ids).toContain('custom-worker-123')
    })

    it('should generate unique ID if not provided', async () => {
      const { loader, getCapturedIds } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 1')

      await evaluator.execute()

      const ids = getCapturedIds()
      expect(ids.length).toBe(1)
      // UUID format: sandbox-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(ids[0]).toMatch(/^sandbox-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })
  })

  describe('Worker execution', () => {
    it('should execute code and return result', async () => {
      const mockResults = new Map<string, EvaluatorResult>([
        ['sandbox-test', { success: true, value: 42, logs: [] }]
      ])
      const { loader } = createMockLoader(mockResults)
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 42', { id: 'sandbox-test' })

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toBe(42)
    })

    it('should capture console.log output', async () => {
      const mockResults = new Map<string, EvaluatorResult>([
        ['sandbox-test', { success: true, value: 'done', logs: ['hello', 'world'] }]
      ])
      const { loader } = createMockLoader(mockResults)
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(
        loader,
        dbAccess,
        'console.log("hello"); console.log("world"); return "done"',
        { id: 'sandbox-test' }
      )

      const result = await evaluator.execute()

      expect(result.logs).toContain('hello')
      expect(result.logs).toContain('world')
    })

    it('should handle errors in user code', async () => {
      const mockResults = new Map<string, EvaluatorResult>([
        ['sandbox-test', { success: false, error: 'test error', logs: [] }]
      ])
      const { loader } = createMockLoader(mockResults)
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(
        loader,
        dbAccess,
        'throw new Error("test error")',
        { id: 'sandbox-test' }
      )

      const result = await evaluator.execute()

      expect(result.success).toBe(false)
      expect(result.error).toContain('test error')
    })

    it('should return empty logs array when no logs', async () => {
      const { loader } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 1')

      const result = await evaluator.execute()

      expect(result.logs).toEqual([])
    })
  })

  describe('createMockLoader', () => {
    it('should create a mock loader', () => {
      const { loader, getLastConfig, getCapturedIds } = createMockLoader()

      expect(loader).toBeDefined()
      expect(loader.get).toBeInstanceOf(Function)
      expect(getLastConfig).toBeInstanceOf(Function)
      expect(getCapturedIds).toBeInstanceOf(Function)
    })

    it('should capture worker configurations', async () => {
      const { loader, getLastConfig } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 1')

      await evaluator.execute()

      const config = await getLastConfig()
      expect(config).not.toBeNull()
      expect(config!.compatibilityDate).toBeDefined()
      expect(config!.mainModule).toBeDefined()
      expect(config!.modules).toBeDefined()
    })

    it('should capture all worker IDs', async () => {
      const { loader, getCapturedIds } = createMockLoader()
      const { dbAccess } = createMockDbAccess()

      const evaluator1 = createWorkerEvaluator(loader, dbAccess, 'return 1', { id: 'worker-1' })
      const evaluator2 = createWorkerEvaluator(loader, dbAccess, 'return 2', { id: 'worker-2' })

      await evaluator1.execute()
      await evaluator2.execute()

      const ids = getCapturedIds()
      expect(ids).toContain('worker-1')
      expect(ids).toContain('worker-2')
    })

    it('should return configured mock results', async () => {
      const mockResults = new Map<string, EvaluatorResult>([
        ['custom-id', { success: true, value: 'custom result', logs: ['log1'] }]
      ])
      const { loader } = createMockLoader(mockResults)
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return "test"', { id: 'custom-id' })

      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toBe('custom result')
      expect(result.logs).toEqual(['log1'])
    })
  })

  describe('createMockDbAccess', () => {
    it('should create a mock database access', () => {
      const { dbAccess, getCapturedOperations } = createMockDbAccess()

      expect(dbAccess).toBeDefined()
      expect(dbAccess.getProxy).toBeInstanceOf(Function)
      expect(getCapturedOperations).toBeInstanceOf(Function)
    })

    it('should return mock data for find operations', async () => {
      const mockData = {
        users: [{ _id: '1', name: 'Alice' }, { _id: '2', name: 'Bob' }]
      }
      const { dbAccess } = createMockDbAccess(mockData)
      const proxy = dbAccess.getProxy()

      const response = await proxy.fetch(
        new Request('http://internal/find', {
          method: 'POST',
          body: JSON.stringify({ collection: 'users', filter: {} })
        })
      )
      const result = await response.json()

      expect(result).toEqual(mockData.users)
    })

    it('should return first document for findOne', async () => {
      const mockData = {
        users: [{ _id: '1', name: 'Alice' }]
      }
      const { dbAccess } = createMockDbAccess(mockData)
      const proxy = dbAccess.getProxy()

      const response = await proxy.fetch(
        new Request('http://internal/findOne', {
          method: 'POST',
          body: JSON.stringify({ collection: 'users', filter: {} })
        })
      )
      const result = await response.json()

      expect(result).toEqual({ _id: '1', name: 'Alice' })
    })

    it('should return null for findOne on empty collection', async () => {
      const { dbAccess } = createMockDbAccess({})
      const proxy = dbAccess.getProxy()

      const response = await proxy.fetch(
        new Request('http://internal/findOne', {
          method: 'POST',
          body: JSON.stringify({ collection: 'users', filter: {} })
        })
      )
      const result = await response.json()

      expect(result).toBeNull()
    })

    it('should return count for countDocuments', async () => {
      const mockData = {
        users: [{ _id: '1' }, { _id: '2' }, { _id: '3' }]
      }
      const { dbAccess } = createMockDbAccess(mockData)
      const proxy = dbAccess.getProxy()

      const response = await proxy.fetch(
        new Request('http://internal/countDocuments', {
          method: 'POST',
          body: JSON.stringify({ collection: 'users', filter: {} })
        })
      )
      const result = await response.json()

      expect(result).toBe(3)
    })

    it('should return collection names for listCollections', async () => {
      const mockData = {
        users: [],
        products: [],
        orders: []
      }
      const { dbAccess } = createMockDbAccess(mockData)
      const proxy = dbAccess.getProxy()

      const response = await proxy.fetch(
        new Request('http://internal/listCollections', {
          method: 'POST',
          body: JSON.stringify({})
        })
      )
      const result = await response.json()

      expect(result).toContain('users')
      expect(result).toContain('products')
      expect(result).toContain('orders')
    })

    it('should capture all operations', async () => {
      const { dbAccess, getCapturedOperations } = createMockDbAccess({ users: [] })
      const proxy = dbAccess.getProxy()

      await proxy.fetch(
        new Request('http://internal/find', {
          method: 'POST',
          body: JSON.stringify({ collection: 'users', filter: { active: true } })
        })
      )

      await proxy.fetch(
        new Request('http://internal/insertOne', {
          method: 'POST',
          body: JSON.stringify({ collection: 'users', document: { name: 'Test' } })
        })
      )

      const operations = getCapturedOperations()
      expect(operations.length).toBe(2)
      expect(operations[0].operation).toBe('find')
      expect(operations[0].params).toEqual({ collection: 'users', filter: { active: true } })
      expect(operations[1].operation).toBe('insertOne')
      expect(operations[1].params).toEqual({ collection: 'users', document: { name: 'Test' } })
    })
  })

  describe('Worker security', () => {
    it('should block network access via globalOutbound null', async () => {
      const { loader, getLastConfig } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'await fetch("http://example.com")')

      await evaluator.execute()

      const config = await getLastConfig()
      expect(config!.globalOutbound).toBeNull()
    })

    it('should only expose DB_PROXY in env', async () => {
      const { loader, getLastConfig } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return 1')

      await evaluator.execute()

      const config = await getLastConfig()
      const envKeys = Object.keys(config!.env || {})
      expect(envKeys).toEqual(['DB_PROXY'])
    })

    it('should generate sandbox code with db API', async () => {
      const { loader, getLastConfig } = createMockLoader()
      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(loader, dbAccess, 'return db.collection("users").find()')

      await evaluator.execute()

      const config = await getLastConfig()
      const sandboxCode = config!.modules['sandbox.js'] as string
      expect(sandboxCode).toContain('const db = {')
      expect(sandboxCode).toContain('collection: (name)')
    })
  })

  describe('Error handling', () => {
    it('should return error result when execution fails', async () => {
      const { loader } = createMockLoader()
      const { dbAccess } = createMockDbAccess()

      // Create a custom loader that throws
      const throwingLoader: WorkerLoader = {
        get(_id, _getCode) {
          return {
            getEntrypoint() {
              return {
                async fetch() {
                  throw new Error('Worker crashed')
                }
              }
            }
          }
        }
      }

      const evaluator = createWorkerEvaluator(throwingLoader, dbAccess, 'return 1')
      const result = await evaluator.execute()

      expect(result.success).toBe(false)
      expect(result.error).toContain('Worker crashed')
      expect(result.logs).toEqual([])
    })

    it('should handle non-Error exceptions', async () => {
      const throwingLoader: WorkerLoader = {
        get(_id, _getCode) {
          return {
            getEntrypoint() {
              return {
                async fetch() {
                  throw 'string error'
                }
              }
            }
          }
        }
      }

      const { dbAccess } = createMockDbAccess()
      const evaluator = createWorkerEvaluator(throwingLoader, dbAccess, 'return 1')
      const result = await evaluator.execute()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Execution failed')
    })
  })

  describe('EvaluatorResult interface', () => {
    it('should allow success result with value', () => {
      const result: EvaluatorResult = {
        success: true,
        value: { data: [1, 2, 3] },
        logs: ['processing...']
      }

      expect(result.success).toBe(true)
      expect(result.value).toEqual({ data: [1, 2, 3] })
      expect(result.logs).toEqual(['processing...'])
    })

    it('should allow error result', () => {
      const result: EvaluatorResult = {
        success: false,
        error: 'Something went wrong',
        logs: ['starting...', 'error!']
      }

      expect(result.success).toBe(false)
      expect(result.error).toBe('Something went wrong')
      expect(result.logs).toEqual(['starting...', 'error!'])
    })
  })
})
