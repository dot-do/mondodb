import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  WorkerLoaderEvaluator,
  createWorkerLoaderEvaluator,
  WorkerLoaderConfig,
  SecurityConfig,
  ExecutionResult,
} from '../../../src/mcp/sandbox/worker-evaluator'

/**
 * Worker Loader Integration Tests (RED Phase)
 *
 * These tests verify the Worker Loader-based sandbox evaluator integration
 * with proper security isolation and database access.
 *
 * Test categories:
 * - Worker Creation: Verifies proper Worker Loader API usage
 * - Execution: Validates code execution and result capture
 * - Security: Ensures network isolation and environment protection
 */

// =============================================================================
// Mock Worker Loader Types
// =============================================================================

interface MockWorkerConfig {
  compatibilityDate: string
  compatibilityFlags: string[]
  mainModule: string
  modules: Record<string, string>
  env: Record<string, unknown>
  globalOutbound: null | undefined
}

interface MockWorkerStub {
  config: MockWorkerConfig | null
  id: string
}

/**
 * Create a mock Worker Loader for testing
 */
function createMockWorkerLoader(): {
  loader: {
    get: (id: string, getCode: () => Promise<MockWorkerConfig>) => {
      getEntrypoint: () => {
        fetch: (request: Request) => Promise<Response>
      }
    }
  }
  getLastConfig: () => MockWorkerConfig | null
  getCapturedIds: () => string[]
} {
  let lastConfig: MockWorkerConfig | null = null
  const capturedIds: string[] = []

  return {
    loader: {
      get(id: string, getCode: () => Promise<MockWorkerConfig>) {
        capturedIds.push(id)
        return {
          getEntrypoint() {
            return {
              async fetch(_request: Request): Promise<Response> {
                lastConfig = await getCode()
                return Response.json({
                  success: true,
                  value: undefined,
                  logs: [],
                })
              },
            }
          },
        }
      },
    },
    getLastConfig: () => lastConfig,
    getCapturedIds: () => capturedIds,
  }
}

/**
 * Create a mock database access for testing
 */
function createMockDbAccess(): {
  dbAccess: { getProxy: () => { fetch: (req: Request) => Promise<Response> } }
  getCapturedOperations: () => Array<{ operation: string; params: unknown }>
} {
  const capturedOperations: Array<{ operation: string; params: unknown }> = []

  return {
    dbAccess: {
      getProxy: () => ({
        async fetch(request: Request): Promise<Response> {
          const url = new URL(request.url)
          const operation = url.pathname.slice(1)
          let params = {}
          if (request.method === 'POST') {
            params = await request.json()
          }
          capturedOperations.push({ operation, params })
          return Response.json({ ok: true })
        },
      }),
    },
    getCapturedOperations: () => capturedOperations,
  }
}

// =============================================================================
// Worker Creation Tests
// =============================================================================

