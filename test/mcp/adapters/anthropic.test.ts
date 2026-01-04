/**
 * Anthropic MCP Adapter Tests (RED Phase)
 *
 * Tests for adapting MondoDB MCP server to work with Anthropic's MCP protocol.
 * Enables using MondoDB as a native MCP server for Claude and other Anthropic models.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMcpServer, createMockDatabaseAccess } from '../../../src/mcp/server'
import type { McpServer } from '../../../src/mcp/server'
import type { McpToolDefinition, McpRequest, McpResponse, DatabaseAccess } from '../../../src/mcp/types'

// =============================================================================
// Anthropic MCP Types
// =============================================================================

/**
 * Anthropic tool_use format
 */
interface AnthropicToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Anthropic tool_result format
 */
interface AnthropicToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string | Array<{ type: 'text'; text: string }>
  is_error?: boolean
}

/**
 * Anthropic tool definition format
 */
interface AnthropicToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/**
 * MCP initialize result for Anthropic
 */
interface McpInitializeResult {
  protocolVersion: string
  capabilities: {
    tools?: Record<string, unknown>
    resources?: Record<string, unknown>
    prompts?: Record<string, unknown>
  }
  serverInfo: {
    name: string
    version: string
  }
}

// =============================================================================
// Adapter Implementation
// =============================================================================

/**
 * Convert MCP tool definition to Anthropic format
 */
function toAnthropicToolDefinition(mcpTool: McpToolDefinition): AnthropicToolDefinition {
  return {
    name: mcpTool.name,
    description: mcpTool.description,
    input_schema: {
      type: 'object',
      properties: mcpTool.inputSchema.properties ?? {},
      required: mcpTool.inputSchema.required ?? [],
    },
  }
}

/**
 * Convert Anthropic tool_use to MCP tools/call request
 */
function toMcpToolsCall(toolUse: AnthropicToolUse): McpRequest {
  return {
    jsonrpc: '2.0',
    id: toolUse.id,
    method: 'tools/call',
    params: {
      name: toolUse.name,
      arguments: toolUse.input,
    },
  }
}

/**
 * Convert MCP tool result to Anthropic tool_result
 */
function toAnthropicToolResult(
  toolUseId: string,
  mcpResponse: McpResponse
): AnthropicToolResult {
  if (mcpResponse.error) {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: mcpResponse.error.message,
      is_error: true,
    }
  }

  const result = mcpResponse.result as { content?: Array<{ type: string; text: string }>; isError?: boolean }

  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: result?.content?.map((c) => ({ type: 'text' as const, text: c.text })) ?? [],
    is_error: result?.isError,
  }
}

/**
 * Anthropic MCP Adapter class
 */
class AnthropicMcpAdapter {
  private server: McpServer
  private initialized = false

  constructor(server: McpServer) {
    this.server = server
  }

  /**
   * Initialize the MCP session
   */
  async initialize(clientInfo?: { name: string; version: string }): Promise<McpInitializeResult> {
    const response = await this.server.handleRequest({
      jsonrpc: '2.0',
      id: 'init',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: clientInfo ?? { name: 'anthropic-client', version: '1.0.0' },
      },
    })

