import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MongoClient, ClientSession } from '../../src/client/MongoClient'
import { MongoDatabase } from '../../src/client/mongo-database'
import { MongoCollection } from '../../src/client/mongo-collection'
import { ObjectId } from '../../src/types/objectid'

/**
 * Transaction Tests for MongoDB-compatible sessions
 *
 * Tests the following MongoDB transaction APIs:
 * - session.startTransaction(options)
 * - session.commitTransaction()
 * - session.abortTransaction()
 * - session.withTransaction(callback, options)
 * - Transaction state tracking
 * - Transaction options (readConcern, writeConcern)
 */

describe('ClientSession', () => {
  let client: MongoClient
  let session: ClientSession

  beforeEach(async () => {
    client = new MongoClient('mongodo://localhost:27017')
    await client.connect()
    session = client.startSession()
  })

  afterEach(async () => {
    if (session) {
      await session.endSession()
    }
    if (client) {
      await client.close()
    }
  })

  describe('session creation', () => {
    it('creates a ClientSession from MongoClient', () => {
      expect(session).toBeInstanceOf(ClientSession)
    })

    it('session has unique id', () => {
      const session2 = client.startSession()
      expect(session.id).toBeDefined()
      expect(session2.id).toBeDefined()
      expect(session.id).not.toEqual(session2.id)
    })

    it('session is not in transaction initially', () => {
      expect(session.inTransaction).toBe(false)
    })

    it('session supports options', () => {
      const sessionWithOptions = client.startSession({
        defaultTransactionOptions: {
          readConcern: { level: 'majority' },
          writeConcern: { w: 'majority' }
        }
      })
      expect(sessionWithOptions).toBeInstanceOf(ClientSession)
    })
  })

  describe('startTransaction()', () => {
    it('starts a transaction', () => {
      session.startTransaction()
      expect(session.inTransaction).toBe(true)
    })

    it('sets transaction state to "starting"', () => {
      session.startTransaction()
      expect(session.transactionState).toBe('starting')
    })

    it('throws error if transaction already started', () => {
      session.startTransaction()
      expect(() => session.startTransaction()).toThrow(/Transaction already in progress/)
    })

    it('accepts transaction options', () => {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 1 }
      })
      expect(session.inTransaction).toBe(true)
    })

    it('stores transaction options', () => {
      const options = {
        readConcern: { level: 'majority' as const },
        writeConcern: { w: 'majority' as const }
      }
      session.startTransaction(options)
      expect(session.transactionOptions).toEqual(options)
    })
  })

  describe('commitTransaction()', () => {
    it('commits the transaction', async () => {
      session.startTransaction()
      await session.commitTransaction()
      expect(session.inTransaction).toBe(false)
    })

    it('sets transaction state to "committed"', async () => {
      session.startTransaction()
      await session.commitTransaction()
      expect(session.transactionState).toBe('committed')
    })

    it('throws error if no transaction in progress', async () => {
      await expect(session.commitTransaction()).rejects.toThrow(/No transaction started/)
    })

    it('throws error if transaction already committed', async () => {
      session.startTransaction()
      await session.commitTransaction()
      await expect(session.commitTransaction()).rejects.toThrow(/No transaction started/)
    })
  })

  describe('abortTransaction()', () => {
    it('aborts the transaction', async () => {
      session.startTransaction()
      await session.abortTransaction()
      expect(session.inTransaction).toBe(false)
    })

    it('sets transaction state to "aborted"', async () => {
      session.startTransaction()
      await session.abortTransaction()
      expect(session.transactionState).toBe('aborted')
    })

    it('throws error if no transaction in progress', async () => {
      await expect(session.abortTransaction()).rejects.toThrow(/No transaction started/)
    })

    it('throws error if transaction already aborted', async () => {
      session.startTransaction()
      await session.abortTransaction()
      await expect(session.abortTransaction()).rejects.toThrow(/No transaction started/)
    })
  })

  describe('withTransaction()', () => {
    it('executes callback within transaction', async () => {
      let executed = false
      await session.withTransaction(async () => {
        executed = true
      })
      expect(executed).toBe(true)
    })

    it('commits transaction on success', async () => {
      await session.withTransaction(async () => {
        // Success
      })
      expect(session.transactionState).toBe('committed')
    })

    it('aborts transaction on error', async () => {
      try {
        await session.withTransaction(async () => {
          throw new Error('Test error')
        })
      } catch {
        // Expected
      }
      expect(session.transactionState).toBe('aborted')
    })

    it('re-throws the error from callback', async () => {
      await expect(
        session.withTransaction(async () => {
          throw new Error('Callback error')
        })
      ).rejects.toThrow('Callback error')
    })

    it('returns the callback result on success', async () => {
      const result = await session.withTransaction(async () => {
        return { success: true, count: 42 }
      })
      expect(result).toEqual({ success: true, count: 42 })
    })

    it('accepts transaction options', async () => {
      await session.withTransaction(
        async () => {},
        {
          readConcern: { level: 'majority' },
          writeConcern: { w: 1 }
        }
      )
      expect(session.transactionState).toBe('committed')
    })

    it('retries on transient transaction error', async () => {
      let attempts = 0
      await session.withTransaction(async () => {
        attempts++
        if (attempts < 3) {
          const error = new Error('Transient error')
          ;(error as any).hasErrorLabel = (label: string) => label === 'TransientTransactionError'
          throw error
        }
      })
      expect(attempts).toBe(3)
    })

    it('respects maxCommitTimeMS option', async () => {
      // This test verifies the option is accepted
      await session.withTransaction(
        async () => {},
        { maxCommitTimeMS: 5000 }
      )
      expect(session.transactionState).toBe('committed')
    })
  })

  describe('endSession()', () => {
    it('ends the session', async () => {
      await session.endSession()
      expect(session.hasEnded).toBe(true)
    })

    it('aborts active transaction before ending', async () => {
      session.startTransaction()
      await session.endSession()
      expect(session.hasEnded).toBe(true)
      expect(session.transactionState).toBe('aborted')
    })

    it('is idempotent', async () => {
      await session.endSession()
      await session.endSession()
      expect(session.hasEnded).toBe(true)
    })
  })

  describe('transaction state', () => {
    it('tracks state transitions correctly', async () => {
      expect(session.transactionState).toBe('none')

      session.startTransaction()
      expect(session.transactionState).toBe('starting')

      await session.commitTransaction()
      expect(session.transactionState).toBe('committed')
    })

    it('transitions from starting to in_progress on first operation', async () => {
      session.startTransaction()
      expect(session.transactionState).toBe('starting')

      // Simulating first operation within transaction
      session._markInProgress()
      expect(session.transactionState).toBe('in_progress')
    })
  })
})

