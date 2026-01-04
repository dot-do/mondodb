import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BaseAdapter, type BaseAdapterConfig } from '../../../../src/mcp/adapters/base-adapter'
import { McpError, McpErrorCode, TimeoutError, RateLimitError } from '../../../../src/mcp/adapters/errors'
import { createMcpServer, createMockDatabaseAccess } from '../../../../src/mcp/server'
import type { McpServer } from '../../../../src/mcp/server'

// =============================================================================
// Test Implementation
// =============================================================================

/**
 * Concrete implementation of BaseAdapter for testing
 */
class TestAdapter extends BaseAdapter {
  get adapterName(): string {
    return 'test'
  }

  async initialize(): Promise<void> {
    // No-op for testing
  }

  async cleanup(): Promise<void> {
    // No-op for testing
  }

  // Expose protected methods for testing
  public testWithRetry<T>(operation: (attempt: number) => Promise<T>, context: string): Promise<T> {
    return this.withRetry(operation, context)
  }

  public testWithTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    context: string
  ): Promise<T> {
    return this.withTimeout(operation, timeoutMs, context)
  }

  public testWithRetryAndTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    context: string,
    timeoutMs?: number
  ): Promise<T> {
    return this.withRetryAndTimeout(operation, context, timeoutMs)
  }

  public testCalculateRetryDelay(attempt: number, baseDelay?: number): number {
    return this.calculateRetryDelay(attempt, baseDelay)
  }

  public testLog(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    return this.log(level, message, data)
  }

  public testCallTool(name: string, args: Record<string, unknown>) {
    return this.callTool(name, args)
  }

  public testHandleRequest(request: Parameters<typeof this.handleRequest>[0]) {
    return this.handleRequest(request)
  }
}

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

function createTestAdapter(config?: Partial<BaseAdapterConfig>): TestAdapter {
  return new TestAdapter({
    server: createTestServer(),
    ...config,
  })
}

// =============================================================================
// Construction Tests
// =============================================================================

describe('BaseAdapter construction', () => {
  it('should create with default configuration', () => {
    const adapter = createTestAdapter()

    expect(adapter.adapterName).toBe('test')
  })

  it('should accept custom retry configuration', () => {
    const adapter = createTestAdapter({
      retry: {
        maxRetries: 5,
        initialDelayMs: 500,
      },
    })

    // Verify by checking calculated delay
    const delay = adapter.testCalculateRetryDelay(0, 500)
    expect(delay).toBeGreaterThanOrEqual(500)
    expect(delay).toBeLessThanOrEqual(625) // With 25% jitter
  })

  it('should accept custom timeout configuration', async () => {
    const adapter = createTestAdapter({
      timeout: {
        requestTimeoutMs: 100,
      },
    })

    // Should timeout quickly
    await expect(
      adapter.testWithRetryAndTimeout(
        async () => new Promise((resolve) => setTimeout(resolve, 1000)),
        'test'
      )
    ).rejects.toThrow(TimeoutError)
  })
})

// =============================================================================
// Retry Logic Tests
// =============================================================================

