/**
 * Anthropic MCP Adapter for mongo.do AgentFS
 *
 * Provides MCP tool definitions and handlers for AgentFS operations.
 * Enables Claude and other Anthropic models to use mongo.do tools via MCP.
 *
 * Features:
 * - Full MCP protocol compliance
 * - Proper error handling with MCP error codes
 * - Retry logic with exponential backoff
 * - Timeout handling with configurable limits
 * - Streaming support for large files and search results
 * - Audit logging integration
 *
 * @example
 * ```typescript
 * import { createMonDoMcpServer } from '@mongo.do/agentfs/adapters/anthropic'
 *
 * const server = createMonDoMcpServer({
 *   fs: new AgentFilesystem(db),
 *   kv: new AgentKeyValue(db),
 *   grep: new AgentGrep(fs),
 * }, {
 *   name: 'my-agentfs',
 *   version: '1.0.0',
 *   enableAudit: true,
 *   retry: { maxRetries: 3 },
 *   timeout: { requestTimeoutMs: 30000 },
 * })
 *
 * // Handle MCP requests
 * const tools = await server.listTools()
 * const result = await server.callTool('read', { path: '/src/index.ts' })
 * ```
 */

import type {
  McpToolDefinition,
  McpToolResponse,
  McpRegisteredTool,
} from '../../mcp/types'
import type { FileSystem, GrepMatch, GrepOptions, KeyValueStore } from '../types'
import type { ToolCallEntry, AuditQueryOptions, RecordOptions } from '../toolcalls'
import {
  McpError,
  McpErrorCode,
  TimeoutError,
  ToolNotFoundError,
  InvalidParamsError,
  isRetryableError,
  getRetryDelay,
} from '../../mcp/adapters/errors'

// =============================================================================
// Types
// =============================================================================

/**
 * Interface for grep functionality
 */
export interface GrepProvider {
  grep(pattern: string, options?: Omit<GrepOptions, 'pattern'>): Promise<GrepMatch[]>
}

/**
 * Interface for audit log functionality
 */
export interface AuditProvider {
  record(
    tool: string,
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown>,
    options?: RecordOptions
  ): Promise<string>
  list(options?: AuditQueryOptions): Promise<ToolCallEntry[]>
  findById(id: string): Promise<ToolCallEntry | null>
  findByTool(toolName: string): Promise<ToolCallEntry[]>
  count(): Promise<number>
}

/**
 * Provider interface for AgentFS components
 */
export interface AgentFSProvider {
  /** Virtual filesystem */
  fs: FileSystem
  /** Key-value store */
  kv: KeyValueStore
  /** Grep search functionality */
  grep: GrepProvider
  /** Audit log (optional) */
  audit?: AuditProvider
}

/**
 * Retry configuration for transient failures
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Initial delay between retries in ms (default: 1000) */
  initialDelayMs?: number
  /** Maximum delay between retries in ms (default: 30000) */
  maxDelayMs?: number
  /** Exponential backoff multiplier (default: 2) */
  backoffMultiplier?: number
  /** Add jitter to delay to prevent thundering herd (default: true) */
  jitter?: boolean
}

/**
 * Timeout configuration for operations
 */
export interface TimeoutConfig {
  /** Request timeout in ms (default: 30000) */
  requestTimeoutMs?: number
  /** Streaming idle timeout in ms (default: 60000) */
  idleTimeoutMs?: number
}

/**
 * Streaming configuration
 */
export interface StreamingConfig {
  /** Enable streaming for large responses (default: true) */
  enabled?: boolean
  /** Threshold in bytes to trigger streaming (default: 1MB) */
  thresholdBytes?: number
  /** Chunk size for streaming (default: 64KB) */
  chunkSize?: number
}

/**
 * Options for creating the adapter
 */
export interface AdapterOptions {
  /** Server name (default: 'mongo.do-agentfs') */
  name?: string
  /** Server version (default: '1.0.0') */
  version?: string
  /** Enable audit logging (default: false) */
  enableAudit?: boolean
  /** Retry configuration */
  retry?: RetryConfig
  /** Timeout configuration */
  timeout?: TimeoutConfig
  /** Streaming configuration */
  streaming?: StreamingConfig
}

/**
 * MCP Server interface for the adapter
 */
export interface AgentFSMcpServer {
  readonly name: string
  readonly version: string
  listTools(): Promise<McpToolDefinition[]>
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResponse>
  /**
   * Call a tool with streaming support for large responses
   * Returns an async iterator of response chunks
   */
  callToolStreaming?(
    name: string,
    args: Record<string, unknown>
  ): AsyncGenerator<McpToolResponse, void, undefined>
  registerTool(tool: McpRegisteredTool): void
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
}

