/**
 * RPC Endpoint Tests (RED Phase)
 *
 * Tests for the Workers RPC endpoint that handles all MondoBackend method calls.
 * These tests should FAIL initially - the endpoint implementation doesn't exist yet.
 *
 * The /rpc endpoint will accept JSON body with { method, db, collection, ...params }
 * and return { ok: 1, result: ... } or { ok: 0, error: ..., code: ... }
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ============================================================================
// Mock Types and Helpers
// ============================================================================

interface RpcRequest {
  method: string
  db?: string
  collection?: string
  filter?: Record<string, unknown>
  update?: Record<string, unknown>
  document?: Record<string, unknown>
  documents?: Record<string, unknown>[]
  pipeline?: Record<string, unknown>[]
  options?: Record<string, unknown>
  field?: string
  query?: Record<string, unknown>
}

interface RpcSuccessResponse {
  ok: 1
  result: unknown
}

interface RpcErrorResponse {
  ok: 0
  error: string
  code: number
  codeName?: string
}

type RpcResponse = RpcSuccessResponse | RpcErrorResponse

/**
 * Mock Durable Object namespace for testing
 */
function createMockDurableObjectNamespace() {
  const mockStub = {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ documents: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    ),
  }

  return {
    idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-id' }),
    get: vi.fn().mockReturnValue(mockStub),
    _mockStub: mockStub,
  }
}

/**
 * Create a mock environment
 */
function createMockEnv(options: { authToken?: string } = {}) {
  return {
    MONDO_DATABASE: createMockDurableObjectNamespace(),
    MONDO_AUTH_TOKEN: options.authToken,
  }
}

/**
 * Create a mock execution context
 */
function createMockContext() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  }
}

/**
 * Helper to make RPC requests - this will be the interface we're testing
 */
