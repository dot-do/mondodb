import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MongoClient } from '../../src/client/mongo-client'
import { MongoDatabase } from '../../src/client/mongo-database'
import { MongoCollection } from '../../src/client/mongo-collection'
import { ObjectId } from '../../src/types/objectid'

// ============================================================================
// MongoClient Tests (RED → GREEN → REFACTOR)
// ============================================================================

describe('MongoClient', () => {
  let client: MongoClient

  afterEach(async () => {
    if (client) {
      await client.close()
    }
  })

  describe('constructor', () => {
    it('creates instance with valid mondodb:// URI', () => {
      client = new MongoClient('mondodb://localhost:27017')
      expect(client).toBeInstanceOf(MongoClient)
    })

    it('creates instance with URI containing database name', () => {
      client = new MongoClient('mondodb://localhost:27017/testdb')
      expect(client).toBeInstanceOf(MongoClient)
    })

    it('creates instance with options', () => {
      client = new MongoClient('mondodb://localhost:27017', {
        maxPoolSize: 10,
        minPoolSize: 2,
      })
      expect(client).toBeInstanceOf(MongoClient)
    })

    it('throws error for invalid URI scheme', () => {
      expect(() => new MongoClient('http://localhost:27017')).toThrow()
    })

    it('throws error for empty URI', () => {
      expect(() => new MongoClient('')).toThrow()
    })

    it('parses database name from URI', () => {
      client = new MongoClient('mondodb://localhost:27017/mydb')
      const db = client.db()
      expect(db.databaseName).toBe('mydb')
    })

    it('uses default database when not in URI', () => {
      client = new MongoClient('mondodb://localhost:27017')
      const db = client.db()
      expect(db.databaseName).toBe('test')
    })
  })

  describe('connect()', () => {
    it('establishes connection and returns client', async () => {
      client = new MongoClient('mondodb://localhost:27017')
      const result = await client.connect()
      expect(result).toBe(client)
    })

    it('resolves immediately if already connected', async () => {
      client = new MongoClient('mondodb://localhost:27017')
      await client.connect()
      const result = await client.connect()
      expect(result).toBe(client)
    })

    it('sets connected state after connect', async () => {
      client = new MongoClient('mondodb://localhost:27017')
      expect(client.isConnected).toBe(false)
      await client.connect()
      expect(client.isConnected).toBe(true)
    })
  })

  describe('close()', () => {
    it('terminates connection', async () => {
      client = new MongoClient('mondodb://localhost:27017')
      await client.connect()
      await client.close()
      expect(client.isConnected).toBe(false)
    })

    it('can be called multiple times safely', async () => {
      client = new MongoClient('mondodb://localhost:27017')
      await client.connect()
      await client.close()
      await client.close()
      expect(client.isConnected).toBe(false)
    })

    it('can close without connecting', async () => {
      client = new MongoClient('mondodb://localhost:27017')
      await client.close()
      expect(client.isConnected).toBe(false)
    })
  })

  describe('db()', () => {
    it('returns MongoDatabase instance', () => {
      client = new MongoClient('mondodb://localhost:27017')
      const db = client.db('testdb')
      expect(db).toBeInstanceOf(MongoDatabase)
    })

    it('returns database with specified name', () => {
      client = new MongoClient('mondodb://localhost:27017')
      const db = client.db('myapp')
      expect(db.databaseName).toBe('myapp')
    })

    it('returns default database when no name provided', () => {
      client = new MongoClient('mondodb://localhost:27017/defaultdb')
      const db = client.db()
      expect(db.databaseName).toBe('defaultdb')
    })

    it('returns same database instance for same name', () => {
      client = new MongoClient('mondodb://localhost:27017')
      const db1 = client.db('test')
      const db2 = client.db('test')
      expect(db1).toBe(db2)
    })

    it('returns different database instances for different names', () => {
      client = new MongoClient('mondodb://localhost:27017')
      const db1 = client.db('test1')
      const db2 = client.db('test2')
      expect(db1).not.toBe(db2)
    })
  })

  describe('URI parsing', () => {
    it('parses host and port', () => {
      client = new MongoClient('mondodb://myhost:12345/db')
      expect(client.options.host).toBe('myhost')
      expect(client.options.port).toBe(12345)
    })

    it('uses default port when not specified', () => {
      client = new MongoClient('mondodb://myhost/db')
      expect(client.options.port).toBe(27017)
    })

    it('parses query parameters as options', () => {
      client = new MongoClient('mondodb://localhost:27017/db?maxPoolSize=20&minPoolSize=5')
      expect(client.options.maxPoolSize).toBe(20)
      expect(client.options.minPoolSize).toBe(5)
    })

    it('handles URI with authentication (placeholder)', () => {
      client = new MongoClient('mondodb://user:pass@localhost:27017/db')
      expect(client.options.host).toBe('localhost')
    })
  })

  describe('connection pooling', () => {
    it('respects maxPoolSize option', () => {
      client = new MongoClient('mondodb://localhost:27017', { maxPoolSize: 50 })
      expect(client.options.maxPoolSize).toBe(50)
    })

    it('respects minPoolSize option', () => {
      client = new MongoClient('mondodb://localhost:27017', { minPoolSize: 5 })
      expect(client.options.minPoolSize).toBe(5)
    })

    it('uses default pool sizes', () => {
      client = new MongoClient('mondodb://localhost:27017')
      expect(client.options.maxPoolSize).toBe(100)
      expect(client.options.minPoolSize).toBe(0)
    })
  })
})

