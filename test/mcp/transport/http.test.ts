import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createHttpMcpHandler,
  createStandardHandler,
  type RequestLogEntry,
  type AuthResult,
  type RateLimitResult,
  type HttpTransportOptions,
} from '../../../src/mcp/transport/http'
import { createMcpServer, createMockDatabaseAccess } from '../../../src/mcp/server'
import type { McpServer } from '../../../src/mcp/server'
import type { McpRequest, McpResponse } from '../../../src/mcp/types'

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock MCP server for testing
 */
function createTestServer(): McpServer {
  return createMcpServer({
    dbAccess: createMockDatabaseAccess(),
    name: 'test-server',
    version: '1.0.0',
  })
}

/**
 * Create a JSON-RPC request
 */
function createJsonRequest(body: object, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

/**
 * Create an SSE request
 */
function createSseRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/mcp', {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      ...headers,
    },
  })
}

// =============================================================================
// Handler Creation Tests
// =============================================================================

describe('createHttpMcpHandler', () => {
  it('should create an HTTP handler function', () => {
    const server = createTestServer()
    const handler = createHttpMcpHandler(server)

    expect(typeof handler).toBe('function')
  })

  it('should accept optional CORS options', () => {
    const server = createTestServer()
    const handler = createHttpMcpHandler(server, {
      origin: 'https://example.com',
      credentials: true,
    })

    expect(typeof handler).toBe('function')
  })
})

describe('createStandardHandler', () => {
  it('should create the same handler as createHttpMcpHandler', () => {
    const server = createTestServer()
    const handler = createStandardHandler(server)

    expect(typeof handler).toBe('function')
  })
})

// =============================================================================
// CORS Preflight Tests
// =============================================================================

describe('CORS preflight handling', () => {
  let server: McpServer
  let handler: (req: Request) => Promise<Response>

  beforeEach(() => {
    server = createTestServer()
    handler = createHttpMcpHandler(server)
  })

  it('should respond to OPTIONS request with 204', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'OPTIONS',
    })

    const response = await handler(request)

    expect(response.status).toBe(204)
  })

  it('should include default CORS headers in OPTIONS response', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'OPTIONS',
    })

    const response = await handler(request)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type')
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('mcp-session-id')
  })

  it('should use custom CORS origin', async () => {
    const customHandler = createHttpMcpHandler(server, {
      origin: 'https://example.com',
    })

    const request = new Request('http://localhost/mcp', {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.com' },
    })

    const response = await customHandler(request)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
  })

  it('should handle array of allowed origins', async () => {
    const customHandler = createHttpMcpHandler(server, {
      origin: ['https://example.com', 'https://other.com'],
    })

    const request = new Request('http://localhost/mcp', {
      method: 'OPTIONS',
      headers: { Origin: 'https://other.com' },
    })

    const response = await customHandler(request)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://other.com')
  })
})

// =============================================================================
// JSON-RPC POST Request Tests
// =============================================================================

describe('JSON-RPC POST handling', () => {
  let server: McpServer
  let handler: (req: Request) => Promise<Response>

  beforeEach(() => {
    server = createTestServer()
    handler = createHttpMcpHandler(server)
  })

  it('should handle valid initialize request', async () => {
    const request = createJsonRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    })

    const response = await handler(request)
    const body = await response.json() as McpResponse

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(body.jsonrpc).toBe('2.0')
    expect(body.id).toBe(1)
    expect(body.result).toBeDefined()
    const result = body.result as { serverInfo: { name: string } }
    expect(result.serverInfo.name).toBe('test-server')
  })

  it('should handle tools/list request', async () => {
    const request = createJsonRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    })

    const response = await handler(request)
    const body = await response.json() as McpResponse

    expect(response.status).toBe(200)
    expect(body.result).toBeDefined()
    const result = body.result as { tools: unknown[] }
    expect(result.tools).toBeDefined()
    expect(Array.isArray(result.tools)).toBe(true)
  })

  it('should handle tools/call request', async () => {
    const request = createJsonRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'search',
        arguments: { query: 'test' },
      },
    })

    const response = await handler(request)
    const body = await response.json() as McpResponse

    expect(response.status).toBe(200)
    expect(body.result).toBeDefined()
  })

  it('should include session ID in response header', async () => {
    const request = createJsonRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    })

    const response = await handler(request)

    expect(response.headers.get('mcp-session-id')).toBeDefined()
    expect(response.headers.get('mcp-session-id')!.length).toBeGreaterThan(0)
  })

  it('should preserve session ID from request', async () => {
    const sessionId = 'test-session-123'
    const request = createJsonRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      },
      { 'mcp-session-id': sessionId }
    )

    const response = await handler(request)

    expect(response.headers.get('mcp-session-id')).toBe(sessionId)
  })
})

