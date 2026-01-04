/**
 * MCP Stdio Transport
 *
 * Provides a stdio-based transport for MCP (Model Context Protocol) communication.
 * Reads newline-delimited JSON-RPC messages from stdin and writes responses to stdout.
 *
 * Features:
 * - Buffered writing for improved performance
 * - Graceful shutdown with pending message handling
 * - Debug mode for development and troubleshooting
 */

import type { McpRequest, McpResponse } from '../types'

/**
 * Debug log entry for debug mode
 */
export interface DebugLogEntry {
  /** Timestamp of the event */
  timestamp: Date
  /** Event type */
  type: 'receive' | 'send' | 'error' | 'lifecycle'
  /** Event message */
  message: string
  /** Associated data (request/response/error) */
  data?: unknown
}

/**
 * Debug callback function
 */
export type DebugCallback = (entry: DebugLogEntry) => void

/**
 * Buffered write options
 */
export interface BufferedWriteOptions {
  /** Maximum number of messages to buffer before flushing (default: 10) */
  maxBufferSize?: number
  /** Maximum time to wait before flushing in milliseconds (default: 50) */
  flushIntervalMs?: number
  /** Whether buffering is enabled (default: true) */
  enabled?: boolean
}

/**
 * Graceful shutdown options
 */
export interface GracefulShutdownOptions {
  /** Timeout in milliseconds to wait for pending messages (default: 5000) */
  timeoutMs?: number
  /** Whether to process remaining buffer on shutdown (default: true) */
  processRemaining?: boolean
}

/**
 * Options for creating a stdio transport
 */
export interface StdioTransportOptions {
  /** Input stream (default: process.stdin) */
  stdin?: NodeJS.ReadableStream
  /** Output stream (default: process.stdout) */
  stdout?: NodeJS.WritableStream
  /** Handler for incoming messages */
  onMessage?: (message: McpRequest) => Promise<McpResponse>
  /** Handler for errors */
  onError?: (error: Error) => void
  /** Handler for transport close */
  onClose?: () => void
  /** Buffered write options */
  bufferedWrite?: BufferedWriteOptions
  /** Graceful shutdown options */
  gracefulShutdown?: GracefulShutdownOptions
  /** Debug mode callback */
  onDebug?: DebugCallback
}

/**
 * Stdio transport interface
 */
export interface StdioTransport {
  /** Start reading from stdin */
  start(): void
  /** Write a response to stdout */
  send(response: McpResponse): void
  /** Close the transport */
  close(): void
  /** Gracefully shutdown the transport, waiting for pending messages */
  shutdown(): Promise<void>
  /** Flush the write buffer immediately */
  flush(): void
  /** Whether the transport is running */
  readonly isRunning: boolean
  /** Number of pending messages being processed */
  readonly pendingCount: number
}

/**
 * JSON-RPC error codes
 */
export const JsonRpcErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const

/**
 * Create a JSON-RPC parse error response
 */
function createParseErrorResponse(id: string | number | null = null): McpResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? 0,
    error: {
      code: JsonRpcErrorCodes.ParseError,
      message: 'Parse error: Invalid JSON',
    },
  }
}

/**
 * Create a JSON-RPC invalid request error response
 */
function createInvalidRequestResponse(id: string | number | null, message: string): McpResponse {
  return {
    jsonrpc: '2.0',
    id: id ?? 0,
    error: {
      code: JsonRpcErrorCodes.InvalidRequest,
      message: `Invalid request: ${message}`,
    },
  }
}

/**
 * Validation result when request is valid
 */
interface ValidRequestResult {
  valid: true
  request: McpRequest
}

/**
 * Validation result when request is invalid
 */
interface InvalidRequestResult {
  valid: false
  error: string
  id?: string | number
}

/**
 * Result of JSON-RPC request validation
 */
type ValidationResult = ValidRequestResult | InvalidRequestResult

/**
 * Validate that a parsed object is a valid JSON-RPC request
 */
function validateJsonRpcRequest(obj: unknown): ValidationResult {
  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, error: 'Request must be an object' }
  }

  const request = obj as Record<string, unknown>

  // Extract id for error responses
  const id = typeof request.id === 'string' || typeof request.id === 'number' ? request.id : undefined

  // Validate jsonrpc version
  if (request.jsonrpc !== '2.0') {
    return { valid: false, error: 'Invalid JSON-RPC version (expected "2.0")', id }
  }

  // Validate id (must be string or number)
  if (request.id === undefined || (typeof request.id !== 'string' && typeof request.id !== 'number')) {
    return { valid: false, error: 'Missing or invalid id field', id }
  }

  // Validate method
  if (typeof request.method !== 'string') {
    return { valid: false, error: 'Missing or invalid method field', id }
  }

  // Params is optional but must be object/array if present
  if (request.params !== undefined && typeof request.params !== 'object') {
    return { valid: false, error: 'Invalid params field (must be object or array)', id }
  }

  return {
    valid: true,
    request: {
      jsonrpc: request.jsonrpc,
      id: request.id,
      method: request.method,
      params: request.params as Record<string, unknown> | undefined,
    } as McpRequest,
  }
}

