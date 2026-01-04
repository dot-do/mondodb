import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMcpServer,
  McpServer,
  McpServerConfig,
} from '../../../src/mcp/server'
import type { McpToolDefinition, DatabaseAccess } from '../../../src/mcp/types'

// =============================================================================
// Mock Database Access
// =============================================================================

function createMockDatabaseAccess(): DatabaseAccess {
  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn().mockResolvedValue({ insertedId: 'test-id' }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 0, matchedCount: 0 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  }
}

// Mock code loader for 'do' tool
function createMockCodeLoader() {
  return {
    execute: vi.fn().mockResolvedValue({ success: true, result: {} }),
  }
}

// =============================================================================
// Server Creation Tests
// =============================================================================

describe('createMcpServer', () => {
  let mockDbAccess: DatabaseAccess

  beforeEach(() => {
    mockDbAccess = createMockDatabaseAccess()
  })

  it('should create an McpServer instance', () => {
    const server = createMcpServer({ dbAccess: mockDbAccess })

    expect(server).toBeDefined()
    expect(server.name).toBe('mondodb')
    expect(server.version).toBe('1.0.0')
  })

  it('should accept custom server name and version', () => {
    const server = createMcpServer({
      dbAccess: mockDbAccess,
      name: 'custom-server',
      version: '2.0.0',
    })

    expect(server.name).toBe('custom-server')
    expect(server.version).toBe('2.0.0')
  })

  it('should register search tool', async () => {
    const server = createMcpServer({ dbAccess: mockDbAccess })
    const tools = await server.listTools()

    const searchTool = tools.find((t: McpToolDefinition) => t.name === 'search')
    expect(searchTool).toBeDefined()
    expect(searchTool?.inputSchema.properties?.query).toBeDefined()
    expect(searchTool?.annotations?.readOnlyHint).toBe(true)
  })

  it('should register fetch tool', async () => {
    const server = createMcpServer({ dbAccess: mockDbAccess })
    const tools = await server.listTools()

    const fetchTool = tools.find((t: McpToolDefinition) => t.name === 'fetch')
    expect(fetchTool).toBeDefined()
    expect(fetchTool?.inputSchema.properties?.id).toBeDefined()
    expect(fetchTool?.annotations?.readOnlyHint).toBe(true)
  })

  it('should register do tool when codeLoader provided', async () => {
    const mockLoader = createMockCodeLoader()
    const server = createMcpServer({
      dbAccess: mockDbAccess,
      codeLoader: mockLoader,
    })
    const tools = await server.listTools()

    const doTool = tools.find((t: McpToolDefinition) => t.name === 'do')
    expect(doTool).toBeDefined()
    expect(doTool?.inputSchema.properties?.code).toBeDefined()
    expect(doTool?.annotations?.destructiveHint).toBe(true)
  })

  it('should not register do tool without codeLoader', async () => {
    const server = createMcpServer({ dbAccess: mockDbAccess })
    const tools = await server.listTools()

    const doTool = tools.find((t: McpToolDefinition) => t.name === 'do')
    expect(doTool).toBeUndefined()
  })
})

// =============================================================================
// McpServer Instance Tests
// =============================================================================

