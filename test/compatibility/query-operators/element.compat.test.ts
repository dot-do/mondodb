import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'

describe('Element Query Operators Compatibility', () => {
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

  describe('$exists', () => {
    const setupCollections = async () => {
      const dbName = `test_exists_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const docs = [
        { name: 'A', value: 10 },           // has value
        { name: 'B', value: null },         // value is null
        { name: 'C' },                      // no value field
        { name: 'D', value: 0 },            // value is 0 (falsy)
        { name: 'E', value: '' },           // value is empty string
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('$exists:true matches documents with field', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $exists: true } }).sort({ name: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $exists: true } }).sort({ name: 1 }).toArray()

      // A, B, D, E have the field (including null, 0, empty string)
      expect(mongoDocs.length).toBe(4)
      expect(mondoDocs.length).toBe(4)
      expect(mongoDocs.map(d => d.name)).toEqual(['A', 'B', 'D', 'E'])
      expect(mondoDocs.map(d => d.name)).toEqual(['A', 'B', 'D', 'E'])
    })

    it('$exists:false matches documents without field', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $exists: false } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $exists: false } }).toArray()

      // Only C has no value field
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('C')
      expect(mondoDocs[0]?.name).toBe('C')
    })

    it('$exists:true on null field returns true (field exists)', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // This is the critical edge case - null means field exists but has null value
      const mongoDocs = await mongoCol.find({ value: { $exists: true }, name: 'B' }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $exists: true }, name: 'B' }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
    })

    it('$exists on nested field', async () => {
      const dbName = `test_exists_nested_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ user: { name: 'Alice' } })
      await mongoCol.insertOne({ user: {} })
      await mongoCol.insertOne({})

      await mondoCol.insertOne({ user: { name: 'Alice' } })
      await mondoCol.insertOne({ user: {} })
      await mondoCol.insertOne({})

      const mongoDocs = await mongoCol.find({ 'user.name': { $exists: true } }).toArray()
      const mondoDocs = await mondoCol.find({ 'user.name': { $exists: true } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
    })
  })

  describe('$type', () => {
    const setupCollections = async () => {
      const dbName = `test_type_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const docs = [
        { name: 'str', value: 'hello' },
        { name: 'num', value: 42 },
        { name: 'bool', value: true },
        { name: 'arr', value: [1, 2, 3] },
        { name: 'obj', value: { nested: true } },
        { name: 'null', value: null },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('$type:"string" matches strings', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $type: 'string' } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $type: 'string' } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('str')
      expect(mondoDocs[0]?.name).toBe('str')
    })

    it('$type:"number" matches numbers', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $type: 'number' } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $type: 'number' } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('num')
      expect(mondoDocs[0]?.name).toBe('num')
    })

    it('$type:"bool" matches booleans', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $type: 'bool' } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $type: 'bool' } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('bool')
      expect(mondoDocs[0]?.name).toBe('bool')
    })

    it('$type:"array" matches arrays', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $type: 'array' } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $type: 'array' } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('arr')
      expect(mondoDocs[0]?.name).toBe('arr')
    })

    it('$type:"object" matches embedded documents', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $type: 'object' } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $type: 'object' } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('obj')
      expect(mondoDocs[0]?.name).toBe('obj')
    })

    it('$type:"null" matches null values', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $type: 'null' } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $type: 'null' } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('null')
      expect(mondoDocs[0]?.name).toBe('null')
    })
  })
})