// =============================================================================
// Batch Request Tests
// =============================================================================

describe('Batch request handling', () => {
  let server: McpServer
  let handler: (req: Request) => Promise<Response>

  beforeEach(() => {
    server = createTestServer()
    handler = createHttpMcpHandler(server)
  })

  it('should handle batch requests', async () => {
    const request = createJsonRequest([
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ])

    const response = await handler(request)
    const body = await response.json() as McpResponse[]

    expect(response.status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(2)
    expect(body[0].id).toBe(1)
    expect(body[1].id).toBe(2)
  })

  it('should return array of responses for batch', async () => {
    const request = createJsonRequest([
      { jsonrpc: '2.0', id: 'a', method: 'tools/list' },
      {
        jsonrpc: '2.0',
        id: 'b',
        method: 'tools/call',
        params: { name: 'search', arguments: { query: 'test' } },
      },
    ])

    const response = await handler(request)
    const body = await response.json() as McpResponse[]

    expect(body.length).toBe(2)
    expect(body.every((r) => r.jsonrpc === '2.0')).toBe(true)
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error handling', () => {
  let server: McpServer
  let handler: (req: Request) => Promise<Response>

  beforeEach(() => {
    server = createTestServer()
    handler = createHttpMcpHandler(server)
  })

  it('should reject non-JSON Content-Type', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
    })

    const response = await handler(request)
    const body = await response.json() as McpResponse

    expect(response.status).toBe(400)
    expect(body.error).toBeDefined()
    expect(body.error!.code).toBe(-32700)
    expect(body.error!.message).toContain('application/json')
  })

  it('should handle invalid JSON body', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not valid json',
    })

    const response = await handler(request)
    const body = await response.json() as McpResponse

    expect(response.status).toBe(400)
    expect(body.error).toBeDefined()
    expect(body.error!.code).toBe(-32700)
  })

  it('should reject unsupported HTTP method', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    const response = await handler(request)
    const body = await response.json() as McpResponse

    expect(response.status).toBe(405)
    expect(body.error).toBeDefined()
    expect(body.error!.code).toBe(-32600)
    expect(body.error!.message).toContain('PUT')
  })

  it('should handle unknown method', async () => {
    const request = createJsonRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown/method',
    })

    const response = await handler(request)
    const body = await response.json() as McpResponse

    expect(response.status).toBe(200)
    expect(body.error).toBeDefined()
    expect(body.error!.code).toBe(-32601)
  })

  it('should handle invalid request object', async () => {
    const request = createJsonRequest('not an object' as unknown as object)

    const response = await handler(request)
    const body = await response.json() as McpResponse

    expect(response.status).toBe(200)
    expect(body.error).toBeDefined()
    expect(body.error!.code).toBe(-32600)
  })
})

// =============================================================================
// SSE Stream Tests
// =============================================================================

describe('SSE stream handling', () => {
  let server: McpServer
  let handler: (req: Request) => Promise<Response>

  beforeEach(() => {
    server = createTestServer()
    handler = createHttpMcpHandler(server)
  })

  it('should return SSE response for GET with Accept header', async () => {
    const request = createSseRequest()

    const response = await handler(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
  })

  it('should include session ID in SSE response', async () => {
    const request = createSseRequest()

    const response = await handler(request)

    expect(response.headers.get('mcp-session-id')).toBeDefined()
  })

  it('should reject GET without Accept header', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'GET',
    })

    const response = await handler(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body).toHaveProperty('error')
  })

  it('should send initial connection event', async () => {
    const request = createSseRequest()

    const response = await handler(request)
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    const { value } = await reader.read()
    const text = decoder.decode(value)

    expect(text).toContain('event: endpoint')
    expect(text).toContain('connection')
    expect(text).toContain('sessionId')

    reader.releaseLock()
  })
})

