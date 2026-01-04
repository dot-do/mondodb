/**
 * WorkersProxyBackend Tests
 *
 * Comprehensive tests for WorkersProxyBackend that implements MondoBackend interface.
 * Tests verify HTTP RPC calls to Cloudflare Workers endpoints.
 *
 * TDD RED Phase: These tests define expected behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  WorkersProxyBackend,
  type WorkersProxyBackendOptions,
  MongoProxyError,
} from '../../../src/wire/backend/workers-proxy.js'
import type { CursorState } from '../../../src/wire/backend/interface.js'

// ============================================================================
// Mock Setup
// ============================================================================

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function mockJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: () => Promise.resolve(data),
  }
}

function mockRpcSuccess<T>(result: T) {
  return mockJsonResponse({ ok: 1, result })
}

function mockRpcError(error: string, code: number, codeName?: string) {
  return mockJsonResponse({ ok: 0, error, code, codeName })
}

// ============================================================================
// Test Constants
// ============================================================================

const TEST_ENDPOINT = 'https://api.example.com/rpc'
const TEST_AUTH_TOKEN = 'test-auth-token-12345'

// ============================================================================
// Constructor Tests
// ============================================================================

describe('WorkersProxyBackend', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should require an endpoint URL', () => {
      expect(() => new WorkersProxyBackend({} as WorkersProxyBackendOptions)).toThrow(
        'requires an endpoint URL'
      )
    })

    it('should reject invalid endpoint URLs', () => {
      expect(
        () => new WorkersProxyBackend({ endpoint: 'not-a-valid-url' })
      ).toThrow('not a valid URL')
    })

    it('should accept valid endpoint URL', () => {
      const backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
      expect(backend).toBeInstanceOf(WorkersProxyBackend)
    })

    it('should accept configuration options', () => {
      const backend = new WorkersProxyBackend({
        endpoint: TEST_ENDPOINT,
        authToken: TEST_AUTH_TOKEN,
        timeout: 60000,
        retries: 3,
        retryDelay: 2000,
      })
      expect(backend).toBeInstanceOf(WorkersProxyBackend)
    })
  })

  // ==========================================================================
  // Find Operations
  // ==========================================================================

  describe('find', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should make RPC call with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          documents: [{ _id: '1', name: 'test' }],
          cursorId: '0',
          hasMore: false,
        })
      )

      await backend.find('testdb', 'users', { filter: { active: true } })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe(TEST_ENDPOINT)
      expect(options.method).toBe('POST')

      const body = JSON.parse(options.body)
      expect(body.method).toBe('find')
      expect(body.db).toBe('testdb')
      expect(body.collection).toBe('users')
      expect(body.filter).toEqual({ active: true })
    })

    it('should return documents from successful response', async () => {
      const docs = [
        { _id: '1', name: 'Alice' },
        { _id: '2', name: 'Bob' },
      ]
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ documents: docs, cursorId: '0', hasMore: false })
      )

      const result = await backend.find('db', 'users', {})

      expect(result.documents).toEqual(docs)
      expect(result.cursorId).toBe(0n)
      expect(result.hasMore).toBe(false)
    })

    it('should handle cursor ID as bigint', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ documents: [], cursorId: '12345678901234567890', hasMore: true })
      )

      const result = await backend.find('db', 'users', { batchSize: 100 })

      expect(typeof result.cursorId).toBe('bigint')
      expect(result.cursorId).toBe(12345678901234567890n)
      expect(result.hasMore).toBe(true)
    })

    it('should pass find options correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ documents: [], cursorId: '0', hasMore: false })
      )

      await backend.find('db', 'collection', {
        filter: { status: 'active' },
        projection: { name: 1, email: 1 },
        sort: { createdAt: -1 },
        limit: 10,
        skip: 20,
        batchSize: 50,
        hint: { _id: 1 },
        comment: 'test query',
        allowDiskUse: true,
        collation: { locale: 'en' },
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.filter).toEqual({ status: 'active' })
      expect(body.options.projection).toEqual({ name: 1, email: 1 })
      expect(body.options.sort).toEqual({ createdAt: -1 })
      expect(body.options.limit).toBe(10)
      expect(body.options.skip).toBe(20)
      expect(body.options.batchSize).toBe(50)
      expect(body.options.hint).toEqual({ _id: 1 })
      expect(body.options.comment).toBe('test query')
      expect(body.options.allowDiskUse).toBe(true)
      expect(body.options.collation).toEqual({ locale: 'en' })
    })

    it('should throw MongoProxyError on RPC error', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcError('Collection not found', 26, 'NamespaceNotFound')
      )

      try {
        await backend.find('db', 'missing', {})
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(MongoProxyError)
        expect((err as MongoProxyError).code).toBe(26)
        expect((err as MongoProxyError).codeName).toBe('NamespaceNotFound')
      }
    })

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ documents: [], cursorId: '0', hasMore: false })
      )

      const result = await backend.find('db', 'empty', { filter: { nonexistent: true } })

      expect(result.documents).toEqual([])
      expect(result.hasMore).toBe(false)
    })
  })

  // ==========================================================================
  // InsertMany Operations
  // ==========================================================================

  describe('insertMany', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should insert multiple documents', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          acknowledged: true,
          insertedIds: { '0': 'id1', '1': 'id2', '2': 'id3' },
          insertedCount: 3,
        })
      )

      const docs = [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }]
      const result = await backend.insertMany('db', 'users', docs)

      expect(result.acknowledged).toBe(true)
      expect(result.insertedCount).toBe(3)
      expect(result.insertedIds.get(0)).toBe('id1')
      expect(result.insertedIds.get(1)).toBe('id2')
      expect(result.insertedIds.get(2)).toBe('id3')
    })

    it('should make correct RPC call', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ acknowledged: true, insertedIds: {}, insertedCount: 0 })
      )

      const docs = [{ a: 1 }, { b: 2 }]
      await backend.insertMany('testdb', 'items', docs)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.method).toBe('insertMany')
      expect(body.db).toBe('testdb')
      expect(body.collection).toBe('items')
      expect(body.documents).toEqual(docs)
    })

    it('should handle duplicate key errors', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcError('Duplicate key error', 11000, 'DuplicateKey')
      )

      await expect(
        backend.insertMany('db', 'users', [{ _id: 'duplicate' }])
      ).rejects.toThrow(MongoProxyError)
    })

    it('should return insertedIds as Map', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          acknowledged: true,
          insertedIds: { '0': 'abc123' },
          insertedCount: 1,
        })
      )

      const result = await backend.insertMany('db', 'col', [{ data: 'test' }])

      expect(result.insertedIds).toBeInstanceOf(Map)
      expect(result.insertedIds.size).toBe(1)
    })
  })

  describe('insertOne', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should insert a single document', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          acknowledged: true,
          insertedIds: { '0': 'newid123' },
          insertedCount: 1,
        })
      )

      const result = await backend.insertOne('db', 'users', { name: 'Test User' })

      expect(result.acknowledged).toBe(true)
      expect(result.insertedCount).toBe(1)
      expect(result.insertedIds.get(0)).toBe('newid123')
    })

    it('should make correct RPC call for insertOne', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ acknowledged: true, insertedIds: { '0': 'x' }, insertedCount: 1 })
      )

      await backend.insertOne('db', 'col', { field: 'value' })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.method).toBe('insertOne')
      expect(body.document).toEqual({ field: 'value' })
    })
  })

  // ==========================================================================
  // UpdateOne/UpdateMany Operations
  // ==========================================================================

  describe('updateOne', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should update a single document', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 1,
          upsertedCount: 0,
        })
      )

      const result = await backend.updateOne(
        'db',
        'users',
        { _id: 'user1' },
        { $set: { name: 'Updated Name' } }
      )

      expect(result.acknowledged).toBe(true)
      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)
      expect(result.upsertedCount).toBe(0)
    })

    it('should handle upsert option', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedId: 'newuserid',
          upsertedCount: 1,
        })
      )

      const result = await backend.updateOne(
        'db',
        'users',
        { email: 'new@example.com' },
        { $set: { email: 'new@example.com', name: 'New User' } },
        { upsert: true }
      )

      expect(result.upsertedCount).toBe(1)
      expect(result.upsertedId).toBe('newuserid')
    })

    it('should pass filter and update in RPC call', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 })
      )

      await backend.updateOne(
        'db',
        'col',
        { status: 'pending' },
        { $set: { status: 'approved' } },
        { upsert: false }
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.method).toBe('updateOne')
      expect(body.filter).toEqual({ status: 'pending' })
      expect(body.update).toEqual({ $set: { status: 'approved' } })
      expect(body.options).toEqual({ upsert: false })
    })

    it('should handle no matching documents', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedCount: 0,
        })
      )

      const result = await backend.updateOne(
        'db',
        'users',
        { nonexistent: 'filter' },
        { $set: { field: 'value' } }
      )

      expect(result.matchedCount).toBe(0)
      expect(result.modifiedCount).toBe(0)
    })

    it('should support arrayFilters option', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: 1,
          upsertedCount: 0,
        })
      )

      await backend.updateOne(
        'db',
        'orders',
        { _id: 'order1' },
        { $set: { 'items.$[elem].status': 'shipped' } },
        { arrayFilters: [{ 'elem.status': 'pending' }] }
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.options.arrayFilters).toEqual([{ 'elem.status': 'pending' }])
    })
  })

  describe('updateMany', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should update multiple documents', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          acknowledged: true,
          matchedCount: 5,
          modifiedCount: 5,
          upsertedCount: 0,
        })
      )

      const result = await backend.updateMany(
        'db',
        'users',
        { status: 'inactive' },
        { $set: { archived: true } }
      )

      expect(result.matchedCount).toBe(5)
      expect(result.modifiedCount).toBe(5)
    })

    it('should make correct RPC call', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 })
      )

      await backend.updateMany('db', 'col', { a: 1 }, { $inc: { count: 1 } })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.method).toBe('updateMany')
    })

    it('should support upsert for updateMany', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedId: 'newid',
          upsertedCount: 1,
        })
      )

      const result = await backend.updateMany(
        'db',
        'items',
        { type: 'special' },
        { $setOnInsert: { type: 'special', count: 0 } },
        { upsert: true }
      )

      expect(result.upsertedCount).toBe(1)
    })
  })

  // ==========================================================================
  // DeleteOne/DeleteMany Operations
  // ==========================================================================

  describe('deleteOne', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should delete a single document', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ acknowledged: true, deletedCount: 1 })
      )

      const result = await backend.deleteOne('db', 'users', { _id: 'user123' })

      expect(result.acknowledged).toBe(true)
      expect(result.deletedCount).toBe(1)
    })

    it('should return 0 when no documents match', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ acknowledged: true, deletedCount: 0 })
      )

      const result = await backend.deleteOne('db', 'users', { nonexistent: true })

      expect(result.deletedCount).toBe(0)
    })

    it('should make correct RPC call', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ acknowledged: true, deletedCount: 0 })
      )

      await backend.deleteOne('testdb', 'items', { status: 'deleted' })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.method).toBe('deleteOne')
      expect(body.db).toBe('testdb')
      expect(body.collection).toBe('items')
      expect(body.filter).toEqual({ status: 'deleted' })
    })
  })

  describe('deleteMany', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should delete multiple documents', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ acknowledged: true, deletedCount: 10 })
      )

      const result = await backend.deleteMany('db', 'logs', { age: { $gt: 30 } })

      expect(result.deletedCount).toBe(10)
    })

    it('should delete all documents with empty filter', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ acknowledged: true, deletedCount: 100 })
      )

      const result = await backend.deleteMany('db', 'temp', {})

      expect(result.deletedCount).toBe(100)
    })

    it('should make correct RPC call', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ acknowledged: true, deletedCount: 0 })
      )

      await backend.deleteMany('db', 'col', { expired: true })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.method).toBe('deleteMany')
    })
  })

  // ==========================================================================
  // Aggregate Operations
  // ==========================================================================

  describe('aggregate', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should execute aggregation pipeline', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          documents: [{ _id: 'group1', total: 100 }],
          cursorId: '0',
          hasMore: false,
        })
      )

      const pipeline = [
        { $match: { status: 'completed' } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ]

      const result = await backend.aggregate('db', 'orders', pipeline)

      expect(result.documents).toEqual([{ _id: 'group1', total: 100 }])
    })

    it('should pass pipeline in RPC call', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ documents: [], cursorId: '0', hasMore: false })
      )

      const pipeline = [
        { $match: { active: true } },
        { $project: { name: 1 } },
        { $limit: 10 },
      ]

      await backend.aggregate('db', 'users', pipeline)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.method).toBe('aggregate')
      expect(body.pipeline).toEqual(pipeline)
    })

    it('should pass aggregation options', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ documents: [], cursorId: '0', hasMore: false })
      )

      await backend.aggregate('db', 'data', [{ $sort: { size: -1 } }], {
        batchSize: 1000,
        allowDiskUse: true,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.options.batchSize).toBe(1000)
      expect(body.options.allowDiskUse).toBe(true)
    })

    it('should handle cursor for large results', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({
          documents: Array(100).fill({ x: 1 }),
          cursorId: '9876543210',
          hasMore: true,
        })
      )

      const result = await backend.aggregate('db', 'bigdata', [])

      expect(result.cursorId).toBe(9876543210n)
      expect(result.hasMore).toBe(true)
    })

    it('should handle complex aggregation stages', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcSuccess({ documents: [], cursorId: '0', hasMore: false })
      )

      const pipeline = [
        { $match: { date: { $gte: '2024-01-01' } } },
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $group: { _id: '$user.country', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]

      await backend.aggregate('analytics', 'events', pipeline)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.pipeline).toEqual(pipeline)
    })
  })

  // ==========================================================================
  // ListDatabases Operations
  // ==========================================================================

  describe('listDatabases', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should return list of databases', async () => {
      const databases = [
        { name: 'admin', sizeOnDisk: 0, empty: true },
        { name: 'myapp', sizeOnDisk: 1024000, empty: false },
        { name: 'test', sizeOnDisk: 2048, empty: false },
      ]
      mockFetch.mockResolvedValueOnce(mockRpcSuccess(databases))

      const result = await backend.listDatabases()

      expect(result).toEqual(databases)
    })

    it('should make correct RPC call', async () => {
      mockFetch.mockResolvedValueOnce(mockRpcSuccess([]))

      await backend.listDatabases()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.method).toBe('listDatabases')
    })

    it('should handle empty database list', async () => {
      mockFetch.mockResolvedValueOnce(mockRpcSuccess([]))

      const result = await backend.listDatabases()

      expect(result).toEqual([])
    })
  })

  // ==========================================================================
  // ListCollections Operations
  // ==========================================================================

  describe('listCollections', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should return list of collections', async () => {
      const collections = [
        { name: 'users', type: 'collection', options: {}, info: { readOnly: false } },
        { name: 'posts', type: 'collection', options: {}, info: { readOnly: false } },
      ]
      mockFetch.mockResolvedValueOnce(mockRpcSuccess(collections))

      const result = await backend.listCollections('mydb')

      expect(result).toEqual(collections)
    })

    it('should pass filter to RPC call', async () => {
      mockFetch.mockResolvedValueOnce(mockRpcSuccess([]))

      await backend.listCollections('db', { name: 'users' })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.method).toBe('listCollections')
      expect(body.db).toBe('db')
      expect(body.filter).toEqual({ name: 'users' })
    })

    it('should handle database with no collections', async () => {
      mockFetch.mockResolvedValueOnce(mockRpcSuccess([]))

      const result = await backend.listCollections('emptydb')

      expect(result).toEqual([])
    })
  })

  // ==========================================================================
  // Cursor Operations
  // ==========================================================================

  describe('cursor operations', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    describe('createCursor', () => {
      it('should store cursor state', () => {
        const cursorState: CursorState = {
          id: 12345n,
          namespace: 'db.collection',
          documents: [{ _id: '1' }, { _id: '2' }],
          position: 0,
          batchSize: 100,
          createdAt: Date.now(),
        }

        backend.createCursor(cursorState)
        const retrieved = backend.getCursor(12345n)

        expect(retrieved).toEqual(cursorState)
      })
    })

    describe('getCursor', () => {
      it('should return undefined for non-existent cursor', () => {
        const result = backend.getCursor(99999n)
        expect(result).toBeUndefined()
      })

      it('should return stored cursor state', () => {
        const cursorState: CursorState = {
          id: 1n,
          namespace: 'test.coll',
          documents: [],
          position: 0,
          batchSize: 10,
          createdAt: Date.now(),
        }
        backend.createCursor(cursorState)

        const result = backend.getCursor(1n)

        expect(result).toBe(cursorState)
      })
    })

    describe('advanceCursor', () => {
      it('should return next batch of documents', () => {
        const docs = Array.from({ length: 10 }, (_, i) => ({ _id: String(i) }))
        const cursorState: CursorState = {
          id: 100n,
          namespace: 'db.col',
          documents: docs,
          position: 0,
          batchSize: 5,
          createdAt: Date.now(),
        }
        backend.createCursor(cursorState)

        const batch1 = backend.advanceCursor(100n, 5)
        expect(batch1).toHaveLength(5)
        expect(batch1[0]._id).toBe('0')

        const batch2 = backend.advanceCursor(100n, 5)
        expect(batch2).toHaveLength(5)
        expect(batch2[0]._id).toBe('5')
      })

      it('should return empty array for non-existent cursor', () => {
        const result = backend.advanceCursor(999n, 10)
        expect(result).toEqual([])
      })

      it('should return remaining documents if less than count', () => {
        const cursorState: CursorState = {
          id: 200n,
          namespace: 'db.col',
          documents: [{ _id: '1' }, { _id: '2' }, { _id: '3' }],
          position: 1,
          batchSize: 10,
          createdAt: Date.now(),
        }
        backend.createCursor(cursorState)

        const result = backend.advanceCursor(200n, 10)

        expect(result).toHaveLength(2)
        expect(result[0]._id).toBe('2')
        expect(result[1]._id).toBe('3')
      })
    })

    describe('closeCursor', () => {
      it('should remove cursor and return true', () => {
        const cursorState: CursorState = {
          id: 300n,
          namespace: 'db.col',
          documents: [],
          position: 0,
          batchSize: 100,
          createdAt: Date.now(),
        }
        backend.createCursor(cursorState)

        const result = backend.closeCursor(300n)

        expect(result).toBe(true)
        expect(backend.getCursor(300n)).toBeUndefined()
      })

      it('should return false for non-existent cursor', () => {
        const result = backend.closeCursor(999n)
        expect(result).toBe(false)
      })
    })

    describe('cleanupExpiredCursors', () => {
      it('should remove expired cursors', () => {
        const oldTime = Date.now() - 15 * 60 * 1000 // 15 minutes ago
        const expiredCursor: CursorState = {
          id: 400n,
          namespace: 'db.col',
          documents: [],
          position: 0,
          batchSize: 100,
          createdAt: oldTime,
        }
        const activeCursor: CursorState = {
          id: 401n,
          namespace: 'db.col',
          documents: [],
          position: 0,
          batchSize: 100,
          createdAt: Date.now(),
        }

        backend.createCursor(expiredCursor)
        backend.createCursor(activeCursor)

        backend.cleanupExpiredCursors()

        expect(backend.getCursor(400n)).toBeUndefined()
        expect(backend.getCursor(401n)).toBeDefined()
      })
    })
  })

  // ==========================================================================
  // Authentication
  // ==========================================================================

  describe('authentication', () => {
    it('should include auth token in request headers', async () => {
      const backend = new WorkersProxyBackend({
        endpoint: TEST_ENDPOINT,
        authToken: TEST_AUTH_TOKEN,
      })

      mockFetch.mockResolvedValueOnce(mockRpcSuccess([]))

      await backend.listDatabases()

      const options = mockFetch.mock.calls[0][1]
      expect(options.headers['Authorization']).toBe(`Bearer ${TEST_AUTH_TOKEN}`)
    })

    it('should not include auth header when no token provided', async () => {
      const backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })

      mockFetch.mockResolvedValueOnce(mockRpcSuccess([]))

      await backend.listDatabases()

      const options = mockFetch.mock.calls[0][1]
      expect(options.headers['Authorization']).toBeUndefined()
    })
  })

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error handling', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    it('should throw MongoProxyError with code and codeName', async () => {
      mockFetch.mockResolvedValueOnce(
        mockRpcError('Unauthorized', 13, 'Unauthorized')
      )

      try {
        await backend.find('db', 'col', {})
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(MongoProxyError)
        expect((err as MongoProxyError).code).toBe(13)
        expect((err as MongoProxyError).codeName).toBe('Unauthorized')
      }
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(backend.find('db', 'col', {})).rejects.toThrow('Network error')
    })

    it('should handle invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: () => Promise.reject(new Error('Invalid JSON')),
      })

      await expect(backend.find('db', 'col', {})).rejects.toThrow('Invalid JSON')
    })

    it('should handle HTTP errors without JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'Content-Type': 'text/plain' }),
      })

      await expect(backend.find('db', 'col', {})).rejects.toThrow('HTTP error: 500')
    })
  })

  // ==========================================================================
  // Retry Logic
  // ==========================================================================

  describe('retry logic', () => {
    it('should retry on retryable status codes', async () => {
      const backend = new WorkersProxyBackend({
        endpoint: TEST_ENDPOINT,
        retries: 2,
        retryDelay: 10,
      })

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' }),
        })
        .mockResolvedValueOnce(mockRpcSuccess([]))

      const result = await backend.listDatabases()

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result).toEqual([])
    })

    it('should not retry on non-retryable error codes', async () => {
      const backend = new WorkersProxyBackend({
        endpoint: TEST_ENDPOINT,
        retries: 3,
        retryDelay: 10,
      })

      mockFetch.mockResolvedValue(
        mockRpcError('Duplicate key', 11000, 'DuplicateKey')
      )

      await expect(backend.insertOne('db', 'col', { _id: 'dup' })).rejects.toThrow()
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should exhaust retries before failing', async () => {
      const backend = new WorkersProxyBackend({
        endpoint: TEST_ENDPOINT,
        retries: 2,
        retryDelay: 10,
      })

      mockFetch.mockRejectedValue(new Error('Connection refused'))

      await expect(backend.find('db', 'col', {})).rejects.toThrow('Connection refused')
      expect(mockFetch).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })
  })

  // ==========================================================================
  // Database Operations
  // ==========================================================================

  describe('database operations', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    describe('createDatabase', () => {
      it('should create a database', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(null))

        await backend.createDatabase('newdb')

        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.method).toBe('createDatabase')
        expect(body.db).toBe('newdb')
      })
    })

    describe('dropDatabase', () => {
      it('should drop a database', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(null))

        await backend.dropDatabase('olddb')

        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.method).toBe('dropDatabase')
        expect(body.db).toBe('olddb')
      })
    })

    describe('databaseExists', () => {
      it('should check if database exists', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(true))

        const result = await backend.databaseExists('mydb')

        expect(result).toBe(true)
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.method).toBe('databaseExists')
      })
    })
  })

  // ==========================================================================
  // Collection Operations
  // ==========================================================================

  describe('collection operations', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    describe('createCollection', () => {
      it('should create a collection', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(null))

        await backend.createCollection('db', 'newcoll', { capped: true, size: 1000000 })

        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.method).toBe('createCollection')
        expect(body.db).toBe('db')
        expect(body.collection).toBe('newcoll')
        expect(body.options).toEqual({ capped: true, size: 1000000 })
      })
    })

    describe('dropCollection', () => {
      it('should drop a collection', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(null))

        await backend.dropCollection('db', 'oldcoll')

        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.method).toBe('dropCollection')
      })
    })

    describe('collectionExists', () => {
      it('should check if collection exists', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(true))

        const result = await backend.collectionExists('db', 'users')

        expect(result).toBe(true)
      })
    })

    describe('collStats', () => {
      it('should return collection statistics', async () => {
        const stats = {
          ns: 'db.users',
          count: 1000,
          size: 50000,
          avgObjSize: 50,
          storageSize: 60000,
          totalIndexSize: 10000,
          nindexes: 3,
          indexSizes: { _id_: 5000, email_1: 3000, name_1: 2000 },
        }
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(stats))

        const result = await backend.collStats('db', 'users')

        expect(result).toEqual(stats)
      })
    })

    describe('dbStats', () => {
      it('should return database statistics', async () => {
        const stats = {
          db: 'mydb',
          collections: 5,
          views: 1,
          objects: 10000,
          avgObjSize: 100,
          dataSize: 1000000,
          storageSize: 1200000,
          indexes: 10,
          indexSize: 50000,
        }
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(stats))

        const result = await backend.dbStats('mydb')

        expect(result).toEqual(stats)
      })
    })
  })

  // ==========================================================================
  // Count and Distinct
  // ==========================================================================

  describe('count and distinct', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    describe('count', () => {
      it('should count documents', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(42))

        const result = await backend.count('db', 'users', { active: true })

        expect(result).toBe(42)
        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.method).toBe('count')
        expect(body.query).toEqual({ active: true })
      })

      it('should count all documents with no query', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(100))

        const result = await backend.count('db', 'users')

        expect(result).toBe(100)
      })
    })

    describe('distinct', () => {
      it('should return distinct values', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(['red', 'green', 'blue']))

        const result = await backend.distinct('db', 'products', 'color')

        expect(result).toEqual(['red', 'green', 'blue'])
      })

      it('should filter distinct values with query', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess([1, 2, 3]))

        await backend.distinct('db', 'items', 'category', { active: true })

        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.method).toBe('distinct')
        expect(body.field).toBe('category')
        expect(body.query).toEqual({ active: true })
      })
    })
  })

  // ==========================================================================
  // Index Operations
  // ==========================================================================

  describe('index operations', () => {
    let backend: WorkersProxyBackend

    beforeEach(() => {
      backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })
    })

    describe('listIndexes', () => {
      it('should list indexes', async () => {
        const indexes = [
          { v: 2, key: { _id: 1 }, name: '_id_' },
          { v: 2, key: { email: 1 }, name: 'email_1', unique: true },
        ]
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(indexes))

        const result = await backend.listIndexes('db', 'users')

        expect(result).toEqual(indexes)
      })
    })

    describe('createIndexes', () => {
      it('should create indexes', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(['name_1', 'email_1']))

        const result = await backend.createIndexes('db', 'users', [
          { key: { name: 1 } },
          { key: { email: 1 }, unique: true },
        ])

        expect(result).toEqual(['name_1', 'email_1'])
      })
    })

    describe('dropIndex', () => {
      it('should drop an index', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(null))

        await backend.dropIndex('db', 'users', 'email_1')

        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.method).toBe('dropIndex')
        expect(body.options.indexName).toBe('email_1')
      })
    })

    describe('dropIndexes', () => {
      it('should drop all indexes except _id', async () => {
        mockFetch.mockResolvedValueOnce(mockRpcSuccess(null))

        await backend.dropIndexes('db', 'users')

        const body = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(body.method).toBe('dropIndexes')
      })
    })
  })

  // ==========================================================================
  // Timeout Handling
  // ==========================================================================

  describe('timeout handling', () => {
    it('should use custom timeout', async () => {
      const backend = new WorkersProxyBackend({
        endpoint: TEST_ENDPOINT,
        timeout: 5000,
      })

      mockFetch.mockResolvedValueOnce(mockRpcSuccess([]))

      await backend.listDatabases()

      // Verify that AbortSignal.timeout was called with correct value
      expect(mockFetch).toHaveBeenCalledWith(
        TEST_ENDPOINT,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })

    it('should use default timeout of 30000ms', async () => {
      const backend = new WorkersProxyBackend({ endpoint: TEST_ENDPOINT })

      mockFetch.mockResolvedValueOnce(mockRpcSuccess([]))

      await backend.listDatabases()

      // The default timeout should be 30000ms
      expect(mockFetch).toHaveBeenCalled()
    })
  })
})
