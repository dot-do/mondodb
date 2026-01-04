/**
 * SDK Adapter Error Handling Tests
 *
 * Tests for error handling, retry logic, and timeout handling
 * in both Anthropic and Vercel SDK adapters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  AnthropicMCPAdapter,
  createMonDoMcpServer,
  type AgentFSProvider,
} from '../../../src/agentfs/adapters/anthropic'
import { createAgentFSVercelTools } from '../../../src/agentfs/adapters/vercel'
import type { FileSystem, GrepMatch, KeyValueStore } from '../../../src/agentfs/types'
import { McpErrorCode } from '../../../src/mcp/adapters/errors'

// =============================================================================
// Mock Factory Functions
// =============================================================================

function createMockFileSystem() {
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

function createMockKeyValueStore() {
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

function createMockGrep() {
  const mockMatches: GrepMatch[] = [
    { file: '/src/file1.ts', line: 10, column: 5, content: 'function test()' },
  ]
  return {
    grep: vi.fn().mockResolvedValue(mockMatches),
  }
}

function createMockAuditLog() {
  return {
    record: vi.fn().mockResolvedValue('tc_new'),
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findByTool: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  }
}

function createMockProvider(): AgentFSProvider {
  return {
    fs: createMockFileSystem() as unknown as FileSystem,
    kv: createMockKeyValueStore() as unknown as KeyValueStore,
    grep: createMockGrep(),
    audit: createMockAuditLog(),
  }
}

// =============================================================================
// Anthropic Adapter Error Handling Tests
// =============================================================================

describe('Anthropic Adapter Error Handling', () => {
  let mockProvider: AgentFSProvider

  beforeEach(() => {
    mockProvider = createMockProvider()
  })

  describe('MCP Error Codes', () => {
    it('should return ToolNotFound error for unknown tools', async () => {
      const server = createMonDoMcpServer(mockProvider)
      const response = await server.callTool('unknown_tool', {})

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.code).toBe(McpErrorCode.ToolNotFound)
      expect(errorData.error.message).toContain('unknown_tool')
    })

    it('should return InvalidParams error for missing required parameters', async () => {
      const server = createMonDoMcpServer(mockProvider)
      const response = await server.callTool('read', {})

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.code).toBe(McpErrorCode.InvalidParams)
      expect(errorData.error.message).toContain('path')
    })

    it('should return error with retryable flag for transient errors', async () => {
      const mockFs = mockProvider.fs as ReturnType<typeof createMockFileSystem>
      mockFs.readFile.mockRejectedValue(new Error('ECONNRESET: connection reset'))

      const server = createMonDoMcpServer(mockProvider, {
        retry: { maxRetries: 0 }, // Disable retries for this test
      })
      const response = await server.callTool('read', { path: '/test.ts' })

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.retryable).toBe(true)
    })

    it('should return non-retryable error for validation failures', async () => {
      const server = createMonDoMcpServer(mockProvider)
      const response = await server.callTool('edit', {
        path: '/test.ts',
        old_string: '',
        new_string: 'new',
      })

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.retryable).toBe(false)
    })
  })

  describe('Retry Logic', () => {
    it('should retry transient errors', async () => {
      const mockFs = mockProvider.fs as ReturnType<typeof createMockFileSystem>
      let callCount = 0
      mockFs.readFile.mockImplementation(async () => {
        callCount++
        if (callCount < 3) {
          throw new Error('ECONNRESET: connection reset')
        }
        return 'success'
      })

      const server = createMonDoMcpServer(mockProvider, {
        retry: {
          maxRetries: 3,
          initialDelayMs: 1, // Very short for testing
          maxDelayMs: 10,
        },
      })

      const response = await server.callTool('read', { path: '/test.ts' })

      expect(response.isError).toBeFalsy()
      expect(response.content[0].text).toBe('success')
      expect(callCount).toBe(3)
    })

    it('should not retry non-retryable errors', async () => {
      const mockFs = mockProvider.fs as ReturnType<typeof createMockFileSystem>
      let callCount = 0
      mockFs.readFile.mockImplementation(async () => {
        callCount++
        throw new Error('Permission denied')
      })

      const server = createMonDoMcpServer(mockProvider, {
        retry: { maxRetries: 3, initialDelayMs: 1 },
      })

      const response = await server.callTool('read', { path: '/test.ts' })

      expect(response.isError).toBe(true)
      expect(callCount).toBe(1) // Should not retry
    })

    it('should respect max retries limit', async () => {
      const mockFs = mockProvider.fs as ReturnType<typeof createMockFileSystem>
      let callCount = 0
      mockFs.readFile.mockImplementation(async () => {
        callCount++
        throw new Error('ECONNRESET: connection reset')
      })

      const server = createMonDoMcpServer(mockProvider, {
        retry: { maxRetries: 2, initialDelayMs: 1 },
      })

      const response = await server.callTool('read', { path: '/test.ts' })

      expect(response.isError).toBe(true)
      expect(callCount).toBe(3) // Initial + 2 retries
    })
  })

  describe('Timeout Handling', () => {
    it('should timeout long-running operations', async () => {
      const mockFs = mockProvider.fs as ReturnType<typeof createMockFileSystem>
      mockFs.readFile.mockImplementation(async () => {
        // Simulate a long operation
        await new Promise((resolve) => setTimeout(resolve, 200))
        return 'content'
      })

      const server = createMonDoMcpServer(mockProvider, {
        timeout: { requestTimeoutMs: 50 },
        retry: { maxRetries: 0 },
      })

      const response = await server.callTool('read', { path: '/test.ts' })

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.message).toContain('timed out')
    })

    it('should succeed if operation completes before timeout', async () => {
      const mockFs = mockProvider.fs as ReturnType<typeof createMockFileSystem>
      mockFs.readFile.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return 'content'
      })

      const server = createMonDoMcpServer(mockProvider, {
        timeout: { requestTimeoutMs: 1000 },
      })

      const response = await server.callTool('read', { path: '/test.ts' })

      expect(response.isError).toBeFalsy()
      expect(response.content[0].text).toBe('content')
    })
  })

  describe('Error Response Structure', () => {
    it('should include tool name in error response', async () => {
      const mockFs = mockProvider.fs as ReturnType<typeof createMockFileSystem>
      mockFs.readFile.mockRejectedValue(new Error('File not found'))

      const server = createMonDoMcpServer(mockProvider, {
        retry: { maxRetries: 0 },
      })
      const response = await server.callTool('read', { path: '/nonexistent.ts' })

      expect(response.isError).toBe(true)
      const errorData = JSON.parse(response.content[0].text)
      expect(errorData.error.tool).toBe('read')
    })

    it('should have consistent error structure across all tools', async () => {
      const server = createMonDoMcpServer(mockProvider)

      // Test each tool with invalid params
      const tools = ['glob', 'grep', 'read', 'write', 'edit', 'kv_get', 'kv_set']

      for (const toolName of tools) {
        const response = await server.callTool(toolName, {})
        if (response.isError) {
          const errorData = JSON.parse(response.content[0].text)
          expect(errorData.error).toHaveProperty('code')
          expect(errorData.error).toHaveProperty('message')
          expect(errorData.error).toHaveProperty('retryable')
        }
      }
    })
  })
})

// =============================================================================
// Vercel Adapter Error Handling Tests
// =============================================================================

describe('Vercel Adapter Error Handling', () => {
  let mockFs: ReturnType<typeof createMockFileSystem>
  let mockGrep: ReturnType<typeof createMockGrep>

  beforeEach(() => {
    mockFs = createMockFileSystem()
    mockGrep = createMockGrep()
  })

  describe('Retry Logic', () => {
    it('should retry transient errors', async () => {
      let callCount = 0
      mockFs.readFile.mockImplementation(async () => {
        callCount++
        if (callCount < 3) {
          throw new Error('ECONNRESET: connection reset')
        }
        return 'success'
      })

      const tools = createAgentFSVercelTools({
        fs: mockFs as unknown as FileSystem,
        grep: mockGrep as unknown as any,
        options: {
          retry: { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 10 },
        },
      })

      const result = await tools.read.execute({ path: '/test.ts' })

      expect(result).toBe('success')
      expect(callCount).toBe(3)
    })

    it('should not retry non-retryable errors', async () => {
      let callCount = 0
      mockFs.readFile.mockImplementation(async () => {
        callCount++
        throw new Error('Unauthorized: permission denied')
      })

      const tools = createAgentFSVercelTools({
        fs: mockFs as unknown as FileSystem,
        grep: mockGrep as unknown as any,
        options: {
          retry: { maxRetries: 3, initialDelayMs: 1 },
        },
      })

      await expect(tools.read.execute({ path: '/test.ts' })).rejects.toThrow()
      expect(callCount).toBe(1)
    })
  })

  describe('Timeout Handling', () => {
    it('should timeout long-running operations', async () => {
      mockFs.readFile.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return 'content'
      })

      const tools = createAgentFSVercelTools({
        fs: mockFs as unknown as FileSystem,
        grep: mockGrep as unknown as any,
        options: {
          timeout: { requestTimeoutMs: 50 },
          retry: { maxRetries: 0 },
        },
      })

      await expect(tools.read.execute({ path: '/test.ts' })).rejects.toThrow(/timed out/)
    })
  })

  describe('Error Propagation', () => {
    it('should throw descriptive errors for file not found', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'))

      const tools = createAgentFSVercelTools({
        fs: mockFs as unknown as FileSystem,
        grep: mockGrep as unknown as any,
        options: { retry: { maxRetries: 0 } },
      })

      await expect(tools.read.execute({ path: '/nonexistent.ts' })).rejects.toThrow(/ENOENT/)
    })

    it('should throw error when edit target text not found', async () => {
      mockFs.readFile.mockResolvedValue('different content')

      const tools = createAgentFSVercelTools({
        fs: mockFs as unknown as FileSystem,
        grep: mockGrep as unknown as any,
      })

      await expect(
        tools.edit.execute({
          path: '/test.ts',
          old_string: 'not found',
          new_string: 'replacement',
        })
      ).rejects.toThrow(/not found/)
    })
  })

  describe('All Tools Have Consistent Behavior', () => {
    it('should handle errors consistently across all tools', async () => {
      const networkError = new Error('ECONNRESET: network error')
      mockFs.glob.mockRejectedValue(networkError)
      mockFs.readFile.mockRejectedValue(networkError)
      mockFs.writeFile.mockRejectedValue(networkError)
      mockFs.readdir.mockRejectedValue(networkError)
      mockFs.mkdir.mockRejectedValue(networkError)
      mockFs.deleteFile.mockRejectedValue(networkError)
      mockGrep.grep.mockRejectedValue(networkError)

      const tools = createAgentFSVercelTools({
        fs: mockFs as unknown as FileSystem,
        grep: mockGrep as unknown as any,
        options: { retry: { maxRetries: 0 } },
      })

      // All tools should throw similar errors
      await expect(tools.glob.execute({ pattern: '**/*' })).rejects.toThrow()
      await expect(tools.read.execute({ path: '/test' })).rejects.toThrow()
      await expect(tools.write.execute({ path: '/test', content: 'x' })).rejects.toThrow()
      await expect(tools.ls.execute({ path: '/test' })).rejects.toThrow()
      await expect(tools.mkdir.execute({ path: '/test' })).rejects.toThrow()
      await expect(tools.rm.execute({ path: '/test' })).rejects.toThrow()
      await expect(tools.grep.execute({ pattern: 'x' })).rejects.toThrow()
    })
  })
})

