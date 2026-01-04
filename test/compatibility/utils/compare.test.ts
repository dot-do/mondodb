/**
 * Tests for comparison utilities
 */

import { describe, it, expect } from 'vitest'
import {
  compareResults,
  compareDocuments,
  compareArrays as compareArraysFn,
  assertResultsMatch,
  assertDocumentsMatch,
  assertArraysMatch,
  formatDiff,
  formatDifferences,
  numbersEqual,
  numbersEqualRelative,
  type CompareOptions,
} from './compare'
import { ObjectId } from '../../../src/types/objectid'

describe('Comparison Utilities', () => {
  // ==========================================================================
  // Basic Value Comparison
  // ==========================================================================

  describe('compareResults - primitives', () => {
    it('matches identical primitives', () => {
      expect(compareResults(42, 42).match).toBe(true)
      expect(compareResults('hello', 'hello').match).toBe(true)
      expect(compareResults(true, true).match).toBe(true)
      expect(compareResults(false, false).match).toBe(true)
    })

    it('detects primitive mismatches', () => {
      const result = compareResults(42, 43)
      expect(result.match).toBe(false)
      expect(result.differences[0].type).toBe('value_mismatch')
    })

    it('detects type mismatches', () => {
      const result = compareResults(42, '42')
      expect(result.match).toBe(false)
      expect(result.differences[0].type).toBe('type_mismatch')
    })

    it('handles null values', () => {
      expect(compareResults(null, null).match).toBe(true)
      expect(compareResults({ x: null }, { x: null }).match).toBe(true)
    })

    it('handles undefined values', () => {
      expect(compareResults(undefined, undefined).match).toBe(true)
    })

    it('detects null vs undefined mismatch', () => {
      const result = compareResults(null, undefined)
      expect(result.match).toBe(false)
    })

    it('detects null vs value mismatch', () => {
      const result1 = compareResults(null, 42)
      expect(result1.match).toBe(false)
      expect(result1.differences[0].type).toBe('value_mismatch')

      const result2 = compareResults(42, null)
      expect(result2.match).toBe(false)
      expect(result2.differences[0].type).toBe('value_mismatch')
    })
  })

  // ==========================================================================
  // Object Comparison
  // ==========================================================================

  describe('compareResults - objects', () => {
    it('matches identical objects', () => {
      const result = compareResults(
        { a: 1, b: 'two' },
        { a: 1, b: 'two' }
      )
      expect(result.match).toBe(true)
    })

    it('detects missing fields', () => {
      const result = compareResults(
        { a: 1, b: 2 },
        { a: 1 }
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].type).toBe('missing')
      expect(result.differences[0].path).toBe('b')
      expect(result.stats.missingFields).toBe(1)
    })

    it('detects extra fields', () => {
      const result = compareResults(
        { a: 1 },
        { a: 1, b: 2 }
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].type).toBe('extra')
      expect(result.stats.extraFields).toBe(1)
    })

    it('handles nested objects', () => {
      const result = compareResults(
        { user: { name: 'Alice', age: 30 } },
        { user: { name: 'Alice', age: 31 } }
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].path).toBe('user.age')
    })

    it('handles deeply nested objects', () => {
      const result = compareResults(
        { a: { b: { c: { d: { e: 1 } } } } },
        { a: { b: { c: { d: { e: 2 } } } } }
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].path).toBe('a.b.c.d.e')
    })
  })

  // ==========================================================================
  // Array Comparison
  // ==========================================================================

  describe('compareResults - arrays', () => {
    it('matches identical arrays', () => {
      const result = compareResults([1, 2, 3], [1, 2, 3])
      expect(result.match).toBe(true)
    })

    it('detects array length mismatch', () => {
      const result = compareResults([1, 2], [1, 2, 3])
      expect(result.match).toBe(false)
      expect(result.differences.some(d => d.type === 'length_mismatch')).toBe(true)
    })

    it('detects array element mismatch', () => {
      const result = compareResults([1, 2, 3], [1, 9, 3])
      expect(result.match).toBe(false)
      expect(result.differences[0].path).toBe('[1]')
    })

    it('handles nested arrays', () => {
      const result = compareResults(
        [[1, 2], [3, 4]],
        [[1, 2], [3, 5]]
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].path).toBe('[1][1]')
    })

    it('handles arrays of objects', () => {
      const result = compareResults(
        [{ a: 1 }, { b: 2 }],
        [{ a: 1 }, { b: 3 }]
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].path).toBe('[1].b')
    })
  })

  // ==========================================================================
  // Array Order Sensitivity
  // ==========================================================================

  describe('compareResults - ignoreArrayOrder', () => {
    it('matches arrays with same elements in different order', () => {
      const result = compareResults(
        [1, 2, 3],
        [3, 1, 2],
        { ignoreArrayOrder: true }
      )
      expect(result.match).toBe(true)
    })

    it('matches object arrays with same elements in different order', () => {
      const result = compareResults(
        [{ a: 1 }, { a: 2 }, { a: 3 }],
        [{ a: 3 }, { a: 1 }, { a: 2 }],
        { ignoreArrayOrder: true }
      )
      expect(result.match).toBe(true)
    })

    it('detects missing elements in unordered comparison', () => {
      const result = compareResults(
        [1, 2, 3],
        [1, 2],
        { ignoreArrayOrder: true }
      )
      expect(result.match).toBe(false)
      expect(result.differences.some(d => d.type === 'missing')).toBe(true)
    })

    it('detects extra elements in unordered comparison', () => {
      const result = compareResults(
        [1, 2],
        [1, 2, 3],
        { ignoreArrayOrder: true }
      )
      expect(result.match).toBe(false)
      expect(result.differences.some(d => d.type === 'extra')).toBe(true)
    })

    it('respects order by default', () => {
      const result = compareResults([1, 2, 3], [3, 1, 2])
      expect(result.match).toBe(false)
    })
  })

  // ==========================================================================
  // ObjectId Comparison
  // ==========================================================================

  describe('compareResults - ObjectIds', () => {
    it('normalizes ObjectIds by default', () => {
      const oid1 = new ObjectId()
      const oid2 = new ObjectId()

      const result = compareResults(
        { _id: oid1 },
        { _id: oid2 }
      )
      expect(result.match).toBe(true)
    })

    it('compares ObjectId values when normalizeObjectIds is false', () => {
      const oid1 = new ObjectId()
      const oid2 = new ObjectId()

      const result = compareResults(
        { _id: oid1 },
        { _id: oid2 },
        { normalizeObjectIds: false }
      )
      expect(result.match).toBe(false)
    })

    it('matches identical ObjectIds with normalizeObjectIds false', () => {
      const oid = new ObjectId()

      const result = compareResults(
        { _id: oid },
        { _id: oid },
        { normalizeObjectIds: false }
      )
      expect(result.match).toBe(true)
    })

    it('detects type mismatch between ObjectId and non-ObjectId', () => {
      const oid = new ObjectId()

      const result = compareResults(
        { _id: oid },
        { _id: 'not-an-objectid' }
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].type).toBe('type_mismatch')
    })
  })

  // ==========================================================================
  // Floating Point Comparison
  // ==========================================================================

  describe('compareResults - floating point', () => {
    it('handles exact floating point matches', () => {
      const result = compareResults(1.5, 1.5)
      expect(result.match).toBe(true)
    })

    it('handles floating point differences within epsilon', () => {
      const result = compareResults(
        { value: 0.1 + 0.2 },
        { value: 0.3 },
        { floatEpsilon: 1e-10 }
      )
      expect(result.match).toBe(true)
    })

    it('detects floating point differences beyond epsilon', () => {
      const result = compareResults(
        { value: 1.0 },
        { value: 1.1 },
        { floatEpsilon: 0.01 }
      )
      expect(result.match).toBe(false)
    })

    it('handles relative tolerance', () => {
      const result = compareResults(
        { value: 1000000 },
        { value: 1000001 },
        { floatEpsilon: 1e-5, useRelativeTolerance: true }
      )
      expect(result.match).toBe(true)
    })

    it('handles NaN values', () => {
      const result = compareResults(
        { value: NaN },
        { value: NaN }
      )
      expect(result.match).toBe(true)
    })

    it('detects NaN vs number mismatch', () => {
      const result = compareResults(
        { value: NaN },
        { value: 42 }
      )
      expect(result.match).toBe(false)
    })

    it('handles Infinity values', () => {
      expect(compareResults(Infinity, Infinity).match).toBe(true)
      expect(compareResults(-Infinity, -Infinity).match).toBe(true)
      expect(compareResults(Infinity, -Infinity).match).toBe(false)
      expect(compareResults(Infinity, 999999).match).toBe(false)
    })
  })

  // ==========================================================================
  // Field Ignoring
  // ==========================================================================

  describe('compareResults - ignoreFields', () => {
    it('ignores specified top-level fields', () => {
      const result = compareResults(
        { a: 1, b: 2, timestamp: Date.now() },
        { a: 1, b: 2, timestamp: Date.now() + 1000 },
        { ignoreFields: ['timestamp'] }
      )
      expect(result.match).toBe(true)
    })

    it('ignores nested fields by path', () => {
      const result = compareResults(
        { user: { name: 'Alice', createdAt: 1 } },
        { user: { name: 'Alice', createdAt: 2 } },
        { ignoreFields: ['user.createdAt'] }
      )
      expect(result.match).toBe(true)
    })

    it('ignores fields by name anywhere in document', () => {
      const result = compareResults(
        { a: { _id: 1 }, b: { _id: 2 } },
        { a: { _id: 3 }, b: { _id: 4 } },
        { ignoreFields: ['_id'] }
      )
      expect(result.match).toBe(true)
    })

    it('supports wildcard patterns', () => {
      const result = compareResults(
        { user: { settings: { theme: 'dark' } } },
        { user: { settings: { theme: 'light' } } },
        { ignoreFields: ['user.settings.*'] }
      )
      expect(result.match).toBe(true)
    })

    it('ignores multiple fields', () => {
      const result = compareResults(
        { a: 1, b: 2, c: 3 },
        { a: 1, b: 99, c: 999 },
        { ignoreFields: ['b', 'c'] }
      )
      expect(result.match).toBe(true)
    })
  })

  // ==========================================================================
  // Date Comparison
  // ==========================================================================

  describe('compareResults - Dates', () => {
    it('matches identical Dates', () => {
      const date = new Date('2024-01-01')
      const result = compareResults(
        { created: date },
        { created: new Date(date.getTime()) }
      )
      expect(result.match).toBe(true)
    })

    it('detects Date value mismatch', () => {
      const result = compareResults(
        { created: new Date('2024-01-01') },
        { created: new Date('2024-01-02') }
      )
      expect(result.match).toBe(false)
    })

    it('detects Date vs non-Date mismatch', () => {
      const result = compareResults(
        { created: new Date() },
        { created: '2024-01-01' }
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].type).toBe('type_mismatch')
    })
  })

  // ==========================================================================
  // RegExp Comparison
  // ==========================================================================

  describe('compareResults - RegExps', () => {
    it('matches identical RegExps', () => {
      const result = compareResults(/test/gi, /test/gi)
      expect(result.match).toBe(true)
    })

    it('detects RegExp source mismatch', () => {
      const result = compareResults(/test/, /other/)
      expect(result.match).toBe(false)
    })

    it('detects RegExp flags mismatch', () => {
      const result = compareResults(/test/i, /test/g)
      expect(result.match).toBe(false)
    })
  })

  // ==========================================================================
  // Convenience Functions
  // ==========================================================================

  describe('compareDocuments', () => {
    it('ignores _id by default', () => {
      const result = compareDocuments(
        { _id: new ObjectId(), name: 'Alice' },
        { _id: new ObjectId(), name: 'Alice' }
      )
      expect(result.match).toBe(true)
    })

    it('can ignore additional fields', () => {
      const result = compareDocuments(
        { _id: new ObjectId(), name: 'Alice', version: 1 },
        { _id: new ObjectId(), name: 'Alice', version: 2 },
        { ignoreFields: ['version'] }
      )
      expect(result.match).toBe(true)
    })
  })

  describe('compareArrays', () => {
    it('compares ordered by default', () => {
      const result = compareArraysFn([1, 2, 3], [3, 2, 1])
      expect(result.match).toBe(false)
    })

    it('can compare unordered', () => {
      const result = compareArraysFn([1, 2, 3], [3, 2, 1], { ordered: false })
      expect(result.match).toBe(true)
    })
  })

  // ==========================================================================
  // Assertion Helpers
  // ==========================================================================

  describe('assertResultsMatch', () => {
    it('does not throw for matching results', () => {
      expect(() => assertResultsMatch({ x: 1 }, { x: 1 })).not.toThrow()
    })

    it('throws for mismatched results', () => {
      expect(() => assertResultsMatch({ x: 1 }, { x: 2 })).toThrow()
    })

    it('throws with descriptive message', () => {
      try {
        assertResultsMatch({ x: 1, y: 2 }, { x: 1, y: 3 })
        expect.fail('Should have thrown')
      } catch (error) {
        const message = (error as Error).message
        expect(message).toContain('y')
        expect(message).toContain('VALUE MISMATCH')
      }
    })
  })

  describe('assertDocumentsMatch', () => {
    it('ignores _id differences', () => {
      expect(() =>
        assertDocumentsMatch(
          { _id: new ObjectId(), name: 'Test' },
          { _id: new ObjectId(), name: 'Test' }
        )
      ).not.toThrow()
    })
  })

  describe('assertArraysMatch', () => {
    it('throws for ordered mismatch', () => {
      expect(() => assertArraysMatch([1, 2], [2, 1])).toThrow()
    })

    it('passes for unordered match', () => {
      expect(() => assertArraysMatch([1, 2], [2, 1], { ordered: false })).not.toThrow()
    })
  })

  // ==========================================================================
  // Number Helpers
  // ==========================================================================

  describe('numbersEqual', () => {
    it('compares with absolute tolerance', () => {
      expect(numbersEqual(1.0, 1.0)).toBe(true)
      expect(numbersEqual(1.0, 1.0 + 1e-11)).toBe(true)
      expect(numbersEqual(1.0, 1.1)).toBe(false)
      expect(numbersEqual(1.0, 1.001, 0.01)).toBe(true)
    })

    it('handles NaN', () => {
      expect(numbersEqual(NaN, NaN)).toBe(true)
      expect(numbersEqual(NaN, 0)).toBe(false)
    })

    it('handles Infinity', () => {
      expect(numbersEqual(Infinity, Infinity)).toBe(true)
      expect(numbersEqual(-Infinity, -Infinity)).toBe(true)
      expect(numbersEqual(Infinity, 999999)).toBe(false)
    })
  })

  describe('numbersEqualRelative', () => {
    it('compares with relative tolerance', () => {
      expect(numbersEqualRelative(1000, 1001, 0.01)).toBe(true)
      expect(numbersEqualRelative(1000, 1100, 0.01)).toBe(false)
    })

    it('handles zero', () => {
      expect(numbersEqualRelative(0, 0)).toBe(true)
      expect(numbersEqualRelative(0, 0.0001)).toBe(false)
    })
  })

  // ==========================================================================
  // Diff Formatting
  // ==========================================================================

  describe('formatDiff', () => {
    it('returns success message for matching results', () => {
      const result = compareResults({ a: 1 }, { a: 1 })
      expect(formatDiff(result)).toBe('Results match')
    })

    it('formats differences without colors', () => {
      const result = compareResults({ a: 1, b: 2 }, { a: 1, b: 3 })
      const diff = formatDiff(result, { colors: false })
      expect(diff).toContain('Results do not match')
      expect(diff).toContain('b')
      expect(diff).toContain('VALUE MISMATCH')
    })

    it('includes statistics', () => {
      const result = compareResults({ a: 1, b: 2, c: 3 }, { a: 9, d: 4 })
      const diff = formatDiff(result)
      expect(diff).toContain('Statistics')
      expect(diff).toContain('Missing fields')
    })

    it('respects maxDiffs option', () => {
      const expected = { a: 1, b: 2, c: 3, d: 4, e: 5 }
      const actual = { a: 9, b: 9, c: 9, d: 9, e: 9 }
      const result = compareResults(expected, actual)
      const diff = formatDiff(result, { maxDiffs: 2 })
      expect(diff).toContain('2 of 5')
      expect(diff).toContain('3 more differences')
    })
  })

  describe('formatDifferences', () => {
    it('returns "No differences" for empty list', () => {
      expect(formatDifferences([])).toBe('No differences')
    })

    it('formats multiple differences as numbered list', () => {
      const result = compareResults({ a: 1, b: 2 }, { a: 9, c: 3 })
      const formatted = formatDifferences(result.differences)
      expect(formatted).toContain('1.')
      expect(formatted).toContain('2.')
    })
  })

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('handles empty objects', () => {
      expect(compareResults({}, {}).match).toBe(true)
    })

    it('handles empty arrays', () => {
      expect(compareResults([], []).match).toBe(true)
    })

    it('handles array vs object mismatch', () => {
      const result = compareResults([], {})
      expect(result.match).toBe(false)
    })

    it('handles complex nested structures', () => {
      const doc = {
        users: [
          { name: 'Alice', scores: [95, 87, 92] },
          { name: 'Bob', scores: [88, 91, 85] },
        ],
        metadata: {
          version: 1,
          created: new Date('2024-01-01'),
        },
      }

      const result = compareResults(doc, JSON.parse(JSON.stringify(doc)))
      // Date won't match after JSON parse (becomes string)
      expect(result.match).toBe(false)
      expect(result.differences[0].path).toBe('metadata.created')
    })

    it('respects maxDepth option', () => {
      const createDeep = (depth: number): any =>
        depth === 0 ? 'end' : { nested: createDeep(depth - 1) }

      const result = compareResults(
        createDeep(200),
        createDeep(200),
        { maxDepth: 10 }
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].message).toContain('Max comparison depth')
    })
  })
})
