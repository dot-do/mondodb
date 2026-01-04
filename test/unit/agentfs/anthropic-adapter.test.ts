/**
 * Anthropic MCP Adapter Tests
 *
 * TDD Red Phase: Tests for the Anthropic Agent SDK MCP adapter.
 * These tests verify that the adapter creates valid MCP tool definitions
 * and handles tool execution correctly for AgentFS operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  AnthropicMCPAdapter,
  createMonDoMcpServer,
  type AgentFSProvider,
} from '../../../src/agentfs/adapters/anthropic'
import type { FileSystem, GrepMatch, KeyValueStore, GrepOptions } from '../../../src/agentfs/types'
import type { McpToolDefinition, McpToolResponse } from '../../../src/mcp/types'
import type { ToolCallEntry, AuditQueryOptions } from '../../../src/agentfs/toolcalls'

// =============================================================================
// Mock Types
// =============================================================================

interface MockFileSystem extends FileSystem {
  readFile: ReturnType<typeof vi.fn>
  writeFile: ReturnType<typeof vi.fn>
  deleteFile: ReturnType<typeof vi.fn>
  readdir: ReturnType<typeof vi.fn>
  mkdir: ReturnType<typeof vi.fn>
  rmdir: ReturnType<typeof vi.fn>
  stat: ReturnType<typeof vi.fn>
  exists: ReturnType<typeof vi.fn>
  glob: ReturnType<typeof vi.fn>
}

interface MockKeyValueStore extends KeyValueStore {
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  has: ReturnType<typeof vi.fn>
  keys: ReturnType<typeof vi.fn>
  entries: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
}

interface MockGrep {
  grep: ReturnType<typeof vi.fn>
}

interface MockAuditLog {
  record: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
  findById: ReturnType<typeof vi.fn>
  findByTool: ReturnType<typeof vi.fn>
  count: ReturnType<typeof vi.fn>
}

// =============================================================================
// Mock Factory Functions
// =============================================================================

function createMockFileSystem(): MockFileSystem {
  return {
    readFile: vi.fn().mockResolvedValue('file content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue(['file1.ts', 'file2.ts']),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rmdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ type: 'file', size: 100, createdAt: new Date(), updatedAt: new Date() }),
    exists: vi.fn().mockResolvedValue(true),
    glob: vi.fn().mockResolvedValue(['/src/file1.ts', '/src/file2.ts']),
  }
}

function createMockKeyValueStore(): MockKeyValueStore {
  return {
    get: vi.fn().mockResolvedValue({ key: 'value' }),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    has: vi.fn().mockResolvedValue(true),
    keys: vi.fn().mockResolvedValue(['key1', 'key2']),
    entries: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(2),
  }
}

function createMockGrep(): MockGrep {
  const mockMatches: GrepMatch[] = [
    { file: '/src/file1.ts', line: 10, column: 5, content: 'function test()' },
    { file: '/src/file2.ts', line: 20, column: 1, content: 'const test = 123' },
  ]
  return {
    grep: vi.fn().mockResolvedValue(mockMatches),
  }
}

function createMockAuditLog(): MockAuditLog {
  const mockEntries: ToolCallEntry[] = [
    {
      id: 'tc_1',
      tool: 'glob',
      inputs: { pattern: '**/*.ts' },
      outputs: { files: ['/src/file1.ts'] },
      timestamp: new Date(),
    },
  ]
  return {
    record: vi.fn().mockResolvedValue('tc_new'),
    list: vi.fn().mockResolvedValue(mockEntries),
    findById: vi.fn().mockResolvedValue(mockEntries[0]),
    findByTool: vi.fn().mockResolvedValue(mockEntries),
    count: vi.fn().mockResolvedValue(1),
  }
}

function createMockProvider(): AgentFSProvider {
  return {
    fs: createMockFileSystem(),
    kv: createMockKeyValueStore(),
    grep: createMockGrep(),
    audit: createMockAuditLog(),
  }
}

