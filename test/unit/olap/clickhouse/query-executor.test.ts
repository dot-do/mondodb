/**
 * ClickHouse Query Executor Tests (TDD - RED phase)
 *
 * Tests for ClickHouseQueryExecutor using @clickhouse/client-web HTTP API.
 * Covers query execution, result streaming, error handling, connection management,
 * and Worker compatibility.
 *
 * Issue: mondodb-q9le
 *
 * These tests verify:
 * - Query execution (simple, parameterized, aggregation, timeout handling)
 * - Result streaming (large result sets, chunked responses, stream lifecycle)
 * - Error handling (retry logic, syntax errors, connection errors, auth failures)
 * - Connection management (reuse, pool exhaustion, connection drops)
 * - Worker compatibility (no Node.js APIs, fetch-compatible HTTP client)
 */

import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Query executor configuration
 */
interface QueryExecutorConfig {
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
interface ExecuteOptions {
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
interface QueryResult<T = Record<string, unknown>> {
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
interface StreamChunk<T = Record<string, unknown>> {
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
interface StreamOptions {
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
interface PoolStatus {
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
// Mock Implementation Stubs
// =============================================================================

/**
 * ClickHouse Query Executor using @clickhouse/client-web
 */
class ClickHouseQueryExecutor {
  private _config: QueryExecutorConfig;

  constructor(config: QueryExecutorConfig) {
    this._config = config;
  }

  /**
   * Execute a query and return all results
   */
  async execute<T = Record<string, unknown>>(
    _sql: string,
    _options?: ExecuteOptions
  ): Promise<QueryResult<T>> {
    throw new Error('Not implemented');
  }

  /**
   * Execute a parameterized query with bound values
   */
  async executeWithParams<T = Record<string, unknown>>(
    _sql: string,
    _params: Record<string, unknown>,
    _options?: ExecuteOptions
  ): Promise<QueryResult<T>> {
    throw new Error('Not implemented');
  }

  /**
   * Stream query results
   */
  async *stream<T = Record<string, unknown>>(
    _sql: string,
    _options?: StreamOptions
  ): AsyncGenerator<StreamChunk<T>> {
    throw new Error('Not implemented');
  }

