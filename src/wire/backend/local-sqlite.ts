/**
 * Local SQLite Backend
 *
 * Implements MondoBackend using Bun's native SQLite for local development.
 * Simplified implementation for wire protocol server.
 */

import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { ObjectId, type Document } from 'bson'
import { validateFieldPath, safeJsonPath } from '../../utils/sql-safety.js'
import type {
  MondoBackend,
  DatabaseInfo,
  CollectionInfo,
  FindOptions,
  FindResult,
  InsertResult,
  UpdateResult,
  DeleteResult,
  AggregateResult,
  CollStats,
  DbStats,
  IndexInfo,
  IndexSpec,
  CursorState,
} from './interface.js'

/** Default batch size for cursor results */
const DEFAULT_BATCH_SIZE = 101

/**
 * Validate and sanitize a database name to prevent path traversal attacks.
 * Throws an error if the name contains dangerous characters or patterns.
 *
 * SECURITY: This function is critical for preventing attacks where malicious
 * database names like "../../../etc/passwd" could be used to read/write
 * files outside the data directory.
 *
 * @throws Error if the database name is invalid or contains path traversal attempts
 */
function sanitizeDatabaseName(name: string): string {
  // Reject empty names
  if (!name || typeof name !== 'string') {
    throw new Error('Database name must be a non-empty string')
  }

  // Reject path traversal patterns
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(`Invalid database name "${name}": contains path traversal characters`)
  }

  // Reject null bytes (can bypass path checks in some systems)
  if (name.includes('\0')) {
    throw new Error('Invalid database name: contains null byte')
  }

  // Reject names starting with dots (hidden files)
  if (name.startsWith('.')) {
    throw new Error(`Invalid database name "${name}": cannot start with a dot`)
  }

  // Reject names that are too long (filesystem safety)
  if (name.length > 255) {
    throw new Error(`Database name too long: ${name.length} characters (max 255)`)
  }

  // Only allow alphanumeric, underscore, and hyphen (safe filename characters)
  // This is more restrictive than MongoDB but appropriate for filesystem safety
  const validNameRegex = /^[a-zA-Z0-9_-]+$/
  if (!validNameRegex.test(name)) {
    throw new Error(
      `Invalid database name "${name}": only alphanumeric characters, underscores, and hyphens are allowed`
    )
  }

  return name
}

/**
 * Validate a collection name to prevent injection attacks.
 * Collection names are stored in the database, not used in file paths,
 * but validation prevents SQL-related issues and maintains consistency.
 *
 * @throws Error if the collection name is invalid
 */
function validateCollectionName(name: string): string {
  // Reject empty names
  if (!name || typeof name !== 'string') {
    throw new Error('Collection name must be a non-empty string')
  }

  // Reject null bytes
  if (name.includes('\0')) {
    throw new Error('Invalid collection name: contains null byte')
  }

  // Reject names that are too long
  if (name.length > 255) {
    throw new Error(`Collection name too long: ${name.length} characters (max 255)`)
  }

  // MongoDB allows more characters in collection names, but we restrict
  // to prevent potential issues. Allow alphanumeric, underscore, hyphen, and dot.
  // Dots are allowed for namespacing (e.g., "system.users")
  const validNameRegex = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/
  if (!validNameRegex.test(name)) {
    throw new Error(
      `Invalid collection name "${name}": must start with a letter or underscore, and contain only alphanumeric characters, underscores, hyphens, and dots`
    )
  }

  // Reject system collection prefixes unless it's a known system collection
  if (name.startsWith('system.') && !['system.users', 'system.indexes', 'system.namespaces'].includes(name)) {
    throw new Error(`Invalid collection name "${name}": cannot use reserved 'system.' prefix`)
  }

  return name
}

/** Cursor timeout in milliseconds (10 minutes) */
const CURSOR_TIMEOUT_MS = 10 * 60 * 1000

type SQLParams = SQLQueryBindings[]

/**
 * Local SQLite Backend
 */
export class LocalSQLiteBackend implements MondoBackend {
  private databases: Map<string, Database> = new Map()
  private cursors: Map<bigint, CursorState> = new Map()
  private nextCursorId = 1n
  private dataDir: string

  constructor(dataDir: string = '.mondodb') {
    this.dataDir = dataDir

    // Ensure data directory exists
    const fs = require('fs')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // Start cursor cleanup interval
    setInterval(() => this.cleanupExpiredCursors(), 60000)
  }

