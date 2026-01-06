// Import from node-specific path for file: URL support
// The generic '@libsql/client' uses web client which doesn't support file: URLs
import { createClient, type Client } from '@libsql/client/node'
import { nanoid } from 'nanoid'
import type {
  StorageAdapter,
  Document,
  Filter,
  FindOptions,
  UpdateOperators,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
} from './types'

export interface LibSQLStorageAdapterOptions {
  database: string
  dataDir?: string
  options?: {
    journalMode?: string
  }
}

type ConstructorArg = string | LibSQLStorageAdapterOptions

export class LibSQLStorageAdapter implements StorageAdapter {
  private client: Client | null = null
  private connected: boolean = false
  private dbPath: string
  private initialized: boolean = false

  constructor(config: ConstructorArg) {
    if (typeof config === 'string') {
      // In-memory or direct connection string
      this.dbPath = config
      if (config === ':memory:') {
        this.client = createClient({ url: ':memory:' })
        this.connected = true
      } else {
        this.client = createClient({ url: `file:${config}` })
        this.connected = true
      }
    } else {
      // Options-based configuration
      const { database, dataDir } = config

      // Validate database name
      if (!database || database.trim() === '') {
        throw new Error('Invalid database name: name cannot be empty')
      }
      if (database.includes('/') || database.includes('\\')) {
        throw new Error('Invalid database name: path separators not allowed')
      }

      const baseDir = dataDir || process.cwd()
      this.dbPath = `${baseDir}/.mongo/${database}.db`

      // Create directory synchronously if needed
      this.ensureDir(`${baseDir}/.mongo`)

      this.client = createClient({ url: `file:${this.dbPath}` })
      this.connected = true
    }
  }

