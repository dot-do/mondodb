/**
 * MCP (Model Context Protocol) Core Types
 *
 * Implements types for:
 * - MCP protocol messages (JSON-RPC 2.0 based)
 * - Tool definitions and annotations
 * - OpenAI Deep Research compatible response formats (SearchResult, FetchResult, DoResult)
 * - Zod schemas for runtime validation
 */

import { z } from 'zod'

// =============================================================================
// Tool Annotations (MCP Spec 2024-11-05)
// =============================================================================

/**
 * Annotations providing hints about tool behavior
 */
export interface ToolAnnotations {
  /** Human-readable title for the tool */
  title?: string
  /** If true, the tool only reads data and has no side effects */
  readOnlyHint?: boolean
  /** If true, the tool may perform destructive operations */
  destructiveHint?: boolean
  /** If true, calling with same args produces same result */
  idempotentHint?: boolean
  /** If true, tool interacts with external world */
  openWorldHint?: boolean
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * JSON Schema type for tool input validation
 */
export interface JsonSchema {
  type: string
  properties?: Record<string, JsonSchema | { type: string; description?: string }>
  required?: string[]
  description?: string
  items?: JsonSchema
  [key: string]: unknown
}

/**
 * MCP Tool Definition - describes a tool that can be called by AI agents
 */
export interface McpToolDefinition {
  /** Unique tool name */
  name: string
  /** Human-readable description */
  description: string
  /** JSON Schema for input validation */
  inputSchema: JsonSchema
  /** Optional behavior hints */
  annotations?: ToolAnnotations
}

// =============================================================================
// OpenAI Deep Research Standard Response Types
// =============================================================================

/**
 * Search result - returned by search operations
 * Compatible with OpenAI Deep Research format
 */
export interface SearchResult {
  /** Unique identifier: database.collection.ObjectId */
  id: string
  /** Document title or summary */
  title: string
  /** Resource URL: mongodb://database/collection/ObjectId */
  url: string
  /** Preview text snippet */
  text: string
}

/**
 * Search response - contains an array of search results
 * Compatible with OpenAI Deep Research format
 */
export interface SearchResponse {
  /** Array of search results */
  results: SearchResult[]
}

/**
 * Fetch result - returned when fetching full document
 * Compatible with OpenAI Deep Research format
 */
export interface FetchResult {
  /** Unique identifier: database.collection.ObjectId */
  id: string
  /** Document title or summary */
  title: string
  /** Resource URL: mongodb://database/collection/ObjectId */
  url: string
  /** Full document text (JSON stringified) */
  text: string
  /** Document metadata */
  metadata: {
    database: string
    collection: string
    _id: string
  }
}

/**
 * Do result - returned by mutation operations
 */
export interface DoResult {
  /** Whether the operation succeeded */
  success: boolean
  /** Operation result data */
  result?: unknown
  /** Operation logs */
  logs?: string[]
  /** Error message if failed */
  error?: string
  /** Duration in milliseconds */
  duration?: number
}

// =============================================================================
// MCP Content Types
// =============================================================================

/**
 * Text content block
 */
export interface McpTextContent {
  type: 'text'
  text: string
}

/**
 * Image content block (for future use)
 */
export interface McpImageContent {
  type: 'image'
  data: string
  mimeType: string
}

/**
 * Resource content block (for future use)
 */
export interface McpResourceContent {
  type: 'resource'
  resource: {
    uri: string
    text?: string
    blob?: string
  }
}

/**
 * Union of all content types
 */
export type McpContent = McpTextContent | McpImageContent | McpResourceContent

/**
 * Tool response - returned from tool execution
 */
export interface McpToolResponse {
  /** Content blocks */
  content: McpTextContent[]
  /** Whether this is an error response */
  isError?: boolean
}

// =============================================================================
// MCP Protocol Messages (JSON-RPC 2.0)
// =============================================================================

/**
 * Base MCP request structure
 */
export interface McpRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

/**
 * Initialize request - sent by client to start session
 */
export interface McpInitializeRequest extends McpRequest {
  method: 'initialize'
  params: {
    protocolVersion: string
    capabilities: Record<string, unknown>
    clientInfo: {
      name: string
      version: string
    }
  }
}

/**
 * Tools list request - client asks for available tools
 */
export interface McpToolsListRequest extends McpRequest {
  method: 'tools/list'
  params?: {
    cursor?: string
  }
}

/**
 * Tools call request - client invokes a tool
 */
export interface McpToolsCallRequest extends McpRequest {
  method: 'tools/call'
  params: {
    name: string
    arguments?: Record<string, unknown>
  }
}

/**
 * MCP response structure
 */
export interface McpResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * Initialize response
 */
export interface McpInitializeResponse extends McpResponse {
  result: {
    protocolVersion: string
    capabilities: {
      tools?: Record<string, unknown>
    }
    serverInfo: {
      name: string
      version: string
    }
  }
}

/**
 * Tools list response
 */
export interface McpToolsListResponse extends McpResponse {
  result: {
    tools: McpToolDefinition[]
    nextCursor?: string
  }
}

/**
 * Tools call response
 */
export interface McpToolsCallResponse extends McpResponse {
  result: McpToolResponse
}

// =============================================================================
// Tool Handler Types
// =============================================================================

/**
 * Tool handler function signature
 */
export type McpToolHandler<T = Record<string, unknown>> = (
  args: T
) => Promise<McpToolResponse>

/**
 * Registered tool with definition and handler
 */
export interface McpRegisteredTool {
  definition: McpToolDefinition
  handler: McpToolHandler
}

// =============================================================================
// Database Access Interface (for tool implementations)
// =============================================================================

/**
 * Find options for querying documents
 */
export interface FindOptions {
  limit?: number
  skip?: number
  sort?: Record<string, 1 | -1>
  projection?: Record<string, 0 | 1>
}

/**
 * Database access interface for MCP tools
 * Provides a simplified interface for database operations
 */
export interface DatabaseAccess {
  /** Find a single document matching the filter */
  findOne(
    collection: string,
    filter: Record<string, unknown>
  ): Promise<Record<string, unknown> | null>

