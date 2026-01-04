/**
 * Integration tests for Index Management
 *
 * Tests the MongoDB-compatible index operations:
 * - createIndex with ascending/descending fields
 * - Compound indexes with multiple fields
 * - Unique indexes
 * - listIndexes
 * - dropIndex
 * - dropIndexes
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  IndexManager,
  generateIndexName,
  generateSQLiteIndexName,
  buildCreateIndexSQL,
  type SQLStorage,
  type SQLStatement,
} from '../../src/durable-object/index-manager'
import type { IndexSpec, IndexInfo } from '../../src/types'

/**
 * Mock SQLite storage for testing
 * Simulates Cloudflare Durable Objects SQLite interface
 */
class MockSQLStorage implements SQLStorage {
  private tables: Map<string, Map<string, Record<string, unknown>>> = new Map()
  private indexes: Map<string, { unique: boolean; sql: string }> = new Map()
  private autoIncrementCounters: Map<string, number> = new Map()

  exec(sql: string): void {
    // Parse and execute simple SQL commands
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
        // "IF NOT EXISTS" means we silently skip if already exists
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
    // Parse INSERT INTO tableName (columns) VALUES (values)
    const match = this.sql.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)
    if (!match) return

    const tableName = match[1]
    const columns = match[2].split(',').map(c => c.trim())
    const table = this.storage._getTable(tableName)

    // Build record from columns and params
    const record: Record<string, unknown> = {}
    const id = this.storage._getNextId(tableName)
    record.id = id

    // Set default values for collections table
    if (tableName === 'collections') {
      record.indexes = '[]'
      record.created_at = new Date().toISOString()
      record.updated_at = new Date().toISOString()
    }

    columns.forEach((col, idx) => {
      if (this.params[idx] !== undefined) {
        record[col] = this.params[idx]
      }
    })

