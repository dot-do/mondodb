/**
 * ClickHouse Query Execution Tests (TDD - RED phase)
 *
 * Tests for executing analytical queries against ClickHouse via HTTP interface.
 * Covers SELECT statements with JOINs, window functions, CTEs, JSON columns,
 * and query cancellation.
 *
 * Issue: mondodb-vyf4
 */

import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import {
  ClickHouseQueryExecutor,
  executeQuery,
  executeQueryWithParams,
  createQueryBuilder,
  cancelQuery,
  type QueryResult,
  type QueryOptions,
  type ClickHouseQueryBuilder,
} from '../../../../src/olap/clickhouse/query';
import {
  ClickHouseIcebergClient,
  createIcebergConnection,
  type IcebergConnectionConfig,
} from '../../../../src/olap/clickhouse/iceberg';

// ============================================================================
// Mock ClickHouse HTTP Response Helpers
// ============================================================================

function createMockQueryResponse<T>(
  data: T[],
  meta: { name: string; type: string }[] = [],
  statistics?: { elapsed: number; rows_read: number; bytes_read: number }
) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        data,
        meta,
        statistics: statistics ?? { elapsed: 0.01, rows_read: 100, bytes_read: 1024 },
        rows: data.length,
      }),
    text: () => Promise.resolve(JSON.stringify({ data })),
  };
}

function createMockErrorResponse(error: string, code: number = 500) {
  return {
    ok: false,
    status: code,
    json: () => Promise.resolve({ exception: error, code }),
    text: () => Promise.resolve(error),
  };
}

function createMockConnectionResponse() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: [{ version: '24.3.1' }] }),
    text: () => Promise.resolve('24.3.1'),
  };
}

// ============================================================================
// Query Execution Tests
// ============================================================================

