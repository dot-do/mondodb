import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'

describe('Array Query Operators Compatibility', () => {
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

  describe('$all', () => {
    const setupCollections = async () => {
      const dbName = `test_all_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const docs = [
        { name: 'A', tags: ['red', 'blue', 'green'] },
        { name: 'B', tags: ['red', 'blue'] },
        { name: 'C', tags: ['blue', 'green'] },
        { name: 'D', tags: ['red'] },
        { name: 'E', tags: [] },
        { name: 'F', tags: 'single' }, // non-array
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('$all matches arrays containing all specified elements', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ tags: { $all: ['red', 'blue'] } }).sort({ name: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $all: ['red', 'blue'] } }).sort({ name: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['A', 'B'])
      expect(mondoDocs.map(d => d.name)).toEqual(['A', 'B'])
    })

    it('$all order does not matter', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs1 = await mongoCol.find({ tags: { $all: ['red', 'blue'] } }).sort({ name: 1 }).toArray()
      const mongoDocs2 = await mongoCol.find({ tags: { $all: ['blue', 'red'] } }).sort({ name: 1 }).toArray()
      const mondoDocs1 = await mondoCol.find({ tags: { $all: ['red', 'blue'] } }).sort({ name: 1 }).toArray()
      const mondoDocs2 = await mondoCol.find({ tags: { $all: ['blue', 'red'] } }).sort({ name: 1 }).toArray()

      expect(mongoDocs1.map(d => d.name)).toEqual(mongoDocs2.map(d => d.name))
      expect(mondoDocs1.map(d => d.name)).toEqual(mondoDocs2.map(d => d.name))
      expect(mongoDocs1.map(d => d.name)).toEqual(mondoDocs1.map(d => d.name))
    })

    it('$all with single element', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ tags: { $all: ['green'] } }).sort({ name: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $all: ['green'] } }).sort({ name: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['A', 'C'])
      expect(mondoDocs.map(d => d.name)).toEqual(['A', 'C'])
    })

    it('$all with empty array matches all documents with array field', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ tags: { $all: [] } }).sort({ name: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $all: [] } }).sort({ name: 1 }).toArray()

      // Empty $all should match all arrays (including empty arrays)
      expect(mongoDocs.length).toBe(mondoDocs.length)
    })

    it('$all on non-array field (no match)', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Querying for $all on a scalar string field
      const mongoDocs = await mongoCol.find({ tags: { $all: ['single'] } }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $all: ['single'] } }).toArray()

      // In MongoDB, $all can match scalar if the value equals the single element
      expect(mongoDocs.length).toBe(mondoDocs.length)
    })

    it('$all with three elements', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ tags: { $all: ['red', 'blue', 'green'] } }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $all: ['red', 'blue', 'green'] } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('A')
      expect(mondoDocs[0]?.name).toBe('A')
    })
  })

  describe('$elemMatch', () => {
    describe('array of objects', () => {
      const setupCollections = async () => {
        const dbName = `test_elemmatch_obj_${testNum}`
        const mongoCol = mongodb.database(dbName).collection('items')
        const mondoCol = mongo.do.database(dbName).collection('items')

        const docs = [
          { name: 'A', scores: [{ subject: 'math', score: 90 }, { subject: 'english', score: 85 }] },
          { name: 'B', scores: [{ subject: 'math', score: 70 }, { subject: 'english', score: 95 }] },
          { name: 'C', scores: [{ subject: 'math', score: 80 }, { subject: 'science', score: 88 }] },
          { name: 'D', scores: [{ subject: 'english', score: 60 }] },
          { name: 'E', scores: [] },
        ]

        for (const doc of docs) {
          await mongoCol.insertOne({ ...doc })
          await mondoCol.insertOne({ ...doc })
        }

        return { mongoCol, mondoCol }
      }

      it('$elemMatch finds element matching multiple conditions', async () => {
        const { mongoCol, mondoCol } = await setupCollections()

        const mongoDocs = await mongoCol.find({
          scores: { $elemMatch: { subject: 'math', score: { $gte: 80 } } }
        }).sort({ name: 1 }).toArray()

        const mondoDocs = await mondoCol.find({
          scores: { $elemMatch: { subject: 'math', score: { $gte: 80 } } }
        }).sort({ name: 1 }).toArray()

        expect(mongoDocs.length).toBe(2)
        expect(mondoDocs.length).toBe(2)
        expect(mongoDocs.map(d => d.name)).toEqual(['A', 'C'])
        expect(mondoDocs.map(d => d.name)).toEqual(['A', 'C'])
      })

      it('$elemMatch with comparison operators', async () => {
        const { mongoCol, mondoCol } = await setupCollections()

        const mongoDocs = await mongoCol.find({
          scores: { $elemMatch: { score: { $gte: 85, $lte: 95 } } }
        }).sort({ name: 1 }).toArray()

        const mondoDocs = await mondoCol.find({
          scores: { $elemMatch: { score: { $gte: 85, $lte: 95 } } }
        }).sort({ name: 1 }).toArray()

        // A: 90, 85 - matches
        // B: 70, 95 - matches
        // C: 80, 88 - matches
        expect(mongoDocs.length).toBe(3)
        expect(mondoDocs.length).toBe(3)
        expect(mongoDocs.map(d => d.name)).toEqual(['A', 'B', 'C'])
        expect(mondoDocs.map(d => d.name)).toEqual(['A', 'B', 'C'])
      })

      it('$elemMatch requires same element to match all conditions', async () => {
        const { mongoCol, mondoCol } = await setupCollections()

        // This is the critical test - subject:math AND score >= 90 in SAME element
        const mongoDocs = await mongoCol.find({
          scores: { $elemMatch: { subject: 'math', score: { $gte: 90 } } }
        }).sort({ name: 1 }).toArray()

        const mondoDocs = await mondoCol.find({
          scores: { $elemMatch: { subject: 'math', score: { $gte: 90 } } }
        }).sort({ name: 1 }).toArray()

        // Only A has math score >= 90
        expect(mongoDocs.length).toBe(1)
        expect(mondoDocs.length).toBe(1)
        expect(mongoDocs[0]?.name).toBe('A')
        expect(mondoDocs[0]?.name).toBe('A')
      })
    })

    describe('$elemMatch vs individual conditions - critical difference', () => {
      const setupCollections = async () => {
        const dbName = `test_elemmatch_diff_${testNum}`
        const mongoCol = mongodb.database(dbName).collection('items')
        const mondoCol = mongo.do.database(dbName).collection('items')

        // This document has x:1 in one element, y:2 in another
        const docs = [
          { name: 'split', arr: [{ x: 1 }, { y: 2 }] },
          { name: 'together', arr: [{ x: 1, y: 2 }] },
          { name: 'partial', arr: [{ x: 1, y: 3 }] },
        ]

        for (const doc of docs) {
          await mongoCol.insertOne({ ...doc })
          await mondoCol.insertOne({ ...doc })
        }

        return { mongoCol, mondoCol }
      }

      it('dot notation conditions can match across different elements', async () => {
        const { mongoCol, mondoCol } = await setupCollections()

        // This query allows x:1 in one element, y:2 in another
        const mongoDocs = await mongoCol.find({ 'arr.x': 1, 'arr.y': 2 }).sort({ name: 1 }).toArray()
        const mondoDocs = await mondoCol.find({ 'arr.x': 1, 'arr.y': 2 }).sort({ name: 1 }).toArray()

        // Both 'split' and 'together' match
        expect(mongoDocs.length).toBe(2)
        expect(mondoDocs.length).toBe(2)
        expect(mongoDocs.map(d => d.name)).toEqual(['split', 'together'])
        expect(mondoDocs.map(d => d.name)).toEqual(['split', 'together'])
      })

      it('$elemMatch requires same element to have both properties', async () => {
        const { mongoCol, mondoCol } = await setupCollections()

        // $elemMatch requires SAME element to have both x:1 AND y:2
        const mongoDocs = await mongoCol.find({
          arr: { $elemMatch: { x: 1, y: 2 } }
        }).sort({ name: 1 }).toArray()

        const mondoDocs = await mondoCol.find({
          arr: { $elemMatch: { x: 1, y: 2 } }
        }).sort({ name: 1 }).toArray()

        // Only 'together' matches - 'split' has them in different elements
        expect(mongoDocs.length).toBe(1)
        expect(mondoDocs.length).toBe(1)
        expect(mongoDocs[0]?.name).toBe('together')
        expect(mondoDocs[0]?.name).toBe('together')
      })
    })

    describe('array of primitives', () => {
      const setupCollections = async () => {
        const dbName = `test_elemmatch_prim_${testNum}`
        const mongoCol = mongodb.database(dbName).collection('items')
        const mondoCol = mongo.do.database(dbName).collection('items')

        const docs = [
          { name: 'A', values: [1, 5, 10, 15] },
          { name: 'B', values: [2, 4, 6, 8] },
          { name: 'C', values: [20, 30, 40] },
          { name: 'D', values: [5] },
          { name: 'E', values: [] },
        ]

        for (const doc of docs) {
          await mongoCol.insertOne({ ...doc })
          await mondoCol.insertOne({ ...doc })
        }

        return { mongoCol, mondoCol }
      }

      it('$elemMatch on primitives with range', async () => {
        const { mongoCol, mondoCol } = await setupCollections()

        // Find arrays with at least one element between 5 and 10
        const mongoDocs = await mongoCol.find({
          values: { $elemMatch: { $gte: 5, $lte: 10 } }
        }).sort({ name: 1 }).toArray()

        const mondoDocs = await mondoCol.find({
          values: { $elemMatch: { $gte: 5, $lte: 10 } }
        }).sort({ name: 1 }).toArray()

        expect(mongoDocs.length).toBe(3)
        expect(mondoDocs.length).toBe(3)
        expect(mongoDocs.map(d => d.name)).toEqual(['A', 'B', 'D'])
        expect(mondoDocs.map(d => d.name)).toEqual(['A', 'B', 'D'])
      })

      it('$elemMatch with $gt and $lt', async () => {
        const { mongoCol, mondoCol } = await setupCollections()

        const mongoDocs = await mongoCol.find({
          values: { $elemMatch: { $gt: 10, $lt: 25 } }
        }).sort({ name: 1 }).toArray()

        const mondoDocs = await mondoCol.find({
          values: { $elemMatch: { $gt: 10, $lt: 25 } }
        }).sort({ name: 1 }).toArray()

        // A has 15, C has 20
        expect(mongoDocs.length).toBe(2)
        expect(mondoDocs.length).toBe(2)
        expect(mongoDocs.map(d => d.name)).toEqual(['A', 'C'])
        expect(mondoDocs.map(d => d.name)).toEqual(['A', 'C'])
      })
    })

    describe('$elemMatch with nested fields', () => {
      const setupCollections = async () => {
        const dbName = `test_elemmatch_nested_${testNum}`
        const mongoCol = mongodb.database(dbName).collection('items')
        const mondoCol = mongo.do.database(dbName).collection('items')

        const docs = [
          {
            name: 'A',
            orders: [
              { item: { name: 'apple', price: 1.5 }, qty: 10 },
              { item: { name: 'banana', price: 0.5 }, qty: 20 }
            ]
          },
          {
            name: 'B',
            orders: [
              { item: { name: 'apple', price: 2.0 }, qty: 5 },
              { item: { name: 'orange', price: 1.0 }, qty: 15 }
            ]
          },
        ]

        for (const doc of docs) {
          await mongoCol.insertOne({ ...doc })
          await mondoCol.insertOne({ ...doc })
        }

        return { mongoCol, mondoCol }
      }

      it('$elemMatch with nested dot notation', async () => {
        const { mongoCol, mondoCol } = await setupCollections()

        const mongoDocs = await mongoCol.find({
          orders: { $elemMatch: { 'item.name': 'apple', 'item.price': { $lt: 2 } } }
        }).toArray()

        const mondoDocs = await mondoCol.find({
          orders: { $elemMatch: { 'item.name': 'apple', 'item.price': { $lt: 2 } } }
        }).toArray()

        // A has apple at 1.5, B has apple at 2.0
        expect(mongoDocs.length).toBe(1)
        expect(mondoDocs.length).toBe(1)
        expect(mongoDocs[0]?.name).toBe('A')
        expect(mondoDocs[0]?.name).toBe('A')
      })
    })
  })

  describe('$size', () => {
    const setupCollections = async () => {
      const dbName = `test_size_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const docs = [
        { name: 'A', tags: ['a', 'b', 'c'] },
        { name: 'B', tags: ['a', 'b'] },
        { name: 'C', tags: ['a'] },
        { name: 'D', tags: [] },
        { name: 'E', tags: 'not-array' }, // non-array
        { name: 'F' }, // no tags field
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('$size matches array with exact length', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ tags: { $size: 2 } }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $size: 2 } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('B')
      expect(mondoDocs[0]?.name).toBe('B')
    })

    it('$size:0 matches empty arrays', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ tags: { $size: 0 } }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $size: 0 } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('D')
      expect(mondoDocs[0]?.name).toBe('D')
    })

    it('$size:1 matches single-element arrays', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ tags: { $size: 1 } }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $size: 1 } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('C')
      expect(mondoDocs[0]?.name).toBe('C')
    })

    it('$size:3 matches three-element arrays', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ tags: { $size: 3 } }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $size: 3 } }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('A')
      expect(mondoDocs[0]?.name).toBe('A')
    })

    it('$size on non-array returns no match', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Non-array fields should not match any $size
      const mongoDocs = await mongoCol.find({ tags: { $size: 1 }, name: 'E' }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $size: 1 }, name: 'E' }).toArray()

      expect(mongoDocs.length).toBe(0)
      expect(mondoDocs.length).toBe(0)
    })

    it('$size with no matching documents', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ tags: { $size: 100 } }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $size: 100 } }).toArray()

      expect(mongoDocs.length).toBe(0)
      expect(mondoDocs.length).toBe(0)
    })
  })

  describe('combined array operators', () => {
    const setupCollections = async () => {
      const dbName = `test_array_combined_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const docs = [
        { name: 'A', tags: ['red', 'blue'], values: [1, 2, 3] },
        { name: 'B', tags: ['red', 'green'], values: [4, 5] },
        { name: 'C', tags: ['blue'], values: [6, 7, 8, 9] },
        { name: 'D', tags: ['red', 'blue', 'green'], values: [10] },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('$all combined with $size', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        tags: { $all: ['red', 'blue'], $size: 2 }
      }).toArray()

      const mondoDocs = await mondoCol.find({
        tags: { $all: ['red', 'blue'], $size: 2 }
      }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('A')
      expect(mondoDocs[0]?.name).toBe('A')
    })

    it('array operators with other query conditions', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        tags: { $all: ['red'] },
        values: { $size: 2 }
      }).toArray()

      const mondoDocs = await mondoCol.find({
        tags: { $all: ['red'] },
        values: { $size: 2 }
      }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('B')
      expect(mondoDocs[0]?.name).toBe('B')
    })
  })

  describe('$all with $elemMatch', () => {
    const setupCollections = async () => {
      const dbName = `test_all_elemmatch_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const docs = [
        {
          name: 'A',
          items: [
            { type: 'fruit', name: 'apple' },
            { type: 'vegetable', name: 'carrot' }
          ]
        },
        {
          name: 'B',
          items: [
            { type: 'fruit', name: 'banana' },
            { type: 'fruit', name: 'orange' }
          ]
        },
        {
          name: 'C',
          items: [
            { type: 'vegetable', name: 'carrot' },
            { type: 'vegetable', name: 'broccoli' }
          ]
        },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('$all with $elemMatch for multiple complex conditions', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find documents where items array has both a fruit AND a vegetable
      const mongoDocs = await mongoCol.find({
        items: {
          $all: [
            { $elemMatch: { type: 'fruit' } },
            { $elemMatch: { type: 'vegetable' } }
          ]
        }
      }).toArray()

      const mondoDocs = await mondoCol.find({
        items: {
          $all: [
            { $elemMatch: { type: 'fruit' } },
            { $elemMatch: { type: 'vegetable' } }
          ]
        }
      }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('A')
      expect(mondoDocs[0]?.name).toBe('A')
    })
  })

  describe('edge cases', () => {
    it('querying arrays with $in', async () => {
      const dbName = `test_array_in_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ tags: ['a', 'b', 'c'] })
      await mongoCol.insertOne({ tags: ['d', 'e'] })
      await mongoCol.insertOne({ tags: ['b', 'f'] })

      await mondoCol.insertOne({ tags: ['a', 'b', 'c'] })
      await mondoCol.insertOne({ tags: ['d', 'e'] })
      await mondoCol.insertOne({ tags: ['b', 'f'] })

      // $in on array field - matches if any element is in the list
      const mongoDocs = await mongoCol.find({ tags: { $in: ['a', 'd'] } }).toArray()
      const mondoDocs = await mondoCol.find({ tags: { $in: ['a', 'd'] } }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
    })

    it('querying arrays with direct value (implicit $eq)', async () => {
      const dbName = `test_array_eq_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ tags: ['a', 'b', 'c'] })
      await mongoCol.insertOne({ tags: ['d', 'e'] })

      await mondoCol.insertOne({ tags: ['a', 'b', 'c'] })
      await mondoCol.insertOne({ tags: ['d', 'e'] })

      // Direct equality on array field matches if 'b' is an element
      const mongoDocs = await mongoCol.find({ tags: 'b' }).toArray()
      const mondoDocs = await mondoCol.find({ tags: 'b' }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
    })

    it('$all with nested arrays', async () => {
      const dbName = `test_all_nested_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ matrix: [[1, 2], [3, 4]] })
      await mongoCol.insertOne({ matrix: [[1, 2], [5, 6]] })

      await mondoCol.insertOne({ matrix: [[1, 2], [3, 4]] })
      await mondoCol.insertOne({ matrix: [[1, 2], [5, 6]] })

      // $all with array values
      const mongoDocs = await mongoCol.find({ matrix: { $all: [[1, 2]] } }).toArray()
      const mondoDocs = await mondoCol.find({ matrix: { $all: [[1, 2]] } }).toArray()

      expect(mongoDocs.length).toBe(mondoDocs.length)
    })

    it('empty $elemMatch', async () => {
      const dbName = `test_empty_elemmatch_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ arr: [1, 2, 3] })
      await mongoCol.insertOne({ arr: [] })
      await mongoCol.insertOne({ arr: [{ x: 1 }] })

      await mondoCol.insertOne({ arr: [1, 2, 3] })
      await mondoCol.insertOne({ arr: [] })
      await mondoCol.insertOne({ arr: [{ x: 1 }] })

      // Empty $elemMatch - matches any non-empty array
      const mongoDocs = await mongoCol.find({ arr: { $elemMatch: {} } }).toArray()
      const mondoDocs = await mondoCol.find({ arr: { $elemMatch: {} } }).toArray()

      expect(mongoDocs.length).toBe(mondoDocs.length)
    })
  })
})
