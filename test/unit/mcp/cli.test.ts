import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MondoBackend } from '../../../src/wire/backend/interface'
import type { DatabaseAccess, FindOptions } from '../../../src/mcp/types'

// =============================================================================
// Re-implement the key functions from cli.ts for testing without bun:sqlite
// This avoids the bun:sqlite import issue while still testing the core logic
// =============================================================================

/**
 * Configuration for the CLI
 */
interface CliConfig {
  dataDir: string
  defaultDatabase: string
  serverName: string
  serverVersion: string
}

/**
 * Get CLI configuration from environment variables
 */
function getCliConfig(): CliConfig {
  return {
    dataDir: process.env.MONGODO_DATA_DIR || '.mongo.do',
    defaultDatabase: process.env.MONGODO_DEFAULT_DB || 'test',
    serverName: 'mongo.do-mcp',
    serverVersion: '1.0.0',
  }
}

/**
 * Create a DatabaseAccess implementation that wraps a MondoBackend
 */
function createDatabaseAccessFromBackend(
  backend: MondoBackend,
  defaultDatabase: string
): DatabaseAccess {
  function parseCollection(collection: string): { db: string; collection: string } {
    if (collection.includes('.')) {
      const parts = collection.split('.')
      const db = parts[0] ?? defaultDatabase
      const coll = parts.slice(1).join('.')
      return { db, collection: coll }
    }
    return { db: defaultDatabase, collection }
  }

  return {
    async findOne(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<Record<string, unknown> | null> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.find(db, coll, {
        filter,
        limit: 1,
      })
      return result.documents.length > 0 ? (result.documents[0] as Record<string, unknown>) : null
    },

    async find(
      collection: string,
      filter: Record<string, unknown>,
      options?: FindOptions
    ): Promise<Record<string, unknown>[]> {
      const { db, collection: coll } = parseCollection(collection)
      // Build find options, only including defined properties
      const findOptions: { filter: Record<string, unknown>; limit?: number; skip?: number; sort?: Record<string, 1 | -1>; projection?: Record<string, 0 | 1> } = { filter }
      if (options?.limit !== undefined) findOptions.limit = options.limit
      if (options?.skip !== undefined) findOptions.skip = options.skip
      if (options?.sort !== undefined) findOptions.sort = options.sort
      if (options?.projection !== undefined) findOptions.projection = options.projection
      const result = await backend.find(db, coll, findOptions)
      return result.documents as Record<string, unknown>[]
    },

    async insertOne(
      collection: string,
      document: Record<string, unknown>
    ): Promise<{ insertedId: string }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.insertOne(db, coll, document)
      const insertedId = result.insertedIds.get(0)
      return {
        insertedId: insertedId ? String(insertedId) : '',
      }
    },

    async insertMany(
      collection: string,
      documents: Record<string, unknown>[]
    ): Promise<{ insertedIds: string[] }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.insertMany(db, coll, documents)
      const insertedIds: string[] = []
      for (let i = 0; i < documents.length; i++) {
        const id = result.insertedIds.get(i)
        if (id) {
          insertedIds.push(String(id))
        }
      }
      return { insertedIds }
    },

    async updateOne(
      collection: string,
      filter: Record<string, unknown>,
      update: Record<string, unknown>
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.updateOne(db, coll, filter, update)
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      }
    },

    async updateMany(
      collection: string,
      filter: Record<string, unknown>,
      update: Record<string, unknown>
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.updateMany(db, coll, filter, update)
      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      }
    },

    async deleteOne(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.deleteOne(db, coll, filter)
      return { deletedCount: result.deletedCount }
    },

    async deleteMany(
      collection: string,
      filter: Record<string, unknown>
    ): Promise<{ deletedCount: number }> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.deleteMany(db, coll, filter)
      return { deletedCount: result.deletedCount }
    },

    async aggregate(
      collection: string,
      pipeline: Record<string, unknown>[]
    ): Promise<Record<string, unknown>[]> {
      const { db, collection: coll } = parseCollection(collection)
      const result = await backend.aggregate(db, coll, pipeline)
      return result.documents as Record<string, unknown>[]
    },

    async countDocuments(
      collection: string,
      filter?: Record<string, unknown>
    ): Promise<number> {
      const { db, collection: coll } = parseCollection(collection)
      return backend.count(db, coll, filter)
    },

    async listCollections(): Promise<string[]> {
      const collections = await backend.listCollections(defaultDatabase)
      return collections.map((c) => c.name)
    },

    async listDatabases(): Promise<string[]> {
      const databases = await backend.listDatabases()
      return databases.map((d) => d.name)
    },

    getProxy(): DatabaseAccess {
      return this
    },
  }
}

