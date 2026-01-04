/**
 * Basic CRUD Compatibility Tests
 *
 * Tests that mondodb produces the same results as real MongoDB
 * for insertOne and findOne operations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  startCompatEnvironment,
  CompatTestContext,
  compareResults,
  runCompatTest,
} from '../helpers/mongodb-compat'

describe('MongoDB Compatibility - Basic CRUD', () => {
  let ctx: CompatTestContext

  beforeAll(async () => {
    ctx = await startCompatEnvironment('crud-compat-test')
  })

  afterAll(async () => {
    if (ctx) {
      await ctx.cleanup()
    }
  })

  describe('insertOne', () => {
    it('should insert a document with all fields preserved', async () => {
      await runCompatTest(ctx, 'insert-test', async ({ mongo, mondo }) => {
        const doc = {
          name: 'John Doe',
          age: 30,
          email: 'john@example.com',
          active: true,
          tags: ['user', 'premium'],
          metadata: {
            createdAt: '2024-01-01',
            source: 'api',
          },
        }

        // Insert into both
        const mongoResult = await mongo.insertOne(doc as any)
        const mondoResult = await mondo.insertOne(doc as any)

        // Both should acknowledge
        expect(mongoResult.acknowledged).toBe(true)
        expect(mondoResult.acknowledged).toBe(true)

        // Both should have an insertedId
        expect(mongoResult.insertedId).toBeDefined()
        expect(mondoResult.insertedId).toBeDefined()
      })
    })

    it('should generate _id if not provided', async () => {
      await runCompatTest(ctx, 'insert-id-test', async ({ mongo, mondo }) => {
        const doc = { name: 'Auto ID Test' }

        const mongoResult = await mongo.insertOne(doc)
        const mondoResult = await mondo.insertOne(doc as any)

        // Both should have insertedId
        expect(mongoResult.insertedId).toBeDefined()
        expect(mondoResult.insertedId).toBeDefined()

        // Both IDs should be 24 character hex strings
        expect(mongoResult.insertedId.toHexString()).toMatch(/^[a-f0-9]{24}$/)
        expect(mondoResult.insertedId.toHexString()).toMatch(/^[a-f0-9]{24}$/)
      })
    })

    it('should reject duplicate _id', async () => {
      await runCompatTest(ctx, 'insert-dup-test', async ({ mongo, mondo }) => {
        // Use a valid 24-character hex string for ObjectId
        const sharedId = '507f1f77bcf86cd799439011'
        const docWithId = { _id: sharedId as any, name: 'First' }
        const dupDoc = { _id: sharedId as any, name: 'Second' }

        // First insert should succeed
        await mongo.insertOne(docWithId)
        await mondo.insertOne(docWithId as any)

        // Second insert should fail in both
        let mongoError: Error | null = null
        let mondoError: Error | null = null

        try {
          await mongo.insertOne(dupDoc)
        } catch (e) {
          mongoError = e as Error
        }

        try {
          await mondo.insertOne(dupDoc as any)
        } catch (e) {
          mondoError = e as Error
        }

        // Both should throw
        expect(mongoError).not.toBeNull()
        expect(mondoError).not.toBeNull()

        // Both should have duplicate key error code
        expect((mongoError as any).code || (mongoError as any).errorResponse?.code).toBe(11000)
        expect((mondoError as any).code).toBe(11000)
      })
    })
  })

  describe('findOne', () => {
    it('should find document by exact field match', async () => {
      await runCompatTest(ctx, 'find-exact-test', async ({ mongo, mondo }) => {
        // Setup - insert test document
        const doc = { name: 'FindMe', value: 42 }
        await mongo.insertOne(doc)
        await mondo.insertOne(doc as any)

        // Find in both
        const mongoResult = await mongo.findOne({ name: 'FindMe' })
        const mondoResult = await mondo.findOne({ name: 'FindMe' })

        // Both should find the document
        expect(mongoResult).not.toBeNull()
        expect(mondoResult).not.toBeNull()

        // Compare results (ignoring _id since they're generated differently)
        const comparison = compareResults(mongoResult, mondoResult, {
          ignoreFields: ['_id'],
        })
        expect(comparison.match).toBe(true)
      })
    })

    it('should return null for non-existent document', async () => {
      await runCompatTest(ctx, 'find-null-test', async ({ mongo, mondo }) => {
        // Find non-existent document in both
        const mongoResult = await mongo.findOne({ nonexistent: true })
        const mondoResult = await mondo.findOne({ nonexistent: true })

        // Both should return null
        expect(mongoResult).toBeNull()
        expect(mondoResult).toBeNull()
      })
    })

    it('should find document with nested field match', async () => {
      await runCompatTest(ctx, 'find-nested-test', async ({ mongo, mondo }) => {
        const doc = {
          user: {
            profile: {
              name: 'Nested User',
              level: 5,
            },
          },
        }

        await mongo.insertOne(doc)
        await mondo.insertOne(doc as any)

        // Find using dot notation
        const mongoResult = await mongo.findOne({ 'user.profile.name': 'Nested User' })
        const mondoResult = await mondo.findOne({ 'user.profile.name': 'Nested User' })

        expect(mongoResult).not.toBeNull()
        expect(mondoResult).not.toBeNull()

        const comparison = compareResults(mongoResult, mondoResult, {
          ignoreFields: ['_id'],
        })
        expect(comparison.match).toBe(true)
      })
    })

    it('should respect projection option', async () => {
      await runCompatTest(ctx, 'find-projection-test', async ({ mongo, mondo }) => {
        const doc = {
          name: 'Project Test',
          secret: 'hidden',
          public: 'visible',
        }

        await mongo.insertOne(doc)
        await mondo.insertOne(doc as any)

        // Find with projection excluding secret
        const mongoResult = await mongo.findOne(
          { name: 'Project Test' },
          { projection: { secret: 0 } }
        )
        const mondoResult = await mondo.findOne(
          { name: 'Project Test' },
          { projection: { secret: 0 } }
        )

        expect(mongoResult).not.toBeNull()
        expect(mondoResult).not.toBeNull()

        // Neither should have 'secret' field
        expect(mongoResult?.secret).toBeUndefined()
        expect(mondoResult?.secret).toBeUndefined()

        // Both should have 'public' field
        expect(mongoResult?.public).toBe('visible')
        expect(mondoResult?.public).toBe('visible')
      })
    })

    it('should find with comparison operators', async () => {
      await runCompatTest(ctx, 'find-operators-test', async ({ mongo, mondo }) => {
        // Insert multiple documents
        const docs = [
          { item: 'a', qty: 5 },
          { item: 'b', qty: 10 },
          { item: 'c', qty: 15 },
        ]

        for (const doc of docs) {
          await mongo.insertOne(doc)
          await mondo.insertOne(doc as any)
        }

        // Test $gt operator
        const mongoGt = await mongo.findOne({ qty: { $gt: 8 } })
        const mondoGt = await mondo.findOne({ qty: { $gt: 8 } })

        expect(mongoGt).not.toBeNull()
        expect(mondoGt).not.toBeNull()

        // Both should find item 'b' or 'c' (qty > 8)
        expect(['b', 'c']).toContain(mongoGt?.item)
        expect(['b', 'c']).toContain(mondoGt?.item)
      })
    })

    it('should find with $in operator', async () => {
      await runCompatTest(ctx, 'find-in-test', async ({ mongo, mondo }) => {
        const docs = [
          { color: 'red', size: 'small' },
          { color: 'blue', size: 'medium' },
          { color: 'green', size: 'large' },
        ]

        for (const doc of docs) {
          await mongo.insertOne(doc)
          await mondo.insertOne(doc as any)
        }

        // Find with $in operator
        const mongoResult = await mongo.findOne({ color: { $in: ['red', 'blue'] } })
        const mondoResult = await mondo.findOne({ color: { $in: ['red', 'blue'] } })

        expect(mongoResult).not.toBeNull()
        expect(mondoResult).not.toBeNull()

        // Both should find either red or blue
        expect(['red', 'blue']).toContain(mongoResult?.color)
        expect(['red', 'blue']).toContain(mondoResult?.color)
      })
    })
  })

  describe('insertOne + findOne integration', () => {
    it('should insert and retrieve the same document', async () => {
      await runCompatTest(ctx, 'insert-find-test', async ({ mongo, mondo }) => {
        const doc = {
          title: 'Integration Test',
          count: 100,
          isActive: true,
          data: { nested: 'value' },
          list: [1, 2, 3],
        }

        // Insert
        const mongoInsert = await mongo.insertOne(doc)
        const mondoInsert = await mondo.insertOne(doc as any)

        // Retrieve by the inserted ID
        const mongoFound = await mongo.findOne({ _id: mongoInsert.insertedId })
        const mondoFound = await mondo.findOne({ _id: mondoInsert.insertedId })

        expect(mongoFound).not.toBeNull()
        expect(mondoFound).not.toBeNull()

        // Compare all fields except _id
        const comparison = compareResults(mongoFound, mondoFound, {
          ignoreFields: ['_id'],
        })

        if (!comparison.match) {
          console.log('Differences:', comparison.differences)
        }
        expect(comparison.match).toBe(true)
      })
    })

    it('should preserve data types correctly', async () => {
      await runCompatTest(ctx, 'types-test', async ({ mongo, mondo }) => {
        const doc = {
          string: 'hello',
          number: 42,
          float: 3.14,
          boolean: true,
          nullValue: null,
          array: [1, 'two', true],
          object: { a: 1, b: 'two' },
        }

        await mongo.insertOne(doc)
        await mondo.insertOne(doc as any)

        const mongoFound = await mongo.findOne({ string: 'hello' })
        const mondoFound = await mondo.findOne({ string: 'hello' })

        expect(mongoFound).not.toBeNull()
        expect(mondoFound).not.toBeNull()

        // Check types match
        expect(typeof mongoFound?.string).toBe(typeof mondoFound?.string)
        expect(typeof mongoFound?.number).toBe(typeof mondoFound?.number)
        expect(typeof mongoFound?.float).toBe(typeof mondoFound?.float)
        expect(typeof mongoFound?.boolean).toBe(typeof mondoFound?.boolean)
        expect(mongoFound?.nullValue).toBe(mondoFound?.nullValue)
        expect(Array.isArray(mongoFound?.array)).toBe(Array.isArray(mondoFound?.array))
        expect(typeof mongoFound?.object).toBe(typeof mondoFound?.object)

        // Values should match
        expect(mongoFound?.string).toBe(mondoFound?.string)
        expect(mongoFound?.number).toBe(mondoFound?.number)
        expect(mongoFound?.float).toBe(mondoFound?.float)
        expect(mongoFound?.boolean).toBe(mondoFound?.boolean)
      })
    })
  })
})
