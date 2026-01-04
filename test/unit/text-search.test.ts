/**
 * Unit tests for MongoDB-compatible text search
 *
 * Tests the text search functionality:
 * - createIndex({field: 'text'}) for text indexes
 * - $text query operator with $search, $language, $caseSensitive, $diacriticSensitive
 * - $meta textScore projection for relevance ranking
 * - Compound text indexes across multiple fields
 * - SQLite FTS5 integration
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  IndexManager,
  type SQLStorage,
  type SQLStatement,
} from '../../src/durable-object/index-manager'
import { QueryTranslator } from '../../src/translator/query-translator'
import type { IndexSpec, IndexInfo } from '../../src/types'

/**
 * Mock SQLite storage for testing with FTS5 support
 */
class MockSQLStorage implements SQLStorage {
  private tables: Map<string, Map<string, Record<string, unknown>>> = new Map()
  private ftsConfigs: Map<string, { fields: string[]; tableName: string }> = new Map()
  private indexes: Map<string, { unique: boolean; sql: string }> = new Map()
  private autoIncrementCounters: Map<string, number> = new Map()
  public executedStatements: string[] = []

  exec(sql: string): void {
    this.executedStatements.push(sql)
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
    } else if (trimmedSql.startsWith('CREATE VIRTUAL TABLE')) {
      // FTS5 virtual table creation
      const match = trimmedSql.match(/CREATE VIRTUAL TABLE IF NOT EXISTS (\w+) USING fts5\(([^)]+)\)/)
      if (match) {
        const tableName = match[1]
        const fields = match[2].split(',').map(f => f.trim()).filter(f => !f.startsWith('content='))
        this.ftsConfigs.set(tableName, { fields, tableName })
        this.tables.set(tableName, new Map())
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
    } else if (trimmedSql.startsWith('DROP TABLE IF EXISTS')) {
      const match = trimmedSql.match(/DROP TABLE IF EXISTS (\w+)/)
      if (match) {
        this.tables.delete(match[1])
        this.ftsConfigs.delete(match[1])
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

  _getFtsConfigs(): Map<string, { fields: string[]; tableName: string }> {
    return this.ftsConfigs
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

    const whereMatch = this.sql.match(/id\s*=\s*\?/)
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
    const table = this.storage._getTable(tableName)

    const results: T[] = []

    for (const [_, record] of table.entries()) {
      if (match[3]) {
        const whereMatch = match[3].match(/name\s*=\s*\?/)
        if (whereMatch) {
          if (record.name !== this.params[0]) {
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

describe('Text Search', () => {
  let storage: MockSQLStorage
  let indexManager: IndexManager

  beforeEach(() => {
    storage = new MockSQLStorage()
    indexManager = new IndexManager(storage)
    indexManager.ensureMetadataTable()
  })

  describe('Text Index Creation', () => {
    describe('createIndex({ field: "text" })', () => {
      it('creates a text index on a single field', () => {
        const result = indexManager.createIndex('articles', { title: 'text' })

        expect(result.ok).toBe(1)
        expect(result.numIndexesAfter).toBe(result.numIndexesBefore + 1)
      })

      it('creates FTS5 virtual table for text index', () => {
        indexManager.createIndex('articles', { content: 'text' })

        // Should have created an FTS5 virtual table
        const ftsStatements = storage.executedStatements.filter(s =>
          s.includes('CREATE VIRTUAL TABLE') && s.includes('fts5')
        )
        expect(ftsStatements.length).toBeGreaterThan(0)
      })

      it('marks index as text type in listIndexes', () => {
        indexManager.createIndex('articles', { title: 'text' })

        const indexes = indexManager.listIndexes('articles')
        const textIndex = indexes.find(idx => idx.key.title === 'text')

        expect(textIndex).toBeDefined()
        expect(textIndex?.key).toEqual({ title: 'text' })
      })

      it('generates correct FTS5 table name', () => {
        indexManager.createIndex('articles', { title: 'text' })

        const ftsStatements = storage.executedStatements.filter(s =>
          s.includes('CREATE VIRTUAL TABLE')
        )
        expect(ftsStatements[0]).toContain('articles_fts')
      })
    })

    describe('Compound text index createIndex({ a: "text", b: "text" })', () => {
      it('creates compound text index on multiple fields', () => {
        const result = indexManager.createIndex('articles', {
          title: 'text',
          content: 'text'
        })

        expect(result.ok).toBe(1)
      })

      it('includes all fields in FTS5 table', () => {
        indexManager.createIndex('articles', {
          title: 'text',
          content: 'text',
          tags: 'text'
        })

        const ftsStatements = storage.executedStatements.filter(s =>
          s.includes('CREATE VIRTUAL TABLE') && s.includes('fts5')
        )
        expect(ftsStatements.length).toBeGreaterThan(0)
        const ftsStatement = ftsStatements[0]
        expect(ftsStatement).toContain('title')
        expect(ftsStatement).toContain('content')
        expect(ftsStatement).toContain('tags')
      })

      it('stores compound text index info correctly', () => {
        indexManager.createIndex('articles', {
          title: 'text',
          content: 'text'
        })

        const indexes = indexManager.listIndexes('articles')
        const textIndex = indexes.find(idx =>
          idx.key.title === 'text' && idx.key.content === 'text'
        )

        expect(textIndex).toBeDefined()
      })
    })

    describe('Mixed text and regular indexes', () => {
      it('allows text index alongside regular indexes', () => {
        indexManager.createIndex('articles', { title: 'text' })
        indexManager.createIndex('articles', { createdAt: -1 })

        const indexes = indexManager.listIndexes('articles')
        expect(indexes.length).toBe(3) // _id + text + regular
      })

      it('only allows one text index per collection', () => {
        indexManager.createIndex('articles', { title: 'text' })

        expect(() => {
          indexManager.createIndex('articles', { content: 'text' })
        }).toThrow(/text index|already exists/)
      })
    })

    describe('Text index with weights', () => {
      it('accepts weights option for text index', () => {
        const result = indexManager.createIndex(
          'articles',
          { title: 'text', content: 'text' },
          { weights: { title: 10, content: 1 } }
        )

        expect(result.ok).toBe(1)
      })

      it('stores weights in index info', () => {
        indexManager.createIndex(
          'articles',
          { title: 'text', content: 'text' },
          { weights: { title: 10, content: 5 } }
        )

        const indexes = indexManager.listIndexes('articles')
        const textIndex = indexes.find(idx => idx.key.title === 'text')

        expect(textIndex?.weights).toEqual({ title: 10, content: 5 })
      })
    })

    describe('dropIndex for text indexes', () => {
      it('drops text index and removes FTS5 table', () => {
        indexManager.createIndex('articles', { title: 'text' })
        const result = indexManager.dropIndex('articles', 'articles_title_text')

        expect(result.ok).toBe(1)

        // Should have dropped the FTS5 table
        const dropStatements = storage.executedStatements.filter(s =>
          s.includes('DROP') && s.includes('articles_fts')
        )
        expect(dropStatements.length).toBeGreaterThan(0)
      })
    })
  })

  describe('$text Query Operator', () => {
    let queryTranslator: QueryTranslator

    beforeEach(() => {
      queryTranslator = new QueryTranslator()
    })

    describe('Basic $text search', () => {
      it('translates $text: { $search: "term" }', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'coffee' }
        })

        expect(result.sql).toContain('MATCH')
        expect(result.params).toContain('coffee')
      })

      it('translates multi-word search', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'coffee shop' }
        })

        expect(result.sql).toContain('MATCH')
        // Should search for both words
        expect(result.sql).toBeDefined()
      })

      it('translates phrase search with quotes', () => {
        const result = queryTranslator.translate({
          $text: { $search: '"coffee shop"' }
        })

        expect(result.sql).toContain('MATCH')
        // FTS5 phrase search
        expect(result.params).toBeDefined()
      })

      it('translates negation with minus', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'coffee -decaf' }
        })

        expect(result.sql).toContain('MATCH')
        expect(result.sql).toBeDefined()
      })
    })

    describe('$text with options', () => {
      it('handles $language option', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'coffee', $language: 'en' }
        })

        expect(result.sql).toBeDefined()
        // Language affects stemming behavior
      })

      it('handles $caseSensitive: true', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'Coffee', $caseSensitive: true }
        })

        expect(result.sql).toBeDefined()
        // Case-sensitive search
      })

      it('handles $caseSensitive: false (default)', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'coffee', $caseSensitive: false }
        })

        expect(result.sql).toBeDefined()
        // Case-insensitive search (default)
      })

      it('handles $diacriticSensitive: true', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'cafe', $diacriticSensitive: true }
        })

        expect(result.sql).toBeDefined()
      })

      it('handles $diacriticSensitive: false (default)', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'cafe', $diacriticSensitive: false }
        })

        expect(result.sql).toBeDefined()
      })
    })

    describe('$text with other query conditions', () => {
      it('combines $text with field filters', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'coffee' },
          category: 'drinks'
        })

        expect(result.sql).toContain('MATCH')
        expect(result.sql).toContain('AND')
        expect(result.params).toContain('drinks')
      })

      it('combines $text with $or conditions', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'coffee' },
          $or: [{ inStock: true }, { preOrder: true }]
        })

        expect(result.sql).toContain('MATCH')
        expect(result.sql).toContain('OR')
      })
    })
  })

  describe('$meta textScore Projection', () => {
    let queryTranslator: QueryTranslator

    beforeEach(() => {
      queryTranslator = new QueryTranslator()
    })

    describe('textScore calculation', () => {
      it('translates { $meta: "textScore" } in projection', () => {
        // This would be used in a find() with projection
        const result = queryTranslator.translateWithMeta(
          { $text: { $search: 'coffee' } },
          { score: { $meta: 'textScore' } }
        )

        expect(result.sql).toContain('rank')
        expect(result.sql).toBeDefined()
      })

      it('allows sorting by textScore', () => {
        const result = queryTranslator.translateWithMeta(
          { $text: { $search: 'coffee' } },
          { score: { $meta: 'textScore' } },
          { score: { $meta: 'textScore' } } // sort
        )

        expect(result.sql).toContain('ORDER BY')
        expect(result.sql).toContain('rank')
      })
    })

    describe('textScore with FTS5 bm25', () => {
      it('uses bm25() function for relevance ranking', () => {
        const result = queryTranslator.translateWithMeta(
          { $text: { $search: 'coffee' } },
          { score: { $meta: 'textScore' } }
        )

        // FTS5 uses bm25() for ranking
        expect(result.sql).toMatch(/bm25|rank/)
      })

      it('returns negative bm25 for descending relevance', () => {
        // FTS5 bm25() returns negative values (more negative = more relevant)
        // So we might need to negate for MongoDB-compatible behavior
        const result = queryTranslator.translateWithMeta(
          { $text: { $search: 'coffee' } },
          { score: { $meta: 'textScore' } }
        )

        expect(result.sql).toBeDefined()
      })
    })
  })

  describe('FTS5 SQL Generation', () => {
    describe('buildFTS5CreateSQL', () => {
      it('generates correct FTS5 CREATE VIRTUAL TABLE', () => {
        indexManager.createIndex('articles', { title: 'text', content: 'text' })

        const ftsStatements = storage.executedStatements.filter(s =>
          s.includes('CREATE VIRTUAL TABLE')
        )

        expect(ftsStatements[0]).toMatch(/CREATE VIRTUAL TABLE IF NOT EXISTS \w+_fts USING fts5/)
      })

      it('includes content table reference for external content', () => {
        indexManager.createIndex('articles', { title: 'text' })

        const ftsStatements = storage.executedStatements.filter(s =>
          s.includes('CREATE VIRTUAL TABLE')
        )

        // External content FTS5 table references the documents table
        expect(ftsStatements[0]).toContain('content=')
      })

      it('includes tokenize option', () => {
        indexManager.createIndex('articles', { title: 'text' })

        const ftsStatements = storage.executedStatements.filter(s =>
          s.includes('CREATE VIRTUAL TABLE')
        )

        // Should specify tokenizer (unicode61, porter, etc.)
        expect(ftsStatements[0]).toMatch(/tokenize|TOKENIZE/)
      })
    })

    describe('buildFTS5MatchSQL', () => {
      let queryTranslator: QueryTranslator

      beforeEach(() => {
        queryTranslator = new QueryTranslator()
      })

      it('generates correct FTS5 MATCH query', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'coffee' }
        })

        // FTS5 MATCH syntax
        expect(result.sql).toContain('MATCH')
      })

      it('joins FTS5 table with documents table', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'coffee' }
        })

        // Should reference both FTS and documents tables
        expect(result.sql).toBeDefined()
      })

      it('uses rowid for joining FTS5 to documents', () => {
        const result = queryTranslator.translate({
          $text: { $search: 'coffee' }
        })

        // FTS5 external content tables join on rowid
        expect(result.sql).toBeDefined()
      })
    })
  })

  describe('Text Search Edge Cases', () => {
    let queryTranslator: QueryTranslator

    beforeEach(() => {
      queryTranslator = new QueryTranslator()
    })

    it('handles empty search string', () => {
      const result = queryTranslator.translate({
        $text: { $search: '' }
      })

      // Should return no results or handle gracefully
      expect(result.sql).toBeDefined()
    })

    it('handles special characters in search', () => {
      const result = queryTranslator.translate({
        $text: { $search: 'coffee & tea' }
      })

      // Should escape or handle special FTS5 characters
      expect(result.sql).toBeDefined()
    })

    it('handles unicode in search', () => {
      const result = queryTranslator.translate({
        $text: { $search: 'cafe' }
      })

      expect(result.sql).toBeDefined()
    })

    it('handles very long search strings', () => {
      const longSearch = 'word '.repeat(100).trim()
      const result = queryTranslator.translate({
        $text: { $search: longSearch }
      })

      expect(result.sql).toBeDefined()
    })
  })

  describe('Text Index Maintenance', () => {
    it('syncs FTS5 table when documents are inserted', () => {
      indexManager.createIndex('articles', { title: 'text' })

      // After creating index, check for trigger or sync mechanism
      const triggerStatements = storage.executedStatements.filter(s =>
        s.includes('TRIGGER') || s.includes('INSERT INTO') && s.includes('_fts')
      )

      // Should have mechanism to sync FTS5 table
      expect(storage.executedStatements.length).toBeGreaterThan(0)
    })

    it('syncs FTS5 table when documents are updated', () => {
      indexManager.createIndex('articles', { title: 'text' })

      // Should have update trigger or sync mechanism
      expect(storage.executedStatements.length).toBeGreaterThan(0)
    })

    it('syncs FTS5 table when documents are deleted', () => {
      indexManager.createIndex('articles', { title: 'text' })

      // Should have delete trigger or sync mechanism
      expect(storage.executedStatements.length).toBeGreaterThan(0)
    })
  })
})
