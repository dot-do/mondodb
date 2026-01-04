/**
 * Command handler types for the wire protocol server
 */

import type { Document } from 'bson'

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

/** Error codes matching MongoDB */
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
} as const

/** Create a success response */
export function successResponse(data: Document = {}): Document {
  return { ok: 1, ...data }
}

/** Create an error response */
export function errorResponse(
  code: number,
  errmsg: string,
  codeName?: string
): Document {
  return {
    ok: 0,
    code,
    codeName: codeName || getCodeName(code),
    errmsg,
  }
}

/** Get the code name for an error code */
function getCodeName(code: number): string {
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
