/**
 * RPC layer for mondodb
 *
 * Uses capnweb for efficient serialization between client and Durable Object
 */

/**
 * RPC message types
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
 * RPC request interface
 */
export interface RPCRequest {
  type: MessageType
  collection?: string
  payload: unknown
}

/**
 * RPC response interface
 */
export interface RPCResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

/**
 * Serialize an RPC request
 */
export function serializeRequest(request: RPCRequest): string {
  return JSON.stringify(request)
}

/**
 * Deserialize an RPC request
 */
export function deserializeRequest(data: string): RPCRequest {
  return JSON.parse(data) as RPCRequest
}

/**
 * Serialize an RPC response
 */
export function serializeResponse<T>(response: RPCResponse<T>): string {
  return JSON.stringify(response)
}

/**
 * Deserialize an RPC response
 */
export function deserializeResponse<T>(data: string): RPCResponse<T> {
  return JSON.parse(data) as RPCResponse<T>
}

/**
 * Create a success response
 */
export function successResponse<T>(data: T): RPCResponse<T> {
  return { success: true, data }
}

/**
 * Create an error response
 */
export function errorResponse(code: string, message: string): RPCResponse<never> {
  return { success: false, error: { code, message } }
}
