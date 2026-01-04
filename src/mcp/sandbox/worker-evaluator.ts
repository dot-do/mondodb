/**
 * Worker Loader Evaluator
 *
 * Evaluates and loads Cloudflare Worker code in an isolated sandbox.
 * Uses the Worker Loader API to create isolated V8 contexts with:
 * - Network isolation (globalOutbound: null)
 * - Database access through DB_PROXY binding
 * - Console.log capture
 * - Timeout enforcement
 */

import { generateSandboxCode } from './template'
import type { WorkerLoader, WorkerCode, WorkerStub, WorkerEntrypoint } from '../../types/function'

/**
 * Result returned from sandbox code execution
 */
export interface EvaluatorResult {
  /** Whether execution succeeded */
  success: boolean
  /** Return value from the code (if success) */
  value?: unknown
  /** Captured console.log output */
  logs: string[]
  /** Error message (if !success) */
  error?: string
}

/**
 * Interface for database access passed to sandbox
 */
export interface DatabaseAccess {
  /**
   * Get a service binding/fetcher for the database proxy.
   * This is passed to the sandbox worker as DB_PROXY.
   */
  getProxy(): Fetcher
}

/**
 * Fetcher interface for service bindings
 */
export interface Fetcher {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>
}

/**
 * Worker evaluator interface
 */
export interface WorkerEvaluator {
  /** Execute the sandbox code and return results */
  execute(): Promise<EvaluatorResult>
}

/**
 * Options for creating a worker evaluator
 */
export interface EvaluatorOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Unique ID for the worker instance */
  id?: string
}

/**
 * Create a Worker Loader Evaluator for executing code in an isolated sandbox.
 *
 * @param loader - The Worker Loader binding for creating isolated workers
 * @param dbAccess - Database access provider for DB_PROXY binding
 * @param code - The user code to execute
 * @param options - Optional configuration
 * @returns WorkerEvaluator instance
 *
 * @example
 * ```typescript
 * const evaluator = createWorkerEvaluator(
 *   env.LOADER,
 *   { getProxy: () => env.DATABASE_PROXY },
 *   'return await db.collection("users").find()'
 * );
 * const result = await evaluator.execute();
 * if (result.success) {
 *   console.log('Result:', result.value);
 * }
 * ```
 */
export function createWorkerEvaluator(
  loader: WorkerLoader,
  dbAccess: DatabaseAccess,
  code: string,
  options: EvaluatorOptions = {}
): WorkerEvaluator {
  const workerId = options.id ?? `sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const timeout = options.timeout ?? 30000

  return {
    async execute(): Promise<EvaluatorResult> {
      try {
        // Generate sandbox code that wraps user code
        const sandboxCode = generateSandboxCode(code)

        // Get or create the worker with sandbox configuration
        const worker = loader.get(workerId, async (): Promise<WorkerCode> => ({
          compatibilityDate: '2025-06-01',
          compatibilityFlags: ['nodejs_compat'],
          mainModule: 'sandbox.js',
          modules: {
            'sandbox.js': sandboxCode
          },
          env: {
            DB_PROXY: dbAccess.getProxy()
          },
          globalOutbound: null // Block all network access
        }))

        // Get the entrypoint and execute with timeout
        const entrypoint = worker.getEntrypoint()

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Sandbox execution timed out after ${timeout}ms`))
          }, timeout)
        })

        // Execute with timeout race
        const response = await Promise.race([
          entrypoint.fetch(
            new Request('http://internal/evaluate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            })
          ),
          timeoutPromise
        ])

        const result = await response.json() as EvaluatorResult

        return {
          success: result.success,
          value: result.value,
          logs: result.logs ?? [],
          error: result.error
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Execution failed',
          logs: []
        }
      }
    }
  }
}

/**
 * Create a mock Worker Loader for testing purposes.
 * This allows testing without actual Worker Loader binding.
 *
 * @param mockResults - Map of worker IDs to mock results
 * @returns Mock WorkerLoader
 */
