/**
 * Change Streams Tests (TDD - RED phase)
 *
 * MongoDB-compatible change streams for real-time data change notifications.
 * Following the MongoDB change stream specification:
 * https://www.mongodb.com/docs/manual/changeStreams/
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MongoClient } from '../../src/client/MongoClient'
import { MongoDatabase } from '../../src/client/mongo-database'
import { MongoCollection } from '../../src/client/mongo-collection'
import { ChangeStream, ChangeEvent, ResumeToken } from '../../src/client/change-stream'
import { ObjectId } from '../../src/types/objectid'

// ============================================================================
// ChangeStream Class Tests
// ============================================================================

describe('ChangeStream', () => {
  let client: MongoClient
  let db: MongoDatabase
  let collection: MongoCollection<{ _id?: ObjectId; name: string; value?: number }>

  beforeEach(async () => {
    client = new MongoClient('mondodb://localhost:27017')
    await client.connect()
    db = client.db('testdb')
    collection = db.collection('changestream_test')
    await collection.deleteMany({})
  })

  afterEach(async () => {
    await client.close()
  })

  // ==========================================================================
  // Basic ChangeStream Creation
  // ==========================================================================

  describe('watch()', () => {
    it('returns a ChangeStream instance', () => {
      const changeStream = collection.watch()
      expect(changeStream).toBeInstanceOf(ChangeStream)
    })

    it('accepts an empty pipeline', () => {
      const changeStream = collection.watch([])
      expect(changeStream).toBeInstanceOf(ChangeStream)
    })

    it('accepts a $match pipeline stage', () => {
      const changeStream = collection.watch([
        { $match: { 'fullDocument.name': 'test' } }
      ])
      expect(changeStream).toBeInstanceOf(ChangeStream)
    })

    it('accepts options parameter', () => {
      const changeStream = collection.watch([], {
        fullDocument: 'updateLookup',
        resumeAfter: { _data: 'test-token' },
      })
      expect(changeStream).toBeInstanceOf(ChangeStream)
    })
  })

  // ==========================================================================
  // Insert Change Events
  // ==========================================================================

  describe('insert events', () => {
    it('emits insert event when document is inserted', async () => {
      const changeStream = collection.watch()

      // Insert a document
      const insertResult = await collection.insertOne({ name: 'inserted', value: 42 })

      // Get the next change event
      const event = await changeStream.next()

      expect(event).not.toBeNull()
      expect(event!.operationType).toBe('insert')
      expect(event!.fullDocument).toEqual(expect.objectContaining({
        name: 'inserted',
        value: 42,
      }))
      expect(event!.documentKey._id).toEqual(insertResult.insertedId)
      expect(event!.ns).toEqual({
        db: 'testdb',
        coll: 'changestream_test',
      })

      await changeStream.close()
    })

    it('emits insert events for insertMany', async () => {
      const changeStream = collection.watch()

      await collection.insertMany([
        { name: 'first' },
        { name: 'second' },
        { name: 'third' },
      ])

      const events: ChangeEvent[] = []
      for (let i = 0; i < 3; i++) {
        const event = await changeStream.next()
        if (event) events.push(event)
      }

      expect(events.length).toBe(3)
      expect(events.every(e => e.operationType === 'insert')).toBe(true)
      expect(events.map(e => e.fullDocument?.name)).toEqual(['first', 'second', 'third'])

      await changeStream.close()
    })

    it('includes clusterTime in insert event', async () => {
      const changeStream = collection.watch()

      await collection.insertOne({ name: 'timed' })

      const event = await changeStream.next()

      expect(event!.clusterTime).toBeDefined()
      expect(event!.clusterTime).toBeInstanceOf(Date)

      await changeStream.close()
    })
  })

  // ==========================================================================
  // Update Change Events
  // ==========================================================================

  describe('update events', () => {
    it('emits update event when document is updated', async () => {
      // Insert first
      const { insertedId } = await collection.insertOne({ name: 'original', value: 1 })

      const changeStream = collection.watch()

      // Update the document
      await collection.updateOne({ _id: insertedId }, { $set: { value: 100 } })

      const event = await changeStream.next()

      expect(event).not.toBeNull()
      expect(event!.operationType).toBe('update')
      expect(event!.documentKey._id).toEqual(insertedId)
      expect(event!.updateDescription).toBeDefined()
      expect(event!.updateDescription!.updatedFields).toEqual({ value: 100 })

      await changeStream.close()
    })

    it('includes removedFields in updateDescription', async () => {
      const { insertedId } = await collection.insertOne({ name: 'remove-field', value: 1 })

      const changeStream = collection.watch()

      await collection.updateOne({ _id: insertedId }, { $unset: { value: '' } })

      const event = await changeStream.next()

      expect(event!.operationType).toBe('update')
      expect(event!.updateDescription!.removedFields).toContain('value')

      await changeStream.close()
    })

    it('emits update events for updateMany', async () => {
      await collection.insertMany([
        { name: 'batch', value: 1 },
        { name: 'batch', value: 2 },
        { name: 'other', value: 3 },
      ])

      const changeStream = collection.watch()

      await collection.updateMany({ name: 'batch' }, { $inc: { value: 10 } })

      const events: ChangeEvent[] = []
      for (let i = 0; i < 2; i++) {
        const event = await changeStream.next()
        if (event) events.push(event)
      }

      expect(events.length).toBe(2)
      expect(events.every(e => e.operationType === 'update')).toBe(true)

      await changeStream.close()
    })

    it('supports fullDocument option for updates', async () => {
      const { insertedId } = await collection.insertOne({ name: 'full-doc', value: 1 })

      const changeStream = collection.watch([], { fullDocument: 'updateLookup' })

      await collection.updateOne({ _id: insertedId }, { $set: { value: 999 } })

      const event = await changeStream.next()

      expect(event!.operationType).toBe('update')
      expect(event!.fullDocument).toBeDefined()
      expect(event!.fullDocument).toEqual(expect.objectContaining({
        _id: insertedId,
        name: 'full-doc',
        value: 999,
      }))

      await changeStream.close()
    })

    it('fullDocument is null without updateLookup option', async () => {
      const { insertedId } = await collection.insertOne({ name: 'no-lookup', value: 1 })

      const changeStream = collection.watch() // No fullDocument option

      await collection.updateOne({ _id: insertedId }, { $set: { value: 999 } })

      const event = await changeStream.next()

      expect(event!.operationType).toBe('update')
      expect(event!.fullDocument).toBeUndefined()

      await changeStream.close()
    })
  })

  // ==========================================================================
  // Replace Change Events
  // ==========================================================================

  describe('replace events', () => {
    it('emits replace event when document is replaced', async () => {
      const { insertedId } = await collection.insertOne({ name: 'original' })

      const changeStream = collection.watch()

      await collection.replaceOne({ _id: insertedId }, { name: 'replaced', value: 42 })

      const event = await changeStream.next()

      expect(event).not.toBeNull()
      expect(event!.operationType).toBe('replace')
      expect(event!.documentKey._id).toEqual(insertedId)
      expect(event!.fullDocument).toEqual(expect.objectContaining({
        _id: insertedId,
        name: 'replaced',
        value: 42,
      }))

      await changeStream.close()
    })
  })

  // ==========================================================================
  // Delete Change Events
  // ==========================================================================

  describe('delete events', () => {
    it('emits delete event when document is deleted', async () => {
      const { insertedId } = await collection.insertOne({ name: 'to-delete' })

      const changeStream = collection.watch()

      await collection.deleteOne({ _id: insertedId })

      const event = await changeStream.next()

      expect(event).not.toBeNull()
      expect(event!.operationType).toBe('delete')
      expect(event!.documentKey._id).toEqual(insertedId)
      expect(event!.fullDocument).toBeUndefined() // Deleted docs don't have fullDocument

      await changeStream.close()
    })

    it('emits delete events for deleteMany', async () => {
      await collection.insertMany([
        { name: 'delete-me' },
        { name: 'delete-me' },
        { name: 'keep-me' },
      ])

      const changeStream = collection.watch()

      await collection.deleteMany({ name: 'delete-me' })

      const events: ChangeEvent[] = []
      for (let i = 0; i < 2; i++) {
        const event = await changeStream.next()
        if (event) events.push(event)
      }

      expect(events.length).toBe(2)
      expect(events.every(e => e.operationType === 'delete')).toBe(true)

      await changeStream.close()
    })
  })

  // ==========================================================================
  // Resume Tokens
  // ==========================================================================

  describe('resume tokens', () => {
    it('each event has a _id resume token', async () => {
      const changeStream = collection.watch()

      await collection.insertOne({ name: 'token-test' })

      const event = await changeStream.next()

      expect(event!._id).toBeDefined()
      expect(event!._id._data).toBeDefined()
      expect(typeof event!._id._data).toBe('string')

      await changeStream.close()
    })

    it('resume tokens are unique and ordered', async () => {
      const changeStream = collection.watch()

      await collection.insertMany([
        { name: 'first' },
        { name: 'second' },
        { name: 'third' },
      ])

      const tokens: string[] = []
      for (let i = 0; i < 3; i++) {
        const event = await changeStream.next()
        tokens.push(event!._id._data)
      }

      // All tokens should be unique
      expect(new Set(tokens).size).toBe(3)

      // Tokens should be orderable (later tokens are "greater")
      expect(tokens[1] > tokens[0]).toBe(true)
      expect(tokens[2] > tokens[1]).toBe(true)

      await changeStream.close()
    })

    it('supports resumeAfter option', async () => {
      // Open stream first, then insert documents
      const changeStream1 = collection.watch()

      // Insert documents after stream is open
      await collection.insertOne({ name: 'first' })
      await collection.insertOne({ name: 'second' })
      await collection.insertOne({ name: 'third' })

      // Get all events to find tokens
      const events: ChangeEvent[] = []
      for (let i = 0; i < 3; i++) {
        const event = await changeStream1.next()
        if (event) events.push(event)
      }
      await changeStream1.close()

      // Resume after the first event
      const resumeToken = events[0]._id
      const changeStream2 = collection.watch([], { resumeAfter: resumeToken })

      // Should get second and third events
      const event2 = await changeStream2.next()
      const event3 = await changeStream2.next()

      expect(event2!.fullDocument?.name).toBe('second')
      expect(event3!.fullDocument?.name).toBe('third')

      await changeStream2.close()
    })

    it('supports startAfter option', async () => {
      // Open stream first
      const changeStream1 = collection.watch()

      // Insert documents after stream is open
      await collection.insertOne({ name: 'first' })
      await collection.insertOne({ name: 'second' })

      const firstEvent = await changeStream1.next()
      await changeStream1.close()

      const changeStream2 = collection.watch([], { startAfter: firstEvent!._id })

      const nextEvent = await changeStream2.next()
      expect(nextEvent!.fullDocument?.name).toBe('second')

      await changeStream2.close()
    })

    it('getResumeToken returns current resume token', async () => {
      const changeStream = collection.watch()

      expect(changeStream.getResumeToken()).toBeNull() // No events yet

      await collection.insertOne({ name: 'test' })
      await changeStream.next()

      const token = changeStream.getResumeToken()
      expect(token).not.toBeNull()
      expect(token!._data).toBeDefined()

      await changeStream.close()
    })
  })

  // ==========================================================================
  // Pipeline Filtering ($match)
  // ==========================================================================

  describe('$match pipeline filtering', () => {
    it('filters events by operationType', async () => {
      const changeStream = collection.watch([
        { $match: { operationType: 'insert' } }
      ])

      // Insert a doc
      const { insertedId } = await collection.insertOne({ name: 'inserted' })

      // Update the doc (should be filtered out)
      await collection.updateOne({ _id: insertedId }, { $set: { value: 1 } })

      // Insert another doc
      await collection.insertOne({ name: 'inserted2' })

      // Should only get insert events
      const event1 = await changeStream.next()
      const event2 = await changeStream.next()

      expect(event1!.operationType).toBe('insert')
      expect(event1!.fullDocument?.name).toBe('inserted')
      expect(event2!.operationType).toBe('insert')
      expect(event2!.fullDocument?.name).toBe('inserted2')

      await changeStream.close()
    })

    it('filters events by fullDocument fields', async () => {
      const changeStream = collection.watch([
        { $match: { 'fullDocument.name': 'target' } }
      ])

      await collection.insertOne({ name: 'other' })
      await collection.insertOne({ name: 'target' })
      await collection.insertOne({ name: 'another' })

      const event = await changeStream.next()

      expect(event!.fullDocument?.name).toBe('target')

      await changeStream.close()
    })

    it('filters events with complex $match conditions', async () => {
      const changeStream = collection.watch([
        {
          $match: {
            $or: [
              { operationType: 'delete' },
              { 'fullDocument.value': { $gt: 50 } }
            ]
          }
        }
      ])

      await collection.insertOne({ name: 'low', value: 10 })
      await collection.insertOne({ name: 'high', value: 100 })

      const event = await changeStream.next()

      expect(event!.fullDocument?.name).toBe('high')
      expect(event!.fullDocument?.value).toBe(100)

      await changeStream.close()
    })
  })

  // ==========================================================================
  // Async Iteration
  // ==========================================================================

  describe('async iteration', () => {
    it('supports for-await-of iteration', async () => {
      const changeStream = collection.watch()

      // Insert docs in background with proper async handling
      const insertAndClose = async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
        await collection.insertOne({ name: 'async1' })
        await collection.insertOne({ name: 'async2' })
        await new Promise(resolve => setTimeout(resolve, 50))
        await changeStream.close()
      }
      insertAndClose()

      const events: ChangeEvent[] = []
      for await (const event of changeStream) {
        events.push(event)
      }

      expect(events.length).toBe(2)
      expect(events[0].fullDocument?.name).toBe('async1')
      expect(events[1].fullDocument?.name).toBe('async2')
    })

    it('stops iteration when closed', async () => {
      const changeStream = collection.watch()

      await collection.insertOne({ name: 'before-close' })

      // Close after a short delay to allow event processing
      setTimeout(() => changeStream.close(), 50)

      const events: ChangeEvent[] = []
      for await (const event of changeStream) {
        events.push(event)
      }

      expect(events.length).toBe(1)
    })
  })

  // ==========================================================================
  // ChangeStream Methods
  // ==========================================================================

  describe('ChangeStream methods', () => {
    describe('next()', () => {
      it('returns the next change event', async () => {
        const changeStream = collection.watch()

        await collection.insertOne({ name: 'test' })

        const event = await changeStream.next()
        expect(event).not.toBeNull()
        expect(event!.operationType).toBe('insert')

        await changeStream.close()
      })

      it('returns null after stream is closed', async () => {
        const changeStream = collection.watch()

        await changeStream.close()

        const event = await changeStream.next()
        expect(event).toBeNull()
      })
    })

    describe('tryNext()', () => {
      it('returns null if no events available', async () => {
        const changeStream = collection.watch()

        const event = await changeStream.tryNext()
        expect(event).toBeNull()

        await changeStream.close()
      })

      it('returns event if available', async () => {
        const changeStream = collection.watch()

        await collection.insertOne({ name: 'try-next' })

        // Small delay to ensure event is available
        await new Promise(resolve => setTimeout(resolve, 10))

        const event = await changeStream.tryNext()
        expect(event).not.toBeNull()
        expect(event!.fullDocument?.name).toBe('try-next')

        await changeStream.close()
      })
    })

    describe('close()', () => {
      it('closes the change stream', async () => {
        const changeStream = collection.watch()

        expect(changeStream.closed).toBe(false)

        await changeStream.close()

        expect(changeStream.closed).toBe(true)
      })

      it('can be called multiple times safely', async () => {
        const changeStream = collection.watch()

        await changeStream.close()
        await changeStream.close()

        expect(changeStream.closed).toBe(true)
      })
    })

    describe('hasNext()', () => {
      it('returns true when events are available', async () => {
        const changeStream = collection.watch()

        await collection.insertOne({ name: 'has-next' })

        const hasNext = await changeStream.hasNext()
        expect(hasNext).toBe(true)

        await changeStream.close()
      })

      it('returns false when stream is closed', async () => {
        const changeStream = collection.watch()
        await changeStream.close()

        const hasNext = await changeStream.hasNext()
        expect(hasNext).toBe(false)
      })
    })

    describe('stream()', () => {
      it('returns a readable stream', async () => {
        const changeStream = collection.watch()
        const stream = changeStream.stream()

        expect(stream).toBeDefined()
        expect(typeof stream[Symbol.asyncIterator]).toBe('function')

        await changeStream.close()
      })
    })
  })

  // ==========================================================================
  // Event Structure
  // ==========================================================================

  describe('change event structure', () => {
    it('has correct structure for insert event', async () => {
      const changeStream = collection.watch()

      await collection.insertOne({ name: 'structure-test', value: 42 })

      const event = await changeStream.next()

      // Required fields
      expect(event).toHaveProperty('_id')
      expect(event).toHaveProperty('operationType', 'insert')
      expect(event).toHaveProperty('clusterTime')
      expect(event).toHaveProperty('ns')
      expect(event).toHaveProperty('documentKey')
      expect(event).toHaveProperty('fullDocument')

      // Namespace structure
      expect(event!.ns).toHaveProperty('db', 'testdb')
      expect(event!.ns).toHaveProperty('coll', 'changestream_test')

      // Document key structure
      expect(event!.documentKey).toHaveProperty('_id')

      await changeStream.close()
    })

    it('has correct structure for update event', async () => {
      const { insertedId } = await collection.insertOne({ name: 'update-struct' })

      const changeStream = collection.watch()

      await collection.updateOne({ _id: insertedId }, { $set: { value: 1 } })

      const event = await changeStream.next()

      expect(event).toHaveProperty('_id')
      expect(event).toHaveProperty('operationType', 'update')
      expect(event).toHaveProperty('updateDescription')
      expect(event!.updateDescription).toHaveProperty('updatedFields')
      expect(event!.updateDescription).toHaveProperty('removedFields')

      await changeStream.close()
    })
  })
})

// ============================================================================
// ResumeToken Tests
// ============================================================================

describe('ResumeToken', () => {
  describe('generation', () => {
    it('creates unique tokens', () => {
      const token1 = ResumeToken.generate('testdb', 'testcoll', 1)
      const token2 = ResumeToken.generate('testdb', 'testcoll', 2)

      expect(token1._data).not.toBe(token2._data)
    })

    it('includes database and collection info', () => {
      const token = ResumeToken.generate('mydb', 'mycoll', 1)

      // Token should be parseable back to db/coll
      const parsed = ResumeToken.parse(token)
      expect(parsed.database).toBe('mydb')
      expect(parsed.collection).toBe('mycoll')
    })

    it('includes timestamp for ordering', () => {
      const token1 = ResumeToken.generate('db', 'coll', 1)
      const token2 = ResumeToken.generate('db', 'coll', 2)

      expect(token2._data > token1._data).toBe(true)
    })
  })

  describe('parsing', () => {
    it('parses valid token', () => {
      const original = ResumeToken.generate('testdb', 'testcoll', 123)
      const parsed = ResumeToken.parse(original)

      expect(parsed.database).toBe('testdb')
      expect(parsed.collection).toBe('testcoll')
      expect(parsed.sequence).toBe(123)
    })

    it('throws on invalid token', () => {
      expect(() => ResumeToken.parse({ _data: 'invalid' })).toThrow()
    })
  })
})
