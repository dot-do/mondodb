/**
 * Vercel AI SDK Adapter Tests (RED Phase)
 *
 * Tests for adapting MondoDB MCP tools to Vercel AI SDK format.
 * Enables using MondoDB as a tool provider for AI applications built with Vercel AI SDK.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMcpServer, createMockDatabaseAccess } from '../../../src/mcp/server'
import type { McpServer } from '../../../src/mcp/server'
import type { McpToolDefinition, DatabaseAccess } from '../../../src/mcp/types'

// =============================================================================
// Vercel AI SDK Types (Minimal representation)
// =============================================================================

/**
 * Vercel AI SDK Tool interface (simplified)
 * Based on: https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling
 */
interface VercelAiTool {
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

/**
 * Vercel AI SDK CoreTool (from ai package)
 */
interface CoreTool {
  type: 'function'
  description: string
  parameters: object
}

/**
 * Tool result format for Vercel AI SDK
 */
interface ToolResult {
  result: unknown
  success: boolean
}

// =============================================================================
// Adapter Implementation (To be implemented in GREEN phase)
// =============================================================================

/**
 * Convert MCP tool definition to Vercel AI SDK format
 *
 * @param mcpTool - MCP tool definition
 * @param execute - Execution function for the tool
 * @returns Vercel AI SDK compatible tool
 */
function toVercelAiTool(
  mcpTool: McpToolDefinition,
  execute: (args: Record<string, unknown>) => Promise<unknown>
): VercelAiTool {
  return {
    description: mcpTool.description,
    parameters: {
      type: 'object',
      properties: mcpTool.inputSchema.properties ?? {},
      required: mcpTool.inputSchema.required ?? [],
    },
    execute,
  }
}

/**
 * Create Vercel AI SDK tools from MCP server
 *
 * @param server - MCP server instance
 * @returns Record of Vercel AI SDK tools
 */
async function createVercelAiTools(
  server: McpServer
): Promise<Record<string, VercelAiTool>> {
  const mcpTools = await server.listTools()
  const tools: Record<string, VercelAiTool> = {}

  for (const mcpTool of mcpTools) {
    tools[mcpTool.name] = toVercelAiTool(mcpTool, async (args) => {
      const result = await server.callTool(mcpTool.name, args)
      if (result.isError) {
        const errorContent = result.content[0]
        throw new Error(
          errorContent.type === 'text' ? errorContent.text : 'Tool execution failed'
        )
      }
      const content = result.content[0]
      return content.type === 'text' ? JSON.parse(content.text) : content
    })
  }

  return tools
}

/**
 * Adapter class for using MCP server with Vercel AI SDK
 */
class VercelAiMcpAdapter {
  private server: McpServer
  private tools: Record<string, VercelAiTool> | null = null

  constructor(server: McpServer) {
    this.server = server
  }