describe('Transactions with CRUD operations', () => {
  let client: MongoClient
  let db: MongoDatabase
  let collection: MongoCollection<{ _id?: ObjectId; name: string; value?: number }>
  let session: ClientSession

  beforeEach(async () => {
    client = new MongoClient('mongodo://localhost:27017')
    await client.connect()
    db = client.db('testdb')
    collection = db.collection('txtest')
    await collection.deleteMany({})
    session = client.startSession()
  })

  afterEach(async () => {
    if (session) {
      await session.endSession()
    }
    if (client) {
      await client.close()
    }
  })

  describe('insert within transaction', () => {
    it('inserts document within transaction', async () => {
      session.startTransaction()
      await collection.insertOne({ name: 'tx-insert' }, { session })
      await session.commitTransaction()

      const doc = await collection.findOne({ name: 'tx-insert' })
      expect(doc).not.toBeNull()
      expect(doc?.name).toBe('tx-insert')
    })

    it('rolls back insert on abort', async () => {
      session.startTransaction()
      await collection.insertOne({ name: 'tx-rollback' }, { session })
      await session.abortTransaction()

      const doc = await collection.findOne({ name: 'tx-rollback' })
      expect(doc).toBeNull()
    })

    it('insertMany within transaction', async () => {
      session.startTransaction()
      await collection.insertMany(
        [{ name: 'tx1' }, { name: 'tx2' }, { name: 'tx3' }],
        { session }
      )
      await session.commitTransaction()

      const docs = await collection.find({ name: { $in: ['tx1', 'tx2', 'tx3'] } }).toArray()
      expect(docs.length).toBe(3)
    })
  })

  describe('update within transaction', () => {
    beforeEach(async () => {
      await collection.insertOne({ name: 'update-target', value: 10 })
    })

    it('updates document within transaction', async () => {
      session.startTransaction()
      await collection.updateOne(
        { name: 'update-target' },
        { $set: { value: 100 } },
        { session }
      )
      await session.commitTransaction()

      const doc = await collection.findOne({ name: 'update-target' })
      expect(doc?.value).toBe(100)
    })

    it('rolls back update on abort', async () => {
      session.startTransaction()
      await collection.updateOne(
        { name: 'update-target' },
        { $set: { value: 999 } },
        { session }
      )
      await session.abortTransaction()

      const doc = await collection.findOne({ name: 'update-target' })
      expect(doc?.value).toBe(10)
    })
  })

  describe('delete within transaction', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'delete1' },
        { name: 'delete2' },
        { name: 'delete3' }
      ])
    })

    it('deletes document within transaction', async () => {
      session.startTransaction()
      await collection.deleteOne({ name: 'delete1' }, { session })
      await session.commitTransaction()

      const doc = await collection.findOne({ name: 'delete1' })
      expect(doc).toBeNull()
    })

    it('rolls back delete on abort', async () => {
      session.startTransaction()
      await collection.deleteOne({ name: 'delete1' }, { session })
      await session.abortTransaction()

      const doc = await collection.findOne({ name: 'delete1' })
      expect(doc).not.toBeNull()
    })

    it('deleteMany within transaction', async () => {
      session.startTransaction()
      await collection.deleteMany(
        { name: { $in: ['delete1', 'delete2'] } },
        { session }
      )
      await session.commitTransaction()

      const remaining = await collection.find({}).toArray()
      expect(remaining.length).toBe(1)
      expect(remaining[0].name).toBe('delete3')
    })
  })

  describe('read within transaction', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'read1', value: 1 },
        { name: 'read2', value: 2 }
      ])
    })

    it('reads committed data within transaction', async () => {
      session.startTransaction()
      const doc = await collection.findOne({ name: 'read1' }, { session })
      await session.commitTransaction()

      expect(doc?.value).toBe(1)
    })

    it('sees uncommitted changes within same transaction', async () => {
      session.startTransaction()
      await collection.updateOne(
        { name: 'read1' },
        { $set: { value: 999 } },
        { session }
      )
      const doc = await collection.findOne({ name: 'read1' }, { session })
      await session.commitTransaction()

      expect(doc?.value).toBe(999)
    })
  })

  describe('multiple operations in transaction', () => {
    it('commits multiple operations atomically', async () => {
      session.startTransaction()
      await collection.insertOne({ name: 'multi1', value: 10 }, { session })
      await collection.insertOne({ name: 'multi2', value: 20 }, { session })
      await collection.updateOne(
        { name: 'multi1' },
        { $set: { value: 100 } },
        { session }
      )
      await session.commitTransaction()

      const doc1 = await collection.findOne({ name: 'multi1' })
      const doc2 = await collection.findOne({ name: 'multi2' })
      expect(doc1?.value).toBe(100)
      expect(doc2?.value).toBe(20)
    })

    it('rolls back all operations on abort', async () => {
      const initialCount = await collection.countDocuments()

      session.startTransaction()
      await collection.insertOne({ name: 'rollback1' }, { session })
      await collection.insertOne({ name: 'rollback2' }, { session })
      await session.abortTransaction()

      const finalCount = await collection.countDocuments()
      expect(finalCount).toBe(initialCount)
    })
  })

  describe('withTransaction with CRUD', () => {
    it('commits CRUD operations on success', async () => {
      await session.withTransaction(async (sess) => {
        await collection.insertOne({ name: 'with-tx', value: 42 }, { session: sess })
        await collection.updateOne(
          { name: 'with-tx' },
          { $inc: { value: 8 } },
          { session: sess }
        )
      })

      const doc = await collection.findOne({ name: 'with-tx' })
      expect(doc?.value).toBe(50)
    })

    it('rolls back CRUD operations on error', async () => {
      const initialCount = await collection.countDocuments()

      try {
        await session.withTransaction(async (sess) => {
          await collection.insertOne({ name: 'error-tx' }, { session: sess })
          throw new Error('Simulated failure')
        })
      } catch {
        // Expected
      }

      const finalCount = await collection.countDocuments()
      expect(finalCount).toBe(initialCount)
    })
  })
})

