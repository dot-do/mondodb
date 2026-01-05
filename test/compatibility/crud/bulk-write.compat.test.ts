import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider, BulkWriteOperation, Document } from '../providers/types'
import { compareResults, assertResultsMatch } from '../compare'
import { ObjectId } from '../../../src/types/objectid'

/**
 * Deep clone operations for independent use between MongoDB and mongo.do
 */
function cloneOperations(ops: BulkWriteOperation<Document>[]): BulkWriteOperation<Document>[] {
  return JSON.parse(JSON.stringify(ops))
}

describe('bulkWrite insertOne Compatibility', () => {
  let mongodb: TestProvider
  let mongo.do: TestProvider
  let testNum = 0

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mongo.do = providers.mongo.do
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mongo.do)
  })

  beforeEach(() => {
    testNum++
  })

  const getCollections = () => {
    const dbName = `test_bulk_insert_${testNum}`
    return {
      mongoCol: mongodb.database(dbName).collection('items'),
      mondoCol: mongo.do.database(dbName).collection('items'),
    }
  }

  it('single insertOne operation returns correct result structure', async () => {
    const { mongoCol, mondoCol } = getCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { insertOne: { document: { name: 'test', value: 42 } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(cloneOperations(operations))
    const mondoResult = await mondoCol.bulkWrite(cloneOperations(operations))

    expect(mongoResult.acknowledged).toBe(true)
    expect(mondoResult.acknowledged).toBe(true)
    expect(mongoResult.insertedCount).toBe(1)
    expect(mondoResult.insertedCount).toBe(1)
    expect(mongoResult.matchedCount).toBe(0)
    expect(mondoResult.matchedCount).toBe(0)
    expect(mongoResult.modifiedCount).toBe(0)
    expect(mondoResult.modifiedCount).toBe(0)
    expect(mongoResult.deletedCount).toBe(0)
    expect(mondoResult.deletedCount).toBe(0)

    // Verify insertedIds mapping
    expect(mongoResult.insertedIds[0]).toBeDefined()
    expect(mondoResult.insertedIds[0]).toBeDefined()
  })

  it('multiple insertOne operations insert all documents', async () => {
    const { mongoCol, mondoCol } = getCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { insertOne: { document: { name: 'a' } } },
      { insertOne: { document: { name: 'b' } } },
      { insertOne: { document: { name: 'c' } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(cloneOperations(operations))
    const mondoResult = await mondoCol.bulkWrite(cloneOperations(operations))

    expect(mongoResult.insertedCount).toBe(3)
    expect(mondoResult.insertedCount).toBe(3)

    // Verify insertedIds has correct indices
    expect(Object.keys(mongoResult.insertedIds).length).toBe(3)
    expect(Object.keys(mondoResult.insertedIds).length).toBe(3)
    expect(mongoResult.insertedIds[0]).toBeDefined()
    expect(mongoResult.insertedIds[1]).toBeDefined()
    expect(mongoResult.insertedIds[2]).toBeDefined()
    expect(mondoResult.insertedIds[0]).toBeDefined()
    expect(mondoResult.insertedIds[1]).toBeDefined()
    expect(mondoResult.insertedIds[2]).toBeDefined()

    // Verify documents were actually inserted
    const mongoDocs = await mongoCol.find({}).toArray()
    const mondoDocs = await mondoCol.find({}).toArray()

    expect(mongoDocs.length).toBe(3)
    expect(mondoDocs.length).toBe(3)
  })

  it('insertOne generates ObjectId when _id not provided', async () => {
    const { mongoCol, mondoCol } = getCollections()

    // Test that auto-generated IDs work correctly
    const mongoResult = await mongoCol.bulkWrite([
      { insertOne: { document: { name: 'auto-id' } } },
    ])
    const mondoResult = await mondoCol.bulkWrite([
      { insertOne: { document: { name: 'auto-id' } } },
    ])

    // Both should have insertedIds[0] defined
    expect(mongoResult.insertedIds[0]).toBeDefined()
    expect(mondoResult.insertedIds[0]).toBeDefined()
    expect(typeof mongoResult.insertedIds[0].toHexString).toBe('function')
    expect(typeof mondoResult.insertedIds[0].toHexString).toBe('function')

    // Verify documents can be found
    const mongoDoc = await mongoCol.findOne({ name: 'auto-id' })
    const mondoDoc = await mondoCol.findOne({ name: 'auto-id' })

    expect(mongoDoc?.name).toBe('auto-id')
    expect(mondoDoc?.name).toBe('auto-id')
  })

  it('insertOne handles nested documents', async () => {
    const { mongoCol, mondoCol } = getCollections()

    const doc = {
      user: { name: 'Alice', address: { city: 'NYC', zip: '10001' } },
      tags: ['a', 'b', 'c'],
    }

    const operations: BulkWriteOperation<Document>[] = [
      { insertOne: { document: { ...doc } } },
    ]

    await mongoCol.bulkWrite(cloneOperations(operations))
    await mondoCol.bulkWrite(cloneOperations(operations))

    const mongoDoc = await mongoCol.findOne({})
    const mondoDoc = await mondoCol.findOne({})

    expect(mongoDoc?.user?.name).toBe('Alice')
    expect(mondoDoc?.user?.name).toBe('Alice')
    expect(mongoDoc?.user?.address?.city).toBe('NYC')
    expect(mondoDoc?.user?.address?.city).toBe('NYC')
  })
})

describe('bulkWrite updateOne Compatibility', () => {
  let mongodb: TestProvider
  let mongo.do: TestProvider
  let testNum = 100

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mongo.do = providers.mongo.do
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mongo.do)
  })

  beforeEach(() => {
    testNum++
  })

  const setupCollections = async () => {
    const dbName = `test_bulk_update_one_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const docs = [
      { name: 'Alice', age: 30, city: 'NYC' },
      { name: 'Bob', age: 25, city: 'LA' },
      { name: 'Charlie', age: 35, city: 'NYC' },
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  it('single updateOne updates matching document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { updateOne: { filter: { name: 'Alice' }, update: { $set: { age: 31 } } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.matchedCount).toBe(1)
    expect(mondoResult.matchedCount).toBe(1)
    expect(mongoResult.modifiedCount).toBe(1)
    expect(mondoResult.modifiedCount).toBe(1)

    // Verify update was applied
    const mongoDoc = await mongoCol.findOne({ name: 'Alice' })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' })

    expect(mongoDoc?.age).toBe(31)
    expect(mondoDoc?.age).toBe(31)
  })

  it('multiple updateOne operations are applied independently', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { updateOne: { filter: { name: 'Alice' }, update: { $set: { age: 31 } } } },
      { updateOne: { filter: { name: 'Bob' }, update: { $set: { age: 26 } } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.matchedCount).toBe(2)
    expect(mondoResult.matchedCount).toBe(2)
    expect(mongoResult.modifiedCount).toBe(2)
    expect(mondoResult.modifiedCount).toBe(2)

    // Verify both updates were applied
    const mongoAlice = await mongoCol.findOne({ name: 'Alice' })
    const mondoAlice = await mondoCol.findOne({ name: 'Alice' })
    const mongoBob = await mongoCol.findOne({ name: 'Bob' })
    const mondoBob = await mondoCol.findOne({ name: 'Bob' })

    expect(mongoAlice?.age).toBe(31)
    expect(mondoAlice?.age).toBe(31)
    expect(mongoBob?.age).toBe(26)
    expect(mondoBob?.age).toBe(26)
  })

  it('updateOne with no match returns matchedCount 0', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { updateOne: { filter: { name: 'Nobody' }, update: { $set: { age: 100 } } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.matchedCount).toBe(0)
    expect(mondoResult.matchedCount).toBe(0)
    expect(mongoResult.modifiedCount).toBe(0)
    expect(mondoResult.modifiedCount).toBe(0)
  })

  it('updateOne with upsert creates document when no match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      {
        updateOne: {
          filter: { name: 'NewPerson' },
          update: { $set: { age: 40 } },
          upsert: true,
        },
      },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.upsertedCount).toBe(1)
    expect(mondoResult.upsertedCount).toBe(1)
    expect(mongoResult.upsertedIds[0]).toBeDefined()
    expect(mondoResult.upsertedIds[0]).toBeDefined()

    // Verify document was created
    const mongoDoc = await mongoCol.findOne({ name: 'NewPerson' })
    const mondoDoc = await mondoCol.findOne({ name: 'NewPerson' })

    expect(mongoDoc?.age).toBe(40)
    expect(mondoDoc?.age).toBe(40)
  })

  it('updateOne uses $inc operator correctly', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { updateOne: { filter: { name: 'Alice' }, update: { $inc: { age: 5 } } } },
    ]

    await mongoCol.bulkWrite(operations)
    await mondoCol.bulkWrite(cloneOperations(operations))

    const mongoDoc = await mongoCol.findOne({ name: 'Alice' })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' })

    expect(mongoDoc?.age).toBe(35)
    expect(mondoDoc?.age).toBe(35)
  })
})

describe('bulkWrite updateMany Compatibility', () => {
  let mongodb: TestProvider
  let mongo.do: TestProvider
  let testNum = 200

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mongo.do = providers.mongo.do
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mongo.do)
  })

  beforeEach(() => {
    testNum++
  })

  const setupCollections = async () => {
    const dbName = `test_bulk_update_many_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const docs = [
      { name: 'A', status: 'active', value: 10 },
      { name: 'B', status: 'active', value: 20 },
      { name: 'C', status: 'inactive', value: 30 },
      { name: 'D', status: 'active', value: 40 },
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  it('updateMany updates all matching documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { updateMany: { filter: { status: 'active' }, update: { $set: { processed: true } } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.matchedCount).toBe(3)
    expect(mondoResult.matchedCount).toBe(3)
    expect(mongoResult.modifiedCount).toBe(3)
    expect(mondoResult.modifiedCount).toBe(3)

    // Verify updates
    const mongoProcessed = await mongoCol.find({ processed: true }).toArray()
    const mondoProcessed = await mondoCol.find({ processed: true }).toArray()

    expect(mongoProcessed.length).toBe(3)
    expect(mondoProcessed.length).toBe(3)
  })

  it('multiple updateMany operations are applied sequentially', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { updateMany: { filter: { status: 'active' }, update: { $set: { flag1: true } } } },
      { updateMany: { filter: { status: 'inactive' }, update: { $set: { flag2: true } } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.matchedCount).toBe(4) // 3 active + 1 inactive
    expect(mondoResult.matchedCount).toBe(4)

    // Verify both sets of updates
    const mongoFlag1 = await mongoCol.find({ flag1: true }).toArray()
    const mondoFlag1 = await mondoCol.find({ flag1: true }).toArray()
    const mongoFlag2 = await mongoCol.find({ flag2: true }).toArray()
    const mondoFlag2 = await mondoCol.find({ flag2: true }).toArray()

    expect(mongoFlag1.length).toBe(3)
    expect(mondoFlag1.length).toBe(3)
    expect(mongoFlag2.length).toBe(1)
    expect(mondoFlag2.length).toBe(1)
  })

  it('updateMany with empty filter updates all documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { updateMany: { filter: {}, update: { $set: { touched: true } } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.matchedCount).toBe(4)
    expect(mondoResult.matchedCount).toBe(4)
  })

  it('updateMany with $inc on multiple documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { updateMany: { filter: { status: 'active' }, update: { $inc: { value: 100 } } } },
    ]

    await mongoCol.bulkWrite(operations)
    await mondoCol.bulkWrite(cloneOperations(operations))

    const mongoDocs = await mongoCol.find({ status: 'active' }).sort({ name: 1 }).toArray()
    const mondoDocs = await mondoCol.find({ status: 'active' }).sort({ name: 1 }).toArray()

    expect(mongoDocs.map(d => d.value)).toEqual([110, 120, 140])
    expect(mondoDocs.map(d => d.value)).toEqual([110, 120, 140])
  })
})

