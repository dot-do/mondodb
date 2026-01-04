/**
 * MCP SDK Adapter Error Types and Utilities
 *
 * Provides standardized error handling for SDK adapters following MCP protocol.
 * Includes:
 * - MCP-specific error codes (JSON-RPC 2.0 compliant)
 * - Typed error classes for different failure modes
 * - Error categorization for retry logic
 * - Utility functions for error handling
 */

// =============================================================================
// MCP Error Codes (JSON-RPC 2.0 + MCP Extensions)
// =============================================================================

/**
 * Standard JSON-RPC 2.0 error codes used by MCP
 */
export const McpErrorCode = {
  // Standard JSON-RPC 2.0 errors (-32700 to -32600)
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,

  // Server errors (-32099 to -32000)
  ServerError: -32000,
  ServerBusy: -32001,
  ServerShutdown: -32002,

  // MCP-specific errors (-32899 to -32800)
  ToolNotFound: -32800,
  ToolExecutionError: -32801,
  ResourceNotFound: -32802,
  ResourceAccessDenied: -32803,
  PromptNotFound: -32804,
  InvalidToolResponse: -32805,

  // Transport errors (-32999 to -32900)
  ConnectionError: -32900,
  ConnectionTimeout: -32901,
  ConnectionClosed: -32902,
  RateLimited: -32903,
  AuthenticationFailed: -32904,
} as const

export type McpErrorCodeType = (typeof McpErrorCode)[keyof typeof McpErrorCode]

// =============================================================================
// Error Data Interfaces
// =============================================================================

/**
 * Additional data included in MCP error responses
 */
export interface McpErrorData {
  /** Original error message if wrapping another error */
  originalError?: string
  /** Stack trace for debugging (only in development) */
  stack?: string
  /** Request ID that caused the error */
  requestId?: string | number
  /** Timestamp when error occurred */
  timestamp?: string
  /** Retry-after hint in milliseconds */
  retryAfter?: number
  /** Whether the error is transient and can be retried */
  retryable?: boolean
  /** Additional context-specific data */
  [key: string]: unknown
}

/**
 * JSON-RPC error response structure
 */
export interface McpErrorResponse {
  code: McpErrorCodeType
  message: string
  data?: McpErrorData
}

// =============================================================================
// Base MCP Error Class
// =============================================================================

/**
 * Base error class for all MCP-related errors
 *
 * Provides:
 * - MCP error code mapping
 * - Retryability information
 * - Serialization to JSON-RPC format
 *
 * @example
 * ```typescript
 * throw new McpError(
 *   McpErrorCode.ToolExecutionError,
 *   'Failed to execute search tool',
 *   { originalError: 'Database connection failed', retryable: true }
 * )
 * ```
 */
export class McpError extends Error {
  readonly code: McpErrorCodeType
  readonly data?: McpErrorData
  readonly retryable: boolean
  readonly timestamp: Date

  constructor(
    code: McpErrorCodeType,
    message: string,
    data?: McpErrorData
  ) {
    super(message)
    this.name = 'McpError'
    this.code = code
    this.data = data
    this.timestamp = new Date()
    this.retryable = data?.retryable ?? isTransientErrorCode(code)

    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, McpError)
    }
  }

  /**
   * Convert to JSON-RPC error response format
   */
  toResponse(): McpErrorResponse {
    return {
      code: this.code,
      message: this.message,
      data: {
        ...this.data,
        timestamp: this.timestamp.toISOString(),
        retryable: this.retryable,
      },
    }
  }

  /**
   * Create from a standard Error
   */
  static fromError(error: Error, code?: McpErrorCodeType): McpError {
    if (error instanceof McpError) {
      return error
    }

    const errorCode = code ?? classifyError(error)
    return new McpError(errorCode, error.message, {
      originalError: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      retryable: isTransientErrorCode(errorCode),
    })
  }
}

// =============================================================================
// Specific Error Classes
// =============================================================================

/**
 * Connection error - network or transport layer failures
 */
export class ConnectionError extends McpError {
  constructor(message: string, data?: McpErrorData) {
    super(McpErrorCode.ConnectionError, message, { ...data, retryable: true })
    this.name = 'ConnectionError'
  }
}

/**
 * Timeout error - operation exceeded time limit
 */
export class TimeoutError extends McpError {
  readonly timeoutMs: number

