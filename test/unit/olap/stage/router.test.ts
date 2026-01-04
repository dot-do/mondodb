/**
 * Query Router Tests (TDD - RED phase)
 *
 * Tests for routing $olap queries to the appropriate OLAP engine based on
 * query complexity, features used, and availability of engines.
 *
 * Issue: mondodb-623n
 */

import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import {
  QueryRouter,
  createQueryRouter,
  routeQuery,
  detectQueryFeatures,
  type QueryRouterConfig,
  type RoutingDecision,
  type QueryFeatures,
  type EngineCapabilities,
  type EngineAvailability,
} from '../../../../src/olap/stage/router';
import type { OlapStageOptions } from '../../../../src/olap/stage/parser';

// ============================================================================
// Mock Engine Availability Helpers
// ============================================================================

function createMockEngineAvailability(overrides: Partial<EngineAvailability> = {}): EngineAvailability {
  return {
    r2sql: true,
    clickhouse: true,
    ...overrides,
  };
}

function createMockEngineCapabilities(): Record<string, EngineCapabilities> {
  return {
    r2sql: {
      supportsJoins: false,
      supportsWindowFunctions: false,
      supportsCTEs: false,
      supportsSubqueries: true,
      maxConcurrentQueries: 10,
      maxRowsPerQuery: 100000,
      supportedFunctions: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'GROUP BY', 'ORDER BY'],
    },
    clickhouse: {
      supportsJoins: true,
      supportsWindowFunctions: true,
      supportsCTEs: true,
      supportsSubqueries: true,
      maxConcurrentQueries: 100,
      maxRowsPerQuery: 10000000,
      supportedFunctions: [
        'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'GROUP BY', 'ORDER BY',
        'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
        'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'OVER', 'PARTITION BY',
        'WITH', 'UNION', 'INTERSECT', 'EXCEPT',
      ],
    },
  };
}

// ============================================================================
// Test Data Helpers
// ============================================================================

function createSimpleAggregationOptions(): OlapStageOptions {
  return {
    engine: 'auto',
    query: 'SELECT user_id, COUNT(*) as count FROM events GROUP BY user_id',
  };
}

function createJoinQueryOptions(): OlapStageOptions {
  return {
    engine: 'auto',
    query: `
      SELECT u.name, COUNT(e.id) as event_count
      FROM users u
      INNER JOIN events e ON u.id = e.user_id
      GROUP BY u.name
    `,
  };
}

function createWindowFunctionOptions(): OlapStageOptions {
  return {
    engine: 'auto',
    query: `
      SELECT
        user_id,
        event_type,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp DESC) as rn
      FROM events
    `,
  };
}

function createCTEQueryOptions(): OlapStageOptions {
  return {
    engine: 'auto',
    query: `
      WITH active_users AS (
        SELECT user_id, COUNT(*) as activity
        FROM events
        WHERE timestamp > '2024-01-01'
        GROUP BY user_id
      )
      SELECT * FROM active_users WHERE activity > 100
    `,
  };
}

function createComplexAnalyticsOptions(): OlapStageOptions {
  return {
    engine: 'auto',
    query: `
      WITH user_metrics AS (
        SELECT
          user_id,
          DATE_TRUNC('day', timestamp) as day,
          COUNT(*) as daily_events,
          SUM(amount) as daily_total
        FROM events
        WHERE timestamp BETWEEN '2024-01-01' AND '2024-12-31'
        GROUP BY user_id, DATE_TRUNC('day', timestamp)
      ),
      ranked_users AS (
        SELECT
          *,
          ROW_NUMBER() OVER (PARTITION BY day ORDER BY daily_total DESC) as rank
        FROM user_metrics
      )
      SELECT
        r.user_id,
        u.name,
        r.day,
        r.daily_events,
        r.daily_total,
        r.rank
      FROM ranked_users r
      JOIN users u ON r.user_id = u.id
      WHERE r.rank <= 10
      ORDER BY r.day DESC, r.rank ASC
    `,
  };
}

// ============================================================================
// Query Router Tests
// ============================================================================

