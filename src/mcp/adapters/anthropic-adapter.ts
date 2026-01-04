/**
 * Anthropic SDK Adapter for MCP
 *
 * Adapts MCP server tools to Anthropic's tool calling format.
 * Supports Claude models with tool use capabilities.
 *
 * Features:
 * - Converts MCP tool definitions to Anthropic format
 * - Handles tool call execution with retry and timeout
 * - Supports streaming responses for large outputs
 * - Provides proper error mapping to Anthropic error types
 *
 * @see https://docs.anthropic.com/claude/docs/tool-use
 */

import { BaseAdapter, type BaseAdapterConfig, type ToolCallResult } from './base-adapter'
import type { McpToolDefinition, McpToolResponse, JsonSchema } from '../types'
import { McpError, McpErrorCode, ToolNotFoundError, ToolExecutionError } from './errors'
import {
  streamTextContent,
  streamToWebSocket,
  collectStreamToResponse,
  type StreamOptions,
  type WebSocketStreamConfig,
} from './streaming'

// =============================================================================
// Anthropic Tool Types
// =============================================================================

/**
 * Anthropic tool parameter definition
 */
export interface AnthropicToolParameter {
  type: string
  description?: string
  enum?: string[]
  items?: AnthropicToolParameter
  properties?: Record<string, AnthropicToolParameter>
  required?: string[]
}

/**
 * Anthropic tool definition format
 *
 * @see https://docs.anthropic.com/claude/docs/tool-use#defining-tools
 */
export interface AnthropicTool {
  /** Tool name (alphanumeric and underscores only) */
  name: string
  /** Human-readable description */
  description: string
  /** JSON Schema for input parameters */
  input_schema: {
    type: 'object'
    properties: Record<string, AnthropicToolParameter>
    required?: string[]
  }
}

/**
 * Anthropic tool use block in assistant message
 */
export interface AnthropicToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Anthropic tool result block for user message
 */
export interface AnthropicToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string | AnthropicToolResultContent[]
  is_error?: boolean
}

/**
 * Content types within tool results
 */
export interface AnthropicToolResultContent {
  type: 'text' | 'image'
  text?: string
  source?: {
    type: 'base64'
    media_type: string
    data: string
  }
}

/**
 * Anthropic API error response structure
 */
export interface AnthropicApiError {
  type: 'error'
  error: {
    type: string
    message: string
  }
}

// =============================================================================
// Adapter Configuration
// =============================================================================

/**
 * Anthropic adapter configuration
 */
export interface AnthropicAdapterConfig extends BaseAdapterConfig {
  /** Maximum content length before streaming (default: 100KB) */
  streamingThreshold?: number
  /** Whether to include detailed error messages (default: true in dev) */
  verboseErrors?: boolean
  /** Custom tool name transformer */
  transformToolName?: (name: string) => string
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_STREAMING_THRESHOLD = 100 * 1024 // 100KB
const ANTHROPIC_TOOL_NAME_REGEX = /^[a-zA-Z0-9_]+$/

// =============================================================================
// Anthropic Adapter Class
// =============================================================================

/**
 * Anthropic SDK Adapter
 *
 * Converts MCP tools to Anthropic's tool format and handles
 * tool execution with proper error handling and streaming support.
 *
 * @example
 * ```typescript
 * const mcpServer = createMcpServer({ dbAccess })
 * const adapter = new AnthropicAdapter({
 *   server: mcpServer,
 *   retry: { maxRetries: 3 },
 *   timeout: { requestTimeoutMs: 30000 },
 * })
 *
 * await adapter.initialize()
 *
 * // Get tools for Anthropic API
 * const tools = await adapter.getTools()
 *
 * // Handle tool use from Claude response
 * const result = await adapter.handleToolUse(toolUseBlock)
 * ```
 */
export class AnthropicAdapter extends BaseAdapter {
  private readonly streamingThreshold: number
  private readonly verboseErrors: boolean
  private readonly transformToolName: (name: string) => string
  private toolCache: Map<string, AnthropicTool> = new Map()
  private initialized = false

  constructor(config: AnthropicAdapterConfig) {
    super(config)
    this.streamingThreshold = config.streamingThreshold ?? DEFAULT_STREAMING_THRESHOLD
    this.verboseErrors = config.verboseErrors ?? process.env.NODE_ENV === 'development'
    this.transformToolName = config.transformToolName ?? this.defaultToolNameTransform.bind(this)
  }

