/**
 * HTTP Transport for MCP Server
 *
 * Provides HTTP/SSE transport for MCP protocol:
 * - POST for JSON-RPC requests
 * - GET for SSE streams
 * - OPTIONS for CORS preflight
 * - Session management via mcp-session-id header
 * - Request logging callback
 * - Authentication hook
 * - Rate limiting
 */

import type { McpServer } from '../server'
import type { McpRequest, McpResponse } from '../types'

// =============================================================================
// Types
// =============================================================================

/**
 * CORS configuration options
 */
export interface CorsOptions {
  /** Allowed origins (default: '*') */
  origin?: string | string[]
  /** Allowed methods (default: 'GET, POST, OPTIONS') */
  methods?: string
  /** Allowed headers (default: 'Content-Type, mcp-session-id') */
  allowedHeaders?: string
  /** Exposed headers (default: 'mcp-session-id') */
  exposedHeaders?: string
  /** Max age for preflight cache in seconds (default: 86400) */
  maxAge?: number
  /** Allow credentials (default: false) */
  credentials?: boolean
}

/**
 * Request log entry for logging callback
 */
export interface RequestLogEntry {
  /** Timestamp of the request */
  timestamp: Date
  /** HTTP method */
  method: string
  /** Request URL */
  url: string
  /** Session ID if available */
  sessionId?: string
  /** Response status code */
  statusCode: number
  /** Duration in milliseconds */
  durationMs: number
  /** JSON-RPC method if applicable */
  rpcMethod?: string
  /** Error message if request failed */
  error?: string
}

/**
 * Request logging callback function
 */
export type RequestLogCallback = (entry: RequestLogEntry) => void

/**
 * Authentication result
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  authenticated: boolean
  /** Error message if authentication failed */
  error?: string
  /** Optional user/client identifier */
  identity?: string
}

/**
 * Authentication hook function
 */
export type AuthHook = (request: Request) => Promise<AuthResult> | AuthResult

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean
  /** Retry-After header value in seconds (if rate limited) */
  retryAfter?: number
  /** Remaining requests in current window */
  remaining?: number
  /** Total limit for the window */
  limit?: number
  /** When the rate limit window resets (Unix timestamp) */
  resetAt?: number
}

/**
 * Rate limiting options
 */
export interface RateLimitOptions {
  /** Maximum requests per window */
  maxRequests: number
  /** Window size in milliseconds */
  windowMs: number
  /** Key extractor function (default: IP-based or session-based) */
  keyExtractor?: (request: Request, sessionId?: string) => string
  /** Custom rate limit check function (overrides built-in limiter) */
  customLimiter?: (key: string, request: Request) => Promise<RateLimitResult> | RateLimitResult
}

/**
 * HTTP transport options
 */
export interface HttpTransportOptions {
  /** CORS configuration */
  cors?: CorsOptions
  /** Request logging callback */
  onRequest?: RequestLogCallback
  /** Authentication hook */
  authenticate?: AuthHook
  /** Rate limiting configuration */
  rateLimit?: RateLimitOptions
}

/**
 * HTTP handler function type
 */
export type HttpHandler = (request: Request) => Promise<Response>

/**
 * SSE session for managing server-sent events
 */
interface SseSession {
  controller: ReadableStreamDefaultController<Uint8Array>
  encoder: TextEncoder
  lastEventId: number
}

/**
 * Session storage for managing MCP sessions
 */
interface SessionStore {
  /** SSE sessions for real-time streaming */
  sseClients: Map<string, SseSession>
  /** Last activity timestamp for session cleanup */
  lastActivity: Map<string, number>
}

// =============================================================================
// Constants
// =============================================================================

const SESSION_HEADER = 'mcp-session-id'
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

const DEFAULT_CORS: Required<CorsOptions> = {
  origin: '*',
  methods: 'GET, POST, OPTIONS, DELETE',
  allowedHeaders: 'Content-Type, mcp-session-id, Last-Event-ID, Authorization',
  exposedHeaders: 'mcp-session-id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset',
  maxAge: 86400,
  credentials: false,
}

