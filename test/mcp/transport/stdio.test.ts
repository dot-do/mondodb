import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import {
  createStdioTransport,
  StdioTransport,
  StdioTransportOptions,
  JsonRpcErrorCodes,
  type DebugLogEntry,
  type BufferedWriteOptions,
  type GracefulShutdownOptions,
} from '../../../src/mcp/transport/stdio'
import type { McpRequest, McpResponse } from '../../../src/mcp/types'

// =============================================================================
// Mock Streams
// =============================================================================

/**
 * Create a mock readable stream (stdin)
 */
function createMockStdin(): EventEmitter & { setEncoding: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter()
  return Object.assign(emitter, {
    setEncoding: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
  })
}

/**
 * Create a mock writable stream (stdout)
 */
function createMockStdout(): { write: ReturnType<typeof vi.fn>; written: string[] } {
  const written: string[] = []
  return {
    write: vi.fn((data: string) => {
      written.push(data)
      return true
    }),
    written,
  }
}

// =============================================================================
// Transport Creation Tests
// =============================================================================

describe('createStdioTransport', () => {
  it('should create a transport instance', () => {
    const transport = createStdioTransport()
    expect(transport).toBeDefined()
    expect(typeof transport.start).toBe('function')
    expect(typeof transport.send).toBe('function')
    expect(typeof transport.close).toBe('function')
    expect(transport.isRunning).toBe(false)
  })

  it('should accept custom stdin/stdout streams', () => {
    const mockStdin = createMockStdin()
    const mockStdout = createMockStdout()

    const transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
    })

    expect(transport).toBeDefined()
  })
})

// =============================================================================
// Lifecycle Tests
// =============================================================================

describe('StdioTransport lifecycle', () => {
  let mockStdin: ReturnType<typeof createMockStdin>
  let mockStdout: ReturnType<typeof createMockStdout>
  let transport: StdioTransport

  beforeEach(() => {
    mockStdin = createMockStdin()
    mockStdout = createMockStdout()
  })

  afterEach(() => {
    if (transport?.isRunning) {
      transport.close()
    }
  })

  it('should start and set isRunning to true', () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
    })

    transport.start()
    expect(transport.isRunning).toBe(true)
    expect(mockStdin.setEncoding).toHaveBeenCalledWith('utf8')
    expect(mockStdin.resume).toHaveBeenCalled()
  })

  it('should not start multiple times', () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
    })

    transport.start()
    transport.start() // Second call should be ignored

    expect(mockStdin.resume).toHaveBeenCalledTimes(1)
  })

  it('should close and set isRunning to false', () => {
    const onClose = vi.fn()
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onClose,
    })

    transport.start()
    transport.close()

    expect(transport.isRunning).toBe(false)
    expect(mockStdin.pause).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('should not close if not running', () => {
    const onClose = vi.fn()
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onClose,
    })

    transport.close() // Should be ignored since not running
    expect(onClose).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Message Parsing Tests
// =============================================================================

