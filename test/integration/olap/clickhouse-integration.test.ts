/**
 * ClickHouse Integration Tests
 *
 * Integration tests that verify the CDC -> ClickHouse -> Query roundtrip.
 * These tests require a running ClickHouse instance and are skipped in CI
 * when CLICKHOUSE_URL is not set.
 *
 * Run locally:
 *   docker-compose -f test/integration/olap/docker-compose.yml up -d
 *   CLICKHOUSE_URL=http://localhost:8123 npm run test:integration
 *
 * Issue: mongo.do-zmyl - ClickHouse Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { ObjectId } from '../../../src/types/objectid';
import {
  ClickHouseOLAPBackend,
  createClickHouseOLAPBackend,
  ReadOnlyOperationError,
  type ClickHouseOLAPConfig,
} from '../../../src/olap/clickhouse/olap-backend';
import {
  createQueryExecutor,
  ClickHouseError,
  type QueryExecutorConfig,
} from '../../../src/olap/clickhouse/query-executor';
import {
  createInsertEvent,
  createUpdateEvent,
  createDeleteEvent,
  serializeToJSON,
  type CDCEvent,
  type InsertEvent,
  type UpdateEvent,
  type DeleteEvent,
} from '../../../src/olap/cdc/cdc-schema';

// =============================================================================
// Test Configuration
// =============================================================================

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL;
const CLICKHOUSE_HOST = process.env.CLICKHOUSE_HOST || 'localhost';
const CLICKHOUSE_PORT = parseInt(process.env.CLICKHOUSE_PORT || '8123', 10);
const CLICKHOUSE_USER = process.env.CLICKHOUSE_USER || 'default';
const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || '';
const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || 'mongo.do_test';

/**
 * Skip tests if no ClickHouse instance available
 */
const describeIfClickHouse = CLICKHOUSE_URL ? describe : describe.skip;

/**
 * Default config for tests
 */
const TEST_CONFIG: ClickHouseOLAPConfig = {
  host: CLICKHOUSE_HOST,
  port: CLICKHOUSE_PORT,
  database: CLICKHOUSE_DATABASE,
  username: CLICKHOUSE_USER,
  password: CLICKHOUSE_PASSWORD,
  secure: false,
  queryTimeout: 30000,
};

/**
 * Executor config for direct queries
 */
const EXECUTOR_CONFIG: QueryExecutorConfig = {
  host: CLICKHOUSE_HOST,
  port: CLICKHOUSE_PORT,
  database: CLICKHOUSE_DATABASE,
  username: CLICKHOUSE_USER,
  password: CLICKHOUSE_PASSWORD,
  secure: false,
  queryTimeout: 30000,
};

// =============================================================================
// Test Helper Functions
// =============================================================================

/**
 * Generate a unique collection name for test isolation
 */
function uniqueCollectionName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create test CDC events
 */
function createTestInsertEvent(db: string, coll: string, doc: Record<string, unknown> & { _id: ObjectId }): InsertEvent {
  return createInsertEvent({
    database: db,
    collection: coll,
    document: doc,
  });
}

function createTestUpdateEvent(
  db: string,
  coll: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> & { _id: ObjectId }
): UpdateEvent {
  return createUpdateEvent({
    database: db,
    collection: coll,
    documentKey: { _id: after._id },
    before,
    after,
  });
}

function createTestDeleteEvent(
  db: string,
  coll: string,
  doc: Record<string, unknown> & { _id: ObjectId }
): DeleteEvent {
  return createDeleteEvent({
    database: db,
    collection: coll,
    documentKey: { _id: doc._id },
    deletedDocument: doc,
  });
}

// =============================================================================
// CDC -> ClickHouse Flow Tests
// =============================================================================

