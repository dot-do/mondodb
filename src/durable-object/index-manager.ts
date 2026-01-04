/**
 * Index Manager for mondodb
 *
 * Manages SQLite indexes for MongoDB-style collections backed by Durable Objects.
 * Indexes are created on json_extract expressions to enable efficient querying.
 *
 * TTL (Time-To-Live) Index Support:
 * - createIndex({field: 1}, {expireAfterSeconds: N}) creates a TTL index
 * - Documents with date values in the TTL field will expire after N seconds
 * - Background cleanup removes expired documents periodically
 */

// Import all types from the unified schema module
import type {
  IndexSpec,
  CreateIndexOptions,
  CreateIndexResult,
  IndexInfo,
  DropIndexResult,
  SQLStorage,
  SQLStatement,
  TTLIndexInfo,
  TTLMetadata,
  TTLCleanupResult,
  ExpiredDocumentsQuery,
} from './schema'

// Re-export types that consumers of IndexManager might need
export type {
  SQLStorage,
  SQLStatement,
  TTLIndexInfo,
  TTLMetadata,
  TTLCleanupResult,
  ExpiredDocumentsQuery,
}

/**
 * Validates and escapes a field name/path for safe use in SQL json_extract expressions.
 * Prevents SQL injection by only allowing safe characters in field paths.
 *
 * @throws Error if field name contains invalid characters
 */
export function escapeFieldPath(field: string): string {
  if (!field || field.length === 0) {
    throw new Error('Field name cannot be empty')
  }
  if (field.includes('\0')) {
    throw new Error('Field name cannot contain null characters')
  }
  const safeFieldPattern = /^[a-zA-Z0-9_.$-]+$/
  if (!safeFieldPattern.test(field)) {
    throw new Error(`Invalid field name: ${field}. Field names can only contain alphanumeric characters, underscores, dots, hyphens, and dollar signs.`)
  }
  if (field.includes('..') || field.startsWith('.') || field.endsWith('.')) {
    throw new Error(`Invalid field path: ${field}. Field paths cannot have consecutive, leading, or trailing dots.`)
  }
  return field
}

/**
 * Validates an identifier (table name, index name) for safe use in SQL.
 * Only allows alphanumeric characters and underscores.
 *
 * @throws Error if identifier contains invalid characters
 */
