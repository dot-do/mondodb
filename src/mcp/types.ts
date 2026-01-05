/**
 * MCP (Model Context Protocol) Core Types
 *
 * Implements types for:
 * - MCP protocol messages (JSON-RPC 2.0 based)
 * - Tool definitions and annotations
 * - OpenAI Deep Research compatible response formats (SearchResult, FetchResult, DoResult)
 * - Zod schemas for runtime validation
 * - Utility type guards for runtime type checking
 * - Response builder functions for creating MCP responses
 *
 * @packageDocumentation
 * @module mcp/types
 */

import { z } from 'zod'

// =============================================================================
// Tool Annotations (MCP Spec 2025-11-25)
// =============================================================================

/**
 * Tool annotations provide hints about tool behavior.
 * These are advisory only - clients should not rely on them for security.
 *
 * @remarks
 * Annotations help AI agents and clients understand tool characteristics
 * without needing to execute them. They follow the MCP specification's
 * tool annotation guidelines.
 *
 * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools
 *
 * @example
 * ```typescript
 * const searchAnnotations: ToolAnnotations = {
 *   title: 'Search Documents',
 *   readOnlyHint: true,      // Safe to call - no side effects
 *   destructiveHint: false,  // Won't delete or modify data
 *   idempotentHint: true,    // Same input = same output
 *   openWorldHint: false,    // Only interacts with local database
 * }
 * ```
 */
