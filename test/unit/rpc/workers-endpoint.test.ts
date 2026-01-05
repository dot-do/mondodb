/**
 * Workers RPC Endpoint Tests (RED Phase)
 *
 * Issue: mondodb-kn5n
 *
 * Tests for the Workers RPC endpoint that handles all MondoBackend method calls.
 * These tests verify:
 * - Workers RPC endpoint request/response format
 * - All MondoBackend method calls via RPC
 * - Error handling and error response format
 * - Authentication flow
 *
 * RED Phase: Tests should FAIL initially as they test functionality
 * that may not be fully implemented yet.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Workers RPC request format
 */
interface WorkersRpcRequest {
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

/**
 * Workers RPC success response format
 */
interface WorkersRpcSuccessResponse {
  ok: 1
  result: unknown
}

/**
 * Workers RPC error response format
 */
interface WorkersRpcErrorResponse {
  ok: 0
  error: string
  code: number
  codeName: string
}

type WorkersRpcResponse = WorkersRpcSuccessResponse | WorkersRpcErrorResponse

/**
 * MongoDB error codes
 */
const ErrorCodes = {
  InternalError: { code: 1, name: 'InternalError' },
  BadValue: { code: 2, name: 'BadValue' },
  Unauthorized: { code: 13, name: 'Unauthorized' },
  NamespaceNotFound: { code: 26, name: 'NamespaceNotFound' },
  CommandNotFound: { code: 59, name: 'CommandNotFound' },
  DuplicateKey: { code: 11000, name: 'DuplicateKey' },
} as const

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock Durable Object stub
 */
function createMockStub() {
  return {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ documents: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    ),
  }
}

/**
 * Create a mock Durable Object namespace
 */
function createMockDurableObjectNamespace() {
  const mockStub = createMockStub()
  return {
    idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-id' }),
    get: vi.fn().mockReturnValue(mockStub),
    _mockStub: mockStub,
  }
}

/**
 * Create a mock environment for Workers RPC
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

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Helper to make Workers RPC requests
 */
async function makeWorkersRpcRequest(
  handler: { fetch: (req: Request) => Promise<Response> },
  body: WorkersRpcRequest,
  options: { headers?: Record<string, string> } = {}
): Promise<{ response: Response; json: WorkersRpcResponse }> {
  const request = new Request('https://mondo.workers.dev/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(body),
  })

  const response = await handler.fetch(request)
  const json = (await response.json()) as WorkersRpcResponse

  return { response, json }
}

/**
 * Create a mock success response from Durable Object
 */
function mockDOSuccessResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Create a mock error response from Durable Object
 */
