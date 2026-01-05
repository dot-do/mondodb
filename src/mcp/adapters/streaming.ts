/**
 * Streaming Utilities for MCP SDK Adapters
 *
 * Provides streaming support for:
 * - Large file reads with chunked transfer
 * - Grep/search results streaming
 * - WebSocket integration for real-time updates
 * - Async iterator utilities
 *
 * All streaming operations are designed to be memory-efficient
 * and support backpressure handling.
 */

import type { McpToolResponse, McpTextContent } from '../types'

// =============================================================================
// Stream Types
// =============================================================================

/**
 * A chunk of streamed content
 */
export interface StreamChunk {
  /** Chunk index (0-based) */
  index: number
  /** Content of this chunk */
  content: string
  /** Whether this is the final chunk */
  done: boolean
  /** Total size if known */
  totalSize?: number
  /** Bytes transferred so far */
  bytesTransferred: number
}

/**
 * Stream progress callback
 */
export type StreamProgressCallback = (chunk: StreamChunk) => void

/**
 * Stream options
 */
export interface StreamOptions {
  /** Chunk size in bytes (default: 64KB) */
  chunkSize?: number
  /** Progress callback */
  onProgress?: StreamProgressCallback
  /** Abort signal for cancellation */
  signal?: AbortSignal
  /** Transform each chunk before yielding */
  transform?: (content: string) => string
}

/**
 * WebSocket message types
 */
export type WebSocketMessageType =
  | 'stream_start'
  | 'stream_chunk'
  | 'stream_end'
  | 'stream_error'
  | 'tool_result'

/**
 * WebSocket message format
 */
export interface WebSocketMessage {
  type: WebSocketMessageType
  requestId: string
  data: unknown
  timestamp: string
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CHUNK_SIZE = 64 * 1024 // 64KB
const DEFAULT_IDLE_TIMEOUT = 30000 // 30 seconds

// =============================================================================
// Text Content Streaming
// =============================================================================

/**
 * Create a streaming response from text content
 *
 * Splits large text content into chunks for efficient transmission.
 * Yields chunks as an async iterator.
 *
 * @param content - Text content to stream
 * @param options - Stream options
 * @yields StreamChunk for each chunk of content
 *
 * @example
 * ```typescript
 * const content = await readLargeFile()
 * for await (const chunk of streamTextContent(content, { chunkSize: 32768 })) {
 *   socket.send(JSON.stringify({ type: 'chunk', data: chunk }))
 * }
 * ```
 */
export async function* streamTextContent(
  content: string,
  options: StreamOptions = {}
): AsyncGenerator<StreamChunk, void, undefined> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  const totalSize = content.length
  let bytesTransferred = 0
  let index = 0

  while (bytesTransferred < totalSize) {
    // Check for abort signal
    if (options.signal?.aborted) {
      throw new DOMException('Stream aborted', 'AbortError')
    }

    const chunk = content.slice(bytesTransferred, bytesTransferred + chunkSize)
    const transformedChunk = options.transform ? options.transform(chunk) : chunk
    bytesTransferred += chunk.length
    const done = bytesTransferred >= totalSize

    const streamChunk: StreamChunk = {
      index,
      content: transformedChunk,
      done,
      totalSize,
      bytesTransferred,
    }

    if (options.onProgress) {
      options.onProgress(streamChunk)
    }

    yield streamChunk
    index++
  }
}

/**
 * Stream file content in chunks
 *
 * Reads a file and streams its content in chunks suitable for
 * MCP tool responses.
 *
 * @param readFn - Function to read file content (allows dependency injection)
 * @param filePath - Path to the file
 * @param options - Stream options
 * @yields StreamChunk for each chunk of file content
 */
export async function* streamFileContent(
  readFn: (path: string, options?: { offset?: number; length?: number }) => Promise<string>,
  filePath: string,
  options: StreamOptions = {}
): AsyncGenerator<StreamChunk, void, undefined> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  let offset = 0
  let index = 0
  let done = false

  while (!done) {
    if (options.signal?.aborted) {
      throw new DOMException('Stream aborted', 'AbortError')
    }

    const content = await readFn(filePath, { offset, length: chunkSize })

    // If we got less than requested, we're at the end
    done = content.length < chunkSize

    const transformedContent = options.transform ? options.transform(content) : content

    const streamChunk: StreamChunk = {
      index,
      content: transformedContent,
      done,
      bytesTransferred: offset + content.length,
    }

    if (options.onProgress) {
      options.onProgress(streamChunk)
    }

    yield streamChunk

    offset += content.length
    index++

    // Break if no content returned
    if (content.length === 0) {
      break
    }
  }
}

