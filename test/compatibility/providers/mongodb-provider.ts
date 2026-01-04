/**
 * MongoDB Provider using mongo-memory-server
 * Wraps the official MongoDB driver for compatibility testing
 */

import { MongoClient, Db, Collection, FindCursor, AggregationCursor, ObjectId as MongoObjectId } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import {
  TestProvider,
  TestDatabase,
  TestCollection,
  TestCursor,
  Document,
  Filter,
  UpdateFilter,
  SortSpec,
  ProjectionSpec,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  BulkWriteResult,
  InsertOneOptions,
  InsertManyOptions,
  FindOptions,
  UpdateOptions,
  ReplaceOptions,
  DeleteOptions,
  FindOneAndUpdateOptions,
  FindOneAndDeleteOptions,
  FindOneAndReplaceOptions,
  BulkWriteOptions,
  BulkWriteOperation,
} from './types'
import { ObjectId } from '../../../src/types/objectid'

/**
 * Wraps MongoDB FindCursor/AggregationCursor to match TestCursor interface
 */
class MongoDBCursor<T> implements TestCursor<T> {
  private cursor: FindCursor<T> | AggregationCursor<T>

  constructor(cursor: FindCursor<T> | AggregationCursor<T>) {
    this.cursor = cursor
  }

  async toArray(): Promise<T[]> {
    const results = await this.cursor.toArray()
    return results.map(doc => this.convertObjectIds(doc))
  }

  async next(): Promise<T | null> {
    const doc = await this.cursor.next()
    return doc ? this.convertObjectIds(doc) : null
  }

  async hasNext(): Promise<boolean> {
    return this.cursor.hasNext()
  }

  limit(n: number): TestCursor<T> {
    if ('limit' in this.cursor) {
      this.cursor.limit(n)
    }
    return this
  }

  skip(n: number): TestCursor<T> {
    if ('skip' in this.cursor) {
      this.cursor.skip(n)
    }
    return this
  }

  sort(spec: SortSpec): TestCursor<T> {
    if ('sort' in this.cursor) {
      this.cursor.sort(spec)
    }
    return this
  }

  project(spec: ProjectionSpec): TestCursor<T> {
    if ('project' in this.cursor) {
      this.cursor.project(spec)
    }
    return this
  }

  async close(): Promise<void> {
    await this.cursor.close()
  }

  // Convert MongoDB ObjectIds to our ObjectId type
  private convertObjectIds<D>(doc: D): D {
    if (!doc || typeof doc !== 'object') return doc

    const result: any = Array.isArray(doc) ? [] : {}
    for (const [key, value] of Object.entries(doc)) {
      if (value && typeof value === 'object' && value.constructor?.name === 'ObjectId') {
        result[key] = new ObjectId(value.toString())
      } else if (value && typeof value === 'object') {
        result[key] = this.convertObjectIds(value)
      } else {
        result[key] = value
      }
    }
    return result
  }
}

/**
 * Wraps MongoDB Collection to match TestCollection interface
 */
class MongoDBCollection<T extends Document = Document> implements TestCollection<T> {
  private col: Collection<T>

  constructor(collection: Collection<T>) {
    this.col = collection
  }

  get collectionName(): string {
    return this.col.collectionName
  }

  // Convert our ObjectId to MongoDB ObjectId for queries
  private toMongoFilter(filter: Filter<T>): any {
    if (!filter || typeof filter !== 'object') return filter

    const result: any = Array.isArray(filter) ? [] : {}
    for (const [key, value] of Object.entries(filter)) {
      if (value instanceof ObjectId) {
        result[key] = new MongoObjectId(value.toHexString())
      } else if (value && typeof value === 'object') {
        result[key] = this.toMongoFilter(value as any)
      } else {
        result[key] = value
      }
    }
    return result
  }

  // Convert MongoDB result ObjectIds to our ObjectId
  private convertResult<R>(result: R): R {
    if (!result || typeof result !== 'object') return result

    const converted: any = { ...result as any }
    if (converted.insertedId && converted.insertedId.constructor?.name === 'ObjectId') {
      converted.insertedId = new ObjectId(converted.insertedId.toString())
    }
    if (converted.upsertedId && converted.upsertedId.constructor?.name === 'ObjectId') {
      converted.upsertedId = new ObjectId(converted.upsertedId.toString())
    }
    if (converted.insertedIds) {
      for (const [k, v] of Object.entries(converted.insertedIds)) {
        if (v && (v as any).constructor?.name === 'ObjectId') {
          converted.insertedIds[k] = new ObjectId((v as any).toString())
        }
      }
    }
    if (converted.upsertedIds) {
      for (const [k, v] of Object.entries(converted.upsertedIds)) {
        if (v && (v as any).constructor?.name === 'ObjectId') {
          converted.upsertedIds[k] = new ObjectId((v as any).toString())
        }
      }
    }
    return converted
  }

