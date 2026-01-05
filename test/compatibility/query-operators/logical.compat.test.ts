import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'

describe('Logical Query Operators Compatibility', () => {
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
    const dbName = `test_logical_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mondodo.database(dbName).collection('items')

    const docs = [
      { name: 'A', x: 1, y: 10, active: true },
      { name: 'B', x: 2, y: 20, active: true },
      { name: 'C', x: 3, y: 30, active: false },
      { name: 'D', x: 4, y: 40, active: false },
      { name: 'E', x: 5, y: 50, active: true },
    ]

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol }
  }

  describe('$and', () => {
    it('explicit $and with multiple conditions', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        $and: [{ active: true }, { x: { $gt: 1 } }]
      }).sort({ x: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $and: [{ active: true }, { x: { $gt: 1 } }]
      }).sort({ x: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['B', 'E'])
      expect(mondoDocs.map(d => d.name)).toEqual(['B', 'E'])
    })

    it('implicit $and (multiple fields in filter)', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ active: true, x: { $gt: 1 } }).sort({ x: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ active: true, x: { $gt: 1 } }).sort({ x: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
    })

    it('$and with same field multiple times', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        $and: [{ x: { $gt: 1 } }, { x: { $lt: 5 } }]
      }).sort({ x: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $and: [{ x: { $gt: 1 } }, { x: { $lt: 5 } }]
      }).sort({ x: 1 }).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.x)).toEqual([2, 3, 4])
      expect(mondoDocs.map(d => d.x)).toEqual([2, 3, 4])
    })
  })

  describe('$or', () => {
    it('matches any condition', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        $or: [{ x: 1 }, { x: 5 }]
      }).sort({ x: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $or: [{ x: 1 }, { x: 5 }]
      }).sort({ x: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['A', 'E'])
      expect(mondoDocs.map(d => d.name)).toEqual(['A', 'E'])
    })

    it('$or with overlapping matches (no duplicates)', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        $or: [{ active: true }, { x: { $lte: 2 } }]
      }).sort({ x: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $or: [{ active: true }, { x: { $lte: 2 } }]
      }).sort({ x: 1 }).toArray()

      // A, B match both conditions - should only appear once
      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
    })

    it('$or with complex nested conditions', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        $or: [
          { $and: [{ active: true }, { x: 1 }] },
          { $and: [{ active: false }, { x: 4 }] }
        ]
      }).sort({ x: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $or: [
          { $and: [{ active: true }, { x: 1 }] },
          { $and: [{ active: false }, { x: 4 }] }
        ]
      }).sort({ x: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['A', 'D'])
      expect(mondoDocs.map(d => d.name)).toEqual(['A', 'D'])
    })
  })

  describe('$nor', () => {
    it('excludes all matching conditions', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        $nor: [{ active: true }, { x: 3 }]
      }).sort({ x: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $nor: [{ active: true }, { x: 3 }]
      }).sort({ x: 1 }).toArray()

      // Excludes: A (active), B (active), C (x=3), E (active)
      // Includes: D (not active, x=4)
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('D')
      expect(mondoDocs[0]?.name).toBe('D')
    })
  })

  describe('$not', () => {
    it('$not with comparison operator', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        x: { $not: { $gt: 3 } }
      }).sort({ x: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        x: { $not: { $gt: 3 } }
      }).sort({ x: 1 }).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.x)).toEqual([1, 2, 3])
      expect(mondoDocs.map(d => d.x)).toEqual([1, 2, 3])
    })

    it('$not with $in', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        x: { $not: { $in: [1, 2, 3] } }
      }).sort({ x: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        x: { $not: { $in: [1, 2, 3] } }
      }).sort({ x: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.x)).toEqual([4, 5])
      expect(mondoDocs.map(d => d.x)).toEqual([4, 5])
    })
  })

  describe('combined logical operators', () => {
    it('$and with nested $or', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        $and: [
          { $or: [{ x: 1 }, { x: 2 }] },
          { active: true }
        ]
      }).sort({ x: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $and: [
          { $or: [{ x: 1 }, { x: 2 }] },
          { active: true }
        ]
      }).sort({ x: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['A', 'B'])
      expect(mondoDocs.map(d => d.name)).toEqual(['A', 'B'])
    })
  })
})