describe('McpServer', () => {
  let server: McpServer
  let mockDbAccess: DatabaseAccess

  beforeEach(() => {
    mockDbAccess = createMockDatabaseAccess()
    server = createMcpServer({ dbAccess: mockDbAccess })
  })

  describe('listTools', () => {
    it('should return array of tool definitions', async () => {
      const tools = await server.listTools()

      expect(Array.isArray(tools)).toBe(true)
      expect(tools.length).toBeGreaterThan(0)
    })

    it('should include required fields for each tool', async () => {
      const tools = await server.listTools()

      for (const tool of tools) {
        expect(tool.name).toBeDefined()
        expect(typeof tool.name).toBe('string')
        expect(tool.description).toBeDefined()
        expect(typeof tool.description).toBe('string')
        expect(tool.inputSchema).toBeDefined()
        expect(tool.inputSchema.type).toBe('object')
      }
    })
  })

  describe('callTool', () => {
    it('should execute registered tool by name', async () => {
      const response = await server.callTool('search', {
        query: 'test',
        database: 'testdb',
        collection: 'users',
      })

      expect(response).toBeDefined()
      expect(response.content).toBeDefined()
      expect(Array.isArray(response.content)).toBe(true)
    })

    it('should return error for unknown tool', async () => {
      const response = await server.callTool('unknown-tool', {})

      expect(response.isError).toBe(true)
      expect(response.content[0].text).toContain('unknown-tool')
    })

    it('should return error for invalid arguments', async () => {
      // The search tool requires 'query' but we're not providing it
      const response = await server.callTool('search', {})

      expect(response.isError).toBe(true)
    })
  })

  describe('handleRequest', () => {
    it('should handle initialize request', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      })

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(1)
      expect(response.result).toBeDefined()
      const result = response.result as { protocolVersion: string; serverInfo: { name: string } }
      expect(result.protocolVersion).toBe('2024-11-05')
      expect(result.serverInfo.name).toBe('mondodb')
    })

    it('should handle tools/list request', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      })

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(2)
      expect(response.result).toBeDefined()
      const result = response.result as { tools: McpToolDefinition[] }
      expect(result.tools).toBeDefined()
      expect(Array.isArray(result.tools)).toBe(true)
    })

    it('should handle tools/call request', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: {
            query: 'test',
            database: 'testdb',
            collection: 'users',
          },
        },
      })

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(3)
      expect(response.result).toBeDefined()
    })

    it('should return error for unknown method', async () => {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'unknown/method',
      })

      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32601) // Method not found
    })

    it('should return error for invalid JSON-RPC version', async () => {
      const response = await server.handleRequest({
        jsonrpc: '1.0' as '2.0',
        id: 5,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      })

      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32600) // Invalid request
    })
  })
})

// =============================================================================
// DatabaseAccess Interface Tests
// =============================================================================

describe('DatabaseAccess interface', () => {
  it('should define required methods', () => {
    const dbAccess: DatabaseAccess = {
      find: async () => [],
      findOne: async () => null,
      insertOne: async () => ({ insertedId: 'id' }),
      updateOne: async () => ({ modifiedCount: 0, matchedCount: 0 }),
      deleteOne: async () => ({ deletedCount: 0 }),
    }

    expect(dbAccess.find).toBeDefined()
    expect(dbAccess.findOne).toBeDefined()
    expect(dbAccess.insertOne).toBeDefined()
    expect(dbAccess.updateOne).toBeDefined()
    expect(dbAccess.deleteOne).toBeDefined()
  })

  it('should accept collection and filter parameters', async () => {
    const mockFind = vi.fn().mockResolvedValue([])
    const dbAccess: DatabaseAccess = {
      find: mockFind,
      findOne: async () => null,
      insertOne: async () => ({ insertedId: 'id' }),
      updateOne: async () => ({ modifiedCount: 0, matchedCount: 0 }),
      deleteOne: async () => ({ deletedCount: 0 }),
    }

    await dbAccess.find('users', { name: 'test' })
    expect(mockFind).toHaveBeenCalledWith('users', { name: 'test' })
  })
})

// =============================================================================
// Tool Registration Tests
// =============================================================================

describe('Tool Registration', () => {
  it('should allow registering custom tools', async () => {
    const mockDbAccess = createMockDatabaseAccess()
    const server = createMcpServer({ dbAccess: mockDbAccess })

    server.registerTool({
      definition: {
        name: 'custom-tool',
        description: 'A custom tool',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
        },
      },
      handler: async (args) => ({
        content: [{ type: 'text', text: `Custom result: ${(args as { input?: string }).input}` }],
        isError: false,
      }),
    })

    const tools = await server.listTools()
    const customTool = tools.find((t: McpToolDefinition) => t.name === 'custom-tool')
    expect(customTool).toBeDefined()
  })

  it('should execute custom tool handler', async () => {
    const mockDbAccess = createMockDatabaseAccess()
    const server = createMcpServer({ dbAccess: mockDbAccess })

    server.registerTool({
      definition: {
        name: 'echo',
        description: 'Echoes input',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
          required: ['message'],
        },
      },
      handler: async (args) => ({
        content: [{ type: 'text', text: `Echo: ${(args as { message: string }).message}` }],
        isError: false,
      }),
    })

    const response = await server.callTool('echo', { message: 'Hello' })
    expect(response.content[0].text).toBe('Echo: Hello')
  })
})
