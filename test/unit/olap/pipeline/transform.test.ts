/**
 * Cloudflare Pipeline Transform Tests (TDD - RED phase)
 *
 * Tests for Cloudflare Pipelines transformation layer including:
 * - PipelineTransform - generate SQL, flatten documents, partition
 * - Document flattening for columnar formats
 * - SQL generation for ClickHouse ingestion
 * - Partitioning strategies for efficient storage
 *
 * Issue: mondodb-s6mp - Pipeline Integration Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObjectId } from '../../../../src/types/objectid';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * CDC Event types from MongoDB change streams
 */
interface CDCEvent {
  _id: string;
  operationType: 'insert' | 'update' | 'delete' | 'replace';
  clusterTime: Date;
  ns: { db: string; coll: string };
  documentKey: { _id: ObjectId | string };
  fullDocument?: Record<string, unknown>;
  fullDocumentBeforeChange?: Record<string, unknown>;
  updateDescription?: {
    updatedFields: Record<string, unknown>;
    removedFields: string[];
    truncatedArrays?: Array<{ field: string; newSize: number }>;
  };
}

/**
 * Flattened document for columnar storage
 */
interface FlattenedDocument {
  [key: string]: string | number | boolean | null | Date;
}

/**
 * Partition configuration
 */
interface PartitionConfig {
  type: 'time' | 'hash' | 'range' | 'composite';
  timeColumn?: string;
  timeGranularity?: 'hour' | 'day' | 'week' | 'month';
  hashColumns?: string[];
  hashBuckets?: number;
  rangeColumn?: string;
  rangeBoundaries?: number[];
}

/**
 * Partition metadata for a document
 */
interface PartitionMetadata {
  partitionKey: string;
  partitionPath: string;
  partitionValues: Record<string, string | number>;
}

/**
 * SQL generation options
 */
interface SQLGenerationOptions {
  targetTable: string;
  database: string;
  insertMode: 'insert' | 'upsert' | 'replace';
  onConflict?: 'ignore' | 'update' | 'error';
  columns?: string[];
}

/**
 * Generated SQL statement with metadata
 */
interface GeneratedSQL {
  sql: string;
  params: unknown[];
  affectedTable: string;
  operationType: 'INSERT' | 'UPDATE' | 'DELETE';
}

/**
 * Schema inference result
 */
interface InferredSchema {
  fields: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null';
    clickhouseType: string;
    nullable: boolean;
    nested?: InferredSchema;
  }>;
}

// =============================================================================
// Mock Implementation Stubs
// =============================================================================

class PipelineTransform {
  constructor(_config?: { maxDepth?: number; arraySeparator?: string }) {
    throw new Error('Not implemented');
  }

  flatten(_document: Record<string, unknown>): FlattenedDocument {
    throw new Error('Not implemented');
  }

  flattenWithSchema(
    _document: Record<string, unknown>,
    _schema: InferredSchema
  ): FlattenedDocument {
    throw new Error('Not implemented');
  }

  unflatten(_flatDoc: FlattenedDocument): Record<string, unknown> {
    throw new Error('Not implemented');
  }

  generateSQL(_event: CDCEvent, _options: SQLGenerationOptions): GeneratedSQL {
    throw new Error('Not implemented');
  }

  generateBatchSQL(_events: CDCEvent[], _options: SQLGenerationOptions): GeneratedSQL[] {
    throw new Error('Not implemented');
  }

  inferSchema(_documents: Record<string, unknown>[]): InferredSchema {
    throw new Error('Not implemented');
  }
}

class DocumentPartitioner {
  constructor(_config: PartitionConfig) {
    throw new Error('Not implemented');
  }

  getPartition(_document: Record<string, unknown>): PartitionMetadata {
    throw new Error('Not implemented');
  }

  getPartitionPath(_document: Record<string, unknown>): string {
    throw new Error('Not implemented');
  }

  generatePartitionDDL(_tableName: string): string {
    throw new Error('Not implemented');
  }

  listPartitions(_startDate: Date, _endDate: Date): string[] {
    throw new Error('Not implemented');
  }

  pruneOldPartitions(_olderThan: Date): string[] {
    throw new Error('Not implemented');
  }
}