async function makeRpcRequest(
  handler: { fetch: (req: Request) => Promise<Response> },
  body: RpcRequest,
  options: { headers?: Record<string, string> } = {}
): Promise<{ response: Response; json: RpcResponse }> {
  const request = new Request('https://test.workers.dev/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  })

  const response = await handler.fetch(request)
  const json = (await response.json()) as RpcResponse

  return { response, json }
}

// ============================================================================
// The handler we're testing - import will fail until implemented
// ============================================================================

// This import should fail initially - that's the RED phase!
import { createRpcHandler, RpcHandler } from '../../../src/rpc/endpoint'

describe('RPC Endpoint', () => {
  let handler: RpcHandler
  let mockEnv: ReturnType<typeof createMockEnv>
  let mockCtx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    mockEnv = createMockEnv()
    mockCtx = createMockContext()
    handler = createRpcHandler(mockEnv, mockCtx)
  })

  // ==========================================================================
  // 1. POST /rpc - Basic Request Handling
  // ==========================================================================

  describe('POST /rpc - Basic Request Handling', () => {
    it('accepts POST requests with JSON body', async () => {
      const { response } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {},
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('application/json')
    })

    it('rejects GET requests', async () => {
      const request = new Request('https://test.workers.dev/rpc', {
        method: 'GET',
      })

      const response = await handler.fetch(request)
      const json = (await response.json()) as RpcErrorResponse

      expect(response.status).toBe(405)
      expect(json.ok).toBe(0)
      expect(json.error).toContain('Method not allowed')
    })

    it('rejects non-JSON content type', async () => {
      const request = new Request('https://test.workers.dev/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'not json',
      })

      const response = await handler.fetch(request)
      const json = (await response.json()) as RpcErrorResponse

      expect(response.status).toBe(400)
      expect(json.ok).toBe(0)
      expect(json.error).toContain('Content-Type')
    })

    it('rejects invalid JSON body', async () => {
      const request = new Request('https://test.workers.dev/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      })

      const response = await handler.fetch(request)
      const json = (await response.json()) as RpcErrorResponse

      expect(response.status).toBe(400)
      expect(json.ok).toBe(0)
      expect(json.error).toContain('Invalid JSON')
    })

    it('rejects empty body', async () => {
      const request = new Request('https://test.workers.dev/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      })

      const response = await handler.fetch(request)
      const json = (await response.json()) as RpcErrorResponse

      expect(response.status).toBe(400)
      expect(json.ok).toBe(0)
    })
  })

  // ==========================================================================
  // 2. Method Routing - CRUD Operations
  // ==========================================================================

  describe('Method Routing - CRUD Operations', () => {
    describe('find', () => {
      it('routes find method to backend', async () => {
        const { json } = await makeRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: { status: 'active' },
          options: { limit: 10, skip: 0 },
        })

        expect(json.ok).toBe(1)
        expect(json).toHaveProperty('result')
      })

      it('returns documents array in result', async () => {
        // Configure mock to return documents
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              documents: [{ _id: '1', name: 'Alice' }],
              cursorId: BigInt(0).toString(),
              hasMore: false,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(json.ok).toBe(1)
        expect((json as RpcSuccessResponse).result).toHaveProperty('documents')
        expect((json as RpcSuccessResponse).result).toHaveProperty('cursorId')
      })

      it('accepts projection option', async () => {
        const { json } = await makeRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
          options: { projection: { name: 1, email: 1 } },
        })

        expect(json.ok).toBe(1)
      })

      it('accepts sort option', async () => {
        const { json } = await makeRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
          options: { sort: { createdAt: -1 } },
        })

        expect(json.ok).toBe(1)
      })
    })

    describe('insertMany', () => {
      it('routes insertMany method to backend', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              acknowledged: true,
              insertedIds: { 0: 'id1', 1: 'id2' },
              insertedCount: 2,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'insertMany',
          db: 'testdb',
          collection: 'users',
          documents: [{ name: 'Alice' }, { name: 'Bob' }],
        })

        expect(json.ok).toBe(1)
        expect((json as RpcSuccessResponse).result).toHaveProperty('insertedCount')
      })

      it('requires documents array', async () => {
        const { json, response } = await makeRpcRequest(handler, {
          method: 'insertMany',
          db: 'testdb',
          collection: 'users',
        } as RpcRequest)

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
        expect((json as RpcErrorResponse).error).toContain('documents')
      })
    })

    describe('updateOne', () => {
      it('routes updateOne method to backend', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              acknowledged: true,
              matchedCount: 1,
              modifiedCount: 1,
              upsertedCount: 0,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'updateOne',
          db: 'testdb',
          collection: 'users',
          filter: { _id: '123' },
          update: { $set: { name: 'Updated' } },
        })

        expect(json.ok).toBe(1)
        expect((json as RpcSuccessResponse).result).toHaveProperty('matchedCount')
        expect((json as RpcSuccessResponse).result).toHaveProperty('modifiedCount')
      })

      it('requires filter parameter', async () => {
        const { json, response } = await makeRpcRequest(handler, {
          method: 'updateOne',
          db: 'testdb',
          collection: 'users',
          update: { $set: { name: 'Test' } },
        } as RpcRequest)

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
        expect((json as RpcErrorResponse).error).toContain('filter')
      })

      it('requires update parameter', async () => {
        const { json, response } = await makeRpcRequest(handler, {
          method: 'updateOne',
          db: 'testdb',
          collection: 'users',
          filter: { _id: '123' },
        } as RpcRequest)

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
        expect((json as RpcErrorResponse).error).toContain('update')
      })

      it('supports upsert option', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              acknowledged: true,
              matchedCount: 0,
              modifiedCount: 0,
              upsertedCount: 1,
              upsertedId: 'new-id',
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'updateOne',
          db: 'testdb',
          collection: 'users',
          filter: { email: 'new@example.com' },
          update: { $set: { name: 'New User' } },
          options: { upsert: true },
        })

        expect(json.ok).toBe(1)
        expect((json as RpcSuccessResponse).result).toHaveProperty('upsertedId')
      })
    })

    describe('updateMany', () => {
      it('routes updateMany method to backend', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              acknowledged: true,
              matchedCount: 5,
              modifiedCount: 5,
              upsertedCount: 0,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'updateMany',
          db: 'testdb',
          collection: 'users',
          filter: { status: 'pending' },
          update: { $set: { status: 'active' } },
        })

        expect(json.ok).toBe(1)
        expect((json as RpcSuccessResponse).result).toHaveProperty('matchedCount')
      })
    })

    describe('deleteOne', () => {
      it('routes deleteOne method to backend', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              acknowledged: true,
              deletedCount: 1,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'deleteOne',
          db: 'testdb',
          collection: 'users',
          filter: { _id: '123' },
        })

        expect(json.ok).toBe(1)
        expect((json as RpcSuccessResponse).result).toHaveProperty('deletedCount')
      })

      it('requires filter parameter', async () => {
        const { json, response } = await makeRpcRequest(handler, {
          method: 'deleteOne',
          db: 'testdb',
          collection: 'users',
        } as RpcRequest)

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
      })
    })

    describe('deleteMany', () => {
      it('routes deleteMany method to backend', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              acknowledged: true,
              deletedCount: 10,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'deleteMany',
          db: 'testdb',
          collection: 'users',
          filter: { status: 'inactive' },
        })

        expect(json.ok).toBe(1)
        expect((json as RpcSuccessResponse).result).toHaveProperty('deletedCount')
        expect(((json as RpcSuccessResponse).result as { deletedCount: number }).deletedCount).toBe(10)
      })
    })

    describe('aggregate', () => {
      it('routes aggregate method to backend', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              documents: [{ _id: 'active', count: 100 }],
              cursorId: '0',
              hasMore: false,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'aggregate',
          db: 'testdb',
          collection: 'users',
          pipeline: [
            { $match: { status: 'active' } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
        })

        expect(json.ok).toBe(1)
        expect((json as RpcSuccessResponse).result).toHaveProperty('documents')
      })

      it('requires pipeline parameter', async () => {
        const { json, response } = await makeRpcRequest(handler, {
          method: 'aggregate',
          db: 'testdb',
          collection: 'users',
        } as RpcRequest)

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
        expect((json as RpcErrorResponse).error).toContain('pipeline')
      })

      it('rejects non-array pipeline', async () => {
        const { json, response } = await makeRpcRequest(handler, {
          method: 'aggregate',
          db: 'testdb',
          collection: 'users',
          pipeline: { $match: {} } as unknown as Record<string, unknown>[],
        })

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
      })
    })
  })

  // ==========================================================================
  // 3. Admin Methods
  // ==========================================================================

  describe('Admin Methods', () => {
    describe('listDatabases', () => {
      it('routes listDatabases method', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              { name: 'testdb', sizeOnDisk: 1024, empty: false },
              { name: 'admin', sizeOnDisk: 512, empty: false },
            ]),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'listDatabases',
        })

        expect(json.ok).toBe(1)
        expect(Array.isArray((json as RpcSuccessResponse).result)).toBe(true)
      })

      it('does not require db or collection', async () => {
        const { json, response } = await makeRpcRequest(handler, {
          method: 'listDatabases',
        })

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })
    })

    describe('listCollections', () => {
      it('routes listCollections method', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              { name: 'users', type: 'collection' },
              { name: 'products', type: 'collection' },
            ]),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'listCollections',
          db: 'testdb',
        })

        expect(json.ok).toBe(1)
        expect(Array.isArray((json as RpcSuccessResponse).result)).toBe(true)
      })

      it('requires db parameter', async () => {
        const { json, response } = await makeRpcRequest(handler, {
          method: 'listCollections',
        } as RpcRequest)

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
        expect((json as RpcErrorResponse).error).toContain('db')
      })

      it('supports filter parameter', async () => {
        const { json } = await makeRpcRequest(handler, {
          method: 'listCollections',
          db: 'testdb',
          filter: { name: /^user/ },
        })

        expect(json.ok).toBe(1)
      })
    })

    describe('count', () => {
      it('routes count method', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(JSON.stringify(42), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'count',
          db: 'testdb',
          collection: 'users',
          query: { status: 'active' },
        })

        expect(json.ok).toBe(1)
        expect((json as RpcSuccessResponse).result).toBe(42)
      })

      it('requires db and collection', async () => {
        const { json, response } = await makeRpcRequest(handler, {
          method: 'count',
        } as RpcRequest)

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
      })

      it('accepts empty query for total count', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(JSON.stringify(100), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'count',
          db: 'testdb',
          collection: 'users',
        })

        expect(json.ok).toBe(1)
      })
    })

    describe('distinct', () => {
      it('routes distinct method', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(JSON.stringify(['active', 'inactive', 'pending']), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'distinct',
          db: 'testdb',
          collection: 'users',
          field: 'status',
        })

        expect(json.ok).toBe(1)
        expect(Array.isArray((json as RpcSuccessResponse).result)).toBe(true)
      })

      it('requires field parameter', async () => {
        const { json, response } = await makeRpcRequest(handler, {
          method: 'distinct',
          db: 'testdb',
          collection: 'users',
        } as RpcRequest)

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
        expect((json as RpcErrorResponse).error).toContain('field')
      })

      it('supports query filter', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(JSON.stringify(['USA', 'Canada']), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        const { json } = await makeRpcRequest(handler, {
          method: 'distinct',
          db: 'testdb',
          collection: 'users',
          field: 'country',
          query: { region: 'north-america' },
        })

        expect(json.ok).toBe(1)
      })
    })
  })

  // ==========================================================================
  // 4. Request Validation
  // ==========================================================================

  describe('Request Validation', () => {
    it('rejects request without method', async () => {
      const { json, response } = await makeRpcRequest(handler, {} as RpcRequest)

      expect(response.status).toBe(400)
      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).error).toContain('method')
      expect((json as RpcErrorResponse).code).toBeDefined()
    })

    it('rejects unknown method', async () => {
      const { json, response } = await makeRpcRequest(handler, {
        method: 'unknownMethod',
        db: 'testdb',
        collection: 'users',
      })

      expect(response.status).toBe(400)
      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).error).toContain('Unknown method')
    })

    it('validates db parameter for collection methods', async () => {
      const { json, response } = await makeRpcRequest(handler, {
        method: 'find',
        collection: 'users',
        filter: {},
      } as RpcRequest)

      expect(response.status).toBe(400)
      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).error).toContain('db')
    })

    it('validates collection parameter for CRUD methods', async () => {
      const { json, response } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        filter: {},
      } as RpcRequest)

      expect(response.status).toBe(400)
      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).error).toContain('collection')
    })

    it('validates db name format', async () => {
      const { json, response } = await makeRpcRequest(handler, {
        method: 'find',
        db: '', // Empty db name
        collection: 'users',
        filter: {},
      })

      expect(response.status).toBe(400)
      expect(json.ok).toBe(0)
    })

    it('validates collection name format', async () => {
      const { json, response } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: '', // Empty collection name
        filter: {},
      })

      expect(response.status).toBe(400)
      expect(json.ok).toBe(0)
    })

    it('rejects system collection writes', async () => {
      const { json, response } = await makeRpcRequest(handler, {
        method: 'insertMany',
        db: 'testdb',
        collection: 'system.indexes',
        documents: [{ name: 'test' }],
      })

      expect(response.status).toBe(403)
      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).error).toContain('system')
    })
  })

  // ==========================================================================
  // 5. Response Format
  // ==========================================================================

  describe('Response Format', () => {
    it('returns { ok: 1, result: ... } on success', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [], cursorId: '0', hasMore: false }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {},
      })

      expect(json).toEqual({
        ok: 1,
        result: expect.anything(),
      })
    })

    it('returns { ok: 0, error: ..., code: ... } on error', async () => {
      const { json } = await makeRpcRequest(handler, {
        method: 'unknownMethod',
      })

      expect(json.ok).toBe(0)
      expect(json).toHaveProperty('error')
      expect(json).toHaveProperty('code')
    })

    it('includes codeName in error response', async () => {
      const { json } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        // Missing collection - should trigger InvalidNamespace or similar
      } as RpcRequest)

      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse)).toHaveProperty('codeName')
    })

    it('serializes BigInt cursorId as string', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documents: [{ _id: '1' }],
            cursorId: '12345678901234567890',
            hasMore: true,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {},
      })

      expect(json.ok).toBe(1)
      const result = (json as RpcSuccessResponse).result as { cursorId: string }
      expect(typeof result.cursorId).toBe('string')
    })

    it('serializes ObjectId as string', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            acknowledged: true,
            insertedIds: { 0: '507f1f77bcf86cd799439011' },
            insertedCount: 1,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'insertMany',
        db: 'testdb',
        collection: 'users',
        documents: [{ name: 'Test' }],
      })

      expect(json.ok).toBe(1)
      const result = (json as RpcSuccessResponse).result as { insertedIds: Record<number, string> }
      expect(typeof result.insertedIds[0]).toBe('string')
    })
  })

  // ==========================================================================
  // 6. Error Codes (MongoDB-compatible)
  // ==========================================================================

  describe('Error Codes', () => {
    it('returns code 2 (BadValue) for invalid parameters', async () => {
      const { json } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: 'not-an-object', // Should be object
      } as unknown as RpcRequest)

      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).code).toBe(2)
      expect((json as RpcErrorResponse).codeName).toBe('BadValue')
    })

    it('returns code 13 (Unauthorized) for auth failures', async () => {
      const authEnv = createMockEnv({ authToken: 'secret-token' })
      const authHandler = createRpcHandler(authEnv, mockCtx)

      const { json } = await makeRpcRequest(
        authHandler,
        {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        },
        { headers: { Authorization: 'Bearer wrong-token' } }
      )

      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).code).toBe(13)
      expect((json as RpcErrorResponse).codeName).toBe('Unauthorized')
    })

    it('returns code 26 (NamespaceNotFound) for missing collection', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'Collection not found', code: 26 }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'nonexistent',
        filter: {},
      })

      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).code).toBe(26)
      expect((json as RpcErrorResponse).codeName).toBe('NamespaceNotFound')
    })

    it('returns code 59 (CommandNotFound) for unknown method', async () => {
      const { json } = await makeRpcRequest(handler, {
        method: 'invalidCommand',
      })

      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).code).toBe(59)
      expect((json as RpcErrorResponse).codeName).toBe('CommandNotFound')
    })

    it('returns code 11000 (DuplicateKey) for duplicate key error', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'Duplicate key error', code: 11000 }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'insertMany',
        db: 'testdb',
        collection: 'users',
        documents: [{ _id: 'duplicate' }],
      })

      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).code).toBe(11000)
      expect((json as RpcErrorResponse).codeName).toBe('DuplicateKey')
    })

    it('returns code 1 (InternalError) for unexpected errors', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockRejectedValueOnce(
        new Error('Unexpected internal error')
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {},
      })

      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).code).toBe(1)
      expect((json as RpcErrorResponse).codeName).toBe('InternalError')
    })
  })

  // ==========================================================================
  // 7. Authentication
  // ==========================================================================

  describe('Authentication', () => {
    describe('when auth is configured', () => {
      let authHandler: RpcHandler
      let authEnv: ReturnType<typeof createMockEnv>

      beforeEach(() => {
        authEnv = createMockEnv({ authToken: 'valid-secret-token' })
        authHandler = createRpcHandler(authEnv, mockCtx)
      })

      it('accepts valid Bearer token', async () => {
        authEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({ documents: [], cursorId: '0', hasMore: false }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json, response } = await makeRpcRequest(
          authHandler,
          {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          },
          { headers: { Authorization: 'Bearer valid-secret-token' } }
        )

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })

      it('rejects invalid token', async () => {
        const { json, response } = await makeRpcRequest(
          authHandler,
          {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          },
          { headers: { Authorization: 'Bearer wrong-token' } }
        )

        expect(response.status).toBe(401)
        expect(json.ok).toBe(0)
        expect((json as RpcErrorResponse).code).toBe(13)
      })

      it('rejects missing Authorization header', async () => {
        const { json, response } = await makeRpcRequest(authHandler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(response.status).toBe(401)
        expect(json.ok).toBe(0)
      })

      it('rejects malformed Authorization header', async () => {
        const { json, response } = await makeRpcRequest(
          authHandler,
          {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          },
          { headers: { Authorization: 'NotBearer token' } }
        )

        expect(response.status).toBe(401)
        expect(json.ok).toBe(0)
      })

      it('accepts token without Bearer prefix for backwards compatibility', async () => {
        authEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({ documents: [], cursorId: '0', hasMore: false }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json, response } = await makeRpcRequest(
          authHandler,
          {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          },
          { headers: { 'X-Mondo-Token': 'valid-secret-token' } }
        )

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })
    })

    describe('when auth is not configured', () => {
      it('allows requests without Authorization header', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({ documents: [], cursorId: '0', hasMore: false }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

        const { json, response } = await makeRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })
    })
  })

  // ==========================================================================
  // 8. CORS Headers
  // ==========================================================================

  describe('CORS Headers', () => {
    it('includes Access-Control-Allow-Origin header', async () => {
      const { response } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {},
      })

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('includes Access-Control-Allow-Methods header', async () => {
      const { response } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {},
      })

      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    })

    it('includes Access-Control-Allow-Headers header', async () => {
      const { response } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {},
      })

      const allowHeaders = response.headers.get('Access-Control-Allow-Headers')
      expect(allowHeaders).toContain('Content-Type')
      expect(allowHeaders).toContain('Authorization')
    })

    it('handles OPTIONS preflight request', async () => {
      const request = new Request('https://test.workers.dev/rpc', {
        method: 'OPTIONS',
      })

      const response = await handler.fetch(request)

      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    })

    it('includes Access-Control-Max-Age for preflight caching', async () => {
      const request = new Request('https://test.workers.dev/rpc', {
        method: 'OPTIONS',
      })

      const response = await handler.fetch(request)

      expect(response.headers.get('Access-Control-Max-Age')).toBeDefined()
    })

    it('includes CORS headers on error responses', async () => {
      const { response } = await makeRpcRequest(handler, {
        method: 'unknownMethod',
      })

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  // ==========================================================================
  // Additional Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('handles concurrent requests', async () => {
      // Use mockImplementation to create a new Response for each call
      // (Response body can only be consumed once)
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ documents: [], cursorId: '0', hasMore: false }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )
      )

      const requests = Array.from({ length: 10 }, (_, i) =>
        makeRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: `collection${i}`,
          filter: {},
        })
      )

      const results = await Promise.all(requests)

      results.forEach(({ json }) => {
        expect(json.ok).toBe(1)
      })
    })

    it('handles very large request body', async () => {
      const largeDocuments = Array.from({ length: 1000 }, (_, i) => ({
        name: `User ${i}`,
        data: 'x'.repeat(1000),
      }))

      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            acknowledged: true,
            insertedIds: Object.fromEntries(largeDocuments.map((_, i) => [i, `id${i}`])),
            insertedCount: largeDocuments.length,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json, response } = await makeRpcRequest(handler, {
        method: 'insertMany',
        db: 'testdb',
        collection: 'users',
        documents: largeDocuments,
      })

      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
    })

    it('handles deeply nested filter objects', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [], cursorId: '0', hasMore: false }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {
          'level1.level2.level3.level4.level5': 'value',
          $and: [
            { 'nested.path': { $exists: true } },
            { 'another.deep.path': { $in: [1, 2, 3] } },
          ],
        },
      })

      expect(json.ok).toBe(1)
    })

    it('handles special characters in database and collection names', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [], cursorId: '0', hasMore: false }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'my-database_v2',
        collection: 'user_profiles',
        filter: {},
      })

      expect(json.ok).toBe(1)
    })

    it('handles timeout gracefully', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {},
      })

      expect(json.ok).toBe(0)
      expect((json as RpcErrorResponse).code).toBeDefined()
    })

    it('handles null and undefined values in documents', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            acknowledged: true,
            insertedIds: { 0: 'id1' },
            insertedCount: 1,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'insertMany',
        db: 'testdb',
        collection: 'users',
        documents: [{ name: 'Test', nullField: null, nested: { value: null } }],
      })

      expect(json.ok).toBe(1)
    })
  })

  // ==========================================================================
  // Index Operations
  // ==========================================================================

  describe('Index Operations', () => {
    it('routes createIndexes method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify(['email_1', 'name_1_status_1']), {
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'createIndexes',
        db: 'testdb',
        collection: 'users',
        options: {
          indexes: [
            { key: { email: 1 }, unique: true },
            { key: { name: 1, status: 1 } },
          ],
        },
      } as RpcRequest & { options: { indexes: unknown[] } })

      expect(json.ok).toBe(1)
      expect(Array.isArray((json as RpcSuccessResponse).result)).toBe(true)
    })

    it('routes listIndexes method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { v: 2, key: { _id: 1 }, name: '_id_' },
            { v: 2, key: { email: 1 }, name: 'email_1', unique: true },
          ]),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'listIndexes',
        db: 'testdb',
        collection: 'users',
      })

      expect(json.ok).toBe(1)
      expect(Array.isArray((json as RpcSuccessResponse).result)).toBe(true)
    })

    it('routes dropIndex method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: 1 }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'dropIndex',
        db: 'testdb',
        collection: 'users',
        options: { indexName: 'email_1' },
      } as RpcRequest & { options: { indexName: string } })

      expect(json.ok).toBe(1)
    })
  })

  // ==========================================================================
  // Cursor Operations
  // ==========================================================================

  describe('Cursor Operations', () => {
    it('routes getMore method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documents: [{ _id: '11' }, { _id: '12' }],
            cursorId: '12345678901234567890',
            hasMore: false,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'getMore',
        db: 'testdb',
        collection: 'users',
        options: { cursorId: '12345678901234567890', batchSize: 10 },
      } as RpcRequest & { options: { cursorId: string; batchSize: number } })

      expect(json.ok).toBe(1)
      expect((json as RpcSuccessResponse).result).toHaveProperty('documents')
    })

    it('routes killCursors method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ cursorsKilled: ['12345678901234567890'] }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const { json } = await makeRpcRequest(handler, {
        method: 'killCursors',
        db: 'testdb',
        collection: 'users',
        options: { cursors: ['12345678901234567890'] },
      } as RpcRequest & { options: { cursors: string[] } })

      expect(json.ok).toBe(1)
    })
  })
})

