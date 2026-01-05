/**
 * Worker Entrypoint - Workers RPC service binding support
 *
 * Implements:
 * - MondoEntrypoint extending WorkerEntrypoint
 * - Service binding methods
 * - TypeScript declarations
 * - Environment safety
 */

import { MondoRpcTarget } from './rpc-target';
import type {
  DurableObjectNamespace,
  DurableObjectStub,
  DatabaseRef,
  CollectionRef,
  MondoEnv,
  WorkerLoader,
  WorkerCode,
  WorkerStub,
} from '../types/rpc';

// Re-export types for backward compatibility
export type {
  DurableObjectNamespace,
  DurableObjectStub,
  DatabaseRef,
  CollectionRef,
  MondoEnv,
  WorkerLoader,
  WorkerCode,
  WorkerStub,
};

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Execution context interface
 */
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/**
 * Mondo bindings interface (for service binding consumers)
 */
export interface MondoBindings {
  /** Connect to a MongoDB-compatible connection string */
  connect(connectionString: string): Promise<{ connected: boolean; database?: string }>;
  /** Get a database reference */
  db(name: string): Promise<DatabaseRef>;
  /** Get a collection reference */
  collection(dbName: string, collectionName: string): Promise<CollectionRef>;
}

/**
 * Default options for the entrypoint
 */
export const DEFAULT_OPTIONS = {
  /** Maximum batch size for batched operations */
  maxBatchSize: 100,
  /** Request timeout in milliseconds */
  timeout: 30000,
  /** Enable background cleanup */
  enableCleanup: true,
  /** Cleanup interval in milliseconds */
  cleanupInterval: 60000,
} as const;

/**
 * Entrypoint options
 */
export interface MondoEntrypointOptions {
  maxBatchSize?: number;
  timeout?: number;
  enableCleanup?: boolean;
  cleanupInterval?: number;
}

// ============================================================================
// WorkerEntrypoint Base Class
// ============================================================================

/**
 * Base class for Worker entrypoints (capnweb-style)
 */
export class WorkerEntrypoint {
  protected ctx: ExecutionContext;
  protected env: unknown;

  constructor(ctx: ExecutionContext, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }

  /**
   * Handle HTTP fetch requests
   */
  async fetch(_request: Request): Promise<Response> {
    return new Response('Method not implemented', { status: 501 });
  }
}

// ============================================================================
// Environment Validation
// ============================================================================

/**
 * Type guard for Mondo environment
 */
export function isMondoEnv(env: unknown): env is MondoEnv {
  if (!env || typeof env !== 'object') return false;
  const e = env as Record<string, unknown>;
  return (
    typeof e.MONDO_DATABASE === 'object' &&
    e.MONDO_DATABASE !== null &&
    typeof (e.MONDO_DATABASE as Record<string, unknown>).idFromName === 'function' &&
    typeof (e.MONDO_DATABASE as Record<string, unknown>).get === 'function'
  );
}

/**
 * Validate environment bindings
 */
export function validateEnv(env: unknown): boolean {
  return isMondoEnv(env);
}

// ============================================================================
// MondoEntrypoint
// ============================================================================

/**
 * MondoEntrypoint extends WorkerEntrypoint for service binding support
 *
 * Usage in wrangler.toml:
 * ```toml
 * [[services]]
 * binding = "MONDO"
 * service = "mongo.do"
 * entrypoint = "MondoEntrypoint"
 * ```
 *
 * Usage in consuming worker:
 * ```typescript
 * const result = await env.MONDO.connect('mongodb://localhost/mydb');
 * ```
 */
export class MondoEntrypoint extends WorkerEntrypoint implements MondoBindings {
  protected override env: MondoEnv;
  private rpcTarget: MondoRpcTarget;
  private entrypointOptions: Required<MondoEntrypointOptions>;
  private cleanupScheduled = false;

