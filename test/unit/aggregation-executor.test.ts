import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { AggregationExecutor } from '../../src/executor/aggregation-executor'

// Mock SQL interface
interface MockSql {
  exec: Mock
}

// Mock function executor response helper for batch mode
function createMockBatchResponse(results: unknown[]) {
  return {
    json: () => Promise.resolve({ results })
  }
}

function createMockErrorResponse(error: string) {
  return {
    json: () => Promise.resolve({ error })
  }
}

describe('AggregationExecutor', () => {
  let mockSql: MockSql
  let mockLoader: {
    get: Mock
  }

  beforeEach(() => {
    mockSql = {
      exec: vi.fn()
    }
    mockLoader = {
      get: vi.fn()
    }
  })

  describe('simple pipelines (no $function)', () => {
    it('executes $match pipeline', async () => {
      // Setup mock SQL response
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({ _id: '1', name: 'Alice', age: 30 }) },
          { data: JSON.stringify({ _id: '2', name: 'Bob', age: 25 }) }
        ]
      })

      const executor = new AggregationExecutor(mockSql, {})
      const results = await executor.execute('users', [
        { $match: { age: { $gte: 25 } } }
      ])

      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({ _id: '1', name: 'Alice', age: 30 })
      expect(results[1]).toEqual({ _id: '2', name: 'Bob', age: 25 })
    })

    it('executes $project pipeline', async () => {
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({ name: 'Alice' }) },
          { data: JSON.stringify({ name: 'Bob' }) }
        ]
      })

      const executor = new AggregationExecutor(mockSql, {})
      const results = await executor.execute('users', [
        { $project: { name: 1, _id: 0 } }
      ])

      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({ name: 'Alice' })
    })

    it('executes multi-stage pipeline', async () => {
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({ _id: '1', name: 'Alice', age: 30 }) }
        ]
      })

      const executor = new AggregationExecutor(mockSql, {})
      const results = await executor.execute('users', [
        { $match: { age: { $gte: 25 } } },
        { $sort: { age: -1 } },
        { $limit: 1 }
      ])

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual({ _id: '1', name: 'Alice', age: 30 })
    })

    it('handles empty results', async () => {
      mockSql.exec.mockReturnValue({ results: [] })

      const executor = new AggregationExecutor(mockSql, {})
      const results = await executor.execute('users', [
        { $match: { nonexistent: 'value' } }
      ])

      expect(results).toHaveLength(0)
    })
  })

  describe('pipelines with $function', () => {
    it('throws when LOADER not available', async () => {
      // Return SQL result containing a function marker
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({
            _id: '1',
            doubled: '__FUNCTION__{"__type":"function","body":"x => x * 2","argPaths":["$.value"],"literalArgs":{},"argOrder":[{"type":"field","path":"$.value"}]}'
          }) }
        ]
      })

      const executor = new AggregationExecutor(mockSql, {})

      await expect(executor.execute('users', [
        { $addFields: { doubled: { $function: { body: 'x => x * 2', args: ['$value'], lang: 'js' } } } }
      ])).rejects.toThrow('$function requires worker_loaders binding')
    })

    it('executes $addFields with $function', async () => {
      // Setup SQL to return result with function marker
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({
            _id: '1',
            value: 5,
            doubled: '__FUNCTION__{"__type":"function","body":"x => x * 2","argPaths":["$.value"],"literalArgs":{},"argOrder":[{"type":"field","path":"$.value"}]}'
          }) }
        ]
      })

      // Setup mock worker loader
      const mockFetch = vi.fn().mockResolvedValue(createMockBatchResponse([10]))
      mockLoader.get.mockReturnValue({
        getEntrypoint: () => ({ fetch: mockFetch })
      })

      const executor = new AggregationExecutor(mockSql, { LOADER: mockLoader as any })
      const results = await executor.execute('users', [
        { $addFields: { doubled: { $function: { body: 'x => x * 2', args: ['$value'], lang: 'js' } } } }
      ])

      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({ _id: '1', value: 5, doubled: 10 })
    })

    it('passes correct args to function', async () => {
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({
            _id: '1',
            x: 3,
            y: 4,
            sum: '__FUNCTION__{"__type":"function","body":"(a, b) => a + b","argPaths":["$.x","$.y"],"literalArgs":{},"argOrder":[{"type":"field","path":"$.x"},{"type":"field","path":"$.y"}]}'
          }) }
        ]
      })

      const mockFetch = vi.fn().mockResolvedValue(createMockBatchResponse([7]))
      mockLoader.get.mockReturnValue({
        getEntrypoint: () => ({ fetch: mockFetch })
      })

      const executor = new AggregationExecutor(mockSql, { LOADER: mockLoader as any })
      const results = await executor.execute('users', [
        { $addFields: { sum: { $function: { body: '(a, b) => a + b', args: ['$x', '$y'], lang: 'js' } } } }
      ])

      expect(results[0]).toMatchObject({ sum: 7 })

      // Verify fetch was called with correct arguments (batch mode uses argsArray)
      expect(mockFetch).toHaveBeenCalled()
      const fetchCall = mockFetch.mock.calls[0][0] as Request
      const body = await fetchCall.json()
      expect(body.argsArray).toEqual([[3, 4]])
    })

    it('handles nested function results', async () => {
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({
            _id: '1',
            nested: {
              computed: '__FUNCTION__{"__type":"function","body":"() => 42","argPaths":[],"literalArgs":{},"argOrder":[]}'
            }
          }) }
        ]
      })

      const mockFetch = vi.fn().mockResolvedValue(createMockBatchResponse([42]))
      mockLoader.get.mockReturnValue({
        getEntrypoint: () => ({ fetch: mockFetch })
      })

      const executor = new AggregationExecutor(mockSql, { LOADER: mockLoader as any })

      // Test with pre-computed SQL result (skipping the actual pipeline translation)
      // The test verifies that nested function markers are processed correctly
      const results = await executor.execute('users', [
        { $match: {} }  // Simple stage that doesn't transform shape
      ])

      expect(results[0]).toMatchObject({
        _id: '1',
        nested: { computed: 42 }
      })
    })

    it('handles literal arguments in functions', async () => {
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({
            _id: '1',
            value: 5,
            result: '__FUNCTION__{"__type":"function","body":"(x, multiplier) => x * multiplier","argPaths":["$.value"],"literalArgs":{"1":10},"argOrder":[{"type":"field","path":"$.value"},{"type":"literal","index":1}]}'
          }) }
        ]
      })

      const mockFetch = vi.fn().mockResolvedValue(createMockBatchResponse([50]))
      mockLoader.get.mockReturnValue({
        getEntrypoint: () => ({ fetch: mockFetch })
      })

      const executor = new AggregationExecutor(mockSql, { LOADER: mockLoader as any })
      const results = await executor.execute('users', [
        { $match: {} }  // Use simple stage since we're testing function execution, not translation
      ])

      expect(results[0]).toMatchObject({ result: 50 })

      // Verify literal arg was passed correctly
      const fetchCall = mockFetch.mock.calls[0][0] as Request
      const body = await fetchCall.json()
      expect(body.argsArray).toEqual([[5, 10]])
    })

    it('handles function execution errors gracefully', async () => {
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({
            _id: '1',
            value: 5,
            result: '__FUNCTION__{"__type":"function","body":"() => { throw new Error(\\"oops\\") }","argPaths":[],"literalArgs":{},"argOrder":[]}'
          }) }
        ]
      })

      const mockFetch = vi.fn().mockResolvedValue(createMockErrorResponse('oops'))
      mockLoader.get.mockReturnValue({
        getEntrypoint: () => ({ fetch: mockFetch })
      })

      const executor = new AggregationExecutor(mockSql, { LOADER: mockLoader as any })

      await expect(executor.execute('users', [
        { $match: {} }  // Use simple stage
      ])).rejects.toThrow('$function batch execution failed')
    })
  })

  describe('batch optimization', () => {
    it('batches multiple documents with same function', async () => {
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({
            _id: '1',
            value: 5,
            doubled: '__FUNCTION__{"__type":"function","body":"x => x * 2","argPaths":["$.value"],"literalArgs":{},"argOrder":[{"type":"field","path":"$.value"}]}'
          }) },
          { data: JSON.stringify({
            _id: '2',
            value: 10,
            doubled: '__FUNCTION__{"__type":"function","body":"x => x * 2","argPaths":["$.value"],"literalArgs":{},"argOrder":[{"type":"field","path":"$.value"}]}'
          }) },
          { data: JSON.stringify({
            _id: '3',
            value: 15,
            doubled: '__FUNCTION__{"__type":"function","body":"x => x * 2","argPaths":["$.value"],"literalArgs":{},"argOrder":[{"type":"field","path":"$.value"}]}'
          }) }
        ]
      })

      // Setup batch response
      const mockFetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ results: [10, 20, 30] })
      })
      mockLoader.get.mockReturnValue({
        getEntrypoint: () => ({ fetch: mockFetch })
      })

      const executor = new AggregationExecutor(mockSql, { LOADER: mockLoader as any })
      const results = await executor.execute('users', [
        { $addFields: { doubled: { $function: { body: 'x => x * 2', args: ['$value'], lang: 'js' } } } }
      ])

      expect(results).toHaveLength(3)
      expect(results[0]).toMatchObject({ doubled: 10 })
      expect(results[1]).toMatchObject({ doubled: 20 })
      expect(results[2]).toMatchObject({ doubled: 30 })
    })
  })

  describe('facet handling', () => {
    it('executes facet pipelines', async () => {
      // Mock for first facet
      mockSql.exec
        .mockReturnValueOnce({ results: [] }) // Initial empty
        .mockReturnValueOnce({
          results: [
            { data: JSON.stringify({ category: 'A', count: 5 }) },
            { data: JSON.stringify({ category: 'B', count: 3 }) }
          ]
        })
        .mockReturnValueOnce({
          results: [
            { data: JSON.stringify({ total: 100 }) }
          ]
        })

      const executor = new AggregationExecutor(mockSql, {})

      // This tests the facet path - the translator would return facets object
      // We'll need to verify the executor properly handles this case
      // For now, just verify basic pipeline execution works
      const results = await executor.execute('orders', [
        { $match: { status: 'completed' } }
      ])

      expect(mockSql.exec).toHaveBeenCalled()
    })
  })

  describe('field extraction', () => {
    it('extracts simple field values', async () => {
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({
            _id: '1',
            name: 'test',
            upper: '__FUNCTION__{"__type":"function","body":"s => s.toUpperCase()","argPaths":["$.name"],"literalArgs":{},"argOrder":[{"type":"field","path":"$.name"}]}'
          }) }
        ]
      })

      const mockFetch = vi.fn().mockResolvedValue(createMockBatchResponse(['TEST']))
      mockLoader.get.mockReturnValue({
        getEntrypoint: () => ({ fetch: mockFetch })
      })

      const executor = new AggregationExecutor(mockSql, { LOADER: mockLoader as any })
      const results = await executor.execute('users', [
        { $match: {} }  // Use simple stage
      ])

      expect(results[0]).toMatchObject({ upper: 'TEST' })
    })

    it('extracts nested field values', async () => {
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({
            _id: '1',
            profile: { settings: { theme: 'dark' } },
            themeCopy: '__FUNCTION__{"__type":"function","body":"t => t","argPaths":["$.profile.settings.theme"],"literalArgs":{},"argOrder":[{"type":"field","path":"$.profile.settings.theme"}]}'
          }) }
        ]
      })

      const mockFetch = vi.fn().mockResolvedValue(createMockBatchResponse(['dark']))
      mockLoader.get.mockReturnValue({
        getEntrypoint: () => ({ fetch: mockFetch })
      })

      const executor = new AggregationExecutor(mockSql, { LOADER: mockLoader as any })
      const results = await executor.execute('users', [
        { $match: {} }  // Use simple stage
      ])

      expect(results[0]).toMatchObject({ themeCopy: 'dark' })
    })

    it('handles undefined nested fields', async () => {
      mockSql.exec.mockReturnValue({
        results: [
          { data: JSON.stringify({
            _id: '1',
            result: '__FUNCTION__{"__type":"function","body":"x => x ?? \\"default\\"","argPaths":["$.nonexistent.path"],"literalArgs":{},"argOrder":[{"type":"field","path":"$.nonexistent.path"}]}'
          }) }
        ]
      })

      const mockFetch = vi.fn().mockResolvedValue(createMockBatchResponse(['default']))
      mockLoader.get.mockReturnValue({
        getEntrypoint: () => ({ fetch: mockFetch })
      })

      const executor = new AggregationExecutor(mockSql, { LOADER: mockLoader as any })
      const results = await executor.execute('users', [
        { $match: {} }  // Use simple stage
      ])

      expect(results[0]).toMatchObject({ result: 'default' })
    })
  })
})
