/**
 * Cursor Behavior Compatibility Tests
 *
 * Tests cursor operations to ensure mongo.do matches MongoDB behavior for:
 * - Cursor iteration (next, hasNext, toArray)
 * - Modifiers (limit, skip, sort)
 * - batchSize behavior
 * - Cursor exhaustion and state
 *
 * Bead: mongo.do-jqi
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'

describe('Cursor Behavior Compatibility', () => {
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

  /**
   * Helper to seed collections with test data
   */
  const setupCollections = async (docCount: number = 10) => {
    const dbName = `test_cursor_${testNum}`
    const mongoCol = mongodb.database(dbName).collection('items')
    const mondoCol = mongo.do.database(dbName).collection('items')

    const docs = Array.from({ length: docCount }, (_, i) => ({
      name: `Item ${i + 1}`,
      value: i + 1,
      category: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C',
    }))

    for (const doc of docs) {
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })
    }

    return { mongoCol, mondoCol, docCount }
  }

  // ============================================================================
  // Cursor Iteration Methods
  // ============================================================================

  describe('Iteration Methods', () => {
    it('cursor.toArray() returns all documents', async () => {
      const { mongoCol, mondoCol, docCount } = await setupCollections(5)

      const mongoDocs = await mongoCol.find({}).toArray()
      const mondoDocs = await mondoCol.find({}).toArray()

      expect(mongoDocs.length).toBe(docCount)
      expect(mondoDocs.length).toBe(docCount)
    })

    it('cursor.next() returns one document at a time', async () => {
      const { mongoCol, mondoCol } = await setupCollections(3)

      const mongoCursor = mongoCol.find({}).sort({ value: 1 })
      const mondoCursor = mondoCol.find({}).sort({ value: 1 })

      const mongoFirst = await mongoCursor.next()
      const mondoFirst = await mondoCursor.next()

      expect(mongoFirst?.value).toBe(1)
      expect(mondoFirst?.value).toBe(1)

      const mongoSecond = await mongoCursor.next()
      const mondoSecond = await mondoCursor.next()

      expect(mongoSecond?.value).toBe(2)
      expect(mondoSecond?.value).toBe(2)
    })

    it('cursor.next() returns null after exhaustion', async () => {
      const { mongoCol, mondoCol } = await setupCollections(2)

      const mongoCursor = mongoCol.find({})
      const mondoCursor = mondoCol.find({})

      // Exhaust the cursor
      await mongoCursor.next()
      await mongoCursor.next()
      const mongoThird = await mongoCursor.next()

      await mondoCursor.next()
      await mondoCursor.next()
      const mondoThird = await mondoCursor.next()

      expect(mongoThird).toBeNull()
      expect(mondoThird).toBeNull()
    })

    it('cursor.hasNext() returns true when documents remain', async () => {
      const { mongoCol, mondoCol } = await setupCollections(2)

      const mongoCursor = mongoCol.find({})
      const mondoCursor = mondoCol.find({})

      const mongoHasFirst = await mongoCursor.hasNext()
      const mondoHasFirst = await mondoCursor.hasNext()

      expect(mongoHasFirst).toBe(true)
      expect(mondoHasFirst).toBe(true)
    })

    it('cursor.hasNext() returns false when exhausted', async () => {
      const { mongoCol, mondoCol } = await setupCollections(1)

      const mongoCursor = mongoCol.find({})
      const mondoCursor = mondoCol.find({})

      // Exhaust the cursor
      await mongoCursor.next()
      await mondoCursor.next()

      const mongoHasNext = await mongoCursor.hasNext()
      const mondoHasNext = await mondoCursor.hasNext()

      expect(mongoHasNext).toBe(false)
      expect(mondoHasNext).toBe(false)
    })

    it('hasNext() does not advance cursor position', async () => {
      const { mongoCol, mondoCol } = await setupCollections(3)

      const mongoCursor = mongoCol.find({}).sort({ value: 1 })
      const mondoCursor = mondoCol.find({}).sort({ value: 1 })

      // Call hasNext multiple times
      await mongoCursor.hasNext()
      await mongoCursor.hasNext()
      await mongoCursor.hasNext()

      await mondoCursor.hasNext()
      await mondoCursor.hasNext()
      await mondoCursor.hasNext()

      // First next() should still return the first document
      const mongoFirst = await mongoCursor.next()
      const mondoFirst = await mondoCursor.next()

      expect(mongoFirst?.value).toBe(1)
      expect(mondoFirst?.value).toBe(1)
    })

    it('empty result cursor returns empty array', async () => {
      const dbName = `test_cursor_empty_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const mongoDocs = await mongoCol.find({ nonexistent: true }).toArray()
      const mondoDocs = await mondoCol.find({ nonexistent: true }).toArray()

      expect(mongoDocs).toEqual([])
      expect(mondoDocs).toEqual([])
    })

    it('empty cursor hasNext() returns false', async () => {
      const dbName = `test_cursor_empty_has_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const mongoCursor = mongoCol.find({ nonexistent: true })
      const mondoCursor = mondoCol.find({ nonexistent: true })

      const mongoHas = await mongoCursor.hasNext()
      const mondoHas = await mondoCursor.hasNext()

      expect(mongoHas).toBe(false)
      expect(mondoHas).toBe(false)
    })

    it('empty cursor next() returns null', async () => {
      const dbName = `test_cursor_empty_next_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const mongoCursor = mongoCol.find({ nonexistent: true })
      const mondoCursor = mondoCol.find({ nonexistent: true })

      const mongoDoc = await mongoCursor.next()
      const mondoDoc = await mondoCursor.next()

      expect(mongoDoc).toBeNull()
      expect(mondoDoc).toBeNull()
    })
  })

  // ============================================================================
  // Cursor Modifiers: limit, skip, sort
  // ============================================================================

  describe('Limit Modifier', () => {
    it('limit(n) restricts results to n documents', async () => {
      const { mongoCol, mondoCol } = await setupCollections(10)

      const mongoDocs = await mongoCol.find({}).limit(3).toArray()
      const mondoDocs = await mondoCol.find({}).limit(3).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
    })

    it('limit(0) returns all documents', async () => {
      const { mongoCol, mondoCol, docCount } = await setupCollections(5)

      const mongoDocs = await mongoCol.find({}).limit(0).toArray()
      const mondoDocs = await mondoCol.find({}).limit(0).toArray()

      expect(mongoDocs.length).toBe(docCount)
      expect(mondoDocs.length).toBe(docCount)
    })

    it('limit greater than result count returns all', async () => {
      const { mongoCol, mondoCol, docCount } = await setupCollections(3)

      const mongoDocs = await mongoCol.find({}).limit(100).toArray()
      const mondoDocs = await mondoCol.find({}).limit(100).toArray()

      expect(mongoDocs.length).toBe(docCount)
      expect(mondoDocs.length).toBe(docCount)
    })

    it('limit(1) returns exactly one document', async () => {
      const { mongoCol, mondoCol } = await setupCollections(5)

      const mongoDocs = await mongoCol.find({}).limit(1).toArray()
      const mondoDocs = await mondoCol.find({}).limit(1).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
    })
  })

  describe('Skip Modifier', () => {
    it('skip(n) offsets results by n documents', async () => {
      const { mongoCol, mondoCol, docCount } = await setupCollections(10)

      const mongoDocs = await mongoCol.find({}).sort({ value: 1 }).skip(3).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ value: 1 }).skip(3).toArray()

      expect(mongoDocs.length).toBe(docCount - 3)
      expect(mondoDocs.length).toBe(docCount - 3)
      expect(mongoDocs[0]?.value).toBe(4)
      expect(mondoDocs[0]?.value).toBe(4)
    })

    it('skip(0) returns all documents', async () => {
      const { mongoCol, mondoCol, docCount } = await setupCollections(5)

      const mongoDocs = await mongoCol.find({}).skip(0).toArray()
      const mondoDocs = await mondoCol.find({}).skip(0).toArray()

      expect(mongoDocs.length).toBe(docCount)
      expect(mondoDocs.length).toBe(docCount)
    })

    it('skip greater than result count returns empty', async () => {
      const { mongoCol, mondoCol } = await setupCollections(3)

      const mongoDocs = await mongoCol.find({}).skip(100).toArray()
      const mondoDocs = await mondoCol.find({}).skip(100).toArray()

      expect(mongoDocs).toEqual([])
      expect(mondoDocs).toEqual([])
    })

    it('skip equals result count returns empty', async () => {
      const { mongoCol, mondoCol, docCount } = await setupCollections(5)

      const mongoDocs = await mongoCol.find({}).skip(docCount).toArray()
      const mondoDocs = await mondoCol.find({}).skip(docCount).toArray()

      expect(mongoDocs).toEqual([])
      expect(mondoDocs).toEqual([])
    })
  })

  describe('Sort Modifier', () => {
    it('sort ascending orders correctly', async () => {
      const { mongoCol, mondoCol } = await setupCollections(5)

      const mongoDocs = await mongoCol.find({}).sort({ value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ value: 1 }).toArray()

      expect(mongoDocs.map(d => d.value)).toEqual([1, 2, 3, 4, 5])
      expect(mondoDocs.map(d => d.value)).toEqual([1, 2, 3, 4, 5])
    })

    it('sort descending orders correctly', async () => {
      const { mongoCol, mondoCol } = await setupCollections(5)

      const mongoDocs = await mongoCol.find({}).sort({ value: -1 }).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ value: -1 }).toArray()

      expect(mongoDocs.map(d => d.value)).toEqual([5, 4, 3, 2, 1])
      expect(mondoDocs.map(d => d.value)).toEqual([5, 4, 3, 2, 1])
    })

    it('sort by string field alphabetically', async () => {
      const dbName = `test_sort_str_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'Charlie' })
      await mongoCol.insertOne({ name: 'Alice' })
      await mongoCol.insertOne({ name: 'Bob' })

      await mondoCol.insertOne({ name: 'Charlie' })
      await mondoCol.insertOne({ name: 'Alice' })
      await mondoCol.insertOne({ name: 'Bob' })

      const mongoDocs = await mongoCol.find({}).sort({ name: 1 }).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ name: 1 }).toArray()

      expect(mongoDocs.map(d => d.name)).toEqual(['Alice', 'Bob', 'Charlie'])
      expect(mondoDocs.map(d => d.name)).toEqual(['Alice', 'Bob', 'Charlie'])
    })

    it('sort with multiple fields', async () => {
      const dbName = `test_sort_multi_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const docs = [
        { category: 'A', value: 2 },
        { category: 'B', value: 1 },
        { category: 'A', value: 1 },
        { category: 'B', value: 2 },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      const mongoDocs = await mongoCol.find({}).sort({ category: 1, value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ category: 1, value: 1 }).toArray()

      // Should sort by category first, then by value within each category
      expect(mongoDocs.map(d => ({ c: d.category, v: d.value }))).toEqual([
        { c: 'A', v: 1 },
        { c: 'A', v: 2 },
        { c: 'B', v: 1 },
        { c: 'B', v: 2 },
      ])
      expect(mondoDocs.map(d => ({ c: d.category, v: d.value }))).toEqual([
        { c: 'A', v: 1 },
        { c: 'A', v: 2 },
        { c: 'B', v: 1 },
        { c: 'B', v: 2 },
      ])
    })

    it('sort with mixed directions', async () => {
      const dbName = `test_sort_mixed_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const docs = [
        { category: 'A', value: 2 },
        { category: 'B', value: 1 },
        { category: 'A', value: 1 },
        { category: 'B', value: 2 },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      // Sort category ascending, value descending
      const mongoDocs = await mongoCol.find({}).sort({ category: 1, value: -1 }).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ category: 1, value: -1 }).toArray()

      expect(mongoDocs.map(d => ({ c: d.category, v: d.value }))).toEqual([
        { c: 'A', v: 2 },
        { c: 'A', v: 1 },
        { c: 'B', v: 2 },
        { c: 'B', v: 1 },
      ])
      expect(mondoDocs.map(d => ({ c: d.category, v: d.value }))).toEqual([
        { c: 'A', v: 2 },
        { c: 'A', v: 1 },
        { c: 'B', v: 2 },
        { c: 'B', v: 1 },
      ])
    })
  })

  // ============================================================================
  // Chaining Modifiers
  // ============================================================================

  describe('Chaining Modifiers', () => {
    it('chains sort + limit', async () => {
      const { mongoCol, mondoCol } = await setupCollections(10)

      const mongoDocs = await mongoCol.find({}).sort({ value: -1 }).limit(3).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ value: -1 }).limit(3).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.value)).toEqual([10, 9, 8])
      expect(mondoDocs.map(d => d.value)).toEqual([10, 9, 8])
    })

    it('chains sort + skip', async () => {
      const { mongoCol, mondoCol } = await setupCollections(10)

      const mongoDocs = await mongoCol.find({}).sort({ value: 1 }).skip(7).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ value: 1 }).skip(7).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.value)).toEqual([8, 9, 10])
      expect(mondoDocs.map(d => d.value)).toEqual([8, 9, 10])
    })

    it('chains sort + skip + limit', async () => {
      const { mongoCol, mondoCol } = await setupCollections(10)

      const mongoDocs = await mongoCol.find({}).sort({ value: 1 }).skip(2).limit(3).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ value: 1 }).skip(2).limit(3).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.value)).toEqual([3, 4, 5])
      expect(mondoDocs.map(d => d.value)).toEqual([3, 4, 5])
    })

    it('chains limit + skip + sort (order should not matter before execution)', async () => {
      const { mongoCol, mondoCol } = await setupCollections(10)

      // Different ordering of modifiers
      const mongoDocs = await mongoCol.find({}).limit(5).skip(2).sort({ value: -1 }).toArray()
      const mondoDocs = await mondoCol.find({}).limit(5).skip(2).sort({ value: -1 }).toArray()

      // Should sort first, then skip, then limit
      expect(mongoDocs.length).toBe(5)
      expect(mondoDocs.length).toBe(5)
      expect(mongoDocs.map(d => d.value)).toEqual([8, 7, 6, 5, 4])
      expect(mondoDocs.map(d => d.value)).toEqual([8, 7, 6, 5, 4])
    })

    it('chains with filter query', async () => {
      const { mongoCol, mondoCol } = await setupCollections(10)

      // Filter for values > 5, sort, skip, limit
      const mongoDocs = await mongoCol.find({ value: { $gt: 5 } }).sort({ value: 1 }).skip(1).limit(2).toArray()
      const mondoDocs = await mondoCol.find({ value: { $gt: 5 } }).sort({ value: 1 }).skip(1).limit(2).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.value)).toEqual([7, 8])
      expect(mondoDocs.map(d => d.value)).toEqual([7, 8])
    })
  })

  // ============================================================================
  // BatchSize Behavior
  // ============================================================================

  describe('BatchSize Behavior', () => {
    it('large result set pagination with skip and limit', async () => {
      const { mongoCol, mondoCol } = await setupCollections(100)

      // Simulate pagination: page 1
      const mongoPage1 = await mongoCol.find({}).sort({ value: 1 }).skip(0).limit(10).toArray()
      const mondoPage1 = await mondoCol.find({}).sort({ value: 1 }).skip(0).limit(10).toArray()

      expect(mongoPage1.length).toBe(10)
      expect(mondoPage1.length).toBe(10)
      expect(mongoPage1[0]?.value).toBe(1)
      expect(mondoPage1[0]?.value).toBe(1)

      // Simulate pagination: page 5
      const mongoPage5 = await mongoCol.find({}).sort({ value: 1 }).skip(40).limit(10).toArray()
      const mondoPage5 = await mondoCol.find({}).sort({ value: 1 }).skip(40).limit(10).toArray()

      expect(mongoPage5.length).toBe(10)
      expect(mondoPage5.length).toBe(10)
      expect(mongoPage5[0]?.value).toBe(41)
      expect(mondoPage5[0]?.value).toBe(41)

      // Last page
      const mongoLastPage = await mongoCol.find({}).sort({ value: 1 }).skip(95).limit(10).toArray()
      const mondoLastPage = await mondoCol.find({}).sort({ value: 1 }).skip(95).limit(10).toArray()

      expect(mongoLastPage.length).toBe(5)
      expect(mondoLastPage.length).toBe(5)
    })

    it('iteration respects limit', async () => {
      const { mongoCol, mondoCol } = await setupCollections(10)

      const mongoCursor = mongoCol.find({}).limit(3)
      const mondoCursor = mondoCol.find({}).limit(3)

      let mongoCount = 0
      let mondoCount = 0

      while (await mongoCursor.hasNext()) {
        await mongoCursor.next()
        mongoCount++
      }

      while (await mondoCursor.hasNext()) {
        await mondoCursor.next()
        mondoCount++
      }

      expect(mongoCount).toBe(3)
      expect(mondoCount).toBe(3)
    })
  })

  // ============================================================================
  // Cursor Exhaustion
  // ============================================================================

  describe('Cursor Exhaustion', () => {
    it('cursor tracks position correctly through iteration', async () => {
      const { mongoCol, mondoCol } = await setupCollections(5)

      const mongoCursor = mongoCol.find({}).sort({ value: 1 })
      const mondoCursor = mondoCol.find({}).sort({ value: 1 })

      const mongoResults: number[] = []
      const mondoResults: number[] = []

      while (await mongoCursor.hasNext()) {
        const doc = await mongoCursor.next()
        if (doc) mongoResults.push(doc.value as number)
      }

      while (await mondoCursor.hasNext()) {
        const doc = await mondoCursor.next()
        if (doc) mondoResults.push(doc.value as number)
      }

      expect(mongoResults).toEqual([1, 2, 3, 4, 5])
      expect(mondoResults).toEqual([1, 2, 3, 4, 5])
    })

    it('toArray after partial iteration returns remaining', async () => {
      const { mongoCol, mondoCol } = await setupCollections(5)

      const mongoCursor = mongoCol.find({}).sort({ value: 1 })
      const mondoCursor = mondoCol.find({}).sort({ value: 1 })

      // Read first two
      await mongoCursor.next()
      await mongoCursor.next()
      await mondoCursor.next()
      await mondoCursor.next()

      // Get remaining as array
      const mongoRemaining = await mongoCursor.toArray()
      const mondoRemaining = await mondoCursor.toArray()

      expect(mongoRemaining.length).toBe(3)
      expect(mondoRemaining.length).toBe(3)
      expect(mongoRemaining.map(d => d.value)).toEqual([3, 4, 5])
      expect(mondoRemaining.map(d => d.value)).toEqual([3, 4, 5])
    })

    it('single document cursor exhausts after one next()', async () => {
      const dbName = `test_single_doc_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ value: 42 })
      await mondoCol.insertOne({ value: 42 })

      const mongoCursor = mongoCol.find({})
      const mondoCursor = mondoCol.find({})

      const mongoDoc = await mongoCursor.next()
      const mondoDoc = await mondoCursor.next()

      expect(mongoDoc?.value).toBe(42)
      expect(mondoDoc?.value).toBe(42)

      expect(await mongoCursor.hasNext()).toBe(false)
      expect(await mondoCursor.hasNext()).toBe(false)

      expect(await mongoCursor.next()).toBeNull()
      expect(await mondoCursor.next()).toBeNull()
    })

    it('cursor can be closed', async () => {
      const { mongoCol, mondoCol } = await setupCollections(5)

      const mongoCursor = mongoCol.find({})
      const mondoCursor = mondoCol.find({})

      // Read one document
      await mongoCursor.next()
      await mondoCursor.next()

      // Close the cursor
      await mongoCursor.close()
      await mondoCursor.close()

      // After closing, cursor should behave gracefully
      // Note: Specific behavior may vary - some implementations throw, others return null
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('sort with null values', async () => {
      const dbName = `test_sort_null_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'A', value: 10 })
      await mongoCol.insertOne({ name: 'B', value: null })
      await mongoCol.insertOne({ name: 'C', value: 5 })

      await mondoCol.insertOne({ name: 'A', value: 10 })
      await mondoCol.insertOne({ name: 'B', value: null })
      await mondoCol.insertOne({ name: 'C', value: 5 })

      const mongoDocs = await mongoCol.find({}).sort({ value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ value: 1 }).toArray()

      // null values should sort first in ascending order
      expect(mongoDocs[0]?.value).toBeNull()
      expect(mondoDocs[0]?.value).toBeNull()
    })

    it('sort with missing field', async () => {
      const dbName = `test_sort_missing_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'A', value: 10 })
      await mongoCol.insertOne({ name: 'B' }) // missing value field
      await mongoCol.insertOne({ name: 'C', value: 5 })

      await mondoCol.insertOne({ name: 'A', value: 10 })
      await mondoCol.insertOne({ name: 'B' })
      await mondoCol.insertOne({ name: 'C', value: 5 })

      const mongoDocs = await mongoCol.find({}).sort({ value: 1 }).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ value: 1 }).toArray()

      // Missing/undefined values should sort first
      expect(mongoDocs[0]?.name).toBe('B')
      expect(mondoDocs[0]?.name).toBe('B')
    })

    it('very large skip value', async () => {
      const { mongoCol, mondoCol } = await setupCollections(10)

      const mongoDocs = await mongoCol.find({}).skip(1000000).toArray()
      const mondoDocs = await mondoCol.find({}).skip(1000000).toArray()

      expect(mongoDocs).toEqual([])
      expect(mondoDocs).toEqual([])
    })

    it('skip and limit both zero', async () => {
      const { mongoCol, mondoCol, docCount } = await setupCollections(5)

      const mongoDocs = await mongoCol.find({}).skip(0).limit(0).toArray()
      const mondoDocs = await mondoCol.find({}).skip(0).limit(0).toArray()

      expect(mongoDocs.length).toBe(docCount)
      expect(mondoDocs.length).toBe(docCount)
    })

    it('sort on nested field', async () => {
      const dbName = `test_sort_nested_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ user: { score: 30 } })
      await mongoCol.insertOne({ user: { score: 10 } })
      await mongoCol.insertOne({ user: { score: 20 } })

      await mondoCol.insertOne({ user: { score: 30 } })
      await mondoCol.insertOne({ user: { score: 10 } })
      await mondoCol.insertOne({ user: { score: 20 } })

      const mongoDocs = await mongoCol.find({}).sort({ 'user.score': 1 }).toArray()
      const mondoDocs = await mondoCol.find({}).sort({ 'user.score': 1 }).toArray()

      expect(mongoDocs.map(d => (d.user as any)?.score)).toEqual([10, 20, 30])
      expect(mondoDocs.map(d => (d.user as any)?.score)).toEqual([10, 20, 30])
    })

    it('projection with cursor', async () => {
      const { mongoCol, mondoCol } = await setupCollections(3)

      const mongoDocs = await mongoCol.find({}).project({ name: 1, _id: 0 }).toArray()
      const mondoDocs = await mondoCol.find({}).project({ name: 1, _id: 0 }).toArray()

      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)

      // Should only have 'name' field
      for (const doc of mongoDocs) {
        expect(doc.name).toBeDefined()
        expect(doc._id).toBeUndefined()
        expect(doc.value).toBeUndefined()
      }

      for (const doc of mondoDocs) {
        expect(doc.name).toBeDefined()
        expect(doc._id).toBeUndefined()
        expect(doc.value).toBeUndefined()
      }
    })

    it('multiple toArray calls on same cursor', async () => {
      const { mongoCol, mondoCol } = await setupCollections(3)

      const mongoCursor = mongoCol.find({})
      const mondoCursor = mondoCol.find({})

      const mongoFirst = await mongoCursor.toArray()
      const mondoFirst = await mondoCursor.toArray()

      expect(mongoFirst.length).toBe(3)
      expect(mondoFirst.length).toBe(3)

      // Second call should return empty (cursor exhausted)
      const mongoSecond = await mongoCursor.toArray()
      const mondoSecond = await mondoCursor.toArray()

      expect(mongoSecond).toEqual([])
      expect(mondoSecond).toEqual([])
    })
  })
})