describe('QueryRouter', () => {
  let router: QueryRouter;
  let mockAvailability: EngineAvailability;
  let mockCapabilities: Record<string, EngineCapabilities>;

  beforeEach(() => {
    mockAvailability = createMockEngineAvailability();
    mockCapabilities = createMockEngineCapabilities();
    router = new QueryRouter({
      availability: mockAvailability,
      capabilities: mockCapabilities,
      defaultEngine: 'auto',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Simple Aggregation Routing
  // ==========================================================================

  describe('simple aggregation routing', () => {
    it('should route simple agg to R2 SQL', () => {
      const options = createSimpleAggregationOptions();

      const decision = router.route(options);

      expect(decision.engine).toBe('r2sql');
      expect(decision.reason).toContain('simple');
    });

    it('should route COUNT queries to R2 SQL', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT COUNT(*) FROM users WHERE active = true',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('r2sql');
    });

    it('should route SUM/AVG queries to R2 SQL', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT user_id, SUM(amount), AVG(amount) FROM orders GROUP BY user_id',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('r2sql');
    });

    it('should route queries with LIMIT to R2 SQL when result set is small', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM users ORDER BY created_at DESC LIMIT 100',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('r2sql');
    });
  });

  // ==========================================================================
  // Complex Aggregation Routing
  // ==========================================================================

  describe('complex aggregation routing', () => {
    it('should route complex agg to ClickHouse', () => {
      const options = createComplexAnalyticsOptions();

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.reason).toContain('complex');
    });

    it('should route queries with multiple tables to ClickHouse', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: `
          SELECT
            o.order_id,
            u.name,
            p.product_name,
            o.quantity,
            o.total
          FROM orders o, users u, products p
          WHERE o.user_id = u.id AND o.product_id = p.id
        `,
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
    });

    it('should route queries expecting large result sets to ClickHouse', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM events',
        maxRows: 500000,
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.reason).toContain('large result set');
    });

    it('should route queries with UNION to ClickHouse', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: `
          SELECT user_id, 'purchase' as event_type FROM purchases
          UNION ALL
          SELECT user_id, 'view' as event_type FROM page_views
        `,
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
    });
  });

  // ==========================================================================
  // JOIN Detection and Routing
  // ==========================================================================

  describe('JOIN detection and routing', () => {
    it('should detect JOINs and route to ClickHouse', () => {
      const options = createJoinQueryOptions();

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasJoins).toBe(true);
      expect(decision.reason).toContain('JOIN');
    });

    it('should detect INNER JOIN', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM orders INNER JOIN users ON orders.user_id = users.id',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasJoins).toBe(true);
    });

    it('should detect LEFT JOIN', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM users LEFT JOIN orders ON users.id = orders.user_id',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasJoins).toBe(true);
    });

    it('should detect RIGHT JOIN', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM orders RIGHT JOIN users ON orders.user_id = users.id',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasJoins).toBe(true);
    });

    it('should detect FULL OUTER JOIN', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM users FULL OUTER JOIN orders ON users.id = orders.user_id',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasJoins).toBe(true);
    });

    it('should detect CROSS JOIN', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM products CROSS JOIN categories',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasJoins).toBe(true);
    });

    it('should detect implicit JOIN syntax', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM users u, orders o WHERE u.id = o.user_id',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasImplicitJoin).toBe(true);
    });
  });

  // ==========================================================================
  // Window Function Detection and Routing
  // ==========================================================================

  describe('window function detection and routing', () => {
    it('should detect window functions and route to ClickHouse', () => {
      const options = createWindowFunctionOptions();

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasWindowFunctions).toBe(true);
      expect(decision.reason).toContain('window function');
    });

    it('should detect ROW_NUMBER()', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT *, ROW_NUMBER() OVER (ORDER BY id) as rn FROM users',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasWindowFunctions).toBe(true);
    });

    it('should detect RANK()', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT *, RANK() OVER (ORDER BY score DESC) as rank FROM scores',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasWindowFunctions).toBe(true);
    });

    it('should detect DENSE_RANK()', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT *, DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC) as dr FROM employees',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasWindowFunctions).toBe(true);
    });

    it('should detect LAG()', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT *, LAG(value, 1) OVER (ORDER BY timestamp) as prev_value FROM metrics',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasWindowFunctions).toBe(true);
    });

    it('should detect LEAD()', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT *, LEAD(value, 1) OVER (ORDER BY timestamp) as next_value FROM metrics',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasWindowFunctions).toBe(true);
    });

    it('should detect NTILE()', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT *, NTILE(4) OVER (ORDER BY amount) as quartile FROM orders',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasWindowFunctions).toBe(true);
    });

    it('should detect aggregate functions with OVER clause', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT *, SUM(amount) OVER (PARTITION BY user_id ORDER BY date) as running_total FROM orders',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasWindowFunctions).toBe(true);
    });

    it('should detect PARTITION BY clause', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT *, COUNT(*) OVER (PARTITION BY category) as category_count FROM products',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasWindowFunctions).toBe(true);
    });
  });

  // ==========================================================================
  // CTE Detection and Routing
  // ==========================================================================

  describe('CTE detection and routing', () => {
    it('should detect CTEs and route to ClickHouse', () => {
      const options = createCTEQueryOptions();

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasCTEs).toBe(true);
    });

    it('should detect simple WITH clause', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: `
          WITH totals AS (SELECT SUM(amount) as total FROM orders)
          SELECT * FROM totals
        `,
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasCTEs).toBe(true);
    });

    it('should detect multiple CTEs', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: `
          WITH
            users_cte AS (SELECT * FROM users WHERE active = true),
            orders_cte AS (SELECT * FROM orders WHERE status = 'completed')
          SELECT u.*, o.total
          FROM users_cte u
          JOIN orders_cte o ON u.id = o.user_id
        `,
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasCTEs).toBe(true);
    });

    it('should detect recursive CTEs', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: `
          WITH RECURSIVE subordinates AS (
            SELECT id, name, manager_id FROM employees WHERE manager_id IS NULL
            UNION ALL
            SELECT e.id, e.name, e.manager_id
            FROM employees e
            INNER JOIN subordinates s ON s.id = e.manager_id
          )
          SELECT * FROM subordinates
        `,
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.features?.hasCTEs).toBe(true);
      expect(decision.features?.hasRecursiveCTE).toBe(true);
    });
  });

  // ==========================================================================
  // Explicit Engine Override
  // ==========================================================================

  describe('explicit engine override', () => {
    it('should respect explicit engine override', () => {
      const options: OlapStageOptions = {
        engine: 'r2sql',
        query: `
          SELECT * FROM users u
          JOIN orders o ON u.id = o.user_id
        `,
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('r2sql');
      expect(decision.overridden).toBe(true);
      expect(decision.warnings).toContain('R2 SQL does not support JOINs');
    });

    it('should respect clickhouse override for simple query', () => {
      const options: OlapStageOptions = {
        engine: 'clickhouse',
        query: 'SELECT COUNT(*) FROM users',
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.overridden).toBe(true);
    });

    it('should warn when forcing query to unsupported engine', () => {
      const options: OlapStageOptions = {
        engine: 'r2sql',
        query: `
          SELECT *, ROW_NUMBER() OVER (ORDER BY id) as rn FROM users
        `,
      };

      const decision = router.route(options);

      expect(decision.engine).toBe('r2sql');
      expect(decision.overridden).toBe(true);
      expect(decision.warnings).toContain('window functions');
    });

    it('should not allow override to unavailable engine', () => {
      const unavailableRouter = new QueryRouter({
        availability: createMockEngineAvailability({ clickhouse: false }),
        capabilities: mockCapabilities,
        defaultEngine: 'auto',
      });

      const options: OlapStageOptions = {
        engine: 'clickhouse',
        query: 'SELECT * FROM users',
      };

      const decision = unavailableRouter.route(options);

      expect(decision.engine).toBe('r2sql');
      expect(decision.fallback).toBe(true);
      expect(decision.reason).toContain('unavailable');
    });
  });

  // ==========================================================================
  // Engine Fallback Tests
  // ==========================================================================

  describe('fallback when engine unavailable', () => {
    it('should fallback to R2 SQL when ClickHouse unavailable', () => {
      const unavailableRouter = new QueryRouter({
        availability: createMockEngineAvailability({ clickhouse: false }),
        capabilities: mockCapabilities,
        defaultEngine: 'auto',
      });

      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT user_id, COUNT(*) FROM events GROUP BY user_id',
      };

      const decision = unavailableRouter.route(options);

      expect(decision.engine).toBe('r2sql');
      expect(decision.fallback).toBe(true);
    });

    it('should fallback to ClickHouse when R2 SQL unavailable', () => {
      const unavailableRouter = new QueryRouter({
        availability: createMockEngineAvailability({ r2sql: false }),
        capabilities: mockCapabilities,
        defaultEngine: 'auto',
      });

      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT COUNT(*) FROM users',
      };

      const decision = unavailableRouter.route(options);

      expect(decision.engine).toBe('clickhouse');
      expect(decision.fallback).toBe(true);
    });

    it('should throw error when no engine available', () => {
      const noEnginesRouter = new QueryRouter({
        availability: createMockEngineAvailability({ r2sql: false, clickhouse: false }),
        capabilities: mockCapabilities,
        defaultEngine: 'auto',
      });

      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM users',
      };

      expect(() => noEnginesRouter.route(options)).toThrow('No OLAP engine available');
    });

    it('should add warning when using fallback', () => {
      const unavailableRouter = new QueryRouter({
        availability: createMockEngineAvailability({ clickhouse: false }),
        capabilities: mockCapabilities,
        defaultEngine: 'auto',
      });

      const options = createJoinQueryOptions();

      const decision = unavailableRouter.route(options);

      expect(decision.engine).toBe('r2sql');
      expect(decision.fallback).toBe(true);
      expect(decision.warnings).toBeDefined();
      expect(decision.warnings?.length).toBeGreaterThan(0);
    });

    it('should indicate query may fail when fallback lacks features', () => {
      const unavailableRouter = new QueryRouter({
        availability: createMockEngineAvailability({ clickhouse: false }),
        capabilities: mockCapabilities,
        defaultEngine: 'auto',
      });

      const options = createWindowFunctionOptions();

      const decision = unavailableRouter.route(options);

      expect(decision.engine).toBe('r2sql');
      expect(decision.fallback).toBe(true);
      expect(decision.mayFail).toBe(true);
      expect(decision.warnings).toContain('window functions are not supported');
    });
  });

  // ==========================================================================
  // Subquery Detection
  // ==========================================================================

  describe('subquery detection', () => {
    it('should detect subqueries in SELECT', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: `
          SELECT
            name,
            (SELECT COUNT(*) FROM orders WHERE orders.user_id = users.id) as order_count
          FROM users
        `,
      };

      const decision = router.route(options);

      expect(decision.features?.hasSubqueries).toBe(true);
    });

    it('should detect subqueries in WHERE', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: `
          SELECT * FROM users
          WHERE id IN (SELECT user_id FROM orders WHERE total > 1000)
        `,
      };

      const decision = router.route(options);

      expect(decision.features?.hasSubqueries).toBe(true);
    });

    it('should detect subqueries in FROM', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: `
          SELECT * FROM (
            SELECT user_id, SUM(amount) as total
            FROM orders
            GROUP BY user_id
          ) as user_totals
          WHERE total > 1000
        `,
      };

      const decision = router.route(options);

      expect(decision.features?.hasSubqueries).toBe(true);
    });
  });

  // ==========================================================================
  // Query Complexity Scoring
  // ==========================================================================

  describe('query complexity scoring', () => {
    it('should assign low complexity to simple queries', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM users WHERE active = true',
      };

      const decision = router.route(options);

      expect(decision.complexity).toBe('low');
    });

    it('should assign medium complexity to queries with GROUP BY', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT status, COUNT(*) FROM orders GROUP BY status',
      };

      const decision = router.route(options);

      expect(decision.complexity).toBe('medium');
    });

    it('should assign high complexity to queries with JOINs and window functions', () => {
      const options = createComplexAnalyticsOptions();

      const decision = router.route(options);

      expect(decision.complexity).toBe('high');
    });

    it('should consider table count in complexity', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: `
          SELECT a.*, b.*, c.*, d.*
          FROM table_a a
          JOIN table_b b ON a.id = b.a_id
          JOIN table_c c ON b.id = c.b_id
          JOIN table_d d ON c.id = d.c_id
        `,
      };

      const decision = router.route(options);

      expect(decision.complexity).toBe('high');
      expect(decision.features?.tableCount).toBeGreaterThanOrEqual(4);
    });
  });

  // ==========================================================================
  // Routing Metadata
  // ==========================================================================

  describe('routing metadata', () => {
    it('should include timestamp in decision', () => {
      const options = createSimpleAggregationOptions();

      const decision = router.route(options);

      expect(decision.timestamp).toBeDefined();
      expect(typeof decision.timestamp).toBe('number');
    });

    it('should include routing version', () => {
      const options = createSimpleAggregationOptions();

      const decision = router.route(options);

      expect(decision.routerVersion).toBeDefined();
    });

    it('should include feature detection details', () => {
      const options = createComplexAnalyticsOptions();

      const decision = router.route(options);

      expect(decision.features).toBeDefined();
      expect(typeof decision.features?.hasJoins).toBe('boolean');
      expect(typeof decision.features?.hasWindowFunctions).toBe('boolean');
      expect(typeof decision.features?.hasCTEs).toBe('boolean');
    });

    it('should include estimated row count hint', () => {
      const options: OlapStageOptions = {
        engine: 'auto',
        query: 'SELECT * FROM events WHERE timestamp > now() - INTERVAL 1 DAY',
        partition: {
          column: 'timestamp',
          start: '2024-01-01',
          end: '2024-01-02',
        },
      };

      const decision = router.route(options);

      expect(decision.estimatedRows).toBeDefined();
    });
  });
});

