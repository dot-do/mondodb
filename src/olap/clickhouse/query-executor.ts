/**
 * ClickHouse Query Executor
 *
 * Worker-compatible query executor using fetch-based HTTP client.
 * Supports query execution, streaming, retry logic, and connection pooling.
 *
 * Issue: mongo.do-r1pz
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Query executor configuration
 */
export interface QueryExecutorConfig {
  /** ClickHouse host */
  host: string;
  /** ClickHouse port */
  port?: number;
  /** Database name */
  database: string;
  /** Username */
  username?: string;
  /** Password */
  password?: string;
  /** Use HTTPS */
  secure?: boolean;
  /** Query timeout in milliseconds */
  queryTimeout?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Connection pool size */
  poolSize?: number;
}

/**
 * Query execution options
 */
export interface ExecuteOptions {
  /** Query timeout in milliseconds */
  timeout?: number;
  /** Custom query ID for tracking */
  queryId?: string;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Output format */
  format?: 'JSONEachRow' | 'JSON' | 'JSONCompact';
}

/**
 * Query result with metadata
 */
export interface QueryResult<T = Record<string, unknown>> {
  /** Result rows */
  rows: T[];
  /** Column metadata */
  meta: Array<{ name: string; type: string }>;
  /** Query statistics */
  statistics: {
    elapsed: number;
    rowsRead: number;
    bytesRead: number;
  };
  /** Query ID */
  queryId?: string;
}

/**
 * Stream result chunk
 */
export interface StreamChunk<T = Record<string, unknown>> {
  /** Chunk of rows */
  rows: T[];
  /** Chunk index */
  chunkIndex: number;
  /** Whether this is the last chunk */
  isLast: boolean;
}

/**
 * Stream options
 */
export interface StreamOptions {
  /** Chunk size (number of rows per chunk) */
  chunkSize?: number;
  /** Query timeout in milliseconds */
  timeout?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Connection pool status
 */
export interface PoolStatus {
  /** Total connections in pool */
  total: number;
  /** Available (idle) connections */
  available: number;
  /** In-use connections */
  inUse: number;
  /** Pending connection requests */
  pending: number;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * ClickHouse query error
 */
export class ClickHouseError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'ClickHouseError';
  }
}

// =============================================================================
// Connection Pool
// =============================================================================

/**
 * Simple connection pool for tracking concurrent requests
 */
class ConnectionPool {
  private _total: number;
  private _inUse: number = 0;
  private _pending: number = 0;
  private _closed: boolean = false;
  private _pendingQueue: Array<() => void> = [];

  constructor(size: number) {
    this._total = size;
  }

  /**
   * Acquire a connection slot from the pool
   */
  async acquire(): Promise<void> {
    if (this._closed) {
      throw new Error('Pool is closed');
    }

    if (this._inUse < this._total) {
      this._inUse++;
      return;
    }

    // Wait for a slot to become available
    this._pending++;
    return new Promise<void>((resolve) => {
      this._pendingQueue.push(() => {
        this._pending--;
        this._inUse++;
        resolve();
      });
    });
  }

  /**
   * Release a connection slot back to the pool
   */
  release(): void {
    if (this._inUse > 0) {
      this._inUse--;
    }

    // Wake up next pending request
    const next = this._pendingQueue.shift();
    if (next) {
      next();
    }
  }

  /**
   * Mark a connection as dead (reduces total capacity temporarily)
   */
  markDead(): void {
    if (this._total > 1) {
      this._total--;
    }
    if (this._inUse > 0) {
      this._inUse--;
    }
  }

  /**
   * Get pool status
   */
  getStatus(): PoolStatus {
    return {
      total: this._closed ? 0 : this._total,
      available: this._closed ? 0 : Math.max(0, this._total - this._inUse),
      inUse: this._closed ? 0 : this._inUse,
      pending: this._closed ? 0 : this._pending,
    };
  }