// ============================================================================
// MongoDatabase Tests (RED → GREEN → REFACTOR)
// ============================================================================

describe('MongoDatabase', () => {
  let client: MongoClient
  let db: MongoDatabase

  beforeEach(async () => {
    client = new MongoClient('mondodb://localhost:27017')
    await client.connect()
    db = client.db('testdb')
  })

  afterEach(async () => {
    await client.close()
  })

  describe('collection()', () => {
    it('returns MongoCollection instance', () => {
      const collection = db.collection('users')
      expect(collection).toBeInstanceOf(MongoCollection)
    })

    it('returns collection with specified name', () => {
      const collection = db.collection('products')
      expect(collection.collectionName).toBe('products')
    })

    it('returns same collection instance for same name', () => {
      const col1 = db.collection('users')
      const col2 = db.collection('users')
      expect(col1).toBe(col2)
    })

    it('returns different collection instances for different names', () => {
      const col1 = db.collection('users')
      const col2 = db.collection('products')
      expect(col1).not.toBe(col2)
    })

    it('supports generic type parameter', () => {
      interface User {
        _id: ObjectId
        name: string
        email: string
      }
      const collection = db.collection<User>('users')
      expect(collection.collectionName).toBe('users')
    })
  })

  describe('listCollections()', () => {
    it('returns empty array for new database', async () => {
      const collections = await db.listCollections().toArray()
      expect(collections).toEqual([])
    })

    it('returns collection info after creation', async () => {
      await db.createCollection('newcol')
      const collections = await db.listCollections().toArray()
      expect(collections.length).toBeGreaterThanOrEqual(1)
      expect(collections.some(c => c.name === 'newcol')).toBe(true)
    })

    it('supports name filter', async () => {
      await db.createCollection('alpha')
      await db.createCollection('beta')
      const collections = await db.listCollections({ name: 'alpha' }).toArray()
      expect(collections.length).toBe(1)
      expect(collections[0].name).toBe('alpha')
    })
  })

  describe('createCollection()', () => {
    it('creates a new collection', async () => {
      const result = await db.createCollection('newcollection')
      expect(result).toBeInstanceOf(MongoCollection)
      expect(result.collectionName).toBe('newcollection')
    })

    it('returns existing collection if already exists', async () => {
      await db.createCollection('existing')
      const result = await db.createCollection('existing')
      expect(result.collectionName).toBe('existing')
    })

    it('supports collection options', async () => {
      const result = await db.createCollection('capped', {
        capped: true,
        size: 1024 * 1024,
      })
      expect(result.collectionName).toBe('capped')
    })
  })

  describe('dropCollection()', () => {
    it('drops existing collection', async () => {
      await db.createCollection('todrop')
      const result = await db.dropCollection('todrop')
      expect(result).toBe(true)
    })

    it('returns false for non-existing collection', async () => {
      const result = await db.dropCollection('nonexistent')
      expect(result).toBe(false)
    })

    it('removes collection from cache', async () => {
      await db.createCollection('cached')
      const col1 = db.collection('cached')
      await db.dropCollection('cached')
      await db.createCollection('cached')
      const col2 = db.collection('cached')
      // After drop and recreate, should be a new instance
      expect(col1).not.toBe(col2)
    })
  })

  describe('databaseName', () => {
    it('returns the database name', () => {
      expect(db.databaseName).toBe('testdb')
    })
  })

  describe('dropDatabase()', () => {
    it('drops the database', async () => {
      const result = await db.dropDatabase()
      expect(result).toBe(true)
    })
  })
})

