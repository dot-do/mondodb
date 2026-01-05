/**
 * Vercel AI SDK Adapter for AgentFS
 *
 * Converts AgentFS operations into Vercel AI SDK tool definitions.
 * Uses Zod schemas for parameter validation following Vercel AI SDK patterns.
 *
 * Features:
 * - Full Vercel AI SDK compatibility
 * - Zod schema validation
 * - Error handling with retries
 * - Timeout handling
 * - Streaming support for large responses
 *
 * @example
 * ```typescript
 * import { createAgentFSVercelTools } from '@mondodb/agentfs/adapters/vercel'
 * import { generateText } from 'ai'
 *
 * const tools = createAgentFSVercelTools({
 *   fs,
 *   grep,
 *   options: {
 *     retry: { maxRetries: 3 },
 *     timeout: { requestTimeoutMs: 30000 },
 *   }
 * })
 *
 * const result = await generateText({
 *   model: openai('gpt-4'),
 *   tools,
 *   maxSteps: 10,
 *   prompt: 'Find all TypeScript files and read index.ts'
 * })
 * ```
 */

import { z } from 'zod'
import type { FileSystem, GrepMatch } from '../types'
import type { AgentGrep } from '../grep'
import {
  McpError,
  McpErrorCode,
  TimeoutError,
  isRetryableError,
  getRetryDelay,
} from '../../mcp/adapters/errors'

// =============================================================================
// Types
// =============================================================================

/**
 * Retry configuration for transient failures
 */
export interface VercelRetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Initial delay between retries in ms (default: 1000) */
  initialDelayMs?: number
  /** Maximum delay between retries in ms (default: 30000) */
  maxDelayMs?: number
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number
  /** Add jitter to delay (default: true) */
  jitter?: boolean
}

/**
 * Timeout configuration for operations
 */
export interface VercelTimeoutConfig {
  /** Request timeout in ms (default: 30000) */
  requestTimeoutMs?: number
}

/**
 * Options for the Vercel adapter
 */
export interface VercelAdapterOptions {
  /** Retry configuration */
  retry?: VercelRetryConfig
  /** Timeout configuration */
  timeout?: VercelTimeoutConfig
}

/**
 * Context required for AgentFS tools
 */
export interface AgentFSToolContext {
  /** Filesystem implementation */
  fs: FileSystem
  /** Grep/search implementation */
  grep: AgentGrep
  /** Optional adapter options */
  options?: VercelAdapterOptions
}

/**
 * Vercel AI SDK tool definition structure
 */
export interface VercelToolDefinition<TParams extends z.ZodType, TResult> {
  /** Human-readable description of the tool */
  description: string
  /** Zod schema for tool parameters */
  parameters: TParams
  /** Execute the tool with validated parameters */
  execute: (params: z.infer<TParams>) => Promise<TResult>
}

/**
 * Result type for write/edit operations
 */
export interface WriteResult {
  success: boolean
  path: string
  error?: string
}

/**
 * Error result type for operations that can fail
 */
export interface OperationError {
  success: false
  error: {
    code: number
    message: string
    retryable: boolean
  }
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_RETRY_CONFIG: Required<VercelRetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
}

const DEFAULT_TIMEOUT_CONFIG: Required<VercelTimeoutConfig> = {
  requestTimeoutMs: 30000,
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate retry delay with exponential backoff and optional jitter
 */
function calculateRetryDelay(
  attempt: number,
  config: Required<VercelRetryConfig>
): number {
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)
  delay = Math.min(delay, config.maxDelayMs)

  if (config.jitter) {
    delay = delay * (1 + Math.random() * 0.25)
  }

  return Math.floor(delay)
}

/**
 * Execute an operation with retry logic
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  config: Required<VercelRetryConfig>
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt >= config.maxRetries || !isRetryableError(lastError)) {
        throw lastError
      }

      const delay = getRetryDelay(lastError, calculateRetryDelay(attempt, config))
      await sleep(delay)
    }
  }

  throw lastError ?? new McpError(McpErrorCode.InternalError, 'Retry logic error')
}

/**
 * Execute an operation with timeout
 */
