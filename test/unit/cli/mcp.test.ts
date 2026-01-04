/**
 * CLI MCP Command Tests (RED Phase - TDD)
 *
 * Comprehensive tests for the MondoDB CLI `mcp` command.
 * These tests should FAIL initially as the CLI MCP command doesn't exist yet.
 *
 * Features to implement:
 * - Command registration (mcp command with --connection and --local options)
 * - Server startup (stdio transport)
 * - Remote database access (HTTP client to Cloudflare Worker)
 * - Local database access (SQLite backend)
 *
 * Test ID: mondodb-01xs
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'

// These imports will fail until the CLI MCP command is implemented
import {
  registerMcpCommand,
  startMcpServer,
  createMcpDatabaseAccess,
  type McpCommandOptions,
  type McpServerController,
} from '../../../src/cli/mcp.js'

import type { DatabaseAccess } from '../../../src/mcp/types.js'

// Check if we're running in Bun (for local SQLite tests)
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
const describeIfBun = isBun ? describe : describe.skip

// =============================================================================
// Command Registration Tests
// =============================================================================

describe('CLI MCP Command Registration', () => {
  describe('registerMcpCommand()', () => {
    it('should register mcp command', () => {
      // Create a mock CLI program object
      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
      }

      registerMcpCommand(mockProgram)

      // Verify the command was registered
      expect(mockProgram.command).toHaveBeenCalledWith('mcp')
    })

    it('should accept --connection option', () => {
      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
      }

      registerMcpCommand(mockProgram)

      // Verify --connection option was added
      const connectionOptionCall = mockProgram.option.mock.calls.find(
        (call: unknown[]) => call[0]?.includes('--connection') || call[0]?.includes('-c')
      )
      expect(connectionOptionCall).toBeDefined()
    })

    it('should accept --local option', () => {
      const mockProgram = {
        command: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
      }

      registerMcpCommand(mockProgram)

      // Verify --local option was added
      const localOptionCall = mockProgram.option.mock.calls.find(
        (call: unknown[]) => call[0]?.includes('--local') || call[0]?.includes('-l')
      )
      expect(localOptionCall).toBeDefined()
    })
  })
})

// =============================================================================
// Server Startup Tests
// =============================================================================

describe('MCP Server Startup', () => {
  let mockStdin: NodeJS.ReadableStream
  let mockStdout: NodeJS.WritableStream
  let controller: McpServerController | undefined

  beforeEach(() => {
    // Create mock streams
    mockStdin = {
      on: vi.fn(),
      removeListener: vi.fn(),
      setEncoding: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
    } as unknown as NodeJS.ReadableStream

    mockStdout = {
      write: vi.fn(),
    } as unknown as NodeJS.WritableStream
  })

  afterEach(async () => {
    if (controller) {
      await controller.stop()
      controller = undefined
    }
  })

  describe('startMcpServer()', () => {
    it('should start stdio server with connection string', async () => {
      const options: McpCommandOptions = {
        connection: 'https://my-mondodb.workers.dev',
        stdin: mockStdin,
        stdout: mockStdout,
      }

      controller = await startMcpServer(options)

      expect(controller).toBeDefined()
      expect(controller.isRunning).toBe(true)
    })

    // This test requires Bun runtime for local SQLite
    it.skipIf(!isBun)('should start with local database path', async () => {
      const options: McpCommandOptions = {
        local: './test-data/local.db',
        stdin: mockStdin,
        stdout: mockStdout,
      }

      controller = await startMcpServer(options)

      expect(controller).toBeDefined()
      expect(controller.isRunning).toBe(true)
    })

    it('should handle tools/list request', async () => {
      const writtenData: string[] = []
      const captureStdout = {
        write: vi.fn((data: string) => {
          writtenData.push(data)
          return true
        }),
      } as unknown as NodeJS.WritableStream

      const dataHandler = vi.fn()
      const mockStdinWithCapture = {
        on: vi.fn((event: string, handler: (data: string) => void) => {
          if (event === 'data') {
            dataHandler.mockImplementation(handler)
          }
          return mockStdinWithCapture
        }),
        removeListener: vi.fn(),
        setEncoding: vi.fn(),
        resume: vi.fn(),
        pause: vi.fn(),
      } as unknown as NodeJS.ReadableStream

      const options: McpCommandOptions = {
        // Use connection URL (no local SQLite required)
        connection: 'https://my-mondodb.workers.dev',
        stdin: mockStdinWithCapture,
        stdout: captureStdout,
      }

      controller = await startMcpServer(options)

      // Send a tools/list request
      const toolsListRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }) + '\n'

      // Simulate receiving the request
      dataHandler(toolsListRequest)

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify response was written
      expect(captureStdout.write).toHaveBeenCalled()

      // Parse the response
      const responseStr = writtenData.find(d => d.includes('tools'))
      expect(responseStr).toBeDefined()

      const response = JSON.parse(responseStr!.trim())
      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(1)
      expect(response.result).toBeDefined()
      expect(response.result.tools).toBeDefined()
      expect(Array.isArray(response.result.tools)).toBe(true)
    })
  })
})

// =============================================================================
// Remote Database Access Tests
// =============================================================================

describe('Remote Database Access', () => {
  describe('createMcpDatabaseAccess() with connection string', () => {
    it('should create HTTP client for remote database', async () => {
      const dbAccess = await createMcpDatabaseAccess({
        connection: 'https://my-mondodb.workers.dev',
      })

      expect(dbAccess).toBeDefined()
      // Verify it implements DatabaseAccess interface
      expect(typeof dbAccess.find).toBe('function')
      expect(typeof dbAccess.findOne).toBe('function')
      expect(typeof dbAccess.insertOne).toBe('function')
      expect(typeof dbAccess.updateOne).toBe('function')
      expect(typeof dbAccess.deleteOne).toBe('function')
    })

    it('should forward requests to remote worker', async () => {
      // Mock fetch for this test
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
      global.fetch = mockFetch

      const dbAccess = await createMcpDatabaseAccess({
        connection: 'https://my-mondodb.workers.dev',
      })

      // Make a request
      await dbAccess.find('users', { name: 'test' })

      // Verify fetch was called with correct URL
      expect(mockFetch).toHaveBeenCalled()
      const fetchCall = mockFetch.mock.calls[0]
      expect(fetchCall[0]).toContain('my-mondodb.workers.dev')
    })
  })
})

// =============================================================================
// Local Database Access Tests
// =============================================================================

// Local database tests require Bun runtime for SQLite
describeIfBun('Local Database Access', () => {
  describe('createMcpDatabaseAccess() with local path', () => {
    it('should create SQLite database for local path', async () => {
      const dbAccess = await createMcpDatabaseAccess({
        local: '/tmp/mondodb-test-mcp.db',
      })

      expect(dbAccess).toBeDefined()
      // Verify it implements DatabaseAccess interface
      expect(typeof dbAccess.find).toBe('function')
      expect(typeof dbAccess.findOne).toBe('function')
      expect(typeof dbAccess.insertOne).toBe('function')
      expect(typeof dbAccess.updateOne).toBe('function')
      expect(typeof dbAccess.deleteOne).toBe('function')
    })

    it('should persist data to local file', async () => {
      const testDbPath = `/tmp/mondodb-mcp-test-${Date.now()}.db`

      const dbAccess = await createMcpDatabaseAccess({
        local: testDbPath,
      })

      // Insert a document
      const insertResult = await dbAccess.insertOne('testCollection', {
        name: 'test-doc',
        value: 42,
      })
      expect(insertResult.insertedId).toBeDefined()

      // Find the document
      const docs = await dbAccess.find('testCollection', { name: 'test-doc' })
      expect(docs.length).toBe(1)
      expect(docs[0].name).toBe('test-doc')
      expect(docs[0].value).toBe(42)
    })
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('MCP Command Error Handling', () => {
  describe('validation errors', () => {
    it('should throw error when neither --connection nor --local provided', async () => {
      await expect(
        startMcpServer({
          stdin: process.stdin,
          stdout: process.stdout,
        })
      ).rejects.toThrow(/connection|local|required/i)
    })

    it('should throw error when both --connection and --local provided', async () => {
      await expect(
        startMcpServer({
          connection: 'https://example.com',
          local: './data.db',
          stdin: process.stdin,
          stdout: process.stdout,
        })
      ).rejects.toThrow(/connection|local|exclusive|both/i)
    })

    it('should throw error for invalid connection URL', async () => {
      await expect(
        startMcpServer({
          connection: 'not-a-valid-url',
          stdin: process.stdin,
          stdout: process.stdout,
        })
      ).rejects.toThrow(/invalid|url/i)
    })
  })

  describe('connection errors', () => {
    it('should throw error when remote worker is unreachable', async () => {
      // Mock fetch to throw network error
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error: Failed to fetch'))

      try {
        const dbAccess = await createMcpDatabaseAccess({
          connection: 'https://non-existent-worker-12345.workers.dev',
        })

        // Attempting to use the connection should fail
        await expect(
          dbAccess.find('users', {})
        ).rejects.toThrow(/connect|network|fetch/i)
      } finally {
        global.fetch = originalFetch
      }
    }, 10000)
  })
})

// =============================================================================
// MCP Server Controller Tests
// =============================================================================

describe('McpServerController', () => {
  let controller: McpServerController | undefined

  afterEach(async () => {
    if (controller) {
      await controller.stop()
      controller = undefined
    }
  })

  describe('lifecycle', () => {
    it('should have isRunning property', async () => {
      const mockStdin = {
        on: vi.fn(),
        removeListener: vi.fn(),
        setEncoding: vi.fn(),
        resume: vi.fn(),
        pause: vi.fn(),
      } as unknown as NodeJS.ReadableStream

      const mockStdout = {
        write: vi.fn(),
      } as unknown as NodeJS.WritableStream

      controller = await startMcpServer({
        connection: 'https://my-mondodb.workers.dev',
        stdin: mockStdin,
        stdout: mockStdout,
      })

      expect(controller.isRunning).toBe(true)
    })

    it('should have stop method', async () => {
      const mockStdin = {
        on: vi.fn(),
        removeListener: vi.fn(),
        setEncoding: vi.fn(),
        resume: vi.fn(),
        pause: vi.fn(),
      } as unknown as NodeJS.ReadableStream

      const mockStdout = {
        write: vi.fn(),
      } as unknown as NodeJS.WritableStream

      controller = await startMcpServer({
        connection: 'https://my-mondodb.workers.dev',
        stdin: mockStdin,
        stdout: mockStdout,
      })

      expect(typeof controller.stop).toBe('function')

      await controller.stop()

      expect(controller.isRunning).toBe(false)
    })

    it('should handle multiple stop calls gracefully', async () => {
      const mockStdin = {
        on: vi.fn(),
        removeListener: vi.fn(),
        setEncoding: vi.fn(),
        resume: vi.fn(),
        pause: vi.fn(),
      } as unknown as NodeJS.ReadableStream

      const mockStdout = {
        write: vi.fn(),
      } as unknown as NodeJS.WritableStream

      controller = await startMcpServer({
        connection: 'https://my-mondodb.workers.dev',
        stdin: mockStdin,
        stdout: mockStdout,
      })

      await controller.stop()
      await controller.stop() // Should not throw

      expect(controller.isRunning).toBe(false)
    })
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('MCP Command Integration', () => {
  describe('full workflow', () => {
    it('should start server, handle requests, and stop cleanly', async () => {
      const writtenData: string[] = []
      const dataHandler = vi.fn()

      const mockStdin = {
        on: vi.fn((event: string, handler: (data: string) => void) => {
          if (event === 'data') {
            dataHandler.mockImplementation(handler)
          }
          return mockStdin
        }),
        removeListener: vi.fn(),
        setEncoding: vi.fn(),
        resume: vi.fn(),
        pause: vi.fn(),
      } as unknown as NodeJS.ReadableStream

      const mockStdout = {
        write: vi.fn((data: string) => {
          writtenData.push(data)
          return true
        }),
      } as unknown as NodeJS.WritableStream

      // Start the server (use connection URL to avoid Bun dependency)
      const controller = await startMcpServer({
        connection: 'https://my-mondodb.workers.dev',
        stdin: mockStdin,
        stdout: mockStdout,
      })

      expect(controller.isRunning).toBe(true)

      // Send initialize request
      const initRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }) + '\n'

      dataHandler(initRequest)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify initialize response
      const initResponse = writtenData.find(d => d.includes('serverInfo'))
      expect(initResponse).toBeDefined()

      // Stop the server
      await controller.stop()
      expect(controller.isRunning).toBe(false)
    })
  })
})
