import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpFindCursor, HttpAggregationCursor } from '../../src/client/http-cursor'

/**
 * Test data factory
 */
function createTestDocuments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    _id: `id-${i}`,
    name: `Document ${i}`,
    value: i,
    category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
  }))
}

describe('HttpFindCursor', () => {
  describe('toArray()', () => {
    it('returns all documents as an array', async () => {
      const docs = createTestDocuments(5)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      const result = await cursor.toArray()

      expect(result).toEqual(docs)
      expect(result).toHaveLength(5)
    })

    it('returns empty array when no documents', async () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const cursor = new HttpFindCursor(requestFn, {})

      const result = await cursor.toArray()

      expect(result).toEqual([])
      expect(result).toHaveLength(0)
    })

    it('can only be called once (exhausts cursor)', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      await cursor.toArray()
      const secondCall = await cursor.toArray()

      expect(secondCall).toEqual([])
    })

    it('makes HTTP request only once', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      await cursor.toArray()

      expect(requestFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('next()', () => {
    it('returns next document in sequence', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      const first = await cursor.next()
      const second = await cursor.next()
      const third = await cursor.next()

      expect(first).toEqual(docs[0])
      expect(second).toEqual(docs[1])
      expect(third).toEqual(docs[2])
    })

    it('returns null when exhausted', async () => {
      const docs = createTestDocuments(2)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      await cursor.next()
      await cursor.next()
      const result = await cursor.next()

      expect(result).toBeNull()
    })

    it('returns null for empty cursor', async () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const cursor = new HttpFindCursor(requestFn, {})

      const result = await cursor.next()

      expect(result).toBeNull()
    })
  })

  describe('hasNext()', () => {
    it('returns true when more documents exist', async () => {
      const docs = createTestDocuments(2)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      const hasNext = await cursor.hasNext()

      expect(hasNext).toBe(true)
    })

    it('returns false when cursor is exhausted', async () => {
      const docs = createTestDocuments(1)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      await cursor.next()
      const hasNext = await cursor.hasNext()

      expect(hasNext).toBe(false)
    })

    it('returns false for empty cursor', async () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const cursor = new HttpFindCursor(requestFn, {})

      const hasNext = await cursor.hasNext()

      expect(hasNext).toBe(false)
    })

    it('does not consume documents', async () => {
      const docs = createTestDocuments(2)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      await cursor.hasNext()
      await cursor.hasNext()
      await cursor.hasNext()
      const doc = await cursor.next()

      expect(doc).toEqual(docs[0])
    })
  })

  describe('forEach(callback)', () => {
    it('iterates over all documents', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})
      const visited: unknown[] = []

      await cursor.forEach((doc) => {
        visited.push(doc)
      })

      expect(visited).toEqual(docs)
    })

    it('passes index as second argument', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})
      const indices: number[] = []

      await cursor.forEach((_, index) => {
        indices.push(index)
      })

      expect(indices).toEqual([0, 1, 2])
    })

    it('handles async callbacks', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})
      const visited: unknown[] = []

      await cursor.forEach(async (doc) => {
        await Promise.resolve()
        visited.push(doc)
      })

      expect(visited).toEqual(docs)
    })

    it('does nothing for empty cursor', async () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const cursor = new HttpFindCursor(requestFn, {})
      const callback = vi.fn()

      await cursor.forEach(callback)

      expect(callback).not.toHaveBeenCalled()
    })

    it('stops iteration when callback returns false', async () => {
      const docs = createTestDocuments(5)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})
      const visited: unknown[] = []

      await cursor.forEach((doc, index) => {
        visited.push(doc)
        if (index >= 2) return false
      })

      expect(visited).toHaveLength(3)
    })
  })

  describe('map(fn)', () => {
    it('transforms all documents', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      const result = await cursor.map((doc) => doc.name).toArray()

      expect(result).toEqual(['Document 0', 'Document 1', 'Document 2'])
    })

    it('passes index as second argument', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      const result = await cursor.map((_, index) => index * 2).toArray()

      expect(result).toEqual([0, 2, 4])
    })
  })

  describe('close()', () => {
    it('releases resources and marks cursor as closed', async () => {
      const docs = createTestDocuments(5)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      await cursor.next()
      await cursor.close()

      expect(cursor.closed).toBe(true)
    })

    it('prevents further iteration after close', async () => {
      const docs = createTestDocuments(5)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      await cursor.close()
      const result = await cursor.next()

      expect(result).toBeNull()
    })

    it('toArray returns empty after close', async () => {
      const docs = createTestDocuments(5)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      await cursor.close()
      const result = await cursor.toArray()

      expect(result).toEqual([])
    })

    it('can be called multiple times safely', async () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const cursor = new HttpFindCursor(requestFn, {})

      await cursor.close()
      await cursor.close()
      await cursor.close()

      expect(cursor.closed).toBe(true)
    })
  })

  describe('Symbol.asyncIterator', () => {
    it('supports for-await-of iteration', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})
      const visited: unknown[] = []

      for await (const doc of cursor) {
        visited.push(doc)
      }

      expect(visited).toEqual(docs)
    })

    it('handles break in for-await-of', async () => {
      const docs = createTestDocuments(5)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})
      const visited: unknown[] = []

      for await (const doc of cursor) {
        visited.push(doc)
        if (visited.length >= 2) break
      }

      expect(visited).toHaveLength(2)
    })

    it('closes cursor after iteration completes', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpFindCursor(requestFn, {})

      for await (const _ of cursor) {
        // iterate through all
      }

      expect(cursor.closed).toBe(true)
    })
  })

  describe('cursor modifiers', () => {
    describe('limit()', () => {
      it('passes limit to request options', async () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        await cursor.limit(3).toArray()

        expect(requestFn).toHaveBeenCalledWith('POST', '/find', {
          filter: {},
          options: { limit: 3 }
        })
      })

      it('throws for negative limit', () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        expect(() => cursor.limit(-1)).toThrow()
      })

      it('returns same cursor for chaining', () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        const result = cursor.limit(5)

        expect(result).toBe(cursor)
      })
    })

    describe('skip()', () => {
      it('passes skip to request options', async () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        await cursor.skip(5).toArray()

        expect(requestFn).toHaveBeenCalledWith('POST', '/find', {
          filter: {},
          options: { skip: 5 }
        })
      })

      it('throws for negative skip', () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        expect(() => cursor.skip(-1)).toThrow()
      })

      it('returns same cursor for chaining', () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        const result = cursor.skip(5)

        expect(result).toBe(cursor)
      })
    })

    describe('sort()', () => {
      it('passes sort to request options', async () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        await cursor.sort({ value: -1 }).toArray()

        expect(requestFn).toHaveBeenCalledWith('POST', '/find', {
          filter: {},
          options: { sort: { value: -1 } }
        })
      })

      it('returns same cursor for chaining', () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        const result = cursor.sort({ value: 1 })

        expect(result).toBe(cursor)
      })
    })

    describe('project()', () => {
      it('passes projection to request options', async () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        await cursor.project({ name: 1, value: 1 }).toArray()

        expect(requestFn).toHaveBeenCalledWith('POST', '/find', {
          filter: {},
          options: { projection: { name: 1, value: 1 } }
        })
      })

      it('returns same cursor for chaining', () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        const result = cursor.project({ name: 1 })

        expect(result).toBe(cursor)
      })
    })

    describe('chaining modifiers', () => {
      it('supports full modifier chain', async () => {
        const requestFn = vi.fn().mockResolvedValue([])
        const cursor = new HttpFindCursor(requestFn, {})

        await cursor
          .sort({ value: -1 })
          .skip(1)
          .limit(3)
          .project({ value: 1, _id: 0 })
          .toArray()

        expect(requestFn).toHaveBeenCalledWith('POST', '/find', {
          filter: {},
          options: {
            sort: { value: -1 },
            skip: 1,
            limit: 3,
            projection: { value: 1, _id: 0 }
          }
        })
      })
    })
  })

  describe('lazy evaluation', () => {
    it('fetches data lazily on first access', async () => {
      const fetchFn = vi.fn().mockResolvedValue(createTestDocuments(3))
      const cursor = new HttpFindCursor(fetchFn, {})

      // No fetch yet
      expect(fetchFn).not.toHaveBeenCalled()

      // First access triggers fetch
      await cursor.next()
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('does not re-fetch on subsequent iterations', async () => {
      const fetchFn = vi.fn().mockResolvedValue(createTestDocuments(3))
      const cursor = new HttpFindCursor(fetchFn, {})

      await cursor.next()
      await cursor.next()
      await cursor.next()

      expect(fetchFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('propagates fetch errors', async () => {
      const requestFn = vi.fn().mockRejectedValue(new Error('Database error'))
      const cursor = new HttpFindCursor(requestFn, {})

      await expect(cursor.toArray()).rejects.toThrow('Database error')
    })

    it('closes cursor on error', async () => {
      const requestFn = vi.fn().mockRejectedValue(new Error('Database error'))
      const cursor = new HttpFindCursor(requestFn, {})

      try {
        await cursor.toArray()
      } catch {
        // ignore
      }

      expect(cursor.closed).toBe(true)
    })
  })

  describe('clone()', () => {
    it('creates a new cursor with same options', async () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const cursor = new HttpFindCursor(requestFn, { status: 'active' })
        .sort({ name: 1 })
        .limit(10)
        .skip(5)

      const cloned = cursor.clone()

      // Clone should be a different instance
      expect(cloned).not.toBe(cursor)

      // When fetched, should use same options
      await cloned.toArray()

      expect(requestFn).toHaveBeenCalledWith('POST', '/find', {
        filter: { status: 'active' },
        options: {
          sort: { name: 1 },
          limit: 10,
          skip: 5
        }
      })
    })
  })
})

describe('HttpAggregationCursor', () => {
  describe('toArray()', () => {
    it('returns all documents as an array', async () => {
      const docs = createTestDocuments(5)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [{ $match: {} }])

      const result = await cursor.toArray()

      expect(result).toEqual(docs)
      expect(result).toHaveLength(5)
    })

    it('makes HTTP request with pipeline and options', async () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const pipeline = [
        { $match: { status: 'active' } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]
      const options = { allowDiskUse: true }
      const cursor = new HttpAggregationCursor(requestFn, pipeline, options)

      await cursor.toArray()

      expect(requestFn).toHaveBeenCalledWith('POST', '/aggregate', {
        pipeline,
        options
      })
    })

    it('returns empty array when no documents', async () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const cursor = new HttpAggregationCursor(requestFn, [])

      const result = await cursor.toArray()

      expect(result).toEqual([])
    })
  })

  describe('next()', () => {
    it('returns next document in sequence', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [])

      const first = await cursor.next()
      const second = await cursor.next()
      const third = await cursor.next()

      expect(first).toEqual(docs[0])
      expect(second).toEqual(docs[1])
      expect(third).toEqual(docs[2])
    })

    it('returns null when exhausted', async () => {
      const docs = createTestDocuments(2)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [])

      await cursor.next()
      await cursor.next()
      const result = await cursor.next()

      expect(result).toBeNull()
    })
  })

  describe('hasNext()', () => {
    it('returns true when more documents exist', async () => {
      const docs = createTestDocuments(2)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [])

      const hasNext = await cursor.hasNext()

      expect(hasNext).toBe(true)
    })

    it('returns false when cursor is exhausted', async () => {
      const docs = createTestDocuments(1)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [])

      await cursor.next()
      const hasNext = await cursor.hasNext()

      expect(hasNext).toBe(false)
    })
  })

  describe('forEach(callback)', () => {
    it('iterates over all documents', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [])
      const visited: unknown[] = []

      await cursor.forEach((doc) => {
        visited.push(doc)
      })

      expect(visited).toEqual(docs)
    })

    it('stops iteration when callback returns false', async () => {
      const docs = createTestDocuments(5)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [])
      const visited: unknown[] = []

      await cursor.forEach((doc, index) => {
        visited.push(doc)
        if (index >= 2) return false
      })

      expect(visited).toHaveLength(3)
    })
  })

  describe('map(fn)', () => {
    it('transforms all documents', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [])

      const result = await cursor.map((doc) => doc.name).toArray()

      expect(result).toEqual(['Document 0', 'Document 1', 'Document 2'])
    })
  })

  describe('Symbol.asyncIterator', () => {
    it('supports for-await-of iteration', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [])
      const visited: unknown[] = []

      for await (const doc of cursor) {
        visited.push(doc)
      }

      expect(visited).toEqual(docs)
    })

    it('closes cursor after iteration completes', async () => {
      const docs = createTestDocuments(3)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [])

      for await (const _ of cursor) {
        // iterate through all
      }

      expect(cursor.closed).toBe(true)
    })
  })

  describe('close()', () => {
    it('marks cursor as closed', async () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const cursor = new HttpAggregationCursor(requestFn, [])

      await cursor.close()

      expect(cursor.closed).toBe(true)
    })

    it('prevents further iteration after close', async () => {
      const docs = createTestDocuments(5)
      const requestFn = vi.fn().mockResolvedValue(docs)
      const cursor = new HttpAggregationCursor(requestFn, [])

      await cursor.close()
      const result = await cursor.next()

      expect(result).toBeNull()
    })
  })

  describe('clone()', () => {
    it('creates a new cursor with same pipeline and options', async () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const pipeline = [{ $match: { status: 'active' } }]
      const options = { allowDiskUse: true }
      const cursor = new HttpAggregationCursor(requestFn, pipeline, options)

      const cloned = cursor.clone()

      expect(cloned).not.toBe(cursor)

      await cloned.toArray()

      expect(requestFn).toHaveBeenCalledWith('POST', '/aggregate', {
        pipeline,
        options
      })
    })
  })

  describe('explain()', () => {
    it('returns pipeline and options', () => {
      const requestFn = vi.fn().mockResolvedValue([])
      const pipeline = [
        { $match: { status: 'active' } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]
      const options = { allowDiskUse: true }
      const cursor = new HttpAggregationCursor(requestFn, pipeline, options)

      const explanation = cursor.explain()

      expect(explanation.pipeline).toEqual(pipeline)
      expect(explanation.options).toEqual(options)
    })
  })

  describe('error handling', () => {
    it('propagates fetch errors', async () => {
      const requestFn = vi.fn().mockRejectedValue(new Error('Aggregation error'))
      const cursor = new HttpAggregationCursor(requestFn, [])

      await expect(cursor.toArray()).rejects.toThrow('Aggregation error')
    })

    it('closes cursor on error', async () => {
      const requestFn = vi.fn().mockRejectedValue(new Error('Aggregation error'))
      const cursor = new HttpAggregationCursor(requestFn, [])

      try {
        await cursor.toArray()
      } catch {
        // ignore
      }

      expect(cursor.closed).toBe(true)
    })
  })
})
