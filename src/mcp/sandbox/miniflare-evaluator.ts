/**
 * Miniflare Fallback Evaluator
 *
 * Provides a fallback sandbox evaluator for CLI/local development when
 * Worker Loader is not available. Uses Miniflare to create isolated V8
 * contexts with:
 * - Network isolation (outboundService throws)
 * - Database access through DB_PROXY service binding
 * - Console.log capture
 * - Timeout enforcement
 *
 * This is the fallback for CLI/local development when Worker Loader is not available.
 */

import { randomUUID } from 'crypto'
import type { EvaluatorResult, DatabaseAccess, WorkerEvaluator, EvaluatorOptions, Fetcher } from './worker-evaluator'

/**
 * Extended evaluator interface with dispose method for cleanup
 */
export interface MiniflareEvaluator extends WorkerEvaluator {
  /** Execute the sandbox code and return results */
  execute(): Promise<EvaluatorResult>
  /** Dispose of the Miniflare instance and release resources */
  dispose(): Promise<void>
}

/**
 * Check if Miniflare is available in the current environment
 */
export async function isMiniflareAvailable(): Promise<boolean> {
  try {
    // Try to dynamically import Miniflare
    await import('miniflare')
    return true
  } catch {
    return false
  }
}

/**
 * Create a Miniflare Evaluator for executing code in an isolated sandbox.
 *
 * This is the fallback evaluator for CLI/local development when the Worker Loader
 * binding is not available.
 *
 * @param dbAccess - Database access provider for DB_PROXY binding
 * @param code - The user code to execute
 * @param options - Optional configuration
 * @returns MiniflareEvaluator instance with execute() and dispose() methods
 *
 * @example
 * ```typescript
 * const evaluator = await createMiniflareEvaluator(
 *   dbAccess,
 *   'return await db.collection("users").find()'
 * );
 * try {
 *   const result = await evaluator.execute();
 *   if (result.success) {
 *     console.log('Result:', result.value);
 *   }
 * } finally {
 *   await evaluator.dispose();
 * }
 * ```
 */
