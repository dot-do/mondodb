/**
 * RPC Client - Client-side RPC handler for capnweb-style Workers RPC
 *
 * Implements:
 * - HTTP batch protocol
 * - WebSocket sessions
 * - Auto-reconnection
 * - Request deduplication
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * RPC client options
 */
export interface RpcClientOptions {
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Reconnect interval in milliseconds */
  reconnectInterval?: number;
  /** Enable request deduplication */
  deduplicate?: boolean;
  /** Deduplication TTL in milliseconds */
  deduplicationTtl?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * RPC request structure
 */
export interface RpcRequest {
  id?: string;
  method: string;
  params: unknown[];
}

/**
 * RPC response structure
 */
export interface RpcResponse {
  id?: string;
  result?: unknown;
  error?: string;
}

/**
 * Batch response structure
 */
export interface BatchResponse {
  results: RpcResponse[];
}

/**
 * Event handler type
 */
export type EventHandler<T = unknown> = (event: T) => void;

/**
 * Reconnect event data
 */
export interface ReconnectEvent {
  attempt: number;
  lastError?: Error;
}

// ============================================================================
// Request Deduplicator
// ============================================================================

/**
 * Options for request deduplicator
 */
export interface DeduplicatorOptions {
  ttl?: number;
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
  private pending: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map();
  private messageHandlers: Set<(message: unknown) => void> = new Set();

  constructor(ws: WebSocket) {
    this.ws = ws;
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

      this.pending.set(id, { resolve, reject });
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
        this.wsTransport = new WebSocketRpcTransport(ws);
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
   * Find documents
   */
  async find(query: Record<string, unknown> = {}): Promise<unknown[]> {
    return this.client.call('find', [this.dbName, this.collectionName, query]) as Promise<unknown[]>;
  }

  /**
   * Find one document
   */
  async findOne(query: Record<string, unknown> = {}): Promise<unknown | null> {
    const results = await this.find(query);
    return results[0] || null;
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
