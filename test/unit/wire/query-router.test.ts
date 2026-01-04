/**
 * QueryRouter Tests
 *
 * Comprehensive tests for QueryRouter that routes queries to OLTP/OLAP backends.
 * Tests verify routing logic for various query patterns.
 *
 * Issue: mondodb-aioe
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  QueryRouter,
  createQueryRouter,
  analyzeQuery,
  analyzeFindQuery,
  type QueryRouterConfig,
  type QueryCharacteristics,
  type RoutingDecision,
  type BackendMode,
} from '../../../src/wire/backend/query-router.js';
import type {
  MondoBackend,
  FindOptions,
  FindResult,
  AggregateResult,
  InsertResult,
  UpdateResult,
  DeleteResult,
  DatabaseInfo,
  CollectionInfo,
  CollStats,
  DbStats,
  IndexInfo,
  CursorState,
} from '../../../src/wire/backend/interface.js';
import type { Document } from 'bson';

// ============================================================================
// Mock Backend Factory
// ============================================================================

function createMockBackend(name: string): MondoBackend {
  return {
    // Database operations
    listDatabases: vi.fn().mockResolvedValue([{ name: 'test', sizeOnDisk: 0, empty: false }]),
    createDatabase: vi.fn().mockResolvedValue(undefined),
    dropDatabase: vi.fn().mockResolvedValue(undefined),
    databaseExists: vi.fn().mockResolvedValue(true),

    // Collection operations
    listCollections: vi.fn().mockResolvedValue([]),
    createCollection: vi.fn().mockResolvedValue(undefined),
    dropCollection: vi.fn().mockResolvedValue(undefined),
    collectionExists: vi.fn().mockResolvedValue(true),
    collStats: vi.fn().mockResolvedValue({
      ns: 'test.coll',
      count: 0,
      size: 0,
      avgObjSize: 0,
      storageSize: 0,
      totalIndexSize: 0,
      nindexes: 1,
      indexSizes: {},
    }),
    dbStats: vi.fn().mockResolvedValue({
      db: 'test',
      collections: 0,
      views: 0,
      objects: 0,
      avgObjSize: 0,
      dataSize: 0,
      storageSize: 0,
      indexes: 0,
      indexSize: 0,
    }),

    // CRUD operations
    find: vi.fn().mockResolvedValue({ documents: [], cursorId: 0n, hasMore: false }),
    insertOne: vi.fn().mockResolvedValue({
      acknowledged: true,
      insertedIds: new Map([[0, 'id1']]),
      insertedCount: 1,
    }),
    insertMany: vi.fn().mockResolvedValue({
      acknowledged: true,
      insertedIds: new Map(),
      insertedCount: 0,
    }),
    updateOne: vi.fn().mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
    }),
    updateMany: vi.fn().mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
    }),
    deleteOne: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 }),

    // Count and distinct
    count: vi.fn().mockResolvedValue(0),
    distinct: vi.fn().mockResolvedValue([]),

    // Aggregation
    aggregate: vi.fn().mockResolvedValue({ documents: [], cursorId: 0n, hasMore: false }),

    // Index operations
    listIndexes: vi.fn().mockResolvedValue([{ v: 2, key: { _id: 1 }, name: '_id_' }]),
    createIndexes: vi.fn().mockResolvedValue([]),
    dropIndex: vi.fn().mockResolvedValue(undefined),
    dropIndexes: vi.fn().mockResolvedValue(undefined),

    // Cursor operations
    createCursor: vi.fn(),
    getCursor: vi.fn().mockReturnValue(undefined),
    advanceCursor: vi.fn().mockReturnValue([]),
    closeCursor: vi.fn().mockReturnValue(false),
    cleanupExpiredCursors: vi.fn(),
  };
}

// ============================================================================
// Query Analysis Tests
// ============================================================================

describe('Query Analysis', () => {
  describe('analyzeQuery', () => {
    it('should detect heavy aggregation stages', () => {
      const pipeline = [
        { $match: { status: 'active' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ];

      const result = analyzeQuery(pipeline);

      expect(result.hasHeavyAggregation).toBe(true);
      expect(result.olapStages).toContain('$group');
    });

    it('should detect $bucket as heavy aggregation', () => {
      const pipeline = [
        {
          $bucket: {
            groupBy: '$price',
            boundaries: [0, 100, 500, 1000],
            output: { count: { $sum: 1 } },
          },
        },
      ];

      const result = analyzeQuery(pipeline);

      expect(result.hasHeavyAggregation).toBe(true);
      expect(result.olapStages).toContain('$bucket');
    });

    it('should detect $facet as heavy aggregation', () => {
      const pipeline = [
        {
          $facet: {
            byCategory: [{ $group: { _id: '$category' } }],
            byStatus: [{ $group: { _id: '$status' } }],
          },
        },
      ];

      const result = analyzeQuery(pipeline);

      expect(result.hasHeavyAggregation).toBe(true);
      expect(result.olapStages).toContain('$facet');
    });

    it('should detect _id lookup in $match', () => {
      const pipeline = [{ $match: { _id: 'user123' } }, { $limit: 1 }];

      const result = analyzeQuery(pipeline);

      expect(result.hasIdLookup).toBe(true);
      expect(result.estimatedRows).toBe(1);
    });

    it('should detect _id lookup with $eq operator', () => {
      const pipeline = [{ $match: { _id: { $eq: 'user123' } } }];

      const result = analyzeQuery(pipeline);

      expect(result.hasIdLookup).toBe(true);
    });

    it('should detect _id lookup with $in small array', () => {
      const pipeline = [{ $match: { _id: { $in: ['id1', 'id2', 'id3'] } } }];

      const result = analyzeQuery(pipeline);

      expect(result.hasIdLookup).toBe(true);
    });

    it('should not consider large $in as ID lookup', () => {
      const ids = Array.from({ length: 150 }, (_, i) => `id${i}`);
      const pipeline = [{ $match: { _id: { $in: ids } } }];

      const result = analyzeQuery(pipeline);

      expect(result.hasIdLookup).toBe(false);
    });

    it('should detect time-range queries', () => {
      const pipeline = [
        {
          $match: {
            created_at: { $gte: '2024-01-01', $lt: '2024-02-01' },
          },
        },
      ];

      const result = analyzeQuery(pipeline);

      expect(result.isTimeRangeQuery).toBe(true);
    });

    it('should detect time-range queries on _cdc_timestamp', () => {
      const pipeline = [
        {
          $match: {
            _cdc_timestamp: { $gt: 1704067200 },
          },
        },
      ];

      const result = analyzeQuery(pipeline);

      expect(result.isTimeRangeQuery).toBe(true);
    });

    it('should estimate rows based on $limit', () => {
      const pipeline = [{ $match: { status: 'active' } }, { $limit: 50 }];

      const result = analyzeQuery(pipeline);

      expect(result.estimatedRows).toBe(50);
    });

    it('should estimate high row count without limit or match', () => {
      const pipeline = [{ $project: { name: 1 } }];

      const result = analyzeQuery(pipeline);

      expect(result.estimatedRows).toBeGreaterThan(10000);
    });

    it('should recognize lightweight stages only', () => {
      const pipeline = [
        { $match: { active: true } },
        { $project: { name: 1 } },
        { $sort: { name: 1 } },
        { $limit: 10 },
      ];

      const result = analyzeQuery(pipeline);

      expect(result.hasHeavyAggregation).toBe(false);
      expect(result.olapStages).toHaveLength(0);
    });

    it('should detect $lookup as OLAP stage', () => {
      const pipeline = [
        {
          $lookup: {
            from: 'orders',
            localField: 'userId',
            foreignField: 'customerId',
            as: 'orders',
          },
        },
      ];

      const result = analyzeQuery(pipeline);

      expect(result.olapStages).toContain('$lookup');
    });

    it('should detect $sample with large size as OLAP', () => {
      const pipeline = [{ $sample: { size: 5000 } }];

      const result = analyzeQuery(pipeline);

      expect(result.olapStages).toContain('$sample');
    });
  });

  describe('analyzeFindQuery', () => {
    it('should detect _id lookup', () => {
      const options: FindOptions = {
        filter: { _id: 'user123' },
      };

      const result = analyzeFindQuery(options);

      expect(result.hasIdLookup).toBe(true);
      expect(result.estimatedRows).toBe(1);
    });

    it('should estimate rows from limit', () => {
      const options: FindOptions = {
        filter: { status: 'active' },
        limit: 25,
      };

      const result = analyzeFindQuery(options);

      expect(result.estimatedRows).toBe(25);
    });

    it('should detect time-range filter', () => {
      const options: FindOptions = {
        filter: {
          updated_at: { $gte: new Date('2024-01-01') },
        },
      };

      const result = analyzeFindQuery(options);

      expect(result.isTimeRangeQuery).toBe(true);
    });

    it('should estimate high rows for full scan', () => {
      const options: FindOptions = {};

      const result = analyzeFindQuery(options);

      expect(result.estimatedRows).toBeGreaterThan(10000);
    });

    it('should not have heavy aggregation for find', () => {
      const options: FindOptions = {
        filter: { status: 'active' },
      };

      const result = analyzeFindQuery(options);

      expect(result.hasHeavyAggregation).toBe(false);
      expect(result.olapStages).toHaveLength(0);
    });
  });
});

// ============================================================================
// QueryRouter Constructor Tests
// ============================================================================

describe('QueryRouter', () => {
  let oltpBackend: MondoBackend;
  let olapBackend: MondoBackend;

  beforeEach(() => {
    oltpBackend = createMockBackend('oltp');
    olapBackend = createMockBackend('olap');
  });

  describe('constructor', () => {
    it('should create router with OLTP backend only', () => {
      const router = new QueryRouter({ oltp: oltpBackend });

      expect(router.hasOlapBackend()).toBe(false);
    });

    it('should create router with both backends', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      expect(router.hasOlapBackend()).toBe(true);
    });

    it('should use default routing config', () => {
      const router = new QueryRouter({ oltp: oltpBackend });

      const config = router.getConfig();

      expect(config.rowThreshold).toBe(10000);
      expect(config.autoRouting).toBe(true);
    });

    it('should allow custom routing config', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        routing: {
          rowThreshold: 5000,
          preferOlapForAggregations: true,
        },
      });

      const config = router.getConfig();

      expect(config.rowThreshold).toBe(5000);
      expect(config.preferOlapForAggregations).toBe(true);
    });
  });

  // ==========================================================================
  // Routing Logic Tests
  // ==========================================================================

  describe('routeFind', () => {
    it('should route to OLTP when no OLAP available', () => {
      const router = new QueryRouter({ oltp: oltpBackend });

      const decision = router.routeFind({ filter: {} });

      expect(decision.backend).toBe('oltp');
      expect(decision.reason).toContain('OLAP backend not available');
    });

    it('should route to explicit backend when specified', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeFind({ backend: 'clickhouse' });

      expect(decision.backend).toBe('olap');
      expect(decision.reason).toContain('Explicit backend selection');
    });

    it('should route to OLTP for _id lookup', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeFind({ filter: { _id: 'user123' } });

      expect(decision.backend).toBe('oltp');
      expect(decision.reason).toContain('_id lookup');
    });

    it('should route to OLAP for time-range queries', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeFind({
        filter: { created_at: { $gte: '2024-01-01' } },
      });

      expect(decision.backend).toBe('olap');
      expect(decision.reason).toContain('Time-range query');
    });

    it('should route to OLAP for large estimated result sets', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
        routing: { rowThreshold: 1000 },
      });

      // No limit, no filter = full scan
      const decision = router.routeFind({});

      expect(decision.backend).toBe('olap');
      expect(decision.reason).toContain('Estimated rows');
    });

    it('should route to OLTP for small queries', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeFind({
        filter: { status: 'active' },
        limit: 10,
      });

      expect(decision.backend).toBe('oltp');
      expect(decision.reason).toContain('Small query');
    });

    it('should respect auto-routing disabled', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
        routing: { autoRouting: false },
      });

      const decision = router.routeFind({});

      expect(decision.backend).toBe('oltp');
      expect(decision.reason).toContain('Auto-routing disabled');
    });

    it('should fallback to OLTP when explicit clickhouse but no OLAP', () => {
      const router = new QueryRouter({ oltp: oltpBackend });

      const decision = router.routeFind({ backend: 'clickhouse' });

      expect(decision.backend).toBe('oltp');
    });
  });

  describe('routeAggregate', () => {
    it('should route to OLTP when no OLAP available', () => {
      const router = new QueryRouter({ oltp: oltpBackend });

      const decision = router.routeAggregate([{ $group: { _id: null } }]);

      expect(decision.backend).toBe('oltp');
    });

    it('should route to explicit backend when specified', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeAggregate([], { backend: 'sqlite' });

      expect(decision.backend).toBe('oltp');
      expect(decision.reason).toContain('Explicit backend selection');
    });

    it('should route to OLAP for $group stage', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeAggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ]);

      expect(decision.backend).toBe('olap');
      expect(decision.reason).toContain('Heavy aggregation');
      expect(decision.characteristics.olapStages).toContain('$group');
    });

    it('should route to OLAP for $bucket stage', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeAggregate([
        { $bucket: { groupBy: '$price', boundaries: [0, 100, 500] } },
      ]);

      expect(decision.backend).toBe('olap');
      expect(decision.characteristics.olapStages).toContain('$bucket');
    });

    it('should route to OLAP for $facet stage', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeAggregate([
        { $facet: { a: [], b: [] } },
      ]);

      expect(decision.backend).toBe('olap');
      expect(decision.characteristics.olapStages).toContain('$facet');
    });

    it('should route to OLTP for simple _id match', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeAggregate([
        { $match: { _id: 'user123' } },
        { $project: { name: 1, email: 1 } },
      ]);

      expect(decision.backend).toBe('oltp');
      expect(decision.reason).toContain('_id lookup');
    });

    it('should route to OLAP for time-range aggregation', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeAggregate([
        { $match: { timestamp: { $gte: 1704067200, $lt: 1704153600 } } },
        { $project: { event: 1, data: 1 } },
      ]);

      expect(decision.backend).toBe('olap');
      expect(decision.reason).toContain('Time-range query');
    });

    it('should route to OLTP for simple aggregation with limit', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const decision = router.routeAggregate([
        { $match: { status: 'active' } },
        { $sort: { name: 1 } },
        { $limit: 10 },
      ]);

      expect(decision.backend).toBe('oltp');
      expect(decision.reason).toContain('Simple aggregation');
    });

    it('should route to OLAP when preferOlapForAggregations is true', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
        routing: { preferOlapForAggregations: true },
      });

      const decision = router.routeAggregate([
        { $lookup: { from: 'orders', localField: 'userId', foreignField: 'customerId', as: 'orders' } },
        { $limit: 10 },
      ]);

      expect(decision.backend).toBe('olap');
      expect(decision.reason).toContain('Preferring OLAP');
    });
  });

  // ==========================================================================
  // Find Operation Tests
  // ==========================================================================

  describe('find', () => {
    it('should route to correct backend and execute', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.find('db', 'users', { filter: { _id: 'user123' } });

      expect(oltpBackend.find).toHaveBeenCalledWith('db', 'users', { filter: { _id: 'user123' } });
      expect(olapBackend.find).not.toHaveBeenCalled();
    });

    it('should route to OLAP for large queries', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
        routing: { rowThreshold: 100 },
      });

      // No limit = full scan = OLAP
      await router.find('db', 'events', {});

      expect(olapBackend.find).toHaveBeenCalled();
      expect(oltpBackend.find).not.toHaveBeenCalled();
    });

    it('should route to explicit backend', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.find('db', 'users', { backend: 'clickhouse' });

      expect(olapBackend.find).toHaveBeenCalled();
      expect(oltpBackend.find).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Aggregate Operation Tests
  // ==========================================================================

  describe('aggregate', () => {
    it('should route to OLAP for heavy aggregation', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const pipeline = [{ $group: { _id: '$category', count: { $sum: 1 } } }];

      await router.aggregate('db', 'products', pipeline);

      expect(olapBackend.aggregate).toHaveBeenCalledWith('db', 'products', pipeline, undefined);
      expect(oltpBackend.aggregate).not.toHaveBeenCalled();
    });

    it('should route to OLTP for simple aggregation', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const pipeline = [
        { $match: { _id: 'doc123' } },
        { $project: { name: 1 } },
      ];

      await router.aggregate('db', 'docs', pipeline);

      expect(oltpBackend.aggregate).toHaveBeenCalled();
      expect(olapBackend.aggregate).not.toHaveBeenCalled();
    });

    it('should pass options to backend', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const pipeline = [{ $group: { _id: null } }];
      const options = { batchSize: 1000, allowDiskUse: true };

      await router.aggregate('db', 'coll', pipeline, options);

      expect(olapBackend.aggregate).toHaveBeenCalledWith('db', 'coll', pipeline, options);
    });
  });

  // ==========================================================================
  // Write Operations Tests (Always OLTP)
  // ==========================================================================

  describe('write operations', () => {
    it('should always route insertOne to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.insertOne('db', 'users', { name: 'Test' });

      expect(oltpBackend.insertOne).toHaveBeenCalled();
      expect(olapBackend.insertOne).not.toHaveBeenCalled();
    });

    it('should always route insertMany to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.insertMany('db', 'users', [{ name: 'A' }, { name: 'B' }]);

      expect(oltpBackend.insertMany).toHaveBeenCalled();
      expect(olapBackend.insertMany).not.toHaveBeenCalled();
    });

    it('should always route updateOne to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.updateOne('db', 'users', { _id: '1' }, { $set: { name: 'New' } });

      expect(oltpBackend.updateOne).toHaveBeenCalled();
      expect(olapBackend.updateOne).not.toHaveBeenCalled();
    });

    it('should always route updateMany to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.updateMany('db', 'users', { status: 'old' }, { $set: { archived: true } });

      expect(oltpBackend.updateMany).toHaveBeenCalled();
      expect(olapBackend.updateMany).not.toHaveBeenCalled();
    });

    it('should always route deleteOne to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.deleteOne('db', 'users', { _id: '1' });

      expect(oltpBackend.deleteOne).toHaveBeenCalled();
      expect(olapBackend.deleteOne).not.toHaveBeenCalled();
    });

    it('should always route deleteMany to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.deleteMany('db', 'logs', { expired: true });

      expect(oltpBackend.deleteMany).toHaveBeenCalled();
      expect(olapBackend.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Database/Collection Operations Tests
  // ==========================================================================

  describe('database operations', () => {
    it('should route listDatabases to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.listDatabases();

      expect(oltpBackend.listDatabases).toHaveBeenCalled();
      expect(olapBackend.listDatabases).not.toHaveBeenCalled();
    });

    it('should route createDatabase to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.createDatabase('newdb');

      expect(oltpBackend.createDatabase).toHaveBeenCalledWith('newdb');
    });

    it('should route dropDatabase to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.dropDatabase('olddb');

      expect(oltpBackend.dropDatabase).toHaveBeenCalledWith('olddb');
    });
  });

  describe('collection operations', () => {
    it('should route listCollections to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.listCollections('db');

      expect(oltpBackend.listCollections).toHaveBeenCalled();
    });

    it('should route createCollection to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.createCollection('db', 'newcoll');

      expect(oltpBackend.createCollection).toHaveBeenCalledWith('db', 'newcoll', undefined);
    });

    it('should route dropCollection to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.dropCollection('db', 'oldcoll');

      expect(oltpBackend.dropCollection).toHaveBeenCalledWith('db', 'oldcoll');
    });
  });

  // ==========================================================================
  // Count and Distinct Tests
  // ==========================================================================

  describe('count and distinct', () => {
    it('should route count to OLAP for large estimated sets', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
        routing: { rowThreshold: 100 },
      });

      // No query = full count = likely large
      await router.count('db', 'bigcoll');

      expect(olapBackend.count).toHaveBeenCalled();
    });

    it('should route count to OLTP for small estimated sets', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.count('db', 'users', { _id: 'user123' });

      expect(oltpBackend.count).toHaveBeenCalled();
    });

    it('should route distinct to OLAP for large collections', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
        routing: { rowThreshold: 100 },
      });

      await router.distinct('db', 'events', 'type');

      expect(olapBackend.distinct).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Index Operations Tests
  // ==========================================================================

  describe('index operations', () => {
    it('should route listIndexes to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.listIndexes('db', 'users');

      expect(oltpBackend.listIndexes).toHaveBeenCalled();
    });

    it('should route createIndexes to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.createIndexes('db', 'users', [{ key: { email: 1 } }]);

      expect(oltpBackend.createIndexes).toHaveBeenCalled();
    });

    it('should route dropIndex to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.dropIndex('db', 'users', 'email_1');

      expect(oltpBackend.dropIndex).toHaveBeenCalled();
    });

    it('should route dropIndexes to OLTP', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.dropIndexes('db', 'users');

      expect(oltpBackend.dropIndexes).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Cursor Operations Tests
  // ==========================================================================

  describe('cursor operations', () => {
    it('should delegate createCursor to OLTP', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const state: CursorState = {
        id: 1n,
        namespace: 'db.coll',
        documents: [],
        position: 0,
        batchSize: 100,
        createdAt: Date.now(),
      };

      router.createCursor(state);

      expect(oltpBackend.createCursor).toHaveBeenCalledWith(state);
    });

    it('should try OLTP first for getCursor', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const state: CursorState = {
        id: 1n,
        namespace: 'db.coll',
        documents: [],
        position: 0,
        batchSize: 100,
        createdAt: Date.now(),
      };

      (oltpBackend.getCursor as ReturnType<typeof vi.fn>).mockReturnValue(state);

      const result = router.getCursor(1n);

      expect(result).toBe(state);
      expect(oltpBackend.getCursor).toHaveBeenCalledWith(1n);
    });

    it('should try OLAP if OLTP returns undefined', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      const state: CursorState = {
        id: 1n,
        namespace: 'db.coll',
        documents: [],
        position: 0,
        batchSize: 100,
        createdAt: Date.now(),
      };

      (oltpBackend.getCursor as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      (olapBackend.getCursor as ReturnType<typeof vi.fn>).mockReturnValue(state);

      const result = router.getCursor(1n);

      expect(result).toBe(state);
      expect(olapBackend.getCursor).toHaveBeenCalledWith(1n);
    });

    it('should try both backends for closeCursor', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      (oltpBackend.closeCursor as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const result = router.closeCursor(1n);

      expect(result).toBe(true);
      expect(oltpBackend.closeCursor).toHaveBeenCalledWith(1n);
    });

    it('should cleanup cursors on both backends', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      router.cleanupExpiredCursors();

      expect(oltpBackend.cleanupExpiredCursors).toHaveBeenCalled();
      expect(olapBackend.cleanupExpiredCursors).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Utility Methods Tests
  // ==========================================================================

  describe('utility methods', () => {
    it('should return OLTP backend', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      expect(router.getOltpBackend()).toBe(oltpBackend);
    });

    it('should return OLAP backend', () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      expect(router.getOlapBackend()).toBe(olapBackend);
    });

    it('should return undefined for OLAP when not configured', () => {
      const router = new QueryRouter({ oltp: oltpBackend });

      expect(router.getOlapBackend()).toBeUndefined();
    });
  });

  // ==========================================================================
  // Factory Function Tests
  // ==========================================================================

  describe('createQueryRouter', () => {
    it('should create a QueryRouter instance', () => {
      const router = createQueryRouter({ oltp: oltpBackend });

      expect(router).toBeInstanceOf(QueryRouter);
    });

    it('should pass config to router', () => {
      const router = createQueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
        routing: { rowThreshold: 500 },
      });

      expect(router.getConfig().rowThreshold).toBe(500);
    });
  });

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle empty pipeline', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.aggregate('db', 'coll', []);

      // Empty pipeline with no limit = full scan = routes to OLAP
      expect(olapBackend.aggregate).toHaveBeenCalled();
    });

    it('should handle null filter', async () => {
      const router = new QueryRouter({
        oltp: oltpBackend,
        olap: olapBackend,
      });

      await router.find('db', 'coll', { filter: undefined });

      // No filter = full scan = routes to OLAP (exceeds threshold)
      expect(olapBackend.find).toHaveBeenCalled();
    });

    it('should handle complex nested $and/$or filters', () => {
      const pipeline = [
        {
          $match: {
            $and: [
              { status: 'active' },
              { $or: [{ _id: 'id1' }, { _id: 'id2' }] },
            ],
          },
        },
      ];

      const result = analyzeQuery(pipeline);

      // Complex filter but still has potential ID lookups
      expect(result.hasHeavyAggregation).toBe(false);
    });
  });
});
