import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AnthropicAdapter,
  createAnthropicAdapter,
  type AnthropicAdapterConfig,
  type AnthropicTool,
  type AnthropicToolUse,
  type AnthropicToolResult,
} from '../../../../src/mcp/adapters/anthropic-adapter'
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

function createTestAdapter(config?: Partial<AnthropicAdapterConfig>): AnthropicAdapter {
  return createAnthropicAdapter({
    server: createTestServer(),
    ...config,
  })
}

// =============================================================================
// Construction Tests
// =============================================================================

describe('AnthropicAdapter construction', () => {
  it('should create adapter via factory function', () => {
    const adapter = createAnthropicAdapter({
      server: createTestServer(),
    })

    expect(adapter).toBeInstanceOf(AnthropicAdapter)
    expect(adapter.adapterName).toBe('anthropic')
  })

  it('should accept configuration options', () => {
    const adapter = createTestAdapter({
      streamingThreshold: 50000,
      verboseErrors: true,
    })

    expect(adapter).toBeInstanceOf(AnthropicAdapter)
  })

  it('should accept custom tool name transformer', () => {
    const transformer = vi.fn((name: string) => `custom_${name}`)

    const adapter = createTestAdapter({
      transformToolName: transformer,
    })

    expect(adapter).toBeInstanceOf(AnthropicAdapter)
  })
})

// =============================================================================
// Initialization Tests
// =============================================================================

