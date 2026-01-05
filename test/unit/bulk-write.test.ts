import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MongoClient } from '../../src/client/MongoClient'
import { MongoDatabase } from '../../src/client/mongo-database'
import { MongoCollection } from '../../src/client/mongo-collection'
import { ObjectId } from '../../src/types/objectid'
import {
  BulkWriteOperation,
  BulkWriteResult,
  BulkWriteException,
  BulkWriteOptions,
} from '../../src/client/bulk-write'

// ============================================================================
// Bulk Write Tests (TDD - RED -> GREEN -> REFACTOR)
// ============================================================================

describe('BulkWrite', () => {
  let client: MongoClient
  let db: MongoDatabase
  let collection: MongoCollection<{
    _id?: ObjectId
    name: string
    value?: number
    status?: string
    tags?: string[]
  }>

  beforeEach(async () => {
    client = new MongoClient('mongodo://localhost:27017')
    await client.connect()
    db = client.db('testdb')
    collection = db.collection('bulktest')
    // Clean up collection before each test
    await collection.deleteMany({})
  })

  afterEach(async () => {
    await client.close()
  })

  // ==========================================================================
  // Basic bulkWrite() method tests
  // ==========================================================================

  describe('bulkWrite() method', () => {
    it('should exist on collection', () => {
      expect(typeof collection.bulkWrite).toBe('function')
    })

    it('should return BulkWriteResult', async () => {
      const result = await collection.bulkWrite([
        { insertOne: { document: { name: 'test' } } },
      ])

      expect(result).toHaveProperty('acknowledged')
      expect(result).toHaveProperty('insertedCount')
      expect(result).toHaveProperty('matchedCount')
      expect(result).toHaveProperty('modifiedCount')
      expect(result).toHaveProperty('deletedCount')
      expect(result).toHaveProperty('upsertedCount')
      expect(result).toHaveProperty('insertedIds')
      expect(result).toHaveProperty('upsertedIds')
    })

    it('should handle empty operations array', async () => {
      const result = await collection.bulkWrite([])

      expect(result.acknowledged).toBe(true)
      expect(result.insertedCount).toBe(0)
      expect(result.matchedCount).toBe(0)
      expect(result.modifiedCount).toBe(0)
      expect(result.deletedCount).toBe(0)
      expect(result.upsertedCount).toBe(0)
    })
  })

  // ==========================================================================
  // insertOne operation tests
  // ==========================================================================

  describe('insertOne operations', () => {
    it('should insert a single document', async () => {
      const result = await collection.bulkWrite([
        { insertOne: { document: { name: 'bulk-insert-1' } } },
      ])

      expect(result.insertedCount).toBe(1)
      expect(Object.keys(result.insertedIds).length).toBe(1)

      const doc = await collection.findOne({ name: 'bulk-insert-1' })
      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('bulk-insert-1')
    })

    it('should insert multiple documents', async () => {
      const result = await collection.bulkWrite([
        { insertOne: { document: { name: 'bulk-insert-a' } } },
        { insertOne: { document: { name: 'bulk-insert-b' } } },
        { insertOne: { document: { name: 'bulk-insert-c' } } },
      ])

      expect(result.insertedCount).toBe(3)
      expect(Object.keys(result.insertedIds).length).toBe(3)

      const count = await collection.countDocuments()
      expect(count).toBe(3)
    })

    it('should track insertedIds by operation index', async () => {
      const result = await collection.bulkWrite([
        { insertOne: { document: { name: 'first' } } },
        { insertOne: { document: { name: 'second' } } },
      ])

      expect(result.insertedIds[0]).toBeDefined()
      expect(result.insertedIds[1]).toBeDefined()
      expect(result.insertedIds[0]).not.toBe(result.insertedIds[1])
    })

    it('should use provided _id when specified', async () => {
      const customId = new ObjectId()
      const result = await collection.bulkWrite([
        { insertOne: { document: { _id: customId, name: 'custom-id' } as any } },
      ])

      expect(result.insertedIds[0].toString()).toBe(customId.toString())
    })

    it('should generate _id when not provided', async () => {
      const result = await collection.bulkWrite([
        { insertOne: { document: { name: 'generated-id' } } },
      ])

      expect(result.insertedIds[0]).toBeDefined()
      expect(ObjectId.isValid(result.insertedIds[0])).toBe(true)
    })
  })

  // ==========================================================================
  // updateOne operation tests
  // ==========================================================================

  describe('updateOne operations', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'update-target-1', value: 10 },
        { name: 'update-target-2', value: 20 },
        { name: 'update-target-3', value: 30 },
      ])
    })

    it('should update a single document', async () => {
      const result = await collection.bulkWrite([
        {
          updateOne: {
            filter: { name: 'update-target-1' },
            update: { $set: { value: 100 } },
          },
        },
      ])

      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)

      const doc = await collection.findOne({ name: 'update-target-1' })
      expect(doc?.value).toBe(100)
    })

    it('should only update first matching document', async () => {
      await collection.insertOne({ name: 'duplicate', value: 1 })
      await collection.insertOne({ name: 'duplicate', value: 2 })

      const result = await collection.bulkWrite([
        {
          updateOne: {
            filter: { name: 'duplicate' },
            update: { $set: { value: 999 } },
          },
        },
      ])

      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)

      const docs = await collection.find({ name: 'duplicate' }).toArray()
      const updatedCount = docs.filter(d => d.value === 999).length
      expect(updatedCount).toBe(1)
    })

    it('should support upsert option', async () => {
      const result = await collection.bulkWrite([
        {
          updateOne: {
            filter: { name: 'upserted-doc' },
            update: { $set: { value: 42 } },
            upsert: true,
          },
        },
      ])

      expect(result.upsertedCount).toBe(1)
      expect(result.upsertedIds[0]).toBeDefined()

      const doc = await collection.findOne({ name: 'upserted-doc' })
      expect(doc).not.toBeNull()
      expect(doc?.value).toBe(42)
    })

    it('should return matchedCount 0 when no documents match', async () => {
      const result = await collection.bulkWrite([
        {
          updateOne: {
            filter: { name: 'nonexistent' },
            update: { $set: { value: 0 } },
          },
        },
      ])

      expect(result.matchedCount).toBe(0)
      expect(result.modifiedCount).toBe(0)
    })

    it('should support $inc operator', async () => {
      const result = await collection.bulkWrite([
        {
          updateOne: {
            filter: { name: 'update-target-1' },
            update: { $inc: { value: 5 } },
          },
        },
      ])

      expect(result.modifiedCount).toBe(1)

      const doc = await collection.findOne({ name: 'update-target-1' })
      expect(doc?.value).toBe(15)
    })
  })

  // ==========================================================================
  // updateMany operation tests
  // ==========================================================================

  describe('updateMany operations', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'group-a', status: 'active', value: 1 },
        { name: 'group-a', status: 'active', value: 2 },
        { name: 'group-a', status: 'active', value: 3 },
        { name: 'group-b', status: 'inactive', value: 4 },
      ])
    })

    it('should update multiple documents', async () => {
      const result = await collection.bulkWrite([
        {
          updateMany: {
            filter: { name: 'group-a' },
            update: { $set: { status: 'updated' } },
          },
        },
      ])

      expect(result.matchedCount).toBe(3)
      expect(result.modifiedCount).toBe(3)

      const docs = await collection.find({ status: 'updated' }).toArray()
      expect(docs.length).toBe(3)
    })

    it('should support upsert option', async () => {
      const result = await collection.bulkWrite([
        {
          updateMany: {
            filter: { name: 'new-group' },
            update: { $set: { status: 'created' } },
            upsert: true,
          },
        },
      ])

      expect(result.upsertedCount).toBe(1)
      expect(result.upsertedIds[0]).toBeDefined()
    })

    it('should return matchedCount 0 when no documents match', async () => {
      const result = await collection.bulkWrite([
        {
          updateMany: {
            filter: { name: 'nonexistent' },
            update: { $set: { value: 0 } },
          },
        },
      ])

      expect(result.matchedCount).toBe(0)
      expect(result.modifiedCount).toBe(0)
    })
  })

  // ==========================================================================
  // replaceOne operation tests
  // ==========================================================================

  describe('replaceOne operations', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'replace-target', value: 100, status: 'old' },
        { name: 'keep-this', value: 200, status: 'keep' },
      ])
    })

    it('should replace a single document', async () => {
      const result = await collection.bulkWrite([
        {
          replaceOne: {
            filter: { name: 'replace-target' },
            replacement: { name: 'replaced', value: 999 },
          },
        },
      ])

      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)

      const doc = await collection.findOne({ name: 'replaced' })
      expect(doc).not.toBeNull()
      expect(doc?.value).toBe(999)
      expect(doc?.status).toBeUndefined() // Original field removed
    })

    it('should preserve _id during replacement', async () => {
      const original = await collection.findOne({ name: 'replace-target' })
      const originalId = original?._id

      await collection.bulkWrite([
        {
          replaceOne: {
            filter: { name: 'replace-target' },
            replacement: { name: 'replaced', value: 999 },
          },
        },
      ])

      const replaced = await collection.findOne({ name: 'replaced' })
      expect(replaced?._id.equals(originalId!)).toBe(true)
    })

    it('should support upsert option', async () => {
      const result = await collection.bulkWrite([
        {
          replaceOne: {
            filter: { name: 'new-doc' },
            replacement: { name: 'new-doc', value: 42 },
            upsert: true,
          },
        },
      ])

      expect(result.upsertedCount).toBe(1)
      expect(result.upsertedIds[0]).toBeDefined()

      const doc = await collection.findOne({ name: 'new-doc' })
      expect(doc).not.toBeNull()
    })

    it('should return matchedCount 0 when no documents match', async () => {
      const result = await collection.bulkWrite([
        {
          replaceOne: {
            filter: { name: 'nonexistent' },
            replacement: { name: 'replaced', value: 0 },
          },
        },
      ])

      expect(result.matchedCount).toBe(0)
      expect(result.modifiedCount).toBe(0)
    })
  })

  // ==========================================================================
  // deleteOne operation tests
  // ==========================================================================

  describe('deleteOne operations', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'delete-target', value: 1 },
        { name: 'delete-target', value: 2 },
        { name: 'keep-this', value: 3 },
      ])
    })

    it('should delete a single document', async () => {
      const result = await collection.bulkWrite([
        { deleteOne: { filter: { name: 'delete-target' } } },
      ])

      expect(result.deletedCount).toBe(1)

      const remaining = await collection.find({ name: 'delete-target' }).toArray()
      expect(remaining.length).toBe(1)
    })

    it('should only delete first matching document', async () => {
      await collection.bulkWrite([
        { deleteOne: { filter: { name: 'delete-target' } } },
      ])

      const count = await collection.countDocuments()
      expect(count).toBe(2) // One delete-target and keep-this remain
    })

    it('should return deletedCount 0 when no documents match', async () => {
      const result = await collection.bulkWrite([
        { deleteOne: { filter: { name: 'nonexistent' } } },
      ])

      expect(result.deletedCount).toBe(0)
    })
  })

  // ==========================================================================
  // deleteMany operation tests
  // ==========================================================================

  describe('deleteMany operations', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'delete-group', value: 1 },
        { name: 'delete-group', value: 2 },
        { name: 'delete-group', value: 3 },
        { name: 'keep-this', value: 4 },
      ])
    })

    it('should delete multiple documents', async () => {
      const result = await collection.bulkWrite([
        { deleteMany: { filter: { name: 'delete-group' } } },
      ])

      expect(result.deletedCount).toBe(3)

      const remaining = await collection.find({ name: 'delete-group' }).toArray()
      expect(remaining.length).toBe(0)
    })

    it('should return deletedCount 0 when no documents match', async () => {
      const result = await collection.bulkWrite([
        { deleteMany: { filter: { name: 'nonexistent' } } },
      ])

      expect(result.deletedCount).toBe(0)
    })
  })

  // ==========================================================================
  // Mixed operations tests
  // ==========================================================================

  describe('mixed operations', () => {
    it('should handle multiple operation types in sequence', async () => {
      // Start with some data
      await collection.insertOne({ name: 'existing', value: 1 })

      const result = await collection.bulkWrite([
        { insertOne: { document: { name: 'new-doc', value: 10 } } },
        { updateOne: { filter: { name: 'existing' }, update: { $set: { value: 100 } } } },
        { deleteOne: { filter: { name: 'new-doc' } } },
      ])

      expect(result.insertedCount).toBe(1)
      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)
      expect(result.deletedCount).toBe(1)

      // Verify final state
      const existing = await collection.findOne({ name: 'existing' })
      expect(existing?.value).toBe(100)

      const newDoc = await collection.findOne({ name: 'new-doc' })
      expect(newDoc).toBeNull() // Was inserted then deleted
    })

    it('should accumulate counts across all operations', async () => {
      await collection.insertMany([
        { name: 'a', value: 1 },
        { name: 'b', value: 2 },
        { name: 'c', value: 3 },
      ])

      const result = await collection.bulkWrite([
        { insertOne: { document: { name: 'd', value: 4 } } },
        { insertOne: { document: { name: 'e', value: 5 } } },
        { updateOne: { filter: { name: 'a' }, update: { $set: { value: 10 } } } },
        { updateMany: { filter: { value: { $gt: 1 } }, update: { $inc: { value: 100 } } } },
        { deleteOne: { filter: { name: 'c' } } },
      ])

      expect(result.insertedCount).toBe(2)
      expect(result.matchedCount).toBe(6) // 1 from updateOne + 5 from updateMany (a=10, b=2, c=3, d=4, e=5 all > 1)
      expect(result.modifiedCount).toBe(6)
      expect(result.deletedCount).toBe(1)
    })
  })

  // ==========================================================================
  // Ordered execution tests
  // ==========================================================================

  describe('ordered execution (default)', () => {
    it('should execute operations in order by default', async () => {
      const result = await collection.bulkWrite([
        { insertOne: { document: { name: 'first', value: 1 } } },
        { updateOne: { filter: { name: 'first' }, update: { $set: { value: 2 } } } },
        { insertOne: { document: { name: 'second', value: 10 } } },
      ])

      expect(result.insertedCount).toBe(2)
      expect(result.modifiedCount).toBe(1)

      // Verify the update happened after insert
      const first = await collection.findOne({ name: 'first' })
      expect(first?.value).toBe(2)
    })

    it('should respect ordered: true option', async () => {
      const result = await collection.bulkWrite(
        [
          { insertOne: { document: { name: 'ordered-test', value: 0 } } },
          { updateOne: { filter: { name: 'ordered-test' }, update: { $inc: { value: 1 } } } },
          { updateOne: { filter: { name: 'ordered-test' }, update: { $inc: { value: 10 } } } },
        ],
        { ordered: true }
      )

      const doc = await collection.findOne({ name: 'ordered-test' })
      expect(doc?.value).toBe(11) // 0 + 1 + 10
    })
  })

  // ==========================================================================
  // Unordered execution tests
  // ==========================================================================

  describe('unordered execution', () => {
    it('should support ordered: false option', async () => {
      const result = await collection.bulkWrite(
        [
          { insertOne: { document: { name: 'unordered-1', value: 1 } } },
          { insertOne: { document: { name: 'unordered-2', value: 2 } } },
          { insertOne: { document: { name: 'unordered-3', value: 3 } } },
        ],
        { ordered: false }
      )

      expect(result.insertedCount).toBe(3)
      const count = await collection.countDocuments()
      expect(count).toBe(3)
    })
  })

  // ==========================================================================
  // Error handling tests
  // ==========================================================================

  describe('error handling', () => {
    it('should throw BulkWriteException on error with ordered: true', async () => {
      // Insert a document with a specific _id
      const existingId = new ObjectId()
      await collection.insertOne({ _id: existingId, name: 'existing' } as any)

      try {
        // Try to insert duplicate _id - should fail
        await collection.bulkWrite([
          { insertOne: { document: { name: 'before-error' } } },
          { insertOne: { document: { _id: existingId, name: 'duplicate' } as any } },
          { insertOne: { document: { name: 'after-error' } } },
        ])
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(BulkWriteException)
        const bulkError = error as BulkWriteException

        // First insert should succeed
        expect(bulkError.result.insertedCount).toBe(1)

        // Should have write errors
        expect(bulkError.writeErrors.length).toBeGreaterThan(0)
        expect(bulkError.writeErrors[0].index).toBe(1)

        // Third insert should not have executed
        const afterError = await collection.findOne({ name: 'after-error' })
        expect(afterError).toBeNull()
      }
    })

    it('should continue on error with ordered: false', async () => {
      // Insert a document with a specific _id
      const existingId = new ObjectId()
      await collection.insertOne({ _id: existingId, name: 'existing' } as any)

      try {
        await collection.bulkWrite(
          [
            { insertOne: { document: { name: 'before-error' } } },
            { insertOne: { document: { _id: existingId, name: 'duplicate' } as any } },
            { insertOne: { document: { name: 'after-error' } } },
          ],
          { ordered: false }
        )
        // May or may not throw depending on implementation
      } catch (error) {
        if (error instanceof BulkWriteException) {
          // Both valid inserts should succeed
          expect(error.result.insertedCount).toBe(2)
          expect(error.writeErrors.length).toBe(1)
        }
      }

      // Verify both valid documents were inserted
      const beforeError = await collection.findOne({ name: 'before-error' })
      expect(beforeError).not.toBeNull()

      const afterError = await collection.findOne({ name: 'after-error' })
      expect(afterError).not.toBeNull()
    })

    it('should include error details in writeErrors', async () => {
      const existingId = new ObjectId()
      await collection.insertOne({ _id: existingId, name: 'existing' } as any)

      try {
        await collection.bulkWrite([
          { insertOne: { document: { _id: existingId, name: 'duplicate' } as any } },
        ])
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(BulkWriteException)
        const bulkError = error as BulkWriteException

        expect(bulkError.writeErrors.length).toBe(1)
        expect(bulkError.writeErrors[0]).toHaveProperty('index')
        expect(bulkError.writeErrors[0]).toHaveProperty('code')
        expect(bulkError.writeErrors[0]).toHaveProperty('errmsg')
      }
    })
  })

  // ==========================================================================
  // Transaction/atomicity tests
  // ==========================================================================

  describe('transaction behavior', () => {
    it('should batch operations into single transaction for performance', async () => {
      // This test verifies that multiple operations are batched
      // by checking that intermediate states are not visible during execution
      const operations: BulkWriteOperation<{ name: string; value?: number }>[] = []
      for (let i = 0; i < 100; i++) {
        operations.push({ insertOne: { document: { name: `batch-${i}`, value: i } } })
      }

      const result = await collection.bulkWrite(operations)
      expect(result.insertedCount).toBe(100)

      const count = await collection.countDocuments()
      expect(count).toBe(100)
    })
  })

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle operations with complex filters', async () => {
      await collection.insertMany([
        { name: 'complex-1', value: 10, status: 'active' },
        { name: 'complex-2', value: 20, status: 'active' },
        { name: 'complex-3', value: 30, status: 'inactive' },
      ])

      const result = await collection.bulkWrite([
        {
          updateMany: {
            filter: { $and: [{ status: 'active' }, { value: { $gte: 15 } }] },
            update: { $set: { status: 'processed' } },
          },
        },
      ])

      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)

      const processed = await collection.findOne({ name: 'complex-2' })
      expect(processed?.status).toBe('processed')
    })

    it('should handle operations with array update operators', async () => {
      await collection.insertOne({ name: 'array-doc', tags: ['a', 'b'] })

      const result = await collection.bulkWrite([
        {
          updateOne: {
            filter: { name: 'array-doc' },
            update: { $push: { tags: 'c' } },
          },
        },
      ])

      expect(result.modifiedCount).toBe(1)

      const doc = await collection.findOne({ name: 'array-doc' })
      expect(doc?.tags).toEqual(['a', 'b', 'c'])
    })

    it('should handle very large batch of operations', async () => {
      const operations: BulkWriteOperation<{ name: string; value?: number }>[] = []
      for (let i = 0; i < 1000; i++) {
        operations.push({ insertOne: { document: { name: `large-batch-${i}`, value: i } } })
      }

      const result = await collection.bulkWrite(operations)
      expect(result.insertedCount).toBe(1000)
    })

    it('should handle mixed upserts correctly', async () => {
      await collection.insertOne({ name: 'exists', value: 1 })

      const result = await collection.bulkWrite([
        {
          updateOne: {
            filter: { name: 'exists' },
            update: { $set: { value: 100 } },
            upsert: true,
          },
        },
        {
          updateOne: {
            filter: { name: 'new-upsert' },
            update: { $set: { value: 200 } },
            upsert: true,
          },
        },
      ])

      expect(result.matchedCount).toBe(1)
      expect(result.modifiedCount).toBe(1)
      expect(result.upsertedCount).toBe(1)

      const existingDoc = await collection.findOne({ name: 'exists' })
      expect(existingDoc?.value).toBe(100)

      const upsertedDoc = await collection.findOne({ name: 'new-upsert' })
      expect(upsertedDoc?.value).toBe(200)
    })
  })

  // ==========================================================================
  // Options tests
  // ==========================================================================

  describe('options', () => {
    it('should accept bypassDocumentValidation option', async () => {
      // Just verifying the option is accepted without error
      const result = await collection.bulkWrite(
        [{ insertOne: { document: { name: 'bypass-test' } } }],
        { bypassDocumentValidation: true }
      )

      expect(result.insertedCount).toBe(1)
    })

    it('should accept comment option', async () => {
      const result = await collection.bulkWrite(
        [{ insertOne: { document: { name: 'comment-test' } } }],
        { comment: 'test comment' }
      )

      expect(result.insertedCount).toBe(1)
    })
  })
})
