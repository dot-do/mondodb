/**
 * MCP Server Factory for mongo.do
 *
 * Creates MCP server instances that provide:
 * - search: Query documents (readonly)
 * - fetch: Retrieve full documents by ID (readonly)
 * - do: Execute secure arbitrary code via Worker Loader sandbox (when loader available)
 */

import type {
  McpToolDefinition,
  McpToolHandler,
  McpToolResponse,
  McpRegisteredTool,
  McpRequest,
  McpResponse,
  McpInitializeRequest,
  McpToolsCallRequest,
} from './types'

// Re-export DatabaseAccess from types for convenience
export type { DatabaseAccess } from './types'

/**
 * Code loader interface for executing JavaScript code in a sandbox
 */
export interface CodeLoader {
  execute(code: string, context?: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; error?: string }>
}

/**
 * Configuration for creating an MCP server
 */
export interface McpServerConfig {
  /** Database access interface for tool implementations */
  dbAccess: DatabaseAccess
  /** Optional code loader for secure code execution (enables 'do' tool) */
  codeLoader?: CodeLoader
  /** Server name (default: 'mongo.do') */
  name?: string
  /** Server version (default: '1.0.0') */
  version?: string
}

/**
 * MCP Server instance
 */
export interface McpServer {
  /** Server name */
  readonly name: string
  /** Server version */
  readonly version: string

  /**
   * Register a tool with the server
   */
  tool<T extends Record<string, unknown>>(
    name: string,
    inputSchema: McpToolDefinition['inputSchema'],
    handler: McpToolHandler<T>,
    annotations?: McpToolDefinition['annotations']
  ): void

  /**
   * Register a tool with definition and handler
   */
  registerTool(tool: McpRegisteredTool): void

  /**
   * List all registered tools
   */
  listTools(): Promise<McpToolDefinition[]>

  /**
   * Call a tool by name
   */
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResponse>

  /**
   * Handle an incoming MCP request (JSON-RPC)
   */
  handleRequest(request: McpRequest): Promise<McpResponse>
}

// Import DatabaseAccess type for the config
import type { DatabaseAccess } from './types'

/**
 * Create an MCP server instance for mongo.do
 *
 * @param config - Server configuration including database access and optional code loader
 * @returns Configured MCP server instance
 */
export function createMcpServer(config: McpServerConfig): McpServer {
  const { dbAccess, codeLoader, name, version } = config
  const serverName = name ?? 'mongo.do'
  const serverVersion = version ?? '1.0.0'
  const tools = new Map<string, McpRegisteredTool>()

  // Create the server instance
  const server: McpServer = {
    name: serverName,
    version: serverVersion,

    tool<T extends Record<string, unknown>>(
      name: string,
      inputSchema: McpToolDefinition['inputSchema'],
      handler: McpToolHandler<T>,
      annotations?: McpToolDefinition['annotations']
    ): void {
      const definition: McpToolDefinition = {
        name,
        description: annotations?.title ?? name,
        inputSchema,
        ...(annotations && { annotations }),
      }
      tools.set(name, {
        definition,
        handler: handler as McpToolHandler,
      })
    },

    registerTool(tool: McpRegisteredTool): void {
      tools.set(tool.definition.name, tool)
    },

    async listTools(): Promise<McpToolDefinition[]> {
      return Array.from(tools.values()).map(t => t.definition)
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResponse> {
      const tool = tools.get(name)
      if (!tool) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Tool '${name}' not found` }) }],
          isError: true,
        }
      }
      try {
        return await tool.handler(args)
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        }
      }
    },

    async handleRequest(request: McpRequest): Promise<McpResponse> {
      const baseResponse = {
        jsonrpc: '2.0' as const,
        id: request.id,
      }

      // Validate JSON-RPC version
      if (request.jsonrpc !== '2.0') {
        return {
          ...baseResponse,
          error: {
            code: -32600,
            message: 'Invalid JSON-RPC version',
          },
        }
      }

      switch (request.method) {
        case 'initialize': {
          const initReq = request as McpInitializeRequest
          return {
            ...baseResponse,
            result: {
              protocolVersion: initReq.params?.protocolVersion ?? '2024-11-05',
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: serverName,
                version: serverVersion,
              },
            },
          }
        }

        case 'tools/list': {
          const toolsList = await server.listTools()
          return {
            ...baseResponse,
            result: {
              tools: toolsList,
            },
          }
        }

        case 'tools/call': {
          const callReq = request as McpToolsCallRequest
          const result = await server.callTool(callReq.params.name, callReq.params.arguments ?? {})
          return {
            ...baseResponse,
            result,
          }
        }

        default:
          return {
            ...baseResponse,
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`,
            },
          }
      }
    },
  }

  // Register the search tool (always available, readonly)
  server.tool<{ query: string; database?: string; collection?: string; limit?: number }>(
    'search',
    {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        database: {
          type: 'string',
          description: 'Database to search in',
        },
        collection: {
          type: 'string',
          description: 'Collection to search in',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
        },
      },
      required: ['query'],
    },
    async (args) => {
      // Validate required field
      if (!args.query) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Missing required field: query' }) }],
          isError: true,
        }
      }
      // Placeholder implementation - will be expanded in search tool issue
      void args.database
      void args.collection
      void args.limit
      void dbAccess
      return {
        content: [{ type: 'text', text: '{"results":[]}' }],
      }
    },
    {
      title: 'Search Documents',
      readOnlyHint: true,
      openWorldHint: true,
    }
  )

  // Register the fetch tool (always available, readonly)
  server.tool<{ id: string }>(
    'fetch',
    {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Document ID in format db.collection.ObjectId',
        },
      },
      required: ['id'],
    },
    async ({ id }) => {
      // Placeholder implementation - will be expanded in fetch tool issue
      void id
      void dbAccess
      return {
        content: [{ type: 'text', text: '{}' }],
      }
    },
    {
      title: 'Fetch Document',
      readOnlyHint: true,
      openWorldHint: true,
    }
  )

  // Register the do tool only if codeLoader is available
  if (codeLoader) {
    server.tool<{ code: string; description?: string }>(
      'do',
      {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'JavaScript code to execute',
          },
          description: {
            type: 'string',
            description: 'What the code does',
          },
        },
        required: ['code'],
      },
      async ({ code, description }) => {
        // Execute code using the code loader
        void description
        void dbAccess
        try {
          const result = await codeLoader.execute(code)
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            isError: !result.success,
          }
        } catch (error) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }) }],
            isError: true,
          }
        }
      },
      {
        title: 'Execute Code',
        readOnlyHint: false,
        destructiveHint: true,
      }
    )
  }

  return server
}

/**
 * Create a mock DatabaseAccess for testing
 */
export function createMockDatabaseAccess(): DatabaseAccess {
  return {
    async findOne() {
      return null
    },
    async find() {
      return []
    },
    async insertOne() {
      return { insertedId: 'mock-id' }
    },
    async insertMany() {
      return { insertedIds: [] }
    },
    async updateOne() {
      return { matchedCount: 0, modifiedCount: 0 }
    },
    async updateMany() {
      return { matchedCount: 0, modifiedCount: 0 }
    },
    async deleteOne() {
      return { deletedCount: 0 }
    },
    async deleteMany() {
      return { deletedCount: 0 }
    },
    async aggregate() {
      return []
    },
    async countDocuments() {
      return 0
    },
    async listCollections() {
      return []
    },
    async listDatabases() {
      return []
    },
    getProxy() {
      return this
    },
  }
}