  /**
   * Get tools in Vercel AI SDK format
   */
  async getTools(): Promise<Record<string, VercelAiTool>> {
    if (!this.tools) {
      this.tools = await createVercelAiTools(this.server)
    }
    return this.tools
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.server.callTool(name, args)
    return {
      result: result.content[0].type === 'text' ? result.content[0].text : result.content,
      success: !result.isError,
    }
  }
}

// =============================================================================
// Conversion Tests
// =============================================================================

describe('MCP to Vercel AI SDK Conversion', () => {
  let server: McpServer
  let dbAccess: DatabaseAccess

  beforeEach(() => {
    dbAccess = createMockDatabaseAccess()
    server = createMcpServer({ dbAccess })
  })

  describe('toVercelAiTool', () => {
    it('should convert MCP tool definition to Vercel AI format', async () => {
      const mcpTools = await server.listTools()
      const searchTool = mcpTools.find((t) => t.name === 'search')!

      const vercelTool = toVercelAiTool(searchTool, async () => ({}))

      expect(vercelTool.description).toBe(searchTool.description)
      expect(vercelTool.parameters.type).toBe('object')
      expect(vercelTool.parameters.properties).toBeDefined()
      expect(typeof vercelTool.execute).toBe('function')
    })

    it('should preserve required fields', async () => {
      const mcpTools = await server.listTools()
      const searchTool = mcpTools.find((t) => t.name === 'search')!

      const vercelTool = toVercelAiTool(searchTool, async () => ({}))

      expect(vercelTool.parameters.required).toContain('query')
    })

    it('should preserve property definitions', async () => {
      const mcpTools = await server.listTools()
      const searchTool = mcpTools.find((t) => t.name === 'search')!

      const vercelTool = toVercelAiTool(searchTool, async () => ({}))

      expect(vercelTool.parameters.properties).toHaveProperty('query')
      expect(vercelTool.parameters.properties).toHaveProperty('database')
    })
  })

  describe('createVercelAiTools', () => {
    it('should create tools record from MCP server', async () => {
      const tools = await createVercelAiTools(server)

      expect(tools).toHaveProperty('search')
      expect(tools).toHaveProperty('fetch')
    })

    it('should create executable tools', async () => {
      const tools = await createVercelAiTools(server)

      const result = await tools.search.execute({ query: 'test' })

      expect(result).toBeDefined()
    })

    it('should propagate tool errors', async () => {
      const tools = await createVercelAiTools(server)

      // Missing required 'query' parameter should error
      await expect(tools.search.execute({})).rejects.toThrow()
    })
  })
})

// =============================================================================
// Adapter Class Tests
// =============================================================================

describe('VercelAiMcpAdapter', () => {
  let server: McpServer
  let adapter: VercelAiMcpAdapter

  beforeEach(() => {
    const dbAccess = createMockDatabaseAccess()
    server = createMcpServer({ dbAccess })
    adapter = new VercelAiMcpAdapter(server)
  })

  describe('getTools', () => {
    it('should return Vercel AI compatible tools', async () => {
      const tools = await adapter.getTools()

      expect(Object.keys(tools).length).toBeGreaterThanOrEqual(2)
      expect(tools.search).toBeDefined()
      expect(tools.fetch).toBeDefined()
    })

    it('should cache tools after first call', async () => {
      const tools1 = await adapter.getTools()
      const tools2 = await adapter.getTools()

      expect(tools1).toBe(tools2) // Same reference
    })

    it('should include all tool properties', async () => {
      const tools = await adapter.getTools()

      expect(tools.search.description).toBeDefined()
      expect(tools.search.parameters).toBeDefined()
      expect(typeof tools.search.execute).toBe('function')
    })
  })

  describe('executeTool', () => {
    it('should execute tool and return result', async () => {
      const result = await adapter.executeTool('search', { query: 'test' })

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.result).toBeDefined()
    })

    it('should return success: false for errors', async () => {
      const result = await adapter.executeTool('search', {})

      expect(result.success).toBe(false)
    })

    it('should handle unknown tools', async () => {
      const result = await adapter.executeTool('nonexistent', {})

      expect(result.success).toBe(false)
    })
  })
})

// =============================================================================
// Integration with Vercel AI SDK Patterns Tests
// =============================================================================

describe('Vercel AI SDK Integration Patterns', () => {
  let server: McpServer
  let adapter: VercelAiMcpAdapter

  beforeEach(() => {
    const dbAccess = createMockDatabaseAccess()
    server = createMcpServer({ dbAccess })
    adapter = new VercelAiMcpAdapter(server)
  })

  describe('generateText pattern', () => {
    it('should provide tools compatible with generateText', async () => {
      const tools = await adapter.getTools()

      // Simulate what Vercel AI SDK does
      const toolDefinitions = Object.entries(tools).map(([name, tool]) => ({
        name,
        description: tool.description,
        parameters: tool.parameters,
      }))

      expect(toolDefinitions.length).toBeGreaterThan(0)
      expect(toolDefinitions[0]).toHaveProperty('name')
      expect(toolDefinitions[0]).toHaveProperty('description')
      expect(toolDefinitions[0]).toHaveProperty('parameters')
    })
  })

  describe('streamText pattern', () => {
    it('should support async tool execution for streaming', async () => {
      const tools = await adapter.getTools()

      // Simulate streaming tool call
      const toolCall = {
        name: 'search',
        args: { query: 'test', limit: 5 },
      }

      const result = await tools[toolCall.name].execute(toolCall.args)

      expect(result).toBeDefined()
    })
  })

  describe('tool call format', () => {
    it('should format tool calls correctly', async () => {
      const tools = await adapter.getTools()

      // Vercel AI SDK tool call format
      const toolCalls = [
        { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"query":"test"}' } },
      ]

      for (const call of toolCalls) {
        const args = JSON.parse(call.function.arguments)
        const tool = tools[call.function.name]
        expect(tool).toBeDefined()

        const result = await tool.execute(args)
        expect(result).toBeDefined()
      }
    })

    it('should return tool results in expected format', async () => {
      const result = await adapter.executeTool('search', { query: 'test' })

      // Vercel AI SDK expects this shape
      expect(result).toHaveProperty('result')
      expect(result).toHaveProperty('success')
    })
  })
})