// =============================================================================
// Search Results Streaming
// =============================================================================

/**
 * Options for streaming search results
 */
export interface SearchStreamOptions extends StreamOptions {
  /** Maximum results per chunk (default: 100) */
  resultsPerChunk?: number
  /** Include match context (default: true) */
  includeContext?: boolean
}

/**
 * A search result item
 */
export interface SearchResultItem {
  /** File or document path */
  path: string
  /** Line number (for text search) */
  line?: number
  /** Match content */
  content: string
  /** Context around match */
  context?: string
}

/**
 * Stream search results
 *
 * Yields search results in batches as they are found.
 * Useful for grep-like operations on large codebases.
 *
 * @param searchFn - Async generator that yields search results
 * @param options - Stream options
 * @yields StreamChunk containing batched search results
 */
export async function* streamSearchResults(
  searchFn: () => AsyncGenerator<SearchResultItem, void, undefined>,
  options: SearchStreamOptions = {}
): AsyncGenerator<StreamChunk, void, undefined> {
  const resultsPerChunk = options.resultsPerChunk ?? 100
  let batch: SearchResultItem[] = []
  let index = 0
  let totalResults = 0

  for await (const result of searchFn()) {
    if (options.signal?.aborted) {
      throw new DOMException('Search aborted', 'AbortError')
    }

    batch.push(result)
    totalResults++

    if (batch.length >= resultsPerChunk) {
      const content = JSON.stringify(batch)
      const streamChunk: StreamChunk = {
        index,
        content,
        done: false,
        bytesTransferred: totalResults,
      }

      if (options.onProgress) {
        options.onProgress(streamChunk)
      }

      yield streamChunk
      batch = []
      index++
    }
  }

  // Yield remaining results
  if (batch.length > 0) {
    const content = JSON.stringify(batch)
    const streamChunk: StreamChunk = {
      index,
      content,
      done: true,
      bytesTransferred: totalResults,
    }

    if (options.onProgress) {
      options.onProgress(streamChunk)
    }

    yield streamChunk
  } else {
    // Send empty final chunk if last batch was exactly full
    yield {
      index,
      content: '[]',
      done: true,
      bytesTransferred: totalResults,
    }
  }
}

// =============================================================================
// WebSocket Integration
// =============================================================================

/**
 * WebSocket stream handler configuration
 */
export interface WebSocketStreamConfig {
  /** Send function for the WebSocket */
  send: (message: string) => void
  /** Request ID for correlation */
  requestId: string
  /** Idle timeout in ms (default: 30000) */
  idleTimeout?: number
  /** Error handler */
  onError?: (error: Error) => void
}

/**
 * Create a WebSocket message
 */
function createWebSocketMessage(
  type: WebSocketMessageType,
  requestId: string,
  data: unknown
): WebSocketMessage {
  return {
    type,
    requestId,
    data,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Stream content over a WebSocket connection
 *
 * Sends stream chunks as WebSocket messages with proper
 * framing and error handling.
 *
 * @param stream - Async iterator of stream chunks
 * @param config - WebSocket configuration
 *
 * @example
 * ```typescript
 * const stream = streamTextContent(largeContent)
 * await streamToWebSocket(stream, {
 *   send: (msg) => ws.send(msg),
 *   requestId: 'req-123',
 * })
 * ```
 */
export async function streamToWebSocket(
  stream: AsyncIterable<StreamChunk>,
  config: WebSocketStreamConfig
): Promise<void> {
  const { send, requestId, idleTimeout = DEFAULT_IDLE_TIMEOUT, onError } = config

  // Send start message
  send(JSON.stringify(createWebSocketMessage('stream_start', requestId, {
    timestamp: new Date().toISOString(),
  })))

  let idleTimer: ReturnType<typeof setTimeout> | null = null

  const resetIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer)
    }
    idleTimer = setTimeout(() => {
      const error = new Error(`Stream idle timeout after ${idleTimeout}ms`)
      send(JSON.stringify(createWebSocketMessage('stream_error', requestId, {
        error: error.message,
      })))
      if (onError) {
        onError(error)
      }
    }, idleTimeout)
  }

  try {
    resetIdleTimer()

    for await (const chunk of stream) {
      resetIdleTimer()

      send(JSON.stringify(createWebSocketMessage('stream_chunk', requestId, {
        index: chunk.index,
        content: chunk.content,
        done: chunk.done,
        bytesTransferred: chunk.bytesTransferred,
        totalSize: chunk.totalSize,
      })))
    }

    // Send end message
    send(JSON.stringify(createWebSocketMessage('stream_end', requestId, {
      timestamp: new Date().toISOString(),
    })))
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    send(JSON.stringify(createWebSocketMessage('stream_error', requestId, {
      error: err.message,
    })))
    if (onError) {
      onError(err)
    }
    throw err
  } finally {
    if (idleTimer) {
      clearTimeout(idleTimer)
    }
  }
}