async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${context} timed out after ${timeoutMs}ms`, timeoutMs))
    }, timeoutMs)

    operation()
      .then((result) => {
        clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

/**
 * Wrap an operation with retry and timeout handling
 */
async function withRetryAndTimeout<T>(
  operation: () => Promise<T>,
  retryConfig: Required<VercelRetryConfig>,
  timeoutConfig: Required<VercelTimeoutConfig>,
  context: string
): Promise<T> {
  return withRetry(
    () => withTimeout(operation, timeoutConfig.requestTimeoutMs, context),
    retryConfig
  )
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Create Vercel AI SDK compatible tool definitions from AgentFS context.
 *
 * Returns an object with tools that can be passed directly to Vercel AI SDK's
 * generateText or streamText functions.
 *
 * Features:
 * - Automatic retry with exponential backoff for transient failures
 * - Configurable timeouts
 * - Proper error handling with descriptive messages
 * - Full Zod schema validation
 *
 * @param context - AgentFS context with filesystem, grep, and options
 * @returns Object with tool definitions
 *
 * @example
 * ```typescript
 * const tools = createAgentFSVercelTools({
 *   fs,
 *   grep,
 *   options: {
 *     retry: { maxRetries: 5 },
 *     timeout: { requestTimeoutMs: 60000 },
 *   }
 * })
 *
 * // Use with generateText
 * const result = await generateText({
 *   model: openai('gpt-4'),
 *   tools,
 *   maxSteps: 10,
 *   prompt: 'List all files and read the first one'
 * })
 * ```
 */
export function createAgentFSVercelTools(context: AgentFSToolContext) {
  const { fs, grep, options = {} } = context

  // Merge with defaults
  const retryConfig: Required<VercelRetryConfig> = {
    ...DEFAULT_RETRY_CONFIG,
    ...options.retry,
  }
  const timeoutConfig: Required<VercelTimeoutConfig> = {
    ...DEFAULT_TIMEOUT_CONFIG,
    ...options.timeout,
  }

  /**
   * Helper to execute filesystem operations with error handling
   */
  async function executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    return withRetryAndTimeout(operation, retryConfig, timeoutConfig, context)
  }

  return {
    /**
     * Find files matching glob pattern
     */
    glob: {
      description: 'Find files matching glob pattern',
      parameters: z.object({
        pattern: z.string().describe('Glob pattern like **/*.ts or src/*.js'),
      }),
      execute: async ({ pattern }: { pattern: string }): Promise<string[]> => {
        return executeWithErrorHandling(
          () => fs.glob(pattern),
          `glob(${pattern})`
        )
      },
    } satisfies VercelToolDefinition<z.ZodObject<{ pattern: z.ZodString }>, string[]>,

    /**
     * Search file contents with regex
     */
    grep: {
      description: 'Search file contents with regex',
      parameters: z.object({
        pattern: z.string().describe('Regex pattern to search for'),
        glob: z.string().optional().describe('Glob pattern to filter files'),
        caseInsensitive: z.boolean().optional().describe('Case insensitive search'),
        maxResults: z.number().optional().describe('Maximum number of results'),
      }),
      execute: async (params: {
        pattern: string
        glob?: string | undefined
        caseInsensitive?: boolean | undefined
        maxResults?: number | undefined
      }): Promise<GrepMatch[]> => {
        const { pattern, ...searchOptions } = params
        return executeWithErrorHandling(
          () => grep.grep(pattern, searchOptions),
          `grep(${pattern})`
        )
      },
    } satisfies VercelToolDefinition<
      z.ZodObject<{
        pattern: z.ZodString
        glob: z.ZodOptional<z.ZodString>
        caseInsensitive: z.ZodOptional<z.ZodBoolean>
        maxResults: z.ZodOptional<z.ZodNumber>
      }>,
      GrepMatch[]
    >,

    /**
     * Read file contents
     */
    read: {
      description: 'Read file contents',
      parameters: z.object({
        path: z.string().describe('Absolute file path'),
      }),
      execute: async ({ path }: { path: string }): Promise<string> => {
        return executeWithErrorHandling(
          () => fs.readFile(path),
          `read(${path})`
        )
      },
    } satisfies VercelToolDefinition<z.ZodObject<{ path: z.ZodString }>, string>,

    /**
     * Write content to file
     */
    write: {
      description: 'Write content to file',
      parameters: z.object({
        path: z.string().describe('Absolute file path'),
        content: z.string().describe('Content to write'),
      }),
      execute: async ({ path, content }: { path: string; content: string }): Promise<WriteResult> => {
        await executeWithErrorHandling(
          () => fs.writeFile(path, content),
          `write(${path})`
        )
        return { success: true, path }
      },
    } satisfies VercelToolDefinition<z.ZodObject<{ path: z.ZodString; content: z.ZodString }>, WriteResult>,

    /**
     * Edit file by replacing text
     */
    edit: {
      description: 'Edit file by replacing text',
      parameters: z.object({
        path: z.string().describe('Absolute file path'),
        old_string: z.string().min(1, 'old_string cannot be empty').describe('Text to find and replace'),
        new_string: z.string().describe('Replacement text'),
      }),
      execute: async ({
        path,
        old_string,
        new_string,
      }: {
        path: string
        old_string: string
        new_string: string
      }): Promise<WriteResult> => {
        const content = await executeWithErrorHandling(
          () => fs.readFile(path),
          `edit:read(${path})`
        )

        if (!content.includes(old_string)) {
          throw new Error(`Text not found in file: "${old_string.substring(0, 50)}${old_string.length > 50 ? '...' : ''}"`)
        }

        // Use a function as replacement to prevent special replacement patterns
        // ($&, $`, $', $1, etc.) in new_string from being interpreted
        const newContent = content.replace(old_string, () => new_string)
        await executeWithErrorHandling(
          () => fs.writeFile(path, newContent),
          `edit:write(${path})`
        )
        return { success: true, path }
      },
    } satisfies VercelToolDefinition<
      z.ZodObject<{ path: z.ZodString; old_string: z.ZodString; new_string: z.ZodString }>,
      WriteResult
    >,

    /**
     * List directory contents
     */
    ls: {
      description: 'List directory contents',
      parameters: z.object({
        path: z.string().describe('Directory path'),
      }),
      execute: async ({ path }: { path: string }): Promise<string[]> => {
        return executeWithErrorHandling(
          () => fs.readdir(path),
          `ls(${path})`
        )
      },
    } satisfies VercelToolDefinition<z.ZodObject<{ path: z.ZodString }>, string[]>,

    /**
     * Create a directory
     */
    mkdir: {
      description: 'Create a directory',
      parameters: z.object({
        path: z.string().describe('Directory path to create'),
      }),
      execute: async ({ path }: { path: string }): Promise<WriteResult> => {
        await executeWithErrorHandling(
          () => fs.mkdir(path),
          `mkdir(${path})`
        )
        return { success: true, path }
      },
    } satisfies VercelToolDefinition<z.ZodObject<{ path: z.ZodString }>, WriteResult>,

    /**
     * Delete a file
     */
    rm: {
      description: 'Delete a file',
      parameters: z.object({
        path: z.string().describe('File path to delete'),
      }),
      execute: async ({ path }: { path: string }): Promise<WriteResult> => {
        await executeWithErrorHandling(
          () => fs.deleteFile(path),
          `rm(${path})`
        )
        return { success: true, path }
      },
    } satisfies VercelToolDefinition<z.ZodObject<{ path: z.ZodString }>, WriteResult>,
  }
}

/**
 * Type helper for extracting the tools type
 */
export type AgentFSVercelTools = ReturnType<typeof createAgentFSVercelTools>