describe('BaseAdapter retry logic', () => {
  it('should succeed on first attempt', async () => {
    const adapter = createTestAdapter()
    const operation = vi.fn().mockResolvedValue('success')

    const result = await adapter.testWithRetry(operation, 'test')

    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(operation).toHaveBeenCalledWith(0)
  })

  it('should retry on transient failure', async () => {
    const adapter = createTestAdapter({
      retry: { maxRetries: 3, initialDelayMs: 10, jitter: false },
    })

    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue('success')

    const result = await adapter.testWithRetry(operation, 'test')

    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('should not retry on non-transient failure', async () => {
    const adapter = createTestAdapter()
    const operation = vi.fn().mockRejectedValue(new McpError(McpErrorCode.InvalidParams, 'Bad params'))

    await expect(adapter.testWithRetry(operation, 'test')).rejects.toThrow(McpError)
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('should throw after max retries', async () => {
    const adapter = createTestAdapter({
      retry: { maxRetries: 2, initialDelayMs: 1, jitter: false },
    })

    const operation = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(adapter.testWithRetry(operation, 'test')).rejects.toThrow(McpError)
    expect(operation).toHaveBeenCalledTimes(3) // Initial + 2 retries
  })

  it('should respect rate limit retry delay', async () => {
    const adapter = createTestAdapter({
      retry: { maxRetries: 1, initialDelayMs: 1 },
    })

    const start = Date.now()
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('Rate limited', 50))
      .mockResolvedValue('success')

    await adapter.testWithRetry(operation, 'test')

    expect(Date.now() - start).toBeGreaterThanOrEqual(45)
  })
})

// =============================================================================
// Retry Delay Calculation Tests
// =============================================================================

describe('BaseAdapter calculateRetryDelay', () => {
  it('should increase delay exponentially', () => {
    const adapter = createTestAdapter({
      retry: { initialDelayMs: 100, backoffMultiplier: 2, jitter: false },
    })

    expect(adapter.testCalculateRetryDelay(0)).toBe(100)
    expect(adapter.testCalculateRetryDelay(1)).toBe(200)
    expect(adapter.testCalculateRetryDelay(2)).toBe(400)
    expect(adapter.testCalculateRetryDelay(3)).toBe(800)
  })

  it('should cap at maxDelayMs', () => {
    const adapter = createTestAdapter({
      retry: { initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 5000, jitter: false },
    })

    expect(adapter.testCalculateRetryDelay(5)).toBe(5000)
    expect(adapter.testCalculateRetryDelay(10)).toBe(5000)
  })

  it('should add jitter when enabled', () => {
    const adapter = createTestAdapter({
      retry: { initialDelayMs: 1000, jitter: true },
    })

    // Run multiple times to check for variance
    const delays = Array.from({ length: 10 }, () => adapter.testCalculateRetryDelay(0))
    const uniqueDelays = new Set(delays)

    // Should have some variance
    expect(uniqueDelays.size).toBeGreaterThan(1)

    // All should be within expected range (1000 to 1250)
    delays.forEach((delay) => {
      expect(delay).toBeGreaterThanOrEqual(1000)
      expect(delay).toBeLessThanOrEqual(1250)
    })
  })

  it('should use custom base delay', () => {
    const adapter = createTestAdapter({
      retry: { initialDelayMs: 100, jitter: false },
    })

    expect(adapter.testCalculateRetryDelay(0, 500)).toBe(500)
    expect(adapter.testCalculateRetryDelay(1, 500)).toBe(1000)
  })
})

// =============================================================================
// Timeout Tests
// =============================================================================

describe('BaseAdapter timeout handling', () => {
  it('should complete within timeout', async () => {
    const adapter = createTestAdapter()
    const operation = vi.fn().mockResolvedValue('success')

    const result = await adapter.testWithTimeout(operation, 1000, 'test')

    expect(result).toBe('success')
    expect(operation).toHaveBeenCalled()
  })

  it('should throw TimeoutError on timeout', async () => {
    const adapter = createTestAdapter()
    const operation = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    )

    await expect(
      adapter.testWithTimeout(operation, 50, 'test-op')
    ).rejects.toThrow(TimeoutError)
  })

  it('should include timeout duration in error', async () => {
    const adapter = createTestAdapter()
    const operation = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    )

    try {
      await adapter.testWithTimeout(operation, 50, 'test-op')
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError)
      expect((error as TimeoutError).timeoutMs).toBe(50)
    }
  })

  it('should pass abort signal to operation', async () => {
    const adapter = createTestAdapter()
    let receivedSignal: AbortSignal | null = null

    const operation = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      receivedSignal = signal
      return 'success'
    })

    await adapter.testWithTimeout(operation, 1000, 'test')

    expect(receivedSignal).toBeDefined()
    expect(receivedSignal!.aborted).toBe(false)
  })

  it('should abort signal on timeout', async () => {
    const adapter = createTestAdapter()
    let receivedSignal: AbortSignal | null = null

    const operation = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      receivedSignal = signal
      await new Promise((resolve) => setTimeout(resolve, 100))
      return 'success'
    })

    await expect(adapter.testWithTimeout(operation, 10, 'test')).rejects.toThrow()

    // Wait a bit for signal to be aborted
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(receivedSignal?.aborted).toBe(true)
  })

  it('should pass through non-timeout errors', async () => {
    const adapter = createTestAdapter()
    const testError = new Error('Test error')
    const operation = vi.fn().mockRejectedValue(testError)

    await expect(adapter.testWithTimeout(operation, 1000, 'test')).rejects.toThrow('Test error')
  })
})