// ============================================================================
// Standalone Route Function Tests
// ============================================================================

describe('routeQuery function', () => {
  it('should route query with default configuration', () => {
    const options: OlapStageOptions = {
      engine: 'auto',
      query: 'SELECT * FROM users',
    };

    const decision = routeQuery(options);

    expect(decision.engine).toBeDefined();
    expect(['r2sql', 'clickhouse']).toContain(decision.engine);
  });

  it('should accept custom configuration', () => {
    const options: OlapStageOptions = {
      engine: 'auto',
      query: 'SELECT * FROM users',
    };

    const config: QueryRouterConfig = {
      availability: { r2sql: true, clickhouse: false },
      capabilities: createMockEngineCapabilities(),
      defaultEngine: 'r2sql',
    };

    const decision = routeQuery(options, config);

    expect(decision.engine).toBe('r2sql');
  });
});

// ============================================================================
// Query Feature Detection Tests
// ============================================================================

describe('detectQueryFeatures function', () => {
  it('should detect all features in complex query', () => {
    const query = `
      WITH cte AS (SELECT * FROM table1)
      SELECT
        t1.*,
        ROW_NUMBER() OVER (ORDER BY id) as rn
      FROM cte t1
      JOIN table2 t2 ON t1.id = t2.t1_id
      WHERE t1.value > (SELECT AVG(value) FROM table1)
    `;

    const features = detectQueryFeatures(query);

    expect(features.hasCTEs).toBe(true);
    expect(features.hasWindowFunctions).toBe(true);
    expect(features.hasJoins).toBe(true);
    expect(features.hasSubqueries).toBe(true);
  });

  it('should return all false for simple SELECT', () => {
    const query = 'SELECT id, name FROM users WHERE active = true';

    const features = detectQueryFeatures(query);

    expect(features.hasCTEs).toBe(false);
    expect(features.hasWindowFunctions).toBe(false);
    expect(features.hasJoins).toBe(false);
    expect(features.hasSubqueries).toBe(false);
  });

  it('should detect GROUP BY', () => {
    const query = 'SELECT status, COUNT(*) FROM orders GROUP BY status';

    const features = detectQueryFeatures(query);

    expect(features.hasGroupBy).toBe(true);
  });

  it('should detect HAVING clause', () => {
    const query = 'SELECT status, COUNT(*) as cnt FROM orders GROUP BY status HAVING cnt > 10';

    const features = detectQueryFeatures(query);

    expect(features.hasHaving).toBe(true);
  });

  it('should detect ORDER BY', () => {
    const query = 'SELECT * FROM users ORDER BY created_at DESC';

    const features = detectQueryFeatures(query);

    expect(features.hasOrderBy).toBe(true);
  });

  it('should detect DISTINCT', () => {
    const query = 'SELECT DISTINCT user_id FROM events';

    const features = detectQueryFeatures(query);

    expect(features.hasDistinct).toBe(true);
  });

  it('should count tables referenced', () => {
    const query = `
      SELECT * FROM users u
      JOIN orders o ON u.id = o.user_id
      JOIN products p ON o.product_id = p.id
    `;

    const features = detectQueryFeatures(query);

    expect(features.tableCount).toBe(3);
  });
});

// ============================================================================
// createQueryRouter Factory Tests
// ============================================================================

describe('createQueryRouter factory', () => {
  it('should create router with default config', () => {
    const router = createQueryRouter();

    expect(router).toBeInstanceOf(QueryRouter);
  });

  it('should create router with custom availability', () => {
    const router = createQueryRouter({
      availability: { r2sql: true, clickhouse: false },
    });

    const decision = router.route({
      engine: 'auto',
      query: 'SELECT * FROM users',
    });

    expect(decision.engine).toBe('r2sql');
  });

  it('should create router with preference hints', () => {
    const router = createQueryRouter({
      preferEngine: 'clickhouse',
    });

    const decision = router.route({
      engine: 'auto',
      query: 'SELECT COUNT(*) FROM users',
    });

    // Should prefer ClickHouse even for simple query when explicitly preferred
    expect(decision.engine).toBe('clickhouse');
  });

  it('should create router with cost-based optimization', () => {
    const router = createQueryRouter({
      enableCostBasedRouting: true,
      costFactors: {
        r2sql: { baseCost: 1, perRowCost: 0.001 },
        clickhouse: { baseCost: 10, perRowCost: 0.0001 },
      },
    });

    expect(router).toBeDefined();
  });
});
