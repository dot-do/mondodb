/**
 * Consolidated RPC Types
 *
 * This module contains all shared RPC-related type definitions used across:
 * - src/rpc/rpc-target.ts
 * - src/rpc/rpc-client.ts
 * - src/rpc/endpoint.ts
 * - src/rpc/index.ts
 * - src/wire/backend/workers-proxy.ts
 */

// ============================================================================
// Cloudflare Durable Object Types
// ============================================================================

/**
 * Durable Object namespace interface
 */
export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

/**
 * Durable Object ID interface
 */
export interface DurableObjectId {
  toString(): string
}

/**
 * Durable Object stub interface
 */
export interface DurableObjectStub {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>
}

// ============================================================================
// Environment Types
// ============================================================================

/**
 * Base Mondo environment bindings interface
 */
export interface MondoEnv {
  MONDO_DATABASE: DurableObjectNamespace
  /** Optional Worker Loader for $function support (closed beta) */
  LOADER?: WorkerLoader
  /** Optional auth token for RPC endpoint */
  MONDO_AUTH_TOKEN?: string
}

// ============================================================================
// Worker Loader Types (for $function operator)
// ============================================================================

/**
 * Worker Loader interface for dynamic worker creation
 * (Closed beta feature for $function operator support)
 */
export interface WorkerLoader {
  get(id: string, getCode: () => Promise<WorkerCode>): WorkerStub
}

/**
 * Worker code specification for dynamic workers
 */
export interface WorkerCode {
  compatibilityDate: string
  compatibilityFlags?: string[]
  mainModule: string
  modules: Record<string, string | { js: string } | { text: string }>
  globalOutbound?: null // null blocks all network access
  env?: Record<string, unknown>
}

/**
 * Worker stub interface for dynamic workers
 */
export interface WorkerStub {
  fetch?(request: Request): Promise<Response>
  getEntrypoint?(name?: string): WorkerEntrypoint
}

/**
 * Worker entrypoint interface
 */
export interface WorkerEntrypoint {
  fetch(request: Request): Promise<Response>
}

// ============================================================================
// JSON-RPC Style Request/Response Types
// ============================================================================

/**
 * RPC request structure for Workers RPC (capnweb-style)
 * Used by rpc-target.ts and rpc-client.ts
 */
export interface RpcRequest {
  id?: string
  method: string
  params: unknown[]
}

/**
 * RPC response structure for Workers RPC
 */
export interface RpcResponse {
  id?: string
  result?: unknown
  error?: string
}

/**
 * Batch response structure
 */
export interface BatchResponse {
  results: RpcResponse[]
}

// ============================================================================
// HTTP RPC Endpoint Request/Response Types
// ============================================================================

/**
 * RPC request structure for HTTP endpoint
 * Used by endpoint.ts and workers-proxy.ts
 */
export interface HttpRpcRequest {
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
 * HTTP RPC success response
 */
export interface HttpRpcSuccessResponse {
  ok: 1
  result: unknown
}

/**
 * HTTP RPC error response
 */
export interface HttpRpcErrorResponse {
  ok: 0
  error: string
  code: number
  codeName?: string
}

/**
 * HTTP RPC response (union type)
 */
export type HttpRpcResponse = HttpRpcSuccessResponse | HttpRpcErrorResponse

// ============================================================================
// Legacy RPC Types (for src/rpc/index.ts message-based protocol)
// ============================================================================

/**
 * RPC message types for internal operations
 */
export enum MessageType {
  // Document operations
  INSERT_ONE = 'insertOne',
  INSERT_MANY = 'insertMany',
  FIND_ONE = 'findOne',
  FIND = 'find',
  UPDATE_ONE = 'updateOne',
  UPDATE_MANY = 'updateMany',
  DELETE_ONE = 'deleteOne',
  DELETE_MANY = 'deleteMany',

  // Aggregation
  AGGREGATE = 'aggregate',
  COUNT = 'count',
  DISTINCT = 'distinct',

  // Index operations
  CREATE_INDEX = 'createIndex',
  DROP_INDEX = 'dropIndex',
  LIST_INDEXES = 'listIndexes',

  // Collection operations
  CREATE_COLLECTION = 'createCollection',
  DROP_COLLECTION = 'dropCollection',
  LIST_COLLECTIONS = 'listCollections',