class CDCTransformPipeline {
  constructor(
    _transform: PipelineTransform,
    _partitioner: DocumentPartitioner
  ) {
    throw new Error('Not implemented');
  }

  async process(_event: CDCEvent): Promise<{
    flattenedDoc: FlattenedDocument;
    partition: PartitionMetadata;
    sql: GeneratedSQL;
  }> {
    throw new Error('Not implemented');
  }

  async processBatch(_events: CDCEvent[]): Promise<
    Array<{
      flattenedDoc: FlattenedDocument;
      partition: PartitionMetadata;
      sql: GeneratedSQL;
    }>
  > {
    throw new Error('Not implemented');
  }
}

// =============================================================================
// Document Flattening Tests
// =============================================================================

describe('PipelineTransform', () => {
  let transform: PipelineTransform;

  beforeEach(() => {
    transform = new PipelineTransform();
  });

  // ==========================================================================
  // Flatten Documents
  // ==========================================================================

  describe('flatten documents', () => {
    it('should flatten simple document', () => {
      const doc = {
        _id: '123',
        name: 'John',
        age: 30,
        active: true,
      };

      const flattened = transform.flatten(doc);

      expect(flattened._id).toBe('123');
      expect(flattened.name).toBe('John');
      expect(flattened.age).toBe(30);
      expect(flattened.active).toBe(true);
    });

    it('should flatten nested document with dot notation', () => {
      const doc = {
        _id: '123',
        address: {
          street: '123 Main St',
          city: 'New York',
          zip: '10001',
        },
      };

      const flattened = transform.flatten(doc);

      expect(flattened['address.street']).toBe('123 Main St');
      expect(flattened['address.city']).toBe('New York');
      expect(flattened['address.zip']).toBe('10001');
    });

    it('should flatten deeply nested documents', () => {
      const doc = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };

      const flattened = transform.flatten(doc);

      expect(flattened['level1.level2.level3.value']).toBe('deep');
    });

    it('should respect max depth configuration', () => {
      const deepTransform = new PipelineTransform({ maxDepth: 2 });
      const doc = {
        level1: {
          level2: {
            level3: {
              value: 'too deep',
            },
          },
        },
      };

      const flattened = deepTransform.flatten(doc);

      // Level 3 should be serialized as JSON string
      expect(typeof flattened['level1.level2']).toBe('string');
      expect(flattened['level1.level2']).toContain('level3');
    });

    it('should flatten arrays with index notation', () => {
      const doc = {
        tags: ['javascript', 'typescript', 'nodejs'],
      };

      const flattened = transform.flatten(doc);

      expect(flattened['tags.0']).toBe('javascript');
      expect(flattened['tags.1']).toBe('typescript');
      expect(flattened['tags.2']).toBe('nodejs');
    });

    it('should flatten arrays of objects', () => {
      const doc = {
        items: [
          { name: 'Item 1', price: 10 },
          { name: 'Item 2', price: 20 },
        ],
      };

      const flattened = transform.flatten(doc);

      expect(flattened['items.0.name']).toBe('Item 1');
      expect(flattened['items.0.price']).toBe(10);
      expect(flattened['items.1.name']).toBe('Item 2');
      expect(flattened['items.1.price']).toBe(20);
    });

    it('should use custom array separator when configured', () => {
      const customTransform = new PipelineTransform({ arraySeparator: '__' });
      const doc = {
        tags: ['a', 'b', 'c'],
      };

      const flattened = customTransform.flatten(doc);

      expect(flattened['tags__0']).toBe('a');
      expect(flattened['tags__1']).toBe('b');
    });

    it('should handle null values', () => {
      const doc = {
        name: 'Test',
        description: null,
      };

      const flattened = transform.flatten(doc);

      expect(flattened.name).toBe('Test');
      expect(flattened.description).toBeNull();
    });

    it('should handle Date objects', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const doc = {
        createdAt: date,
      };

      const flattened = transform.flatten(doc);

      expect(flattened.createdAt).toEqual(date);
    });

    it('should handle ObjectId', () => {
      const objectId = new ObjectId();
      const doc = {
        _id: objectId,
      };

      const flattened = transform.flatten(doc);

      expect(flattened._id).toBe(objectId.toString());
    });

    it('should handle empty objects', () => {
      const doc = {
        name: 'Test',
        metadata: {},
      };

      const flattened = transform.flatten(doc);

      expect(flattened.name).toBe('Test');
      // Empty object should be serialized as empty JSON
      expect(flattened.metadata).toBe('{}');
    });

    it('should handle empty arrays', () => {
      const doc = {
        tags: [],
      };

      const flattened = transform.flatten(doc);

      expect(flattened.tags).toBe('[]');
    });

    it('should preserve number precision', () => {
      const doc = {
        price: 123.456789,
        bigInt: 9007199254740991,
      };

      const flattened = transform.flatten(doc);

      expect(flattened.price).toBe(123.456789);
      expect(flattened.bigInt).toBe(9007199254740991);
    });
  });

  // ==========================================================================
  // Unflatten Documents
  // ==========================================================================

  describe('unflatten documents', () => {
    it('should unflatten simple document', () => {
      const flat: FlattenedDocument = {
        _id: '123',
        name: 'John',
        age: 30,
      };

      const doc = transform.unflatten(flat);

      expect(doc._id).toBe('123');
      expect(doc.name).toBe('John');
      expect(doc.age).toBe(30);
    });

    it('should unflatten nested document', () => {
      const flat: FlattenedDocument = {
        'address.street': '123 Main St',
        'address.city': 'New York',
      };

      const doc = transform.unflatten(flat);

      expect(doc.address).toEqual({
        street: '123 Main St',
        city: 'New York',
      });
    });

    it('should unflatten arrays', () => {
      const flat: FlattenedDocument = {
        'tags.0': 'a',
        'tags.1': 'b',
        'tags.2': 'c',
      };

      const doc = transform.unflatten(flat);

      expect(doc.tags).toEqual(['a', 'b', 'c']);
    });

    it('should handle mixed nested structures', () => {
      const flat: FlattenedDocument = {
        'items.0.name': 'Item 1',
        'items.0.price': 10,
        'items.1.name': 'Item 2',
        'items.1.price': 20,
      };

      const doc = transform.unflatten(flat);

      expect(doc.items).toEqual([
        { name: 'Item 1', price: 10 },
        { name: 'Item 2', price: 20 },
      ]);
    });

    it('should roundtrip flatten/unflatten', () => {
      const original = {
        _id: '123',
        name: 'Test',
        nested: {
          value: 42,
          array: [1, 2, 3],
        },
      };

      const flattened = transform.flatten(original);
      const unflattened = transform.unflatten(flattened);

      expect(unflattened).toEqual(original);
    });
  });

  // ==========================================================================
  // Flatten with Schema
  // ==========================================================================

  describe('flatten with schema', () => {
    it('should flatten according to schema', () => {
      const schema: InferredSchema = {
        fields: [
          { name: '_id', type: 'string', clickhouseType: 'String', nullable: false },
          { name: 'count', type: 'number', clickhouseType: 'Int32', nullable: false },
        ],
      };

      const doc = {
        _id: '123',
        count: 42,
        extraField: 'ignored',
      };

      const flattened = transform.flattenWithSchema(doc, schema);

      expect(flattened._id).toBe('123');
      expect(flattened.count).toBe(42);
      expect(flattened.extraField).toBeUndefined();
    });

    it('should convert types according to schema', () => {
      const schema: InferredSchema = {
        fields: [
          { name: 'count', type: 'number', clickhouseType: 'Int32', nullable: false },
        ],
      };

      const doc = {
        count: '42', // String that should be converted to number
      };

      const flattened = transform.flattenWithSchema(doc, schema);

      expect(flattened.count).toBe(42);
      expect(typeof flattened.count).toBe('number');
    });

    it('should handle nullable fields', () => {
      const schema: InferredSchema = {
        fields: [
          { name: 'value', type: 'string', clickhouseType: 'Nullable(String)', nullable: true },
        ],
      };

      const doc = {
        value: null,
      };

      const flattened = transform.flattenWithSchema(doc, schema);

      expect(flattened.value).toBeNull();
    });

    it('should use default for missing non-nullable fields', () => {
      const schema: InferredSchema = {
        fields: [
          { name: 'count', type: 'number', clickhouseType: 'Int32', nullable: false },
        ],
      };

      const doc = {};

      const flattened = transform.flattenWithSchema(doc, schema);

      expect(flattened.count).toBe(0); // Default for non-nullable number
    });
  });

  // ==========================================================================
  // Schema Inference
  // ==========================================================================

  describe('schema inference', () => {
    it('should infer schema from documents', () => {
      const documents = [
        { _id: '1', name: 'Alice', age: 30 },
        { _id: '2', name: 'Bob', age: 25 },
      ];

      const schema = transform.inferSchema(documents);

      expect(schema.fields).toContainEqual(
        expect.objectContaining({ name: '_id', type: 'string' })
      );
      expect(schema.fields).toContainEqual(
        expect.objectContaining({ name: 'name', type: 'string' })
      );
      expect(schema.fields).toContainEqual(
        expect.objectContaining({ name: 'age', type: 'number' })
      );
    });

    it('should infer nullable from missing fields', () => {
      const documents = [
        { _id: '1', name: 'Alice' },
        { _id: '2', name: 'Bob', nickname: 'Bobby' },
      ];

      const schema = transform.inferSchema(documents);

      const nicknameField = schema.fields.find((f) => f.name === 'nickname');
      expect(nicknameField?.nullable).toBe(true);
    });

    it('should infer array type', () => {
      const documents = [{ _id: '1', tags: ['a', 'b', 'c'] }];

      const schema = transform.inferSchema(documents);

      const tagsField = schema.fields.find((f) => f.name === 'tags');
      expect(tagsField?.type).toBe('array');
      expect(tagsField?.clickhouseType).toContain('Array');
    });

    it('should infer nested object schema', () => {
      const documents = [
        {
          _id: '1',
          address: { street: '123 Main', city: 'NYC' },
        },
      ];

      const schema = transform.inferSchema(documents);

      const addressField = schema.fields.find((f) => f.name === 'address');
      expect(addressField?.type).toBe('object');
      expect(addressField?.nested).toBeDefined();
      expect(addressField?.nested?.fields).toContainEqual(
        expect.objectContaining({ name: 'street', type: 'string' })
      );
    });

    it('should map to appropriate ClickHouse types', () => {
      const documents = [
        {
          stringField: 'hello',
          intField: 42,
          floatField: 3.14,
          boolField: true,
          dateField: new Date(),
        },
      ];

      const schema = transform.inferSchema(documents);

      expect(schema.fields.find((f) => f.name === 'stringField')?.clickhouseType).toBe('String');
      expect(schema.fields.find((f) => f.name === 'intField')?.clickhouseType).toBe('Int64');
      expect(schema.fields.find((f) => f.name === 'floatField')?.clickhouseType).toBe('Float64');
      expect(schema.fields.find((f) => f.name === 'boolField')?.clickhouseType).toBe('Bool');
      expect(schema.fields.find((f) => f.name === 'dateField')?.clickhouseType).toBe('DateTime64(3)');
    });
  });
});