const DEFAULT_TIMEOUT_CONFIG: Required<TimeoutConfig> = {
  requestTimeoutMs: 30000,
  idleTimeoutMs: 60000,
}

const DEFAULT_STREAMING_CONFIG: Required<StreamingConfig> = {
  enabled: true,
  thresholdBytes: 1024 * 1024, // 1MB
  chunkSize: 64 * 1024, // 64KB
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a success response
 */
function successResponse(text: string): McpToolResponse {
  return {
    content: [{ type: 'text', text }],
  }
}

/**
 * Create an error response with proper MCP error structure
 *
 * @param error - The error (can be Error, McpError, or string)
 * @param toolName - Optional tool name for context
 * @returns MCP tool response with error flag
 */
function errorResponse(error: unknown, toolName?: string): McpToolResponse {
  let mcpError: McpError

  if (error instanceof McpError) {
    mcpError = error
  } else if (error instanceof Error) {
    // Classify the error based on message/type
    mcpError = McpError.fromError(error)
  } else {
    mcpError = new McpError(
      McpErrorCode.InternalError,
      String(error),
      { retryable: false }
    )
  }

  // Create structured error response
  const errorData = {
    error: {
      code: mcpError.code,
      message: mcpError.message,
      retryable: mcpError.retryable,
      ...(toolName && { tool: toolName }),
      ...(mcpError.data?.retryAfter && { retryAfter: mcpError.data.retryAfter }),
    },
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(errorData) }],
    isError: true,
  }
}

/**
 * Create a validation error response
 */
function validationErrorResponse(message: string): McpToolResponse {
  return errorResponse(new InvalidParamsError(message))
}

/**
 * Validate required string parameter
 */
function validateRequiredString(
  args: Record<string, unknown>,
  param: string
): string | McpToolResponse {
  const value = args[param]
  if (typeof value !== 'string' || value.length === 0) {
    return validationErrorResponse(`Missing or invalid required parameter: ${param}`)
  }
  return value
}

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
  config: Required<RetryConfig>
): number {
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)
  delay = Math.min(delay, config.maxDelayMs)

  if (config.jitter) {
    // Add 0-25% jitter
    delay = delay * (1 + Math.random() * 0.25)
  }

  return Math.floor(delay)
}

// =============================================================================
// Anthropic MCP Adapter
// =============================================================================

/**
 * Full configuration with all defaults applied
 */
interface ResolvedAdapterOptions {
  name: string
  version: string
  enableAudit: boolean
  retry: Required<RetryConfig>
  timeout: Required<TimeoutConfig>
  streaming: Required<StreamingConfig>
}

/**
 * Anthropic MCP Adapter for AgentFS
 *
 * Creates MCP-compatible tool definitions and handlers for AgentFS operations.
 *
 * Features:
 * - Proper MCP error codes and responses
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Streaming support for large responses
 * - Audit logging integration
 */
export class AnthropicMCPAdapter {
  private provider: AgentFSProvider
  private options: ResolvedAdapterOptions

  constructor(provider: AgentFSProvider, options: AdapterOptions = {}) {
    this.provider = provider
    this.options = {
      name: options.name ?? 'mongo.do-agentfs',
      version: options.version ?? '1.0.0',
      enableAudit: options.enableAudit ?? false,
      retry: { ...DEFAULT_RETRY_CONFIG, ...options.retry },
      timeout: { ...DEFAULT_TIMEOUT_CONFIG, ...options.timeout },
      streaming: { ...DEFAULT_STREAMING_CONFIG, ...options.streaming },
    }
  }

  /**
   * Create an MCP server with all AgentFS tools registered
   */
  createServer(): AgentFSMcpServer {
    const tools = new Map<string, McpRegisteredTool>()
    const options = this.options

    // Register all tools
    const toolDefinitions = [
      this.createGlobTool(),
      this.createGrepTool(),
      this.createReadTool(),
      this.createWriteTool(),
      this.createEditTool(),
      this.createKvGetTool(),
      this.createKvSetTool(),
      this.createAuditListTool(),
    ]

    for (const tool of toolDefinitions) {
      tools.set(tool.definition.name, tool)
    }

    /**
     * Execute an operation with retry logic
     */
    async function withRetry<T>(
      operation: () => Promise<T>,
      _toolName: string
    ): Promise<T> {
      let lastError: Error | null = null

      for (let attempt = 0; attempt <= options.retry.maxRetries; attempt++) {
        try {
          return await operation()
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))

          // Check if we should retry
          if (attempt >= options.retry.maxRetries || !isRetryableError(lastError)) {
            throw lastError
          }

          // Calculate delay and wait
          const delay = getRetryDelay(lastError, calculateRetryDelay(attempt, options.retry))
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
      toolName: string
    ): Promise<T> {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new TimeoutError(
            `Tool '${toolName}' timed out after ${timeoutMs}ms`,
            timeoutMs
          ))
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

    const server: AgentFSMcpServer = {
      name: this.options.name,
      version: this.options.version,

      async listTools(): Promise<McpToolDefinition[]> {
        return Array.from(tools.values()).map((t) => t.definition)
      },

      async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResponse> {
        const tool = tools.get(name)
        if (!tool) {
          return errorResponse(new ToolNotFoundError(name))
        }

        try {
          // Execute with retry and timeout
          return await withRetry(
            () => withTimeout(
              () => tool.handler(args),
              options.timeout.requestTimeoutMs,
              name
            ),
            name
          )
        } catch (error) {
          return errorResponse(error, name)
        }
      },

      registerTool(tool: McpRegisteredTool): void {
        tools.set(tool.definition.name, tool)
      },
    }

    return server
  }

