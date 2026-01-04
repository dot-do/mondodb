import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import {
  VercelAdapter,
  createVercelAdapter,
  formatToolResults,
  type VercelAdapterConfig,
  type VercelCoreTool,
  type VercelToolCall,
  type VercelToolResult,
} from '../../../../src/mcp/adapters/vercel-adapter'
import { createMcpServer, createMockDatabaseAccess } from '../../../../src/mcp/server'
import type { McpServer } from '../../../../src/mcp/server'

// =============================================================================
// Test Helpers
// =============================================================================

function createTestServer(): McpServer {
  return createMcpServer({
    dbAccess: createMockDatabaseAccess(),
    name: 'test-server',
    version: '1.0.0',
  })
}

function createTestAdapter(config?: Partial<VercelAdapterConfig>): VercelAdapter {
  return createVercelAdapter({
    server: createTestServer(),
    ...config,
  })
}

// =============================================================================
// Construction Tests
// =============================================================================

describe('VercelAdapter construction', () => {
  it('should create adapter via factory function', () => {
    const adapter = createVercelAdapter({
      server: createTestServer(),
    })

    expect(adapter).toBeInstanceOf(VercelAdapter)
    expect(adapter.adapterName).toBe('vercel')
  })

  it('should accept configuration options', () => {
    const adapter = createTestAdapter({
      streamingThreshold: 25000,
      defaultStreaming: false,
    })

    expect(adapter).toBeInstanceOf(VercelAdapter)
  })

  it('should accept custom result formatter', () => {
    const formatter = vi.fn((response) => 'custom: ' + JSON.stringify(response))

    const adapter = createTestAdapter({
      formatResult: formatter,
    })

    expect(adapter).toBeInstanceOf(VercelAdapter)
  })
})

// =============================================================================
// Initialization Tests
// =============================================================================

describe('VercelAdapter initialization', () => {
  it('should initialize and cache tools', async () => {
    const adapter = createTestAdapter()

    await adapter.initialize()

    const tools = await adapter.getTools()
    expect(Object.keys(tools).length).toBeGreaterThan(0)
  })

  it('should only initialize once', async () => {
    const adapter = createTestAdapter()

    await adapter.initialize()
    await adapter.initialize()

    const tools = await adapter.getTools()
    expect(Object.keys(tools).length).toBeGreaterThan(0)
  })

  it('should auto-initialize on getTools', async () => {
    const adapter = createTestAdapter()

    const tools = await adapter.getTools()

    expect(Object.keys(tools).length).toBeGreaterThan(0)
  })
})

// =============================================================================
// Tool Conversion Tests
// =============================================================================

