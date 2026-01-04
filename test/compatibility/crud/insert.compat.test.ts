import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider, TestCollection } from '../providers/types'
import { compareResults, assertResultsMatch } from '../compare'
import { ObjectId } from '../../../src/types/objectid'

describe('insertOne Compatibility', () => {
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

  const getCollections = () => {
    const dbName = `test_insert_${testNum}`
    return {
      mongoCol: mongodb.database(dbName).collection('items'),
      mondoCol: mondodb.database(dbName).collection('items'),
    }
  }

  it('returns matching InsertOneResult structure', async () => {
    const { mongoCol, mondoCol } = getCollections()
    const doc = { name: 'test', count: 42 }

    const mongoResult = await mongoCol.insertOne(doc)
    const mondoResult = await mondoCol.insertOne({ ...doc })

    // Both should have acknowledged: true and an insertedId
    expect(mongoResult.acknowledged).toBe(true)
    expect(mondoResult.acknowledged).toBe(true)
    expect(mongoResult.insertedId).toBeDefined()
    expect(mondoResult.insertedId).toBeDefined()

    // Compare structure (ObjectIds normalized)
    const comparison = compareResults(mongoResult, mondoResult)
    expect(comparison.match).toBe(true)
  })

  it('preserves provided _id', async () => {
    const { mongoCol, mondoCol } = getCollections()
    const id = new ObjectId()
    const doc = { _id: id, name: 'with-id' }

    const mongoResult = await mongoCol.insertOne({ ...doc, _id: new ObjectId(id.toHexString()) })
    const mondoResult = await mondoCol.insertOne({ ...doc })

    expect(mongoResult.insertedId.toHexString()).toBe(id.toHexString())
    expect(mondoResult.insertedId.toHexString()).toBe(id.toHexString())
  })

  it('generates ObjectId when _id not provided', async () => {
    const { mongoCol, mondoCol } = getCollections()

    const mongoResult = await mongoCol.insertOne({ name: 'no-id' })
    const mondoResult = await mondoCol.insertOne({ name: 'no-id' })

    expect(mongoResult.insertedId).toBeDefined()
    expect(mondoResult.insertedId).toBeDefined()
    // Both should be ObjectId instances
    expect(typeof mongoResult.insertedId.toHexString).toBe('function')
    expect(typeof mondoResult.insertedId.toHexString).toBe('function')
  })

  it('handles nested documents', async () => {
    const { mongoCol, mondoCol } = getCollections()
    const doc = {
      user: { name: 'Alice', address: { city: 'NYC', zip: '10001' } },
      tags: ['a', 'b', 'c'],
    }

    const mongoResult = await mongoCol.insertOne({ ...doc })
    const mondoResult = await mondoCol.insertOne({ ...doc })

    assertResultsMatch(mongoResult, mondoResult)

    // Verify data was stored correctly
    const mongoDoc = await mongoCol.findOne({})
    const mondoDoc = await mondoCol.findOne({})

    expect(mongoDoc?.user?.name).toBe('Alice')
    expect(mondoDoc?.user?.name).toBe('Alice')
    expect(mongoDoc?.user?.address?.city).toBe('NYC')
    expect(mondoDoc?.user?.address?.city).toBe('NYC')
  })

  it('handles array fields', async () => {
    const { mongoCol, mondoCol } = getCollections()
    const doc = { items: [1, 2, 3], names: ['a', 'b'] }

    await mongoCol.insertOne({ ...doc })
    await mondoCol.insertOne({ ...doc })

    const mongoDoc = await mongoCol.findOne({})
    const mondoDoc = await mondoCol.findOne({})

    expect(mongoDoc?.items).toEqual([1, 2, 3])
    expect(mondoDoc?.items).toEqual([1, 2, 3])
  })

  it('handles null values', async () => {
    const { mongoCol, mondoCol } = getCollections()
    const doc = { name: 'test', value: null }

    await mongoCol.insertOne({ ...doc })
    await mondoCol.insertOne({ ...doc })

    const mongoDoc = await mongoCol.findOne({})
    const mondoDoc = await mondoCol.findOne({})

    expect(mongoDoc?.value).toBeNull()
    expect(mondoDoc?.value).toBeNull()
  })

  it('throws error code 11000 on duplicate _id', async () => {
    const { mongoCol, mondoCol } = getCollections()
    const id = new ObjectId()
    const doc = { _id: id, name: 'first' }

    // Insert first document
    await mongoCol.insertOne({ ...doc, _id: new ObjectId(id.toHexString()) })
    await mondoCol.insertOne({ ...doc })

    // Try to insert duplicate
    let mongoError: any
    let mondoError: any

    try {
      await mongoCol.insertOne({ _id: new ObjectId(id.toHexString()), name: 'second' })
    } catch (e) {
      mongoError = e
    }

    try {
      await mondoCol.insertOne({ _id: id, name: 'second' })
    } catch (e) {
      mondoError = e
    }

    expect(mongoError).toBeDefined()
    expect(mondoError).toBeDefined()
    expect(mongoError.code).toBe(11000)
    expect(mondoError.code).toBe(11000)
  })

  it('handles empty document', async () => {
    const { mongoCol, mondoCol } = getCollections()

    const mongoResult = await mongoCol.insertOne({})
    const mondoResult = await mondoCol.insertOne({})

    expect(mongoResult.acknowledged).toBe(true)
    expect(mondoResult.acknowledged).toBe(true)
    expect(mongoResult.insertedId).toBeDefined()
    expect(mondoResult.insertedId).toBeDefined()
  })
})

