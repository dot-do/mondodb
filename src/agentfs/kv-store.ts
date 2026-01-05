/**
 * AgentFS Key-Value Store Implementation
 *
 * Provides simple key-value storage backed by mongo.do collections.
 * Values can be any JSON-serializable type.
 */

import type { AgentFSKVEntry, KeyValueStore } from './types'

/**
 * Interface for the storage backend operations
 */
export interface KVStorageBackend {
  /** Find one entry by key */
  findOne(query: { key: string }): Promise<KVStorageDocument | null>
  /** Find all entries matching a query */
  find(query: Record<string, unknown>): Promise<KVStorageDocument[]>
  /** Insert a new entry */
  insertOne(document: KVStorageDocument): Promise<{ insertedId: string }>
  /** Update an existing entry */
  updateOne(
    query: { key: string },
    update: { $set: Partial<KVStorageDocument> }
  ): Promise<{ matchedCount: number; modifiedCount: number }>
  /** Delete an entry */
  deleteOne(query: { key: string }): Promise<{ deletedCount: number }>
  /** Delete multiple entries */
  deleteMany(query: Record<string, unknown>): Promise<{ deletedCount: number }>
  /** Count entries matching a query */
  countDocuments(query: Record<string, unknown>): Promise<number>
}

/**
 * Internal storage document structure
 */
export interface KVStorageDocument {
  _id?: string
  key: string
  value: unknown
  createdAt: Date
  updatedAt: Date
}

/**
 * AgentFS Key-Value Store
 *
 * Implements the KeyValueStore interface using a mongo.do collection backend.
 * Each entry is stored as a document with key, value, and timestamps.
 */
export class AgentFSKVStore implements KeyValueStore {
  private backend: KVStorageBackend

  /**
   * Create a new AgentFSKVStore
   *
   * @param backend - The storage backend (typically a mongo.do collection)
   */
  constructor(backend: KVStorageBackend) {
    this.backend = backend
  }

  /**
   * Get a value by key
   *
   * @param key - The key to look up
   * @returns The value if found, undefined otherwise
   */
  async get(key: string): Promise<unknown | undefined> {
    const doc = await this.backend.findOne({ key })
    return doc?.value
  }

  /**
   * Set a key-value pair
   *
   * Creates a new entry if the key doesn't exist, or updates the existing entry.
   *
   * @param key - The key to set
   * @param value - The JSON-serializable value
   */
  async set(key: string, value: unknown): Promise<void> {
    const now = new Date()
    const existing = await this.backend.findOne({ key })

    if (existing) {
      // Update existing entry
      await this.backend.updateOne(
        { key },
        {
          $set: {
            value,
            updatedAt: now,
          },
        }
      )
    } else {
      // Create new entry
      await this.backend.insertOne({
        key,
        value,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  /**
   * Delete a key
   *
   * @param key - The key to delete
   * @returns true if the key existed and was deleted, false otherwise
   */
  async delete(key: string): Promise<boolean> {
    const result = await this.backend.deleteOne({ key })
    return result.deletedCount > 0
  }

  /**
   * Check if a key exists
   *
   * @param key - The key to check
   * @returns true if the key exists, false otherwise
   */
  async has(key: string): Promise<boolean> {
    const doc = await this.backend.findOne({ key })
    return doc !== null
  }

  /**
   * List all keys
   *
   * @param prefix - Optional prefix to filter keys
   * @returns Array of matching keys
   */
  async keys(prefix?: string): Promise<string[]> {
    const query = prefix
      ? { key: { $regex: `^${this.escapeRegex(prefix)}` } }
      : {}

    const docs = await this.backend.find(query)
    return docs.map((doc) => doc.key)
  }

  /**
   * Get all entries as AgentFSKVEntry objects
   *
   * @param prefix - Optional prefix to filter entries
   * @returns Array of matching entries with full metadata
   */
  async entries(prefix?: string): Promise<AgentFSKVEntry[]> {
    const query = prefix
      ? { key: { $regex: `^${this.escapeRegex(prefix)}` } }
      : {}

    const docs = await this.backend.find(query)
    return docs.map((doc) => ({
      _id: doc.key,
      key: doc.key,
      value: doc.value,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }))
  }

  /**
   * Clear all entries
   *
   * @param prefix - Optional prefix to filter which entries to clear
   * @returns Number of deleted entries
   */
  async clear(prefix?: string): Promise<number> {
    const query = prefix
      ? { key: { $regex: `^${this.escapeRegex(prefix)}` } }
      : {}

    const result = await this.backend.deleteMany(query)
    return result.deletedCount
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}

/**
 * Create an in-memory KV store backend for testing
 */
export function createInMemoryBackend(): KVStorageBackend {
  const store = new Map<string, KVStorageDocument>()
  let idCounter = 0

  return {
    async findOne(query: { key: string }): Promise<KVStorageDocument | null> {
      return store.get(query.key) ?? null
    },

    async find(query: Record<string, unknown>): Promise<KVStorageDocument[]> {
      const results: KVStorageDocument[] = []
      const docs = Array.from(store.values())

      for (const doc of docs) {
        if (matchesQuery(doc, query)) {
          results.push(doc)
        }
      }

      return results
    },

    async insertOne(
      document: KVStorageDocument
    ): Promise<{ insertedId: string }> {
      const id = String(++idCounter)
      const docWithId = { ...document, _id: id }
      store.set(document.key, docWithId)
      return { insertedId: id }
    },

    async updateOne(
      query: { key: string },
      update: { $set: Partial<KVStorageDocument> }
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      const existing = store.get(query.key)
      if (!existing) {
        return { matchedCount: 0, modifiedCount: 0 }
      }

      const updated = { ...existing, ...update.$set }
      store.set(query.key, updated)
      return { matchedCount: 1, modifiedCount: 1 }
    },

    async deleteOne(
      query: { key: string }
    ): Promise<{ deletedCount: number }> {
      const existed = store.has(query.key)
      store.delete(query.key)
      return { deletedCount: existed ? 1 : 0 }
    },

    async deleteMany(
      query: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      let count = 0
      const entries = Array.from(store.entries())

      for (const [key, doc] of entries) {
        if (matchesQuery(doc, query)) {
          store.delete(key)
          count++
        }
      }

      return { deletedCount: count }
    },

    async countDocuments(
      query: Record<string, unknown>
    ): Promise<number> {
      let count = 0
      const docs = Array.from(store.values())

      for (const doc of docs) {
        if (matchesQuery(doc, query)) {
          count++
        }
      }

      return count
    },
  }
}

/**
 * Check if a document matches a MongoDB-style query
 */
function matchesQuery(
  doc: KVStorageDocument,
  query: Record<string, unknown>
): boolean {
  // Empty query matches all
  if (Object.keys(query).length === 0) {
    return true
  }

  for (const [field, condition] of Object.entries(query)) {
    const value = doc[field as keyof KVStorageDocument]

    if (typeof condition === 'object' && condition !== null) {
      // Handle operators like $regex
      const operators = condition as Record<string, unknown>

      if ('$regex' in operators) {
        const regex = new RegExp(operators.$regex as string)
        if (typeof value !== 'string' || !regex.test(value)) {
          return false
        }
      }
    } else {
      // Direct value comparison
      if (value !== condition) {
        return false
      }
    }
  }

  return true
}