  /**
   * Get or create a database connection
   */
  private getDatabase(name: string): Database {
    // SECURITY: Validate database name to prevent path traversal attacks
    const safeName = sanitizeDatabaseName(name)

    let db = this.databases.get(safeName)
    if (!db) {
      const dbPath = `${this.dataDir}/${safeName}.sqlite`
      db = new Database(dbPath)
      this.initializeSchema(db)
      this.databases.set(safeName, db)
    }
    return db
  }

  /**
   * Initialize the database schema
   */
  private initializeSchema(db: Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        options TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        _id TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        UNIQUE(collection_id, _id)
      );

      CREATE INDEX IF NOT EXISTS idx_documents_id ON documents(_id);
      CREATE INDEX IF NOT EXISTS idx_documents_collection_id ON documents(collection_id, _id);

      CREATE TABLE IF NOT EXISTS indexes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        key TEXT NOT NULL,
        options TEXT DEFAULT '{}',
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        UNIQUE(collection_id, name)
      );
    `)
  }

  /**
   * Get collection ID, creating collection if it doesn't exist
   */
  private getOrCreateCollectionId(db: Database, name: string): number {
    // SECURITY: Validate collection name
    const safeName = validateCollectionName(name)

    const existing = db.query('SELECT id FROM collections WHERE name = ?').get(safeName) as
      | { id: number }
      | null

    if (existing) {
      return existing.id
    }

    const result = db.query('INSERT INTO collections (name) VALUES (?) RETURNING id').get(safeName) as {
      id: number
    }
    return result.id
  }

  /**
   * Get collection ID or null if not found
   */
  private getCollectionId(db: Database, name: string): number | null {
    // SECURITY: Validate collection name
    const safeName = validateCollectionName(name)

    const result = db.query('SELECT id FROM collections WHERE name = ?').get(safeName) as
      | { id: number }
      | null
    return result?.id ?? null
  }

  // ============ Database Operations ============

  async listDatabases(): Promise<DatabaseInfo[]> {
    const fs = require('fs')
    const path = require('path')

    let files: string[] = []
    try {
      files = fs.readdirSync(this.dataDir) as string[]
    } catch {
      // Directory doesn't exist
    }

    const databases: DatabaseInfo[] = []

    for (const file of files) {
      if (file.endsWith('.sqlite')) {
        const name = file.replace('.sqlite', '')
        const filePath = path.join(this.dataDir, file)
        const stats = fs.statSync(filePath)

        databases.push({
          name,
          sizeOnDisk: stats.size,
          empty: stats.size < 1000,
        })
      }
    }

    // Always include admin database
    if (!databases.find((d) => d.name === 'admin')) {
      databases.unshift({ name: 'admin', sizeOnDisk: 0, empty: true })
    }

    return databases
  }

  async createDatabase(name: string): Promise<void> {
    this.getDatabase(name)
  }

  async dropDatabase(name: string): Promise<void> {
    // SECURITY: Validate database name to prevent path traversal attacks
    const safeName = sanitizeDatabaseName(name)

    const db = this.databases.get(safeName)
    if (db) {
      db.close()
      this.databases.delete(safeName)
    }

    const fs = require('fs')
    const dbPath = `${this.dataDir}/${safeName}.sqlite`
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath)
    }
  }

  async databaseExists(name: string): Promise<boolean> {
    // SECURITY: Validate database name to prevent path traversal attacks
    const safeName = sanitizeDatabaseName(name)

    const fs = require('fs')
    return fs.existsSync(`${this.dataDir}/${safeName}.sqlite`)
  }

  // ============ Collection Operations ============

  async listCollections(dbName: string, filter?: Document): Promise<CollectionInfo[]> {
    const db = this.getDatabase(dbName)

    let query = 'SELECT name, options FROM collections'
    const params: SQLParams = []

    if (filter?.name && typeof filter.name === 'string') {
      query += ' WHERE name = ?'
      params.push(filter.name)
    }

    const rows = db.query(query).all(...params) as Array<{ name: string; options: string }>

    return rows.map((row) => ({
      name: row.name,
      type: 'collection' as const,
      options: JSON.parse(row.options) as Document,
      info: { readOnly: false },
    }))
  }

  async createCollection(dbName: string, name: string, options?: Document): Promise<void> {
    // SECURITY: Validate collection name
    const safeName = validateCollectionName(name)

    const db = this.getDatabase(dbName)
    const optionsJson = JSON.stringify(options || {})
    db.query('INSERT OR IGNORE INTO collections (name, options) VALUES (?, ?)').run(safeName, optionsJson)
  }

  async dropCollection(dbName: string, name: string): Promise<void> {
    // SECURITY: Validate collection name
    const safeName = validateCollectionName(name)

    const db = this.getDatabase(dbName)
    db.query('DELETE FROM collections WHERE name = ?').run(safeName)
  }

  async collectionExists(dbName: string, name: string): Promise<boolean> {
    // SECURITY: Validate collection name
    const safeName = validateCollectionName(name)

    const db = this.getDatabase(dbName)
    const result = db.query('SELECT 1 FROM collections WHERE name = ? LIMIT 1').get(safeName)
    return result !== null
  }

  async collStats(dbName: string, collection: string): Promise<CollStats> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (!collectionId) {
      return {
        ns: `${dbName}.${collection}`,
        count: 0,
        size: 0,
        avgObjSize: 0,
        storageSize: 0,
        totalIndexSize: 0,
        nindexes: 1,
        indexSizes: { _id_: 0 },
      }
    }

    const stats = db
      .query(`
        SELECT COUNT(*) as count, COALESCE(SUM(LENGTH(data)), 0) as size
        FROM documents WHERE collection_id = ?
      `)
      .get(collectionId) as { count: number; size: number }

    return {
      ns: `${dbName}.${collection}`,
      count: stats.count,
      size: stats.size,
      avgObjSize: stats.count > 0 ? stats.size / stats.count : 0,
      storageSize: stats.size,
      totalIndexSize: stats.count * 50,
      nindexes: 1,
      indexSizes: { _id_: stats.count * 50 },
    }
  }

  async dbStats(dbName: string): Promise<DbStats> {
    const db = this.getDatabase(dbName)

    const collectionStats = db
      .query('SELECT COUNT(DISTINCT id) as collections FROM collections')
      .get() as { collections: number }

    const docStats = db
      .query('SELECT COUNT(*) as objects, COALESCE(SUM(LENGTH(data)), 0) as dataSize FROM documents')
      .get() as { objects: number; dataSize: number }

    return {
      db: dbName,
      collections: collectionStats.collections,
      views: 0,
      objects: docStats.objects,
      avgObjSize: docStats.objects > 0 ? docStats.dataSize / docStats.objects : 0,
      dataSize: docStats.dataSize,
      storageSize: docStats.dataSize,
      indexes: collectionStats.collections,
      indexSize: docStats.objects * 50,
    }
  }

  // ============ CRUD Operations ============

  async find(dbName: string, collection: string, options: FindOptions): Promise<FindResult> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (!collectionId) {
      return { documents: [], cursorId: 0n, hasMore: false }
    }

    let sql = 'SELECT _id, data FROM documents WHERE collection_id = ?'
    const params: SQLParams = [collectionId]

    // Build filter (simplified)
    if (options.filter && Object.keys(options.filter).length > 0) {
      const filterSql = this.buildFilterSql(options.filter, params)
      if (filterSql) {
        sql += ` AND (${filterSql})`
      }
    }

    // Add sorting
    if (options.sort) {
      const sortClauses: string[] = []
      for (const [field, direction] of Object.entries(options.sort)) {
        const dir = direction === -1 ? 'DESC' : 'ASC'
        if (field === '_id') {
          sortClauses.push(`_id ${dir}`)
        } else {
          // Validate field name to prevent SQL injection
          const safePath = safeJsonPath(validateFieldPath(field))
          sortClauses.push(`json_extract(data, '${safePath}') ${dir}`)
        }
      }
      if (sortClauses.length > 0) {
        sql += ` ORDER BY ${sortClauses.join(', ')}`
      }
    }

    // Add limit and offset
    if (options.limit && options.limit > 0) {
      sql += ` LIMIT ${options.limit}`
    }
    if (options.skip && options.skip > 0) {
      sql += ` OFFSET ${options.skip}`
    }

    const rows = db.query(sql).all(...params) as Array<{ _id: string; data: string }>

    let documents = rows.map((row) => {
      const doc = JSON.parse(row.data) as Document
      doc._id = this.parseId(row._id)
      return doc
    })

    // Apply projection
    if (options.projection) {
      documents = documents.map((doc) => this.applyProjection(doc, options.projection!))
    }

    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE

    // Handle cursor for large result sets
    if (documents.length > batchSize) {
      const cursorId = this.nextCursorId++
      this.cursors.set(cursorId, {
        id: cursorId,
        namespace: `${dbName}.${collection}`,
        documents,
        position: batchSize,
        batchSize,
        createdAt: Date.now(),
      })

      return {
        documents: documents.slice(0, batchSize),
        cursorId,
        hasMore: true,
      }
    }

    return { documents, cursorId: 0n, hasMore: false }
  }

  async insertOne(dbName: string, collection: string, doc: Document): Promise<InsertResult> {
    return this.insertMany(dbName, collection, [doc])
  }

  async insertMany(dbName: string, collection: string, docs: Document[]): Promise<InsertResult> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getOrCreateCollectionId(db, collection)

    const insertedIds = new Map<number, unknown>()
    let insertedCount = 0

    const stmt = db.prepare('INSERT INTO documents (collection_id, _id, data) VALUES (?, ?, ?)')

    db.transaction(() => {
      for (let i = 0; i < docs.length; i++) {
        const doc = { ...docs[i] }

        if (!doc._id) {
          doc._id = new ObjectId()
        }

        const idStr = this.serializeId(doc._id)
        const dataJson = JSON.stringify(doc)

        stmt.run(collectionId, idStr, dataJson)
        insertedIds.set(i, doc._id)
        insertedCount++
      }
    })()

    return { acknowledged: true, insertedIds, insertedCount }
  }

  async updateOne(
    dbName: string,
    collection: string,
    filter: Document,
    update: Document,
    options?: { upsert?: boolean }
  ): Promise<UpdateResult> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (!collectionId && !options?.upsert) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
    }

    // Find the document
    let sql = 'SELECT id, _id, data FROM documents WHERE collection_id = ?'
    const params: SQLParams = [collectionId || 0]

    const filterSql = this.buildFilterSql(filter, params)
    if (filterSql) {
      sql += ` AND (${filterSql})`
    }
    sql += ' LIMIT 1'

    const row = db.query(sql).get(...params) as { id: number; _id: string; data: string } | null

    if (!row) {
      if (options?.upsert) {
        const cid = this.getOrCreateCollectionId(db, collection)
        const newDoc = { ...filter } as Document
        const updatedDoc = this.applyUpdate(newDoc, update)
        if (!updatedDoc._id) {
          updatedDoc._id = new ObjectId()
        }
        const idStr = this.serializeId(updatedDoc._id)
        db.query('INSERT INTO documents (collection_id, _id, data) VALUES (?, ?, ?)').run(
          cid,
          idStr,
          JSON.stringify(updatedDoc)
        )
        return {
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedId: updatedDoc._id,
          upsertedCount: 1,
        }
      }
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
    }

    const doc = JSON.parse(row.data) as Document
    doc._id = this.parseId(row._id)
    const updatedDoc = this.applyUpdate(doc, update)

    db.query('UPDATE documents SET data = ? WHERE id = ?').run(JSON.stringify(updatedDoc), row.id)

    return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
  }

  async updateMany(
    dbName: string,
    collection: string,
    filter: Document,
    update: Document,
    options?: { upsert?: boolean }
  ): Promise<UpdateResult> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (!collectionId) {
      if (options?.upsert) {
        const result = await this.updateOne(dbName, collection, filter, update, options)
        return result
      }
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 }
    }

    let sql = 'SELECT id, _id, data FROM documents WHERE collection_id = ?'
    const params: SQLParams = [collectionId]

    const filterSql = this.buildFilterSql(filter, params)
    if (filterSql) {
      sql += ` AND (${filterSql})`
    }

    const rows = db.query(sql).all(...params) as Array<{ id: number; _id: string; data: string }>

    if (rows.length === 0 && options?.upsert) {
      const result = await this.updateOne(dbName, collection, filter, update, options)
      return result
    }

    const stmt = db.prepare('UPDATE documents SET data = ? WHERE id = ?')

    db.transaction(() => {
      for (const row of rows) {
        const doc = JSON.parse(row.data) as Document
        doc._id = this.parseId(row._id)
        const updatedDoc = this.applyUpdate(doc, update)
        stmt.run(JSON.stringify(updatedDoc), row.id)
      }
    })()

    return {
      acknowledged: true,
      matchedCount: rows.length,
      modifiedCount: rows.length,
      upsertedCount: 0,
    }
  }

  async deleteOne(dbName: string, collection: string, filter: Document): Promise<DeleteResult> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (!collectionId) {
      return { acknowledged: true, deletedCount: 0 }
    }

    // Find one document first
    let sql = 'SELECT id FROM documents WHERE collection_id = ?'
    const params: SQLParams = [collectionId]

    const filterSql = this.buildFilterSql(filter, params)
    if (filterSql) {
      sql += ` AND (${filterSql})`
    }
    sql += ' LIMIT 1'

    const row = db.query(sql).get(...params) as { id: number } | null

    if (!row) {
      return { acknowledged: true, deletedCount: 0 }
    }

    db.query('DELETE FROM documents WHERE id = ?').run(row.id)
    return { acknowledged: true, deletedCount: 1 }
  }

  async deleteMany(dbName: string, collection: string, filter: Document): Promise<DeleteResult> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (!collectionId) {
      return { acknowledged: true, deletedCount: 0 }
    }

    let sql = 'DELETE FROM documents WHERE collection_id = ?'
    const params: SQLParams = [collectionId]

    const filterSql = this.buildFilterSql(filter, params)
    if (filterSql) {
      sql += ` AND (${filterSql})`
    }

    const result = db.query(sql).run(...params)
    return { acknowledged: true, deletedCount: result.changes }
  }

  // ============ Count & Distinct ============

  async count(dbName: string, collection: string, query?: Document): Promise<number> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (!collectionId) {
      return 0
    }

    let sql = 'SELECT COUNT(*) as count FROM documents WHERE collection_id = ?'
    const params: SQLParams = [collectionId]

    if (query && Object.keys(query).length > 0) {
      const filterSql = this.buildFilterSql(query, params)
      if (filterSql) {
        sql += ` AND (${filterSql})`
      }
    }

    const result = db.query(sql).get(...params) as { count: number }
    return result.count
  }

  async distinct(
    dbName: string,
    collection: string,
    field: string,
    query?: Document
  ): Promise<unknown[]> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (!collectionId) {
      return []
    }

    let sql: string
    if (field === '_id') {
      sql = 'SELECT DISTINCT _id as value FROM documents WHERE collection_id = ?'
    } else {
      // Validate field name to prevent SQL injection
      const safePath = safeJsonPath(validateFieldPath(field))
      sql = `SELECT DISTINCT json_extract(data, '${safePath}') as value FROM documents WHERE collection_id = ?`
    }
    const params: SQLParams = [collectionId]

    if (query && Object.keys(query).length > 0) {
      const filterSql = this.buildFilterSql(query, params)
      if (filterSql) {
        sql += ` AND (${filterSql})`
      }
    }

    const rows = db.query(sql).all(...params) as Array<{ value: unknown }>
    return rows.map((r) => r.value).filter((v) => v !== null)
  }

  // ============ Aggregation ============

  async aggregate(
    dbName: string,
    collection: string,
    pipeline: Document[],
    options?: { batchSize?: number }
  ): Promise<AggregateResult> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (!collectionId) {
      return { documents: [], cursorId: 0n, hasMore: false }
    }

    // Get all documents for in-memory processing
    const rows = db
      .query('SELECT _id, data FROM documents WHERE collection_id = ?')
      .all(collectionId) as Array<{ _id: string; data: string }>

    let documents = rows.map((row) => {
      const doc = JSON.parse(row.data) as Document
      doc._id = this.parseId(row._id)
      return doc
    })

    // Apply pipeline stages
    documents = this.applyPipeline(documents, pipeline)

    const batchSize = options?.batchSize || DEFAULT_BATCH_SIZE

    if (documents.length > batchSize) {
      const cursorId = this.nextCursorId++
      this.cursors.set(cursorId, {
        id: cursorId,
        namespace: `${dbName}.${collection}`,
        documents,
        position: batchSize,
        batchSize,
        createdAt: Date.now(),
      })

      return {
        documents: documents.slice(0, batchSize),
        cursorId,
        hasMore: true,
      }
    }

    return { documents, cursorId: 0n, hasMore: false }
  }

  // ============ Index Operations ============

  async listIndexes(dbName: string, collection: string): Promise<IndexInfo[]> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    const indexes: IndexInfo[] = [{ v: 2, key: { _id: 1 }, name: '_id_' }]

    if (!collectionId) {
      return indexes
    }

    const rows = db
      .query('SELECT name, key, options FROM indexes WHERE collection_id = ?')
      .all(collectionId) as Array<{ name: string; key: string; options: string }>

    for (const row of rows) {
      indexes.push({
        v: 2,
        key: JSON.parse(row.key) as Document,
        name: row.name,
        ...(JSON.parse(row.options) as Document),
      })
    }

    return indexes
  }

  async createIndexes(dbName: string, collection: string, indexes: IndexSpec[]): Promise<string[]> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getOrCreateCollectionId(db, collection)

    const createdNames: string[] = []
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO indexes (collection_id, name, key, options) VALUES (?, ?, ?, ?)'
    )

    for (const spec of indexes) {
      const name = spec.name || this.generateIndexName(spec.key)
      const keyJson = JSON.stringify(spec.key)
      const options: Document = {}
      if (spec.unique) options.unique = true
      if (spec.sparse) options.sparse = true

      const result = stmt.run(collectionId, name, keyJson, JSON.stringify(options))
      if (result.changes > 0) {
        createdNames.push(name)
      }
    }

    return createdNames
  }

  async dropIndex(dbName: string, collection: string, indexName: string): Promise<void> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (collectionId) {
      db.query('DELETE FROM indexes WHERE collection_id = ? AND name = ?').run(
        collectionId,
        indexName
      )
    }
  }

  async dropIndexes(dbName: string, collection: string): Promise<void> {
    const db = this.getDatabase(dbName)
    const collectionId = this.getCollectionId(db, collection)

    if (collectionId) {
      db.query("DELETE FROM indexes WHERE collection_id = ? AND name != '_id_'").run(collectionId)
    }
  }

  // ============ Cursor Management ============

  createCursor(state: CursorState): void {
    this.cursors.set(state.id, state)
  }

  getCursor(id: bigint): CursorState | undefined {
    return this.cursors.get(id)
  }

  advanceCursor(id: bigint, count: number): Document[] {
    const cursor = this.cursors.get(id)
    if (!cursor) {
      return []
    }

    const start = cursor.position
    const end = Math.min(start + count, cursor.documents.length)
    cursor.position = end

    return cursor.documents.slice(start, end)
  }

  closeCursor(id: bigint): boolean {
    return this.cursors.delete(id)
  }

  cleanupExpiredCursors(): void {
    const now = Date.now()
    for (const [id, cursor] of this.cursors) {
      if (now - cursor.createdAt > CURSOR_TIMEOUT_MS) {
        this.cursors.delete(id)
      }
    }
  }

  // ============ Helper Methods ============

  private serializeId(id: unknown): string {
    if (id instanceof ObjectId) {
      return id.toHexString()
    }
    if (typeof id === 'object' && id !== null && '$oid' in id) {
      return (id as { $oid: string }).$oid
    }
    return String(id)
  }

  private parseId(idStr: string): ObjectId | string {
    if (/^[0-9a-f]{24}$/i.test(idStr)) {
      return new ObjectId(idStr)
    }
    return idStr
  }

  private generateIndexName(key: Document): string {
    return Object.entries(key)
      .map(([field, dir]) => `${field}_${dir}`)
      .join('_')
  }

  /**
   * Build simplified SQL filter from MongoDB query
   */
  private buildFilterSql(filter: Document, params: SQLParams): string {
    const conditions: string[] = []

    for (const [key, value] of Object.entries(filter)) {
      if (key === '_id') {
        params.push(this.serializeId(value))
        conditions.push('_id = ?')
      } else if (key === '$and' && Array.isArray(value)) {
        const subConditions = value
          .map((sub) => this.buildFilterSql(sub as Document, params))
          .filter(Boolean)
        if (subConditions.length > 0) {
          conditions.push(`(${subConditions.join(' AND ')})`)
        }
      } else if (key === '$or' && Array.isArray(value)) {
        const subConditions = value
          .map((sub) => this.buildFilterSql(sub as Document, params))
          .filter(Boolean)
        if (subConditions.length > 0) {
          conditions.push(`(${subConditions.join(' OR ')})`)
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle operators
        // Validate field name to prevent SQL injection
        const safePath = safeJsonPath(validateFieldPath(key))
        for (const [op, opValue] of Object.entries(value as Document)) {
          const path = `json_extract(data, '${safePath}')`
          switch (op) {
            case '$eq':
              params.push(opValue as SQLQueryBindings)
              conditions.push(`${path} = ?`)
              break
            case '$ne':
              params.push(opValue as SQLQueryBindings)
              conditions.push(`${path} != ?`)
              break
            case '$gt':
              params.push(opValue as SQLQueryBindings)
              conditions.push(`${path} > ?`)
              break
            case '$gte':
              params.push(opValue as SQLQueryBindings)
              conditions.push(`${path} >= ?`)
              break
            case '$lt':
              params.push(opValue as SQLQueryBindings)
              conditions.push(`${path} < ?`)
              break
            case '$lte':
              params.push(opValue as SQLQueryBindings)
              conditions.push(`${path} <= ?`)
              break
            case '$exists':
              conditions.push(opValue ? `${path} IS NOT NULL` : `${path} IS NULL`)
              break
            case '$in':
              if (Array.isArray(opValue) && opValue.length > 0) {
                const placeholders = opValue.map(() => '?').join(', ')
                params.push(...(opValue as SQLQueryBindings[]))
                conditions.push(`${path} IN (${placeholders})`)
              }
              break
          }
        }
      } else {
        // Direct equality
        // Validate field name to prevent SQL injection
        const safePath = safeJsonPath(validateFieldPath(key))
        const sqlValue = typeof value === 'boolean' ? (value ? 1 : 0) : value
        params.push(sqlValue as SQLQueryBindings)
        conditions.push(`json_extract(data, '${safePath}') = ?`)
      }
    }

    return conditions.join(' AND ')
  }

  private applyProjection(doc: Document, projection: Document): Document {
    const includeFields = new Set<string>()
    const excludeFields = new Set<string>()
    let isInclusion = false

    for (const [field, value] of Object.entries(projection)) {
      if (field === '_id' && (value === 0 || value === false)) {
        excludeFields.add('_id')
        continue
      }

      if (value === 1 || value === true) {
        includeFields.add(field)
        isInclusion = true
      } else if (value === 0 || value === false) {
        excludeFields.add(field)
      }
    }

    if (isInclusion) {
      const result: Document = {}
      if (!excludeFields.has('_id')) {
        result._id = doc._id
      }
      for (const field of includeFields) {
        if (field in doc) {
          result[field] = doc[field]
        }
      }
      return result
    }

    const result = { ...doc }
    for (const field of excludeFields) {
      delete result[field]
    }
    return result
  }

  private applyUpdate(doc: Document, update: Document): Document {
    const result = { ...doc }

    if (update.$set) {
      Object.assign(result, update.$set as Document)
    }

    if (update.$unset) {
      for (const key of Object.keys(update.$unset as Document)) {
        delete result[key]
      }
    }

    if (update.$inc) {
      for (const [key, value] of Object.entries(update.$inc as Document)) {
        const current = (result[key] as number) || 0
        result[key] = current + (value as number)
      }
    }

    if (update.$push) {
      for (const [key, value] of Object.entries(update.$push as Document)) {
        const current = (result[key] as unknown[]) || []
        if (typeof value === 'object' && value !== null && '$each' in value) {
          current.push(...((value as Document).$each as unknown[]))
        } else {
          current.push(value)
        }
        result[key] = current
      }
    }

    // Handle replacement (no operators)
    const hasOperators = Object.keys(update).some((k) => k.startsWith('$'))
    if (!hasOperators) {
      const id = result._id
      for (const key of Object.keys(result)) {
        if (key !== '_id') delete result[key]
      }
      Object.assign(result, update)
      result._id = id
    }

    return result
  }

  private applyPipeline(documents: Document[], pipeline: Document[]): Document[] {
    let result = [...documents]

    for (const stage of pipeline) {
      const [op, value] = Object.entries(stage)[0]

      switch (op) {
        case '$match':
          result = result.filter((doc) => this.matchDocument(doc, value as Document))
          break

        case '$project':
          result = result.map((doc) => this.applyProjection(doc, value as Document))
          break

        case '$sort':
          result = this.sortDocuments(result, value as Document)
          break

        case '$limit':
          result = result.slice(0, value as number)
          break

        case '$skip':
          result = result.slice(value as number)
          break

        case '$count':
          result = [{ [value as string]: result.length }]
          break

        case '$sample':
          const size = (value as { size: number }).size || 100
          result = this.shuffleArray(result).slice(0, size)
          break

        case '$group':
          result = this.groupDocuments(result, value as Document)
          break
      }
    }

    return result
  }

  private matchDocument(doc: Document, query: Document): boolean {
    for (const [key, value] of Object.entries(query)) {
      if (key === '$and') {
        if (!(value as Document[]).every((q) => this.matchDocument(doc, q))) {
          return false
        }
        continue
      }
      if (key === '$or') {
        if (!(value as Document[]).some((q) => this.matchDocument(doc, q))) {
          return false
        }
        continue
      }

      const docValue = doc[key]

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const [op, opValue] of Object.entries(value as Document)) {
          switch (op) {
            case '$eq':
              if (docValue !== opValue) return false
              break
            case '$ne':
              if (docValue === opValue) return false
              break
            case '$gt':
              if (!((docValue as number) > (opValue as number))) return false
              break
            case '$gte':
              if (!((docValue as number) >= (opValue as number))) return false
              break
            case '$lt':
              if (!((docValue as number) < (opValue as number))) return false
              break
            case '$lte':
              if (!((docValue as number) <= (opValue as number))) return false
              break
            case '$in':
              if (!(opValue as unknown[]).includes(docValue)) return false
              break
            case '$exists':
              if ((opValue && docValue === undefined) || (!opValue && docValue !== undefined))
                return false
              break
          }
        }
      } else {
        if (docValue !== value) return false
      }
    }
    return true
  }

  private sortDocuments(documents: Document[], sort: Document): Document[] {
    return [...documents].sort((a, b) => {
      for (const [field, direction] of Object.entries(sort)) {
        const aVal = a[field]
        const bVal = b[field]
        const dir = direction === -1 ? -1 : 1

        if (aVal === bVal) continue
        if (aVal === undefined || aVal === null) return dir
        if (bVal === undefined || bVal === null) return -dir
        if ((aVal as number) < (bVal as number)) return -dir
        if ((aVal as number) > (bVal as number)) return dir
      }
      return 0
    })
  }

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  private groupDocuments(documents: Document[], groupSpec: Document): Document[] {
    const groups = new Map<string, Document[]>()
    const idSpec = groupSpec._id

    for (const doc of documents) {
      let groupKey: string
      if (idSpec === null) {
        groupKey = '__all__'
      } else if (typeof idSpec === 'string' && idSpec.startsWith('$')) {
        groupKey = JSON.stringify(doc[idSpec.slice(1)])
      } else {
        groupKey = JSON.stringify(idSpec)
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push(doc)
    }

    const result: Document[] = []
    for (const [key, docs] of groups) {
      const grouped: Document = { _id: key === '__all__' ? null : JSON.parse(key) }

      for (const [field, spec] of Object.entries(groupSpec)) {
        if (field === '_id') continue

        if (typeof spec === 'object' && spec !== null) {
          const [op, value] = Object.entries(spec as Document)[0]
          const fieldPath =
            typeof value === 'string' && value.startsWith('$') ? value.slice(1) : null

          switch (op) {
            case '$sum':
              if (value === 1) {
                grouped[field] = docs.length
              } else if (fieldPath) {
                grouped[field] = docs.reduce((sum, doc) => sum + ((doc[fieldPath] as number) || 0), 0)
              }
              break
            case '$avg':
              if (fieldPath) {
                const values = docs.map((doc) => doc[fieldPath]).filter((v) => typeof v === 'number') as number[]
                grouped[field] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null
              }
              break
            case '$first':
              if (fieldPath && docs.length > 0) {
                grouped[field] = docs[0][fieldPath]
              }
              break
            case '$last':
              if (fieldPath && docs.length > 0) {
                grouped[field] = docs[docs.length - 1][fieldPath]
              }
              break
          }
        }
      }

      result.push(grouped)
    }

    return result
  }

  /**
   * Close all database connections
   */
  close(): void {
    for (const db of this.databases.values()) {
      db.close()
    }
    this.databases.clear()
    this.cursors.clear()
  }
}
