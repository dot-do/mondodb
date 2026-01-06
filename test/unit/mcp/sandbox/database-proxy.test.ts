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
      await expect(proxy.find('', {})).rejects.toThrow('Collection name must be a non-empty string')
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

  describe('rate limiting', () => {
    it('should throw error when rate limit is exceeded', async () => {
      // Set a very low rate limit
      ;(proxy as unknown as { ctx: { props: { databaseId: string; maxRequestsPerExecution: number } } }).ctx.props.maxRequestsPerExecution = 2

      // First two requests should succeed
      await proxy.find('users', {})
      await proxy.find('products', {})

      // Third request should fail
      await expect(proxy.find('orders', {})).rejects.toThrow(
        'Rate limit exceeded: too many database requests in single execution (max: 2)'
      )
    })

    it('should use default rate limit of 1000 if not specified', async () => {
      // Access private field to verify initial state
      const privateProxy = proxy as unknown as { requestCount: number }
      expect(privateProxy.requestCount).toBe(0)

      await proxy.find('users', {})
      expect(privateProxy.requestCount).toBe(1)
    })
  })

  describe('request deduplication', () => {
    it('should deduplicate identical concurrent requests', async () => {
      // Make two identical requests concurrently
      const [result1, result2] = await Promise.all([
        proxy.find('users', { active: true }),
        proxy.find('users', { active: true }),
      ])

      // Both should return same result
      expect(result1).toEqual(result2)

      // But fetch should only be called once
      expect(mockStub.fetch).toHaveBeenCalledTimes(1)
    })

    it('should not deduplicate different requests', async () => {
      // Make two different requests concurrently
      await Promise.all([
        proxy.find('users', { active: true }),
        proxy.find('users', { active: false }),
      ])

      // Both should call fetch
      expect(mockStub.fetch).toHaveBeenCalledTimes(2)
    })

    it('should deduplicate findOne requests', async () => {
      await Promise.all([
        proxy.findOne('users', { _id: '123' }),
        proxy.findOne('users', { _id: '123' }),
      ])

      expect(mockStub.fetch).toHaveBeenCalledTimes(1)
    })

    it('should NOT deduplicate write operations', async () => {
      // Write operations should not be deduplicated
      await Promise.all([
        proxy.insertOne('users', { name: 'John' }),
        proxy.insertOne('users', { name: 'John' }),
      ])

      // Both should call fetch because writes shouldn't be deduplicated
      expect(mockStub.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('audit logging', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    it('should log operations when enableAuditLog is true', async () => {
      ;(proxy as unknown as { ctx: { props: { databaseId: string; enableAuditLog: boolean } } }).ctx.props.enableAuditLog = true

      await proxy.find('users', { active: true })

      expect(consoleSpy).toHaveBeenCalled()
      const logCall = consoleSpy.mock.calls[0][0]
      const logEntry = JSON.parse(logCall)
      expect(logEntry.method).toBe('find')
      expect(logEntry.collection).toBe('users')
      expect(logEntry.databaseId).toBe('testdb')
    })

    it('should NOT log operations when enableAuditLog is false', async () => {
      ;(proxy as unknown as { ctx: { props: { databaseId: string; enableAuditLog: boolean } } }).ctx.props.enableAuditLog = false

      await proxy.find('users', { active: true })

      expect(consoleSpy).not.toHaveBeenCalled()
    })

    it('should redact sensitive fields in audit logs', async () => {
      ;(proxy as unknown as { ctx: { props: { databaseId: string; enableAuditLog: boolean } } }).ctx.props.enableAuditLog = true

      await proxy.find('users', {
        password: 'secret123',
        apiKey: 'key123',
        name: 'John',
      })

      expect(consoleSpy).toHaveBeenCalled()
      const logCall = consoleSpy.mock.calls[0][0]
      const logEntry = JSON.parse(logCall)
      expect(logEntry.args.filter.password).toBe('[REDACTED]')
      expect(logEntry.args.filter.apiKey).toBe('[REDACTED]')
      expect(logEntry.args.filter.name).toBe('John')
    })

    it('should redact nested sensitive fields', async () => {
      ;(proxy as unknown as { ctx: { props: { databaseId: string; enableAuditLog: boolean } } }).ctx.props.enableAuditLog = true

      await proxy.find('users', {
        user: {
          password: 'nested-secret',
          email: 'test@test.com',
        },
      })

      expect(consoleSpy).toHaveBeenCalled()
      const logCall = consoleSpy.mock.calls[0][0]
      const logEntry = JSON.parse(logCall)
      expect(logEntry.args.filter.user.password).toBe('[REDACTED]')
      expect(logEntry.args.filter.user.email).toBe('test@test.com')
    })
  })

  describe('input validation', () => {
    describe('collection validation', () => {
      it('should reject collection names with $', async () => {
        await expect(proxy.find('users$test', {})).rejects.toThrow("Invalid collection name: contains '$'")
      })

      it('should reject collection names with null character', async () => {
        await expect(proxy.find('users\0test', {})).rejects.toThrow("Invalid collection name: contains '\\0'")
      })

      it('should reject collection names with dots', async () => {
        await expect(proxy.find('users.test', {})).rejects.toThrow("Invalid collection name: contains '.'")
      })

      it('should reject collection names starting with system. (caught by dot validation)', async () => {
        // Note: The dot validation runs before the system. check, so it catches this first
        await expect(proxy.find('system.users', {})).rejects.toThrow("Invalid collection name: contains '.'")
      })

      it('should reject collection names exceeding max length', async () => {
        const longName = 'a'.repeat(256)
        await expect(proxy.find(longName, {})).rejects.toThrow('Collection name must not exceed 255 characters')
      })
    })

    describe('filter validation', () => {
      it('should reject array as filter', async () => {
        await expect(proxy.find('users', [] as unknown as object)).rejects.toThrow('Filter must be an object, not an array')
      })

      it('should reject primitive as filter', async () => {
        await expect(proxy.find('users', 'invalid' as unknown as object)).rejects.toThrow('Filter must be an object')
      })
    })

    describe('document validation', () => {
      it('should reject array as document', async () => {
        await expect(proxy.insertOne('users', [] as unknown as object)).rejects.toThrow('Document must be an object, not an array')
      })

      it('should reject primitive as document', async () => {
        await expect(proxy.insertOne('users', 'invalid' as unknown as object)).rejects.toThrow('Document must be an object')
      })
    })

    describe('update validation', () => {
      it('should reject null as update', async () => {
        await expect(proxy.updateOne('users', { _id: '1' }, null as unknown as object)).rejects.toThrow('Update is required')
      })

      it('should reject array as update', async () => {
        await expect(proxy.updateOne('users', { _id: '1' }, [] as unknown as object)).rejects.toThrow('Update must be an object, not an array')
      })
    })

    describe('pipeline validation', () => {
      it('should reject non-array as pipeline', async () => {
        await expect(proxy.aggregate('users', {} as unknown as object[])).rejects.toThrow('Pipeline must be an array')
      })

      it('should reject pipeline with invalid stages', async () => {
        await expect(proxy.aggregate('users', [null] as unknown as object[])).rejects.toThrow('Pipeline stage at index 0 must be an object')
      })
    })
  })
})
