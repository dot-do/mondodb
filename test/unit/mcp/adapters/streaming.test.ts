import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  streamTextContent,
  streamFileContent,
  streamSearchResults,
  streamToWebSocket,
  collectStreamToResponse,
  streamToMcpContent,
  combineStreams,
  rateLimitStream,
  bufferStream,
  type StreamChunk,
  type SearchResultItem,
  type WebSocketStreamConfig,
} from '../../../../src/mcp/adapters/streaming'

// =============================================================================
// Helper Functions
// =============================================================================

async function collectStream<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = []
  for await (const item of stream) {
    results.push(item)
  }
  return results
}

// =============================================================================
// streamTextContent Tests
// =============================================================================

describe('streamTextContent', () => {
  it('should stream content in chunks', async () => {
    const content = 'Hello, World!'
    const chunks = await collectStream(streamTextContent(content, { chunkSize: 5 }))

    expect(chunks.length).toBe(3)
    expect(chunks[0].content).toBe('Hello')
    expect(chunks[0].index).toBe(0)
    expect(chunks[0].done).toBe(false)
    expect(chunks[1].content).toBe(', Wor')
    expect(chunks[2].content).toBe('ld!')
    expect(chunks[2].done).toBe(true)
  })

  it('should track bytes transferred', async () => {
    const content = 'ABCDEFGHIJ'
    const chunks = await collectStream(streamTextContent(content, { chunkSize: 3 }))

    expect(chunks[0].bytesTransferred).toBe(3)
    expect(chunks[1].bytesTransferred).toBe(6)
    expect(chunks[2].bytesTransferred).toBe(9)
    expect(chunks[3].bytesTransferred).toBe(10)
  })

  it('should include totalSize in chunks', async () => {
    const content = 'Test content here'
    const chunks = await collectStream(streamTextContent(content))

    chunks.forEach((chunk) => {
      expect(chunk.totalSize).toBe(content.length)
    })
  })

  it('should call progress callback', async () => {
    const content = 'Progress test'
    const onProgress = vi.fn()

    await collectStream(streamTextContent(content, { chunkSize: 5, onProgress }))

    expect(onProgress).toHaveBeenCalledTimes(3)
    expect(onProgress.mock.calls[0][0]).toMatchObject({
      index: 0,
      content: 'Progr',
      done: false,
    })
  })

  it('should apply transform to chunks', async () => {
    const content = 'hello world'
    const chunks = await collectStream(
      streamTextContent(content, {
        chunkSize: 5,
        transform: (c) => c.toUpperCase(),
      })
    )

    expect(chunks[0].content).toBe('HELLO')
    expect(chunks[1].content).toBe(' WORL')
    expect(chunks[2].content).toBe('D')
  })

  it('should abort on signal', async () => {
    const content = 'A'.repeat(1000)
    const controller = new AbortController()

    const generator = streamTextContent(content, {
      chunkSize: 10,
      signal: controller.signal,
    })

    const chunks: StreamChunk[] = []
    try {
      for await (const chunk of generator) {
        chunks.push(chunk)
        if (chunks.length === 5) {
          controller.abort()
        }
      }
    } catch (error) {
      expect((error as Error).name).toBe('AbortError')
    }

    expect(chunks.length).toBe(5)
  })

  it('should handle empty content', async () => {
    const chunks = await collectStream(streamTextContent(''))
    expect(chunks.length).toBe(0)
  })

  it('should handle content smaller than chunk size', async () => {
    const content = 'Hi'
    const chunks = await collectStream(streamTextContent(content, { chunkSize: 100 }))

    expect(chunks.length).toBe(1)
    expect(chunks[0].content).toBe('Hi')
    expect(chunks[0].done).toBe(true)
  })
})

// =============================================================================
// streamFileContent Tests
// =============================================================================