    // Use a unique key for the record
    const key = `${id}`
    table.set(key, record)
  }

  private executeUpdate(): void {
    // Parse UPDATE tableName SET ... WHERE ...
    const match = this.sql.match(/UPDATE (\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i)
    if (!match) return

    const tableName = match[1]
    const setClause = match[2]
    const whereClause = match[3]
    const table = this.storage._getTable(tableName)

    // Parse SET clause to get column names and values
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
          // Literal string value
          setItems.push({ col, isParam: false, literalValue: valueExpr.slice(1, -1) })
        } else if (valueExpr.includes('datetime')) {
          // datetime function - use current time
          setItems.push({ col, isParam: false, literalValue: new Date().toISOString() })
        }
      }
    }

    // Parse WHERE clause to find records
    const whereMatch = whereClause.match(/id\s*=\s*\?/)
    if (whereMatch) {
      // Get the ID from the last param
      const id = String(this.params[this.params.length - 1])

      let paramIdx = 0
      for (const [key, record] of table.entries()) {
        if (String(record.id) === id) {
          // Update the record
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
    // Parse DELETE FROM tableName WHERE ...
    const match = this.sql.match(/DELETE FROM (\w+)\s+WHERE\s+(.+)/i)
    if (!match) return

    const tableName = match[1]
    const table = this.storage._getTable(tableName)

    // Simple deletion based on collection_id or id
    for (const [key, record] of table.entries()) {
      // Check if any param matches record values
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
    // Parse SELECT ... FROM tableName WHERE ...
    const match = this.sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i)
    if (!match) return []

    const selectClause = match[1]
    const tableName = match[2]
    const whereClause = match[3]
    const table = this.storage._getTable(tableName)

    const results: T[] = []

    for (const [_, record] of table.entries()) {
      // Check WHERE clause
      if (whereClause) {
        // Simple WHERE name = ? matching
        const whereMatch = whereClause.match(/name\s*=\s*\?/)
        if (whereMatch) {
          if (record.name !== this.params[0]) {
            continue
          }
        }
      }

      // Build result based on SELECT clause
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

describe('Index Management', () => {
  let storage: MockSQLStorage
  let indexManager: IndexManager

  beforeEach(() => {
    storage = new MockSQLStorage()
    indexManager = new IndexManager(storage)
    indexManager.ensureMetadataTable()
  })

  describe('generateIndexName', () => {
    it('generates correct name for single ascending field', () => {
      const name = generateIndexName('users', { email: 1 })
      expect(name).toBe('users_email_1')
    })

    it('generates correct name for single descending field', () => {
      const name = generateIndexName('users', { createdAt: -1 })
      expect(name).toBe('users_createdAt_-1')
    })

    it('generates correct name for compound index', () => {
      const name = generateIndexName('users', { lastName: 1, firstName: 1 })
      expect(name).toBe('users_lastName_1_firstName_1')
    })

    it('generates correct name for mixed direction compound index', () => {
      const name = generateIndexName('posts', { authorId: 1, createdAt: -1 })
      expect(name).toBe('posts_authorId_1_createdAt_-1')
    })
  })

  describe('generateSQLiteIndexName', () => {
    it('adds idx_ prefix for regular indexes', () => {
      const name = generateSQLiteIndexName('users', { email: 1 })
      expect(name).toBe('idx_users_email_1')
    })

    it('adds idx_unique_ prefix for unique indexes', () => {
      const name = generateSQLiteIndexName('users', { email: 1 }, true)
      expect(name).toBe('idx_unique_users_email_1')
    })
  })

  describe('buildCreateIndexSQL', () => {
    it('builds correct SQL for single field ascending index', () => {
      const { sql, indexName, sqliteIndexName } = buildCreateIndexSQL(
        'users',
        1,
        { email: 1 }
      )

      expect(indexName).toBe('users_email_1')
      expect(sqliteIndexName).toBe('idx_users_email_1')
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_users_email_1')
      expect(sql).toContain("json_extract(data, '$.email') ASC")
      expect(sql).toContain('WHERE collection_id = 1')
    })

    it('builds correct SQL for descending index', () => {
      const { sql } = buildCreateIndexSQL('posts', 2, { createdAt: -1 })

      expect(sql).toContain("json_extract(data, '$.createdAt') DESC")
    })

    it('builds correct SQL for compound index', () => {
      const { sql, indexName } = buildCreateIndexSQL(
        'users',
        1,
        { lastName: 1, firstName: 1 }
      )

      expect(indexName).toBe('users_lastName_1_firstName_1')
      expect(sql).toContain("json_extract(data, '$.lastName') ASC")
      expect(sql).toContain("json_extract(data, '$.firstName') ASC")
    })

    it('builds correct SQL for unique index', () => {
      const { sql, sqliteIndexName } = buildCreateIndexSQL(
        'users',
        1,
        { email: 1 },
        { unique: true }
      )

      expect(sqliteIndexName).toBe('idx_unique_users_email_1')
      expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS')
    })

    it('builds correct SQL for sparse index', () => {
      const { sql } = buildCreateIndexSQL(
        'users',
        1,
        { middleName: 1 },
        { sparse: true }
      )

      expect(sql).toContain("json_extract(data, '$.middleName') IS NOT NULL")
    })

    it('uses custom name when provided', () => {
      const { indexName, sqliteIndexName } = buildCreateIndexSQL(
        'users',
        1,
        { email: 1 },
        { name: 'email_index' }
      )

      expect(indexName).toBe('email_index')
      expect(sqliteIndexName).toBe('idx_email_index')
    })
  })

  describe('collection.createIndex({field: 1})', () => {
    it('creates ascending index on a single field', () => {
      const result = indexManager.createIndex('users', { email: 1 })

      expect(result.ok).toBe(1)
      expect(result.numIndexesAfter).toBe(result.numIndexesBefore + 1)
    })

    it('creates descending index on a single field', () => {
      const result = indexManager.createIndex('posts', { createdAt: -1 })

      expect(result.ok).toBe(1)
      expect(result.numIndexesAfter).toBeGreaterThan(1)
    })

    it('creates collection automatically if it does not exist', () => {
      const result = indexManager.createIndex('newCollection', { field: 1 })

      expect(result.ok).toBe(1)
      expect(result.createdCollectionAutomatically).toBe(true)
    })

    it('does not duplicate index if already exists', () => {
      indexManager.createIndex('users', { email: 1 })
      const result = indexManager.createIndex('users', { email: 1 })

      expect(result.ok).toBe(1)
      expect(result.numIndexesBefore).toBe(result.numIndexesAfter)
      expect(result.note).toBe('all indexes already exist')
    })
  })

  describe('collection.createIndex({a: 1, b: -1}) compound index', () => {
    it('creates compound index with multiple fields', () => {
      const result = indexManager.createIndex('users', { lastName: 1, firstName: 1 })

      expect(result.ok).toBe(1)

      const indexes = indexManager.listIndexes('users')
      const compoundIndex = indexes.find(idx => idx.name === 'users_lastName_1_firstName_1')

      expect(compoundIndex).toBeDefined()
      expect(compoundIndex?.key).toEqual({ lastName: 1, firstName: 1 })
    })

    it('creates compound index with mixed directions', () => {
      const result = indexManager.createIndex('posts', { authorId: 1, createdAt: -1 })

      expect(result.ok).toBe(1)

      const indexes = indexManager.listIndexes('posts')
      const compoundIndex = indexes.find(idx => idx.name === 'posts_authorId_1_createdAt_-1')

      expect(compoundIndex).toBeDefined()
      expect(compoundIndex?.key).toEqual({ authorId: 1, createdAt: -1 })
    })

    it('preserves field order in compound index', () => {
      indexManager.createIndex('users', { a: 1, b: -1, c: 1 })

      const indexes = indexManager.listIndexes('users')
      const compoundIndex = indexes.find(idx => idx.name === 'users_a_1_b_-1_c_1')

      expect(compoundIndex).toBeDefined()
      const keyEntries = Object.entries(compoundIndex!.key)
      expect(keyEntries[0]).toEqual(['a', 1])
      expect(keyEntries[1]).toEqual(['b', -1])
      expect(keyEntries[2]).toEqual(['c', 1])
    })
  })

  describe('collection.createIndex with unique option', () => {
    it('creates unique index when unique: true is specified', () => {
      const result = indexManager.createIndex('users', { email: 1 }, { unique: true })

      expect(result.ok).toBe(1)

      const indexes = indexManager.listIndexes('users')
      const uniqueIndex = indexes.find(idx => idx.name === 'users_email_1')

      expect(uniqueIndex).toBeDefined()
      expect(uniqueIndex?.unique).toBe(true)
    })

    it('creates non-unique index by default', () => {
      indexManager.createIndex('users', { name: 1 })

      const indexes = indexManager.listIndexes('users')
      const index = indexes.find(idx => idx.name === 'users_name_1')

      expect(index).toBeDefined()
      expect(index?.unique).toBeUndefined()
    })

    it('stores sparse option in index info', () => {
      indexManager.createIndex('users', { middleName: 1 }, { sparse: true })

      const indexes = indexManager.listIndexes('users')
      const sparseIndex = indexes.find(idx => idx.name === 'users_middleName_1')

      expect(sparseIndex).toBeDefined()
      expect(sparseIndex?.sparse).toBe(true)
    })

    it('allows custom index name with unique option', () => {
      indexManager.createIndex(
        'users',
        { email: 1 },
        { name: 'unique_email', unique: true }
      )

      const indexes = indexManager.listIndexes('users')
      const uniqueIndex = indexes.find(idx => idx.name === 'unique_email')

      expect(uniqueIndex).toBeDefined()
      expect(uniqueIndex?.unique).toBe(true)
    })
  })

  describe('collection.listIndexes()', () => {
    it('returns empty array for non-existent collection', () => {
      const indexes = indexManager.listIndexes('nonexistent')
      expect(indexes).toEqual([])
    })

    it('returns _id index for existing collection', () => {
      indexManager.createIndex('users', { email: 1 })

      const indexes = indexManager.listIndexes('users')
      const idIndex = indexes.find(idx => idx.name === '_id_')

      expect(idIndex).toBeDefined()
      expect(idIndex?.key).toEqual({ _id: 1 })
      expect(idIndex?.v).toBe(2)
    })

    it('returns all indexes including custom ones', () => {
      indexManager.createIndex('users', { email: 1 })
      indexManager.createIndex('users', { name: 1 })
      indexManager.createIndex('users', { age: -1 })

      const indexes = indexManager.listIndexes('users')

      expect(indexes.length).toBe(4) // _id + 3 custom
      expect(indexes.map(idx => idx.name)).toContain('_id_')
      expect(indexes.map(idx => idx.name)).toContain('users_email_1')
      expect(indexes.map(idx => idx.name)).toContain('users_name_1')
      expect(indexes.map(idx => idx.name)).toContain('users_age_-1')
    })

    it('returns correct index info structure', () => {
      indexManager.createIndex('users', { email: 1 }, { unique: true })

      const indexes = indexManager.listIndexes('users')
      const emailIndex = indexes.find(idx => idx.name === 'users_email_1')

      expect(emailIndex).toMatchObject({
        name: 'users_email_1',
        key: { email: 1 },
        v: 2,
        unique: true,
      })
    })
  })

  describe('collection.dropIndex(name)', () => {
    it('removes a specific index by name', () => {
      indexManager.createIndex('users', { email: 1 })
      indexManager.createIndex('users', { name: 1 })

      const result = indexManager.dropIndex('users', 'users_email_1')

      expect(result.ok).toBe(1)
      expect(result.nIndexesWas).toBeGreaterThan(1)

      const indexes = indexManager.listIndexes('users')
      expect(indexes.find(idx => idx.name === 'users_email_1')).toBeUndefined()
      expect(indexes.find(idx => idx.name === 'users_name_1')).toBeDefined()
    })

    it('throws error when trying to drop _id index', () => {
      indexManager.createIndex('users', { email: 1 })

      expect(() => {
        indexManager.dropIndex('users', '_id_')
      }).toThrow('cannot drop _id index')
    })

    it('throws error for non-existent index', () => {
      indexManager.createIndex('users', { email: 1 })

      expect(() => {
        indexManager.dropIndex('users', 'nonexistent_index')
      }).toThrow('index not found')
    })

    it('throws error for non-existent collection', () => {
      expect(() => {
        indexManager.dropIndex('nonexistent', 'some_index')
      }).toThrow('Collection not found')
    })
  })

  describe('collection.dropIndexes()', () => {
    it('removes all indexes except _id', () => {
      indexManager.createIndex('users', { email: 1 })
      indexManager.createIndex('users', { name: 1 })
      indexManager.createIndex('users', { age: -1 })

      const result = indexManager.dropIndexes('users')

      expect(result.ok).toBe(1)
      expect(result.nIndexesWas).toBe(4) // _id + 3 custom

      const indexes = indexManager.listIndexes('users')
      expect(indexes.length).toBe(1) // Only _id remains
      expect(indexes[0].name).toBe('_id_')
    })

    it('works on collection with only _id index', () => {
      // Create collection by creating and dropping an index
      indexManager.createIndex('users', { temp: 1 })
      indexManager.dropIndex('users', 'users_temp_1')

      const result = indexManager.dropIndexes('users')

      expect(result.ok).toBe(1)
      expect(result.nIndexesWas).toBe(1) // Only _id

      const indexes = indexManager.listIndexes('users')
      expect(indexes.length).toBe(1)
    })

    it('throws error for non-existent collection', () => {
      expect(() => {
        indexManager.dropIndexes('nonexistent')
      }).toThrow('Collection not found')
    })
  })

  describe('Index hints for queries', () => {
    it('returns relevant index hints for single field query', () => {
      indexManager.createIndex('users', { email: 1 })
      indexManager.createIndex('users', { name: 1 })

      const hints = indexManager.getIndexHints('users', ['email'])

      expect(hints).toContain('users_email_1')
      expect(hints).not.toContain('users_name_1')
    })

    it('returns multiple hints for compound index', () => {
      indexManager.createIndex('users', { lastName: 1, firstName: 1 })
      indexManager.createIndex('users', { email: 1 })

      const hints = indexManager.getIndexHints('users', ['lastName'])

      expect(hints).toContain('users_lastName_1_firstName_1')
    })

    it('returns empty array for non-existent collection', () => {
      const hints = indexManager.getIndexHints('nonexistent', ['field'])
      expect(hints).toEqual([])
    })

    it('returns empty array when no matching indexes', () => {
      indexManager.createIndex('users', { email: 1 })

      const hints = indexManager.getIndexHints('users', ['unindexedField'])

      expect(hints).toEqual([])
    })
  })

  describe('TTL index support', () => {
    it('stores expireAfterSeconds in index info', () => {
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
  })

  describe('Partial filter expression', () => {
    it('stores partialFilterExpression in index info', () => {
      const partialFilter = { status: 'active' }
      indexManager.createIndex(
        'users',
        { email: 1 },
        { partialFilterExpression: partialFilter }
      )

      const indexes = indexManager.listIndexes('users')
      const partialIndex = indexes.find(idx => idx.name === 'users_email_1')

      expect(partialIndex).toBeDefined()
      expect(partialIndex?.partialFilterExpression).toEqual(partialFilter)
    })
  })
})