describe('StdioTransport message parsing', () => {
  let mockStdin: ReturnType<typeof createMockStdin>
  let mockStdout: ReturnType<typeof createMockStdout>
  let transport: StdioTransport

  beforeEach(() => {
    mockStdin = createMockStdin()
    mockStdout = createMockStdout()
  })

  afterEach(() => {
    if (transport?.isRunning) {
      transport.close()
    }
  })

  it('should parse valid JSON-RPC request', async () => {
    const onMessage = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 1,
      result: { test: true },
    } as McpResponse)

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage,
    })

    transport.start()

    const request: McpRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: { foo: 'bar' },
    }

    mockStdin.emit('data', JSON.stringify(request) + '\n')

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onMessage).toHaveBeenCalledWith(request)
    expect(mockStdout.written.length).toBe(1)
    expect(JSON.parse(mockStdout.written[0].trim())).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { test: true },
    })
  })

  it('should handle multiple messages in single data chunk', async () => {
    const onMessage = vi.fn().mockImplementation(async (req: McpRequest) => ({
      jsonrpc: '2.0',
      id: req.id,
      result: { received: true },
    } as McpResponse))

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage,
    })

    transport.start()

    const req1 = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test1' })
    const req2 = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'test2' })

    mockStdin.emit('data', `${req1}\n${req2}\n`)

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(onMessage).toHaveBeenCalledTimes(2)
    expect(mockStdout.written.length).toBe(2)
  })

  it('should handle messages split across multiple data chunks', async () => {
    const onMessage = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 1,
      result: {},
    } as McpResponse)

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage,
    })

    transport.start()

    // Split message across chunks
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":')
    mockStdin.emit('data', '1,"method":"test"}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
    })
  })

  it('should skip empty lines', async () => {
    const onMessage = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 1,
      result: {},
    } as McpResponse)

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage,
    })

    transport.start()

    mockStdin.emit('data', '\n\n{"jsonrpc":"2.0","id":1,"method":"test"}\n\n\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onMessage).toHaveBeenCalledTimes(1)
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('StdioTransport error handling', () => {
  let mockStdin: ReturnType<typeof createMockStdin>
  let mockStdout: ReturnType<typeof createMockStdout>
  let transport: StdioTransport

  beforeEach(() => {
    mockStdin = createMockStdin()
    mockStdout = createMockStdout()
  })

  afterEach(() => {
    if (transport?.isRunning) {
      transport.close()
    }
  })

  it('should handle JSON parse errors gracefully', async () => {
    const onError = vi.fn()

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onError,
    })

    transport.start()
    mockStdin.emit('data', 'not valid json\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onError).toHaveBeenCalled()
    expect(mockStdout.written.length).toBe(1)

    const response = JSON.parse(mockStdout.written[0].trim())
    expect(response.error.code).toBe(JsonRpcErrorCodes.ParseError)
    expect(response.error.message).toContain('Parse error')
  })

  it('should handle invalid JSON-RPC version', async () => {
    const onError = vi.fn()

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onError,
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"1.0","id":1,"method":"test"}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockStdout.written.length).toBe(1)
    const response = JSON.parse(mockStdout.written[0].trim())
    expect(response.error.code).toBe(JsonRpcErrorCodes.InvalidRequest)
    expect(response.error.message).toContain('Invalid JSON-RPC version')
  })

  it('should handle missing id field', async () => {
    const onError = vi.fn()

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onError,
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"2.0","method":"test"}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    const response = JSON.parse(mockStdout.written[0].trim())
    expect(response.error.code).toBe(JsonRpcErrorCodes.InvalidRequest)
    expect(response.error.message).toContain('Missing or invalid id')
  })

  it('should handle missing method field', async () => {
    const onError = vi.fn()

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onError,
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    const response = JSON.parse(mockStdout.written[0].trim())
    expect(response.error.code).toBe(JsonRpcErrorCodes.InvalidRequest)
    expect(response.error.message).toContain('Missing or invalid method')
  })

  it('should handle onMessage handler errors', async () => {
    const onError = vi.fn()
    const onMessage = vi.fn().mockRejectedValue(new Error('Handler failed'))

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage,
      onError,
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test"}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onError).toHaveBeenCalled()
    const response = JSON.parse(mockStdout.written[0].trim())
    expect(response.error.code).toBe(JsonRpcErrorCodes.InternalError)
    expect(response.error.message).toBe('Handler failed')
    expect(response.id).toBe(1)
  })

  it('should handle stdin errors', async () => {
    const onError = vi.fn()

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onError,
    })

    transport.start()
    mockStdin.emit('error', new Error('Stream error'))

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(onError.mock.calls[0][0].message).toBe('Stream error')
  })

  it('should handle stdin end event', async () => {
    const onClose = vi.fn()

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onClose,
    })

    transport.start()
    mockStdin.emit('end')

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(transport.isRunning).toBe(false)
    expect(onClose).toHaveBeenCalled()
  })

  it('should process remaining buffer on end', async () => {
    const onMessage = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 1,
      result: {},
    } as McpResponse)

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage,
    })

    transport.start()
    // Send message without trailing newline
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test"}')
    mockStdin.emit('end')

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onMessage).toHaveBeenCalled()
  })
})