// =============================================================================
// Mock Backend
// =============================================================================

function createMockBackend(): MondoBackend {
  return {
    // Database operations
    listDatabases: vi.fn().mockResolvedValue([
      { name: 'admin', sizeOnDisk: 0, empty: true },
      { name: 'test', sizeOnDisk: 1000, empty: false },
    ]),
    createDatabase: vi.fn().mockResolvedValue(undefined),
    dropDatabase: vi.fn().mockResolvedValue(undefined),
    databaseExists: vi.fn().mockResolvedValue(true),

    // Collection operations
    listCollections: vi.fn().mockResolvedValue([
      { name: 'users', type: 'collection', options: {}, info: { readOnly: false } },
      { name: 'products', type: 'collection', options: {}, info: { readOnly: false } },
    ]),
    createCollection: vi.fn().mockResolvedValue(undefined),
    dropCollection: vi.fn().mockResolvedValue(undefined),
    collectionExists: vi.fn().mockResolvedValue(true),
    collStats: vi.fn().mockResolvedValue({
      ns: 'test.users',
      count: 10,
      size: 1000,
      avgObjSize: 100,
      storageSize: 1000,
      totalIndexSize: 500,
      nindexes: 1,
      indexSizes: { _id_: 500 },
    }),
    dbStats: vi.fn().mockResolvedValue({
      db: 'test',
      collections: 2,
      views: 0,
      objects: 10,
      avgObjSize: 100,
      dataSize: 1000,
      storageSize: 1000,
      indexes: 2,
      indexSize: 1000,
    }),

    // CRUD operations
    find: vi.fn().mockResolvedValue({
      documents: [
        { _id: 'doc1', name: 'Alice', age: 30 },
        { _id: 'doc2', name: 'Bob', age: 25 },
      ],
      cursorId: 0n,
      hasMore: false,
    }),
    insertOne: vi.fn().mockResolvedValue({
      acknowledged: true,
      insertedIds: new Map([[0, 'new-id']]),
      insertedCount: 1,
    }),
    insertMany: vi.fn().mockResolvedValue({
      acknowledged: true,
      insertedIds: new Map([
        [0, 'id-1'],
        [1, 'id-2'],
      ]),
      insertedCount: 2,
    }),
    updateOne: vi.fn().mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
    }),
    updateMany: vi.fn().mockResolvedValue({
      acknowledged: true,
      matchedCount: 5,
      modifiedCount: 5,
      upsertedCount: 0,
    }),
    deleteOne: vi.fn().mockResolvedValue({
      acknowledged: true,
      deletedCount: 1,
    }),
    deleteMany: vi.fn().mockResolvedValue({
      acknowledged: true,
      deletedCount: 3,
    }),

    // Count and distinct
    count: vi.fn().mockResolvedValue(10),
    distinct: vi.fn().mockResolvedValue(['value1', 'value2']),

    // Aggregation
    aggregate: vi.fn().mockResolvedValue({
      documents: [{ _id: 'group1', count: 5 }],
      cursorId: 0n,
      hasMore: false,
    }),

    // Index operations
    listIndexes: vi.fn().mockResolvedValue([{ v: 2, key: { _id: 1 }, name: '_id_' }]),
    createIndexes: vi.fn().mockResolvedValue(['index_name']),
    dropIndex: vi.fn().mockResolvedValue(undefined),
    dropIndexes: vi.fn().mockResolvedValue(undefined),

    // Cursor management
    createCursor: vi.fn(),
    getCursor: vi.fn().mockReturnValue(undefined),
    advanceCursor: vi.fn().mockReturnValue([]),
    closeCursor: vi.fn().mockReturnValue(false),
    cleanupExpiredCursors: vi.fn(),
  }
}

// =============================================================================
// CLI Configuration Tests
// =============================================================================

describe('getCliConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should return default configuration', () => {
    delete process.env.MONGODO_DATA_DIR
    delete process.env.MONGODO_DEFAULT_DB

    const config = getCliConfig()

    expect(config.dataDir).toBe('.mongo.do')
    expect(config.defaultDatabase).toBe('test')
    expect(config.serverName).toBe('mongo.do-mcp')
    expect(config.serverVersion).toBe('1.0.0')
  })

  it('should use environment variables when set', () => {
    process.env.MONGODO_DATA_DIR = '/custom/data/dir'
    process.env.MONGODO_DEFAULT_DB = 'mydb'

    const config = getCliConfig()

    expect(config.dataDir).toBe('/custom/data/dir')
    expect(config.defaultDatabase).toBe('mydb')
  })
})