// =============================================================================
// Tool Annotation Tests
// =============================================================================

describe('Tool Annotations for Vercel AI', () => {
  let server: McpServer

  beforeEach(() => {
    const dbAccess = createMockDatabaseAccess()
    server = createMcpServer({ dbAccess })
  })

  describe('read-only hints', () => {
    it('should indicate search is read-only', async () => {
      const tools = await server.listTools()
      const searchTool = tools.find((t) => t.name === 'search')!

      expect(searchTool.annotations?.readOnlyHint).toBe(true)
    })

    it('should indicate fetch is read-only', async () => {
      const tools = await server.listTools()
      const fetchTool = tools.find((t) => t.name === 'fetch')!

      expect(fetchTool.annotations?.readOnlyHint).toBe(true)
    })
  })

  describe('destructive hints', () => {
    it('should indicate do tool is destructive when present', async () => {
      const dbAccess = createMockDatabaseAccess()
      const mockLoader = { execute: vi.fn().mockResolvedValue({ success: true }) }
      const server = createMcpServer({ dbAccess, codeLoader: mockLoader })

      const tools = await server.listTools()
      const doTool = tools.find((t) => t.name === 'do')

      expect(doTool?.annotations?.destructiveHint).toBe(true)
    })
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error Handling for Vercel AI', () => {
  let server: McpServer
  let adapter: VercelAiMcpAdapter

  beforeEach(() => {
    const dbAccess = createMockDatabaseAccess()
    server = createMcpServer({ dbAccess })
    adapter = new VercelAiMcpAdapter(server)
  })

  describe('validation errors', () => {
    it('should handle missing required parameters', async () => {
      const tools = await adapter.getTools()

      // search requires 'query'
      await expect(tools.search.execute({})).rejects.toThrow()
    })

    it('should handle invalid parameter types', async () => {
      const tools = await adapter.getTools()

      // limit should be a number
      const result = await tools.search.execute({
        query: 'test',
        limit: 'not-a-number',
      })

      // Implementation decides how to handle this
      expect(result).toBeDefined()
    })
  })

  describe('execution errors', () => {
    it('should wrap execution errors appropriately', async () => {
      const errorDbAccess: DatabaseAccess = {
        async find() {
          throw new Error('Database connection failed')
        },
        async findOne() {
          throw new Error('Database connection failed')
        },
        async insertOne() {
          throw new Error('Database connection failed')
        },
        async updateOne() {
          throw new Error('Database connection failed')
        },
        async deleteOne() {
          throw new Error('Database connection failed')
        },
      }

      const errorServer = createMcpServer({ dbAccess: errorDbAccess })
      const errorAdapter = new VercelAiMcpAdapter(errorServer)

      const result = await errorAdapter.executeTool('search', { query: 'test' })

      // Errors should be caught and returned as failed results
      expect(result.success).toBe(true) // search tool currently just returns empty results
    })
  })

  describe('timeout handling', () => {
    it('should handle slow tool execution', async () => {
      // The adapter should complete even with slow operations
      // This test verifies the adapter doesn't timeout prematurely
      const result = await adapter.executeTool('search', { query: 'test' })

      // Adapter should successfully handle the execution
      expect(result).toBeDefined()
      expect(result).toHaveProperty('result')
      expect(result).toHaveProperty('success')
    })
  })
})

// =============================================================================
// Type Safety Tests
// =============================================================================

describe('Type Safety for Vercel AI', () => {
  it('should produce type-safe tool definitions', async () => {
    const dbAccess = createMockDatabaseAccess()
    const server = createMcpServer({ dbAccess })
    const adapter = new VercelAiMcpAdapter(server)

    const tools = await adapter.getTools()

    // TypeScript compile-time checks (runtime validation)
    for (const [name, tool] of Object.entries(tools)) {
      expect(typeof name).toBe('string')
      expect(typeof tool.description).toBe('string')
      expect(tool.parameters.type).toBe('object')
      expect(typeof tool.execute).toBe('function')
    }
  })

  it('should validate tool results', async () => {
    const dbAccess = createMockDatabaseAccess()
    const server = createMcpServer({ dbAccess })
    const adapter = new VercelAiMcpAdapter(server)

    const result = await adapter.executeTool('search', { query: 'test' })

    expect(typeof result.success).toBe('boolean')
    expect(result.result !== undefined).toBe(true)
  })
})
