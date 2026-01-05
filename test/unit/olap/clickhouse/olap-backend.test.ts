/**
 * ClickHouse OLAP Backend Tests (TDD - RED phase)
 *
 * Tests for ClickHouseOLAPBackend which implements MondoBackend interface
 * for read-only analytical queries against ClickHouse.
 *
 * The OLAP backend is READ-ONLY - no insert/update/delete operations.
 * It translates MongoDB queries to ClickHouse SQL using AggregationTranslator.
 *
 * Issue: mongo.do-yubk
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { ObjectId } from '../../../../src/types/objectid';
import {
  ClickHouseOLAPBackend,
  createClickHouseOLAPBackend,
  type ClickHouseOLAPConfig,
  type ClickHouseOLAPCursor,
  ReadOnlyOperationError,
} from '../../../../src/olap/clickhouse/olap-backend';
import type {
  MondoBackend,
  FindOptions,
  FindResult,
  AggregateResult,
  DatabaseInfo,
  CollectionInfo,
  CollStats,
} from '../../../../src/wire/backend/interface';

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
        statistics: statistics ?? { elapsed: 0.01, rows_read: data.length, bytes_read: 1024 },
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
// ClickHouse OLAP Backend Tests
// ============================================================================

describe('ClickHouseOLAPBackend', () => {
  let mockFetch: Mock;
  let backend: ClickHouseOLAPBackend;
  let config: ClickHouseOLAPConfig;

  beforeEach(async () => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Setup default connection response
    mockFetch.mockResolvedValueOnce(createMockConnectionResponse());

    config = {
      host: 'clickhouse.example.com',
      port: 8443,
      database: 'analytics',
      username: 'default',
      password: 'secret',
      secure: true,
    };

    backend = await createClickHouseOLAPBackend(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Backend Creation Tests
  // ==========================================================================

  describe('backend creation', () => {
    it('should create backend with valid config', async () => {
      expect(backend).toBeDefined();
      expect(backend).toBeInstanceOf(ClickHouseOLAPBackend);
    });

    it('should verify connection on creation', async () => {
      // Connection check was called during creation
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('clickhouse.example.com'),
        expect.any(Object)
      );
    });

    it('should throw error for invalid connection', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(createMockErrorResponse('Connection refused', 502));

      await expect(createClickHouseOLAPBackend(config)).rejects.toThrow('Connection refused');
    });

    it('should support custom HTTP headers', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(createMockConnectionResponse());

      const customConfig: ClickHouseOLAPConfig = {
        ...config,
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      };

      await createClickHouseOLAPBackend(customConfig);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
          }),
        })
      );
    });

    it('should implement MondoBackend interface', () => {
      // Verify all required methods exist
      expect(typeof backend.listDatabases).toBe('function');
      expect(typeof backend.listCollections).toBe('function');
      expect(typeof backend.find).toBe('function');
      expect(typeof backend.aggregate).toBe('function');
      expect(typeof backend.collStats).toBe('function');
    });
  });

  // ==========================================================================
  // find() Operations Tests
  // ==========================================================================

  describe('find() operations', () => {
    it('should translate find query to SQL and execute', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [
            { _id: '507f1f77bcf86cd799439011', name: 'Alice', age: 30 },
            { _id: '507f1f77bcf86cd799439012', name: 'Bob', age: 25 },
          ],
          [
            { name: '_id', type: 'String' },
            { name: 'name', type: 'String' },
            { name: 'age', type: 'UInt32' },
          ]
        )
      );

      const result = await backend.find('analytics', 'users', {});

      expect(result).toBeDefined();
      expect(result.documents).toHaveLength(2);
      expect(result.documents[0].name).toBe('Alice');
      expect(result.cursorId).toBeDefined();
    });

    it('should handle filter with comparison operators', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [{ _id: '507f1f77bcf86cd799439011', name: 'Alice', age: 30 }],
          [
            { name: '_id', type: 'String' },
            { name: 'name', type: 'String' },
            { name: 'age', type: 'UInt32' },
          ]
        )
      );

      const options: FindOptions = {
        filter: { age: { $gte: 25, $lt: 35 } },
      };

      const result = await backend.find('analytics', 'users', options);

      expect(result.documents).toHaveLength(1);
      // Verify SQL was generated with WHERE clause
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/WHERE.*age.*>=.*25.*AND.*age.*<.*35/i),
        })
      );
    });

    it('should handle $eq operator', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ _id: '1', status: 'active' }])
      );

      await backend.find('analytics', 'users', {
        filter: { status: { $eq: 'active' } },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/status\s*=\s*'active'/i),
        })
      );
    });

    it('should handle $ne operator', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        filter: { status: { $ne: 'deleted' } },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/status\s*(<>|!=|<>\s*|!=\s*)\s*'deleted'/i),
        })
      );
    });

    it('should handle $in operator', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        filter: { status: { $in: ['active', 'pending'] } },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/status\s+IN\s*\(\s*'active'\s*,\s*'pending'\s*\)/i),
        })
      );
    });

    it('should handle $nin operator', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        filter: { status: { $nin: ['deleted', 'archived'] } },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/status\s+NOT\s+IN\s*\(/i),
        })
      );
    });

    it('should handle $exists operator', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        filter: { email: { $exists: true } },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/email\s+IS\s+NOT\s+NULL/i),
        })
      );
    });

    it('should handle $and operator', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        filter: {
          $and: [{ age: { $gte: 18 } }, { status: 'active' }],
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/\(\s*age\s*>=\s*18\s*\)\s*AND\s*\(\s*status\s*=/i),
        })
      );
    });

    it('should handle $or operator', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        filter: {
          $or: [{ status: 'active' }, { status: 'pending' }],
        },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/\(\s*status\s*=.*\)\s*OR\s*\(\s*status\s*=/i),
        })
      );
    });

    it('should handle projection fields', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          [{ name: 'Alice', email: 'alice@example.com' }],
          [
            { name: 'name', type: 'String' },
            { name: 'email', type: 'String' },
          ]
        )
      );

      const options: FindOptions = {
        projection: { name: 1, email: 1 },
      };

      const result = await backend.find('analytics', 'users', options);

      expect(result.documents[0]).toHaveProperty('name');
      expect(result.documents[0]).toHaveProperty('email');
      // Verify SELECT clause includes only projected fields
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/SELECT\s+.*name.*,.*email/i),
        })
      );
    });

    it('should handle projection exclusion', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ _id: '1', name: 'Alice' }])
      );

      await backend.find('analytics', 'users', {
        projection: { password: 0, secret: 0 },
      });

      // Excluded fields should not appear in SELECT
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.not.stringMatching(/password|secret/i),
        })
      );
    });

    it('should handle sort option', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { _id: '2', name: 'Alice' },
          { _id: '1', name: 'Bob' },
        ])
      );

      const options: FindOptions = {
        sort: { name: 1 },
      };

      await backend.find('analytics', 'users', options);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/ORDER\s+BY\s+name\s+ASC/i),
        })
      );
    });

    it('should handle descending sort', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        sort: { createdAt: -1 },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/ORDER\s+BY\s+createdAt\s+DESC/i),
        })
      );
    });

    it('should handle multi-field sort', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        sort: { status: 1, createdAt: -1 },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/ORDER\s+BY\s+status\s+ASC\s*,\s*createdAt\s+DESC/i),
        })
      );
    });

    it('should handle limit option', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ _id: '1', name: 'Alice' }])
      );

      const options: FindOptions = {
        limit: 10,
      };

      await backend.find('analytics', 'users', options);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/LIMIT\s+10/i),
        })
      );
    });

    it('should handle skip option', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      const options: FindOptions = {
        skip: 20,
      };

      await backend.find('analytics', 'users', options);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/OFFSET\s+20/i),
        })
      );
    });

    it('should handle combined limit and skip', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        limit: 10,
        skip: 20,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/LIMIT\s+10\s+OFFSET\s+20/i),
        })
      );
    });

    it('should return cursor-like result', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          Array.from({ length: 150 }, (_, i) => ({
            _id: String(i),
            value: i,
          }))
        )
      );

      const result = await backend.find('analytics', 'large_collection', {
        batchSize: 100,
      });

      expect(result.cursorId).not.toBe(0n);
      expect(result.hasMore).toBe(true);
      expect(result.documents.length).toBeLessThanOrEqual(100);
    });

    it('should handle nested field queries', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        filter: { 'address.city': 'New York' },
      });

      // ClickHouse uses JSON path syntax
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/address.*city|JSONExtractString.*address.*city/i),
        })
      );
    });

    it('should handle _id queries with ObjectId conversion', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ _id: '507f1f77bcf86cd799439011', name: 'Alice' }])
      );

      const oid = new ObjectId('507f1f77bcf86cd799439011');
      await backend.find('analytics', 'users', {
        filter: { _id: oid },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/_id\s*=\s*'507f1f77bcf86cd799439011'/i),
        })
      );
    });
  });

  // ==========================================================================
  // aggregate() Operations Tests
  // ==========================================================================

  describe('aggregate() operations', () => {
    it('should execute $match stage', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ _id: '1', name: 'Alice', status: 'active' }])
      );

      const result = await backend.aggregate('analytics', 'users', [
        { $match: { status: 'active' } },
      ]);

      expect(result.documents).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/WHERE\s+status\s*=\s*'active'/i),
        })
      );
    });

    it('should execute $group with $sum accumulator', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { _id: 'electronics', totalSales: 5000 },
          { _id: 'clothing', totalSales: 3000 },
        ])
      );

      const result = await backend.aggregate('analytics', 'sales', [
        { $group: { _id: '$category', totalSales: { $sum: '$amount' } } },
      ]);

      expect(result.documents).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/GROUP\s+BY.*category/i),
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/SUM\s*\(\s*amount\s*\)/i),
        })
      );
    });

    it('should execute $group with $avg accumulator', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ _id: null, avgAge: 32.5 }])
      );

      await backend.aggregate('analytics', 'users', [
        { $group: { _id: null, avgAge: { $avg: '$age' } } },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/AVG\s*\(\s*age\s*\)/i),
        })
      );
    });

    it('should execute $group with $count accumulator', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ _id: 'active', count: 150 }])
      );

      await backend.aggregate('analytics', 'users', [
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/COUNT\s*\(\s*\*\s*\)|SUM\s*\(\s*1\s*\)/i),
        })
      );
    });

    it('should execute $group with $min accumulator', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ _id: null, minPrice: 9.99 }])
      );

      await backend.aggregate('analytics', 'products', [
        { $group: { _id: null, minPrice: { $min: '$price' } } },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/MIN\s*\(\s*price\s*\)/i),
        })
      );
    });

    it('should execute $group with $max accumulator', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ _id: null, maxPrice: 999.99 }])
      );

      await backend.aggregate('analytics', 'products', [
        { $group: { _id: null, maxPrice: { $max: '$price' } } },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/MAX\s*\(\s*price\s*\)/i),
        })
      );
    });

    it('should execute $project stage', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ fullName: 'Alice Smith', yearJoined: 2023 }])
      );

      await backend.aggregate('analytics', 'users', [
        {
          $project: {
            fullName: { $concat: ['$firstName', ' ', '$lastName'] },
            yearJoined: { $year: '$createdAt' },
          },
        },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/CONCAT|concat/i),
        })
      );
    });

    it('should execute $sort stage', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.aggregate('analytics', 'users', [{ $sort: { age: -1 } }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/ORDER\s+BY\s+age\s+DESC/i),
        })
      );
    });

    it('should execute $limit stage', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.aggregate('analytics', 'users', [{ $limit: 5 }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/LIMIT\s+5/i),
        })
      );
    });

    it('should execute $skip stage', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.aggregate('analytics', 'users', [{ $skip: 10 }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/OFFSET\s+10/i),
        })
      );
    });

    it('should handle multi-stage pipelines', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { _id: 'electronics', avgSales: 250.5 },
          { _id: 'clothing', avgSales: 125.25 },
        ])
      );

      await backend.aggregate('analytics', 'sales', [
        { $match: { status: 'completed' } },
        { $group: { _id: '$category', avgSales: { $avg: '$amount' } } },
        { $sort: { avgSales: -1 } },
        { $limit: 10 },
      ]);

      const callBody = mockFetch.mock.calls[1][1].body;
      expect(callBody).toMatch(/WHERE.*status/i);
      expect(callBody).toMatch(/GROUP\s+BY/i);
      expect(callBody).toMatch(/AVG/i);
      expect(callBody).toMatch(/ORDER\s+BY/i);
      expect(callBody).toMatch(/LIMIT/i);
    });

    it('should execute $facet for parallel pipelines', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          {
            categorySummary: [
              { _id: 'electronics', count: 50 },
              { _id: 'clothing', count: 30 },
            ],
            priceBuckets: [
              { _id: 'low', count: 20 },
              { _id: 'medium', count: 40 },
              { _id: 'high', count: 20 },
            ],
          },
        ])
      );

      const result = await backend.aggregate('analytics', 'products', [
        {
          $facet: {
            categorySummary: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
            priceBuckets: [
              {
                $bucket: {
                  groupBy: '$price',
                  boundaries: [0, 50, 200, 1000],
                  default: 'expensive',
                },
              },
            ],
          },
        },
      ]);

      expect(result.documents[0]).toHaveProperty('categorySummary');
      expect(result.documents[0]).toHaveProperty('priceBuckets');
    });

    it('should execute $unwind stage', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { _id: '1', tag: 'javascript' },
          { _id: '1', tag: 'typescript' },
        ])
      );

      await backend.aggregate('analytics', 'posts', [{ $unwind: '$tags' }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/ARRAY\s*JOIN|arrayJoin/i),
        })
      );
    });

    it('should execute $lookup stage (LEFT JOIN)', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { _id: '1', name: 'Alice', orders: [{ orderId: 'o1', amount: 100 }] },
        ])
      );

      await backend.aggregate('analytics', 'users', [
        {
          $lookup: {
            from: 'orders',
            localField: '_id',
            foreignField: 'userId',
            as: 'orders',
          },
        },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/LEFT\s+JOIN|JOIN/i),
        })
      );
    });

    it('should execute $count stage', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ totalCount: 1500 }]));

      const result = await backend.aggregate('analytics', 'users', [
        { $match: { status: 'active' } },
        { $count: 'totalCount' },
      ]);

      expect(result.documents[0].totalCount).toBe(1500);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/COUNT\s*\(\s*\*\s*\)/i),
        })
      );
    });

    it('should execute $addFields stage', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ _id: '1', name: 'Alice', fullName: 'Alice Smith' }])
      );

      await backend.aggregate('analytics', 'users', [
        {
          $addFields: {
            fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          },
        },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/CONCAT|concat/i),
        })
      );
    });

    it('should handle allowDiskUse option', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.aggregate(
        'analytics',
        'large_collection',
        [{ $group: { _id: '$field', count: { $sum: 1 } } }],
        { allowDiskUse: true }
      );

      // ClickHouse should set max_bytes_before_external_group_by setting
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/max_bytes_before_external_group_by/i),
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // List Operations Tests
  // ==========================================================================

  describe('list operations', () => {
    it('should list databases from ClickHouse', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { name: 'analytics', engine: 'Atomic' },
          { name: 'logs', engine: 'Atomic' },
          { name: 'system', engine: 'Atomic' },
        ])
      );

      const databases = await backend.listDatabases();

      expect(databases).toHaveLength(3);
      expect(databases[0].name).toBe('analytics');
      expect(databases[0]).toHaveProperty('sizeOnDisk');
      expect(databases[0]).toHaveProperty('empty');
    });

    it('should execute SHOW DATABASES query', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.listDatabases();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/SHOW\s+DATABASES|SELECT.*system\.databases/i),
        })
      );
    });

    it('should list collections for a database', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { name: 'users', engine: 'MergeTree', total_rows: 1000 },
          { name: 'orders', engine: 'MergeTree', total_rows: 5000 },
          { name: 'products', engine: 'ReplacingMergeTree', total_rows: 500 },
        ])
      );

      const collections = await backend.listCollections('analytics');

      expect(collections).toHaveLength(3);
      expect(collections[0].name).toBe('users');
      expect(collections[0].type).toBe('collection');
      expect(collections[0].info?.readOnly).toBe(true); // OLAP is read-only
    });

    it('should filter collections by name pattern', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([{ name: 'users', engine: 'MergeTree' }])
      );

      await backend.listCollections('analytics', { name: 'users' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/name\s*=\s*'users'|WHERE.*users/i),
        })
      );
    });

    it('should return collection stats', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          {
            rows: 10000,
            bytes_on_disk: 1048576,
            data_compressed_bytes: 524288,
            data_uncompressed_bytes: 2097152,
            primary_key_bytes_in_memory: 4096,
          },
        ])
      );

      const stats = await backend.collStats('analytics', 'users');

      expect(stats.ns).toBe('analytics.users');
      expect(stats.count).toBe(10000);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.storageSize).toBeGreaterThan(0);
    });

    it('should return db stats', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          {
            tables: 5,
            total_rows: 50000,
            total_bytes: 10485760,
          },
        ])
      );

      const stats = await backend.dbStats('analytics');

      expect(stats.db).toBe('analytics');
      expect(stats.collections).toBe(5);
      expect(stats.objects).toBe(50000);
      expect(stats.dataSize).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Read-Only Enforcement Tests
  // ==========================================================================

  describe('read-only enforcement', () => {
    it('should throw error on insertOne()', async () => {
      await expect(
        backend.insertOne('analytics', 'users', { name: 'Alice' })
      ).rejects.toThrow(ReadOnlyOperationError);
    });

    it('should throw error on insertMany()', async () => {
      await expect(
        backend.insertMany('analytics', 'users', [{ name: 'Alice' }, { name: 'Bob' }])
      ).rejects.toThrow(ReadOnlyOperationError);
    });

    it('should throw error on updateOne()', async () => {
      await expect(
        backend.updateOne('analytics', 'users', { _id: '1' }, { $set: { name: 'Updated' } })
      ).rejects.toThrow(ReadOnlyOperationError);
    });

    it('should throw error on updateMany()', async () => {
      await expect(
        backend.updateMany('analytics', 'users', {}, { $set: { status: 'archived' } })
      ).rejects.toThrow(ReadOnlyOperationError);
    });

    it('should throw error on deleteOne()', async () => {
      await expect(backend.deleteOne('analytics', 'users', { _id: '1' })).rejects.toThrow(
        ReadOnlyOperationError
      );
    });

    it('should throw error on deleteMany()', async () => {
      await expect(backend.deleteMany('analytics', 'users', {})).rejects.toThrow(
        ReadOnlyOperationError
      );
    });

    it('should throw error on createIndexes()', async () => {
      await expect(
        backend.createIndexes('analytics', 'users', [{ key: { name: 1 } }])
      ).rejects.toThrow(ReadOnlyOperationError);
    });

    it('should throw error on dropIndex()', async () => {
      await expect(backend.dropIndex('analytics', 'users', 'name_1')).rejects.toThrow(
        ReadOnlyOperationError
      );
    });

    it('should throw error on dropIndexes()', async () => {
      await expect(backend.dropIndexes('analytics', 'users')).rejects.toThrow(
        ReadOnlyOperationError
      );
    });

    it('should throw error on createDatabase()', async () => {
      await expect(backend.createDatabase('new_db')).rejects.toThrow(ReadOnlyOperationError);
    });

    it('should throw error on dropDatabase()', async () => {
      await expect(backend.dropDatabase('analytics')).rejects.toThrow(ReadOnlyOperationError);
    });

    it('should throw error on createCollection()', async () => {
      await expect(backend.createCollection('analytics', 'new_collection')).rejects.toThrow(
        ReadOnlyOperationError
      );
    });

    it('should throw error on dropCollection()', async () => {
      await expect(backend.dropCollection('analytics', 'users')).rejects.toThrow(
        ReadOnlyOperationError
      );
    });

    it('should include helpful error message for write attempts', async () => {
      try {
        await backend.insertOne('analytics', 'users', { name: 'Alice' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ReadOnlyOperationError);
        expect((error as ReadOnlyOperationError).message).toMatch(/read-only|OLAP/i);
        expect((error as ReadOnlyOperationError).message).toMatch(
          /write|insert|update|delete/i
        );
      }
    });

    it('should allow read operations after write rejection', async () => {
      // First try a write (should fail)
      await expect(backend.insertOne('analytics', 'users', {})).rejects.toThrow();

      // Then try a read (should succeed)
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ _id: '1', name: 'Alice' }]));

      const result = await backend.find('analytics', 'users', {});
      expect(result.documents).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Cursor Management Tests
  // ==========================================================================

  describe('cursor management', () => {
    it('should handle large result sets with streaming', async () => {
      // First batch
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          Array.from({ length: 1000 }, (_, i) => ({ _id: String(i), value: i })),
          [],
          { elapsed: 0.5, rows_read: 10000, bytes_read: 1000000 }
        )
      );

      const result = await backend.find('analytics', 'large_collection', {
        batchSize: 100,
      });

      expect(result.cursorId).not.toBe(0n);
      expect(result.hasMore).toBe(true);
      expect(result.documents.length).toBe(100);
    });

    it('should support toArray() on results', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { _id: '1', name: 'Alice' },
          { _id: '2', name: 'Bob' },
          { _id: '3', name: 'Charlie' },
        ])
      );

      const result = await backend.find('analytics', 'users', {});
      const cursor = backend.getCursor(result.cursorId);

      if (cursor) {
        const allDocs = cursor.documents;
        expect(Array.isArray(allDocs)).toBe(true);
        expect(allDocs.length).toBe(3);
      }
    });

    it('should support forEach iteration', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { _id: '1', value: 10 },
          { _id: '2', value: 20 },
          { _id: '3', value: 30 },
        ])
      );

      const result = await backend.find('analytics', 'numbers', {});
      const processedValues: number[] = [];

      for (const doc of result.documents) {
        processedValues.push(doc.value as number);
      }

      expect(processedValues).toEqual([10, 20, 30]);
    });

    it('should properly close cursors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          Array.from({ length: 200 }, (_, i) => ({ _id: String(i) }))
        )
      );

      const result = await backend.find('analytics', 'collection', { batchSize: 50 });
      const cursorId = result.cursorId;

      expect(backend.getCursor(cursorId)).toBeDefined();

      const closed = backend.closeCursor(cursorId);
      expect(closed).toBe(true);

      expect(backend.getCursor(cursorId)).toBeUndefined();
    });

    it('should return false when closing non-existent cursor', () => {
      const closed = backend.closeCursor(999999n);
      expect(closed).toBe(false);
    });

    it('should advance cursor and return next batch', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          Array.from({ length: 150 }, (_, i) => ({ _id: String(i), value: i }))
        )
      );

      const result = await backend.find('analytics', 'collection', { batchSize: 50 });
      const cursorId = result.cursorId;

      // Get next batch
      const nextBatch = backend.advanceCursor(cursorId, 50);
      expect(nextBatch.length).toBe(50);
      expect(nextBatch[0]._id).toBe('50');
    });

    it('should cleanup expired cursors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse(
          Array.from({ length: 200 }, (_, i) => ({ _id: String(i) }))
        )
      );

      const result = await backend.find('analytics', 'collection', { batchSize: 50 });
      const cursorId = result.cursorId;

      expect(backend.getCursor(cursorId)).toBeDefined();

      // Simulate time passing and cleanup
      backend.cleanupExpiredCursors();

      // Cursor should still exist if not expired
      // (actual expiration would require mocking time)
    });

    it('should handle cursor not found error on getMore', async () => {
      const docs = backend.advanceCursor(12345n, 100);
      expect(docs).toEqual([]);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('should handle ClickHouse connection errors', async () => {
      mockFetch.mockReset();
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(createClickHouseOLAPBackend(config)).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle query execution errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse('Code: 62. Syntax error: unexpected token', 400)
      );

      await expect(backend.find('analytics', 'users', {})).rejects.toThrow('Syntax error');
    });

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse('Authentication failed: wrong password', 401)
      );

      await expect(backend.find('analytics', 'users', {})).rejects.toThrow(
        'Authentication failed'
      );
    });

    it('should handle table not found errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse("Code: 60. Table analytics.nonexistent doesn't exist", 404)
      );

      await expect(backend.find('analytics', 'nonexistent', {})).rejects.toThrow(
        /doesn't exist|not found/i
      );
    });

    it('should handle database not found errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse("Code: 81. Database unknown_db doesn't exist", 404)
      );

      await expect(backend.find('unknown_db', 'users', {})).rejects.toThrow(
        /doesn't exist|not found/i
      );
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout exceeded')), 100)
          )
      );

      await expect(backend.find('analytics', 'large_table', {})).rejects.toThrow(
        /timeout/i
      );
    });

    it('should handle memory limit errors', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse('Code: 241. Memory limit exceeded', 500)
      );

      await expect(
        backend.aggregate('analytics', 'huge_table', [
          { $group: { _id: '$field', count: { $sum: 1 } } },
        ])
      ).rejects.toThrow(/memory limit/i);
    });

    it('should provide meaningful error messages', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockErrorResponse(
          'Code: 47. Unknown identifier: nonexistent_field in table users',
          400
        )
      );

      try {
        await backend.find('analytics', 'users', { filter: { nonexistent_field: 'value' } });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toMatch(/unknown|identifier|field/i);
      }
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(backend.find('analytics', 'users', {})).rejects.toThrow('Failed to fetch');
    });

    it('should handle invalid JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
        text: () => Promise.resolve('not valid json'),
      });

      await expect(backend.find('analytics', 'users', {})).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Additional Operations Tests
  // ==========================================================================

  describe('additional operations', () => {
    it('should support count() operation', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ count: 1500 }]));

      const count = await backend.count('analytics', 'users', { status: 'active' });

      expect(count).toBe(1500);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/COUNT\s*\(\s*\*\s*\)/i),
        })
      );
    });

    it('should support distinct() operation', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { status: 'active' },
          { status: 'pending' },
          { status: 'completed' },
        ])
      );

      const values = await backend.distinct('analytics', 'orders', 'status');

      expect(values).toContain('active');
      expect(values).toContain('pending');
      expect(values).toContain('completed');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/DISTINCT\s+status/i),
        })
      );
    });

    it('should support listIndexes() - returns ClickHouse indices', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockQueryResponse([
          { name: 'idx_status', type: 'minmax', expr: 'status' },
          { name: 'idx_created', type: 'set', expr: 'created_at' },
        ])
      );

      const indexes = await backend.listIndexes('analytics', 'users');

      expect(indexes.length).toBeGreaterThanOrEqual(1);
      // ClickHouse indices are different from MongoDB indexes
      expect(indexes[0]).toHaveProperty('name');
    });

    it('should check database exists', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ name: 'analytics' }]));

      const exists = await backend.databaseExists('analytics');
      expect(exists).toBe(true);
    });

    it('should check collection exists', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([{ name: 'users' }]));

      const exists = await backend.collectionExists('analytics', 'users');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent database', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      const exists = await backend.databaseExists('nonexistent');
      expect(exists).toBe(false);
    });

    it('should return false for non-existent collection', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      const exists = await backend.collectionExists('analytics', 'nonexistent');
      expect(exists).toBe(false);
    });
  });

  // ==========================================================================
  // SQL Dialect Tests
  // ==========================================================================

  describe('ClickHouse SQL dialect', () => {
    it('should use ClickHouse-specific date functions', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.aggregate('analytics', 'events', [
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 },
          },
        },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/formatDateTime|toDate|toString/i),
        })
      );
    });

    it('should use ClickHouse array functions', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        filter: { tags: { $elemMatch: { $eq: 'premium' } } },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/has\s*\(|arrayExists|indexOf/i),
        })
      );
    });

    it('should use ClickHouse JSON functions for nested queries', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'events', {
        filter: { 'metadata.source': 'api' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/JSONExtract|simpleJSONExtract|metadata\.source/i),
        })
      );
    });

    it('should properly escape string literals', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        filter: { name: "O'Brien" },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/O''Brien|O\\'Brien/), // Escaped single quote
        })
      );
    });

    it('should handle NULL comparisons correctly', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {
        filter: { email: null },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/email\s+IS\s+NULL/i),
        })
      );
    });

    it('should use FINAL modifier when appropriate', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      // Create backend with FINAL modifier enabled
      mockFetch.mockResolvedValueOnce(createMockConnectionResponse());
      const finalBackend = await createClickHouseOLAPBackend({
        ...config,
        useFinal: true,
      });

      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));
      await finalBackend.find('analytics', 'users', {});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/FROM\s+\S+\s+FINAL/i),
        })
      );
    });
  });

  // ==========================================================================
  // Performance and Optimization Tests
  // ==========================================================================

  describe('performance and optimization', () => {
    it('should include SETTINGS for query optimization', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.aggregate(
        'analytics',
        'large_table',
        [{ $group: { _id: '$category', count: { $sum: 1 } } }],
        { allowDiskUse: true }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/SETTINGS/i),
        expect.any(Object)
      );
    });

    it('should set appropriate timeout for long queries', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      // Create backend with custom timeout
      mockFetch.mockResolvedValueOnce(createMockConnectionResponse());
      const timeoutBackend = await createClickHouseOLAPBackend({
        ...config,
        queryTimeout: 60000,
      });

      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));
      await timeoutBackend.find('analytics', 'users', {});

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/max_execution_time=60/i),
        expect.any(Object)
      );
    });

    it('should limit result set size by default', async () => {
      mockFetch.mockResolvedValueOnce(createMockQueryResponse([]));

      await backend.find('analytics', 'users', {});

      // Should have a reasonable default limit
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/LIMIT/i),
        })
      );
    });
  });
});