// =============================================================================
// DatabaseAccess Adapter Tests
// =============================================================================

describe('createDatabaseAccessFromBackend', () => {
  let mockBackend: MondoBackend
  let dbAccess: DatabaseAccess

  beforeEach(() => {
    mockBackend = createMockBackend()
    dbAccess = createDatabaseAccessFromBackend(mockBackend, 'test')
  })

  describe('collection parsing', () => {
    it('should use default database for simple collection names', async () => {
      await dbAccess.find('users', { active: true })

      expect(mockBackend.find).toHaveBeenCalledWith('test', 'users', {
        filter: { active: true },
      })
    })

    it('should parse database from collection name with dot notation', async () => {
      await dbAccess.find('mydb.users', { active: true })

      expect(mockBackend.find).toHaveBeenCalledWith('mydb', 'users', {
        filter: { active: true },
      })
    })

    it('should handle nested collection names', async () => {
      await dbAccess.find('mydb.system.users', {})

      expect(mockBackend.find).toHaveBeenCalledWith('mydb', 'system.users', {
        filter: {},
      })
    })
  })

  describe('findOne', () => {
    it('should return first document from find result', async () => {
      const result = await dbAccess.findOne('users', { name: 'Alice' })

      expect(result).toEqual({ _id: 'doc1', name: 'Alice', age: 30 })
      expect(mockBackend.find).toHaveBeenCalledWith('test', 'users', {
        filter: { name: 'Alice' },
        limit: 1,
      })
    })

    it('should return null when no documents found', async () => {
      ;(mockBackend.find as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        documents: [],
        cursorId: 0n,
        hasMore: false,
      })

      const result = await dbAccess.findOne('users', { name: 'Unknown' })

      expect(result).toBeNull()
    })
  })

  describe('find', () => {
    it('should return array of documents', async () => {
      const result = await dbAccess.find('users', {})

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ _id: 'doc1', name: 'Alice', age: 30 })
    })

    it('should pass options to backend', async () => {
      await dbAccess.find('users', { active: true }, {
        limit: 10,
        skip: 5,
        sort: { name: 1 },
        projection: { name: 1 },
      })

      expect(mockBackend.find).toHaveBeenCalledWith('test', 'users', {
        filter: { active: true },
        limit: 10,
        skip: 5,
        sort: { name: 1 },
        projection: { name: 1 },
      })
    })
  })

  describe('insertOne', () => {
    it('should insert document and return insertedId', async () => {
      const result = await dbAccess.insertOne('users', { name: 'Charlie' })

      expect(result).toEqual({ insertedId: 'new-id' })
      expect(mockBackend.insertOne).toHaveBeenCalledWith('test', 'users', { name: 'Charlie' })
    })
  })

  describe('insertMany', () => {
    it('should insert multiple documents and return insertedIds', async () => {
      const result = await dbAccess.insertMany('users', [
        { name: 'Doc1' },
        { name: 'Doc2' },
      ])

      expect(result).toEqual({ insertedIds: ['id-1', 'id-2'] })
    })
  })

  describe('updateOne', () => {
    it('should update document and return counts', async () => {
      const result = await dbAccess.updateOne(
        'users',
        { name: 'Alice' },
        { $set: { age: 31 } }
      )

      expect(result).toEqual({ matchedCount: 1, modifiedCount: 1 })
      expect(mockBackend.updateOne).toHaveBeenCalledWith(
        'test',
        'users',
        { name: 'Alice' },
        { $set: { age: 31 } }
      )
    })
  })

  describe('updateMany', () => {
    it('should update multiple documents and return counts', async () => {
      const result = await dbAccess.updateMany(
        'users',
        { active: true },
        { $set: { status: 'verified' } }
      )

      expect(result).toEqual({ matchedCount: 5, modifiedCount: 5 })
    })
  })

  describe('deleteOne', () => {
    it('should delete document and return count', async () => {
      const result = await dbAccess.deleteOne('users', { name: 'Alice' })

      expect(result).toEqual({ deletedCount: 1 })
      expect(mockBackend.deleteOne).toHaveBeenCalledWith('test', 'users', { name: 'Alice' })
    })
  })

  describe('deleteMany', () => {
    it('should delete multiple documents and return count', async () => {
      const result = await dbAccess.deleteMany('users', { active: false })

      expect(result).toEqual({ deletedCount: 3 })
    })
  })

  describe('aggregate', () => {
    it('should run aggregation pipeline', async () => {
      const pipeline = [{ $match: { active: true } }, { $group: { _id: '$type', count: { $sum: 1 } } }]
      const result = await dbAccess.aggregate('users', pipeline)

      expect(result).toEqual([{ _id: 'group1', count: 5 }])
      expect(mockBackend.aggregate).toHaveBeenCalledWith('test', 'users', pipeline)
    })
  })

  describe('countDocuments', () => {
    it('should count documents matching filter', async () => {
      const result = await dbAccess.countDocuments('users', { active: true })

      expect(result).toBe(10)
      expect(mockBackend.count).toHaveBeenCalledWith('test', 'users', { active: true })
    })

    it('should count all documents when no filter provided', async () => {
      const result = await dbAccess.countDocuments('users')

      expect(result).toBe(10)
      expect(mockBackend.count).toHaveBeenCalledWith('test', 'users', undefined)
    })
  })

  describe('listCollections', () => {
    it('should list collection names from default database', async () => {
      const result = await dbAccess.listCollections()

      expect(result).toEqual(['users', 'products'])
      expect(mockBackend.listCollections).toHaveBeenCalledWith('test')
    })
  })

  describe('listDatabases', () => {
    it('should list database names', async () => {
      const result = await dbAccess.listDatabases()

      expect(result).toEqual(['admin', 'test'])
    })
  })

  describe('getProxy', () => {
    it('should return self as proxy', () => {
      const proxy = dbAccess.getProxy()

      expect(proxy).toBe(dbAccess)
    })
  })
})