  constructor(message: string, timeoutMs: number, data?: McpErrorData) {
    super(McpErrorCode.ConnectionTimeout, message, { ...data, retryable: true })
    this.name = 'TimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/**
 * Rate limit error - too many requests
 */
export class RateLimitError extends McpError {
  readonly retryAfterMs: number

  constructor(message: string, retryAfterMs: number, data?: McpErrorData) {
    super(McpErrorCode.RateLimited, message, {
      ...data,
      retryable: true,
      retryAfter: retryAfterMs,
    })
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Authentication error - invalid or expired credentials
 */
export class AuthenticationError extends McpError {
  constructor(message: string, data?: McpErrorData) {
    super(McpErrorCode.AuthenticationFailed, message, { ...data, retryable: false })
    this.name = 'AuthenticationError'
  }
}

/**
 * Tool not found error - requested tool doesn't exist
 */
export class ToolNotFoundError extends McpError {
  readonly toolName: string

  constructor(toolName: string, data?: McpErrorData) {
    super(McpErrorCode.ToolNotFound, `Tool '${toolName}' not found`, {
      ...data,
      retryable: false,
    })
    this.name = 'ToolNotFoundError'
    this.toolName = toolName
  }
}

/**
 * Tool execution error - tool failed during execution
 */
export class ToolExecutionError extends McpError {
  readonly toolName: string

  constructor(toolName: string, message: string, data?: McpErrorData) {
    super(McpErrorCode.ToolExecutionError, message, data)
    this.name = 'ToolExecutionError'
    this.toolName = toolName
  }
}

/**
 * Invalid params error - request parameters are malformed
 */
export class InvalidParamsError extends McpError {
  constructor(message: string, data?: McpErrorData) {
    super(McpErrorCode.InvalidParams, message, { ...data, retryable: false })
    this.name = 'InvalidParamsError'
  }
}

// =============================================================================
// Error Classification Utilities
// =============================================================================

/**
 * Check if an error code represents a transient failure that can be retried
 */
export function isTransientErrorCode(code: McpErrorCodeType): boolean {
  const transientCodes: McpErrorCodeType[] = [
    McpErrorCode.ServerError,
    McpErrorCode.ServerBusy,
    McpErrorCode.ConnectionError,
    McpErrorCode.ConnectionTimeout,
    McpErrorCode.RateLimited,
  ]
  return transientCodes.includes(code)
}

/**
 * Classify a standard Error into an MCP error code
 */
export function classifyError(error: Error): McpErrorCodeType {
  const message = error.message.toLowerCase()
  const name = error.name.toLowerCase()

  // Network/Connection errors
  if (
    name.includes('fetch') ||
    name.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('network') ||
    message.includes('socket')
  ) {
    return McpErrorCode.ConnectionError
  }

  // Timeout errors
  if (
    name.includes('timeout') ||
    message.includes('timeout') ||
    message.includes('etimedout') ||
    message.includes('timed out')
  ) {
    return McpErrorCode.ConnectionTimeout
  }

  // Rate limit errors
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  ) {
    return McpErrorCode.RateLimited
  }

  // Authentication errors
  if (
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('401') ||
    message.includes('403')
  ) {
    return McpErrorCode.AuthenticationFailed
  }

  // Parse errors
  if (
    name.includes('syntaxerror') ||
    message.includes('json') ||
    message.includes('parse')
  ) {
    return McpErrorCode.ParseError
  }

  // Default to internal error
  return McpErrorCode.InternalError
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof McpError) {
    return error.retryable
  }
  return isTransientErrorCode(classifyError(error))
}

/**
 * Get retry delay from error (if rate limited) or use default
 */
export function getRetryDelay(error: Error, defaultDelayMs: number = 1000): number {
  if (error instanceof RateLimitError) {
    return error.retryAfterMs
  }
  if (error instanceof McpError && error.data?.retryAfter) {
    return error.data.retryAfter
  }
  return defaultDelayMs
}

// =============================================================================
// Error Wrapping Utilities
// =============================================================================

/**
 * Wrap an async function with MCP error handling
 *
 * @example
 * ```typescript
 * const safeFetch = wrapWithMcpError(async () => {
 *   const response = await fetch(url)
 *   return response.json()
 * })
 * ```
 */
export function wrapWithMcpError<T>(
  fn: () => Promise<T>,
  defaultCode?: McpErrorCodeType
): Promise<T> {
  return fn().catch((error) => {
    throw McpError.fromError(error, defaultCode)
  })
}

/**
 * Create a JSON-RPC error response from an Error
 */
export function createErrorResponse(
  error: Error,
  requestId?: string | number
): McpErrorResponse {
  const mcpError = McpError.fromError(error)
  const response = mcpError.toResponse()
  if (requestId !== undefined) {
    response.data = { ...response.data, requestId }
  }
  return response
}