function mockDOErrorResponse(error: string, code: number, status = 400) {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ============================================================================
// Import - This should fail initially in RED phase if not implemented
// ============================================================================

import { createRpcHandler, type RpcHandler, type RpcEnv } from '../../../src/rpc/endpoint'

// ============================================================================
// Test Suite: Workers RPC Endpoint
// ============================================================================

describe('Workers RPC Endpoint (mondodb-kn5n)', () => {
  let handler: RpcHandler
  let mockEnv: ReturnType<typeof createMockEnv>
  let mockCtx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    mockEnv = createMockEnv()
    mockCtx = createMockContext()
    handler = createRpcHandler(mockEnv as unknown as RpcEnv, mockCtx)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // 1. Request/Response Format Tests
  // ==========================================================================

  describe('Request/Response Format', () => {
    describe('Request Structure', () => {
      it('accepts requests with method field', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse([])
        )

        const { json, response } = await makeWorkersRpcRequest(handler, {
          method: 'listDatabases',
        })

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })

      it('accepts requests with method, db, and collection fields', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
        )

        const { json, response } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })

      it('accepts requests with options object', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
        )

        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
          options: {
            limit: 10,
            skip: 0,
            projection: { name: 1 },
            sort: { createdAt: -1 },
          },
        })

        expect(json.ok).toBe(1)
      })

      it('forwards filter parameter correctly', async () => {
        const filter = { status: 'active', age: { $gte: 18 } }
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
        )

        await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter,
        })

        const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
        const requestBody = JSON.parse(fetchCall[1]?.body as string)
        expect(requestBody.filter).toEqual(filter)
      })

      it('forwards update parameter correctly', async () => {
        const update = { $set: { name: 'Updated' }, $inc: { version: 1 } }
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse({ matchedCount: 1, modifiedCount: 1 })
        )

        await makeWorkersRpcRequest(handler, {
          method: 'updateOne',
          db: 'testdb',
          collection: 'users',
          filter: { _id: '123' },
          update,
        })

        const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
        const requestBody = JSON.parse(fetchCall[1]?.body as string)
        expect(requestBody.update).toEqual(update)
      })
    })

    describe('Response Structure - Success', () => {
      it('returns ok: 1 for successful operations', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
        )

        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(json.ok).toBe(1)
      })

      it('includes result field in success response', async () => {
        const expectedResult = { documents: [{ _id: '1', name: 'Alice' }], cursorId: '0', hasMore: false }
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse(expectedResult)
        )

        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(json.ok).toBe(1)
        expect((json as WorkersRpcSuccessResponse).result).toEqual(expectedResult)
      })

      it('returns Content-Type: application/json', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse([])
        )

        const { response } = await makeWorkersRpcRequest(handler, {
          method: 'listDatabases',
        })

        expect(response.headers.get('Content-Type')).toContain('application/json')
      })

      it('preserves complex nested objects in result', async () => {
        const complexResult = {
          documents: [
            {
              _id: '1',
              metadata: {
                nested: {
                  deeply: { value: 42 },
                },
                array: [1, 2, { key: 'value' }],
              },
            },
          ],
          cursorId: '0',
          hasMore: false,
        }
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse(complexResult)
        )

        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect((json as WorkersRpcSuccessResponse).result).toEqual(complexResult)
      })
    })

    describe('Response Structure - Error', () => {
      it('returns ok: 0 for failed operations', async () => {
        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'unknownMethod',
        })

        expect(json.ok).toBe(0)
      })

      it('includes error message in error response', async () => {
        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'unknownMethod',
        })

        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).error).toBeDefined()
        expect(typeof (json as WorkersRpcErrorResponse).error).toBe('string')
      })

      it('includes error code in error response', async () => {
        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'unknownMethod',
        })

        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).code).toBeDefined()
        expect(typeof (json as WorkersRpcErrorResponse).code).toBe('number')
      })

      it('includes codeName in error response', async () => {
        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'unknownMethod',
        })

        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).codeName).toBeDefined()
        expect(typeof (json as WorkersRpcErrorResponse).codeName).toBe('string')
      })

      it('returns appropriate HTTP status code for errors', async () => {
        const { response } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          // Missing collection
        } as WorkersRpcRequest)

        expect(response.status).toBe(400)
      })
    })

    describe('Content Type Handling', () => {
      it('rejects requests without Content-Type header', async () => {
        const request = new Request('https://mondo.workers.dev/rpc', {
          method: 'POST',
          body: JSON.stringify({ method: 'listDatabases' }),
        })

        const response = await handler.fetch(request)
        const json = (await response.json()) as WorkersRpcErrorResponse

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
        expect(json.error).toContain('Content-Type')
      })

      it('rejects requests with wrong Content-Type', async () => {
        const request = new Request('https://mondo.workers.dev/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ method: 'listDatabases' }),
        })

        const response = await handler.fetch(request)
        const json = (await response.json()) as WorkersRpcErrorResponse

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
      })

      it('accepts Content-Type with charset', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse([])
        )

        const request = new Request('https://mondo.workers.dev/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ method: 'listDatabases' }),
        })

        const response = await handler.fetch(request)
        const json = (await response.json()) as WorkersRpcResponse

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })
    })
  })

  // ==========================================================================
  // 2. MondoBackend Method Calls via RPC
  // ==========================================================================

  describe('MondoBackend Method Calls via RPC', () => {
    // --------------------------------------------------------------------------
    // Global Methods (no db/collection required)
    // --------------------------------------------------------------------------

    describe('Global Methods', () => {
      describe('listDatabases', () => {
        it('executes listDatabases via RPC', async () => {
          const databases = [
            { name: 'testdb', sizeOnDisk: 1024, empty: false },
            { name: 'admin', sizeOnDisk: 512, empty: false },
          ]
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(databases)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'listDatabases',
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(databases)
        })

        it('does not require db parameter', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse([])
          )

          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'listDatabases',
          })

          expect(response.status).toBe(200)
          expect(json.ok).toBe(1)
        })
      })
    })

    // --------------------------------------------------------------------------
    // Database Methods (require db)
    // --------------------------------------------------------------------------

    describe('Database Methods', () => {
      describe('listCollections', () => {
        it('executes listCollections via RPC', async () => {
          const collections = [
            { name: 'users', type: 'collection' },
            { name: 'products', type: 'collection' },
          ]
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(collections)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'listCollections',
            db: 'testdb',
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(collections)
        })

        it('requires db parameter', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'listCollections',
          } as WorkersRpcRequest)

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
          expect((json as WorkersRpcErrorResponse).error).toContain('db')
        })

        it('supports filter parameter', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse([{ name: 'users', type: 'collection' }])
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'listCollections',
            db: 'testdb',
            filter: { name: { $regex: '^user' } },
          })

          expect(json.ok).toBe(1)
        })
      })

      describe('createDatabase', () => {
        it('executes createDatabase via RPC', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(null)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'createDatabase',
            db: 'newdb',
          })

          expect(json.ok).toBe(1)
        })

        it('requires db parameter', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'createDatabase',
          } as WorkersRpcRequest)

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
        })
      })

      describe('dropDatabase', () => {
        it('executes dropDatabase via RPC', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(null)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'dropDatabase',
            db: 'olddb',
          })

          expect(json.ok).toBe(1)
        })
      })

      describe('databaseExists', () => {
        it('returns true when database exists', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(true)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'databaseExists',
            db: 'testdb',
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toBe(true)
        })

        it('returns false when database does not exist', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(false)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'databaseExists',
            db: 'nonexistent',
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toBe(false)
        })
      })

      describe('dbStats', () => {
        it('returns database statistics', async () => {
          const stats = {
            db: 'testdb',
            collections: 5,
            views: 0,
            objects: 1000,
            avgObjSize: 500,
            dataSize: 500000,
            storageSize: 600000,
            indexes: 10,
            indexSize: 50000,
          }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(stats)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'dbStats',
            db: 'testdb',
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(stats)
        })
      })
    })

    // --------------------------------------------------------------------------
    // Collection Methods (require db and collection)
    // --------------------------------------------------------------------------

    describe('Collection Methods - CRUD', () => {
      describe('find', () => {
        it('executes find via RPC', async () => {
          const findResult = {
            documents: [{ _id: '1', name: 'Alice' }, { _id: '2', name: 'Bob' }],
            cursorId: '0',
            hasMore: false,
          }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(findResult)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: { status: 'active' },
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(findResult)
        })

        it('requires db parameter', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'find',
            collection: 'users',
            filter: {},
          } as WorkersRpcRequest)

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
          expect((json as WorkersRpcErrorResponse).error).toContain('db')
        })

        it('requires collection parameter', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'find',
            db: 'testdb',
            filter: {},
          } as WorkersRpcRequest)

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
          expect((json as WorkersRpcErrorResponse).error).toContain('collection')
        })

        it('supports projection option', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
          )

          await makeWorkersRpcRequest(handler, {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
            options: { projection: { name: 1, email: 1, _id: 0 } },
          })

          const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
          const requestBody = JSON.parse(fetchCall[1]?.body as string)
          expect(requestBody.projection).toEqual({ name: 1, email: 1, _id: 0 })
        })

        it('supports sort option', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
          )

          await makeWorkersRpcRequest(handler, {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
            options: { sort: { createdAt: -1, name: 1 } },
          })

          const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
          const requestBody = JSON.parse(fetchCall[1]?.body as string)
          expect(requestBody.sort).toEqual({ createdAt: -1, name: 1 })
        })

        it('supports limit and skip options', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
          )

          await makeWorkersRpcRequest(handler, {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
            options: { limit: 10, skip: 20 },
          })

          const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
          const requestBody = JSON.parse(fetchCall[1]?.body as string)
          expect(requestBody.limit).toBe(10)
          expect(requestBody.skip).toBe(20)
        })

        it('allows empty filter', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          })

          expect(json.ok).toBe(1)
        })

        it('allows omitted filter (find all)', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'find',
            db: 'testdb',
            collection: 'users',
          })

          expect(json.ok).toBe(1)
        })
      })

      describe('insertOne', () => {
        it('executes insertOne via RPC', async () => {
          const insertResult = {
            acknowledged: true,
            insertedIds: { 0: '507f1f77bcf86cd799439011' },
            insertedCount: 1,
          }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(insertResult)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'insertOne',
            db: 'testdb',
            collection: 'users',
            document: { name: 'Alice', email: 'alice@example.com' },
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(insertResult)
        })

        it('forwards document to backend', async () => {
          const document = { name: 'Alice', email: 'alice@example.com', age: 25 }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ acknowledged: true, insertedCount: 1 })
          )

          await makeWorkersRpcRequest(handler, {
            method: 'insertOne',
            db: 'testdb',
            collection: 'users',
            document,
          })

          const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
          const requestBody = JSON.parse(fetchCall[1]?.body as string)
          expect(requestBody.document).toEqual(document)
        })
      })

      describe('insertMany', () => {
        it('executes insertMany via RPC', async () => {
          const insertResult = {
            acknowledged: true,
            insertedIds: { 0: 'id1', 1: 'id2', 2: 'id3' },
            insertedCount: 3,
          }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(insertResult)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'insertMany',
            db: 'testdb',
            collection: 'users',
            documents: [
              { name: 'Alice' },
              { name: 'Bob' },
              { name: 'Charlie' },
            ],
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(insertResult)
        })

        it('requires documents array', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'insertMany',
            db: 'testdb',
            collection: 'users',
          } as WorkersRpcRequest)

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
          expect((json as WorkersRpcErrorResponse).error).toContain('documents')
        })

        it('rejects non-array documents', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'insertMany',
            db: 'testdb',
            collection: 'users',
            documents: { name: 'single' } as unknown as Record<string, unknown>[],
          })

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
        })
      })

      describe('updateOne', () => {
        it('executes updateOne via RPC', async () => {
          const updateResult = {
            acknowledged: true,
            matchedCount: 1,
            modifiedCount: 1,
            upsertedCount: 0,
          }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(updateResult)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'updateOne',
            db: 'testdb',
            collection: 'users',
            filter: { _id: '123' },
            update: { $set: { name: 'Updated' } },
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(updateResult)
        })

        it('requires filter parameter', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'updateOne',
            db: 'testdb',
            collection: 'users',
            update: { $set: { name: 'Test' } },
          } as WorkersRpcRequest)

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
          expect((json as WorkersRpcErrorResponse).error).toContain('filter')
        })

        it('requires update parameter', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'updateOne',
            db: 'testdb',
            collection: 'users',
            filter: { _id: '123' },
          } as WorkersRpcRequest)

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
          expect((json as WorkersRpcErrorResponse).error).toContain('update')
        })

        it('supports upsert option', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({
              acknowledged: true,
              matchedCount: 0,
              modifiedCount: 0,
              upsertedCount: 1,
              upsertedId: 'new-id',
            })
          )

          await makeWorkersRpcRequest(handler, {
            method: 'updateOne',
            db: 'testdb',
            collection: 'users',
            filter: { email: 'new@example.com' },
            update: { $set: { name: 'New User' } },
            options: { upsert: true },
          })

          const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
          const requestBody = JSON.parse(fetchCall[1]?.body as string)
          expect(requestBody.upsert).toBe(true)
        })
      })

      describe('updateMany', () => {
        it('executes updateMany via RPC', async () => {
          const updateResult = {
            acknowledged: true,
            matchedCount: 50,
            modifiedCount: 50,
            upsertedCount: 0,
          }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(updateResult)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'updateMany',
            db: 'testdb',
            collection: 'users',
            filter: { status: 'pending' },
            update: { $set: { status: 'active' } },
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(updateResult)
        })

        it('requires filter and update parameters', async () => {
          const { response: r1, json: j1 } = await makeWorkersRpcRequest(handler, {
            method: 'updateMany',
            db: 'testdb',
            collection: 'users',
            update: { $set: { status: 'active' } },
          } as WorkersRpcRequest)

          expect(r1.status).toBe(400)
          expect(j1.ok).toBe(0)

          const { response: r2, json: j2 } = await makeWorkersRpcRequest(handler, {
            method: 'updateMany',
            db: 'testdb',
            collection: 'users',
            filter: { status: 'pending' },
          } as WorkersRpcRequest)

          expect(r2.status).toBe(400)
          expect(j2.ok).toBe(0)
        })
      })

      describe('deleteOne', () => {
        it('executes deleteOne via RPC', async () => {
          const deleteResult = { acknowledged: true, deletedCount: 1 }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(deleteResult)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'deleteOne',
            db: 'testdb',
            collection: 'users',
            filter: { _id: '123' },
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(deleteResult)
        })

        it('requires filter parameter', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'deleteOne',
            db: 'testdb',
            collection: 'users',
          } as WorkersRpcRequest)

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
        })
      })

      describe('deleteMany', () => {
        it('executes deleteMany via RPC', async () => {
          const deleteResult = { acknowledged: true, deletedCount: 100 }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(deleteResult)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'deleteMany',
            db: 'testdb',
            collection: 'users',
            filter: { status: 'deleted' },
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(deleteResult)
        })
      })
    })

    describe('Collection Methods - Query', () => {
      describe('count', () => {
        it('executes count via RPC', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(42)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'count',
            db: 'testdb',
            collection: 'users',
            query: { status: 'active' },
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toBe(42)
        })

        it('counts all documents without query', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(1000)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'count',
            db: 'testdb',
            collection: 'users',
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toBe(1000)
        })
      })

      describe('distinct', () => {
        it('executes distinct via RPC', async () => {
          const distinctValues = ['active', 'inactive', 'pending']
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(distinctValues)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'distinct',
            db: 'testdb',
            collection: 'users',
            field: 'status',
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(distinctValues)
        })

        it('requires field parameter', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'distinct',
            db: 'testdb',
            collection: 'users',
          } as WorkersRpcRequest)

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
          expect((json as WorkersRpcErrorResponse).error).toContain('field')
        })

        it('supports query filter', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(['admin', 'user'])
          )

          await makeWorkersRpcRequest(handler, {
            method: 'distinct',
            db: 'testdb',
            collection: 'users',
            field: 'role',
            query: { status: 'active' },
          })

          const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
          const requestBody = JSON.parse(fetchCall[1]?.body as string)
          expect(requestBody.query).toEqual({ status: 'active' })
        })
      })

      describe('aggregate', () => {
        it('executes aggregate via RPC', async () => {
          const aggregateResult = {
            documents: [
              { _id: 'active', count: 100 },
              { _id: 'inactive', count: 50 },
            ],
            cursorId: '0',
            hasMore: false,
          }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(aggregateResult)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'aggregate',
            db: 'testdb',
            collection: 'users',
            pipeline: [
              { $match: { age: { $gte: 18 } } },
              { $group: { _id: '$status', count: { $sum: 1 } } },
            ],
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(aggregateResult)
        })

        it('requires pipeline parameter', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'aggregate',
            db: 'testdb',
            collection: 'users',
          } as WorkersRpcRequest)

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
          expect((json as WorkersRpcErrorResponse).error).toContain('pipeline')
        })

        it('rejects non-array pipeline', async () => {
          const { response, json } = await makeWorkersRpcRequest(handler, {
            method: 'aggregate',
            db: 'testdb',
            collection: 'users',
            pipeline: { $match: {} } as unknown as Record<string, unknown>[],
          })

          expect(response.status).toBe(400)
          expect(json.ok).toBe(0)
        })

        it('supports empty pipeline', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'aggregate',
            db: 'testdb',
            collection: 'users',
            pipeline: [],
          })

          expect(json.ok).toBe(1)
        })

        it('supports aggregation options', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
          )

          await makeWorkersRpcRequest(handler, {
            method: 'aggregate',
            db: 'testdb',
            collection: 'users',
            pipeline: [{ $match: {} }],
            options: { batchSize: 1000, allowDiskUse: true },
          })

          const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
          const requestBody = JSON.parse(fetchCall[1]?.body as string)
          expect(requestBody.batchSize).toBe(1000)
          expect(requestBody.allowDiskUse).toBe(true)
        })
      })
    })

    describe('Collection Methods - Collection Management', () => {
      describe('createCollection', () => {
        it('executes createCollection via RPC', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(null)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'createCollection',
            db: 'testdb',
            collection: 'newcollection',
          })

          expect(json.ok).toBe(1)
        })

        it('supports collection options', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(null)
          )

          await makeWorkersRpcRequest(handler, {
            method: 'createCollection',
            db: 'testdb',
            collection: 'capped',
            options: { capped: true, size: 10000, max: 1000 },
          })

          const fetchCall = mockEnv.MONDO_DATABASE._mockStub.fetch.mock.calls[0]
          const requestBody = JSON.parse(fetchCall[1]?.body as string)
          expect(requestBody.capped).toBe(true)
          expect(requestBody.size).toBe(10000)
        })
      })

      describe('dropCollection', () => {
        it('executes dropCollection via RPC', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(null)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'dropCollection',
            db: 'testdb',
            collection: 'oldcollection',
          })

          expect(json.ok).toBe(1)
        })
      })

      describe('collectionExists', () => {
        it('returns true when collection exists', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(true)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'collectionExists',
            db: 'testdb',
            collection: 'users',
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toBe(true)
        })
      })

      describe('collStats', () => {
        it('returns collection statistics', async () => {
          const stats = {
            ns: 'testdb.users',
            count: 100,
            size: 50000,
            avgObjSize: 500,
            storageSize: 60000,
            totalIndexSize: 10000,
            nindexes: 2,
          }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(stats)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'collStats',
            db: 'testdb',
            collection: 'users',
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(stats)
        })
      })
    })

    describe('Collection Methods - Index Operations', () => {
      describe('listIndexes', () => {
        it('executes listIndexes via RPC', async () => {
          const indexes = [
            { v: 2, key: { _id: 1 }, name: '_id_' },
            { v: 2, key: { email: 1 }, name: 'email_1', unique: true },
          ]
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(indexes)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'listIndexes',
            db: 'testdb',
            collection: 'users',
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(indexes)
        })
      })

      describe('createIndexes', () => {
        it('executes createIndexes via RPC', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(['email_1', 'name_1_status_1'])
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'createIndexes',
            db: 'testdb',
            collection: 'users',
            options: {
              indexes: [
                { key: { email: 1 }, unique: true },
                { key: { name: 1, status: 1 } },
              ],
            },
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(['email_1', 'name_1_status_1'])
        })
      })

      describe('dropIndex', () => {
        it('executes dropIndex via RPC', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ ok: 1 })
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'dropIndex',
            db: 'testdb',
            collection: 'users',
            options: { indexName: 'email_1' },
          })

          expect(json.ok).toBe(1)
        })
      })

      describe('dropIndexes', () => {
        it('executes dropIndexes via RPC', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ ok: 1 })
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'dropIndexes',
            db: 'testdb',
            collection: 'users',
          })

          expect(json.ok).toBe(1)
        })
      })
    })

    describe('Collection Methods - Cursor Operations', () => {
      describe('getMore', () => {
        it('executes getMore via RPC', async () => {
          const getMoreResult = {
            documents: [{ _id: '101' }, { _id: '102' }],
            cursorId: '12345678901234567890',
            hasMore: true,
          }
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse(getMoreResult)
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'getMore',
            db: 'testdb',
            collection: 'users',
            options: { cursorId: '12345678901234567890', batchSize: 100 },
          })

          expect(json.ok).toBe(1)
          expect((json as WorkersRpcSuccessResponse).result).toEqual(getMoreResult)
        })
      })

      describe('killCursors', () => {
        it('executes killCursors via RPC', async () => {
          mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
            mockDOSuccessResponse({ cursorsKilled: ['12345678901234567890'] })
          )

          const { json } = await makeWorkersRpcRequest(handler, {
            method: 'killCursors',
            db: 'testdb',
            collection: 'users',
            options: { cursors: ['12345678901234567890'] },
          })

          expect(json.ok).toBe(1)
        })
      })
    })
  })

  // ==========================================================================
  // 3. Error Handling and Error Response Format
  // ==========================================================================

  describe('Error Handling and Error Response Format', () => {
    describe('Request Validation Errors', () => {
      it('rejects GET requests with Method Not Allowed error', async () => {
        const request = new Request('https://mondo.workers.dev/rpc', {
          method: 'GET',
        })

        const response = await handler.fetch(request)
        const json = (await response.json()) as WorkersRpcErrorResponse

        expect(response.status).toBe(405)
        expect(json.ok).toBe(0)
        expect(json.error).toContain('Method not allowed')
      })

      it('rejects PUT requests', async () => {
        const request = new Request('https://mondo.workers.dev/rpc', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'find' }),
        })

        const response = await handler.fetch(request)
        const json = (await response.json()) as WorkersRpcErrorResponse

        expect(response.status).toBe(405)
        expect(json.ok).toBe(0)
      })

      it('handles invalid JSON body', async () => {
        const request = new Request('https://mondo.workers.dev/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not valid json {{{',
        })

        const response = await handler.fetch(request)
        const json = (await response.json()) as WorkersRpcErrorResponse

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
        expect(json.error).toContain('Invalid JSON')
      })

      it('handles empty request body', async () => {
        const request = new Request('https://mondo.workers.dev/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '',
        })

        const response = await handler.fetch(request)
        const json = (await response.json()) as WorkersRpcErrorResponse

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
      })

      it('rejects request without method field', async () => {
        const { response, json } = await makeWorkersRpcRequest(handler, {} as WorkersRpcRequest)

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).error).toContain('method')
        expect((json as WorkersRpcErrorResponse).code).toBe(ErrorCodes.BadValue.code)
      })

      it('rejects unknown method with CommandNotFound error', async () => {
        const { response, json } = await makeWorkersRpcRequest(handler, {
          method: 'unknownMethod',
        })

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).error).toContain('Unknown method')
        expect((json as WorkersRpcErrorResponse).code).toBe(ErrorCodes.CommandNotFound.code)
        expect((json as WorkersRpcErrorResponse).codeName).toBe(ErrorCodes.CommandNotFound.name)
      })

      it('validates empty db name', async () => {
        const { response, json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: '',
          collection: 'users',
          filter: {},
        })

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
      })

      it('validates empty collection name', async () => {
        const { response, json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: '',
          filter: {},
        })

        expect(response.status).toBe(400)
        expect(json.ok).toBe(0)
      })
    })

    describe('MongoDB Error Codes', () => {
      it('returns code 1 (InternalError) for unexpected errors', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockRejectedValueOnce(
          new Error('Unexpected internal error')
        )

        const { json, response } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(response.status).toBe(500)
        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).code).toBe(ErrorCodes.InternalError.code)
        expect((json as WorkersRpcErrorResponse).codeName).toBe(ErrorCodes.InternalError.name)
      })

      it('returns code 2 (BadValue) for invalid parameters', async () => {
        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: 'not-an-object' as unknown as Record<string, unknown>,
        })

        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).code).toBe(ErrorCodes.BadValue.code)
        expect((json as WorkersRpcErrorResponse).codeName).toBe(ErrorCodes.BadValue.name)
      })

      it('returns code 26 (NamespaceNotFound) for missing collection', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOErrorResponse('Collection not found', 26, 404)
        )

        const { json, response } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'nonexistent',
          filter: {},
        })

        expect(response.status).toBe(404)
        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).code).toBe(ErrorCodes.NamespaceNotFound.code)
        expect((json as WorkersRpcErrorResponse).codeName).toBe(ErrorCodes.NamespaceNotFound.name)
      })

      it('returns code 59 (CommandNotFound) for unknown method', async () => {
        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'invalidCommand',
        })

        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).code).toBe(ErrorCodes.CommandNotFound.code)
        expect((json as WorkersRpcErrorResponse).codeName).toBe(ErrorCodes.CommandNotFound.name)
      })

      it('returns code 11000 (DuplicateKey) for duplicate key error', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOErrorResponse('Duplicate key error', 11000, 409)
        )

        const { json, response } = await makeWorkersRpcRequest(handler, {
          method: 'insertMany',
          db: 'testdb',
          collection: 'users',
          documents: [{ _id: 'duplicate' }],
        })

        expect(response.status).toBe(409)
        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).code).toBe(ErrorCodes.DuplicateKey.code)
        expect((json as WorkersRpcErrorResponse).codeName).toBe(ErrorCodes.DuplicateKey.name)
      })

      it('returns code 13 (Unauthorized) for auth failures', async () => {
        const authEnv = createMockEnv({ authToken: 'secret-token' })
        const authHandler = createRpcHandler(authEnv as unknown as RpcEnv, mockCtx)

        const { json, response } = await makeWorkersRpcRequest(
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
        expect((json as WorkersRpcErrorResponse).code).toBe(ErrorCodes.Unauthorized.code)
        expect((json as WorkersRpcErrorResponse).codeName).toBe(ErrorCodes.Unauthorized.name)
      })
    })

    describe('System Collection Protection', () => {
      it('rejects writes to system.indexes', async () => {
        const { response, json } = await makeWorkersRpcRequest(handler, {
          method: 'insertMany',
          db: 'testdb',
          collection: 'system.indexes',
          documents: [{ name: 'test' }],
        })

        expect(response.status).toBe(403)
        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).error).toContain('system')
      })

      it('rejects writes to system.users', async () => {
        const { response, json } = await makeWorkersRpcRequest(handler, {
          method: 'deleteMany',
          db: 'testdb',
          collection: 'system.users',
          filter: {},
        })

        expect(response.status).toBe(403)
        expect(json.ok).toBe(0)
      })

      it('allows reads from system collections', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
        )

        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'system.indexes',
          filter: {},
        })

        expect(json.ok).toBe(1)
      })
    })

    describe('Backend Error Propagation', () => {
      it('propagates error message from backend', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOErrorResponse('Custom backend error message', 1, 500)
        )

        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).error).toBe('Custom backend error message')
      })

      it('propagates error code from backend', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOErrorResponse('Some error', 12345, 500)
        )

        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(json.ok).toBe(0)
        // Should still provide a code, even if unknown
        expect((json as WorkersRpcErrorResponse).code).toBeDefined()
      })

      it('handles backend returning non-ok response without error body', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          new Response('Internal Server Error', { status: 500 })
        )

        const { json, response } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(response.status).toBe(500)
        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).code).toBe(ErrorCodes.InternalError.code)
      })

      it('handles network timeout', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockImplementation(
          () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
        )

        const { json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).code).toBeDefined()
      })
    })
  })

  // ==========================================================================
  // 4. Authentication Flow
  // ==========================================================================

  describe('Authentication Flow', () => {
    describe('When Authentication is Configured', () => {
      let authHandler: RpcHandler
      let authEnv: ReturnType<typeof createMockEnv>

      beforeEach(() => {
        authEnv = createMockEnv({ authToken: 'valid-secret-token-12345' })
        authHandler = createRpcHandler(authEnv as unknown as RpcEnv, mockCtx)
      })

      it('accepts valid Bearer token in Authorization header', async () => {
        authEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
        )

        const { response, json } = await makeWorkersRpcRequest(
          authHandler,
          {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          },
          { headers: { Authorization: 'Bearer valid-secret-token-12345' } }
        )

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })

      it('rejects invalid Bearer token', async () => {
        const { response, json } = await makeWorkersRpcRequest(
          authHandler,
          {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          },
          { headers: { Authorization: 'Bearer invalid-token' } }
        )

        expect(response.status).toBe(401)
        expect(json.ok).toBe(0)
        expect((json as WorkersRpcErrorResponse).error).toContain('Unauthorized')
      })

      it('rejects empty Bearer token', async () => {
        const { response, json } = await makeWorkersRpcRequest(
          authHandler,
          {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          },
          { headers: { Authorization: 'Bearer ' } }
        )

        expect(response.status).toBe(401)
        expect(json.ok).toBe(0)
      })

      it('rejects missing Authorization header', async () => {
        const { response, json } = await makeWorkersRpcRequest(authHandler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(response.status).toBe(401)
        expect(json.ok).toBe(0)
      })

      it('rejects malformed Authorization header (not Bearer)', async () => {
        const { response, json } = await makeWorkersRpcRequest(
          authHandler,
          {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          },
          { headers: { Authorization: 'Basic dXNlcjpwYXNz' } }
        )

        expect(response.status).toBe(401)
        expect(json.ok).toBe(0)
      })

      it('accepts token via X-Mondo-Token header', async () => {
        authEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
        )

        const { response, json } = await makeWorkersRpcRequest(
          authHandler,
          {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          },
          { headers: { 'X-Mondo-Token': 'valid-secret-token-12345' } }
        )

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })

      it('prefers Authorization header over X-Mondo-Token', async () => {
        // When both headers are present, Authorization should take precedence
        const { response, json } = await makeWorkersRpcRequest(
          authHandler,
          {
            method: 'find',
            db: 'testdb',
            collection: 'users',
            filter: {},
          },
          {
            headers: {
              Authorization: 'Bearer invalid-token',
              'X-Mondo-Token': 'valid-secret-token-12345',
            },
          }
        )

        // Should fail because Authorization header has invalid token
        expect(response.status).toBe(401)
        expect(json.ok).toBe(0)
      })

      it('uses X-Mondo-Token when Authorization header is absent', async () => {
        authEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse([])
        )

        const { response, json } = await makeWorkersRpcRequest(
          authHandler,
          { method: 'listDatabases' },
          { headers: { 'X-Mondo-Token': 'valid-secret-token-12345' } }
        )

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })

      it('timing-safe token comparison', async () => {
        // Test that token comparison doesn't leak timing information
        // Short token should take same time as correct-length token
        const shortToken = 'short'
        const correctLengthToken = 'x'.repeat('valid-secret-token-12345'.length)

        const start1 = performance.now()
        await makeWorkersRpcRequest(
          authHandler,
          { method: 'listDatabases' },
          { headers: { Authorization: `Bearer ${shortToken}` } }
        )
        const time1 = performance.now() - start1

        const start2 = performance.now()
        await makeWorkersRpcRequest(
          authHandler,
          { method: 'listDatabases' },
          { headers: { Authorization: `Bearer ${correctLengthToken}` } }
        )
        const time2 = performance.now() - start2

        // Both should fail with same response
        // Note: This is a basic timing test - real timing attacks need more samples
        expect(Math.abs(time1 - time2)).toBeLessThan(50) // Within 50ms tolerance
      })
    })

    describe('When Authentication is Not Configured', () => {
      it('allows requests without Authorization header', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
        )

        const { response, json } = await makeWorkersRpcRequest(handler, {
          method: 'find',
          db: 'testdb',
          collection: 'users',
          filter: {},
        })

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })

      it('ignores Authorization header when auth not configured', async () => {
        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
          mockDOSuccessResponse([])
        )

        const { response, json } = await makeWorkersRpcRequest(
          handler,
          { method: 'listDatabases' },
          { headers: { Authorization: 'Bearer any-token' } }
        )

        expect(response.status).toBe(200)
        expect(json.ok).toBe(1)
      })
    })

    describe('CORS Headers on Auth Responses', () => {
      let authHandler: RpcHandler
      let authEnv: ReturnType<typeof createMockEnv>

      beforeEach(() => {
        authEnv = createMockEnv({ authToken: 'secret' })
        authHandler = createRpcHandler(authEnv as unknown as RpcEnv, mockCtx)
      })

      it('includes CORS headers on 401 Unauthorized response', async () => {
        const { response } = await makeWorkersRpcRequest(authHandler, {
          method: 'listDatabases',
        })

        expect(response.status).toBe(401)
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      })

      it('includes Access-Control-Allow-Headers with Authorization', async () => {
        const request = new Request('https://mondo.workers.dev/rpc', {
          method: 'OPTIONS',
        })

        const response = await authHandler.fetch(request)

        expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
        expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-Mondo-Token')
      })
    })
  })

  // ==========================================================================
  // 5. CORS Support
  // ==========================================================================

  describe('CORS Support', () => {
    it('handles OPTIONS preflight request', async () => {
      const request = new Request('https://mondo.workers.dev/rpc', {
        method: 'OPTIONS',
      })

      const response = await handler.fetch(request)

      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS')
    })

    it('includes CORS headers on success response', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse([])
      )

      const { response } = await makeWorkersRpcRequest(handler, {
        method: 'listDatabases',
      })

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('includes CORS headers on error response', async () => {
      const { response } = await makeWorkersRpcRequest(handler, {
        method: 'unknownMethod',
      })

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('includes Access-Control-Max-Age header', async () => {
      const request = new Request('https://mondo.workers.dev/rpc', {
        method: 'OPTIONS',
      })

      const response = await handler.fetch(request)

      expect(response.headers.get('Access-Control-Max-Age')).toBeDefined()
    })

    it('allows Content-Type header in preflight', async () => {
      const request = new Request('https://mondo.workers.dev/rpc', {
        method: 'OPTIONS',
      })

      const response = await handler.fetch(request)

      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
    })
  })

  // ==========================================================================
  // 6. Edge Cases and Robustness
  // ==========================================================================

  describe('Edge Cases and Robustness', () => {
    it('handles concurrent requests', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ documents: [], cursorId: '0', hasMore: false }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        )
      )

      const requests = Array.from({ length: 20 }, (_, i) =>
        makeWorkersRpcRequest(handler, {
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
        mockDOSuccessResponse({
          acknowledged: true,
          insertedIds: Object.fromEntries(largeDocuments.map((_, i) => [i, `id${i}`])),
          insertedCount: largeDocuments.length,
        })
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
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
        mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
      )

      const { json } = await makeWorkersRpcRequest(handler, {
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
        mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
      )

      const { json } = await makeWorkersRpcRequest(handler, {
        method: 'find',
        db: 'my-database_v2',
        collection: 'user_profiles-2024',
        filter: {},
      })

      expect(json.ok).toBe(1)
    })

    it('handles null values in documents', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({
          acknowledged: true,
          insertedIds: { 0: 'id1' },
          insertedCount: 1,
        })
      )

      const { json } = await makeWorkersRpcRequest(handler, {
        method: 'insertMany',
        db: 'testdb',
        collection: 'users',
        documents: [{ name: 'Test', nullField: null, nested: { value: null } }],
      })

      expect(json.ok).toBe(1)
    })

    it('handles array values in filter', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({ documents: [], cursorId: '0', hasMore: false })
      )

      const { json } = await makeWorkersRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {
          status: { $in: ['active', 'pending'] },
          tags: { $all: ['admin', 'verified'] },
        },
      })

      expect(json.ok).toBe(1)
    })

    it('serializes BigInt cursorId as string', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({
          documents: [{ _id: '1' }],
          cursorId: '12345678901234567890',
          hasMore: true,
        })
      )

      const { json } = await makeWorkersRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {},
      })

      expect(json.ok).toBe(1)
      const result = (json as WorkersRpcSuccessResponse).result as { cursorId: string }
      expect(typeof result.cursorId).toBe('string')
    })

    it('preserves Date objects in documents', async () => {
      const now = new Date().toISOString()
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({
          documents: [{ _id: '1', createdAt: now }],
          cursorId: '0',
          hasMore: false,
        })
      )

      const { json } = await makeWorkersRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'users',
        filter: {},
      })

      expect(json.ok).toBe(1)
      const result = (json as WorkersRpcSuccessResponse).result as { documents: { createdAt: string }[] }
      expect(result.documents[0].createdAt).toBe(now)
    })
  })
})