// =============================================================================
// Send Tests
// =============================================================================

describe('StdioTransport.send', () => {
  let mockStdin: ReturnType<typeof createMockStdin>
  let mockStdout: ReturnType<typeof createMockStdout>
  let transport: StdioTransport

  beforeEach(() => {
    mockStdin = createMockStdin()
    mockStdout = createMockStdout()
  })

  afterEach(() => {
    if (transport?.isRunning) {
      transport.close()
    }
  })

  it('should write JSON response to stdout', () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
    })

    transport.start()

    const response: McpResponse = {
      jsonrpc: '2.0',
      id: 1,
      result: { data: 'test' },
    }

    transport.send(response)

    expect(mockStdout.write).toHaveBeenCalledWith(
      JSON.stringify(response) + '\n'
    )
  })

  it('should not send if transport is not running', () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
    })

    const response: McpResponse = {
      jsonrpc: '2.0',
      id: 1,
      result: {},
    }

    transport.send(response)

    expect(mockStdout.write).not.toHaveBeenCalled()
  })

  it('should handle stdout write errors', () => {
    const onError = vi.fn()
    const badStdout = {
      write: vi.fn(() => {
        throw new Error('Write failed')
      }),
    }

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: badStdout as unknown as NodeJS.WritableStream,
      onError,
    })

    transport.start()
    transport.send({ jsonrpc: '2.0', id: 1, result: {} })

    expect(onError).toHaveBeenCalledWith(expect.any(Error))
    expect(onError.mock.calls[0][0].message).toBe('Write failed')
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('StdioTransport integration', () => {
  let mockStdin: ReturnType<typeof createMockStdin>
  let mockStdout: ReturnType<typeof createMockStdout>
  let transport: StdioTransport

  beforeEach(() => {
    mockStdin = createMockStdin()
    mockStdout = createMockStdout()
  })

  afterEach(() => {
    if (transport?.isRunning) {
      transport.close()
    }
  })

  it('should handle complete request/response cycle', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage: async (request: McpRequest): Promise<McpResponse> => {
        if (request.method === 'initialize') {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: { name: 'test-server', version: '1.0.0' },
            },
          }
        }
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: 'Method not found' },
        }
      },
    })

    transport.start()

    // Send initialize request
    mockStdin.emit(
      'data',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }) + '\n'
    )

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockStdout.written.length).toBe(1)
    const response = JSON.parse(mockStdout.written[0].trim())
    expect(response.result.serverInfo.name).toBe('test-server')
  })

  it('should handle Buffer input', async () => {
    const onMessage = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 1,
      result: {},
    } as McpResponse)

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage,
    })

    transport.start()

    // Send as Buffer
    const request = '{"jsonrpc":"2.0","id":1,"method":"test"}\n'
    mockStdin.emit('data', Buffer.from(request, 'utf8'))

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onMessage).toHaveBeenCalled()
  })

  it('should preserve id in error responses', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
    })

    transport.start()

    // Send request with invalid method type but valid id
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":"my-id","method":123}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    const response = JSON.parse(mockStdout.written[0].trim())
    expect(response.id).toBe('my-id')
    expect(response.error).toBeDefined()
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('StdioTransport edge cases', () => {
  let mockStdin: ReturnType<typeof createMockStdin>
  let mockStdout: ReturnType<typeof createMockStdout>
  let transport: StdioTransport

  beforeEach(() => {
    mockStdin = createMockStdin()
    mockStdout = createMockStdout()
  })

  afterEach(() => {
    if (transport?.isRunning) {
      transport.close()
    }
  })

  it('should handle request with null params', async () => {
    const onMessage = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 1,
      result: {},
    } as McpResponse)

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage,
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test","params":null}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: null,
    })
  })

  it('should handle request with array params', async () => {
    const onMessage = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: 1,
      result: {},
    } as McpResponse)

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage,
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test","params":["a","b"]}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: 1,
      method: 'test',
      params: ['a', 'b'],
    })
  })

  it('should reject request with primitive params', async () => {
    const onError = vi.fn()

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onError,
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test","params":"string"}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    const response = JSON.parse(mockStdout.written[0].trim())
    expect(response.error.code).toBe(JsonRpcErrorCodes.InvalidRequest)
    expect(response.error.message).toContain('Invalid params')
  })

  it('should handle numeric string id', async () => {
    const onMessage = vi.fn().mockResolvedValue({
      jsonrpc: '2.0',
      id: '123',
      result: {},
    } as McpResponse)

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage,
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":"123","method":"test"}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(onMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: '123',
      method: 'test',
    })
  })

  it('should handle non-object request body', async () => {
    const onError = vi.fn()

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onError,
    })

    transport.start()
    mockStdin.emit('data', '"just a string"\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    const response = JSON.parse(mockStdout.written[0].trim())
    expect(response.error.code).toBe(JsonRpcErrorCodes.InvalidRequest)
    expect(response.error.message).toContain('must be an object')
  })
})