  /**
   * Get connection pool status
   */
  getPoolStatus(): PoolStatus {
    throw new Error('Not implemented');
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Check if executor is using fetch API (Worker compatible)
   */
  isFetchBased(): boolean {
    throw new Error('Not implemented');
  }

  /**
   * Get the HTTP client type being used
   */
  getHttpClientType(): 'fetch' | 'node-http' {
    throw new Error('Not implemented');
  }
}

/**
 * Create a new query executor instance
 */
function createQueryExecutor(_config: QueryExecutorConfig): ClickHouseQueryExecutor {
  throw new Error('Not implemented');
}

// =============================================================================
// Mock Response Helpers
// =============================================================================

function createMockQueryResponse<T>(
  data: T[],
  meta: { name: string; type: string }[] = [],
  statistics?: { elapsed: number; rows_read: number; bytes_read: number }
) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': 'application/json',
      'x-clickhouse-query-id': 'test-query-id-123',
    }),
    json: () =>
      Promise.resolve({
        data,
        meta,
        statistics: statistics ?? { elapsed: 0.01, rows_read: 100, bytes_read: 1024 },
        rows: data.length,
      }),
    text: () => Promise.resolve(JSON.stringify({ data })),
    body: createMockReadableStream(data),
  };
}

function createMockErrorResponse(error: string, code: number = 500) {
  return {
    ok: false,
    status: code,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve({ exception: error, code }),
    text: () => Promise.resolve(error),
  };
}

function createMockReadableStream<T>(data: T[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = data.map((item) => encoder.encode(JSON.stringify(item) + '\n'));

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function createMockStreamResponse<T>(chunks: T[][]): Response {
  const encoder = new TextEncoder();

  let chunkIndex = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        const chunk = chunks[chunkIndex];
        const encoded = encoder.encode(chunk.map((item) => JSON.stringify(item)).join('\n') + '\n');
        controller.enqueue(encoded);
        chunkIndex++;
      } else {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson',
      'x-clickhouse-query-id': 'stream-query-id',
    },
  });
}

// =============================================================================
// Query Execution Tests
// =============================================================================

describe('ClickHouseQueryExecutor', () => {
  let mockFetch: Mock;
  let executor: ClickHouseQueryExecutor;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    executor = createQueryExecutor({
      host: 'clickhouse.example.com',
      port: 8443,
      database: 'analytics',
      username: 'default',
      password: 'password',
      secure: true,
      maxRetries: 3,
      retryDelay: 100,
      poolSize: 10,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Query Execution Tests
  // ==========================================================================

  describe('Query Execution', () => {
    describe('simple SELECT query', () => {
      it('should execute simple SELECT query', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockQueryResponse(
            [
              { id: 1, name: 'Alice', age: 30 },
              { id: 2, name: 'Bob', age: 25 },
            ],
            [
              { name: 'id', type: 'UInt64' },
              { name: 'name', type: 'String' },
              { name: 'age', type: 'UInt32' },
            ]
          )
        );

        const result = await executor.execute('SELECT id, name, age FROM users');

        expect(result).toBeDefined();
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0]).toEqual({ id: 1, name: 'Alice', age: 30 });
        expect(result.meta).toHaveLength(3);
        expect(result.statistics).toBeDefined();
      });

      it('should include query statistics in result', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockQueryResponse(
            [{ count: 1000000 }],
            [{ name: 'count', type: 'UInt64' }],
            { elapsed: 0.5, rows_read: 1000000, bytes_read: 50000000 }
          )
        );

        const result = await executor.execute('SELECT count(*) as count FROM events');

        expect(result.statistics.elapsed).toBe(0.5);
        expect(result.statistics.rowsRead).toBe(1000000);
        expect(result.statistics.bytesRead).toBe(50000000);
      });

      it('should return query ID in result', async () => {
        mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

        const result = await executor.execute('SELECT 1 as value');

        expect(result.queryId).toBeDefined();
        expect(typeof result.queryId).toBe('string');
      });
    });

    describe('parameterized queries', () => {
      it('should execute parameterized queries with bound values', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockQueryResponse([{ id: 1, name: 'Alice', status: 'active' }])
        );

        const result = await executor.executeWithParams(
          'SELECT * FROM users WHERE name = {name:String} AND status = {status:String}',
          { name: 'Alice', status: 'active' }
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].name).toBe('Alice');

        // Verify parameters were sent correctly
        const fetchCall = mockFetch.mock.calls[0];
        expect(fetchCall).toBeDefined();
      });

      it('should handle numeric parameters', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockQueryResponse([{ id: 1, value: 100 }])
        );

        const result = await executor.executeWithParams(
          'SELECT * FROM data WHERE value >= {min:UInt64} AND value <= {max:UInt64}',
          { min: 50, max: 150 }
        );

