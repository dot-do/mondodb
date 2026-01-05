import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'
import { compareResults, assertResultsMatch } from '../compare'
import { ObjectId } from '../../../src/types/objectid'

describe('findOne Compatibility', () => {
  let mongodb: TestProvider
  let mondodo: TestProvider
  let testNum = 0

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mondodo = providers.mondodo
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mondodo)
  })

  beforeEach(() => {
    testNum++
  })

  const setupCollections = async () => {
    const dbName = `test_find_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mondodo.database(dbName).collection('items')

    // Seed with test data
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

  it('finds existing document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOne({ name: 'Alice' })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' })

    expect(mongoDoc).not.toBeNull()
    expect(mondoDoc).not.toBeNull()
    expect(mongoDoc?.name).toBe('Alice')
    expect(mondoDoc?.name).toBe('Alice')
    expect(mongoDoc?.age).toBe(30)
    expect(mondoDoc?.age).toBe(30)
  })

  it('returns null for non-existent document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOne({ name: 'Nobody' })
    const mondoDoc = await mondoCol.findOne({ name: 'Nobody' })

    expect(mongoDoc).toBeNull()
    expect(mondoDoc).toBeNull()
  })

  it('empty filter returns any document', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOne({})
    const mondoDoc = await mondoCol.findOne({})

    expect(mongoDoc).not.toBeNull()
    expect(mondoDoc).not.toBeNull()
    // Both should have _id and name fields
    expect(mongoDoc?._id).toBeDefined()
    expect(mondoDoc?._id).toBeDefined()
    expect(mongoDoc?.name).toBeDefined()
    expect(mondoDoc?.name).toBeDefined()
  })

  it('finds by _id', async () => {
    const dbName = `test_find_by_id_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mondodo.database(dbName).collection('items')

    const id = new ObjectId()
    await mongoCol.insertOne({ _id: new ObjectId(id.toHexString()), name: 'Test' })
    await mondoCol.insertOne({ _id: id, name: 'Test' })

    const mongoDoc = await mongoCol.findOne({ _id: new ObjectId(id.toHexString()) })
    const mondoDoc = await mondoCol.findOne({ _id: id })

    expect(mongoDoc?.name).toBe('Test')
    expect(mondoDoc?.name).toBe('Test')
  })

  it('applies projection (inclusion)', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOne({ name: 'Alice' }, { projection: { name: 1 } })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' }, { projection: { name: 1 } })

    expect(mongoDoc?.name).toBe('Alice')
    expect(mondoDoc?.name).toBe('Alice')
    // _id is included by default, age and city should be excluded
    expect(mongoDoc?._id).toBeDefined()
    expect(mondoDoc?._id).toBeDefined()
  })

  it('applies projection (exclusion)', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOne({ name: 'Alice' }, { projection: { age: 0 } })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' }, { projection: { age: 0 } })

    expect(mongoDoc?.name).toBe('Alice')
    expect(mondoDoc?.name).toBe('Alice')
    expect(mongoDoc?.city).toBe('NYC')
    expect(mondoDoc?.city).toBe('NYC')
    // age should be excluded
    expect(mongoDoc?.age).toBeUndefined()
    expect(mondoDoc?.age).toBeUndefined()
  })

  it('projection excludes _id when specified', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDoc = await mongoCol.findOne({ name: 'Alice' }, { projection: { _id: 0, name: 1 } })
    const mondoDoc = await mondoCol.findOne({ name: 'Alice' }, { projection: { _id: 0, name: 1 } })

    expect(mongoDoc?.name).toBe('Alice')
    expect(mondoDoc?.name).toBe('Alice')
    expect(mongoDoc?._id).toBeUndefined()
    expect(mondoDoc?._id).toBeUndefined()
  })

  it('handles nested field filter', async () => {
    const dbName = `test_find_nested_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mondodo.database(dbName).collection('items')

    await mongoCol.insertOne({ user: { name: 'Nested', level: 5 } })
    await mondoCol.insertOne({ user: { name: 'Nested', level: 5 } })

    const mongoDoc = await mongoCol.findOne({ 'user.name': 'Nested' })
    const mondoDoc = await mondoCol.findOne({ 'user.name': 'Nested' })

    expect(mongoDoc?.user?.name).toBe('Nested')
    expect(mondoDoc?.user?.name).toBe('Nested')
  })
})

describe('find (cursor) Compatibility', () => {
  let mongodb: TestProvider
  let mondodo: TestProvider
  let testNum = 100

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mondodo = providers.mondodo
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mondodo)
  })

  beforeEach(() => {
    testNum++
  })

  const setupCollections = async () => {
    const dbName = `test_find_cursor_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mondodo.database(dbName).collection('items')

    const docs = [
      { name: 'A', value: 1 },
      { name: 'B', value: 2 },
      { name: 'C', value: 3 },
      { name: 'D', value: 4 },
      { name: 'E', value: 5 },
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  it('toArray returns all matching documents', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDocs = await mongoCol.find({}).toArray()
    const mondoDocs = await mondoCol.find({}).toArray()

    expect(mongoDocs.length).toBe(5)
    expect(mondoDocs.length).toBe(5)
  })

  it('empty result returns empty array', async () => {
    const dbName = `test_find_empty_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mondodo.database(dbName).collection('items')

    const mongoDocs = await mongoCol.find({ nonexistent: true }).toArray()
    const mondoDocs = await mondoCol.find({ nonexistent: true }).toArray()

    expect(mongoDocs).toEqual([])
    expect(mondoDocs).toEqual([])
  })

  it('limit restricts results', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDocs = await mongoCol.find({}).limit(2).toArray()
    const mondoDocs = await mondoCol.find({}).limit(2).toArray()

    expect(mongoDocs.length).toBe(2)
    expect(mondoDocs.length).toBe(2)
  })

  it('skip offsets results', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDocs = await mongoCol.find({}).sort({ value: 1 }).skip(2).toArray()
    const mondoDocs = await mondoCol.find({}).sort({ value: 1 }).skip(2).toArray()

    expect(mongoDocs.length).toBe(3)
    expect(mondoDocs.length).toBe(3)
    expect(mongoDocs[0]?.value).toBe(3)
    expect(mondoDocs[0]?.value).toBe(3)
  })

  it('sort orders ascending', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDocs = await mongoCol.find({}).sort({ value: 1 }).toArray()
    const mondoDocs = await mondoCol.find({}).sort({ value: 1 }).toArray()

    expect(mongoDocs.map(d => d.value)).toEqual([1, 2, 3, 4, 5])
    expect(mondoDocs.map(d => d.value)).toEqual([1, 2, 3, 4, 5])
  })

  it('sort orders descending', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDocs = await mongoCol.find({}).sort({ value: -1 }).toArray()
    const mondoDocs = await mondoCol.find({}).sort({ value: -1 }).toArray()

    expect(mongoDocs.map(d => d.value)).toEqual([5, 4, 3, 2, 1])
    expect(mondoDocs.map(d => d.value)).toEqual([5, 4, 3, 2, 1])
  })

  it('chains limit, skip, sort together', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDocs = await mongoCol.find({}).sort({ value: -1 }).skip(1).limit(2).toArray()
    const mondoDocs = await mondoCol.find({}).sort({ value: -1 }).skip(1).limit(2).toArray()

    expect(mongoDocs.length).toBe(2)
    expect(mondoDocs.length).toBe(2)
    expect(mongoDocs.map(d => d.value)).toEqual([4, 3])
    expect(mondoDocs.map(d => d.value)).toEqual([4, 3])
  })

  it('filter with query', async () => {
    const { mongoCol, mondoCol } = await setupCollections()

    const mongoDocs = await mongoCol.find({ value: { $gt: 3 } }).toArray()
    const mondoDocs = await mondoCol.find({ value: { $gt: 3 } }).toArray()

    expect(mongoDocs.length).toBe(2)
    expect(mondoDocs.length).toBe(2)
  })
})