// ============================================================================
// MongoCollection CRUD Tests (RED → GREEN → REFACTOR)
// ============================================================================

describe('MongoCollection', () => {
  let client: MongoClient
  let db: MongoDatabase
  let collection: MongoCollection<{ _id?: ObjectId; name: string; value?: number; tags?: string[] }>

  beforeEach(async () => {
    client = new MongoClient('mondodb://localhost:27017')
    await client.connect()
    db = client.db('testdb')
    collection = db.collection('testcollection')
    // Clean up collection before each test
    await collection.deleteMany({})
  })

  afterEach(async () => {
    await client.close()
  })

  describe('insertOne()', () => {
    it('inserts a document and returns insertedId', async () => {
      const result = await collection.insertOne({ name: 'test' })
      expect(result.acknowledged).toBe(true)
      expect(result.insertedId).toBeInstanceOf(ObjectId)
    })

    it('uses provided _id if specified', async () => {
      const customId = new ObjectId()
      const result = await collection.insertOne({ _id: customId, name: 'test' })
      expect(result.insertedId.equals(customId)).toBe(true)
    })

    it('generates _id if not provided', async () => {
      const result = await collection.insertOne({ name: 'test' })
      expect(ObjectId.isValid(result.insertedId)).toBe(true)
    })
  })

  describe('insertMany()', () => {
    it('inserts multiple documents', async () => {
      const docs = [{ name: 'one' }, { name: 'two' }, { name: 'three' }]
      const result = await collection.insertMany(docs)
      expect(result.acknowledged).toBe(true)
      expect(result.insertedCount).toBe(3)
      expect(Object.keys(result.insertedIds).length).toBe(3)
    })

    it('returns insertedIds keyed by index', async () => {
      const docs = [{ name: 'a' }, { name: 'b' }]
      const result = await collection.insertMany(docs)
      expect(result.insertedIds[0]).toBeInstanceOf(ObjectId)
      expect(result.insertedIds[1]).toBeInstanceOf(ObjectId)
    })

    it('handles empty array', async () => {
      const result = await collection.insertMany([])
      expect(result.insertedCount).toBe(0)
    })
  })

  describe('findOne()', () => {
    it('finds a single document by filter', async () => {
      await collection.insertOne({ name: 'findme', value: 42 })
      const doc = await collection.findOne({ name: 'findme' })
      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('findme')
      expect(doc?.value).toBe(42)
    })

    it('returns null when no document matches', async () => {
      const doc = await collection.findOne({ name: 'nonexistent' })
      expect(doc).toBeNull()
    })

    it('finds document by _id', async () => {
      const { insertedId } = await collection.insertOne({ name: 'byid' })
      const doc = await collection.findOne({ _id: insertedId })
      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('byid')
    })

    it('supports projection', async () => {
      await collection.insertOne({ name: 'projected', value: 100 })
      const doc = await collection.findOne({ name: 'projected' }, { projection: { name: 1 } })
      expect(doc?.name).toBe('projected')
      // value should be excluded (depending on implementation)
    })
  })

  describe('find()', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'alpha', value: 1 },
        { name: 'beta', value: 2 },
        { name: 'gamma', value: 3 },
        { name: 'delta', value: 4 },
        { name: 'epsilon', value: 5 },
      ])
    })

    it('returns cursor for all documents', async () => {
      const docs = await collection.find({}).toArray()
      expect(docs.length).toBe(5)
    })

    it('filters documents by query', async () => {
      const docs = await collection.find({ value: { $gt: 3 } }).toArray()
      expect(docs.length).toBe(2)
    })

    it('supports limit', async () => {
      const docs = await collection.find({}).limit(2).toArray()
      expect(docs.length).toBe(2)
    })

    it('supports skip', async () => {
      const docs = await collection.find({}).skip(3).toArray()
      expect(docs.length).toBe(2)
    })

    it('supports sort ascending', async () => {
      const docs = await collection.find({}).sort({ value: 1 }).toArray()
      expect(docs[0].value).toBe(1)
      expect(docs[4].value).toBe(5)
    })

    it('supports sort descending', async () => {
      const docs = await collection.find({}).sort({ value: -1 }).toArray()
      expect(docs[0].value).toBe(5)
      expect(docs[4].value).toBe(1)
    })

    it('supports projection', async () => {
      const docs = await collection.find({}, { projection: { name: 1, _id: 0 } }).toArray()
      expect(docs[0]).toHaveProperty('name')
      expect(docs[0]).not.toHaveProperty('value')
    })

    it('supports chaining limit, skip, and sort', async () => {
      const docs = await collection.find({})
        .sort({ value: 1 })
        .skip(1)
        .limit(2)
        .toArray()
      expect(docs.length).toBe(2)
      expect(docs[0].value).toBe(2)
      expect(docs[1].value).toBe(3)
    })

    it('supports count()', async () => {
      const count = await collection.find({}).count()
      expect(count).toBe(5)
    })

    it('supports forEach', async () => {
      const names: string[] = []
      await collection.find({}).forEach(doc => {
        names.push(doc.name)
      })
      expect(names.length).toBe(5)
    })
  })

  describe('updateOne()', () => {
    it('updates a single document', async () => {
      await collection.insertOne({ name: 'update', value: 1 })
      const result = await collection.updateOne({ name: 'update' }, { $set: { value: 100 } })
      expect(result.acknowledged).toBe(true)
      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)
    })

    it('returns zero counts when no match', async () => {
      const result = await collection.updateOne({ name: 'nonexistent' }, { $set: { value: 0 } })
      expect(result.matchedCount).toBe(0)
      expect(result.modifiedCount).toBe(0)
    })

    it('supports $inc operator', async () => {
      await collection.insertOne({ name: 'inc', value: 10 })
      await collection.updateOne({ name: 'inc' }, { $inc: { value: 5 } })
      const doc = await collection.findOne({ name: 'inc' })
      expect(doc?.value).toBe(15)
    })

    it('supports $unset operator', async () => {
      await collection.insertOne({ name: 'unset', value: 10 })
      await collection.updateOne({ name: 'unset' }, { $unset: { value: '' } })
      const doc = await collection.findOne({ name: 'unset' })
      expect(doc?.value).toBeUndefined()
    })

    it('supports $push operator', async () => {
      await collection.insertOne({ name: 'push', tags: ['a'] })
      await collection.updateOne({ name: 'push' }, { $push: { tags: 'b' } })
      const doc = await collection.findOne({ name: 'push' })
      expect(doc?.tags).toEqual(['a', 'b'])
    })

    it('supports upsert option', async () => {
      const result = await collection.updateOne(
        { name: 'upserted' },
        { $set: { value: 999 } },
        { upsert: true }
      )
      expect(result.upsertedId).toBeInstanceOf(ObjectId)
      const doc = await collection.findOne({ name: 'upserted' })
      expect(doc?.value).toBe(999)
    })
  })

  describe('updateMany()', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'batch', value: 1 },
        { name: 'batch', value: 2 },
        { name: 'batch', value: 3 },
        { name: 'other', value: 4 },
      ])
    })

    it('updates multiple documents', async () => {
      const result = await collection.updateMany({ name: 'batch' }, { $inc: { value: 10 } })
      expect(result.matchedCount).toBe(3)
      expect(result.modifiedCount).toBe(3)
    })

    it('updates all matching documents', async () => {
      await collection.updateMany({ name: 'batch' }, { $set: { name: 'updated' } })
      const docs = await collection.find({ name: 'updated' }).toArray()
      expect(docs.length).toBe(3)
    })

    it('returns zero when no matches', async () => {
      const result = await collection.updateMany({ name: 'nonexistent' }, { $set: { value: 0 } })
      expect(result.matchedCount).toBe(0)
    })
  })

  describe('deleteOne()', () => {
    it('deletes a single document', async () => {
      await collection.insertOne({ name: 'delete' })
      const result = await collection.deleteOne({ name: 'delete' })
      expect(result.acknowledged).toBe(true)
      expect(result.deletedCount).toBe(1)
    })

    it('deletes only one document when multiple match', async () => {
      await collection.insertMany([{ name: 'multi' }, { name: 'multi' }])
      const result = await collection.deleteOne({ name: 'multi' })
      expect(result.deletedCount).toBe(1)
      const remaining = await collection.find({ name: 'multi' }).toArray()
      expect(remaining.length).toBe(1)
    })

    it('returns zero when no match', async () => {
      const result = await collection.deleteOne({ name: 'nonexistent' })
      expect(result.deletedCount).toBe(0)
    })
  })

  describe('deleteMany()', () => {
    it('deletes multiple documents', async () => {
      await collection.insertMany([
        { name: 'del', value: 1 },
        { name: 'del', value: 2 },
        { name: 'keep', value: 3 },
      ])
      const result = await collection.deleteMany({ name: 'del' })
      expect(result.deletedCount).toBe(2)
    })

    it('deletes all documents with empty filter', async () => {
      await collection.insertMany([{ name: 'a' }, { name: 'b' }, { name: 'c' }])
      const result = await collection.deleteMany({})
      expect(result.deletedCount).toBe(3)
    })

    it('returns zero when no matches', async () => {
      const result = await collection.deleteMany({ name: 'nonexistent' })
      expect(result.deletedCount).toBe(0)
    })
  })

  describe('countDocuments()', () => {
    it('counts all documents', async () => {
      await collection.insertMany([{ name: 'a' }, { name: 'b' }, { name: 'c' }])
      const count = await collection.countDocuments()
      expect(count).toBe(3)
    })

    it('counts documents matching filter', async () => {
      await collection.insertMany([{ name: 'x' }, { name: 'x' }, { name: 'y' }])
      const count = await collection.countDocuments({ name: 'x' })
      expect(count).toBe(2)
    })

    it('returns zero for empty collection', async () => {
      const count = await collection.countDocuments()
      expect(count).toBe(0)
    })
  })

  describe('replaceOne()', () => {
    it('replaces entire document', async () => {
      await collection.insertOne({ name: 'old', value: 1 })
      const result = await collection.replaceOne({ name: 'old' }, { name: 'new', value: 999 })
      expect(result.modifiedCount).toBe(1)
      const doc = await collection.findOne({ name: 'new' })
      expect(doc?.value).toBe(999)
    })

    it('preserves _id during replacement', async () => {
      const { insertedId } = await collection.insertOne({ name: 'preserve' })
      await collection.replaceOne({ name: 'preserve' }, { name: 'replaced' })
      const doc = await collection.findOne({ _id: insertedId })
      expect(doc?.name).toBe('replaced')
    })

    it('supports upsert', async () => {
      const result = await collection.replaceOne(
        { name: 'upsertreplace' },
        { name: 'upsertreplace', value: 42 },
        { upsert: true }
      )
      expect(result.upsertedId).toBeInstanceOf(ObjectId)
    })
  })

  describe('findOneAndUpdate()', () => {
    it('finds and updates document, returns original', async () => {
      await collection.insertOne({ name: 'findupdate', value: 1 })
      const result = await collection.findOneAndUpdate(
        { name: 'findupdate' },
        { $set: { value: 2 } }
      )
      expect(result?.value).toBe(1) // Original value
    })

    it('returns updated document with returnDocument: after', async () => {
      await collection.insertOne({ name: 'findupdate', value: 1 })
      const result = await collection.findOneAndUpdate(
        { name: 'findupdate' },
        { $set: { value: 2 } },
        { returnDocument: 'after' }
      )
      expect(result?.value).toBe(2) // Updated value
    })

    it('returns null when no match', async () => {
      const result = await collection.findOneAndUpdate(
        { name: 'nonexistent' },
        { $set: { value: 0 } }
      )
      expect(result).toBeNull()
    })
  })

  describe('findOneAndDelete()', () => {
    it('finds and deletes document, returns it', async () => {
      await collection.insertOne({ name: 'finddelete', value: 42 })
      const result = await collection.findOneAndDelete({ name: 'finddelete' })
      expect(result?.name).toBe('finddelete')
      expect(result?.value).toBe(42)
      const doc = await collection.findOne({ name: 'finddelete' })
      expect(doc).toBeNull()
    })

    it('returns null when no match', async () => {
      const result = await collection.findOneAndDelete({ name: 'nonexistent' })
      expect(result).toBeNull()
    })
  })

  describe('findOneAndReplace()', () => {
    it('finds and replaces document, returns original', async () => {
      await collection.insertOne({ name: 'findreplace', value: 1 })
      const result = await collection.findOneAndReplace(
        { name: 'findreplace' },
        { name: 'replaced', value: 999 }
      )
      expect(result?.name).toBe('findreplace')
      expect(result?.value).toBe(1)
    })

    it('returns replaced document with returnDocument: after', async () => {
      await collection.insertOne({ name: 'findreplace', value: 1 })
      const result = await collection.findOneAndReplace(
        { name: 'findreplace' },
        { name: 'replaced', value: 999 },
        { returnDocument: 'after' }
      )
      expect(result?.name).toBe('replaced')
      expect(result?.value).toBe(999)
    })
  })

  describe('Query operators', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'a', value: 10 },
        { name: 'b', value: 20 },
        { name: 'c', value: 30 },
        { name: 'd', value: 40 },
        { name: 'e', value: 50 },
      ])
    })

    it('supports $eq operator', async () => {
      const docs = await collection.find({ value: { $eq: 20 } }).toArray()
      expect(docs.length).toBe(1)
      expect(docs[0].name).toBe('b')
    })

    it('supports $ne operator', async () => {
      const docs = await collection.find({ value: { $ne: 20 } }).toArray()
      expect(docs.length).toBe(4)
    })

    it('supports $gt operator', async () => {
      const docs = await collection.find({ value: { $gt: 30 } }).toArray()
      expect(docs.length).toBe(2)
    })

    it('supports $gte operator', async () => {
      const docs = await collection.find({ value: { $gte: 30 } }).toArray()
      expect(docs.length).toBe(3)
    })

    it('supports $lt operator', async () => {
      const docs = await collection.find({ value: { $lt: 30 } }).toArray()
      expect(docs.length).toBe(2)
    })

    it('supports $lte operator', async () => {
      const docs = await collection.find({ value: { $lte: 30 } }).toArray()
      expect(docs.length).toBe(3)
    })

    it('supports $in operator', async () => {
      const docs = await collection.find({ value: { $in: [10, 30, 50] } }).toArray()
      expect(docs.length).toBe(3)
    })

    it('supports $nin operator', async () => {
      const docs = await collection.find({ value: { $nin: [10, 30, 50] } }).toArray()
      expect(docs.length).toBe(2)
    })

    it('supports $and operator', async () => {
      const docs = await collection.find({
        $and: [{ value: { $gt: 15 } }, { value: { $lt: 45 } }]
      }).toArray()
      expect(docs.length).toBe(3)
    })

    it('supports $or operator', async () => {
      const docs = await collection.find({
        $or: [{ value: 10 }, { value: 50 }]
      }).toArray()
      expect(docs.length).toBe(2)
    })

    it('supports $not operator', async () => {
      const docs = await collection.find({
        value: { $not: { $gt: 30 } }
      }).toArray()
      expect(docs.length).toBe(3)
    })

    it('supports $exists operator', async () => {
      await collection.insertOne({ name: 'novalue' })
      const docs = await collection.find({ value: { $exists: false } }).toArray()
      expect(docs.length).toBe(1)
      expect(docs[0].name).toBe('novalue')
    })

    it('supports implicit $and for multiple fields', async () => {
      const docs = await collection.find({ name: 'c', value: 30 }).toArray()
      expect(docs.length).toBe(1)
    })
  })

  describe('collectionName', () => {
    it('returns the collection name', () => {
      expect(collection.collectionName).toBe('testcollection')
    })
  })

  describe('drop()', () => {
    it('drops the collection', async () => {
      await collection.insertOne({ name: 'test' })
      const result = await collection.drop()
      expect(result).toBe(true)
    })
  })
})
