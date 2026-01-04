/**
 * Command handler types for the wire protocol server
 */

import type { Document } from 'bson'
import type { ConnectionState } from '../types.js'
import {
  ErrorCode,
  getErrorCodeName,
  successResponse as rpcSuccessResponse,
  errorResponse as rpcErrorResponse,
} from '../../types/rpc.js'

// Re-export ErrorCode from consolidated types
export { ErrorCode }

/** Authentication configuration */
export interface AuthConfig {
  /** Enable authentication */
  enabled: boolean
  /** Username for SCRAM-SHA-256 authentication */
  username: string
  /** Password for SCRAM-SHA-256 authentication */
  password: string
}

/** Context passed to command handlers */
export interface CommandContext {
  /** Database name from $db field */
  db: string
  /** Connection ID */
  connectionId: number
  /** Request ID for logging/tracing */
  requestId: number
  /** Document sequences from OP_MSG kind=1 sections */
  documentSequences: Map<string, Document[]>
  /** SECURITY: Authentication configuration (when auth is enabled) */
  auth?: AuthConfig
  /** Connection state (for updating authentication status) */
  connection?: ConnectionState
}

/** Result from a command handler */
export interface CommandResult {
  /** Response document */
  response: Document
  /** Additional document sequences to include in response (for cursors, etc) */
  documentSequences?: Array<{ identifier: string; documents: Document[] }>
}

/** Command handler interface */
export interface CommandHandler {
  /** Execute the command */
  execute(command: Document, context: CommandContext): Promise<CommandResult>
}

/** Create a success response */
export function successResponse(data: Document = {}): Document {
  return rpcSuccessResponse(data) as Document
}

/** Create an error response */
export function errorResponse(
  code: number,
  errmsg: string,
  codeName?: string
): Document {
  return rpcErrorResponse(code, errmsg, codeName) as Document
}