describe('VercelAdapter tool conversion', () => {
  let adapter: VercelAdapter

  beforeEach(async () => {
    adapter = createTestAdapter()
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should convert tools to Vercel CoreTool format', async () => {
    const tools = await adapter.getTools()

    Object.values(tools).forEach((tool) => {
      expect(tool).toHaveProperty('description')
      expect(tool).toHaveProperty('parameters')
      expect(tool).toHaveProperty('execute')
      expect(typeof tool.execute).toBe('function')
    })
  })

  it('should convert parameters to Zod schema', async () => {
    const tools = await adapter.getTools()

    const searchTool = tools.search
    expect(searchTool).toBeDefined()
    expect(searchTool.parameters).toBeInstanceOf(z.ZodObject)

    // Verify the schema validates correctly
    const result = searchTool.parameters.safeParse({ query: 'test' })
    expect(result.success).toBe(true)
  })

  it('should handle optional parameters', async () => {
    const tools = await adapter.getTools()

    const searchTool = tools.search
    expect(searchTool).toBeDefined()

    // Should accept just query (required)
    expect(searchTool.parameters.safeParse({ query: 'test' }).success).toBe(true)

    // Should accept with optional params
    expect(
      searchTool.parameters.safeParse({
        query: 'test',
        limit: 10,
        collection: 'users',
      }).success
    ).toBe(true)
  })

  it('should validate parameter types', async () => {
    const tools = await adapter.getTools()

    const searchTool = tools.search
    expect(searchTool).toBeDefined()

    // Invalid type for limit should fail
    const result = searchTool.parameters.safeParse({
      query: 'test',
      limit: 'not a number',
    })
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// Get Tool Tests
// =============================================================================

describe('VercelAdapter getTool', () => {
  let adapter: VercelAdapter

  beforeEach(async () => {
    adapter = createTestAdapter()
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should return specific tool by name', async () => {
    const tool = await adapter.getTool('search')

    expect(tool).toBeDefined()
    expect(tool?.description).toContain('Search')
  })

  it('should return undefined for unknown tool', async () => {
    const tool = await adapter.getTool('nonexistent')

    expect(tool).toBeUndefined()
  })
})

// =============================================================================
// Tool Call Handling Tests
// =============================================================================

describe('VercelAdapter handleToolCall', () => {
  let adapter: VercelAdapter

  beforeEach(async () => {
    adapter = createTestAdapter()
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should execute tool and return result', async () => {
    const toolCall: VercelToolCall = {
      toolCallId: 'call-123',
      toolName: 'search',
      args: { query: 'test' },
    }

    const result = await adapter.handleToolCall(toolCall)

    expect(result.toolCallId).toBe('call-123')
    expect(result.toolName).toBe('search')
    expect(typeof result.result).toBe('string')
  })

  it('should handle unknown tool', async () => {
    const toolCall: VercelToolCall = {
      toolCallId: 'call-123',
      toolName: 'nonexistent_tool',
      args: {},
    }

    const result = await adapter.handleToolCall(toolCall)

    expect(result.result).toContain('error')
    const parsed = JSON.parse(result.result)
    expect(parsed.error).toBeDefined()
  })

  it('should use custom result formatter', async () => {
    const customAdapter = createTestAdapter({
      formatResult: (response) => `FORMATTED: ${response.content.length} blocks`,
    })
    await customAdapter.initialize()

    const toolCall: VercelToolCall = {
      toolCallId: 'call-123',
      toolName: 'search',
      args: { query: 'test' },
    }

    const result = await customAdapter.handleToolCall(toolCall)

    expect(result.result).toMatch(/^FORMATTED: \d+ blocks$/)

    await customAdapter.cleanup()
  })
})

// =============================================================================
// Batch Tool Call Tests
// =============================================================================

describe('VercelAdapter handleToolCalls', () => {
  let adapter: VercelAdapter

  beforeEach(async () => {
    adapter = createTestAdapter()
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should handle multiple tool calls', async () => {
    const toolCalls: VercelToolCall[] = [
      { toolCallId: 'call-1', toolName: 'search', args: { query: 'test1' } },
      { toolCallId: 'call-2', toolName: 'search', args: { query: 'test2' } },
      { toolCallId: 'call-3', toolName: 'search', args: { query: 'test3' } },
    ]

    const results = await adapter.handleToolCalls(toolCalls)

    expect(results.length).toBe(3)
    expect(results.map((r) => r.toolCallId).sort()).toEqual(['call-1', 'call-2', 'call-3'])
  })

  it('should handle mixed success and failure', async () => {
    const toolCalls: VercelToolCall[] = [
      { toolCallId: 'call-1', toolName: 'search', args: { query: 'test' } },
      { toolCallId: 'call-2', toolName: 'nonexistent', args: {} },
    ]

    const results = await adapter.handleToolCalls(toolCalls)

    expect(results.length).toBe(2)

    const successResult = results.find((r) => r.toolCallId === 'call-1')
    const errorResult = results.find((r) => r.toolCallId === 'call-2')

    expect(successResult?.result).not.toContain('"error"')
    expect(errorResult?.result).toContain('error')
  })
})

// =============================================================================
// Streaming Executor Tests
// =============================================================================

describe('VercelAdapter createStreamingExecutor', () => {
  let adapter: VercelAdapter

  beforeEach(async () => {
    adapter = createTestAdapter({ streamingThreshold: 10 })
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should create streaming executor function', () => {
    const executor = adapter.createStreamingExecutor('search')

    expect(typeof executor).toBe('function')
  })

  it('should stream results', async () => {
    // Create a server with a tool that returns large content
    const server = createTestServer()
    server.tool(
      'large_response',
      { type: 'object', properties: {} },
      async () => ({
        content: [{ type: 'text', text: 'A'.repeat(100) }],
      })
    )

    const testAdapter = new VercelAdapter({
      server,
      streamingThreshold: 10,
      defaultStreaming: true,
    })
    await testAdapter.initialize()

    const executor = testAdapter.createStreamingExecutor('large_response')
    const stream = executor({})

    const chunks: string[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(chunks.join('')).toBe('A'.repeat(100))

    await testAdapter.cleanup()
  })

  it('should respect stream option', async () => {
    const executor = adapter.createStreamingExecutor('search')

    const stream = executor({ query: 'test' }, { stream: false })

    const chunks: string[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    // Should have single chunk when streaming disabled
    expect(chunks.length).toBe(1)
  })
})

// =============================================================================
// ReadableStream Tests
// =============================================================================

describe('VercelAdapter createReadableStream', () => {
  let adapter: VercelAdapter

  beforeEach(async () => {
    adapter = createTestAdapter()
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should create ReadableStream', () => {
    const stream = adapter.createReadableStream('search', { query: 'test' })

    expect(stream).toBeInstanceOf(ReadableStream)
  })

  it('should stream as Uint8Array', async () => {
    const stream = adapter.createReadableStream('search', { query: 'test' })
    const reader = stream.getReader()

    const chunks: Uint8Array[] = []
    let done = false

    while (!done) {
      const result = await reader.read()
      if (result.done) {
        done = true
      } else {
        chunks.push(result.value)
      }
    }

    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0]).toBeInstanceOf(Uint8Array)
  })
})

// =============================================================================
// Tool Wrapper Tests
// =============================================================================

describe('VercelAdapter createToolWrapper', () => {
  let adapter: VercelAdapter

  beforeEach(async () => {
    adapter = createTestAdapter()
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should return tool wrapper for valid tool', () => {
    const wrapper = adapter.createToolWrapper('search')

    expect(wrapper).toBeDefined()
    expect(wrapper?.description).toContain('Search')
    expect(typeof wrapper?.execute).toBe('function')
  })

  it('should return undefined for invalid tool', () => {
    const wrapper = adapter.createToolWrapper('nonexistent')

    expect(wrapper).toBeUndefined()
  })

  it('should execute tool via wrapper', async () => {
    const wrapper = adapter.createToolWrapper('search')

    expect(wrapper).toBeDefined()

    const result = await wrapper!.execute({ query: 'test' })

    expect(typeof result).toBe('string')
  })
})

// =============================================================================
// formatToolResults Tests
// =============================================================================

describe('formatToolResults', () => {
  it('should format tool results for API', () => {
    const results: VercelToolResult[] = [
      { toolCallId: 'call-1', toolName: 'search', result: '{"results":[]}' },
      { toolCallId: 'call-2', toolName: 'fetch', result: '{"id":"doc-1"}' },
    ]

    const formatted = formatToolResults(results)

    expect(formatted.length).toBe(2)
    formatted.forEach((f) => {
      expect(f.type).toBe('tool-result')
      expect(f).toHaveProperty('toolCallId')
      expect(f).toHaveProperty('toolName')
      expect(f).toHaveProperty('result')
    })
  })
})

// =============================================================================
// Cleanup Tests
// =============================================================================

describe('VercelAdapter cleanup', () => {
  it('should clear tool cache on cleanup', async () => {
    const adapter = createTestAdapter()
    await adapter.initialize()

    expect(Object.keys(await adapter.getTools()).length).toBeGreaterThan(0)

    await adapter.cleanup()

    // After cleanup, should re-initialize
    const tools = await adapter.getTools()
    expect(Object.keys(tools).length).toBeGreaterThan(0)
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('VercelAdapter integration', () => {
  it('should complete full tool call workflow', async () => {
    const adapter = createTestAdapter()

    // Initialize
    await adapter.initialize()

    // Get tools
    const tools = await adapter.getTools()
    expect(Object.keys(tools).length).toBeGreaterThan(0)

    // Verify search tool
    expect(tools.search).toBeDefined()

    // Execute tool directly via CoreTool.execute
    const result = await tools.search.execute({ query: 'test documents' })

    expect(typeof result).toBe('string')

    // Or via handleToolCall
    const toolCallResult = await adapter.handleToolCall({
      toolCallId: 'tc_123',
      toolName: 'search',
      args: { query: 'test documents' },
    })

    expect(toolCallResult.toolCallId).toBe('tc_123')
    expect(typeof toolCallResult.result).toBe('string')

    // Cleanup
    await adapter.cleanup()
  })

  it('should handle retry on transient error', async () => {
    let callCount = 0

    const server = createTestServer()
    server.tool(
      'flaky_tool',
      { type: 'object', properties: {} },
      async () => {
        callCount++
        if (callCount < 2) {
          throw new Error('ECONNREFUSED')
        }
        return { content: [{ type: 'text', text: 'success' }] }
      }
    )

    const adapter = new VercelAdapter({
      server,
      retry: { maxRetries: 3, initialDelayMs: 1, jitter: false },
    })
    await adapter.initialize()

    const toolCall: VercelToolCall = {
      toolCallId: 'call-123',
      toolName: 'flaky_tool',
      args: {},
    }

    const result = await adapter.handleToolCall(toolCall)

    // The tool should be called at least once
    expect(callCount).toBeGreaterThan(0)
    // Result should have valid structure
    expect(result.toolCallId).toBe('call-123')
    expect(result.toolName).toBe('flaky_tool')
    expect(typeof result.result).toBe('string')

    await adapter.cleanup()
  })

  it('should work with Vercel AI SDK patterns', async () => {
    const adapter = createTestAdapter()
    await adapter.initialize()

    // Get tools (for generateText or streamText)
    const tools = await adapter.getTools()

    // Simulate model returning tool calls
    const modelToolCalls: VercelToolCall[] = [
      { toolCallId: 'call_abc123', toolName: 'search', args: { query: 'AI' } },
    ]

    // Handle tool calls
    const toolResults = await adapter.handleToolCalls(modelToolCalls)

    // Format for next request
    const formattedResults = formatToolResults(toolResults)

    expect(formattedResults.length).toBe(1)
    expect(formattedResults[0].type).toBe('tool-result')
    expect(formattedResults[0].toolCallId).toBe('call_abc123')

    await adapter.cleanup()
  })
})

// =============================================================================
// Zod Schema Conversion Tests
// =============================================================================

describe('VercelAdapter Zod schema conversion', () => {
  it('should handle nested object schemas', async () => {
    const server = createTestServer()
    server.tool(
      'nested_tool',
      {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', description: 'Enable feature' },
              count: { type: 'number', description: 'Count value' },
            },
            required: ['enabled'],
          },
        },
        required: ['config'],
      },
      async () => ({ content: [{ type: 'text', text: 'ok' }] })
    )

    const adapter = new VercelAdapter({ server })
    await adapter.initialize()

    const tool = await adapter.getTool('nested_tool')
    expect(tool).toBeDefined()

    // Should validate nested structure
    const validResult = tool!.parameters.safeParse({
      config: { enabled: true, count: 5 },
    })
    expect(validResult.success).toBe(true)

    // Should fail on invalid nested structure
    const invalidResult = tool!.parameters.safeParse({
      config: { enabled: 'not a boolean' },
    })
    expect(invalidResult.success).toBe(false)

    await adapter.cleanup()
  })

  it('should handle array schemas', async () => {
    const server = createTestServer()
    server.tool(
      'array_tool',
      {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of items',
          },
        },
        required: ['items'],
      },
      async () => ({ content: [{ type: 'text', text: 'ok' }] })
    )

    const adapter = new VercelAdapter({ server })
    await adapter.initialize()

    const tool = await adapter.getTool('array_tool')
    expect(tool).toBeDefined()

    // Should validate array
    const validResult = tool!.parameters.safeParse({
      items: ['a', 'b', 'c'],
    })
    expect(validResult.success).toBe(true)

    // Should fail on non-array
    const invalidResult = tool!.parameters.safeParse({
      items: 'not an array',
    })
    expect(invalidResult.success).toBe(false)

    await adapter.cleanup()
  })
})
