/**
 * Index Manager for mondodb
 *
 * Manages SQLite indexes for MongoDB-style collections backed by Durable Objects.
 * Indexes are created on json_extract expressions to enable efficient querying.
 */

import type {
  IndexSpec,
  CreateIndexOptions,
  CreateIndexResult,
  IndexInfo,
  DropIndexResult,
} from '../types'

/**
 * Interface representing a SQLite-compatible storage with SQL execution
 */
export interface SQLStorage {
  exec(sql: string): void
  prepare(sql: string): SQLStatement
}

export interface SQLStatement {
  bind(...params: unknown[]): SQLStatement
  run(): void
  first<T = unknown>(): T | null
  all<T = unknown>(): T[]
}

/**
 * Generates an index name from collection name and key specification
 */
export function generateIndexName(collectionName: string, keys: IndexSpec): string {
  const keyParts = Object.entries(keys).map(([field, direction]) => {
    const suffix = direction === 1 ? '1' : '-1'
    return `${field}_${suffix}`
  })
  return `${collectionName}_${keyParts.join('_')}`
}

/**
 * Generates the SQLite index name (prefixed for internal use)
 */
export function generateSQLiteIndexName(collectionName: string, keys: IndexSpec, unique?: boolean): string {
  const baseName = generateIndexName(collectionName, keys)
  const prefix = unique ? 'idx_unique_' : 'idx_'
  return `${prefix}${baseName}`
}

/**
 * Builds the SQL CREATE INDEX statement for given index specification
 */
export function buildCreateIndexSQL(
  collectionName: string,
  collectionId: number,
  keys: IndexSpec,
  options: CreateIndexOptions = {}
): { sql: string; indexName: string; sqliteIndexName: string } {
  const indexName = options.name || generateIndexName(collectionName, keys)
  const sqliteIndexName = `idx_${options.unique ? 'unique_' : ''}${indexName}`

  // Build the column expressions for the index
  const columns = Object.entries(keys).map(([field, direction]) => {
    // Use json_extract for nested fields, handle dot notation
    const jsonPath = field.startsWith('$') ? field : `$.${field}`
    const expr = `json_extract(data, '${jsonPath}')`
    const order = direction === 1 ? 'ASC' : 'DESC'
    return `${expr} ${order}`
  })

  const uniqueClause = options.unique ? 'UNIQUE ' : ''

  // Build the WHERE clause for collection scoping
  const whereClause = `WHERE collection_id = ${collectionId}`

  // Handle sparse index - only index documents where the field exists
  let sparseCondition = ''
  if (options.sparse) {
    const sparseChecks = Object.keys(keys).map(field => {
      const jsonPath = field.startsWith('$') ? field : `$.${field}`
      return `json_extract(data, '${jsonPath}') IS NOT NULL`
    })
    sparseCondition = ` AND ${sparseChecks.join(' AND ')}`
  }

  const sql = `CREATE ${uniqueClause}INDEX IF NOT EXISTS ${sqliteIndexName} ON documents (
  ${columns.join(',\n  ')}
) ${whereClause}${sparseCondition}`

  return { sql, indexName, sqliteIndexName }
}

/**
 * IndexManager handles creation, deletion, and listing of indexes
 */
export class IndexManager {
  private storage: SQLStorage

  constructor(storage: SQLStorage) {
    this.storage = storage
  }

