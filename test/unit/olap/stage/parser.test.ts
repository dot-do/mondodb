/**
 * $olap Stage Parser Tests (TDD - RED phase)
 *
 * Tests for parsing the $olap aggregation stage. The $olap stage allows
 * routing analytical queries to OLAP engines (R2 SQL, ClickHouse) from
 * within MongoDB aggregation pipelines.
 *
 * Issue: mondodb-623n
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OlapStageParser,
  parseOlapStage,
  validateOlapStageOptions,
  type OlapStageOptions,
  type OlapEngine,
  type OlapQuery,
  type PartitionOptions,
  type OlapStageParseResult,
} from '../../../../src/olap/stage/parser';

// ============================================================================
// Test Data Helpers
// ============================================================================

function createBasicOlapStage(engine: OlapEngine = 'auto'): Record<string, unknown> {
  return {
    $olap: {
      engine,
      query: 'SELECT * FROM analytics.events',
    },
  };
}

function createOlapStageWithPartitions(partitions: PartitionOptions): Record<string, unknown> {
  return {
    $olap: {
      engine: 'clickhouse',
      query: 'SELECT * FROM analytics.events',
      partition: partitions,
    },
  };
}

function createComplexOlapStage(): Record<string, unknown> {
  return {
    $olap: {
      engine: 'clickhouse',
      query: {
        select: ['user_id', 'COUNT(*) as event_count'],
        from: 'analytics.events',
        where: { timestamp: { $gte: '2024-01-01' } },
        groupBy: ['user_id'],
        having: { event_count: { $gt: 100 } },
        orderBy: [{ field: 'event_count', direction: 'DESC' }],
        limit: 1000,
      },
      partition: {
        column: 'timestamp',
        start: '2024-01-01',
        end: '2024-12-31',
        interval: 'month',
      },
      timeout: 30000,
      maxRows: 10000,
    },
  };
}

// ============================================================================
// $olap Stage Parser Tests
// ============================================================================

describe('$olap Stage Parser', () => {
  let parser: OlapStageParser;

  beforeEach(() => {
    parser = new OlapStageParser();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Engine Selection Tests
  // ==========================================================================

  describe('engine selection', () => {
    it('should parse $olap with engine: r2sql', () => {
      const stage = {
        $olap: {
          engine: 'r2sql',
          query: 'SELECT * FROM users WHERE active = true',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.engine).toBe('r2sql');
      expect(result.options?.query).toBe('SELECT * FROM users WHERE active = true');
    });

    it('should parse $olap with engine: clickhouse', () => {
      const stage = {
        $olap: {
          engine: 'clickhouse',
          query: 'SELECT user_id, COUNT(*) FROM events GROUP BY user_id',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.engine).toBe('clickhouse');
      expect(result.options?.query).toBe('SELECT user_id, COUNT(*) FROM events GROUP BY user_id');
    });

    it('should parse $olap with auto engine selection', () => {
      const stage = {
        $olap: {
          engine: 'auto',
          query: 'SELECT * FROM metrics',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.engine).toBe('auto');
    });

    it('should default to auto engine when not specified', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM metrics',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.engine).toBe('auto');
    });

    it('should reject invalid engine', () => {
      const stage = {
        $olap: {
          engine: 'postgres',
          query: 'SELECT * FROM users',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid engine');
      expect(result.error).toContain('postgres');
    });

    it('should reject non-string engine value', () => {
      const stage = {
        $olap: {
          engine: 123,
          query: 'SELECT * FROM users',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('engine');
    });
  });

  // ==========================================================================
  // Query Syntax Validation Tests
  // ==========================================================================

  describe('query syntax validation', () => {
    it('should validate simple string query', () => {
      const stage = {
        $olap: {
          query: 'SELECT id, name FROM users WHERE age > 18',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.query).toBe('SELECT id, name FROM users WHERE age > 18');
    });

    it('should validate query with complex SQL features', () => {
      const stage = {
        $olap: {
          engine: 'clickhouse',
          query: `
            WITH active_users AS (
              SELECT user_id, COUNT(*) as activity_count
              FROM events
              WHERE timestamp > '2024-01-01'
              GROUP BY user_id
              HAVING COUNT(*) > 10
            )
            SELECT u.name, au.activity_count
            FROM users u
            JOIN active_users au ON u.id = au.user_id
            ORDER BY au.activity_count DESC
            LIMIT 100
          `,
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.query).toContain('WITH active_users AS');
    });

    it('should validate structured query object', () => {
      const stage = {
        $olap: {
          query: {
            select: ['user_id', 'SUM(amount) as total'],
            from: 'orders',
            where: { status: 'completed' },
            groupBy: ['user_id'],
            orderBy: [{ field: 'total', direction: 'DESC' }],
            limit: 100,
          },
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.query).toEqual(stage.$olap.query);
    });

    it('should reject empty query', () => {
      const stage = {
        $olap: {
          engine: 'r2sql',
          query: '',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('query');
    });

    it('should reject missing query field', () => {
      const stage = {
        $olap: {
          engine: 'clickhouse',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('query');
    });

    it('should reject query with disallowed statements (INSERT)', () => {
      const stage = {
        $olap: {
          query: "INSERT INTO users (name) VALUES ('test')",
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('INSERT');
    });

    it('should reject query with disallowed statements (DELETE)', () => {
      const stage = {
        $olap: {
          query: 'DELETE FROM users WHERE inactive = true',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('DELETE');
    });

    it('should reject query with disallowed statements (DROP)', () => {
      const stage = {
        $olap: {
          query: 'DROP TABLE users',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('DROP');
    });

    it('should reject query with multiple statements', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM users; DELETE FROM users;',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('multiple statements');
    });

    it('should validate query with parameters', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM users WHERE age > :minAge AND status = :status',
          parameters: {
            minAge: 18,
            status: 'active',
          },
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.parameters).toEqual({
        minAge: 18,
        status: 'active',
      });
    });

    it('should reject invalid parameter types', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM users WHERE data = :data',
          parameters: {
            data: () => {},
          },
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('parameter');
    });
  });

  // ==========================================================================
  // Partition Options Tests
  // ==========================================================================

  describe('partition options validation', () => {
    it('should validate partition by timestamp column', () => {
      const stage = {
        $olap: {
          engine: 'clickhouse',
          query: 'SELECT * FROM events',
          partition: {
            column: 'timestamp',
            start: '2024-01-01',
            end: '2024-12-31',
          },
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.partition?.column).toBe('timestamp');
      expect(result.options?.partition?.start).toBe('2024-01-01');
      expect(result.options?.partition?.end).toBe('2024-12-31');
    });

    it('should validate partition with interval', () => {
      const stage = {
        $olap: {
          engine: 'clickhouse',
          query: 'SELECT * FROM events',
          partition: {
            column: 'created_at',
            start: '2024-01-01',
            end: '2024-06-30',
            interval: 'month',
          },
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.partition?.interval).toBe('month');
    });

    it('should validate partition with numeric range', () => {
      const stage = {
        $olap: {
          engine: 'r2sql',
          query: 'SELECT * FROM users',
          partition: {
            column: 'user_id',
            start: 1,
            end: 1000000,
            step: 10000,
          },
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.partition?.step).toBe(10000);
    });

    it('should reject partition without column', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM events',
          partition: {
            start: '2024-01-01',
            end: '2024-12-31',
          },
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('column');
    });

    it('should reject partition with invalid interval', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM events',
          partition: {
            column: 'timestamp',
            start: '2024-01-01',
            end: '2024-12-31',
            interval: 'invalid',
          },
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('interval');
    });

    it('should reject partition with end before start', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM events',
          partition: {
            column: 'timestamp',
            start: '2024-12-31',
            end: '2024-01-01',
          },
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('start');
    });
  });

  // ==========================================================================
  // Additional Options Tests
  // ==========================================================================

  describe('additional options', () => {
    it('should parse timeout option', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM large_table',
          timeout: 60000,
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.timeout).toBe(60000);
    });

    it('should reject invalid timeout value', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM users',
          timeout: -1000,
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should parse maxRows option', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM events',
          maxRows: 50000,
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.maxRows).toBe(50000);
    });

    it('should reject maxRows exceeding system limit', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM events',
          maxRows: 10000001,
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('maxRows');
    });

    it('should parse outputFormat option', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM events',
          outputFormat: 'documents',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.options?.outputFormat).toBe('documents');
    });

    it('should validate allowed output formats', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM events',
          outputFormat: 'invalid_format',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outputFormat');
    });
  });

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================

  describe('edge cases and error handling', () => {
    it('should handle null $olap value', () => {
      const stage = {
        $olap: null,
      };

      const result = parser.parse(stage as unknown as Record<string, unknown>);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('$olap');
    });

    it('should handle non-object $olap value', () => {
      const stage = {
        $olap: 'invalid',
      };

      const result = parser.parse(stage as unknown as Record<string, unknown>);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('object');
    });

    it('should handle stage without $olap key', () => {
      const stage = {
        $match: { status: 'active' },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('$olap');
    });

    it('should handle unknown options gracefully', () => {
      const stage = {
        $olap: {
          query: 'SELECT * FROM users',
          unknownOption: 'value',
        },
      };

      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('unknownOption');
    });

    it('should preserve original stage reference', () => {
      const stage = createBasicOlapStage('clickhouse');
      const result = parser.parse(stage);

      expect(result.isValid).toBe(true);
      expect(result.originalStage).toBe(stage);
    });
  });
});

// ============================================================================
// Standalone Parse Function Tests
// ============================================================================

describe('parseOlapStage function', () => {
  it('should parse valid stage', () => {
    const stage = {
      $olap: {
        engine: 'clickhouse',
        query: 'SELECT * FROM events',
      },
    };

    const result = parseOlapStage(stage);

    expect(result.isValid).toBe(true);
    expect(result.options?.engine).toBe('clickhouse');
  });

  it('should return error for invalid stage', () => {
    const stage = {
      $olap: {
        engine: 'invalid',
      },
    };

    const result = parseOlapStage(stage);

    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// Validate Options Function Tests
// ============================================================================

describe('validateOlapStageOptions function', () => {
  it('should validate complete options object', () => {
    const options: OlapStageOptions = {
      engine: 'clickhouse',
      query: 'SELECT * FROM events',
      partition: {
        column: 'timestamp',
        start: '2024-01-01',
        end: '2024-12-31',
      },
      timeout: 30000,
      maxRows: 10000,
    };

    const result = validateOlapStageOptions(options);

    expect(result.isValid).toBe(true);
  });

  it('should reject options with missing required fields', () => {
    const options = {
      engine: 'clickhouse',
      // missing query
    } as unknown as OlapStageOptions;

    const result = validateOlapStageOptions(options);

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('query');
  });

  it('should validate r2sql engine constraints', () => {
    const options: OlapStageOptions = {
      engine: 'r2sql',
      query: 'SELECT user_id, SUM(amount) FROM orders GROUP BY user_id',
    };

    const result = validateOlapStageOptions(options);

    expect(result.isValid).toBe(true);
  });

  it('should validate clickhouse-specific options', () => {
    const options: OlapStageOptions = {
      engine: 'clickhouse',
      query: 'SELECT * FROM events',
      settings: {
        max_threads: 8,
        max_memory_usage: 10737418240,
      },
    };

    const result = validateOlapStageOptions(options);

    expect(result.isValid).toBe(true);
    expect(result.options?.settings?.max_threads).toBe(8);
  });
});