  /**
   * Adapter name for logging
   */
  get adapterName(): string {
    return 'anthropic'
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Initialize the adapter
   *
   * Fetches all available tools from the MCP server and converts
   * them to Anthropic format. Caches the converted tools for reuse.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    this.log('info', 'Initializing Anthropic adapter')

    try {
      const mcpTools = await this.server.listTools()

      for (const tool of mcpTools) {
        const anthropicTool = this.convertTool(tool)
        this.toolCache.set(tool.name, anthropicTool)
        this.log('debug', `Registered tool: ${tool.name} -> ${anthropicTool.name}`)
      }

      this.initialized = true
      this.log('info', `Anthropic adapter initialized with ${this.toolCache.size} tools`)
    } catch (error) {
      this.log('error', 'Failed to initialize Anthropic adapter', { error })
      throw McpError.fromError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Cleanup adapter resources
   */
  async cleanup(): Promise<void> {
    this.toolCache.clear()
    this.initialized = false
    this.log('info', 'Anthropic adapter cleaned up')
  }

  // ===========================================================================
  // Tool Conversion
  // ===========================================================================

  /**
   * Default tool name transformation
   *
   * Anthropic requires tool names to match [a-zA-Z0-9_]+
   */
  private defaultToolNameTransform(name: string): string {
    // Replace invalid characters with underscores
    let transformed = name.replace(/[^a-zA-Z0-9_]/g, '_')

    // Remove leading/trailing underscores
    transformed = transformed.replace(/^_+|_+$/g, '')

    // Ensure it starts with a letter (prepend 'tool_' if needed)
    if (!/^[a-zA-Z]/.test(transformed)) {
      transformed = 'tool_' + transformed
    }

    return transformed
  }

  /**
   * Convert MCP tool definition to Anthropic format
   */
  private convertTool(mcpTool: McpToolDefinition): AnthropicTool {
    const name = this.transformToolName(mcpTool.name)

    if (!ANTHROPIC_TOOL_NAME_REGEX.test(name)) {
      throw new McpError(
        McpErrorCode.InvalidParams,
        `Invalid tool name after transformation: ${name}`
      )
    }

    return {
      name,
      description: mcpTool.description,
      input_schema: this.convertInputSchema(mcpTool.inputSchema),
    }
  }

  /**
   * Convert MCP JSON Schema to Anthropic input schema format
   */
  private convertInputSchema(schema: JsonSchema): AnthropicTool['input_schema'] {
    const properties: Record<string, AnthropicToolParameter> = {}

    if (schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        properties[key] = this.convertSchemaProperty(value)
      }
    }

    return {
      type: 'object',
      properties,
      required: schema.required,
    }
  }

  /**
   * Convert a single schema property
   */
  private convertSchemaProperty(prop: JsonSchema | { type: string; description?: string }): AnthropicToolParameter {
    const param: AnthropicToolParameter = {
      type: prop.type,
      description: prop.description,
    }

    if ('enum' in prop && prop.enum) {
      param.enum = prop.enum as string[]
    }

    if ('items' in prop && prop.items) {
      param.items = this.convertSchemaProperty(prop.items as JsonSchema)
    }

    if ('properties' in prop && prop.properties) {
      param.properties = {}
      for (const [key, value] of Object.entries(prop.properties)) {
        param.properties[key] = this.convertSchemaProperty(value)
      }
      if ('required' in prop && prop.required) {
        param.required = prop.required as string[]
      }
    }

    return param
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get all tools in Anthropic format
   *
   * Returns an array of tool definitions suitable for use with
   * the Anthropic API's `tools` parameter.
   *
   * @returns Array of Anthropic tool definitions
   *
   * @example
   * ```typescript
   * const tools = await adapter.getTools()
   *
   * const response = await anthropic.messages.create({
   *   model: 'claude-3-opus-20240229',
   *   tools,
   *   messages: [{ role: 'user', content: 'Search for documents' }],
   * })
   * ```
   */
  async getTools(): Promise<AnthropicTool[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    return Array.from(this.toolCache.values())
  }

  /**
   * Handle a tool use block from Claude's response
   *
   * Executes the requested tool and returns a tool result block
   * suitable for inclusion in the next user message.
   *
   * @param toolUse - Tool use block from assistant message
   * @returns Tool result block for user message
   *
   * @example
   * ```typescript
   * // In message handling loop:
   * if (block.type === 'tool_use') {
   *   const result = await adapter.handleToolUse(block)
   *   userMessage.content.push(result)
   * }
   * ```
   */
  async handleToolUse(toolUse: AnthropicToolUse): Promise<AnthropicToolResult> {
    const startTime = Date.now()

    this.log('debug', `Handling tool use: ${toolUse.name}`, {
      id: toolUse.id,
      hasInput: Object.keys(toolUse.input).length > 0,
    })

    try {
      // Find the original MCP tool name
      const mcpToolName = this.findMcpToolName(toolUse.name)

      if (!mcpToolName) {
        throw new ToolNotFoundError(toolUse.name)
      }

      // Execute the tool
      const response = await this.callTool(mcpToolName, toolUse.input)

      // Convert to Anthropic format
      return this.convertToolResponse(toolUse.id, response)
    } catch (error) {
      const mcpError = McpError.fromError(
        error instanceof Error ? error : new Error(String(error))
      )

      this.log('error', `Tool use failed: ${toolUse.name}`, {
        id: toolUse.id,
        error: mcpError.message,
        duration: Date.now() - startTime,
      })

      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: this.formatErrorContent(mcpError),
        is_error: true,
      }
    }
  }

  /**
   * Handle multiple tool uses in parallel
   *
   * Executes multiple tool calls concurrently with configurable
   * concurrency limit.
   *
   * @param toolUses - Array of tool use blocks
   * @param concurrency - Maximum concurrent executions (default: 5)
   * @returns Array of tool result blocks
   */
  async handleToolUses(
    toolUses: AnthropicToolUse[],
    concurrency = 5
  ): Promise<AnthropicToolResult[]> {
    const results: AnthropicToolResult[] = []
    const executing: Promise<void>[] = []

    for (const toolUse of toolUses) {
      const promise = this.handleToolUse(toolUse).then((result) => {
        results.push(result)
      })

      executing.push(promise)

      if (executing.length >= concurrency) {
        await Promise.race(executing)
        // Remove completed promises
        const completed = await Promise.allSettled(executing)
        executing.length = 0
        for (let i = 0; i < completed.length; i++) {
          if (completed[i].status === 'pending') {
            executing.push(executing[i])
          }
        }
      }
    }

    await Promise.all(executing)
    return results
  }

  /**
   * Execute a tool with streaming response
   *
   * For large responses, streams the content through a WebSocket
   * or returns an async iterator for custom handling.
   *
   * @param toolUse - Tool use block
   * @param wsConfig - Optional WebSocket configuration for streaming
   * @returns Tool result or stream
   */
  async handleToolUseStreaming(
    toolUse: AnthropicToolUse,
    wsConfig?: WebSocketStreamConfig
  ): Promise<AnthropicToolResult | AsyncIterable<string>> {
    const mcpToolName = this.findMcpToolName(toolUse.name)

    if (!mcpToolName) {
      throw new ToolNotFoundError(toolUse.name)
    }

    const response = await this.callTool(mcpToolName, toolUse.input)
    const content = this.extractTextContent(response)

    // Check if streaming is needed
    if (content.length <= this.streamingThreshold) {
      return this.convertToolResponse(toolUse.id, response)
    }

    // Stream the content
    const stream = streamTextContent(content)

    if (wsConfig) {
      await streamToWebSocket(stream, {
        ...wsConfig,
        requestId: wsConfig.requestId ?? toolUse.id,
      })

      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: '[Content streamed via WebSocket]',
      }
    }

    // Return async iterator for custom handling
    return (async function* () {
      for await (const chunk of streamTextContent(content)) {
        yield chunk.content
      }
    })()
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Find the original MCP tool name from an Anthropic tool name
   */
  private findMcpToolName(anthropicName: string): string | undefined {
    // First, try direct match
    for (const [mcpName, tool] of this.toolCache) {
      if (tool.name === anthropicName) {
        return mcpName
      }
    }
    return undefined
  }

  /**
   * Convert MCP tool response to Anthropic format
   */
  private convertToolResponse(
    toolUseId: string,
    response: McpToolResponse
  ): AnthropicToolResult {
    const content = this.extractTextContent(response)

    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content,
      is_error: response.isError,
    }
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

  /**
   * Format error content for tool result
   */
  private formatErrorContent(error: McpError): string {
    if (this.verboseErrors) {
      return JSON.stringify({
        error: error.message,
        code: error.code,
        retryable: error.retryable,
        data: error.data,
      })
    }

    return JSON.stringify({
      error: error.message,
    })
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an Anthropic adapter for an MCP server
 *
 * @param config - Adapter configuration
 * @returns Configured AnthropicAdapter instance
 *
 * @example
 * ```typescript
 * const adapter = createAnthropicAdapter({
 *   server: mcpServer,
 *   retry: { maxRetries: 3 },
 * })
 *
 * await adapter.initialize()
 * const tools = await adapter.getTools()
 * ```
 */
export function createAnthropicAdapter(config: AnthropicAdapterConfig): AnthropicAdapter {
  return new AnthropicAdapter(config)
}