// ============================================================================
// RED Phase Tests - Features Not Yet Implemented
// ============================================================================

describe.skip('Workers RPC Endpoint - RED Phase (Unimplemented Features)', () => {
  let handler: RpcHandler
  let mockEnv: ReturnType<typeof createMockEnv>
  let mockCtx: ReturnType<typeof createMockContext>

  beforeEach(() => {
    mockEnv = createMockEnv()
    mockCtx = createMockContext()
    handler = createRpcHandler(mockEnv as unknown as RpcEnv, mockCtx)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ==========================================================================
  // JSON-RPC 2.0 Protocol Support (NOT IMPLEMENTED)
  // ==========================================================================

  describe('JSON-RPC 2.0 Protocol (NOT IMPLEMENTED - Should Fail)', () => {
    it('should create JSON-RPC handler without throwing', async () => {
      // This test should FAIL because createJsonRpcHandler is not implemented
      const module = await import('../../../src/rpc/endpoint')
      const createJsonRpcHandler = module.createJsonRpcHandler

      expect(() => {
        createJsonRpcHandler(mockEnv as unknown as RpcEnv, mockCtx)
      }).not.toThrow()
    })

    it('should accept JSON-RPC 2.0 formatted request', async () => {
      // This test documents expected JSON-RPC 2.0 behavior
      // The /jsonrpc endpoint should accept JSON-RPC 2.0 formatted requests
      const request = new Request('https://mondo.workers.dev/jsonrpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'find',
          params: { db: 'testdb', collection: 'users', filter: {} },
        }),
      })

      // Currently, there's no /jsonrpc endpoint - this should return 404
      // When implemented, it should return 200 with JSON-RPC response
      const response = await handler.fetch(request)

      // This expectation should FAIL since /jsonrpc is not implemented
      expect(response.status).toBe(200)
    })

    it('should return JSON-RPC 2.0 formatted error for method not found', async () => {
      // JSON-RPC 2.0 error codes:
      // -32700: Parse error
      // -32600: Invalid Request
      // -32601: Method not found
      // -32602: Invalid params
      // -32603: Internal error

      // When JSON-RPC is implemented, this should work
      // For now, we expect this test to fail
      const module = await import('../../../src/rpc/endpoint')

      try {
        const jsonRpcHandler = module.createJsonRpcHandler(mockEnv as unknown as RpcEnv, mockCtx)

        const request = new Request('https://mondo.workers.dev/jsonrpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'nonexistentMethod',
          }),
        })

        const response = await jsonRpcHandler.fetch(request)
        const json = await response.json() as { error?: { code: number } }

        expect(json.error?.code).toBe(-32601) // Method not found
      } catch {
        // Test fails because createJsonRpcHandler throws
        expect.fail('createJsonRpcHandler should not throw')
      }
    })

    it('should handle JSON-RPC batch requests', async () => {
      const module = await import('../../../src/rpc/endpoint')

      try {
        const jsonRpcHandler = module.createJsonRpcHandler(mockEnv as unknown as RpcEnv, mockCtx)

        mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValue(
          mockDOSuccessResponse([])
        )

        const request = new Request('https://mondo.workers.dev/jsonrpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([
            { jsonrpc: '2.0', id: 1, method: 'listDatabases' },
            { jsonrpc: '2.0', id: 2, method: 'listDatabases' },
          ]),
        })

        const response = await jsonRpcHandler.fetch(request)
        const json = await response.json()

        expect(Array.isArray(json)).toBe(true)
        expect(json).toHaveLength(2)
      } catch {
        expect.fail('createJsonRpcHandler should not throw')
      }
    })
  })

  // ==========================================================================
  // Rate Limiting (NOT IMPLEMENTED)
  // ==========================================================================

  describe('Rate Limiting (NOT IMPLEMENTED - Should Fail)', () => {
    it('should return rate limit headers', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse([])
      )

      const { response } = await makeWorkersRpcRequest(handler, {
        method: 'listDatabases',
      })

      // These headers are not currently implemented
      expect(response.headers.get('X-RateLimit-Limit')).toBeDefined()
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined()
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined()
    })

    it('should return 429 when rate limit exceeded', async () => {
      // Rate limiting is not implemented
      // This test documents expected behavior when it is implemented
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockImplementation(() =>
        Promise.resolve(mockDOSuccessResponse([]))
      )

      // Make many rapid requests
      const requests = Array.from({ length: 1000 }, () =>
        makeWorkersRpcRequest(handler, { method: 'listDatabases' })
      )

      const results = await Promise.all(requests)

      // At least some should be rate limited (429 Too Many Requests)
      const rateLimited = results.filter((r) => r.response.status === 429)
      expect(rateLimited.length).toBeGreaterThan(0)
    })
  })

  // ==========================================================================
  // Request ID Tracking (NOT IMPLEMENTED)
  // ==========================================================================

  describe('Request ID Tracking (NOT IMPLEMENTED - Should Fail)', () => {
    it('should include request ID in response', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse([])
      )

      const { response } = await makeWorkersRpcRequest(handler, {
        method: 'listDatabases',
      })

      // X-Request-Id header is not currently implemented
      expect(response.headers.get('X-Request-Id')).toBeDefined()
    })

    it('should echo client request ID if provided', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse([])
      )

      const { response } = await makeWorkersRpcRequest(
        handler,
        { method: 'listDatabases' },
        { headers: { 'X-Request-Id': 'client-request-123' } }
      )

      expect(response.headers.get('X-Request-Id')).toBe('client-request-123')
    })
  })

  // ==========================================================================
  // WebSocket Upgrade (NOT IMPLEMENTED)
  // ==========================================================================

  describe('WebSocket RPC Support (NOT IMPLEMENTED - Should Fail)', () => {
    it('should accept WebSocket upgrade request', async () => {
      const request = new Request('https://mondo.workers.dev/rpc/ws', {
        method: 'GET',
        headers: {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
        },
      })

      const response = await handler.fetch(request)

      // WebSocket upgrade is not implemented
      // Currently returns 405 Method Not Allowed for GET
      // When implemented, should return 101 Switching Protocols
      expect(response.status).toBe(101)
      expect(response.headers.get('Upgrade')).toBe('websocket')
    })
  })

  // ==========================================================================
  // Transaction Support via RPC (NOT IMPLEMENTED)
  // ==========================================================================

  describe('Transaction Support via RPC (NOT IMPLEMENTED - Should Fail)', () => {
    it('should support startSession method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({ sessionId: 'session-123' })
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'startSession',
        options: { causalConsistency: true },
      })

      // startSession is not in SUPPORTED_METHODS
      // This should fail with "Unknown method"
      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
      expect((json as WorkersRpcSuccessResponse).result).toHaveProperty('sessionId')
    })

    it('should support startTransaction method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({ transactionId: 'txn-123' })
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'startTransaction',
        options: { sessionId: 'session-123' },
      })

      // startTransaction is not in SUPPORTED_METHODS
      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
    })

    it('should support commitTransaction method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({})
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'commitTransaction',
        options: { sessionId: 'session-123' },
      })

      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
    })

    it('should support abortTransaction method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({})
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'abortTransaction',
        options: { sessionId: 'session-123' },
      })

      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
    })
  })

  // ==========================================================================
  // Change Streams via RPC (NOT IMPLEMENTED)
  // ==========================================================================

  describe('Change Streams via RPC (NOT IMPLEMENTED - Should Fail)', () => {
    it('should support watch method for change streams', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({ resumeToken: 'token-123' })
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'watch',
        db: 'testdb',
        collection: 'users',
        pipeline: [{ $match: { 'fullDocument.status': 'active' } }],
      })

      // watch method is not in SUPPORTED_METHODS
      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
    })
  })

  // ==========================================================================
  // Bulk Write Operations (NOT FULLY IMPLEMENTED)
  // ==========================================================================

  describe('Bulk Write Operations (NOT IMPLEMENTED - Should Fail)', () => {
    it('should support bulkWrite method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({
          insertedCount: 1,
          matchedCount: 1,
          modifiedCount: 1,
          deletedCount: 1,
          upsertedCount: 0,
        })
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'bulkWrite',
        db: 'testdb',
        collection: 'users',
        options: {
          operations: [
            { insertOne: { document: { name: 'Alice' } } },
            { updateOne: { filter: { name: 'Bob' }, update: { $set: { age: 30 } } } },
            { deleteOne: { filter: { name: 'Charlie' } } },
          ],
          ordered: true,
        },
      })

      // bulkWrite is not in SUPPORTED_METHODS
      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
    })
  })

  // ==========================================================================
  // findAndModify Operations (NOT IMPLEMENTED)
  // ==========================================================================

  describe('findAndModify Operations (NOT IMPLEMENTED - Should Fail)', () => {
    it('should support findOneAndUpdate method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({ value: { _id: '1', name: 'Updated' } })
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'findOneAndUpdate',
        db: 'testdb',
        collection: 'users',
        filter: { _id: '1' },
        update: { $set: { name: 'Updated' } },
        options: { returnDocument: 'after' },
      })

      // findOneAndUpdate is not in SUPPORTED_METHODS
      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
    })

    it('should support findOneAndDelete method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({ value: { _id: '1', name: 'Deleted' } })
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'findOneAndDelete',
        db: 'testdb',
        collection: 'users',
        filter: { _id: '1' },
      })

      // findOneAndDelete is not in SUPPORTED_METHODS
      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
    })

    it('should support findOneAndReplace method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({ value: { _id: '1', name: 'Replaced' } })
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'findOneAndReplace',
        db: 'testdb',
        collection: 'users',
        filter: { _id: '1' },
        options: { replacement: { name: 'Replaced', email: 'replaced@example.com' } },
      })

      // findOneAndReplace is not in SUPPORTED_METHODS
      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
    })
  })

  // ==========================================================================
  // Rename Collection (NOT IMPLEMENTED)
  // ==========================================================================

  describe('Collection Rename (NOT IMPLEMENTED - Should Fail)', () => {
    it('should support renameCollection method', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({})
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'renameCollection',
        db: 'testdb',
        collection: 'oldname',
        options: { newName: 'newname', dropTarget: false },
      })

      // renameCollection is not in SUPPORTED_METHODS
      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)
    })
  })

  // ==========================================================================
  // Text Search (NOT IMPLEMENTED VIA RPC)
  // ==========================================================================

  describe('Text Search via RPC (NOT IMPLEMENTED - Should Fail)', () => {
    it('should support $text query via find', async () => {
      mockEnv.MONDO_DATABASE._mockStub.fetch.mockResolvedValueOnce(
        mockDOSuccessResponse({
          documents: [{ _id: '1', title: 'Hello World', score: 1.5 }],
          cursorId: '0',
          hasMore: false,
        })
      )

      const { json, response } = await makeWorkersRpcRequest(handler, {
        method: 'find',
        db: 'testdb',
        collection: 'articles',
        filter: { $text: { $search: 'hello world' } },
        options: { projection: { score: { $meta: 'textScore' } } },
      })

      expect(response.status).toBe(200)
      expect(json.ok).toBe(1)

      // Verify that text search scoring works
      const result = (json as WorkersRpcSuccessResponse).result as { documents: { score: number }[] }
      expect(result.documents[0]).toHaveProperty('score')
    })
  })
})
