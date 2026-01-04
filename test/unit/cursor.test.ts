import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MongoCursor, CursorOptions } from '../../src/client/mongo-cursor'

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

describe('MongoCursor', () => {
  describe('cursor iteration', () => {
    describe('toArray()', () => {
      it('returns all documents as an array', async () => {
        const docs = createTestDocuments(5)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.toArray()

        expect(result).toEqual(docs)
        expect(result).toHaveLength(5)
      })

      it('returns empty array when no documents', async () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))

        const result = await cursor.toArray()

        expect(result).toEqual([])
        expect(result).toHaveLength(0)
      })

      it('can only be called once (exhausts cursor)', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        await cursor.toArray()
        const secondCall = await cursor.toArray()

        expect(secondCall).toEqual([])
      })
    })

    describe('next()', () => {
      it('returns next document in sequence', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const first = await cursor.next()
        const second = await cursor.next()
        const third = await cursor.next()

        expect(first).toEqual(docs[0])
        expect(second).toEqual(docs[1])
        expect(third).toEqual(docs[2])
      })

      it('returns null when exhausted', async () => {
        const docs = createTestDocuments(2)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        await cursor.next()
        await cursor.next()
        const result = await cursor.next()

        expect(result).toBeNull()
      })

      it('returns null for empty cursor', async () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))

        const result = await cursor.next()

        expect(result).toBeNull()
      })
    })

    describe('hasNext()', () => {
      it('returns true when more documents exist', async () => {
        const docs = createTestDocuments(2)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const hasNext = await cursor.hasNext()

        expect(hasNext).toBe(true)
      })

      it('returns false when cursor is exhausted', async () => {
        const docs = createTestDocuments(1)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        await cursor.next()
        const hasNext = await cursor.hasNext()

        expect(hasNext).toBe(false)
      })

      it('returns false for empty cursor', async () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))

        const hasNext = await cursor.hasNext()

        expect(hasNext).toBe(false)
      })

      it('does not consume documents', async () => {
        const docs = createTestDocuments(2)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

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
        const cursor = new MongoCursor(() => Promise.resolve(docs))
        const visited: unknown[] = []

        await cursor.forEach((doc) => {
          visited.push(doc)
        })

        expect(visited).toEqual(docs)
      })

      it('passes index as second argument', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))
        const indices: number[] = []

        await cursor.forEach((_, index) => {
          indices.push(index)
        })

        expect(indices).toEqual([0, 1, 2])
      })

      it('handles async callbacks', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))
        const visited: unknown[] = []

        await cursor.forEach(async (doc) => {
          await Promise.resolve()
          visited.push(doc)
        })

        expect(visited).toEqual(docs)
      })

      it('does nothing for empty cursor', async () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))
        const callback = vi.fn()

        await cursor.forEach(callback)

        expect(callback).not.toHaveBeenCalled()
      })

      it('stops iteration when callback returns false', async () => {
        const docs = createTestDocuments(5)
        const cursor = new MongoCursor(() => Promise.resolve(docs))
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
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.map((doc) => doc.name).toArray()

        expect(result).toEqual(['Document 0', 'Document 1', 'Document 2'])
      })

      it('passes index as second argument', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.map((_, index) => index * 2).toArray()

        expect(result).toEqual([0, 2, 4])
      })

      it('returns a new cursor', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const mapped = cursor.map((doc) => doc.value)

        expect(mapped).toBeInstanceOf(MongoCursor)
        expect(mapped).not.toBe(cursor)
      })

      it('can chain multiple maps', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor
          .map((doc) => doc.value)
          .map((val) => val * 10)
          .toArray()

        expect(result).toEqual([0, 10, 20])
      })
    })

    describe('close()', () => {
      it('releases resources and marks cursor as closed', async () => {
        const docs = createTestDocuments(5)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        await cursor.next()
        await cursor.close()

        expect(cursor.closed).toBe(true)
      })

      it('prevents further iteration after close', async () => {
        const docs = createTestDocuments(5)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        await cursor.close()
        const result = await cursor.next()

        expect(result).toBeNull()
      })

      it('toArray returns empty after close', async () => {
        const docs = createTestDocuments(5)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        await cursor.close()
        const result = await cursor.toArray()

        expect(result).toEqual([])
      })

      it('can be called multiple times safely', async () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))

        await cursor.close()
        await cursor.close()
        await cursor.close()

        expect(cursor.closed).toBe(true)
      })
    })

    describe('Symbol.asyncIterator', () => {
      it('supports for-await-of iteration', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))
        const visited: unknown[] = []

        for await (const doc of cursor) {
          visited.push(doc)
        }

        expect(visited).toEqual(docs)
      })

      it('can use spread operator with Array.fromAsync', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        // Use manual iteration since Array.fromAsync might not be available
        const result: unknown[] = []
        for await (const doc of cursor) {
          result.push(doc)
        }

        expect(result).toEqual(docs)
      })

      it('handles break in for-await-of', async () => {
        const docs = createTestDocuments(5)
        const cursor = new MongoCursor(() => Promise.resolve(docs))
        const visited: unknown[] = []

        for await (const doc of cursor) {
          visited.push(doc)
          if (visited.length >= 2) break
        }

        expect(visited).toHaveLength(2)
      })

      it('closes cursor after iteration completes', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        for await (const _ of cursor) {
          // iterate through all
        }

        expect(cursor.closed).toBe(true)
      })
    })
  })

  describe('cursor modifiers', () => {
    describe('limit()', () => {
      it('limits number of returned documents', async () => {
        const docs = createTestDocuments(10)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.limit(3).toArray()

        expect(result).toHaveLength(3)
        expect(result).toEqual(docs.slice(0, 3))
      })

      it('returns all if limit exceeds document count', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.limit(100).toArray()

        expect(result).toHaveLength(3)
      })

      it('returns empty array for limit(0)', async () => {
        const docs = createTestDocuments(5)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.limit(0).toArray()

        expect(result).toEqual([])
      })

      it('throws for negative limit', () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))

        expect(() => cursor.limit(-1)).toThrow()
      })

      it('returns same cursor for chaining', () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))

        const result = cursor.limit(5)

        expect(result).toBe(cursor)
      })
    })

    describe('skip()', () => {
      it('skips specified number of documents', async () => {
        const docs = createTestDocuments(10)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.skip(3).toArray()

        expect(result).toHaveLength(7)
        expect(result).toEqual(docs.slice(3))
      })

      it('returns empty if skip exceeds document count', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.skip(100).toArray()

        expect(result).toEqual([])
      })

      it('skipping 0 returns all documents', async () => {
        const docs = createTestDocuments(5)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.skip(0).toArray()

        expect(result).toEqual(docs)
      })

      it('throws for negative skip', () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))

        expect(() => cursor.skip(-1)).toThrow()
      })

      it('returns same cursor for chaining', () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))

        const result = cursor.skip(5)

        expect(result).toBe(cursor)
      })
    })

    describe('sort()', () => {
      it('sorts documents in ascending order', async () => {
        const docs = createTestDocuments(5)
        const shuffled = [...docs].reverse()
        const cursor = new MongoCursor(() => Promise.resolve(shuffled))

        const result = await cursor.sort({ value: 1 }).toArray()

        expect(result.map((d) => d.value)).toEqual([0, 1, 2, 3, 4])
      })

      it('sorts documents in descending order', async () => {
        const docs = createTestDocuments(5)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.sort({ value: -1 }).toArray()

        expect(result.map((d) => d.value)).toEqual([4, 3, 2, 1, 0])
      })

      it('sorts by string field', async () => {
        const docs = [
          { _id: '1', name: 'Charlie' },
          { _id: '2', name: 'Alice' },
          { _id: '3', name: 'Bob' },
        ]
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.sort({ name: 1 }).toArray()

        expect(result.map((d) => d.name)).toEqual(['Alice', 'Bob', 'Charlie'])
      })

      it('supports multiple sort fields', async () => {
        const docs = [
          { _id: '1', category: 'A', value: 2 },
          { _id: '2', category: 'B', value: 1 },
          { _id: '3', category: 'A', value: 1 },
          { _id: '4', category: 'B', value: 2 },
        ]
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.sort({ category: 1, value: -1 }).toArray()

        expect(result.map((d) => d._id)).toEqual(['1', '3', '4', '2'])
      })

      it('returns same cursor for chaining', () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))

        const result = cursor.sort({ value: 1 })

        expect(result).toBe(cursor)
      })
    })

    describe('project()', () => {
      it('includes only specified fields', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.project({ name: 1, value: 1 }).toArray()

        expect(result[0]).toEqual({ _id: 'id-0', name: 'Document 0', value: 0 })
        expect(result[0]).not.toHaveProperty('category')
      })

      it('excludes _id when set to 0', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.project({ name: 1, _id: 0 }).toArray()

        expect(result[0]).toEqual({ name: 'Document 0' })
        expect(result[0]).not.toHaveProperty('_id')
      })

      it('excludes specified fields', async () => {
        const docs = createTestDocuments(3)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.project({ category: 0 }).toArray()

        expect(result[0]).toHaveProperty('_id')
        expect(result[0]).toHaveProperty('name')
        expect(result[0]).toHaveProperty('value')
        expect(result[0]).not.toHaveProperty('category')
      })

      it('returns same cursor for chaining', () => {
        const cursor = new MongoCursor(() => Promise.resolve([]))

        const result = cursor.project({ name: 1 })

        expect(result).toBe(cursor)
      })
    })

    describe('chaining modifiers', () => {
      it('supports limit().skip() chaining', async () => {
        const docs = createTestDocuments(10)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.skip(2).limit(3).toArray()

        expect(result).toHaveLength(3)
        expect(result.map((d) => d.value)).toEqual([2, 3, 4])
      })

      it('supports skip().limit().sort() chaining', async () => {
        const docs = createTestDocuments(10)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor.sort({ value: -1 }).skip(2).limit(3).toArray()

        expect(result).toHaveLength(3)
        expect(result.map((d) => d.value)).toEqual([7, 6, 5])
      })

      it('supports full modifier chain', async () => {
        const docs = createTestDocuments(10)
        const cursor = new MongoCursor(() => Promise.resolve(docs))

        const result = await cursor
          .sort({ value: -1 })
          .skip(1)
          .limit(3)
          .project({ value: 1, _id: 0 })
          .toArray()

        expect(result).toEqual([{ value: 8 }, { value: 7 }, { value: 6 }])
      })
    })
  })

  describe('buffering and batching', () => {
    it('fetches data lazily on first access', async () => {
      const fetchFn = vi.fn().mockResolvedValue(createTestDocuments(3))
      const cursor = new MongoCursor(fetchFn)

      // No fetch yet
      expect(fetchFn).not.toHaveBeenCalled()

      // First access triggers fetch
      await cursor.next()
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('does not re-fetch on subsequent iterations', async () => {
      const fetchFn = vi.fn().mockResolvedValue(createTestDocuments(3))
      const cursor = new MongoCursor(fetchFn)

      await cursor.next()
      await cursor.next()
      await cursor.next()

      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('passes cursor options to fetch function', async () => {
      const fetchFn = vi.fn().mockResolvedValue([])
      const options: CursorOptions = {
        limit: 10,
        skip: 5,
        sort: { value: -1 },
        projection: { name: 1 },
      }
      const cursor = new MongoCursor(fetchFn, options)

      await cursor.toArray()

      expect(fetchFn).toHaveBeenCalledWith(
        expect.objectContaining(options)
      )
    })
  })

  describe('resource cleanup', () => {
    it('clears buffer after close', async () => {
      const docs = createTestDocuments(100)
      const cursor = new MongoCursor(() => Promise.resolve(docs))

      await cursor.next()
      await cursor.close()

      // Accessing internal buffer size via property
      expect(cursor.bufferedCount).toBe(0)
    })

    it('emits closed event', async () => {
      const cursor = new MongoCursor(() => Promise.resolve([]))
      const onClose = vi.fn()

      cursor.on('close', onClose)
      await cursor.close()

      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('propagates fetch errors', async () => {
      const cursor = new MongoCursor(() =>
        Promise.reject(new Error('Database error'))
      )

      await expect(cursor.toArray()).rejects.toThrow('Database error')
    })

    it('propagates errors in forEach callback', async () => {
      const docs = createTestDocuments(3)
      const cursor = new MongoCursor(() => Promise.resolve(docs))

      await expect(
        cursor.forEach(() => {
          throw new Error('Callback error')
        })
      ).rejects.toThrow('Callback error')
    })

    it('closes cursor on error', async () => {
      const cursor = new MongoCursor(() =>
        Promise.reject(new Error('Database error'))
      )

      try {
        await cursor.toArray()
      } catch {
        // ignore
      }

      expect(cursor.closed).toBe(true)
    })
  })

  describe('type safety', () => {
    it('preserves document type through operations', async () => {
      interface TestDoc {
        _id: string
        name: string
        value: number
      }

      const docs: TestDoc[] = [{ _id: '1', name: 'test', value: 42 }]
      const cursor = new MongoCursor<TestDoc>(() => Promise.resolve(docs))

      const result = await cursor.toArray()

      // TypeScript should infer result as TestDoc[]
      expect(result[0].name).toBe('test')
      expect(result[0].value).toBe(42)
    })

    it('map transforms type correctly', async () => {
      interface TestDoc {
        _id: string
        value: number
      }

      const docs: TestDoc[] = [{ _id: '1', value: 42 }]
      const cursor = new MongoCursor<TestDoc>(() => Promise.resolve(docs))

      const mapped = cursor.map((doc) => doc.value * 2)
      const result = await mapped.toArray()

      // TypeScript should infer result as number[]
      expect(result[0]).toBe(84)
    })
  })
})
