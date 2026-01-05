import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'
import { ObjectId } from '../../../src/types/objectid'

describe('findOneAndUpdate Compatibility', () => {
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
    const dbName = `test_find_update_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const docs = [
      { name: 'Alice', score: 100 },
      { name: 'Bob', score: 200 },
      { name: 'Charlie', score: 150 },
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  it('returns original document by default (before)', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOneAndUpdate(
      { name: 'Alice' },
      { $set: { score: 999 } }
    )
    const mondoDoc = await mondoCol.findOneAndUpdate(
      { name: 'Alice' },
      { $set: { score: 999 } }
    )

    expect(mongoDoc?.name).toBe('Alice')
    expect(mondoDoc?.name).toBe('Alice')
    expect(mongoDoc?.score).toBe(100) // Original value
    expect(mondoDoc?.score).toBe(100)
  })

  it('returns updated document with returnDocument: after', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOneAndUpdate(
      { name: 'Alice' },
      { $set: { score: 999 } },
      { returnDocument: 'after' }
    )
    const mondoDoc = await mondoCol.findOneAndUpdate(
      { name: 'Alice' },
      { $set: { score: 999 } },
      { returnDocument: 'after' }
    )

    expect(mongoDoc?.name).toBe('Alice')
    expect(mondoDoc?.name).toBe('Alice')
    expect(mongoDoc?.score).toBe(999) // Updated value
    expect(mondoDoc?.score).toBe(999)
  })

  it('returns null when no match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOneAndUpdate(
      { name: 'Nobody' },
      { $set: { score: 1 } }
    )
    const mondoDoc = await mondoCol.findOneAndUpdate(
      { name: 'Nobody' },
      { $set: { score: 1 } }
    )

    expect(mongoDoc).toBeNull()
    expect(mondoDoc).toBeNull()
  })

  it('upsert creates and returns document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOneAndUpdate(
      { name: 'NewPerson' },
      { $set: { score: 50 } },
      { upsert: true, returnDocument: 'after' }
    )
    const mondoDoc = await mondoCol.findOneAndUpdate(
      { name: 'NewPerson' },
      { $set: { score: 50 } },
      { upsert: true, returnDocument: 'after' }
    )

    expect(mongoDoc?.name).toBe('NewPerson')
    expect(mondoDoc?.name).toBe('NewPerson')
    expect(mongoDoc?.score).toBe(50)
    expect(mondoDoc?.score).toBe(50)
  })

  it('applies sort to determine which document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    // Sort descending by score - should get Bob (200)
    const mongoDoc = await mongoCol.findOneAndUpdate(
      {},
      { $inc: { score: 1000 } },
      { sort: { score: -1 }, returnDocument: 'after' }
    )
    const mondoDoc = await mondoCol.findOneAndUpdate(
      {},
      { $inc: { score: 1000 } },
      { sort: { score: -1 }, returnDocument: 'after' }
    )

    expect(mongoDoc?.name).toBe('Bob')
    expect(mondoDoc?.name).toBe('Bob')
    expect(mongoDoc?.score).toBe(1200)
    expect(mondoDoc?.score).toBe(1200)
  })
})

describe('findOneAndDelete Compatibility', () => {
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
    const dbName = `test_find_delete_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const docs = [
      { name: 'A', priority: 1 },
      { name: 'B', priority: 2 },
      { name: 'C', priority: 3 },
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  it('returns deleted document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOneAndDelete({ name: 'A' })
    const mondoDoc = await mondoCol.findOneAndDelete({ name: 'A' })

    expect(mongoDoc?.name).toBe('A')
    expect(mondoDoc?.name).toBe('A')
    expect(mongoDoc?.priority).toBe(1)
    expect(mondoDoc?.priority).toBe(1)

    // Verify deleted
    const mongoRemaining = await mongoCol.findOne({ name: 'A' })
    const mondoRemaining = await mondoCol.findOne({ name: 'A' })
    expect(mongoRemaining).toBeNull()
    expect(mondoRemaining).toBeNull()
  })

  it('returns null when no match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOneAndDelete({ name: 'Nobody' })
    const mondoDoc = await mondoCol.findOneAndDelete({ name: 'Nobody' })

    expect(mongoDoc).toBeNull()
    expect(mondoDoc).toBeNull()
  })

  it('applies sort to determine which document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    // Sort by priority descending - should delete C (priority 3)
    const mongoDoc = await mongoCol.findOneAndDelete({}, { sort: { priority: -1 } })
    const mondoDoc = await mondoCol.findOneAndDelete({}, { sort: { priority: -1 } })

    expect(mongoDoc?.name).toBe('C')
    expect(mondoDoc?.name).toBe('C')
  })
})

describe('findOneAndReplace Compatibility', () => {
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
    const dbName = `test_find_replace_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    await mongoCol.insertOne({ name: 'Original', old: true, extra: 'data' })
    await mondoCol.insertOne({ name: 'Original', old: true, extra: 'data' })

    return { mongoCol, mondoCol }
  }

  it('returns original document by default', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOneAndReplace(
      { name: 'Original' },
      { name: 'Replaced', new: true }
    )
    const mondoDoc = await mondoCol.findOneAndReplace(
      { name: 'Original' },
      { name: 'Replaced', new: true }
    )

    expect(mongoDoc?.name).toBe('Original')
    expect(mondoDoc?.name).toBe('Original')
    expect(mongoDoc?.old).toBe(true)
    expect(mondoDoc?.old).toBe(true)
  })

  it('returns new document with returnDocument: after', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOneAndReplace(
      { name: 'Original' },
      { name: 'Replaced', new: true },
      { returnDocument: 'after' }
    )
    const mondoDoc = await mondoCol.findOneAndReplace(
      { name: 'Original' },
      { name: 'Replaced', new: true },
      { returnDocument: 'after' }
    )

    expect(mongoDoc?.name).toBe('Replaced')
    expect(mondoDoc?.name).toBe('Replaced')
    expect(mongoDoc?.new).toBe(true)
    expect(mondoDoc?.new).toBe(true)
    // Old fields should be gone
    expect(mongoDoc?.old).toBeUndefined()
    expect(mondoDoc?.old).toBeUndefined()
  })

  it('preserves _id on replace', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const originalMongo = await mongoCol.findOne({})
    const originalMondo = await mondoCol.findOne({})

    const mongoDoc = await mongoCol.findOneAndReplace(
      {},
      { completely: 'different' },
      { returnDocument: 'after' }
    )
    const mondoDoc = await mondoCol.findOneAndReplace(
      {},
      { completely: 'different' },
      { returnDocument: 'after' }
    )

    expect(mongoDoc?._id.toHexString()).toBe(originalMongo?._id.toHexString())
    expect(mondoDoc?._id.toHexString()).toBe(originalMondo?._id.toHexString())
  })

  it('returns null when no match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOneAndReplace({ name: 'Nobody' }, { x: 1 })
    const mondoDoc = await mondoCol.findOneAndReplace({ name: 'Nobody' }, { x: 1 })

    expect(mongoDoc).toBeNull()
    expect(mondoDoc).toBeNull()
  })
})