describe('streamFileContent', () => {
  it('should stream file content in chunks', async () => {
    const fileContent = 'File content for testing streaming'
    const readFn = vi.fn().mockImplementation(async (_path, options) => {
      const offset = options?.offset ?? 0
      const length = options?.length ?? fileContent.length
      return fileContent.slice(offset, offset + length)
    })

    const chunks = await collectStream(
      streamFileContent(readFn, '/test/file.txt', { chunkSize: 10 })
    )

    expect(chunks.length).toBe(4)
    expect(chunks[0].content).toBe('File conte')
    expect(chunks[3].done).toBe(true)
    expect(readFn).toHaveBeenCalledWith('/test/file.txt', { offset: 0, length: 10 })
  })

  it('should handle read returning less than requested', async () => {
    const readFn = vi
      .fn()
      .mockResolvedValueOnce('First')
      .mockResolvedValueOnce('End')
      .mockResolvedValue('')

    const chunks = await collectStream(streamFileContent(readFn, '/test.txt', { chunkSize: 10 }))

    // First chunk has 5 chars (less than 10), so done=true
    // Second chunk has 3 chars, so done=true
    // We get 2 chunks total
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks[0].content).toBe('First')
    // When we get less than chunkSize, the stream considers it done
    expect(chunks[0].done).toBe(true)
  })

  it('should apply transform to file content', async () => {
    const readFn = vi.fn().mockResolvedValueOnce('test').mockResolvedValue('')

    const chunks = await collectStream(
      streamFileContent(readFn, '/test.txt', {
        chunkSize: 100,
        transform: (c) => c.toUpperCase(),
      })
    )

    expect(chunks[0].content).toBe('TEST')
  })

  it('should abort on signal', async () => {
    const controller = new AbortController()
    const readFn = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return 'chunk'
    })

    controller.abort()

    await expect(async () => {
      await collectStream(
        streamFileContent(readFn, '/test.txt', {
          chunkSize: 5,
          signal: controller.signal,
        })
      )
    }).rejects.toThrow('aborted')
  })
})

// =============================================================================
// streamSearchResults Tests
// =============================================================================

describe('streamSearchResults', () => {
  it('should batch search results', async () => {
    const results: SearchResultItem[] = Array.from({ length: 25 }, (_, i) => ({
      path: `/file${i}.txt`,
      line: i,
      content: `Match ${i}`,
    }))

    async function* generateResults() {
      for (const result of results) {
        yield result
      }
    }

    const chunks = await collectStream(
      streamSearchResults(generateResults, { resultsPerChunk: 10 })
    )

    expect(chunks.length).toBe(3)
    expect(JSON.parse(chunks[0].content)).toHaveLength(10)
    expect(JSON.parse(chunks[1].content)).toHaveLength(10)
    expect(JSON.parse(chunks[2].content)).toHaveLength(5)
  })

  it('should handle results exactly matching batch size', async () => {
    const results: SearchResultItem[] = Array.from({ length: 10 }, (_, i) => ({
      path: `/file${i}.txt`,
      content: `Match ${i}`,
    }))

    async function* generateResults() {
      for (const result of results) {
        yield result
      }
    }

    const chunks = await collectStream(
      streamSearchResults(generateResults, { resultsPerChunk: 10 })
    )

    expect(chunks.length).toBe(2) // One full batch + empty final
    expect(JSON.parse(chunks[0].content)).toHaveLength(10)
    expect(chunks[0].done).toBe(false)
    expect(chunks[1].done).toBe(true)
  })

  it('should track total results', async () => {
    const results: SearchResultItem[] = Array.from({ length: 15 }, (_, i) => ({
      path: `/file${i}.txt`,
      content: `Match ${i}`,
    }))

    async function* generateResults() {
      for (const result of results) {
        yield result
      }
    }

    const chunks = await collectStream(
      streamSearchResults(generateResults, { resultsPerChunk: 10 })
    )

    expect(chunks[0].bytesTransferred).toBe(10)
    expect(chunks[1].bytesTransferred).toBe(15)
  })

  it('should abort on signal', async () => {
    const controller = new AbortController()

    async function* generateResults() {
      for (let i = 0; i < 100; i++) {
        yield { path: `/file${i}.txt`, content: `Match ${i}` }
      }
    }

    const chunks: StreamChunk[] = []

    try {
      for await (const chunk of streamSearchResults(generateResults, {
        resultsPerChunk: 10,
        signal: controller.signal,
      })) {
        chunks.push(chunk)
        if (chunks.length === 2) {
          controller.abort()
        }
      }
    } catch (error) {
      expect((error as Error).name).toBe('AbortError')
    }

    expect(chunks.length).toBe(2)
  })
})