  /**
   * Ensure the collections metadata table exists
   */
  ensureMetadataTable(): void {
    this.storage.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        indexes TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    this.storage.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        doc_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(collection_id, doc_id),
        FOREIGN KEY (collection_id) REFERENCES collections(id)
      )
    `)

    // Create default index on doc_id per collection
    this.storage.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_collection_doc
      ON documents (collection_id, doc_id)
    `)
  }

  /**
   * Get or create a collection and return its ID
   */
  getOrCreateCollection(name: string): { id: number; created: boolean } {
    // Try to get existing collection
    const existing = this.storage
      .prepare('SELECT id FROM collections WHERE name = ?')
      .bind(name)
      .first<{ id: number }>()

    if (existing) {
      return { id: existing.id, created: false }
    }

    // Create new collection
    this.storage
      .prepare('INSERT INTO collections (name) VALUES (?)')
      .bind(name)
      .run()

    const result = this.storage
      .prepare('SELECT id FROM collections WHERE name = ?')
      .bind(name)
      .first<{ id: number }>()

    if (!result) {
      throw new Error(`Failed to create collection: ${name}`)
    }

    return { id: result.id, created: true }
  }

  /**
   * Get collection metadata
   */
  getCollection(name: string): { id: number; indexes: IndexInfo[] } | null {
    const result = this.storage
      .prepare('SELECT id, indexes FROM collections WHERE name = ?')
      .bind(name)
      .first<{ id: number; indexes: string }>()

    if (!result) {
      return null
    }

    return {
      id: result.id,
      indexes: JSON.parse(result.indexes) as IndexInfo[],
    }
  }

  /**
   * Create an index on a collection
   */
  createIndex(
    collectionName: string,
    keys: IndexSpec,
    options: CreateIndexOptions = {}
  ): CreateIndexResult {
    // Ensure tables exist
    this.ensureMetadataTable()

    // Get or create collection
    const { id: collectionId, created } = this.getOrCreateCollection(collectionName)

    // Get current indexes
    const collection = this.getCollection(collectionName)
    const currentIndexes = collection?.indexes || []
    const numIndexesBefore = currentIndexes.length + 1 // +1 for _id index

    // Generate index info
    const indexName = options.name || generateIndexName(collectionName, keys)

    // Check if index already exists
    const existingIndex = currentIndexes.find(idx => idx.name === indexName)
    if (existingIndex) {
      // Index already exists with same name
      return {
        ok: 1,
        numIndexesBefore,
        numIndexesAfter: numIndexesBefore,
        createdCollectionAutomatically: created,
        note: 'all indexes already exist',
      }
    }

    // Build and execute CREATE INDEX
    const { sql, sqliteIndexName } = buildCreateIndexSQL(
      collectionName,
      collectionId,
      keys,
      options
    )

    try {
      this.storage.exec(sql)
    } catch (error) {
      // If index already exists in SQLite, that's ok
      const errMsg = error instanceof Error ? error.message : String(error)
      if (!errMsg.includes('already exists')) {
        throw error
      }
    }

    // Build index info
    const indexInfo: IndexInfo = {
      name: indexName,
      key: keys,
      v: 2,
    }

    if (options.unique) {
      indexInfo.unique = true
    }
    if (options.sparse) {
      indexInfo.sparse = true
    }
    if (options.partialFilterExpression) {
      indexInfo.partialFilterExpression = options.partialFilterExpression
    }
    if (options.expireAfterSeconds !== undefined) {
      indexInfo.expireAfterSeconds = options.expireAfterSeconds
    }

    // Update collection metadata with new index
    const updatedIndexes = [...currentIndexes, indexInfo]
    this.storage
      .prepare('UPDATE collections SET indexes = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(JSON.stringify(updatedIndexes), collectionId)
      .run()

    return {
      ok: 1,
      numIndexesBefore,
      numIndexesAfter: numIndexesBefore + 1,
      createdCollectionAutomatically: created,
    }
  }

  /**
   * List all indexes on a collection
   */
  listIndexes(collectionName: string): IndexInfo[] {
    const collection = this.getCollection(collectionName)
    if (!collection) {
      return []
    }

    // Always include the _id index
    const idIndex: IndexInfo = {
      name: '_id_',
      key: { _id: 1 },
      v: 2,
    }

    return [idIndex, ...collection.indexes]
  }

  /**
   * Drop a specific index by name
   */
  dropIndex(collectionName: string, indexName: string): DropIndexResult {
    const collection = this.getCollection(collectionName)
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`)
    }

    // Cannot drop _id index
    if (indexName === '_id_') {
      throw new Error('cannot drop _id index')
    }

    const currentIndexes = collection.indexes
    const indexToRemove = currentIndexes.find(idx => idx.name === indexName)

    if (!indexToRemove) {
      throw new Error(`index not found with name [${indexName}]`)
    }

    const nIndexesWas = currentIndexes.length + 1 // +1 for _id

    // Generate SQLite index name and drop it
    const sqliteIndexName = `idx_${indexToRemove.unique ? 'unique_' : ''}${indexName}`
    try {
      this.storage.exec(`DROP INDEX IF EXISTS ${sqliteIndexName}`)
    } catch (error) {
      // Ignore errors if index doesn't exist in SQLite
    }

    // Update metadata
    const updatedIndexes = currentIndexes.filter(idx => idx.name !== indexName)
    this.storage
      .prepare('UPDATE collections SET indexes = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(JSON.stringify(updatedIndexes), collection.id)
      .run()

    return {
      ok: 1,
      nIndexesWas,
    }
  }

  /**
   * Drop all indexes on a collection (except _id)
   */
  dropIndexes(collectionName: string): DropIndexResult {
    const collection = this.getCollection(collectionName)
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`)
    }

    const currentIndexes = collection.indexes
    const nIndexesWas = currentIndexes.length + 1 // +1 for _id

    // Drop all SQLite indexes
    for (const index of currentIndexes) {
      const sqliteIndexName = `idx_${index.unique ? 'unique_' : ''}${index.name}`
      try {
        this.storage.exec(`DROP INDEX IF EXISTS ${sqliteIndexName}`)
      } catch (error) {
        // Ignore errors
      }
    }

    // Clear indexes in metadata (keeping _id which is implicit)
    this.storage
      .prepare('UPDATE collections SET indexes = \'[]\', updated_at = datetime(\'now\') WHERE id = ?')
      .bind(collection.id)
      .run()

    return {
      ok: 1,
      nIndexesWas,
    }
  }

  /**
   * Get index usage hints for a query
   * Returns suggested index names that could be used for the query
   */
  getIndexHints(collectionName: string, queryFields: string[]): string[] {
    const collection = this.getCollection(collectionName)
    if (!collection) {
      return []
    }

    const hints: string[] = []

    // Find indexes that could help with the query
    for (const index of collection.indexes) {
      const indexFields = Object.keys(index.key)

      // Check if this index covers any of the query fields
      const coversQuery = queryFields.some(field => indexFields.includes(field))
      if (coversQuery) {
        hints.push(index.name)
      }
    }

    return hints
  }
}

export default IndexManager