        expect(result.rows).toHaveLength(1);
      });

      it('should handle array parameters', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockQueryResponse([
            { id: 1, status: 'active' },
            { id: 2, status: 'pending' },
          ])
        );

        const result = await executor.executeWithParams(
          'SELECT * FROM orders WHERE status IN {statuses:Array(String)}',
          { statuses: ['active', 'pending'] }
        );

        expect(result.rows).toHaveLength(2);
      });

      it('should escape special characters to prevent injection', async () => {
        mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

        await executor.executeWithParams(
          'SELECT * FROM users WHERE name = {name:String}',
          { name: "'; DROP TABLE users; --" }
        );

        // The query should be safely parameterized, not contain raw SQL injection
        const fetchCall = mockFetch.mock.calls[0];
        const body = fetchCall[1]?.body;
        expect(body).not.toContain('DROP TABLE');
      });
    });

    describe('query timeout', () => {
      it('should handle query timeout', async () => {
        mockFetch.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve(createMockQueryResponse([{ value: 1 }])), 10000)
            )
        );

        await expect(
          executor.execute('SELECT sleep(60)', { timeout: 100 })
        ).rejects.toThrow(/timeout/i);
      });

      it('should respect custom timeout option', async () => {
        mockFetch.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve(createMockQueryResponse([{ value: 1 }])), 500)
            )
        );

        // Should succeed with longer timeout
        mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

        const result = await executor.execute('SELECT 1 as value', { timeout: 5000 });

        expect(result.rows).toHaveLength(1);
      });

      it('should send timeout setting to ClickHouse', async () => {
        mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

        await executor.execute('SELECT 1 as value', { timeout: 30000 });

        const fetchCall = mockFetch.mock.calls[0];
        const url = fetchCall[0] as string;
        expect(url).toContain('max_execution_time=30');
      });
    });

    describe('aggregation queries', () => {
      it('should execute aggregation queries', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockQueryResponse(
            [
              { category: 'electronics', total: 15000, avg_price: 150.0 },
              { category: 'clothing', total: 8000, avg_price: 80.0 },
            ],
            [
              { name: 'category', type: 'String' },
              { name: 'total', type: 'UInt64' },
              { name: 'avg_price', type: 'Float64' },
            ]
          )
        );

        const result = await executor.execute(`
          SELECT category, sum(amount) as total, avg(price) as avg_price
          FROM sales
          GROUP BY category
          ORDER BY total DESC
        `);

        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].total).toBe(15000);
      });

      it('should handle window functions', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockQueryResponse([
            { date: '2024-01-01', value: 100, running_total: 100 },
            { date: '2024-01-02', value: 150, running_total: 250 },
          ])
        );

        const result = await executor.execute(`
          SELECT date, value,
                 sum(value) OVER (ORDER BY date) as running_total
          FROM daily_metrics
        `);

        expect(result.rows[1].running_total).toBe(250);
      });

      it('should handle complex aggregations with HAVING', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockQueryResponse([{ user_id: '1', order_count: 10 }])
        );

        const result = await executor.execute(`
          SELECT user_id, count(*) as order_count
          FROM orders
          GROUP BY user_id
          HAVING count(*) > 5
        `);

        expect(result.rows[0].order_count).toBe(10);
      });
    });
  });

  // ==========================================================================
  // Result Streaming Tests
  // ==========================================================================

  describe('Result Streaming', () => {
    describe('streaming large result sets', () => {
      it('should stream large result sets', async () => {
        const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          value: `item-${i}`,
        }));

        // Split into chunks of 1000
        const chunks = [];
        for (let i = 0; i < largeDataset.length; i += 1000) {
          chunks.push(largeDataset.slice(i, i + 1000));
        }

        mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

        const allRows: Array<{ id: number; value: string }> = [];
        for await (const chunk of executor.stream<{ id: number; value: string }>(
          'SELECT * FROM large_table'
        )) {
          allRows.push(...chunk.rows);
        }

        expect(allRows).toHaveLength(10000);
        expect(allRows[0].id).toBe(0);
        expect(allRows[9999].id).toBe(9999);
      });

      it('should yield chunks with correct metadata', async () => {
        const chunks = [
          [{ id: 1 }, { id: 2 }],
          [{ id: 3 }, { id: 4 }],
          [{ id: 5 }],
        ];

        mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

        const receivedChunks: StreamChunk[] = [];
        for await (const chunk of executor.stream('SELECT * FROM table')) {
          receivedChunks.push(chunk);
        }

        expect(receivedChunks).toHaveLength(3);
        expect(receivedChunks[0].chunkIndex).toBe(0);
        expect(receivedChunks[0].isLast).toBe(false);
        expect(receivedChunks[2].chunkIndex).toBe(2);
        expect(receivedChunks[2].isLast).toBe(true);
      });
    });

    describe('chunked responses', () => {
      it('should handle chunked responses', async () => {
        const chunks = [
          [{ data: 'chunk1-row1' }, { data: 'chunk1-row2' }],
          [{ data: 'chunk2-row1' }],
        ];

        mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

        const receivedChunks: StreamChunk[] = [];
        for await (const chunk of executor.stream('SELECT * FROM table')) {
          receivedChunks.push(chunk);
        }

        expect(receivedChunks).toHaveLength(2);
        expect(receivedChunks[0].rows).toHaveLength(2);
        expect(receivedChunks[1].rows).toHaveLength(1);
      });

      it('should respect custom chunk size option', async () => {
        const data = Array.from({ length: 100 }, (_, i) => ({ id: i }));
        const chunks = [];
        for (let i = 0; i < data.length; i += 10) {
          chunks.push(data.slice(i, i + 10));
        }

        mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

        const receivedChunks: StreamChunk[] = [];
        for await (const chunk of executor.stream('SELECT * FROM table', { chunkSize: 10 })) {
          receivedChunks.push(chunk);
        }

        // Each chunk should have approximately 10 rows
        for (const chunk of receivedChunks.slice(0, -1)) {
          expect(chunk.rows.length).toBeLessThanOrEqual(10);
        }
      });
    });

    describe('stream lifecycle', () => {
      it('should properly close stream on completion', async () => {
        const chunks = [[{ id: 1 }], [{ id: 2 }]];
        mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

        const generator = executor.stream('SELECT * FROM table');

        // Consume the stream
        for await (const _chunk of generator) {
          // consume
        }

        // After completion, the stream should be closed
        const next = await generator.next();
        expect(next.done).toBe(true);
      });

      it('should handle stream errors gracefully', async () => {
        const errorStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"id":1}\n'));
            controller.error(new Error('Stream interrupted'));
          },
        });

        mockFetch.mockResolvedValueOnce(
          new Response(errorStream, {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
          })
        );

        const generator = executor.stream('SELECT * FROM table');

        await expect(async () => {
          for await (const _chunk of generator) {
            // consume
          }
        }).rejects.toThrow('Stream interrupted');
      });

      it('should support stream cancellation via AbortSignal', async () => {
        const controller = new AbortController();
        const chunks = Array.from({ length: 100 }, (_, i) => [{ id: i }]);

        mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

        const generator = executor.stream('SELECT * FROM table', {
          signal: controller.signal,
        });

        let chunkCount = 0;
        try {
          for await (const _chunk of generator) {
            chunkCount++;
            if (chunkCount === 5) {
              controller.abort();
            }
          }
        } catch (error) {
          expect((error as Error).name).toBe('AbortError');
        }

        expect(chunkCount).toBeLessThanOrEqual(6); // May process one more after abort
      });
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    describe('retry on transient errors', () => {
      it('should retry on transient network errors', async () => {
        // First two calls fail with network error, third succeeds
        mockFetch
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockRejectedValueOnce(new Error('ETIMEDOUT'))
          .mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

        const result = await executor.execute('SELECT 1 as value');

        expect(result.rows).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledTimes(3);
      });

      it('should retry on 503 Service Unavailable', async () => {
        mockFetch
          .mockResolvedValueOnce(createMockErrorResponse('Service temporarily unavailable', 503))
          .mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

        const result = await executor.execute('SELECT 1 as value');

        expect(result.rows).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should retry on 429 Too Many Requests', async () => {
        mockFetch
          .mockResolvedValueOnce(createMockErrorResponse('Rate limit exceeded', 429))
          .mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

        const result = await executor.execute('SELECT 1 as value');

        expect(result.rows).toHaveLength(1);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should apply exponential backoff between retries', async () => {
        const startTime = Date.now();

        mockFetch
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockRejectedValueOnce(new Error('ECONNRESET'))
          .mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

        await executor.execute('SELECT 1 as value');

        const elapsed = Date.now() - startTime;
        // With retry delay of 100ms and exponential backoff, should take at least 100 + 200 = 300ms
        expect(elapsed).toBeGreaterThanOrEqual(200);
      });
    });

    describe('non-retryable errors', () => {
      it('should not retry on query syntax errors', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockErrorResponse('Syntax error: unexpected token', 400)
        );

        await expect(executor.execute('SELEC * FROM users')).rejects.toThrow('Syntax error');

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('should not retry on table not found errors', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockErrorResponse("Table 'nonexistent' doesn't exist", 404)
        );

        await expect(executor.execute('SELECT * FROM nonexistent')).rejects.toThrow(
          "Table 'nonexistent' doesn't exist"
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('should not retry on permission denied', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockErrorResponse('Access denied for user', 403)
        );

        await expect(executor.execute('SELECT * FROM restricted')).rejects.toThrow(
          'Access denied'
        );

        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    describe('connection errors', () => {
      it('should handle connection refused', async () => {
        mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(executor.execute('SELECT 1')).rejects.toThrow(/connection refused/i);
      });

      it('should handle DNS resolution failures', async () => {
        mockFetch.mockRejectedValue(new Error('ENOTFOUND'));

        await expect(executor.execute('SELECT 1')).rejects.toThrow(/not found|dns/i);
      });

      it('should handle SSL/TLS errors', async () => {
        mockFetch.mockRejectedValue(new Error('UNABLE_TO_VERIFY_LEAF_SIGNATURE'));

        await expect(executor.execute('SELECT 1')).rejects.toThrow(/ssl|certificate/i);
      });
    });

    describe('authentication errors', () => {
      it('should handle authentication failures', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockErrorResponse('Authentication failed: wrong password', 401)
        );

        await expect(executor.execute('SELECT 1')).rejects.toThrow(/authentication/i);

        // Should not retry auth failures
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('should handle expired credentials', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockErrorResponse('Token expired', 401)
        );

        await expect(executor.execute('SELECT 1')).rejects.toThrow(/expired|authentication/i);
      });
    });

    describe('max retry attempts', () => {
      it('should respect max retry attempts', async () => {
        // Config has maxRetries: 3, so should try 4 times total (1 initial + 3 retries)
        mockFetch.mockRejectedValue(new Error('ECONNRESET'));

        await expect(executor.execute('SELECT 1')).rejects.toThrow('ECONNRESET');

        expect(mockFetch).toHaveBeenCalledTimes(4);
      });

      it('should throw last error after exhausting retries', async () => {
        mockFetch
          .mockRejectedValueOnce(new Error('Error 1'))
          .mockRejectedValueOnce(new Error('Error 2'))
          .mockRejectedValueOnce(new Error('Error 3'))
          .mockRejectedValueOnce(new Error('Final error'));

        await expect(executor.execute('SELECT 1')).rejects.toThrow('Final error');
      });
    });
  });

  // ==========================================================================
  // Connection Management Tests
  // ==========================================================================

  describe('Connection Management', () => {
    describe('connection reuse', () => {
      it('should reuse connections when possible', async () => {
        mockFetch.mockResolvedValue(createMockQueryResponse([{ value: 1 }]));

        // Execute multiple queries
        await executor.execute('SELECT 1');
        await executor.execute('SELECT 2');
        await executor.execute('SELECT 3');

        // All queries should use the same connection pool
        const poolStatus = executor.getPoolStatus();
        expect(poolStatus.total).toBeLessThanOrEqual(10); // Pool size from config
      });

      it('should track connection pool status', async () => {
        mockFetch.mockResolvedValue(createMockQueryResponse([{ value: 1 }]));

        const initialStatus = executor.getPoolStatus();
        expect(initialStatus).toHaveProperty('total');
        expect(initialStatus).toHaveProperty('available');
        expect(initialStatus).toHaveProperty('inUse');
        expect(initialStatus).toHaveProperty('pending');
      });
    });

    describe('connection pool exhaustion', () => {
      it('should handle connection pool exhaustion', async () => {
        // Create executor with small pool
        const smallPoolExecutor = createQueryExecutor({
          host: 'clickhouse.example.com',
          database: 'analytics',
          poolSize: 2,
        });

        // Simulate slow queries
        mockFetch.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve(createMockQueryResponse([{ value: 1 }])), 100)
            )
        );

        // Start many concurrent queries
        const queries = Array.from({ length: 10 }, () =>
          smallPoolExecutor.execute('SELECT sleep(1)')
        );

        // Should handle gracefully (queue or reject)
        await expect(Promise.all(queries)).resolves.toBeDefined();
      });

      it('should queue requests when pool is exhausted', async () => {
        const smallPoolExecutor = createQueryExecutor({
          host: 'clickhouse.example.com',
          database: 'analytics',
          poolSize: 1,
        });

        let queryOrder: number[] = [];

        mockFetch.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          queryOrder.push(queryOrder.length + 1);
          return createMockQueryResponse([{ value: queryOrder.length }]);
        });

        // Start concurrent queries
        const [result1, result2] = await Promise.all([
          smallPoolExecutor.execute('SELECT 1'),
          smallPoolExecutor.execute('SELECT 2'),
        ]);

        // Queries should complete in order due to pool size of 1
        expect(result1.rows[0].value).toBeDefined();
        expect(result2.rows[0].value).toBeDefined();
      });
    });

    describe('connection drops', () => {
      it('should gracefully handle connection drops', async () => {
        // First query succeeds, second fails with connection drop, third succeeds
        mockFetch
          .mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]))
          .mockRejectedValueOnce(new Error('Connection reset by peer'))
          .mockResolvedValueOnce(createMockQueryResponse([{ value: 2 }]));

        const result1 = await executor.execute('SELECT 1');
        expect(result1.rows[0].value).toBe(1);

        // Should retry and succeed
        const result2 = await executor.execute('SELECT 2');
        expect(result2.rows[0].value).toBe(2);
      });

      it('should remove dead connections from pool', async () => {
        mockFetch
          .mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]))
          .mockRejectedValueOnce(new Error('Connection closed unexpectedly'))
          .mockResolvedValueOnce(createMockQueryResponse([{ value: 2 }]));

        await executor.execute('SELECT 1');

        // Pool should not include dead connection
        const statusBeforeError = executor.getPoolStatus();

        try {
          await executor.execute('SELECT 2');
        } catch {
          // May fail on first attempt
        }

        const statusAfterError = executor.getPoolStatus();
        // Dead connection should be removed or marked unavailable
        expect(statusAfterError.available).toBeLessThanOrEqual(statusBeforeError.available);
      });

      it('should properly close all connections on executor close', async () => {
        mockFetch.mockResolvedValue(createMockQueryResponse([{ value: 1 }]));

        await executor.execute('SELECT 1');
        await executor.execute('SELECT 2');

        await executor.close();

        const status = executor.getPoolStatus();
        expect(status.total).toBe(0);
        expect(status.inUse).toBe(0);
      });
    });
  });

  // ==========================================================================
  // Worker Compatibility Tests
  // ==========================================================================

  describe('Worker Compatibility', () => {
    describe('no Node.js APIs', () => {
      it('should work without Node.js APIs', async () => {
        // Verify executor doesn't use Node.js-specific globals
        mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

        // Execute in a way that simulates Worker environment
        const result = await executor.execute('SELECT 1');

        expect(result.rows).toHaveLength(1);
      });

      it('should not require http or https modules', () => {
        // The executor should be based on fetch, not Node.js http
        expect(executor.isFetchBased()).toBe(true);
      });

      it('should not require Buffer for binary operations', async () => {
        // Should use Uint8Array instead of Buffer
        mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ data: 'test' }]));

        const result = await executor.execute('SELECT data FROM binary_table');

        expect(result.rows).toHaveLength(1);
        // Should work without Buffer
      });

      it('should use web-compatible crypto for query IDs', async () => {
        mockFetch.mockResolvedValue(createMockQueryResponse([{ value: 1 }]));

        const result1 = await executor.execute('SELECT 1');
        const result2 = await executor.execute('SELECT 2');

        // Should generate unique query IDs without Node.js crypto
        expect(result1.queryId).toBeDefined();
        expect(result2.queryId).toBeDefined();
        expect(result1.queryId).not.toBe(result2.queryId);
      });
    });

    describe('fetch-compatible HTTP client', () => {
      it('should use fetch-compatible HTTP client', () => {
        expect(executor.getHttpClientType()).toBe('fetch');
      });

      it('should use standard Request/Response objects', async () => {
        mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

        await executor.execute('SELECT 1');

        const fetchCall = mockFetch.mock.calls[0];
        const [url, options] = fetchCall;

        // Should be using fetch-style options
        expect(typeof url).toBe('string');
        expect(options).toHaveProperty('method');
        expect(options).toHaveProperty('headers');
      });

      it('should support Request with headers', async () => {
        mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

        await executor.execute('SELECT 1');

        const fetchCall = mockFetch.mock.calls[0];
        const options = fetchCall[1];

        // Headers should be an object or Headers instance
        expect(options.headers).toBeDefined();
      });

      it('should handle ReadableStream responses', async () => {
        const chunks = [[{ id: 1 }], [{ id: 2 }]];
        mockFetch.mockResolvedValueOnce(createMockStreamResponse(chunks));

        const allRows: Array<{ id: number }> = [];
        for await (const chunk of executor.stream<{ id: number }>('SELECT * FROM table')) {
          allRows.push(...chunk.rows);
        }

        expect(allRows).toHaveLength(2);
      });

      it('should work with AbortController', async () => {
        const controller = new AbortController();

        mockFetch.mockImplementation((_url: string, options: RequestInit) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve(createMockQueryResponse([{ value: 1 }]));
            }, 1000);

            options.signal?.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        });

        const queryPromise = executor.execute('SELECT sleep(10)', {
          signal: controller.signal,
        });

        // Abort after short delay
        setTimeout(() => controller.abort(), 50);

        await expect(queryPromise).rejects.toThrow('Aborted');
      });
    });

    describe('Cloudflare Workers specific', () => {
      it('should not exceed CPU time limits with streaming', async () => {
        // Simulate large result that would exceed CPU time if not streamed
        const largeChunks = Array.from({ length: 100 }, (_, i) => [
          { id: i, data: 'x'.repeat(1000) },
        ]);

        mockFetch.mockResolvedValueOnce(createMockStreamResponse(largeChunks));

        const startTime = Date.now();
        let rowCount = 0;

        for await (const chunk of executor.stream('SELECT * FROM huge_table')) {
          rowCount += chunk.rows.length;
          // In real Workers, each chunk would yield to the event loop
        }

        const elapsed = Date.now() - startTime;

        expect(rowCount).toBe(100);
        // Should process incrementally, not all at once
        expect(elapsed).toBeGreaterThan(0);
      });

      it('should use web standard TextEncoder/TextDecoder', async () => {
        mockFetch.mockResolvedValueOnce(
          createMockQueryResponse([{ text: 'Hello World' }])
        );

        const result = await executor.execute('SELECT text FROM messages');

        // Should work with web-standard encoding
        expect(result.rows[0].text).toBe('Hello World');
      });
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createQueryExecutor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create executor with minimal config', () => {
    const executor = createQueryExecutor({
      host: 'localhost',
      database: 'default',
    });

    expect(executor).toBeInstanceOf(ClickHouseQueryExecutor);
  });

  it('should create executor with full config', () => {
    const executor = createQueryExecutor({
      host: 'clickhouse.example.com',
      port: 8443,
      database: 'analytics',
      username: 'admin',
      password: 'secret',
      secure: true,
      queryTimeout: 30000,
      connectionTimeout: 5000,
      maxRetries: 5,
      retryDelay: 200,
      poolSize: 20,
    });

    expect(executor).toBeInstanceOf(ClickHouseQueryExecutor);
  });

  it('should use default values for optional config', () => {
    const executor = createQueryExecutor({
      host: 'localhost',
      database: 'default',
    });

    // Should have defaults
    expect(executor.getPoolStatus()).toBeDefined();
    expect(executor.isFetchBased()).toBe(true);
  });
});