/**
 * Rate limit entry for tracking request counts
 */
interface RateLimitEntry {
  count: number
  resetAt: number
}

/**
 * Rate limiter storage
 */
interface RateLimiterStore {
  entries: Map<string, RateLimitEntry>
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Build CORS headers based on options and request
 */
function buildCorsHeaders(options: Required<CorsOptions>, request: Request | null): Record<string, string> {
  const headers: Record<string, string> = {}
  const requestOrigin = request?.headers.get('Origin') ?? null

  // Handle origin
  if (options.origin === '*') {
    headers['Access-Control-Allow-Origin'] = '*'
  } else if (Array.isArray(options.origin)) {
    if (requestOrigin && options.origin.includes(requestOrigin)) {
      headers['Access-Control-Allow-Origin'] = requestOrigin
      headers['Vary'] = 'Origin'
    }
  } else if (requestOrigin === options.origin) {
    headers['Access-Control-Allow-Origin'] = options.origin
  }

  headers['Access-Control-Allow-Methods'] = options.methods
  headers['Access-Control-Allow-Headers'] = options.allowedHeaders
  headers['Access-Control-Expose-Headers'] = options.exposedHeaders
  headers['Access-Control-Max-Age'] = String(options.maxAge)

  if (options.credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true'
  }

  return headers
}

/**
 * Create a JSON response with CORS headers
 */
function jsonResponse(
  data: unknown,
  status: number,
  corsHeaders: Record<string, string>,
  sessionId?: string
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...corsHeaders,
  }
  if (sessionId) {
    headers[SESSION_HEADER] = sessionId
  }
  return new Response(JSON.stringify(data), { status, headers })
}

/**
 * Create an error response
 */
function errorResponse(
  code: number,
  message: string,
  httpStatus: number,
  corsHeaders: Record<string, string>,
  id?: string | number | null
): Response {
  const response: McpResponse = {
    jsonrpc: '2.0',
    id: id ?? null as unknown as string,
    error: { code, message },
  }
  return jsonResponse(response, httpStatus, corsHeaders)
}

/**
 * Default key extractor for rate limiting (uses session ID or falls back to IP-like identifier)
 */
function defaultKeyExtractor(request: Request, sessionId?: string): string {
  if (sessionId) {
    return `session:${sessionId}`
  }
  // Try to get client IP from common headers
  const forwarded = request.headers.get('X-Forwarded-For')
  if (forwarded) {
    return `ip:${forwarded.split(',')[0].trim()}`
  }
  const realIp = request.headers.get('X-Real-IP')
  if (realIp) {
    return `ip:${realIp}`
  }
  // Fallback to a generic key
  return 'unknown'
}

/**
 * Check rate limit for a request
 */
function checkRateLimit(
  key: string,
  options: RateLimitOptions,
  store: RateLimiterStore
): RateLimitResult {
  const now = Date.now()
  const entry = store.entries.get(key)

  // Clean up expired entry
  if (entry && entry.resetAt <= now) {
    store.entries.delete(key)
  }

  const currentEntry = store.entries.get(key)

  if (!currentEntry) {
    // First request in window
    const resetAt = now + options.windowMs
    store.entries.set(key, { count: 1, resetAt })
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      limit: options.maxRequests,
      resetAt,
    }
  }

  if (currentEntry.count >= options.maxRequests) {
    // Rate limited
    const retryAfter = Math.ceil((currentEntry.resetAt - now) / 1000)
    return {
      allowed: false,
      retryAfter,
      remaining: 0,
      limit: options.maxRequests,
      resetAt: currentEntry.resetAt,
    }
  }

  // Increment count
  currentEntry.count++
  return {
    allowed: true,
    remaining: options.maxRequests - currentEntry.count,
    limit: options.maxRequests,
    resetAt: currentEntry.resetAt,
  }
}

/**
 * Add rate limit headers to response
 */