// =============================================================================
// Retry and Timeout Combined Tests
// =============================================================================

describe('BaseAdapter withRetryAndTimeout', () => {
  it('should retry timeouts', async () => {
    const adapter = createTestAdapter({
      retry: { maxRetries: 2, initialDelayMs: 1, jitter: false },
      timeout: { requestTimeoutMs: 50 },
    })

    let callCount = 0
    const operation = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount < 3) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      return 'success'
    })

    const result = await adapter.testWithRetryAndTimeout(operation, 'test')

    expect(result).toBe('success')
    expect(callCount).toBe(3)
  })

  it('should use custom timeout per call', async () => {
    const adapter = createTestAdapter({
      timeout: { requestTimeoutMs: 1000 },
      retry: { maxRetries: 0 }, // Disable retries for this test
    })

    const operation = vi.fn().mockImplementation(
      async (_signal: AbortSignal) => {
        // Wait longer than the custom timeout
        await new Promise((resolve) => setTimeout(resolve, 500))
        return 'should not reach here'
      }
    )

    await expect(
      adapter.testWithRetryAndTimeout(operation, 'test', 20)
    ).rejects.toThrow(TimeoutError)
  })
})

// =============================================================================
// Logging Tests
// =============================================================================

describe('BaseAdapter logging', () => {
  it('should use custom logger', () => {
    const logger = vi.fn()
    const adapter = createTestAdapter({
      log: { logger, debug: true },
    })

    adapter.testLog('info', 'Test message', { data: 'test' })

    expect(logger).toHaveBeenCalledWith('info', 'Test message', { data: 'test' })
  })

  it('should skip debug logs when debug is false', () => {
    const logger = vi.fn()
    const adapter = createTestAdapter({
      log: { logger, debug: false },
    })

    adapter.testLog('debug', 'Debug message')

    expect(logger).not.toHaveBeenCalled()
  })

  it('should log debug when enabled', () => {
    const logger = vi.fn()
    const adapter = createTestAdapter({
      log: { logger, debug: true },
    })

    adapter.testLog('debug', 'Debug message')

    expect(logger).toHaveBeenCalledWith('debug', 'Debug message', undefined)
  })
})

// =============================================================================
// Tool Calling Tests
// =============================================================================

describe('BaseAdapter callTool', () => {
  it('should call tool successfully', async () => {
    const server = createTestServer()
    const adapter = new TestAdapter({ server })

    const result = await adapter.testCallTool('search', { query: 'test' })

    expect(result).toBeDefined()
    expect(result.content).toBeDefined()
    expect(Array.isArray(result.content)).toBe(true)
  })

  it('should handle tool not found', async () => {
    const server = createTestServer()
    const adapter = new TestAdapter({ server })

    const result = await adapter.testCallTool('nonexistent', {})

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('error')
  })

  it('should log tool calls when enabled', async () => {
    const logger = vi.fn()
    const server = createTestServer()
    const adapter = new TestAdapter({
      server,
      log: { logger, debug: true, logRequests: true, logResponses: true },
    })

    await adapter.testCallTool('search', { query: 'test' })

    expect(logger).toHaveBeenCalledWith('debug', 'Calling tool: search', { query: 'test' })
  })
})

// =============================================================================
// Request Handling Tests
// =============================================================================

describe('BaseAdapter handleRequest', () => {
  it('should handle valid request', async () => {
    const server = createTestServer()
    const adapter = new TestAdapter({ server })

    const response = await adapter.testHandleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    })

    expect(response.jsonrpc).toBe('2.0')
    expect(response.id).toBe(1)
    expect(response.result).toBeDefined()
  })

  it('should handle unknown method', async () => {
    const server = createTestServer()
    const adapter = new TestAdapter({ server })

    const response = await adapter.testHandleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'unknown/method',
    })

    expect(response.error).toBeDefined()
    expect(response.error!.code).toBe(-32601)
  })

  it('should log requests when enabled', async () => {
    const logger = vi.fn()
    const server = createTestServer()
    const adapter = new TestAdapter({
      server,
      log: { logger, debug: true, logRequests: true },
    })

    await adapter.testHandleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    })

    expect(logger).toHaveBeenCalledWith('debug', 'MCP request', { method: 'tools/list', id: 1 })
  })
})