  /** Find multiple documents matching the filter */
  find(
    collection: string,
    filter: Record<string, unknown>,
    options?: FindOptions
  ): Promise<Record<string, unknown>[]>

  /** Insert a single document */
  insertOne(
    collection: string,
    document: Record<string, unknown>
  ): Promise<{ insertedId: string }>

  /** Insert multiple documents */
  insertMany(
    collection: string,
    documents: Record<string, unknown>[]
  ): Promise<{ insertedIds: string[] }>

  /** Update a single document */
  updateOne(
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ): Promise<{ matchedCount: number; modifiedCount: number }>

  /** Update multiple documents */
  updateMany(
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ): Promise<{ matchedCount: number; modifiedCount: number }>

  /** Delete a single document */
  deleteOne(
    collection: string,
    filter: Record<string, unknown>
  ): Promise<{ deletedCount: number }>

  /** Delete multiple documents */
  deleteMany(
    collection: string,
    filter: Record<string, unknown>
  ): Promise<{ deletedCount: number }>

  /** Run an aggregation pipeline */
  aggregate(
    collection: string,
    pipeline: Record<string, unknown>[]
  ): Promise<Record<string, unknown>[]>

  /** Count documents matching a filter */
  countDocuments(
    collection: string,
    filter?: Record<string, unknown>
  ): Promise<number>

  /** List all collections in the current database */
  listCollections(): Promise<string[]>

  /** List all databases */
  listDatabases(): Promise<string[]>

  /** Get a proxy for direct database access (for sandboxed execution) */
  getProxy(): DatabaseAccess
}

// =============================================================================
// Zod Schemas for Runtime Validation
// =============================================================================

/**
 * Zod schema for ToolAnnotations
 */
export const ToolAnnotationsSchema = z.object({
  title: z.string().optional(),
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
})

/**
 * Zod schema for JsonSchema (recursive)
 */
export const JsonSchemaSchema: z.ZodType<JsonSchema> = z.lazy(() =>
  z.object({
    type: z.string(),
    properties: z.record(
      z.string(),
      z.union([
        z.lazy(() => JsonSchemaSchema),
        z.object({
          type: z.string(),
          description: z.string().optional(),
        }),
      ])
    ).optional(),
    required: z.array(z.string()).optional(),
    description: z.string().optional(),
    items: z.lazy(() => JsonSchemaSchema).optional(),
  }).passthrough()
) as z.ZodType<JsonSchema>

/**
 * Zod schema for McpToolDefinition
 */
export const McpToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: JsonSchemaSchema,
  annotations: ToolAnnotationsSchema.optional(),
})

/**
 * Zod schema for SearchResult
 */
export const SearchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  text: z.string(),
})

/**
 * Zod schema for SearchResponse
 */
export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
})

/**
 * Zod schema for FetchResult
 */
export const FetchResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  text: z.string(),
  metadata: z.object({
    database: z.string(),
    collection: z.string(),
    _id: z.string(),
  }),
})

/**
 * Zod schema for DoResult
 */
export const DoResultSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  logs: z.array(z.string()).optional(),
  error: z.string().optional(),
  duration: z.number().optional(),
})

/**
 * Zod schema for McpTextContent
 */
export const McpTextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})

/**
 * Zod schema for McpImageContent
 */
export const McpImageContentSchema = z.object({
  type: z.literal('image'),
  data: z.string(),
  mimeType: z.string(),
})

/**
 * Zod schema for McpResourceContent
 */
export const McpResourceContentSchema = z.object({
  type: z.literal('resource'),
  resource: z.object({
    uri: z.string(),
    text: z.string().optional(),
    blob: z.string().optional(),
  }),
})

/**
 * Zod schema for McpContent (union)
 */
export const McpContentSchema = z.union([
  McpTextContentSchema,
  McpImageContentSchema,
  McpResourceContentSchema,
])

/**
 * Zod schema for McpToolResponse
 */
export const McpToolResponseSchema = z.object({
  content: z.array(McpTextContentSchema),
  isError: z.boolean().optional(),
})

/**
 * Zod schema for McpRequest
 */
export const McpRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.unknown().optional(),
})

/**
 * Zod schema for McpInitializeRequest params
 */
export const McpInitializeParamsSchema = z.object({
  protocolVersion: z.string(),
  capabilities: z.record(z.string(), z.unknown()),
  clientInfo: z.object({
    name: z.string(),
    version: z.string(),
  }),
})

/**
 * Zod schema for McpToolsCallRequest params
 */
export const McpToolsCallParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Zod schema for McpResponse
 */
export const McpResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }).optional(),
})

/**
 * Zod schema for FindOptions
 */
export const FindOptionsSchema = z.object({
  limit: z.number().optional(),
  skip: z.number().optional(),
  sort: z.record(z.string(), z.union([z.literal(1), z.literal(-1)])).optional(),
  projection: z.record(z.string(), z.union([z.literal(0), z.literal(1)])).optional(),
})