// =============================================================================
// Adapter Creation Tests
// =============================================================================

describe('AnthropicMCPAdapter', () => {
  let adapter: AnthropicMCPAdapter
  let mockProvider: AgentFSProvider

  beforeEach(() => {
    mockProvider = createMockProvider()
    adapter = new AnthropicMCPAdapter(mockProvider)
  })

  describe('createServer', () => {
    it('should create a valid MCP server', () => {
      const server = adapter.createServer()

      expect(server).toBeDefined()
      expect(server.name).toBe('mondodb-agentfs')
      expect(server.version).toBe('1.0.0')
    })

    it('should allow custom server name and version', () => {
      adapter = new AnthropicMCPAdapter(mockProvider, {
        name: 'custom-agentfs',
        version: '2.0.0',
      })
      const server = adapter.createServer()

      expect(server.name).toBe('custom-agentfs')
      expect(server.version).toBe('2.0.0')
    })
  })

  describe('tool registration', () => {
    it('should register all AgentFS tools', async () => {
      const server = adapter.createServer()
      const tools = await server.listTools()

      const toolNames = tools.map((t: McpToolDefinition) => t.name)
      expect(toolNames).toContain('glob')
      expect(toolNames).toContain('grep')
      expect(toolNames).toContain('read')
      expect(toolNames).toContain('write')
      expect(toolNames).toContain('edit')
      expect(toolNames).toContain('kv_get')
      expect(toolNames).toContain('kv_set')
      expect(toolNames).toContain('audit_list')
    })

    it('should have valid tool definitions with descriptions', async () => {
      const server = adapter.createServer()
      const tools = await server.listTools()

      for (const tool of tools) {
        expect(tool.name).toBeTruthy()
        expect(typeof tool.name).toBe('string')
        expect(tool.description).toBeTruthy()
        expect(typeof tool.description).toBe('string')
        expect(tool.inputSchema).toBeDefined()
        expect(tool.inputSchema.type).toBe('object')
      }
    })
  })
})

// =============================================================================
// Tool Schema Tests
// =============================================================================

