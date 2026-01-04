import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  McpError,
  McpErrorCode,
  ConnectionError,
  TimeoutError,
  RateLimitError,
  AuthenticationError,
  ToolNotFoundError,
  ToolExecutionError,
  InvalidParamsError,
  isTransientErrorCode,
  classifyError,
  isRetryableError,
  getRetryDelay,
  wrapWithMcpError,
  createErrorResponse,
} from '../../../../src/mcp/adapters/errors'

// =============================================================================
// McpErrorCode Tests
// =============================================================================

describe('McpErrorCode', () => {
  it('should have standard JSON-RPC error codes', () => {
    expect(McpErrorCode.ParseError).toBe(-32700)
    expect(McpErrorCode.InvalidRequest).toBe(-32600)
    expect(McpErrorCode.MethodNotFound).toBe(-32601)
    expect(McpErrorCode.InvalidParams).toBe(-32602)
    expect(McpErrorCode.InternalError).toBe(-32603)
  })

  it('should have server error codes', () => {
    expect(McpErrorCode.ServerError).toBe(-32000)
    expect(McpErrorCode.ServerBusy).toBe(-32001)
    expect(McpErrorCode.ServerShutdown).toBe(-32002)
  })

  it('should have MCP-specific error codes', () => {
    expect(McpErrorCode.ToolNotFound).toBe(-32800)
    expect(McpErrorCode.ToolExecutionError).toBe(-32801)
    expect(McpErrorCode.ResourceNotFound).toBe(-32802)
  })

  it('should have transport error codes', () => {
    expect(McpErrorCode.ConnectionError).toBe(-32900)
    expect(McpErrorCode.ConnectionTimeout).toBe(-32901)
    expect(McpErrorCode.RateLimited).toBe(-32903)
  })
})

// =============================================================================
// McpError Tests
// =============================================================================

describe('McpError', () => {
  it('should create an error with code and message', () => {
    const error = new McpError(McpErrorCode.InternalError, 'Something went wrong')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(McpError)
    expect(error.name).toBe('McpError')
    expect(error.code).toBe(McpErrorCode.InternalError)
    expect(error.message).toBe('Something went wrong')
    expect(error.timestamp).toBeInstanceOf(Date)
  })

  it('should include optional data', () => {
    const error = new McpError(
      McpErrorCode.ToolExecutionError,
      'Tool failed',
      { originalError: 'Database connection lost', retryable: true }
    )

    expect(error.data?.originalError).toBe('Database connection lost')
    expect(error.data?.retryable).toBe(true)
    expect(error.retryable).toBe(true)
  })

  it('should determine retryability from code if not specified', () => {
    const transientError = new McpError(McpErrorCode.ConnectionError, 'Network error')
    const permanentError = new McpError(McpErrorCode.InvalidParams, 'Bad input')

    expect(transientError.retryable).toBe(true)
    expect(permanentError.retryable).toBe(false)
  })

  it('should convert to response format', () => {
    const error = new McpError(
      McpErrorCode.ToolNotFound,
      "Tool 'unknown' not found",
      { requestId: 123 }
    )

    const response = error.toResponse()

    expect(response.code).toBe(McpErrorCode.ToolNotFound)
    expect(response.message).toBe("Tool 'unknown' not found")
    expect(response.data?.requestId).toBe(123)
    expect(response.data?.timestamp).toBeDefined()
    expect(response.data?.retryable).toBe(false)
  })

  it('should create from standard Error', () => {
    const originalError = new Error('Original error message')
    const mcpError = McpError.fromError(originalError)

    expect(mcpError).toBeInstanceOf(McpError)
    expect(mcpError.message).toBe('Original error message')
    expect(mcpError.data?.originalError).toBe('Original error message')
  })

  it('should preserve McpError when calling fromError', () => {
    const original = new McpError(McpErrorCode.ToolNotFound, 'Tool not found')
    const result = McpError.fromError(original)

    expect(result).toBe(original)
  })

  it('should use provided code in fromError', () => {
    const error = new Error('Something failed')
    const mcpError = McpError.fromError(error, McpErrorCode.ServerBusy)

    expect(mcpError.code).toBe(McpErrorCode.ServerBusy)
  })
})

