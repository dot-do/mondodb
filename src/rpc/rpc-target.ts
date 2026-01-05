/**
 * RPC Target - Server-side RPC handler for capnweb-style Workers RPC
 *
 * Implements:
 * - MondoRpcTarget extending RpcTarget base class
 * - Request routing to Durable Object stubs
 * - HTTP batch protocol support
 * - Promise pipelining for chained operations
 */

import type {
  DurableObjectNamespace,
  DurableObjectId,
  DurableObjectStub,
  MondoEnv,
  RpcRequest,
  RpcResponse,
  BatchResponse,
  DatabaseRef,
  CollectionRef,
  BatchedExecutorOptions,
  PipelineOp,
} from '../types/rpc'

// Re-export types for backward compatibility
export type {
  DurableObjectNamespace,
  DurableObjectId,
  DurableObjectStub,
  MondoEnv,
  RpcRequest,
  RpcResponse,
  BatchResponse,
  DatabaseRef,
  CollectionRef,
  BatchedExecutorOptions,
  PipelineOp,
}

// ============================================================================
// RpcTarget Base Class
// ============================================================================

/**
 * Base class for RPC targets (capnweb-style)
 */
export class RpcTarget {
  protected methods: Map<string, (...args: unknown[]) => Promise<unknown>> = new Map();

  /**
   * Allowlist of methods that can be invoked via RPC.
   * Subclasses should override this to define their allowed methods.
   * This prevents invocation of inherited methods like constructor, __proto__, toString, etc.
   */
  protected allowedMethods: Set<string> = new Set();

  /**
   * Register a method handler
   */
  protected registerMethod(name: string, handler: (...args: unknown[]) => Promise<unknown>): void {
    this.methods.set(name, handler);
  }

  /**
   * Check if a method exists and is allowed
   */
  hasMethod(name: string): boolean {
    // Only return true if the method is in the allowlist or registered methods
    if (this.methods.has(name)) {
      return true;
    }
    if (this.allowedMethods.has(name) && typeof (this as Record<string, unknown>)[name] === 'function') {
      return true;
    }
    return false;
  }

  /**
   * Invoke a method by name
   */
  async invoke(method: string, params: unknown[]): Promise<unknown> {
    // First check registered methods (these are always allowed)
    const handler = this.methods.get(method);
    if (handler) {
      return handler.apply(this, params);
    }

    // For class methods, enforce the allowlist to prevent prototype pollution
    // and invocation of inherited methods like constructor, __proto__, toString, etc.
    if (!this.allowedMethods.has(method)) {
      throw new Error(`Method not allowed: ${method}`);
    }

    // Then check class methods
    const fn = (this as Record<string, unknown>)[method];
    if (typeof fn === 'function') {
      return (fn as (...args: unknown[]) => Promise<unknown>).apply(this, params);
    }

    throw new Error(`Method not found: ${method}`);
  }
}

// ============================================================================
// MondoRpcTarget - MongoDB API over RPC
// ============================================================================

/**
 * MondoRpcTarget provides MongoDB-compatible API via Workers RPC
 */
export class MondoRpcTarget extends RpcTarget {
  private env: MondoEnv;
  private currentConnectionString: string | null = null;
  private databases: Map<string, DatabaseRef> = new Map();

  /**
   * Explicit allowlist of methods that can be invoked via RPC.
   * This prevents invocation of inherited methods like constructor, __proto__, toString, etc.
   */
  protected override allowedMethods = new Set([
    'connect',
    'db',
    'collection',
    'find',
    'insertOne',
    'updateOne',
    'deleteOne',
  ]);

  constructor(env: MondoEnv) {
    super();
    this.env = env;
  }

  /**
   * Connect to a MongoDB-compatible connection string
   */
  async connect(connectionString: string): Promise<{ connected: boolean; database?: string }> {
    this.currentConnectionString = connectionString;

    // Parse connection string to extract database name
    const url = new URL(connectionString.replace('mongodb://', 'http://'));
    const dbName = url.pathname.slice(1) || 'default';

    // Get or create the Durable Object stub for this database
    const id = this.env.MONDO_DATABASE.idFromName(dbName);
    const stub = this.env.MONDO_DATABASE.get(id);

    this.databases.set(dbName, { name: dbName, stub });

    return { connected: true, database: dbName };
  }

  /**
   * Get the current connection string
   */
  get connectionString(): string | null {
    return this.currentConnectionString;
  }

