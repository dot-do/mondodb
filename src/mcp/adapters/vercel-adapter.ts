/**
 * Vercel AI SDK Adapter for MCP
 *
 * Adapts MCP server tools to Vercel AI SDK's tool format.
 * Compatible with the Vercel AI SDK's `tool` and `generateText` APIs.
 *
 * Features:
 * - Converts MCP tool definitions to Vercel AI SDK format
 * - Supports both `tool()` and `CoreTool` interfaces
 * - Handles streaming via Vercel's streaming responses
 * - Integrates with `ai` package for Next.js compatibility
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
 */

import { BaseAdapter, type BaseAdapterConfig } from './base-adapter'
import type { McpToolDefinition, McpToolResponse, JsonSchema } from '../types'
import { McpError } from './errors'
import {
  streamTextContent,
} from './streaming'
import { z } from 'zod'

// =============================================================================
// Vercel AI SDK Types
// =============================================================================

/**
 * Vercel AI SDK tool parameter schema (Zod-based)
 */
export type VercelToolParameters = z.ZodObject<Record<string, z.ZodTypeAny>>

/**
 * Vercel AI SDK CoreTool interface
 *
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/tool
 */
export interface VercelCoreTool<TParams extends VercelToolParameters = VercelToolParameters> {
  /** Human-readable description */
  description: string
  /** Zod schema for parameters */
  parameters: TParams
  /** Tool execution function */
  execute: (params: z.infer<TParams>) => Promise<string>
}

/**
 * Vercel AI SDK tool call from model response
 */
export interface VercelToolCall {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

/**
 * Vercel AI SDK tool result
 */
export interface VercelToolResult {
  toolCallId: string
  toolName: string
  result: string
}

/**
 * Vercel AI SDK streamable value for streaming responses
 */
export interface VercelStreamable {
  /** Value stream */
  readonly value: ReadableStream<string>
  /** Append to stream */
  append: (chunk: string) => void
  /** Complete the stream */
  done: () => void
  /** Error the stream */
  error: (error: Error) => void
}

/**
 * Vercel AI SDK streaming text response options
 */
export interface VercelStreamOptions {
  /** Enable streaming (default: true) */
  stream?: boolean
  /** Chunk size for streaming (default: 1024) */
  chunkSize?: number
  /** Signal for abort */
  signal?: AbortSignal
}

// =============================================================================
// Adapter Configuration
// =============================================================================

/**
 * Vercel adapter configuration
 */
export interface VercelAdapterConfig extends BaseAdapterConfig {
  /** Maximum content length before streaming (default: 50KB) */
  streamingThreshold?: number
  /** Whether to use streaming by default (default: true) */
  defaultStreaming?: boolean
  /** Custom result formatter */
  formatResult?: (response: McpToolResponse) => string
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_STREAMING_THRESHOLD = 50 * 1024 // 50KB

// =============================================================================
// Vercel Adapter Class
// =============================================================================

/**
 * Vercel AI SDK Adapter
 *
 * Converts MCP tools to Vercel AI SDK's CoreTool format and handles
 * tool execution with streaming support.
 *
 * @example
 * ```typescript
 * import { generateText, tool } from 'ai'
 *
 * const mcpServer = createMcpServer({ dbAccess })
 * const adapter = new VercelAdapter({ server: mcpServer })
 *
 * await adapter.initialize()
 *
 * // Get tools for Vercel AI SDK
 * const tools = await adapter.getTools()
 *
 * // Use with generateText
 * const result = await generateText({
 *   model: openai('gpt-4'),
 *   tools,
 *   prompt: 'Search for documents about AI',
 * })
 * ```
 */
export class VercelAdapter extends BaseAdapter {
  private readonly streamingThreshold: number
  private readonly defaultStreaming: boolean
  private readonly formatResult: (response: McpToolResponse) => string
  private toolCache: Map<string, VercelCoreTool> = new Map()
  private mcpToolNames: Map<string, string> = new Map() // Vercel name -> MCP name
  private initialized = false