/**
 * Create a stdio transport for MCP communication
 *
 * @param options - Transport configuration options
 * @returns StdioTransport instance
 *
 * @example
 * ```typescript
 * const transport = createStdioTransport({
 *   onMessage: async (request) => {
 *     return await mcpServer.handleRequest(request)
 *   },
 *   onError: (error) => {
 *     console.error('Transport error:', error)
 *   },
 * })
 *
 * transport.start()
 * ```
 *
 * @example
 * ```typescript
 * // With buffered writing and debug mode
 * const transport = createStdioTransport({
 *   onMessage: async (request) => mcpServer.handleRequest(request),
 *   bufferedWrite: { maxBufferSize: 20, flushIntervalMs: 100 },
 *   gracefulShutdown: { timeoutMs: 10000 },
 *   onDebug: (entry) => console.error(`[${entry.type}] ${entry.message}`),
 * })
 * ```
 */
export function createStdioTransport(options: StdioTransportOptions = {}): StdioTransport {
  const stdin = options.stdin ?? process.stdin
  const stdout = options.stdout ?? process.stdout
  const onMessage = options.onMessage
  const onError = options.onError
  const onClose = options.onClose
  const onDebug = options.onDebug

  // Buffered write configuration (disabled by default for backwards compatibility)
  const bufferedWriteOptions = {
    enabled: options.bufferedWrite?.enabled ?? false,
    maxBufferSize: options.bufferedWrite?.maxBufferSize ?? 10,
    flushIntervalMs: options.bufferedWrite?.flushIntervalMs ?? 50,
  }

  // Graceful shutdown configuration
  const shutdownOptions = {
    timeoutMs: options.gracefulShutdown?.timeoutMs ?? 5000,
    processRemaining: options.gracefulShutdown?.processRemaining ?? true,
  }

  let running = false
  let shuttingDown = false
  let buffer = ''
  let writeBuffer: string[] = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let pendingMessages = 0
  let dataHandler: ((chunk: Buffer | string) => void) | null = null
  let endHandler: (() => void) | null = null
  let errorHandler: ((error: Error) => void) | null = null
  let shutdownResolve: (() => void) | null = null

  /**
   * Debug logging helper
   */
  function debug(type: DebugLogEntry['type'], message: string, data?: unknown): void {
    if (onDebug) {
      onDebug({
        timestamp: new Date(),
        type,
        message,
        data,
      })
    }
  }

  /**
   * Flush the write buffer to stdout
   */
  function flushWriteBuffer(): void {
    if (writeBuffer.length === 0) {
      return
    }

    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    const data = writeBuffer.join('')
    writeBuffer = []

    try {
      stdout.write(data)
      debug('send', `Flushed ${data.split('\n').length - 1} messages to stdout`)
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
      debug('error', 'Failed to flush write buffer', error)
    }
  }

  /**
   * Schedule a flush of the write buffer
   */
  function scheduleFlush(): void {
    if (flushTimer) {
      return // Already scheduled
    }
    flushTimer = setTimeout(flushWriteBuffer, bufferedWriteOptions.flushIntervalMs)
  }

  /**
   * Write data to the output buffer
   */
  function writeToBuffer(data: string): void {
    if (!bufferedWriteOptions.enabled) {
      try {
        stdout.write(data)
        debug('send', 'Wrote message to stdout (unbuffered)')
      } catch (error) {
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)))
        }
        debug('error', 'Failed to write to stdout', error)
      }
      return
    }

    writeBuffer.push(data)

    if (writeBuffer.length >= bufferedWriteOptions.maxBufferSize) {
      flushWriteBuffer()
    } else {
      scheduleFlush()
    }
  }

  /**
   * Check if shutdown should complete
   */
  function checkShutdownComplete(): void {
    if (shuttingDown && pendingMessages === 0 && shutdownResolve) {
      flushWriteBuffer()
      shutdownResolve()
      shutdownResolve = null
    }
  }

  /**
   * Process a line of input (newline-delimited JSON)
   */
  async function processLine(line: string): Promise<void> {
    const trimmed = line.trim()
    if (!trimmed) {
      return // Skip empty lines
    }

    debug('receive', 'Received message', trimmed.substring(0, 200))

    // Parse JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      const errorResponse = createParseErrorResponse()
      transport.send(errorResponse)
      const error = new Error(`JSON parse error: ${trimmed.substring(0, 100)}`)
      if (onError) {
        onError(error)
      }
      debug('error', 'JSON parse error', error.message)
      return
    }

    // Validate JSON-RPC structure
    const validation = validateJsonRpcRequest(parsed)
    if (!validation.valid) {
      const invalidResult = validation as InvalidRequestResult
      const errorResponse = createInvalidRequestResponse(invalidResult.id ?? null, invalidResult.error)
      transport.send(errorResponse)
      const error = new Error(`Invalid JSON-RPC request: ${invalidResult.error}`)
      if (onError) {
        onError(error)
      }
      debug('error', 'Invalid JSON-RPC request', invalidResult.error)
      return
    }

    // Handle the message
    if (onMessage) {
      pendingMessages++
      debug('lifecycle', `Processing message (pending: ${pendingMessages})`, validation.request.method)

      try {
        const response = await onMessage(validation.request)
        transport.send(response)
        debug('send', 'Sent response', { id: response.id, hasError: !!response.error })
      } catch (error) {
        const errorResponse: McpResponse = {
          jsonrpc: '2.0',
          id: validation.request.id,
          error: {
            code: JsonRpcErrorCodes.InternalError,
            message: error instanceof Error ? error.message : 'Internal error',
          },
        }
        transport.send(errorResponse)
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)))
        }
        debug('error', 'Message handler error', error)
      } finally {
        pendingMessages--
        debug('lifecycle', `Message complete (pending: ${pendingMessages})`)
        checkShutdownComplete()
      }
    }
  }

  /**
   * Process buffered data, extracting complete lines
   */
  function processBuffer(): void {
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, newlineIndex)
      buffer = buffer.substring(newlineIndex + 1)
      // Process line asynchronously but don't await
      processLine(line).catch((error) => {
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)))
        }
      })
    }
  }

  const transport: StdioTransport = {
    get isRunning(): boolean {
      return running
    },

    get pendingCount(): number {
      return pendingMessages
    },

    start(): void {
      if (running) {
        return // Already running
      }

      running = true
      shuttingDown = false
      buffer = ''

      debug('lifecycle', 'Transport starting')

      // Set encoding for stdin if it supports it
      if ('setEncoding' in stdin && typeof stdin.setEncoding === 'function') {
        stdin.setEncoding('utf8')
      }

      // Create handlers
      dataHandler = (chunk: Buffer | string): void => {
        if (shuttingDown && !shutdownOptions.processRemaining) {
          return // Ignore new data during shutdown
        }
        buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
        processBuffer()
      }

      endHandler = (): void => {
        debug('lifecycle', 'Stdin ended')
        // Process any remaining data in buffer
        if (buffer.trim()) {
          processLine(buffer).catch((error) => {
            if (onError) {
              onError(error instanceof Error ? error : new Error(String(error)))
            }
          })
        }
        transport.close()
      }

      errorHandler = (error: Error): void => {
        debug('error', 'Stdin error', error.message)
        if (onError) {
          onError(error)
        }
      }

      // Attach event handlers
      stdin.on('data', dataHandler)
      stdin.on('end', endHandler)
      stdin.on('error', errorHandler)

      // Resume stdin if it's paused (common for process.stdin)
      if ('resume' in stdin && typeof stdin.resume === 'function') {
        stdin.resume()
      }

      debug('lifecycle', 'Transport started')
    },

    send(response: McpResponse): void {
      if (!running && !shuttingDown) {
        return // Transport is closed
      }

      try {
        const json = JSON.stringify(response)
        writeToBuffer(json + '\n')
      } catch (error) {
        if (onError) {
          onError(error instanceof Error ? error : new Error(String(error)))
        }
        debug('error', 'Failed to send response', error)
      }
    },

    flush(): void {
      flushWriteBuffer()
    },

    async shutdown(): Promise<void> {
      if (!running) {
        return // Already closed
      }

      debug('lifecycle', `Starting graceful shutdown (pending: ${pendingMessages})`)
      shuttingDown = true

      // If no pending messages, close immediately
      if (pendingMessages === 0) {
        flushWriteBuffer()
        transport.close()
        return
      }

      // Wait for pending messages or timeout
      return new Promise((resolve) => {
        shutdownResolve = () => {
          transport.close()
          resolve()
        }

        // Set timeout for shutdown
        setTimeout(() => {
          if (shutdownResolve) {
            debug('lifecycle', `Shutdown timeout reached (pending: ${pendingMessages})`)
            flushWriteBuffer()
            transport.close()
            resolve()
          }
        }, shutdownOptions.timeoutMs)
      })
    },

    close(): void {
      if (!running) {
        return // Already closed
      }

      debug('lifecycle', 'Transport closing')

      running = false
      shuttingDown = false

      // Flush any remaining buffered writes
      flushWriteBuffer()

      // Clear flush timer
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }

      // Remove event handlers
      if (dataHandler) {
        stdin.removeListener('data', dataHandler)
        dataHandler = null
      }
      if (endHandler) {
        stdin.removeListener('end', endHandler)
        endHandler = null
      }
      if (errorHandler) {
        stdin.removeListener('error', errorHandler)
        errorHandler = null
      }

      // Pause stdin to stop reading
      if ('pause' in stdin && typeof stdin.pause === 'function') {
        stdin.pause()
      }

      debug('lifecycle', 'Transport closed')

      // Call close handler
      if (onClose) {
        onClose()
      }
    },
  }

  return transport
}
