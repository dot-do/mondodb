import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for DatabaseProxy WorkerEntrypoint
 *
 * These tests verify that DatabaseProxy correctly:
 * - Routes CRUD operations to the Durable Object stub
 * - Uses props to identify the database instance
 * - Propagates errors correctly
 * - Handles collection management operations
 */

// Mock the cloudflare:workers module
vi.mock('cloudflare:workers', () => ({
  WorkerEntrypoint: class WorkerEntrypoint<Env> {
    protected ctx: unknown
    protected env: Env

    constructor() {
      this.ctx = {}
      this.env = {} as Env
    }
  },
}))

// Import after mock setup
import {
  DatabaseProxy,
  type Env,
  type DurableObjectStub,
  type DurableObjectNamespace,
} from '../../../../src/mcp/sandbox/database-proxy'

describe('DatabaseProxy WorkerEntrypoint', () => {
  let mockStub: DurableObjectStub
  let mockNamespace: DurableObjectNamespace
  let mockEnv: Env
  let proxy: DatabaseProxy

  beforeEach(() => {
    // Create mock stub that returns successful responses
    mockStub = {
      fetch: vi.fn().mockImplementation(async (request: Request) => {
        const url = new URL(request.url)
        const path = url.pathname

        // Return appropriate mock responses based on the endpoint
        if (path === '/find') {
          return new Response(JSON.stringify({ documents: [{ _id: '1', name: 'test' }] }))
        }
        if (path === '/findOne') {
          return new Response(JSON.stringify({ document: { _id: '1', name: 'test' } }))
        }
        if (path === '/insertOne') {
          return new Response(JSON.stringify({ insertedId: 'abc123' }))
        }
        if (path === '/insertMany') {
          return new Response(JSON.stringify({ insertedIds: ['abc123', 'def456'] }))
        }
        if (path === '/updateOne') {
          return new Response(JSON.stringify({ modifiedCount: 1 }))
        }
        if (path === '/updateMany') {
          return new Response(JSON.stringify({ modifiedCount: 5 }))
        }
        if (path === '/deleteOne') {
          return new Response(JSON.stringify({ deletedCount: 1 }))
        }
        if (path === '/deleteMany') {
          return new Response(JSON.stringify({ deletedCount: 3 }))
        }
        if (path === '/aggregate') {
          return new Response(JSON.stringify({ documents: [{ total: 100 }] }))
        }
        if (path === '/countDocuments') {
          return new Response(JSON.stringify({ count: 42 }))
        }
        if (path === '/listCollections') {
          return new Response(JSON.stringify(['users', 'products', 'orders']))
        }

        return new Response('Not found', { status: 404 })
      }),
    }

    mockNamespace = {
      idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-id' }),
      get: vi.fn().mockReturnValue(mockStub),
    }

    mockEnv = {
      MONDO_DATABASE: mockNamespace,
    }

    // Create proxy instance and manually set up the context/env
    proxy = new DatabaseProxy()
    ;(proxy as unknown as { ctx: { props: { databaseId: string } } }).ctx = {
      props: { databaseId: 'testdb' },
    }
    ;(proxy as unknown as { env: Env }).env = mockEnv
  })

  describe('constructor and initialization', () => {
    it('should extend WorkerEntrypoint', () => {
      expect(proxy).toBeInstanceOf(DatabaseProxy)
    })
  })

  describe('getDatabaseStub', () => {
    it('should get the correct database stub based on databaseId prop', async () => {
      await proxy.find('users', {})

      expect(mockNamespace.idFromName).toHaveBeenCalledWith('testdb')
      expect(mockNamespace.get).toHaveBeenCalled()
    })
  })

  describe('CRUD operations', () => {
    describe('find', () => {
      it('should call find endpoint with collection and filter', async () => {
        const result = await proxy.find('users', { active: true })

        expect(mockStub.fetch).toHaveBeenCalled()
        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/find')

        const body = JSON.parse(await request.text())
        expect(body.collection).toBe('users')
        expect(body.filter).toEqual({ active: true })
      })

      it('should default filter to empty object', async () => {
        await proxy.find('users')

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        const body = JSON.parse(await request.text())
        expect(body.filter).toEqual({})
      })
    })

    describe('findOne', () => {
      it('should call findOne endpoint', async () => {
        await proxy.findOne('users', { _id: '123' })

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/findOne')
      })
    })

    describe('insertOne', () => {
      it('should call insertOne endpoint with document', async () => {
        await proxy.insertOne('users', { name: 'John', email: 'john@test.com' })

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/insertOne')
        const body = JSON.parse(await request.text())
        expect(body.collection).toBe('users')
        expect(body.document).toEqual({ name: 'John', email: 'john@test.com' })
      })

      it('should throw error if document is not provided', async () => {
        await expect(proxy.insertOne('users', null as unknown as object)).rejects.toThrow(
          'Document is required'
        )
      })
    })

    describe('insertMany', () => {
      it('should call insertMany endpoint with documents array', async () => {
        await proxy.insertMany('users', [{ name: 'John' }, { name: 'Jane' }])

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/insertMany')
        const body = JSON.parse(await request.text())
        expect(body.documents).toHaveLength(2)
      })
    })

    describe('updateOne', () => {
      it('should call updateOne endpoint with filter and update', async () => {
        await proxy.updateOne('users', { _id: '123' }, { $set: { name: 'Updated' } })

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/updateOne')
        const body = JSON.parse(await request.text())
        expect(body.filter).toEqual({ _id: '123' })
        expect(body.update).toEqual({ $set: { name: 'Updated' } })
      })
    })

    describe('updateMany', () => {
      it('should call updateMany endpoint', async () => {
        await proxy.updateMany('users', { active: false }, { $set: { active: true } })

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/updateMany')
      })
    })

    describe('deleteOne', () => {
      it('should call deleteOne endpoint with filter', async () => {
        await proxy.deleteOne('users', { _id: '123' })

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/deleteOne')
        const body = JSON.parse(await request.text())
        expect(body.filter).toEqual({ _id: '123' })
      })
    })

    describe('deleteMany', () => {
      it('should call deleteMany endpoint', async () => {
        await proxy.deleteMany('users', { active: false })

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/deleteMany')
      })
    })

    describe('aggregate', () => {
      it('should call aggregate endpoint with pipeline', async () => {
        const pipeline = [{ $match: { status: 'active' } }, { $group: { _id: '$type', count: { $sum: 1 } } }]
        await proxy.aggregate('orders', pipeline)

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/aggregate')
        const body = JSON.parse(await request.text())
        expect(body.pipeline).toEqual(pipeline)
      })
    })

    describe('countDocuments', () => {
      it('should call countDocuments endpoint', async () => {
        await proxy.countDocuments('users', { active: true })

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/countDocuments')
      })
    })
  })

  describe('collection management', () => {
    describe('listCollections', () => {
      it('should call listCollections endpoint', async () => {
        const result = await proxy.listCollections()

        const call = (mockStub.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
        const request = call[0] as Request
        expect(request.url).toContain('/listCollections')
        expect(request.method).toBe('POST')
      })
    })

    describe('listDatabases', () => {
      it('should return the current database ID', async () => {
        const result = await proxy.listDatabases()

        expect(result).toEqual(['testdb'])
      })
    })
  })

  describe('error handling', () => {
    it('should throw error when collection name is not provided', async () => {
      await expect(proxy.find('', {})).rejects.toThrow('Collection name is required')
    })

    it('should propagate errors from the Durable Object', async () => {
      ;(mockStub.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        new Response('Database error: connection failed', { status: 500 })
      )

      await expect(proxy.find('users', {})).rejects.toThrow()
    })
  })

  describe('props identification', () => {
    it('should use databaseId from props to route requests', async () => {
      // Change the database ID
      ;(proxy as unknown as { ctx: { props: { databaseId: string } } }).ctx.props.databaseId =
        'otherdb'

      await proxy.find('users', {})

      expect(mockNamespace.idFromName).toHaveBeenCalledWith('otherdb')
    })
  })
})