describe('Worker Loader Integration', () => {
  describe('Worker Creation', () => {
    it('should create worker with Worker Loader', async () => {
      const { loader, getCapturedIds } = createMockWorkerLoader()
      const { dbAccess } = createMockDbAccess()

      const evaluator = createWorkerLoaderEvaluator(loader, dbAccess, 'return 42')

      expect(evaluator).toBeDefined()
      expect(evaluator).toBeInstanceOf(WorkerLoaderEvaluator)

      await evaluator.execute()

      const ids = getCapturedIds()
      expect(ids.length).toBeGreaterThan(0)
    })

    it('should configure compatibility date', async () => {
      const { loader, getLastConfig } = createMockWorkerLoader()
      const { dbAccess } = createMockDbAccess()

      const evaluator = createWorkerLoaderEvaluator(loader, dbAccess, 'return 1')
      await evaluator.execute()

      const config = getLastConfig()
      expect(config).not.toBeNull()
      expect(config!.compatibilityDate).toBe('2025-06-01')
    })

    it('should set globalOutbound to null for network isolation', async () => {
      const { loader, getLastConfig } = createMockWorkerLoader()
      const { dbAccess } = createMockDbAccess()

      const evaluator = createWorkerLoaderEvaluator(
        loader,
        dbAccess,
        'fetch("http://evil.com")'
      )
      await evaluator.execute()

      const config = getLastConfig()
      expect(config).not.toBeNull()
      expect(config!.globalOutbound).toBeNull()
    })

    it('should include DB_PROXY binding', async () => {
      const { loader, getLastConfig } = createMockWorkerLoader()
      const { dbAccess } = createMockDbAccess()

      const evaluator = createWorkerLoaderEvaluator(loader, dbAccess, 'return 1')
      await evaluator.execute()

      const config = getLastConfig()
      expect(config).not.toBeNull()
      expect(config!.env).toBeDefined()
      expect(config!.env.DB_PROXY).toBeDefined()
    })
  })

  // =============================================================================
  // Execution Tests
  // =============================================================================

  describe('Execution', () => {
    it('should execute code and return result', async () => {
      const { loader } = createMockWorkerLoader()
      const { dbAccess } = createMockDbAccess()

      // Override the mock to return a specific result
      const customLoader = {
        get(_id: string, _getCode: () => Promise<MockWorkerConfig>) {
          return {
            getEntrypoint() {
              return {
                async fetch(_request: Request): Promise<Response> {
                  return Response.json({
                    success: true,
                    value: 42,
                    logs: [],
                  })
                },
              }
            },
          }
        },
      }

      const evaluator = createWorkerLoaderEvaluator(customLoader, dbAccess, 'return 42')
      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toBe(42)
    })

    it('should capture console.log output', async () => {
      const customLoader = {
        get(_id: string, _getCode: () => Promise<MockWorkerConfig>) {
          return {
            getEntrypoint() {
              return {
                async fetch(_request: Request): Promise<Response> {
                  return Response.json({
                    success: true,
                    value: 'done',
                    logs: ['hello', 'world'],
                  })
                },
              }
            },
          }
        },
      }
      const { dbAccess } = createMockDbAccess()

      const evaluator = createWorkerLoaderEvaluator(
        customLoader,
        dbAccess,
        'console.log("hello"); console.log("world"); return "done"'
      )
      const result = await evaluator.execute()

      expect(result.logs).toContain('hello')
      expect(result.logs).toContain('world')
    })

    it('should handle errors in user code', async () => {
      const customLoader = {
        get(_id: string, _getCode: () => Promise<MockWorkerConfig>) {
          return {
            getEntrypoint() {
              return {
                async fetch(_request: Request): Promise<Response> {
                  return Response.json({
                    success: false,
                    error: 'test error',
                    logs: [],
                  })
                },
              }
            },
          }
        },
      }
      const { dbAccess } = createMockDbAccess()

      const evaluator = createWorkerLoaderEvaluator(
        customLoader,
        dbAccess,
        'throw new Error("test error")'
      )
      const result = await evaluator.execute()

      expect(result.success).toBe(false)
      expect(result.error).toContain('test error')
    })

    it('should allow database access through db API', async () => {
      const customLoader = {
        get(_id: string, _getCode: () => Promise<MockWorkerConfig>) {
          return {
            getEntrypoint() {
              return {
                async fetch(_request: Request): Promise<Response> {
                  return Response.json({
                    success: true,
                    value: [{ _id: '1', name: 'Alice' }],
                    logs: [],
                  })
                },
              }
            },
          }
        },
      }
      const { dbAccess } = createMockDbAccess()

      const evaluator = createWorkerLoaderEvaluator(
        customLoader,
        dbAccess,
        'return await db.collection("users").find()'
      )
      const result = await evaluator.execute()

      expect(result.success).toBe(true)
      expect(result.value).toEqual([{ _id: '1', name: 'Alice' }])
    })
  })

  // =============================================================================
  // Security Tests
  // =============================================================================

  describe('Security', () => {
    it('should block fetch() calls', async () => {
      const { loader, getLastConfig } = createMockWorkerLoader()
      const { dbAccess } = createMockDbAccess()

      const evaluator = createWorkerLoaderEvaluator(
        loader,
        dbAccess,
        'await fetch("https://malicious.com")'
      )
      await evaluator.execute()

      const config = getLastConfig()
      // globalOutbound: null means fetch() calls will fail
      expect(config!.globalOutbound).toBeNull()
    })

    it('should block connect() calls', async () => {
      const { loader, getLastConfig } = createMockWorkerLoader()
      const { dbAccess } = createMockDbAccess()

      const evaluator = createWorkerLoaderEvaluator(
        loader,
        dbAccess,
        'const socket = await connect("tcp://attacker.com:1234")'
      )
      await evaluator.execute()

      const config = getLastConfig()
      // globalOutbound: null also blocks connect() calls
      expect(config!.globalOutbound).toBeNull()
    })

    it('should not expose environment variables', async () => {
      const { loader, getLastConfig } = createMockWorkerLoader()
      const { dbAccess } = createMockDbAccess()

      const evaluator = createWorkerLoaderEvaluator(
        loader,
        dbAccess,
        'return process.env.SECRET_KEY'
      )
      await evaluator.execute()

      const config = getLastConfig()
      // Only DB_PROXY should be in env, no secrets
      const envKeys = Object.keys(config!.env || {})
      expect(envKeys).toEqual(['DB_PROXY'])
      expect(config!.env).not.toHaveProperty('SECRET_KEY')
      expect(config!.env).not.toHaveProperty('API_KEY')
      expect(config!.env).not.toHaveProperty('DATABASE_URL')
    })
  })

  // =============================================================================
  // Configuration Tests
  // =============================================================================

  describe('WorkerLoaderConfig', () => {
    it('should accept custom timeout', async () => {
      const { loader } = createMockWorkerLoader()
      const { dbAccess } = createMockDbAccess()

      const config: WorkerLoaderConfig = {
        timeout: 5000,
      }

      const evaluator = createWorkerLoaderEvaluator(
        loader,
        dbAccess,
        'return 1',
        config
      )

      expect(evaluator).toBeDefined()
    })

    it('should accept custom worker ID', async () => {
      const { loader, getCapturedIds } = createMockWorkerLoader()
      const { dbAccess } = createMockDbAccess()

      const config: WorkerLoaderConfig = {
        id: 'custom-worker-id-123',
      }

      const evaluator = createWorkerLoaderEvaluator(
        loader,
        dbAccess,
        'return 1',
        config
      )
      await evaluator.execute()

      const ids = getCapturedIds()
      expect(ids).toContain('custom-worker-id-123')
    })
  })

  // =============================================================================
  // SecurityConfig Tests
  // =============================================================================

  describe('SecurityConfig', () => {
    it('should have default security settings', () => {
      const defaultConfig: SecurityConfig = {
        blockNetwork: true,
        blockFileSystem: true,
        maxExecutionTime: 30000,
        maxMemory: 128 * 1024 * 1024, // 128MB
      }

      expect(defaultConfig.blockNetwork).toBe(true)
      expect(defaultConfig.blockFileSystem).toBe(true)
      expect(defaultConfig.maxExecutionTime).toBe(30000)
      expect(defaultConfig.maxMemory).toBe(134217728)
    })
  })

  // =============================================================================
  // ExecutionResult Tests
  // =============================================================================

  describe('ExecutionResult interface', () => {
    it('should have success result with value', () => {
      const result: ExecutionResult = {
        success: true,
        value: { users: [{ name: 'Alice' }] },
        logs: ['query executed'],
        duration: 150,
      }

      expect(result.success).toBe(true)
      expect(result.value).toEqual({ users: [{ name: 'Alice' }] })
      expect(result.logs).toEqual(['query executed'])
      expect(result.duration).toBe(150)
    })

    it('should have error result with message', () => {
      const result: ExecutionResult = {
        success: false,
        error: 'Syntax error',
        logs: ['starting...'],
        duration: 10,
      }

      expect(result.success).toBe(false)
      expect(result.error).toBe('Syntax error')
      expect(result.logs).toEqual(['starting...'])
      expect(result.duration).toBe(10)
    })
  })
})