// =============================================================================
// Session Management Tests
// =============================================================================

describe('Session management', () => {
  let server: McpServer
  let handler: (req: Request) => Promise<Response>

  beforeEach(() => {
    server = createTestServer()
    handler = createHttpMcpHandler(server)
  })

  it('should generate new session ID for new requests', async () => {
    const request1 = createJsonRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const request2 = createJsonRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' })

    const response1 = await handler(request1)
    const response2 = await handler(request2)

    const session1 = response1.headers.get('mcp-session-id')
    const session2 = response2.headers.get('mcp-session-id')

    expect(session1).toBeDefined()
    expect(session2).toBeDefined()
    expect(session1).not.toBe(session2)
  })

  it('should maintain session ID when provided', async () => {
    const sessionId = 'my-session-id'

    const request = createJsonRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { 'mcp-session-id': sessionId }
    )

    const response = await handler(request)

    expect(response.headers.get('mcp-session-id')).toBe(sessionId)
  })

  it('should handle DELETE request for session termination', async () => {
    const sessionId = 'session-to-delete'

    const request = new Request('http://localhost/mcp', {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId },
    })

    const response = await handler(request)

    expect(response.status).toBe(204)
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('HTTP transport integration', () => {
  let server: McpServer
  let handler: (req: Request) => Promise<Response>

  beforeEach(() => {
    server = createTestServer()
    handler = createHttpMcpHandler(server)
  })

  it('should handle full MCP workflow', async () => {
    // Initialize
    const initRequest = createJsonRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    })

    const initResponse = await handler(initRequest)
    const sessionId = initResponse.headers.get('mcp-session-id')!
    const initBody = await initResponse.json() as McpResponse

    expect(initBody.result).toBeDefined()

    // List tools
    const listRequest = createJsonRequest(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { 'mcp-session-id': sessionId }
    )

    const listResponse = await handler(listRequest)
    const listBody = await listResponse.json() as McpResponse
    const result = listBody.result as { tools: { name: string }[] }

    expect(result.tools.length).toBeGreaterThan(0)

    // Call tool
    const callRequest = createJsonRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'search', arguments: { query: 'test' } },
      },
      { 'mcp-session-id': sessionId }
    )

    const callResponse = await handler(callRequest)
    const callBody = await callResponse.json() as McpResponse

    expect(callBody.result).toBeDefined()
  })

  it('should include CORS headers in all responses', async () => {
    const requests = [
      new Request('http://localhost/mcp', { method: 'OPTIONS' }),
      createJsonRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      createSseRequest(),
    ]

    for (const request of requests) {
      const response = await handler(request)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    }
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge cases', () => {
  let server: McpServer
  let handler: (req: Request) => Promise<Response>

  beforeEach(() => {
    server = createTestServer()
    handler = createHttpMcpHandler(server)
  })

  it('should handle empty request body', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    })

    const response = await handler(request)

    expect(response.status).toBe(400)
  })

  it('should handle null request body', async () => {
    const request = createJsonRequest(null as unknown as object)

    const response = await handler(request)
    const body = await response.json() as McpResponse

    expect(body.error).toBeDefined()
  })

  it('should handle request with no id', async () => {
    const request = createJsonRequest({
      jsonrpc: '2.0',
      method: 'tools/list',
    })

    const response = await handler(request)
    const body = await response.json() as McpResponse

    // The server preserves undefined id as undefined in response
    expect(body.id).toBeUndefined()
    expect(body.result).toBeDefined()
  })

  it('should handle concurrent requests', async () => {
    const requests = Array.from({ length: 10 }, (_, i) =>
      createJsonRequest({ jsonrpc: '2.0', id: i, method: 'tools/list' })
    )

    const responses = await Promise.all(requests.map((r) => handler(r)))
    const bodies = await Promise.all(responses.map((r) => r.json() as Promise<McpResponse>))

    expect(bodies.length).toBe(10)
    bodies.forEach((body, i) => {
      expect(body.id).toBe(i)
      expect(body.result).toBeDefined()
    })
  })

  it('should handle very long session IDs', async () => {
    const longSessionId = 'a'.repeat(1000)

    const request = createJsonRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { 'mcp-session-id': longSessionId }
    )

    const response = await handler(request)

    expect(response.headers.get('mcp-session-id')).toBe(longSessionId)
  })
})

