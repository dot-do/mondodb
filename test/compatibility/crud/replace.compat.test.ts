import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'
import { ObjectId } from '../../../src/types/objectid'

describe('replaceOne Compatibility', () => {
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
    const dbName = `test_replace_${testNum}`
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

  it('returns matching UpdateResult structure', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.replaceOne(
      { name: 'Alice' },
      { name: 'Alice', status: 'replaced' }
    )
    const mondoResult = await mondoCol.replaceOne(
      { name: 'Alice' },
      { name: 'Alice', status: 'replaced' }
    )

    expect(mongoResult.acknowledged).toBe(true)
    expect(mondoResult.acknowledged).toBe(true)
    expect(mongoResult.matchedCount).toBe(1)
    expect(mondoResult.matchedCount).toBe(1)
    expect(mongoResult.modifiedCount).toBe(1)
    expect(mondoResult.modifiedCount).toBe(1)
  })

  it('preserves _id on replace', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const originalMongo = await mongoCol.findOne({ name: 'Alice' })
    const originalMondo = await mondoCol.findOne({ name: 'Alice' })

    await mongoCol.replaceOne({ name: 'Alice' }, { completely: 'new' })
    await mondoCol.replaceOne({ name: 'Alice' }, { completely: 'new' })

    const replacedMongo = await mongoCol.findOne({ completely: 'new' })
    const replacedMondo = await mondoCol.findOne({ completely: 'new' })

    expect(replacedMongo?._id.toHexString()).toBe(originalMongo?._id.toHexString())
    expect(replacedMondo?._id.toHexString()).toBe(originalMondo?._id.toHexString())
  })

  it('removes fields not in replacement', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    // Original has: name, age, city, extra
    await mongoCol.replaceOne({ name: 'Alice' }, { name: 'Alice', newField: 'only' })
    await mondoCol.replaceOne({ name: 'Alice' }, { name: 'Alice', newField: 'only' })

    const mongoDoc = await mongoCol.findOne({ name: 'Alice' })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' })

    // Old fields should be gone
    expect(mongoDoc?.age).toBeUndefined()
    expect(mondoDoc?.age).toBeUndefined()
    expect(mongoDoc?.city).toBeUndefined()
    expect(mondoDoc?.city).toBeUndefined()
    expect(mongoDoc?.extra).toBeUndefined()
    expect(mondoDoc?.extra).toBeUndefined()

    // New field should exist
    expect(mongoDoc?.newField).toBe('only')
    expect(mondoDoc?.newField).toBe('only')
  })

  it('matchedCount is 0 when no match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.replaceOne({ name: 'Nobody' }, { x: 1 })
    const mondoResult = await mondoCol.replaceOne({ name: 'Nobody' }, { x: 1 })

    expect(mongoResult.matchedCount).toBe(0)
    expect(mondoResult.matchedCount).toBe(0)
    expect(mongoResult.modifiedCount).toBe(0)
    expect(mondoResult.modifiedCount).toBe(0)
  })

  it('upsert creates document when no match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.replaceOne(
      { name: 'NewPerson' },
      { name: 'NewPerson', created: true },
      { upsert: true }
    )
    const mondoResult = await mondoCol.replaceOne(
      { name: 'NewPerson' },
      { name: 'NewPerson', created: true },
      { upsert: true }
    )

    expect(mongoResult.upsertedId).toBeDefined()
    expect(mondoResult.upsertedId).toBeDefined()

    const mongoDoc = await mongoCol.findOne({ name: 'NewPerson' })
    const mondoDoc = await mondoCol.findOne({ name: 'NewPerson' })

    expect(mongoDoc?.created).toBe(true)
    expect(mondoDoc?.created).toBe(true)
  })

  it('replaces with empty document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    await mongoCol.replaceOne({ name: 'Alice' }, {})
    await mondoCol.replaceOne({ name: 'Alice' }, {})

    // Find by _id since name is gone
    const mongoDocs = await mongoCol.find({}).toArray()
    const mondoDocs = await mondoCol.find({}).toArray()

    // One doc should have no name (was replaced with empty)
    const mongoEmpty = mongoDocs.find(d => !d.name)
    const mondoEmpty = mondoDocs.find(d => !d.name)

    expect(mongoEmpty).toBeDefined()
    expect(mondoEmpty).toBeDefined()
    expect(mongoEmpty?._id).toBeDefined()
    expect(mondoEmpty?._id).toBeDefined()
  })
})