// =============================================================================
// Buffered Writing Tests
// =============================================================================

describe('Buffered writing', () => {
  let mockStdin: ReturnType<typeof createMockStdin>
  let mockStdout: ReturnType<typeof createMockStdout>
  let transport: StdioTransport

  beforeEach(() => {
    mockStdin = createMockStdin()
    mockStdout = createMockStdout()
  })

  afterEach(() => {
    if (transport?.isRunning) {
      transport.close()
    }
  })

  it('should buffer writes and flush after interval', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      bufferedWrite: { enabled: true, maxBufferSize: 10, flushIntervalMs: 50 },
    })

    transport.start()

    // Send a response
    transport.send({ jsonrpc: '2.0', id: 1, result: {} })

    // Should not be written immediately
    expect(mockStdout.write).not.toHaveBeenCalled()

    // Wait for flush interval
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(mockStdout.write).toHaveBeenCalled()
    expect(mockStdout.written.length).toBe(1)
  })

  it('should flush immediately when buffer is full', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      bufferedWrite: { enabled: true, maxBufferSize: 2, flushIntervalMs: 10000 },
    })

    transport.start()

    // Send enough responses to fill the buffer
    transport.send({ jsonrpc: '2.0', id: 1, result: {} })
    expect(mockStdout.write).not.toHaveBeenCalled()

    transport.send({ jsonrpc: '2.0', id: 2, result: {} })

    // Should be flushed now
    expect(mockStdout.write).toHaveBeenCalled()
    expect(mockStdout.written.length).toBe(1)

    // Both messages should be in the single write
    const written = mockStdout.written[0]
    expect(written).toContain('"id":1')
    expect(written).toContain('"id":2')
  })

  it('should write immediately when buffering is disabled', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      bufferedWrite: { enabled: false },
    })

    transport.start()
    transport.send({ jsonrpc: '2.0', id: 1, result: {} })

    expect(mockStdout.write).toHaveBeenCalled()
    expect(mockStdout.written.length).toBe(1)
  })

  it('should support manual flush', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      bufferedWrite: { enabled: true, maxBufferSize: 100, flushIntervalMs: 10000 },
    })

    transport.start()
    transport.send({ jsonrpc: '2.0', id: 1, result: {} })

    expect(mockStdout.write).not.toHaveBeenCalled()

    transport.flush()

    expect(mockStdout.write).toHaveBeenCalled()
    expect(mockStdout.written.length).toBe(1)
  })

  it('should flush buffer on close', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      bufferedWrite: { enabled: true, maxBufferSize: 100, flushIntervalMs: 10000 },
    })

    transport.start()
    transport.send({ jsonrpc: '2.0', id: 1, result: {} })

    expect(mockStdout.write).not.toHaveBeenCalled()

    transport.close()

    expect(mockStdout.write).toHaveBeenCalled()
    expect(mockStdout.written.length).toBe(1)
  })
})

// =============================================================================
// Graceful Shutdown Tests
// =============================================================================