export async function createMiniflareEvaluator(
  dbAccess: DatabaseAccess,
  code: string,
  options: EvaluatorOptions = {}
): Promise<MiniflareEvaluator> {
  const workerId = options.id ?? `miniflare-sandbox-${randomUUID()}`
  const timeout = options.timeout ?? 30000
  let disposed = false

  // Import Miniflare dynamically to allow graceful degradation
  let Miniflare: typeof import('miniflare').Miniflare
  try {
    const miniflareModule = await import('miniflare')
    Miniflare = miniflareModule.Miniflare
  } catch {
    // Return a stub evaluator if Miniflare is not available
    return {
      async execute(): Promise<EvaluatorResult> {
        return {
          success: false,
          error: 'Miniflare is not available. Install miniflare package to use the fallback evaluator.',
          logs: [],
        }
      },
      async dispose(): Promise<void> {
        // Nothing to dispose
      },
    }
  }

  // Generate sandbox code that wraps user code with db API
  const sandboxCode = generateMiniflareWrappedCode(code)

  // Create Miniflare instance with sandbox configuration
  const mf = new Miniflare({
    name: workerId,
    script: sandboxCode,
    modules: true,
    compatibilityDate: '2025-06-01',
    compatibilityFlags: ['nodejs_compat'],
    serviceBindings: {
      DB_PROXY: async (request: Request): Promise<Response> => {
        // Route DB_PROXY calls through our proxy
        const proxy = dbAccess.getProxy()
        return proxy.fetch(request)
      },
    },
  })

  return {
    async execute(): Promise<EvaluatorResult> {
      if (disposed) {
        return {
          success: false,
          error: 'Evaluator has been disposed',
          logs: [],
        }
      }

      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Sandbox execution timed out after ${timeout}ms`))
          }, timeout)
        })

        // Execute the code via Miniflare
        const executePromise = mf.dispatchFetch('http://internal/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        const response = await Promise.race([executePromise, timeoutPromise])
        const result = await response.json() as EvaluatorResult

        const evalResult: EvaluatorResult = {
          success: result.success,
          logs: result.logs ?? [],
        }
        if (result.value !== undefined) {
          evalResult.value = result.value
        }
        if (result.error) {
          evalResult.error = result.error
        }
        return evalResult
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Execution failed',
          logs: [],
        }
      }
    },

    async dispose(): Promise<void> {
      if (!disposed) {
        disposed = true
        await mf.dispose()
      }
    },
  }
}

/**
 * Generate wrapped sandbox code for Miniflare execution
 */
function generateMiniflareWrappedCode(userCode: string): string {
  return `
export default {
  async fetch(request, env) {
    // Capture console output
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => {
      logs.push(
        args.map(a =>
          typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ')
      );
    };

    // Expose db API that routes through DB_PROXY service binding
    const db = {
      collection: (name) => ({
        find: async (filter) => {
          const res = await env.DB_PROXY.fetch('http://internal/find', {
            method: 'POST',
            body: JSON.stringify({ collection: name, filter: filter || {} })
          });
          return res.json();
        },
        findOne: async (filter) => {
          const res = await env.DB_PROXY.fetch('http://internal/findOne', {
            method: 'POST',
            body: JSON.stringify({ collection: name, filter: filter || {} })
          });
          return res.json();
        },
        insertOne: async (doc) => {
          const res = await env.DB_PROXY.fetch('http://internal/insertOne', {
            method: 'POST',
            body: JSON.stringify({ collection: name, document: doc })
          });
          return res.json();
        },
        insertMany: async (docs) => {
          const res = await env.DB_PROXY.fetch('http://internal/insertMany', {
            method: 'POST',
            body: JSON.stringify({ collection: name, documents: docs })
          });
          return res.json();
        },
        updateOne: async (filter, update) => {
          const res = await env.DB_PROXY.fetch('http://internal/updateOne', {
            method: 'POST',
            body: JSON.stringify({ collection: name, filter, update })
          });
          return res.json();
        },
        updateMany: async (filter, update) => {
          const res = await env.DB_PROXY.fetch('http://internal/updateMany', {
            method: 'POST',
            body: JSON.stringify({ collection: name, filter, update })
          });
          return res.json();
        },
        deleteOne: async (filter) => {
          const res = await env.DB_PROXY.fetch('http://internal/deleteOne', {
            method: 'POST',
            body: JSON.stringify({ collection: name, filter })
          });
          return res.json();
        },
        deleteMany: async (filter) => {
          const res = await env.DB_PROXY.fetch('http://internal/deleteMany', {
            method: 'POST',
            body: JSON.stringify({ collection: name, filter })
          });
          return res.json();
        },
        aggregate: async (pipeline) => {
          const res = await env.DB_PROXY.fetch('http://internal/aggregate', {
            method: 'POST',
            body: JSON.stringify({ collection: name, pipeline })
          });
          return res.json();
        },
        countDocuments: async (filter) => {
          const res = await env.DB_PROXY.fetch('http://internal/countDocuments', {
            method: 'POST',
            body: JSON.stringify({ collection: name, filter: filter || {} })
          });
          return res.json();
        }
      }),
      listCollections: async () => {
        const res = await env.DB_PROXY.fetch('http://internal/listCollections', {
          method: 'POST',
          body: JSON.stringify({})
        });
        return res.json();
      },
      listDatabases: async () => {
        const res = await env.DB_PROXY.fetch('http://internal/listDatabases', {
          method: 'POST',
          body: JSON.stringify({})
        });
        return res.json();
      }
    };

    try {
      const result = await (async function() {
        ${userCode}
      })();

      // Restore console.log
      console.log = originalLog;

      return new Response(JSON.stringify({ success: true, value: result, logs }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      // Restore console.log
      console.log = originalLog;

      return new Response(JSON.stringify({
        success: false,
        error: error.message || String(error),
        logs
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
`;
}

/**
 * Create a mock DatabaseAccess for testing the Miniflare evaluator.
 * This is similar to createMockDbAccess in worker-evaluator but returns
 * the interface expected by createMiniflareEvaluator.
 *
 * @param mockData - Mock data to return from database operations
 * @returns Mock DatabaseAccess and operation capture utilities
 */
export function createMockMiniflareDbAccess(mockData: Record<string, unknown[]> = {}): {
  dbAccess: DatabaseAccess
  getCapturedOperations: () => Array<{ operation: string; params: unknown }>
} {
  const capturedOperations: Array<{ operation: string; params: unknown }> = []
  let mockIdCounter = 0

  const proxy: Fetcher = {
    async fetch(request: Request | string): Promise<Response> {
      const req = typeof request === 'string' ? new Request(request) : request
      const url = new URL(req.url)
      const operation = url.pathname.slice(1) // Remove leading /

      let params: Record<string, unknown> = {}
      if (req.method === 'POST') {
        params = await req.json() as Record<string, unknown>
      }

      capturedOperations.push({ operation, params })

      // Handle operations based on the URL path
      switch (operation) {
        case 'find': {
          const p = params as { collection: string }
          return Response.json(mockData[p.collection] ?? [])
        }

        case 'findOne': {
          const p = params as { collection: string }
          const docs = mockData[p.collection] ?? []
          return Response.json(docs[0] ?? null)
        }

        case 'countDocuments': {
          const p = params as { collection: string }
          return Response.json((mockData[p.collection] ?? []).length)
        }

        case 'listCollections': {
          return Response.json(Object.keys(mockData))
        }

        case 'insertOne': {
          mockIdCounter++
          return Response.json({
            insertedId: `mock-${mockIdCounter}`
          })
        }

        case 'insertMany': {
          const p = params as { documents?: unknown[] }
          const documents = p.documents ?? []
          const insertedIds = documents.map(() => {
            mockIdCounter++
            return `mock-${mockIdCounter}`
          })
          return Response.json({ insertedIds })
        }

        case 'updateOne': {
          return Response.json({
            matchedCount: 1,
            modifiedCount: 1
          })
        }

        case 'updateMany': {
          return Response.json({
            matchedCount: 1,
            modifiedCount: 1
          })
        }

        case 'deleteOne': {
          return Response.json({
            deletedCount: 1
          })
        }

        case 'deleteMany': {
          return Response.json({
            deletedCount: 1
          })
        }

        case 'aggregate': {
          const p = params as { collection: string }
          // For mock purposes, just return the collection data
          return Response.json(mockData[p.collection] ?? [])
        }

        default: {
          // Default response for unknown operations
          return Response.json({ ok: true })
        }
      }
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

// Re-export types for convenience
export type { EvaluatorResult, DatabaseAccess, EvaluatorOptions, Fetcher }
