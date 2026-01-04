/**
 * MCP SDK Adapters
 *
 * Provides adapters for integrating MCP servers with popular AI SDKs:
 *
 * - **Anthropic Adapter**: For Claude models via Anthropic's SDK
 * - **Vercel Adapter**: For Vercel AI SDK (compatible with OpenAI, Anthropic, etc.)
 *
 * ## Features
 *
 * - **Error Handling**: Proper MCP error responses with retry logic
 * - **Timeout Handling**: Configurable timeouts with AbortController
 * - **Streaming Support**: Stream large responses efficiently
 * - **WebSocket Integration**: Real-time streaming over WebSocket
 *
 * ## Quick Start
 *
 * ### Anthropic SDK
 *
 * ```typescript
 * import { createMcpServer } from '../server'
 * import { createAnthropicAdapter } from './adapters'
 *
 * const server = createMcpServer({ dbAccess })
 * const adapter = createAnthropicAdapter({ server })
 *
 * await adapter.initialize()
 * const tools = await adapter.getTools()
 *
 * // Use with Anthropic SDK
 * const response = await anthropic.messages.create({
 *   model: 'claude-3-opus-20240229',
 *   tools,
 *   messages: [{ role: 'user', content: 'Search for documents' }],
 * })
 * ```
 *
 * ### Vercel AI SDK
 *
 * ```typescript
 * import { generateText } from 'ai'
 * import { createMcpServer } from '../server'
 * import { createVercelAdapter } from './adapters'
 *
 * const server = createMcpServer({ dbAccess })
 * const adapter = createVercelAdapter({ server })
 *
 * await adapter.initialize()
 * const tools = await adapter.getTools()
 *
 * const result = await generateText({
 *   model: openai('gpt-4'),
 *   tools,
 *   prompt: 'Search for AI documents',
 * })
 * ```
 *
 * @module mcp/adapters
 */

// =============================================================================
// Error Types and Utilities
// =============================================================================

export {
  // Error codes
  McpErrorCode,
  type McpErrorCodeType,

  // Error data types
  type McpErrorData,
  type McpErrorResponse,

  // Error classes
  McpError,
  ConnectionError,
  TimeoutError,
  RateLimitError,
  AuthenticationError,
  ToolNotFoundError,
  ToolExecutionError,
  InvalidParamsError,

  // Error utilities
  isTransientErrorCode,
  classifyError,
  isRetryableError,
  getRetryDelay,
  wrapWithMcpError,
  createErrorResponse,
} from './errors'

// =============================================================================
// Base Adapter
// =============================================================================

export {
  BaseAdapter,

  // Configuration types
  type RetryConfig,
  type TimeoutConfig,
  type LogConfig,
  type BaseAdapterConfig,

  // Result types
  type ToolCallResult,
  type BatchOptions,
} from './base-adapter'

// =============================================================================
// Streaming Utilities
// =============================================================================

export {
  // Stream types
  type StreamChunk,
  type StreamProgressCallback,
  type StreamOptions,
  type WebSocketMessageType,
  type WebSocketMessage,

  // Content streaming
  streamTextContent,
  streamFileContent,

  // Search streaming
  type SearchStreamOptions,
  type SearchResultItem,
  streamSearchResults,

  // WebSocket integration
  type WebSocketStreamConfig,
  streamToWebSocket,

  // MCP response streaming
  collectStreamToResponse,
  streamToMcpContent,

  // Stream utilities
  combineStreams,
  rateLimitStream,
  bufferStream,
} from './streaming'

// =============================================================================
// Anthropic Adapter
// =============================================================================

export {
  AnthropicAdapter,
  createAnthropicAdapter,

  // Anthropic types
  type AnthropicAdapterConfig,
  type AnthropicTool,
  type AnthropicToolParameter,
  type AnthropicToolUse,
  type AnthropicToolResult,
  type AnthropicToolResultContent,
  type AnthropicApiError,
} from './anthropic-adapter'

// =============================================================================
// Vercel Adapter
// =============================================================================

export {
  VercelAdapter,
  createVercelAdapter,
  formatToolResults,

  // Vercel types
  type VercelAdapterConfig,
  type VercelToolParameters,
  type VercelCoreTool,
  type VercelToolCall,
  type VercelToolResult,
  type VercelStreamable,
  type VercelStreamOptions,
} from './vercel-adapter'