describe('Transaction Options', () => {
  let client: MongoClient
  let session: ClientSession

  beforeEach(async () => {
    client = new MongoClient('mongodo://localhost:27017')
    await client.connect()
    session = client.startSession()
  })

  afterEach(async () => {
    if (session) {
      await session.endSession()
    }
    if (client) {
      await client.close()
    }
  })

  describe('readConcern', () => {
    it('accepts local readConcern', () => {
      session.startTransaction({ readConcern: { level: 'local' } })
      expect(session.transactionOptions?.readConcern?.level).toBe('local')
    })

    it('accepts majority readConcern', () => {
      session.startTransaction({ readConcern: { level: 'majority' } })
      expect(session.transactionOptions?.readConcern?.level).toBe('majority')
    })

    it('accepts snapshot readConcern', () => {
      session.startTransaction({ readConcern: { level: 'snapshot' } })
      expect(session.transactionOptions?.readConcern?.level).toBe('snapshot')
    })
  })

  describe('writeConcern', () => {
    it('accepts numeric w value', () => {
      session.startTransaction({ writeConcern: { w: 1 } })
      expect(session.transactionOptions?.writeConcern?.w).toBe(1)
    })

    it('accepts majority writeConcern', () => {
      session.startTransaction({ writeConcern: { w: 'majority' } })
      expect(session.transactionOptions?.writeConcern?.w).toBe('majority')
    })

    it('accepts wtimeoutMS', () => {
      session.startTransaction({ writeConcern: { w: 1, wtimeoutMS: 5000 } })
      expect(session.transactionOptions?.writeConcern?.wtimeoutMS).toBe(5000)
    })

    it('accepts journal option', () => {
      session.startTransaction({ writeConcern: { w: 1, journal: true } })
      expect(session.transactionOptions?.writeConcern?.journal).toBe(true)
    })
  })

  describe('maxCommitTimeMS', () => {
    it('accepts maxCommitTimeMS option', () => {
      session.startTransaction({ maxCommitTimeMS: 10000 })
      expect(session.transactionOptions?.maxCommitTimeMS).toBe(10000)
    })
  })

  describe('default transaction options', () => {
    it('uses session default options when not specified', () => {
      const sessionWithDefaults = client.startSession({
        defaultTransactionOptions: {
          readConcern: { level: 'majority' },
          writeConcern: { w: 'majority' }
        }
      })

      sessionWithDefaults.startTransaction()
      expect(sessionWithDefaults.transactionOptions?.readConcern?.level).toBe('majority')
      expect(sessionWithDefaults.transactionOptions?.writeConcern?.w).toBe('majority')
    })

    it('transaction options override session defaults', () => {
      const sessionWithDefaults = client.startSession({
        defaultTransactionOptions: {
          readConcern: { level: 'majority' }
        }
      })

      sessionWithDefaults.startTransaction({
        readConcern: { level: 'local' }
      })
      expect(sessionWithDefaults.transactionOptions?.readConcern?.level).toBe('local')
    })
  })
})

describe('Session ID and tracking', () => {
  let client: MongoClient

  beforeEach(async () => {
    client = new MongoClient('mongodo://localhost:27017')
    await client.connect()
  })

  afterEach(async () => {
    if (client) {
      await client.close()
    }
  })

  it('generates unique session IDs', () => {
    const sessions = Array.from({ length: 10 }, () => client.startSession())
    const ids = sessions.map(s => s.id.toString())
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(10)
  })

  it('session ID is a valid ObjectId-like structure', () => {
    const session = client.startSession()
    expect(session.id).toBeDefined()
    expect(session.id.id).toBeDefined()
  })

  it('transaction number increments', () => {
    const session = client.startSession()

    session.startTransaction()
    const txNum1 = session.transactionNumber
    session.abortTransaction()

    session.startTransaction()
    const txNum2 = session.transactionNumber

    expect(txNum2).toBe(txNum1 + 1)
  })
})
