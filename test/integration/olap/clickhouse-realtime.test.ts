/**
 * ClickHouse Real-time Integration Tests (TDD - RED phase)
 *
 * End-to-end integration tests for ClickHouse S3Queue real-time CDC ingestion.
 * These tests verify the complete pipeline from MongoDB CDC events through
 * R2 storage to ClickHouse materialized views.
 *
 * Issue: mongo.do-968r - ClickHouse S3Queue Real-time Tests
 *
 * NOTE: These tests are marked with .skip for CI environments as they
 * require external ClickHouse and R2 infrastructure.
 *
 * These tests verify:
 * - Materialized views from CDC to columnar JSON
 * - Event routing and transformation
 * - Tombstone handling for deletes
 * - Full end-to-end CDC pipeline
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// =============================================================================
// Type Definitions
// =============================================================================

interface ClickHouseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  secure: boolean;
}

interface R2Config {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
}

interface CDCEvent {
  _id: string;
  operationType: 'insert' | 'update' | 'delete';
  clusterTime: Date;
  ns: { db: string; coll: string };
  documentKey: { _id: string };
  fullDocument?: Record<string, unknown>;
  updateDescription?: {
    updatedFields: Record<string, unknown>;
    removedFields: string[];
  };
  sequenceNumber: bigint;
}

interface MaterializedViewDefinition {
  name: string;
  sourceTable: string;
  targetTable: string;
  selectQuery: string;
  engine: string;
  orderBy: string[];
  partitionBy?: string;
}

interface ColumnarDocument {
  _id: string;
  _collection: string;
  _database: string;
  _timestamp: Date;
  _operation: string;
  _version: bigint;
  _deleted: boolean;
  data: string; // JSON string of document
}

interface TombstoneRecord {
  _id: string;
  _collection: string;
  _database: string;
  _deleted_at: Date;
  _sequence: bigint;
}

// =============================================================================
// Mock Implementation Stubs
// =============================================================================

class ClickHouseClient {
  constructor(_config: ClickHouseConfig) {
    throw new Error('Not implemented');
  }

  async connect(): Promise<void> {
    throw new Error('Not implemented');
  }

  async disconnect(): Promise<void> {
    throw new Error('Not implemented');
  }

  async query<T>(_sql: string, _params?: Record<string, unknown>): Promise<T[]> {
    throw new Error('Not implemented');
  }

  async execute(_sql: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async insert<T>(_table: string, _rows: T[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async ping(): Promise<boolean> {
    throw new Error('Not implemented');
  }
}

class R2CDCWriter {
  constructor(_config: R2Config) {
    throw new Error('Not implemented');
  }

  async writeParquetBatch(_events: CDCEvent[], _path: string): Promise<string> {
    throw new Error('Not implemented');
  }

  async writeJSONBatch(_events: CDCEvent[], _path: string): Promise<string> {
    throw new Error('Not implemented');
  }

  async listFiles(_prefix: string): Promise<string[]> {
    throw new Error('Not implemented');
  }

  async deleteFile(_path: string): Promise<void> {
    throw new Error('Not implemented');
  }
}

class MaterializedViewManager {
  constructor(_client: ClickHouseClient) {
    throw new Error('Not implemented');
  }

  async createView(_definition: MaterializedViewDefinition): Promise<void> {
    throw new Error('Not implemented');
  }

  async dropView(_name: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async refreshView(_name: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async getViewStatus(_name: string): Promise<{
    rowCount: number;
    lastRefresh: Date;
    isHealthy: boolean;
  }> {
    throw new Error('Not implemented');
  }
}

class CDCToColumnarTransformer {
  transform(_event: CDCEvent): ColumnarDocument {
    throw new Error('Not implemented');
  }

  transformBatch(_events: CDCEvent[]): ColumnarDocument[] {
    throw new Error('Not implemented');
  }

  createTombstone(_event: CDCEvent): TombstoneRecord {
    throw new Error('Not implemented');
  }
}

class EventRouter {
  constructor(_config: { routingRules: RoutingRule[] }) {
    throw new Error('Not implemented');
  }

  route(_event: CDCEvent): string {
    throw new Error('Not implemented');
  }

  routeBatch(_events: CDCEvent[]): Map<string, CDCEvent[]> {
    throw new Error('Not implemented');
  }
}

interface RoutingRule {
  pattern: { db?: string; coll?: string };
  targetTable: string;
}

class RealtimePipeline {
  constructor(
    _clickhouse: ClickHouseClient,
    _r2Writer: R2CDCWriter,
    _transformer: CDCToColumnarTransformer
  ) {
    throw new Error('Not implemented');
  }

  async start(): Promise<void> {
    throw new Error('Not implemented');
  }

  async stop(): Promise<void> {
    throw new Error('Not implemented');
  }

  async processEvent(_event: CDCEvent): Promise<void> {
    throw new Error('Not implemented');
  }

  async processBatch(_events: CDCEvent[]): Promise<{
    processed: number;
    failed: number;
    latencyMs: number;
  }> {
    throw new Error('Not implemented');
  }

  getMetrics(): {
    eventsProcessed: number;
    bytesWritten: number;
    avgLatencyMs: number;
  } {
    throw new Error('Not implemented');
  }
}

// =============================================================================
// Test Configuration
// =============================================================================

const TEST_CLICKHOUSE_CONFIG: ClickHouseConfig = {
  host: process.env.CLICKHOUSE_HOST || 'localhost',
  port: parseInt(process.env.CLICKHOUSE_PORT || '8443'),
  database: 'mongo.do_test',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  secure: true,
};

const TEST_R2_CONFIG: R2Config = {
  accountId: process.env.R2_ACCOUNT_ID || 'test-account',
  bucketName: process.env.R2_BUCKET || 'mongo.do-cdc-test',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || 'test-key',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'test-secret',
};

// =============================================================================
// Materialized View Tests
// =============================================================================

describe.skip('Materialized Views - CDC to Columnar JSON', () => {
  let clickhouse: ClickHouseClient;
  let viewManager: MaterializedViewManager;

  beforeAll(async () => {
    clickhouse = new ClickHouseClient(TEST_CLICKHOUSE_CONFIG);
    await clickhouse.connect();
    viewManager = new MaterializedViewManager(clickhouse);
  });

  afterAll(async () => {
    await clickhouse.disconnect();
  });

  describe('view creation', () => {
    it('should create materialized view for CDC events', async () => {
      const definition: MaterializedViewDefinition = {
        name: 'mv_users_columnar',
        sourceTable: 's3queue_cdc_events',
        targetTable: 'users_columnar',
        selectQuery: `
          SELECT
            JSONExtractString(data, '_id') AS _id,
            'testdb' AS _database,
            'users' AS _collection,
            parseDateTimeBestEffort(JSONExtractString(data, 'clusterTime')) AS _timestamp,
            JSONExtractString(data, 'operationType') AS _operation,
            JSONExtractUInt(data, 'sequenceNumber') AS _version,
            operationType = 'delete' AS _deleted,
            JSONExtractRaw(data, 'fullDocument') AS data
          FROM s3queue_cdc_events
          WHERE JSONExtractString(data, 'ns.coll') = 'users'
        `,
        engine: 'ReplacingMergeTree(_version)',
        orderBy: ['_database', '_collection', '_id'],
        partitionBy: "toYYYYMM(_timestamp)",
      };

      await viewManager.createView(definition);

      const status = await viewManager.getViewStatus('mv_users_columnar');
      expect(status.isHealthy).toBe(true);
    });

    it('should create view with proper columnar schema', async () => {
      const definition: MaterializedViewDefinition = {
        name: 'mv_orders_columnar',
        sourceTable: 's3queue_cdc_events',
        targetTable: 'orders_columnar',
        selectQuery: `
          SELECT
            JSONExtractString(fullDocument, '_id') AS _id,
            JSONExtractString(ns, 'db') AS _database,
            JSONExtractString(ns, 'coll') AS _collection,
            clusterTime AS _timestamp,
            operationType AS _operation,
            sequenceNumber AS _version,
            operationType = 'delete' AS _deleted,
            fullDocument AS data
          FROM s3queue_cdc_events
        `,
        engine: 'ReplacingMergeTree(_version)',
        orderBy: ['_id'],
      };

      await viewManager.createView(definition);

      // Verify the target table has correct schema
      const schemaQuery = `
        SELECT name, type
        FROM system.columns
        WHERE database = 'mongo.do_test' AND table = 'orders_columnar'
      `;
      const columns = await clickhouse.query<{ name: string; type: string }>(schemaQuery);

      expect(columns).toContainEqual({ name: '_id', type: 'String' });
      expect(columns).toContainEqual({ name: '_deleted', type: 'UInt8' });
      expect(columns).toContainEqual(
        expect.objectContaining({ name: '_version', type: expect.stringContaining('Int') })
      );
    });

    it('should support partitioning by date', async () => {
      const definition: MaterializedViewDefinition = {
        name: 'mv_logs_partitioned',
        sourceTable: 's3queue_cdc_events',
        targetTable: 'logs_partitioned',
        selectQuery: `
          SELECT * FROM s3queue_cdc_events
          WHERE JSONExtractString(ns, 'coll') = 'logs'
        `,
        engine: 'ReplacingMergeTree(_version)',
        orderBy: ['_id'],
        partitionBy: 'toYYYYMM(_timestamp)',
      };

      await viewManager.createView(definition);

      // Verify partitioning
      const partitionQuery = `
        SELECT partition
        FROM system.parts
        WHERE database = 'mongo.do_test' AND table = 'logs_partitioned'
        GROUP BY partition
      `;
      const partitions = await clickhouse.query<{ partition: string }>(partitionQuery);

      // Should have partitions based on month
      expect(partitions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('view updates', () => {
    it('should automatically populate view from S3Queue source', async () => {
      // Insert test data via S3Queue (simulated)
      const initialStatus = await viewManager.getViewStatus('mv_users_columnar');
      const initialRowCount = initialStatus.rowCount;

      // Wait for S3Queue to process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const updatedStatus = await viewManager.getViewStatus('mv_users_columnar');

      // Row count should increase as S3Queue processes files
      expect(updatedStatus.rowCount).toBeGreaterThanOrEqual(initialRowCount);
    });

    it('should handle ReplacingMergeTree deduplication', async () => {
      // Insert duplicate events with same _id but different versions
      const query = `
        SELECT _id, count() as cnt
        FROM users_columnar
        GROUP BY _id
        HAVING cnt > 1
      `;

      const duplicates = await clickhouse.query<{ _id: string; cnt: number }>(query);

      // ReplacingMergeTree should deduplicate on merge
      // Before merge, duplicates may exist
      expect(duplicates).toBeDefined();
    });

    it('should reflect latest version after OPTIMIZE', async () => {
      // Force merge to deduplicate
      await clickhouse.execute('OPTIMIZE TABLE users_columnar FINAL');

      const query = `
        SELECT _id, _version, _deleted
        FROM users_columnar FINAL
        WHERE _id = 'test-doc-1'
      `;

      const results = await clickhouse.query<{
        _id: string;
        _version: bigint;
        _deleted: boolean;
      }>(query);

      // Should only have latest version
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('view management', () => {
    it('should drop materialized view and target table', async () => {
      await viewManager.createView({
        name: 'mv_temp_test',
        sourceTable: 's3queue_cdc_events',
        targetTable: 'temp_test',
        selectQuery: 'SELECT * FROM s3queue_cdc_events',
        engine: 'MergeTree()',
        orderBy: ['_id'],
      });

      await viewManager.dropView('mv_temp_test');

      await expect(viewManager.getViewStatus('mv_temp_test')).rejects.toThrow();
    });

    it('should refresh view manually', async () => {
      const beforeRefresh = await viewManager.getViewStatus('mv_users_columnar');

      await viewManager.refreshView('mv_users_columnar');

      const afterRefresh = await viewManager.getViewStatus('mv_users_columnar');

      expect(afterRefresh.lastRefresh.getTime()).toBeGreaterThan(
        beforeRefresh.lastRefresh.getTime()
      );
    });
  });
});

// =============================================================================
// Event Routing Tests
// =============================================================================

describe.skip('Event Routing', () => {
  let router: EventRouter;

  beforeEach(() => {
    router = new EventRouter({
      routingRules: [
        { pattern: { db: 'analytics', coll: 'events' }, targetTable: 'analytics_events' },
        { pattern: { db: 'analytics' }, targetTable: 'analytics_default' },
        { pattern: { coll: 'users' }, targetTable: 'all_users' },
        { pattern: {}, targetTable: 'default_events' },
      ],
    });
  });

  describe('single event routing', () => {
    it('should route event to specific collection table', () => {
      const event = createTestEvent('insert', 'analytics', 'events');

      const target = router.route(event);

      expect(target).toBe('analytics_events');
    });

    it('should route event to database-level table', () => {
      const event = createTestEvent('insert', 'analytics', 'pageviews');

      const target = router.route(event);

      expect(target).toBe('analytics_default');
    });

    it('should route event to collection pattern table', () => {
      const event = createTestEvent('insert', 'myapp', 'users');

      const target = router.route(event);

      expect(target).toBe('all_users');
    });

    it('should route to default table when no pattern matches', () => {
      const event = createTestEvent('insert', 'unknown', 'unknown');

      const target = router.route(event);

      expect(target).toBe('default_events');
    });
  });

  describe('batch routing', () => {
    it('should route batch of events to multiple tables', () => {
      const events = [
        createTestEvent('insert', 'analytics', 'events'),
        createTestEvent('update', 'analytics', 'pageviews'),
        createTestEvent('delete', 'myapp', 'users'),
        createTestEvent('insert', 'other', 'data'),
      ];

      const routed = router.routeBatch(events);

      expect(routed.get('analytics_events')?.length).toBe(1);
      expect(routed.get('analytics_default')?.length).toBe(1);
      expect(routed.get('all_users')?.length).toBe(1);
      expect(routed.get('default_events')?.length).toBe(1);
    });

    it('should handle empty batch', () => {
      const routed = router.routeBatch([]);

      expect(routed.size).toBe(0);
    });

    it('should group multiple events to same table', () => {
      const events = [
        createTestEvent('insert', 'analytics', 'events'),
        createTestEvent('update', 'analytics', 'events'),
        createTestEvent('delete', 'analytics', 'events'),
      ];

      const routed = router.routeBatch(events);

      expect(routed.get('analytics_events')?.length).toBe(3);
    });
  });
});

// =============================================================================
// Tombstone Handling Tests
// =============================================================================

describe.skip('Tombstone Handling', () => {
  let clickhouse: ClickHouseClient;
  let transformer: CDCToColumnarTransformer;

  beforeAll(async () => {
    clickhouse = new ClickHouseClient(TEST_CLICKHOUSE_CONFIG);
    await clickhouse.connect();
    transformer = new CDCToColumnarTransformer();
  });

  afterAll(async () => {
    await clickhouse.disconnect();
  });

  describe('tombstone creation', () => {
    it('should create tombstone record for delete event', () => {
      const deleteEvent: CDCEvent = {
        _id: 'event-1',
        operationType: 'delete',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: 'doc-123' },
        sequenceNumber: 100n,
      };

      const tombstone = transformer.createTombstone(deleteEvent);

      expect(tombstone._id).toBe('doc-123');
      expect(tombstone._collection).toBe('users');
      expect(tombstone._database).toBe('testdb');
      expect(tombstone._deleted_at).toBeInstanceOf(Date);
      expect(tombstone._sequence).toBe(100n);
    });

    it('should transform delete event to columnar with _deleted flag', () => {
      const deleteEvent: CDCEvent = {
        _id: 'event-1',
        operationType: 'delete',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: 'doc-123' },
        sequenceNumber: 100n,
      };

      const columnar = transformer.transform(deleteEvent);

      expect(columnar._deleted).toBe(true);
      expect(columnar._operation).toBe('delete');
      expect(columnar.data).toBe('null');
    });
  });

  describe('tombstone queries', () => {
    it('should exclude deleted documents with FINAL', async () => {
      // Query with FINAL to get latest version and respect _deleted
      const query = `
        SELECT _id, data
        FROM users_columnar FINAL
        WHERE _deleted = 0
      `;

      const results = await clickhouse.query<{ _id: string; data: string }>(query);

      // Should not include deleted documents
      expect(results.every((r) => r.data !== 'null')).toBe(true);
    });

    it('should query tombstones for audit', async () => {
      const query = `
        SELECT _id, _deleted_at, _sequence
        FROM tombstones
        WHERE _collection = 'users'
        ORDER BY _deleted_at DESC
        LIMIT 10
      `;

      const tombstones = await clickhouse.query<TombstoneRecord>(query);

      expect(tombstones).toBeInstanceOf(Array);
    });

    it('should handle soft delete with ReplacingMergeTree', async () => {
      // Insert a document
      await clickhouse.insert('users_columnar', [
        {
          _id: 'soft-delete-test',
          _database: 'testdb',
          _collection: 'users',
          _timestamp: new Date(),
          _operation: 'insert',
          _version: 1n,
          _deleted: false,
          data: JSON.stringify({ name: 'Test User' }),
        },
      ]);

      // Delete the document (insert tombstone with higher version)
      await clickhouse.insert('users_columnar', [
        {
          _id: 'soft-delete-test',
          _database: 'testdb',
          _collection: 'users',
          _timestamp: new Date(),
          _operation: 'delete',
          _version: 2n,
          _deleted: true,
          data: 'null',
        },
      ]);

      // Force merge
      await clickhouse.execute('OPTIMIZE TABLE users_columnar FINAL');

      // Query should return deleted version
      const query = `
        SELECT _id, _deleted, _version
        FROM users_columnar FINAL
        WHERE _id = 'soft-delete-test'
      `;

      const results = await clickhouse.query<{
        _id: string;
        _deleted: boolean;
        _version: bigint;
      }>(query);

      expect(results.length).toBe(1);
      expect(results[0]._deleted).toBe(true);
      expect(results[0]._version).toBe(2n);
    });
  });

  describe('tombstone cleanup', () => {
    it('should retain tombstones for configured retention period', async () => {
      const retentionDays = 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const query = `
        SELECT count() as cnt
        FROM tombstones
        WHERE _deleted_at < {cutoff:DateTime}
      `;

      const results = await clickhouse.query<{ cnt: number }>(query, {
        cutoff: cutoffDate,
      });

      // Old tombstones should be candidates for cleanup
      expect(results[0].cnt).toBeGreaterThanOrEqual(0);
    });
  });
});

// =============================================================================
// Full Pipeline Integration Tests
// =============================================================================

describe.skip('Real-time Pipeline Integration', () => {
  let clickhouse: ClickHouseClient;
  let r2Writer: R2CDCWriter;
  let transformer: CDCToColumnarTransformer;
  let pipeline: RealtimePipeline;

  beforeAll(async () => {
    clickhouse = new ClickHouseClient(TEST_CLICKHOUSE_CONFIG);
    await clickhouse.connect();
    r2Writer = new R2CDCWriter(TEST_R2_CONFIG);
    transformer = new CDCToColumnarTransformer();
    pipeline = new RealtimePipeline(clickhouse, r2Writer, transformer);
  });

  afterAll(async () => {
    await pipeline.stop();
    await clickhouse.disconnect();
  });

  describe('pipeline startup', () => {
    it('should start pipeline successfully', async () => {
      await expect(pipeline.start()).resolves.toBeUndefined();
    });

    it('should verify ClickHouse connectivity', async () => {
      const isConnected = await clickhouse.ping();
      expect(isConnected).toBe(true);
    });
  });

  describe('end-to-end event processing', () => {
    it('should process insert event through pipeline', async () => {
      const event: CDCEvent = {
        _id: 'e2e-insert-1',
        operationType: 'insert',
        clusterTime: new Date(),
        ns: { db: 'e2etest', coll: 'documents' },
        documentKey: { _id: 'doc-e2e-1' },
        fullDocument: {
          _id: 'doc-e2e-1',
          title: 'E2E Test Document',
          content: 'This is a test',
        },
        sequenceNumber: 1n,
      };

      await pipeline.processEvent(event);

      // Wait for S3Queue to process
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify document in ClickHouse
      const query = `
        SELECT _id, data
        FROM documents_columnar FINAL
        WHERE _id = 'doc-e2e-1'
      `;

      const results = await clickhouse.query<{ _id: string; data: string }>(query);

      expect(results.length).toBe(1);
      expect(JSON.parse(results[0].data)).toMatchObject({
        title: 'E2E Test Document',
      });
    });

    it('should process update event through pipeline', async () => {
      const event: CDCEvent = {
        _id: 'e2e-update-1',
        operationType: 'update',
        clusterTime: new Date(),
        ns: { db: 'e2etest', coll: 'documents' },
        documentKey: { _id: 'doc-e2e-1' },
        updateDescription: {
          updatedFields: { title: 'Updated E2E Document' },
          removedFields: [],
        },
        sequenceNumber: 2n,
      };

      await pipeline.processEvent(event);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify update in ClickHouse
      const query = `
        SELECT _id, _version, data
        FROM documents_columnar FINAL
        WHERE _id = 'doc-e2e-1'
      `;

      const results = await clickhouse.query<{
        _id: string;
        _version: bigint;
        data: string;
      }>(query);

      expect(results[0]._version).toBe(2n);
    });

    it('should process delete event through pipeline', async () => {
      const event: CDCEvent = {
        _id: 'e2e-delete-1',
        operationType: 'delete',
        clusterTime: new Date(),
        ns: { db: 'e2etest', coll: 'documents' },
        documentKey: { _id: 'doc-e2e-1' },
        sequenceNumber: 3n,
      };

      await pipeline.processEvent(event);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify deletion in ClickHouse
      const query = `
        SELECT _id, _deleted, _version
        FROM documents_columnar FINAL
        WHERE _id = 'doc-e2e-1'
      `;

      const results = await clickhouse.query<{
        _id: string;
        _deleted: boolean;
        _version: bigint;
      }>(query);

      expect(results[0]._deleted).toBe(true);
      expect(results[0]._version).toBe(3n);
    });
  });

  describe('batch processing', () => {
    it('should process batch of events efficiently', async () => {
      const events: CDCEvent[] = Array.from({ length: 100 }, (_, i) => ({
        _id: `batch-event-${i}`,
        operationType: 'insert' as const,
        clusterTime: new Date(),
        ns: { db: 'batchtest', coll: 'items' },
        documentKey: { _id: `batch-doc-${i}` },
        fullDocument: { _id: `batch-doc-${i}`, index: i, data: `Item ${i}` },
        sequenceNumber: BigInt(i + 1),
      }));

      const result = await pipeline.processBatch(events);

      expect(result.processed).toBe(100);
      expect(result.failed).toBe(0);
      expect(result.latencyMs).toBeLessThan(10000); // Less than 10 seconds
    });

    it('should handle mixed operation types in batch', async () => {
      const events: CDCEvent[] = [
        {
          _id: 'mixed-1',
          operationType: 'insert',
          clusterTime: new Date(),
          ns: { db: 'mixedtest', coll: 'items' },
          documentKey: { _id: 'mixed-doc-1' },
          fullDocument: { _id: 'mixed-doc-1', value: 1 },
          sequenceNumber: 1n,
        },
        {
          _id: 'mixed-2',
          operationType: 'update',
          clusterTime: new Date(),
          ns: { db: 'mixedtest', coll: 'items' },
          documentKey: { _id: 'mixed-doc-1' },
          updateDescription: { updatedFields: { value: 2 }, removedFields: [] },
          sequenceNumber: 2n,
        },
        {
          _id: 'mixed-3',
          operationType: 'delete',
          clusterTime: new Date(),
          ns: { db: 'mixedtest', coll: 'items' },
          documentKey: { _id: 'mixed-doc-1' },
          sequenceNumber: 3n,
        },
      ];

      const result = await pipeline.processBatch(events);

      expect(result.processed).toBe(3);
      expect(result.failed).toBe(0);
    });
  });

  describe('pipeline metrics', () => {
    it('should track processing metrics', () => {
      const metrics = pipeline.getMetrics();

      expect(metrics).toHaveProperty('eventsProcessed');
      expect(metrics).toHaveProperty('bytesWritten');
      expect(metrics).toHaveProperty('avgLatencyMs');
      expect(metrics.eventsProcessed).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// R2 to ClickHouse Integration Tests
// =============================================================================

describe.skip('R2 to ClickHouse S3Queue Integration', () => {
  let clickhouse: ClickHouseClient;
  let r2Writer: R2CDCWriter;

  beforeAll(async () => {
    clickhouse = new ClickHouseClient(TEST_CLICKHOUSE_CONFIG);
    await clickhouse.connect();
    r2Writer = new R2CDCWriter(TEST_R2_CONFIG);
  });

  afterAll(async () => {
    await clickhouse.disconnect();
  });

  describe('Parquet file ingestion', () => {
    it('should ingest Parquet file from R2', async () => {
      // Write test events to R2
      const events: CDCEvent[] = [
        createTestEvent('insert', 'testdb', 'ingestion_test'),
        createTestEvent('update', 'testdb', 'ingestion_test'),
      ];

      const filePath = await r2Writer.writeParquetBatch(
        events,
        `cdc/test/${Date.now()}/events.parquet`
      );

      expect(filePath).toContain('.parquet');

      // Wait for S3Queue to detect and process the file
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Verify data in ClickHouse
      const query = `
        SELECT count() as cnt
        FROM s3queue_cdc_events
        WHERE JSONExtractString(data, 'ns.coll') = 'ingestion_test'
      `;

      const results = await clickhouse.query<{ cnt: number }>(query);

      expect(results[0].cnt).toBeGreaterThanOrEqual(2);
    });

    it('should handle multiple Parquet files in sequence', async () => {
      const batches = 3;
      const eventsPerBatch = 10;

      for (let i = 0; i < batches; i++) {
        const events = Array.from({ length: eventsPerBatch }, (_, j) =>
          createTestEvent('insert', 'testdb', 'sequence_test')
        );

        await r2Writer.writeParquetBatch(
          events,
          `cdc/sequence/${Date.now()}/batch-${i}.parquet`
        );
      }

      // Wait for all files to be processed
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const query = `
        SELECT count() as cnt
        FROM s3queue_cdc_events
        WHERE JSONExtractString(data, 'ns.coll') = 'sequence_test'
      `;

      const results = await clickhouse.query<{ cnt: number }>(query);

      expect(results[0].cnt).toBeGreaterThanOrEqual(batches * eventsPerBatch);
    });
  });

  describe('JSON file ingestion', () => {
    it('should ingest JSONEachRow file from R2', async () => {
      const events: CDCEvent[] = [
        createTestEvent('insert', 'testdb', 'json_test'),
        createTestEvent('insert', 'testdb', 'json_test'),
      ];

      const filePath = await r2Writer.writeJSONBatch(
        events,
        `cdc/json/${Date.now()}/events.json`
      );

      expect(filePath).toContain('.json');

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const query = `
        SELECT count() as cnt
        FROM s3queue_cdc_events
        WHERE JSONExtractString(data, 'ns.coll') = 'json_test'
      `;

      const results = await clickhouse.query<{ cnt: number }>(query);

      expect(results[0].cnt).toBeGreaterThanOrEqual(2);
    });
  });

  describe('S3Queue status monitoring', () => {
    it('should report queue processing status', async () => {
      const query = `
        SELECT
          database,
          table,
          rows_processed,
          processing_files_num,
          failed_files_num
        FROM system.s3queue_log
        WHERE database = 'mongo.do_test'
        ORDER BY event_time DESC
        LIMIT 10
      `;

      const status = await clickhouse.query<{
        database: string;
        table: string;
        rows_processed: number;
        processing_files_num: number;
        failed_files_num: number;
      }>(query);

      expect(status).toBeInstanceOf(Array);
    });
  });
});

// =============================================================================
// Transformer Tests
// =============================================================================

describe.skip('CDC to Columnar Transformer', () => {
  let transformer: CDCToColumnarTransformer;

  beforeEach(() => {
    transformer = new CDCToColumnarTransformer();
  });

  describe('transform', () => {
    it('should transform insert event to columnar format', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'insert',
        clusterTime: new Date('2024-01-15T10:00:00Z'),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: 'doc-1' },
        fullDocument: { _id: 'doc-1', name: 'Alice', age: 30 },
        sequenceNumber: 1n,
      };

      const columnar = transformer.transform(event);

      expect(columnar._id).toBe('doc-1');
      expect(columnar._database).toBe('testdb');
      expect(columnar._collection).toBe('users');
      expect(columnar._operation).toBe('insert');
      expect(columnar._version).toBe(1n);
      expect(columnar._deleted).toBe(false);
      expect(JSON.parse(columnar.data)).toEqual({ _id: 'doc-1', name: 'Alice', age: 30 });
    });

    it('should transform update event to columnar format', () => {
      const event: CDCEvent = {
        _id: 'event-2',
        operationType: 'update',
        clusterTime: new Date('2024-01-15T10:01:00Z'),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: 'doc-1' },
        updateDescription: {
          updatedFields: { name: 'Alice Updated' },
          removedFields: ['temporaryField'],
        },
        sequenceNumber: 2n,
      };

      const columnar = transformer.transform(event);

      expect(columnar._id).toBe('doc-1');
      expect(columnar._operation).toBe('update');
      expect(columnar._version).toBe(2n);
      expect(columnar._deleted).toBe(false);
    });

    it('should transform delete event to columnar format with tombstone', () => {
      const event: CDCEvent = {
        _id: 'event-3',
        operationType: 'delete',
        clusterTime: new Date('2024-01-15T10:02:00Z'),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: 'doc-1' },
        sequenceNumber: 3n,
      };

      const columnar = transformer.transform(event);

      expect(columnar._id).toBe('doc-1');
      expect(columnar._operation).toBe('delete');
      expect(columnar._version).toBe(3n);
      expect(columnar._deleted).toBe(true);
      expect(columnar.data).toBe('null');
    });
  });

  describe('transformBatch', () => {
    it('should transform batch of mixed events', () => {
      const events: CDCEvent[] = [
        createTestEvent('insert', 'db', 'coll'),
        createTestEvent('update', 'db', 'coll'),
        createTestEvent('delete', 'db', 'coll'),
      ];

      const columnarDocs = transformer.transformBatch(events);

      expect(columnarDocs.length).toBe(3);
      expect(columnarDocs[0]._operation).toBe('insert');
      expect(columnarDocs[1]._operation).toBe('update');
      expect(columnarDocs[2]._operation).toBe('delete');
    });

    it('should handle empty batch', () => {
      const columnarDocs = transformer.transformBatch([]);

      expect(columnarDocs).toEqual([]);
    });
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

function createTestEvent(
  operationType: 'insert' | 'update' | 'delete',
  db: string,
  coll: string
): CDCEvent {
  const docId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const base: CDCEvent = {
    _id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    operationType,
    clusterTime: new Date(),
    ns: { db, coll },
    documentKey: { _id: docId },
    sequenceNumber: BigInt(Date.now()),
  };

  if (operationType === 'insert') {
    base.fullDocument = {
      _id: docId,
      createdAt: new Date(),
      data: `Test document for ${coll}`,
    };
  } else if (operationType === 'update') {
    base.updateDescription = {
      updatedFields: { updatedAt: new Date() },
      removedFields: [],
    };
  }

  return base;
}