  /**
   * Get a database reference
   */
  async db(name: string): Promise<DatabaseRef> {
    // Check if we already have this database
    let dbRef = this.databases.get(name);

    if (!dbRef) {
      // Create new Durable Object stub for this database
      const id = this.env.MONDO_DATABASE.idFromName(name);
      const stub = this.env.MONDO_DATABASE.get(id);
      dbRef = { name, stub };
      this.databases.set(name, dbRef);
    }

    return dbRef;
  }

  /**
   * Get a collection reference
   */
  async collection(dbName: string, collectionName: string): Promise<CollectionRef> {
    const dbRef = await this.db(dbName);
    return {
      dbName,
      collectionName,
      stub: dbRef.stub,
    };
  }

  /**
   * Execute a find operation
   */
  async find(dbName: string, collectionName: string, query: Record<string, unknown>): Promise<unknown[]> {
    const dbRef = await this.db(dbName);
    const response = await dbRef.stub.fetch('http://internal/find', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: collectionName, query }),
    });
    return response.json();
  }

  /**
   * Execute an insertOne operation
   */
  async insertOne(dbName: string, collectionName: string, document: Record<string, unknown>): Promise<{ insertedId: string }> {
    const dbRef = await this.db(dbName);
    const response = await dbRef.stub.fetch('http://internal/insertOne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: collectionName, document }),
    });
    return response.json();
  }

  /**
   * Execute an updateOne operation
   */
  async updateOne(dbName: string, collectionName: string, filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ matchedCount: number; modifiedCount: number }> {
    const dbRef = await this.db(dbName);
    const response = await dbRef.stub.fetch('http://internal/updateOne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: collectionName, filter, update }),
    });
    return response.json();
  }

  /**
   * Execute a deleteOne operation
   */
  async deleteOne(dbName: string, collectionName: string, filter: Record<string, unknown>): Promise<{ deletedCount: number }> {
    const dbRef = await this.db(dbName);
    const response = await dbRef.stub.fetch('http://internal/deleteOne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: collectionName, filter }),
    });
    return response.json();
  }
}

// ============================================================================
// Workers RPC Response Handler
// ============================================================================

/**
 * Create a Workers RPC response from a target and request
 */