  // Convert document with MongoDB ObjectId to our ObjectId
  private convertDoc<D>(doc: D | null): D | null {
    if (!doc) return null

    const result: any = { ...doc as any }
    for (const [key, value] of Object.entries(result)) {
      if (value && (value as any).constructor?.name === 'ObjectId') {
        result[key] = new ObjectId((value as any).toString())
      } else if (value && typeof value === 'object') {
        result[key] = this.convertDoc(value)
      }
    }
    return result
  }

  async insertOne(doc: T, options?: InsertOneOptions): Promise<InsertOneResult> {
    const result = await this.col.insertOne(doc as any, options)
    return this.convertResult({
      acknowledged: result.acknowledged,
      insertedId: result.insertedId,
    }) as unknown as InsertOneResult
  }

  async insertMany(docs: T[], options?: InsertManyOptions): Promise<InsertManyResult> {
    const result = await this.col.insertMany(docs as any[], options)
    return this.convertResult({
      acknowledged: result.acknowledged,
      insertedCount: result.insertedCount,
      insertedIds: result.insertedIds,
    }) as unknown as InsertManyResult
  }

  async findOne(filter: Filter<T>, options?: FindOptions): Promise<(T & { _id: ObjectId }) | null> {
    const result = await this.col.findOne(this.toMongoFilter(filter), options as any)
    return this.convertDoc(result) as unknown as (T & { _id: ObjectId }) | null
  }

  find(filter: Filter<T>, options?: FindOptions): TestCursor<T & { _id: ObjectId }> {
    let cursor = this.col.find(this.toMongoFilter(filter))
    if (options?.projection) cursor = cursor.project(options.projection)
    if (options?.sort) cursor = cursor.sort(options.sort)
    if (options?.skip) cursor = cursor.skip(options.skip)
    if (options?.limit) cursor = cursor.limit(options.limit)
    return new MongoDBCursor(cursor) as unknown as TestCursor<T & { _id: ObjectId }>
  }

