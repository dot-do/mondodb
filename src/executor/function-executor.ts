/**
 * FunctionExecutor - Secure execution of user functions via worker-loader
 *
 * Uses Cloudflare's worker-loader binding to execute arbitrary JavaScript
 * in isolated V8 contexts with:
 * - globalOutbound: null (no network access)
 * - Empty env (no binding access)
 * - Timeout enforcement
 */

import type { WorkerLoader, WorkerCode, FunctionResult } from '../types/function'

interface Env {
  LOADER?: WorkerLoader
}

export class FunctionExecutor {
  private env: Env

  constructor(env: Env) {
    this.env = env
  }

  /**
   * Execute a function with given arguments
   */
  async execute(body: string, args: unknown[], timeout = 5000): Promise<unknown> {
    if (!this.env.LOADER) {
      throw new Error(
        '$function requires worker_loaders binding. ' +
        'Add to wrangler.jsonc: "worker_loaders": [{ "binding": "LOADER" }]'
      )
    }

    const normalizedBody = this.normalizeBody(body)
    const hash = await this.hashFunction(normalizedBody)

    const worker = this.env.LOADER.get(`fn-${hash}`, async (): Promise<WorkerCode> => ({
      compatibilityDate: '2024-09-25',
      mainModule: 'fn.js',
      modules: {
        'fn.js': this.generateWorkerCode(normalizedBody, false)
      },
      globalOutbound: null,
      env: {}
    }))

    const response = await worker.getEntrypoint().fetch(
      new Request('http://internal/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args, timeout })
      })
    )

    const result = await response.json() as { result?: unknown; error?: string }

    if (result.error) {
      throw new Error(`$function execution failed: ${result.error}`)
    }

    return result.result
  }

  /**
   * Execute a function for multiple arg sets in a single isolate (batch mode)
   */
  async executeBatch(body: string, argsArray: unknown[][], timeout = 10000): Promise<unknown[]> {
    if (!this.env.LOADER) {
      throw new Error(
        '$function requires worker_loaders binding. ' +
        'Add to wrangler.jsonc: "worker_loaders": [{ "binding": "LOADER" }]'
      )
    }

    const normalizedBody = this.normalizeBody(body)
    const hash = await this.hashFunction(normalizedBody)

    const worker = this.env.LOADER.get(`fn-batch-${hash}`, async (): Promise<WorkerCode> => ({
      compatibilityDate: '2024-09-25',
      mainModule: 'fn.js',
      modules: {
        'fn.js': this.generateWorkerCode(normalizedBody, true)
      },
      globalOutbound: null,
      env: {}
    }))

    const response = await worker.getEntrypoint().fetch(
      new Request('http://internal/execute-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ argsArray, timeout })
      })
    )

    const result = await response.json() as { results?: unknown[]; error?: string }

    if (result.error) {
      throw new Error(`$function batch execution failed: ${result.error}`)
    }

    return result.results ?? []
  }

  /**
   * Normalize function body to consistent format
   */
  private normalizeBody(body: string): string {
    const trimmed = body.trim()
    // Wrap function declarations in parentheses for invocation
    if (trimmed.startsWith('function')) {
      return `(${trimmed})`
    }
    return trimmed
  }

  /**
   * Generate SHA-256 hash of function body for caching
   */
  private async hashFunction(body: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(body)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16) // Use first 16 chars for shorter IDs
  }

  /**
   * Generate the worker code that executes user functions
   */
  private generateWorkerCode(body: string, isBatch: boolean): string {
    if (isBatch) {
      return `
export default {
  async fetch(request) {
    try {
      const { argsArray, timeout = 10000 } = await request.json();
      const fn = ${body};

      const executeWithTimeout = async (args) => {
        const result = fn(...args);
        if (result instanceof Promise) {
          return Promise.race([
            result,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Function execution timeout')), timeout)
            )
          ]);
        }
        return result;
      };

      const results = await Promise.all(argsArray.map(args => executeWithTimeout(args)));
      return Response.json({ results });
    } catch (err) {
      return Response.json({ error: err.message });
    }
  }
}
`
    }

    return `
export default {
  async fetch(request) {
    try {
      const { args, timeout = 5000 } = await request.json();
      const fn = ${body};
      const result = fn(...args);

      // Enforce timeout for async functions
      if (result instanceof Promise) {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Function execution timeout')), timeout)
        );
        const finalResult = await Promise.race([result, timeoutPromise]);
        return Response.json({ result: finalResult });
      }

      return Response.json({ result });
    } catch (err) {
      return Response.json({ error: err.message });
    }
  }
}
`
  }
}
