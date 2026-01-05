/**
 * MCP (Model Context Protocol) module
 *
 * Provides:
 * - Core MCP types and protocol messages
 * - MCP Server factory for creating server instances
 * - DatabaseProxy WorkerEntrypoint for sandboxed database access
 * - SDK adapters for Anthropic and Vercel AI SDK integration
 */

// Core types (excluding DatabaseAccess which is also exported from server)
export {
  type ToolAnnotations,
  type JsonSchema,
  type McpToolDefinition,
  type SearchResult,
  type SearchResponse,
  type FetchResult,
  type DoResult,
  type McpTextContent,
  type McpImageContent,
  type McpResourceContent,
  type McpContent,
  type McpToolResponse,
  type McpRequest,
  type McpInitializeRequest,
  type McpToolsListRequest,
  type McpToolsCallRequest,
  type McpResponse,
  type McpInitializeResponse,
  type McpToolsListResponse,
  type McpToolsCallResponse,
  type McpToolHandler,
  type McpRegisteredTool,
  type FindOptions,
  ToolAnnotationsSchema,
  JsonSchemaSchema,
  McpToolDefinitionSchema,
  SearchResultSchema,
  SearchResponseSchema,
  FetchResultSchema,
  DoResultSchema,
  McpTextContentSchema,
  McpImageContentSchema,
  McpResourceContentSchema,
  McpContentSchema,
  McpToolResponseSchema,
  McpRequestSchema,
  McpInitializeParamsSchema,
  McpToolsCallParamsSchema,
  McpResponseSchema,
  FindOptionsSchema,
} from './types';

// Server factory (includes DatabaseAccess)
export {
  createMcpServer,
  createMockDatabaseAccess,
  type McpServer,
  type McpServerConfig,
  type CodeLoader,
  type DatabaseAccess,
} from './server';

// Sandbox module with DatabaseProxy
export * from './sandbox';

// SDK adapters for AI integration
export * from './adapters';

// Transport implementations (HTTP and stdio)
export * from './transport';
