import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useQueryStore } from './query'

// Reset store between tests
beforeEach(() => {
  const { result } = renderHook(() => useQueryStore())
  act(() => {
    result.current.clearHistory()
    result.current.setCurrentFilter('{}')
    result.current.setCurrentProjection('')
    result.current.setCurrentSort('')
    result.current.setCurrentLimit(20)
    result.current.setExecutionResult(null)
    result.current.setExecutionError(null)
  })
})

describe('useQueryStore', () => {
  describe('query state', () => {
    it('initializes with default values', () => {
      const { result } = renderHook(() => useQueryStore())

      expect(result.current.currentFilter).toBe('{}')
      expect(result.current.currentProjection).toBe('')
      expect(result.current.currentSort).toBe('')
      expect(result.current.currentLimit).toBe(20)
      expect(result.current.isValid).toBe(true)
      expect(result.current.validationErrors).toHaveLength(0)
    })

    it('updates currentFilter and validates', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setCurrentFilter('{ "name": "test" }')
      })

      expect(result.current.currentFilter).toBe('{ "name": "test" }')
      expect(result.current.isValid).toBe(true)
      expect(result.current.validationErrors).toHaveLength(0)
    })

    it('detects invalid JSON in filter', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setCurrentFilter('{ invalid json }')
      })

      expect(result.current.isValid).toBe(false)
      expect(result.current.validationErrors.length).toBeGreaterThan(0)
    })

    it('updates currentProjection', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setCurrentProjection('{ "name": 1, "_id": 0 }')
      })

      expect(result.current.currentProjection).toBe('{ "name": 1, "_id": 0 }')
      expect(result.current.isValid).toBe(true)
    })

    it('updates currentSort', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setCurrentSort('{ "createdAt": -1 }')
      })

      expect(result.current.currentSort).toBe('{ "createdAt": -1 }')
      expect(result.current.isValid).toBe(true)
    })

    it('clamps currentLimit between 1 and 1000', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setCurrentLimit(0)
      })
      expect(result.current.currentLimit).toBe(1)

      act(() => {
        result.current.setCurrentLimit(2000)
      })
      expect(result.current.currentLimit).toBe(1000)

      act(() => {
        result.current.setCurrentLimit(50)
      })
      expect(result.current.currentLimit).toBe(50)
    })
  })

  describe('validation', () => {
    it('validateQuery returns errors for invalid JSON', () => {
      const { result } = renderHook(() => useQueryStore())

      const errors = result.current.validateQuery('{ invalid }')

      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]?.message).toBeDefined()
    })

    it('validateQuery returns empty array for valid JSON', () => {
      const { result } = renderHook(() => useQueryStore())

      const errors = result.current.validateQuery('{ "name": "test" }')

      expect(errors).toHaveLength(0)
    })

    it('validateQuery returns empty array for empty string', () => {
      const { result } = renderHook(() => useQueryStore())

      const errors = result.current.validateQuery('')

      expect(errors).toHaveLength(0)
    })

    it('provides line and column information for parse errors', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setCurrentFilter('{\n  "name": test\n}')
      })

      expect(result.current.validationErrors.length).toBeGreaterThan(0)
      // Line and column should be provided
      const error = result.current.validationErrors[0]
      expect(error?.line).toBeDefined()
    })

    it('clearValidationErrors resets validation state', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setCurrentFilter('{ invalid }')
      })

      expect(result.current.validationErrors.length).toBeGreaterThan(0)

      act(() => {
        result.current.clearValidationErrors()
      })

      expect(result.current.validationErrors).toHaveLength(0)
      expect(result.current.isValid).toBe(true)
    })

    it('isValid reflects validity across all tabs, not just the active one', () => {
      const { result } = renderHook(() => useQueryStore())

      // Set valid filter
      act(() => {
        result.current.setCurrentFilter('{ "name": "test" }')
      })
      expect(result.current.isValid).toBe(true)

      // Set INVALID projection
      act(() => {
        result.current.setCurrentProjection('{ invalid json }')
      })
      expect(result.current.isValid).toBe(false)

      // Now set a valid filter again - isValid should STILL be false
      // because projection is invalid
      act(() => {
        result.current.setCurrentFilter('{ "status": "active" }')
      })
      // BUG: This currently returns true because only filter was validated
      expect(result.current.isValid).toBe(false)
    })

    it('tracks validation errors per field', () => {
      const { result } = renderHook(() => useQueryStore())

      // Set invalid filter
      act(() => {
        result.current.setCurrentFilter('{ invalid filter }')
      })

      // Set invalid projection
      act(() => {
        result.current.setCurrentProjection('{ invalid projection }')
      })

      // Set valid sort
      act(() => {
        result.current.setCurrentSort('{ "createdAt": -1 }')
      })

      // isValid should be false because filter and projection are invalid
      expect(result.current.isValid).toBe(false)

      // Should have errors for filter and projection
      expect(result.current.filterErrors?.length).toBeGreaterThan(0)
      expect(result.current.projectionErrors?.length).toBeGreaterThan(0)
      expect(result.current.sortErrors).toHaveLength(0)
    })

    it('becomes valid when all fields are fixed', () => {
      const { result } = renderHook(() => useQueryStore())

      // Set invalid values for all fields
      act(() => {
        result.current.setCurrentFilter('{ bad }')
      })
      act(() => {
        result.current.setCurrentProjection('{ bad }')
      })
      act(() => {
        result.current.setCurrentSort('{ bad }')
      })

      expect(result.current.isValid).toBe(false)

      // Fix filter
      act(() => {
        result.current.setCurrentFilter('{}')
      })
      expect(result.current.isValid).toBe(false) // still invalid

      // Fix projection
      act(() => {
        result.current.setCurrentProjection('')
      })
      expect(result.current.isValid).toBe(false) // still invalid

      // Fix sort
      act(() => {
        result.current.setCurrentSort('')
      })
      expect(result.current.isValid).toBe(true) // now all valid
    })
  })

  describe('execution state', () => {
    it('setExecuting updates isExecuting and clears error', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setExecutionError('Some error')
      })
      expect(result.current.lastError).toBe('Some error')

      act(() => {
        result.current.setExecuting(true)
      })

      expect(result.current.isExecuting).toBe(true)
      expect(result.current.lastError).toBeNull()
    })

    it('setExecutionResult updates time and count', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setExecutionResult({ time: 150, count: 42 })
      })

      expect(result.current.lastExecutionTime).toBe(150)
      expect(result.current.lastResultCount).toBe(42)
      expect(result.current.lastError).toBeNull()
    })

    it('setExecutionResult with null clears results', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setExecutionResult({ time: 100, count: 10 })
      })

      act(() => {
        result.current.setExecutionResult(null)
      })

      expect(result.current.lastExecutionTime).toBeNull()
      expect(result.current.lastResultCount).toBeNull()
    })

    it('setExecutionError updates error and stops executing', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.setExecuting(true)
      })

      act(() => {
        result.current.setExecutionError('Query failed')
      })

      expect(result.current.lastError).toBe('Query failed')
      expect(result.current.isExecuting).toBe(false)
    })
  })

  describe('history', () => {
    it('addToHistory adds new entry', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.addToHistory({
          query: '{ "status": "active" }',
          database: 'testdb',
          collection: 'users',
          executionTime: 50,
          resultCount: 10,
        })
      })

      expect(result.current.history).toHaveLength(1)
      expect(result.current.history[0]?.query).toBe('{ "status": "active" }')
      expect(result.current.history[0]?.database).toBe('testdb')
      expect(result.current.history[0]?.collection).toBe('users')
      expect(result.current.history[0]?.executionTime).toBe(50)
      expect(result.current.history[0]?.resultCount).toBe(10)
      expect(result.current.history[0]?.isFavorite).toBe(false)
      expect(result.current.history[0]?.id).toBeDefined()
      expect(result.current.history[0]?.timestamp).toBeDefined()
    })

    it('addToHistory puts new entries at the beginning', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.addToHistory({
          query: '{ "first": 1 }',
          database: 'db1',
          collection: 'col1',
        })
      })

      act(() => {
        result.current.addToHistory({
          query: '{ "second": 2 }',
          database: 'db2',
          collection: 'col2',
        })
      })

      expect(result.current.history).toHaveLength(2)
      expect(result.current.history[0]?.query).toBe('{ "second": 2 }')
      expect(result.current.history[1]?.query).toBe('{ "first": 1 }')
    })

    it('addToHistory removes duplicate queries for same db/collection', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.addToHistory({
          query: '{ "same": 1 }',
          database: 'db',
          collection: 'col',
          resultCount: 5,
        })
      })

      act(() => {
        result.current.addToHistory({
          query: '{ "same": 1 }',
          database: 'db',
          collection: 'col',
          resultCount: 10,
        })
      })

      expect(result.current.history).toHaveLength(1)
      expect(result.current.history[0]?.resultCount).toBe(10) // Latest one kept
    })

    it('addToHistory includes error for failed queries', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.addToHistory({
          query: '{ "bad": 1 }',
          database: 'db',
          collection: 'col',
          error: 'Invalid field',
        })
      })

      expect(result.current.history[0]?.error).toBe('Invalid field')
    })

    it('removeFromHistory removes entry by id', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.addToHistory({
          query: '{ "test": 1 }',
          database: 'db',
          collection: 'col',
        })
      })

      const id = result.current.history[0]?.id
      expect(id).toBeDefined()

      act(() => {
        result.current.removeFromHistory(id!)
      })

      expect(result.current.history).toHaveLength(0)
    })

    it('toggleFavorite toggles isFavorite flag', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.addToHistory({
          query: '{ "test": 1 }',
          database: 'db',
          collection: 'col',
        })
      })

      const id = result.current.history[0]?.id
      expect(result.current.history[0]?.isFavorite).toBe(false)

      act(() => {
        result.current.toggleFavorite(id!)
      })

      expect(result.current.history[0]?.isFavorite).toBe(true)

      act(() => {
        result.current.toggleFavorite(id!)
      })

      expect(result.current.history[0]?.isFavorite).toBe(false)
    })

    it('clearHistory removes non-favorites', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.addToHistory({
          query: '{ "regular": 1 }',
          database: 'db',
          collection: 'col',
        })
      })

      act(() => {
        result.current.addToHistory({
          query: '{ "favorite": 1 }',
          database: 'db',
          collection: 'col2',
        })
      })

      const favoriteId = result.current.history[0]?.id

      act(() => {
        result.current.toggleFavorite(favoriteId!)
      })

      act(() => {
        result.current.clearHistory()
      })

      expect(result.current.history).toHaveLength(1)
      expect(result.current.history[0]?.query).toBe('{ "favorite": 1 }')
    })

    it('loadFromHistory sets current query from history entry', () => {
      const { result } = renderHook(() => useQueryStore())

      act(() => {
        result.current.addToHistory({
          query: '{ "loaded": true }',
          database: 'db',
          collection: 'col',
        })
      })

      const id = result.current.history[0]?.id

      act(() => {
        result.current.loadFromHistory(id!)
      })

      expect(result.current.currentQuery).toBe('{ "loaded": true }')
      expect(result.current.currentFilter).toBe('{ "loaded": true }')
      expect(result.current.isValid).toBe(true)
    })

    it('loadFromHistory with invalid id does nothing', () => {
      const { result } = renderHook(() => useQueryStore())

      const initialFilter = result.current.currentFilter

      act(() => {
        result.current.loadFromHistory('non-existent-id')
      })

      expect(result.current.currentFilter).toBe(initialFilter)
    })

    it('respects maxHistorySize', () => {
      const { result } = renderHook(() => useQueryStore())

      // Add more than maxHistorySize entries
      act(() => {
        for (let i = 0; i < 110; i++) {
          result.current.addToHistory({
            query: `{ "num": ${i} }`,
            database: 'db',
            collection: `col${i}`, // Different collections to avoid dedup
          })
        }
      })

      expect(result.current.history.length).toBeLessThanOrEqual(
        result.current.maxHistorySize
      )
    })
  })
})