// =============================================================================
// Specific Error Classes Tests
// =============================================================================

describe('ConnectionError', () => {
  it('should create with correct code and retryability', () => {
    const error = new ConnectionError('Connection refused')

    expect(error.name).toBe('ConnectionError')
    expect(error.code).toBe(McpErrorCode.ConnectionError)
    expect(error.retryable).toBe(true)
  })
})

describe('TimeoutError', () => {
  it('should create with timeout duration', () => {
    const error = new TimeoutError('Operation timed out', 5000)

    expect(error.name).toBe('TimeoutError')
    expect(error.code).toBe(McpErrorCode.ConnectionTimeout)
    expect(error.timeoutMs).toBe(5000)
    expect(error.retryable).toBe(true)
  })
})

describe('RateLimitError', () => {
  it('should create with retry after duration', () => {
    const error = new RateLimitError('Too many requests', 60000)

    expect(error.name).toBe('RateLimitError')
    expect(error.code).toBe(McpErrorCode.RateLimited)
    expect(error.retryAfterMs).toBe(60000)
    expect(error.retryable).toBe(true)
    expect(error.data?.retryAfter).toBe(60000)
  })
})

describe('AuthenticationError', () => {
  it('should create with correct code and non-retryability', () => {
    const error = new AuthenticationError('Invalid API key')

    expect(error.name).toBe('AuthenticationError')
    expect(error.code).toBe(McpErrorCode.AuthenticationFailed)
    expect(error.retryable).toBe(false)
  })
})

describe('ToolNotFoundError', () => {
  it('should include tool name in message', () => {
    const error = new ToolNotFoundError('search')

    expect(error.name).toBe('ToolNotFoundError')
    expect(error.code).toBe(McpErrorCode.ToolNotFound)
    expect(error.toolName).toBe('search')
    expect(error.message).toBe("Tool 'search' not found")
    expect(error.retryable).toBe(false)
  })
})

describe('ToolExecutionError', () => {
  it('should include tool name', () => {
    const error = new ToolExecutionError('fetch', 'Failed to fetch document')

    expect(error.name).toBe('ToolExecutionError')
    expect(error.code).toBe(McpErrorCode.ToolExecutionError)
    expect(error.toolName).toBe('fetch')
    expect(error.message).toBe('Failed to fetch document')
  })
})

describe('InvalidParamsError', () => {
  it('should be non-retryable', () => {
    const error = new InvalidParamsError('Missing required field: query')

    expect(error.name).toBe('InvalidParamsError')
    expect(error.code).toBe(McpErrorCode.InvalidParams)
    expect(error.retryable).toBe(false)
  })
})

// =============================================================================
// Error Classification Tests
// =============================================================================

describe('isTransientErrorCode', () => {
  it('should return true for transient error codes', () => {
    expect(isTransientErrorCode(McpErrorCode.ServerError)).toBe(true)
    expect(isTransientErrorCode(McpErrorCode.ServerBusy)).toBe(true)
    expect(isTransientErrorCode(McpErrorCode.ConnectionError)).toBe(true)
    expect(isTransientErrorCode(McpErrorCode.ConnectionTimeout)).toBe(true)
    expect(isTransientErrorCode(McpErrorCode.RateLimited)).toBe(true)
  })

  it('should return false for non-transient error codes', () => {
    expect(isTransientErrorCode(McpErrorCode.ParseError)).toBe(false)
    expect(isTransientErrorCode(McpErrorCode.InvalidRequest)).toBe(false)
    expect(isTransientErrorCode(McpErrorCode.InvalidParams)).toBe(false)
    expect(isTransientErrorCode(McpErrorCode.ToolNotFound)).toBe(false)
    expect(isTransientErrorCode(McpErrorCode.AuthenticationFailed)).toBe(false)
  })
})