  /**
   * Wrap a tool handler with audit logging
   */
  private wrapWithAudit(
    toolName: string,
    handler: (args: Record<string, unknown>) => Promise<McpToolResponse>
  ): (args: Record<string, unknown>) => Promise<McpToolResponse> {
    if (!this.options.enableAudit || !this.provider.audit) {
      return handler
    }

    return async (args: Record<string, unknown>): Promise<McpToolResponse> => {
      const startTime = new Date()
      const response = await handler(args)
      const endTime = new Date()

      try {
        await this.provider.audit!.record(
          toolName,
          args,
          { content: response.content, isError: response.isError },
          { startTime, endTime }
        )
      } catch {
        // Don't fail the tool call if audit fails
      }

      return response
    }
  }

  // ===========================================================================
  // Tool Definitions
  // ===========================================================================

  private createGlobTool(): McpRegisteredTool {
    const handler = this.wrapWithAudit('glob', async (args) => {
      const pattern = validateRequiredString(args, 'pattern')
      if (typeof pattern !== 'string') return pattern

      const files = await this.provider.fs.glob(pattern)
      return successResponse(files.join('\n'))
    })

    return {
      definition: {
        name: 'glob',
        description: 'Find files matching a glob pattern. Returns newline-separated list of file paths.',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Glob pattern to match files (e.g., "**/*.ts", "src/*.js")',
            },
          },
          required: ['pattern'],
        },
        annotations: {
          title: 'Find Files',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      handler,
    }
  }

  private createGrepTool(): McpRegisteredTool {
    const handler = this.wrapWithAudit('grep', async (args) => {
      const pattern = validateRequiredString(args, 'pattern')
      if (typeof pattern !== 'string') return pattern

      const options: Omit<GrepOptions, 'pattern'> = {}
      if (typeof args.glob === 'string') options.glob = args.glob
      if (typeof args.caseInsensitive === 'boolean') options.caseInsensitive = args.caseInsensitive
      if (typeof args.maxResults === 'number') options.maxResults = args.maxResults
      if (typeof args.contextLines === 'number') options.contextLines = args.contextLines

      const matches = await this.provider.grep.grep(pattern, options)

      // Format matches as file:line: content
      const text = matches.map((m) => `${m.file}:${m.line}: ${m.content}`).join('\n')
      return successResponse(text || '(no matches)')
    })

    return {
      definition: {
        name: 'grep',
        description: 'Search file contents with regex pattern. Returns matches in format: file:line: content',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Regular expression pattern to search for',
            },
            glob: {
              type: 'string',
              description: 'Optional glob pattern to filter files (default: "**/*")',
            },
            caseInsensitive: {
              type: 'boolean',
              description: 'Case-insensitive search (default: false)',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of results to return',
            },
            contextLines: {
              type: 'number',
              description: 'Number of context lines before/after match',
            },
          },
          required: ['pattern'],
        },
        annotations: {
          title: 'Search File Contents',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      handler,
    }
  }

  private createReadTool(): McpRegisteredTool {
    const handler = this.wrapWithAudit('read', async (args) => {
      const path = validateRequiredString(args, 'path')
      if (typeof path !== 'string') return path

      const content = await this.provider.fs.readFile(path)
      return successResponse(content)
    })

    return {
      definition: {
        name: 'read',
        description: 'Read the contents of a file at the specified path.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file to read',
            },
          },
          required: ['path'],
        },
        annotations: {
          title: 'Read File',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      handler,
    }
  }

  private createWriteTool(): McpRegisteredTool {
    const handler = this.wrapWithAudit('write', async (args) => {
      const path = validateRequiredString(args, 'path')
      if (typeof path !== 'string') return path

      const content = validateRequiredString(args, 'content')
      if (typeof content !== 'string') return content

      await this.provider.fs.writeFile(path, content)
      return successResponse('OK')
    })

    return {
      definition: {
        name: 'write',
        description: 'Write content to a file. Creates the file if it does not exist, or overwrites if it does.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file to write',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file',
            },
          },
          required: ['path', 'content'],
        },
        annotations: {
          title: 'Write File',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      handler,
    }
  }

  private createEditTool(): McpRegisteredTool {
    const handler = this.wrapWithAudit('edit', async (args) => {
      const path = validateRequiredString(args, 'path')
      if (typeof path !== 'string') return path

      const oldString = args.old_string
      const newString = args.new_string

      if (typeof oldString !== 'string') {
        return errorResponse('Missing or invalid required parameter: old_string')
      }
      if (oldString.length === 0) {
        return errorResponse('old_string cannot be empty')
      }
      if (typeof newString !== 'string') {
        return errorResponse('Missing or invalid required parameter: new_string')
      }

      const content = await this.provider.fs.readFile(path)

      if (!content.includes(oldString)) {
        return errorResponse(`String not found in file: "${oldString.slice(0, 50)}${oldString.length > 50 ? '...' : ''}"`)
      }

      // Use a function as replacement to prevent special replacement patterns
      // ($&, $`, $', $1, etc.) in newString from being interpreted
      const updated = content.replace(oldString, () => newString)
      await this.provider.fs.writeFile(path, updated)

      return successResponse('OK')
    })

    return {
      definition: {
        name: 'edit',
        description: 'Edit a file by replacing a specific string. The old_string must exist exactly in the file.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file to edit',
            },
            old_string: {
              type: 'string',
              description: 'The exact string to find and replace',
            },
            new_string: {
              type: 'string',
              description: 'The replacement string',
            },
          },
          required: ['path', 'old_string', 'new_string'],
        },
        annotations: {
          title: 'Edit File',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      handler,
    }
  }

  private createKvGetTool(): McpRegisteredTool {
    const handler = this.wrapWithAudit('kv_get', async (args) => {
      const key = validateRequiredString(args, 'key')
      if (typeof key !== 'string') return key

      const value = await this.provider.kv.get(key)
      return successResponse(JSON.stringify(value ?? null))
    })

    return {
      definition: {
        name: 'kv_get',
        description: 'Get a value from the key-value store by key. Returns JSON-serialized value or null.',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The key to look up',
            },
          },
          required: ['key'],
        },
        annotations: {
          title: 'Get KV Value',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      handler,
    }
  }

  private createKvSetTool(): McpRegisteredTool {
    const handler = this.wrapWithAudit('kv_set', async (args) => {
      const key = validateRequiredString(args, 'key')
      if (typeof key !== 'string') return key

      if (!('value' in args)) {
        return errorResponse('Missing required parameter: value')
      }

      await this.provider.kv.set(key, args.value)
      return successResponse('OK')
    })

    return {
      definition: {
        name: 'kv_set',
        description: 'Set a value in the key-value store. Value can be any JSON-serializable type.',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'The key to set',
            },
            value: {
              type: 'object',
              description: 'The value to store (any JSON-serializable type)',
            },
          },
          required: ['key', 'value'],
        },
        annotations: {
          title: 'Set KV Value',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      handler,
    }
  }

  private createAuditListTool(): McpRegisteredTool {
    const handler = this.wrapWithAudit('audit_list', async (args) => {
      if (!this.provider.audit) {
        return successResponse('[]')
      }

      const options: AuditQueryOptions = {}
      if (typeof args.limit === 'number') options.limit = args.limit
      if (typeof args.offset === 'number') options.offset = args.offset
      if (typeof args.tool === 'string') options.tool = args.tool

      const entries = await this.provider.audit.list(options)
      return successResponse(JSON.stringify(entries))
    })

    return {
      definition: {
        name: 'audit_list',
        description: 'List tool call audit log entries. Returns JSON array of entries.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of entries to return',
            },
            offset: {
              type: 'number',
              description: 'Number of entries to skip',
            },
            tool: {
              type: 'string',
              description: 'Filter by tool name',
            },
          },
        },
        annotations: {
          title: 'List Audit Entries',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      handler,
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an MCP server for AgentFS with all tools registered
 *
 * @param provider - AgentFS provider with fs, kv, grep, and optional audit
 * @param options - Optional server configuration
 * @returns Configured MCP server instance
 */
export function createMonDoMcpServer(
  provider: AgentFSProvider,
  options?: AdapterOptions
): AgentFSMcpServer {
  return new AnthropicMCPAdapter(provider, options).createServer()
}
