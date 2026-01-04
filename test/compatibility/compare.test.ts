import { describe, it, expect } from 'vitest'
import { compareResults, formatDifferences, assertResultsMatch } from './compare'
import { ObjectId } from '../../src/types/objectid'

describe('Comparison Utilities', () => {
  describe('compareResults', () => {
    it('matches identical primitives', () => {
      expect(compareResults(42, 42).match).toBe(true)
      expect(compareResults('hello', 'hello').match).toBe(true)
      expect(compareResults(true, true).match).toBe(true)
    })

    it('detects primitive mismatches', () => {
      const result = compareResults(42, 43)
      expect(result.match).toBe(false)
      expect(result.differences[0].type).toBe('value_mismatch')
    })

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
    })

    it('detects extra fields', () => {
      const result = compareResults(
        { a: 1 },
        { a: 1, b: 2 }
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].type).toBe('extra')
    })

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

    it('matches identical arrays', () => {
      const result = compareResults([1, 2, 3], [1, 2, 3])
      expect(result.match).toBe(true)
    })

    it('detects array length mismatch', () => {
      const result = compareResults([1, 2], [1, 2, 3])
      expect(result.match).toBe(false)
    })

    it('detects array element mismatch', () => {
      const result = compareResults([1, 2, 3], [1, 9, 3])
      expect(result.match).toBe(false)
      expect(result.differences[0].path).toBe('[1]')
    })

    it('handles nested objects', () => {
      const result = compareResults(
        { user: { name: 'Alice', age: 30 } },
        { user: { name: 'Alice', age: 31 } }
      )
      expect(result.match).toBe(false)
      expect(result.differences[0].path).toBe('user.age')
    })

    it('ignores specified fields', () => {
      const result = compareResults(
        { a: 1, b: 2 },
        { a: 1, b: 999 },
        { ignoreFields: ['b'] }
      )
      expect(result.match).toBe(true)
    })

    it('handles null values', () => {
      expect(compareResults(null, null).match).toBe(true)
      expect(compareResults({ x: null }, { x: null }).match).toBe(true)
      expect(compareResults(null, undefined).match).toBe(false)
    })
  })

  describe('formatDifferences', () => {
    it('formats empty differences', () => {
      expect(formatDifferences([])).toBe('No differences')
    })

    it('formats multiple differences', () => {
      const result = compareResults({ a: 1, b: 2 }, { a: 9, c: 3 })
      const formatted = formatDifferences(result.differences)
      expect(formatted).toContain('1.')
      expect(formatted).toContain('2.')
    })
  })

  describe('assertResultsMatch', () => {
    it('does not throw for matching results', () => {
      expect(() => assertResultsMatch({ x: 1 }, { x: 1 })).not.toThrow()
    })

    it('throws for mismatched results', () => {
      expect(() => assertResultsMatch({ x: 1 }, { x: 2 })).toThrow()
    })
  })
})