function addRateLimitHeaders(headers: Record<string, string>, result: RateLimitResult): void {
  if (result.limit !== undefined) {
    headers['X-RateLimit-Limit'] = String(result.limit)
  }
  if (result.remaining !== undefined) {
    headers['X-RateLimit-Remaining'] = String(result.remaining)
  }
  if (result.resetAt !== undefined) {
    headers['X-RateLimit-Reset'] = String(Math.ceil(result.resetAt / 1000))
  }
  if (result.retryAfter !== undefined) {
    headers['Retry-After'] = String(result.retryAfter)
  }
}

/**
 * Create a rate limited error response
 */
function rateLimitedResponse(
  corsHeaders: Record<string, string>,
  rateLimitResult: RateLimitResult
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...corsHeaders,
  }
  addRateLimitHeaders(headers, rateLimitResult)

  const response: McpResponse = {
    jsonrpc: '2.0',
    id: null as unknown as string,
    error: { code: -32000, message: 'Too many requests. Please retry later.' },
  }

  return new Response(JSON.stringify(response), { status: 429, headers })
}

/**
 * Create an authentication error response
 */
function authErrorResponse(
  message: string,
  corsHeaders: Record<string, string>
): Response {
  const response: McpResponse = {
    jsonrpc: '2.0',
    id: null as unknown as string,
    error: { code: -32001, message: `Authentication failed: ${message}` },
  }
  return new Response(JSON.stringify(response), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer',
      ...corsHeaders,
    },
  })
}

// =============================================================================
// Main Factory Function
// =============================================================================

/**
 * Create an HTTP handler for MCP server
 *
 * @param server - MCP server instance
 * @param corsOptions - Optional CORS configuration (deprecated, use options.cors instead)
 * @returns HTTP handler function
 *
 * @example
 * ```typescript
 * const server = createMcpServer({ dbAccess })
 * const handler = createHttpMcpHandler(server)
 *
 * // In Cloudflare Worker
 * export default {
 *   fetch: handler
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With full options
 * const handler = createHttpMcpHandler(server, {
 *   cors: { origin: 'https://example.com' },
 *   onRequest: (entry) => console.log(`${entry.method} ${entry.url} - ${entry.statusCode}`),
 *   authenticate: async (req) => {
 *     const token = req.headers.get('Authorization')?.replace('Bearer ', '')
 *     if (!token) return { authenticated: false, error: 'Missing token' }
 *     return { authenticated: true, identity: 'user-123' }
 *   },
 *   rateLimit: { maxRequests: 100, windowMs: 60000 }
 * })
 * ```
 */
/**
 * Check if the options object is HttpTransportOptions
 */
function isHttpTransportOptions(obj: unknown): obj is HttpTransportOptions {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return 'cors' in o || 'onRequest' in o || 'authenticate' in o || 'rateLimit' in o
}

