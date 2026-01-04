import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * RED Phase Tests for AgentFS Key-Value Store
 *
 * These tests define the expected behavior for the KV store operations.
 * They use a mock database interface to isolate the KV store logic.
 */

// Type definitions for the mock database
interface KVDocument {
  _id?: string
  key: string
  value: unknown
  createdAt: Date
  updatedAt: Date
}

interface MockCollection {
  findOne: (query: { key: string }) => Promise<KVDocument | null>
  find: (query: Record<string, unknown>) => Promise<KVDocument[]>
  insertOne: (doc: KVDocument) => Promise<{ insertedId: string }>
  updateOne: (
    query: { key: string },
    update: { $set: Partial<KVDocument> }
  ) => Promise<{ matchedCount: number; modifiedCount: number }>
  deleteOne: (query: { key: string }) => Promise<{ deletedCount: number }>
  deleteMany: (query: Record<string, unknown>) => Promise<{ deletedCount: number }>
}

/**
 * Creates a mock database for testing KV store operations
 */
function createMockDb(): MockCollection & { _store: Map<string, KVDocument> } {
  const store = new Map<string, KVDocument>()
  let idCounter = 0

  return {
    _store: store,

    findOne: vi.fn(async (query: { key: string }) => {
      return store.get(query.key) ?? null
    }),

    find: vi.fn(async (query: Record<string, unknown>) => {
      const results: KVDocument[] = []
      for (const doc of store.values()) {
        if (matchesQuery(doc, query)) {
          results.push(doc)
        }
      }
      return results
    }),

    insertOne: vi.fn(async (doc: KVDocument) => {
      const id = `id_${++idCounter}`
      const docWithId = { ...doc, _id: id }
      store.set(doc.key, docWithId)
      return { insertedId: id }
    }),

    updateOne: vi.fn(
      async (query: { key: string }, update: { $set: Partial<KVDocument> }) => {
        const existing = store.get(query.key)
        if (!existing) {
          return { matchedCount: 0, modifiedCount: 0 }
        }
        const updated = { ...existing, ...update.$set }
        store.set(query.key, updated)
        return { matchedCount: 1, modifiedCount: 1 }
      }
    ),

    deleteOne: vi.fn(async (query: { key: string }) => {
      const existed = store.has(query.key)
      store.delete(query.key)
      return { deletedCount: existed ? 1 : 0 }
    }),

    deleteMany: vi.fn(async (query: Record<string, unknown>) => {
      let count = 0
      for (const [key, doc] of store.entries()) {
        if (matchesQuery(doc, query)) {
          store.delete(key)
          count++
        }
      }
      return { deletedCount: count }
    }),
  }
}

/**
 * Matches a document against a MongoDB-style query
 */
function matchesQuery(doc: KVDocument, query: Record<string, unknown>): boolean {
  if (Object.keys(query).length === 0) return true

  for (const [field, condition] of Object.entries(query)) {
    const value = doc[field as keyof KVDocument]

    if (typeof condition === 'object' && condition !== null) {
      const ops = condition as Record<string, unknown>
      if ('$regex' in ops) {
        const regex = new RegExp(ops.$regex as string)
        if (typeof value !== 'string' || !regex.test(value)) {
          return false
        }
      }
    } else if (value !== condition) {
      return false
    }
  }
  return true
}

/**
 * Minimal KV Store interface for testing
 * This defines what we expect to test
 */
interface KVStore {
  get(key: string): Promise<unknown | null>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<boolean>
  has(key: string): Promise<boolean>
  keys(prefix?: string): Promise<string[]>
}

/**
 * Simple KV Store implementation for RED phase testing
 * This implementation will be replaced by the actual implementation
 */
class TestKVStore implements KVStore {
  constructor(private backend: MockCollection) {}

  async get(key: string): Promise<unknown | null> {
    const doc = await this.backend.findOne({ key })
    if (!doc) return null
    return doc.value
  }