describe('MCP Tool Schemas', () => {
  let adapter: AnthropicMCPAdapter
  let mockProvider: AgentFSProvider

  beforeEach(() => {
    mockProvider = createMockProvider()
    adapter = new AnthropicMCPAdapter(mockProvider)
  })

  describe('glob tool schema', () => {
    it('should have correct input schema', async () => {
      const server = adapter.createServer()
      const tools = await server.listTools()
      const globTool = tools.find((t: McpToolDefinition) => t.name === 'glob')

      expect(globTool).toBeDefined()
      expect(globTool?.inputSchema.properties?.pattern).toBeDefined()
      expect(globTool?.inputSchema.required).toContain('pattern')
      expect(globTool?.annotations?.readOnlyHint).toBe(true)
    })
  })

  describe('grep tool schema', () => {
    it('should have correct input schema with optional fields', async () => {
      const server = adapter.createServer()
      const tools = await server.listTools()
      const grepTool = tools.find((t: McpToolDefinition) => t.name === 'grep')

      expect(grepTool).toBeDefined()
      expect(grepTool?.inputSchema.properties?.pattern).toBeDefined()
      expect(grepTool?.inputSchema.properties?.glob).toBeDefined()
      expect(grepTool?.inputSchema.properties?.caseInsensitive).toBeDefined()
      expect(grepTool?.inputSchema.required).toContain('pattern')
      expect(grepTool?.annotations?.readOnlyHint).toBe(true)
    })
  })

  describe('read tool schema', () => {
    it('should require path parameter', async () => {
      const server = adapter.createServer()
      const tools = await server.listTools()
      const readTool = tools.find((t: McpToolDefinition) => t.name === 'read')

      expect(readTool).toBeDefined()
      expect(readTool?.inputSchema.properties?.path).toBeDefined()
      expect(readTool?.inputSchema.required).toContain('path')
      expect(readTool?.annotations?.readOnlyHint).toBe(true)
    })
  })

  describe('write tool schema', () => {
    it('should require path and content parameters', async () => {
      const server = adapter.createServer()
      const tools = await server.listTools()
      const writeTool = tools.find((t: McpToolDefinition) => t.name === 'write')

      expect(writeTool).toBeDefined()
      expect(writeTool?.inputSchema.properties?.path).toBeDefined()
      expect(writeTool?.inputSchema.properties?.content).toBeDefined()
      expect(writeTool?.inputSchema.required).toContain('path')
      expect(writeTool?.inputSchema.required).toContain('content')
      expect(writeTool?.annotations?.readOnlyHint).toBe(false)
    })
  })

  describe('edit tool schema', () => {
    it('should require path, old_string, and new_string parameters', async () => {
      const server = adapter.createServer()
      const tools = await server.listTools()
      const editTool = tools.find((t: McpToolDefinition) => t.name === 'edit')

      expect(editTool).toBeDefined()
      expect(editTool?.inputSchema.properties?.path).toBeDefined()
      expect(editTool?.inputSchema.properties?.old_string).toBeDefined()
      expect(editTool?.inputSchema.properties?.new_string).toBeDefined()
      expect(editTool?.inputSchema.required).toContain('path')
      expect(editTool?.inputSchema.required).toContain('old_string')
      expect(editTool?.inputSchema.required).toContain('new_string')
      expect(editTool?.annotations?.readOnlyHint).toBe(false)
    })
  })

  describe('kv_get tool schema', () => {
    it('should require key parameter', async () => {
      const server = adapter.createServer()
      const tools = await server.listTools()
      const kvGetTool = tools.find((t: McpToolDefinition) => t.name === 'kv_get')

      expect(kvGetTool).toBeDefined()
      expect(kvGetTool?.inputSchema.properties?.key).toBeDefined()
      expect(kvGetTool?.inputSchema.required).toContain('key')
      expect(kvGetTool?.annotations?.readOnlyHint).toBe(true)
    })
  })

  describe('kv_set tool schema', () => {
    it('should require key and value parameters', async () => {
      const server = adapter.createServer()
      const tools = await server.listTools()
      const kvSetTool = tools.find((t: McpToolDefinition) => t.name === 'kv_set')

      expect(kvSetTool).toBeDefined()
      expect(kvSetTool?.inputSchema.properties?.key).toBeDefined()
      expect(kvSetTool?.inputSchema.properties?.value).toBeDefined()
      expect(kvSetTool?.inputSchema.required).toContain('key')
      expect(kvSetTool?.inputSchema.required).toContain('value')
      expect(kvSetTool?.annotations?.readOnlyHint).toBe(false)
    })
  })

  describe('audit_list tool schema', () => {
    it('should have optional filter parameters', async () => {
      const server = adapter.createServer()
      const tools = await server.listTools()
      const auditTool = tools.find((t: McpToolDefinition) => t.name === 'audit_list')

      expect(auditTool).toBeDefined()
      expect(auditTool?.inputSchema.properties?.limit).toBeDefined()
      expect(auditTool?.inputSchema.properties?.tool).toBeDefined()
      expect(auditTool?.annotations?.readOnlyHint).toBe(true)
    })
  })
})

// =============================================================================
// Tool Execution Tests
// =============================================================================