// =============================================================================
// SQL Generation Tests
// =============================================================================

describe('SQL Generation', () => {
  let transform: PipelineTransform;

  beforeEach(() => {
    transform = new PipelineTransform();
  });

  // ==========================================================================
  // Generate INSERT SQL
  // ==========================================================================

  describe('generate INSERT SQL', () => {
    it('should generate INSERT for insert event', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'insert',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
        fullDocument: { _id: '123', name: 'Alice', age: 30 },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const result = transform.generateSQL(event, options);

      expect(result.sql).toContain('INSERT INTO analytics.users');
      expect(result.operationType).toBe('INSERT');
      expect(result.affectedTable).toBe('analytics.users');
    });

    it('should include all document fields in INSERT', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'insert',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
        fullDocument: { _id: '123', name: 'Alice', email: 'alice@example.com' },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const result = transform.generateSQL(event, options);

      expect(result.sql).toContain('_id');
      expect(result.sql).toContain('name');
      expect(result.sql).toContain('email');
      expect(result.params).toContain('123');
      expect(result.params).toContain('Alice');
      expect(result.params).toContain('alice@example.com');
    });

    it('should only include specified columns', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'insert',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
        fullDocument: { _id: '123', name: 'Alice', email: 'alice@example.com', internal: 'secret' },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
        columns: ['_id', 'name', 'email'],
      };

      const result = transform.generateSQL(event, options);

      expect(result.sql).toContain('_id');
      expect(result.sql).toContain('name');
      expect(result.sql).toContain('email');
      expect(result.sql).not.toContain('internal');
    });

    it('should use parameterized queries', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'insert',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
        fullDocument: { _id: '123', name: "O'Brien" },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const result = transform.generateSQL(event, options);

      // Should use placeholders, not direct values (prevents SQL injection)
      expect(result.sql).toContain('?');
      expect(result.params).toContain("O'Brien");
    });

    it('should generate UPSERT when configured', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'insert',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
        fullDocument: { _id: '123', name: 'Alice' },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'upsert',
        onConflict: 'update',
      };

      const result = transform.generateSQL(event, options);

      // ClickHouse uses INSERT with ON DUPLICATE KEY or ReplacingMergeTree
      expect(result.sql).toMatch(/INSERT|REPLACE/);
    });
  });

  // ==========================================================================
  // Generate UPDATE SQL
  // ==========================================================================

  describe('generate UPDATE SQL', () => {
    it('should generate UPDATE for update event', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'update',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
        updateDescription: {
          updatedFields: { name: 'Alice Updated' },
          removedFields: [],
        },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const result = transform.generateSQL(event, options);

      expect(result.operationType).toBe('UPDATE');
      expect(result.sql).toContain('ALTER TABLE');
      expect(result.sql).toContain('UPDATE');
    });

    it('should include only updated fields', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'update',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
        updateDescription: {
          updatedFields: { name: 'New Name', age: 31 },
          removedFields: [],
        },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const result = transform.generateSQL(event, options);

      expect(result.sql).toContain('name');
      expect(result.sql).toContain('age');
      expect(result.params).toContain('New Name');
      expect(result.params).toContain(31);
    });

    it('should handle removed fields', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'update',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
        updateDescription: {
          updatedFields: {},
          removedFields: ['nickname', 'oldField'],
        },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const result = transform.generateSQL(event, options);

      // Removed fields should be set to NULL or default
      expect(result.sql).toContain('nickname');
      expect(result.sql).toContain('oldField');
    });

    it('should use fullDocument for replace operation', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'replace',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
        fullDocument: { _id: '123', name: 'Replaced', email: 'new@example.com' },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'replace',
      };

      const result = transform.generateSQL(event, options);

      expect(result.params).toContain('Replaced');
      expect(result.params).toContain('new@example.com');
    });
  });

  // ==========================================================================
  // Generate DELETE SQL
  // ==========================================================================

  describe('generate DELETE SQL', () => {
    it('should generate DELETE for delete event', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'delete',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const result = transform.generateSQL(event, options);

      expect(result.operationType).toBe('DELETE');
      expect(result.sql).toContain('ALTER TABLE');
      expect(result.sql).toContain('DELETE');
    });

    it('should include WHERE clause with document key', () => {
      const event: CDCEvent = {
        _id: 'event-1',
        operationType: 'delete',
        clusterTime: new Date(),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '123' },
      };

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const result = transform.generateSQL(event, options);

      expect(result.sql).toContain('WHERE');
      expect(result.sql).toContain('_id');
      expect(result.params).toContain('123');
    });
  });

  // ==========================================================================
  // Generate Batch SQL
  // ==========================================================================

  describe('generate batch SQL', () => {
    it('should generate SQL for batch of events', () => {
      const events: CDCEvent[] = [
        {
          _id: 'event-1',
          operationType: 'insert',
          clusterTime: new Date(),
          ns: { db: 'testdb', coll: 'users' },
          documentKey: { _id: '1' },
          fullDocument: { _id: '1', name: 'Alice' },
        },
        {
          _id: 'event-2',
          operationType: 'insert',
          clusterTime: new Date(),
          ns: { db: 'testdb', coll: 'users' },
          documentKey: { _id: '2' },
          fullDocument: { _id: '2', name: 'Bob' },
        },
      ];

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const results = transform.generateBatchSQL(events, options);

      expect(results).toHaveLength(2);
      expect(results[0].params).toContain('Alice');
      expect(results[1].params).toContain('Bob');
    });

    it('should handle mixed operation types in batch', () => {
      const events: CDCEvent[] = [
        {
          _id: 'event-1',
          operationType: 'insert',
          clusterTime: new Date(),
          ns: { db: 'testdb', coll: 'users' },
          documentKey: { _id: '1' },
          fullDocument: { _id: '1', name: 'Alice' },
        },
        {
          _id: 'event-2',
          operationType: 'update',
          clusterTime: new Date(),
          ns: { db: 'testdb', coll: 'users' },
          documentKey: { _id: '1' },
          updateDescription: { updatedFields: { name: 'Alice Updated' }, removedFields: [] },
        },
        {
          _id: 'event-3',
          operationType: 'delete',
          clusterTime: new Date(),
          ns: { db: 'testdb', coll: 'users' },
          documentKey: { _id: '2' },
        },
      ];

      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const results = transform.generateBatchSQL(events, options);

      expect(results[0].operationType).toBe('INSERT');
      expect(results[1].operationType).toBe('UPDATE');
      expect(results[2].operationType).toBe('DELETE');
    });

    it('should handle empty batch', () => {
      const options: SQLGenerationOptions = {
        targetTable: 'users',
        database: 'analytics',
        insertMode: 'insert',
      };

      const results = transform.generateBatchSQL([], options);

      expect(results).toHaveLength(0);
    });
  });
});