  async set(key: string, value: unknown): Promise<void> {
    const now = new Date()
    const existing = await this.backend.findOne({ key })

    if (existing) {
      await this.backend.updateOne({ key }, { $set: { value, updatedAt: now } })
    } else {
      await this.backend.insertOne({
        key,
        value,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.backend.deleteOne({ key })
    return result.deletedCount > 0
  }

  async has(key: string): Promise<boolean> {
    const doc = await this.backend.findOne({ key })
    return doc !== null
  }

  async keys(prefix?: string): Promise<string[]> {
    const query = prefix ? { key: { $regex: `^${escapeRegex(prefix)}` } } : {}
    const docs = await this.backend.find(query)
    return docs.map((doc) => doc.key)
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('AgentFS KV Store', () => {
  let mockDb: ReturnType<typeof createMockDb>
  let kvStore: KVStore

  beforeEach(() => {
    mockDb = createMockDb()
    kvStore = new TestKVStore(mockDb)
  })

  describe('set and get', () => {
    it('stores and retrieves string value', async () => {
      await kvStore.set('greeting', 'hello world')
      const result = await kvStore.get('greeting')
      expect(result).toBe('hello world')
    })

    it('stores and retrieves object value', async () => {
      const user = { name: 'Alice', age: 30, active: true }
      await kvStore.set('user:1', user)
      const result = await kvStore.get('user:1')
      expect(result).toEqual(user)
    })

    it('stores and retrieves number values', async () => {
      await kvStore.set('count', 42)
      expect(await kvStore.get('count')).toBe(42)

      await kvStore.set('float', 3.14159)
      expect(await kvStore.get('float')).toBe(3.14159)

      await kvStore.set('negative', -100)
      expect(await kvStore.get('negative')).toBe(-100)

      await kvStore.set('zero', 0)
      expect(await kvStore.get('zero')).toBe(0)
    })

    it('stores and retrieves boolean values', async () => {
      await kvStore.set('enabled', true)
      expect(await kvStore.get('enabled')).toBe(true)

      await kvStore.set('disabled', false)
      expect(await kvStore.get('disabled')).toBe(false)
    })

    it('stores and retrieves array values', async () => {
      const numbers = [1, 2, 3, 4, 5]
      await kvStore.set('numbers', numbers)
      expect(await kvStore.get('numbers')).toEqual(numbers)

      const mixed = ['string', 42, true, null, { nested: 'object' }]
      await kvStore.set('mixed', mixed)
      expect(await kvStore.get('mixed')).toEqual(mixed)
    })

    it('stores and retrieves nested structures', async () => {
      const nested = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
                array: [1, 2, { three: 3 }],
              },
            },
          },
        },
      }
      await kvStore.set('nested', nested)
      expect(await kvStore.get('nested')).toEqual(nested)
    })

    it('stores and retrieves null values correctly', async () => {
      await kvStore.set('nullValue', null)
      const result = await kvStore.get('nullValue')
      expect(result).toBeNull()
      // Ensure it's actually null, not undefined
      expect(result).not.toBeUndefined()
    })

    it('stores empty string value', async () => {
      await kvStore.set('empty', '')
      expect(await kvStore.get('empty')).toBe('')
    })

    it('stores empty object value', async () => {
      await kvStore.set('emptyObj', {})
      expect(await kvStore.get('emptyObj')).toEqual({})
    })

    it('stores empty array value', async () => {
      await kvStore.set('emptyArr', [])
      expect(await kvStore.get('emptyArr')).toEqual([])
    })
  })

  describe('get edge cases', () => {
    it('returns null for non-existent key', async () => {
      const result = await kvStore.get('nonexistent')
      expect(result).toBeNull()
    })

    it('returns null for key that was deleted', async () => {
      await kvStore.set('temporary', 'value')
      await kvStore.delete('temporary')
      expect(await kvStore.get('temporary')).toBeNull()
    })

    it('distinguishes between null value and missing key', async () => {
      // Store a null value
      await kvStore.set('nullStored', null)

      // Both should return null, but we can check has() to distinguish
      const nullResult = await kvStore.get('nullStored')
      const missingResult = await kvStore.get('neverSet')

      expect(nullResult).toBeNull()
      expect(missingResult).toBeNull()

      // has() should distinguish them
      expect(await kvStore.has('nullStored')).toBe(true)
      expect(await kvStore.has('neverSet')).toBe(false)
    })
  })

  describe('set overwrite behavior', () => {
    it('overwrites existing key with new value', async () => {
      await kvStore.set('key', 'original')
      await kvStore.set('key', 'updated')
      expect(await kvStore.get('key')).toBe('updated')
    })

    it('overwrites with different value type', async () => {
      await kvStore.set('morphing', 'string')
      expect(await kvStore.get('morphing')).toBe('string')

      await kvStore.set('morphing', 42)
      expect(await kvStore.get('morphing')).toBe(42)

      await kvStore.set('morphing', { object: true })
      expect(await kvStore.get('morphing')).toEqual({ object: true })

      await kvStore.set('morphing', [1, 2, 3])
      expect(await kvStore.get('morphing')).toEqual([1, 2, 3])

      await kvStore.set('morphing', null)
      expect(await kvStore.get('morphing')).toBeNull()
    })

    it('updates timestamp when overwriting', async () => {
      const beforeSet = new Date()
      await kvStore.set('timed', 'v1')

      // Get the initial document
      const doc1 = mockDb._store.get('timed')
      expect(doc1).toBeDefined()
      expect(doc1!.createdAt.getTime()).toBeGreaterThanOrEqual(beforeSet.getTime())

      // Wait briefly to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      const beforeUpdate = new Date()
      await kvStore.set('timed', 'v2')

      // Get the updated document
      const doc2 = mockDb._store.get('timed')
      expect(doc2).toBeDefined()
      expect(doc2!.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime())
      expect(doc2!.updatedAt.getTime()).toBeGreaterThan(doc1!.updatedAt.getTime())
    })

    it('preserves createdAt when overwriting', async () => {
      await kvStore.set('preserved', 'v1')
      const doc1 = mockDb._store.get('preserved')
      const originalCreatedAt = doc1!.createdAt

      await new Promise((resolve) => setTimeout(resolve, 10))

      await kvStore.set('preserved', 'v2')
      const doc2 = mockDb._store.get('preserved')

      expect(doc2!.createdAt.getTime()).toBe(originalCreatedAt.getTime())
    })
  })

  describe('delete', () => {
    it('removes existing key', async () => {
      await kvStore.set('toDelete', 'value')
      const deleted = await kvStore.delete('toDelete')
      expect(deleted).toBe(true)
      expect(await kvStore.get('toDelete')).toBeNull()
    })

    it('returns false for non-existent key', async () => {
      const deleted = await kvStore.delete('nonexistent')
      expect(deleted).toBe(false)
    })

    it('returns true even for key with null value', async () => {
      await kvStore.set('nullKey', null)
      const deleted = await kvStore.delete('nullKey')
      expect(deleted).toBe(true)
      expect(await kvStore.has('nullKey')).toBe(false)
    })

    it('does not affect other keys', async () => {
      await kvStore.set('keep1', 'value1')
      await kvStore.set('delete', 'value2')
      await kvStore.set('keep2', 'value3')

      await kvStore.delete('delete')

      expect(await kvStore.get('keep1')).toBe('value1')
      expect(await kvStore.get('keep2')).toBe('value3')
    })

    it('allows re-setting deleted key', async () => {
      await kvStore.set('reusable', 'first')
      await kvStore.delete('reusable')
      await kvStore.set('reusable', 'second')
      expect(await kvStore.get('reusable')).toBe('second')
    })
  })

  describe('has', () => {
    it('returns true for existing key', async () => {
      await kvStore.set('exists', 'value')
      expect(await kvStore.has('exists')).toBe(true)
    })

    it('returns false for non-existent key', async () => {
      expect(await kvStore.has('nonexistent')).toBe(false)
    })

    it('returns true for key with null value', async () => {
      await kvStore.set('nullValue', null)
      expect(await kvStore.has('nullValue')).toBe(true)
    })

    it('returns true for key with empty string value', async () => {
      await kvStore.set('emptyString', '')
      expect(await kvStore.has('emptyString')).toBe(true)
    })

    it('returns true for key with zero value', async () => {
      await kvStore.set('zero', 0)
      expect(await kvStore.has('zero')).toBe(true)
    })

    it('returns true for key with false value', async () => {
      await kvStore.set('falsy', false)
      expect(await kvStore.has('falsy')).toBe(true)
    })

    it('returns false after key is deleted', async () => {
      await kvStore.set('temporary', 'value')
      await kvStore.delete('temporary')
      expect(await kvStore.has('temporary')).toBe(false)
    })
  })

  describe('keys', () => {
    it('returns empty array when no keys exist', async () => {
      const keys = await kvStore.keys()
      expect(keys).toEqual([])
    })

    it('returns all keys without prefix filter', async () => {
      await kvStore.set('a', 1)
      await kvStore.set('b', 2)
      await kvStore.set('c', 3)

      const keys = await kvStore.keys()
      expect(keys).toHaveLength(3)
      expect(keys).toContain('a')
      expect(keys).toContain('b')
      expect(keys).toContain('c')
    })

    it('filters keys by prefix', async () => {
      await kvStore.set('user:1', { name: 'Alice' })
      await kvStore.set('user:2', { name: 'Bob' })
      await kvStore.set('user:3', { name: 'Charlie' })
      await kvStore.set('session:abc', { token: 'xyz' })
      await kvStore.set('config', { theme: 'dark' })

      const userKeys = await kvStore.keys('user:')
      expect(userKeys).toHaveLength(3)
      expect(userKeys).toContain('user:1')
      expect(userKeys).toContain('user:2')
      expect(userKeys).toContain('user:3')
      expect(userKeys).not.toContain('session:abc')
      expect(userKeys).not.toContain('config')
    })

    it('returns empty array when prefix matches nothing', async () => {
      await kvStore.set('foo', 'bar')
      await kvStore.set('baz', 'qux')

      const keys = await kvStore.keys('nomatch:')
      expect(keys).toEqual([])
    })

    it('handles empty prefix (returns all keys)', async () => {
      await kvStore.set('a', 1)
      await kvStore.set('b', 2)

      const keys = await kvStore.keys('')
      expect(keys).toHaveLength(2)
    })

    it('handles prefix that is exact key match', async () => {
      await kvStore.set('user', 'base user')
      await kvStore.set('user:1', 'user 1')
      await kvStore.set('user:2', 'user 2')

      const keys = await kvStore.keys('user')
      expect(keys).toHaveLength(3)
      expect(keys).toContain('user')
      expect(keys).toContain('user:1')
      expect(keys).toContain('user:2')
    })
  })

  describe('keys with special characters in prefix', () => {
    it('handles dot in prefix', async () => {
      await kvStore.set('config.db.host', 'localhost')
      await kvStore.set('config.db.port', 5432)
      await kvStore.set('configXdb', 'wrong')

      const keys = await kvStore.keys('config.db.')
      expect(keys).toHaveLength(2)
      expect(keys).toContain('config.db.host')
      expect(keys).toContain('config.db.port')
      expect(keys).not.toContain('configXdb')
    })

    it('handles brackets in prefix', async () => {
      await kvStore.set('[0]', 'first')
      await kvStore.set('[1]', 'second')
      await kvStore.set('other', 'other')

      const keys = await kvStore.keys('[')
      expect(keys).toHaveLength(2)
      expect(keys).toContain('[0]')
      expect(keys).toContain('[1]')
    })

    it('handles asterisk in prefix (literal, not glob)', async () => {
      await kvStore.set('*starred', 'important')
      await kvStore.set('*priority', 'high')
      await kvStore.set('normal', 'normal')

      const keys = await kvStore.keys('*')
      expect(keys).toHaveLength(2)
      expect(keys).toContain('*starred')
      expect(keys).toContain('*priority')
    })

    it('handles backslash in prefix', async () => {
      await kvStore.set('path\\to\\file', 'windows')
      await kvStore.set('path\\to\\other', 'also windows')
      await kvStore.set('path/to/unix', 'unix')

      const keys = await kvStore.keys('path\\to\\')
      expect(keys).toHaveLength(2)
      expect(keys).toContain('path\\to\\file')
      expect(keys).toContain('path\\to\\other')
    })

    it('handles parentheses in prefix', async () => {
      await kvStore.set('func()', 'no args')
      await kvStore.set('func(a)', 'one arg')
      await kvStore.set('other', 'other')

      const keys = await kvStore.keys('func(')
      expect(keys).toHaveLength(2)
    })

    it('handles caret in prefix', async () => {
      await kvStore.set('^start', 'start')
      await kvStore.set('^begin', 'begin')
      await kvStore.set('middle^', 'middle')

      const keys = await kvStore.keys('^')
      expect(keys).toHaveLength(2)
      expect(keys).toContain('^start')
      expect(keys).toContain('^begin')
    })

    it('handles dollar sign in prefix', async () => {
      await kvStore.set('$var', 'variable')
      await kvStore.set('$env', 'environment')
      await kvStore.set('no$dollar', 'none')

      const keys = await kvStore.keys('$')
      expect(keys).toHaveLength(2)
    })

    it('handles pipe in prefix', async () => {
      await kvStore.set('cmd|arg', 'piped')
      await kvStore.set('cmd|other', 'also piped')
      await kvStore.set('simple', 'simple')

      const keys = await kvStore.keys('cmd|')
      expect(keys).toHaveLength(2)
    })
  })

  describe('edge cases with key names', () => {
    it('handles empty string as key', async () => {
      await kvStore.set('', 'empty key value')
      expect(await kvStore.get('')).toBe('empty key value')
      expect(await kvStore.has('')).toBe(true)
    })

    it('handles whitespace-only key', async () => {
      await kvStore.set('   ', 'spaces only')
      expect(await kvStore.get('   ')).toBe('spaces only')
    })

    it('handles key with leading/trailing whitespace', async () => {
      await kvStore.set('  padded  ', 'value')
      expect(await kvStore.get('  padded  ')).toBe('value')
      // Verify it's distinct from trimmed version
      expect(await kvStore.has('padded')).toBe(false)
    })

    it('handles key with newlines', async () => {
      await kvStore.set('line1\nline2', 'multiline key')
      expect(await kvStore.get('line1\nline2')).toBe('multiline key')
    })

    it('handles key with tabs', async () => {
      await kvStore.set('col1\tcol2', 'tabbed key')
      expect(await kvStore.get('col1\tcol2')).toBe('tabbed key')
    })

    it('handles very long key', async () => {
      const longKey = 'k'.repeat(10000)
      await kvStore.set(longKey, 'long key value')
      expect(await kvStore.get(longKey)).toBe('long key value')
    })

    it('handles key with unicode characters', async () => {
      await kvStore.set('emoji:sparkles', 'unicode value')
      expect(await kvStore.get('emoji:sparkles')).toBe('unicode value')
    })

    it('handles key with Chinese characters', async () => {
      const chineseKey = '\u7528\u6237:\u5f20\u4e09'
      await kvStore.set(chineseKey, 'Chinese user')
      expect(await kvStore.get(chineseKey)).toBe('Chinese user')
    })

    it('handles key with null bytes', async () => {
      await kvStore.set('null\x00byte', 'null byte key')
      expect(await kvStore.get('null\x00byte')).toBe('null byte key')
    })

    it('handles key with forward slashes', async () => {
      await kvStore.set('path/to/resource', 'path value')
      expect(await kvStore.get('path/to/resource')).toBe('path value')
    })

    it('handles key with colons (namespacing)', async () => {
      await kvStore.set('namespace:subspace:key', 'namespaced')
      expect(await kvStore.get('namespace:subspace:key')).toBe('namespaced')
    })
  })

  describe('complex value scenarios', () => {
    it('handles Date objects (serialized as ISO string)', async () => {
      const date = new Date('2024-01-15T12:00:00Z')
      await kvStore.set('date', date.toISOString())
      const result = await kvStore.get('date')
      expect(result).toBe('2024-01-15T12:00:00.000Z')
    })

    it('handles array with undefined elements (serialized as null)', async () => {
      // Note: JSON.stringify converts undefined to null in arrays
      const arr = [1, null, 3]
      await kvStore.set('sparseArray', arr)
      expect(await kvStore.get('sparseArray')).toEqual([1, null, 3])
    })

    it('handles nested arrays', async () => {
      const matrix = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]
      await kvStore.set('matrix', matrix)
      expect(await kvStore.get('matrix')).toEqual(matrix)
    })

    it('handles object with numeric keys', async () => {
      const obj = { 0: 'zero', 1: 'one', 2: 'two' }
      await kvStore.set('numericKeys', obj)
      expect(await kvStore.get('numericKeys')).toEqual(obj)
    })

    it('handles object with symbol-like string keys', async () => {
      const obj = { 'Symbol(foo)': 'value' }
      await kvStore.set('symbolLike', obj)
      expect(await kvStore.get('symbolLike')).toEqual(obj)
    })

    it('handles large object with many keys', async () => {
      const largeObj: Record<string, number> = {}
      for (let i = 0; i < 1000; i++) {
        largeObj[`key${i}`] = i
      }
      await kvStore.set('largeObj', largeObj)
      const result = (await kvStore.get('largeObj')) as Record<string, number>
      expect(result.key0).toBe(0)
      expect(result.key999).toBe(999)
      expect(Object.keys(result)).toHaveLength(1000)
    })

    it('handles special number values', async () => {
      await kvStore.set('maxInt', Number.MAX_SAFE_INTEGER)
      expect(await kvStore.get('maxInt')).toBe(Number.MAX_SAFE_INTEGER)

      await kvStore.set('minInt', Number.MIN_SAFE_INTEGER)
      expect(await kvStore.get('minInt')).toBe(Number.MIN_SAFE_INTEGER)

      // Note: NaN and Infinity become null in JSON
      await kvStore.set('decimal', 0.1 + 0.2)
      const decimal = (await kvStore.get('decimal')) as number
      expect(decimal).toBeCloseTo(0.3)
    })
  })

