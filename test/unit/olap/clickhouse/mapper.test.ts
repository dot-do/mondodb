/**
 * ClickHouse Result Mapper Tests (TDD - RED phase)
 *
 * Tests for mapping ClickHouse JSON responses to BSON documents.
 * Covers type conversion, nested objects, arrays, and type preservation
 * for MongoDB-compatible data structures.
 *
 * Issue: mongo.do-vyf4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectId } from '../../../../src/types/objectid';
import {
  ClickHouseResultMapper,
  mapClickHouseToBSON,
  mapBSONToClickHouse,
  convertClickHouseType,
  convertBSONType,
  type ClickHouseRow,
  type ClickHouseColumnMeta,
  type BSONDocument,
  type TypeMappingOptions,
} from '../../../../src/olap/clickhouse/mapper';

// ============================================================================
// Result Mapper Tests
// ============================================================================

describe('ClickHouse Result Mapper', () => {
  let mapper: ClickHouseResultMapper;

  beforeEach(() => {
    mapper = new ClickHouseResultMapper();
  });

  // ==========================================================================
  // Basic Type Conversion Tests
  // ==========================================================================

  describe('basic type conversion', () => {
    describe('string types', () => {
      it('should map ClickHouse String to BSON string', () => {
        const row: ClickHouseRow = { name: 'Alice' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'name', type: 'String' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.name).toBe('Alice');
        expect(typeof result.name).toBe('string');
      });

      it('should map ClickHouse FixedString to BSON string', () => {
        const row: ClickHouseRow = { code: 'ABC123' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'code', type: 'FixedString(6)' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.code).toBe('ABC123');
      });

      it('should handle empty strings', () => {
        const row: ClickHouseRow = { value: '' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'value', type: 'String' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.value).toBe('');
      });

      it('should handle Unicode strings', () => {
        const row: ClickHouseRow = { text: 'Hello, World! Special chars' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'text', type: 'String' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.text).toBe('Hello, World! Special chars');
      });
    });

    describe('numeric types', () => {
      it('should map ClickHouse UInt8 to BSON number', () => {
        const row: ClickHouseRow = { age: 25 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'age', type: 'UInt8' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.age).toBe(25);
        expect(typeof result.age).toBe('number');
      });

      it('should map ClickHouse UInt16/32/64 to BSON number', () => {
        const row: ClickHouseRow = { small: 100, medium: 10000, large: 1000000 };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'small', type: 'UInt16' },
          { name: 'medium', type: 'UInt32' },
          { name: 'large', type: 'UInt64' },
        ];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.small).toBe(100);
        expect(result.medium).toBe(10000);
        expect(result.large).toBe(1000000);
      });

      it('should map ClickHouse Int8/16/32/64 to BSON number', () => {
        const row: ClickHouseRow = { a: -10, b: -1000, c: -100000, d: -10000000 };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'a', type: 'Int8' },
          { name: 'b', type: 'Int16' },
          { name: 'c', type: 'Int32' },
          { name: 'd', type: 'Int64' },
        ];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.a).toBe(-10);
        expect(result.d).toBe(-10000000);
      });

      it('should map ClickHouse Float32/64 to BSON number', () => {
        const row: ClickHouseRow = { price: 99.99, ratio: 0.123456789 };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'price', type: 'Float32' },
          { name: 'ratio', type: 'Float64' },
        ];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.price).toBeCloseTo(99.99);
        expect(result.ratio).toBeCloseTo(0.123456789);
      });

      it('should map ClickHouse Decimal to BSON Decimal128', () => {
        const row: ClickHouseRow = { amount: '12345.67' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'amount', type: 'Decimal(18, 2)' }];

        const result = mapClickHouseToBSON(row, meta);

        // Should be converted to BSON Decimal128
        expect(result.amount).toBeDefined();
        expect(result.amount.toString()).toBe('12345.67');
      });

      it('should handle large UInt64 values as BSON Long', () => {
        const row: ClickHouseRow = { bigValue: '9223372036854775807' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'bigValue', type: 'UInt64' }];

        const result = mapClickHouseToBSON(row, meta);

        // Large values should be converted to BSON Long
        expect(result.bigValue).toBeDefined();
        expect(result.bigValue.toString()).toBe('9223372036854775807');
      });
    });

    describe('boolean type', () => {
      it('should map ClickHouse Bool to BSON boolean', () => {
        const row: ClickHouseRow = { active: true, deleted: false };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'active', type: 'Bool' },
          { name: 'deleted', type: 'Bool' },
        ];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.active).toBe(true);
        expect(result.deleted).toBe(false);
      });

      it('should map ClickHouse UInt8(0/1) to BSON boolean when configured', () => {
        const row: ClickHouseRow = { flag: 1 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'flag', type: 'UInt8' }];

        const result = mapClickHouseToBSON(row, meta, { treatUInt8AsBool: true });

        expect(result.flag).toBe(true);
      });
    });

    describe('date/time types', () => {
      it('should map ClickHouse Date to BSON Date', () => {
        const row: ClickHouseRow = { created: '2024-01-15' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'created', type: 'Date' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.created).toBeInstanceOf(Date);
        expect(result.created.toISOString()).toBe('2024-01-15T00:00:00.000Z');
      });

      it('should map ClickHouse Date32 to BSON Date', () => {
        const row: ClickHouseRow = { eventDate: '2024-06-30' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'eventDate', type: 'Date32' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.eventDate).toBeInstanceOf(Date);
      });

      it('should map ClickHouse DateTime to BSON Date', () => {
        const row: ClickHouseRow = { timestamp: '2024-01-15 10:30:45' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'timestamp', type: 'DateTime' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.timestamp).toBeInstanceOf(Date);
      });

      it('should map ClickHouse DateTime64 to BSON Date with milliseconds', () => {
        const row: ClickHouseRow = { precise_time: '2024-01-15 10:30:45.123' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'precise_time', type: 'DateTime64(3)' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.precise_time).toBeInstanceOf(Date);
        expect(result.precise_time.getMilliseconds()).toBe(123);
      });

      it('should handle DateTime with timezone', () => {
        const row: ClickHouseRow = { event_time: '2024-01-15 10:30:45' };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'event_time', type: "DateTime('UTC')" },
        ];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.event_time).toBeInstanceOf(Date);
      });
    });

    describe('UUID type', () => {
      it('should map ClickHouse UUID to BSON UUID', () => {
        const row: ClickHouseRow = { id: '550e8400-e29b-41d4-a716-446655440000' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'id', type: 'UUID' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.id).toBeDefined();
        expect(result.id.toString()).toBe('550e8400-e29b-41d4-a716-446655440000');
      });
    });

    describe('null handling', () => {
      it('should map Nullable(String) null to BSON null', () => {
        const row: ClickHouseRow = { nickname: null };
        const meta: ClickHouseColumnMeta[] = [{ name: 'nickname', type: 'Nullable(String)' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.nickname).toBeNull();
      });

      it('should map Nullable(Int32) null to BSON null', () => {
        const row: ClickHouseRow = { score: null };
        const meta: ClickHouseColumnMeta[] = [{ name: 'score', type: 'Nullable(Int32)' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.score).toBeNull();
      });

      it('should map Nullable value to proper type when not null', () => {
        const row: ClickHouseRow = { value: 42 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'value', type: 'Nullable(Int32)' }];

        const result = mapClickHouseToBSON(row, meta);

        expect(result.value).toBe(42);
      });
    });
  });

  // ==========================================================================
  // Nested Object Tests
  // ==========================================================================

  describe('nested objects', () => {
    it('should map ClickHouse Tuple to BSON embedded document', () => {
      const row: ClickHouseRow = {
        address: { street: '123 Main St', city: 'New York', zip: '10001' },
      };
      const meta: ClickHouseColumnMeta[] = [
        { name: 'address', type: 'Tuple(street String, city String, zip String)' },
      ];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.address).toEqual({
        street: '123 Main St',
        city: 'New York',
        zip: '10001',
      });
    });

    it('should map ClickHouse Named Tuple to BSON embedded document', () => {
      const row: ClickHouseRow = {
        point: { x: 10.5, y: 20.3 },
      };
      const meta: ClickHouseColumnMeta[] = [
        { name: 'point', type: 'Tuple(x Float64, y Float64)' },
      ];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.point.x).toBeCloseTo(10.5);
      expect(result.point.y).toBeCloseTo(20.3);
    });

    it('should map nested Tuples', () => {
      const row: ClickHouseRow = {
        location: {
          address: { street: 'Main St', number: 123 },
          coordinates: { lat: 40.7128, lng: -74.006 },
        },
      };
      const meta: ClickHouseColumnMeta[] = [
        {
          name: 'location',
          type: 'Tuple(address Tuple(street String, number UInt32), coordinates Tuple(lat Float64, lng Float64))',
        },
      ];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.location.address.street).toBe('Main St');
      expect(result.location.coordinates.lat).toBeCloseTo(40.7128);
    });

    it('should map ClickHouse Object(JSON) to BSON document', () => {
      const row: ClickHouseRow = {
        metadata: {
          source: 'api',
          version: 2,
          tags: ['important', 'verified'],
          nested: { level: 1 },
        },
      };
      const meta: ClickHouseColumnMeta[] = [
        { name: 'metadata', type: 'Object(Nullable(String))' },
      ];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.metadata.source).toBe('api');
      expect(result.metadata.tags).toEqual(['important', 'verified']);
      expect(result.metadata.nested.level).toBe(1);
    });

    it('should map deeply nested JSON objects', () => {
      const row: ClickHouseRow = {
        config: {
          level1: {
            level2: {
              level3: {
                value: 'deep',
              },
            },
          },
        },
      };
      const meta: ClickHouseColumnMeta[] = [{ name: 'config', type: 'String' }];

      // When type is String but value is object, should parse as JSON
      const result = mapClickHouseToBSON(row, meta);

      expect(result.config.level1.level2.level3.value).toBe('deep');
    });

    it('should preserve object key order', () => {
      const row: ClickHouseRow = {
        ordered: { z: 1, a: 2, m: 3 },
      };
      const meta: ClickHouseColumnMeta[] = [{ name: 'ordered', type: 'Object(Nullable(String))' }];

      const result = mapClickHouseToBSON(row, meta);
      const keys = Object.keys(result.ordered);

      // BSON should preserve insertion order
      expect(keys).toEqual(['z', 'a', 'm']);
    });
  });

  // ==========================================================================
  // Array Tests
  // ==========================================================================

  describe('arrays', () => {
    it('should map ClickHouse Array(String) to BSON array', () => {
      const row: ClickHouseRow = { tags: ['javascript', 'typescript', 'nodejs'] };
      const meta: ClickHouseColumnMeta[] = [{ name: 'tags', type: 'Array(String)' }];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.tags).toEqual(['javascript', 'typescript', 'nodejs']);
      expect(Array.isArray(result.tags)).toBe(true);
    });

    it('should map ClickHouse Array(Int32) to BSON array', () => {
      const row: ClickHouseRow = { scores: [85, 92, 78, 90] };
      const meta: ClickHouseColumnMeta[] = [{ name: 'scores', type: 'Array(Int32)' }];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.scores).toEqual([85, 92, 78, 90]);
    });

    it('should map ClickHouse Array(Float64) to BSON array', () => {
      const row: ClickHouseRow = { values: [1.1, 2.2, 3.3] };
      const meta: ClickHouseColumnMeta[] = [{ name: 'values', type: 'Array(Float64)' }];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.values[0]).toBeCloseTo(1.1);
    });

    it('should map nested arrays', () => {
      const row: ClickHouseRow = {
        matrix: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
      };
      const meta: ClickHouseColumnMeta[] = [{ name: 'matrix', type: 'Array(Array(Int32))' }];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.matrix).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]);
    });

    it('should map Array of Tuples to BSON array of documents', () => {
      const row: ClickHouseRow = {
        items: [
          { name: 'Item 1', price: 10.99 },
          { name: 'Item 2', price: 20.5 },
        ],
      };
      const meta: ClickHouseColumnMeta[] = [
        { name: 'items', type: 'Array(Tuple(name String, price Float64))' },
      ];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.items[0].name).toBe('Item 1');
      expect(result.items[1].price).toBeCloseTo(20.5);
    });

    it('should handle empty arrays', () => {
      const row: ClickHouseRow = { emptyList: [] };
      const meta: ClickHouseColumnMeta[] = [{ name: 'emptyList', type: 'Array(String)' }];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.emptyList).toEqual([]);
    });

    it('should handle arrays with null elements', () => {
      const row: ClickHouseRow = { values: [1, null, 3, null, 5] };
      const meta: ClickHouseColumnMeta[] = [{ name: 'values', type: 'Array(Nullable(Int32))' }];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.values).toEqual([1, null, 3, null, 5]);
    });
  });

  // ==========================================================================
  // Map Type Tests
  // ==========================================================================

  describe('map types', () => {
    it('should map ClickHouse Map(String, String) to BSON document', () => {
      const row: ClickHouseRow = {
        properties: { color: 'red', size: 'large', material: 'cotton' },
      };
      const meta: ClickHouseColumnMeta[] = [
        { name: 'properties', type: 'Map(String, String)' },
      ];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.properties).toEqual({
        color: 'red',
        size: 'large',
        material: 'cotton',
      });
    });

    it('should map ClickHouse Map(String, Int32) to BSON document', () => {
      const row: ClickHouseRow = {
        counts: { views: 1000, likes: 50, shares: 25 },
      };
      const meta: ClickHouseColumnMeta[] = [{ name: 'counts', type: 'Map(String, Int32)' }];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.counts.views).toBe(1000);
    });

    it('should map nested Maps', () => {
      const row: ClickHouseRow = {
        nested: {
          level1: { a: 1, b: 2 },
          level2: { c: 3, d: 4 },
        },
      };
      const meta: ClickHouseColumnMeta[] = [
        { name: 'nested', type: 'Map(String, Map(String, Int32))' },
      ];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.nested.level1.a).toBe(1);
    });
  });

  // ==========================================================================
  // Type Preservation Tests
  // ==========================================================================

  describe('type preservation', () => {
    it('should preserve ObjectId when mapped from string', () => {
      const objectIdStr = '507f1f77bcf86cd799439011';
      const row: ClickHouseRow = { _id: objectIdStr };
      const meta: ClickHouseColumnMeta[] = [{ name: '_id', type: 'String' }];

      const result = mapClickHouseToBSON(row, meta, { preserveObjectId: true });

      expect(result._id).toBeInstanceOf(ObjectId);
      expect(result._id.toString()).toBe(objectIdStr);
    });

    it('should preserve Date when mapped from timestamp', () => {
      const row: ClickHouseRow = { createdAt: 1705312800000 };
      const meta: ClickHouseColumnMeta[] = [{ name: 'createdAt', type: 'UInt64' }];

      const result = mapClickHouseToBSON(row, meta, { treatTimestampAsDate: true });

      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should preserve Int32 type when possible', () => {
      const row: ClickHouseRow = { count: 42 };
      const meta: ClickHouseColumnMeta[] = [{ name: 'count', type: 'Int32' }];

      const result = mapClickHouseToBSON(row, meta);

      // Should stay as number, not converted to Int32 BSON type unless requested
      expect(typeof result.count).toBe('number');
    });

    it('should preserve binary data', () => {
      const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      const row: ClickHouseRow = { data: Buffer.from(binaryData).toString('base64') };
      const meta: ClickHouseColumnMeta[] = [{ name: 'data', type: 'String' }];

      const result = mapClickHouseToBSON(row, meta, { preserveBinary: true });

      // Should be converted to BSON Binary
      expect(result.data).toBeDefined();
    });

    it('should preserve precision for Decimal types', () => {
      const row: ClickHouseRow = { amount: '123456789.123456789' };
      const meta: ClickHouseColumnMeta[] = [{ name: 'amount', type: 'Decimal(38, 9)' }];

      const result = mapClickHouseToBSON(row, meta);

      expect(result.amount.toString()).toBe('123456789.123456789');
    });

    it('should handle mixed type arrays', () => {
      const row: ClickHouseRow = {
        mixed: [1, 'two', true, null, { nested: 'value' }],
      };
      const meta: ClickHouseColumnMeta[] = [{ name: 'mixed', type: 'Array(String)' }];

      // When stored as JSON in String type
      const result = mapClickHouseToBSON(row, meta);

      expect(result.mixed[0]).toBe(1);
      expect(result.mixed[1]).toBe('two');
      expect(result.mixed[2]).toBe(true);
      expect(result.mixed[3]).toBeNull();
      expect(result.mixed[4].nested).toBe('value');
    });
  });

  // ==========================================================================
  // BSON to ClickHouse Mapping Tests
  // ==========================================================================

  describe('BSON to ClickHouse mapping', () => {
    it('should map BSON ObjectId to ClickHouse String', () => {
      const doc: BSONDocument = { _id: new ObjectId() };

      const result = mapBSONToClickHouse(doc);

      expect(typeof result._id).toBe('string');
      expect(result._id).toHaveLength(24);
    });

    it('should map BSON Date to ClickHouse DateTime64 string', () => {
      const now = new Date('2024-01-15T10:30:45.123Z');
      const doc: BSONDocument = { timestamp: now };

      const result = mapBSONToClickHouse(doc);

      expect(result.timestamp).toBe('2024-01-15 10:30:45.123');
    });

    it('should map BSON embedded document to ClickHouse JSON', () => {
      const doc: BSONDocument = {
        profile: {
          name: 'Alice',
          age: 30,
          settings: { theme: 'dark' },
        },
      };

      const result = mapBSONToClickHouse(doc);

      expect(result.profile).toEqual({
        name: 'Alice',
        age: 30,
        settings: { theme: 'dark' },
      });
    });

    it('should map BSON array to ClickHouse Array', () => {
      const doc: BSONDocument = { tags: ['a', 'b', 'c'] };

      const result = mapBSONToClickHouse(doc);

      expect(result.tags).toEqual(['a', 'b', 'c']);
    });

    it('should preserve null values', () => {
      const doc: BSONDocument = { value: null };

      const result = mapBSONToClickHouse(doc);

      expect(result.value).toBeNull();
    });

    it('should handle undefined by omitting field', () => {
      const doc: BSONDocument = { value: undefined };

      const result = mapBSONToClickHouse(doc);

      expect('value' in result).toBe(false);
    });
  });

  // ==========================================================================
  // Type Conversion Helper Tests
  // ==========================================================================

  describe('convertClickHouseType', () => {
    it('should convert String type', () => {
      const result = convertClickHouseType('hello', 'String');
      expect(result).toBe('hello');
    });

    it('should convert UInt64 to BigInt for large values', () => {
      const result = convertClickHouseType('18446744073709551615', 'UInt64');
      expect(typeof result).toBe('bigint');
    });

    it('should convert DateTime to Date', () => {
      const result = convertClickHouseType('2024-01-15 10:30:45', 'DateTime');
      expect(result).toBeInstanceOf(Date);
    });

    it('should handle Nullable wrapper', () => {
      const result = convertClickHouseType(null, 'Nullable(String)');
      expect(result).toBeNull();
    });

    it('should handle LowCardinality wrapper', () => {
      const result = convertClickHouseType('value', 'LowCardinality(String)');
      expect(result).toBe('value');
    });
  });

  describe('convertBSONType', () => {
    it('should convert ObjectId to string', () => {
      const oid = new ObjectId();
      const result = convertBSONType(oid);
      expect(typeof result).toBe('string');
    });

    it('should convert Date to ISO string', () => {
      const date = new Date('2024-01-15T10:30:45.000Z');
      const result = convertBSONType(date);
      expect(result).toBe('2024-01-15 10:30:45.000');
    });

    it('should preserve primitive values', () => {
      expect(convertBSONType(42)).toBe(42);
      expect(convertBSONType('hello')).toBe('hello');
      expect(convertBSONType(true)).toBe(true);
    });
  });

  // ==========================================================================
  // Batch Mapping Tests
  // ==========================================================================

  describe('batch mapping', () => {
    it('should map multiple rows efficiently', () => {
      const rows: ClickHouseRow[] = [
        { id: '1', name: 'Alice', age: 30 },
        { id: '2', name: 'Bob', age: 25 },
        { id: '3', name: 'Charlie', age: 35 },
      ];
      const meta: ClickHouseColumnMeta[] = [
        { name: 'id', type: 'String' },
        { name: 'name', type: 'String' },
        { name: 'age', type: 'UInt32' },
      ];

      const results = rows.map((row) => mapClickHouseToBSON(row, meta));

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('Alice');
      expect(results[2].age).toBe(35);
    });

    it('should use mapper instance for batch processing', () => {
      const rows: ClickHouseRow[] = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        value: i * 10,
      }));
      const meta: ClickHouseColumnMeta[] = [
        { name: 'id', type: 'String' },
        { name: 'value', type: 'Int32' },
      ];

      const results = mapper.mapBatch(rows, meta);

      expect(results).toHaveLength(100);
      expect(results[50].value).toBe(500);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('error handling', () => {
    it('should handle unknown type gracefully', () => {
      const row: ClickHouseRow = { value: 'test' };
      const meta: ClickHouseColumnMeta[] = [{ name: 'value', type: 'UnknownType' }];

      // Should not throw, return as-is
      const result = mapClickHouseToBSON(row, meta);
      expect(result.value).toBe('test');
    });

    it('should handle malformed date strings', () => {
      const row: ClickHouseRow = { date: 'not-a-date' };
      const meta: ClickHouseColumnMeta[] = [{ name: 'date', type: 'Date' }];

      // Should handle gracefully
      expect(() => mapClickHouseToBSON(row, meta)).not.toThrow();
    });

    it('should handle missing columns gracefully', () => {
      const row: ClickHouseRow = { name: 'Alice' };
      const meta: ClickHouseColumnMeta[] = [
        { name: 'name', type: 'String' },
        { name: 'age', type: 'Int32' },
      ];

      // Should handle missing 'age' field
      const result = mapClickHouseToBSON(row, meta);
      expect(result.name).toBe('Alice');
      expect(result.age).toBeUndefined();
    });
  });

  // ==========================================================================
  // Custom Mapping Options Tests
  // ==========================================================================

  describe('custom mapping options', () => {
    it('should apply custom type mappers', () => {
      const row: ClickHouseRow = { status: 1 };
      const meta: ClickHouseColumnMeta[] = [{ name: 'status', type: 'UInt8' }];

      const result = mapClickHouseToBSON(row, meta, {
        customMappers: {
          status: (value: number) => (value === 1 ? 'active' : 'inactive'),
        },
      });

      expect(result.status).toBe('active');
    });

    it('should apply field renaming', () => {
      const row: ClickHouseRow = { user_name: 'Alice', user_age: 30 };
      const meta: ClickHouseColumnMeta[] = [
        { name: 'user_name', type: 'String' },
        { name: 'user_age', type: 'UInt32' },
      ];

      const result = mapClickHouseToBSON(row, meta, {
        fieldRenames: {
          user_name: 'name',
          user_age: 'age',
        },
      });

      expect(result.name).toBe('Alice');
      expect(result.age).toBe(30);
      expect(result.user_name).toBeUndefined();
    });

    it('should exclude specified fields', () => {
      const row: ClickHouseRow = { id: '1', name: 'Alice', internal_id: 'xyz' };
      const meta: ClickHouseColumnMeta[] = [
        { name: 'id', type: 'String' },
        { name: 'name', type: 'String' },
        { name: 'internal_id', type: 'String' },
      ];

      const result = mapClickHouseToBSON(row, meta, {
        excludeFields: ['internal_id'],
      });

      expect(result.internal_id).toBeUndefined();
      expect(result.name).toBe('Alice');
    });

    it('should include only specified fields', () => {
      const row: ClickHouseRow = { id: '1', name: 'Alice', age: 30, email: 'alice@example.com' };
      const meta: ClickHouseColumnMeta[] = [
        { name: 'id', type: 'String' },
        { name: 'name', type: 'String' },
        { name: 'age', type: 'UInt32' },
        { name: 'email', type: 'String' },
      ];

      const result = mapClickHouseToBSON(row, meta, {
        includeFields: ['id', 'name'],
      });

      expect(result.id).toBe('1');
      expect(result.name).toBe('Alice');
      expect(result.age).toBeUndefined();
      expect(result.email).toBeUndefined();
    });
  });
});
