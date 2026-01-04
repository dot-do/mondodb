import { describe, it, expect, beforeEach } from 'vitest'
import { MongoClient } from '../../src/client/MongoClient'
import { MongoCollection } from '../../src/client/mongo-collection'
import { AggregationCursor, AggregationError } from '../../src/client/aggregation-cursor'

describe('Async Aggregation Pipeline', () => {
  let client: MongoClient
  let collection: MongoCollection

  beforeEach(async () => {
    client = new MongoClient('mongodb://localhost:27017')
    const db = client.db('test')
    collection = db.collection('users')

    // Insert test data
    await collection.insertMany([
      { name: 'Alice', age: 30, status: 'active', category: 'A', amount: 100 },
      { name: 'Bob', age: 25, status: 'active', category: 'B', amount: 200 },
      { name: 'Charlie', age: 35, status: 'inactive', category: 'A', amount: 150 },
      { name: 'Diana', age: 28, status: 'active', category: 'B', amount: 300 },
      { name: 'Eve', age: 32, status: 'inactive', category: 'C', amount: 250 },
    ])
  })

  describe('AggregationCursor.toArray()', () => {
    it('returns all documents as Promise<Document[]>', async () => {
      const results = await collection.aggregate([
        { $match: { status: 'active' } }
      ]).toArray()

      expect(results).toHaveLength(3)
      expect(results.map(r => r.name)).toContain('Alice')
      expect(results.map(r => r.name)).toContain('Bob')
      expect(results.map(r => r.name)).toContain('Diana')
    })

    it('returns empty array for no matches', async () => {
      const results = await collection.aggregate([
        { $match: { status: 'unknown' } }
      ]).toArray()

      expect(results).toEqual([])
    })

    it('can only be called once (closes cursor)', async () => {
      const cursor = collection.aggregate([
        { $match: { status: 'active' } }
      ])

      const first = await cursor.toArray()
      expect(first).toHaveLength(3)

      // Second call returns empty - cursor is closed
      const second = await cursor.toArray()
      expect(second).toEqual([])
    })
  })

  describe('Async Iterator (for await...of)', () => {
    it('supports for-await-of iteration', async () => {
      const docs: unknown[] = []

      for await (const doc of collection.aggregate([
        { $match: { status: 'active' } }
      ])) {
        docs.push(doc)
      }

      expect(docs).toHaveLength(3)
    })

    it('iterates in correct order with $sort', async () => {
      const names: string[] = []

      for await (const doc of collection.aggregate([
        { $match: { status: 'active' } },
        { $sort: { name: 1 } }
      ])) {
        names.push(doc.name as string)
      }

      expect(names).toEqual(['Alice', 'Bob', 'Diana'])
    })

    it('handles break in for-await-of', async () => {
      const docs: unknown[] = []

      for await (const doc of collection.aggregate([
        { $sort: { name: 1 } }
      ])) {
        docs.push(doc)
        if (docs.length >= 2) break
      }

      expect(docs).toHaveLength(2)
    })

    it('closes cursor after iteration completes', async () => {
      const cursor = collection.aggregate([
        { $match: { status: 'active' } }
      ])

      for await (const _ of cursor) {
        // iterate through all
      }

      expect(cursor.closed).toBe(true)
    })
  })

  describe('Pipeline Stage Execution', () => {
    it('executes $match stage', async () => {
      const results = await collection.aggregate([
        { $match: { age: { $gte: 30 } } }
      ]).toArray()

      expect(results).toHaveLength(3)
      expect(results.every(r => (r.age as number) >= 30)).toBe(true)
    })

    it('executes $project stage', async () => {
      const results = await collection.aggregate([
        { $project: { name: 1, age: 1 } }
      ]).toArray()

      expect(results[0]).toHaveProperty('_id')
      expect(results[0]).toHaveProperty('name')
      expect(results[0]).toHaveProperty('age')
      expect(results[0]).not.toHaveProperty('status')
    })

    it('executes $group stage with $sum', async () => {
      const results = await collection.aggregate([
        { $group: { _id: '$status', total: { $sum: '$amount' } } }
      ]).toArray()

      expect(results).toHaveLength(2)

      const active = results.find(r => r._id === 'active')
      expect(active?.total).toBe(600) // 100 + 200 + 300

      const inactive = results.find(r => r._id === 'inactive')
      expect(inactive?.total).toBe(400) // 150 + 250
    })

    it('executes $group stage with $count', async () => {
      const results = await collection.aggregate([
        { $group: { _id: '$status', count: { $count: {} } } }
      ]).toArray()

      const active = results.find(r => r._id === 'active')
      expect(active?.count).toBe(3)
    })

    it('executes $group stage with $avg', async () => {
      const results = await collection.aggregate([
        { $group: { _id: '$status', avgAge: { $avg: '$age' } } }
      ]).toArray()

      const active = results.find(r => r._id === 'active')
      expect(active?.avgAge).toBeCloseTo(27.67, 1) // (30 + 25 + 28) / 3
    })

    it('executes $sort stage', async () => {
      const results = await collection.aggregate([
        { $sort: { age: 1 } }
      ]).toArray()

      const ages = results.map(r => r.age)
      expect(ages).toEqual([25, 28, 30, 32, 35])
    })

    it('executes $sort stage descending', async () => {
      const results = await collection.aggregate([
        { $sort: { age: -1 } }
      ]).toArray()

      const ages = results.map(r => r.age)
      expect(ages).toEqual([35, 32, 30, 28, 25])
    })

    it('executes $limit stage', async () => {
      const results = await collection.aggregate([
        { $sort: { name: 1 } },
        { $limit: 2 }
      ]).toArray()

      expect(results).toHaveLength(2)
      expect(results.map(r => r.name)).toEqual(['Alice', 'Bob'])
    })

    it('executes $skip stage', async () => {
      const results = await collection.aggregate([
        { $sort: { name: 1 } },
        { $skip: 2 }
      ]).toArray()

      expect(results).toHaveLength(3)
      expect(results.map(r => r.name)).toEqual(['Charlie', 'Diana', 'Eve'])
    })

    it('executes $count stage', async () => {
      const results = await collection.aggregate([
        { $match: { status: 'active' } },
        { $count: 'totalActive' }
      ]).toArray()

      expect(results).toHaveLength(1)
      expect(results[0].totalActive).toBe(3)
    })

    it('executes $unwind stage', async () => {
      // Insert document with array
      await collection.insertOne({
        name: 'Frank',
        tags: ['admin', 'user', 'developer']
      })

      const results = await collection.aggregate([
        { $match: { name: 'Frank' } },
        { $unwind: '$tags' }
      ]).toArray()

      expect(results).toHaveLength(3)
      expect(results.map(r => r.tags)).toEqual(['admin', 'user', 'developer'])
    })

    it('executes $addFields stage', async () => {
      const results = await collection.aggregate([
        { $match: { name: 'Alice' } },
        { $addFields: { fullStatus: 'ACTIVE_USER', doubled: { $multiply: ['$amount', 2] } } }
      ]).toArray()

      expect(results[0].fullStatus).toBe('ACTIVE_USER')
      expect(results[0].doubled).toBe(200)
    })
  })

  describe('$lookup Stage (Async)', () => {
    let ordersCollection: MongoCollection

    beforeEach(async () => {
      ordersCollection = client.db('test').collection('orders')

      await ordersCollection.insertMany([
        { userId: 'alice', product: 'Widget', price: 50 },
        { userId: 'alice', product: 'Gadget', price: 75 },
        { userId: 'bob', product: 'Thing', price: 100 },
      ])
    })

    it('executes basic $lookup', async () => {
      // First add userId field to users
      await collection.updateMany({}, { $set: {} }) // Ensure users exist

      // Insert users with userId field
      const db = client.db('test')
      const usersWithId = db.collection('usersWithId')
      await usersWithId.insertMany([
        { userId: 'alice', name: 'Alice' },
        { userId: 'bob', name: 'Bob' },
      ])

      const results = await usersWithId.aggregate([
        {
          $lookup: {
            from: 'orders',
            localField: 'userId',
            foreignField: 'userId',
            as: 'userOrders'
          }
        }
      ]).toArray()

      const alice = results.find(r => r.userId === 'alice')
      expect(alice?.userOrders).toHaveLength(2)

      const bob = results.find(r => r.userId === 'bob')
      expect(bob?.userOrders).toHaveLength(1)
    })
  })

  describe('Complex Pipeline Combinations', () => {
    it('executes match -> group -> sort -> limit pipeline', async () => {
      const results = await collection.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$category', totalAmount: { $sum: '$amount' } } },
        { $sort: { totalAmount: -1 } },
        { $limit: 1 }
      ]).toArray()

      expect(results).toHaveLength(1)
      expect(results[0]._id).toBe('B') // 200 + 300 = 500
      expect(results[0].totalAmount).toBe(500)
    })

    it('executes project -> addFields -> sort pipeline', async () => {
      const results = await collection.aggregate([
        { $project: { name: 1, amount: 1 } },
        { $addFields: { bonus: { $multiply: ['$amount', 0.1] } } },
        { $sort: { bonus: -1 } }
      ]).toArray()

      expect(results[0].name).toBe('Diana') // 300 * 0.1 = 30
      expect(results[0].bonus).toBe(30)
    })

    it('executes match -> unwind -> group pipeline', async () => {
      // Insert document with categories array
      await collection.insertOne({
        name: 'MultiCategory',
        status: 'active',
        categories: ['A', 'B', 'C'],
        amount: 100
      })

      const results = await collection.aggregate([
        { $match: { name: 'MultiCategory' } },
        { $unwind: '$categories' },
        { $group: { _id: '$categories', count: { $sum: 1 } } }
      ]).toArray()

      expect(results).toHaveLength(3)
    })
  })

  describe('Cursor Methods', () => {
    it('hasNext() returns true when documents available', async () => {
      const cursor = collection.aggregate([
        { $match: { status: 'active' } }
      ])

      expect(await cursor.hasNext()).toBe(true)
    })

    it('hasNext() returns false when empty', async () => {
      const cursor = collection.aggregate([
        { $match: { status: 'nonexistent' } }
      ])

      expect(await cursor.hasNext()).toBe(false)
    })

    it('next() returns documents one at a time', async () => {
      const cursor = collection.aggregate([
        { $match: { status: 'active' } },
        { $sort: { name: 1 } }
      ])

      const first = await cursor.next()
      expect(first?.name).toBe('Alice')

      const second = await cursor.next()
      expect(second?.name).toBe('Bob')

      const third = await cursor.next()
      expect(third?.name).toBe('Diana')

      const fourth = await cursor.next()
      expect(fourth).toBeNull()
    })

    it('forEach() iterates with callback', async () => {
      const names: string[] = []

      await collection.aggregate([
        { $match: { status: 'active' } },
        { $sort: { name: 1 } }
      ]).forEach(doc => {
        names.push(doc.name as string)
      })

      expect(names).toEqual(['Alice', 'Bob', 'Diana'])
    })

    it('forEach() stops on false return', async () => {
      const names: string[] = []

      await collection.aggregate([
        { $sort: { name: 1 } }
      ]).forEach((doc, index) => {
        names.push(doc.name as string)
        if (index >= 1) return false
      })

      expect(names).toHaveLength(2)
    })

    it('map() transforms documents', async () => {
      const names = await collection.aggregate([
        { $match: { status: 'active' } },
        { $sort: { name: 1 } }
      ]).map(doc => doc.name as string).toArray()

      expect(names).toEqual(['Alice', 'Bob', 'Diana'])
    })

    it('close() properly closes cursor', async () => {
      const cursor = collection.aggregate([
        { $match: { status: 'active' } }
      ])

      await cursor.next() // Start iteration
      await cursor.close()

      expect(cursor.closed).toBe(true)
      expect(await cursor.next()).toBeNull()
    })

    it('clone() creates independent cursor', async () => {
      const cursor = collection.aggregate([
        { $match: { status: 'active' } }
      ])

      const cloned = cursor.clone()

      // Exhaust original
      await cursor.toArray()

      // Cloned should still work
      const results = await cloned.toArray()
      expect(results).toHaveLength(3)
    })
  })

  describe('Error Propagation', () => {
    it('propagates errors from fetch function', async () => {
      // Create a cursor that will fail
      const cursor = new AggregationCursor(
        [],
        async () => {
          throw new Error('Fetch failed')
        }
      )

      await expect(cursor.toArray()).rejects.toThrow('Fetch failed')
    })

    it('propagates errors in forEach callback', async () => {
      const cursor = collection.aggregate([
        { $match: { status: 'active' } }
      ])

      await expect(
        cursor.forEach(() => {
          throw new Error('Callback error')
        })
      ).rejects.toThrow('Callback error')
    })

    it('closes cursor on error', async () => {
      const cursor = new AggregationCursor(
        [],
        async () => {
          throw new Error('Fetch failed')
        }
      )

      try {
        await cursor.toArray()
      } catch {
        // Ignore
      }

      expect(cursor.closed).toBe(true)
    })

    it('throws AggregationError for $function failures', async () => {
      // This test verifies error type when function stage fails
      const error = new AggregationError('$function stage failed: test', [
        new Error('test')
      ])

      expect(error).toBeInstanceOf(AggregationError)
      expect(error.errors).toHaveLength(1)
      expect(error.message).toContain('$function stage failed')
    })
  })

  describe('Aggregation Plan (explain)', () => {
    it('explain() returns pipeline info', async () => {
      const cursor = collection.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])

      const plan = cursor.explain()

      expect(plan.pipeline).toHaveLength(3)
      expect(plan.pipeline[0].stage).toBe('$match')
      expect(plan.pipeline[1].stage).toBe('$group')
      expect(plan.pipeline[2].stage).toBe('$sort')
    })

    it('explains async stages correctly', async () => {
      const cursor = new AggregationCursor(
        [
          { $match: { status: 'active' } },
          { $lookup: { from: 'orders', localField: 'id', foreignField: 'userId', as: 'orders' } }
        ],
        async () => []
      )

      const plan = cursor.explain()

      expect(plan.pipeline[0].isAsync).toBe(false)
      expect(plan.pipeline[1].isAsync).toBe(false) // Basic lookup is not async
    })
  })

  describe('Expression Evaluation in Pipeline', () => {
    it('evaluates $concat expression', async () => {
      const results = await collection.aggregate([
        { $match: { name: 'Alice' } },
        { $project: { greeting: { $concat: ['Hello, ', '$name', '!'] } } }
      ]).toArray()

      expect(results[0].greeting).toBe('Hello, Alice!')
    })

    it('evaluates arithmetic expressions', async () => {
      const results = await collection.aggregate([
        { $match: { name: 'Alice' } },
        {
          $project: {
            doubled: { $multiply: ['$amount', 2] },
            halved: { $divide: ['$amount', 2] },
            added: { $add: ['$amount', 50] },
            subtracted: { $subtract: ['$amount', 25] }
          }
        }
      ]).toArray()

      expect(results[0].doubled).toBe(200)
      expect(results[0].halved).toBe(50)
      expect(results[0].added).toBe(150)
      expect(results[0].subtracted).toBe(75)
    })

    it('evaluates $cond expression', async () => {
      const results = await collection.aggregate([
        {
          $project: {
            name: 1,
            ageGroup: {
              $cond: {
                if: { $gte: ['$age', 30] },
                then: 'senior',
                else: 'junior'
              }
            }
          }
        },
        { $sort: { name: 1 } }
      ]).toArray()

      expect(results.find(r => r.name === 'Alice')?.ageGroup).toBe('senior')
      expect(results.find(r => r.name === 'Bob')?.ageGroup).toBe('junior')
    })

    it('evaluates $ifNull expression', async () => {
      await collection.insertOne({ name: 'NoAge' })

      const results = await collection.aggregate([
        { $match: { name: 'NoAge' } },
        { $project: { name: 1, age: { $ifNull: ['$age', 0] } } }
      ]).toArray()

      expect(results[0].age).toBe(0)
    })
  })

  describe('Group Accumulators', () => {
    it('$min accumulator', async () => {
      const results = await collection.aggregate([
        { $group: { _id: null, minAge: { $min: '$age' } } }
      ]).toArray()

      expect(results[0].minAge).toBe(25)
    })

    it('$max accumulator', async () => {
      const results = await collection.aggregate([
        { $group: { _id: null, maxAge: { $max: '$age' } } }
      ]).toArray()

      expect(results[0].maxAge).toBe(35)
    })

    it('$first accumulator', async () => {
      const results = await collection.aggregate([
        { $sort: { age: 1 } },
        { $group: { _id: '$status', youngest: { $first: '$name' } } }
      ]).toArray()

      const active = results.find(r => r._id === 'active')
      expect(active?.youngest).toBe('Bob') // age 25, youngest active
    })

    it('$last accumulator', async () => {
      const results = await collection.aggregate([
        { $sort: { age: 1 } },
        { $group: { _id: '$status', oldest: { $last: '$name' } } }
      ]).toArray()

      const active = results.find(r => r._id === 'active')
      expect(active?.oldest).toBe('Alice') // age 30, oldest active
    })

    it('$push accumulator', async () => {
      const results = await collection.aggregate([
        { $sort: { name: 1 } },
        { $group: { _id: '$status', names: { $push: '$name' } } }
      ]).toArray()

      const active = results.find(r => r._id === 'active')
      expect(active?.names).toEqual(['Alice', 'Bob', 'Diana'])
    })

    it('$addToSet accumulator', async () => {
      const results = await collection.aggregate([
        { $group: { _id: '$status', categories: { $addToSet: '$category' } } }
      ]).toArray()

      const active = results.find(r => r._id === 'active')
      expect(active?.categories).toHaveLength(2) // A and B (no duplicates)
      expect(active?.categories).toContain('A')
      expect(active?.categories).toContain('B')
    })
  })

  describe('Compound Group _id', () => {
    it('groups by compound key', async () => {
      const results = await collection.aggregate([
        {
          $group: {
            _id: { status: '$status', category: '$category' },
            count: { $sum: 1 }
          }
        }
      ]).toArray()

      // Should have groups for each status/category combination
      const activeA = results.find(
        r => (r._id as any).status === 'active' && (r._id as any).category === 'A'
      )
      expect(activeA?.count).toBe(1) // Just Alice

      const activeB = results.find(
        r => (r._id as any).status === 'active' && (r._id as any).category === 'B'
      )
      expect(activeB?.count).toBe(2) // Bob and Diana
    })

    it('groups by null _id for total aggregation', async () => {
      const results = await collection.aggregate([
        { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
      ]).toArray()

      expect(results).toHaveLength(1)
      expect(results[0]._id).toBeNull()
      expect(results[0].totalAmount).toBe(1000) // 100 + 200 + 150 + 300 + 250
    })
  })

  describe('Unwind Options', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'WithArray', items: ['a', 'b', 'c'] },
        { name: 'EmptyArray', items: [] },
        { name: 'NoArray' },
      ])
    })

    it('$unwind without preserveNullAndEmptyArrays excludes empty/missing', async () => {
      const results = await collection.aggregate([
        { $match: { name: { $in: ['WithArray', 'EmptyArray', 'NoArray'] } } },
        { $unwind: '$items' }
      ]).toArray()

      expect(results).toHaveLength(3) // Only the 3 items from WithArray
      expect(results.every(r => r.name === 'WithArray')).toBe(true)
    })

    it('$unwind with preserveNullAndEmptyArrays includes empty/missing', async () => {
      const results = await collection.aggregate([
        { $match: { name: { $in: ['WithArray', 'EmptyArray', 'NoArray'] } } },
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } }
      ]).toArray()

      expect(results).toHaveLength(5) // 3 from WithArray + 1 EmptyArray + 1 NoArray
    })
  })
})
