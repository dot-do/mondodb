/**
 * Unit tests for TTL (Time-To-Live) Index Support
 *
 * Tests MongoDB-compatible TTL indexes for automatic document expiration:
 * - createIndex({field: 1}, {expireAfterSeconds: N})
 * - Background cleanup of expired documents
 * - Support for date fields (Date objects and ISODate strings)
 * - TTL index metadata tracking
 * - Periodic cleanup job using DO alarms
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  IndexManager,
  type SQLStorage,
  type SQLStatement,
} from '../../src/durable-object/index-manager'

/**
 * Mock SQLite storage for testing
 * Extended to support TTL index testing with documents table
 */
class MockSQLStorage implements SQLStorage {
  private tables: Map<string, Map<string, Record<string, unknown>>> = new Map()
  private indexes: Map<string, { unique: boolean; sql: string }> = new Map()
  private autoIncrementCounters: Map<string, number> = new Map()

  exec(sql: string): void {
    const trimmedSql = sql.trim()

    if (trimmedSql.startsWith('CREATE TABLE IF NOT EXISTS')) {
      const match = trimmedSql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)
      if (match) {
        const tableName = match[1]
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, new Map())
          this.autoIncrementCounters.set(tableName, 0)
        }
      }
    } else if (trimmedSql.startsWith('CREATE INDEX IF NOT EXISTS') || trimmedSql.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS')) {
      const isUnique = trimmedSql.includes('UNIQUE')
      const match = trimmedSql.match(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS (\w+)/)
      if (match) {
        const indexName = match[1]
        if (!this.indexes.has(indexName)) {
          this.indexes.set(indexName, { unique: isUnique, sql: trimmedSql })
        }
      }
    } else if (trimmedSql.startsWith('DROP INDEX IF EXISTS')) {
      const match = trimmedSql.match(/DROP INDEX IF EXISTS (\w+)/)
      if (match) {
        this.indexes.delete(match[1])
      }
    }
  }

  prepare(sql: string): SQLStatement {
    return new MockSQLStatement(this, sql)
  }

  // Internal methods for MockSQLStatement
  _getTable(name: string): Map<string, Record<string, unknown>> {
    if (!this.tables.has(name)) {
      this.tables.set(name, new Map())
      this.autoIncrementCounters.set(name, 0)
    }
    return this.tables.get(name)!
  }

  _getNextId(tableName: string): number {
    const current = this.autoIncrementCounters.get(tableName) || 0
    const next = current + 1
    this.autoIncrementCounters.set(tableName, next)
    return next
  }

  _getIndexes(): Map<string, { unique: boolean; sql: string }> {
    return this.indexes
  }

  // Add document to a collection (for testing TTL cleanup)
  _insertDocument(collectionId: number, docId: string, data: Record<string, unknown>): void {
    const table = this._getTable('documents')
    const id = this._getNextId('documents')
    table.set(String(id), {
      id,
      collection_id: collectionId,
      doc_id: docId,
      data: JSON.stringify(data),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  // Get all documents (for testing)
  _getDocuments(): Array<{ id: number; collection_id: number; doc_id: string; data: string }> {
    const table = this._getTable('documents')
    return Array.from(table.values()) as Array<{ id: number; collection_id: number; doc_id: string; data: string }>
  }
}

/**
 * Mock SQL statement for testing
 */
class MockSQLStatement implements SQLStatement {
  private storage: MockSQLStorage
  private sql: string
  private params: unknown[] = []

  constructor(storage: MockSQLStorage, sql: string) {
    this.storage = storage
    this.sql = sql
  }

  bind(...params: unknown[]): SQLStatement {
    this.params = [...this.params, ...params]
    return this
  }

  run(): void {
    const sql = this.sql.trim()

    if (sql.startsWith('INSERT INTO')) {
      this.executeInsert()
    } else if (sql.startsWith('UPDATE')) {
      this.executeUpdate()
    } else if (sql.startsWith('DELETE FROM')) {
      this.executeDelete()
    }
  }

  first<T = unknown>(): T | null {
    const results = this.all<T>()
    return results.length > 0 ? results[0] : null
  }

  all<T = unknown>(): T[] {
    const sql = this.sql.trim()

    if (sql.startsWith('SELECT')) {
      return this.executeSelect<T>()
    }

    return []
  }

  private executeInsert(): void {
    const match = this.sql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)
    if (!match) return

    const tableName = match[1]
    const columns = match[2].split(',').map(c => c.trim())
    const table = this.storage._getTable(tableName)

    const record: Record<string, unknown> = {}
    const id = this.storage._getNextId(tableName)
    record.id = id

    if (tableName === 'collections') {
      record.indexes = '[]'
      record.created_at = new Date().toISOString()
      record.updated_at = new Date().toISOString()
    }

    if (tableName === 'ttl_indexes') {
      record.created_at = new Date().toISOString()
    }

    columns.forEach((col, idx) => {
      if (this.params[idx] !== undefined) {
        record[col] = this.params[idx]
      }
    })

    const key = `${id}`
    table.set(key, record)
  }

  private executeUpdate(): void {
    const match = this.sql.match(/UPDATE (\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i)
    if (!match) return

    const tableName = match[1]
    const setClause = match[2]
    const table = this.storage._getTable(tableName)

    const setItems: Array<{ col: string; isParam: boolean; literalValue?: string }> = []
    const setParts = setClause.split(',')
    for (const part of setParts) {
      const colMatch = part.trim().match(/(\w+)\s*=\s*(.+)/)
      if (colMatch) {
        const col = colMatch[1]
        const valueExpr = colMatch[2].trim()
        if (valueExpr === '?') {
          setItems.push({ col, isParam: true })
        } else if (valueExpr.startsWith("'") && valueExpr.endsWith("'")) {
          setItems.push({ col, isParam: false, literalValue: valueExpr.slice(1, -1) })
        } else if (valueExpr.includes('datetime')) {
          setItems.push({ col, isParam: false, literalValue: new Date().toISOString() })
        }
      }
    }

    const whereMatch = this.sql.match(/WHERE\s+id\s*=\s*\?/i)
    if (whereMatch) {
      const id = String(this.params[this.params.length - 1])

      let paramIdx = 0
      for (const [key, record] of table.entries()) {
        if (String(record.id) === id) {
          for (const item of setItems) {
            if (item.isParam) {
              record[item.col] = this.params[paramIdx]
              paramIdx++
            } else if (item.literalValue !== undefined) {
              record[item.col] = item.literalValue
            }
          }
          break
        }
      }
    }
  }

  private executeDelete(): void {
    const match = this.sql.match(/DELETE FROM (\w+)\s+WHERE\s+(.+)/i)
    if (!match) return

    const tableName = match[1]
    const table = this.storage._getTable(tableName)

    for (const [key, record] of table.entries()) {
      let shouldDelete = false
      for (const param of this.params) {
        if (record.collection_id === param || record.id === param) {
          shouldDelete = true
          break
        }
      }
      if (shouldDelete) {
        table.delete(key)
      }
    }
  }

  private executeSelect<T>(): T[] {
    const match = this.sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i)
    if (!match) return []

    const selectClause = match[1]
    const tableName = match[2]
    const whereClause = match[3]
    const table = this.storage._getTable(tableName)

    const results: T[] = []

    for (const [_, record] of table.entries()) {
      if (whereClause) {
        const whereMatch = whereClause.match(/name\s*=\s*\?/)
        if (whereMatch) {
          if (record.name !== this.params[0]) {
            continue
          }
        }

        // Handle collection_id filter
        const collectionIdMatch = whereClause.match(/collection_id\s*=\s*\?/)
        if (collectionIdMatch) {
          if (record.collection_id !== this.params[0]) {
            continue
          }
        }
      }

      if (selectClause.trim() === '*') {
        results.push({ ...record } as T)
      } else {
        const columns = selectClause.split(',').map(c => c.trim())
        const result: Record<string, unknown> = {}
        for (const col of columns) {
          if (col in record) {
            result[col] = record[col]
          }
        }
        results.push(result as T)
      }
    }

    return results
  }
}

describe('TTL Index Support', () => {
  let storage: MockSQLStorage
  let indexManager: IndexManager

  beforeEach(() => {
    storage = new MockSQLStorage()
    indexManager = new IndexManager(storage)
    indexManager.ensureMetadataTable()
  })

  describe('createIndex with expireAfterSeconds', () => {
    it('creates TTL index with expireAfterSeconds option', () => {
      const result = indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      expect(result.ok).toBe(1)
      expect(result.numIndexesAfter).toBeGreaterThan(result.numIndexesBefore)
    })

    it('stores expireAfterSeconds in index metadata', () => {
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      const indexes = indexManager.listIndexes('sessions')
      const ttlIndex = indexes.find(idx => idx.name === 'sessions_createdAt_1')

      expect(ttlIndex).toBeDefined()
      expect(ttlIndex?.expireAfterSeconds).toBe(3600)
    })

    it('supports zero expireAfterSeconds (immediate expiration)', () => {
      indexManager.createIndex(
        'events',
        { timestamp: 1 },
        { expireAfterSeconds: 0 }
      )

      const indexes = indexManager.listIndexes('events')
      const ttlIndex = indexes.find(idx => idx.name === 'events_timestamp_1')

      expect(ttlIndex?.expireAfterSeconds).toBe(0)
    })

    it('supports large expireAfterSeconds values (30 days)', () => {
      const thirtyDaysInSeconds = 30 * 24 * 60 * 60 // 2592000

      indexManager.createIndex(
        'logs',
        { createdAt: 1 },
        { expireAfterSeconds: thirtyDaysInSeconds }
      )

      const indexes = indexManager.listIndexes('logs')
      const ttlIndex = indexes.find(idx => idx.name === 'logs_createdAt_1')

      expect(ttlIndex?.expireAfterSeconds).toBe(thirtyDaysInSeconds)
    })

    it('allows TTL index with custom name', () => {
      indexManager.createIndex(
        'sessions',
        { lastAccess: 1 },
        { name: 'session_ttl', expireAfterSeconds: 1800 }
      )

      const indexes = indexManager.listIndexes('sessions')
      const ttlIndex = indexes.find(idx => idx.name === 'session_ttl')

      expect(ttlIndex).toBeDefined()
      expect(ttlIndex?.expireAfterSeconds).toBe(1800)
    })
  })

  describe('TTL index identification', () => {
    it('getTTLIndexes returns only TTL indexes', () => {
      // Create regular index
      indexManager.createIndex('users', { email: 1 })

      // Create TTL index
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      // Create another TTL index
      indexManager.createIndex(
        'tokens',
        { issuedAt: 1 },
        { expireAfterSeconds: 7200 }
      )

      const ttlIndexes = indexManager.getTTLIndexes()

      expect(ttlIndexes).toHaveLength(2)
      expect(ttlIndexes.every(idx => idx.expireAfterSeconds !== undefined)).toBe(true)
    })

    it('getTTLIndexes returns empty array when no TTL indexes exist', () => {
      indexManager.createIndex('users', { email: 1 })
      indexManager.createIndex('posts', { createdAt: -1 })

      const ttlIndexes = indexManager.getTTLIndexes()

      expect(ttlIndexes).toEqual([])
    })

    it('getTTLIndexes includes collection information', () => {
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      const ttlIndexes = indexManager.getTTLIndexes()

      expect(ttlIndexes[0]).toMatchObject({
        collectionName: 'sessions',
        field: 'createdAt',
        expireAfterSeconds: 3600,
      })
    })
  })

  describe('isTTLIndex helper', () => {
    it('returns true for indexes with expireAfterSeconds', () => {
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      const isTTL = indexManager.isTTLIndex('sessions', 'sessions_createdAt_1')

      expect(isTTL).toBe(true)
    })

    it('returns false for regular indexes', () => {
      indexManager.createIndex('users', { email: 1 })

      const isTTL = indexManager.isTTLIndex('users', 'users_email_1')

      expect(isTTL).toBe(false)
    })

    it('returns false for non-existent indexes', () => {
      const isTTL = indexManager.isTTLIndex('nonexistent', 'fake_index')

      expect(isTTL).toBe(false)
    })
  })

  describe('Date field handling', () => {
    it('validates that TTL field contains date value (ISO string)', () => {
      const validDoc = {
        _id: '1',
        createdAt: '2024-01-01T00:00:00.000Z',
        data: 'test',
      }

      const isValid = indexManager.isValidTTLFieldValue(validDoc.createdAt)
      expect(isValid).toBe(true)
    })

    it('validates that TTL field contains date value (Date object)', () => {
      const validDoc = {
        _id: '1',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        data: 'test',
      }

      const isValid = indexManager.isValidTTLFieldValue(validDoc.createdAt)
      expect(isValid).toBe(true)
    })

    it('validates that TTL field contains date value (Unix timestamp in ms)', () => {
      const validDoc = {
        _id: '1',
        createdAt: 1704067200000, // 2024-01-01T00:00:00.000Z
        data: 'test',
      }

      const isValid = indexManager.isValidTTLFieldValue(validDoc.createdAt)
      expect(isValid).toBe(true)
    })

    it('returns false for invalid date values', () => {
      expect(indexManager.isValidTTLFieldValue('not a date')).toBe(false)
      expect(indexManager.isValidTTLFieldValue(null)).toBe(false)
      expect(indexManager.isValidTTLFieldValue(undefined)).toBe(false)
      expect(indexManager.isValidTTLFieldValue({ foo: 'bar' })).toBe(false)
    })
  })

  describe('Document expiration calculation', () => {
    it('calculates correct expiration time from Date object', () => {
      const createdAt = new Date('2024-01-01T00:00:00.000Z')
      const expireAfterSeconds = 3600

      const expiresAt = indexManager.calculateExpirationTime(createdAt, expireAfterSeconds)

      expect(expiresAt.getTime()).toBe(new Date('2024-01-01T01:00:00.000Z').getTime())
    })

    it('calculates correct expiration time from ISO string', () => {
      const createdAt = '2024-01-01T00:00:00.000Z'
      const expireAfterSeconds = 86400 // 24 hours

      const expiresAt = indexManager.calculateExpirationTime(createdAt, expireAfterSeconds)

      expect(expiresAt.getTime()).toBe(new Date('2024-01-02T00:00:00.000Z').getTime())
    })

    it('calculates correct expiration time from Unix timestamp', () => {
      const createdAt = 1704067200000 // 2024-01-01T00:00:00.000Z
      const expireAfterSeconds = 7200 // 2 hours

      const expiresAt = indexManager.calculateExpirationTime(createdAt, expireAfterSeconds)

      expect(expiresAt.getTime()).toBe(new Date('2024-01-01T02:00:00.000Z').getTime())
    })
  })

  describe('Expired document detection', () => {
    it('isDocumentExpired returns true for expired documents', () => {
      const document = {
        _id: '1',
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
      }
      const expireAfterSeconds = 3600

      const isExpired = indexManager.isDocumentExpired(
        document,
        'createdAt',
        expireAfterSeconds
      )

      expect(isExpired).toBe(true)
    })

    it('isDocumentExpired returns false for non-expired documents', () => {
      const document = {
        _id: '1',
        createdAt: new Date(), // Now
      }
      const expireAfterSeconds = 3600

      const isExpired = indexManager.isDocumentExpired(
        document,
        'createdAt',
        expireAfterSeconds
      )

      expect(isExpired).toBe(false)
    })

    it('isDocumentExpired returns false for documents without TTL field', () => {
      const document = {
        _id: '1',
        data: 'test',
      }
      const expireAfterSeconds = 3600

      const isExpired = indexManager.isDocumentExpired(
        document,
        'createdAt',
        expireAfterSeconds
      )

      expect(isExpired).toBe(false)
    })

    it('isDocumentExpired returns false for documents with invalid date field', () => {
      const document = {
        _id: '1',
        createdAt: 'not a date',
      }
      const expireAfterSeconds = 3600

      const isExpired = indexManager.isDocumentExpired(
        document,
        'createdAt',
        expireAfterSeconds
      )

      expect(isExpired).toBe(false)
    })
  })

  describe('TTL cleanup query generation', () => {
    it('builds correct SQL query for finding expired documents', () => {
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      const query = indexManager.buildExpiredDocumentsQuery(
        'sessions',
        'createdAt',
        3600
      )

      expect(query.sql).toContain('DELETE FROM documents')
      expect(query.sql).toContain('collection_id')
      expect(query.sql).toContain('json_extract')
      expect(query.sql).toContain('createdAt')
    })

    it('includes proper date comparison in query', () => {
      const query = indexManager.buildExpiredDocumentsQuery(
        'sessions',
        'createdAt',
        3600
      )

      // The query should compare dates properly
      expect(query.sql).toMatch(/datetime|strftime|julianday/)
    })
  })

  describe('TTL metadata storage', () => {
    it('stores TTL index info in dedicated metadata', () => {
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      const metadata = indexManager.getTTLMetadata('sessions', 'sessions_createdAt_1')

      expect(metadata).toBeDefined()
      expect(metadata?.field).toBe('createdAt')
      expect(metadata?.expireAfterSeconds).toBe(3600)
    })

    it('tracks last cleanup time for TTL indexes', () => {
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      // Simulate recording cleanup
      indexManager.recordTTLCleanup('sessions', 'sessions_createdAt_1', 10)

      const metadata = indexManager.getTTLMetadata('sessions', 'sessions_createdAt_1')

      expect(metadata?.lastCleanupAt).toBeDefined()
      expect(metadata?.lastCleanupCount).toBe(10)
    })
  })

  describe('Alarm scheduling', () => {
    it('getNextCleanupTime returns appropriate interval', () => {
      const nextCleanup = indexManager.getNextCleanupTime()

      // Default should be 60 seconds from now
      const expectedMin = Date.now() + 55000
      const expectedMax = Date.now() + 65000

      expect(nextCleanup).toBeGreaterThanOrEqual(expectedMin)
      expect(nextCleanup).toBeLessThanOrEqual(expectedMax)
    })

    it('allows configuring cleanup interval', () => {
      const customInterval = 120000 // 2 minutes

      indexManager.setCleanupInterval(customInterval)
      const nextCleanup = indexManager.getNextCleanupTime()

      const expectedMin = Date.now() + customInterval - 5000
      const expectedMax = Date.now() + customInterval + 5000

      expect(nextCleanup).toBeGreaterThanOrEqual(expectedMin)
      expect(nextCleanup).toBeLessThanOrEqual(expectedMax)
    })
  })

  describe('runTTLCleanup operation', () => {
    it('returns cleanup result with deleted count', async () => {
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      const result = await indexManager.runTTLCleanup()

      expect(result).toMatchObject({
        ok: 1,
        collectionsProcessed: expect.any(Number),
        documentsDeleted: expect.any(Number),
      })
    })

    it('processes all collections with TTL indexes', async () => {
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      indexManager.createIndex(
        'tokens',
        { issuedAt: 1 },
        { expireAfterSeconds: 7200 }
      )

      const result = await indexManager.runTTLCleanup()

      expect(result.collectionsProcessed).toBe(2)
    })

    it('returns empty result when no TTL indexes exist', async () => {
      indexManager.createIndex('users', { email: 1 })

      const result = await indexManager.runTTLCleanup()

      expect(result.collectionsProcessed).toBe(0)
      expect(result.documentsDeleted).toBe(0)
    })
  })

  describe('Edge cases', () => {
    it('handles TTL index on nested field', () => {
      indexManager.createIndex(
        'events',
        { 'metadata.timestamp': 1 },
        { expireAfterSeconds: 3600 }
      )

      const indexes = indexManager.listIndexes('events')
      const ttlIndex = indexes.find(idx => idx.expireAfterSeconds !== undefined)

      expect(ttlIndex).toBeDefined()
      expect(Object.keys(ttlIndex!.key)[0]).toBe('metadata.timestamp')
    })

    it('prevents multiple TTL indexes on same collection', () => {
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      // MongoDB only allows one TTL index per collection
      expect(() => {
        indexManager.createIndex(
          'sessions',
          { updatedAt: 1 },
          { expireAfterSeconds: 7200 }
        )
      }).toThrow(/already has a TTL index|only one TTL index/i)
    })

    it('prevents TTL index on compound key (MongoDB restriction)', () => {
      expect(() => {
        indexManager.createIndex(
          'sessions',
          { createdAt: 1, userId: 1 },
          { expireAfterSeconds: 3600 }
        )
      }).toThrow(/compound.*TTL|TTL.*single field/i)
    })

    it('drops TTL index and removes from TTL tracking', () => {
      indexManager.createIndex(
        'sessions',
        { createdAt: 1 },
        { expireAfterSeconds: 3600 }
      )

      indexManager.dropIndex('sessions', 'sessions_createdAt_1')

      const ttlIndexes = indexManager.getTTLIndexes()
      expect(ttlIndexes).toHaveLength(0)
    })
  })
})
