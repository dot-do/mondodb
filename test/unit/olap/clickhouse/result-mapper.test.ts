/**
 * ClickHouse Result Mapper Tests (TDD - RED phase)
 *
 * Comprehensive tests for ClickHouseResultMapper type conversion.
 * Focuses on converting ClickHouse result types to BSON/MongoDB document types.
 *
 * Issue: mondodb-d129
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectId } from '../../../../src/types/objectid';
import {
  ClickHouseResultMapper,
  mapClickHouseToBSON,
  convertClickHouseType,
  type ClickHouseRow,
  type ClickHouseColumnMeta,
  type TypeMappingOptions,
} from '../../../../src/olap/clickhouse/mapper';

// =============================================================================
// ClickHouse Result Mapper Tests
// =============================================================================

describe.skip('ClickHouseResultMapper', () => {
  let mapper: ClickHouseResultMapper;

  beforeEach(() => {
    mapper = new ClickHouseResultMapper();
  });

  // ===========================================================================
  // 1. Primitive Type Conversion
  // ===========================================================================

  describe('Primitive Type Conversion', () => {
    describe('Integer types', () => {
      it('should convert ClickHouse Int32 to JavaScript Number', () => {
        const row: ClickHouseRow = { count: 42 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'count', type: 'Int32' }];

        const result = mapper.map(row, meta);

        expect(result.count).toBe(42);
        expect(typeof result.count).toBe('number');
      });

      it('should convert ClickHouse Int64 to JavaScript Number for safe integers', () => {
        const row: ClickHouseRow = { bigCount: 9007199254740991 }; // Number.MAX_SAFE_INTEGER
        const meta: ClickHouseColumnMeta[] = [{ name: 'bigCount', type: 'Int64' }];

        const result = mapper.map(row, meta);

        expect(result.bigCount).toBe(9007199254740991);
        expect(typeof result.bigCount).toBe('number');
      });

      it('should convert ClickHouse Int64 string to JavaScript Number', () => {
        // ClickHouse may return large integers as strings
        const row: ClickHouseRow = { value: '1234567890' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'value', type: 'Int64' }];

        const result = mapper.map(row, meta);

        expect(result.value).toBe(1234567890);
        expect(typeof result.value).toBe('number');
      });

      it('should handle negative Int32 values', () => {
        const row: ClickHouseRow = { temperature: -15 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'temperature', type: 'Int32' }];

        const result = mapper.map(row, meta);

        expect(result.temperature).toBe(-15);
      });

      it('should handle negative Int64 values', () => {
        const row: ClickHouseRow = { balance: -1000000000 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'balance', type: 'Int64' }];

        const result = mapper.map(row, meta);

        expect(result.balance).toBe(-1000000000);
      });

      it('should handle zero values', () => {
        const row: ClickHouseRow = { zero: 0 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'zero', type: 'Int32' }];

        const result = mapper.map(row, meta);

        expect(result.zero).toBe(0);
      });
    });

    describe('Float types', () => {
      it('should convert ClickHouse Float32 to JavaScript Number', () => {
        const row: ClickHouseRow = { price: 19.99 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'price', type: 'Float32' }];

        const result = mapper.map(row, meta);

        expect(result.price).toBeCloseTo(19.99, 2);
        expect(typeof result.price).toBe('number');
      });

      it('should convert ClickHouse Float64 to JavaScript Number', () => {
        const row: ClickHouseRow = { preciseValue: 3.141592653589793 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'preciseValue', type: 'Float64' }];

        const result = mapper.map(row, meta);

        expect(result.preciseValue).toBeCloseTo(3.141592653589793, 15);
        expect(typeof result.preciseValue).toBe('number');
      });

      it('should handle Float32 with scientific notation', () => {
        const row: ClickHouseRow = { scientific: 1.5e10 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'scientific', type: 'Float32' }];

        const result = mapper.map(row, meta);

        expect(result.scientific).toBe(1.5e10);
      });

      it('should handle Float64 infinity', () => {
        const row: ClickHouseRow = { infinity: Infinity };
        const meta: ClickHouseColumnMeta[] = [{ name: 'infinity', type: 'Float64' }];

        const result = mapper.map(row, meta);

        expect(result.infinity).toBe(Infinity);
      });

      it('should handle Float64 negative infinity', () => {
        const row: ClickHouseRow = { negInfinity: -Infinity };
        const meta: ClickHouseColumnMeta[] = [{ name: 'negInfinity', type: 'Float64' }];

        const result = mapper.map(row, meta);

        expect(result.negInfinity).toBe(-Infinity);
      });

      it('should handle Float64 NaN', () => {
        const row: ClickHouseRow = { notANumber: NaN };
        const meta: ClickHouseColumnMeta[] = [{ name: 'notANumber', type: 'Float64' }];

        const result = mapper.map(row, meta);

        expect(result.notANumber).toBeNaN();
      });
    });

    describe('String types', () => {
      it('should convert ClickHouse String to JavaScript String', () => {
        const row: ClickHouseRow = { name: 'Alice' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'name', type: 'String' }];

        const result = mapper.map(row, meta);

        expect(result.name).toBe('Alice');
        expect(typeof result.name).toBe('string');
      });

      it('should handle empty strings', () => {
        const row: ClickHouseRow = { empty: '' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'empty', type: 'String' }];

        const result = mapper.map(row, meta);

        expect(result.empty).toBe('');
      });

      it('should handle strings with special characters', () => {
        const row: ClickHouseRow = { special: 'Hello\nWorld\t!' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'special', type: 'String' }];

        const result = mapper.map(row, meta);

        expect(result.special).toBe('Hello\nWorld\t!');
      });

      it('should handle Unicode strings', () => {
        const row: ClickHouseRow = { unicode: 'Hello World Special chars' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'unicode', type: 'String' }];

        const result = mapper.map(row, meta);

        expect(result.unicode).toBe('Hello World Special chars');
      });
    });

    describe('Boolean types', () => {
      it('should convert ClickHouse Bool true to JavaScript Boolean', () => {
        const row: ClickHouseRow = { active: true };
        const meta: ClickHouseColumnMeta[] = [{ name: 'active', type: 'Bool' }];

        const result = mapper.map(row, meta);

        expect(result.active).toBe(true);
        expect(typeof result.active).toBe('boolean');
      });

      it('should convert ClickHouse Bool false to JavaScript Boolean', () => {
        const row: ClickHouseRow = { deleted: false };
        const meta: ClickHouseColumnMeta[] = [{ name: 'deleted', type: 'Bool' }];

        const result = mapper.map(row, meta);

        expect(result.deleted).toBe(false);
        expect(typeof result.deleted).toBe('boolean');
      });

      it('should convert ClickHouse Bool numeric 1 to true', () => {
        const row: ClickHouseRow = { enabled: 1 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'enabled', type: 'Bool' }];

        const result = mapper.map(row, meta);

        expect(result.enabled).toBe(true);
      });

      it('should convert ClickHouse Bool numeric 0 to false', () => {
        const row: ClickHouseRow = { disabled: 0 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'disabled', type: 'Bool' }];

        const result = mapper.map(row, meta);

        expect(result.disabled).toBe(false);
      });
    });

    describe('NULL handling', () => {
      it('should handle NULL values correctly for Nullable(String)', () => {
        const row: ClickHouseRow = { nickname: null };
        const meta: ClickHouseColumnMeta[] = [{ name: 'nickname', type: 'Nullable(String)' }];

        const result = mapper.map(row, meta);

        expect(result.nickname).toBeNull();
      });

      it('should handle NULL values correctly for Nullable(Int32)', () => {
        const row: ClickHouseRow = { score: null };
        const meta: ClickHouseColumnMeta[] = [{ name: 'score', type: 'Nullable(Int32)' }];

        const result = mapper.map(row, meta);

        expect(result.score).toBeNull();
      });

      it('should handle NULL values correctly for Nullable(Float64)', () => {
        const row: ClickHouseRow = { rate: null };
        const meta: ClickHouseColumnMeta[] = [{ name: 'rate', type: 'Nullable(Float64)' }];

        const result = mapper.map(row, meta);

        expect(result.rate).toBeNull();
      });

      it('should handle NULL values correctly for Nullable(DateTime)', () => {
        const row: ClickHouseRow = { deletedAt: null };
        const meta: ClickHouseColumnMeta[] = [{ name: 'deletedAt', type: 'Nullable(DateTime)' }];

        const result = mapper.map(row, meta);

        expect(result.deletedAt).toBeNull();
      });

      it('should handle non-null values in Nullable types', () => {
        const row: ClickHouseRow = { maybeValue: 42 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'maybeValue', type: 'Nullable(Int32)' }];

        const result = mapper.map(row, meta);

        expect(result.maybeValue).toBe(42);
      });
    });
  });

  // ===========================================================================
  // 2. Date/Time Handling
  // ===========================================================================

  describe('Date/Time Handling', () => {
    describe('DateTime conversion', () => {
      it('should convert ClickHouse DateTime to JavaScript Date', () => {
        const row: ClickHouseRow = { createdAt: '2024-01-15 10:30:45' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'createdAt', type: 'DateTime' }];

        const result = mapper.map(row, meta);

        expect(result.createdAt).toBeInstanceOf(Date);
        expect((result.createdAt as Date).getFullYear()).toBe(2024);
        expect((result.createdAt as Date).getMonth()).toBe(0); // January
        expect((result.createdAt as Date).getDate()).toBe(15);
      });

      it('should convert ClickHouse DateTime numeric timestamp to Date', () => {
        const timestamp = 1705312245; // 2024-01-15 10:30:45 UTC
        const row: ClickHouseRow = { timestamp };
        const meta: ClickHouseColumnMeta[] = [{ name: 'timestamp', type: 'DateTime' }];

        const result = mapper.map(row, meta);

        expect(result.timestamp).toBeInstanceOf(Date);
      });
    });

    describe('DateTime64 with timezone', () => {
      it('should convert ClickHouse DateTime64 with timezone', () => {
        const row: ClickHouseRow = { eventTime: '2024-01-15 10:30:45.123456789' };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'eventTime', type: "DateTime64(9, 'UTC')" },
        ];

        const result = mapper.map(row, meta);

        expect(result.eventTime).toBeInstanceOf(Date);
      });

      it('should handle DateTime64 with America/New_York timezone', () => {
        const row: ClickHouseRow = { localTime: '2024-01-15 05:30:45.123' };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'localTime', type: "DateTime64(3, 'America/New_York')" },
        ];

        const result = mapper.map(row, meta);

        expect(result.localTime).toBeInstanceOf(Date);
      });

      it('should handle DateTime64 with Europe/London timezone', () => {
        const row: ClickHouseRow = { ukTime: '2024-01-15 10:30:45.000' };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'ukTime', type: "DateTime64(3, 'Europe/London')" },
        ];

        const result = mapper.map(row, meta);

        expect(result.ukTime).toBeInstanceOf(Date);
      });
    });

    describe('Date conversion', () => {
      it('should convert ClickHouse Date to JavaScript Date', () => {
        const row: ClickHouseRow = { birthday: '2024-01-15' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'birthday', type: 'Date' }];

        const result = mapper.map(row, meta);

        expect(result.birthday).toBeInstanceOf(Date);
        expect((result.birthday as Date).toISOString().startsWith('2024-01-15')).toBe(true);
      });

      it('should convert ClickHouse Date32 to JavaScript Date', () => {
        const row: ClickHouseRow = { extendedDate: '2100-12-31' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'extendedDate', type: 'Date32' }];

        const result = mapper.map(row, meta);

        expect(result.extendedDate).toBeInstanceOf(Date);
        expect((result.extendedDate as Date).getFullYear()).toBe(2100);
      });
    });

    describe('Millisecond precision', () => {
      it('should preserve millisecond precision from DateTime64(3)', () => {
        const row: ClickHouseRow = { preciseTime: '2024-01-15 10:30:45.123' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'preciseTime', type: 'DateTime64(3)' }];

        const result = mapper.map(row, meta);

        expect(result.preciseTime).toBeInstanceOf(Date);
        expect((result.preciseTime as Date).getMilliseconds()).toBe(123);
      });

      it('should preserve millisecond precision with zeros', () => {
        const row: ClickHouseRow = { exactTime: '2024-01-15 10:30:45.000' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'exactTime', type: 'DateTime64(3)' }];

        const result = mapper.map(row, meta);

        expect(result.exactTime).toBeInstanceOf(Date);
        expect((result.exactTime as Date).getMilliseconds()).toBe(0);
      });

      it('should handle microsecond precision by truncating to milliseconds', () => {
        const row: ClickHouseRow = { microTime: '2024-01-15 10:30:45.123456' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'microTime', type: 'DateTime64(6)' }];

        const result = mapper.map(row, meta);

        expect(result.microTime).toBeInstanceOf(Date);
        // JavaScript Date only supports millisecond precision
        expect((result.microTime as Date).getMilliseconds()).toBe(123);
      });

      it('should handle nanosecond precision by truncating to milliseconds', () => {
        const row: ClickHouseRow = { nanoTime: '2024-01-15 10:30:45.123456789' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'nanoTime', type: 'DateTime64(9)' }];

        const result = mapper.map(row, meta);

        expect(result.nanoTime).toBeInstanceOf(Date);
        expect((result.nanoTime as Date).getMilliseconds()).toBe(123);
      });
    });
  });

  // ===========================================================================
  // 3. ObjectId Preservation
  // ===========================================================================

  describe('ObjectId Preservation', () => {
    describe('Hex string to ObjectId', () => {
      it('should convert hex string back to ObjectId', () => {
        const objectIdStr = '507f1f77bcf86cd799439011';
        const row: ClickHouseRow = { _id: objectIdStr };
        const meta: ClickHouseColumnMeta[] = [{ name: '_id', type: 'String' }];

        const options: TypeMappingOptions = { preserveObjectId: true };
        const result = mapper.map(row, meta);

        // Without options, should stay as string
        expect(typeof result._id).toBe('string');

        // With preserveObjectId option
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const resultWithOptions = mapperWithOptions.map(row, meta);

        expect(resultWithOptions._id).toBeInstanceOf(ObjectId);
        expect(resultWithOptions._id.toString()).toBe(objectIdStr);
      });

      it('should handle ObjectId in FixedString(24) type', () => {
        const objectIdStr = '507f1f77bcf86cd799439011';
        const row: ClickHouseRow = { documentId: objectIdStr };
        const meta: ClickHouseColumnMeta[] = [{ name: 'documentId', type: 'FixedString(24)' }];

        const options: TypeMappingOptions = { preserveObjectId: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        expect(result.documentId).toBeInstanceOf(ObjectId);
      });

      it('should not convert non-ObjectId strings to ObjectId', () => {
        const row: ClickHouseRow = { name: 'not-an-objectid' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'name', type: 'String' }];

        const options: TypeMappingOptions = { preserveObjectId: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        expect(typeof result.name).toBe('string');
        expect(result.name).toBe('not-an-objectid');
      });

      it('should handle uppercase ObjectId hex strings', () => {
        const objectIdStr = '507F1F77BCF86CD799439011';
        const row: ClickHouseRow = { _id: objectIdStr };
        const meta: ClickHouseColumnMeta[] = [{ name: '_id', type: 'String' }];

        const options: TypeMappingOptions = { preserveObjectId: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        expect(result._id).toBeInstanceOf(ObjectId);
        expect(result._id.toString()).toBe(objectIdStr.toLowerCase());
      });
    });

    describe('ObjectId in nested documents', () => {
      it('should handle ObjectId in nested documents', () => {
        const objectIdStr = '507f1f77bcf86cd799439011';
        const row: ClickHouseRow = {
          nested: JSON.stringify({ refId: objectIdStr, name: 'test' }),
        };
        const meta: ClickHouseColumnMeta[] = [{ name: 'nested', type: 'String' }];

        const options: TypeMappingOptions = { preserveObjectId: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        expect(result.nested).toBeDefined();
        expect((result.nested as { refId: ObjectId }).refId).toBeInstanceOf(ObjectId);
      });

      it('should handle ObjectId in deeply nested documents', () => {
        const objectIdStr = '507f1f77bcf86cd799439011';
        const row: ClickHouseRow = {
          data: {
            level1: {
              level2: {
                documentId: objectIdStr,
              },
            },
          },
        };
        const meta: ClickHouseColumnMeta[] = [{ name: 'data', type: 'Object(Nullable(String))' }];

        const options: TypeMappingOptions = { preserveObjectId: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        const nested = result.data as { level1: { level2: { documentId: ObjectId } } };
        expect(nested.level1.level2.documentId).toBeInstanceOf(ObjectId);
      });

      it('should handle multiple ObjectIds in nested document', () => {
        const objectId1 = '507f1f77bcf86cd799439011';
        const objectId2 = '507f1f77bcf86cd799439022';
        const row: ClickHouseRow = {
          refs: {
            parentId: objectId1,
            childId: objectId2,
          },
        };
        const meta: ClickHouseColumnMeta[] = [{ name: 'refs', type: 'Object(Nullable(String))' }];

        const options: TypeMappingOptions = { preserveObjectId: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        const refs = result.refs as { parentId: ObjectId; childId: ObjectId };
        expect(refs.parentId).toBeInstanceOf(ObjectId);
        expect(refs.childId).toBeInstanceOf(ObjectId);
      });
    });

    describe('ObjectId in arrays', () => {
      it('should handle ObjectId in arrays', () => {
        const objectIdStrs = [
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439022',
          '507f1f77bcf86cd799439033',
        ];
        const row: ClickHouseRow = { refIds: objectIdStrs };
        const meta: ClickHouseColumnMeta[] = [{ name: 'refIds', type: 'Array(String)' }];

        const options: TypeMappingOptions = { preserveObjectId: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        expect(Array.isArray(result.refIds)).toBe(true);
        const refIds = result.refIds as ObjectId[];
        expect(refIds[0]).toBeInstanceOf(ObjectId);
        expect(refIds[1]).toBeInstanceOf(ObjectId);
        expect(refIds[2]).toBeInstanceOf(ObjectId);
      });

      it('should handle arrays of documents with ObjectIds', () => {
        const row: ClickHouseRow = {
          items: [
            { _id: '507f1f77bcf86cd799439011', name: 'Item 1' },
            { _id: '507f1f77bcf86cd799439022', name: 'Item 2' },
          ],
        };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'items', type: 'Array(Tuple(_id String, name String))' },
        ];

        const options: TypeMappingOptions = { preserveObjectId: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        const items = result.items as Array<{ _id: ObjectId; name: string }>;
        expect(items[0]._id).toBeInstanceOf(ObjectId);
        expect(items[1]._id).toBeInstanceOf(ObjectId);
      });

      it('should handle empty arrays with ObjectId type', () => {
        const row: ClickHouseRow = { refIds: [] };
        const meta: ClickHouseColumnMeta[] = [{ name: 'refIds', type: 'Array(String)' }];

        const options: TypeMappingOptions = { preserveObjectId: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        expect(result.refIds).toEqual([]);
      });
    });
  });

  // ===========================================================================
  // 4. Nested Document Handling
  // ===========================================================================

  describe('Nested Document Handling', () => {
    describe('JSON string parsing', () => {
      it('should parse JSON strings to nested objects', () => {
        const nestedData = { name: 'Alice', age: 30, city: 'NYC' };
        const row: ClickHouseRow = { profile: JSON.stringify(nestedData) };
        const meta: ClickHouseColumnMeta[] = [{ name: 'profile', type: 'String' }];

        const result = mapper.map(row, meta);

        expect(result.profile).toEqual(nestedData);
      });

      it('should handle already-parsed objects from ClickHouse', () => {
        const nestedData = { name: 'Alice', age: 30 };
        const row: ClickHouseRow = { profile: nestedData };
        const meta: ClickHouseColumnMeta[] = [{ name: 'profile', type: 'Object(Nullable(String))' }];

        const result = mapper.map(row, meta);

        expect(result.profile).toEqual(nestedData);
      });

      it('should handle Tuple type as object', () => {
        const row: ClickHouseRow = {
          address: { street: '123 Main St', city: 'NYC', zip: '10001' },
        };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'address', type: 'Tuple(street String, city String, zip String)' },
        ];

        const result = mapper.map(row, meta);

        expect(result.address).toEqual({
          street: '123 Main St',
          city: 'NYC',
          zip: '10001',
        });
      });
    });

    describe('Deeply nested structures', () => {
      it('should handle deeply nested structures', () => {
        const deepData = {
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'deep',
                },
              },
            },
          },
        };
        const row: ClickHouseRow = { data: deepData };
        const meta: ClickHouseColumnMeta[] = [{ name: 'data', type: 'Object(Nullable(String))' }];

        const result = mapper.map(row, meta);

        expect((result.data as typeof deepData).level1.level2.level3.level4.value).toBe('deep');
      });

      it('should handle 10 levels of nesting', () => {
        const createNestedObject = (depth: number, value: string): object => {
          if (depth === 0) return { value };
          return { nested: createNestedObject(depth - 1, value) };
        };

        const deepData = createNestedObject(10, 'found');
        const row: ClickHouseRow = { deep: deepData };
        const meta: ClickHouseColumnMeta[] = [{ name: 'deep', type: 'Object(Nullable(String))' }];

        const result = mapper.map(row, meta);

        // Navigate 10 levels deep
        let current = result.deep as Record<string, unknown>;
        for (let i = 0; i < 10; i++) {
          current = current.nested as Record<string, unknown>;
        }
        expect(current.value).toBe('found');
      });

      it('should preserve all field types in nested structures', () => {
        const complexData = {
          name: 'Test',
          count: 42,
          active: true,
          tags: ['a', 'b'],
          metadata: {
            created: '2024-01-15',
            score: 99.5,
          },
        };
        const row: ClickHouseRow = { doc: complexData };
        const meta: ClickHouseColumnMeta[] = [{ name: 'doc', type: 'Object(Nullable(String))' }];

        const result = mapper.map(row, meta);

        const doc = result.doc as typeof complexData;
        expect(typeof doc.name).toBe('string');
        expect(typeof doc.count).toBe('number');
        expect(typeof doc.active).toBe('boolean');
        expect(Array.isArray(doc.tags)).toBe(true);
        expect(typeof doc.metadata).toBe('object');
      });
    });

    describe('Mixed arrays and objects', () => {
      it('should handle mixed arrays and objects', () => {
        const mixedData = {
          items: [
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' },
          ],
          metadata: {
            count: 2,
            tags: ['tag1', 'tag2'],
          },
        };
        const row: ClickHouseRow = { data: mixedData };
        const meta: ClickHouseColumnMeta[] = [{ name: 'data', type: 'Object(Nullable(String))' }];

        const result = mapper.map(row, meta);

        const data = result.data as typeof mixedData;
        expect(data.items[0].name).toBe('Item 1');
        expect(data.metadata.tags).toEqual(['tag1', 'tag2']);
      });

      it('should handle object with array of arrays', () => {
        const data = {
          matrix: [
            [1, 2, 3],
            [4, 5, 6],
          ],
          labels: [['a', 'b'], ['c', 'd']],
        };
        const row: ClickHouseRow = { data };
        const meta: ClickHouseColumnMeta[] = [{ name: 'data', type: 'Object(Nullable(String))' }];

        const result = mapper.map(row, meta);

        expect((result.data as typeof data).matrix[1][2]).toBe(6);
        expect((result.data as typeof data).labels[0][1]).toBe('b');
      });

      it('should handle array of objects with nested arrays', () => {
        const data = [
          { id: 1, scores: [90, 85, 88] },
          { id: 2, scores: [78, 82, 91] },
        ];
        const row: ClickHouseRow = { students: data };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'students', type: 'Array(Tuple(id UInt32, scores Array(UInt32)))' },
        ];

        const result = mapper.map(row, meta);

        const students = result.students as typeof data;
        expect(students[0].scores[2]).toBe(88);
        expect(students[1].id).toBe(2);
      });
    });
  });

  // ===========================================================================
  // 5. Array Handling
  // ===========================================================================

  describe('Array Handling', () => {
    describe('Basic array conversion', () => {
      it('should convert ClickHouse Arrays to JavaScript Arrays', () => {
        const row: ClickHouseRow = { tags: ['javascript', 'typescript', 'nodejs'] };
        const meta: ClickHouseColumnMeta[] = [{ name: 'tags', type: 'Array(String)' }];

        const result = mapper.map(row, meta);

        expect(Array.isArray(result.tags)).toBe(true);
        expect(result.tags).toEqual(['javascript', 'typescript', 'nodejs']);
      });

      it('should convert Array(Int32) correctly', () => {
        const row: ClickHouseRow = { numbers: [1, 2, 3, 4, 5] };
        const meta: ClickHouseColumnMeta[] = [{ name: 'numbers', type: 'Array(Int32)' }];

        const result = mapper.map(row, meta);

        expect(result.numbers).toEqual([1, 2, 3, 4, 5]);
      });

      it('should convert Array(Float64) correctly', () => {
        const row: ClickHouseRow = { values: [1.1, 2.2, 3.3] };
        const meta: ClickHouseColumnMeta[] = [{ name: 'values', type: 'Array(Float64)' }];

        const result = mapper.map(row, meta);

        expect((result.values as number[])[0]).toBeCloseTo(1.1);
        expect((result.values as number[])[2]).toBeCloseTo(3.3);
      });
    });

    describe('Arrays of objects', () => {
      it('should handle arrays of objects', () => {
        const row: ClickHouseRow = {
          users: [
            { name: 'Alice', age: 30 },
            { name: 'Bob', age: 25 },
          ],
        };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'users', type: 'Array(Tuple(name String, age UInt32))' },
        ];

        const result = mapper.map(row, meta);

        const users = result.users as Array<{ name: string; age: number }>;
        expect(users[0].name).toBe('Alice');
        expect(users[1].age).toBe(25);
      });

      it('should handle arrays of complex objects', () => {
        const row: ClickHouseRow = {
          orders: [
            { id: '001', items: ['item1', 'item2'], total: 99.99 },
            { id: '002', items: ['item3'], total: 49.99 },
          ],
        };
        const meta: ClickHouseColumnMeta[] = [{ name: 'orders', type: 'Array(Object(Nullable(String)))' }];

        const result = mapper.map(row, meta);

        const orders = result.orders as Array<{
          id: string;
          items: string[];
          total: number;
        }>;
        expect(orders[0].items).toEqual(['item1', 'item2']);
        expect(orders[1].total).toBe(49.99);
      });
    });

    describe('Empty arrays', () => {
      it('should handle empty arrays', () => {
        const row: ClickHouseRow = { emptyList: [] };
        const meta: ClickHouseColumnMeta[] = [{ name: 'emptyList', type: 'Array(String)' }];

        const result = mapper.map(row, meta);

        expect(result.emptyList).toEqual([]);
        expect(Array.isArray(result.emptyList)).toBe(true);
      });

      it('should handle empty arrays of objects', () => {
        const row: ClickHouseRow = { noItems: [] };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'noItems', type: 'Array(Tuple(id String, name String))' },
        ];

        const result = mapper.map(row, meta);

        expect(result.noItems).toEqual([]);
      });

      it('should handle empty nested arrays', () => {
        const row: ClickHouseRow = { matrix: [] };
        const meta: ClickHouseColumnMeta[] = [{ name: 'matrix', type: 'Array(Array(Int32))' }];

        const result = mapper.map(row, meta);

        expect(result.matrix).toEqual([]);
      });
    });

    describe('Nested arrays', () => {
      it('should handle nested arrays (2D)', () => {
        const row: ClickHouseRow = {
          matrix: [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
          ],
        };
        const meta: ClickHouseColumnMeta[] = [{ name: 'matrix', type: 'Array(Array(Int32))' }];

        const result = mapper.map(row, meta);

        expect(result.matrix).toEqual([
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ]);
      });

      it('should handle 3D nested arrays', () => {
        const row: ClickHouseRow = {
          cube: [
            [[1, 2], [3, 4]],
            [[5, 6], [7, 8]],
          ],
        };
        const meta: ClickHouseColumnMeta[] = [{ name: 'cube', type: 'Array(Array(Array(Int32)))' }];

        const result = mapper.map(row, meta);

        expect((result.cube as number[][][])[1][0][1]).toBe(6);
      });

      it('should handle nested arrays with null elements', () => {
        const row: ClickHouseRow = {
          sparseMatrix: [
            [1, null, 3],
            [null, 5, null],
          ],
        };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'sparseMatrix', type: 'Array(Array(Nullable(Int32)))' },
        ];

        const result = mapper.map(row, meta);

        expect(result.sparseMatrix).toEqual([
          [1, null, 3],
          [null, 5, null],
        ]);
      });

      it('should handle ragged nested arrays', () => {
        const row: ClickHouseRow = {
          ragged: [[1, 2, 3], [4], [5, 6]],
        };
        const meta: ClickHouseColumnMeta[] = [{ name: 'ragged', type: 'Array(Array(Int32))' }];

        const result = mapper.map(row, meta);

        expect((result.ragged as number[][])[0]).toHaveLength(3);
        expect((result.ragged as number[][])[1]).toHaveLength(1);
        expect((result.ragged as number[][])[2]).toHaveLength(2);
      });
    });
  });

  // ===========================================================================
  // 6. Special BSON Types
  // ===========================================================================

  describe('Special BSON Types', () => {
    describe('Decimal128 mapping', () => {
      it('should handle Decimal128 mapping from string', () => {
        const row: ClickHouseRow = { amount: '12345.678901234567890' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'amount', type: 'Decimal(38, 18)' }];

        const result = mapper.map(row, meta);

        // Should be converted to a Decimal128-compatible representation
        expect(result.amount).toBeDefined();
        expect(result.amount.toString()).toBe('12345.678901234567890');
      });

      it('should handle Decimal128 with high precision', () => {
        const row: ClickHouseRow = { preciseAmount: '999999999999999999.999999999999999999' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'preciseAmount', type: 'Decimal(38, 18)' }];

        const result = mapper.map(row, meta);

        expect(result.preciseAmount).toBeDefined();
        // Should preserve precision
        expect(result.preciseAmount.toString()).toContain('999999999999999999');
      });

      it('should handle Decimal128 negative values', () => {
        const row: ClickHouseRow = { negativeAmount: '-123.456' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'negativeAmount', type: 'Decimal(10, 3)' }];

        const result = mapper.map(row, meta);

        expect(result.negativeAmount.toString()).toBe('-123.456');
      });

      it('should handle Decimal128 zero value', () => {
        const row: ClickHouseRow = { zeroAmount: '0.00' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'zeroAmount', type: 'Decimal(10, 2)' }];

        const result = mapper.map(row, meta);

        expect(result.zeroAmount.toString()).toBe('0.00');
      });
    });

    describe('Binary data', () => {
      it('should handle Binary data from base64', () => {
        const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
        const base64 = Buffer.from(binaryData).toString('base64');
        const row: ClickHouseRow = { data: base64 };
        const meta: ClickHouseColumnMeta[] = [{ name: 'data', type: 'String' }];

        const options: TypeMappingOptions = { preserveBinary: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        // Should be converted to Binary or Uint8Array
        expect(result.data).toBeDefined();
      });

      it('should handle Binary data with specific subtype', () => {
        const row: ClickHouseRow = {
          uuid: 'dGVzdC11dWlkLWRhdGE=', // base64 encoded
        };
        const meta: ClickHouseColumnMeta[] = [{ name: 'uuid', type: 'String' }];

        const options: TypeMappingOptions = { preserveBinary: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        expect(result.uuid).toBeDefined();
      });

      it('should handle empty Binary data', () => {
        const row: ClickHouseRow = { emptyData: '' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'emptyData', type: 'String' }];

        const options: TypeMappingOptions = { preserveBinary: true };
        const mapperWithOptions = new ClickHouseResultMapper(options);
        const result = mapperWithOptions.map(row, meta);

        // Empty string should remain as empty string or empty binary
        expect(result.emptyData === '' || result.emptyData.length === 0).toBe(true);
      });
    });

    describe('RegExp handling', () => {
      it('should handle RegExp if stored as string pattern', () => {
        const row: ClickHouseRow = { pattern: '/^test.*$/i' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'pattern', type: 'String' }];

        // RegExp stored as string pattern should be preserved as string
        // unless specific conversion is requested
        const result = mapper.map(row, meta);

        expect(typeof result.pattern).toBe('string');
        expect(result.pattern).toBe('/^test.*$/i');
      });

      it('should handle RegExp pattern and flags separately', () => {
        const row: ClickHouseRow = {
          regex: {
            pattern: '^test.*$',
            flags: 'i',
          },
        };
        const meta: ClickHouseColumnMeta[] = [{ name: 'regex', type: 'Object(Nullable(String))' }];

        const result = mapper.map(row, meta);

        const regex = result.regex as { pattern: string; flags: string };
        expect(regex.pattern).toBe('^test.*$');
        expect(regex.flags).toBe('i');
      });
    });

    describe('UUID type', () => {
      it('should handle ClickHouse UUID type', () => {
        const row: ClickHouseRow = { id: '550e8400-e29b-41d4-a716-446655440000' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'id', type: 'UUID' }];

        const result = mapper.map(row, meta);

        expect(result.id).toBeDefined();
        expect(result.id.toString()).toBe('550e8400-e29b-41d4-a716-446655440000');
      });
    });

    describe('LowCardinality wrapper', () => {
      it('should handle LowCardinality(String)', () => {
        const row: ClickHouseRow = { status: 'active' };
        const meta: ClickHouseColumnMeta[] = [{ name: 'status', type: 'LowCardinality(String)' }];

        const result = mapper.map(row, meta);

        expect(result.status).toBe('active');
      });

      it('should handle LowCardinality(Nullable(String))', () => {
        const row: ClickHouseRow = { category: null };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'category', type: 'LowCardinality(Nullable(String))' },
        ];

        const result = mapper.map(row, meta);

        expect(result.category).toBeNull();
      });
    });

    describe('Enum types', () => {
      it('should handle Enum8 type', () => {
        const row: ClickHouseRow = { status: 'pending' };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'status', type: "Enum8('pending' = 1, 'active' = 2, 'completed' = 3)" },
        ];

        const result = mapper.map(row, meta);

        expect(result.status).toBe('pending');
      });

      it('should handle Enum16 type', () => {
        const row: ClickHouseRow = { level: 'high' };
        const meta: ClickHouseColumnMeta[] = [
          { name: 'level', type: "Enum16('low' = 1, 'medium' = 2, 'high' = 3)" },
        ];

        const result = mapper.map(row, meta);

        expect(result.level).toBe('high');
      });
    });
  });

  // ===========================================================================
  // Batch Processing Tests
  // ===========================================================================

  describe('Batch Processing', () => {
    it('should map multiple rows efficiently with mapBatch', () => {
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

      const results = mapper.mapBatch(rows, meta);

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('Alice');
      expect(results[1].age).toBe(25);
      expect(results[2].id).toBe('3');
    });

    it('should handle empty batch', () => {
      const rows: ClickHouseRow[] = [];
      const meta: ClickHouseColumnMeta[] = [{ name: 'id', type: 'String' }];

      const results = mapper.mapBatch(rows, meta);

      expect(results).toEqual([]);
    });

    it('should handle large batch efficiently', () => {
      const rows: ClickHouseRow[] = Array.from({ length: 1000 }, (_, i) => ({
        id: String(i),
        value: i * 10,
      }));
      const meta: ClickHouseColumnMeta[] = [
        { name: 'id', type: 'String' },
        { name: 'value', type: 'Int32' },
      ];

      const results = mapper.mapBatch(rows, meta);

      expect(results).toHaveLength(1000);
      expect(results[500].value).toBe(5000);
    });
  });

  // ===========================================================================
  // convertClickHouseType Function Tests
  // ===========================================================================

  describe('convertClickHouseType function', () => {
    it('should convert Int32 type', () => {
      const result = convertClickHouseType(42, 'Int32');
      expect(result).toBe(42);
    });

    it('should convert Int64 type', () => {
      const result = convertClickHouseType('1234567890', 'Int64');
      expect(result).toBe(1234567890);
    });

    it('should convert Float32 type', () => {
      const result = convertClickHouseType(3.14, 'Float32');
      expect(result).toBeCloseTo(3.14);
    });

    it('should convert Float64 type', () => {
      const result = convertClickHouseType(3.141592653589793, 'Float64');
      expect(result).toBeCloseTo(3.141592653589793, 15);
    });

    it('should convert String type', () => {
      const result = convertClickHouseType('hello', 'String');
      expect(result).toBe('hello');
    });

    it('should convert Bool type', () => {
      expect(convertClickHouseType(true, 'Bool')).toBe(true);
      expect(convertClickHouseType(false, 'Bool')).toBe(false);
      expect(convertClickHouseType(1, 'Bool')).toBe(true);
      expect(convertClickHouseType(0, 'Bool')).toBe(false);
    });

    it('should convert DateTime type', () => {
      const result = convertClickHouseType('2024-01-15 10:30:45', 'DateTime');
      expect(result).toBeInstanceOf(Date);
    });

    it('should convert DateTime64 type', () => {
      const result = convertClickHouseType('2024-01-15 10:30:45.123', 'DateTime64(3)');
      expect(result).toBeInstanceOf(Date);
      expect((result as Date).getMilliseconds()).toBe(123);
    });

    it('should convert Date type', () => {
      const result = convertClickHouseType('2024-01-15', 'Date');
      expect(result).toBeInstanceOf(Date);
    });

    it('should handle Nullable wrapper with null value', () => {
      const result = convertClickHouseType(null, 'Nullable(String)');
      expect(result).toBeNull();
    });

    it('should handle Nullable wrapper with non-null value', () => {
      const result = convertClickHouseType('hello', 'Nullable(String)');
      expect(result).toBe('hello');
    });

    it('should handle LowCardinality wrapper', () => {
      const result = convertClickHouseType('value', 'LowCardinality(String)');
      expect(result).toBe('value');
    });

    it('should handle Array type', () => {
      const result = convertClickHouseType([1, 2, 3], 'Array(Int32)');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle nested Array type', () => {
      const result = convertClickHouseType([[1, 2], [3, 4]], 'Array(Array(Int32))');
      expect(result).toEqual([[1, 2], [3, 4]]);
    });

    it('should handle UUID type', () => {
      const result = convertClickHouseType(
        '550e8400-e29b-41d4-a716-446655440000',
        'UUID'
      );
      expect(result.toString()).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should handle Decimal type', () => {
      const result = convertClickHouseType('123.456', 'Decimal(10, 3)');
      expect(result.toString()).toBe('123.456');
    });

    it('should handle unknown type by returning value as-is', () => {
      const result = convertClickHouseType('test', 'UnknownType');
      expect(result).toBe('test');
    });
  });
});