describe('Graceful shutdown', () => {
  let mockStdin: ReturnType<typeof createMockStdin>
  let mockStdout: ReturnType<typeof createMockStdout>
  let transport: StdioTransport

  beforeEach(() => {
    mockStdin = createMockStdin()
    mockStdout = createMockStdout()
  })

  afterEach(() => {
    if (transport?.isRunning) {
      transport.close()
    }
  })

  it('should wait for pending messages during shutdown', async () => {
    let resolveHandler: (() => void) | null = null
    const handlerPromise = new Promise<void>((resolve) => {
      resolveHandler = resolve
    })

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage: async (): Promise<McpResponse> => {
        await handlerPromise
        return { jsonrpc: '2.0', id: 1, result: {} }
      },
      bufferedWrite: { enabled: false },
      gracefulShutdown: { timeoutMs: 5000 },
    })

    transport.start()

    // Start processing a message
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test"}\n')

    // Wait a bit for the message to start processing
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Start shutdown
    const shutdownPromise = transport.shutdown()

    // Pending count should be 1
    expect(transport.pendingCount).toBe(1)

    // Resolve the handler
    resolveHandler!()

    // Shutdown should complete
    await shutdownPromise

    expect(transport.isRunning).toBe(false)
  })

  it('should timeout if pending messages take too long', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage: async (): Promise<McpResponse> => {
        // Never resolves
        await new Promise(() => {})
        return { jsonrpc: '2.0', id: 1, result: {} }
      },
      bufferedWrite: { enabled: false },
      gracefulShutdown: { timeoutMs: 100 },
    })

    transport.start()

    // Start processing a message
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test"}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))

    const startTime = Date.now()
    await transport.shutdown()
    const duration = Date.now() - startTime

    // Should have timed out
    expect(duration).toBeGreaterThanOrEqual(90)
    expect(duration).toBeLessThan(200)
    expect(transport.isRunning).toBe(false)
  })

  it('should close immediately if no pending messages', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      gracefulShutdown: { timeoutMs: 5000 },
    })

    transport.start()

    const startTime = Date.now()
    await transport.shutdown()
    const duration = Date.now() - startTime

    // Should complete quickly
    expect(duration).toBeLessThan(50)
    expect(transport.isRunning).toBe(false)
  })

  it('should track pending message count', async () => {
    let resolveHandler: (() => void) | null = null

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage: async (): Promise<McpResponse> => {
        await new Promise<void>((resolve) => {
          resolveHandler = resolve
        })
        return { jsonrpc: '2.0', id: 1, result: {} }
      },
      bufferedWrite: { enabled: false },
    })

    transport.start()

    expect(transport.pendingCount).toBe(0)

    // Start processing a message
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test"}\n')

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(transport.pendingCount).toBe(1)

    // Resolve the handler
    resolveHandler!()

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(transport.pendingCount).toBe(0)
  })
})

// =============================================================================
// Debug Mode Tests
// =============================================================================