  private ensureDir(dir: string): void {
    try {
      const fs = require('fs')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    } catch {
      // Ignore errors - libsql may create the directory
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    this.ensureConnected()

    await this.client!.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data JSON NOT NULL,
        PRIMARY KEY (collection, id)
      )
    `)

    this.initialized = true
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  private ensureConnected(): void {
    if (!this.connected || !this.client) {
      throw new Error('Database connection is closed or not connected')
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  getDatabasePath(): string {
    return this.dbPath
  }

  async close(): Promise<void> {
    if (this.client && this.connected) {
      this.client.close()
      this.connected = false
      this.client = null
    }
  }

  async insertOne(collection: string, doc: Document): Promise<InsertOneResult> {
    await this.ensureInitialized()
    this.ensureConnected()

    const id = doc._id ?? nanoid()
    const docWithId = { ...doc, _id: id }

    try {
      await this.client!.execute({
        sql: 'INSERT INTO documents (collection, id, data) VALUES (?, ?, ?)',
        args: [collection, id, JSON.stringify(docWithId)],
      })

      return {
        acknowledged: true,
        insertedId: id,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('UNIQUE constraint failed') || message.includes('SQLITE_CONSTRAINT')) {
        throw new Error(`Duplicate _id: ${id}`)
      }
      throw error
    }
  }

  async insertMany(collection: string, docs: Document[]): Promise<InsertManyResult> {
    await this.ensureInitialized()
    this.ensureConnected()

    const insertedIds: Record<number, string> = {}

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]
      const id = doc._id ?? nanoid()
      const docWithId = { ...doc, _id: id }

      await this.client!.execute({
        sql: 'INSERT INTO documents (collection, id, data) VALUES (?, ?, ?)',
        args: [collection, id, JSON.stringify(docWithId)],
      })

      insertedIds[i] = id
    }

    return {
      acknowledged: true,
      insertedCount: docs.length,
      insertedIds,
    }
  }

  async findOne(collection: string, filter: Filter): Promise<Document | null> {
    await this.ensureInitialized()
    this.ensureConnected()

    const docs = await this.find(collection, filter, { limit: 1 })
    return docs.length > 0 ? docs[0] : null
  }

  async find(collection: string, filter: Filter, options?: FindOptions): Promise<Document[]> {
    await this.ensureInitialized()
    this.ensureConnected()

    // First, get all documents from the collection
    const result = await this.client!.execute({
      sql: 'SELECT data FROM documents WHERE collection = ?',
      args: [collection],
    })

    let docs: Document[] = result.rows.map((row) => {
      const data = row.data as string
      return JSON.parse(data) as Document
    })

    // Apply filter in JavaScript
    docs = docs.filter((doc) => this.matchesFilter(doc, filter))

    // Apply sort
    if (options?.sort) {
      const sortKeys = Object.keys(options.sort)
      if (sortKeys.length > 0) {
        docs.sort((a, b) => {
          for (const key of sortKeys) {
            const direction = options.sort![key]
            const aVal = this.getNestedValue(a, key)
            const bVal = this.getNestedValue(b, key)

            if (aVal < bVal) return -1 * direction
            if (aVal > bVal) return 1 * direction
          }
          return 0
        })
      }
    }

    // Apply skip
    if (options?.skip) {
      docs = docs.slice(options.skip)
    }

    // Apply limit
    if (options?.limit) {
      docs = docs.slice(0, options.limit)
    }

    // Apply projection
    if (options?.projection) {
      docs = docs.map((doc) => this.applyProjection(doc, options.projection!))
    }

    return docs
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split('.')
    let current: unknown = obj
    for (const part of parts) {
      if (current === null || current === undefined) return undefined
      current = (current as Record<string, unknown>)[part]
    }
    return current
  }

  private applyProjection(doc: Document, projection: Record<string, 0 | 1>): Document {
    const keys = Object.keys(projection)
    if (keys.length === 0) return doc

    const hasInclusion = Object.values(projection).some((v) => v === 1)
    const hasExclusion = Object.values(projection).some((v) => v === 0)

    if (hasInclusion && !hasExclusion) {
      // Inclusion mode - only include specified fields (and _id)
      const result: Document = { _id: doc._id }
      for (const key of keys) {
        if (projection[key] === 1 && key !== '_id') {
          result[key] = doc[key]
        }
      }
      return result
    } else {
      // Exclusion mode - exclude specified fields
      const result: Document = { ...doc }
      for (const key of keys) {
        if (projection[key] === 0) {
          delete result[key]
        }
      }
      return result
    }
  }

  private matchesFilter(doc: Document, filter: Filter): boolean {
    // Handle $and operator
    if (filter.$and) {
      const conditions = filter.$and as Filter[]
      return conditions.every((cond) => this.matchesFilter(doc, cond))
    }

    // Handle $or operator
    if (filter.$or) {
      const conditions = filter.$or as Filter[]
      return conditions.some((cond) => this.matchesFilter(doc, cond))
    }

    // Handle field-level conditions
    for (const [key, value] of Object.entries(filter)) {
      if (key === '$and' || key === '$or') continue

      const docValue = this.getNestedValue(doc, key)

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Check for operators
        const ops = value as Record<string, unknown>

        if ('$eq' in ops) {
          if (docValue !== ops.$eq) return false
        }
        if ('$ne' in ops) {
          if (docValue === ops.$ne) return false
        }
        if ('$gt' in ops) {
          if (docValue === undefined || docValue === null || (docValue as number) <= (ops.$gt as number)) return false
        }
        if ('$gte' in ops) {
          if (docValue === undefined || docValue === null || (docValue as number) < (ops.$gte as number)) return false
        }
        if ('$lt' in ops) {
          if (docValue === undefined || docValue === null || (docValue as number) >= (ops.$lt as number)) return false
        }
        if ('$lte' in ops) {
          if (docValue === undefined || docValue === null || (docValue as number) > (ops.$lte as number)) return false
        }
        if ('$in' in ops) {
          const inValues = ops.$in as unknown[]
          if (!inValues.includes(docValue)) return false
        }
        if ('$nin' in ops) {
          const ninValues = ops.$nin as unknown[]
          if (ninValues.includes(docValue)) return false
        }

        // If no operators found, it's a nested object equality check
        const hasOperator = Object.keys(ops).some((k) => k.startsWith('$'))
        if (!hasOperator) {
          if (JSON.stringify(docValue) !== JSON.stringify(value)) return false
        }
      } else {
        // Direct equality
        if (docValue !== value) return false
      }
    }

    return true
  }

  async updateOne(
    collection: string,
    filter: Filter,
    update: UpdateOperators,
    options?: { upsert?: boolean }
  ): Promise<UpdateResult> {
    await this.ensureInitialized()
    this.ensureConnected()

    const docs = await this.find(collection, filter, { limit: 1 })

    if (docs.length === 0) {
      if (options?.upsert) {
        // Generate ID from filter if it has _id, otherwise generate new one
        const id = (filter._id as string) ?? nanoid()
        const newDoc: Document = { _id: id }

        // Apply $set
        if (update.$set) {
          Object.assign(newDoc, update.$set)
        }

        await this.client!.execute({
          sql: 'INSERT INTO documents (collection, id, data) VALUES (?, ?, ?)',
          args: [collection, id, JSON.stringify(newDoc)],
        })

        return {
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedCount: 1,
          upsertedId: id,
        }
      }

      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
      }
    }

    const doc = docs[0]
    const updatedDoc = this.applyUpdate(doc, update)

    await this.client!.execute({
      sql: 'UPDATE documents SET data = ? WHERE collection = ? AND id = ?',
      args: [JSON.stringify(updatedDoc), collection, doc._id as string],
    })

    return {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
    }
  }

  async updateMany(collection: string, filter: Filter, update: UpdateOperators): Promise<UpdateResult> {
    await this.ensureInitialized()
    this.ensureConnected()

    const docs = await this.find(collection, filter)

    if (docs.length === 0) {
      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 0,
      }
    }

    for (const doc of docs) {
      const updatedDoc = this.applyUpdate(doc, update)
      await this.client!.execute({
        sql: 'UPDATE documents SET data = ? WHERE collection = ? AND id = ?',
        args: [JSON.stringify(updatedDoc), collection, doc._id as string],
      })
    }

    return {
      acknowledged: true,
      matchedCount: docs.length,
      modifiedCount: docs.length,
      upsertedCount: 0,
    }
  }

  private applyUpdate(doc: Document, update: UpdateOperators): Document {
    const result = { ...doc }

    // Handle $set
    if (update.$set) {
      for (const [key, value] of Object.entries(update.$set)) {
        result[key] = value
      }
    }

    // Handle $unset
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) {
        delete result[key]
      }
    }

    // Handle $inc
    if (update.$inc) {
      for (const [key, value] of Object.entries(update.$inc)) {
        const currentVal = (result[key] as number) ?? 0
        result[key] = currentVal + value
      }
    }

    // Handle $push
    if (update.$push) {
      for (const [key, value] of Object.entries(update.$push)) {
        const arr = result[key] as unknown[]
        if (Array.isArray(arr)) {
          result[key] = [...arr, value]
        } else {
          result[key] = [value]
        }
      }
    }

    // Handle $pull
    if (update.$pull) {
      for (const [key, value] of Object.entries(update.$pull)) {
        const arr = result[key] as unknown[]
        if (Array.isArray(arr)) {
          result[key] = arr.filter((item) => item !== value)
        }
      }
    }

    return result
  }

  async deleteOne(collection: string, filter: Filter): Promise<DeleteResult> {
    await this.ensureInitialized()
    this.ensureConnected()

    const docs = await this.find(collection, filter, { limit: 1 })

    if (docs.length === 0) {
      return {
        acknowledged: true,
        deletedCount: 0,
      }
    }

    await this.client!.execute({
      sql: 'DELETE FROM documents WHERE collection = ? AND id = ?',
      args: [collection, docs[0]._id as string],
    })

    return {
      acknowledged: true,
      deletedCount: 1,
    }
  }

  async deleteMany(collection: string, filter: Filter): Promise<DeleteResult> {
    await this.ensureInitialized()
    this.ensureConnected()

    const docs = await this.find(collection, filter)

    if (docs.length === 0) {
      return {
        acknowledged: true,
        deletedCount: 0,
      }
    }

    for (const doc of docs) {
      await this.client!.execute({
        sql: 'DELETE FROM documents WHERE collection = ? AND id = ?',
        args: [collection, doc._id as string],
      })
    }

    return {
      acknowledged: true,
      deletedCount: docs.length,
    }
  }

  async countDocuments(collection: string, filter: Filter): Promise<number> {
    await this.ensureInitialized()
    this.ensureConnected()

    const docs = await this.find(collection, filter)
    return docs.length
  }
}