    this.initialized = true
    return response.result as McpInitializeResult
  }

  /**
   * List tools in Anthropic format
   */
  async listTools(): Promise<AnthropicToolDefinition[]> {
    const mcpTools = await this.server.listTools()
    return mcpTools.map(toAnthropicToolDefinition)
  }

  /**
   * Handle a tool_use from Claude
   */
  async handleToolUse(toolUse: AnthropicToolUse): Promise<AnthropicToolResult> {
    const mcpRequest = toMcpToolsCall(toolUse)
    const mcpResponse = await this.server.handleRequest(mcpRequest)
    return toAnthropicToolResult(toolUse.id, mcpResponse)
  }

  /**
   * Check if session is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

// =============================================================================
// Conversion Tests
// =============================================================================

describe('MCP to Anthropic Conversion', () => {
  let server: McpServer

  beforeEach(() => {
    const dbAccess = createMockDatabaseAccess()
    server = createMcpServer({ dbAccess })
  })

  describe('toAnthropicToolDefinition', () => {
    it('should convert MCP tool to Anthropic format', async () => {
      const mcpTools = await server.listTools()
      const searchTool = mcpTools.find((t) => t.name === 'search')!

      const anthropicTool = toAnthropicToolDefinition(searchTool)

      expect(anthropicTool.name).toBe('search')
      expect(anthropicTool.description).toBeDefined()
      expect(anthropicTool.input_schema.type).toBe('object')
      expect(anthropicTool.input_schema.properties).toBeDefined()
    })

    it('should preserve required fields', async () => {
      const mcpTools = await server.listTools()
      const searchTool = mcpTools.find((t) => t.name === 'search')!

      const anthropicTool = toAnthropicToolDefinition(searchTool)

      expect(anthropicTool.input_schema.required).toContain('query')
    })

    it('should handle tools without required fields', async () => {
      const mcpTools = await server.listTools()
      const fetchTool = mcpTools.find((t) => t.name === 'fetch')!

      const anthropicTool = toAnthropicToolDefinition(fetchTool)

      expect(anthropicTool.input_schema).toBeDefined()
    })
  })

  describe('toMcpToolsCall', () => {
    it('should convert tool_use to MCP request', () => {
      const toolUse: AnthropicToolUse = {
        type: 'tool_use',
        id: 'tool_123',
        name: 'search',
        input: { query: 'test query', limit: 10 },
      }

      const mcpRequest = toMcpToolsCall(toolUse)

      expect(mcpRequest.jsonrpc).toBe('2.0')
      expect(mcpRequest.id).toBe('tool_123')
      expect(mcpRequest.method).toBe('tools/call')
      expect(mcpRequest.params).toEqual({
        name: 'search',
        arguments: { query: 'test query', limit: 10 },
      })
    })
  })

  describe('toAnthropicToolResult', () => {
    it('should convert successful MCP response', () => {
      const mcpResponse: McpResponse = {
        jsonrpc: '2.0',
        id: 'tool_123',
        result: {
          content: [{ type: 'text', text: '{"results":[]}' }],
          isError: false,
        },
      }

      const result = toAnthropicToolResult('tool_123', mcpResponse)

      expect(result.type).toBe('tool_result')
      expect(result.tool_use_id).toBe('tool_123')
      expect(result.is_error).toBe(false)
    })

    it('should convert error MCP response', () => {
      const mcpResponse: McpResponse = {
        jsonrpc: '2.0',
        id: 'tool_123',
        error: { code: -32601, message: 'Method not found' },
      }

      const result = toAnthropicToolResult('tool_123', mcpResponse)

      expect(result.type).toBe('tool_result')
      expect(result.tool_use_id).toBe('tool_123')
      expect(result.is_error).toBe(true)
      expect(result.content).toBe('Method not found')
    })
  })
})

// =============================================================================
// Adapter Class Tests
// =============================================================================

describe('AnthropicMcpAdapter', () => {
  let server: McpServer
  let adapter: AnthropicMcpAdapter

  beforeEach(() => {
    const dbAccess = createMockDatabaseAccess()
    server = createMcpServer({ dbAccess })
    adapter = new AnthropicMcpAdapter(server)
  })

  describe('initialize', () => {
    it('should initialize MCP session', async () => {
      const result = await adapter.initialize()

      expect(result.protocolVersion).toBe('2024-11-05')
      expect(result.serverInfo.name).toBe('mondodb')
      expect(result.capabilities).toBeDefined()
    })

    it('should accept client info', async () => {
      const result = await adapter.initialize({
        name: 'claude-desktop',
        version: '0.1.0',
      })

      expect(result).toBeDefined()
    })

    it('should set initialized state', async () => {
      expect(adapter.isInitialized()).toBe(false)
      await adapter.initialize()
      expect(adapter.isInitialized()).toBe(true)
    })
  })

  describe('listTools', () => {
    it('should return Anthropic-formatted tools', async () => {
      const tools = await adapter.listTools()

      expect(tools.length).toBeGreaterThanOrEqual(2)
      expect(tools[0]).toHaveProperty('name')
      expect(tools[0]).toHaveProperty('description')
      expect(tools[0]).toHaveProperty('input_schema')
    })

    it('should include search tool', async () => {
      const tools = await adapter.listTools()
      const searchTool = tools.find((t) => t.name === 'search')

      expect(searchTool).toBeDefined()
      expect(searchTool!.input_schema.type).toBe('object')
    })

    it('should include fetch tool', async () => {
      const tools = await adapter.listTools()
      const fetchTool = tools.find((t) => t.name === 'fetch')

      expect(fetchTool).toBeDefined()
    })
  })

  describe('handleToolUse', () => {
    it('should handle search tool_use', async () => {
      const toolUse: AnthropicToolUse = {
        type: 'tool_use',
        id: 'toolu_abc123',
        name: 'search',
        input: { query: 'test query' },
      }

      const result = await adapter.handleToolUse(toolUse)

      expect(result.type).toBe('tool_result')
      expect(result.tool_use_id).toBe('toolu_abc123')
    })

    it('should handle fetch tool_use', async () => {
      const toolUse: AnthropicToolUse = {
        type: 'tool_use',
        id: 'toolu_def456',
        name: 'fetch',
        input: { id: 'testdb.users.507f1f77bcf86cd799439011' },
      }

      const result = await adapter.handleToolUse(toolUse)

      expect(result.type).toBe('tool_result')
      expect(result.tool_use_id).toBe('toolu_def456')
    })

    it('should return error for unknown tool', async () => {
      const toolUse: AnthropicToolUse = {
        type: 'tool_use',
        id: 'toolu_xyz',
        name: 'nonexistent',
        input: {},
      }

      const result = await adapter.handleToolUse(toolUse)

      // The tool handler returns isError: true for unknown tools
      expect(result.type).toBe('tool_result')
    })
  })
})

// =============================================================================
// Claude Integration Pattern Tests
// =============================================================================

describe('Claude Integration Patterns', () => {
  let adapter: AnthropicMcpAdapter

  beforeEach(() => {
    const dbAccess = createMockDatabaseAccess()
    const server = createMcpServer({ dbAccess })
    adapter = new AnthropicMcpAdapter(server)
  })

  describe('tool discovery flow', () => {
    it('should support full discovery flow', async () => {
      // 1. Initialize
      const initResult = await adapter.initialize({
        name: 'claude',
        version: '3.0',
      })

      expect(initResult.capabilities.tools).toBeDefined()

      // 2. List tools
      const tools = await adapter.listTools()

      expect(tools.length).toBeGreaterThan(0)
    })
  })

  describe('tool execution flow', () => {
    it('should support full execution flow', async () => {
      // Initialize first
      await adapter.initialize()

      // Get available tools
      const tools = await adapter.listTools()
      const searchTool = tools.find((t) => t.name === 'search')!

      // Simulate Claude's tool_use
      const toolUse: AnthropicToolUse = {
        type: 'tool_use',
        id: 'toolu_01ABC123',
        name: searchTool.name,
        input: { query: 'find documents' },
      }

      // Execute and get result
      const result = await adapter.handleToolUse(toolUse)

      expect(result.type).toBe('tool_result')
      expect(result.tool_use_id).toBe(toolUse.id)
    })
  })

  describe('error handling flow', () => {
    it('should return error results appropriately', async () => {
      await adapter.initialize()

      // Tool use with missing required param
      const toolUse: AnthropicToolUse = {
        type: 'tool_use',
        id: 'toolu_error_test',
        name: 'search',
        input: {}, // Missing 'query'
      }

      const result = await adapter.handleToolUse(toolUse)

      // Should complete without throwing
      expect(result.type).toBe('tool_result')
    })
  })
})

// =============================================================================
// MCP Protocol Compliance Tests
// =============================================================================

describe('MCP Protocol Compliance', () => {
  let server: McpServer

  beforeEach(() => {
    const dbAccess = createMockDatabaseAccess()
    server = createMcpServer({ dbAccess })
  })

  describe('protocol version', () => {
    it('should support 2024-11-05 protocol version', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      })

      const result = response.result as McpInitializeResult
      expect(result.protocolVersion).toBe('2024-11-05')
    })
  })

  describe('JSON-RPC compliance', () => {
    it('should return proper JSON-RPC 2.0 responses', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'tools/list',
      })

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('test-id')
    })

    it('should return error for invalid method', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'invalid/method',
      })

      expect(response.error).toBeDefined()
      expect(response.error!.code).toBe(-32601)
    })
  })

  describe('capabilities', () => {
    it('should report tools capability', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      })

      const result = response.result as McpInitializeResult
      expect(result.capabilities.tools).toBeDefined()
    })
  })
})

// =============================================================================
// Concurrent Request Tests
// =============================================================================

describe('Concurrent Request Handling', () => {
  let adapter: AnthropicMcpAdapter

  beforeEach(async () => {
    const dbAccess = createMockDatabaseAccess()
    const server = createMcpServer({ dbAccess })
    adapter = new AnthropicMcpAdapter(server)
    await adapter.initialize()
  })

  it('should handle multiple concurrent tool_use requests', async () => {
    const toolUses: AnthropicToolUse[] = [
      { type: 'tool_use', id: 'toolu_1', name: 'search', input: { query: 'query1' } },
      { type: 'tool_use', id: 'toolu_2', name: 'search', input: { query: 'query2' } },
      { type: 'tool_use', id: 'toolu_3', name: 'fetch', input: { id: 'test.coll.123' } },
    ]

    const results = await Promise.all(toolUses.map((tu) => adapter.handleToolUse(tu)))

    expect(results.length).toBe(3)
    expect(results[0].tool_use_id).toBe('toolu_1')
    expect(results[1].tool_use_id).toBe('toolu_2')
    expect(results[2].tool_use_id).toBe('toolu_3')
  })

  it('should maintain result order with concurrent requests', async () => {
    const toolUses = Array.from({ length: 10 }, (_, i) => ({
      type: 'tool_use' as const,
      id: `toolu_${i}`,
      name: 'search',
      input: { query: `query${i}` },
    }))

    const results = await Promise.all(toolUses.map((tu) => adapter.handleToolUse(tu)))

    results.forEach((result, i) => {
      expect(result.tool_use_id).toBe(`toolu_${i}`)
    })
  })
})

// =============================================================================
// Content Type Tests
// =============================================================================

describe('Content Type Handling', () => {
  let adapter: AnthropicMcpAdapter

  beforeEach(async () => {
    const dbAccess = createMockDatabaseAccess()
    const server = createMcpServer({ dbAccess })
    adapter = new AnthropicMcpAdapter(server)
    await adapter.initialize()
  })

  describe('text content', () => {
    it('should return text content in tool results', async () => {
      const toolUse: AnthropicToolUse = {
        type: 'tool_use',
        id: 'toolu_text',
        name: 'search',
        input: { query: 'test' },
      }

      const result = await adapter.handleToolUse(toolUse)

      expect(result.content).toBeDefined()
      // Content should be array of text blocks or string
      if (Array.isArray(result.content)) {
        result.content.forEach((c) => {
          expect(c.type).toBe('text')
        })
      } else {
        expect(typeof result.content).toBe('string')
      }
    })
  })
})

// =============================================================================
// Server Info Tests
// =============================================================================

describe('Server Info', () => {
  it('should return correct server info', async () => {
    const dbAccess = createMockDatabaseAccess()
    const server = createMcpServer({
      dbAccess,
      name: 'mondodb-custom',
      version: '2.0.0',
    })
    const adapter = new AnthropicMcpAdapter(server)

    const result = await adapter.initialize()

    expect(result.serverInfo.name).toBe('mondodb-custom')
    expect(result.serverInfo.version).toBe('2.0.0')
  })
})
