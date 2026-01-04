/**
 * Integration tests for file system persistence
 *
 * These tests verify that Durable Object data persists correctly between operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { createTestDatabase } from '../helpers/miniflare';

describe('File System Persistence', () => {
  describe('Data persistence within same DO instance', () => {
    it('should persist inserted document', async () => {
      const db = await createTestDatabase({ name: 'persist-test-1' });

      // Insert a document
      const result = await db.insertOne('users', { name: 'Alice', age: 30 });
      expect(result.insertedId).toBeDefined();

      // Verify it can be retrieved
      const doc = await db.findOne('users', { name: 'Alice' });
      expect(doc).toBeDefined();
      expect(doc!.name).toBe('Alice');
      expect(doc!.age).toBe(30);
    });

    it('should persist multiple documents', async () => {
      const db = await createTestDatabase({ name: 'persist-test-2' });

      // Insert multiple documents
      await db.insertOne('products', { name: 'Widget', price: 10 });
      await db.insertOne('products', { name: 'Gadget', price: 20 });
      await db.insertOne('products', { name: 'Gizmo', price: 30 });

      // Verify all can be retrieved
      const result = await db.find('products');
      expect(result.documents).toHaveLength(3);
    });

    it('should persist updates', async () => {
      const db = await createTestDatabase({ name: 'persist-test-3' });

      // Insert and update
      await db.insertOne('users', { name: 'Bob', status: 'pending' });
      await db.updateOne('users', { name: 'Bob' }, { $set: { status: 'active' } });

      // Verify update persisted
      const doc = await db.findOne('users', { name: 'Bob' });
      expect(doc).toBeDefined();
      expect(doc!.status).toBe('active');
    });

    it('should persist deletes', async () => {
      const db = await createTestDatabase({ name: 'persist-test-4' });

      // Insert and delete
      await db.insertOne('temp', { data: 'to-delete' });
      await db.deleteOne('temp', { data: 'to-delete' });

      // Verify deletion persisted
      const doc = await db.findOne('temp', { data: 'to-delete' });
      expect(doc).toBeNull();
    });
  });

  describe('Persistence across operations', () => {
    it('should maintain data integrity across sequential operations', async () => {
      const db = await createTestDatabase({ name: 'integrity-test' });

      // Sequence of operations
      await db.insertOne('orders', { orderId: 1, status: 'created' });
      await db.updateOne('orders', { orderId: 1 }, { $set: { status: 'processing' } });
      await db.insertOne('orders', { orderId: 2, status: 'created' });
      await db.updateOne('orders', { orderId: 1 }, { $set: { status: 'completed' } });

      // Verify final state
      const order1 = await db.findOne('orders', { orderId: 1 });
      const order2 = await db.findOne('orders', { orderId: 2 });

      expect(order1!.status).toBe('completed');
      expect(order2!.status).toBe('created');
    });

    it('should correctly count documents after operations', async () => {
      const db = await createTestDatabase({ name: 'count-test' });

      await db.insertOne('items', { id: 1 });
      await db.insertOne('items', { id: 2 });
      await db.insertOne('items', { id: 3 });

      expect(await db.countDocuments('items')).toBe(3);

      await db.deleteOne('items', { id: 2 });

      expect(await db.countDocuments('items')).toBe(2);
    });
  });

  describe('Collection isolation', () => {
    it('should keep collections separate', async () => {
      const db = await createTestDatabase({ name: 'collection-isolation' });

      await db.insertOne('collection1', { data: 'a' });
      await db.insertOne('collection2', { data: 'b' });

      const col1Docs = await db.find('collection1');
      const col2Docs = await db.find('collection2');

      expect(col1Docs.documents).toHaveLength(1);
      expect(col2Docs.documents).toHaveLength(1);
      expect(col1Docs.documents[0].data).toBe('a');
      expect(col2Docs.documents[0].data).toBe('b');
    });

    it('should not affect other collections when deleting', async () => {
      const db = await createTestDatabase({ name: 'delete-isolation' });

      await db.insertOne('keep', { id: 1 });
      await db.insertOne('remove', { id: 1 });

      await db.deleteMany('remove');

      expect(await db.countDocuments('keep')).toBe(1);
      expect(await db.countDocuments('remove')).toBe(0);
    });
  });
});
