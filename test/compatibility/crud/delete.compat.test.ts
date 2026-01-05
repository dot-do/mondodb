import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'
import { ObjectId } from '../../../src/types/objectid'

describe('deleteOne Compatibility', () => {
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

  const setupCollections = async () => {
    const dbName = `test_delete_${testNum}`
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

  it('returns matching DeleteResult structure', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.deleteOne({ name: 'Alice' })
    const mondoResult = await mondoCol.deleteOne({ name: 'Alice' })

    expect(mongoResult.acknowledged).toBe(true)
    expect(mondoResult.acknowledged).toBe(true)
    expect(mongoResult.deletedCount).toBe(1)
    expect(mondoResult.deletedCount).toBe(1)
  })

  it('deletedCount is 0 when no match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.deleteOne({ name: 'Nobody' })
    const mondoResult = await mondoCol.deleteOne({ name: 'Nobody' })

    expect(mongoResult.deletedCount).toBe(0)
    expect(mondoResult.deletedCount).toBe(0)
  })

  it('deletes only first matching document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    // Two documents in group A
    await mongoCol.deleteOne({ group: 'A' })
    await mondoCol.deleteOne({ group: 'A' })

    const mongoRemaining = await mongoCol.find({ group: 'A' }).toArray()
    const mondoRemaining = await mondoCol.find({ group: 'A' }).toArray()

    expect(mongoRemaining.length).toBe(1)
    expect(mondoRemaining.length).toBe(1)
  })

  it('deletes by _id', async () => {
    const dbName = `test_delete_id_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const id = new ObjectId()
    await mongoCol.insertOne({ _id: new ObjectId(id.toHexString()), name: 'Test' })
    await mondoCol.insertOne({ _id: id, name: 'Test' })

    await mongoCol.deleteOne({ _id: new ObjectId(id.toHexString()) })
    await mondoCol.deleteOne({ _id: id })

    const mongoDoc = await mongoCol.findOne({})
    const mondoDoc = await mondoCol.findOne({})

    expect(mongoDoc).toBeNull()
    expect(mondoDoc).toBeNull()
  })

  it('handles complex filter', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    await mongoCol.deleteOne({ name: 'Alice', group: 'A' })
    await mondoCol.deleteOne({ name: 'Alice', group: 'A' })

    const mongoAlice = await mongoCol.findOne({ name: 'Alice' })
    const mondoAlice = await mondoCol.findOne({ name: 'Alice' })

    expect(mongoAlice).toBeNull()
    expect(mondoAlice).toBeNull()
  })
})

describe('deleteMany Compatibility', () => {
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
    const dbName = `test_delete_many_${testNum}`
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

  it('deletes all matching documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.deleteMany({ status: 'active' })
    const mondoResult = await mondoCol.deleteMany({ status: 'active' })

    expect(mongoResult.deletedCount).toBe(3)
    expect(mondoResult.deletedCount).toBe(3)

    const mongoRemaining = await mongoCol.find({}).toArray()
    const mondoRemaining = await mondoCol.find({}).toArray()

    expect(mongoRemaining.length).toBe(2)
    expect(mondoRemaining.length).toBe(2)
  })

  it('empty filter deletes all documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.deleteMany({})
    const mondoResult = await mondoCol.deleteMany({})

    expect(mongoResult.deletedCount).toBe(5)
    expect(mondoResult.deletedCount).toBe(5)

    const mongoRemaining = await mongoCol.find({}).toArray()
    const mondoRemaining = await mondoCol.find({}).toArray()

    expect(mongoRemaining.length).toBe(0)
    expect(mondoRemaining.length).toBe(0)
  })

  it('no matches returns deletedCount 0', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.deleteMany({ status: 'deleted' })
    const mondoResult = await mondoCol.deleteMany({ status: 'deleted' })

    expect(mongoResult.deletedCount).toBe(0)
    expect(mondoResult.deletedCount).toBe(0)
  })

  it('delete from empty collection', async () => {
    const dbName = `test_delete_empty_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('empty')
    const mondoCol = mongo.do.database(dbName).collection('empty')

    const mongoResult = await mongoCol.deleteMany({})
    const mondoResult = await mondoCol.deleteMany({})

    expect(mongoResult.deletedCount).toBe(0)
    expect(mondoResult.deletedCount).toBe(0)
  })
})
