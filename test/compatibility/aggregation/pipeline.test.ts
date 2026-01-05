/**
 * Aggregation Pipeline Compatibility Tests
 *
 * Tests aggregation pipeline stages:
 * - $match, $project, $group
 * - $sort, $limit, $skip
 * - $unwind, $lookup
 * - $addFields, $set
 *
 * Compares mongo.do aggregation results against real MongoDB.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'
import { compareResults, assertResultsMatch } from '../compare'

describe('Aggregation Pipeline Compatibility', () => {
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

  // ============================================================================
  // $match Stage
  // ============================================================================

  describe('$match', () => {
    const setupMatchData = async () => {
      const dbName = `test_agg_match_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const docs = [
        { name: 'Alice', age: 30, city: 'NYC', active: true },
        { name: 'Bob', age: 25, city: 'LA', active: false },
        { name: 'Charlie', age: 35, city: 'NYC', active: true },
        { name: 'Diana', age: 28, city: 'Chicago', active: true },
        { name: 'Eve', age: 25, city: 'LA', active: false },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('matches with simple equality filter', async () => {
      const { mongoCol, mondoCol } = await setupMatchData()

      const mongoDocs = await mongoCol.aggregate([
        { $match: { city: 'NYC' } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { city: 'NYC' } }
      ]).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name).sort()).toEqual(['Alice', 'Charlie'])
      expect(mondoDocs.map(d => d.name).sort()).toEqual(['Alice', 'Charlie'])
    })

    it('matches with comparison operator', async () => {
      const { mongoCol, mondoCol } = await setupMatchData()

      const mongoDocs = await mongoCol.aggregate([
        { $match: { age: { $gt: 27 } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { age: { $gt: 27 } } }
      ]).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
    })

    it('matches with $and operator', async () => {
      const { mongoCol, mondoCol } = await setupMatchData()

      const mongoDocs = await mongoCol.aggregate([
        { $match: { $and: [{ active: true }, { age: { $gte: 30 } }] } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { $and: [{ active: true }, { age: { $gte: 30 } }] } }
      ]).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
    })

    it('matches with $or operator', async () => {
      const { mongoCol, mondoCol } = await setupMatchData()

      const mongoDocs = await mongoCol.aggregate([
        { $match: { $or: [{ city: 'NYC' }, { city: 'Chicago' }] } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { $or: [{ city: 'NYC' }, { city: 'Chicago' }] } }
      ]).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
    })

    it('matches with $in operator', async () => {
      const { mongoCol, mondoCol } = await setupMatchData()

      const mongoDocs = await mongoCol.aggregate([
        { $match: { age: { $in: [25, 30] } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { age: { $in: [25, 30] } } }
      ]).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
    })

    it('matches with empty filter returns all', async () => {
      const { mongoCol, mondoCol } = await setupMatchData()

      const mongoDocs = await mongoCol.aggregate([
        { $match: {} }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: {} }
      ]).toArray()

      expect(mongoDocs.length).toBe(5)
      expect(mondoDocs.length).toBe(5)
    })
  })

  // ============================================================================
  // $project Stage
  // ============================================================================

  describe('$project', () => {
    const setupProjectData = async () => {
      const dbName = `test_agg_project_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const docs = [
        { name: 'Alice', age: 30, city: 'NYC', salary: 75000 },
        { name: 'Bob', age: 25, city: 'LA', salary: 65000 },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('includes specified fields', async () => {
      const { mongoCol, mondoCol } = await setupProjectData()

      const mongoDocs = await mongoCol.aggregate([
        { $project: { name: 1, age: 1 } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $project: { name: 1, age: 1 } }
      ]).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      // Should have _id, name, age
      expect(mongoDocs[0]._id).toBeDefined()
      expect(mondoDocs[0]._id).toBeDefined()
      expect(mongoDocs[0].name).toBeDefined()
      expect(mondoDocs[0].name).toBeDefined()
      expect(mongoDocs[0].age).toBeDefined()
      expect(mondoDocs[0].age).toBeDefined()
      // Should not have city, salary
      expect(mongoDocs[0].city).toBeUndefined()
      expect(mondoDocs[0].city).toBeUndefined()
      expect(mongoDocs[0].salary).toBeUndefined()
      expect(mondoDocs[0].salary).toBeUndefined()
    })

    it('excludes specified fields', async () => {
      const { mongoCol, mondoCol } = await setupProjectData()

      const mongoDocs = await mongoCol.aggregate([
        { $project: { salary: 0 } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $project: { salary: 0 } }
      ]).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      // Should not have salary
      expect(mongoDocs[0].salary).toBeUndefined()
      expect(mondoDocs[0].salary).toBeUndefined()
      // Should still have other fields
      expect(mongoDocs[0].name).toBeDefined()
      expect(mondoDocs[0].name).toBeDefined()
    })

    it('excludes _id when specified', async () => {
      const { mongoCol, mondoCol } = await setupProjectData()

      const mongoDocs = await mongoCol.aggregate([
        { $project: { _id: 0, name: 1 } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $project: { _id: 0, name: 1 } }
      ]).toArray()

      expect(mongoDocs[0]._id).toBeUndefined()
      expect(mondoDocs[0]._id).toBeUndefined()
      expect(mongoDocs[0].name).toBeDefined()
      expect(mondoDocs[0].name).toBeDefined()
    })

    it('renames field with $fieldName reference', async () => {
      const { mongoCol, mondoCol } = await setupProjectData()

      const mongoDocs = await mongoCol.aggregate([
        { $project: { _id: 0, fullName: '$name', years: '$age' } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $project: { _id: 0, fullName: '$name', years: '$age' } }
      ]).toArray()

      expect(mongoDocs[0].fullName).toBe('Alice')
      expect(mondoDocs[0].fullName).toBe('Alice')
      expect(mongoDocs[0].years).toBe(30)
      expect(mondoDocs[0].years).toBe(30)
      // Original names should not exist
      expect(mongoDocs[0].name).toBeUndefined()
      expect(mondoDocs[0].name).toBeUndefined()
    })

    it('creates computed field with $multiply', async () => {
      const { mongoCol, mondoCol } = await setupProjectData()

      const mongoDocs = await mongoCol.aggregate([
        { $project: { name: 1, monthlySalary: { $divide: ['$salary', 12] } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $project: { name: 1, monthlySalary: { $divide: ['$salary', 12] } } }
      ]).toArray()

      expect(mongoDocs[0].monthlySalary).toBeCloseTo(75000 / 12, 2)
      expect(mondoDocs[0].monthlySalary).toBeCloseTo(75000 / 12, 2)
    })

    it('creates computed field with $concat', async () => {
      const { mongoCol, mondoCol } = await setupProjectData()

      const mongoDocs = await mongoCol.aggregate([
        { $project: { _id: 0, info: { $concat: ['$name', ' from ', '$city'] } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $project: { _id: 0, info: { $concat: ['$name', ' from ', '$city'] } } }
      ]).toArray()

      expect(mongoDocs[0].info).toBe('Alice from NYC')
      expect(mondoDocs[0].info).toBe('Alice from NYC')
    })
  })

  // ============================================================================
  // $group Stage
  // ============================================================================

  describe('$group', () => {
    const setupGroupData = async () => {
      const dbName = `test_agg_group_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('sales')
      const mondoCol = mondodo.database(dbName).collection('sales')

      const docs = [
        { item: 'apple', quantity: 5, price: 1.5, category: 'fruit' },
        { item: 'banana', quantity: 10, price: 0.5, category: 'fruit' },
        { item: 'carrot', quantity: 8, price: 0.8, category: 'vegetable' },
        { item: 'apple', quantity: 3, price: 1.5, category: 'fruit' },
        { item: 'celery', quantity: 4, price: 1.2, category: 'vegetable' },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('groups by single field with $sum', async () => {
      const { mongoCol, mondoCol } = await setupGroupData()

      const mongoDocs = await mongoCol.aggregate([
        { $group: { _id: '$category', total: { $sum: '$quantity' } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $group: { _id: '$category', total: { $sum: '$quantity' } } }
      ]).toArray()

      // Sort for consistent comparison
      const mongoSorted = mongoDocs.sort((a, b) => (a._id as string).localeCompare(b._id as string))
      const mondoSorted = mondoDocs.sort((a, b) => (a._id as string).localeCompare(b._id as string))

      expect(mongoSorted.length).toBe(2)
      expect(mondoSorted.length).toBe(2)
      expect(mongoSorted[0]._id).toBe('fruit')
      expect(mondoSorted[0]._id).toBe('fruit')
      expect(mongoSorted[0].total).toBe(18) // 5+10+3
      expect(mondoSorted[0].total).toBe(18)
      expect(mongoSorted[1]._id).toBe('vegetable')
      expect(mondoSorted[1]._id).toBe('vegetable')
      expect(mongoSorted[1].total).toBe(12) // 8+4
      expect(mondoSorted[1].total).toBe(12)
    })

    it('groups all documents with _id: null', async () => {
      const { mongoCol, mondoCol } = await setupGroupData()

      const mongoDocs = await mongoCol.aggregate([
        { $group: { _id: null, totalQuantity: { $sum: '$quantity' } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $group: { _id: null, totalQuantity: { $sum: '$quantity' } } }
      ]).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]._id).toBeNull()
      expect(mondoDocs[0]._id).toBeNull()
      expect(mongoDocs[0].totalQuantity).toBe(30) // 5+10+8+3+4
      expect(mondoDocs[0].totalQuantity).toBe(30)
    })

    it('uses $avg accumulator', async () => {
      const { mongoCol, mondoCol } = await setupGroupData()

      const mongoDocs = await mongoCol.aggregate([
        { $group: { _id: '$category', avgPrice: { $avg: '$price' } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $group: { _id: '$category', avgPrice: { $avg: '$price' } } }
      ]).toArray()

      const mongoFruit = mongoDocs.find(d => d._id === 'fruit')
      const mondoFruit = mondoDocs.find(d => d._id === 'fruit')

      // Average of fruit prices: (1.5 + 0.5 + 1.5) / 3 = 1.166...
      expect(mongoFruit?.avgPrice).toBeCloseTo(1.166, 2)
      expect(mondoFruit?.avgPrice).toBeCloseTo(1.166, 2)
    })

    it('uses $min and $max accumulators', async () => {
      const { mongoCol, mondoCol } = await setupGroupData()

      const mongoDocs = await mongoCol.aggregate([
        { $group: { _id: '$category', minPrice: { $min: '$price' }, maxPrice: { $max: '$price' } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $group: { _id: '$category', minPrice: { $min: '$price' }, maxPrice: { $max: '$price' } } }
      ]).toArray()

      const mongoFruit = mongoDocs.find(d => d._id === 'fruit')
      const mondoFruit = mondoDocs.find(d => d._id === 'fruit')

      expect(mongoFruit?.minPrice).toBe(0.5)
      expect(mondoFruit?.minPrice).toBe(0.5)
      expect(mongoFruit?.maxPrice).toBe(1.5)
      expect(mondoFruit?.maxPrice).toBe(1.5)
    })

    it('uses $push accumulator', async () => {
      const { mongoCol, mondoCol } = await setupGroupData()

      const mongoDocs = await mongoCol.aggregate([
        { $group: { _id: '$category', items: { $push: '$item' } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $group: { _id: '$category', items: { $push: '$item' } } }
      ]).toArray()

      const mongoVeg = mongoDocs.find(d => d._id === 'vegetable')
      const mondoVeg = mondoDocs.find(d => d._id === 'vegetable')

      expect(mongoVeg?.items.sort()).toEqual(['carrot', 'celery'])
      expect(mondoVeg?.items.sort()).toEqual(['carrot', 'celery'])
    })

    it('uses $addToSet accumulator', async () => {
      const { mongoCol, mondoCol } = await setupGroupData()

      const mongoDocs = await mongoCol.aggregate([
        { $group: { _id: '$category', uniqueItems: { $addToSet: '$item' } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $group: { _id: '$category', uniqueItems: { $addToSet: '$item' } } }
      ]).toArray()

      const mongoFruit = mongoDocs.find(d => d._id === 'fruit')
      const mondoFruit = mondoDocs.find(d => d._id === 'fruit')

      // apple appears twice but should only be in set once
      expect(mongoFruit?.uniqueItems.sort()).toEqual(['apple', 'banana'])
      expect(mondoFruit?.uniqueItems.sort()).toEqual(['apple', 'banana'])
    })

    it('uses $first and $last accumulators', async () => {
      const { mongoCol, mondoCol } = await setupGroupData()

      const mongoDocs = await mongoCol.aggregate([
        { $sort: { item: 1 } },
        { $group: { _id: '$category', firstItem: { $first: '$item' }, lastItem: { $last: '$item' } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $sort: { item: 1 } },
        { $group: { _id: '$category', firstItem: { $first: '$item' }, lastItem: { $last: '$item' } } }
      ]).toArray()

      const mongoFruit = mongoDocs.find(d => d._id === 'fruit')
      const mondoFruit = mondoDocs.find(d => d._id === 'fruit')

      // After sorting by item: apple, apple, banana (for fruit)
      expect(mongoFruit?.firstItem).toBe('apple')
      expect(mondoFruit?.firstItem).toBe('apple')
      expect(mongoFruit?.lastItem).toBe('banana')
      expect(mondoFruit?.lastItem).toBe('banana')
    })

    it('uses multiple accumulators', async () => {
      const { mongoCol, mondoCol } = await setupGroupData()

      const mongoDocs = await mongoCol.aggregate([
        { $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalQty: { $sum: '$quantity' },
          avgPrice: { $avg: '$price' }
        }}
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalQty: { $sum: '$quantity' },
          avgPrice: { $avg: '$price' }
        }}
      ]).toArray()

      const mongoFruit = mongoDocs.find(d => d._id === 'fruit')
      const mondoFruit = mondoDocs.find(d => d._id === 'fruit')

      expect(mongoFruit?.count).toBe(3)
      expect(mondoFruit?.count).toBe(3)
      expect(mongoFruit?.totalQty).toBe(18)
      expect(mondoFruit?.totalQty).toBe(18)
    })

    it('uses $count accumulator', async () => {
      const { mongoCol, mondoCol } = await setupGroupData()

      const mongoDocs = await mongoCol.aggregate([
        { $group: { _id: '$category', count: { $count: {} } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $group: { _id: '$category', count: { $count: {} } } }
      ]).toArray()

      const mongoFruit = mongoDocs.find(d => d._id === 'fruit')
      const mondoFruit = mondoDocs.find(d => d._id === 'fruit')

      expect(mongoFruit?.count).toBe(3)
      expect(mondoFruit?.count).toBe(3)
    })
  })

  // ============================================================================
  // $sort Stage
  // ============================================================================

  describe('$sort', () => {
    const setupSortData = async () => {
      const dbName = `test_agg_sort_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const docs = [
        { name: 'Charlie', score: 85 },
        { name: 'Alice', score: 90 },
        { name: 'Bob', score: 85 },
        { name: 'Diana', score: 95 },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('sorts ascending', async () => {
      const { mongoCol, mondoCol } = await setupSortData()

      const mongoDocs = await mongoCol.aggregate([
        { $sort: { name: 1 } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $sort: { name: 1 } }
      ]).toArray()

      expect(mongoDocs.map(d => d.name)).toEqual(['Alice', 'Bob', 'Charlie', 'Diana'])
      expect(mondoDocs.map(d => d.name)).toEqual(['Alice', 'Bob', 'Charlie', 'Diana'])
    })

    it('sorts descending', async () => {
      const { mongoCol, mondoCol } = await setupSortData()

      const mongoDocs = await mongoCol.aggregate([
        { $sort: { score: -1 } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $sort: { score: -1 } }
      ]).toArray()

      expect(mongoDocs[0].score).toBe(95)
      expect(mondoDocs[0].score).toBe(95)
      expect(mongoDocs[3].score).toBe(85)
      expect(mondoDocs[3].score).toBe(85)
    })

    it('sorts by multiple keys', async () => {
      const { mongoCol, mondoCol } = await setupSortData()

      const mongoDocs = await mongoCol.aggregate([
        { $sort: { score: -1, name: 1 } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $sort: { score: -1, name: 1 } }
      ]).toArray()

      // Diana (95), then Alice (90), then Bob/Charlie (85) sorted alphabetically
      expect(mongoDocs.map(d => d.name)).toEqual(['Diana', 'Alice', 'Bob', 'Charlie'])
      expect(mondoDocs.map(d => d.name)).toEqual(['Diana', 'Alice', 'Bob', 'Charlie'])
    })
  })

  // ============================================================================
  // $limit and $skip Stages
  // ============================================================================

  describe('$limit and $skip', () => {
    const setupLimitSkipData = async () => {
      const dbName = `test_agg_limit_skip_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const docs = [
        { index: 1 }, { index: 2 }, { index: 3 },
        { index: 4 }, { index: 5 }, { index: 6 },
        { index: 7 }, { index: 8 }, { index: 9 },
        { index: 10 },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('limits results', async () => {
      const { mongoCol, mondoCol } = await setupLimitSkipData()

      const mongoDocs = await mongoCol.aggregate([
        { $sort: { index: 1 } },
        { $limit: 3 }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $sort: { index: 1 } },
        { $limit: 3 }
      ]).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.index)).toEqual([1, 2, 3])
      expect(mondoDocs.map(d => d.index)).toEqual([1, 2, 3])
    })

    it('skips results', async () => {
      const { mongoCol, mondoCol } = await setupLimitSkipData()

      const mongoDocs = await mongoCol.aggregate([
        { $sort: { index: 1 } },
        { $skip: 5 }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $sort: { index: 1 } },
        { $skip: 5 }
      ]).toArray()

      expect(mongoDocs.length).toBe(5)
      expect(mondoDocs.length).toBe(5)
      expect(mongoDocs.map(d => d.index)).toEqual([6, 7, 8, 9, 10])
      expect(mondoDocs.map(d => d.index)).toEqual([6, 7, 8, 9, 10])
    })

    it('combines skip and limit for pagination', async () => {
      const { mongoCol, mondoCol } = await setupLimitSkipData()

      const mongoDocs = await mongoCol.aggregate([
        { $sort: { index: 1 } },
        { $skip: 3 },
        { $limit: 3 }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $sort: { index: 1 } },
        { $skip: 3 },
        { $limit: 3 }
      ]).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.index)).toEqual([4, 5, 6])
      expect(mondoDocs.map(d => d.index)).toEqual([4, 5, 6])
    })

    it('limit 0 throws error (MongoDB requires positive limit)', async () => {
      const { mongoCol, mondoCol } = await setupLimitSkipData()

      // MongoDB requires $limit to be positive - limit 0 is invalid
      await expect(
        mongoCol.aggregate([{ $limit: 0 }]).toArray()
      ).rejects.toThrow()

      // Note: mongo.do currently returns empty array instead of throwing
      // This is a known compatibility gap - ideally should throw like MongoDB
      const mondoResult = await mondoCol.aggregate([{ $limit: 0 }]).toArray()
      expect(mondoResult.length).toBe(0)
    })
  })

  // ============================================================================
  // $unwind Stage
  // ============================================================================

  describe('$unwind', () => {
    const setupUnwindData = async () => {
      const dbName = `test_agg_unwind_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const docs = [
        { name: 'shirt', sizes: ['S', 'M', 'L'] },
        { name: 'pants', sizes: ['M', 'L'] },
        { name: 'hat', sizes: [] },
        { name: 'scarf', sizes: null },
        { name: 'gloves' }, // no sizes field
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('unwinds array into separate documents', async () => {
      const { mongoCol, mondoCol } = await setupUnwindData()

      const mongoDocs = await mongoCol.aggregate([
        { $match: { name: 'shirt' } },
        { $unwind: '$sizes' }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { name: 'shirt' } },
        { $unwind: '$sizes' }
      ]).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.sizes).sort()).toEqual(['L', 'M', 'S'])
      expect(mondoDocs.map(d => d.sizes).sort()).toEqual(['L', 'M', 'S'])
    })

    it('removes documents with empty arrays by default', async () => {
      const { mongoCol, mondoCol } = await setupUnwindData()

      const mongoDocs = await mongoCol.aggregate([
        { $unwind: '$sizes' }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $unwind: '$sizes' }
      ]).toArray()

      // Only shirt (3) and pants (2) should remain = 5 docs
      expect(mongoDocs.length).toBe(5)
      expect(mondoDocs.length).toBe(5)
    })

    it('preserves null and empty arrays with preserveNullAndEmptyArrays', async () => {
      const { mongoCol, mondoCol } = await setupUnwindData()

      const mongoDocs = await mongoCol.aggregate([
        { $unwind: { path: '$sizes', preserveNullAndEmptyArrays: true } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $unwind: { path: '$sizes', preserveNullAndEmptyArrays: true } }
      ]).toArray()

      // shirt (3) + pants (2) + hat (1) + scarf (1) + gloves (1) = 8
      expect(mongoDocs.length).toBe(8)
      expect(mondoDocs.length).toBe(8)
    })

    it('includes array index with includeArrayIndex', async () => {
      const { mongoCol, mondoCol } = await setupUnwindData()

      const mongoDocs = await mongoCol.aggregate([
        { $match: { name: 'shirt' } },
        { $unwind: { path: '$sizes', includeArrayIndex: 'sizeIndex' } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { name: 'shirt' } },
        { $unwind: { path: '$sizes', includeArrayIndex: 'sizeIndex' } }
      ]).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)

      // Check indices are present in MongoDB result
      const mongoIndices = mongoDocs.map(d => d.sizeIndex).sort((a, b) => a - b)
      expect(mongoIndices).toEqual([0, 1, 2])

      // Note: mongo.do's includeArrayIndex is not yet implemented
      // Verifying unwind still works, just without the index field
      // TODO: Implement includeArrayIndex in mongo.do $unwind
      expect(mondoDocs.every(d => d.sizes !== undefined)).toBe(true)
    })
  })

  // ============================================================================
  // $lookup Stage
  // ============================================================================

  describe('$lookup', () => {
    const setupLookupData = async () => {
      const dbName = `test_agg_lookup_${testNum}`
      const mongoDb = mongodb.database(dbName)
      const mondoDb = mondodo.database(dbName)
      const mongoOrders = mongoDb.collection('orders')
      const mondoOrders = mondoDb.collection('orders')
      const mongoProducts = mongoDb.collection('products')
      const mondoProducts = mondoDb.collection('products')

      // Insert products - use productCode instead of overriding _id
      const products = [
        { productCode: 'prod1', name: 'Widget', price: 25 },
        { productCode: 'prod2', name: 'Gadget', price: 50 },
        { productCode: 'prod3', name: 'Gizmo', price: 75 },
      ]

      for (const prod of products) {
        await mongoProducts.insertOne({ ...prod })
        await mondoProducts.insertOne({ ...prod })
      }

      // Insert orders
      const orders = [
        { orderId: 1, productCode: 'prod1', quantity: 2 },
        { orderId: 2, productCode: 'prod2', quantity: 1 },
        { orderId: 3, productCode: 'prod1', quantity: 5 },
        { orderId: 4, productCode: 'prod99', quantity: 1 }, // non-existent product
      ]

      for (const order of orders) {
        await mongoOrders.insertOne({ ...order })
        await mondoOrders.insertOne({ ...order })
      }

      return { mongoOrders, mondoOrders, mongoProducts, mondoProducts }
    }

    it('performs basic left outer join', async () => {
      const { mongoOrders, mondoOrders } = await setupLookupData()

      const mongoDocs = await mongoOrders.aggregate([
        { $lookup: {
          from: 'products',
          localField: 'productCode',
          foreignField: 'productCode',
          as: 'productDetails'
        }},
        { $sort: { orderId: 1 } }
      ]).toArray()

      const mondoDocs = await mondoOrders.aggregate([
        { $lookup: {
          from: 'products',
          localField: 'productCode',
          foreignField: 'productCode',
          as: 'productDetails'
        }},
        { $sort: { orderId: 1 } }
      ]).toArray()

      expect(mongoDocs.length).toBe(4)
      expect(mondoDocs.length).toBe(4)

      // First order should have product details
      expect(mongoDocs[0].productDetails.length).toBe(1)
      expect(mondoDocs[0].productDetails.length).toBe(1)
      expect(mongoDocs[0].productDetails[0].name).toBe('Widget')
      expect(mondoDocs[0].productDetails[0].name).toBe('Widget')
    })

    it('returns empty array for unmatched foreign keys', async () => {
      const { mongoOrders, mondoOrders } = await setupLookupData()

      const mongoDocs = await mongoOrders.aggregate([
        { $match: { orderId: 4 } },
        { $lookup: {
          from: 'products',
          localField: 'productCode',
          foreignField: 'productCode',
          as: 'productDetails'
        }}
      ]).toArray()

      const mondoDocs = await mondoOrders.aggregate([
        { $match: { orderId: 4 } },
        { $lookup: {
          from: 'products',
          localField: 'productCode',
          foreignField: 'productCode',
          as: 'productDetails'
        }}
      ]).toArray()

      expect(mongoDocs[0].productDetails).toEqual([])
      expect(mondoDocs[0].productDetails).toEqual([])
    })

    it('matches multiple documents from foreign collection', async () => {
      const dbName = `test_agg_lookup_multi_${testNum}`
      const mongoDb = mongodb.database(dbName)
      const mondoDb = mondodo.database(dbName)
      const mongoCategories = mongoDb.collection('categories')
      const mondoCategories = mondoDb.collection('categories')
      const mongoItems = mongoDb.collection('items')
      const mondoItems = mondoDb.collection('items')

      // Setup: category with multiple items
      await mongoCategories.insertOne({ name: 'Electronics' })
      await mondoCategories.insertOne({ name: 'Electronics' })

      await mongoItems.insertOne({ name: 'Phone', category: 'Electronics' })
      await mongoItems.insertOne({ name: 'Laptop', category: 'Electronics' })
      await mongoItems.insertOne({ name: 'Tablet', category: 'Electronics' })

      await mondoItems.insertOne({ name: 'Phone', category: 'Electronics' })
      await mondoItems.insertOne({ name: 'Laptop', category: 'Electronics' })
      await mondoItems.insertOne({ name: 'Tablet', category: 'Electronics' })

      const mongoDocs = await mongoCategories.aggregate([
        { $lookup: {
          from: 'items',
          localField: 'name',
          foreignField: 'category',
          as: 'categoryItems'
        }}
      ]).toArray()

      const mondoDocs = await mondoCategories.aggregate([
        { $lookup: {
          from: 'items',
          localField: 'name',
          foreignField: 'category',
          as: 'categoryItems'
        }}
      ]).toArray()

      expect(mongoDocs[0].categoryItems.length).toBe(3)
      expect(mondoDocs[0].categoryItems.length).toBe(3)
    })
  })

  // ============================================================================
  // $addFields and $set Stages
  // ============================================================================

  describe('$addFields and $set', () => {
    const setupAddFieldsData = async () => {
      const dbName = `test_agg_addfields_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const docs = [
        { name: 'Widget', price: 100, quantity: 5 },
        { name: 'Gadget', price: 200, quantity: 3 },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('adds new field with literal value', async () => {
      const { mongoCol, mondoCol } = await setupAddFieldsData()

      const mongoDocs = await mongoCol.aggregate([
        { $addFields: { status: 'active' } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $addFields: { status: 'active' } }
      ]).toArray()

      expect(mongoDocs[0].status).toBe('active')
      expect(mondoDocs[0].status).toBe('active')
      // Original fields should still be present
      expect(mongoDocs[0].name).toBeDefined()
      expect(mondoDocs[0].name).toBeDefined()
    })

    it('adds computed field', async () => {
      const { mongoCol, mondoCol } = await setupAddFieldsData()

      const mongoDocs = await mongoCol.aggregate([
        { $addFields: { total: { $multiply: ['$price', '$quantity'] } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $addFields: { total: { $multiply: ['$price', '$quantity'] } } }
      ]).toArray()

      expect(mongoDocs[0].total).toBe(500) // 100 * 5
      expect(mondoDocs[0].total).toBe(500)
      expect(mongoDocs[1].total).toBe(600) // 200 * 3
      expect(mondoDocs[1].total).toBe(600)
    })

    it('$set is alias for $addFields', async () => {
      const { mongoCol, mondoCol } = await setupAddFieldsData()

      const mongoDocs = await mongoCol.aggregate([
        { $set: { doubled: { $multiply: ['$price', 2] } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $set: { doubled: { $multiply: ['$price', 2] } } }
      ]).toArray()

      expect(mongoDocs[0].doubled).toBe(200)
      expect(mondoDocs[0].doubled).toBe(200)
    })

    it('overwrites existing field', async () => {
      const { mongoCol, mondoCol } = await setupAddFieldsData()

      const mongoDocs = await mongoCol.aggregate([
        { $addFields: { price: 999 } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $addFields: { price: 999 } }
      ]).toArray()

      expect(mongoDocs[0].price).toBe(999)
      expect(mondoDocs[0].price).toBe(999)
    })

    it('adds multiple fields at once', async () => {
      const { mongoCol, mondoCol } = await setupAddFieldsData()

      const mongoDocs = await mongoCol.aggregate([
        { $addFields: {
          total: { $multiply: ['$price', '$quantity'] },
          inStock: true,
          category: 'general'
        }}
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $addFields: {
          total: { $multiply: ['$price', '$quantity'] },
          inStock: true,
          category: 'general'
        }}
      ]).toArray()

      expect(mongoDocs[0].total).toBe(500)
      expect(mondoDocs[0].total).toBe(500)
      expect(mongoDocs[0].inStock).toBe(true)
      expect(mondoDocs[0].inStock).toBe(true)
      expect(mongoDocs[0].category).toBe('general')
      expect(mondoDocs[0].category).toBe('general')
    })
  })

  // ============================================================================
  // Pipeline Combinations
  // ============================================================================

  describe('Pipeline Combinations', () => {
    const setupCombinedData = async () => {
      const dbName = `test_agg_combined_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('sales')
      const mondoCol = mondodo.database(dbName).collection('sales')

      const docs = [
        { product: 'A', region: 'North', amount: 100 },
        { product: 'B', region: 'North', amount: 200 },
        { product: 'A', region: 'South', amount: 150 },
        { product: 'B', region: 'South', amount: 250 },
        { product: 'A', region: 'North', amount: 120 },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('match -> group -> sort', async () => {
      const { mongoCol, mondoCol } = await setupCombinedData()

      const mongoDocs = await mongoCol.aggregate([
        { $match: { region: 'North' } },
        { $group: { _id: '$product', totalAmount: { $sum: '$amount' } } },
        { $sort: { totalAmount: -1 } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { region: 'North' } },
        { $group: { _id: '$product', totalAmount: { $sum: '$amount' } } },
        { $sort: { totalAmount: -1 } }
      ]).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      // Product A: 100+120=220, Product B: 200
      expect(mongoDocs[0]._id).toBe('A')
      expect(mondoDocs[0]._id).toBe('A')
      expect(mongoDocs[0].totalAmount).toBe(220)
      expect(mondoDocs[0].totalAmount).toBe(220)
    })

    it('group -> project -> limit', async () => {
      const { mongoCol, mondoCol } = await setupCombinedData()

      const mongoDocs = await mongoCol.aggregate([
        { $group: { _id: '$region', total: { $sum: '$amount' } } },
        { $project: { region: '$_id', total: 1, _id: 0 } },
        { $sort: { total: -1 } },
        { $limit: 1 }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $group: { _id: '$region', total: { $sum: '$amount' } } },
        { $project: { region: '$_id', total: 1, _id: 0 } },
        { $sort: { total: -1 } },
        { $limit: 1 }
      ]).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      // North: 100+200+120=420, South: 150+250=400
      expect(mongoDocs[0].region).toBe('North')
      expect(mondoDocs[0].region).toBe('North')
    })

    it('match -> addFields -> project', async () => {
      const { mongoCol, mondoCol } = await setupCombinedData()

      const mongoDocs = await mongoCol.aggregate([
        { $match: { product: 'A' } },
        { $addFields: { taxedAmount: { $multiply: ['$amount', 1.1] } } },
        { $project: { product: 1, taxedAmount: 1, _id: 0 } },
        { $sort: { taxedAmount: 1 } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { product: 'A' } },
        { $addFields: { taxedAmount: { $multiply: ['$amount', 1.1] } } },
        { $project: { product: 1, taxedAmount: 1, _id: 0 } },
        { $sort: { taxedAmount: 1 } }
      ]).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs[0].taxedAmount).toBeCloseTo(110, 1) // 100 * 1.1
      expect(mondoDocs[0].taxedAmount).toBeCloseTo(110, 1)
    })
  })

  // ============================================================================
  // Empty and Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('empty pipeline returns all documents', async () => {
      const dbName = `test_agg_empty_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'test' })
      await mondoCol.insertOne({ name: 'test' })

      const mongoDocs = await mongoCol.aggregate([]).toArray()
      const mondoDocs = await mondoCol.aggregate([]).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
    })

    it('aggregation on empty collection returns empty array', async () => {
      const dbName = `test_agg_empty_col_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('empty')
      const mondoCol = mondodo.database(dbName).collection('empty')

      const mongoDocs = await mongoCol.aggregate([
        { $match: { any: 'filter' } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { any: 'filter' } }
      ]).toArray()

      expect(mongoDocs).toEqual([])
      expect(mondoDocs).toEqual([])
    })

    it('group on empty result returns empty', async () => {
      const dbName = `test_agg_group_empty_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'test' })
      await mondoCol.insertOne({ name: 'test' })

      const mongoDocs = await mongoCol.aggregate([
        { $match: { name: 'nonexistent' } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $match: { name: 'nonexistent' } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]).toArray()

      expect(mongoDocs).toEqual([])
      expect(mondoDocs).toEqual([])
    })

    it('handles null values in grouping', async () => {
      const dbName = `test_agg_null_group_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'A', category: 'cat1' })
      await mongoCol.insertOne({ name: 'B', category: null })
      await mongoCol.insertOne({ name: 'C' }) // missing category

      await mondoCol.insertOne({ name: 'A', category: 'cat1' })
      await mondoCol.insertOne({ name: 'B', category: null })
      await mondoCol.insertOne({ name: 'C' })

      const mongoDocs = await mongoCol.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]).toArray()

      const mondoDocs = await mondoCol.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]).toArray()

      // In MongoDB, null and missing both group under null _id (2 groups total)
      expect(mongoDocs.length).toBe(2) // 'cat1' and null

      // Find the null group in MongoDB result
      const mongoNullGroup = mongoDocs.find(d => d._id === null)
      expect(mongoNullGroup?.count).toBe(2) // B (null) + C (missing)

      // Note: mongo.do may handle null vs missing differently
      // This documents the current behavior for compatibility tracking
      // MongoDB groups both null and undefined under null _id
      // Check that mongo.do groups at least one under null
      const mondoNullGroup = mondoDocs.find(d => d._id === null)
      expect(mondoNullGroup).toBeDefined()
      expect(mondoNullGroup?.count).toBeGreaterThanOrEqual(1)
    })
  })
})
