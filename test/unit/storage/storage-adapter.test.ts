/**
 * Storage Adapter Interface Unit Tests (RED Phase)
 *
 * TDD RED: These tests define the StorageAdapter interface contract.
 * They will fail until the interface is implemented in src/storage/types.ts
 *
 * Issue: mondodb-uwyg - Define StorageAdapter interface for document operations
 */

import { describe, it, expect, expectTypeOf } from 'vitest'

// These imports will fail initially - RED phase
// The types don't exist yet and must be created to make tests pass
import type {
  StorageAdapter,
  Document,
  Filter,
  FindOptions,
  UpdateOperators,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
} from '../../../src/storage/types'

describe('StorageAdapter Interface', () => {
  describe('Type Definitions', () => {
    it('StorageAdapter interface exists', () => {
      // This test verifies the type can be used
      const adapter: StorageAdapter = {} as StorageAdapter
      expect(adapter).toBeDefined()
    })

    it('Document type exists', () => {
      const doc: Document = { _id: 'test', name: 'Test Document' }
      expect(doc).toBeDefined()
    })

    it('Filter type exists', () => {
      const filter: Filter = { name: 'test' }
      expect(filter).toBeDefined()
    })

    it('FindOptions type exists', () => {
      const options: FindOptions = { limit: 10, skip: 0 }
      expect(options).toBeDefined()
    })

    it('UpdateOperators type exists', () => {
      const update: UpdateOperators = { $set: { name: 'updated' } }
      expect(update).toBeDefined()
    })

    it('InsertOneResult type exists', () => {
      const result: InsertOneResult = {
        acknowledged: true,
        insertedId: 'test-id',
      }
      expect(result).toBeDefined()
    })

    it('InsertManyResult type exists', () => {
      const result: InsertManyResult = {
        acknowledged: true,
        insertedCount: 2,
        insertedIds: { 0: 'id1', 1: 'id2' },
      }
      expect(result).toBeDefined()
    })

    it('UpdateResult type exists', () => {
      const result: UpdateResult = {
        acknowledged: true,
        matchedCount: 1,
        modifiedCount: 1,
        upsertedCount: 0,
      }
      expect(result).toBeDefined()
    })

    it('DeleteResult type exists', () => {
      const result: DeleteResult = {
        acknowledged: true,
        deletedCount: 1,
      }
      expect(result).toBeDefined()
    })
  })

  describe('StorageAdapter Methods', () => {
    describe('insertOne', () => {
      it('has insertOne method with correct signature', () => {
        expectTypeOf<StorageAdapter>().toHaveProperty('insertOne')
        expectTypeOf<StorageAdapter['insertOne']>().toBeFunction()
        expectTypeOf<StorageAdapter['insertOne']>().parameter(0).toBeString()
        expectTypeOf<StorageAdapter['insertOne']>().parameter(1).toMatchTypeOf<Document>()
        expectTypeOf<StorageAdapter['insertOne']>().returns.toMatchTypeOf<Promise<InsertOneResult>>()
      })

      it('insertOne accepts collection name and document', async () => {
        const mockAdapter: StorageAdapter = {
          insertOne: async (collection: string, doc: Document) => ({
            acknowledged: true,
            insertedId: 'new-id',
          }),
          insertMany: async () => ({ acknowledged: true, insertedCount: 0, insertedIds: {} }),
          findOne: async () => null,
          find: async () => [],
          updateOne: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          updateMany: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          deleteOne: async () => ({ acknowledged: true, deletedCount: 0 }),
          deleteMany: async () => ({ acknowledged: true, deletedCount: 0 }),
          countDocuments: async () => 0,
          close: async () => {},
        }

        const result = await mockAdapter.insertOne('users', { name: 'John' })
        expect(result.acknowledged).toBe(true)
        expect(result.insertedId).toBe('new-id')
      })
    })

    describe('insertMany', () => {
      it('has insertMany method with correct signature', () => {
        expectTypeOf<StorageAdapter>().toHaveProperty('insertMany')
        expectTypeOf<StorageAdapter['insertMany']>().toBeFunction()
        expectTypeOf<StorageAdapter['insertMany']>().parameter(0).toBeString()
        expectTypeOf<StorageAdapter['insertMany']>().parameter(1).toMatchTypeOf<Document[]>()
        expectTypeOf<StorageAdapter['insertMany']>().returns.toMatchTypeOf<Promise<InsertManyResult>>()
      })

      it('insertMany accepts collection name and array of documents', async () => {
        const mockAdapter: StorageAdapter = {
          insertOne: async () => ({ acknowledged: true, insertedId: '' }),
          insertMany: async (collection: string, docs: Document[]) => ({
            acknowledged: true,
            insertedCount: docs.length,
            insertedIds: docs.reduce((acc, _, i) => ({ ...acc, [i]: `id-${i}` }), {}),
          }),
          findOne: async () => null,
          find: async () => [],
          updateOne: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          updateMany: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          deleteOne: async () => ({ acknowledged: true, deletedCount: 0 }),
          deleteMany: async () => ({ acknowledged: true, deletedCount: 0 }),
          countDocuments: async () => 0,
          close: async () => {},
        }

        const result = await mockAdapter.insertMany('users', [{ name: 'John' }, { name: 'Jane' }])
        expect(result.acknowledged).toBe(true)
        expect(result.insertedCount).toBe(2)
      })
    })

    describe('findOne', () => {
      it('has findOne method with correct signature', () => {
        expectTypeOf<StorageAdapter>().toHaveProperty('findOne')
        expectTypeOf<StorageAdapter['findOne']>().toBeFunction()
        expectTypeOf<StorageAdapter['findOne']>().parameter(0).toBeString()
        expectTypeOf<StorageAdapter['findOne']>().parameter(1).toMatchTypeOf<Filter>()
        expectTypeOf<StorageAdapter['findOne']>().returns.toMatchTypeOf<Promise<Document | null>>()
      })

      it('findOne returns document or null', async () => {
        const mockAdapter: StorageAdapter = {
          insertOne: async () => ({ acknowledged: true, insertedId: '' }),
          insertMany: async () => ({ acknowledged: true, insertedCount: 0, insertedIds: {} }),
          findOne: async (collection: string, filter: Filter) => {
            if (filter._id === 'exists') {
              return { _id: 'exists', name: 'Found' }
            }
            return null
          },
          find: async () => [],
          updateOne: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          updateMany: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          deleteOne: async () => ({ acknowledged: true, deletedCount: 0 }),
          deleteMany: async () => ({ acknowledged: true, deletedCount: 0 }),
          countDocuments: async () => 0,
          close: async () => {},
        }

        const found = await mockAdapter.findOne('users', { _id: 'exists' })
        expect(found).toEqual({ _id: 'exists', name: 'Found' })

        const notFound = await mockAdapter.findOne('users', { _id: 'missing' })
        expect(notFound).toBeNull()
      })
    })

    describe('find', () => {
      it('has find method with correct signature', () => {
        expectTypeOf<StorageAdapter>().toHaveProperty('find')
        expectTypeOf<StorageAdapter['find']>().toBeFunction()
        expectTypeOf<StorageAdapter['find']>().parameter(0).toBeString()
        expectTypeOf<StorageAdapter['find']>().parameter(1).toMatchTypeOf<Filter>()
        // Third parameter is optional FindOptions
        expectTypeOf<StorageAdapter['find']>().returns.toMatchTypeOf<Promise<Document[]>>()
      })

      it('find accepts optional FindOptions', async () => {
        const mockAdapter: StorageAdapter = {
          insertOne: async () => ({ acknowledged: true, insertedId: '' }),
          insertMany: async () => ({ acknowledged: true, insertedCount: 0, insertedIds: {} }),
          findOne: async () => null,
          find: async (collection: string, filter: Filter, options?: FindOptions) => {
            const docs = [
              { _id: '1', name: 'John' },
              { _id: '2', name: 'Jane' },
              { _id: '3', name: 'Bob' },
            ]
            const skip = options?.skip ?? 0
            const limit = options?.limit ?? docs.length
            return docs.slice(skip, skip + limit)
          },
          updateOne: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          updateMany: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          deleteOne: async () => ({ acknowledged: true, deletedCount: 0 }),
          deleteMany: async () => ({ acknowledged: true, deletedCount: 0 }),
          countDocuments: async () => 0,
          close: async () => {},
        }

        const allDocs = await mockAdapter.find('users', {})
        expect(allDocs).toHaveLength(3)

        const limitedDocs = await mockAdapter.find('users', {}, { limit: 2 })
        expect(limitedDocs).toHaveLength(2)

        const skippedDocs = await mockAdapter.find('users', {}, { skip: 1, limit: 2 })
        expect(skippedDocs).toHaveLength(2)
        expect(skippedDocs[0]._id).toBe('2')
      })
    })

    describe('updateOne', () => {
      it('has updateOne method with correct signature', () => {
        expectTypeOf<StorageAdapter>().toHaveProperty('updateOne')
        expectTypeOf<StorageAdapter['updateOne']>().toBeFunction()
        expectTypeOf<StorageAdapter['updateOne']>().parameter(0).toBeString()
        expectTypeOf<StorageAdapter['updateOne']>().parameter(1).toMatchTypeOf<Filter>()
        expectTypeOf<StorageAdapter['updateOne']>().parameter(2).toMatchTypeOf<UpdateOperators>()
        expectTypeOf<StorageAdapter['updateOne']>().returns.toMatchTypeOf<Promise<UpdateResult>>()
      })

      it('updateOne returns UpdateResult', async () => {
        const mockAdapter: StorageAdapter = {
          insertOne: async () => ({ acknowledged: true, insertedId: '' }),
          insertMany: async () => ({ acknowledged: true, insertedCount: 0, insertedIds: {} }),
          findOne: async () => null,
          find: async () => [],
          updateOne: async (collection: string, filter: Filter, update: UpdateOperators) => ({
            acknowledged: true,
            matchedCount: 1,
            modifiedCount: 1,
            upsertedCount: 0,
          }),
          updateMany: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          deleteOne: async () => ({ acknowledged: true, deletedCount: 0 }),
          deleteMany: async () => ({ acknowledged: true, deletedCount: 0 }),
          countDocuments: async () => 0,
          close: async () => {},
        }

        const result = await mockAdapter.updateOne('users', { _id: '1' }, { $set: { name: 'Updated' } })
        expect(result.acknowledged).toBe(true)
        expect(result.matchedCount).toBe(1)
        expect(result.modifiedCount).toBe(1)
      })
    })

    describe('updateMany', () => {
      it('has updateMany method with correct signature', () => {
        expectTypeOf<StorageAdapter>().toHaveProperty('updateMany')
        expectTypeOf<StorageAdapter['updateMany']>().toBeFunction()
        expectTypeOf<StorageAdapter['updateMany']>().parameter(0).toBeString()
        expectTypeOf<StorageAdapter['updateMany']>().parameter(1).toMatchTypeOf<Filter>()
        expectTypeOf<StorageAdapter['updateMany']>().parameter(2).toMatchTypeOf<UpdateOperators>()
        expectTypeOf<StorageAdapter['updateMany']>().returns.toMatchTypeOf<Promise<UpdateResult>>()
      })

      it('updateMany updates multiple documents', async () => {
        const mockAdapter: StorageAdapter = {
          insertOne: async () => ({ acknowledged: true, insertedId: '' }),
          insertMany: async () => ({ acknowledged: true, insertedCount: 0, insertedIds: {} }),
          findOne: async () => null,
          find: async () => [],
          updateOne: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          updateMany: async (collection: string, filter: Filter, update: UpdateOperators) => ({
            acknowledged: true,
            matchedCount: 5,
            modifiedCount: 5,
            upsertedCount: 0,
          }),
          deleteOne: async () => ({ acknowledged: true, deletedCount: 0 }),
          deleteMany: async () => ({ acknowledged: true, deletedCount: 0 }),
          countDocuments: async () => 0,
          close: async () => {},
        }

        const result = await mockAdapter.updateMany('users', { status: 'active' }, { $set: { verified: true } })
        expect(result.matchedCount).toBe(5)
        expect(result.modifiedCount).toBe(5)
      })
    })

    describe('deleteOne', () => {
      it('has deleteOne method with correct signature', () => {
        expectTypeOf<StorageAdapter>().toHaveProperty('deleteOne')
        expectTypeOf<StorageAdapter['deleteOne']>().toBeFunction()
        expectTypeOf<StorageAdapter['deleteOne']>().parameter(0).toBeString()
        expectTypeOf<StorageAdapter['deleteOne']>().parameter(1).toMatchTypeOf<Filter>()
        expectTypeOf<StorageAdapter['deleteOne']>().returns.toMatchTypeOf<Promise<DeleteResult>>()
      })

      it('deleteOne returns DeleteResult', async () => {
        const mockAdapter: StorageAdapter = {
          insertOne: async () => ({ acknowledged: true, insertedId: '' }),
          insertMany: async () => ({ acknowledged: true, insertedCount: 0, insertedIds: {} }),
          findOne: async () => null,
          find: async () => [],
          updateOne: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          updateMany: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          deleteOne: async (collection: string, filter: Filter) => ({
            acknowledged: true,
            deletedCount: 1,
          }),
          deleteMany: async () => ({ acknowledged: true, deletedCount: 0 }),
          countDocuments: async () => 0,
          close: async () => {},
        }

        const result = await mockAdapter.deleteOne('users', { _id: '1' })
        expect(result.acknowledged).toBe(true)
        expect(result.deletedCount).toBe(1)
      })
    })

    describe('deleteMany', () => {
      it('has deleteMany method with correct signature', () => {
        expectTypeOf<StorageAdapter>().toHaveProperty('deleteMany')
        expectTypeOf<StorageAdapter['deleteMany']>().toBeFunction()
        expectTypeOf<StorageAdapter['deleteMany']>().parameter(0).toBeString()
        expectTypeOf<StorageAdapter['deleteMany']>().parameter(1).toMatchTypeOf<Filter>()
        expectTypeOf<StorageAdapter['deleteMany']>().returns.toMatchTypeOf<Promise<DeleteResult>>()
      })

      it('deleteMany deletes multiple documents', async () => {
        const mockAdapter: StorageAdapter = {
          insertOne: async () => ({ acknowledged: true, insertedId: '' }),
          insertMany: async () => ({ acknowledged: true, insertedCount: 0, insertedIds: {} }),
          findOne: async () => null,
          find: async () => [],
          updateOne: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          updateMany: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          deleteOne: async () => ({ acknowledged: true, deletedCount: 0 }),
          deleteMany: async (collection: string, filter: Filter) => ({
            acknowledged: true,
            deletedCount: 10,
          }),
          countDocuments: async () => 0,
          close: async () => {},
        }

        const result = await mockAdapter.deleteMany('users', { status: 'inactive' })
        expect(result.deletedCount).toBe(10)
      })
    })

    describe('countDocuments', () => {
      it('has countDocuments method with correct signature', () => {
        expectTypeOf<StorageAdapter>().toHaveProperty('countDocuments')
        expectTypeOf<StorageAdapter['countDocuments']>().toBeFunction()
        expectTypeOf<StorageAdapter['countDocuments']>().parameter(0).toBeString()
        expectTypeOf<StorageAdapter['countDocuments']>().parameter(1).toMatchTypeOf<Filter>()
        expectTypeOf<StorageAdapter['countDocuments']>().returns.toMatchTypeOf<Promise<number>>()
      })

      it('countDocuments returns number', async () => {
        const mockAdapter: StorageAdapter = {
          insertOne: async () => ({ acknowledged: true, insertedId: '' }),
          insertMany: async () => ({ acknowledged: true, insertedCount: 0, insertedIds: {} }),
          findOne: async () => null,
          find: async () => [],
          updateOne: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          updateMany: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          deleteOne: async () => ({ acknowledged: true, deletedCount: 0 }),
          deleteMany: async () => ({ acknowledged: true, deletedCount: 0 }),
          countDocuments: async (collection: string, filter: Filter) => 42,
          close: async () => {},
        }

        const count = await mockAdapter.countDocuments('users', { status: 'active' })
        expect(count).toBe(42)
      })
    })

    describe('close', () => {
      it('has close method with correct signature', () => {
        expectTypeOf<StorageAdapter>().toHaveProperty('close')
        expectTypeOf<StorageAdapter['close']>().toBeFunction()
        expectTypeOf<StorageAdapter['close']>().returns.toMatchTypeOf<Promise<void>>()
      })

      it('close returns Promise<void>', async () => {
        let closed = false
        const mockAdapter: StorageAdapter = {
          insertOne: async () => ({ acknowledged: true, insertedId: '' }),
          insertMany: async () => ({ acknowledged: true, insertedCount: 0, insertedIds: {} }),
          findOne: async () => null,
          find: async () => [],
          updateOne: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          updateMany: async () => ({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }),
          deleteOne: async () => ({ acknowledged: true, deletedCount: 0 }),
          deleteMany: async () => ({ acknowledged: true, deletedCount: 0 }),
          countDocuments: async () => 0,
          close: async () => {
            closed = true
          },
        }

        await mockAdapter.close()
        expect(closed).toBe(true)
      })
    })
  })

  describe('Complete Interface Implementation', () => {
    it('all methods are required for a valid StorageAdapter', () => {
      // This test ensures all 10 methods are present
      const requiredMethods: (keyof StorageAdapter)[] = [
        'insertOne',
        'insertMany',
        'findOne',
        'find',
        'updateOne',
        'updateMany',
        'deleteOne',
        'deleteMany',
        'countDocuments',
        'close',
      ]

      // Type check: ensure all methods are defined on the interface
      requiredMethods.forEach((method) => {
        expectTypeOf<StorageAdapter>().toHaveProperty(method)
      })
    })

    it('StorageAdapter can be implemented as a class', () => {
      // This validates the interface can be used with class implementations
      class MockStorageAdapter implements StorageAdapter {
        async insertOne(collection: string, doc: Document): Promise<InsertOneResult> {
          return { acknowledged: true, insertedId: 'mock-id' }
        }

        async insertMany(collection: string, docs: Document[]): Promise<InsertManyResult> {
          return { acknowledged: true, insertedCount: docs.length, insertedIds: {} }
        }

        async findOne(collection: string, filter: Filter): Promise<Document | null> {
          return null
        }

        async find(collection: string, filter: Filter, options?: FindOptions): Promise<Document[]> {
          return []
        }

        async updateOne(collection: string, filter: Filter, update: UpdateOperators): Promise<UpdateResult> {
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
        }

        async updateMany(collection: string, filter: Filter, update: UpdateOperators): Promise<UpdateResult> {
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
        }

        async deleteOne(collection: string, filter: Filter): Promise<DeleteResult> {
          return { acknowledged: true, deletedCount: 0 }
        }

        async deleteMany(collection: string, filter: Filter): Promise<DeleteResult> {
          return { acknowledged: true, deletedCount: 0 }
        }

        async countDocuments(collection: string, filter: Filter): Promise<number> {
          return 0
        }

        async close(): Promise<void> {
          // Cleanup resources
        }
      }

      const adapter = new MockStorageAdapter()
      expect(adapter).toBeInstanceOf(MockStorageAdapter)
      expectTypeOf(adapter).toMatchTypeOf<StorageAdapter>()
    })
  })
})