describe('insertMany Compatibility', () => {
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

  const getCollections = () => {
    const dbName = `test_insert_many_${testNum}`
    return {
      mongoCol: mongodb.database(dbName).collection('items'),
      mondoCol: mondodb.database(dbName).collection('items'),
    }
  }

  it('returns matching InsertManyResult structure', async () => {
    const { mongoCol, mondoCol } = getCollections()
    const docs = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]

    const mongoResult = await mongoCol.insertMany(docs.map(d => ({ ...d })))
    const mondoResult = await mondoCol.insertMany(docs.map(d => ({ ...d })))

    expect(mongoResult.acknowledged).toBe(true)
    expect(mondoResult.acknowledged).toBe(true)
    expect(mongoResult.insertedCount).toBe(3)
    expect(mondoResult.insertedCount).toBe(3)

    // insertedIds should have entries for indices 0, 1, 2
    expect(Object.keys(mongoResult.insertedIds).length).toBe(3)
    expect(Object.keys(mondoResult.insertedIds).length).toBe(3)
  })

  it('insertedIds mapping is correct', async () => {
    const { mongoCol, mondoCol } = getCollections()
    const docs = [{ name: 'first' }, { name: 'second' }]

    const mongoResult = await mongoCol.insertMany(docs.map(d => ({ ...d })))
    const mondoResult = await mondoCol.insertMany(docs.map(d => ({ ...d })))

    // Verify the mapping structure
    expect(mongoResult.insertedIds[0]).toBeDefined()
    expect(mongoResult.insertedIds[1]).toBeDefined()
    expect(mondoResult.insertedIds[0]).toBeDefined()
    expect(mondoResult.insertedIds[1]).toBeDefined()

    // Verify we can find documents by their inserted IDs
    const mongoDoc = await mongoCol.findOne({ _id: mongoResult.insertedIds[0] })
    const mondoDoc = await mondoCol.findOne({ _id: mondoResult.insertedIds[0] })

    expect(mongoDoc?.name).toBe('first')
    expect(mondoDoc?.name).toBe('first')
  })

  it('handles single document in array', async () => {
    const { mongoCol, mondoCol } = getCollections()

    const mongoResult = await mongoCol.insertMany([{ solo: true }])
    const mondoResult = await mondoCol.insertMany([{ solo: true }])

    expect(mongoResult.insertedCount).toBe(1)
    expect(mondoResult.insertedCount).toBe(1)
  })

  it('handles documents with mixed field types', async () => {
    const { mongoCol, mondoCol } = getCollections()
    const docs = [
      { str: 'hello', num: 42, bool: true, arr: [1, 2], obj: { x: 1 } },
      { str: 'world', num: 0, bool: false, arr: [], obj: {} },
    ]

    const mongoResult = await mongoCol.insertMany(docs.map(d => ({ ...d })))
    const mondoResult = await mondoCol.insertMany(docs.map(d => ({ ...d })))

    expect(mongoResult.insertedCount).toBe(2)
    expect(mondoResult.insertedCount).toBe(2)
  })
})