  constructor(config: VercelAdapterConfig) {
    super(config)
    this.streamingThreshold = config.streamingThreshold ?? DEFAULT_STREAMING_THRESHOLD
    this.defaultStreaming = config.defaultStreaming ?? true
    this.formatResult = config.formatResult ?? this.defaultResultFormatter.bind(this)
  }

  /**
   * Adapter name for logging
   */
  get adapterName(): string {
    return 'vercel'
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Initialize the adapter
   *
   * Fetches all available tools from the MCP server and converts
   * them to Vercel AI SDK format.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.log('info', 'Initializing Vercel AI SDK adapter')

    try {
      const mcpTools = await this.server.listTools()

      for (const tool of mcpTools) {
        const vercelTool = this.convertTool(tool)
        this.toolCache.set(tool.name, vercelTool)
        this.mcpToolNames.set(tool.name, tool.name)
        this.log('debug', `Registered tool: ${tool.name}`)
      }

      this.initialized = true
      this.log('info', `Vercel adapter initialized with ${this.toolCache.size} tools`)
    } catch (error) {
      this.log('error', 'Failed to initialize Vercel adapter', { error })
      throw McpError.fromError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Cleanup adapter resources
   */
  async cleanup(): Promise<void> {
    this.toolCache.clear()
    this.mcpToolNames.clear()
    this.initialized = false
    this.log('info', 'Vercel adapter cleaned up')
  }

  // ===========================================================================
  // Tool Conversion
  // ===========================================================================

  /**
   * Convert MCP tool definition to Vercel CoreTool format
   */
  private convertTool(mcpTool: McpToolDefinition): VercelCoreTool {
    const parameters = this.convertToZodSchema(mcpTool.inputSchema)
    const toolName = mcpTool.name

    return {
      description: mcpTool.description,
      parameters,
      execute: async (params: Record<string, unknown>) => {
        const response = await this.callTool(toolName, params)
        return this.formatResult(response)
      },
    }
  }

  /**
   * Convert JSON Schema to Zod schema
   *
   * Creates a Zod schema that validates the same structure as the
   * original JSON Schema from the MCP tool definition.
   */
  private convertToZodSchema(schema: JsonSchema): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const shape: Record<string, z.ZodTypeAny> = {}

    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        shape[key] = this.convertPropertyToZod(prop, schema.required?.includes(key) ?? false)
      }
    }

    return z.object(shape)
  }

  /**
   * Convert a single JSON Schema property to Zod
   */
  private convertPropertyToZod(
    prop: JsonSchema | { type: string; description?: string },
    required: boolean
  ): z.ZodTypeAny {
    let zodType: z.ZodTypeAny

    switch (prop.type) {
      case 'string':
        zodType = z.string()
        if (prop.description) {
          zodType = zodType.describe(prop.description)
        }
        if ('enum' in prop && prop.enum) {
          zodType = z.enum(prop.enum as [string, ...string[]])
        }
        break

      case 'number':
      case 'integer':
        zodType = z.number()
        if (prop.description) {
          zodType = zodType.describe(prop.description)
        }
        break

      case 'boolean':
        zodType = z.boolean()
        if (prop.description) {
          zodType = zodType.describe(prop.description)
        }
        break

      case 'array':
        if ('items' in prop && prop.items) {
          zodType = z.array(this.convertPropertyToZod(prop.items as JsonSchema, true))
        } else {
          zodType = z.array(z.unknown())
        }
        if (prop.description) {
          zodType = zodType.describe(prop.description)
        }
        break

      case 'object':
        if ('properties' in prop && prop.properties) {
          const nestedShape: Record<string, z.ZodTypeAny> = {}
          for (const [key, value] of Object.entries(prop.properties)) {
            const isRequired = 'required' in prop && (prop.required as string[])?.includes(key)
            nestedShape[key] = this.convertPropertyToZod(value, isRequired ?? false)
          }
          zodType = z.object(nestedShape)
        } else {
          zodType = z.record(z.string(), z.unknown())
        }
        if (prop.description) {
          zodType = zodType.describe(prop.description)
        }
        break

      default:
        zodType = z.unknown()
    }

    return required ? zodType : zodType.optional()
  }

