import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'

describe('Array Update Operators Compatibility', () => {
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

  describe('$push', () => {
    it('pushes single element', async () => {
      const dbName = `test_push_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ items: [1, 2] })
      await mondoCol.insertOne({ items: [1, 2] })

      await mongoCol.updateOne({}, { $push: { items: 3 } })
      await mondoCol.updateOne({}, { $push: { items: 3 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.items).toEqual([1, 2, 3])
      expect(mondoDoc?.items).toEqual([1, 2, 3])
    })

    it('creates array if field does not exist', async () => {
      const dbName = `test_push_create_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'test' })
      await mondoCol.insertOne({ name: 'test' })

      await mongoCol.updateOne({}, { $push: { items: 1 } })
      await mondoCol.updateOne({}, { $push: { items: 1 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.items).toEqual([1])
      expect(mondoDoc?.items).toEqual([1])
    })

    it('$push with $each for multiple elements', async () => {
      const dbName = `test_push_each_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ items: [1] })
      await mondoCol.insertOne({ items: [1] })

      await mongoCol.updateOne({}, { $push: { items: { $each: [2, 3, 4] } } })
      await mondoCol.updateOne({}, { $push: { items: { $each: [2, 3, 4] } } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.items).toEqual([1, 2, 3, 4])
      expect(mondoDoc?.items).toEqual([1, 2, 3, 4])
    })
  })

  describe('$pull', () => {
    it('removes matching value', async () => {
      const dbName = `test_pull_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ items: [1, 2, 3, 2, 4] })
      await mondoCol.insertOne({ items: [1, 2, 3, 2, 4] })

      await mongoCol.updateOne({}, { $pull: { items: 2 } })
      await mondoCol.updateOne({}, { $pull: { items: 2 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.items).toEqual([1, 3, 4])
      expect(mondoDoc?.items).toEqual([1, 3, 4])
    })

    it('removes nothing if value not present', async () => {
      const dbName = `test_pull_none_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ items: [1, 2, 3] })
      await mondoCol.insertOne({ items: [1, 2, 3] })

      await mongoCol.updateOne({}, { $pull: { items: 99 } })
      await mondoCol.updateOne({}, { $pull: { items: 99 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.items).toEqual([1, 2, 3])
      expect(mondoDoc?.items).toEqual([1, 2, 3])
    })
  })

  describe('$pop', () => {
    it('$pop:1 removes last element', async () => {
      const dbName = `test_pop_last_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ items: [1, 2, 3] })
      await mondoCol.insertOne({ items: [1, 2, 3] })

      await mongoCol.updateOne({}, { $pop: { items: 1 } })
      await mondoCol.updateOne({}, { $pop: { items: 1 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.items).toEqual([1, 2])
      expect(mondoDoc?.items).toEqual([1, 2])
    })

    it('$pop:-1 removes first element', async () => {
      const dbName = `test_pop_first_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ items: [1, 2, 3] })
      await mondoCol.insertOne({ items: [1, 2, 3] })

      await mongoCol.updateOne({}, { $pop: { items: -1 } })
      await mondoCol.updateOne({}, { $pop: { items: -1 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.items).toEqual([2, 3])
      expect(mondoDoc?.items).toEqual([2, 3])
    })
  })

  describe('$addToSet', () => {
    it('adds unique element', async () => {
      const dbName = `test_addtoset_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ tags: ['a', 'b'] })
      await mondoCol.insertOne({ tags: ['a', 'b'] })

      await mongoCol.updateOne({}, { $addToSet: { tags: 'c' } })
      await mondoCol.updateOne({}, { $addToSet: { tags: 'c' } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.tags).toContain('c')
      expect(mondoDoc?.tags).toContain('c')
      expect(mongoDoc?.tags?.length).toBe(3)
      expect(mondoDoc?.tags?.length).toBe(3)
    })

    it('does not add duplicate', async () => {
      const dbName = `test_addtoset_dup_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ tags: ['a', 'b'] })
      await mondoCol.insertOne({ tags: ['a', 'b'] })

      await mongoCol.updateOne({}, { $addToSet: { tags: 'a' } })
      await mondoCol.updateOne({}, { $addToSet: { tags: 'a' } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.tags).toEqual(['a', 'b'])
      expect(mondoDoc?.tags).toEqual(['a', 'b'])
    })

    it('$addToSet with $each', async () => {
      const dbName = `test_addtoset_each_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ tags: ['a'] })
      await mondoCol.insertOne({ tags: ['a'] })

      await mongoCol.updateOne({}, { $addToSet: { tags: { $each: ['a', 'b', 'c'] } } })
      await mondoCol.updateOne({}, { $addToSet: { tags: { $each: ['a', 'b', 'c'] } } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      // 'a' already exists, so only 'b' and 'c' added
      expect(mongoDoc?.tags?.length).toBe(3)
      expect(mondoDoc?.tags?.length).toBe(3)
      expect(mongoDoc?.tags).toContain('b')
      expect(mongoDoc?.tags).toContain('c')
      expect(mondoDoc?.tags).toContain('b')
      expect(mondoDoc?.tags).toContain('c')
    })

    it('creates array if field does not exist', async () => {
      const dbName = `test_addtoset_create_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'test' })
      await mondoCol.insertOne({ name: 'test' })

      await mongoCol.updateOne({}, { $addToSet: { tags: 'first' } })
      await mondoCol.updateOne({}, { $addToSet: { tags: 'first' } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.tags).toEqual(['first'])
      expect(mondoDoc?.tags).toEqual(['first'])
    })
  })
})