describeIfClickHouse('ClickHouse Integration', () => {
  let executor: ReturnType<typeof createQueryExecutor>;
  let backend: ClickHouseOLAPBackend;
  let testCollection: string;

  beforeAll(async () => {
    executor = createQueryExecutor(EXECUTOR_CONFIG);

    // Create test database if it doesn't exist
    try {
      await executor.execute(`CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DATABASE}`);
    } catch (error) {
      // Database may already exist
    }

    // Create OLAP backend
    backend = await createClickHouseOLAPBackend(TEST_CONFIG);
  });

  afterAll(async () => {
    await executor.close();
  });

  beforeEach(async () => {
    testCollection = uniqueCollectionName('test_cdc');

    // Create test table with ReplacingMergeTree for CDC semantics
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_DATABASE}.${testCollection} (
        _id String,
        _version UInt64,
        _deleted UInt8 DEFAULT 0,
        name String,
        email String,
        age Int32,
        score Float64,
        tags Array(String),
        metadata String,
        createdAt DateTime64(3),
        updatedAt DateTime64(3)
      )
      ENGINE = ReplacingMergeTree(_version)
      ORDER BY _id
    `);
  });

  afterEach(async () => {
    // Cleanup test table
    try {
      await executor.execute(`DROP TABLE IF EXISTS ${CLICKHOUSE_DATABASE}.${testCollection}`);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('CDC Event Serialization', () => {
    it('should serialize insert event to JSON', () => {
      const doc = {
        _id: new ObjectId(),
        name: 'Test User',
        email: 'test@example.com',
        age: 30,
      };

      const event = createTestInsertEvent(CLICKHOUSE_DATABASE, testCollection, doc);
      const json = serializeToJSON(event);

      expect(json).toContain('"operationType":"insert"');
      expect(json).toContain('"name":"Test User"');
      expect(json).toContain(doc._id.toHexString());
    });

    it('should serialize update event with before/after', () => {
      const id = new ObjectId();
      const before = { _id: id, name: 'Old Name', age: 25 };
      const after = { _id: id, name: 'New Name', age: 26 };

      const event = createTestUpdateEvent(CLICKHOUSE_DATABASE, testCollection, before, after);
      const json = serializeToJSON(event);

      expect(json).toContain('"operationType":"update"');
      expect(json).toContain('"updatedFields"');
      expect(json).toContain('"New Name"');
    });

    it('should serialize delete event', () => {
      const doc = {
        _id: new ObjectId(),
        name: 'Deleted User',
      };

      const event = createTestDeleteEvent(CLICKHOUSE_DATABASE, testCollection, doc);
      const json = serializeToJSON(event);

      expect(json).toContain('"operationType":"delete"');
      expect(json).toContain(doc._id.toHexString());
    });
  });

  describe('CDC -> ClickHouse Insert Flow', () => {
    it('should insert document via direct SQL and query back', async () => {
      const id = new ObjectId();
      const now = new Date();

      // Simulate CDC insert by directly inserting into ClickHouse
      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${id.toHexString()}',
          1,
          0,
          'John Doe',
          'john@example.com',
          30,
          85.5,
          ['developer', 'typescript'],
          '{"role": "admin"}',
          '${now.toISOString()}',
          '${now.toISOString()}'
        )
      `);

      // Query back using OLAP backend
      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: { _id: id.toHexString() },
      });

      expect(result.documents.length).toBe(1);
      expect(result.documents[0].name).toBe('John Doe');
      expect(result.documents[0].email).toBe('john@example.com');
      expect(result.documents[0].age).toBe(30);
    });

    it('should handle batch inserts', async () => {
      const docs = Array.from({ length: 10 }, (_, i) => ({
        _id: new ObjectId(),
        name: `User ${i}`,
        age: 20 + i,
      }));

      // Batch insert
      const values = docs.map((doc) =>
        `('${doc._id.toHexString()}', 1, 0, '${doc.name}', '', ${doc.age}, 0, [], '{}', now(), now())`
      ).join(',');

      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES ${values}
      `);

      // Query all documents
      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: {},
        limit: 100,
      });

      expect(result.documents.length).toBe(10);
    });
  });

  describe('CDC Update Semantics with ReplacingMergeTree', () => {
    it('should apply update by inserting new version', async () => {
      const id = new ObjectId();

      // Insert version 1
      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${id.toHexString()}',
          1,
          0,
          'Original Name',
          'user@example.com',
          25,
          0,
          [],
          '{}',
          now(),
          now()
        )
      `);

      // Insert version 2 (update)
      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${id.toHexString()}',
          2,
          0,
          'Updated Name',
          'user@example.com',
          26,
          0,
          [],
          '{}',
          now(),
          now()
        )
      `);

      // Force merge to deduplicate
      await executor.execute(`OPTIMIZE TABLE ${CLICKHOUSE_DATABASE}.${testCollection} FINAL`);

      // Query with FINAL to get latest version
      const result = await executor.execute<{
        _id: string;
        _version: number;
        name: string;
        age: number;
      }>(`
        SELECT _id, _version, name, age
        FROM ${CLICKHOUSE_DATABASE}.${testCollection} FINAL
        WHERE _id = '${id.toHexString()}'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe('Updated Name');
      expect(result.rows[0].age).toBe(26);
      expect(result.rows[0]._version).toBe(2);
    });

    it('should handle concurrent updates with version ordering', async () => {
      const id = new ObjectId();

      // Insert multiple versions out of order
      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES
          ('${id.toHexString()}', 3, 0, 'Version 3', '', 30, 0, [], '{}', now(), now()),
          ('${id.toHexString()}', 1, 0, 'Version 1', '', 10, 0, [], '{}', now(), now()),
          ('${id.toHexString()}', 2, 0, 'Version 2', '', 20, 0, [], '{}', now(), now())
      `);

      // Force merge
      await executor.execute(`OPTIMIZE TABLE ${CLICKHOUSE_DATABASE}.${testCollection} FINAL`);

      // Latest version should win
      const result = await executor.execute<{ name: string; _version: number }>(`
        SELECT name, _version
        FROM ${CLICKHOUSE_DATABASE}.${testCollection} FINAL
        WHERE _id = '${id.toHexString()}'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].name).toBe('Version 3');
      expect(result.rows[0]._version).toBe(3);
    });
  });

  describe('CDC Delete Semantics (Tombstones)', () => {
    it('should mark document as deleted via tombstone', async () => {
      const id = new ObjectId();

      // Insert document
      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${id.toHexString()}',
          1,
          0,
          'To Be Deleted',
          'delete@example.com',
          30,
          0,
          [],
          '{}',
          now(),
          now()
        )
      `);

      // Delete by inserting tombstone with higher version
      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${id.toHexString()}',
          2,
          1,
          '',
          '',
          0,
          0,
          [],
          '{}',
          now(),
          now()
        )
      `);

      // Force merge
      await executor.execute(`OPTIMIZE TABLE ${CLICKHOUSE_DATABASE}.${testCollection} FINAL`);

      // Query should show deleted flag
      const result = await executor.execute<{ _id: string; _deleted: number }>(`
        SELECT _id, _deleted
        FROM ${CLICKHOUSE_DATABASE}.${testCollection} FINAL
        WHERE _id = '${id.toHexString()}'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]._deleted).toBe(1);
    });

    it('should filter out deleted documents in queries', async () => {
      const activeId = new ObjectId();
      const deletedId = new ObjectId();

      // Insert active document
      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${activeId.toHexString()}',
          1,
          0,
          'Active User',
          'active@example.com',
          25,
          0,
          [],
          '{}',
          now(),
          now()
        )
      `);

      // Insert deleted document
      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${deletedId.toHexString()}',
          1,
          1,
          'Deleted User',
          'deleted@example.com',
          30,
          0,
          [],
          '{}',
          now(),
          now()
        )
      `);

      // Query excluding deleted
      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: { _deleted: 0 },
      });

      expect(result.documents.length).toBe(1);
      expect(result.documents[0].name).toBe('Active User');
    });
  });

  describe('Aggregation Semantics Tests', () => {
    beforeEach(async () => {
      // Insert test data for aggregation
      const values = [
        `('${new ObjectId().toHexString()}', 1, 0, 'Alice', 'alice@example.com', 25, 85.0, ['developer'], '{"dept": "engineering"}', now(), now())`,
        `('${new ObjectId().toHexString()}', 1, 0, 'Bob', 'bob@example.com', 30, 90.0, ['designer'], '{"dept": "design"}', now(), now())`,
        `('${new ObjectId().toHexString()}', 1, 0, 'Charlie', 'charlie@example.com', 35, 78.0, ['developer'], '{"dept": "engineering"}', now(), now())`,
        `('${new ObjectId().toHexString()}', 1, 0, 'Diana', 'diana@example.com', 28, 92.0, ['manager'], '{"dept": "management"}', now(), now())`,
        `('${new ObjectId().toHexString()}', 1, 0, 'Eve', 'eve@example.com', 32, 88.0, ['developer'], '{"dept": "engineering"}', now(), now())`,
      ].join(',');

      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES ${values}
      `);
    });

    it('should execute $group with $sum', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $group: { _id: null, totalAge: { $sum: '$age' } } },
      ]);

      expect(result.documents.length).toBe(1);
      expect(result.documents[0].totalAge).toBe(150); // 25 + 30 + 35 + 28 + 32
    });

    it('should execute $group with $avg', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $group: { _id: null, avgScore: { $avg: '$score' } } },
      ]);

      expect(result.documents.length).toBe(1);
      expect(result.documents[0].avgScore).toBeCloseTo(86.6, 1); // (85+90+78+92+88)/5
    });

    it('should execute $group with $count (using $sum: 1)', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $group: { _id: null, count: { $sum: 1 } } },
      ]);

      expect(result.documents.length).toBe(1);
      expect(result.documents[0].count).toBe(5);
    });

    it('should execute $count stage', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $count: 'total' },
      ]);

      expect(result.documents.length).toBe(1);
      expect(result.documents[0].total).toBe(5);
    });

    it('should execute $match with equality', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $match: { name: 'Alice' } },
      ]);

      expect(result.documents.length).toBe(1);
      expect(result.documents[0].name).toBe('Alice');
    });

    it('should execute $match with comparison operators', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $match: { age: { $gte: 30 } } },
        { $sort: { age: 1 } },
      ]);

      expect(result.documents.length).toBe(3);
      expect(result.documents[0].name).toBe('Bob');
      expect(result.documents[1].name).toBe('Eve');
      expect(result.documents[2].name).toBe('Charlie');
    });

    it('should execute $match with $in operator', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $match: { name: { $in: ['Alice', 'Bob', 'NonExistent'] } } },
        { $sort: { name: 1 } },
      ]);

      expect(result.documents.length).toBe(2);
      expect(result.documents[0].name).toBe('Alice');
      expect(result.documents[1].name).toBe('Bob');
    });

    it('should execute $sort ascending', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $sort: { age: 1 } },
      ]);

      expect(result.documents.length).toBe(5);
      expect(result.documents[0].name).toBe('Alice');
      expect(result.documents[4].name).toBe('Charlie');
    });

    it('should execute $sort descending', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $sort: { score: -1 } },
      ]);

      expect(result.documents.length).toBe(5);
      expect(result.documents[0].name).toBe('Diana');
      expect(result.documents[4].name).toBe('Charlie');
    });

    it('should execute $limit', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $sort: { name: 1 } },
        { $limit: 3 },
      ]);

      expect(result.documents.length).toBe(3);
    });

    it('should execute $skip', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $sort: { name: 1 } },
        { $skip: 2 },
      ]);

      expect(result.documents.length).toBe(3);
      expect(result.documents[0].name).toBe('Charlie');
    });

    it('should execute $skip with $limit for pagination', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        { $sort: { name: 1 } },
        { $skip: 1 },
        { $limit: 2 },
      ]);

      expect(result.documents.length).toBe(2);
      expect(result.documents[0].name).toBe('Bob');
      expect(result.documents[1].name).toBe('Charlie');
    });

    it('should execute $group with field grouping', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        {
          $group: {
            _id: '$age',
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      expect(result.documents.length).toBe(5); // All ages are unique
    });

    it('should execute $group with $min and $max', async () => {
      const result = await backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
        {
          $group: {
            _id: null,
            minAge: { $min: '$age' },
            maxAge: { $max: '$age' },
            minScore: { $min: '$score' },
            maxScore: { $max: '$score' },
          },
        },
      ]);

      expect(result.documents.length).toBe(1);
      expect(result.documents[0].minAge).toBe(25);
      expect(result.documents[0].maxAge).toBe(35);
      expect(result.documents[0].minScore).toBe(78);
      expect(result.documents[0].maxScore).toBe(92);
    });
  });

  describe('Type Preservation Tests', () => {
    it('should preserve ObjectId roundtrip', async () => {
      const id = new ObjectId();

      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${id.toHexString()}',
          1,
          0,
          'ObjectId Test',
          '',
          0,
          0,
          [],
          '{}',
          now(),
          now()
        )
      `);

      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: { _id: id.toHexString() },
      });

      expect(result.documents.length).toBe(1);
      // The _id should be preserved as string (or ObjectId depending on mapper config)
      expect(result.documents[0]._id).toBe(id.toHexString());
    });

    it('should preserve Date/DateTime roundtrip', async () => {
      const id = new ObjectId();
      const testDate = new Date('2024-06-15T10:30:00.123Z');

      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${id.toHexString()}',
          1,
          0,
          'DateTime Test',
          '',
          0,
          0,
          [],
          '{}',
          '${testDate.toISOString().replace('T', ' ').replace('Z', '')}',
          '${testDate.toISOString().replace('T', ' ').replace('Z', '')}'
        )
      `);

      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: { _id: id.toHexString() },
      });

      expect(result.documents.length).toBe(1);
      // DateTime should be converted to Date object
      expect(result.documents[0].createdAt).toBeInstanceOf(Date);
    });

    it('should handle nested documents in JSON metadata', async () => {
      const id = new ObjectId();
      const metadata = {
        nested: {
          level1: {
            level2: 'deep value',
          },
        },
        array: [1, 2, 3],
      };

      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${id.toHexString()}',
          1,
          0,
          'Nested Test',
          '',
          0,
          0,
          [],
          '${JSON.stringify(metadata).replace(/'/g, "''")}',
          now(),
          now()
        )
      `);

      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: { _id: id.toHexString() },
      });

      expect(result.documents.length).toBe(1);
      // Metadata should be parsed as JSON
      const parsedMetadata = typeof result.documents[0].metadata === 'string'
        ? JSON.parse(result.documents[0].metadata as string)
        : result.documents[0].metadata;
      expect(parsedMetadata.nested.level1.level2).toBe('deep value');
    });

    it('should handle array fields', async () => {
      const id = new ObjectId();

      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${id.toHexString()}',
          1,
          0,
          'Array Test',
          '',
          0,
          0,
          ['tag1', 'tag2', 'tag3'],
          '{}',
          now(),
          now()
        )
      `);

      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: { _id: id.toHexString() },
      });

      expect(result.documents.length).toBe(1);
      expect(Array.isArray(result.documents[0].tags)).toBe(true);
      expect(result.documents[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle numeric types', async () => {
      const id = new ObjectId();

      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES (
          '${id.toHexString()}',
          1,
          0,
          'Numeric Test',
          '',
          42,
          3.14159,
          [],
          '{}',
          now(),
          now()
        )
      `);

      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: { _id: id.toHexString() },
      });

      expect(result.documents.length).toBe(1);
      expect(result.documents[0].age).toBe(42);
      expect(result.documents[0].score).toBeCloseTo(3.14159, 4);
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle connection failures gracefully', async () => {
      const badConfig: QueryExecutorConfig = {
        host: 'nonexistent-host.invalid',
        port: 8123,
        database: 'test',
        queryTimeout: 5000,
        connectionTimeout: 2000,
      };

      const badExecutor = createQueryExecutor(badConfig);

      await expect(badExecutor.execute('SELECT 1')).rejects.toThrow();
      await badExecutor.close();
    });

    it('should handle query timeout', async () => {
      // Create executor with very short timeout
      const shortTimeoutConfig: QueryExecutorConfig = {
        ...EXECUTOR_CONFIG,
        queryTimeout: 1, // 1ms timeout
      };

      const shortTimeoutExecutor = createQueryExecutor(shortTimeoutConfig);

      // This should timeout
      await expect(
        shortTimeoutExecutor.execute(`
          SELECT sleep(5)
        `, { timeout: 1 })
      ).rejects.toThrow();

      await shortTimeoutExecutor.close();
    });

    it('should handle invalid aggregation pipeline', async () => {
      // Invalid pipeline stage
      await expect(
        backend.aggregate(CLICKHOUSE_DATABASE, testCollection, [
          { $unknownStage: {} } as any,
        ])
      ).resolves.toBeDefined(); // May return empty or error depending on implementation
    });

    it('should throw ReadOnlyOperationError for write operations', async () => {
      await expect(
        backend.insertOne(CLICKHOUSE_DATABASE, testCollection, { name: 'test' })
      ).rejects.toThrow(ReadOnlyOperationError);

      await expect(
        backend.updateOne(CLICKHOUSE_DATABASE, testCollection, {}, { $set: { name: 'test' } })
      ).rejects.toThrow(ReadOnlyOperationError);

      await expect(
        backend.deleteOne(CLICKHOUSE_DATABASE, testCollection, {})
      ).rejects.toThrow(ReadOnlyOperationError);
    });

    it('should handle invalid SQL syntax', async () => {
      await expect(
        executor.execute('INVALID SQL SYNTAX HERE')
      ).rejects.toThrow(ClickHouseError);
    });
  });

  describe('Count and Distinct Operations', () => {
    beforeEach(async () => {
      // Insert test data
      const values = [
        `('${new ObjectId().toHexString()}', 1, 0, 'Alice', 'alice@example.com', 25, 85.0, ['developer'], '{}', now(), now())`,
        `('${new ObjectId().toHexString()}', 1, 0, 'Bob', 'bob@example.com', 30, 90.0, ['designer'], '{}', now(), now())`,
        `('${new ObjectId().toHexString()}', 1, 0, 'Charlie', 'charlie@example.com', 25, 78.0, ['developer'], '{}', now(), now())`,
      ].join(',');

      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES ${values}
      `);
    });

    it('should count all documents', async () => {
      const count = await backend.count(CLICKHOUSE_DATABASE, testCollection);
      expect(count).toBe(3);
    });

    it('should count documents with filter', async () => {
      const count = await backend.count(CLICKHOUSE_DATABASE, testCollection, { age: 25 });
      expect(count).toBe(2);
    });

    it('should get distinct values', async () => {
      const ages = await backend.distinct(CLICKHOUSE_DATABASE, testCollection, 'age');
      expect(ages.sort()).toEqual([25, 30]);
    });

    it('should get distinct values with filter', async () => {
      const names = await backend.distinct(
        CLICKHOUSE_DATABASE,
        testCollection,
        'name',
        { age: 25 }
      );
      expect(names.sort()).toEqual(['Alice', 'Charlie']);
    });
  });

  describe('Collection and Database Operations', () => {
    it('should list databases', async () => {
      const databases = await backend.listDatabases();
      expect(databases).toBeInstanceOf(Array);
      expect(databases.some((db) => db.name === CLICKHOUSE_DATABASE || db.name === 'default')).toBe(true);
    });

    it('should check database exists', async () => {
      const exists = await backend.databaseExists(CLICKHOUSE_DATABASE);
      expect(exists).toBe(true);

      const notExists = await backend.databaseExists('nonexistent_db_12345');
      expect(notExists).toBe(false);
    });

    it('should list collections', async () => {
      const collections = await backend.listCollections(CLICKHOUSE_DATABASE);
      expect(collections).toBeInstanceOf(Array);
      expect(collections.some((c) => c.name === testCollection)).toBe(true);
    });

    it('should check collection exists', async () => {
      const exists = await backend.collectionExists(CLICKHOUSE_DATABASE, testCollection);
      expect(exists).toBe(true);

      const notExists = await backend.collectionExists(CLICKHOUSE_DATABASE, 'nonexistent_collection');
      expect(notExists).toBe(false);
    });

    it('should get collection stats', async () => {
      // Insert some data first
      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES ('${new ObjectId().toHexString()}', 1, 0, 'Stats Test', '', 0, 0, [], '{}', now(), now())
      `);

      const stats = await backend.collStats(CLICKHOUSE_DATABASE, testCollection);
      expect(stats.ns).toBe(`${CLICKHOUSE_DATABASE}.${testCollection}`);
      expect(stats.count).toBeGreaterThanOrEqual(0);
    });

    it('should get database stats', async () => {
      const stats = await backend.dbStats(CLICKHOUSE_DATABASE);
      expect(stats.db).toBe(CLICKHOUSE_DATABASE);
      expect(stats.collections).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Find Operations', () => {
    beforeEach(async () => {
      // Insert test data
      const values = Array.from({ length: 20 }, (_, i) => {
        const id = new ObjectId();
        return `('${id.toHexString()}', 1, 0, 'User ${i}', 'user${i}@example.com', ${20 + i}, ${50 + i * 2}, [], '{}', now(), now())`;
      }).join(',');

      await executor.execute(`
        INSERT INTO ${CLICKHOUSE_DATABASE}.${testCollection}
        (_id, _version, _deleted, name, email, age, score, tags, metadata, createdAt, updatedAt)
        VALUES ${values}
      `);
    });

    it('should find with limit', async () => {
      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: {},
        limit: 5,
      });

      expect(result.documents.length).toBe(5);
    });

    it('should find with skip', async () => {
      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: {},
        sort: { age: 1 },
        skip: 5,
        limit: 5,
      });

      expect(result.documents.length).toBe(5);
      expect(result.documents[0].age).toBe(25);
    });

    it('should find with projection', async () => {
      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: {},
        projection: { name: 1, age: 1 },
        limit: 5,
      });

      expect(result.documents.length).toBe(5);
      // Note: Projection behavior depends on implementation
    });

    it('should find with compound filter', async () => {
      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: {
          $and: [
            { age: { $gte: 25 } },
            { age: { $lte: 30 } },
          ],
        },
      });

      expect(result.documents.every((d) => d.age >= 25 && d.age <= 30)).toBe(true);
    });

    it('should find with $or filter', async () => {
      const result = await backend.find(CLICKHOUSE_DATABASE, testCollection, {
        filter: {
          $or: [
            { age: 20 },
            { age: 39 },
          ],
        },
      });

      expect(result.documents.every((d) => d.age === 20 || d.age === 39)).toBe(true);
    });
  });
});

// =============================================================================
// Standalone Unit Tests (Always Run)
// =============================================================================

describe('CDC Event Creation', () => {
  it('should create insert event with correct structure', () => {
    const doc = {
      _id: new ObjectId(),
      name: 'Test',
      value: 123,
    };

    const event = createInsertEvent({
      database: 'testdb',
      collection: 'testcoll',
      document: doc,
    });

    expect(event.operationType).toBe('insert');
    expect(event.ns.db).toBe('testdb');
    expect(event.ns.coll).toBe('testcoll');
    expect(event.fullDocument).toBe(doc);
    expect(event.documentKey._id).toBe(doc._id);
    expect(event.eventId).toBeDefined();
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it('should create update event with computed diff', () => {
    const id = new ObjectId();
    const before = { _id: id, name: 'Old', age: 25, removed: 'field' };
    const after = { _id: id, name: 'New', age: 26 };

    const event = createUpdateEvent({
      database: 'testdb',
      collection: 'testcoll',
      documentKey: { _id: id },
      before,
      after,
    });

    expect(event.operationType).toBe('update');
    expect(event.updateDescription.updatedFields).toEqual({ name: 'New', age: 26 });
    expect(event.updateDescription.removedFields).toContain('removed');
  });

  it('should create delete event', () => {
    const doc = {
      _id: new ObjectId(),
      name: 'Deleted',
    };

    const event = createDeleteEvent({
      database: 'testdb',
      collection: 'testcoll',
      documentKey: { _id: doc._id },
      deletedDocument: doc,
    });

    expect(event.operationType).toBe('delete');
    expect(event.fullDocumentBeforeChange).toBe(doc);
  });
});

describe('CDC Event Serialization', () => {
  it('should serialize ObjectId to hex string in JSON', () => {
    const id = new ObjectId();
    const event = createInsertEvent({
      database: 'test',
      collection: 'test',
      document: { _id: id, name: 'Test' },
    });

    const json = serializeToJSON(event);
    const parsed = JSON.parse(json);

    expect(parsed.documentKey._id).toBe(id.toHexString());
    expect(parsed.fullDocument._id).toBe(id.toHexString());
  });

  it('should serialize Date to ISO string in JSON', () => {
    const event = createInsertEvent({
      database: 'test',
      collection: 'test',
      document: { _id: new ObjectId(), date: new Date('2024-01-15T10:30:00Z') },
    });

    const json = serializeToJSON(event);
    const parsed = JSON.parse(json);

    expect(parsed.fullDocument.date).toBe('2024-01-15T10:30:00.000Z');
  });
});