  /**
   * Default result formatter
   */
  private defaultResultFormatter(response: McpToolResponse): string {
    if (response.isError) {
      return JSON.stringify({ error: this.extractTextContent(response) })
    }
    return this.extractTextContent(response)
  }

  /**
   * Extract text content from MCP response
   */
  private extractTextContent(response: McpToolResponse): string {
    return response.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get all tools in Vercel AI SDK format
   *
   * Returns a record of tool definitions suitable for use with
   * the Vercel AI SDK's `generateText` or `streamText` functions.
   *
   * @returns Record of tool name to CoreTool
   *
   * @example
   * ```typescript
   * import { generateText } from 'ai'
   *
   * const tools = await adapter.getTools()
   *
   * const result = await generateText({
   *   model: openai('gpt-4'),
   *   tools,
   *   prompt: 'Search for users',
   * })
   * ```
   */
  async getTools(): Promise<Record<string, VercelCoreTool>> {
    if (!this.initialized) {
      await this.initialize()
    }

    return Object.fromEntries(this.toolCache)
  }

  /**
   * Get a single tool by name
   *
   * @param name - Tool name
   * @returns CoreTool or undefined
   */
  async getTool(name: string): Promise<VercelCoreTool | undefined> {
    if (!this.initialized) {
      await this.initialize()
    }

    return this.toolCache.get(name)
  }

  /**
   * Handle a tool call from model response
   *
   * Executes the requested tool and returns a tool result.
   *
   * @param toolCall - Tool call from model
   * @returns Tool result
   *
   * @example
   * ```typescript
   * for (const toolCall of result.toolCalls) {
   *   const toolResult = await adapter.handleToolCall(toolCall)
   *   results.push(toolResult)
   * }
   * ```
   */
  async handleToolCall(toolCall: VercelToolCall): Promise<VercelToolResult> {
    const startTime = Date.now()

    this.log('debug', `Handling tool call: ${toolCall.toolName}`, {
      id: toolCall.toolCallId,
    })

    try {
      const response = await this.callTool(toolCall.toolName, toolCall.args)

      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: this.formatResult(response),
      }
    } catch (error) {
      const mcpError = McpError.fromError(
        error instanceof Error ? error : new Error(String(error))
      )

      this.log('error', `Tool call failed: ${toolCall.toolName}`, {
        id: toolCall.toolCallId,
        error: mcpError.message,
        duration: Date.now() - startTime,
      })

      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: JSON.stringify({
          error: mcpError.message,
          code: mcpError.code,
        }),
      }
    }
  }

  /**
   * Handle multiple tool calls in parallel
   *
   * @param toolCalls - Array of tool calls
   * @param concurrency - Maximum concurrent executions (default: 5)
   * @returns Array of tool results
   */
  async handleToolCalls(
    toolCalls: VercelToolCall[],
    concurrency = 5
  ): Promise<VercelToolResult[]> {
    const results: VercelToolResult[] = []
    const executing: Promise<void>[] = []

    for (const toolCall of toolCalls) {
      const promise = this.handleToolCall(toolCall).then((result) => {
        results.push(result)
      })

      executing.push(promise)

      if (executing.length >= concurrency) {
        await Promise.race(executing)
      }
    }

    await Promise.all(executing)
    return results
  }

