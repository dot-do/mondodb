/**
 * RPC Client - Client-side RPC handler for capnweb-style Workers RPC
 *
 * Implements:
 * - HTTP batch protocol
 * - WebSocket sessions
 * - Auto-reconnection
 * - Request deduplication
 */

import type {
  RpcClientOptions,
  RpcRequest,
  RpcResponse,
  BatchResponse,
  EventHandler,
  ReconnectEvent,
  DeduplicatorOptions,
} from '../types/rpc'

// Re-export types for backward compatibility
export type {
  RpcClientOptions,
  RpcRequest,
  RpcResponse,
  BatchResponse,
  EventHandler,
  ReconnectEvent,
  DeduplicatorOptions,
}

/**
 * Deduplicates identical concurrent requests
 */
export class RequestDeduplicator {
  private cache: Map<string, { promise: Promise<unknown>; timestamp: number }> = new Map();
  private ttl: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: DeduplicatorOptions = {}) {
    this.ttl = options.ttl ?? 1000;
    this.startCleanup();
  }

  /**
   * Start the cleanup interval
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.ttl);
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get a cached promise
   */
  get(key: string): Promise<unknown> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.promise;
  }

  /**
   * Set a promise for a key
   */
  set(key: string, promise: Promise<unknown>): void {
    this.cache.set(key, { promise, timestamp: Date.now() });
  }

  /**
   * Generate a cache key from method and params
   */
  static generateKey(method: string, params: unknown[]): string {
    return `${method}:${JSON.stringify(params)}`;
  }
}

// ============================================================================
// WebSocket RPC Transport
// ============================================================================

/**
 * WebSocket-based RPC transport
 */
export class WebSocketRpcTransport {
  private ws: WebSocket;
  private messageId = 0;
  private pending: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }> = new Map();
  private messageHandlers: Set<(message: unknown) => void> = new Set();
  private options?: { timeout?: number };

  constructor(ws: WebSocket, options?: { timeout?: number }) {
    this.ws = ws;
    this.options = options;
    this.setupMessageHandler();
  }

  /**
   * Set up the WebSocket message handler
   */
  private setupMessageHandler(): void {
    this.ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data as string);
        this.handleMessage(data);
      } catch {
        // Ignore parse errors
      }
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: RpcResponse): void {
    // Notify all message handlers
    this.messageHandlers.forEach((handler) => handler(data));

    // Resolve pending requests
    if (data.id) {
      const pending = this.pending.get(data.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(data.id);
        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          pending.resolve(data.result);
        }
      }
    }
  }

  /**
   * Send a request over WebSocket
   */
  send(request: Omit<RpcRequest, 'id'>): Promise<unknown> {
    const id = String(++this.messageId);
    const fullRequest: RpcRequest = { ...request, id };

    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not open'));
        return;
      }

      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Request timeout'));
      }, this.options?.timeout ?? 30000);

      this.pending.set(id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify(fullRequest));
    });
  }

  /**
   * Add a message handler for streaming responses
   */
  onMessage(handler: (message: unknown) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Close the connection
   */
  close(): void {
    this.ws.close();
  }

  /**
   * Get connection state
   */
  get readyState(): number {
    return this.ws.readyState;
  }
}

// ============================================================================
// RPC Client
// ============================================================================

let requestIdCounter = 0;

/**
 * RPC client for connecting to Mondo workers
 */