describe('Tool Execution', () => {
  let adapter: AnthropicMCPAdapter
  let mockProvider: AgentFSProvider

  beforeEach(() => {
    mockProvider = createMockProvider()
    adapter = new AnthropicMCPAdapter(mockProvider)
  })

  describe('glob tool', () => {
    it('should return file list from glob pattern', async () => {
      const server = adapter.createServer()
      const response = await server.callTool('glob', { pattern: '**/*.ts' })

      expect(response.isError).toBeFalsy()
      expect(response.content).toBeDefined()
      expect(response.content[0].type).toBe('text')

      const text = response.content[0].text
      expect(text).toContain('/src/file1.ts')
      expect(text).toContain('/src/file2.ts')
    })

    it('should call fs.glob with correct pattern', async () => {
      const server = adapter.createServer()
      await server.callTool('glob', { pattern: 'src/**/*.ts' })

      const mockFs = mockProvider.fs as MockFileSystem
      expect(mockFs.glob).toHaveBeenCalledWith('src/**/*.ts')
    })
  })

  describe('grep tool', () => {
    it('should return search matches', async () => {
      const server = adapter.createServer()
      const response = await server.callTool('grep', { pattern: 'function' })

      expect(response.isError).toBeFalsy()
      const text = response.content[0].text
      expect(text).toContain('/src/file1.ts')
      expect(text).toContain('function test()')
    })

    it('should pass options to grep', async () => {
      const server = adapter.createServer()
      await server.callTool('grep', {
        pattern: 'test',
        glob: '**/*.ts',
        caseInsensitive: true,
      })

      const mockGrepObj = mockProvider.grep as MockGrep
      expect(mockGrepObj.grep).toHaveBeenCalledWith('test', expect.objectContaining({
        glob: '**/*.ts',
        caseInsensitive: true,
      }))
    })
  })

  describe('read tool', () => {
    it('should return file content', async () => {
      const server = adapter.createServer()
      const response = await server.callTool('read', { path: '/src/file.ts' })

      expect(response.isError).toBeFalsy()
      expect(response.content[0].text).toBe('file content')
    })

    it('should handle file not found errors', async () => {
      const mockFs = mockProvider.fs as MockFileSystem
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'))

      const server = adapter.createServer()
      const response = await server.callTool('read', { path: '/nonexistent.ts' })

      expect(response.isError).toBe(true)
      expect(response.content[0].text).toContain('ENOENT')
    })
  })

  describe('write tool', () => {
    it('should write content to file', async () => {
      const server = adapter.createServer()
      const response = await server.callTool('write', {
        path: '/src/new-file.ts',
        content: 'new content',
      })

      expect(response.isError).toBeFalsy()
      expect(response.content[0].text).toContain('OK')

      const mockFs = mockProvider.fs as MockFileSystem
      expect(mockFs.writeFile).toHaveBeenCalledWith('/src/new-file.ts', 'new content')
    })
  })

  describe('edit tool', () => {
    it('should replace text in file', async () => {
      const mockFs = mockProvider.fs as MockFileSystem
      mockFs.readFile.mockResolvedValue('const old = 1')

      const server = adapter.createServer()
      const response = await server.callTool('edit', {
        path: '/src/file.ts',
        old_string: 'old',
        new_string: 'new',
      })

      expect(response.isError).toBeFalsy()
      expect(mockFs.writeFile).toHaveBeenCalledWith('/src/file.ts', 'const new = 1')
    })

    it('should return error if old_string not found', async () => {
      const mockFs = mockProvider.fs as MockFileSystem
      mockFs.readFile.mockResolvedValue('const existing = 1')

      const server = adapter.createServer()
      const response = await server.callTool('edit', {
        path: '/src/file.ts',
        old_string: 'nonexistent',
        new_string: 'replacement',
      })

      expect(response.isError).toBe(true)
      expect(response.content[0].text).toContain('not found')
    })
  })

  describe('kv_get tool', () => {
    it('should return value for key', async () => {
      const server = adapter.createServer()
      const response = await server.callTool('kv_get', { key: 'mykey' })

      expect(response.isError).toBeFalsy()
      const text = response.content[0].text
      const parsed = JSON.parse(text)
      expect(parsed.key).toBe('value')
    })

    it('should return null for missing key', async () => {
      const mockKv = mockProvider.kv as MockKeyValueStore
      mockKv.get.mockResolvedValue(undefined)

      const server = adapter.createServer()
      const response = await server.callTool('kv_get', { key: 'missing' })

      expect(response.isError).toBeFalsy()
      expect(response.content[0].text).toBe('null')
    })
  })

  describe('kv_set tool', () => {
    it('should set value for key', async () => {
      const server = adapter.createServer()
      const response = await server.callTool('kv_set', {
        key: 'newkey',
        value: { data: 123 },
      })

      expect(response.isError).toBeFalsy()
      expect(response.content[0].text).toContain('OK')

      const mockKv = mockProvider.kv as MockKeyValueStore
      expect(mockKv.set).toHaveBeenCalledWith('newkey', { data: 123 })
    })
  })

  describe('audit_list tool', () => {
    it('should return audit log entries', async () => {
      const server = adapter.createServer()
      const response = await server.callTool('audit_list', {})

      expect(response.isError).toBeFalsy()
      const text = response.content[0].text
      const entries = JSON.parse(text)
      expect(Array.isArray(entries)).toBe(true)
      expect(entries[0].tool).toBe('glob')
    })

    it('should pass filter options', async () => {
      const server = adapter.createServer()
      await server.callTool('audit_list', { limit: 10, tool: 'grep' })

      const mockAudit = mockProvider.audit as MockAuditLog
      expect(mockAudit.list).toHaveBeenCalledWith(expect.objectContaining({
        limit: 10,
        tool: 'grep',
      }))
    })
  })
})