describe('classifyError', () => {
  it('should classify network errors', () => {
    expect(classifyError(new Error('ECONNREFUSED'))).toBe(McpErrorCode.ConnectionError)
    expect(classifyError(new Error('Network request failed'))).toBe(McpErrorCode.ConnectionError)
    expect(classifyError(new Error('Socket error'))).toBe(McpErrorCode.ConnectionError)
  })

  it('should classify timeout errors', () => {
    expect(classifyError(new Error('Request timed out'))).toBe(McpErrorCode.ConnectionTimeout)
    expect(classifyError(new Error('ETIMEDOUT'))).toBe(McpErrorCode.ConnectionTimeout)
    const timeoutError = new Error('Operation failed')
    timeoutError.name = 'TimeoutError'
    expect(classifyError(timeoutError)).toBe(McpErrorCode.ConnectionTimeout)
  })

  it('should classify rate limit errors', () => {
    expect(classifyError(new Error('Rate limit exceeded'))).toBe(McpErrorCode.RateLimited)
    expect(classifyError(new Error('Too many requests'))).toBe(McpErrorCode.RateLimited)
    expect(classifyError(new Error('Status code: 429'))).toBe(McpErrorCode.RateLimited)
  })

  it('should classify authentication errors', () => {
    expect(classifyError(new Error('Unauthorized access'))).toBe(McpErrorCode.AuthenticationFailed)
    expect(classifyError(new Error('401 Authentication required'))).toBe(McpErrorCode.AuthenticationFailed)
    expect(classifyError(new Error('403 Forbidden'))).toBe(McpErrorCode.AuthenticationFailed)
  })

  it('should classify parse errors', () => {
    const syntaxError = new SyntaxError('Unexpected token')
    expect(classifyError(syntaxError)).toBe(McpErrorCode.ParseError)
    expect(classifyError(new Error('JSON parse error'))).toBe(McpErrorCode.ParseError)
  })

  it('should default to InternalError', () => {
    expect(classifyError(new Error('Unknown error'))).toBe(McpErrorCode.InternalError)
  })
})

describe('isRetryableError', () => {
  it('should use retryable property for McpError', () => {
    const retryable = new McpError(McpErrorCode.ServerBusy, 'Busy')
    const notRetryable = new McpError(McpErrorCode.InvalidParams, 'Bad params')

    expect(isRetryableError(retryable)).toBe(true)
    expect(isRetryableError(notRetryable)).toBe(false)
  })

  it('should classify standard errors', () => {
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true)
    expect(isRetryableError(new Error('Unknown error'))).toBe(false)
  })
})

describe('getRetryDelay', () => {
  it('should return retryAfterMs for RateLimitError', () => {
    const error = new RateLimitError('Rate limited', 30000)
    expect(getRetryDelay(error)).toBe(30000)
  })

  it('should return retryAfter from data for McpError', () => {
    const error = new McpError(McpErrorCode.ServerBusy, 'Busy', { retryAfter: 5000 })
    expect(getRetryDelay(error)).toBe(5000)
  })

  it('should return default delay for other errors', () => {
    expect(getRetryDelay(new Error('Random error'))).toBe(1000)
    expect(getRetryDelay(new Error('Random error'), 2000)).toBe(2000)
  })
})

// =============================================================================
// Error Wrapping Tests
// =============================================================================

describe('wrapWithMcpError', () => {
  it('should pass through successful results', async () => {
    const result = await wrapWithMcpError(async () => 'success')
    expect(result).toBe('success')
  })

  it('should wrap thrown errors as McpError', async () => {
    await expect(
      wrapWithMcpError(async () => {
        throw new Error('Failed')
      })
    ).rejects.toThrow(McpError)
  })

  it('should use provided error code', async () => {
    try {
      await wrapWithMcpError(async () => {
        throw new Error('Failed')
      }, McpErrorCode.ToolExecutionError)
    } catch (error) {
      expect(error).toBeInstanceOf(McpError)
      expect((error as McpError).code).toBe(McpErrorCode.ToolExecutionError)
    }
  })
})

describe('createErrorResponse', () => {
  it('should create response from Error', () => {
    const error = new Error('Something failed')
    const response = createErrorResponse(error, 123)

    expect(response.code).toBe(McpErrorCode.InternalError)
    expect(response.message).toBe('Something failed')
    expect(response.data?.requestId).toBe(123)
  })

  it('should create response from McpError', () => {
    const error = new ToolNotFoundError('search')
    const response = createErrorResponse(error)

    expect(response.code).toBe(McpErrorCode.ToolNotFound)
    expect(response.message).toBe("Tool 'search' not found")
  })
})