describe('Debug mode', () => {
  let mockStdin: ReturnType<typeof createMockStdin>
  let mockStdout: ReturnType<typeof createMockStdout>
  let transport: StdioTransport
  let debugEntries: DebugLogEntry[]

  beforeEach(() => {
    mockStdin = createMockStdin()
    mockStdout = createMockStdout()
    debugEntries = []
  })

  afterEach(() => {
    if (transport?.isRunning) {
      transport.close()
    }
  })

  it('should log lifecycle events', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onDebug: (entry) => debugEntries.push(entry),
    })

    transport.start()
    transport.close()

    const lifecycleEntries = debugEntries.filter((e) => e.type === 'lifecycle')
    expect(lifecycleEntries.length).toBeGreaterThan(0)
    expect(lifecycleEntries.some((e) => e.message.includes('starting'))).toBe(true)
    expect(lifecycleEntries.some((e) => e.message.includes('closing'))).toBe(true)
  })

  it('should log received messages', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage: async () => ({ jsonrpc: '2.0', id: 1, result: {} }),
      onDebug: (entry) => debugEntries.push(entry),
      bufferedWrite: { enabled: false },
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test"}\n')

    await new Promise((resolve) => setTimeout(resolve, 20))

    const receiveEntries = debugEntries.filter((e) => e.type === 'receive')
    expect(receiveEntries.length).toBe(1)
    expect(receiveEntries[0].message).toContain('Received')
  })

  it('should log sent messages', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage: async () => ({ jsonrpc: '2.0', id: 1, result: {} }),
      onDebug: (entry) => debugEntries.push(entry),
      bufferedWrite: { enabled: false },
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test"}\n')

    await new Promise((resolve) => setTimeout(resolve, 20))

    const sendEntries = debugEntries.filter((e) => e.type === 'send')
    expect(sendEntries.length).toBeGreaterThan(0)
  })

  it('should log errors', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onDebug: (entry) => debugEntries.push(entry),
      bufferedWrite: { enabled: false },
    })

    transport.start()
    mockStdin.emit('data', 'invalid json\n')

    await new Promise((resolve) => setTimeout(resolve, 20))

    const errorEntries = debugEntries.filter((e) => e.type === 'error')
    expect(errorEntries.length).toBeGreaterThan(0)
    expect(errorEntries[0].message).toContain('parse error')
  })

  it('should include timestamp in debug entries', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onDebug: (entry) => debugEntries.push(entry),
    })

    transport.start()

    expect(debugEntries.length).toBeGreaterThan(0)
    expect(debugEntries[0].timestamp).toBeInstanceOf(Date)
    expect(debugEntries[0].timestamp.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('should include data in debug entries where applicable', async () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage: async () => ({ jsonrpc: '2.0', id: 1, result: { test: true } }),
      onDebug: (entry) => debugEntries.push(entry),
      bufferedWrite: { enabled: false },
    })

    transport.start()
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test"}\n')

    await new Promise((resolve) => setTimeout(resolve, 20))

    // Lifecycle entries should have method name as data
    const lifecycleEntries = debugEntries.filter(
      (e) => e.type === 'lifecycle' && e.message.includes('Processing')
    )
    expect(lifecycleEntries.length).toBe(1)
    expect(lifecycleEntries[0].data).toBe('test')
  })
})

// =============================================================================
// New Interface Tests
// =============================================================================

describe('StdioTransport new interface', () => {
  let mockStdin: ReturnType<typeof createMockStdin>
  let mockStdout: ReturnType<typeof createMockStdout>
  let transport: StdioTransport

  beforeEach(() => {
    mockStdin = createMockStdin()
    mockStdout = createMockStdout()
  })

  afterEach(() => {
    if (transport?.isRunning) {
      transport.close()
    }
  })

  it('should have flush method', () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
    })

    expect(typeof transport.flush).toBe('function')
  })

  it('should have shutdown method', () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
    })

    expect(typeof transport.shutdown).toBe('function')
  })

  it('should have pendingCount getter', () => {
    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
    })

    expect(typeof transport.pendingCount).toBe('number')
    expect(transport.pendingCount).toBe(0)
  })

  it('should allow sending during shutdown', async () => {
    let resolveHandler: (() => void) | null = null
    const handlerPromise = new Promise<void>((resolve) => {
      resolveHandler = resolve
    })

    transport = createStdioTransport({
      stdin: mockStdin as unknown as NodeJS.ReadableStream,
      stdout: mockStdout as unknown as NodeJS.WritableStream,
      onMessage: async (): Promise<McpResponse> => {
        await handlerPromise
        return { jsonrpc: '2.0', id: 1, result: {} }
      },
      bufferedWrite: { enabled: false },
      gracefulShutdown: { timeoutMs: 5000 },
    })

    transport.start()

    // Start a message processing
    mockStdin.emit('data', '{"jsonrpc":"2.0","id":1,"method":"test"}\n')

    // Wait for the message to start processing
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Start shutdown
    const shutdownPromise = transport.shutdown()

    // Send should still work during shutdown while message is pending
    transport.send({ jsonrpc: '2.0', id: 2, result: {} })

    // Resolve the handler
    resolveHandler!()

    await shutdownPromise

    // Should have 2 messages: one from manual send, one from handler
    expect(mockStdout.written.length).toBe(2)
  })
})