describe('bulkWrite deleteOne Compatibility', () => {
  let mongodb: TestProvider
  let mongo.do: TestProvider
  let testNum = 300

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mongo.do = providers.mongo.do
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mongo.do)
  })

  beforeEach(() => {
    testNum++
  })

  const setupCollections = async () => {
    const dbName = `test_bulk_delete_one_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const docs = [
      { name: 'Alice', group: 'A' },
      { name: 'Bob', group: 'A' },
      { name: 'Charlie', group: 'B' },
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  it('single deleteOne deletes matching document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { deleteOne: { filter: { name: 'Alice' } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.deletedCount).toBe(1)
    expect(mondoResult.deletedCount).toBe(1)

    // Verify deletion
    const mongoDoc = await mongoCol.findOne({ name: 'Alice' })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' })

    expect(mongoDoc).toBeNull()
    expect(mondoDoc).toBeNull()
  })

  it('multiple deleteOne operations delete multiple documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { deleteOne: { filter: { name: 'Alice' } } },
      { deleteOne: { filter: { name: 'Bob' } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.deletedCount).toBe(2)
    expect(mondoResult.deletedCount).toBe(2)

    // Verify only Charlie remains
    const mongoRemaining = await mongoCol.find({}).toArray()
    const mondoRemaining = await mondoCol.find({}).toArray()

    expect(mongoRemaining.length).toBe(1)
    expect(mondoRemaining.length).toBe(1)
    expect(mongoRemaining[0].name).toBe('Charlie')
    expect(mondoRemaining[0].name).toBe('Charlie')
  })

  it('deleteOne with no match returns deletedCount 0', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { deleteOne: { filter: { name: 'Nobody' } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.deletedCount).toBe(0)
    expect(mondoResult.deletedCount).toBe(0)
  })

  it('deleteOne deletes only first matching document when multiple match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    // Two documents in group A
    const operations: BulkWriteOperation<Document>[] = [
      { deleteOne: { filter: { group: 'A' } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.deletedCount).toBe(1)
    expect(mondoResult.deletedCount).toBe(1)

    // One document in group A should remain
    const mongoRemaining = await mongoCol.find({ group: 'A' }).toArray()
    const mondoRemaining = await mondoCol.find({ group: 'A' }).toArray()

    expect(mongoRemaining.length).toBe(1)
    expect(mondoRemaining.length).toBe(1)
  })
})

describe('bulkWrite deleteMany Compatibility', () => {
  let mongodb: TestProvider
  let mongo.do: TestProvider
  let testNum = 400

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mongo.do = providers.mongo.do
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mongo.do)
  })

  beforeEach(() => {
    testNum++
  })

  const setupCollections = async () => {
    const dbName = `test_bulk_delete_many_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const docs = [
      { name: 'A', status: 'active' },
      { name: 'B', status: 'active' },
      { name: 'C', status: 'inactive' },
      { name: 'D', status: 'active' },
      { name: 'E', status: 'inactive' },
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  it('deleteMany deletes all matching documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { deleteMany: { filter: { status: 'active' } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.deletedCount).toBe(3)
    expect(mondoResult.deletedCount).toBe(3)

    // Verify remaining
    const mongoRemaining = await mongoCol.find({}).toArray()
    const mondoRemaining = await mondoCol.find({}).toArray()

    expect(mongoRemaining.length).toBe(2)
    expect(mondoRemaining.length).toBe(2)
  })

  it('multiple deleteMany operations delete different sets', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { deleteMany: { filter: { status: 'active' } } },
      { deleteMany: { filter: { status: 'inactive' } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.deletedCount).toBe(5) // 3 active + 2 inactive
    expect(mondoResult.deletedCount).toBe(5)

    // Verify all deleted
    const mongoRemaining = await mongoCol.find({}).toArray()
    const mondoRemaining = await mondoCol.find({}).toArray()

    expect(mongoRemaining.length).toBe(0)
    expect(mondoRemaining.length).toBe(0)
  })

  it('deleteMany with empty filter deletes all documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { deleteMany: { filter: {} } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.deletedCount).toBe(5)
    expect(mondoResult.deletedCount).toBe(5)
  })
})

