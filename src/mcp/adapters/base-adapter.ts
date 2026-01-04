/**
 * Base SDK Adapter for MCP
 *
 * Provides common functionality for SDK adapters:
 * - Retry logic with exponential backoff
 * - Timeout handling with AbortController
 * - Request/response logging
 * - Error normalization
 *
 * SDK adapters (Anthropic, Vercel) extend this base class.
 */

import type { McpServer } from '../server'
import type { McpRequest, McpResponse, McpToolResponse } from '../types'
import {
  McpError,
  McpErrorCode,
  TimeoutError,
  RateLimitError,
  isRetryableError,
  getRetryDelay,
  createErrorResponse,
} from './errors'

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Retry configuration for transient failures
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number
  /** Initial delay between retries in ms (default: 1000) */
  initialDelayMs: number
  /** Maximum delay between retries in ms (default: 30000) */
  maxDelayMs: number
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier: number
  /** Add jitter to delay to prevent thundering herd (default: true) */
  jitter: boolean
}

/**
 * Timeout configuration for operations
 */
export interface TimeoutConfig {
  /** Request timeout in ms (default: 30000) */
  requestTimeoutMs: number
  /** Connection timeout in ms (default: 10000) */
  connectTimeoutMs: number
  /** Idle timeout for streaming in ms (default: 60000) */
  idleTimeoutMs: number
}

/**
 * Logging configuration
 */
export interface LogConfig {
  /** Enable debug logging (default: false) */
  debug: boolean
  /** Log request bodies (default: false) */
  logRequests: boolean
  /** Log response bodies (default: false) */
  logResponses: boolean
  /** Custom logger function */
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void
}

/**
 * Base adapter configuration
 */
export interface BaseAdapterConfig {
  /** MCP server instance */
  server: McpServer
  /** Retry configuration */
  retry?: Partial<RetryConfig>
  /** Timeout configuration */
  timeout?: Partial<TimeoutConfig>
  /** Logging configuration */
  log?: Partial<LogConfig>
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
}

const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  requestTimeoutMs: 30000,
  connectTimeoutMs: 10000,
  idleTimeoutMs: 60000,
}

const DEFAULT_LOG_CONFIG: LogConfig = {
  debug: false,
  logRequests: false,
  logResponses: false,
}

// =============================================================================
// Base Adapter Class
// =============================================================================

/**
 * Abstract base class for SDK adapters
 *
 * Provides common infrastructure for adapting MCP servers to different SDKs.
 * Subclasses implement SDK-specific tool formatting and request handling.
 *
 * @example
 * ```typescript
 * class MyAdapter extends BaseAdapter {
 *   constructor(config: BaseAdapterConfig) {
 *     super(config)
 *   }
 *
 *   async formatTool(definition: McpToolDefinition): Promise<SDKTool> {
 *     // Convert MCP tool to SDK format
 *   }
 * }
 * ```
 */
export abstract class BaseAdapter {
  protected readonly server: McpServer
  protected readonly retryConfig: RetryConfig
  protected readonly timeoutConfig: TimeoutConfig
  protected readonly logConfig: LogConfig