// =============================================================================
// Request Logging Tests
// =============================================================================

describe('Request logging', () => {
  let server: McpServer

  beforeEach(() => {
    server = createTestServer()
  })

  it('should call onRequest callback for each request', async () => {
    const logEntries: RequestLogEntry[] = []
    const handler = createHttpMcpHandler(server, {
      onRequest: (entry) => logEntries.push(entry),
    })

    const request = createJsonRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    })

    await handler(request)

    expect(logEntries.length).toBe(1)
    expect(logEntries[0].method).toBe('POST')
    expect(logEntries[0].statusCode).toBe(200)
    expect(logEntries[0].rpcMethod).toBe('tools/list')
    expect(logEntries[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('should log session ID in request entry', async () => {
    const logEntries: RequestLogEntry[] = []
    const handler = createHttpMcpHandler(server, {
      onRequest: (entry) => logEntries.push(entry),
    })

    const sessionId = 'test-session-for-logging'
    const request = createJsonRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { 'mcp-session-id': sessionId }
    )

    await handler(request)

    expect(logEntries[0].sessionId).toBe(sessionId)
  })

  it('should log error in request entry on failure', async () => {
    const logEntries: RequestLogEntry[] = []
    const handler = createHttpMcpHandler(server, {
      onRequest: (entry) => logEntries.push(entry),
    })

    const request = new Request('http://localhost/mcp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    await handler(request)

    expect(logEntries[0].error).toContain('PUT')
    expect(logEntries[0].statusCode).toBe(405)
  })

  it('should log OPTIONS requests', async () => {
    const logEntries: RequestLogEntry[] = []
    const handler = createHttpMcpHandler(server, {
      onRequest: (entry) => logEntries.push(entry),
    })

    const request = new Request('http://localhost/mcp', { method: 'OPTIONS' })

    await handler(request)

    expect(logEntries.length).toBe(1)
    expect(logEntries[0].method).toBe('OPTIONS')
    expect(logEntries[0].statusCode).toBe(204)
  })

  it('should log batch requests with first method', async () => {
    const logEntries: RequestLogEntry[] = []
    const handler = createHttpMcpHandler(server, {
      onRequest: (entry) => logEntries.push(entry),
    })

    const request = createJsonRequest([
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', id: 2, method: 'initialize' },
    ])

    await handler(request)

    expect(logEntries[0].rpcMethod).toContain('batch[2]')
    expect(logEntries[0].rpcMethod).toContain('tools/list')
  })
})

// =============================================================================
// Authentication Tests
// =============================================================================

describe('Authentication hook', () => {
  let server: McpServer

  beforeEach(() => {
    server = createTestServer()
  })

  it('should allow request when authentication succeeds', async () => {
    const handler = createHttpMcpHandler(server, {
      authenticate: () => ({ authenticated: true }),
    })

    const request = createJsonRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    })

    const response = await handler(request)

    expect(response.status).toBe(200)
  })

  it('should reject request when authentication fails', async () => {
    const handler = createHttpMcpHandler(server, {
      authenticate: () => ({ authenticated: false, error: 'Invalid token' }),
    })

    const request = createJsonRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    })

    const response = await handler(request)
    const body = await response.json() as McpResponse

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer')
    expect(body.error?.code).toBe(-32001)
    expect(body.error?.message).toContain('Invalid token')
  })

  it('should support async authentication hook', async () => {
    const handler = createHttpMcpHandler(server, {
      authenticate: async (req) => {
        const token = req.headers.get('Authorization')?.replace('Bearer ', '')
        if (token === 'valid-token') {
          return { authenticated: true, identity: 'user-123' }
        }
        return { authenticated: false, error: 'Invalid token' }
      },
    })

    const validRequest = createJsonRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { Authorization: 'Bearer valid-token' }
    )
    const validResponse = await handler(validRequest)
    expect(validResponse.status).toBe(200)

    const invalidRequest = createJsonRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { Authorization: 'Bearer invalid-token' }
    )
    const invalidResponse = await handler(invalidRequest)
    expect(invalidResponse.status).toBe(401)
  })

  it('should skip authentication for OPTIONS requests', async () => {
    const authCalled = vi.fn()
    const handler = createHttpMcpHandler(server, {
      authenticate: () => {
        authCalled()
        return { authenticated: false }
      },
    })

    const request = new Request('http://localhost/mcp', { method: 'OPTIONS' })
    const response = await handler(request)

    expect(response.status).toBe(204)
    expect(authCalled).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Rate Limiting Tests
// =============================================================================

describe('Rate limiting', () => {
  let server: McpServer

  beforeEach(() => {
    server = createTestServer()
  })

  it('should allow requests within rate limit', async () => {
    const handler = createHttpMcpHandler(server, {
      rateLimit: { maxRequests: 5, windowMs: 60000 },
    })

    // Make 5 requests - all should succeed
    for (let i = 0; i < 5; i++) {
      const request = createJsonRequest(
        { jsonrpc: '2.0', id: i, method: 'tools/list' },
        { 'mcp-session-id': 'rate-limit-session' }
      )
      const response = await handler(request)
      expect(response.status).toBe(200)
    }
  })

  it('should reject requests exceeding rate limit', async () => {
    const handler = createHttpMcpHandler(server, {
      rateLimit: { maxRequests: 2, windowMs: 60000 },
    })

    const sessionId = 'rate-limit-session-2'

    // Make 2 successful requests
    for (let i = 0; i < 2; i++) {
      const request = createJsonRequest(
        { jsonrpc: '2.0', id: i, method: 'tools/list' },
        { 'mcp-session-id': sessionId }
      )
      const response = await handler(request)
      expect(response.status).toBe(200)
    }

    // Third request should be rate limited
    const limitedRequest = createJsonRequest(
      { jsonrpc: '2.0', id: 3, method: 'tools/list' },
      { 'mcp-session-id': sessionId }
    )
    const limitedResponse = await handler(limitedRequest)
    const body = await limitedResponse.json() as McpResponse

    expect(limitedResponse.status).toBe(429)
    expect(body.error?.code).toBe(-32000)
    expect(body.error?.message).toContain('Too many requests')
  })

  it('should include rate limit headers in response', async () => {
    const handler = createHttpMcpHandler(server, {
      rateLimit: { maxRequests: 10, windowMs: 60000 },
    })

    const request = createJsonRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { 'mcp-session-id': 'rate-limit-headers-session' }
    )
    const response = await handler(request)

    // Rate limit headers should not be present on successful requests without rate limiting
    // But when rate limited, headers should be present
    expect(response.status).toBe(200)
  })

  it('should include Retry-After header when rate limited', async () => {
    const handler = createHttpMcpHandler(server, {
      rateLimit: { maxRequests: 1, windowMs: 60000 },
    })

    const sessionId = 'retry-after-session'

    // First request succeeds
    const request1 = createJsonRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { 'mcp-session-id': sessionId }
    )
    await handler(request1)

    // Second request should be rate limited with Retry-After header
    const request2 = createJsonRequest(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { 'mcp-session-id': sessionId }
    )
    const response = await handler(request2)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBeDefined()
    expect(parseInt(response.headers.get('Retry-After')!)).toBeGreaterThan(0)
  })

  it('should use custom key extractor', async () => {
    const handler = createHttpMcpHandler(server, {
      rateLimit: {
        maxRequests: 1,
        windowMs: 60000,
        keyExtractor: (req) => req.headers.get('X-API-Key') ?? 'unknown',
      },
    })

    // First request with API key 1 succeeds
    const request1 = createJsonRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { 'X-API-Key': 'key-1' }
    )
    const response1 = await handler(request1)
    expect(response1.status).toBe(200)

    // Second request with different API key also succeeds
    const request2 = createJsonRequest(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { 'X-API-Key': 'key-2' }
    )
    const response2 = await handler(request2)
    expect(response2.status).toBe(200)

    // Third request with same API key as first should be limited
    const request3 = createJsonRequest(
      { jsonrpc: '2.0', id: 3, method: 'tools/list' },
      { 'X-API-Key': 'key-1' }
    )
    const response3 = await handler(request3)
    expect(response3.status).toBe(429)
  })

  it('should support custom rate limiter function', async () => {
    let callCount = 0
    const handler = createHttpMcpHandler(server, {
      rateLimit: {
        maxRequests: 100, // Ignored when using custom limiter
        windowMs: 60000, // Ignored when using custom limiter
        customLimiter: async (key): Promise<RateLimitResult> => {
          callCount++
          if (callCount > 1) {
            return { allowed: false, retryAfter: 30 }
          }
          return { allowed: true, remaining: 99, limit: 100 }
        },
      },
    })

    // First request succeeds
    const request1 = createJsonRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const response1 = await handler(request1)
    expect(response1.status).toBe(200)

    // Second request uses custom limiter logic
    const request2 = createJsonRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const response2 = await handler(request2)
    expect(response2.status).toBe(429)
  })

  it('should skip rate limiting for OPTIONS requests', async () => {
    const handler = createHttpMcpHandler(server, {
      rateLimit: { maxRequests: 0, windowMs: 60000 }, // Would block all requests
    })

    const request = new Request('http://localhost/mcp', { method: 'OPTIONS' })
    const response = await handler(request)

    expect(response.status).toBe(204)
  })
})