export interface ToolAnnotations {
  /** Human-readable title for UI display */
  title?: string
  /**
   * Tool does not modify state (like HTTP GET).
   * When true, the tool is safe to call repeatedly without side effects.
   */
  readOnlyHint?: boolean
  /**
   * Tool may make irreversible changes.
   * When true, clients should confirm with users before executing.
   */
  destructiveHint?: boolean
  /**
   * Repeated calls have same effect as single call.
   * When true, the tool is safe to retry on failure.
   */
  idempotentHint?: boolean
  /**
   * Interacts with external systems (network, APIs, etc.).
   * When true, results may vary based on external state.
   */
  openWorldHint?: boolean
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * JSON Schema type for tool input validation.
 *
 * @remarks
 * This is a simplified JSON Schema representation used for defining
 * tool input parameters. It supports the most common JSON Schema features
 * needed for MCP tool definitions.
 *
 * @see https://json-schema.org/
 *
 * @example
 * ```typescript
 * const schema: JsonSchema = {
 *   type: 'object',
 *   properties: {
 *     query: { type: 'string', description: 'Search query' },
 *     limit: { type: 'number', description: 'Max results' },
 *   },
 *   required: ['query'],
 * }
 * ```
 */
export interface JsonSchema {
  /** JSON Schema type (object, string, number, array, boolean, etc.) */
  type: string
  /** Property definitions for object types */
  properties?: Record<string, JsonSchema | { type: string; description?: string }>
  /** List of required property names */
  required?: string[]
  /** Human-readable description of this schema */
  description?: string
  /** Schema for array items */
  items?: JsonSchema
  /** Allow additional JSON Schema properties */
  [key: string]: unknown
}

/**
 * MCP Tool Definition - describes a tool that can be called by AI agents.
 *
 * @remarks
 * Tool definitions follow the MCP specification and include:
 * - A unique name for tool invocation
 * - A description for AI agent understanding
 * - An input schema for parameter validation
 * - Optional annotations for behavior hints
 *
 * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools
 *
 * @example
 * ```typescript
 * const searchTool: McpToolDefinition = {
 *   name: 'search',
 *   description: 'Search for documents in the database',
 *   inputSchema: {
 *     type: 'object',
 *     properties: {
 *       query: { type: 'string', description: 'Search query' },
 *     },
 *     required: ['query'],
 *   },
 *   annotations: {
 *     readOnlyHint: true,
 *     idempotentHint: true,
 *   },
 * }
 * ```
 */
export interface McpToolDefinition {
  /** Unique tool name used for invocation */
  name: string
  /** Human-readable description explaining what the tool does */
  description: string
  /** JSON Schema defining the tool's input parameters */
  inputSchema: JsonSchema
  /** Optional annotations providing hints about tool behavior */
  annotations?: ToolAnnotations
}

// =============================================================================
// OpenAI Deep Research Standard Response Types
// =============================================================================

/**
 * Search result returned by search operations.
 * Compatible with OpenAI Deep Research format.
 *
 * @remarks
 * SearchResult provides a standardized format for search results that works
 * with AI agents expecting the OpenAI Deep Research response format.
 * The id format is `database.collection.ObjectId` and url is `mongodb://database/collection/ObjectId`.
 *
 * @example
 * ```typescript
 * const result: SearchResult = {
 *   id: 'mydb.users.507f1f77bcf86cd799439011',
 *   title: 'John Doe',
 *   url: 'mongodb://mydb/users/507f1f77bcf86cd799439011',
 *   text: '{"name": "John Doe", "email": "john@example.com"}',
 * }
 * ```
 */
export interface SearchResult {
  /** Unique identifier in format: database.collection.ObjectId */
  id: string
  /** Document title or summary for display */
  title: string
  /** Resource URL in format: mongodb://database/collection/ObjectId */
  url: string
  /** Preview text snippet (typically JSON) */
  text: string
}

/**
 * Search response containing an array of search results.
 * Compatible with OpenAI Deep Research format.
 *
 * @example
 * ```typescript
 * const response: SearchResponse = {
 *   results: [
 *     { id: 'db.coll.123', title: 'Doc 1', url: 'mongodb://db/coll/123', text: '...' },
 *     { id: 'db.coll.456', title: 'Doc 2', url: 'mongodb://db/coll/456', text: '...' },
 *   ],
 * }
 * ```
 */
export interface SearchResponse {
  /** Array of search results */
  results: SearchResult[]
}

/**
 * Fetch result returned when fetching a full document.
 * Compatible with OpenAI Deep Research format.
 *
 * @remarks
 * FetchResult extends SearchResult with full document content and metadata.
 * The text field contains the complete JSON-stringified document.
 *
 * @example
 * ```typescript
 * const result: FetchResult = {
 *   id: 'mydb.users.507f1f77bcf86cd799439011',
 *   title: 'John Doe',
 *   url: 'mongodb://mydb/users/507f1f77bcf86cd799439011',
 *   text: JSON.stringify({ _id: '507f1f77bcf86cd799439011', name: 'John Doe' }),
 *   metadata: {
 *     database: 'mydb',
 *     collection: 'users',
 *     _id: '507f1f77bcf86cd799439011',
 *   },
 * }
 * ```
 */
export interface FetchResult {
  /** Unique identifier in format: database.collection.ObjectId */
  id: string
  /** Document title or summary for display */
  title: string
  /** Resource URL in format: mongodb://database/collection/ObjectId */
  url: string
  /** Full document content (JSON stringified) */
  text: string
  /** Document location metadata */
  metadata: {
    /** Database name */
    database: string
    /** Collection name */
    collection: string
    /** Document ObjectId */
    _id: string
  }
}

/**
 * Result returned by the "do" tool after executing code.
 *
 * @remarks
 * DoResult represents the outcome of executing arbitrary JavaScript code
 * in a sandboxed environment. It includes success status, result data,
 * execution logs, and error information when applicable.
 *
 * @example Success case
 * ```typescript
 * const success: DoResult = {
 *   success: true,
 *   result: { count: 42, documents: [...] },
 *   logs: ['Processing started', 'Found 42 documents'],
 *   duration: 150,
 * }
 * ```
 *
 * @example Error case
 * ```typescript
 * const error: DoResult = {
 *   success: false,
 *   error: 'ReferenceError: undefined variable',
 *   hints: ['Check variable spelling', 'Ensure all imports are correct'],
 *   code: {
 *     source: 'return unknownVar',
 *     language: 'javascript',
 *     errorLines: [1],
 *   },
 *   duration: 5,
 * }
 * ```
 */
export interface DoResult {
  /** Whether the code execution succeeded */
  success: boolean
  /** The return value from code execution */
  result?: unknown
  /** Console output and execution logs */
  logs?: string[]
  /** Error message if execution failed */
  error?: string
  /** Execution duration in milliseconds */
  duration?: number
  /** Debugging hints when errors occur */
  hints?: string[]
  /** Source code metadata for display and debugging */
  code?: {
    /** Original source code that was executed */
    source: string
    /** Detected programming language */
    language: 'javascript' | 'typescript'
    /** Line numbers where errors occurred (for highlighting) */
    errorLines?: number[]
  }
  /** Non-fatal warnings generated during execution */
  warnings?: string[]
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
  hints: z.array(z.string()).optional(),
  code: z.object({
    source: z.string(),
    language: z.enum(['javascript', 'typescript']),
    errorLines: z.array(z.number()).optional(),
  }).optional(),
  warnings: z.array(z.string()).optional(),
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