  constructor(config: BaseAdapterConfig) {
    this.server = config.server
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry }
    this.timeoutConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config.timeout }
    this.logConfig = { ...DEFAULT_LOG_CONFIG, ...config.log }
  }

  // ===========================================================================
  // Logging
  // ===========================================================================

  /**
   * Log a message at the specified level
   */
  protected log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: unknown
  ): void {
    // Skip debug messages when debug mode is disabled
    if (level === 'debug' && !this.logConfig.debug) {
      return
    }

    if (this.logConfig.logger) {
      this.logConfig.logger(level, message, data)
      return
    }

    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [MCP:${level.toUpperCase()}]`

    switch (level) {
      case 'debug':
        console.debug(prefix, message, data ?? '')
        break
      case 'info':
        console.info(prefix, message, data ?? '')
        break
      case 'warn':
        console.warn(prefix, message, data ?? '')
        break
      case 'error':
        console.error(prefix, message, data ?? '')
        break
    }
  }

  // ===========================================================================
  // Retry Logic
  // ===========================================================================

  /**
   * Calculate delay for retry attempt with exponential backoff
   */
  protected calculateRetryDelay(attempt: number, baseDelay?: number): number {
    const base = baseDelay ?? this.retryConfig.initialDelayMs
    let delay = base * Math.pow(this.retryConfig.backoffMultiplier, attempt)
    delay = Math.min(delay, this.retryConfig.maxDelayMs)

    if (this.retryConfig.jitter) {
      // Add 0-25% jitter
      delay = delay * (1 + Math.random() * 0.25)
    }

    return Math.floor(delay)
  }

  /**
   * Execute an operation with retry logic
   *
   * @param operation - Async operation to execute
   * @param context - Context for logging
   * @returns Result of the operation
   * @throws McpError if all retries fail
   */
  protected async withRetry<T>(
    operation: (attempt: number) => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.log('debug', `${context}: retry attempt ${attempt}/${this.retryConfig.maxRetries}`)
        }

        return await operation(attempt)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Check if we should retry
        if (attempt >= this.retryConfig.maxRetries || !isRetryableError(lastError)) {
          this.log('error', `${context}: failed after ${attempt + 1} attempts`, {
            error: lastError.message,
          })
          throw McpError.fromError(lastError)
        }

        // Calculate delay
        const delay = getRetryDelay(lastError, this.calculateRetryDelay(attempt))
        this.log('warn', `${context}: retrying in ${delay}ms`, {
          error: lastError.message,
          attempt,
        })

        await this.sleep(delay)
      }
    }

    // Should not reach here, but TypeScript needs it
    throw lastError ?? new McpError(McpErrorCode.InternalError, 'Retry logic error')
  }

  /**
   * Sleep for a specified duration
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // ===========================================================================
  // Timeout Handling
  // ===========================================================================

  /**
   * Execute an operation with timeout
   *
   * @param operation - Async operation to execute
   * @param timeoutMs - Timeout in milliseconds
   * @param context - Context for error messages
   * @returns Result of the operation
   * @throws TimeoutError if operation times out
   */
  protected async withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    context: string
  ): Promise<T> {
    const controller = new AbortController()
    const { signal } = controller

    // Create a promise that rejects on timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        controller.abort()
        reject(new TimeoutError(
          `${context}: operation timed out after ${timeoutMs}ms`,
          timeoutMs
        ))
      }, timeoutMs)

      // Clean up timeout if signal aborted externally
      signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true })
    })

    try {
      // Race between operation and timeout
      return await Promise.race([operation(signal), timeoutPromise])
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw error
      }
      if (signal.aborted) {
        throw new TimeoutError(
          `${context}: operation timed out after ${timeoutMs}ms`,
          timeoutMs
        )
      }
      throw error
    }
  }

  /**
   * Execute an operation with both retry and timeout
   */
  protected async withRetryAndTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    context: string,
    timeoutMs?: number
  ): Promise<T> {
    const timeout = timeoutMs ?? this.timeoutConfig.requestTimeoutMs

    return this.withRetry(
      async () => this.withTimeout(operation, timeout, context),
      context
    )
  }

  // ===========================================================================
  // Request Handling
  // ===========================================================================

  /**
   * Handle an MCP request with error handling and logging
   */
  protected async handleRequest(request: McpRequest): Promise<McpResponse> {
    const startTime = Date.now()

    if (this.logConfig.logRequests) {
      this.log('debug', 'MCP request', { method: request.method, id: request.id })
    }

    try {
      const response = await this.withRetryAndTimeout(
        async () => this.server.handleRequest(request),
        `handleRequest:${request.method}`
      )

      if (this.logConfig.logResponses) {
        this.log('debug', 'MCP response', {
          method: request.method,
          id: request.id,
          duration: Date.now() - startTime,
          hasError: !!response.error,
        })
      }

      return response
    } catch (error) {
      const mcpError = McpError.fromError(error instanceof Error ? error : new Error(String(error)))

      this.log('error', 'Request failed', {
        method: request.method,
        id: request.id,
        error: mcpError.message,
        code: mcpError.code,
      })

      return {
        jsonrpc: '2.0',
        id: request.id,
        error: mcpError.toResponse(),
      }
    }
  }

  /**
   * Call a tool with error handling
   */
  protected async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<McpToolResponse> {
    if (this.logConfig.logRequests) {
      this.log('debug', `Calling tool: ${name}`, this.logConfig.debug ? args : undefined)
    }

    const startTime = Date.now()

    try {
      const result = await this.withRetryAndTimeout(
        async () => this.server.callTool(name, args),
        `callTool:${name}`
      )

      if (this.logConfig.logResponses) {
        this.log('debug', `Tool completed: ${name}`, {
          duration: Date.now() - startTime,
          isError: result.isError,
        })
      }

      return result
    } catch (error) {
      const mcpError = McpError.fromError(error instanceof Error ? error : new Error(String(error)))

      this.log('error', `Tool failed: ${name}`, {
        error: mcpError.message,
        code: mcpError.code,
      })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(createErrorResponse(mcpError)),
          },
        ],
        isError: true,
      }
    }
  }

  // ===========================================================================
  // Abstract Methods (implemented by subclasses)
  // ===========================================================================

  /**
   * Get the adapter name for logging
   */
  abstract get adapterName(): string

  /**
   * Initialize the adapter
   */
  abstract initialize(): Promise<void>

  /**
   * Cleanup adapter resources
   */
  abstract cleanup(): Promise<void>
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Result of a tool call with timing information
 */
export interface ToolCallResult {
  response: McpToolResponse
  durationMs: number
  retries: number
}

/**
 * Batch operation options
 */
export interface BatchOptions {
  /** Maximum concurrent operations */
  concurrency?: number
  /** Continue on error */
  continueOnError?: boolean
}