  /**
   * Close the pool
   */
  close(): void {
    this._closed = true;
    this._total = 0;
    this._inUse = 0;
    this._pending = 0;
    this._pendingQueue = [];
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique query ID using web-compatible crypto
 */
function generateQueryId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown, statusCode?: number): boolean {
  // Network errors are retryable
  if (error instanceof Error) {
    const message = error.message;
    if (
      message.includes('ECONNRESET') ||
      message.includes('ETIMEDOUT') ||
      message.includes('Connection reset by peer') ||
      message.includes('Connection closed unexpectedly')
    ) {
      return true;
    }
  }

  // HTTP status codes that are retryable
  if (statusCode === 503 || statusCode === 429) {
    return true;
  }

  return false;
}

/**
 * Check if an error indicates connection failure that should update pool
 */
function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message;
    return (
      message.includes('Connection reset') ||
      message.includes('Connection closed') ||
      message.includes('ECONNRESET')
    );
  }
  return false;
}

/**
 * Map network errors to user-friendly messages
 */
function mapNetworkError(error: Error): Error {
  const message = error.message;

  if (message.includes('ECONNREFUSED')) {
    return new ClickHouseError('Connection refused to ClickHouse server', 0, true);
  }

  if (message.includes('ENOTFOUND')) {
    return new ClickHouseError('DNS resolution failed - host not found', 0, true);
  }

  if (message.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE')) {
    return new ClickHouseError('SSL certificate verification failed', 0, false);
  }

  return error;
}

/**
 * Delay for retry with exponential backoff
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serialize parameter value for ClickHouse
 */
function serializeParam(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => serializeParam(v)).join(',')}]`;
  }
  if (typeof value === 'string') {
    // Escape single quotes for ClickHouse
    return `'${value.replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return String(value);
}

// =============================================================================
// ClickHouse Query Executor
// =============================================================================

/**
 * ClickHouse Query Executor using fetch-based HTTP client
 *
 * Worker-compatible implementation that uses the fetch API for HTTP requests.
 */
export class ClickHouseQueryExecutor {
  private _config: QueryExecutorConfig;
  private _pool: ConnectionPool;
  private _baseUrl: string;

  constructor(config: QueryExecutorConfig) {
    this._config = {
      port: config.secure ? 8443 : 8123,
      secure: false,
      maxRetries: 3,
      retryDelay: 100,
      poolSize: 10,
      queryTimeout: 30000,
      connectionTimeout: 5000,
      ...config,
    };

    this._pool = new ConnectionPool(this._config.poolSize!);

    const protocol = this._config.secure ? 'https' : 'http';
    this._baseUrl = `${protocol}://${this._config.host}:${this._config.port}`;
  }

  /**
   * Build the URL for a query request
   */
  private _buildUrl(options?: ExecuteOptions): string {
    const params = new URLSearchParams();
    params.set('database', this._config.database);
    params.set('default_format', options?.format || 'JSON');

    if (this._config.username) {
      params.set('user', this._config.username);
    }
    if (this._config.password) {
      params.set('password', this._config.password);
    }

    // Set timeout in seconds
    const timeoutMs = options?.timeout || this._config.queryTimeout || 30000;
    const timeoutSeconds = Math.floor(timeoutMs / 1000);
    params.set('max_execution_time', String(timeoutSeconds));

    return `${this._baseUrl}/?${params.toString()}`;
  }

