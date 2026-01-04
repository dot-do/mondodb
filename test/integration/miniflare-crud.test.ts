/**
 * Integration tests for CRUD operations with Miniflare
 *
 * These tests verify MongoDB-compatible CRUD operations work correctly
 * in the Miniflare environment matching production behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { createTestDatabase, isolation } from '../helpers/miniflare';

describe('Miniflare CRUD Operations', () => {
  describe('insertOne', () => {
    it('should insert document with auto-generated _id', async () => {
      const db = await createTestDatabase();

      const result = await db.insertOne('users', { name: 'Alice', age: 30 });

      expect(result.insertedId).toBeDefined();
      expect(typeof result.insertedId).toBe('string');
      expect(result.insertedId.length).toBe(24);
    });

    it('should insert document with provided _id', async () => {
      const db = await createTestDatabase();
      const customId = '507f1f77bcf86cd799439011';

      const result = await db.insertOne('users', { _id: customId, name: 'Bob' });

      expect(result.insertedId).toBe(customId);
    });

    it('should store and retrieve document data correctly', async () => {
      const db = await createTestDatabase();

      const result = await db.insertOne('users', { name: 'Charlie', email: 'charlie@test.com' });
      const doc = await db.findOne('users', { _id: result.insertedId });

      expect(doc).not.toBeNull();
      expect(doc!.name).toBe('Charlie');
      expect(doc!.email).toBe('charlie@test.com');
      expect(doc!._id).toBe(result.insertedId);
    });
  });

  describe('findOne', () => {
    it('should find document by _id', async () => {
      const db = await createTestDatabase();
      const { insertedId } = await db.insertOne('users', { name: 'Dave' });

      const doc = await db.findOne('users', { _id: insertedId });

      expect(doc).not.toBeNull();
      expect(doc!.name).toBe('Dave');
    });

    it('should find document by field value', async () => {
      const db = await createTestDatabase();
      await db.insertOne('users', { name: 'Eve', role: 'admin' });
      await db.insertOne('users', { name: 'Frank', role: 'user' });

      const doc = await db.findOne('users', { role: 'admin' });

      expect(doc).not.toBeNull();
      expect(doc!.name).toBe('Eve');
    });

    it('should return null when document not found', async () => {
      const db = await createTestDatabase();

      const doc = await db.findOne('users', { name: 'NonExistent' });

      expect(doc).toBeNull();
    });

    it('should return null for empty collection', async () => {
      const db = await createTestDatabase();

      const doc = await db.findOne('empty_collection', {});

      expect(doc).toBeNull();
    });
  });

  describe('find', () => {
    it('should find all documents when filter is empty', async () => {
      const db = await createTestDatabase();
      await db.insertOne('items', { name: 'Item 1' });
      await db.insertOne('items', { name: 'Item 2' });
      await db.insertOne('items', { name: 'Item 3' });

      const result = await db.find('items');

      expect(result.documents).toHaveLength(3);
    });

    it('should find documents matching filter', async () => {
      const db = await createTestDatabase();
      await db.insertOne('products', { category: 'A', price: 10 });
      await db.insertOne('products', { category: 'B', price: 20 });
      await db.insertOne('products', { category: 'A', price: 30 });

      const result = await db.find('products', { category: 'A' });

      expect(result.documents).toHaveLength(2);
      expect(result.documents.every(d => d.category === 'A')).toBe(true);
    });

    it('should return empty array for non-existent collection', async () => {
      const db = await createTestDatabase();

      const result = await db.find('nonexistent');

      expect(result.documents).toEqual([]);
    });
  });

  describe('updateOne', () => {
    it('should update document with $set', async () => {
      const db = await createTestDatabase();
      const { insertedId } = await db.insertOne('users', { name: 'Grace', status: 'pending' });

      const result = await db.updateOne('users', { _id: insertedId }, { $set: { status: 'active' } });

      expect(result.matchedCount).toBe(1);
      expect(result.modifiedCount).toBe(1);

      const doc = await db.findOne('users', { _id: insertedId });
      expect(doc!.status).toBe('active');
      expect(doc!.name).toBe('Grace'); // Original field preserved
    });

    it('should add new field with $set', async () => {
      const db = await createTestDatabase();
      const { insertedId } = await db.insertOne('users', { name: 'Henry' });

      await db.updateOne('users', { _id: insertedId }, { $set: { email: 'henry@test.com' } });

      const doc = await db.findOne('users', { _id: insertedId });
      expect(doc!.email).toBe('henry@test.com');
    });

    it('should return zero counts when document not found', async () => {
      const db = await createTestDatabase();

      const result = await db.updateOne('users', { _id: 'nonexistent12345678901234' }, { $set: { name: 'Test' } });

      expect(result.matchedCount).toBe(0);
      expect(result.modifiedCount).toBe(0);
    });
  });

  describe('deleteOne', () => {
    it('should delete document by _id', async () => {
      const db = await createTestDatabase();
      const { insertedId } = await db.insertOne('users', { name: 'Ivan' });

      const result = await db.deleteOne('users', { _id: insertedId });

      expect(result.deletedCount).toBe(1);

      const doc = await db.findOne('users', { _id: insertedId });
      expect(doc).toBeNull();
    });

    it('should delete only one document when multiple match', async () => {
      const db = await createTestDatabase();
      await db.insertOne('items', { category: 'test' });
      await db.insertOne('items', { category: 'test' });
      await db.insertOne('items', { category: 'test' });

      const result = await db.deleteOne('items', { category: 'test' });

      expect(result.deletedCount).toBe(1);
      expect(await db.countDocuments('items')).toBe(2);
    });

    it('should return zero count when document not found', async () => {
      const db = await createTestDatabase();

      const result = await db.deleteOne('users', { _id: 'nonexistent12345678901234' });

      expect(result.deletedCount).toBe(0);
    });
  });

  describe('deleteMany', () => {
    it('should delete all documents when filter is empty', async () => {
      const db = await createTestDatabase();
      await db.insertOne('temp', { data: 1 });
      await db.insertOne('temp', { data: 2 });
      await db.insertOne('temp', { data: 3 });

      const result = await db.deleteMany('temp');

      expect(result.deletedCount).toBe(3);
      expect(await db.countDocuments('temp')).toBe(0);
    });

    it('should delete matching documents only', async () => {
      const db = await createTestDatabase();
      await db.insertOne('items', { type: 'a', value: 1 });
      await db.insertOne('items', { type: 'b', value: 2 });
      await db.insertOne('items', { type: 'a', value: 3 });

      const result = await db.deleteMany('items', { type: 'a' });

      expect(result.deletedCount).toBe(2);
      expect(await db.countDocuments('items')).toBe(1);

      const remaining = await db.find('items');
      expect(remaining.documents[0].type).toBe('b');
    });
  });

  describe('countDocuments', () => {
    it('should count all documents when filter is empty', async () => {
      const db = await createTestDatabase();
      await db.insertOne('users', { name: 'A' });
      await db.insertOne('users', { name: 'B' });
      await db.insertOne('users', { name: 'C' });

      const count = await db.countDocuments('users');

      expect(count).toBe(3);
    });

    it('should count matching documents', async () => {
      const db = await createTestDatabase();
      await db.insertOne('users', { name: 'A', active: true });
      await db.insertOne('users', { name: 'B', active: false });
      await db.insertOne('users', { name: 'C', active: true });

      const count = await db.countDocuments('users', { active: true });

      expect(count).toBe(2);
    });

    it('should return 0 for empty collection', async () => {
      const db = await createTestDatabase();

      const count = await db.countDocuments('empty');

      expect(count).toBe(0);
    });
  });

  describe('Collection isolation', () => {
    it('should keep documents in separate collections', async () => {
      const db = await createTestDatabase();

      await db.insertOne('collection1', { data: 'a' });
      await db.insertOne('collection2', { data: 'b' });

      const col1 = await db.find('collection1');
      const col2 = await db.find('collection2');

      expect(col1.documents).toHaveLength(1);
      expect(col2.documents).toHaveLength(1);
      expect(col1.documents[0].data).toBe('a');
      expect(col2.documents[0].data).toBe('b');
    });
  });

  describe('Parallel test isolation', () => {
    it('should isolate data between database instances', async () => {
      const db1 = await isolation.createIsolatedContext('parallel-1');
      const db2 = await isolation.createIsolatedContext('parallel-2');

      await db1.insertOne('shared', { source: 'db1' });
      await db2.insertOne('shared', { source: 'db2' });

      const doc1 = await db1.findOne('shared', {});
      const doc2 = await db2.findOne('shared', {});

      expect(doc1!.source).toBe('db1');
      expect(doc2!.source).toBe('db2');
    });
  });
});
