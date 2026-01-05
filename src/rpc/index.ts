/**
 * RPC layer for mongo.do
 *
 * Uses capnweb for efficient serialization between client and Durable Object
 */

import {
  MessageType,
  type LegacyRpcRequest,
  type LegacyRpcResponse,
  legacySuccessResponse,
  legacyErrorResponse,
} from '../types/rpc'

// Re-export types with legacy names for backward compatibility
export { MessageType }
export type RPCRequest = LegacyRpcRequest
export type RPCResponse<T = unknown> = LegacyRpcResponse<T>

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
  return legacySuccessResponse(data)
}

/**
 * Create an error response
 */
export function errorResponse(code: string, message: string): RPCResponse<never> {
  return legacyErrorResponse(code, message)
}