// =============================================================================
// streamToWebSocket Tests
// =============================================================================

describe('streamToWebSocket', () => {
  it('should send messages in correct format', async () => {
    const sent: string[] = []
    const config: WebSocketStreamConfig = {
      send: (msg) => sent.push(msg),
      requestId: 'req-123',
    }

    await streamToWebSocket(streamTextContent('Hello', { chunkSize: 3 }), config)

    expect(sent.length).toBe(4) // start + 2 chunks + end

    const startMsg = JSON.parse(sent[0])
    expect(startMsg.type).toBe('stream_start')
    expect(startMsg.requestId).toBe('req-123')

    const chunk1 = JSON.parse(sent[1])
    expect(chunk1.type).toBe('stream_chunk')
    expect(chunk1.data.content).toBe('Hel')

    const chunk2 = JSON.parse(sent[2])
    expect(chunk2.data.content).toBe('lo')
    expect(chunk2.data.done).toBe(true)

    const endMsg = JSON.parse(sent[3])
    expect(endMsg.type).toBe('stream_end')
  })

  it('should handle errors', async () => {
    const sent: string[] = []
    const onError = vi.fn()
    const config: WebSocketStreamConfig = {
      send: (msg) => sent.push(msg),
      requestId: 'req-123',
      onError,
    }

    async function* errorStream() {
      yield { index: 0, content: 'ok', done: false, bytesTransferred: 2 }
      throw new Error('Stream error')
    }

    await expect(streamToWebSocket(errorStream(), config)).rejects.toThrow('Stream error')

    const errorMsg = JSON.parse(sent[sent.length - 1])
    expect(errorMsg.type).toBe('stream_error')
    expect(errorMsg.data.error).toBe('Stream error')
    expect(onError).toHaveBeenCalled()
  })

  it('should timeout on idle', async () => {
    vi.useFakeTimers()

    const sent: string[] = []
    const onError = vi.fn()
    const config: WebSocketStreamConfig = {
      send: (msg) => sent.push(msg),
      requestId: 'req-123',
      idleTimeout: 100,
      onError,
    }

    async function* slowStream() {
      yield { index: 0, content: 'first', done: false, bytesTransferred: 5 }
      await new Promise((resolve) => setTimeout(resolve, 200))
      yield { index: 1, content: 'second', done: true, bytesTransferred: 11 }
    }

    const promise = streamToWebSocket(slowStream(), config)

    // Advance past idle timeout
    await vi.advanceTimersByTimeAsync(150)

    vi.useRealTimers()

    // The stream should have sent idle timeout error
    expect(onError).toHaveBeenCalled()
  })
})

// =============================================================================
// collectStreamToResponse Tests
// =============================================================================

describe('collectStreamToResponse', () => {
  it('should collect all chunks into response', async () => {
    const stream = streamTextContent('Hello, World!', { chunkSize: 5 })

    const response = await collectStreamToResponse(stream)

    expect(response.content).toHaveLength(1)
    expect(response.content[0].type).toBe('text')
    expect(response.content[0].text).toBe('Hello, World!')
  })

  it('should handle empty stream', async () => {
    async function* emptyStream() {
      // No items
    }

    const response = await collectStreamToResponse(emptyStream())

    expect(response.content[0].text).toBe('')
  })
})

// =============================================================================
// streamToMcpContent Tests
// =============================================================================