// =============================================================================
// Document Partitioning Tests
// =============================================================================

describe('DocumentPartitioner', () => {
  // ==========================================================================
  // Time-based Partitioning
  // ==========================================================================

  describe('time-based partitioning', () => {
    it('should partition by day', () => {
      const partitioner = new DocumentPartitioner({
        type: 'time',
        timeColumn: 'createdAt',
        timeGranularity: 'day',
      });

      const doc = {
        _id: '123',
        createdAt: new Date('2024-01-15T10:30:00Z'),
      };

      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toBe('2024-01-15');
      expect(partition.partitionPath).toContain('2024-01-15');
    });

    it('should partition by hour', () => {
      const partitioner = new DocumentPartitioner({
        type: 'time',
        timeColumn: 'timestamp',
        timeGranularity: 'hour',
      });

      const doc = {
        timestamp: new Date('2024-01-15T14:30:00Z'),
      };

      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toBe('2024-01-15-14');
      expect(partition.partitionValues.hour).toBe(14);
    });

    it('should partition by month', () => {
      const partitioner = new DocumentPartitioner({
        type: 'time',
        timeColumn: 'createdAt',
        timeGranularity: 'month',
      });

      const doc = {
        createdAt: new Date('2024-03-15'),
      };

      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toBe('2024-03');
      expect(partition.partitionValues.year).toBe('2024');
      expect(partition.partitionValues.month).toBe('03');
    });

    it('should partition by week', () => {
      const partitioner = new DocumentPartitioner({
        type: 'time',
        timeColumn: 'eventDate',
        timeGranularity: 'week',
      });

      const doc = {
        eventDate: new Date('2024-01-15'), // Week 3 of 2024
      };

      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toContain('2024-W');
    });

    it('should generate partition path for R2 storage', () => {
      const partitioner = new DocumentPartitioner({
        type: 'time',
        timeColumn: 'createdAt',
        timeGranularity: 'day',
      });

      const doc = {
        createdAt: new Date('2024-01-15'),
      };

      const path = partitioner.getPartitionPath(doc);

      expect(path).toBe('year=2024/month=01/day=15');
    });

    it('should handle missing time column', () => {
      const partitioner = new DocumentPartitioner({
        type: 'time',
        timeColumn: 'createdAt',
        timeGranularity: 'day',
      });

      const doc = {
        _id: '123',
        name: 'Test',
      };

      // Should use current time as fallback
      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toBeDefined();
    });
  });

  // ==========================================================================
  // Hash-based Partitioning
  // ==========================================================================

  describe('hash-based partitioning', () => {
    it('should partition by hash of column', () => {
      const partitioner = new DocumentPartitioner({
        type: 'hash',
        hashColumns: ['_id'],
        hashBuckets: 16,
      });

      const doc = {
        _id: '123',
        name: 'Test',
      };

      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toMatch(/^bucket_\d+$/);
      expect(partition.partitionValues.bucket).toBeGreaterThanOrEqual(0);
      expect(partition.partitionValues.bucket).toBeLessThan(16);
    });

    it('should produce consistent hash for same value', () => {
      const partitioner = new DocumentPartitioner({
        type: 'hash',
        hashColumns: ['userId'],
        hashBuckets: 8,
      });

      const doc1 = { userId: 'user-123' };
      const doc2 = { userId: 'user-123' };

      const partition1 = partitioner.getPartition(doc1);
      const partition2 = partitioner.getPartition(doc2);

      expect(partition1.partitionKey).toBe(partition2.partitionKey);
    });

    it('should distribute evenly across buckets', () => {
      const partitioner = new DocumentPartitioner({
        type: 'hash',
        hashColumns: ['_id'],
        hashBuckets: 4,
      });

      const bucketCounts: Record<string, number> = {};

      for (let i = 0; i < 1000; i++) {
        const doc = { _id: `doc-${i}` };
        const partition = partitioner.getPartition(doc);
        bucketCounts[partition.partitionKey] = (bucketCounts[partition.partitionKey] || 0) + 1;
      }

      // Each bucket should have roughly 250 documents (+/- 20%)
      const values = Object.values(bucketCounts);
      expect(values.length).toBe(4);
      values.forEach((count) => {
        expect(count).toBeGreaterThan(150);
        expect(count).toBeLessThan(350);
      });
    });

    it('should hash multiple columns', () => {
      const partitioner = new DocumentPartitioner({
        type: 'hash',
        hashColumns: ['database', 'collection'],
        hashBuckets: 8,
      });

      const doc = {
        database: 'testdb',
        collection: 'users',
      };

      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toBeDefined();
    });
  });

  // ==========================================================================
  // Range-based Partitioning
  // ==========================================================================

  describe('range-based partitioning', () => {
    it('should partition by range', () => {
      const partitioner = new DocumentPartitioner({
        type: 'range',
        rangeColumn: 'score',
        rangeBoundaries: [0, 25, 50, 75, 100],
      });

      const doc = { score: 42 };

      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toBe('range_25_50');
      expect(partition.partitionValues.rangeStart).toBe(25);
      expect(partition.partitionValues.rangeEnd).toBe(50);
    });

    it('should handle values at boundaries', () => {
      const partitioner = new DocumentPartitioner({
        type: 'range',
        rangeColumn: 'value',
        rangeBoundaries: [0, 100, 200],
      });

      const docAt0 = { value: 0 };
      const docAt100 = { value: 100 };

      const partition0 = partitioner.getPartition(docAt0);
      const partition100 = partitioner.getPartition(docAt100);

      expect(partition0.partitionKey).toBe('range_0_100');
      expect(partition100.partitionKey).toBe('range_100_200');
    });

    it('should handle values below first boundary', () => {
      const partitioner = new DocumentPartitioner({
        type: 'range',
        rangeColumn: 'value',
        rangeBoundaries: [10, 20, 30],
      });

      const doc = { value: 5 };

      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toBe('range_below_10');
    });

    it('should handle values above last boundary', () => {
      const partitioner = new DocumentPartitioner({
        type: 'range',
        rangeColumn: 'value',
        rangeBoundaries: [10, 20, 30],
      });

      const doc = { value: 50 };

      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toBe('range_above_30');
    });
  });

  // ==========================================================================
  // Composite Partitioning
  // ==========================================================================

  describe('composite partitioning', () => {
    it('should combine time and hash partitioning', () => {
      const partitioner = new DocumentPartitioner({
        type: 'composite',
        timeColumn: 'createdAt',
        timeGranularity: 'day',
        hashColumns: ['userId'],
        hashBuckets: 4,
      });

      const doc = {
        createdAt: new Date('2024-01-15'),
        userId: 'user-123',
      };

      const partition = partitioner.getPartition(doc);

      expect(partition.partitionKey).toContain('2024-01-15');
      expect(partition.partitionKey).toContain('bucket_');
      expect(partition.partitionPath).toContain('year=2024');
    });
  });

  // ==========================================================================
  // Partition DDL Generation
  // ==========================================================================

  describe('partition DDL generation', () => {
    it('should generate partition DDL for time partitioning', () => {
      const partitioner = new DocumentPartitioner({
        type: 'time',
        timeColumn: 'createdAt',
        timeGranularity: 'day',
      });

      const ddl = partitioner.generatePartitionDDL('cdc_events');

      expect(ddl).toContain('PARTITION BY');
      expect(ddl).toContain('toYYYYMMDD');
    });

    it('should generate partition DDL for hash partitioning', () => {
      const partitioner = new DocumentPartitioner({
        type: 'hash',
        hashColumns: ['_id'],
        hashBuckets: 16,
      });

      const ddl = partitioner.generatePartitionDDL('cdc_events');

      expect(ddl).toContain('PARTITION BY');
      expect(ddl).toContain('modulo');
    });
  });

  // ==========================================================================
  // Partition Listing and Pruning
  // ==========================================================================

  describe('partition listing and pruning', () => {
    it('should list partitions in date range', () => {
      const partitioner = new DocumentPartitioner({
        type: 'time',
        timeColumn: 'createdAt',
        timeGranularity: 'day',
      });

      const partitions = partitioner.listPartitions(
        new Date('2024-01-01'),
        new Date('2024-01-05')
      );

      expect(partitions).toHaveLength(5);
      expect(partitions).toContain('2024-01-01');
      expect(partitions).toContain('2024-01-05');
    });

    it('should generate pruning commands for old partitions', () => {
      const partitioner = new DocumentPartitioner({
        type: 'time',
        timeColumn: 'createdAt',
        timeGranularity: 'day',
      });

      const pruneCommands = partitioner.pruneOldPartitions(new Date('2024-01-10'));

      expect(pruneCommands.length).toBeGreaterThan(0);
      pruneCommands.forEach((cmd) => {
        expect(cmd).toContain('DROP PARTITION');
      });
    });
  });
});