export function createMockLoader(mockResults: Map<string, EvaluatorResult> = new Map()): {
  loader: WorkerLoader
  getLastConfig: () => Promise<WorkerCode | null>
  getCapturedIds: () => string[]
} {
  let lastConfig: WorkerCode | null = null
  const capturedIds: string[] = []

  const loader: WorkerLoader = {
    get(id: string, getCode: () => Promise<WorkerCode>): WorkerStub {
      capturedIds.push(id)

      return {
        getEntrypoint(_name?: string): WorkerEntrypoint {
          return {
            async fetch(_request: Request): Promise<Response> {
              // Capture the code configuration
              lastConfig = await getCode()

              // Return mock result if available
              const mockResult = mockResults.get(id)
              if (mockResult) {
                return Response.json(mockResult)
              }

              // Default success result
              return Response.json({
                success: true,
                value: undefined,
                logs: []
              })
            }
          }
        }
      }
    }
  }

  return {
    loader,
    getLastConfig: async () => lastConfig,
    getCapturedIds: () => capturedIds
  }
}

/**
 * Create a mock database access for testing.
 *
 * @param mockData - Mock data to return from database operations
 * @returns Mock DatabaseAccess
 */
export function createMockDbAccess(mockData: Record<string, unknown[]> = {}): {
  dbAccess: DatabaseAccess
  getCapturedOperations: () => Array<{ operation: string; params: unknown }>
} {
  const capturedOperations: Array<{ operation: string; params: unknown }> = []

  const proxy: Fetcher = {
    async fetch(request: Request | string): Promise<Response> {
      const req = typeof request === 'string' ? new Request(request) : request
      const url = new URL(req.url)
      const operation = url.pathname.slice(1) // Remove leading /

      let params = {}
      if (req.method === 'POST') {
        params = await req.json()
      }

      capturedOperations.push({ operation, params })

      // Return mock data based on operation
      if (operation === 'find') {
        const p = params as { collection: string }
        return Response.json(mockData[p.collection] ?? [])
      }
      if (operation === 'findOne') {
        const p = params as { collection: string }
        const docs = mockData[p.collection] ?? []
        return Response.json(docs[0] ?? null)
      }
      if (operation === 'countDocuments') {
        const p = params as { collection: string }
        return Response.json((mockData[p.collection] ?? []).length)
      }
      if (operation === 'listCollections') {
        return Response.json(Object.keys(mockData))
      }

      // Default response for other operations
      return Response.json({ ok: true })
    }
  }

  const dbAccess: DatabaseAccess = {
    getProxy: () => proxy
  }

  return {
    dbAccess,
    getCapturedOperations: () => capturedOperations
  }
}

// =============================================================================
// Worker Loader Integration Types (RED Phase stubs - mondodb-0aao)
// =============================================================================

/**
 * Configuration options for Worker Loader evaluator
 * TODO: Implement in GREEN phase
 */
export interface WorkerLoaderConfig {
  /** Timeout in milliseconds */
  timeout?: number
  /** Custom worker ID */
  id?: string
}

/**
 * Security configuration for sandbox isolation
 * TODO: Implement in GREEN phase
 */
export interface SecurityConfig {
  /** Block all network access (fetch, connect) */
  blockNetwork: boolean
  /** Block file system access */
  blockFileSystem: boolean
  /** Maximum execution time in milliseconds */
  maxExecutionTime: number
  /** Maximum memory usage in bytes */
  maxMemory: number
}

/**
 * Extended result with execution duration
 * TODO: Implement in GREEN phase
 */
export interface ExecutionResult {
  success: boolean
  value?: unknown
  error?: string
  logs: string[]
  /** Execution duration in milliseconds */
  duration: number
}

/**
 * Worker Loader Evaluator class for direct Worker Loader integration
 * TODO: Implement in GREEN phase
 */
export class WorkerLoaderEvaluator implements WorkerEvaluator {
  constructor(
    _loader: unknown,
    _dbAccess: DatabaseAccess,
    _code: string,
    _config?: WorkerLoaderConfig
  ) {
    // Stub - not implemented
  }

  async execute(): Promise<EvaluatorResult> {
    throw new Error('WorkerLoaderEvaluator not implemented')
  }
}

/**
 * Create a Worker Loader evaluator with full integration
 * TODO: Implement in GREEN phase
 *
 * @param loader - Worker Loader binding
 * @param dbAccess - Database access provider
 * @param code - User code to execute
 * @param config - Optional configuration
 * @returns WorkerLoaderEvaluator instance
 */
export function createWorkerLoaderEvaluator(
  _loader: unknown,
  _dbAccess: DatabaseAccess,
  _code: string,
  _config?: WorkerLoaderConfig
): WorkerLoaderEvaluator {
  // Stub - not implemented
  throw new Error('createWorkerLoaderEvaluator not implemented')
}