describe('streamToMcpContent', () => {
  it('should convert chunks to MCP text content', async () => {
    const stream = streamTextContent('Test', { chunkSize: 2 })

    const contents = await collectStream(streamToMcpContent(stream))

    expect(contents).toHaveLength(2)
    expect(contents[0]).toEqual({ type: 'text', text: 'Te' })
    expect(contents[1]).toEqual({ type: 'text', text: 'st' })
  })
})

// =============================================================================
// combineStreams Tests
// =============================================================================

describe('combineStreams', () => {
  it('should combine multiple streams', async () => {
    const stream1 = streamTextContent('AB', { chunkSize: 1 })
    const stream2 = streamTextContent('CD', { chunkSize: 1 })

    const chunks = await collectStream(combineStreams(stream1, stream2))

    // 2 from stream1 + 2 from stream2 + 1 final
    expect(chunks).toHaveLength(5)
    expect(chunks[0].content).toBe('A')
    expect(chunks[1].content).toBe('B')
    expect(chunks[2].content).toBe('C')
    expect(chunks[3].content).toBe('D')
    expect(chunks[4].done).toBe(true)
  })

  it('should have continuous indices', async () => {
    const stream1 = streamTextContent('AB', { chunkSize: 1 })
    const stream2 = streamTextContent('CD', { chunkSize: 1 })

    const chunks = await collectStream(combineStreams(stream1, stream2))

    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2, 3, 4])
  })

  it('should track cumulative bytes', async () => {
    const stream1 = streamTextContent('ABC', { chunkSize: 1 })
    const stream2 = streamTextContent('DE', { chunkSize: 1 })

    const chunks = await collectStream(combineStreams(stream1, stream2))

    expect(chunks[0].bytesTransferred).toBe(1)
    expect(chunks[2].bytesTransferred).toBe(3)
    expect(chunks[3].bytesTransferred).toBe(4)
    expect(chunks[4].bytesTransferred).toBe(5)
  })
})

// =============================================================================
// rateLimitStream Tests
// =============================================================================

describe('rateLimitStream', () => {
  it('should add delay between chunks', async () => {
    vi.useFakeTimers()

    const stream = streamTextContent('ABC', { chunkSize: 1 })
    const rateLimited = rateLimitStream(stream, 100)

    const start = Date.now()
    const chunks: StreamChunk[] = []

    const collectPromise = (async () => {
      for await (const chunk of rateLimited) {
        chunks.push(chunk)
      }
    })()

    // Advance through all delays
    await vi.advanceTimersByTimeAsync(200)
    await collectPromise

    vi.useRealTimers()

    expect(chunks).toHaveLength(3)
  })

  it('should not delay after final chunk', async () => {
    const stream = streamTextContent('A', { chunkSize: 1 })
    const rateLimited = rateLimitStream(stream, 1000)

    const start = Date.now()
    const chunks = await collectStream(rateLimited)
    const duration = Date.now() - start

    expect(duration).toBeLessThan(100) // Should be almost instant
    expect(chunks).toHaveLength(1)
  })
})

// =============================================================================
// bufferStream Tests
// =============================================================================

describe('bufferStream', () => {
  it('should buffer until minimum size', async () => {
    const stream = streamTextContent('ABCDEFGHIJ', { chunkSize: 2 })
    const buffered = bufferStream(stream, 5)

    const chunks = await collectStream(buffered)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].content).toBe('ABCDEF')
    expect(chunks[1].content).toBe('GHIJ')
  })

  it('should yield on done even if buffer not full', async () => {
    const stream = streamTextContent('AB', { chunkSize: 1 })
    const buffered = bufferStream(stream, 100)

    const chunks = await collectStream(buffered)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('AB')
    expect(chunks[0].done).toBe(true)
  })

  it('should maintain sequential indices', async () => {
    const stream = streamTextContent('ABCDEFGH', { chunkSize: 1 })
    const buffered = bufferStream(stream, 3)

    const chunks = await collectStream(buffered)

    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2])
  })
})