export function createHttpMcpHandler(
  server: McpServer,
  corsOptionsOrOptions?: CorsOptions | HttpTransportOptions
): HttpHandler {
  // Support both old CorsOptions and new HttpTransportOptions for backwards compatibility
  const options: HttpTransportOptions = isHttpTransportOptions(corsOptionsOrOptions)
    ? corsOptionsOrOptions
    : (corsOptionsOrOptions ? { cors: corsOptionsOrOptions } : {})

  const cors: Required<CorsOptions> = { ...DEFAULT_CORS, ...options.cors }
  const sessions: SessionStore = {
    sseClients: new Map(),
    lastActivity: new Map(),
  }
  const rateLimiter: RateLimiterStore = {
    entries: new Map(),
  }

  // Cleanup old sessions and rate limit entries periodically
  const cleanupSessions = () => {
    const now = Date.now()
    Array.from(sessions.lastActivity.entries()).forEach(([sessionId, lastActive]) => {
      if (now - lastActive > SESSION_TIMEOUT_MS) {
        const sseSession = sessions.sseClients.get(sessionId)
        if (sseSession) {
          try {
            sseSession.controller.close()
          } catch {
            // Controller may already be closed
          }
        }
        sessions.sseClients.delete(sessionId)
        sessions.lastActivity.delete(sessionId)
      }
    })
    // Clean up expired rate limit entries
    Array.from(rateLimiter.entries.entries()).forEach(([key, entry]) => {
      if (entry.resetAt <= now) {
        rateLimiter.entries.delete(key)
      }
    })
  }

  return async (request: Request): Promise<Response> => {
    const startTime = Date.now()
    const corsHeaders = buildCorsHeaders(cors, request)
    const method = request.method.toUpperCase()
    let sessionId: string | undefined
    let rpcMethod: string | undefined
    let errorMessage: string | undefined

    // Helper to log request
    const logRequest = (response: Response): Response => {
      if (options.onRequest) {
        const logEntry: RequestLogEntry = {
          timestamp: new Date(startTime),
          method,
          url: request.url,
          statusCode: response.status,
          durationMs: Date.now() - startTime,
        }
        if (sessionId) {
          logEntry.sessionId = sessionId
        }
        if (rpcMethod) {
          logEntry.rpcMethod = rpcMethod
        }
        if (errorMessage) {
          logEntry.error = errorMessage
        }
        options.onRequest(logEntry)
      }
      return response
    }

    try {
      // Cleanup old sessions on each request
      cleanupSessions()

      // Handle CORS preflight (no auth or rate limit for preflight)
      if (method === 'OPTIONS') {
        return logRequest(new Response(null, {
          status: 204,
          headers: corsHeaders,
        }))
      }

      // Get or create session ID (needed for rate limiting key)
      sessionId = request.headers.get(SESSION_HEADER) ?? undefined
      const isNewSession = !sessionId
      if (isNewSession) {
        sessionId = generateSessionId()
      }

      // Rate limiting check (before authentication to prevent auth bypass)
      if (options.rateLimit) {
        const keyExtractor = options.rateLimit.keyExtractor ?? defaultKeyExtractor
        const key = keyExtractor(request, sessionId)

        let rateLimitResult: RateLimitResult
        if (options.rateLimit.customLimiter) {
          rateLimitResult = await options.rateLimit.customLimiter(key, request)
        } else {
          rateLimitResult = checkRateLimit(key, options.rateLimit, rateLimiter)
        }

        if (!rateLimitResult.allowed) {
          errorMessage = 'Rate limited'
          return logRequest(rateLimitedResponse(corsHeaders, rateLimitResult))
        }
      }

      // Authentication check
      if (options.authenticate) {
        const authResult = await options.authenticate(request)
        if (!authResult.authenticated) {
          errorMessage = authResult.error ?? 'Authentication failed'
          return logRequest(authErrorResponse(errorMessage, corsHeaders))
        }
      }

      sessions.lastActivity.set(sessionId!, Date.now())

      // Handle GET for SSE streams
      if (method === 'GET') {
        return logRequest(await handleSseRequest(request, sessionId!, sessions, corsHeaders))
      }

      // Handle POST for JSON-RPC
      if (method === 'POST') {
        const response = await handleJsonRpcRequest(request, server, sessionId!, sessions, corsHeaders, (m) => {
          rpcMethod = m
        })
        return logRequest(response)
      }

      // Handle DELETE for session termination
      if (method === 'DELETE') {
        return logRequest(await handleDeleteSession(sessionId!, sessions, corsHeaders))
      }

      // Method not allowed
      errorMessage = `Method ${method} not allowed`
      return logRequest(errorResponse(-32600, errorMessage, 405, corsHeaders))
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Internal error'
      return logRequest(errorResponse(-32603, errorMessage, 500, corsHeaders))
    }
  }
}

// =============================================================================
// Request Handlers
// =============================================================================

/**
 * Handle SSE stream request
 */