export async function newWorkersRpcResponse(target: RpcTarget, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const isBatch = url.pathname.endsWith('/batch');

  try {
    const body = await request.json() as RpcRequest | RpcRequest[];

    if (isBatch && Array.isArray(body)) {
      // Handle batch requests
      const results = await Promise.all(
        body.map(async (req) => {
          try {
            const result = await target.invoke(req.method, req.params);
            return { id: req.id, result };
          } catch (error) {
            return {
              id: req.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        })
      );

      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle single request
    const req = body as RpcRequest;

    if (!target.hasMethod(req.method)) {
      return new Response(
        JSON.stringify({ error: `Method not found: ${req.method}` }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const result = await target.invoke(req.method, req.params);

    return new Response(JSON.stringify({ id: req.id, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ============================================================================
// Batched RPC Executor
// ============================================================================

/**
 * Batched RPC executor that coalesces multiple requests
 */
export class BatchedRpcExecutor {
  private stub: DurableObjectStub;
  private options: Required<BatchedExecutorOptions>;
  private queue: Array<{
    method: string;
    params: Record<string, unknown>;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(stub: DurableObjectStub, options: BatchedExecutorOptions = {}) {
    this.stub = stub;
    this.options = {
      maxBatchSize: options.maxBatchSize ?? 100,
      flushInterval: options.flushInterval ?? 10,
    };
  }

  /**
   * Execute a method with batching
   */
  execute(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({ method, params, resolve, reject });

      // Auto-flush when batch size is reached
      if (this.queue.length >= this.options.maxBatchSize) {
        this.flush();
      } else if (!this.flushTimer) {
        // Schedule flush after interval
        this.flushTimer = setTimeout(() => this.flush(), this.options.flushInterval);
      }
    });
  }

  /**
   * Flush pending requests
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    // Process in batches
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.options.maxBatchSize);

      try {
        const response = await this.stub.fetch('http://internal/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch.map((item, index) => ({
            id: String(index),
            method: item.method,
            params: item.params,
          }))),
        });

        const { results } = await response.json() as BatchResponse;

        batch.forEach((item, index) => {
          const result = results[index];
          if (result) {
            if (result.error) {
              item.reject(new Error(result.error));
            } else {
              item.resolve(result.result);
            }
          } else {
            item.reject(new Error('Missing result for batch item'));
          }
        });
      } catch (error) {
        // Reject all items in the batch
        batch.forEach((item) => {
          item.reject(error instanceof Error ? error : new Error('Unknown error'));
        });
      }
    }
  }
}

// ============================================================================
// Promise Pipelining
// ============================================================================

let pipelineOpIdCounter = 0;

/**
 * Pipeline tracker for chained operations
 */
export class PipelineTracker {
  private operations: Map<string, PipelineOp> = new Map();
  private dependencyGraph: Map<string, Set<string>> = new Map();

  /**
   * Track a new operation
   */
  track(method: string, params: unknown[], dependency?: string): string {
    const id = `op-${++pipelineOpIdCounter}`;

    const dependencies: string[] = [];
    if (dependency) {
      dependencies.push(dependency);
      // Also add transitive dependencies
      const transitive = this.dependencyGraph.get(dependency);
      if (transitive) {
        dependencies.push(...transitive);
      }
    }

    this.operations.set(id, { id, method, params, dependencies });
    this.dependencyGraph.set(id, new Set(dependencies));

    return id;
  }

  /**
   * Get all dependencies for an operation
   */
  getDependencies(opId: string): string[] {
    return Array.from(this.dependencyGraph.get(opId) || []);
  }

  /**
   * Get operation by ID
   */
  getOperation(opId: string): PipelineOp | undefined {
    return this.operations.get(opId);
  }

  /**
   * Get all operations in dependency order
   */
  getOrderedOperations(): PipelineOp[] {
    const ordered: PipelineOp[] = [];
    const visited = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const op = this.operations.get(id);
      if (!op) return;

      op.dependencies.forEach(depId => visit(depId));
      ordered.push(op);
    };

    this.operations.forEach((_, id) => visit(id));
    return ordered;
  }
}

/**
 * Pipelined RPC proxy for chained method calls
 */
export class PipelinedRpcProxy {
  private target: MondoRpcTarget;
  private tracker: PipelineTracker;
  private currentDb: string | null = null;
  private currentCollection: string | null = null;

  constructor(target: MondoRpcTarget) {
    this.target = target;
    this.tracker = new PipelineTracker();
  }

  /**
   * Get a database reference (pipelined)
   */
  db(name: string): PipelinedDbProxy {
    const opId = this.tracker.track('db', [name]);
    this.currentDb = name;
    return new PipelinedDbProxy(this, name, opId);
  }

  /**
   * Execute the pipelined operations
   */
  async execute(): Promise<unknown> {
    if (!this.currentDb) {
      throw new Error('No database selected');
    }
    return this.target.db(this.currentDb);
  }

  /**
   * Get the underlying target
   */
  getTarget(): MondoRpcTarget {
    return this.target;
  }

  /**
   * Get current database name
   */
  getCurrentDb(): string | null {
    return this.currentDb;
  }

  /**
   * Get current collection name
   */
  getCurrentCollection(): string | null {
    return this.currentCollection;
  }

  /**
   * Set current collection
   */
  setCurrentCollection(name: string): void {
    this.currentCollection = name;
  }
}

/**
 * Pipelined database proxy
 */
class PipelinedDbProxy {
  private parent: PipelinedRpcProxy;
  private dbName: string;
  private operationId: string;

  constructor(parent: PipelinedRpcProxy, dbName: string, opId: string) {
    this.parent = parent;
    this.dbName = dbName;
    this.operationId = opId;
  }

  /**
   * Get the operation ID
   */
  get opId(): string {
    return this.operationId;
  }

  /**
   * Get a collection reference (pipelined)
   */
  collection(name: string): PipelinedCollectionProxy {
    this.parent.setCurrentCollection(name);
    return new PipelinedCollectionProxy(this.parent, this.dbName, name);
  }
}

/**
 * Pipelined collection proxy
 */
class PipelinedCollectionProxy {
  private parent: PipelinedRpcProxy;
  private dbName: string;
  private collectionName: string;

  constructor(parent: PipelinedRpcProxy, dbName: string, collectionName: string) {
    this.parent = parent;
    this.dbName = dbName;
    this.collectionName = collectionName;
  }

  /**
   * Find documents (executes the pipeline)
   */
  async find(query: Record<string, unknown>): Promise<unknown[]> {
    return this.parent.getTarget().find(this.dbName, this.collectionName, query);
  }

  /**
   * Insert one document
   */
  async insertOne(document: Record<string, unknown>): Promise<{ insertedId: string }> {
    return this.parent.getTarget().insertOne(this.dbName, this.collectionName, document);
  }

  /**
   * Update one document
   */
  async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ matchedCount: number; modifiedCount: number }> {
    return this.parent.getTarget().updateOne(this.dbName, this.collectionName, filter, update);
  }

  /**
   * Delete one document
   */
  async deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }> {
    return this.parent.getTarget().deleteOne(this.dbName, this.collectionName, filter);
  }
}