describe('bulkWrite replaceOne Compatibility', () => {
  let mongodb: TestProvider
  let mongo.do: TestProvider
  let testNum = 500

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mongo.do = providers.mongo.do
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mongo.do)
  })

  beforeEach(() => {
    testNum++
  })

  const setupCollections = async () => {
    const dbName = `test_bulk_replace_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const docs = [
      { name: 'Alice', age: 30, city: 'NYC', extra: 'data' },
      { name: 'Bob', age: 25, city: 'LA' },
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  it('replaceOne replaces entire document except _id', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      {
        replaceOne: {
          filter: { name: 'Alice' },
          replacement: { name: 'Alice', status: 'replaced' },
        },
      },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.matchedCount).toBe(1)
    expect(mondoResult.matchedCount).toBe(1)
    expect(mongoResult.modifiedCount).toBe(1)
    expect(mondoResult.modifiedCount).toBe(1)

    // Verify replacement removed old fields
    const mongoDoc = await mongoCol.findOne({ name: 'Alice' })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' })

    expect(mongoDoc?.status).toBe('replaced')
    expect(mondoDoc?.status).toBe('replaced')
    expect(mongoDoc?.age).toBeUndefined()
    expect(mondoDoc?.age).toBeUndefined()
    expect(mongoDoc?.city).toBeUndefined()
    expect(mondoDoc?.city).toBeUndefined()
  })

  it('replaceOne preserves _id', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const originalMongo = await mongoCol.findOne({ name: 'Alice' })
    const originalMondo = await mondoCol.findOne({ name: 'Alice' })

    const operations: BulkWriteOperation<Document>[] = [
      {
        replaceOne: {
          filter: { name: 'Alice' },
          replacement: { completely: 'new' },
        },
      },
    ]

    await mongoCol.bulkWrite(operations)
    await mondoCol.bulkWrite(cloneOperations(operations))

    const replacedMongo = await mongoCol.findOne({ completely: 'new' })
    const replacedMondo = await mondoCol.findOne({ completely: 'new' })

    expect(replacedMongo?._id.toHexString()).toBe(originalMongo?._id.toHexString())
    expect(replacedMondo?._id.toHexString()).toBe(originalMondo?._id.toHexString())
  })

  it('replaceOne with no match returns matchedCount 0', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      {
        replaceOne: {
          filter: { name: 'Nobody' },
          replacement: { x: 1 },
        },
      },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.matchedCount).toBe(0)
    expect(mondoResult.matchedCount).toBe(0)
    expect(mongoResult.modifiedCount).toBe(0)
    expect(mondoResult.modifiedCount).toBe(0)
  })

  it('replaceOne with upsert creates document when no match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      {
        replaceOne: {
          filter: { name: 'NewPerson' },
          replacement: { name: 'NewPerson', created: true },
          upsert: true,
        },
      },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.upsertedCount).toBe(1)
    expect(mondoResult.upsertedCount).toBe(1)
    expect(mongoResult.upsertedIds[0]).toBeDefined()
    expect(mondoResult.upsertedIds[0]).toBeDefined()

    // Verify document was created
    const mongoDoc = await mongoCol.findOne({ name: 'NewPerson' })
    const mondoDoc = await mondoCol.findOne({ name: 'NewPerson' })

    expect(mongoDoc?.created).toBe(true)
    expect(mondoDoc?.created).toBe(true)
  })
})

describe('bulkWrite Mixed Operations Compatibility', () => {
  let mongodb: TestProvider
  let mongo.do: TestProvider
  let testNum = 600

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mongo.do = providers.mongo.do
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mongo.do)
  })

  beforeEach(() => {
    testNum++
  })

  const setupCollections = async () => {
    const dbName = `test_bulk_mixed_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const docs = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 },
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  it('mixed insert, update, delete operations return correct counts', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { insertOne: { document: { name: 'David', age: 40 } } },
      { updateOne: { filter: { name: 'Alice' }, update: { $set: { age: 31 } } } },
      { deleteOne: { filter: { name: 'Bob' } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.insertedCount).toBe(1)
    expect(mondoResult.insertedCount).toBe(1)
    expect(mongoResult.matchedCount).toBe(1)
    expect(mondoResult.matchedCount).toBe(1)
    expect(mongoResult.modifiedCount).toBe(1)
    expect(mondoResult.modifiedCount).toBe(1)
    expect(mongoResult.deletedCount).toBe(1)
    expect(mondoResult.deletedCount).toBe(1)

    // Verify state
    const mongoDocs = await mongoCol.find({}).sort({ name: 1 }).toArray()
    const mondoDocs = await mondoCol.find({}).sort({ name: 1 }).toArray()

    expect(mongoDocs.length).toBe(3)
    expect(mondoDocs.length).toBe(3)
    expect(mongoDocs.map(d => d.name)).toEqual(['Alice', 'Charlie', 'David'])
    expect(mondoDocs.map(d => d.name)).toEqual(['Alice', 'Charlie', 'David'])
  })

  it('all operation types in single bulkWrite', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { insertOne: { document: { name: 'New1', value: 1 } } },
      { insertOne: { document: { name: 'New2', value: 2 } } },
      { updateOne: { filter: { name: 'Alice' }, update: { $set: { updated: true } } } },
      { updateMany: { filter: { name: { $in: ['Bob', 'Charlie'] } }, update: { $set: { batch: true } } } },
      { replaceOne: { filter: { name: 'Alice' }, replacement: { name: 'Alice', replaced: true } } },
      { deleteOne: { filter: { name: 'New1' } } },
      { deleteMany: { filter: { value: { $exists: true } } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    // Both inserts should count
    expect(mongoResult.insertedCount).toBe(2)
    expect(mondoResult.insertedCount).toBe(2)

    // updateOne + updateMany (2) + replaceOne = 1 + 2 + 1 = 4 matched
    // But replaceOne modifies after updateOne, so it may vary
    // Just verify they are equal
    expect(mongoResult.matchedCount).toBe(mondoResult.matchedCount)
    expect(mongoResult.modifiedCount).toBe(mondoResult.modifiedCount)

    // deleteOne (New1) + deleteMany (New2 only, since New1 deleted) = 1 + 1 = 2
    expect(mongoResult.deletedCount).toBe(mondoResult.deletedCount)
  })

  it('operations are executed in order', async () => {
    const dbName = `test_bulk_order_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const operations: BulkWriteOperation<Document>[] = [
      { insertOne: { document: { name: 'test', step: 1 } } },
      { updateOne: { filter: { name: 'test' }, update: { $set: { step: 2 } } } },
      { updateOne: { filter: { name: 'test' }, update: { $set: { step: 3 } } } },
    ]

    await mongoCol.bulkWrite(operations)
    await mondoCol.bulkWrite(cloneOperations(operations))

    // Final step should be 3 if operations are ordered
    const mongoDoc = await mongoCol.findOne({ name: 'test' })
    const mondoDoc = await mondoCol.findOne({ name: 'test' })

    expect(mongoDoc?.step).toBe(3)
    expect(mondoDoc?.step).toBe(3)
  })

  it('insert then update same document', async () => {
    const dbName = `test_bulk_insert_update_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const operations: BulkWriteOperation<Document>[] = [
      { insertOne: { document: { name: 'fresh', value: 100 } } },
      { updateOne: { filter: { name: 'fresh' }, update: { $inc: { value: 50 } } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.insertedCount).toBe(1)
    expect(mondoResult.insertedCount).toBe(1)
    expect(mongoResult.matchedCount).toBe(1)
    expect(mondoResult.matchedCount).toBe(1)

    const mongoDoc = await mongoCol.findOne({ name: 'fresh' })
    const mondoDoc = await mondoCol.findOne({ name: 'fresh' })

    expect(mongoDoc?.value).toBe(150)
    expect(mondoDoc?.value).toBe(150)
  })

  it('update then delete same document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = [
      { updateOne: { filter: { name: 'Alice' }, update: { $set: { marked: true } } } },
      { deleteOne: { filter: { marked: true } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.matchedCount).toBe(1)
    expect(mondoResult.matchedCount).toBe(1)
    expect(mongoResult.deletedCount).toBe(1)
    expect(mondoResult.deletedCount).toBe(1)

    // Alice should be gone
    const mongoAlice = await mongoCol.findOne({ name: 'Alice' })
    const mondoAlice = await mondoCol.findOne({ name: 'Alice' })

    expect(mongoAlice).toBeNull()
    expect(mondoAlice).toBeNull()
  })

  it('empty operations array behavior matches', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const operations: BulkWriteOperation<Document>[] = []

    // MongoDB throws an error for empty bulk operations
    // We check that if MongoDB throws, mongo.do either throws or returns empty result
    let mongoError: any
    let mongoResult: any
    let mondoResult: any
    let mondoError: any

    try {
      mongoResult = await mongoCol.bulkWrite(operations)
    } catch (e) {
      mongoError = e
    }

    try {
      mondoResult = await mondoCol.bulkWrite(operations)
    } catch (e) {
      mondoError = e
    }

    // If MongoDB throws, we accept either mongo.do throwing or returning empty result
    if (mongoError) {
      // mongo.do either throws or returns zero counts
      if (!mondoError && mondoResult) {
        expect(mondoResult.insertedCount).toBe(0)
        expect(mondoResult.matchedCount).toBe(0)
        expect(mondoResult.deletedCount).toBe(0)
      }
    } else {
      // If MongoDB doesn't throw, mongo.do shouldn't either
      expect(mondoError).toBeUndefined()
    }
  })

  it('large batch of operations', async () => {
    const dbName = `test_bulk_large_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    // Create 50 insert operations
    const operations: BulkWriteOperation<Document>[] = []
    for (let i = 0; i < 50; i++) {
      operations.push({ insertOne: { document: { index: i, value: i * 10 } } })
    }

    const mongoResult = await mongoCol.bulkWrite(operations)
    const mondoResult = await mondoCol.bulkWrite(
      cloneOperations(operations)
    )

    expect(mongoResult.insertedCount).toBe(50)
    expect(mondoResult.insertedCount).toBe(50)

    const mongoCount = await mongoCol.countDocuments({})
    const mondoCount = await mondoCol.countDocuments({})

    expect(mongoCount).toBe(50)
    expect(mondoCount).toBe(50)
  })
})

describe('bulkWrite Ordered Option Compatibility', () => {
  let mongodb: TestProvider
  let mongo.do: TestProvider
  let testNum = 700

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mongo.do = providers.mongo.do
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mongo.do)
  })

  beforeEach(() => {
    testNum++
  })

  it('ordered: true executes operations in sequence', async () => {
    const dbName = `test_bulk_ordered_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    // Test ordered execution by checking sequence
    const operations: BulkWriteOperation<Document>[] = [
      { insertOne: { document: { name: 'step1', order: 1 } } },
      { insertOne: { document: { name: 'step2', order: 2 } } },
      { insertOne: { document: { name: 'step3', order: 3 } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(cloneOperations(operations), { ordered: true })
    const mondoResult = await mondoCol.bulkWrite(cloneOperations(operations), { ordered: true })

    expect(mongoResult.insertedCount).toBe(3)
    expect(mondoResult.insertedCount).toBe(3)

    // Verify all documents were inserted
    const mongoDocs = await mongoCol.find({}).sort({ order: 1 }).toArray()
    const mondoDocs = await mondoCol.find({}).sort({ order: 1 }).toArray()

    expect(mongoDocs.length).toBe(3)
    expect(mondoDocs.length).toBe(3)
    expect(mongoDocs.map(d => d.name)).toEqual(['step1', 'step2', 'step3'])
    expect(mondoDocs.map(d => d.name)).toEqual(['step1', 'step2', 'step3'])
  })

  it('ordered: false executes all operations', async () => {
    const dbName = `test_bulk_unordered_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    // Test unordered execution
    const operations: BulkWriteOperation<Document>[] = [
      { insertOne: { document: { name: 'first' } } },
      { insertOne: { document: { name: 'second' } } },
      { insertOne: { document: { name: 'third' } } },
    ]

    const mongoResult = await mongoCol.bulkWrite(cloneOperations(operations), { ordered: false })
    const mondoResult = await mondoCol.bulkWrite(cloneOperations(operations), { ordered: false })

    expect(mongoResult.insertedCount).toBe(3)
    expect(mondoResult.insertedCount).toBe(3)

    // Verify all documents were inserted
    const mongoDocs = await mongoCol.find({}).toArray()
    const mondoDocs = await mondoCol.find({}).toArray()

    expect(mongoDocs.length).toBe(3)
    expect(mondoDocs.length).toBe(3)
  })

  it('default ordered is true', async () => {
    const dbName = `test_bulk_default_ordered_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    // Insert then update - tests that operations are applied in order
    const operations: BulkWriteOperation<Document>[] = [
      { insertOne: { document: { name: 'test', value: 1 } } },
      { updateOne: { filter: { name: 'test' }, update: { $set: { value: 2 } } } },
    ]

    await mongoCol.bulkWrite(cloneOperations(operations))
    await mondoCol.bulkWrite(cloneOperations(operations))

    // If ordered, the update should find and update the inserted doc
    const mongoDoc = await mongoCol.findOne({ name: 'test' })
    const mondoDoc = await mondoCol.findOne({ name: 'test' })

    expect(mongoDoc?.value).toBe(2)
    expect(mondoDoc?.value).toBe(2)
  })
})