async function handleSseRequest(
  request: Request,
  sessionId: string,
  sessions: SessionStore,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const encoder = new TextEncoder()

  // Check Accept header
  const accept = request.headers.get('Accept')
  if (!accept?.includes('text/event-stream')) {
    return new Response(JSON.stringify({ error: 'Accept header must include text/event-stream' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // Create SSE stream
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Store session
      const sseSession: SseSession = {
        controller,
        encoder,
        lastEventId: 0,
      }
      sessions.sseClients.set(sessionId, sseSession)

      // Send initial connection event
      const event = formatSseEvent('endpoint', JSON.stringify({
        type: 'connection',
        sessionId,
        timestamp: new Date().toISOString(),
      }), ++sseSession.lastEventId)
      controller.enqueue(encoder.encode(event))
    },
    cancel() {
      sessions.sseClients.delete(sessionId)
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      [SESSION_HEADER]: sessionId,
      ...corsHeaders,
    },
  })
}

/**
 * Handle JSON-RPC POST request
 */
async function handleJsonRpcRequest(
  request: Request,
  server: McpServer,
  sessionId: string,
  sessions: SessionStore,
  corsHeaders: Record<string, string>,
  onRpcMethod?: (method: string) => void
): Promise<Response> {
  // Check Content-Type
  const contentType = request.headers.get('Content-Type')
  if (!contentType?.includes('application/json')) {
    return errorResponse(-32700, 'Content-Type must be application/json', 400, corsHeaders)
  }

  // Parse JSON body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(-32700, 'Parse error: Invalid JSON', 400, corsHeaders)
  }

  // Handle batch requests
  if (Array.isArray(body)) {
    // Report first method for logging
    if (onRpcMethod && body.length > 0 && body[0]?.method) {
      onRpcMethod(`batch[${body.length}]:${body[0].method}`)
    }
    const responses = await Promise.all(
      body.map((req) => processRequest(req, server, sessionId, sessions))
    )
    return jsonResponse(responses, 200, corsHeaders, sessionId)
  }

  // Handle single request
  const mcpRequest = body as McpRequest
  if (onRpcMethod && mcpRequest.method) {
    onRpcMethod(mcpRequest.method)
  }
  const response = await processRequest(mcpRequest, server, sessionId, sessions)
  return jsonResponse(response, 200, corsHeaders, sessionId)
}

/**
 * Handle DELETE request for session termination
 */
async function handleDeleteSession(
  sessionId: string,
  sessions: SessionStore,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const sseSession = sessions.sseClients.get(sessionId)
  if (sseSession) {
    try {
      sseSession.controller.close()
    } catch {
      // Controller may already be closed
    }
    sessions.sseClients.delete(sessionId)
  }
  sessions.lastActivity.delete(sessionId)

  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  })
}

/**
 * Process a single JSON-RPC request
 */
async function processRequest(
  request: McpRequest,
  server: McpServer,
  sessionId: string,
  sessions: SessionStore
): Promise<McpResponse> {
  // Validate request structure
  if (!request || typeof request !== 'object') {
    return {
      jsonrpc: '2.0',
      id: null as unknown as string,
      error: { code: -32600, message: 'Invalid request' },
    }
  }

  // Delegate to MCP server
  const response = await server.handleRequest(request)

  // If there's an SSE client, send the response as an event
  const sseSession = sessions.sseClients.get(sessionId)
  if (sseSession) {
    try {
      const event = formatSseEvent('message', JSON.stringify(response), ++sseSession.lastEventId)
      sseSession.controller.enqueue(sseSession.encoder.encode(event))
    } catch {
      // SSE connection may be closed
      sessions.sseClients.delete(sessionId)
    }
  }

  return response
}

/**
 * Format an SSE event
 */
function formatSseEvent(event: string, data: string, id: number): string {
  return `event: ${event}\nid: ${id}\ndata: ${data}\n\n`
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Send an event to a specific SSE session
 */
export function sendSseEvent(
  sessionId: string,
  sessions: SessionStore,
  event: string,
  data: unknown
): boolean {
  const sseSession = sessions.sseClients.get(sessionId)
  if (!sseSession) {
    return false
  }

  try {
    const formattedEvent = formatSseEvent(event, JSON.stringify(data), ++sseSession.lastEventId)
    sseSession.controller.enqueue(sseSession.encoder.encode(formattedEvent))
    return true
  } catch {
    sessions.sseClients.delete(sessionId)
    return false
  }
}

/**
 * Create a simple request handler that wraps the MCP handler
 * for use with standard HTTP servers
 */
export function createStandardHandler(
  server: McpServer,
  corsOptions?: CorsOptions
): HttpHandler {
  return createHttpMcpHandler(server, corsOptions)
}