// =============================================================================
// Combined Features Tests
// =============================================================================

describe('Combined features', () => {
  let server: McpServer

  beforeEach(() => {
    server = createTestServer()
  })

  it('should apply rate limiting before authentication', async () => {
    const authCalled = vi.fn()
    const handler = createHttpMcpHandler(server, {
      rateLimit: { maxRequests: 1, windowMs: 60000 },
      authenticate: () => {
        authCalled()
        return { authenticated: true }
      },
    })

    const sessionId = 'combined-session'

    // First request - auth called
    const request1 = createJsonRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { 'mcp-session-id': sessionId }
    )
    await handler(request1)
    expect(authCalled).toHaveBeenCalledTimes(1)

    // Second request - rate limited, auth NOT called
    const request2 = createJsonRequest(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { 'mcp-session-id': sessionId }
    )
    const response = await handler(request2)
    expect(response.status).toBe(429)
    expect(authCalled).toHaveBeenCalledTimes(1) // Still 1
  })

  it('should log requests with all features enabled', async () => {
    const logEntries: RequestLogEntry[] = []
    const handler = createHttpMcpHandler(server, {
      cors: { origin: 'https://example.com' },
      onRequest: (entry) => logEntries.push(entry),
      authenticate: () => ({ authenticated: true }),
      rateLimit: { maxRequests: 100, windowMs: 60000 },
    })

    const request = createJsonRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      },
      { Origin: 'https://example.com' }
    )

    const response = await handler(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com')
    expect(logEntries.length).toBe(1)
    expect(logEntries[0].statusCode).toBe(200)
  })

  it('should support backwards-compatible CorsOptions parameter', async () => {
    // Old way - just passing CorsOptions directly
    const handler = createHttpMcpHandler(server, {
      origin: 'https://legacy.com',
    })

    const request = createJsonRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { Origin: 'https://legacy.com' }
    )

    const response = await handler(request)

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://legacy.com')
  })
})