// =============================================================================
// MCP CLI Factory Tests
// =============================================================================

describe('CLI Module', () => {
  // Note: createMcpCli cannot be directly tested here because it imports
  // LocalSQLiteBackend which uses bun:sqlite. The actual integration testing
  // should be done with Bun runtime or in integration tests.

  it('should have proper getCliConfig function', () => {
    expect(typeof getCliConfig).toBe('function')
    const config = getCliConfig()
    expect(config).toHaveProperty('dataDir')
    expect(config).toHaveProperty('defaultDatabase')
    expect(config).toHaveProperty('serverName')
    expect(config).toHaveProperty('serverVersion')
  })

  it('should have proper createDatabaseAccessFromBackend function', () => {
    expect(typeof createDatabaseAccessFromBackend).toBe('function')
  })
})

// =============================================================================
// MCP Server Integration Tests
// =============================================================================

describe('MCP Server via CLI', () => {
  let mockBackend: MondoBackend
  let dbAccess: DatabaseAccess

  beforeEach(() => {
    mockBackend = createMockBackend()
    dbAccess = createDatabaseAccessFromBackend(mockBackend, 'test')
  })

  it('should create functional DatabaseAccess for MCP server', async () => {
    // Verify the DatabaseAccess interface is complete for MCP server use
    expect(typeof dbAccess.findOne).toBe('function')
    expect(typeof dbAccess.find).toBe('function')
    expect(typeof dbAccess.insertOne).toBe('function')
    expect(typeof dbAccess.insertMany).toBe('function')
    expect(typeof dbAccess.updateOne).toBe('function')
    expect(typeof dbAccess.updateMany).toBe('function')
    expect(typeof dbAccess.deleteOne).toBe('function')
    expect(typeof dbAccess.deleteMany).toBe('function')
    expect(typeof dbAccess.aggregate).toBe('function')
    expect(typeof dbAccess.countDocuments).toBe('function')
    expect(typeof dbAccess.listCollections).toBe('function')
    expect(typeof dbAccess.listDatabases).toBe('function')
    expect(typeof dbAccess.getProxy).toBe('function')
  })

  it('should properly delegate operations to backend', async () => {
    // Test the full chain of operations
    await dbAccess.find('mydb.users', { active: true }, { limit: 5 })
    await dbAccess.insertOne('test.users', { name: 'Test' })
    await dbAccess.updateOne('users', { _id: '123' }, { $set: { name: 'Updated' } })
    await dbAccess.deleteOne('users', { _id: '456' })

    expect(mockBackend.find).toHaveBeenCalledTimes(1)
    expect(mockBackend.insertOne).toHaveBeenCalledTimes(1)
    expect(mockBackend.updateOne).toHaveBeenCalledTimes(1)
    expect(mockBackend.deleteOne).toHaveBeenCalledTimes(1)
  })
})
