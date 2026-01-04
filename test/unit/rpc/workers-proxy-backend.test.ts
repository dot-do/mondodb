/**
 * WorkersProxyBackend Tests (RED Phase)
 *
 * Tests for the MondoBackend implementation that proxies requests
 * to Cloudflare Workers via the RPC endpoint.
 *
 * These tests should FAIL initially - the implementation doesn't exist yet.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================================
// Mock Types and Helpers
// ============================================================================

/**
 * Mock RPC client for testing
 */
function createMockRpcClient() {
  return {
    call: vi.fn(),
    close: vi.fn(),
  }
}

// ============================================================================
// Import the implementation (should fail initially)
// ============================================================================

import { WorkersProxyBackend } from '../../../src/wire/backend/workers-proxy'
import type { MondoBackend, FindOptions } from '../../../src/wire/backend/interface'

describe('WorkersProxyBackend', () => {
  let backend: MondoBackend
  let mockClient: ReturnType<typeof createMockRpcClient>

  beforeEach(() => {
    mockClient = createMockRpcClient()
  })

  // ==========================================================================
  // 1. Construction and Configuration
  // ==========================================================================

  describe('Construction and Configuration', () => {
    it('creates backend with RPC endpoint URL', () => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
      })

      expect(backend).toBeDefined()
    })

    it('creates backend with authentication token', () => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
        authToken: 'my-secret-token',
      })

      expect(backend).toBeDefined()
    })

    it('creates backend with custom timeout', () => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
        timeout: 60000,
      })

      expect(backend).toBeDefined()
    })

    it('creates backend with retry options', () => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
        retries: 3,
        retryDelay: 1000,
      })

      expect(backend).toBeDefined()
    })

    it('throws if endpoint is not provided', () => {
      expect(() => {
        // @ts-expect-error - Testing missing endpoint
        new WorkersProxyBackend({})
      }).toThrow(/endpoint/i)
    })

    it('throws if endpoint is invalid URL', () => {
      expect(() => {
        new WorkersProxyBackend({
          endpoint: 'not-a-valid-url',
        })
      }).toThrow(/endpoint/i)
    })
  })

  // ==========================================================================
  // 2. Database Operations
  // ==========================================================================

  describe('Database Operations', () => {
    beforeEach(() => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
      })
    })

    describe('listDatabases', () => {
      it('calls RPC endpoint with listDatabases method', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: [
                { name: 'testdb', sizeOnDisk: 1024, empty: false },
                { name: 'admin', sizeOnDisk: 512, empty: false },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.listDatabases()

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"method":"listDatabases"'),
          })
        )

        expect(result).toHaveLength(2)
        expect(result[0].name).toBe('testdb')

        fetchSpy.mockRestore()
      })
    })

    describe('createDatabase', () => {
      it('calls RPC endpoint with createDatabase method', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: null }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        await backend.createDatabase('newdb')

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"method":"createDatabase"'),
          })
        )

        fetchSpy.mockRestore()
      })
    })

    describe('dropDatabase', () => {
      it('calls RPC endpoint with dropDatabase method', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: null }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        await backend.dropDatabase('olddb')

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"method":"dropDatabase"'),
          })
        )

        fetchSpy.mockRestore()
      })
    })

    describe('databaseExists', () => {
      it('returns true when database exists', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: true }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        const result = await backend.databaseExists('testdb')

        expect(result).toBe(true)
        fetchSpy.mockRestore()
      })

      it('returns false when database does not exist', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: false }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        const result = await backend.databaseExists('nonexistent')

        expect(result).toBe(false)
        fetchSpy.mockRestore()
      })
    })
  })

  // ==========================================================================
  // 3. Collection Operations
  // ==========================================================================

  describe('Collection Operations', () => {
    beforeEach(() => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
      })
    })

    describe('listCollections', () => {
      it('calls RPC endpoint with db parameter', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: [
                { name: 'users', type: 'collection' },
                { name: 'products', type: 'collection' },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.listCollections('testdb')

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            body: expect.stringContaining('"db":"testdb"'),
          })
        )

        expect(result).toHaveLength(2)
        fetchSpy.mockRestore()
      })

      it('supports filter parameter', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: [{ name: 'users', type: 'collection' }],
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        await backend.listCollections('testdb', { name: 'users' })

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            body: expect.stringContaining('"filter"'),
          })
        )

        fetchSpy.mockRestore()
      })
    })

    describe('createCollection', () => {
      it('calls RPC endpoint with collection name', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: null }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        await backend.createCollection('testdb', 'newcollection')

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            body: expect.stringContaining('"collection":"newcollection"'),
          })
        )

        fetchSpy.mockRestore()
      })

      it('supports collection options', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: null }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        await backend.createCollection('testdb', 'capped', { capped: true, size: 10000 })

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            body: expect.stringContaining('"capped"'),
          })
        )

        fetchSpy.mockRestore()
      })
    })

    describe('dropCollection', () => {
      it('calls RPC endpoint to drop collection', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: null }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        await backend.dropCollection('testdb', 'oldcollection')

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            body: expect.stringContaining('"method":"dropCollection"'),
          })
        )

        fetchSpy.mockRestore()
      })
    })

    describe('collectionExists', () => {
      it('returns true when collection exists', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: true }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        const result = await backend.collectionExists('testdb', 'users')

        expect(result).toBe(true)
        fetchSpy.mockRestore()
      })
    })

    describe('collStats', () => {
      it('returns collection statistics', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                ns: 'testdb.users',
                count: 100,
                size: 50000,
                avgObjSize: 500,
                storageSize: 60000,
                totalIndexSize: 10000,
                nindexes: 2,
                indexSizes: { _id_: 5000, email_1: 5000 },
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.collStats('testdb', 'users')

        expect(result.count).toBe(100)
        expect(result.ns).toBe('testdb.users')
        fetchSpy.mockRestore()
      })
    })

    describe('dbStats', () => {
      it('returns database statistics', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                db: 'testdb',
                collections: 5,
                views: 0,
                objects: 1000,
                avgObjSize: 500,
                dataSize: 500000,
                storageSize: 600000,
                indexes: 10,
                indexSize: 50000,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.dbStats('testdb')

        expect(result.collections).toBe(5)
        expect(result.db).toBe('testdb')
        fetchSpy.mockRestore()
      })
    })
  })

  // ==========================================================================
  // 4. CRUD Operations
  // ==========================================================================

  describe('CRUD Operations', () => {
    beforeEach(() => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
      })
    })

    describe('find', () => {
      it('sends find request with filter', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                documents: [{ _id: '1', name: 'Alice' }],
                cursorId: '0',
                hasMore: false,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const options: FindOptions = { filter: { status: 'active' } }
        const result = await backend.find('testdb', 'users', options)

        expect(result.documents).toHaveLength(1)
        expect(result.documents[0].name).toBe('Alice')
        fetchSpy.mockRestore()
      })

      it('sends find request with projection', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                documents: [{ _id: '1', name: 'Alice' }],
                cursorId: '0',
                hasMore: false,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const options: FindOptions = { filter: {}, projection: { name: 1 } }
        await backend.find('testdb', 'users', options)

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            body: expect.stringContaining('"projection"'),
          })
        )

        fetchSpy.mockRestore()
      })

      it('sends find request with sort', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                documents: [],
                cursorId: '0',
                hasMore: false,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const options: FindOptions = { filter: {}, sort: { createdAt: -1 } }
        await backend.find('testdb', 'users', options)

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            body: expect.stringContaining('"sort"'),
          })
        )

        fetchSpy.mockRestore()
      })

      it('sends find request with limit and skip', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                documents: [],
                cursorId: '0',
                hasMore: false,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const options: FindOptions = { filter: {}, limit: 10, skip: 20 }
        await backend.find('testdb', 'users', options)

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            body: expect.stringMatching(/"limit":10/),
          })
        )

        fetchSpy.mockRestore()
      })

      it('returns cursor info for large result sets', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                documents: Array(100).fill({ _id: '1' }),
                cursorId: '12345678901234567890',
                hasMore: true,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.find('testdb', 'users', {})

        expect(result.hasMore).toBe(true)
        expect(result.cursorId).toBe(BigInt('12345678901234567890'))
        fetchSpy.mockRestore()
      })
    })

    describe('insertOne', () => {
      it('sends insertOne request', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                acknowledged: true,
                insertedIds: new Map([[0, '507f1f77bcf86cd799439011']]),
                insertedCount: 1,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.insertOne('testdb', 'users', { name: 'Alice', email: 'alice@example.com' })

        expect(result.acknowledged).toBe(true)
        expect(result.insertedCount).toBe(1)
        fetchSpy.mockRestore()
      })
    })

    describe('insertMany', () => {
      it('sends insertMany request', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                acknowledged: true,
                insertedIds: { 0: 'id1', 1: 'id2' },
                insertedCount: 2,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.insertMany('testdb', 'users', [
          { name: 'Alice' },
          { name: 'Bob' },
        ])

        expect(result.insertedCount).toBe(2)
        fetchSpy.mockRestore()
      })
    })

    describe('updateOne', () => {
      it('sends updateOne request', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                acknowledged: true,
                matchedCount: 1,
                modifiedCount: 1,
                upsertedCount: 0,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.updateOne(
          'testdb',
          'users',
          { _id: '123' },
          { $set: { name: 'Updated' } }
        )

        expect(result.matchedCount).toBe(1)
        expect(result.modifiedCount).toBe(1)
        fetchSpy.mockRestore()
      })

      it('supports upsert option', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                acknowledged: true,
                matchedCount: 0,
                modifiedCount: 0,
                upsertedCount: 1,
                upsertedId: 'new-id',
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.updateOne(
          'testdb',
          'users',
          { email: 'new@example.com' },
          { $set: { name: 'New User' } },
          { upsert: true }
        )

        expect(result.upsertedCount).toBe(1)
        fetchSpy.mockRestore()
      })
    })

    describe('updateMany', () => {
      it('sends updateMany request', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                acknowledged: true,
                matchedCount: 5,
                modifiedCount: 5,
                upsertedCount: 0,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.updateMany(
          'testdb',
          'users',
          { status: 'pending' },
          { $set: { status: 'active' } }
        )

        expect(result.matchedCount).toBe(5)
        fetchSpy.mockRestore()
      })
    })

    describe('deleteOne', () => {
      it('sends deleteOne request', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                acknowledged: true,
                deletedCount: 1,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.deleteOne('testdb', 'users', { _id: '123' })

        expect(result.deletedCount).toBe(1)
        fetchSpy.mockRestore()
      })
    })

    describe('deleteMany', () => {
      it('sends deleteMany request', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: {
                acknowledged: true,
                deletedCount: 10,
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.deleteMany('testdb', 'users', { status: 'inactive' })

        expect(result.deletedCount).toBe(10)
        fetchSpy.mockRestore()
      })
    })
  })

  // ==========================================================================
  // 5. Count and Distinct
  // ==========================================================================

  describe('Count and Distinct', () => {
    beforeEach(() => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
      })
    })

    describe('count', () => {
      it('returns document count', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: 42 }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        const result = await backend.count('testdb', 'users', { status: 'active' })

        expect(result).toBe(42)
        fetchSpy.mockRestore()
      })

      it('returns total count without query', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: 100 }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        const result = await backend.count('testdb', 'users')

        expect(result).toBe(100)
        fetchSpy.mockRestore()
      })
    })

    describe('distinct', () => {
      it('returns distinct values', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: ['active', 'inactive', 'pending'],
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.distinct('testdb', 'users', 'status')

        expect(result).toEqual(['active', 'inactive', 'pending'])
        fetchSpy.mockRestore()
      })

      it('supports query filter', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: ['USA', 'Canada'],
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.distinct('testdb', 'users', 'country', { region: 'north-america' })

        expect(result).toEqual(['USA', 'Canada'])
        fetchSpy.mockRestore()
      })
    })
  })

  // ==========================================================================
  // 6. Aggregation
  // ==========================================================================

  describe('Aggregation', () => {
    beforeEach(() => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
      })
    })

    it('sends aggregate request with pipeline', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 1,
            result: {
              documents: [{ _id: 'active', count: 100 }],
              cursorId: '0',
              hasMore: false,
            },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const result = await backend.aggregate('testdb', 'users', [
        { $match: { status: 'active' } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])

      expect(result.documents).toHaveLength(1)
      expect(result.documents[0].count).toBe(100)
      fetchSpy.mockRestore()
    })

    it('supports aggregation options', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 1,
            result: {
              documents: [],
              cursorId: '0',
              hasMore: false,
            },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      await backend.aggregate('testdb', 'users', [{ $match: {} }], {
        batchSize: 1000,
        allowDiskUse: true,
      })

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://mondo.workers.dev/rpc',
        expect.objectContaining({
          body: expect.stringContaining('"allowDiskUse"'),
        })
      )

      fetchSpy.mockRestore()
    })
  })

  // ==========================================================================
  // 7. Index Operations
  // ==========================================================================

  describe('Index Operations', () => {
    beforeEach(() => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
      })
    })

    describe('listIndexes', () => {
      it('returns index list', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: [
                { v: 2, key: { _id: 1 }, name: '_id_' },
                { v: 2, key: { email: 1 }, name: 'email_1', unique: true },
              ],
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.listIndexes('testdb', 'users')

        expect(result).toHaveLength(2)
        expect(result[1].unique).toBe(true)
        fetchSpy.mockRestore()
      })
    })

    describe('createIndexes', () => {
      it('creates indexes and returns names', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: ['email_1', 'name_1_status_1'],
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const result = await backend.createIndexes('testdb', 'users', [
          { key: { email: 1 }, unique: true },
          { key: { name: 1, status: 1 } },
        ])

        expect(result).toEqual(['email_1', 'name_1_status_1'])
        fetchSpy.mockRestore()
      })
    })

    describe('dropIndex', () => {
      it('drops specified index', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: null }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        await backend.dropIndex('testdb', 'users', 'email_1')

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            body: expect.stringContaining('"method":"dropIndex"'),
          })
        )

        fetchSpy.mockRestore()
      })
    })

    describe('dropIndexes', () => {
      it('drops all indexes except _id', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: 1, result: null }), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        await backend.dropIndexes('testdb', 'users')

        expect(fetchSpy).toHaveBeenCalledWith(
          'https://mondo.workers.dev/rpc',
          expect.objectContaining({
            body: expect.stringContaining('"method":"dropIndexes"'),
          })
        )

        fetchSpy.mockRestore()
      })
    })
  })

  // ==========================================================================
  // 8. Cursor Management
  // ==========================================================================

  describe('Cursor Management', () => {
    beforeEach(() => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
      })
    })

    describe('createCursor', () => {
      it('stores cursor state locally', () => {
        const cursorState = {
          id: 12345678901234567890n,
          namespace: 'testdb.users',
          documents: [{ _id: '1' }],
          position: 0,
          batchSize: 100,
          createdAt: Date.now(),
        }

        // This should not throw
        backend.createCursor(cursorState)

        // Verify cursor was stored
        const retrieved = backend.getCursor(cursorState.id)
        expect(retrieved).toBeDefined()
        expect(retrieved?.namespace).toBe('testdb.users')
      })
    })

    describe('getCursor', () => {
      it('returns undefined for non-existent cursor', () => {
        const result = backend.getCursor(999n)
        expect(result).toBeUndefined()
      })
    })

    describe('advanceCursor', () => {
      it('returns documents from cursor position', () => {
        const documents = Array.from({ length: 200 }, (_, i) => ({ _id: String(i) }))
        const cursorState = {
          id: 12345n,
          namespace: 'testdb.users',
          documents,
          position: 0,
          batchSize: 100,
          createdAt: Date.now(),
        }

        backend.createCursor(cursorState)
        const batch = backend.advanceCursor(12345n, 50)

        expect(batch).toHaveLength(50)
        expect(batch[0]._id).toBe('0')
        expect(batch[49]._id).toBe('49')
      })

      it('advances cursor position', () => {
        const documents = Array.from({ length: 200 }, (_, i) => ({ _id: String(i) }))
        const cursorState = {
          id: 12346n,
          namespace: 'testdb.users',
          documents,
          position: 0,
          batchSize: 100,
          createdAt: Date.now(),
        }

        backend.createCursor(cursorState)

        // First batch
        backend.advanceCursor(12346n, 50)

        // Second batch should start from position 50
        const secondBatch = backend.advanceCursor(12346n, 50)
        expect(secondBatch[0]._id).toBe('50')
      })

      it('returns empty array for exhausted cursor', () => {
        const documents = [{ _id: '1' }]
        const cursorState = {
          id: 12347n,
          namespace: 'testdb.users',
          documents,
          position: 1, // Already exhausted
          batchSize: 100,
          createdAt: Date.now(),
        }

        backend.createCursor(cursorState)
        const batch = backend.advanceCursor(12347n, 50)

        expect(batch).toHaveLength(0)
      })
    })

    describe('closeCursor', () => {
      it('removes cursor from storage', () => {
        const cursorState = {
          id: 12348n,
          namespace: 'testdb.users',
          documents: [],
          position: 0,
          batchSize: 100,
          createdAt: Date.now(),
        }

        backend.createCursor(cursorState)
        const result = backend.closeCursor(12348n)

        expect(result).toBe(true)
        expect(backend.getCursor(12348n)).toBeUndefined()
      })

      it('returns false for non-existent cursor', () => {
        const result = backend.closeCursor(999n)
        expect(result).toBe(false)
      })
    })

    describe('cleanupExpiredCursors', () => {
      it('removes expired cursors', () => {
        const expiredCursor = {
          id: 12349n,
          namespace: 'testdb.users',
          documents: [],
          position: 0,
          batchSize: 100,
          createdAt: Date.now() - 11 * 60 * 1000, // 11 minutes ago (expired)
        }

        const validCursor = {
          id: 12350n,
          namespace: 'testdb.users',
          documents: [],
          position: 0,
          batchSize: 100,
          createdAt: Date.now(),
        }

        backend.createCursor(expiredCursor)
        backend.createCursor(validCursor)

        backend.cleanupExpiredCursors()

        expect(backend.getCursor(12349n)).toBeUndefined()
        expect(backend.getCursor(12350n)).toBeDefined()
      })
    })
  })

  // ==========================================================================
  // 9. Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    beforeEach(() => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
      })
    })

    it('throws on RPC error response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 0,
            error: 'Collection not found',
            code: 26,
            codeName: 'NamespaceNotFound',
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      await expect(backend.find('testdb', 'nonexistent', {})).rejects.toThrow('Collection not found')
    })

    it('throws on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

      await expect(backend.find('testdb', 'users', {})).rejects.toThrow('Network error')
    })

    it('throws on invalid JSON response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('not json', {
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await expect(backend.find('testdb', 'users', {})).rejects.toThrow()
    })

    it('throws on HTTP error status', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 })
      )

      await expect(backend.find('testdb', 'users', {})).rejects.toThrow()
    })

    it('preserves error code from RPC response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 0,
            error: 'Duplicate key error',
            code: 11000,
            codeName: 'DuplicateKey',
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      try {
        await backend.insertOne('testdb', 'users', { _id: 'duplicate' })
        expect.fail('Should have thrown')
      } catch (error) {
        expect((error as Error & { code?: number }).code).toBe(11000)
      }
    })
  })

  // ==========================================================================
  // 10. Authentication
  // ==========================================================================

  describe('Authentication', () => {
    it('includes Authorization header when token is provided', async () => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
        authToken: 'my-secret-token',
      })

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 1,
            result: { documents: [], cursorId: '0', hasMore: false },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      await backend.find('testdb', 'users', {})

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://mondo.workers.dev/rpc',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-secret-token',
          }),
        })
      )

      fetchSpy.mockRestore()
    })

    it('does not include Authorization header when token is not provided', async () => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
      })

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 1,
            result: { documents: [], cursorId: '0', hasMore: false },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      await backend.find('testdb', 'users', {})

      const callArgs = fetchSpy.mock.calls[0][1] as RequestInit
      expect(callArgs.headers).not.toHaveProperty('Authorization')

      fetchSpy.mockRestore()
    })
  })

  // ==========================================================================
  // 11. Retry Logic
  // ==========================================================================

  describe('Retry Logic', () => {
    it('retries on transient failures', async () => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
        retries: 3,
        retryDelay: 10, // Fast for testing
      })

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ok: 1,
              result: { documents: [], cursorId: '0', hasMore: false },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

      const result = await backend.find('testdb', 'users', {})

      expect(fetchSpy).toHaveBeenCalledTimes(3)
      expect(result.documents).toEqual([])

      fetchSpy.mockRestore()
    })

    it('fails after max retries', async () => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
        retries: 2,
        retryDelay: 10,
      })

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Persistent error'))

      await expect(backend.find('testdb', 'users', {})).rejects.toThrow('Persistent error')

      expect(fetchSpy).toHaveBeenCalledTimes(3) // 1 initial + 2 retries

      fetchSpy.mockRestore()
    })

    it('does not retry on non-retryable errors', async () => {
      backend = new WorkersProxyBackend({
        endpoint: 'https://mondo.workers.dev/rpc',
        retries: 3,
        retryDelay: 10,
      })

      // 400 errors should not be retried
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: 0,
            error: 'Bad request',
            code: 2,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      )

      await expect(backend.insertOne('testdb', 'users', {})).rejects.toThrow()

      expect(fetchSpy).toHaveBeenCalledTimes(1) // No retries

      fetchSpy.mockRestore()
    })
  })
})