  /**
   * Create a streaming tool executor
   *
   * Returns a function that executes a tool and streams the response.
   * Compatible with Vercel AI SDK's streaming patterns.
   *
   * @param toolName - Name of the tool
   * @returns Streaming executor function
   *
   * @example
   * ```typescript
   * const searchStream = adapter.createStreamingExecutor('search')
   *
   * const stream = searchStream({ query: 'AI documents' })
   *
   * for await (const chunk of stream) {
   *   process.stdout.write(chunk)
   * }
   * ```
   */
  createStreamingExecutor(
    toolName: string
  ): (args: Record<string, unknown>, options?: VercelStreamOptions) => AsyncIterable<string> {
    return (args: Record<string, unknown>, options?: VercelStreamOptions) => {
      return this.executeWithStreaming(toolName, args, options)
    }
  }

  /**
   * Execute a tool with streaming response
   *
   * @param toolName - Tool name
   * @param args - Tool arguments
   * @param options - Stream options
   * @yields String chunks of the response
   */
  private async *executeWithStreaming(
    toolName: string,
    args: Record<string, unknown>,
    options?: VercelStreamOptions
  ): AsyncGenerator<string, void, undefined> {
    const response = await this.callTool(toolName, args)
    const content = this.extractTextContent(response)

    const shouldStream = options?.stream ?? this.defaultStreaming
    const chunkSize = options?.chunkSize ?? 1024

    if (!shouldStream || content.length <= this.streamingThreshold) {
      yield content
      return
    }

    for await (const chunk of streamTextContent(content, {
      chunkSize,
      ...(options?.signal && { signal: options.signal }),
    })) {
      yield chunk.content
    }
  }

  /**
   * Create a ReadableStream for a tool execution
   *
   * Returns a Web Streams API ReadableStream that can be used
   * with Response objects for HTTP streaming.
   *
   * @param toolName - Tool name
   * @param args - Tool arguments
   * @returns ReadableStream of response chunks
   *
   * @example
   * ```typescript
   * // In a Next.js API route
   * export async function POST(req: Request) {
   *   const { toolName, args } = await req.json()
   *   const stream = adapter.createReadableStream(toolName, args)
   *   return new Response(stream)
   * }
   * ```
   */
  createReadableStream(
    toolName: string,
    args: Record<string, unknown>
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    const adapter = this

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of adapter.executeWithStreaming(toolName, args)) {
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })
  }

  /**
   * Create a tool wrapper compatible with Vercel AI SDK's `tool()` helper
   *
   * This creates a tool definition that can be used directly with the
   * `tool()` helper from the `ai` package.
   *
   * @param mcpToolName - MCP tool name
   * @returns Tool configuration object
   *
   * @example
   * ```typescript
   * import { tool } from 'ai'
   *
   * const searchTool = adapter.createToolWrapper('search')
   *
   * // Use with generateText
   * const result = await generateText({
   *   model: openai('gpt-4'),
   *   tools: { search: searchTool },
   *   prompt: 'Find documents',
   * })
   * ```
   */
  createToolWrapper(mcpToolName: string): VercelCoreTool | undefined {
    return this.toolCache.get(mcpToolName)
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Vercel AI SDK adapter for an MCP server
 *
 * @param config - Adapter configuration
 * @returns Configured VercelAdapter instance
 *
 * @example
 * ```typescript
 * const adapter = createVercelAdapter({
 *   server: mcpServer,
 *   retry: { maxRetries: 3 },
 *   streamingThreshold: 10000,
 * })
 *
 * await adapter.initialize()
 * const tools = await adapter.getTools()
 * ```
 */
export function createVercelAdapter(config: VercelAdapterConfig): VercelAdapter {
  return new VercelAdapter(config)
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert Vercel tool results to continuation messages
 *
 * Formats tool results for inclusion in the next model request.
 *
 * @param results - Array of tool results
 * @returns Formatted tool results for API
 */
export function formatToolResults(results: VercelToolResult[]): Array<{
  type: 'tool-result'
  toolCallId: string
  toolName: string
  result: string
}> {
  return results.map((result) => ({
    type: 'tool-result' as const,
    toolCallId: result.toolCallId,
    toolName: result.toolName,
    result: result.result,
  }))
}