  // Database operations
  STATS = 'stats',
  HEALTH = 'health',
}

/**
 * Legacy RPC request interface (message-based)
 */
export interface LegacyRpcRequest {
  type: MessageType
  collection?: string
  payload: unknown
}

/**
 * Legacy RPC response interface
 */
export interface LegacyRpcResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

// ============================================================================
// Database Reference Types
// ============================================================================

/**
 * Database reference returned by db() method
 */
export interface DatabaseRef {
  name: string
  stub: DurableObjectStub
}

/**
 * Collection reference returned by collection() method
 */
export interface CollectionRef {
  dbName: string
  collectionName: string
  stub: DurableObjectStub
}

// ============================================================================
// Batched Executor Types
// ============================================================================

/**
 * Batched executor options
 */
export interface BatchedExecutorOptions {
  maxBatchSize?: number
  flushInterval?: number
}

/**
 * Pipelined operation reference
 */
export interface PipelineOp {
  id: string
  method: string
  params: unknown[]
  dependencies: string[]
}

// ============================================================================
// RPC Client Types
// ============================================================================

/**
 * RPC client options
 */
export interface RpcClientOptions {
  /** Enable automatic reconnection */
  autoReconnect?: boolean
  /** Maximum retry attempts */
  maxRetries?: number
  /** Reconnect interval in milliseconds */
  reconnectInterval?: number
  /** Enable request deduplication */
  deduplicate?: boolean
  /** Deduplication TTL in milliseconds */
  deduplicationTtl?: number
  /** Request timeout in milliseconds */
  timeout?: number
}

/**
 * Options for request deduplicator
 */
export interface DeduplicatorOptions {
  ttl?: number
}

/**
 * Event handler type
 */
export type EventHandler<T = unknown> = (event: T) => void

/**
 * Reconnect event data
 */
export interface ReconnectEvent {
  attempt: number
  lastError?: Error
}

// ============================================================================
// RPC Handler Types
// ============================================================================

/**
 * RPC Handler interface
 */
export interface RpcHandler {
  fetch(request: Request): Promise<Response>
}

// ============================================================================
// MongoDB Error Codes
// ============================================================================

/**
 * MongoDB-compatible error codes
 */
export const ErrorCode = {
  OK: 0,
  INTERNAL_ERROR: 1,
  BAD_VALUE: 2,
  NO_SUCH_KEY: 4,
  GRAPH_CONTAINS_CYCLE: 5,
  HOST_UNREACHABLE: 6,
  HOST_NOT_FOUND: 7,
  UNKNOWN_ERROR: 8,
  FAILED_TO_PARSE: 9,
  CANNOT_MUTATE_OBJECT: 10,
  USER_NOT_FOUND: 11,
  UNSUPPORTED_FORMAT: 12,
  UNAUTHORIZED: 13,
  TYPE_MISMATCH: 14,
  OVERFLOW: 15,
  INVALID_LENGTH: 16,
  PROTOCOL_ERROR: 17,
  AUTHENTICATION_FAILED: 18,
  CANNOT_REUSE_OBJECT: 19,
  ILLEGAL_OPERATION: 20,
  EMPTY_ARRAY_OPERATION: 21,
  INVALID_BSON: 22,
  ALREADY_INITIALIZED: 23,
  LOCK_TIMEOUT: 24,
  REMOTE_VALIDATION_ERROR: 25,
  NAMESPACE_NOT_FOUND: 26,
  INDEX_NOT_FOUND: 27,
  PATH_NOT_VIABLE: 28,
  NON_EXISTENT_PATH: 29,
  INVALID_PATH: 30,
  ROLE_NOT_FOUND: 31,
  ROLES_NOT_RELATED: 32,
  PRIVILEGE_NOT_FOUND: 33,
  CANNOT_BACKFILL_ARRAY: 34,
  COMMAND_NOT_FOUND: 59,
  DATABASE_NOT_FOUND: 60,
  LOCATION_ERROR: 16755,
  DUPLICATE_KEY: 11000,
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]

/**
 * Get the code name for an error code
 */
export function getErrorCodeName(code: number): string {
  for (const [name, value] of Object.entries(ErrorCode)) {
    if (value === code) {
      return name
        .split('_')
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join('')
    }
  }
  return 'UnknownError'
}

// ============================================================================
// Response Helper Functions
// ============================================================================

/**
 * Create a success response (Document format for wire protocol)
 */
export function successResponse(data: Record<string, unknown> = {}): Record<string, unknown> {
  return { ok: 1, ...data }
}

/**
 * Create an error response (Document format for wire protocol)
 */
export function errorResponse(
  code: number,
  errmsg: string,
  codeName?: string
): Record<string, unknown> {
  return {
    ok: 0,
    code,
    codeName: codeName || getErrorCodeName(code),
    errmsg,
  }
}

/**
 * Create a legacy success response
 */
export function legacySuccessResponse<T>(data: T): LegacyRpcResponse<T> {
  return { success: true, data }
}

/**
 * Create a legacy error response
 */
export function legacyErrorResponse(code: string, message: string): LegacyRpcResponse<never> {
  return { success: false, error: { code, message } }
}