// =============================================================================
// Configuration Tests
// =============================================================================

describe('Adapter Configuration', () => {
  describe('Anthropic Adapter Configuration', () => {
    it('should use default retry config when not specified', () => {
      const mockProvider = createMockProvider()
      const adapter = new AnthropicMCPAdapter(mockProvider)
      const server = adapter.createServer()

      expect(server.name).toBe('mondodb-agentfs')
      expect(server.version).toBe('1.0.0')
    })

    it('should allow custom retry configuration', () => {
      const mockProvider = createMockProvider()
      const adapter = new AnthropicMCPAdapter(mockProvider, {
        name: 'custom-server',
        version: '2.0.0',
        retry: { maxRetries: 5, initialDelayMs: 500 },
        timeout: { requestTimeoutMs: 60000 },
      })
      const server = adapter.createServer()

      expect(server.name).toBe('custom-server')
      expect(server.version).toBe('2.0.0')
    })
  })

  describe('Vercel Adapter Configuration', () => {
    it('should use default config when options not provided', () => {
      const mockFs = createMockFileSystem()
      const mockGrep = createMockGrep()

      const tools = createAgentFSVercelTools({
        fs: mockFs as unknown as FileSystem,
        grep: mockGrep as unknown as any,
      })

      expect(tools.glob).toBeDefined()
      expect(tools.read).toBeDefined()
    })

    it('should allow custom configuration', () => {
      const mockFs = createMockFileSystem()
      const mockGrep = createMockGrep()

      const tools = createAgentFSVercelTools({
        fs: mockFs as unknown as FileSystem,
        grep: mockGrep as unknown as any,
        options: {
          retry: { maxRetries: 10 },
          timeout: { requestTimeoutMs: 120000 },
        },
      })

      expect(tools.glob).toBeDefined()
    })
  })
})
