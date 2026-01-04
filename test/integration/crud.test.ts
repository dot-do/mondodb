/**
 * Integration tests for Document CRUD operations
 *
 * These tests verify MongoDB-compatible CRUD operations:
 * - insertOne stores document with auto _id
 * - insertMany stores multiple documents
 * - findOne retrieves by _id
 * - find retrieves by query
 * - updateOne modifies document
 * - deleteOne removes document
 * - JSON field extraction works
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MondoDatabase } from '../../src/durable-object/mondo-database';
import { ObjectId } from '../../src/types/objectid';

// Mock SQL storage that simulates SQLite behavior
interface MockRow {
  [key: string]: unknown;
}

interface MockSqlStorage {
  exec: ReturnType<typeof vi.fn>;
}

interface MockStorage {
  sql: MockSqlStorage;
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

interface MockState {
  storage: MockStorage;
  blockConcurrencyWhile: ReturnType<typeof vi.fn>;
}

// In-memory database simulation for testing
class InMemoryDatabase {
  private collections: Map<string, { id: number; name: string; options: string }> = new Map();
  private documents: Map<number, { id: number; collection_id: number; _id: string; data: string }> = new Map();
  private collectionIdCounter = 1;
  private documentIdCounter = 1;

  exec(sql: string, ...params: unknown[]): { toArray(): MockRow[] } {
    const sqlLower = sql.toLowerCase().trim();

    // CREATE TABLE - no-op for in-memory
    if (sqlLower.startsWith('create table') || sqlLower.startsWith('create index')) {
      return { toArray: () => [] };
    }

    // SELECT from sqlite_master
    if (sqlLower.includes('sqlite_master')) {
      return {
        toArray: () => [
          { name: 'collections' },
          { name: 'documents' },
        ],
      };
    }

    // INSERT INTO collections
    if (sqlLower.startsWith('insert into collections')) {
      const name = params[0] as string;
      const id = this.collectionIdCounter++;
      this.collections.set(name, { id, name, options: '{}' });
      return { toArray: () => [] };
    }

    // SELECT id FROM collections WHERE name = ?
    if (sqlLower.includes('select id from collections') && sqlLower.includes('where name')) {
      const name = params[0] as string;
      const collection = this.collections.get(name);
      if (collection) {
        return { toArray: () => [{ id: collection.id }] };
      }
      return { toArray: () => [] };
    }

    // INSERT INTO documents
    if (sqlLower.startsWith('insert into documents')) {
      const collection_id = params[0] as number;
      const _id = params[1] as string;
      const data = params[2] as string;
      const id = this.documentIdCounter++;
      this.documents.set(id, { id, collection_id, _id, data });
      return { toArray: () => [] };
    }

    // SELECT data FROM documents with WHERE clauses
    if (sqlLower.includes('select data from documents') || sqlLower.includes('select id, data from documents')) {
      const collection_id = params[0] as number;
      const includeId = sqlLower.includes('select id, data');
      const hasLimit = sqlLower.includes('limit 1');

      let results = Array.from(this.documents.values())
        .filter((doc) => doc.collection_id === collection_id);

      // Apply filters from params
      results = this.applyFilters(results, sql, params.slice(1));

      if (hasLimit && results.length > 1) {
        results = results.slice(0, 1);
      }

      return {
        toArray: () =>
          results.map((doc) =>
            includeId ? { id: doc.id, data: doc.data } : { data: doc.data }
          ),
      };
    }

    // SELECT id FROM documents (for delete)
    if (sqlLower.includes('select id from documents')) {
      const collection_id = params[0] as number;
      let results = Array.from(this.documents.values())
        .filter((doc) => doc.collection_id === collection_id);

      // Apply filters from params
      results = this.applyFilters(results, sql, params.slice(1));

      if (sqlLower.includes('limit 1') && results.length > 1) {
        results = results.slice(0, 1);
      }

      return { toArray: () => results.map((doc) => ({ id: doc.id })) };
    }

    // UPDATE documents
    if (sqlLower.startsWith('update documents')) {
      const data = params[0] as string;
      const id = params[1] as number;
      const doc = this.documents.get(id);
      if (doc) {
        doc.data = data;
      }
      return { toArray: () => [] };
    }

    // DELETE FROM documents
    if (sqlLower.startsWith('delete from documents')) {
      const id = params[0] as number;
      this.documents.delete(id);
      return { toArray: () => [] };
    }

    return { toArray: () => [] };
  }

  /**
   * Apply WHERE clause filters to a list of documents
   */
  private applyFilters(
    docs: { id: number; collection_id: number; _id: string; data: string }[],
    sql: string,
    params: unknown[]
  ): { id: number; collection_id: number; _id: string; data: string }[] {
    const sqlLower = sql.toLowerCase();
    let results = docs;
    let paramIndex = 0;

    // Handle _id = ? filter
    if (sqlLower.includes('_id = ?') && !sqlLower.includes('json_extract(data, ?)')) {
      // Direct _id comparison (not nested in json_extract)
      const idIndex = this.findParamIndex(sql, '_id = ?');
      if (idIndex !== -1 && params[idIndex] !== undefined) {
        const _id = params[idIndex] as string;
        results = results.filter((doc) => doc._id === _id);
        paramIndex = idIndex + 1;
      }
    }

    // Handle json_extract filters
    // Count how many json_extract conditions we have
    const jsonExtractMatches = sql.match(/json_extract\(data,\s*\?\)/g) || [];

    for (let i = 0; i < jsonExtractMatches.length; i++) {
      const jsonPath = params[paramIndex] as string;
      if (!jsonPath || typeof jsonPath !== 'string') {
        paramIndex++;
        continue;
      }

      // Parse json path like $.field or $.profile.level
      const field = jsonPath.replace('$.', '');

      // Determine the operator by examining the SQL
      // Find the portion of SQL after this json_extract
      const afterExtract = this.getConditionAfterNthJsonExtract(sql, i);

      // Check operators in order of specificity (longer matches first)
      // Match with or without leading space to handle both "x > ?" and "x> ?"
      if (afterExtract.match(/\s*!=\s*\?/)) {
        paramIndex++;
        const value = params[paramIndex];
        paramIndex++;
        results = results.filter((doc) => {
          const data = JSON.parse(doc.data);
          const fieldValue = this.getNestedValue(data, field);
          return fieldValue !== value;
        });
      } else if (afterExtract.match(/\s*>=\s*\?/)) {
        paramIndex++;
        const value = params[paramIndex] as number;
        paramIndex++;
        results = results.filter((doc) => {
          const data = JSON.parse(doc.data);
          const fieldValue = this.getNestedValue(data, field) as number;
          return fieldValue >= value;
        });
      } else if (afterExtract.match(/\s*<=\s*\?/)) {
        paramIndex++;
        const value = params[paramIndex] as number;
        paramIndex++;
        results = results.filter((doc) => {
          const data = JSON.parse(doc.data);
          const fieldValue = this.getNestedValue(data, field) as number;
          return fieldValue <= value;
        });
      } else if (afterExtract.match(/\s*>\s*\?/) && !afterExtract.match(/\s*>=\s*\?/)) {
        paramIndex++;
        const value = params[paramIndex] as number;
        paramIndex++;
        results = results.filter((doc) => {
          const data = JSON.parse(doc.data);
          const fieldValue = this.getNestedValue(data, field) as number;
          return fieldValue > value;
        });
      } else if (afterExtract.match(/\s*<\s*\?/) && !afterExtract.match(/\s*<=\s*\?/)) {
        paramIndex++;
        const value = params[paramIndex] as number;
        paramIndex++;
        results = results.filter((doc) => {
          const data = JSON.parse(doc.data);
          const fieldValue = this.getNestedValue(data, field) as number;
          return fieldValue < value;
        });
      } else if (afterExtract.match(/\s*=\s*\?/) && !afterExtract.match(/\s*!=\s*\?/) && !afterExtract.match(/\s*>=\s*\?/) && !afterExtract.match(/\s*<=\s*\?/)) {
        paramIndex++;
        const value = params[paramIndex];
        paramIndex++;
        results = results.filter((doc) => {
          const data = JSON.parse(doc.data);
          const fieldValue = this.getNestedValue(data, field);
          return fieldValue === value;
        });
      } else if (afterExtract.includes(' IN (') || afterExtract.includes('IN(')) {
        paramIndex++;
        // Count placeholders in IN clause
        const inMatch = afterExtract.match(/IN \(([\?, ]+)\)/i);
        if (inMatch) {
          const placeholderCount = (inMatch[1].match(/\?/g) || []).length;
          const inValues = params.slice(paramIndex, paramIndex + placeholderCount);
          paramIndex += placeholderCount;
          results = results.filter((doc) => {
            const data = JSON.parse(doc.data);
            const fieldValue = this.getNestedValue(data, field);
            return inValues.includes(fieldValue);
          });
        }
      } else if (afterExtract.includes(' NOT IN (')) {
        paramIndex++;
        const inMatch = afterExtract.match(/NOT IN \(([\?, ]+)\)/i);
        if (inMatch) {
          const placeholderCount = (inMatch[1].match(/\?/g) || []).length;
          const inValues = params.slice(paramIndex, paramIndex + placeholderCount);
          paramIndex += placeholderCount;
          results = results.filter((doc) => {
            const data = JSON.parse(doc.data);
            const fieldValue = this.getNestedValue(data, field);
            return !inValues.includes(fieldValue);
          });
        }
      } else if (afterExtract.includes(' IS NOT NULL')) {
        paramIndex++;
        results = results.filter((doc) => {
          const data = JSON.parse(doc.data);
          const fieldValue = this.getNestedValue(data, field);
          return fieldValue !== undefined && fieldValue !== null;
        });
      } else if (afterExtract.includes(' IS NULL')) {
        paramIndex++;
        results = results.filter((doc) => {
          const data = JSON.parse(doc.data);
          const fieldValue = this.getNestedValue(data, field);
          return fieldValue === undefined || fieldValue === null;
        });
      } else {
        paramIndex++;
      }
    }

    return results;
  }

  /**
   * Get the SQL condition after the nth json_extract
   */
  private getConditionAfterNthJsonExtract(sql: string, n: number): string {
    const regex = /json_extract\(data,\s*\?\)/gi;
    let match;
    let count = 0;
    while ((match = regex.exec(sql)) !== null) {
      if (count === n) {
        return sql.substring(match.index + match[0].length);
      }
      count++;
    }
    return '';
  }

  /**
   * Find the parameter index for a specific condition
   */
  private findParamIndex(sql: string, condition: string): number {
    const sqlLower = sql.toLowerCase();
    const conditionLower = condition.toLowerCase();

    // Count '?' before the condition
    const index = sqlLower.indexOf(conditionLower);
    if (index === -1) return -1;

    const beforeCondition = sql.substring(0, index);
    // Count collection_id parameter (always first)
    const paramsBefore = (beforeCondition.match(/\?/g) || []).length;
    return paramsBefore;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;
    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  reset(): void {
    this.collections.clear();
    this.documents.clear();
    this.collectionIdCounter = 1;
    this.documentIdCounter = 1;
  }
}