  constructor(ctx: ExecutionContext, env: MondoEnv) {
    super(ctx, env);

    // Validate environment bindings
    if (!validateEnv(env)) {
      throw new Error(
        'Invalid environment: MONDO_DATABASE binding is required. ' +
        'Please configure the Durable Object binding in your wrangler.toml.'
      );
    }

    this.env = env;
    this.rpcTarget = new MondoRpcTarget(env);
    this.entrypointOptions = {
      maxBatchSize: DEFAULT_OPTIONS.maxBatchSize,
      timeout: DEFAULT_OPTIONS.timeout,
      enableCleanup: DEFAULT_OPTIONS.enableCleanup,
      cleanupInterval: DEFAULT_OPTIONS.cleanupInterval,
    };
  }

  /**
   * Get the entrypoint options
   */
  get options(): Required<MondoEntrypointOptions> {
    return this.entrypointOptions;
  }

  /**
   * Handle HTTP fetch requests
   */
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint (support both /health and /api/health)
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'healthy' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Bindings check endpoint (for diagnostics)
    if (url.pathname === '/bindings') {
      const bindings = {
        MONDO_DATABASE: !!this.env.MONDO_DATABASE,
        LOADER: !!this.env.LOADER,
        LOADER_type: this.env.LOADER ? typeof this.env.LOADER : 'undefined',
        LOADER_keys: this.env.LOADER ? Object.keys(this.env.LOADER as object) : [],
      };
      return new Response(JSON.stringify(bindings, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // RPC endpoint
    if (url.pathname === '/rpc' || url.pathname.startsWith('/rpc/')) {
      const { newWorkersRpcResponse } = await import('./rpc-target');
      return newWorkersRpcResponse(this.rpcTarget, request);
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Connect to a MongoDB-compatible connection string
   */
  async connect(connectionString: string): Promise<{ connected: boolean; database?: string }> {
    return this.rpcTarget.connect(connectionString);
  }

  /**
   * Get a database reference
   */
  async db(name: string): Promise<DatabaseRef> {
    return this.rpcTarget.db(name);
  }

  /**
   * Get a collection reference
   */
  async collection(dbName: string, collectionName: string): Promise<CollectionRef> {
    return this.rpcTarget.collection(dbName, collectionName);
  }

  /**
   * Execute a find operation
   */
  async find(dbName: string, collectionName: string, query: Record<string, unknown>): Promise<unknown[]> {
    return this.rpcTarget.find(dbName, collectionName, query);
  }

  /**
   * Execute an insertOne operation
   */
  async insertOne(dbName: string, collectionName: string, document: Record<string, unknown>): Promise<{ insertedId: string }> {
    return this.rpcTarget.insertOne(dbName, collectionName, document);
  }

  /**
   * Execute an updateOne operation
   */
  async updateOne(
    dbName: string,
    collectionName: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    return this.rpcTarget.updateOne(dbName, collectionName, filter, update);
  }

  /**
   * Execute a deleteOne operation
   */
  async deleteOne(dbName: string, collectionName: string, filter: Record<string, unknown>): Promise<{ deletedCount: number }> {
    return this.rpcTarget.deleteOne(dbName, collectionName, filter);
  }

  /**
   * Schedule background cleanup task
   */
  scheduleCleanup(): void {
    if (this.cleanupScheduled) return;
    this.cleanupScheduled = true;

    const cleanupPromise = this.runCleanup();
    this.ctx.waitUntil(cleanupPromise);
  }

  /**
   * Run cleanup task
   */
  private async runCleanup(): Promise<void> {
    // Placeholder for cleanup logic
    // Could include: clearing caches, closing stale connections, etc.
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Get the underlying RPC target (for testing)
   */
  getRpcTarget(): MondoRpcTarget {
    return this.rpcTarget;
  }
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { MondoRpcTarget, newWorkersRpcResponse } from './rpc-target';
// Note: All RPC types are consolidated in '../types/rpc' and re-exported at the top of this file.
// The following types are re-exported from '../types/rpc' for convenience:
export type { DurableObjectId, RpcRequest, RpcResponse, BatchResponse } from '../types/rpc';
