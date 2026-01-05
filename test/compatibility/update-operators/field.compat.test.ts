import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'

describe('Field Update Operators Compatibility', () => {
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
    const dbName = `test_field_ops_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    await mongoCol.insertOne({ name: 'test', count: 10, status: 'active' })
    await mondoCol.insertOne({ name: 'test', count: 10, status: 'active' })

    return { mongoCol, mondoCol }
  }

  describe('$set', () => {
    it('updates existing field', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $set: { count: 99 } })
      await mondoCol.updateOne({}, { $set: { count: 99 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.count).toBe(99)
      expect(mondoDoc?.count).toBe(99)
    })

    it('creates new field', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $set: { newField: 'hello' } })
      await mondoCol.updateOne({}, { $set: { newField: 'hello' } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.newField).toBe('hello')
      expect(mondoDoc?.newField).toBe('hello')
    })

    it('sets nested field (creates intermediates)', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $set: { 'a.b.c': 123 } })
      await mondoCol.updateOne({}, { $set: { 'a.b.c': 123 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.a?.b?.c).toBe(123)
      expect(mondoDoc?.a?.b?.c).toBe(123)
    })

    it('sets to null', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $set: { status: null } })
      await mondoCol.updateOne({}, { $set: { status: null } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.status).toBeNull()
      expect(mondoDoc?.status).toBeNull()
    })
  })

  describe('$unset', () => {
    it('removes existing field', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $unset: { status: '' } })
      await mondoCol.updateOne({}, { $unset: { status: '' } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.status).toBeUndefined()
      expect(mondoDoc?.status).toBeUndefined()
      expect('status' in (mongoDoc || {})).toBe(false)
      expect('status' in (mondoDoc || {})).toBe(false)
    })

    it('ignores non-existent field (no error)', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Should not throw
      await mongoCol.updateOne({}, { $unset: { nonexistent: '' } })
      await mondoCol.updateOne({}, { $unset: { nonexistent: '' } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      // Original fields still there
      expect(mongoDoc?.name).toBe('test')
      expect(mondoDoc?.name).toBe('test')
    })
  })

  describe('$inc', () => {
    it('increments existing number', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $inc: { count: 5 } })
      await mondoCol.updateOne({}, { $inc: { count: 5 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.count).toBe(15)
      expect(mondoDoc?.count).toBe(15)
    })

    it('creates field if not exists (with increment value)', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $inc: { newCount: 7 } })
      await mondoCol.updateOne({}, { $inc: { newCount: 7 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.newCount).toBe(7)
      expect(mondoDoc?.newCount).toBe(7)
    })

    it('negative increment (decrement)', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $inc: { count: -3 } })
      await mondoCol.updateOne({}, { $inc: { count: -3 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.count).toBe(7)
      expect(mondoDoc?.count).toBe(7)
    })
  })

  describe('$mul', () => {
    it('multiplies existing number', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $mul: { count: 3 } })
      await mondoCol.updateOne({}, { $mul: { count: 3 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.count).toBe(30)
      expect(mondoDoc?.count).toBe(30)
    })

    it('multiplies non-existent field (creates as 0)', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $mul: { newNum: 5 } })
      await mondoCol.updateOne({}, { $mul: { newNum: 5 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.newNum).toBe(0)
      expect(mondoDoc?.newNum).toBe(0)
    })
  })

  describe('$min', () => {
    it('updates if new value is less', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $min: { count: 5 } })
      await mondoCol.updateOne({}, { $min: { count: 5 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.count).toBe(5)
      expect(mondoDoc?.count).toBe(5)
    })

    it('does not update if new value is greater', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $min: { count: 20 } })
      await mondoCol.updateOne({}, { $min: { count: 20 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.count).toBe(10) // unchanged
      expect(mondoDoc?.count).toBe(10)
    })
  })

  describe('$max', () => {
    it('updates if new value is greater', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $max: { count: 20 } })
      await mondoCol.updateOne({}, { $max: { count: 20 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.count).toBe(20)
      expect(mondoDoc?.count).toBe(20)
    })

    it('does not update if new value is less', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $max: { count: 5 } })
      await mondoCol.updateOne({}, { $max: { count: 5 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.count).toBe(10) // unchanged
      expect(mondoDoc?.count).toBe(10)
    })
  })

  describe('$rename', () => {
    it('renames existing field', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      await mongoCol.updateOne({}, { $rename: { status: 'state' } })
      await mondoCol.updateOne({}, { $rename: { status: 'state' } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.status).toBeUndefined()
      expect(mondoDoc?.status).toBeUndefined()
      expect(mongoDoc?.state).toBe('active')
      expect(mondoDoc?.state).toBe('active')
    })
  })
})