function createMockState(db: InMemoryDatabase): MockState {
  const mockSql: MockSqlStorage = {
    exec: vi.fn((sql: string, ...params: unknown[]) => db.exec(sql, ...params)),
  };

  const mockStorage: MockStorage = {
    sql: mockSql,
    get: vi.fn().mockResolvedValue(1), // Schema already initialized
    put: vi.fn(),
  };

  const mockState: MockState = {
    storage: mockStorage,
    blockConcurrencyWhile: vi.fn(async (callback: () => Promise<void>) => {
      await callback();
    }),
  };

  return mockState;
}

describe('Document CRUD Operations', () => {
  let db: InMemoryDatabase;
  let mockState: MockState;
  let mondoDb: MondoDatabase;

  beforeEach(() => {
    db = new InMemoryDatabase();
    mockState = createMockState(db);
    mondoDb = new MondoDatabase(mockState as any, {} as any);
    vi.clearAllMocks();
  });

  describe('insertOne', () => {
    it('should store document with auto-generated _id', async () => {
      const result = await mondoDb.insertOne('users', { name: 'Alice', age: 30 });

      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBeDefined();
      expect(typeof result.insertedId).toBe('string');
      expect(result.insertedId.length).toBe(24); // ObjectId hex length

      // Verify document was stored
      const found = await mondoDb.findOne('users', { _id: result.insertedId });
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Alice');
      expect(found?.age).toBe(30);
      expect(found?._id).toBe(result.insertedId);
    });

    it('should store document with provided _id string', async () => {
      const customId = new ObjectId().toHexString();
      const result = await mondoDb.insertOne('users', { _id: customId, name: 'Bob' });

      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBe(customId);

      const found = await mondoDb.findOne('users', { _id: customId });
      expect(found?._id).toBe(customId);
      expect(found?.name).toBe('Bob');
    });

    it('should store document with provided ObjectId instance', async () => {
      const objectId = new ObjectId();
      const result = await mondoDb.insertOne('users', { _id: objectId, name: 'Carol' });

      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBe(objectId.toHexString());
    });

    it('should store nested document structure', async () => {
      const result = await mondoDb.insertOne('users', {
        name: 'Dave',
        address: {
          street: '123 Main St',
          city: 'NYC',
        },
      });

      const found = await mondoDb.findOne('users', { _id: result.insertedId });
      expect(found?.address).toEqual({ street: '123 Main St', city: 'NYC' });
    });
  });

  describe('insertMany', () => {
    it('should store multiple documents', async () => {
      const result = await mondoDb.insertMany('users', [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Carol' },
      ]);

      expect(result.acknowledged).toBe(true);
      expect(result.insertedCount).toBe(3);
      expect(result.insertedIds.length).toBe(3);

      // Each should have unique _id
      const uniqueIds = new Set(result.insertedIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('should store documents with mixed _id provisions', async () => {
      const customId = new ObjectId().toHexString();
      const result = await mondoDb.insertMany('users', [
        { name: 'Alice' }, // auto _id
        { _id: customId, name: 'Bob' }, // provided _id
        { name: 'Carol' }, // auto _id
      ]);

      expect(result.insertedCount).toBe(3);
      expect(result.insertedIds[1]).toBe(customId);
    });

    it('should handle empty array', async () => {
      const result = await mondoDb.insertMany('users', []);

      expect(result.acknowledged).toBe(true);
      expect(result.insertedCount).toBe(0);
      expect(result.insertedIds).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should retrieve document by _id', async () => {
      const insertResult = await mondoDb.insertOne('users', { name: 'Alice', age: 30 });

      const found = await mondoDb.findOne('users', { _id: insertResult.insertedId });

      expect(found).not.toBeNull();
      expect(found?._id).toBe(insertResult.insertedId);
      expect(found?.name).toBe('Alice');
      expect(found?.age).toBe(30);
    });

    it('should return null when document not found', async () => {
      const found = await mondoDb.findOne('users', { _id: 'nonexistent123456789012' });

      expect(found).toBeNull();
    });

    it('should return null for empty collection', async () => {
      const found = await mondoDb.findOne('empty_collection', {});

      expect(found).toBeNull();
    });

    it('should find by simple field value', async () => {
      await mondoDb.insertOne('users', { name: 'Alice', age: 30 });
      await mondoDb.insertOne('users', { name: 'Bob', age: 25 });

      const found = await mondoDb.findOne('users', { name: 'Bob' });

      expect(found).not.toBeNull();
      expect(found?.name).toBe('Bob');
    });
  });

  describe('find', () => {
    it('should retrieve all documents when no query specified', async () => {
      await mondoDb.insertMany('users', [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Carol' },
      ]);

      const results = await mondoDb.find('users', {});

      expect(results.length).toBe(3);
    });

    it('should retrieve documents by simple query', async () => {
      await mondoDb.insertMany('users', [
        { name: 'Alice', active: true },
        { name: 'Bob', active: false },
        { name: 'Carol', active: true },
      ]);

      const results = await mondoDb.find('users', { active: true });

      expect(results.length).toBe(2);
      expect(results.every((doc) => doc.active === true)).toBe(true);
    });

    it('should return empty array for non-existent collection', async () => {
      const results = await mondoDb.find('nonexistent', {});

      expect(results).toEqual([]);
    });

    it('should handle $eq operator', async () => {
      await mondoDb.insertMany('users', [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);

      const results = await mondoDb.find('users', { age: { $eq: 30 } });

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Alice');
    });

    it('should handle $gt operator', async () => {
      await mondoDb.insertMany('users', [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Carol', age: 35 },
      ]);

      const results = await mondoDb.find('users', { age: { $gt: 28 } });

      expect(results.length).toBe(2);
      expect(results.every((doc) => (doc.age as number) > 28)).toBe(true);
    });

    it('should handle $lt operator', async () => {
      await mondoDb.insertMany('users', [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);

      const results = await mondoDb.find('users', { age: { $lt: 28 } });

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Bob');
    });
  });

  describe('updateOne', () => {
    it('should modify document with $set', async () => {
      const insertResult = await mondoDb.insertOne('users', { name: 'Alice', age: 30 });

      const updateResult = await mondoDb.updateOne(
        'users',
        { _id: insertResult.insertedId },
        { $set: { age: 31 } }
      );

      expect(updateResult.acknowledged).toBe(true);
      expect(updateResult.matchedCount).toBe(1);
      expect(updateResult.modifiedCount).toBe(1);

      const found = await mondoDb.findOne('users', { _id: insertResult.insertedId });
      expect(found?.age).toBe(31);
      expect(found?.name).toBe('Alice'); // Original field preserved
    });

    it('should add new fields with $set', async () => {
      const insertResult = await mondoDb.insertOne('users', { name: 'Alice' });

      await mondoDb.updateOne(
        'users',
        { _id: insertResult.insertedId },
        { $set: { email: 'alice@example.com' } }
      );

      const found = await mondoDb.findOne('users', { _id: insertResult.insertedId });
      expect(found?.email).toBe('alice@example.com');
    });

    it('should handle $unset to remove fields', async () => {
      const insertResult = await mondoDb.insertOne('users', { name: 'Alice', temporary: true });

      await mondoDb.updateOne(
        'users',
        { _id: insertResult.insertedId },
        { $unset: { temporary: '' } }
      );

      const found = await mondoDb.findOne('users', { _id: insertResult.insertedId });
      expect(found?.name).toBe('Alice');
      expect('temporary' in (found || {})).toBe(false);
    });

    it('should return zero counts when document not found', async () => {
      const result = await mondoDb.updateOne(
        'users',
        { _id: 'nonexistent123456789012' },
        { $set: { name: 'Updated' } }
      );

      expect(result.acknowledged).toBe(true);
      expect(result.matchedCount).toBe(0);
      expect(result.modifiedCount).toBe(0);
    });

    it('should not modify _id field', async () => {
      const insertResult = await mondoDb.insertOne('users', { name: 'Alice' });
      const originalId = insertResult.insertedId;

      await mondoDb.updateOne(
        'users',
        { _id: originalId },
        { $set: { _id: 'newid123456789012345678' } }
      );

      const found = await mondoDb.findOne('users', { _id: originalId });
      expect(found?._id).toBe(originalId);
    });

    it('should handle nested field updates with dot notation', async () => {
      const insertResult = await mondoDb.insertOne('users', {
        name: 'Alice',
        address: { city: 'NYC', zip: '10001' },
      });

      await mondoDb.updateOne(
        'users',
        { _id: insertResult.insertedId },
        { $set: { 'address.city': 'LA' } }
      );

      const found = await mondoDb.findOne('users', { _id: insertResult.insertedId });
      expect((found?.address as { city: string })?.city).toBe('LA');
      expect((found?.address as { zip: string })?.zip).toBe('10001');
    });
  });

  describe('deleteOne', () => {
    it('should remove document by _id', async () => {
      const insertResult = await mondoDb.insertOne('users', { name: 'Alice' });

      const deleteResult = await mondoDb.deleteOne('users', { _id: insertResult.insertedId });

      expect(deleteResult.acknowledged).toBe(true);
      expect(deleteResult.deletedCount).toBe(1);

      const found = await mondoDb.findOne('users', { _id: insertResult.insertedId });
      expect(found).toBeNull();
    });

    it('should remove document by field query', async () => {
      await mondoDb.insertOne('users', { name: 'Alice', toDelete: true });
      await mondoDb.insertOne('users', { name: 'Bob', toDelete: false });

      const deleteResult = await mondoDb.deleteOne('users', { toDelete: true });

      expect(deleteResult.deletedCount).toBe(1);

      const results = await mondoDb.find('users', {});
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Bob');
    });

    it('should return zero count when document not found', async () => {
      const result = await mondoDb.deleteOne('users', { _id: 'nonexistent123456789012' });

      expect(result.acknowledged).toBe(true);
      expect(result.deletedCount).toBe(0);
    });

    it('should only delete one document when multiple match', async () => {
      await mondoDb.insertMany('users', [
        { category: 'A' },
        { category: 'A' },
        { category: 'A' },
      ]);

      const deleteResult = await mondoDb.deleteOne('users', { category: 'A' });

      expect(deleteResult.deletedCount).toBe(1);

      const remaining = await mondoDb.find('users', {});
      expect(remaining.length).toBe(2);
    });
  });

  describe('JSON field extraction', () => {
    it('should query nested fields with dot notation', async () => {
      await mondoDb.insertMany('users', [
        { name: 'Alice', profile: { level: 'admin' } },
        { name: 'Bob', profile: { level: 'user' } },
      ]);

      const results = await mondoDb.find('users', { 'profile.level': 'admin' });

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Alice');
    });

    it('should handle deeply nested paths', async () => {
      await mondoDb.insertOne('config', {
        settings: {
          notifications: {
            email: { enabled: true },
          },
        },
      });

      const found = await mondoDb.findOne('config', { 'settings.notifications.email.enabled': true });

      expect(found).not.toBeNull();
    });

    it('should handle array values in documents', async () => {
      const result = await mondoDb.insertOne('posts', {
        title: 'Hello',
        tags: ['javascript', 'nodejs'],
      });

      const found = await mondoDb.findOne('posts', { _id: result.insertedId });

      expect(found?.tags).toEqual(['javascript', 'nodejs']);
    });

    it('should handle null values', async () => {
      await mondoDb.insertOne('users', { name: 'Alice', middleName: null });

      const found = await mondoDb.findOne('users', { name: 'Alice' });

      expect(found?.middleName).toBeNull();
    });

    it('should handle boolean values', async () => {
      await mondoDb.insertMany('users', [
        { name: 'Alice', active: true },
        { name: 'Bob', active: false },
      ]);

      const activeUsers = await mondoDb.find('users', { active: true });
      const inactiveUsers = await mondoDb.find('users', { active: false });

      expect(activeUsers.length).toBe(1);
      expect(activeUsers[0].name).toBe('Alice');
      expect(inactiveUsers.length).toBe(1);
      expect(inactiveUsers[0].name).toBe('Bob');
    });

    it('should handle numeric values correctly', async () => {
      await mondoDb.insertMany('products', [
        { name: 'Widget', price: 9.99 },
        { name: 'Gadget', price: 19.99 },
        { name: 'Thing', price: 9.99 },
      ]);

      const results = await mondoDb.find('products', { price: 9.99 });

      expect(results.length).toBe(2);
    });
  });

  describe('Collection isolation', () => {
    it('should keep documents separate between collections', async () => {
      await mondoDb.insertOne('users', { name: 'Alice', type: 'user' });
      await mondoDb.insertOne('admins', { name: 'Alice', type: 'admin' });

      const users = await mondoDb.find('users', {});
      const admins = await mondoDb.find('admins', {});

      expect(users.length).toBe(1);
      expect(users[0].type).toBe('user');
      expect(admins.length).toBe(1);
      expect(admins[0].type).toBe('admin');
    });

    it('should create collection implicitly on first insert', async () => {
      // No explicit collection creation needed
      const result = await mondoDb.insertOne('new_collection', { data: 'test' });

      expect(result.acknowledged).toBe(true);

      const found = await mondoDb.findOne('new_collection', { _id: result.insertedId });
      expect(found?.data).toBe('test');
    });
  });
});