export class RpcClient {
  private url: string;
  readonly options: Required<RpcClientOptions>;
  readonly transport: 'http' | 'websocket';

  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private batchMode = false;
  private batchQueue: Array<{
    request: RpcRequest;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = [];
  private deduplicator: RequestDeduplicator | null = null;
  private wsTransport: WebSocketRpcTransport | null = null;

  constructor(url: string, options: RpcClientOptions = {}) {
    this.url = url;
    this.options = {
      autoReconnect: options.autoReconnect ?? false,
      maxRetries: options.maxRetries ?? 3,
      reconnectInterval: options.reconnectInterval ?? 1000,
      deduplicate: options.deduplicate ?? false,
      deduplicationTtl: options.deduplicationTtl ?? 1000,
      timeout: options.timeout ?? 30000,
    };

    // Determine transport based on URL
    this.transport = url.startsWith('ws://') || url.startsWith('wss://') ? 'websocket' : 'http';

    // Set up deduplication if enabled
    if (this.options.deduplicate) {
      this.deduplicator = new RequestDeduplicator({ ttl: this.options.deduplicationTtl });
    }
  }

  /**
   * Make an RPC call
   */
  async call(method: string, params: unknown[]): Promise<unknown> {
    const request: RpcRequest = {
      id: String(++requestIdCounter),
      method,
      params,
    };

    // Check deduplication cache
    if (this.deduplicator) {
      const key = RequestDeduplicator.generateKey(method, params);
      const cached = this.deduplicator.get(key);
      if (cached) {
        return cached;
      }

      const promise = this.executeCall(request);
      this.deduplicator.set(key, promise);
      return promise;
    }

    return this.executeCall(request);
  }

  /**
   * Execute the actual RPC call
   */
  private async executeCall(request: RpcRequest): Promise<unknown> {
    // If in batch mode, queue the request
    if (this.batchMode) {
      return new Promise((resolve, reject) => {
        this.batchQueue.push({ request, resolve, reject });
      });
    }

    // Use WebSocket transport if available
    if (this.transport === 'websocket' && this.wsTransport) {
      return this.wsTransport.send(request);
    }

    // HTTP transport with retry logic
    return this.executeWithRetry(request);
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry(request: RpcRequest, attempt = 1): Promise<unknown> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.options.timeout),
      });

      const data = await response.json() as RpcResponse;

      if (data.error) {
        throw new Error(data.error);
      }

      return data.result ?? data;
    } catch (error) {
      if (this.options.autoReconnect && attempt < this.options.maxRetries) {
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, this.options.reconnectInterval));
        this.emit('reconnect', { attempt });
        return this.executeWithRetry(request, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Start batch mode
   */
  startBatch(): void {
    this.batchMode = true;
    this.batchQueue = [];
  }

  /**
   * End batch mode and send all queued requests
   */
  async endBatch(): Promise<void> {
    this.batchMode = false;

    if (this.batchQueue.length === 0) {
      return;
    }

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    try {
      const response = await fetch(`${this.url}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((item) => item.request)),
        signal: AbortSignal.timeout(this.options.timeout),
      });

      const data = await response.json() as BatchResponse;

      batch.forEach((item, index) => {
        const result = data.results[index];
        if (result.error) {
          item.reject(new Error(result.error));
        } else {
          item.resolve(result.result);
        }
      });
    } catch (error) {
      // Reject all queued requests
      batch.forEach((item) => {
        item.reject(error instanceof Error ? error : new Error('Unknown error'));
      });
    }
  }

  /**
   * Register an event handler
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): void {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler as EventHandler);
  }

  /**
   * Remove an event handler
   */
  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler);
    }
  }

  /**
   * Emit an event
   */
  emit<T = unknown>(event: string, data: T): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  /**
   * Connect via WebSocket
   */
  async connectWebSocket(): Promise<void> {
    if (this.transport !== 'websocket') {
      throw new Error('Cannot connect WebSocket for HTTP transport');
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);

      ws.addEventListener('open', () => {
        this.wsTransport = new WebSocketRpcTransport(ws, { timeout: this.options.timeout });
        resolve();
      });

      ws.addEventListener('error', (event) => {
        reject(new Error('WebSocket connection failed'));
      });

      ws.addEventListener('close', () => {
        this.wsTransport = null;
        if (this.options.autoReconnect) {
          setTimeout(() => this.connectWebSocket(), this.options.reconnectInterval);
        }
      });
    });
  }

  /**
   * Close the client connection
   */
  close(): void {
    if (this.wsTransport) {
      this.wsTransport.close();
      this.wsTransport = null;
    }
    if (this.deduplicator) {
      this.deduplicator.destroy();
      this.deduplicator = null;
    }
  }
}

// ============================================================================
// MongoClient wrapper
// ============================================================================

/**
 * MongoDB-compatible client wrapper over RPC
 */
export class MongoClient {
  private client: RpcClient;
  private connected = false;
  private dbName: string | null = null;

  constructor(url: string, options: RpcClientOptions = {}) {
    // Convert MongoDB URL to RPC endpoint URL
    const rpcUrl = this.parseMongoUrl(url);
    this.client = new RpcClient(rpcUrl, options);
  }

  /**
   * Parse MongoDB URL to extract RPC endpoint
   */
  private parseMongoUrl(url: string): string {
    // Extract host from mongodb:// URL
    const parsed = new URL(url.replace('mongodb://', 'http://'));
    this.dbName = parsed.pathname.slice(1) || null;
    return `http://${parsed.host}/rpc`;
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<MongoClient> {
    if (!this.dbName) {
      throw new Error('No database specified in connection string');
    }
    await this.client.call('connect', [`mongodb://localhost/${this.dbName}`]);
    this.connected = true;
    return this;
  }

  /**
   * Get a database reference
   */
  db(name?: string): Database {
    const dbName = name || this.dbName;
    if (!dbName) {
      throw new Error('No database specified');
    }
    return new Database(this.client, dbName);
  }

  /**
   * Close the connection
   */
  close(): void {
    this.client.close();
    this.connected = false;
  }
}

/**
 * Database reference
 */
class Database {
  private client: RpcClient;
  private name: string;

  constructor(client: RpcClient, name: string) {
    this.client = client;
    this.name = name;
  }

  /**
   * Get a collection reference
   */
  collection(name: string): Collection {
    return new Collection(this.client, this.name, name);
  }
}

/**
 * RPC Find Cursor - Simple cursor for RPC-based find operations
 */
class RpcFindCursor<T = unknown> {
  private client: RpcClient;
  private dbName: string;
  private collectionName: string;
  private query: Record<string, unknown>;
  private _sort?: Record<string, 1 | -1>;
  private _limit?: number;
  private _skip?: number;
  private _projection?: Record<string, 0 | 1>;
  private _buffer: T[] = [];
  private _position: number = 0;
  private _fetched: boolean = false;
  private _closed: boolean = false;

  constructor(
    client: RpcClient,
    dbName: string,
    collectionName: string,
    query: Record<string, unknown> = {}
  ) {
    this.client = client;
    this.dbName = dbName;
    this.collectionName = collectionName;
    this.query = query;
  }

  get closed(): boolean {
    return this._closed;
  }

  sort(spec: Record<string, 1 | -1>): this {
    this._sort = spec;
    return this;
  }

  limit(count: number): this {
    if (count < 0) throw new Error('Limit must be non-negative');
    this._limit = count;
    return this;
  }

  skip(count: number): this {
    if (count < 0) throw new Error('Skip must be non-negative');
    this._skip = count;
    return this;
  }

  project(spec: Record<string, 0 | 1>): this {
    this._projection = spec;
    return this;
  }

  private async ensureFetched(): Promise<void> {
    if (this._fetched || this._closed) return;

    const options: Record<string, unknown> = {};
    if (this._sort) options.sort = this._sort;
    if (this._limit !== undefined) options.limit = this._limit;
    if (this._skip !== undefined) options.skip = this._skip;
    if (this._projection) options.projection = this._projection;

    this._buffer = await this.client.call('find', [
      this.dbName,
      this.collectionName,
      this.query,
      options
    ]) as T[];
    this._fetched = true;
  }

  async next(): Promise<T | null> {
    if (this._closed) return null;
    await this.ensureFetched();
    if (this._position >= this._buffer.length) return null;
    return this._buffer[this._position++];
  }

  async hasNext(): Promise<boolean> {
    if (this._closed) return false;
    await this.ensureFetched();
    return this._position < this._buffer.length;
  }

  async toArray(): Promise<T[]> {
    if (this._closed) return [];
    await this.ensureFetched();
    const remaining = this._buffer.slice(this._position);
    this._position = this._buffer.length;
    await this.close();
    return remaining;
  }

  async forEach(callback: (doc: T, index: number) => void | false | Promise<void | false>): Promise<void> {
    if (this._closed) return;
    await this.ensureFetched();
    let index = 0;
    while (this._position < this._buffer.length) {
      const doc = this._buffer[this._position++];
      const result = await callback(doc, index++);
      if (result === false) break;
    }
  }

  async count(): Promise<number> {
    await this.ensureFetched();
    return this._buffer.length - this._position;
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    this._buffer = [];
    this._position = 0;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    try {
      while (await this.hasNext()) {
        const doc = await this.next();
        if (doc !== null) yield doc;
      }
    } finally {
      await this.close();
    }
  }
}

/**
 * RPC Aggregation Cursor - Simple cursor for RPC-based aggregate operations
 */
class RpcAggregationCursor<T = unknown> {
  private client: RpcClient;
  private dbName: string;
  private collectionName: string;
  private pipeline: unknown[];
  private options: Record<string, unknown>;
  private _buffer: T[] = [];
  private _position: number = 0;
  private _fetched: boolean = false;
  private _closed: boolean = false;

  constructor(
    client: RpcClient,
    dbName: string,
    collectionName: string,
    pipeline: unknown[] = [],
    options: Record<string, unknown> = {}
  ) {
    this.client = client;
    this.dbName = dbName;
    this.collectionName = collectionName;
    this.pipeline = pipeline;
    this.options = options;
  }

  get closed(): boolean {
    return this._closed;
  }

  private async ensureFetched(): Promise<void> {
    if (this._fetched || this._closed) return;
    this._buffer = await this.client.call('aggregate', [
      this.dbName,
      this.collectionName,
      this.pipeline,
      this.options
    ]) as T[];
    this._fetched = true;
  }

  async next(): Promise<T | null> {
    if (this._closed) return null;
    await this.ensureFetched();
    if (this._position >= this._buffer.length) return null;
    return this._buffer[this._position++];
  }

  async hasNext(): Promise<boolean> {
    if (this._closed) return false;
    await this.ensureFetched();
    return this._position < this._buffer.length;
  }

  async toArray(): Promise<T[]> {
    if (this._closed) return [];
    await this.ensureFetched();
    const remaining = this._buffer.slice(this._position);
    this._position = this._buffer.length;
    await this.close();
    return remaining;
  }

  async forEach(callback: (doc: T, index: number) => void | false | Promise<void | false>): Promise<void> {
    if (this._closed) return;
    await this.ensureFetched();
    let index = 0;
    while (this._position < this._buffer.length) {
      const doc = this._buffer[this._position++];
      const result = await callback(doc, index++);
      if (result === false) break;
    }
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    this._buffer = [];
    this._position = 0;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    try {
      while (await this.hasNext()) {
        const doc = await this.next();
        if (doc !== null) yield doc;
      }
    } finally {
      await this.close();
    }
  }
}

/**
 * Collection reference
 */
class Collection {
  private client: RpcClient;
  private dbName: string;
  private collectionName: string;

  constructor(client: RpcClient, dbName: string, collectionName: string) {
    this.client = client;
    this.dbName = dbName;
    this.collectionName = collectionName;
  }

  /**
   * Find documents - returns a cursor
   */
  find(query: Record<string, unknown> = {}): RpcFindCursor {
    return new RpcFindCursor(this.client, this.dbName, this.collectionName, query);
  }

  /**
   * Find one document
   */
  async findOne(query: Record<string, unknown> = {}): Promise<unknown | null> {
    const cursor = this.find(query).limit(1);
    return cursor.next();
  }

  /**
   * Aggregate pipeline - returns a cursor
   */
  aggregate(pipeline: unknown[] = [], options: Record<string, unknown> = {}): RpcAggregationCursor {
    return new RpcAggregationCursor(this.client, this.dbName, this.collectionName, pipeline, options);
  }

  /**
   * Insert one document
   */
  async insertOne(document: Record<string, unknown>): Promise<{ insertedId: string }> {
    return this.client.call('insertOne', [this.dbName, this.collectionName, document]) as Promise<{ insertedId: string }>;
  }

  /**
   * Update one document
   */
  async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ matchedCount: number; modifiedCount: number }> {
    return this.client.call('updateOne', [this.dbName, this.collectionName, filter, update]) as Promise<{ matchedCount: number; modifiedCount: number }>;
  }

  /**
   * Delete one document
   */
  async deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }> {
    return this.client.call('deleteOne', [this.dbName, this.collectionName, filter]) as Promise<{ deletedCount: number }>;
  }
}