// =============================================================================
// Response Format Tests
// =============================================================================

describe('Response Format', () => {
  let adapter: AnthropicMCPAdapter
  let mockProvider: AgentFSProvider

  beforeEach(() => {
    mockProvider = createMockProvider()
    adapter = new AnthropicMCPAdapter(mockProvider)
  })

  it('should return MCP-compatible response format', async () => {
    const server = adapter.createServer()
    const response = await server.callTool('glob', { pattern: '**/*.ts' })

    expect(response).toHaveProperty('content')
    expect(Array.isArray(response.content)).toBe(true)
    expect(response.content[0]).toHaveProperty('type')
    expect(response.content[0]).toHaveProperty('text')
  })

  it('should format error responses correctly', async () => {
    const mockFs = mockProvider.fs as MockFileSystem
    mockFs.glob.mockRejectedValue(new Error('Permission denied'))

    const server = adapter.createServer()
    const response = await server.callTool('glob', { pattern: '**/*' })

    expect(response.isError).toBe(true)
    expect(response.content[0].type).toBe('text')
    expect(response.content[0].text).toContain('Permission denied')
  })

  it('should handle large responses', async () => {
    const largeFileList = Array.from({ length: 1000 }, (_, i) => `/src/file${i}.ts`)
    const mockFs = mockProvider.fs as MockFileSystem
    mockFs.glob.mockResolvedValue(largeFileList)

    const server = adapter.createServer()
    const response = await server.callTool('glob', { pattern: '**/*.ts' })

    expect(response.isError).toBeFalsy()
    expect(response.content[0].text.length).toBeGreaterThan(0)
    // Verify all files are included
    expect(response.content[0].text).toContain('/src/file0.ts')
    expect(response.content[0].text).toContain('/src/file999.ts')
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error Handling', () => {
  let adapter: AnthropicMCPAdapter
  let mockProvider: AgentFSProvider

  beforeEach(() => {
    mockProvider = createMockProvider()
    adapter = new AnthropicMCPAdapter(mockProvider)
  })

  it('should handle missing required parameters', async () => {
    const server = adapter.createServer()
    const response = await server.callTool('read', {})

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain('path')
  })

  it('should handle filesystem errors gracefully', async () => {
    const mockFs = mockProvider.fs as MockFileSystem
    mockFs.readFile.mockRejectedValue(new Error('EACCES: permission denied'))

    const server = adapter.createServer()
    const response = await server.callTool('read', { path: '/protected/file.ts' })

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain('permission denied')
  })

  it('should handle KV store errors', async () => {
    const mockKv = mockProvider.kv as MockKeyValueStore
    mockKv.set.mockRejectedValue(new Error('Storage quota exceeded'))

    const server = adapter.createServer()
    const response = await server.callTool('kv_set', { key: 'k', value: 'v' })

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain('quota exceeded')
  })

  it('should handle unknown tool gracefully', async () => {
    const server = adapter.createServer()
    const response = await server.callTool('unknown_tool', {})

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain('unknown_tool')
  })
})

// =============================================================================
// Input Validation Tests
// =============================================================================

describe('Input Validation', () => {
  let adapter: AnthropicMCPAdapter
  let mockProvider: AgentFSProvider

  beforeEach(() => {
    mockProvider = createMockProvider()
    adapter = new AnthropicMCPAdapter(mockProvider)
  })

  it('should validate glob pattern is a string', async () => {
    const server = adapter.createServer()
    // @ts-expect-error Testing invalid input
    const response = await server.callTool('glob', { pattern: 123 })

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain('pattern')
  })

  it('should validate file path is absolute', async () => {
    const server = adapter.createServer()
    // Relative paths should still work but adapter may normalize them
    const response = await server.callTool('read', { path: 'relative/path.ts' })

    // Implementation should handle this - either error or normalize
    expect(response).toBeDefined()
  })

  it('should validate edit operation has non-empty strings', async () => {
    const server = adapter.createServer()
    const response = await server.callTool('edit', {
      path: '/src/file.ts',
      old_string: '',
      new_string: 'new',
    })

    expect(response.isError).toBe(true)
    expect(response.content[0].text).toContain('old_string')
  })
})

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('createMonDoMcpServer', () => {
  it('should create server with default options', () => {
    const mockProvider = createMockProvider()
    const server = createMonDoMcpServer(mockProvider)

    expect(server).toBeDefined()
    expect(server.name).toBe('mondodb-agentfs')
    expect(server.version).toBe('1.0.0')
  })

  it('should create server with custom options', () => {
    const mockProvider = createMockProvider()
    const server = createMonDoMcpServer(mockProvider, {
      name: 'custom-server',
      version: '3.0.0',
    })

    expect(server.name).toBe('custom-server')
    expect(server.version).toBe('3.0.0')
  })

  it('should have all tools registered', async () => {
    const mockProvider = createMockProvider()
    const server = createMonDoMcpServer(mockProvider)
    const tools = await server.listTools()

    expect(tools.length).toBeGreaterThanOrEqual(8)
  })
})

// =============================================================================
// Audit Integration Tests
// =============================================================================

describe('Audit Integration', () => {
  let adapter: AnthropicMCPAdapter
  let mockProvider: AgentFSProvider

  beforeEach(() => {
    mockProvider = createMockProvider()
    adapter = new AnthropicMCPAdapter(mockProvider)
  })

  it('should record tool calls to audit log when enabled', async () => {
    adapter = new AnthropicMCPAdapter(mockProvider, { enableAudit: true })
    const server = adapter.createServer()

    await server.callTool('glob', { pattern: '**/*.ts' })

    const mockAudit = mockProvider.audit as MockAuditLog
    expect(mockAudit.record).toHaveBeenCalledWith(
      'glob',
      expect.objectContaining({ pattern: '**/*.ts' }),
      expect.anything(),
      expect.anything()
    )
  })

  it('should not record tool calls when audit disabled', async () => {
    adapter = new AnthropicMCPAdapter(mockProvider, { enableAudit: false })
    const server = adapter.createServer()

    await server.callTool('glob', { pattern: '**/*.ts' })

    const mockAudit = mockProvider.audit as MockAuditLog
    expect(mockAudit.record).not.toHaveBeenCalled()
  })
})