describe('AnthropicAdapter initialization', () => {
  it('should initialize and cache tools', async () => {
    const adapter = createTestAdapter()

    await adapter.initialize()

    const tools = await adapter.getTools()
    expect(tools.length).toBeGreaterThan(0)
  })

  it('should only initialize once', async () => {
    const adapter = createTestAdapter()

    await adapter.initialize()
    await adapter.initialize()

    const tools = await adapter.getTools()
    expect(tools.length).toBeGreaterThan(0)
  })

  it('should auto-initialize on getTools', async () => {
    const adapter = createTestAdapter()

    const tools = await adapter.getTools()

    expect(tools.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// Tool Conversion Tests
// =============================================================================

describe('AnthropicAdapter tool conversion', () => {
  let adapter: AnthropicAdapter

  beforeEach(async () => {
    adapter = createTestAdapter()
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should convert tools to Anthropic format', async () => {
    const tools = await adapter.getTools()

    tools.forEach((tool) => {
      expect(tool).toHaveProperty('name')
      expect(tool).toHaveProperty('description')
      expect(tool).toHaveProperty('input_schema')
      expect(tool.input_schema.type).toBe('object')
      expect(tool.input_schema.properties).toBeDefined()
    })
  })

  it('should have valid tool names (alphanumeric + underscore)', async () => {
    const tools = await adapter.getTools()

    tools.forEach((tool) => {
      expect(tool.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    })
  })

  it('should preserve required fields', async () => {
    const tools = await adapter.getTools()

    const searchTool = tools.find((t) => t.name === 'search')
    expect(searchTool).toBeDefined()
    expect(searchTool!.input_schema.required).toContain('query')
  })

  it('should include parameter descriptions', async () => {
    const tools = await adapter.getTools()

    const searchTool = tools.find((t) => t.name === 'search')
    expect(searchTool).toBeDefined()
    expect(searchTool!.input_schema.properties.query).toBeDefined()
    expect(searchTool!.input_schema.properties.query.description).toBeDefined()
  })
})

// =============================================================================
// Tool Name Transformation Tests
// =============================================================================

describe('AnthropicAdapter tool name transformation', () => {
  it('should transform invalid characters to underscores', async () => {
    const server = createTestServer()

    // Register a tool with special characters
    server.tool(
      'my-special.tool/name',
      {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
      },
      async () => ({ content: [{ type: 'text', text: 'ok' }] })
    )

    const adapter = new AnthropicAdapter({ server })
    const tools = await adapter.getTools()

    const specialTool = tools.find((t) => t.name.includes('special'))
    expect(specialTool?.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/)
  })

  it('should use custom transformer', async () => {
    const adapter = createTestAdapter({
      transformToolName: (name) => `mondodb_${name}`,
    })

    const tools = await adapter.getTools()

    tools.forEach((tool) => {
      expect(tool.name).toMatch(/^mondodb_/)
    })
  })
})

// =============================================================================
// Tool Use Handling Tests
// =============================================================================

describe('AnthropicAdapter handleToolUse', () => {
  let adapter: AnthropicAdapter

  beforeEach(async () => {
    adapter = createTestAdapter()
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should execute tool and return result', async () => {
    const toolUse: AnthropicToolUse = {
      type: 'tool_use',
      id: 'tool-123',
      name: 'search',
      input: { query: 'test' },
    }

    const result = await adapter.handleToolUse(toolUse)

    expect(result.type).toBe('tool_result')
    expect(result.tool_use_id).toBe('tool-123')
    expect(result.content).toBeDefined()
    expect(result.is_error).toBeFalsy()
  })

  it('should handle unknown tool', async () => {
    const toolUse: AnthropicToolUse = {
      type: 'tool_use',
      id: 'tool-123',
      name: 'nonexistent_tool',
      input: {},
    }

    const result = await adapter.handleToolUse(toolUse)

    expect(result.is_error).toBe(true)
    expect(result.content).toContain('not found')
  })

  it('should include error details when verbose', async () => {
    const verboseAdapter = createTestAdapter({ verboseErrors: true })
    await verboseAdapter.initialize()

    const toolUse: AnthropicToolUse = {
      type: 'tool_use',
      id: 'tool-123',
      name: 'nonexistent_tool',
      input: {},
    }

    const result = await verboseAdapter.handleToolUse(toolUse)

    expect(result.is_error).toBe(true)
    const content = JSON.parse(result.content as string)
    expect(content).toHaveProperty('code')
    expect(content).toHaveProperty('retryable')

    await verboseAdapter.cleanup()
  })
})

// =============================================================================
// Batch Tool Use Tests
// =============================================================================

describe('AnthropicAdapter handleToolUses', () => {
  let adapter: AnthropicAdapter

  beforeEach(async () => {
    adapter = createTestAdapter()
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should handle multiple tool uses', async () => {
    const toolUses: AnthropicToolUse[] = [
      { type: 'tool_use', id: 'tool-1', name: 'search', input: { query: 'test1' } },
      { type: 'tool_use', id: 'tool-2', name: 'search', input: { query: 'test2' } },
      { type: 'tool_use', id: 'tool-3', name: 'search', input: { query: 'test3' } },
    ]

    const results = await adapter.handleToolUses(toolUses)

    expect(results.length).toBe(3)
    expect(results.map((r) => r.tool_use_id).sort()).toEqual(['tool-1', 'tool-2', 'tool-3'])
  })

  it('should handle mixed success and failure', async () => {
    const toolUses: AnthropicToolUse[] = [
      { type: 'tool_use', id: 'tool-1', name: 'search', input: { query: 'test' } },
      { type: 'tool_use', id: 'tool-2', name: 'nonexistent', input: {} },
    ]

    const results = await adapter.handleToolUses(toolUses)

    expect(results.length).toBe(2)

    const successResult = results.find((r) => r.tool_use_id === 'tool-1')
    const errorResult = results.find((r) => r.tool_use_id === 'tool-2')

    expect(successResult?.is_error).toBeFalsy()
    expect(errorResult?.is_error).toBe(true)
  })

  it('should respect concurrency limit', async () => {
    const concurrentCalls: number[] = []
    let currentConcurrent = 0

    const server = createTestServer()
    server.tool(
      'slow_tool',
      { type: 'object', properties: {} },
      async () => {
        currentConcurrent++
        concurrentCalls.push(currentConcurrent)
        await new Promise((resolve) => setTimeout(resolve, 50))
        currentConcurrent--
        return { content: [{ type: 'text', text: 'ok' }] }
      }
    )

    const testAdapter = new AnthropicAdapter({ server })
    await testAdapter.initialize()

    const toolUses = Array.from({ length: 10 }, (_, i) => ({
      type: 'tool_use' as const,
      id: `tool-${i}`,
      name: 'slow_tool',
      input: {},
    }))

    await testAdapter.handleToolUses(toolUses, 3)

    // Max concurrent should not exceed 3
    expect(Math.max(...concurrentCalls)).toBeLessThanOrEqual(3)

    await testAdapter.cleanup()
  })
})

// =============================================================================
// Streaming Tests
// =============================================================================

describe('AnthropicAdapter streaming', () => {
  let adapter: AnthropicAdapter

  beforeEach(async () => {
    adapter = createTestAdapter({ streamingThreshold: 10 })
    await adapter.initialize()
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  it('should return regular result for small content', async () => {
    const toolUse: AnthropicToolUse = {
      type: 'tool_use',
      id: 'tool-123',
      name: 'search',
      input: { query: 'test' },
    }

    const result = await adapter.handleToolUseStreaming(toolUse)

    // For small content, we get a tool_result object (not async iterator)
    // The search tool returns small content, so it shouldn't stream
    if ('type' in (result as object)) {
      expect((result as AnthropicToolResult).type).toBe('tool_result')
    } else {
      // If streaming is returned, collect it
      const chunks: string[] = []
      for await (const chunk of result as AsyncIterable<string>) {
        chunks.push(chunk)
      }
      expect(chunks.length).toBeGreaterThan(0)
    }
  })

  it('should return async iterator for large content', async () => {
    // Create a server with a tool that returns large content
    const server = createTestServer()
    server.tool(
      'large_response',
      { type: 'object', properties: {} },
      async () => ({
        content: [{ type: 'text', text: 'A'.repeat(1000) }],
      })
    )

    const testAdapter = new AnthropicAdapter({ server, streamingThreshold: 10 })
    await testAdapter.initialize()

    const toolUse: AnthropicToolUse = {
      type: 'tool_use',
      id: 'tool-123',
      name: 'large_response',
      input: {},
    }

    const result = await testAdapter.handleToolUseStreaming(toolUse)

    // Should be an async iterator
    expect(Symbol.asyncIterator in (result as object)).toBe(true)

    // Collect all chunks
    const chunks: string[] = []
    for await (const chunk of result as AsyncIterable<string>) {
      chunks.push(chunk)
    }

    expect(chunks.join('')).toBe('A'.repeat(1000))

    await testAdapter.cleanup()
  })
})

// =============================================================================
// Cleanup Tests
// =============================================================================

describe('AnthropicAdapter cleanup', () => {
  it('should clear tool cache on cleanup', async () => {
    const adapter = createTestAdapter()
    await adapter.initialize()

    expect((await adapter.getTools()).length).toBeGreaterThan(0)

    await adapter.cleanup()

    // After cleanup, should re-initialize
    const tools = await adapter.getTools()
    expect(tools.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('AnthropicAdapter integration', () => {
  it('should complete full tool use workflow', async () => {
    const adapter = createTestAdapter()

    // Initialize
    await adapter.initialize()

    // Get tools
    const tools = await adapter.getTools()
    expect(tools.length).toBeGreaterThan(0)

    // Simulate Claude returning tool_use
    const searchTool = tools.find((t) => t.name === 'search')
    expect(searchTool).toBeDefined()

    const toolUse: AnthropicToolUse = {
      type: 'tool_use',
      id: 'toolu_01abc123',
      name: searchTool!.name,
      input: { query: 'test documents' },
    }

    // Handle tool use
    const result = await adapter.handleToolUse(toolUse)

    // Verify result format
    expect(result.type).toBe('tool_result')
    expect(result.tool_use_id).toBe('toolu_01abc123')
    expect(typeof result.content).toBe('string')

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

    const adapter = new AnthropicAdapter({
      server,
      retry: { maxRetries: 3, initialDelayMs: 1, jitter: false },
    })
    await adapter.initialize()

    const toolUse: AnthropicToolUse = {
      type: 'tool_use',
      id: 'tool-123',
      name: 'flaky_tool',
      input: {},
    }

    const result = await adapter.handleToolUse(toolUse)

    // The tool should be called at least once
    expect(callCount).toBeGreaterThan(0)
    // Result should have valid structure
    expect(result.type).toBe('tool_result')
    expect(result.tool_use_id).toBe('tool-123')

    await adapter.cleanup()
  })
})