  /**
   * Execute a fetch request with retry logic
   */
  private async _fetchWithRetry(
    url: string,
    fetchOptions: RequestInit,
    options?: ExecuteOptions
  ): Promise<Response> {
    const maxRetries = this._config.maxRetries || 3;
    const baseDelay = this._config.retryDelay || 100;
    let lastError: Error | null = null;

    await this._pool.acquire();

    try {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // Create abort controller for timeout
          const controller = new AbortController();
          let timeoutId: ReturnType<typeof setTimeout> | undefined;

          // Create a timeout promise that rejects after the timeout
          const timeoutPromise = options?.timeout
            ? new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                  controller.abort();
                  reject(new Error('Query timeout exceeded'));
                }, options.timeout);
              })
            : null;

          // Chain with user-provided signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => controller.abort());
          }

          // Race fetch against timeout
          const fetchPromise = fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
          });

          const response = timeoutPromise
            ? await Promise.race([fetchPromise, timeoutPromise])
            : await fetchPromise;

          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = errorText;

            try {
              const errorJson = JSON.parse(errorText);
              errorMessage = errorJson.exception || errorText;
            } catch {
              // Use raw text
            }

            // Check if retryable
            if (isRetryableError(null, response.status) && attempt < maxRetries) {
              lastError = new ClickHouseError(errorMessage, response.status, true);
              await delay(baseDelay * Math.pow(2, attempt));
              continue;
            }

            // Non-retryable HTTP errors
            if (response.status === 400) {
              throw new ClickHouseError(errorMessage, response.status, false);
            }
            if (response.status === 401) {
              throw new ClickHouseError(`Authentication failed: ${errorMessage}`, response.status, false);
            }
            if (response.status === 403) {
              throw new ClickHouseError(errorMessage, response.status, false);
            }
            if (response.status === 404) {
              throw new ClickHouseError(errorMessage, response.status, false);
            }

            throw new ClickHouseError(errorMessage, response.status, false);
          }

          return response;
        } catch (error) {
          // Handle abort errors - could be timeout or user cancellation
          if (error instanceof DOMException) {
            if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
              throw new Error('Query timeout exceeded');
            }
            if (error.name === 'AbortError') {
              throw error;
            }
          }

          if (error instanceof ClickHouseError && !error.isRetryable) {
            throw error;
          }

          const mappedError = error instanceof Error ? mapNetworkError(error) : error;

          if (isRetryableError(error) && attempt < maxRetries) {
            lastError = mappedError as Error;
            if (isConnectionError(error)) {
              this._pool.markDead();
            }
            await delay(baseDelay * Math.pow(2, attempt));
            continue;
          }

          // Non-retryable error - throw immediately
          throw mappedError;
        }
      }

      throw lastError || new Error('Query failed after retries');
    } finally {
      this._pool.release();
    }
  }

  /**
   * Execute a query and return all results
   */
  async execute<T = Record<string, unknown>>(
    sql: string,
    options?: ExecuteOptions
  ): Promise<QueryResult<T>> {
    const queryId = options?.queryId || generateQueryId();
    const url = this._buildUrl(options);

    const response = await this._fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'X-ClickHouse-Query-Id': queryId,
        },
        body: sql,
      },
      options
    );

    const json = await response.json() as {
      data: T[];
      meta: Array<{ name: string; type: string }>;
      statistics: { elapsed: number; rows_read: number; bytes_read: number };
    };

    return {
      rows: json.data || [],
      meta: json.meta || [],
      statistics: {
        elapsed: json.statistics?.elapsed || 0,
        rowsRead: json.statistics?.rows_read || 0,
        bytesRead: json.statistics?.bytes_read || 0,
      },
      // Always use our generated queryId to ensure uniqueness
      queryId,
    };
  }

  /**
   * Execute a parameterized query with bound values
   */
  async executeWithParams<T = Record<string, unknown>>(
    sql: string,
    params: Record<string, unknown>,
    options?: ExecuteOptions
  ): Promise<QueryResult<T>> {
    const queryId = options?.queryId || generateQueryId();
    const url = this._buildUrl(options);

    // Build query parameters for ClickHouse
    const paramEntries = Object.entries(params);
    const queryParams = new URLSearchParams();

    for (const [key, value] of paramEntries) {
      queryParams.set(`param_${key}`, serializeParam(value));
    }

    const fullUrl = `${url}&${queryParams.toString()}`;

    const response = await this._fetchWithRetry(
      fullUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'X-ClickHouse-Query-Id': queryId,
        },
        body: sql,
      },
      options
    );

    const json = await response.json() as {
      data: T[];
      meta: Array<{ name: string; type: string }>;
      statistics: { elapsed: number; rows_read: number; bytes_read: number };
    };

    return {
      rows: json.data || [],
      meta: json.meta || [],
      statistics: {
        elapsed: json.statistics?.elapsed || 0,
        rowsRead: json.statistics?.rows_read || 0,
        bytesRead: json.statistics?.bytes_read || 0,
      },
      // Always use our generated queryId to ensure uniqueness
      queryId,
    };
  }

  /**
   * Stream query results
   */
  async *stream<T = Record<string, unknown>>(
    sql: string,
    options?: StreamOptions
  ): AsyncGenerator<StreamChunk<T>> {
    const streamOptions: ExecuteOptions = {
      format: 'JSONEachRow',
    };
    if (options?.timeout !== undefined) {
      streamOptions.timeout = options.timeout;
    }
    const url = this._buildUrl(streamOptions);

    const controller = new AbortController();
    const signal = options?.signal;

    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    await this._pool.acquire();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: sql,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ClickHouseError(errorText, response.status, false);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let chunkIndex = 0;
      const chunkSize = options?.chunkSize || 1000;

      // Buffer to hold one chunk for look-ahead (to determine isLast)
      let bufferedChunk: T[] | null = null;

      while (true) {
        // Check for abort at the start of each iteration
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        // Yield to event loop to prevent CPU time limit issues in Workers
        // Use setTimeout(0) to ensure we truly yield to the event loop
        await new Promise(resolve => setTimeout(resolve, 0));

        const { done, value } = await reader.read();

        // Parse any new data
        const newRows: T[] = [];
        if (value) {
          buffer += decoder.decode(value, { stream: true });

          // Parse complete lines from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              try {
                newRows.push(JSON.parse(trimmed) as T);
              } catch {
                // Skip malformed lines
              }
            }
          }
        }

        // If we're done, parse remaining buffer
        if (done && buffer.trim()) {
          try {
            newRows.push(JSON.parse(buffer.trim()) as T);
          } catch {
            // Skip malformed
          }
        }

        // If we have a buffered chunk, yield it now (we know it's not the last)
        if (bufferedChunk !== null && (newRows.length > 0 || done)) {
          yield {
            rows: bufferedChunk,
            chunkIndex: chunkIndex++,
            isLast: done && newRows.length === 0,
          };
          bufferedChunk = null;
        }

        // Process new rows into chunks
        if (newRows.length > 0) {
          if (done) {
            // This is the last batch of data - split and yield all as appropriate
            while (newRows.length > chunkSize) {
              yield {
                rows: newRows.splice(0, chunkSize),
                chunkIndex: chunkIndex++,
                isLast: false,
              };
            }
            yield {
              rows: newRows,
              chunkIndex: chunkIndex++,
              isLast: true,
            };
          } else {
            // Not done yet - buffer one chunk for look-ahead
            bufferedChunk = newRows;
          }
        }

        if (done) {
          // If we had nothing to yield, yield empty final
          if (chunkIndex === 0) {
            yield {
              rows: [],
              chunkIndex: 0,
              isLast: true,
            };
          }
          break;
        }
      }
    } finally {
      this._pool.release();
    }
  }

  /**
   * Get connection pool status
   */
  getPoolStatus(): PoolStatus {
    return this._pool.getStatus();
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    this._pool.close();
  }

  /**
   * Check if executor is using fetch API (Worker compatible)
   */
  isFetchBased(): boolean {
    return true;
  }

  /**
   * Get the HTTP client type being used
   */
  getHttpClientType(): 'fetch' | 'node-http' {
    return 'fetch';
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new query executor instance
 */
export function createQueryExecutor(config: QueryExecutorConfig): ClickHouseQueryExecutor {
  return new ClickHouseQueryExecutor(config);
}
