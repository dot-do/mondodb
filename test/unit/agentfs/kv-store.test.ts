import { describe, it, expect, beforeEach } from 'vitest'
import {
  AgentFSKVStore,
  createInMemoryBackend,
  type KVStorageBackend,
} from '../../../src/agentfs/kv-store'
import type { AgentFSKVEntry, KeyValueStore } from '../../../src/agentfs/types'

describe('AgentFSKVStore', () => {
  let backend: KVStorageBackend
  let kvStore: KeyValueStore

  beforeEach(() => {
    backend = createInMemoryBackend()
    kvStore = new AgentFSKVStore(backend)
  })

  describe('get', () => {
    it('returns undefined for non-existent key', async () => {
      const result = await kvStore.get('nonexistent')
      expect(result).toBeUndefined()
    })

    it('returns the value for an existing key', async () => {
      await kvStore.set('mykey', 'myvalue')
      const result = await kvStore.get('mykey')
      expect(result).toBe('myvalue')
    })

    it('returns complex objects', async () => {
      const value = { nested: { data: [1, 2, 3] }, flag: true }
      await kvStore.set('complex', value)
      const result = await kvStore.get('complex')
      expect(result).toEqual(value)
    })

    it('returns null values correctly', async () => {
      await kvStore.set('nullkey', null)
      const result = await kvStore.get('nullkey')
      expect(result).toBeNull()
    })
  })

  describe('set', () => {
    it('creates a new entry for a new key', async () => {
      await kvStore.set('newkey', 'newvalue')
      const result = await kvStore.get('newkey')
      expect(result).toBe('newvalue')
    })

    it('updates an existing entry', async () => {
      await kvStore.set('updatekey', 'original')
      await kvStore.set('updatekey', 'updated')
      const result = await kvStore.get('updatekey')
      expect(result).toBe('updated')
    })

    it('stores string values', async () => {
      await kvStore.set('string', 'hello world')
      expect(await kvStore.get('string')).toBe('hello world')
    })

    it('stores number values', async () => {
      await kvStore.set('number', 42)
      expect(await kvStore.get('number')).toBe(42)
    })

    it('stores boolean values', async () => {
      await kvStore.set('bool-true', true)
      await kvStore.set('bool-false', false)
      expect(await kvStore.get('bool-true')).toBe(true)
      expect(await kvStore.get('bool-false')).toBe(false)
    })

    it('stores array values', async () => {
      const arr = [1, 'two', { three: 3 }]
      await kvStore.set('array', arr)
      expect(await kvStore.get('array')).toEqual(arr)
    })

    it('stores object values', async () => {
      const obj = { name: 'test', count: 5, nested: { value: true } }
      await kvStore.set('object', obj)
      expect(await kvStore.get('object')).toEqual(obj)
    })
  })

  describe('delete', () => {
    it('returns false for non-existent key', async () => {
      const result = await kvStore.delete('nonexistent')
      expect(result).toBe(false)
    })

    it('returns true and removes existing key', async () => {
      await kvStore.set('toDelete', 'value')
      const result = await kvStore.delete('toDelete')
      expect(result).toBe(true)
      expect(await kvStore.get('toDelete')).toBeUndefined()
    })

    it('only deletes the specified key', async () => {
      await kvStore.set('keep', 'keepvalue')
      await kvStore.set('delete', 'deletevalue')
      await kvStore.delete('delete')
      expect(await kvStore.get('keep')).toBe('keepvalue')
    })
  })

  describe('has', () => {
    it('returns false for non-existent key', async () => {
      const result = await kvStore.has('nonexistent')
      expect(result).toBe(false)
    })

    it('returns true for existing key', async () => {
      await kvStore.set('exists', 'value')
      const result = await kvStore.has('exists')
      expect(result).toBe(true)
    })

    it('returns true for key with null value', async () => {
      await kvStore.set('nullvalue', null)
      const result = await kvStore.has('nullvalue')
      expect(result).toBe(true)
    })

    it('returns false after key is deleted', async () => {
      await kvStore.set('washere', 'value')
      await kvStore.delete('washere')
      const result = await kvStore.has('washere')
      expect(result).toBe(false)
    })
  })

  describe('keys', () => {
    it('returns empty array when no keys exist', async () => {
      const result = await kvStore.keys()
      expect(result).toEqual([])
    })

    it('returns all keys', async () => {
      await kvStore.set('a', 1)
      await kvStore.set('b', 2)
      await kvStore.set('c', 3)
      const result = await kvStore.keys()
      expect(result).toHaveLength(3)
      expect(result).toContain('a')
      expect(result).toContain('b')
      expect(result).toContain('c')
    })

    it('filters by prefix when provided', async () => {
      await kvStore.set('user:1', { name: 'Alice' })
      await kvStore.set('user:2', { name: 'Bob' })
      await kvStore.set('session:abc', { token: 'xyz' })
      const result = await kvStore.keys('user:')
      expect(result).toHaveLength(2)
      expect(result).toContain('user:1')
      expect(result).toContain('user:2')
      expect(result).not.toContain('session:abc')
    })

    it('returns empty array when prefix matches nothing', async () => {
      await kvStore.set('foo', 'bar')
      const result = await kvStore.keys('nomatch')
      expect(result).toEqual([])
    })

    it('handles special regex characters in prefix', async () => {
      await kvStore.set('test.key', 'value1')
      await kvStore.set('test.other', 'value2')
      await kvStore.set('testXkey', 'value3') // Should not match 'test.'
      const result = await kvStore.keys('test.')
      expect(result).toHaveLength(2)
      expect(result).toContain('test.key')
      expect(result).toContain('test.other')
    })
  })

  describe('entries', () => {
    it('returns empty array when no entries exist', async () => {
      const result = await kvStore.entries()
      expect(result).toEqual([])
    })

    it('returns all entries with full metadata', async () => {
      await kvStore.set('key1', 'value1')
      await kvStore.set('key2', { complex: true })

      const result = await kvStore.entries()
      expect(result).toHaveLength(2)

      const entry1 = result.find((e) => e.key === 'key1')
      expect(entry1).toBeDefined()
      expect(entry1?.value).toBe('value1')
      expect(entry1?.createdAt).toBeInstanceOf(Date)
      expect(entry1?.updatedAt).toBeInstanceOf(Date)

      const entry2 = result.find((e) => e.key === 'key2')
      expect(entry2).toBeDefined()
      expect(entry2?.value).toEqual({ complex: true })
    })

    it('filters by prefix when provided', async () => {
      await kvStore.set('config:theme', 'dark')
      await kvStore.set('config:lang', 'en')
      await kvStore.set('data:users', [])

      const result = await kvStore.entries('config:')
      expect(result).toHaveLength(2)
      expect(result.every((e) => e.key.startsWith('config:'))).toBe(true)
    })

    it('entries have correct AgentFSKVEntry structure', async () => {
      await kvStore.set('test', { data: 'value' })
      const [entry] = await kvStore.entries()

      // Verify the entry matches AgentFSKVEntry interface
      expect(entry).toHaveProperty('key')
      expect(entry).toHaveProperty('value')
      expect(entry).toHaveProperty('createdAt')
      expect(entry).toHaveProperty('updatedAt')
      expect(typeof entry.key).toBe('string')
      expect(entry.createdAt).toBeInstanceOf(Date)
      expect(entry.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('clear', () => {
    it('returns 0 when no entries exist', async () => {
      const result = await kvStore.clear()
      expect(result).toBe(0)
    })

    it('clears all entries and returns count', async () => {
      await kvStore.set('a', 1)
      await kvStore.set('b', 2)
      await kvStore.set('c', 3)

      const result = await kvStore.clear()
      expect(result).toBe(3)

      const keys = await kvStore.keys()
      expect(keys).toEqual([])
    })

    it('clears only entries matching prefix', async () => {
      await kvStore.set('temp:1', 'a')
      await kvStore.set('temp:2', 'b')
      await kvStore.set('perm:1', 'c')

      const result = await kvStore.clear('temp:')
      expect(result).toBe(2)

      expect(await kvStore.has('temp:1')).toBe(false)
      expect(await kvStore.has('temp:2')).toBe(false)
      expect(await kvStore.has('perm:1')).toBe(true)
    })

    it('returns 0 when prefix matches nothing', async () => {
      await kvStore.set('foo', 'bar')
      const result = await kvStore.clear('nomatch')
      expect(result).toBe(0)
      expect(await kvStore.has('foo')).toBe(true)
    })
  })

  describe('timestamps', () => {
    it('sets createdAt and updatedAt on create', async () => {
      const before = new Date()
      await kvStore.set('timetest', 'value')
      const after = new Date()

      const [entry] = await kvStore.entries('timetest')
      expect(entry.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(entry.createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
      expect(entry.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(entry.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('updates updatedAt but preserves createdAt on update', async () => {
      await kvStore.set('timetest', 'original')
      const [originalEntry] = await kvStore.entries('timetest')
      const originalCreatedAt = originalEntry.createdAt

      // Wait a tiny bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      await kvStore.set('timetest', 'updated')
      const [updatedEntry] = await kvStore.entries('timetest')

      expect(updatedEntry.createdAt.getTime()).toBe(originalCreatedAt.getTime())
      expect(updatedEntry.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalEntry.updatedAt.getTime()
      )
    })
  })

  describe('edge cases', () => {
    it('handles empty string key', async () => {
      await kvStore.set('', 'empty key')
      expect(await kvStore.get('')).toBe('empty key')
      expect(await kvStore.has('')).toBe(true)
    })

    it('handles empty string value', async () => {
      await kvStore.set('emptyval', '')
      expect(await kvStore.get('emptyval')).toBe('')
    })

    it('handles keys with special characters', async () => {
      const specialKey = 'key:with/special\\chars.and[brackets]'
      await kvStore.set(specialKey, 'value')
      expect(await kvStore.get(specialKey)).toBe('value')
    })

    it('handles very long keys', async () => {
      const longKey = 'k'.repeat(1000)
      await kvStore.set(longKey, 'value')
      expect(await kvStore.get(longKey)).toBe('value')
    })

    it('handles deeply nested objects', async () => {
      const nested = {
        a: {
          b: {
            c: {
              d: {
                e: { value: 'deep' },
              },
            },
          },
        },
      }
      await kvStore.set('nested', nested)
      expect(await kvStore.get('nested')).toEqual(nested)
    })
  })
})

describe('createInMemoryBackend', () => {
  it('creates an isolated backend instance', async () => {
    const backend1 = createInMemoryBackend()
    const backend2 = createInMemoryBackend()

    const kv1 = new AgentFSKVStore(backend1)
    const kv2 = new AgentFSKVStore(backend2)

    await kv1.set('key', 'value1')
    await kv2.set('key', 'value2')

    expect(await kv1.get('key')).toBe('value1')
    expect(await kv2.get('key')).toBe('value2')
  })
})