describe.skip('ClickHouse Query Execution', () => {
  let mockFetch: Mock;
  let connection: ClickHouseIcebergClient;

  beforeEach(async () => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Setup default connection
    mockFetch.mockResolvedValueOnce(createMockConnectionResponse());

    const config: IcebergConnectionConfig = {
      host: 'clickhouse.example.com',
      port: 8443,
      database: 'analytics',
      icebergCatalog: 'iceberg_catalog',
    };

    connection = await createIcebergConnection(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Basic SELECT Tests
  // ==========================================================================

  describe('basic SELECT queries', () => {
    it('should execute simple SELECT query', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { id: '1', name: 'Alice', age: 30 },
            { id: '2', name: 'Bob', age: 25 },
          ],
          [
            { name: 'id', type: 'String' },
            { name: 'name', type: 'String' },
            { name: 'age', type: 'UInt32' },
          ]
        )
      );

      const result = await executeQuery(connection, 'SELECT id, name, age FROM users');

      expect(result).toBeDefined();
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ id: '1', name: 'Alice', age: 30 });
      expect(result.meta).toHaveLength(3);
    });

    it('should execute SELECT with WHERE clause', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [{ id: '1', name: 'Alice', age: 30 }],
          [
            { name: 'id', type: 'String' },
            { name: 'name', type: 'String' },
            { name: 'age', type: 'UInt32' },
          ]
        )
      );

      const result = await executeQuery(connection, "SELECT * FROM users WHERE age > 25");

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Alice');
    });

    it('should execute SELECT with ORDER BY', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { id: '2', name: 'Bob', age: 25 },
            { id: '1', name: 'Alice', age: 30 },
          ],
          [
            { name: 'id', type: 'String' },
            { name: 'name', type: 'String' },
            { name: 'age', type: 'UInt32' },
          ]
        )
      );

      const result = await executeQuery(connection, 'SELECT * FROM users ORDER BY age ASC');

      expect(result.rows[0].age).toBe(25);
      expect(result.rows[1].age).toBe(30);
    });

    it('should execute SELECT with LIMIT', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ id: '1', name: 'Alice', age: 30 }], [
          { name: 'id', type: 'String' },
          { name: 'name', type: 'String' },
          { name: 'age', type: 'UInt32' },
        ])
      );

      const result = await executeQuery(connection, 'SELECT * FROM users LIMIT 1');

      expect(result.rows).toHaveLength(1);
    });

    it('should return query statistics', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [{ count: 1000000 }],
          [{ name: 'count', type: 'UInt64' }],
          { elapsed: 0.5, rows_read: 1000000, bytes_read: 50000000 }
        )
      );

      const result = await executeQuery(connection, 'SELECT count(*) as count FROM events');

      expect(result.statistics).toBeDefined();
      expect(result.statistics.elapsed).toBe(0.5);
      expect(result.statistics.rowsRead).toBe(1000000);
      expect(result.statistics.bytesRead).toBe(50000000);
    });
  });

  // ==========================================================================
  // JOIN Tests
  // ==========================================================================

  describe('JOIN queries', () => {
    it('should execute INNER JOIN', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { user_id: '1', user_name: 'Alice', order_id: '100', amount: 50.0 },
            { user_id: '1', user_name: 'Alice', order_id: '101', amount: 75.0 },
          ],
          [
            { name: 'user_id', type: 'String' },
            { name: 'user_name', type: 'String' },
            { name: 'order_id', type: 'String' },
            { name: 'amount', type: 'Float64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT u.id as user_id, u.name as user_name, o.id as order_id, o.amount
         FROM users u
         INNER JOIN orders o ON u.id = o.user_id`
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].user_name).toBe('Alice');
    });

    it('should execute LEFT JOIN', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { user_id: '1', user_name: 'Alice', order_id: '100', amount: 50.0 },
            { user_id: '2', user_name: 'Bob', order_id: null, amount: null },
          ],
          [
            { name: 'user_id', type: 'String' },
            { name: 'user_name', type: 'String' },
            { name: 'order_id', type: 'Nullable(String)' },
            { name: 'amount', type: 'Nullable(Float64)' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT u.id as user_id, u.name as user_name, o.id as order_id, o.amount
         FROM users u
         LEFT JOIN orders o ON u.id = o.user_id`
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[1].order_id).toBeNull();
    });

    it('should execute multiple JOINs', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            {
              user_name: 'Alice',
              order_id: '100',
              product_name: 'Widget',
              quantity: 2,
            },
          ],
          [
            { name: 'user_name', type: 'String' },
            { name: 'order_id', type: 'String' },
            { name: 'product_name', type: 'String' },
            { name: 'quantity', type: 'UInt32' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT u.name as user_name, o.id as order_id, p.name as product_name, oi.quantity
         FROM users u
         INNER JOIN orders o ON u.id = o.user_id
         INNER JOIN order_items oi ON o.id = oi.order_id
         INNER JOIN products p ON oi.product_id = p.id`
      );

      expect(result.rows[0].product_name).toBe('Widget');
    });

    it('should execute JOIN with subquery', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [{ user_name: 'Alice', total_orders: 5, avg_amount: 100.5 }],
          [
            { name: 'user_name', type: 'String' },
            { name: 'total_orders', type: 'UInt64' },
            { name: 'avg_amount', type: 'Float64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT u.name as user_name, os.total_orders, os.avg_amount
         FROM users u
         INNER JOIN (
           SELECT user_id, count(*) as total_orders, avg(amount) as avg_amount
           FROM orders
           GROUP BY user_id
         ) os ON u.id = os.user_id`
      );

      expect(result.rows[0].total_orders).toBe(5);
    });
  });

  // ==========================================================================
  // Window Function Tests
  // ==========================================================================

  describe('window function queries', () => {
    it('should execute ROW_NUMBER()', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { user_id: '1', order_date: '2024-01-15', amount: 100, row_num: 1 },
            { user_id: '1', order_date: '2024-01-10', amount: 50, row_num: 2 },
            { user_id: '2', order_date: '2024-01-12', amount: 75, row_num: 1 },
          ],
          [
            { name: 'user_id', type: 'String' },
            { name: 'order_date', type: 'Date' },
            { name: 'amount', type: 'Float64' },
            { name: 'row_num', type: 'UInt64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT user_id, order_date, amount,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_date DESC) as row_num
         FROM orders`
      );

      expect(result.rows[0].row_num).toBe(1);
      expect(result.rows[2].row_num).toBe(1);
    });

    it('should execute RANK() and DENSE_RANK()', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { product_id: 'A', sales: 1000, rank: 1, dense_rank: 1 },
            { product_id: 'B', sales: 1000, rank: 1, dense_rank: 1 },
            { product_id: 'C', sales: 800, rank: 3, dense_rank: 2 },
          ],
          [
            { name: 'product_id', type: 'String' },
            { name: 'sales', type: 'UInt64' },
            { name: 'rank', type: 'UInt64' },
            { name: 'dense_rank', type: 'UInt64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT product_id, sales,
                RANK() OVER (ORDER BY sales DESC) as rank,
                DENSE_RANK() OVER (ORDER BY sales DESC) as dense_rank
         FROM product_sales`
      );

      expect(result.rows[2].rank).toBe(3);
      expect(result.rows[2].dense_rank).toBe(2);
    });

    it('should execute LAG() and LEAD()', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { date: '2024-01-01', value: 100, prev_value: null, next_value: 120 },
            { date: '2024-01-02', value: 120, prev_value: 100, next_value: 115 },
            { date: '2024-01-03', value: 115, prev_value: 120, next_value: null },
          ],
          [
            { name: 'date', type: 'Date' },
            { name: 'value', type: 'Float64' },
            { name: 'prev_value', type: 'Nullable(Float64)' },
            { name: 'next_value', type: 'Nullable(Float64)' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT date, value,
                LAG(value) OVER (ORDER BY date) as prev_value,
                LEAD(value) OVER (ORDER BY date) as next_value
         FROM metrics`
      );

      expect(result.rows[0].prev_value).toBeNull();
      expect(result.rows[0].next_value).toBe(120);
    });

    it('should execute running aggregates', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { date: '2024-01-01', amount: 100, running_total: 100 },
            { date: '2024-01-02', amount: 150, running_total: 250 },
            { date: '2024-01-03', amount: 75, running_total: 325 },
          ],
          [
            { name: 'date', type: 'Date' },
            { name: 'amount', type: 'Float64' },
            { name: 'running_total', type: 'Float64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT date, amount,
                SUM(amount) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as running_total
         FROM daily_sales`
      );

      expect(result.rows[2].running_total).toBe(325);
    });

    it('should execute window frames', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { date: '2024-01-03', value: 110, moving_avg: 106.67 },
            { date: '2024-01-04', value: 105, moving_avg: 108.33 },
          ],
          [
            { name: 'date', type: 'Date' },
            { name: 'value', type: 'Float64' },
            { name: 'moving_avg', type: 'Float64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT date, value,
                AVG(value) OVER (ORDER BY date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) as moving_avg
         FROM daily_metrics`
      );

      expect(result.rows[0].moving_avg).toBeCloseTo(106.67, 1);
    });
  });

  // ==========================================================================
  // CTE (Common Table Expression) Tests
  // ==========================================================================

  describe('CTE queries', () => {
    it('should execute simple CTE', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { user_id: '1', total_amount: 500.0 },
            { user_id: '2', total_amount: 350.0 },
          ],
          [
            { name: 'user_id', type: 'String' },
            { name: 'total_amount', type: 'Float64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `WITH user_totals AS (
           SELECT user_id, SUM(amount) as total_amount
           FROM orders
           GROUP BY user_id
         )
         SELECT * FROM user_totals`
      );

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].total_amount).toBe(500.0);
    });

    it('should execute multiple CTEs', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [{ user_name: 'Alice', total_orders: 10, total_amount: 1500.0 }],
          [
            { name: 'user_name', type: 'String' },
            { name: 'total_orders', type: 'UInt64' },
            { name: 'total_amount', type: 'Float64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `WITH
           order_counts AS (
             SELECT user_id, count(*) as total_orders
             FROM orders
             GROUP BY user_id
           ),
           order_amounts AS (
             SELECT user_id, SUM(amount) as total_amount
             FROM orders
             GROUP BY user_id
           )
         SELECT u.name as user_name, oc.total_orders, oa.total_amount
         FROM users u
         INNER JOIN order_counts oc ON u.id = oc.user_id
         INNER JOIN order_amounts oa ON u.id = oa.user_id`
      );

      expect(result.rows[0].total_orders).toBe(10);
    });

    it('should execute recursive CTE', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { id: '1', name: 'Root', parent_id: null, level: 0 },
            { id: '2', name: 'Child 1', parent_id: '1', level: 1 },
            { id: '3', name: 'Child 2', parent_id: '1', level: 1 },
            { id: '4', name: 'Grandchild', parent_id: '2', level: 2 },
          ],
          [
            { name: 'id', type: 'String' },
            { name: 'name', type: 'String' },
            { name: 'parent_id', type: 'Nullable(String)' },
            { name: 'level', type: 'UInt32' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `WITH RECURSIVE hierarchy AS (
           SELECT id, name, parent_id, 0 as level
           FROM categories
           WHERE parent_id IS NULL

           UNION ALL

           SELECT c.id, c.name, c.parent_id, h.level + 1
           FROM categories c
           INNER JOIN hierarchy h ON c.parent_id = h.id
         )
         SELECT * FROM hierarchy`
      );

      expect(result.rows).toHaveLength(4);
      expect(result.rows[3].level).toBe(2);
    });

    it('should execute CTE with window functions', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { user_id: '1', month: '2024-01', revenue: 1000, rank: 1 },
            { user_id: '2', month: '2024-01', revenue: 800, rank: 2 },
          ],
          [
            { name: 'user_id', type: 'String' },
            { name: 'month', type: 'String' },
            { name: 'revenue', type: 'Float64' },
            { name: 'rank', type: 'UInt64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `WITH monthly_revenue AS (
           SELECT user_id,
                  formatDateTime(order_date, '%Y-%m') as month,
                  SUM(amount) as revenue
           FROM orders
           GROUP BY user_id, month
         )
         SELECT user_id, month, revenue,
                RANK() OVER (PARTITION BY month ORDER BY revenue DESC) as rank
         FROM monthly_revenue`
      );

      expect(result.rows[0].rank).toBe(1);
    });
  });

  // ==========================================================================
  // JSON Column Tests
  // ==========================================================================

  describe('JSON column queries', () => {
    it('should query JSON fields using JSONExtract', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { id: '1', user_name: 'alice', user_email: 'alice@example.com' },
            { id: '2', user_name: 'bob', user_email: 'bob@example.com' },
          ],
          [
            { name: 'id', type: 'String' },
            { name: 'user_name', type: 'String' },
            { name: 'user_email', type: 'String' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT id,
                JSONExtractString(metadata, 'user', 'name') as user_name,
                JSONExtractString(metadata, 'user', 'email') as user_email
         FROM events`
      );

      expect(result.rows[0].user_name).toBe('alice');
      expect(result.rows[0].user_email).toBe('alice@example.com');
    });

    it('should query nested JSON arrays', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { id: '1', first_tag: 'important', tag_count: 3 },
            { id: '2', first_tag: 'urgent', tag_count: 2 },
          ],
          [
            { name: 'id', type: 'String' },
            { name: 'first_tag', type: 'String' },
            { name: 'tag_count', type: 'UInt64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT id,
                JSONExtractString(metadata, 'tags', 1) as first_tag,
                JSONLength(metadata, 'tags') as tag_count
         FROM documents`
      );

      expect(result.rows[0].first_tag).toBe('important');
      expect(result.rows[0].tag_count).toBe(3);
    });

    it('should filter by JSON field values', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [{ id: '1', type: 'purchase', amount: 99.99 }],
          [
            { name: 'id', type: 'String' },
            { name: 'type', type: 'String' },
            { name: 'amount', type: 'Float64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT id,
                JSONExtractString(data, 'type') as type,
                JSONExtractFloat(data, 'amount') as amount
         FROM events
         WHERE JSONExtractString(data, 'type') = 'purchase'`
      );

      expect(result.rows[0].type).toBe('purchase');
    });

    it('should aggregate JSON field values', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { event_type: 'click', total_count: 1500 },
            { event_type: 'purchase', total_count: 250 },
          ],
          [
            { name: 'event_type', type: 'String' },
            { name: 'total_count', type: 'UInt64' },
          ]
        )
      );

      const result = await executeQuery(
        connection,
        `SELECT JSONExtractString(data, 'type') as event_type,
                count(*) as total_count
         FROM events
         GROUP BY event_type`
      );

      expect(result.rows[0].total_count).toBe(1500);
    });

    it('should handle JSON with Object type', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            {
              id: '1',
              properties: { color: 'red', size: 'large', nested: { value: 42 } },
            },
          ],
          [
            { name: 'id', type: 'String' },
            { name: 'properties', type: 'Object(Nullable(String))' },
          ]
        )
      );

      const result = await executeQuery(connection, 'SELECT id, properties FROM items');

      expect(result.rows[0].properties).toEqual({
        color: 'red',
        size: 'large',
        nested: { value: 42 },
      });
    });
  });

  // ==========================================================================
  // Parameterized Query Tests
  // ==========================================================================

  describe('parameterized queries', () => {
    it('should execute query with string parameters', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ id: '1', name: 'Alice', status: 'active' }], [
          { name: 'id', type: 'String' },
          { name: 'name', type: 'String' },
          { name: 'status', type: 'String' },
        ])
      );

      const result = await executeQueryWithParams(
        connection,
        'SELECT * FROM users WHERE name = {name:String} AND status = {status:String}',
        { name: 'Alice', status: 'active' }
      );

      expect(result.rows[0].name).toBe('Alice');
    });

    it('should execute query with numeric parameters', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ id: '1', name: 'Alice', age: 30 }], [
          { name: 'id', type: 'String' },
          { name: 'name', type: 'String' },
          { name: 'age', type: 'UInt32' },
        ])
      );

      const result = await executeQueryWithParams(
        connection,
        'SELECT * FROM users WHERE age >= {min_age:UInt32} AND age <= {max_age:UInt32}',
        { min_age: 25, max_age: 35 }
      );

      expect(result.rows[0].age).toBe(30);
    });

    it('should execute query with array parameters', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { id: '1', status: 'active' },
            { id: '2', status: 'pending' },
          ],
          [
            { name: 'id', type: 'String' },
            { name: 'status', type: 'String' },
          ]
        )
      );

      const result = await executeQueryWithParams(
        connection,
        'SELECT * FROM orders WHERE status IN {statuses:Array(String)}',
        { statuses: ['active', 'pending'] }
      );

      expect(result.rows).toHaveLength(2);
    });

    it('should prevent SQL injection', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([], []));

      // This should safely escape the malicious input
      const result = await executeQueryWithParams(
        connection,
        'SELECT * FROM users WHERE name = {name:String}',
        { name: "'; DROP TABLE users; --" }
      );

      // Verify the query was sent with proper escaping
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.not.stringContaining('DROP TABLE'),
        })
      );
    });
  });

  // ==========================================================================
  // Query Cancellation Tests
  // ==========================================================================

  describe('query cancellation', () => {
    it('should cancel running query', async () => {
      // Start a long-running query
      const longQueryPromise = new Promise((resolve) => {
        setTimeout(() => resolve(createMockQueryResponse([{ count: 1000000 }])), 5000);
      });
      mockFetch.mockReturnValueOnce(longQueryPromise);

      const queryPromise = executeQuery(connection, 'SELECT count(*) FROM huge_table', {
        queryId: 'test-query-123',
      });

      // Cancel the query
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('') });
      await cancelQuery(connection, 'test-query-123');

      // The original query should be cancelled
      await expect(queryPromise).rejects.toThrow('Query cancelled');
    });

    it('should support AbortController for cancellation', async () => {
      const abortController = new AbortController();

      mockFetch.mockImplementation((_url: string, options: RequestInit) => {
        return new Promise((resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
          setTimeout(
            () => resolve(createMockQueryResponse([{ count: 100 }])),
            5000
          );
        });
      });

      const queryPromise = executeQuery(connection, 'SELECT count(*) FROM table', {
        signal: abortController.signal,
      });

      // Abort after a short delay
      setTimeout(() => abortController.abort(), 100);

      await expect(queryPromise).rejects.toThrow('Aborted');
    });

    it('should return query ID for tracking', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

      const result = await executeQuery(connection, 'SELECT 1 as value', {
        queryId: 'custom-query-id',
      });

      expect(result.queryId).toBe('custom-query-id');
    });

    it('should auto-generate query ID when not provided', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

      const result = await executeQuery(connection, 'SELECT 1 as value');

      expect(result.queryId).toBeDefined();
      expect(typeof result.queryId).toBe('string');
      expect(result.queryId.length).toBeGreaterThan(0);
    });

    it('should handle cancellation of non-existent query', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse('Query not found: nonexistent-query', 404)
      );

      await expect(cancelQuery(connection, 'nonexistent-query')).rejects.toThrow(
        'Query not found'
      );
    });
  });

  // ==========================================================================
  // Query Builder Tests
  // ==========================================================================

  describe('query builder', () => {
    it('should build SELECT query with fluent API', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ id: '1', name: 'Alice' }])
      );

      const builder = createQueryBuilder(connection);
      const result = await builder
        .select(['id', 'name'])
        .from('users')
        .where('age > 25')
        .orderBy('name', 'ASC')
        .limit(10)
        .execute();

      expect(result.rows).toHaveLength(1);
    });

    it('should build query with JOIN', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ user_name: 'Alice', order_count: 5 }])
      );

      const builder = createQueryBuilder(connection);
      const result = await builder
        .select(['u.name as user_name', 'COUNT(o.id) as order_count'])
        .from('users', 'u')
        .join('orders', 'o', 'u.id = o.user_id')
        .groupBy('u.name')
        .execute();

      expect(result.rows[0].order_count).toBe(5);
    });

    it('should build query with CTE', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ total: 1000 }])
      );

      const builder = createQueryBuilder(connection);
      const result = await builder
        .withCTE('totals', 'SELECT SUM(amount) as total FROM orders')
        .select(['total'])
        .from('totals')
        .execute();

      expect(result.rows[0].total).toBe(1000);
    });

    it('should generate valid SQL', () => {
      const builder = createQueryBuilder(connection);
      const sql = builder
        .select(['id', 'name'])
        .from('users')
        .where('status = ?', ['active'])
        .toSQL();

      expect(sql).toContain('SELECT');
      expect(sql).toContain('FROM users');
      expect(sql).toContain('WHERE');
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('should handle syntax errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse('Syntax error: unexpected token', 62)
      );

      await expect(executeQuery(connection, 'SELEC * FROM users')).rejects.toThrow(
        'Syntax error'
      );
    });

    it('should handle table not found errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse("Table 'nonexistent' doesn't exist", 60)
      );

      await expect(executeQuery(connection, 'SELECT * FROM nonexistent')).rejects.toThrow(
        "Table 'nonexistent' doesn't exist"
      );
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(createMockQueryResponse([{ value: 1 }])), 10000)
          )
      );

      await expect(
        executeQuery(connection, 'SELECT * FROM huge_table', { timeout: 100 })
      ).rejects.toThrow('Query timeout');
    });

    it('should handle memory limit errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse('Memory limit exceeded', 241)
      );

      await expect(
        executeQuery(connection, 'SELECT * FROM huge_table')
      ).rejects.toThrow('Memory limit exceeded');
    });
  });

  // ==========================================================================
  // Query Options Tests
  // ==========================================================================

  describe('query options', () => {
    it('should set query timeout', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

      await executeQuery(connection, 'SELECT 1 as value', { timeout: 5000 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('max_execution_time=5'),
        expect.any(Object)
      );
    });

    it('should set max rows', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

      await executeQuery(connection, 'SELECT * FROM users', { maxRows: 1000 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('max_rows_to_read=1000'),
        expect.any(Object)
      );
    });

    it('should set output format', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ value: 1 }]));

      await executeQuery(connection, 'SELECT 1 as value', { format: 'JSONEachRow' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('FORMAT JSONEachRow'),
        })
      );
    });

    it('should enable query profiling', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ value: 1 }], [], {
          elapsed: 0.1,
          rows_read: 1000,
          bytes_read: 50000,
        })
      );

      const result = await executeQuery(connection, 'SELECT 1 as value', {
        profile: true,
      });

      expect(result.profile).toBeDefined();
    });
  });
});