export function validateIdentifier(identifier: string): string {
  if (!identifier || identifier.length === 0) {
    throw new Error('Identifier cannot be empty')
  }
  if (identifier.includes('\0')) {
    throw new Error('Identifier cannot contain null characters')
  }
  const safeIdentifierPattern = /^[a-zA-Z0-9_]+$/
  if (!safeIdentifierPattern.test(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}. Identifiers can only contain alphanumeric characters and underscores.`)
  }
  return identifier
}

/**
 * Check if an index specification is a text index
 */
export function isTextIndex(keys: IndexSpec): boolean {
  return Object.values(keys).some(v => v === 'text')
}

/**
 * Get fields that are text-indexed
 */
export function getTextFields(keys: IndexSpec): string[] {
  return Object.entries(keys)
    .filter(([_, v]) => v === 'text')
    .map(([field]) => field)
}

/**
 * Generate FTS5 virtual table name for a collection
 */
export function generateFTS5TableName(collectionName: string): string {
  validateIdentifier(collectionName)
  return `${collectionName}_fts`
}

/**
 * Generates an index name from collection name and key specification
 */
export function generateIndexName(collectionName: string, keys: IndexSpec): string {
  validateIdentifier(collectionName)
  const keyParts = Object.entries(keys).map(([field, direction]) => {
    escapeFieldPath(field)
    const safeField = field.replace(/\./g, '_')
    if (direction === 'text') {
      return `${safeField}_text`
    }
    const suffix = direction === 1 ? '1' : '-1'
    return `${safeField}_${suffix}`
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
    // Validate and escape field name to prevent SQL injection
    const safeField = escapeFieldPath(field)
    const jsonPath = safeField.startsWith('$') ? safeField : `$.${safeField}`
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
      const safeField = escapeFieldPath(field)
      const jsonPath = safeField.startsWith('$') ? safeField : `$.${safeField}`
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
 * Builds the SQL for creating an FTS5 virtual table for text indexing.
 *
 * UNIFIED SCHEMA: Uses _id column from the unified schema (not doc_id).
 */
export function buildFTS5CreateSQL(
  collectionName: string,
  fields: string[],
  options: CreateIndexOptions = {}
): { tableName: string; createSQL: string; triggersSQL: string[] } {
  // generateFTS5TableName validates collectionName
  const ftsTableName = generateFTS5TableName(collectionName)

  // Validate and escape all field names to prevent SQL injection
  const safeFields = fields.map(f => escapeFieldPath(f))
  // Replace dots with underscores for FTS5 column names
  const safeFtsFields = safeFields.map(f => f.replace(/\./g, '_'))
  // Use _id to match the unified schema column name
  const ftsFields = ['_id', ...safeFtsFields]

  // Tokenize option - use unicode61 by default for better international support
  const tokenize = options.default_language === 'none'
    ? 'unicode61'
    : 'porter unicode61'

  // Create the FTS5 virtual table
  const createSQL = `CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTableName} USING fts5(
  ${ftsFields.join(', ')},
  content='documents',
  content_rowid='id',
  tokenize='${tokenize}'
)`

  // Build json_extract expressions with validated field paths
  const jsonExtractExprsNew = safeFields.map(f => `json_extract(NEW.data, '$.${f}')`)
  const jsonExtractExprsOld = safeFields.map(f => `json_extract(OLD.data, '$.${f}')`)

  // Create triggers to keep FTS5 table in sync with documents table
  // Uses _id column from the unified schema
  const triggersSQL: string[] = [
    // Insert trigger
    `CREATE TRIGGER IF NOT EXISTS ${ftsTableName}_ai AFTER INSERT ON documents BEGIN
  INSERT INTO ${ftsTableName}(rowid, _id, ${safeFtsFields.join(', ')})
  VALUES (NEW.id, NEW._id, ${jsonExtractExprsNew.join(', ')});
END`,
    // Delete trigger
    `CREATE TRIGGER IF NOT EXISTS ${ftsTableName}_ad AFTER DELETE ON documents BEGIN
  INSERT INTO ${ftsTableName}(${ftsTableName}, rowid, _id, ${safeFtsFields.join(', ')})
  VALUES('delete', OLD.id, OLD._id, ${jsonExtractExprsOld.join(', ')});
END`,
    // Update trigger
    `CREATE TRIGGER IF NOT EXISTS ${ftsTableName}_au AFTER UPDATE ON documents BEGIN
  INSERT INTO ${ftsTableName}(${ftsTableName}, rowid, _id, ${safeFtsFields.join(', ')})
  VALUES('delete', OLD.id, OLD._id, ${jsonExtractExprsOld.join(', ')});
  INSERT INTO ${ftsTableName}(rowid, _id, ${safeFtsFields.join(', ')})
  VALUES (NEW.id, NEW._id, ${jsonExtractExprsNew.join(', ')});
END`,
  ]

  return { tableName: ftsTableName, createSQL, triggersSQL }
}

/**
 * Builds the SQL for dropping an FTS5 virtual table and its triggers
 */
export function buildFTS5DropSQL(collectionName: string): { dropSQL: string; dropTriggersSQL: string[] } {
  const ftsTableName = generateFTS5TableName(collectionName)

  return {
    dropSQL: `DROP TABLE IF EXISTS ${ftsTableName}`,
    dropTriggersSQL: [
      `DROP TRIGGER IF EXISTS ${ftsTableName}_ai`,
      `DROP TRIGGER IF EXISTS ${ftsTableName}_ad`,
      `DROP TRIGGER IF EXISTS ${ftsTableName}_au`,
    ],
  }
}

/** Default cleanup interval in milliseconds (60 seconds) */
const DEFAULT_CLEANUP_INTERVAL_MS = 60000

/**
 * IndexManager handles creation, deletion, and listing of indexes
 * Includes TTL (Time-To-Live) index support for automatic document expiration
 */
export class IndexManager {
  private storage: SQLStorage
  private cleanupIntervalMs: number = DEFAULT_CLEANUP_INTERVAL_MS
  private ttlMetadataCache: Map<string, TTLMetadata> = new Map()

  constructor(storage: SQLStorage) {
    this.storage = storage
  }

  /**
   * Ensure the collections and documents tables exist.
   *
   * UNIFIED SCHEMA: This uses the same schema as MondoDatabase/SchemaManager.
   * The schema is defined in schema.ts/migrations.ts as the single source of truth.
   * This method creates the tables if they don't exist (for standalone IndexManager usage).
   */
  ensureMetadataTable(): void {
    this.storage.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        options TEXT DEFAULT '{}',
        indexes TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `)

    this.storage.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        _id TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(collection_id, _id),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      )
    `)

    // Create default indexes on _id per collection (unified schema indexes)
    this.storage.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_id ON documents(_id)
    `)
    this.storage.exec(`
      CREATE INDEX IF NOT EXISTS idx_documents_collection_id ON documents(collection_id, _id)
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

    // Check if this is a text index
    const isText = isTextIndex(keys)
    const textFields = isText ? getTextFields(keys) : []

    // Text index validation - only one text index per collection
    if (isText) {
      const existingTextIndex = currentIndexes.find(idx =>
        Object.values(idx.key).some(v => v === 'text')
      )
      if (existingTextIndex) {
        throw new Error(`Collection '${collectionName}' already has a text index: ${existingTextIndex.name}`)
      }
    }

    // TTL index validation
    if (options.expireAfterSeconds !== undefined) {
      // TTL indexes must be on a single field (MongoDB restriction)
      const keyFields = Object.keys(keys)
      if (keyFields.length !== 1) {
        throw new Error('TTL indexes must be on a single field, compound TTL indexes are not supported')
      }

      // Check if collection already has a TTL index (MongoDB only allows one per collection)
      const existingTTLIndex = currentIndexes.find(idx => idx.expireAfterSeconds !== undefined)
      if (existingTTLIndex) {
        throw new Error(`Collection '${collectionName}' already has a TTL index: ${existingTTLIndex.name}`)
      }
    }

    // Handle text index creation with FTS5
    if (isText) {
      const { createSQL, triggersSQL } = buildFTS5CreateSQL(
        collectionName,
        textFields,
        options
      )

      try {
        // Create FTS5 virtual table
        this.storage.exec(createSQL)

        // Create sync triggers
        for (const triggerSQL of triggersSQL) {
          this.storage.exec(triggerSQL)
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        if (!errMsg.includes('already exists')) {
          throw error
        }
      }
    } else {
      // Build and execute regular CREATE INDEX
      const { sql } = buildCreateIndexSQL(
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

      // Cache TTL metadata for quick access
      const ttlField = Object.keys(keys)[0]
      const cacheKey = `${collectionName}:${indexName}`
      this.ttlMetadataCache.set(cacheKey, {
        field: ttlField,
        expireAfterSeconds: options.expireAfterSeconds,
      })
    }
    if (isText) {
      indexInfo.textIndexVersion = 3
      if (options.weights) {
        indexInfo.weights = options.weights
      }
      if (options.default_language) {
        indexInfo.default_language = options.default_language
      }
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
    // Validate collection name to prevent SQL injection
    validateIdentifier(collectionName)

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

    // Check if this is a text index
    const isText = isTextIndex(indexToRemove.key)

    if (isText) {
      // Drop FTS5 table and triggers (collection name already validated)
      const { dropSQL, dropTriggersSQL } = buildFTS5DropSQL(collectionName)
      try {
        for (const triggerSQL of dropTriggersSQL) {
          this.storage.exec(triggerSQL)
        }
        this.storage.exec(dropSQL)
      } catch (error) {
        // Ignore errors if FTS5 table doesn't exist
      }
    } else {
      // Generate SQLite index name and drop it
      // Index name comes from stored metadata so it's already validated
      const sqliteIndexName = `idx_${indexToRemove.unique ? 'unique_' : ''}${indexName}`
      try {
        this.storage.exec(`DROP INDEX IF EXISTS ${sqliteIndexName}`)
      } catch (error) {
        // Ignore errors if index doesn't exist in SQLite
      }
    }

    // Clear TTL metadata cache if this was a TTL index
    if (indexToRemove.expireAfterSeconds !== undefined) {
      const cacheKey = `${collectionName}:${indexName}`
      this.ttlMetadataCache.delete(cacheKey)
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
    // Validate collection name to prevent SQL injection
    validateIdentifier(collectionName)

    const collection = this.getCollection(collectionName)
    if (!collection) {
      throw new Error(`Collection not found: ${collectionName}`)
    }

    const currentIndexes = collection.indexes
    const nIndexesWas = currentIndexes.length + 1 // +1 for _id

    // Drop all SQLite indexes
    // Index names come from stored metadata so they're already validated
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

  /**
   * Get all TTL indexes across all collections
   */
  getTTLIndexes(): TTLIndexInfo[] {
    const ttlIndexes: TTLIndexInfo[] = []

    // Get all collections
    const collections = this.storage
      .prepare('SELECT id, name, indexes FROM collections')
      .all<{ id: number; name: string; indexes: string }>()

    for (const collection of collections) {
      const indexes = JSON.parse(collection.indexes) as IndexInfo[]

      for (const index of indexes) {
        if (index.expireAfterSeconds !== undefined) {
          const field = Object.keys(index.key)[0]
          ttlIndexes.push({
            collectionName: collection.name,
            collectionId: collection.id,
            indexName: index.name,
            field,
            expireAfterSeconds: index.expireAfterSeconds,
          })
        }
      }
    }

    return ttlIndexes
  }

  /**
   * Check if a specific index is a TTL index
   */
  isTTLIndex(collectionName: string, indexName: string): boolean {
    const collection = this.getCollection(collectionName)
    if (!collection) {
      return false
    }

    const index = collection.indexes.find(idx => idx.name === indexName)
    return index?.expireAfterSeconds !== undefined
  }

  /**
   * Check if a value is a valid date for TTL purposes
   * Accepts Date objects, ISO strings, and Unix timestamps (in ms)
   */
  isValidTTLFieldValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false
    }

    if (value instanceof Date) {
      return !isNaN(value.getTime())
    }

    if (typeof value === 'string') {
      const date = new Date(value)
      return !isNaN(date.getTime())
    }

    if (typeof value === 'number') {
      // Unix timestamp in milliseconds (reasonable range: after 1970 and before year 3000)
      const date = new Date(value)
      return !isNaN(date.getTime()) && value > 0 && value < 32503680000000
    }

    return false
  }

  /**
   * Calculate expiration time for a document
   */
  calculateExpirationTime(dateValue: Date | string | number, expireAfterSeconds: number): Date {
    let date: Date

    if (dateValue instanceof Date) {
      date = dateValue
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue)
    } else {
      date = new Date(dateValue)
    }

    return new Date(date.getTime() + expireAfterSeconds * 1000)
  }

  /**
   * Check if a document is expired based on its TTL field
   */
  isDocumentExpired(
    document: Record<string, unknown>,
    field: string,
    expireAfterSeconds: number
  ): boolean {
    const fieldValue = document[field]

    if (!this.isValidTTLFieldValue(fieldValue)) {
      return false
    }

    const expiresAt = this.calculateExpirationTime(
      fieldValue as Date | string | number,
      expireAfterSeconds
    )

    return expiresAt.getTime() < Date.now()
  }

  /**
   * Build SQL query to delete expired documents for a collection
   */
  buildExpiredDocumentsQuery(
    collectionName: string,
    field: string,
    expireAfterSeconds: number
  ): ExpiredDocumentsQuery {
    // Validate field name to prevent SQL injection
    const safeField = escapeFieldPath(field)
    const jsonPath = safeField.startsWith('$') ? safeField : `$.${safeField}`
    const cutoffTime = new Date(Date.now() - expireAfterSeconds * 1000).toISOString()

    // Get collection id if it exists, otherwise use a subquery
    const collection = this.getCollection(collectionName)
    const collectionIdParam = collection?.id

    // Build DELETE query that:
    // 1. Targets documents in the specific collection
    // 2. Extracts the date field using json_extract
    // 3. Compares with the cutoff time using datetime functions
    let sql: string
    let params: unknown[]

    if (collectionIdParam !== undefined) {
      sql = `DELETE FROM documents
      WHERE collection_id = ?
      AND json_extract(data, '${jsonPath}') IS NOT NULL
      AND datetime(json_extract(data, '${jsonPath}')) < datetime(?)`
      params = [collectionIdParam, cutoffTime]
    } else {
      // Collection doesn't exist yet - use a subquery to get the id
      sql = `DELETE FROM documents
      WHERE collection_id = (SELECT id FROM collections WHERE name = ?)
      AND json_extract(data, '${jsonPath}') IS NOT NULL
      AND datetime(json_extract(data, '${jsonPath}')) < datetime(?)`
      params = [collectionName, cutoffTime]
    }

    return {
      sql,
      params,
    }
  }

  /**
   * Get TTL metadata for a specific index
   */
  getTTLMetadata(collectionName: string, indexName: string): TTLMetadata | null {
    const cacheKey = `${collectionName}:${indexName}`

    // Check cache first
    if (this.ttlMetadataCache.has(cacheKey)) {
      return this.ttlMetadataCache.get(cacheKey)!
    }

    // Load from index metadata
    const collection = this.getCollection(collectionName)
    if (!collection) {
      return null
    }

    const index = collection.indexes.find(idx => idx.name === indexName)
    if (!index || index.expireAfterSeconds === undefined) {
      return null
    }

    const field = Object.keys(index.key)[0]
    const metadata: TTLMetadata = {
      field,
      expireAfterSeconds: index.expireAfterSeconds,
    }

    this.ttlMetadataCache.set(cacheKey, metadata)
    return metadata
  }

  /**
   * Record a TTL cleanup operation for tracking purposes
   */
  recordTTLCleanup(collectionName: string, indexName: string, deletedCount: number): void {
    const cacheKey = `${collectionName}:${indexName}`
    const metadata = this.ttlMetadataCache.get(cacheKey)

    if (metadata) {
      metadata.lastCleanupAt = new Date().toISOString()
      metadata.lastCleanupCount = deletedCount
    }
  }

  /**
   * Get the next cleanup time based on the configured interval
   */
  getNextCleanupTime(): number {
    return Date.now() + this.cleanupIntervalMs
  }

  /**
   * Set the cleanup interval in milliseconds
   */
  setCleanupInterval(intervalMs: number): void {
    this.cleanupIntervalMs = intervalMs
  }

  /**
   * Run TTL cleanup across all collections with TTL indexes
   * Deletes all expired documents and returns cleanup statistics
   */
  async runTTLCleanup(): Promise<TTLCleanupResult> {
    const ttlIndexes = this.getTTLIndexes()
    let totalDeleted = 0
    const errors: string[] = []

    for (const ttlIndex of ttlIndexes) {
      try {
        const query = this.buildExpiredDocumentsQuery(
          ttlIndex.collectionName,
          ttlIndex.field,
          ttlIndex.expireAfterSeconds
        )

        if (query.sql) {
          // Execute the delete query
          const stmt = this.storage.prepare(query.sql)
          stmt.bind(...query.params).run()

          // Record the cleanup (we don't have a direct way to get affected rows in this interface)
          this.recordTTLCleanup(ttlIndex.collectionName, ttlIndex.indexName, 0)
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        errors.push(`Error cleaning ${ttlIndex.collectionName}: ${errMsg}`)
      }
    }

    const result: TTLCleanupResult = {
      ok: 1,
      collectionsProcessed: ttlIndexes.length,
      documentsDeleted: totalDeleted,
    }

    if (errors.length > 0) {
      result.errors = errors
    }

    return result
  }
}

export default IndexManager