  async updateOne(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<UpdateResult> {
    const result = await this.col.updateOne(this.toMongoFilter(filter), update as any, options)
    return this.convertResult({
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedId: result.upsertedId,
      upsertedCount: result.upsertedCount,
    }) as unknown as UpdateResult
  }

  async updateMany(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<UpdateResult> {
    const result = await this.col.updateMany(this.toMongoFilter(filter), update as any, options)
    return this.convertResult({
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedId: result.upsertedId,
      upsertedCount: result.upsertedCount,
    }) as unknown as UpdateResult
  }

  async replaceOne(filter: Filter<T>, replacement: T, options?: ReplaceOptions): Promise<UpdateResult> {
    const result = await this.col.replaceOne(this.toMongoFilter(filter), replacement as any, options)
    return this.convertResult({
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedId: result.upsertedId,
      upsertedCount: result.upsertedCount,
    }) as unknown as UpdateResult
  }

  async deleteOne(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult> {
    const result = await this.col.deleteOne(this.toMongoFilter(filter), options)
    return {
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount,
    }
  }

  async deleteMany(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult> {
    const result = await this.col.deleteMany(this.toMongoFilter(filter), options)
    return {
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount,
    }
  }

  async findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options?: FindOneAndUpdateOptions
  ): Promise<(T & { _id: ObjectId }) | null> {
    const mongoOptions: any = {
      projection: options?.projection,
      sort: options?.sort,
      upsert: options?.upsert,
      returnDocument: options?.returnDocument === 'after' ? 'after' : 'before',
    }
    const result = await this.col.findOneAndUpdate(this.toMongoFilter(filter), update as any, mongoOptions)
    return this.convertDoc(result) as unknown as (T & { _id: ObjectId }) | null
  }

  async findOneAndDelete(
    filter: Filter<T>,
    options?: FindOneAndDeleteOptions
  ): Promise<(T & { _id: ObjectId }) | null> {
    const result = await this.col.findOneAndDelete(this.toMongoFilter(filter), options as any)
    return this.convertDoc(result) as unknown as (T & { _id: ObjectId }) | null
  }

  async findOneAndReplace(
    filter: Filter<T>,
    replacement: T,
    options?: FindOneAndReplaceOptions
  ): Promise<(T & { _id: ObjectId }) | null> {
    const mongoOptions: any = {
      projection: options?.projection,
      sort: options?.sort,
      upsert: options?.upsert,
      returnDocument: options?.returnDocument === 'after' ? 'after' : 'before',
    }
    const result = await this.col.findOneAndReplace(this.toMongoFilter(filter), replacement as any, mongoOptions)
    return this.convertDoc(result) as unknown as (T & { _id: ObjectId }) | null
  }

  async countDocuments(filter?: Filter<T>): Promise<number> {
    return this.col.countDocuments(filter ? this.toMongoFilter(filter) : {})
  }

  aggregate<R = Document>(pipeline: Document[]): TestCursor<R> {
    return new MongoDBCursor(this.col.aggregate(pipeline)) as TestCursor<R>
  }

  async bulkWrite(operations: BulkWriteOperation<T>[], options?: BulkWriteOptions): Promise<BulkWriteResult> {
    // Convert operations to MongoDB format
    const mongoOps = operations.map(op => {
      if ('insertOne' in op) {
        return { insertOne: { document: op.insertOne.document } }
      }
      if ('updateOne' in op) {
        return {
          updateOne: {
            filter: this.toMongoFilter(op.updateOne.filter),
            update: op.updateOne.update,
            upsert: op.updateOne.upsert,
          },
        }
      }
      if ('updateMany' in op) {
        return {
          updateMany: {
            filter: this.toMongoFilter(op.updateMany.filter),
            update: op.updateMany.update,
            upsert: op.updateMany.upsert,
          },
        }
      }
      if ('replaceOne' in op) {
        return {
          replaceOne: {
            filter: this.toMongoFilter(op.replaceOne.filter),
            replacement: op.replaceOne.replacement,
            upsert: op.replaceOne.upsert,
          },
        }
      }
      if ('deleteOne' in op) {
        return { deleteOne: { filter: this.toMongoFilter(op.deleteOne.filter) } }
      }
      if ('deleteMany' in op) {
        return { deleteMany: { filter: this.toMongoFilter(op.deleteMany.filter) } }
      }
      return op
    })

    const result = await this.col.bulkWrite(mongoOps as any[], options)
    return this.convertResult({
      acknowledged: result.isOk(),
      insertedCount: result.insertedCount,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      deletedCount: result.deletedCount,
      upsertedCount: result.upsertedCount,
      insertedIds: result.insertedIds,
      upsertedIds: result.upsertedIds,
    }) as unknown as BulkWriteResult
  }

  async drop(): Promise<void> {
    await this.col.drop().catch(() => {}) // Ignore error if collection doesn't exist
  }
}

/**
 * Wraps MongoDB Db to match TestDatabase interface
 */
class MongoDBDatabase implements TestDatabase {
  private db: Db

  constructor(db: Db) {
    this.db = db
  }

  get databaseName(): string {
    return this.db.databaseName
  }

  collection<T = Document>(name: string): TestCollection<T> {
    return new MongoDBCollection(this.db.collection(name)) as unknown as TestCollection<T>
  }

  async dropCollection(name: string): Promise<void> {
    await this.db.dropCollection(name).catch(() => {})
  }
}

/**
 * MongoDB Provider using mongo-memory-server
 */
export class MongoDBProvider implements TestProvider {
  readonly name = 'mongodb' as const
  private server: MongoMemoryServer | null = null
  private client: MongoClient | null = null

  async connect(): Promise<void> {
    this.server = await MongoMemoryServer.create()
    const uri = this.server.getUri()
    this.client = new MongoClient(uri)
    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
    }
    if (this.server) {
      await this.server.stop()
      this.server = null
    }
  }

  database(name: string): TestDatabase {
    if (!this.client) {
      throw new Error('MongoDBProvider not connected')
    }
    return new MongoDBDatabase(this.client.db(name)) as TestDatabase
  }

  async dropDatabase(name: string): Promise<void> {
    if (!this.client) {
      throw new Error('MongoDBProvider not connected')
    }
    await this.client.db(name).dropDatabase()
  }
}