// =============================================================================
// MCP Tool Response Streaming
// =============================================================================

/**
 * Convert stream chunks to MCP tool response
 *
 * Collects all stream chunks and creates a single MCP tool response.
 * Useful when the SDK doesn't support streaming natively.
 *
 * @param stream - Async iterator of stream chunks
 * @returns Complete MCP tool response
 */
export async function collectStreamToResponse(
  stream: AsyncIterable<StreamChunk>
): Promise<McpToolResponse> {
  const chunks: string[] = []

  for await (const chunk of stream) {
    chunks.push(chunk.content)
  }

  return {
    content: [
      {
        type: 'text',
        text: chunks.join(''),
      },
    ],
  }
}

/**
 * Create a streaming MCP tool response generator
 *
 * Wraps stream chunks as MCP text content for streaming responses.
 *
 * @param stream - Async iterator of stream chunks
 * @yields McpTextContent for each chunk
 */
export async function* streamToMcpContent(
  stream: AsyncIterable<StreamChunk>
): AsyncGenerator<McpTextContent, void, undefined> {
  for await (const chunk of stream) {
    yield {
      type: 'text',
      text: chunk.content,
    }
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Combine multiple streams into a single stream
 *
 * @param streams - Array of async iterables to combine
 * @yields StreamChunk from each stream in order
 */
export async function* combineStreams(
  ...streams: AsyncIterable<StreamChunk>[]
): AsyncGenerator<StreamChunk, void, undefined> {
  let globalIndex = 0
  let totalBytesTransferred = 0

  for (const stream of streams) {
    for await (const chunk of stream) {
      totalBytesTransferred += chunk.content.length
      yield {
        ...chunk,
        index: globalIndex,
        bytesTransferred: totalBytesTransferred,
        done: false,
      }
      globalIndex++
    }
  }

  // Final chunk to signal completion
  yield {
    index: globalIndex,
    content: '',
    done: true,
    bytesTransferred: totalBytesTransferred,
  }
}

/**
 * Limit the rate of stream chunks
 *
 * @param stream - Source stream
 * @param delayMs - Delay between chunks in milliseconds
 * @yields StreamChunk with rate limiting applied
 */
export async function* rateLimitStream(
  stream: AsyncIterable<StreamChunk>,
  delayMs: number
): AsyncGenerator<StreamChunk, void, undefined> {
  for await (const chunk of stream) {
    yield chunk
    if (!chunk.done) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

/**
 * Buffer stream chunks until a minimum size is reached
 *
 * @param stream - Source stream
 * @param minSize - Minimum buffer size before yielding
 * @yields StreamChunk when buffer reaches minSize or stream ends
 */
export async function* bufferStream(
  stream: AsyncIterable<StreamChunk>,
  minSize: number
): AsyncGenerator<StreamChunk, void, undefined> {
  let buffer = ''
  let index = 0
  let bytesTransferred = 0

  for await (const chunk of stream) {
    buffer += chunk.content
    bytesTransferred = chunk.bytesTransferred

    if (buffer.length >= minSize || chunk.done) {
      const streamChunk: StreamChunk = {
        index,
        content: buffer,
        done: chunk.done,
        bytesTransferred,
      }
      if (chunk.totalSize !== undefined) {
        streamChunk.totalSize = chunk.totalSize
      }
      yield streamChunk
      buffer = ''
      index++
    }
  }

  // Yield any remaining buffer
  if (buffer.length > 0) {
    yield {
      index,
      content: buffer,
      done: true,
      bytesTransferred,
    }
  }
}
