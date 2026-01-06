/**
 * LibSQL Storage Adapter CRUD Operations Tests (RED Phase)
 *
 * TDD RED: These tests define the LibSQLStorageAdapter behavior for document CRUD operations.
 * They will fail until the adapter is implemented in src/storage/libsql-adapter.ts
 *
 * Issue: mondodb-hw5i - RED: Test libSQL document CRUD operations
 *
 * Tests use in-memory SQLite (`:memory:`) for fast execution.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// This import will fail initially - RED phase
// The LibSQLStorageAdapter doesn't exist yet and must be created to make tests pass
import { LibSQLStorageAdapter } from '../../../src/storage/libsql-adapter'

// Import types from the storage types (assumed to exist from previous TDD work)
import type {
  StorageAdapter,
  Document,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
} from '../../../src/storage/types'

describe('LibSQLStorageAdapter CRUD Operations', () => {
  let adapter: LibSQLStorageAdapter

  beforeEach(async () => {
    // Create a new in-memory adapter for each test
    adapter = new LibSQLStorageAdapter(':memory:')
    await adapter.initialize()
  })

  afterEach(async () => {
    if (adapter) {
      await adapter.close()
    }
  })

  describe('Interface Implementation', () => {
    it('implements StorageAdapter interface', () => {
      // Verify the adapter implements all required methods
      expect(adapter).toHaveProperty('insertOne')
      expect(adapter).toHaveProperty('insertMany')
      expect(adapter).toHaveProperty('findOne')
      expect(adapter).toHaveProperty('find')
      expect(adapter).toHaveProperty('updateOne')
      expect(adapter).toHaveProperty('updateMany')
      expect(adapter).toHaveProperty('deleteOne')
      expect(adapter).toHaveProperty('deleteMany')
      expect(adapter).toHaveProperty('countDocuments')
      expect(adapter).toHaveProperty('close')

      // Type check: adapter should satisfy StorageAdapter interface
      const storageAdapter: StorageAdapter = adapter
      expect(storageAdapter).toBeDefined()
    })

    it('is instantiable with connection string', () => {
      const memoryAdapter = new LibSQLStorageAdapter(':memory:')
      expect(memoryAdapter).toBeInstanceOf(LibSQLStorageAdapter)
    })

    it('supports in-memory database with :memory:', () => {
      const memoryAdapter = new LibSQLStorageAdapter(':memory:')
      expect(memoryAdapter).toBeDefined()
    })
  })

  describe('insertOne', () => {
    it('inserts a document and returns InsertOneResult', async () => {
      const doc = { name: 'Test User', email: 'test@example.com' }
      const result = await adapter.insertOne('users', doc)

      expect(result).toBeDefined()
      expect(result.acknowledged).toBe(true)
      expect(result.insertedId).toBeDefined()
      expect(typeof result.insertedId).toBe('string')
    })

    it('generates _id if not provided', async () => {
      const doc = { name: 'Auto ID User' }
      const result = await adapter.insertOne('users', doc)

      expect(result.insertedId).toBeDefined()
      expect(result.insertedId.length).toBeGreaterThan(0)
    })

    it('uses provided _id if specified', async () => {
      const customId = 'custom-id-12345'
      const doc = { _id: customId, name: 'Custom ID User' }
      const result = await adapter.insertOne('users', doc)

      expect(result.insertedId).toBe(customId)
    })

    it('stores document that can be retrieved', async () => {
      const doc = { name: 'Retrievable', value: 42 }
      const insertResult = await adapter.insertOne('users', doc)

      const found = await adapter.findOne('users', { _id: insertResult.insertedId })
      expect(found).not.toBeNull()
      expect(found?.name).toBe('Retrievable')
      expect(found?.value).toBe(42)
    })

    it('handles complex nested documents', async () => {
      const doc = {
        user: {
          profile: {
            name: 'Nested User',
            settings: {
              theme: 'dark',
              notifications: true,
            },
          },
        },
        tags: ['admin', 'active'],
        metadata: {
          createdAt: '2024-01-01',
          version: 1,
        },
      }
      const result = await adapter.insertOne('complex', doc)

      expect(result.acknowledged).toBe(true)
      const found = await adapter.findOne('complex', { _id: result.insertedId })
      expect(found?.user?.profile?.name).toBe('Nested User')
      expect(found?.tags).toEqual(['admin', 'active'])
    })

    it('handles null and undefined values', async () => {
      const doc = { name: 'Null Test', optional: null }
      const result = await adapter.insertOne('users', doc)

      const found = await adapter.findOne('users', { _id: result.insertedId })
      expect(found?.optional).toBeNull()
    })

    it('throws error on duplicate _id', async () => {
      const customId = 'duplicate-id'
      await adapter.insertOne('users', { _id: customId, name: 'First' })

      await expect(
        adapter.insertOne('users', { _id: customId, name: 'Second' })
      ).rejects.toThrow()
    })
  })

  describe('insertMany', () => {
    it('inserts multiple documents and returns InsertManyResult', async () => {
      const docs = [
        { name: 'User 1', value: 1 },
        { name: 'User 2', value: 2 },
        { name: 'User 3', value: 3 },
      ]
      const result = await adapter.insertMany('users', docs)

      expect(result).toBeDefined()
      expect(result.acknowledged).toBe(true)
      expect(result.insertedCount).toBe(3)
      expect(Object.keys(result.insertedIds).length).toBe(3)
    })

    it('returns insertedIds keyed by index', async () => {
      const docs = [{ name: 'A' }, { name: 'B' }]
      const result = await adapter.insertMany('users', docs)

      expect(result.insertedIds[0]).toBeDefined()
      expect(result.insertedIds[1]).toBeDefined()
      expect(result.insertedIds[0]).not.toBe(result.insertedIds[1])
    })

    it('handles empty array', async () => {
      const result = await adapter.insertMany('users', [])

      expect(result.acknowledged).toBe(true)
      expect(result.insertedCount).toBe(0)
      expect(Object.keys(result.insertedIds).length).toBe(0)
    })

    it('all inserted documents can be retrieved', async () => {
      const docs = [
        { name: 'Find 1', group: 'batch' },
        { name: 'Find 2', group: 'batch' },
        { name: 'Find 3', group: 'batch' },
      ]
      await adapter.insertMany('users', docs)

      const found = await adapter.find('users', { group: 'batch' })
      expect(found.length).toBe(3)
    })

    it('preserves order of insertedIds', async () => {
      const docs = [
        { _id: 'id-0', name: 'First' },
        { _id: 'id-1', name: 'Second' },
        { _id: 'id-2', name: 'Third' },
      ]
      const result = await adapter.insertMany('users', docs)

      expect(result.insertedIds[0]).toBe('id-0')
      expect(result.insertedIds[1]).toBe('id-1')
      expect(result.insertedIds[2]).toBe('id-2')
    })
  })

  describe('findOne', () => {
    beforeEach(async () => {
      await adapter.insertMany('users', [
        { _id: 'user-1', name: 'Alice', age: 30, role: 'admin' },
        { _id: 'user-2', name: 'Bob', age: 25, role: 'user' },
        { _id: 'user-3', name: 'Charlie', age: 35, role: 'user' },
      ])
    })

    it('finds document by _id', async () => {
      const doc = await adapter.findOne('users', { _id: 'user-1' })

      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('Alice')
      expect(doc?._id).toBe('user-1')
    })

    it('finds document by single field', async () => {
      const doc = await adapter.findOne('users', { name: 'Bob' })

      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('Bob')
      expect(doc?.age).toBe(25)
    })

    it('finds document by multiple fields (implicit AND)', async () => {
      const doc = await adapter.findOne('users', { role: 'user', age: 25 })

      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('Bob')
    })

    it('returns null when no document matches', async () => {
      const doc = await adapter.findOne('users', { name: 'NonExistent' })

      expect(doc).toBeNull()
    })

    it('returns null for empty collection', async () => {
      const doc = await adapter.findOne('empty_collection', { field: 'value' })

      expect(doc).toBeNull()
    })

    it('returns first matching document when multiple match', async () => {
      const doc = await adapter.findOne('users', { role: 'user' })

      expect(doc).not.toBeNull()
      // Should return one of the users with role 'user'
      expect(['Bob', 'Charlie']).toContain(doc?.name)
    })

    it('supports $eq operator', async () => {
      const doc = await adapter.findOne('users', { age: { $eq: 30 } })

      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('Alice')
    })

    it('supports $gt operator', async () => {
      const doc = await adapter.findOne('users', { age: { $gt: 30 } })

      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('Charlie')
    })

    it('supports $gte operator', async () => {
      const doc = await adapter.findOne('users', { age: { $gte: 35 } })

      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('Charlie')
    })

    it('supports $lt operator', async () => {
      const doc = await adapter.findOne('users', { age: { $lt: 30 } })

      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('Bob')
    })

    it('supports $lte operator', async () => {
      const doc = await adapter.findOne('users', { age: { $lte: 25 } })

      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('Bob')
    })

    it('supports $ne operator', async () => {
      const doc = await adapter.findOne('users', { name: { $ne: 'Alice' }, role: 'user' })

      expect(doc).not.toBeNull()
      expect(doc?.name).not.toBe('Alice')
    })

    it('supports $in operator', async () => {
      const doc = await adapter.findOne('users', { name: { $in: ['Alice', 'Charlie'] } })

      expect(doc).not.toBeNull()
      expect(['Alice', 'Charlie']).toContain(doc?.name)
    })

    it('supports $nin operator', async () => {
      const doc = await adapter.findOne('users', { name: { $nin: ['Alice', 'Charlie'] } })

      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('Bob')
    })
  })

  describe('find', () => {
    beforeEach(async () => {
      await adapter.insertMany('products', [
        { _id: 'p1', name: 'Apple', category: 'fruit', price: 1.50, inStock: true },
        { _id: 'p2', name: 'Banana', category: 'fruit', price: 0.75, inStock: true },
        { _id: 'p3', name: 'Carrot', category: 'vegetable', price: 0.50, inStock: true },
        { _id: 'p4', name: 'Donut', category: 'bakery', price: 2.00, inStock: false },
        { _id: 'p5', name: 'Egg', category: 'dairy', price: 3.00, inStock: true },
      ])
    })

    it('returns all documents with empty filter', async () => {
      const docs = await adapter.find('products', {})

      expect(docs.length).toBe(5)
    })

    it('filters documents by single field', async () => {
      const docs = await adapter.find('products', { category: 'fruit' })

      expect(docs.length).toBe(2)
      expect(docs.every(d => d.category === 'fruit')).toBe(true)
    })

    it('filters documents by multiple fields', async () => {
      const docs = await adapter.find('products', { category: 'fruit', inStock: true })

      expect(docs.length).toBe(2)
    })

    it('returns empty array when no documents match', async () => {
      const docs = await adapter.find('products', { category: 'nonexistent' })

      expect(docs).toEqual([])
    })

    it('returns empty array for empty collection', async () => {
      const docs = await adapter.find('empty_collection', {})

      expect(docs).toEqual([])
    })

    it('supports limit option', async () => {
      const docs = await adapter.find('products', {}, { limit: 2 })

      expect(docs.length).toBe(2)
    })

    it('supports skip option', async () => {
      const docs = await adapter.find('products', {}, { skip: 3 })

      expect(docs.length).toBe(2)
    })

    it('supports skip and limit together', async () => {
      const docs = await adapter.find('products', {}, { skip: 1, limit: 2 })

      expect(docs.length).toBe(2)
    })

    it('supports sort option ascending', async () => {
      const docs = await adapter.find('products', {}, { sort: { price: 1 } })

      expect(docs[0].price).toBe(0.50)
      expect(docs[docs.length - 1].price).toBe(3.00)
    })

    it('supports sort option descending', async () => {
      const docs = await adapter.find('products', {}, { sort: { price: -1 } })

      expect(docs[0].price).toBe(3.00)
      expect(docs[docs.length - 1].price).toBe(0.50)
    })

    it('supports $gt operator', async () => {
      const docs = await adapter.find('products', { price: { $gt: 1.00 } })

      expect(docs.length).toBe(3)
      expect(docs.every(d => d.price > 1.00)).toBe(true)
    })

    it('supports $lt operator', async () => {
      const docs = await adapter.find('products', { price: { $lt: 1.00 } })

      expect(docs.length).toBe(2)
      expect(docs.every(d => d.price < 1.00)).toBe(true)
    })

    it('supports $in operator', async () => {
      const docs = await adapter.find('products', { category: { $in: ['fruit', 'dairy'] } })

      expect(docs.length).toBe(3)
    })

    it('supports $and operator', async () => {
      const docs = await adapter.find('products', {
        $and: [{ price: { $gt: 0.50 } }, { price: { $lt: 2.00 } }],
      })

      expect(docs.length).toBe(2)
      expect(docs.every(d => d.price > 0.50 && d.price < 2.00)).toBe(true)
    })

    it('supports $or operator', async () => {
      const docs = await adapter.find('products', {
        $or: [{ category: 'fruit' }, { category: 'dairy' }],
      })

      expect(docs.length).toBe(3)
    })

    it('supports projection to include fields', async () => {
      const docs = await adapter.find('products', {}, { projection: { name: 1, price: 1 } })

      expect(docs.length).toBe(5)
      // All docs should have name and price (and _id by default)
      docs.forEach(doc => {
        expect(doc).toHaveProperty('name')
        expect(doc).toHaveProperty('price')
      })
    })

    it('supports projection to exclude fields', async () => {
      const docs = await adapter.find('products', {}, { projection: { inStock: 0 } })

      expect(docs.length).toBe(5)
      docs.forEach(doc => {
        expect(doc).not.toHaveProperty('inStock')
      })
    })
  })

  describe('updateOne', () => {
    beforeEach(async () => {
      await adapter.insertMany('users', [
        { _id: 'u1', name: 'Alice', score: 100, status: 'active' },
        { _id: 'u2', name: 'Bob', score: 200, status: 'active' },
        { _id: 'u3', name: 'Charlie', score: 150, status: 'inactive' },
      ])
    })

    it('updates a single document with $set', async () => {
      const result = await adapter.updateOne('users', { _id: 'u1' }, { $set: { score: 150 } })

      expect(result.acknowledged).toBe(true)
      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)

      const doc = await adapter.findOne('users', { _id: 'u1' })
      expect(doc?.score).toBe(150)
    })

    it('returns zero counts when no document matches', async () => {
      const result = await adapter.updateOne(
        'users',
        { _id: 'nonexistent' },
        { $set: { score: 0 } }
      )

      expect(result.matchedCount).toBe(0)
      expect(result.modifiedCount).toBe(0)
    })

    it('updates only first matching document', async () => {
      const result = await adapter.updateOne(
        'users',
        { status: 'active' },
        { $set: { status: 'verified' } }
      )

      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)

      // Should still have one active user
      const stillActive = await adapter.find('users', { status: 'active' })
      expect(stillActive.length).toBe(1)
    })

    it('supports $inc operator', async () => {
      await adapter.updateOne('users', { _id: 'u1' }, { $inc: { score: 50 } })

      const doc = await adapter.findOne('users', { _id: 'u1' })
      expect(doc?.score).toBe(150)
    })

    it('supports $unset operator', async () => {
      await adapter.updateOne('users', { _id: 'u1' }, { $unset: { status: '' } })

      const doc = await adapter.findOne('users', { _id: 'u1' })
      expect(doc?.status).toBeUndefined()
    })

    it('supports $push operator', async () => {
      await adapter.insertOne('users', { _id: 'u4', name: 'Dave', tags: ['a'] })
      await adapter.updateOne('users', { _id: 'u4' }, { $push: { tags: 'b' } })

      const doc = await adapter.findOne('users', { _id: 'u4' })
      expect(doc?.tags).toEqual(['a', 'b'])
    })

    it('supports $pull operator', async () => {
      await adapter.insertOne('users', { _id: 'u5', name: 'Eve', tags: ['a', 'b', 'c'] })
      await adapter.updateOne('users', { _id: 'u5' }, { $pull: { tags: 'b' } })

      const doc = await adapter.findOne('users', { _id: 'u5' })
      expect(doc?.tags).toEqual(['a', 'c'])
    })

    it('supports upsert option - insert when not exists', async () => {
      const result = await adapter.updateOne(
        'users',
        { _id: 'new-user' },
        { $set: { name: 'New User', score: 0 } },
        { upsert: true }
      )

      expect(result.upsertedCount).toBe(1)
      expect(result.upsertedId).toBe('new-user')

      const doc = await adapter.findOne('users', { _id: 'new-user' })
      expect(doc?.name).toBe('New User')
    })

    it('supports upsert option - update when exists', async () => {
      const result = await adapter.updateOne(
        'users',
        { _id: 'u1' },
        { $set: { name: 'Updated Alice' } },
        { upsert: true }
      )

      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)
      expect(result.upsertedCount).toBe(0)
    })

    it('supports multiple update operators in one call', async () => {
      await adapter.updateOne(
        'users',
        { _id: 'u1' },
        {
          $set: { status: 'premium' },
          $inc: { score: 100 },
        }
      )

      const doc = await adapter.findOne('users', { _id: 'u1' })
      expect(doc?.status).toBe('premium')
      expect(doc?.score).toBe(200)
    })
  })

  describe('updateMany', () => {
    beforeEach(async () => {
      await adapter.insertMany('orders', [
        { _id: 'o1', status: 'pending', amount: 100 },
        { _id: 'o2', status: 'pending', amount: 200 },
        { _id: 'o3', status: 'pending', amount: 150 },
        { _id: 'o4', status: 'completed', amount: 300 },
        { _id: 'o5', status: 'completed', amount: 250 },
      ])
    })

    it('updates multiple documents', async () => {
      const result = await adapter.updateMany(
        'orders',
        { status: 'pending' },
        { $set: { status: 'processing' } }
      )

      expect(result.acknowledged).toBe(true)
      expect(result.matchedCount).toBe(3)
      expect(result.modifiedCount).toBe(3)
    })

    it('all matching documents are updated', async () => {
      await adapter.updateMany('orders', { status: 'pending' }, { $set: { priority: 'high' } })

      const docs = await adapter.find('orders', { priority: 'high' })
      expect(docs.length).toBe(3)
    })

    it('returns zero counts when no documents match', async () => {
      const result = await adapter.updateMany(
        'orders',
        { status: 'nonexistent' },
        { $set: { flag: true } }
      )

      expect(result.matchedCount).toBe(0)
      expect(result.modifiedCount).toBe(0)
    })

    it('updates all documents with empty filter', async () => {
      const result = await adapter.updateMany('orders', {}, { $set: { reviewed: true } })

      expect(result.matchedCount).toBe(5)
      expect(result.modifiedCount).toBe(5)
    })

    it('supports $inc operator on multiple documents', async () => {
      await adapter.updateMany('orders', { status: 'pending' }, { $inc: { amount: 10 } })

      const docs = await adapter.find('orders', { status: 'pending' })
      expect(docs[0].amount).toBe(110)
      expect(docs[1].amount).toBe(210)
      expect(docs[2].amount).toBe(160)
    })

    it('supports complex filters', async () => {
      const result = await adapter.updateMany(
        'orders',
        { $and: [{ status: 'completed' }, { amount: { $gte: 250 } }] },
        { $set: { tier: 'premium' } }
      )

      expect(result.matchedCount).toBe(2)
    })
  })

  describe('deleteOne', () => {
    beforeEach(async () => {
      await adapter.insertMany('items', [
        { _id: 'i1', name: 'Item 1', category: 'A' },
        { _id: 'i2', name: 'Item 2', category: 'A' },
        { _id: 'i3', name: 'Item 3', category: 'B' },
      ])
    })

    it('deletes a single document', async () => {
      const result = await adapter.deleteOne('items', { _id: 'i1' })

      expect(result.acknowledged).toBe(true)
      expect(result.deletedCount).toBe(1)
    })

    it('document is removed after deletion', async () => {
      await adapter.deleteOne('items', { _id: 'i1' })

      const doc = await adapter.findOne('items', { _id: 'i1' })
      expect(doc).toBeNull()
    })

    it('deletes only one document when multiple match', async () => {
      const result = await adapter.deleteOne('items', { category: 'A' })

      expect(result.deletedCount).toBe(1)

      const remaining = await adapter.find('items', { category: 'A' })
      expect(remaining.length).toBe(1)
    })

    it('returns zero count when no document matches', async () => {
      const result = await adapter.deleteOne('items', { _id: 'nonexistent' })

      expect(result.deletedCount).toBe(0)
    })

    it('returns zero count for empty collection', async () => {
      const result = await adapter.deleteOne('empty', { field: 'value' })

      expect(result.deletedCount).toBe(0)
    })

    it('supports complex filters', async () => {
      await adapter.insertMany('items', [{ _id: 'i4', name: 'Item 4', value: 100 }])

      const result = await adapter.deleteOne('items', {
        $and: [{ category: 'A' }, { name: { $ne: 'Item 1' } }],
      })

      expect(result.deletedCount).toBe(1)
    })
  })

  describe('deleteMany', () => {
    beforeEach(async () => {
      await adapter.insertMany('logs', [
        { _id: 'l1', level: 'error', message: 'Error 1' },
        { _id: 'l2', level: 'error', message: 'Error 2' },
        { _id: 'l3', level: 'warn', message: 'Warning 1' },
        { _id: 'l4', level: 'info', message: 'Info 1' },
        { _id: 'l5', level: 'info', message: 'Info 2' },
      ])
    })

    it('deletes multiple documents', async () => {
      const result = await adapter.deleteMany('logs', { level: 'error' })

      expect(result.acknowledged).toBe(true)
      expect(result.deletedCount).toBe(2)
    })

    it('all matching documents are removed', async () => {
      await adapter.deleteMany('logs', { level: 'error' })

      const docs = await adapter.find('logs', { level: 'error' })
      expect(docs.length).toBe(0)
    })

    it('deletes all documents with empty filter', async () => {
      const result = await adapter.deleteMany('logs', {})

      expect(result.deletedCount).toBe(5)

      const remaining = await adapter.find('logs', {})
      expect(remaining.length).toBe(0)
    })

    it('returns zero count when no documents match', async () => {
      const result = await adapter.deleteMany('logs', { level: 'debug' })

      expect(result.deletedCount).toBe(0)
    })

    it('returns zero count for empty collection', async () => {
      const result = await adapter.deleteMany('empty', { field: 'value' })

      expect(result.deletedCount).toBe(0)
    })

    it('supports $or operator', async () => {
      const result = await adapter.deleteMany('logs', {
        $or: [{ level: 'error' }, { level: 'warn' }],
      })

      expect(result.deletedCount).toBe(3)
    })

    it('supports $in operator', async () => {
      const result = await adapter.deleteMany('logs', {
        level: { $in: ['error', 'info'] },
      })

      expect(result.deletedCount).toBe(4)
    })
  })

  describe('countDocuments', () => {
    beforeEach(async () => {
      await adapter.insertMany('events', [
        { _id: 'e1', type: 'click', page: 'home' },
        { _id: 'e2', type: 'click', page: 'about' },
        { _id: 'e3', type: 'scroll', page: 'home' },
        { _id: 'e4', type: 'click', page: 'home' },
        { _id: 'e5', type: 'submit', page: 'contact' },
      ])
    })

    it('counts all documents with empty filter', async () => {
      const count = await adapter.countDocuments('events', {})

      expect(count).toBe(5)
    })

    it('counts documents matching filter', async () => {
      const count = await adapter.countDocuments('events', { type: 'click' })

      expect(count).toBe(3)
    })

    it('returns zero for non-matching filter', async () => {
      const count = await adapter.countDocuments('events', { type: 'nonexistent' })

      expect(count).toBe(0)
    })

    it('returns zero for empty collection', async () => {
      const count = await adapter.countDocuments('empty', {})

      expect(count).toBe(0)
    })

    it('supports complex filters', async () => {
      const count = await adapter.countDocuments('events', {
        $and: [{ type: 'click' }, { page: 'home' }],
      })

      expect(count).toBe(2)
    })

    it('supports comparison operators', async () => {
      await adapter.insertMany('events', [
        { _id: 'e6', type: 'view', duration: 100 },
        { _id: 'e7', type: 'view', duration: 200 },
        { _id: 'e8', type: 'view', duration: 300 },
      ])

      const count = await adapter.countDocuments('events', { duration: { $gt: 150 } })

      expect(count).toBe(2)
    })

    it('count updates after insert', async () => {
      const initialCount = await adapter.countDocuments('events', {})
      expect(initialCount).toBe(5)

      await adapter.insertOne('events', { _id: 'e6', type: 'new' })

      const newCount = await adapter.countDocuments('events', {})
      expect(newCount).toBe(6)
    })

    it('count updates after delete', async () => {
      const initialCount = await adapter.countDocuments('events', {})
      expect(initialCount).toBe(5)

      await adapter.deleteOne('events', { _id: 'e1' })

      const newCount = await adapter.countDocuments('events', {})
      expect(newCount).toBe(4)
    })
  })

  describe('close', () => {
    it('closes the database connection', async () => {
      const localAdapter = new LibSQLStorageAdapter(':memory:')
      await localAdapter.initialize()

      await localAdapter.close()

      // Operations after close should fail
      await expect(localAdapter.findOne('test', {})).rejects.toThrow()
    })

    it('can be called multiple times safely', async () => {
      const localAdapter = new LibSQLStorageAdapter(':memory:')
      await localAdapter.initialize()

      await localAdapter.close()
      await localAdapter.close() // Should not throw

      expect(true).toBe(true)
    })
  })

  describe('Collection Isolation', () => {
    it('operations on one collection do not affect others', async () => {
      await adapter.insertOne('collection1', { _id: 'c1-1', data: 'col1' })
      await adapter.insertOne('collection2', { _id: 'c2-1', data: 'col2' })

      const count1 = await adapter.countDocuments('collection1', {})
      const count2 = await adapter.countDocuments('collection2', {})

      expect(count1).toBe(1)
      expect(count2).toBe(1)

      await adapter.deleteMany('collection1', {})

      const newCount1 = await adapter.countDocuments('collection1', {})
      const newCount2 = await adapter.countDocuments('collection2', {})

      expect(newCount1).toBe(0)
      expect(newCount2).toBe(1)
    })

    it('same _id can exist in different collections', async () => {
      await adapter.insertOne('colA', { _id: 'shared-id', value: 'A' })
      await adapter.insertOne('colB', { _id: 'shared-id', value: 'B' })

      const docA = await adapter.findOne('colA', { _id: 'shared-id' })
      const docB = await adapter.findOne('colB', { _id: 'shared-id' })

      expect(docA?.value).toBe('A')
      expect(docB?.value).toBe('B')
    })
  })

  describe('Data Types Preservation', () => {
    it('preserves string values', async () => {
      await adapter.insertOne('types', { _id: 't1', value: 'hello world' })
      const doc = await adapter.findOne('types', { _id: 't1' })
      expect(doc?.value).toBe('hello world')
      expect(typeof doc?.value).toBe('string')
    })

    it('preserves number values', async () => {
      await adapter.insertOne('types', { _id: 't2', int: 42, float: 3.14159 })
      const doc = await adapter.findOne('types', { _id: 't2' })
      expect(doc?.int).toBe(42)
      expect(doc?.float).toBeCloseTo(3.14159)
      expect(typeof doc?.int).toBe('number')
      expect(typeof doc?.float).toBe('number')
    })

    it('preserves boolean values', async () => {
      await adapter.insertOne('types', { _id: 't3', active: true, deleted: false })
      const doc = await adapter.findOne('types', { _id: 't3' })
      expect(doc?.active).toBe(true)
      expect(doc?.deleted).toBe(false)
      expect(typeof doc?.active).toBe('boolean')
    })

    it('preserves null values', async () => {
      await adapter.insertOne('types', { _id: 't4', value: null })
      const doc = await adapter.findOne('types', { _id: 't4' })
      expect(doc?.value).toBeNull()
    })

    it('preserves array values', async () => {
      await adapter.insertOne('types', { _id: 't5', tags: ['a', 'b', 'c'] })
      const doc = await adapter.findOne('types', { _id: 't5' })
      expect(doc?.tags).toEqual(['a', 'b', 'c'])
      expect(Array.isArray(doc?.tags)).toBe(true)
    })

    it('preserves nested object values', async () => {
      await adapter.insertOne('types', {
        _id: 't6',
        nested: { level1: { level2: { value: 'deep' } } },
      })
      const doc = await adapter.findOne('types', { _id: 't6' })
      expect(doc?.nested?.level1?.level2?.value).toBe('deep')
    })

    it('preserves mixed arrays', async () => {
      await adapter.insertOne('types', {
        _id: 't7',
        mixed: [1, 'two', true, null, { key: 'value' }],
      })
      const doc = await adapter.findOne('types', { _id: 't7' })
      expect(doc?.mixed[0]).toBe(1)
      expect(doc?.mixed[1]).toBe('two')
      expect(doc?.mixed[2]).toBe(true)
      expect(doc?.mixed[3]).toBeNull()
      expect(doc?.mixed[4]).toEqual({ key: 'value' })
    })

    it('preserves empty objects', async () => {
      await adapter.insertOne('types', { _id: 't8', empty: {} })
      const doc = await adapter.findOne('types', { _id: 't8' })
      expect(doc?.empty).toEqual({})
    })

    it('preserves empty arrays', async () => {
      await adapter.insertOne('types', { _id: 't9', empty: [] })
      const doc = await adapter.findOne('types', { _id: 't9' })
      expect(doc?.empty).toEqual([])
    })
  })

  describe('Edge Cases', () => {
    it('handles very long strings', async () => {
      const longString = 'x'.repeat(10000)
      await adapter.insertOne('edge', { _id: 'long', value: longString })
      const doc = await adapter.findOne('edge', { _id: 'long' })
      expect(doc?.value.length).toBe(10000)
    })

    it('handles deeply nested objects', async () => {
      const deepObject = { a: { b: { c: { d: { e: { f: { g: 'deep' } } } } } } }
      await adapter.insertOne('edge', { _id: 'deep', value: deepObject })
      const doc = await adapter.findOne('edge', { _id: 'deep' })
      expect(doc?.value?.a?.b?.c?.d?.e?.f?.g).toBe('deep')
    })

    it('handles large arrays', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i)
      await adapter.insertOne('edge', { _id: 'array', values: largeArray })
      const doc = await adapter.findOne('edge', { _id: 'array' })
      expect(doc?.values.length).toBe(1000)
      expect(doc?.values[999]).toBe(999)
    })

    it('handles special characters in strings', async () => {
      const specialString = 'Hello\nWorld\t"Quoted"\u0000\u001F\uFFFF'
      await adapter.insertOne('edge', { _id: 'special', value: specialString })
      const doc = await adapter.findOne('edge', { _id: 'special' })
      expect(doc?.value).toBe(specialString)
    })

    it('handles unicode characters', async () => {
      const unicodeString = '日本語 한국어 العربية 🎉👍🏽'
      await adapter.insertOne('edge', { _id: 'unicode', value: unicodeString })
      const doc = await adapter.findOne('edge', { _id: 'unicode' })
      expect(doc?.value).toBe(unicodeString)
    })

    it('handles field names with dots', async () => {
      const doc = { _id: 'dots', 'field.with.dots': 'value' }
      await adapter.insertOne('edge', doc)
      const found = await adapter.findOne('edge', { _id: 'dots' })
      expect(found?.['field.with.dots']).toBe('value')
    })

    it('handles field names with special characters', async () => {
      const doc = { _id: 'special-field', '$special': 'value', '@field': 'another' }
      await adapter.insertOne('edge', doc)
      const found = await adapter.findOne('edge', { _id: 'special-field' })
      expect(found?.['$special']).toBe('value')
      expect(found?.['@field']).toBe('another')
    })
  })
})
