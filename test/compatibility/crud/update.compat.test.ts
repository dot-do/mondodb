import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'
import { compareResults, assertResultsMatch } from '../compare'
import { ObjectId } from '../../../src/types/objectid'

describe('updateOne Compatibility', () => {
  let mongodb: TestProvider
  let mondodb: TestProvider
  let testNum = 0

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mondodb = providers.mondodb
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mondodb)
  })

  beforeEach(() => {
    testNum++
  })

  const setupCollections = async () => {
    const dbName = `test_update_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mondodb.database(dbName).collection('items')

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

  it('returns matching UpdateResult structure', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.updateOne({ name: 'Alice' }, { $set: { age: 31 } })
    const mondoResult = await mondoCol.updateOne({ name: 'Alice' }, { $set: { age: 31 } })

    expect(mongoResult.acknowledged).toBe(true)
    expect(mondoResult.acknowledged).toBe(true)
    expect(mongoResult.matchedCount).toBe(1)
    expect(mondoResult.matchedCount).toBe(1)
    expect(mongoResult.modifiedCount).toBe(1)
    expect(mondoResult.modifiedCount).toBe(1)
  })

  it('matchedCount is 0 when no match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.updateOne({ name: 'Nobody' }, { $set: { age: 100 } })
    const mondoResult = await mondoCol.updateOne({ name: 'Nobody' }, { $set: { age: 100 } })

    expect(mongoResult.matchedCount).toBe(0)
    expect(mondoResult.matchedCount).toBe(0)
    expect(mongoResult.modifiedCount).toBe(0)
    expect(mondoResult.modifiedCount).toBe(0)
  })

  it('upsert creates new document when no match', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.updateOne(
      { name: 'NewPerson' },
      { $set: { age: 40 } },
      { upsert: true }
    )
    const mondoResult = await mondoCol.updateOne(
      { name: 'NewPerson' },
      { $set: { age: 40 } },
      { upsert: true }
    )

    expect(mongoResult.matchedCount).toBe(0)
    expect(mondoResult.matchedCount).toBe(0)
    expect(mongoResult.upsertedId).toBeDefined()
    expect(mondoResult.upsertedId).toBeDefined()

    // Verify document was created
    const mongoDoc = await mongoCol.findOne({ name: 'NewPerson' })
    const mondoDoc = await mondoCol.findOne({ name: 'NewPerson' })
    expect(mongoDoc?.age).toBe(40)
    expect(mondoDoc?.age).toBe(40)
  })

  it('updates only first matching document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    // Both Alice and Charlie are in NYC
    await mongoCol.updateOne({ city: 'NYC' }, { $set: { updated: true } })
    await mondoCol.updateOne({ city: 'NYC' }, { $set: { updated: true } })

    const mongoUpdated = await mongoCol.find({ updated: true }).toArray()
    const mondoUpdated = await mondoCol.find({ updated: true }).toArray()

    expect(mongoUpdated.length).toBe(1)
    expect(mondoUpdated.length).toBe(1)
  })

  it('$set updates field value', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    await mongoCol.updateOne({ name: 'Alice' }, { $set: { age: 99, newField: 'hello' } })
    await mondoCol.updateOne({ name: 'Alice' }, { $set: { age: 99, newField: 'hello' } })

    const mongoDoc = await mongoCol.findOne({ name: 'Alice' })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' })

    expect(mongoDoc?.age).toBe(99)
    expect(mondoDoc?.age).toBe(99)
    expect(mongoDoc?.newField).toBe('hello')
    expect(mondoDoc?.newField).toBe('hello')
  })

  it('$inc increments numeric field', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    await mongoCol.updateOne({ name: 'Alice' }, { $inc: { age: 5 } })
    await mondoCol.updateOne({ name: 'Alice' }, { $inc: { age: 5 } })

    const mongoDoc = await mongoCol.findOne({ name: 'Alice' })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' })

    expect(mongoDoc?.age).toBe(35)
    expect(mondoDoc?.age).toBe(35)
  })

  it('$unset removes field', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    await mongoCol.updateOne({ name: 'Alice' }, { $unset: { city: '' } })
    await mondoCol.updateOne({ name: 'Alice' }, { $unset: { city: '' } })

    const mongoDoc = await mongoCol.findOne({ name: 'Alice' })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' })

    expect(mongoDoc?.city).toBeUndefined()
    expect(mondoDoc?.city).toBeUndefined()
  })
})

describe('updateMany Compatibility', () => {
  let mongodb: TestProvider
  let mondodb: TestProvider
  let testNum = 100

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mondodb = providers.mondodb
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mondodb)
  })

  beforeEach(() => {
    testNum++
  })

  const setupCollections = async () => {
    const dbName = `test_update_many_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mondodb.database(dbName).collection('items')

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

  it('updates all matching documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.updateMany({ status: 'active' }, { $set: { processed: true } })
    const mondoResult = await mondoCol.updateMany({ status: 'active' }, { $set: { processed: true } })

    expect(mongoResult.matchedCount).toBe(3)
    expect(mondoResult.matchedCount).toBe(3)
    expect(mongoResult.modifiedCount).toBe(3)
    expect(mondoResult.modifiedCount).toBe(3)

    const mongoProcessed = await mongoCol.find({ processed: true }).toArray()
    const mondoProcessed = await mondoCol.find({ processed: true }).toArray()
    expect(mongoProcessed.length).toBe(3)
    expect(mondoProcessed.length).toBe(3)
  })

  it('empty filter updates all documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.updateMany({}, { $set: { touched: true } })
    const mondoResult = await mondoCol.updateMany({}, { $set: { touched: true } })

    expect(mongoResult.matchedCount).toBe(4)
    expect(mondoResult.matchedCount).toBe(4)
  })

  it('no matches returns zero counts', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoResult = await mongoCol.updateMany({ status: 'deleted' }, { $set: { x: 1 } })
    const mondoResult = await mondoCol.updateMany({ status: 'deleted' }, { $set: { x: 1 } })

    expect(mongoResult.matchedCount).toBe(0)
    expect(mondoResult.matchedCount).toBe(0)
    expect(mongoResult.modifiedCount).toBe(0)
    expect(mondoResult.modifiedCount).toBe(0)
  })

  it('$inc works on multiple documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    await mongoCol.updateMany({ status: 'active' }, { $inc: { value: 100 } })
    await mondoCol.updateMany({ status: 'active' }, { $inc: { value: 100 } })

    const mongoDocs = await mongoCol.find({ status: 'active' }).sort({ name: 1 }).toArray()
    const mondoDocs = await mondoCol.find({ status: 'active' }).sort({ name: 1 }).toArray()

    expect(mongoDocs.map(d => d.value)).toEqual([110, 120, 140])
    expect(mondoDocs.map(d => d.value)).toEqual([110, 120, 140])
  })
})
