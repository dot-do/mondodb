import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'
import { ObjectId } from '../../../src/types/objectid'

describe('Comparison Query Operators Compatibility', () => {
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
    const dbName = `test_comparison_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mondodo.database(dbName).collection('items')

    const docs = [
      { name: 'A', value: 10, status: 'active' },
      { name: 'B', value: 20, status: 'active' },
      { name: 'C', value: 30, status: 'inactive' },
      { name: 'D', value: 40, status: null },
      { name: 'E', value: 50 }, // no status field
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  describe('$eq', () => {
    it('explicit $eq matches value', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $eq: 20 } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $eq: 20 } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('B')
      expect(mondoDocs[0]?.name).toBe('B')
    })

    it('implicit equality works same as $eq', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: 20 }).toArray()
      const mondoDocs = await mondoCol.find({ value: 20 }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
    })

    it('$eq with null matches null values', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ status: { $eq: null } }).toArray()
      const mondoDocs = await mondoCol.find({ status: { $eq: null } }).toArray()

      // Should match doc with status: null AND docs without status field
      expect(mongoDocs.length).toBeGreaterThanOrEqual(1)
      expect(mondoDocs.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('$ne', () => {
    it('$ne excludes matching values', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ status: { $ne: 'active' } }).toArray()
      const mondoDocs = await mondoCol.find({ status: { $ne: 'active' } }).toArray()

      // Should include inactive, null, and missing status
      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
    })
  })

  describe('$gt / $gte', () => {
    it('$gt finds greater values', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $gt: 30 } }).sort({ value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $gt: 30 } }).sort({ value: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.value)).toEqual([40, 50])
      expect(mondoDocs.map(d => d.value)).toEqual([40, 50])
    })

    it('$gte includes boundary', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $gte: 30 } }).sort({ value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $gte: 30 } }).sort({ value: 1 }).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.value)).toEqual([30, 40, 50])
      expect(mondoDocs.map(d => d.value)).toEqual([30, 40, 50])
    })
  })

  describe('$lt / $lte', () => {
    it('$lt finds lesser values', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $lt: 30 } }).sort({ value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $lt: 30 } }).sort({ value: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.value)).toEqual([10, 20])
      expect(mondoDocs.map(d => d.value)).toEqual([10, 20])
    })

    it('$lte includes boundary', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $lte: 30 } }).sort({ value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $lte: 30 } }).sort({ value: 1 }).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
    })
  })

  describe('$in', () => {
    it('matches any value in array', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $in: [10, 30, 50] } }).sort({ value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $in: [10, 30, 50] } }).sort({ value: 1 }).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.value)).toEqual([10, 30, 50])
      expect(mondoDocs.map(d => d.value)).toEqual([10, 30, 50])
    })

    it('empty $in array returns no matches', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $in: [] } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $in: [] } }).toArray()

      expect(mongoDocs.length).toBe(0)
      expect(mondoDocs.length).toBe(0)
    })

    it('$in with strings', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ status: { $in: ['active', 'pending'] } }).toArray()
      const mondoDocs = await mondoCol.find({ status: { $in: ['active', 'pending'] } }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
    })
  })

  describe('$nin', () => {
    it('excludes values in array', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $nin: [10, 20] } }).sort({ value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $nin: [10, 20] } }).sort({ value: 1 }).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.value)).toEqual([30, 40, 50])
      expect(mondoDocs.map(d => d.value)).toEqual([30, 40, 50])
    })

    it('empty $nin returns all documents', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $nin: [] } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $nin: [] } }).toArray()

      expect(mongoDocs.length).toBe(5)
      expect(mondoDocs.length).toBe(5)
    })
  })

  describe('combined comparisons', () => {
    it('range query with $gt and $lt', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ value: { $gt: 15, $lt: 45 } }).sort({ value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $gt: 15, $lt: 45 } }).sort({ value: 1 }).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.value)).toEqual([20, 30, 40])
      expect(mondoDocs.map(d => d.value)).toEqual([20, 30, 40])
    })
  })
})
