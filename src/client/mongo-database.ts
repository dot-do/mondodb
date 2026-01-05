/**
 * MongoDatabase - MongoDB-compatible database interface
 *
 * Provides collection access and database-level operations.
 */

import { MongoClient } from './MongoClient'
import { MongoCollection, Document } from './mongo-collection'

export interface CreateCollectionOptions {
  capped?: boolean
  size?: number
  max?: number
  validator?: object
  validationLevel?: 'off' | 'strict' | 'moderate'
  validationAction?: 'error' | 'warn'
}

export interface ListCollectionsOptions {
  filter?: { name?: string }
  nameOnly?: boolean
}

export interface CollectionInfo {
  name: string
  type: 'collection'
  options: Record<string, unknown>
  info: {
    readOnly: boolean
  }
}

export class MongoDatabase {
  private readonly _databaseName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly collectionCache: Map<string, MongoCollection<any>> = new Map()
  private readonly collections: Map<string, Record<string, unknown>> = new Map()

  constructor(_client: MongoClient, name: string) {
    this._databaseName = name
  }

  /**
   * Get the database name
   */
  get databaseName(): string {
    return this._databaseName
  }

  /**
   * Get a collection instance
   * @param name - Collection name
   */
  collection<TSchema extends Document = Document>(name: string): MongoCollection<TSchema> {
    // Return cached instance if available
    const cached = this.collectionCache.get(name)
    if (cached) {
      return cached as MongoCollection<TSchema>
    }

    // Create new collection instance
    const col = new MongoCollection<TSchema>(this, name)
    this.collectionCache.set(name, col)
    return col
  }

  /**
   * List all collections in the database
   */
  listCollections(filter?: { name?: string }): ListCollectionsCursor {
    return new ListCollectionsCursor(this, filter)
  }

  /**
   * Create a new collection
   */
  async createCollection<TSchema extends Document = Document>(
    name: string,
    options?: CreateCollectionOptions
  ): Promise<MongoCollection<TSchema>> {
    // Store collection metadata (cast to Record to satisfy type)
    this.collections.set(name, (options || {}) as Record<string, unknown>)

    // Clear cache to force new instance
    this.collectionCache.delete(name)

    // Get/create collection instance
    const collection = this.collection<TSchema>(name)

    // Initialize collection storage
    await collection._ensureCreated()

    return collection
  }

  /**
   * Drop a collection
   */
  async dropCollection(name: string): Promise<boolean> {
    const exists = this.collections.has(name) || this.collectionCache.has(name)

    if (exists) {
      // Get collection and drop its data
      const collection = this.collectionCache.get(name)
      if (collection) {
        await collection._drop()
      }

      // Remove from cache and metadata
      this.collectionCache.delete(name)
      this.collections.delete(name)
      return true
    }

    return false
  }

  /**
   * Drop the entire database
   */
  async dropDatabase(): Promise<boolean> {
    // Drop all collections
    for (const name of this.collections.keys()) {
      await this.dropCollection(name)
    }

    // Clear all caches
    this.collectionCache.clear()
    this.collections.clear()

    return true
  }

  /**
   * Get collection info for listing
   * @internal
   */
  _getCollectionInfos(filter?: { name?: string }): CollectionInfo[] {
    const infos: CollectionInfo[] = []

    for (const [name, options] of this.collections.entries()) {
      if (filter?.name && filter.name !== name) {
        continue
      }

      infos.push({
        name,
        type: 'collection',
        options,
        info: {
          readOnly: false,
        },
      })
    }

    return infos
  }

  /**
   * Register a collection (called by collection when data is first written)
   * @internal
   */
  _registerCollection(name: string): void {
    if (!this.collections.has(name)) {
      this.collections.set(name, {})
    }
  }
}

/**
 * Cursor for listing collections
 */
export class ListCollectionsCursor {
  private readonly database: MongoDatabase
  private readonly filter?: { name?: string }

  constructor(database: MongoDatabase, filter?: { name?: string }) {
    this.database = database
    this.filter = filter
  }

  async toArray(): Promise<CollectionInfo[]> {
    return this.database._getCollectionInfos(this.filter)
  }

  async forEach(callback: (info: CollectionInfo) => void): Promise<void> {
    const infos = await this.toArray()
    for (const info of infos) {
      callback(info)
    }
  }
}

export default MongoDatabase