// =============================================================================
// CDC Transform Pipeline Tests
// =============================================================================

describe('CDCTransformPipeline', () => {
  let transform: PipelineTransform;
  let partitioner: DocumentPartitioner;
  let pipeline: CDCTransformPipeline;

  beforeEach(() => {
    transform = new PipelineTransform();
    partitioner = new DocumentPartitioner({
      type: 'time',
      timeColumn: 'clusterTime',
      timeGranularity: 'day',
    });
    pipeline = new CDCTransformPipeline(transform, partitioner);
  });

  it('should process CDC event end-to-end', async () => {
    const event: CDCEvent = {
      _id: 'event-1',
      operationType: 'insert',
      clusterTime: new Date('2024-01-15'),
      ns: { db: 'testdb', coll: 'users' },
      documentKey: { _id: '123' },
      fullDocument: { _id: '123', name: 'Alice', nested: { value: 42 } },
    };

    const result = await pipeline.process(event);

    expect(result.flattenedDoc).toBeDefined();
    expect(result.flattenedDoc['nested.value']).toBe(42);
    expect(result.partition.partitionKey).toBe('2024-01-15');
    expect(result.sql.operationType).toBe('INSERT');
  });

  it('should process batch of CDC events', async () => {
    const events: CDCEvent[] = [
      {
        _id: 'event-1',
        operationType: 'insert',
        clusterTime: new Date('2024-01-15'),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '1' },
        fullDocument: { _id: '1', name: 'Alice' },
      },
      {
        _id: 'event-2',
        operationType: 'insert',
        clusterTime: new Date('2024-01-15'),
        ns: { db: 'testdb', coll: 'users' },
        documentKey: { _id: '2' },
        fullDocument: { _id: '2', name: 'Bob' },
      },
    ];

    const results = await pipeline.processBatch(events);

    expect(results).toHaveLength(2);
    expect(results[0].flattenedDoc.name).toBe('Alice');
    expect(results[1].flattenedDoc.name).toBe('Bob');
  });
});