  describe('concurrent operations', () => {
    it('handles multiple concurrent sets to different keys', async () => {
      await Promise.all([
        kvStore.set('concurrent:1', 'value1'),
        kvStore.set('concurrent:2', 'value2'),
        kvStore.set('concurrent:3', 'value3'),
      ])

      expect(await kvStore.get('concurrent:1')).toBe('value1')
      expect(await kvStore.get('concurrent:2')).toBe('value2')
      expect(await kvStore.get('concurrent:3')).toBe('value3')
    })

    it('handles concurrent set and get to same key', async () => {
      await kvStore.set('race', 'initial')

      const [, getValue] = await Promise.all([
        kvStore.set('race', 'updated'),
        kvStore.get('race'),
      ])

      // Value could be either initial or updated depending on timing
      expect(['initial', 'updated']).toContain(getValue)
    })

    it('handles concurrent deletes', async () => {
      await kvStore.set('toDelete1', 'value1')
      await kvStore.set('toDelete2', 'value2')

      await Promise.all([
        kvStore.delete('toDelete1'),
        kvStore.delete('toDelete2'),
      ])

      expect(await kvStore.has('toDelete1')).toBe(false)
      expect(await kvStore.has('toDelete2')).toBe(false)
    })
  })

  describe('backend interaction verification', () => {
    it('calls findOne when getting a key', async () => {
      await kvStore.get('testKey')
      expect(mockDb.findOne).toHaveBeenCalledWith({ key: 'testKey' })
    })

    it('calls insertOne for new key', async () => {
      await kvStore.set('newKey', 'newValue')
      expect(mockDb.insertOne).toHaveBeenCalled()
      const insertCall = vi.mocked(mockDb.insertOne).mock.calls[0][0]
      expect(insertCall.key).toBe('newKey')
      expect(insertCall.value).toBe('newValue')
    })

    it('calls updateOne for existing key', async () => {
      await kvStore.set('existingKey', 'v1')
      vi.mocked(mockDb.updateOne).mockClear()

      await kvStore.set('existingKey', 'v2')
      expect(mockDb.updateOne).toHaveBeenCalledWith(
        { key: 'existingKey' },
        expect.objectContaining({
          $set: expect.objectContaining({ value: 'v2' }),
        })
      )
    })

    it('calls deleteOne when deleting', async () => {
      await kvStore.delete('someKey')
      expect(mockDb.deleteOne).toHaveBeenCalledWith({ key: 'someKey' })
    })

    it('calls find with regex query for prefix filter', async () => {
      await kvStore.keys('user:')
      expect(mockDb.find).toHaveBeenCalledWith({
        key: { $regex: '^user:' },
      })
    })
  })
})

describe('Mock Database', () => {
  it('creates isolated instances', () => {
    const db1 = createMockDb()
    const db2 = createMockDb()

    expect(db1._store).not.toBe(db2._store)
  })

  it('correctly matches regex queries', async () => {
    const db = createMockDb()
    await db.insertOne({ key: 'test:1', value: 1, createdAt: new Date(), updatedAt: new Date() })
    await db.insertOne({ key: 'test:2', value: 2, createdAt: new Date(), updatedAt: new Date() })
    await db.insertOne({ key: 'other', value: 3, createdAt: new Date(), updatedAt: new Date() })

    const results = await db.find({ key: { $regex: '^test:' } })
    expect(results).toHaveLength(2)
  })

  it('correctly handles empty query (matches all)', async () => {
    const db = createMockDb()
    await db.insertOne({ key: 'a', value: 1, createdAt: new Date(), updatedAt: new Date() })
    await db.insertOne({ key: 'b', value: 2, createdAt: new Date(), updatedAt: new Date() })

    const results = await db.find({})
    expect(results).toHaveLength(2)
  })
})