// ============================================================================
// JSON-RPC 2.0 Protocol Tests (RED Phase - mongo.do-kn5n)
// ============================================================================
// These tests verify JSON-RPC 2.0 compliant request/response format.
// The implementation should support both the current format AND JSON-RPC 2.0.

/**
 * JSON-RPC 2.0 Request structure
 */
interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown> | unknown[]
}

/**
 * JSON-RPC 2.0 Success Response
 */
interface JsonRpcSuccessResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result: unknown
}

/**
 * JSON-RPC 2.0 Error Response
 */
interface JsonRpcErrorResponse {
  jsonrpc: '2.0'
  id: string | number | null
  error: {
    code: number
    message: string
    data?: unknown
  }
}

type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse

/**
 * Helper to make JSON-RPC 2.0 formatted requests
 */
async function makeJsonRpcRequest(
  handler: { fetch: (req: Request) => Promise<Response> },
  body: JsonRpcRequest | JsonRpcRequest[],
  options: { headers?: Record<string, string> } = {}
): Promise<{ response: Response; json: JsonRpcResponse | JsonRpcResponse[] }> {
  const request = new Request('https://test.workers.dev/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  })

  const response = await handler.fetch(request)
  const json = (await response.json()) as JsonRpcResponse | JsonRpcResponse[]

  return { response, json }
}

// Import the JSON-RPC handler - this will FAIL until implemented
import { createJsonRpcHandler, type JsonRpcHandler } from '../../../src/rpc/endpoint'

describe('Workers RPC Endpoint - JSON-RPC 2.0 Format (RED Phase)', () => {
  let handler: JsonRpcHandler
  let mockEnv: ReturnType<typeof createMockEnv>
  let mockCtx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    mockEnv = createMockEnv()
    mockCtx = createMockContext()
    handler = createJsonRpcHandler(mockEnv, mockCtx)
  })

  // ==========================================================================
  // Request/Response Format
  // ==========================================================================

  describe('Request/Response Format', () => {
    it('should accept JSON-RPC formatted requests', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [{ _id: '1', name: 'Test' }] }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { response, json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'find',
        params: { db: 'testdb', collection: 'users', filter: {} },
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('application/json')
      expect((json as JsonRpcSuccessResponse).jsonrpc).toBe('2.0')
    })

    it('should return JSON-RPC formatted responses', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [{ _id: '1', name: 'Alice' }] }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 'request-123',
        method: 'find',
        params: { db: 'testdb', collection: 'users', filter: { name: 'Alice' } },
      })

      const rpcResponse = json as JsonRpcSuccessResponse
      expect(rpcResponse.jsonrpc).toBe('2.0')
      expect(rpcResponse.id).toBe('request-123')
      expect(rpcResponse.result).toBeDefined()
    })

    it('should handle batch requests', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ documents: [{ _id: '1' }] }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ insertedId: 'new-id' }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

      const { response, json } = await makeJsonRpcRequest(handler, [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'find',
          params: { db: 'testdb', collection: 'users', filter: {} },
        },
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'insertOne',
          params: { db: 'testdb', collection: 'users', document: { name: 'Bob' } },
        },
      ])

      expect(response.status).toBe(200)
      expect(Array.isArray(json)).toBe(true)
      const batchResponse = json as JsonRpcResponse[]
      expect(batchResponse).toHaveLength(2)
      expect(batchResponse[0].id).toBe(1)
      expect(batchResponse[1].id).toBe(2)
    })

    it('should include request id in response', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [] }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      // Test with numeric id
      const { json: numericIdResponse } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 42,
        method: 'find',
        params: { db: 'testdb', collection: 'users', filter: {} },
      })
      expect((numericIdResponse as JsonRpcResponse).id).toBe(42)

      // Reset mock
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [] }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      // Test with string id
      const { json: stringIdResponse } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 'my-request-id',
        method: 'find',
        params: { db: 'testdb', collection: 'users', filter: {} },
      })
      expect((stringIdResponse as JsonRpcResponse).id).toBe('my-request-id')
    })
  })

  // ==========================================================================
  // Method Routing
  // ==========================================================================

  describe('Method Routing', () => {
    it('should route find requests to backend', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documents: [{ _id: '1', name: 'Alice' }, { _id: '2', name: 'Bob' }],
            cursorId: '0',
            hasMore: false,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'find',
        params: {
          db: 'testdb',
          collection: 'users',
          filter: { status: 'active' },
          options: { limit: 10 },
        },
      })

      expect((json as JsonRpcSuccessResponse).result).toBeDefined()
      expect(mockEnv.MONDO_DATABASE._mockStub.fetch).toHaveBeenCalled()

      // Verify the internal request was made to the correct endpoint
      const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
      expect(fetchCall[0]).toContain('find')
    })

    it('should route insertOne requests to backend', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            acknowledged: true,
            insertedId: '507f1f77bcf86cd799439011',
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'insertOne',
        params: {
          db: 'testdb',
          collection: 'users',
          document: { name: 'Charlie', email: 'charlie@example.com' },
        },
      })

      const result = (json as JsonRpcSuccessResponse).result as { insertedId: string }
      expect(result.insertedId).toBeDefined()
      expect(mockEnv.MONDO_DATABASE._mockStub.fetch).toHaveBeenCalled()
    })

    it('should route aggregate requests to backend', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documents: [{ _id: 'active', count: 100 }],
            cursorId: '0',
            hasMore: false,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'aggregate',
        params: {
          db: 'testdb',
          collection: 'users',
          pipeline: [
            { $match: { status: 'active' } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
        },
      })

      expect((json as JsonRpcSuccessResponse).result).toBeDefined()
      expect(mockEnv.MONDO_DATABASE._mockStub.fetch).toHaveBeenCalled()

      // Verify the internal request was made with aggregate
      const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
      expect(fetchCall[0]).toContain('aggregate')
    })

    it('should reject unknown methods', async () => {
      const { json, response } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'unknownMethod',
        params: { db: 'testdb', collection: 'users' },
      })

      expect(response.status).toBe(200) // JSON-RPC returns 200 even for errors
      const errorResponse = json as JsonRpcErrorResponse
      expect(errorResponse.error).toBeDefined()
      expect(errorResponse.error.code).toBe(-32601) // Method not found
      expect(errorResponse.error.message).toContain('Method not found')
    })
  })

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('Error Handling', () => {
    it('should return error for invalid JSON', async () => {
      const request = new Request('https://test.workers.dev/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'this is not valid json {{{',
      })

      const response = await handler.fetch(request)
      const json = (await response.json()) as JsonRpcErrorResponse

      expect(json.jsonrpc).toBe('2.0')
      expect(json.error).toBeDefined()
      expect(json.error.code).toBe(-32700) // Parse error
      expect(json.error.message).toContain('Parse error')
      expect(json.id).toBeNull()
    })

    it('should return error for missing method', async () => {
      const { json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 1,
        params: { db: 'testdb', collection: 'users' },
      } as unknown as JsonRpcRequest)

      const errorResponse = json as JsonRpcErrorResponse
      expect(errorResponse.error).toBeDefined()
      expect(errorResponse.error.code).toBe(-32600) // Invalid Request
      expect(errorResponse.error.message).toContain('method')
    })

    it('should return error for missing params', async () => {
      const { json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'find',
        // Missing params
      })

      const errorResponse = json as JsonRpcErrorResponse
      expect(errorResponse.error).toBeDefined()
      expect(errorResponse.error.code).toBe(-32602) // Invalid params
      expect(errorResponse.error.message).toContain('params')
    })

    it('should propagate backend errors with proper format', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'Collection not found', code: 26 }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 'request-with-error',
        method: 'find',
        params: { db: 'testdb', collection: 'nonexistent', filter: {} },
      })

      const errorResponse = json as JsonRpcErrorResponse
      expect(errorResponse.jsonrpc).toBe('2.0')
      expect(errorResponse.id).toBe('request-with-error')
      expect(errorResponse.error).toBeDefined()
      expect(errorResponse.error.code).toBeDefined()
      expect(errorResponse.error.message).toContain('Collection not found')
      expect(errorResponse.error.data).toBeDefined() // Should include original error data
    })
  })

  // ==========================================================================
  // Authentication
  // ==========================================================================

  describe('Authentication', () => {
    it('should validate auth token in header', async () => {
      const authEnv = createMockEnv({ authToken: 'valid-secret-token' })
      const authHandler = createJsonRpcHandler(authEnv, mockCtx)

      authEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ documents: [] }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const { response, json } = await makeJsonRpcRequest(
        authHandler,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'find',
          params: { db: 'testdb', collection: 'users', filter: {} },
        },
        { headers: { Authorization: 'Bearer valid-secret-token' } }
      )

      expect(response.status).toBe(200)
      expect((json as JsonRpcSuccessResponse).result).toBeDefined()
    })

    it('should reject requests without auth', async () => {
      const authEnv = createMockEnv({ authToken: 'valid-secret-token' })
      const authHandler = createJsonRpcHandler(authEnv, mockCtx)

      const { json, response } = await makeJsonRpcRequest(authHandler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'find',
        params: { db: 'testdb', collection: 'users', filter: {} },
      })

      expect(response.status).toBe(401)
      const errorResponse = json as JsonRpcErrorResponse
      expect(errorResponse.error).toBeDefined()
      expect(errorResponse.error.code).toBe(-32000) // Server error range for auth
      expect(errorResponse.error.message).toContain('Unauthorized')
    })

    it('should handle expired tokens', async () => {
      const authEnv = createMockEnv({ authToken: 'valid-secret-token' })
      const authHandler = createJsonRpcHandler(authEnv, mockCtx)

      const { json, response } = await makeJsonRpcRequest(
        authHandler,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'find',
          params: { db: 'testdb', collection: 'users', filter: {} },
        },
        { headers: { Authorization: 'Bearer expired-or-invalid-token' } }
      )

      expect(response.status).toBe(401)
      const errorResponse = json as JsonRpcErrorResponse
      expect(errorResponse.error).toBeDefined()
      expect(errorResponse.error.message).toContain('Unauthorized')
    })
  })

  // ==========================================================================
  // JSON-RPC Standard Error Codes
  // ==========================================================================

  describe('JSON-RPC Standard Error Codes', () => {
    it('should return -32700 for parse errors', async () => {
      const request = new Request('https://test.workers.dev/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid json',
      })

      const response = await handler.fetch(request)
      const json = (await response.json()) as JsonRpcErrorResponse

      expect(json.error.code).toBe(-32700)
    })

    it('should return -32600 for invalid request', async () => {
      const { json } = await makeJsonRpcRequest(handler, {
        // Missing jsonrpc version
        id: 1,
        method: 'find',
      } as unknown as JsonRpcRequest)

      expect((json as JsonRpcErrorResponse).error.code).toBe(-32600)
    })

    it('should return -32601 for method not found', async () => {
      const { json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'nonExistentMethod',
        params: {},
      })

      expect((json as JsonRpcErrorResponse).error.code).toBe(-32601)
    })

    it('should return -32602 for invalid params', async () => {
      const { json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'find',
        params: 'invalid-params-should-be-object', // Should be object or array
      } as unknown as JsonRpcRequest)

      expect((json as JsonRpcErrorResponse).error.code).toBe(-32602)
    })

    it('should return -32603 for internal errors', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockRejectedValueOnce(
        new Error('Unexpected internal error')
      )

      const { json } = await makeJsonRpcRequest(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'find',
        params: { db: 'testdb', collection: 'users', filter: {} },
      })

      expect((json as JsonRpcErrorResponse).error.code).toBe(-32603)
    })
  })

  // ==========================================================================
  // Notifications (requests without id)
  // ==========================================================================

  describe('Notifications (requests without id)', () => {
    it('should not return response for notification', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ acknowledged: true }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      )

      const request = new Request('https://test.workers.dev/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          // No id - this is a notification
          method: 'insertOne',
          params: { db: 'testdb', collection: 'logs', document: { message: 'log entry' } },
        }),
      })

      const response = await handler.fetch(request)

      // For notifications, the response body should be empty or null
      expect(response.status).toBe(204) // No Content
    })

    it('should process notifications in batch but not include in response', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ documents: [] }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ acknowledged: true }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )

      const { json } = await makeJsonRpcRequest(handler, [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'find',
          params: { db: 'testdb', collection: 'users', filter: {} },
        },
        {
          jsonrpc: '2.0',
          // No id - notification
          method: 'insertOne',
          params: { db: 'testdb', collection: 'logs', document: { event: 'query' } },
        },
      ])

      // Batch response should only contain the request with id
      expect(Array.isArray(json)).toBe(true)
      const batchResponse = json as JsonRpcResponse[]
      expect(batchResponse).toHaveLength(1)
      expect(batchResponse[0].id).toBe(1)
    })
  })
})
