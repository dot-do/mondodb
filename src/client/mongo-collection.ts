/**
 * MongoCollection - MongoDB-compatible collection interface
 *
 * Provides CRUD operations and query support for documents.
 * This is the client-side in-memory implementation for testing.
 */

import { MongoDatabase } from './mongo-database'
import { ObjectId } from '../types/objectid'
import { FindCursor } from './cursor'
import {
  BulkWriteOperation,
  BulkWriteOptions,
  BulkWriteResult,
  BulkWriteError,
  BulkWriteException,
  isInsertOneModel,
  isUpdateOneModel,
  isUpdateManyModel,
  isReplaceOneModel,
  isDeleteOneModel,
  isDeleteManyModel,
} from './bulk-write'
import {
  ChangeStream,
  ChangeStreamPipeline,
  ChangeStreamOptions,
  ChangeEventStore,
} from './change-stream'
import { ClientSession, TransactableCollection } from './session'
import {
  AggregationCursor,
  AggregationCursorOptions,
  AsyncExecutionContext,
  FunctionStage,
} from './aggregation-cursor'
import type { PipelineStage } from '../translator/stages/types'

// Base document type
export type Document = Record<string, unknown>

// Insert result types
export interface InsertOneResult {
  acknowledged: boolean
  insertedId: ObjectId
}

export interface InsertManyResult {
  acknowledged: boolean
  insertedCount: number
  insertedIds: Record<number, ObjectId>
}

// Update result types
export interface UpdateResult {
  acknowledged: boolean
  matchedCount: number
  modifiedCount: number
  upsertedId?: ObjectId
  upsertedCount?: number
}

// Delete result types
export interface DeleteResult {
  acknowledged: boolean
  deletedCount: number
}

// Session option interface (common to all operations)
export interface SessionOption {
  session?: ClientSession
}

// Options types
export interface FindOptions extends SessionOption {
  projection?: Record<string, 0 | 1> | undefined
  sort?: Record<string, 1 | -1> | undefined
  limit?: number | undefined
  skip?: number | undefined
}

export interface InsertOneOptions extends SessionOption {}

export interface InsertManyOptions extends SessionOption {}

export interface UpdateOptions extends SessionOption {
  upsert?: boolean | undefined
  arrayFilters?: object[] | undefined
}

export interface ReplaceOptions extends SessionOption {
  upsert?: boolean | undefined
}

export interface DeleteOptions extends SessionOption {}

export interface FindOneAndUpdateOptions extends SessionOption {
  projection?: Record<string, 0 | 1> | undefined
  sort?: Record<string, 1 | -1> | undefined
  upsert?: boolean | undefined
  returnDocument?: 'before' | 'after' | undefined
}

export interface FindOneAndDeleteOptions extends SessionOption {
  projection?: Record<string, 0 | 1> | undefined
  sort?: Record<string, 1 | -1> | undefined
}

export interface FindOneAndReplaceOptions extends SessionOption {
  projection?: Record<string, 0 | 1> | undefined
  sort?: Record<string, 1 | -1> | undefined
  upsert?: boolean | undefined
  returnDocument?: 'before' | 'after' | undefined
}

/**
 * MongoCollection provides CRUD operations for documents
 */
export class MongoCollection<TSchema extends Document = Document>
  implements TransactableCollection
{
  private readonly database: MongoDatabase
  private readonly _collectionName: string
  private documents: Map<string, TSchema & { _id: ObjectId }> = new Map()
  private readonly _changeEventStore: ChangeEventStore = new ChangeEventStore()
  private readonly _activeChangeStreams: Set<ChangeStream<TSchema>> = new Set()

  constructor(database: MongoDatabase, name: string) {
    this.database = database
    this._collectionName = name
  }

  /**
   * Get the collection name
   */
  get collectionName(): string {
    return this._collectionName
  }

  /**
   * Ensure collection is created in the database
   * @internal
   */
  async _ensureCreated(): Promise<void> {
    this.database._registerCollection(this._collectionName)
  }

  /**
   * Drop collection data
   * @internal
   */
  async _drop(): Promise<void> {
    this.documents.clear()
  }

  /**
   * Get a unique key for this collection (used for transaction tracking)
   * @internal
   */
  _getCollectionKey(): string {
    return `${this.database.databaseName}.${this._collectionName}`
  }

  /**
   * Create a snapshot of the current collection data
   * @internal
   */
  _createSnapshot(): Map<string, Record<string, unknown>> {
    const snapshot = new Map<string, Record<string, unknown>>()
    for (const [key, doc] of this.documents) {
      // Deep clone the document
      snapshot.set(key, JSON.parse(JSON.stringify(doc)))
    }
    return snapshot
  }

  /**
   * Restore collection data from a snapshot (used for transaction rollback)
   * @internal
   */
  _restoreFromSnapshot(snapshot: Map<string, Record<string, unknown>>): void {
    this.documents.clear()
    for (const [key, doc] of snapshot) {
      // Reconstruct ObjectId for _id field
      const restoredDoc = { ...doc } as TSchema & { _id: ObjectId }
      if (doc._id && typeof doc._id === 'object' && '_hexString' in (doc._id as object)) {
        restoredDoc._id = new ObjectId((doc._id as { _hexString: string })._hexString)
      }
      this.documents.set(key, restoredDoc)
    }
  }

  /**
   * Track this collection in a session for transaction support
   * @internal
   */
  private _trackInSession(session?: ClientSession): void {
    if (session && session.inTransaction) {
      session._trackCollection(this)
      session._markInProgress()
    }
  }

  /**
   * Insert a single document
   */
  async insertOne(doc: TSchema, options?: InsertOneOptions): Promise<InsertOneResult> {
    await this._ensureCreated()

    // Track collection in session for transaction rollback support
    this._trackInSession(options?.session)

    // Generate _id if not provided
    const docWithId = { ...doc } as TSchema & { _id: ObjectId }
    if (!docWithId._id) {
      docWithId._id = new ObjectId()
    } else if (typeof docWithId._id === 'string') {
      docWithId._id = new ObjectId(docWithId._id)
    }

    // Check for duplicate _id
    const idHex = docWithId._id.toHexString()
    if (this.documents.has(idHex)) {
      const error = new Error(
        `E11000 duplicate key error collection: ${this._collectionName} dup key: { _id: "${idHex}" }`
      )
      ;(error as any).code = 11000
      throw error
    }

    // Store document
    this.documents.set(idHex, docWithId)

    // Emit insert change event
    this._changeEventStore.addEvent({
      operationType: 'insert',
      documentId: docWithId._id,
      fullDocument: docWithId as unknown as Record<string, unknown>,
    })

    return {
      acknowledged: true,
      insertedId: docWithId._id,
    }
  }

  /**
   * Insert multiple documents
   */
  async insertMany(docs: TSchema[], options?: InsertManyOptions): Promise<InsertManyResult> {
    await this._ensureCreated()

    // Track collection in session for transaction rollback support
    this._trackInSession(options?.session)

    const insertedIds: Record<number, ObjectId> = {}

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i]
      if (doc === undefined) continue
      const result = await this.insertOne(doc, options)
      insertedIds[i] = result.insertedId
    }

    return {
      acknowledged: true,
      insertedCount: docs.length,
      insertedIds,
    }
  }

  /**
   * Find a single document
   */
  async findOne(
    filter: object = {},
    options?: FindOptions
  ): Promise<(TSchema & { _id: ObjectId }) | null> {
    const docs = this._findDocuments(filter)
    if (docs.length === 0) {
      return null
    }

    const doc = docs[0]
    if (doc === undefined) {
      return null
    }
    return options?.projection ? this._applyProjection(doc, options.projection) : doc
  }

  /**
   * Find multiple documents, returns a cursor
   */
  find(filter: object = {}, options?: FindOptions): FindCursor<TSchema & { _id: ObjectId }> {
    // Convert to a clean object to avoid exactOptionalPropertyTypes issues
    const cursorOptions = options ? {
      ...(options.projection !== undefined && { projection: options.projection }),
      ...(options.sort !== undefined && { sort: options.sort }),
      ...(options.limit !== undefined && { limit: options.limit }),
      ...(options.skip !== undefined && { skip: options.skip }),
    } : undefined
    return new FindCursor<TSchema & { _id: ObjectId }>(this as any, filter, cursorOptions)
  }

  /**
   * Internal method to execute find query
   * @internal
   */
  _findDocuments(
    filter: object,
    options?: { sort?: Record<string, 1 | -1>; skip?: number; limit?: number }
  ): (TSchema & { _id: ObjectId })[] {
    let results: (TSchema & { _id: ObjectId })[] = []

    // Get all documents and filter
    for (const doc of this.documents.values()) {
      if (this._matchesFilter(doc, filter)) {
        results.push({ ...doc })
      }
    }

    // Apply sort
    if (options?.sort) {
      results = this._sortDocuments(results, options.sort)
    }

    // Apply skip
    if (options?.skip && options.skip > 0) {
      results = results.slice(options.skip)
    }

    // Apply limit
    if (options?.limit && options.limit > 0) {
      results = results.slice(0, options.limit)
    }

    return results
  }

  /**
   * Update a single document
   */
  async updateOne(
    filter: object,
    update: object,
    options?: UpdateOptions
  ): Promise<UpdateResult> {
    // Track collection in session for transaction rollback support
    this._trackInSession(options?.session)

    const docs = this._findDocuments(filter)

    if (docs.length === 0) {
      // Handle upsert
      if (options?.upsert) {
        const newDoc = this._applyUpdate({} as TSchema, update, filter)
        const result = await this.insertOne(newDoc, options)
        return {
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedId: result.insertedId,
          upsertedCount: 1,
        }
      }

      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
      }
    }

    // Update first matching document
    const doc = docs[0]
    if (doc === undefined) {
      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
      }
    }
    const updatedDoc = this._applyUpdate(doc, update)
    this.documents.set(doc._id.toHexString(), updatedDoc)

    // Emit update change event
    const { updatedFields, removedFields } = this._extractUpdateChanges(update)
    this._changeEventStore.addEvent({
      operationType: 'update',
      documentId: doc._id,
      updatedFields,
      removedFields,
    })

    return {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    }
  }

  /**
   * Update multiple documents
   */
  async updateMany(
    filter: object,
    update: object,
    options?: UpdateOptions
  ): Promise<UpdateResult> {
    // Track collection in session for transaction rollback support
    this._trackInSession(options?.session)

    const docs = this._findDocuments(filter)

    if (docs.length === 0) {
      if (options?.upsert) {
        const newDoc = this._applyUpdate({} as TSchema, update, filter)
        const result = await this.insertOne(newDoc, options)
        return {
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedId: result.insertedId,
          upsertedCount: 1,
        }
      }

      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
      }
    }

    // Update all matching documents
    const { updatedFields, removedFields } = this._extractUpdateChanges(update)
    for (const doc of docs) {
      const updatedDoc = this._applyUpdate(doc, update)
      this.documents.set(doc._id.toHexString(), updatedDoc)

      // Emit update change event for each document
      this._changeEventStore.addEvent({
        operationType: 'update',
        documentId: doc._id,
        updatedFields,
        removedFields,
      })
    }

    return {
      acknowledged: true,
      matchedCount: docs.length,
      modifiedCount: docs.length,
    }
  }

  /**
   * Replace a single document
   */
  async replaceOne(
    filter: object,
    replacement: TSchema,
    options?: ReplaceOptions
  ): Promise<UpdateResult> {
    // Track collection in session for transaction rollback support
    this._trackInSession(options?.session)

    const docs = this._findDocuments(filter)

    if (docs.length === 0) {
      if (options?.upsert) {
        const result = await this.insertOne(replacement, options)
        return {
          acknowledged: true,
          matchedCount: 0,
          modifiedCount: 0,
          upsertedId: result.insertedId,
          upsertedCount: 1,
        }
      }

      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
      }
    }

    // Replace first matching document, preserving _id
    const doc = docs[0]
    if (doc === undefined) {
      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
      }
    }
    const replacedDoc = { ...replacement, _id: doc._id } as TSchema & { _id: ObjectId }
    this.documents.set(doc._id.toHexString(), replacedDoc)

    // Emit replace change event
    this._changeEventStore.addEvent({
      operationType: 'replace',
      documentId: doc._id,
      fullDocument: replacedDoc as unknown as Record<string, unknown>,
    })

    return {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    }
  }

  /**
   * Delete a single document
   */
  async deleteOne(filter: object, options?: DeleteOptions): Promise<DeleteResult> {
    // Track collection in session for transaction rollback support
    this._trackInSession(options?.session)

    const docs = this._findDocuments(filter)

    if (docs.length === 0) {
      return {
        acknowledged: true,
        deletedCount: 0,
      }
    }

    // Delete first matching document
    const firstDoc = docs[0]
    if (firstDoc === undefined) {
      return {
        acknowledged: true,
        deletedCount: 0,
      }
    }
    const docId = firstDoc._id
    this.documents.delete(docId.toHexString())

    // Emit delete change event
    this._changeEventStore.addEvent({
      operationType: 'delete',
      documentId: docId,
    })

    return {
      acknowledged: true,
      deletedCount: 1,
    }
  }

  /**
   * Delete multiple documents
   */
  async deleteMany(filter: object, options?: DeleteOptions): Promise<DeleteResult> {
    // Track collection in session for transaction rollback support
    this._trackInSession(options?.session)

    const docs = this._findDocuments(filter)

    // Delete all matching documents
    for (const doc of docs) {
      this.documents.delete(doc._id.toHexString())

      // Emit delete change event
      this._changeEventStore.addEvent({
        operationType: 'delete',
        documentId: doc._id,
      })
    }

    return {
      acknowledged: true,
      deletedCount: docs.length,
    }
  }

  /**
   * Count documents matching filter
   */
  async countDocuments(filter: object = {}): Promise<number> {
    const docs = this._findDocuments(filter)
    return docs.length
  }

  /**
   * Find one and update
   */
  async findOneAndUpdate(
    filter: object,
    update: object,
    options?: FindOneAndUpdateOptions
  ): Promise<(TSchema & { _id: ObjectId }) | null> {
    const docs = this._findDocuments(filter, {
      ...(options?.sort !== undefined && { sort: options.sort })
    })

    if (docs.length === 0) {
      if (options?.upsert) {
        const newDoc = this._applyUpdate({} as TSchema, update, filter)
        await this.insertOne(newDoc)
        if (options?.returnDocument === 'after') {
          return this.findOne(filter, {
            ...(options?.projection !== undefined && { projection: options.projection })
          })
        }
        return null
      }
      return null
    }

    const doc = docs[0]
    if (doc === undefined) {
      return null
    }
    const originalDoc = { ...doc }

    // Update the document
    const updatedDoc = this._applyUpdate(doc, update)
    this.documents.set(doc._id.toHexString(), updatedDoc)

    // Return before or after based on options
    const result = options?.returnDocument === 'after' ? updatedDoc : originalDoc
    return options?.projection ? this._applyProjection(result, options.projection) : result
  }

  /**
   * Find one and delete
   */
  async findOneAndDelete(
    filter: object,
    options?: FindOneAndDeleteOptions
  ): Promise<(TSchema & { _id: ObjectId }) | null> {
    const docs = this._findDocuments(filter, {
      ...(options?.sort !== undefined && { sort: options.sort })
    })

    if (docs.length === 0) {
      return null
    }

    const doc = docs[0]
    if (doc === undefined) {
      return null
    }
    this.documents.delete(doc._id.toHexString())

    return options?.projection ? this._applyProjection(doc, options.projection) : doc
  }

  /**
   * Find one and replace
   */
  async findOneAndReplace(
    filter: object,
    replacement: TSchema,
    options?: FindOneAndReplaceOptions
  ): Promise<(TSchema & { _id: ObjectId }) | null> {
    const docs = this._findDocuments(filter, {
      ...(options?.sort !== undefined && { sort: options.sort })
    })

    if (docs.length === 0) {
      if (options?.upsert) {
        await this.insertOne(replacement)
        if (options?.returnDocument === 'after') {
          return this.findOne(filter, {
            ...(options?.projection !== undefined && { projection: options.projection })
          })
        }
        return null
      }
      return null
    }

    const doc = docs[0]
    if (doc === undefined) {
      return null
    }
    const originalDoc = { ...doc }

    // Replace the document, preserving _id
    const replacedDoc = { ...replacement, _id: doc._id } as TSchema & { _id: ObjectId }
    this.documents.set(doc._id.toHexString(), replacedDoc)

    // Return before or after based on options
    const result = options?.returnDocument === 'after' ? replacedDoc : originalDoc
    return options?.projection ? this._applyProjection(result, options.projection) : result
  }

  /**
   * Execute multiple write operations in a single batch
   *
   * @param operations - Array of bulk write operations
   * @param options - Bulk write options
   * @returns BulkWriteResult with operation counts
   */
  async bulkWrite(
    operations: BulkWriteOperation<TSchema>[],
    options: BulkWriteOptions = {}
  ): Promise<BulkWriteResult> {
    const ordered = options.ordered !== false // Default to true

    // Initialize result
    const result: BulkWriteResult = {
      acknowledged: true,
      insertedCount: 0,
      matchedCount: 0,
      modifiedCount: 0,
      deletedCount: 0,
      upsertedCount: 0,
      insertedIds: {},
      upsertedIds: {},
    }

    const writeErrors: BulkWriteError[] = []

    // Process operations
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i]
      if (op === undefined) continue

      try {
        if (isInsertOneModel(op)) {
          const insertResult = await this.insertOne(op.insertOne.document)
          result.insertedCount++
          result.insertedIds[i] = insertResult.insertedId
        } else if (isUpdateOneModel(op)) {
          const updateResult = await this.updateOne(
            op.updateOne.filter,
            op.updateOne.update,
            {
              ...(op.updateOne.upsert !== undefined && { upsert: op.updateOne.upsert }),
              ...(op.updateOne.arrayFilters !== undefined && { arrayFilters: op.updateOne.arrayFilters })
            }
          )
          result.matchedCount += updateResult.matchedCount
          result.modifiedCount += updateResult.modifiedCount
          if (updateResult.upsertedId) {
            result.upsertedCount++
            result.upsertedIds[i] = updateResult.upsertedId
          }
        } else if (isUpdateManyModel(op)) {
          const updateResult = await this.updateMany(
            op.updateMany.filter,
            op.updateMany.update,
            {
              ...(op.updateMany.upsert !== undefined && { upsert: op.updateMany.upsert }),
              ...(op.updateMany.arrayFilters !== undefined && { arrayFilters: op.updateMany.arrayFilters })
            }
          )
          result.matchedCount += updateResult.matchedCount
          result.modifiedCount += updateResult.modifiedCount
          if (updateResult.upsertedId) {
            result.upsertedCount++
            result.upsertedIds[i] = updateResult.upsertedId
          }
        } else if (isReplaceOneModel(op)) {
          const replaceResult = await this.replaceOne(
            op.replaceOne.filter,
            op.replaceOne.replacement,
            {
              ...(op.replaceOne.upsert !== undefined && { upsert: op.replaceOne.upsert })
            }
          )
          result.matchedCount += replaceResult.matchedCount
          result.modifiedCount += replaceResult.modifiedCount
          if (replaceResult.upsertedId) {
            result.upsertedCount++
            result.upsertedIds[i] = replaceResult.upsertedId
          }
        } else if (isDeleteOneModel(op)) {
          const deleteResult = await this.deleteOne(op.deleteOne.filter)
          result.deletedCount += deleteResult.deletedCount
        } else if (isDeleteManyModel(op)) {
          const deleteResult = await this.deleteMany(op.deleteMany.filter)
          result.deletedCount += deleteResult.deletedCount
        }
      } catch (error) {
        const bulkError: BulkWriteError = {
          index: i,
          code: 11000, // Default to duplicate key error code
          errmsg: error instanceof Error ? error.message : String(error),
          op,
        }
        writeErrors.push(bulkError)

        // For ordered operations, stop on first error
        if (ordered) {
          throw new BulkWriteException(
            `BulkWrite operation failed: ${bulkError.errmsg}`,
            result,
            writeErrors
          )
        }
        // For unordered, continue processing remaining operations
      }
    }

    // If there were errors in unordered mode, throw exception with partial results
    if (writeErrors.length > 0) {
      throw new BulkWriteException(
        `BulkWrite operation completed with ${writeErrors.length} error(s)`,
        result,
        writeErrors
      )
    }

    return result
  }

  /**
   * Drop the collection
   */
  async drop(): Promise<boolean> {
    this.documents.clear()
    return true
  }

  /**
   * Watch for changes on this collection
   *
   * Creates a change stream that emits events for insert, update, replace, and delete operations.
   *
   * @param pipeline - Optional aggregation pipeline for filtering events (supports $match)
   * @param options - Change stream options
   * @returns A ChangeStream instance
   *
   * @example
   * ```typescript
   * const changeStream = collection.watch([
   *   { $match: { operationType: 'insert' } }
   * ])
   *
   * for await (const event of changeStream) {
   *   console.log('Change:', event.operationType, event.fullDocument)
   * }
   * ```
   */
  watch(
    pipeline: ChangeStreamPipeline = [],
    options: ChangeStreamOptions = {}
  ): ChangeStream<TSchema> {
    const changeStream = new ChangeStream<TSchema>(
      this.database.databaseName,
      this._collectionName,
      pipeline,
      options,
      {
        getDocumentById: async (id: ObjectId) => {
          const doc = this.documents.get(id.toHexString())
          return doc || null
        },
        getChangeEvents: async (afterSequence: number) => {
          return this._changeEventStore.getEventsAfter(afterSequence)
        },
        getCurrentSequence: () => {
          return this._changeEventStore.getCurrentSequence()
        },
        onClose: () => {
          this._activeChangeStreams.delete(changeStream)
        },
      }
    )

    this._activeChangeStreams.add(changeStream)
    return changeStream
  }

  /**
   * Check if a document matches a filter
   * @internal
   */
  private _matchesFilter(doc: Record<string, unknown>, filter: object): boolean {
    const filterObj = filter as Record<string, unknown>

    for (const [key, value] of Object.entries(filterObj)) {
      // Handle logical operators
      if (key === '$and') {
        const conditions = value as object[]
        if (!conditions.every(cond => this._matchesFilter(doc, cond))) {
          return false
        }
        continue
      }

      if (key === '$or') {
        const conditions = value as object[]
        if (!conditions.some(cond => this._matchesFilter(doc, cond))) {
          return false
        }
        continue
      }

      if (key === '$nor') {
        const conditions = value as object[]
        if (conditions.some(cond => this._matchesFilter(doc, cond))) {
          return false
        }
        continue
      }

      // Get document value for comparison
      const docValue = this._getNestedValue(doc, key)

      // Handle operator objects
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof ObjectId)) {
        if (!this._matchesOperators(docValue, value as Record<string, unknown>)) {
          return false
        }
        continue
      }

      // Direct comparison
      if (!this._valuesEqual(docValue, value)) {
        return false
      }
    }

    return true
  }

  /**
   * Check if a value matches operator conditions
   */
  private _matchesOperators(docValue: unknown, operators: Record<string, unknown>): boolean {
    for (const [op, opValue] of Object.entries(operators)) {
      switch (op) {
        case '$eq':
          if (!this._valuesEqual(docValue, opValue)) return false
          break
        case '$ne':
          if (this._valuesEqual(docValue, opValue)) return false
          break
        case '$gt':
          if (typeof docValue !== 'number' || docValue <= (opValue as number)) return false
          break
        case '$gte':
          if (typeof docValue !== 'number' || docValue < (opValue as number)) return false
          break
        case '$lt':
          if (typeof docValue !== 'number' || docValue >= (opValue as number)) return false
          break
        case '$lte':
          if (typeof docValue !== 'number' || docValue > (opValue as number)) return false
          break
        case '$in':
          const inArray = opValue as unknown[]
          if (!inArray.some(v => this._valuesEqual(docValue, v))) return false
          break
        case '$nin':
          const ninArray = opValue as unknown[]
          if (ninArray.some(v => this._valuesEqual(docValue, v))) return false
          break
        case '$exists':
          const exists = docValue !== undefined
          if (opValue !== exists) return false
          break
        case '$not':
          if (this._matchesOperators(docValue, opValue as Record<string, unknown>)) return false
          break
        case '$regex':
          const regex = new RegExp(opValue as string)
          if (typeof docValue !== 'string' || !regex.test(docValue)) return false
          break
        case '$type':
          if (typeof docValue !== opValue) return false
          break
        case '$elemMatch':
          if (!Array.isArray(docValue)) return false
          if (!docValue.some(elem => this._matchesFilter(elem as Record<string, unknown>, opValue as object))) return false
          break
        case '$size':
          if (!Array.isArray(docValue) || docValue.length !== opValue) return false
          break
        case '$all':
          if (!Array.isArray(docValue)) return false
          const allValues = opValue as unknown[]
          if (!allValues.every(v => docValue.some(dv => this._valuesEqual(dv, v)))) return false
          break
      }
    }
    return true
  }

  /**
   * Compare two values for equality
   */
  private _valuesEqual(a: unknown, b: unknown): boolean {
    if (a instanceof ObjectId && b instanceof ObjectId) {
      return a.equals(b)
    }
    if (a instanceof ObjectId && typeof b === 'string') {
      return a.equals(b)
    }
    if (typeof a === 'string' && b instanceof ObjectId) {
      return b.equals(a)
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((val, idx) => this._valuesEqual(val, b[idx]))
    }
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a as object)
      const keysB = Object.keys(b as object)
      if (keysA.length !== keysB.length) return false
      return keysA.every(key =>
        this._valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
      )
    }
    return a === b
  }

  /**
   * Get nested value from document using dot notation
   */
  private _getNestedValue(doc: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.')
    let current: unknown = doc

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      current = (current as Record<string, unknown>)[part]
    }

    return current
  }

  /**
   * Apply update operators to a document
   */
  private _applyUpdate(
    doc: TSchema & { _id?: ObjectId },
    update: object,
    filter?: object
  ): TSchema & { _id: ObjectId } {
    const updateObj = update as Record<string, unknown>
    const result = { ...doc } as TSchema & { _id: ObjectId }

    // Preserve or generate _id
    if (!result._id) {
      result._id = new ObjectId()
    }

    // Apply filter fields for upsert
    if (filter) {
      const filterObj = filter as Record<string, unknown>
      for (const [key, value] of Object.entries(filterObj)) {
        if (!key.startsWith('$') && typeof value !== 'object') {
          (result as Record<string, unknown>)[key] = value
        }
      }
    }

    // Apply update operators
    for (const [op, fields] of Object.entries(updateObj)) {
      switch (op) {
        case '$set':
          for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
            this._setNestedValue(result, key, value)
          }
          break

        case '$unset':
          for (const key of Object.keys(fields as Record<string, unknown>)) {
            this._deleteNestedValue(result, key)
          }
          break

        case '$inc':
          for (const [key, value] of Object.entries(fields as Record<string, number>)) {
            const current = this._getNestedValue(result, key)
            const newValue = (typeof current === 'number' ? current : 0) + value
            this._setNestedValue(result, key, newValue)
          }
          break

        case '$mul':
          for (const [key, value] of Object.entries(fields as Record<string, number>)) {
            const current = this._getNestedValue(result, key)
            const newValue = (typeof current === 'number' ? current : 0) * value
            this._setNestedValue(result, key, newValue)
          }
          break

        case '$min':
          for (const [key, value] of Object.entries(fields as Record<string, number>)) {
            const current = this._getNestedValue(result, key)
            if (current === undefined || (value as number) < (current as number)) {
              this._setNestedValue(result, key, value)
            }
          }
          break

        case '$max':
          for (const [key, value] of Object.entries(fields as Record<string, number>)) {
            const current = this._getNestedValue(result, key)
            if (current === undefined || (value as number) > (current as number)) {
              this._setNestedValue(result, key, value)
            }
          }
          break

        case '$rename':
          for (const [oldKey, newKey] of Object.entries(fields as Record<string, string>)) {
            const value = this._getNestedValue(result, oldKey)
            this._deleteNestedValue(result, oldKey)
            this._setNestedValue(result, newKey, value)
          }
          break

        case '$push':
          for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
            const current = this._getNestedValue(result, key)
            const array = Array.isArray(current) ? [...current] : []

            if (typeof value === 'object' && value !== null && '$each' in (value as object)) {
              const eachValue = value as { $each: unknown[] }
              array.push(...eachValue.$each)
            } else {
              array.push(value)
            }

            this._setNestedValue(result, key, array)
          }
          break

        case '$pull':
          for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
            const current = this._getNestedValue(result, key)
            if (Array.isArray(current)) {
              const newArray = current.filter(item => !this._valuesEqual(item, value))
              this._setNestedValue(result, key, newArray)
            }
          }
          break

        case '$pop':
          for (const [key, value] of Object.entries(fields as Record<string, number>)) {
            const current = this._getNestedValue(result, key)
            if (Array.isArray(current)) {
              const newArray = [...current]
              if (value === 1) {
                newArray.pop()
              } else if (value === -1) {
                newArray.shift()
              }
              this._setNestedValue(result, key, newArray)
            }
          }
          break

        case '$addToSet':
          for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
            const current = this._getNestedValue(result, key)
            const array = Array.isArray(current) ? [...current] : []

            if (typeof value === 'object' && value !== null && '$each' in (value as object)) {
              const eachValue = value as { $each: unknown[] }
              for (const item of eachValue.$each) {
                if (!array.some(existing => this._valuesEqual(existing, item))) {
                  array.push(item)
                }
              }
            } else if (!array.some(existing => this._valuesEqual(existing, value))) {
              array.push(value)
            }

            this._setNestedValue(result, key, array)
          }
          break

        case '$currentDate':
          for (const [key, value] of Object.entries(fields as Record<string, boolean | { $type: string }>)) {
            if (value === true || (typeof value === 'object' && value.$type === 'date')) {
              this._setNestedValue(result, key, new Date())
            } else if (typeof value === 'object' && value.$type === 'timestamp') {
              this._setNestedValue(result, key, Date.now())
            }
          }
          break
      }
    }

    return result
  }

  /**
   * Set a nested value in an object
   */
  private _setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.')
    let current = obj

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (part === undefined) continue
      if (current[part] === undefined || current[part] === null) {
        current[part] = {}
      }
      current = current[part] as Record<string, unknown>
    }

    const lastPart = parts[parts.length - 1]
    if (lastPart !== undefined) {
      current[lastPart] = value
    }
  }

  /**
   * Delete a nested value from an object
   */
  private _deleteNestedValue(obj: Record<string, unknown>, path: string): void {
    const parts = path.split('.')
    let current = obj

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (part === undefined) continue
      if (current[part] === undefined || current[part] === null) {
        return
      }
      current = current[part] as Record<string, unknown>
    }

    const lastPart = parts[parts.length - 1]
    if (lastPart !== undefined) {
      delete current[lastPart]
    }
  }

  /**
   * Sort documents by the given sort specification
   */
  private _sortDocuments(
    docs: (TSchema & { _id: ObjectId })[],
    sort: Record<string, 1 | -1>
  ): (TSchema & { _id: ObjectId })[] {
    return [...docs].sort((a, b) => {
      for (const [key, direction] of Object.entries(sort)) {
        const aValue = this._getNestedValue(a, key)
        const bValue = this._getNestedValue(b, key)

        let comparison = 0
        if (aValue === bValue) {
          comparison = 0
        } else if (aValue === null || aValue === undefined) {
          comparison = -1
        } else if (bValue === null || bValue === undefined) {
          comparison = 1
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue)
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue
        } else {
          comparison = String(aValue).localeCompare(String(bValue))
        }

        if (comparison !== 0) {
          return comparison * direction
        }
      }
      return 0
    })
  }

  /**
   * Apply projection to a document
   * @internal
   */
  _applyProjection(
    doc: TSchema & { _id: ObjectId },
    projection: Record<string, 0 | 1>
  ): TSchema & { _id: ObjectId } {
    const hasInclusions = Object.values(projection).some(v => v === 1)
    const hasExclusions = Object.values(projection).some(v => v === 0)

    // Cannot mix inclusions and exclusions (except for _id)
    if (hasInclusions) {
      const result: Record<string, unknown> = {}

      // Always include _id unless explicitly excluded
      if (projection._id !== 0) {
        result._id = doc._id
      }

      for (const [key, value] of Object.entries(projection)) {
        if (value === 1 && key !== '_id') {
          result[key] = this._getNestedValue(doc, key)
        }
      }

      return result as TSchema & { _id: ObjectId }
    } else if (hasExclusions) {
      const result = { ...doc }

      for (const [key, value] of Object.entries(projection)) {
        if (value === 0) {
          delete (result as Record<string, unknown>)[key]
        }
      }

      return result
    }

    return doc
  }

  /**
   * Extract updated and removed fields from an update object
   * @internal
   */
  private _extractUpdateChanges(update: object): {
    updatedFields: Record<string, unknown>
    removedFields: string[]
  } {
    const updateObj = update as Record<string, unknown>
    const updatedFields: Record<string, unknown> = {}
    const removedFields: string[] = []

    // Extract fields from $set
    if (updateObj.$set) {
      Object.assign(updatedFields, updateObj.$set)
    }

    // Extract fields from $unset
    if (updateObj.$unset) {
      removedFields.push(...Object.keys(updateObj.$unset as Record<string, unknown>))
    }

    // Extract fields from $inc, $mul, $min, $max (these set values)
    for (const op of ['$inc', '$mul', '$min', '$max']) {
      if (updateObj[op]) {
        for (const key of Object.keys(updateObj[op] as Record<string, unknown>)) {
          updatedFields[key] = (updateObj[op] as Record<string, unknown>)[key]
        }
      }
    }

    // Handle $push (updated fields)
    if (updateObj.$push) {
      for (const key of Object.keys(updateObj.$push as Record<string, unknown>)) {
        updatedFields[key] = (updateObj.$push as Record<string, unknown>)[key]
      }
    }

    // Handle $pull (updated fields)
    if (updateObj.$pull) {
      for (const key of Object.keys(updateObj.$pull as Record<string, unknown>)) {
        updatedFields[key] = (updateObj.$pull as Record<string, unknown>)[key]
      }
    }

    // Handle $addToSet (updated fields)
    if (updateObj.$addToSet) {
      for (const key of Object.keys(updateObj.$addToSet as Record<string, unknown>)) {
        updatedFields[key] = (updateObj.$addToSet as Record<string, unknown>)[key]
      }
    }

    return { updatedFields, removedFields }
  }

  /**
   * Execute an aggregation pipeline on the collection
   *
   * Returns an AggregationCursor that supports:
   * - Async iteration with `for await (const doc of cursor)`
   * - Converting to array with `await cursor.toArray()`
   * - forEach iteration with `await cursor.forEach(callback)`
   *
   * Supports async stages like $function and $lookup with pipeline.
   *
   * @param pipeline - Array of aggregation pipeline stages
   * @param options - Aggregation options
   * @returns AggregationCursor for iterating over results
   *
   * @example
   * ```typescript
   * // Using toArray
   * const results = await collection.aggregate([
   *   { $match: { status: 'active' } },
   *   { $group: { _id: '$category', count: { $sum: 1 } } }
   * ]).toArray()
   *
   * // Using async iterator
   * for await (const doc of collection.aggregate([
   *   { $match: { status: 'active' } }
   * ])) {
   *   console.log(doc)
   * }
   * ```
   */
  aggregate<TResult extends Document = TSchema>(
    pipeline: PipelineStage[],
    options: AggregationCursorOptions = {}
  ): AggregationCursor<TResult> {
    // Create execution context for async stages
    const context: AsyncExecutionContext = {
      collectionName: this._collectionName,
      lookupCollection: async (name: string) => {
        // Get documents from another collection for $lookup
        const targetCollection = this.database.collection(name)
        return targetCollection._findDocuments({}) as unknown as Document[]
      },
      functionExecutor: async (fn: FunctionStage, doc: Document) => {
        // Execute $function stage
        return this._executeFunctionStage(fn, doc)
      }
    }

    // Create fetch function that executes the pipeline
    const fetchFn = async (): Promise<TResult[]> => {
      // Get all documents from collection
      const allDocs = this._findDocuments({})

      // Execute pipeline stages
      return this._executeAggregationPipeline<TResult>(allDocs, pipeline)
    }

    return new AggregationCursor<TResult>(
      pipeline,
      fetchFn,
      options,
      undefined, // No custom async executor - we handle in fetch
      context
    )
  }

  /**
   * Execute $function stage on a document
   * @internal
   */
  private async _executeFunctionStage(
    fn: FunctionStage,
    doc: Document
  ): Promise<unknown> {
    let func: (...args: unknown[]) => unknown | Promise<unknown>

    if (typeof fn.body === 'string') {
      // String function bodies require secure worker-loader execution
      throw new Error(
        '$function requires worker_loaders binding. ' +
        'Add to wrangler.jsonc: "worker_loaders": [{ "binding": "LOADER" }]'
      )
    } else {
      func = fn.body
    }

    // Resolve args - replace field references with actual values
    const resolvedArgs = fn.args.map(arg => {
      if (typeof arg === 'string' && arg.startsWith('$')) {
        return this._getNestedValue(doc, arg.slice(1))
      }
      return arg
    })

    // Execute function
    return func(...resolvedArgs)
  }

  /**
   * Execute aggregation pipeline on documents (in-memory implementation)
   * @internal
   */
  private _executeAggregationPipeline<TResult extends Document = Document>(
    documents: (TSchema & { _id: ObjectId })[],
    pipeline: PipelineStage[]
  ): TResult[] {
    let results: Document[] = documents.map(doc => ({ ...doc }))

    for (const stage of pipeline) {
      const stageType = Object.keys(stage)[0]
      if (stageType === undefined) continue
      const stageValue = (stage as Record<string, unknown>)[stageType]

      switch (stageType) {
        case '$match':
          results = results.filter(doc =>
            this._matchesFilter(doc as TSchema & { _id: ObjectId }, stageValue as object)
          )
          break

        case '$project':
          results = this._executeProjectStage(results, stageValue as Record<string, unknown>)
          break

        case '$group':
          results = this._executeGroupStage(results, stageValue as Record<string, unknown>)
          break

        case '$sort':
          results = this._executeSortStage(results, stageValue as Record<string, 1 | -1>)
          break

        case '$limit':
          results = results.slice(0, stageValue as number)
          break

        case '$skip':
          results = results.slice(stageValue as number)
          break

        case '$count':
          results = [{ [stageValue as string]: results.length }]
          break

        case '$unwind':
          results = this._executeUnwindStage(results, stageValue as string | { path: string; preserveNullAndEmptyArrays?: boolean })
          break

        case '$addFields':
        case '$set':
          results = this._executeAddFieldsStage(results, stageValue as Record<string, unknown>)
          break

        case '$lookup':
          results = this._executeLookupStage(results, stageValue as {
            from: string
            localField?: string
            foreignField?: string
            as: string
          })
          break

        default:
          // Unsupported stage - pass through
          break
      }
    }

    return results as TResult[]
  }

  /**
   * Execute $project stage
   * @internal
   */
  private _executeProjectStage(
    documents: Document[],
    projection: Record<string, unknown>
  ): Document[] {
    // Check if we have inclusions or expressions (expressions count as inclusions)
    const hasInclusion = Object.entries(projection).some(([key, v]) => {
      if (key === '_id') return false // _id: 0 doesn't count
      return v === 1 ||
             (typeof v === 'string' && v.startsWith('$')) ||
             (typeof v === 'object' && v !== null)
    })
    const excludeId = projection._id === 0

    return documents.map(doc => {
      const result: Document = {}

      if (hasInclusion) {
        // Inclusion mode
        if (!excludeId && '_id' in doc) {
          result._id = doc._id
        }

        for (const [key, value] of Object.entries(projection)) {
          if (key === '_id' && value === 0) continue
          if (key === '_id' && value === 1) {
            result._id = doc._id
            continue
          }

          if (value === 1) {
            result[key] = this._getNestedValue(doc, key)
          } else if (typeof value === 'string' && value.startsWith('$')) {
            result[key] = this._getNestedValue(doc, value.slice(1))
          } else if (typeof value === 'object' && value !== null) {
            result[key] = this._evaluateExpression(doc, value)
          }
        }
      } else {
        // Exclusion mode
        for (const [key, val] of Object.entries(doc)) {
          if (projection[key] === 0) continue
          result[key] = val
        }
      }

      return result
    })
  }

  /**
   * Execute $group stage
   * @internal
   */
  private _executeGroupStage(
    documents: Document[],
    groupSpec: Record<string, unknown>
  ): Document[] {
    const groups = new Map<string, { docs: Document[]; result: Document }>()

    for (const doc of documents) {
      // Compute group key
      let groupKey: string
      const idSpec = groupSpec._id

      if (idSpec === null) {
        groupKey = '__all__'
      } else if (typeof idSpec === 'string' && idSpec.startsWith('$')) {
        groupKey = String(this._getNestedValue(doc, idSpec.slice(1)))
      } else if (typeof idSpec === 'object' && idSpec !== null) {
        const keyObj: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(idSpec as Record<string, unknown>)) {
          if (typeof v === 'string' && v.startsWith('$')) {
            keyObj[k] = this._getNestedValue(doc, v.slice(1))
          } else {
            keyObj[k] = v
          }
        }
        groupKey = JSON.stringify(keyObj)
      } else {
        groupKey = String(idSpec)
      }

      if (!groups.has(groupKey)) {
        // Initialize group
        let idValue: unknown
        if (idSpec === null) {
          idValue = null
        } else if (typeof idSpec === 'string' && idSpec.startsWith('$')) {
          idValue = this._getNestedValue(doc, idSpec.slice(1))
        } else if (typeof idSpec === 'object' && idSpec !== null) {
          idValue = {}
          for (const [k, v] of Object.entries(idSpec as Record<string, unknown>)) {
            if (typeof v === 'string' && v.startsWith('$')) {
              (idValue as Record<string, unknown>)[k] = this._getNestedValue(doc, v.slice(1))
            } else {
              (idValue as Record<string, unknown>)[k] = v
            }
          }
        } else {
          idValue = idSpec
        }

        groups.set(groupKey, { docs: [], result: { _id: idValue } })
      }

      groups.get(groupKey)!.docs.push(doc)
    }

    // Apply accumulators
    const results: Document[] = []

    for (const { docs, result } of groups.values()) {
      for (const [key, accumulator] of Object.entries(groupSpec)) {
        if (key === '_id') continue

        if (typeof accumulator === 'object' && accumulator !== null) {
          const accObj = accumulator as Record<string, unknown>
          const accType = Object.keys(accObj)[0]
          if (accType === undefined) continue
          const accValue = accObj[accType]

          switch (accType) {
            case '$sum':
              if (accValue === 1) {
                result[key] = docs.length
              } else if (typeof accValue === 'string' && accValue.startsWith('$')) {
                result[key] = docs.reduce((sum, d) => {
                  const val = this._getNestedValue(d, accValue.slice(1))
                  return sum + (typeof val === 'number' ? val : 0)
                }, 0)
              }
              break

            case '$avg':
              if (typeof accValue === 'string' && accValue.startsWith('$')) {
                const sum = docs.reduce((s, d) => {
                  const val = this._getNestedValue(d, accValue.slice(1))
                  return s + (typeof val === 'number' ? val : 0)
                }, 0)
                result[key] = docs.length > 0 ? sum / docs.length : null
              }
              break

            case '$min':
              if (typeof accValue === 'string' && accValue.startsWith('$')) {
                const values = docs.map(d => this._getNestedValue(d, accValue.slice(1)) as number)
                result[key] = Math.min(...values.filter(v => typeof v === 'number'))
              }
              break

            case '$max':
              if (typeof accValue === 'string' && accValue.startsWith('$')) {
                const values = docs.map(d => this._getNestedValue(d, accValue.slice(1)) as number)
                result[key] = Math.max(...values.filter(v => typeof v === 'number'))
              }
              break

            case '$count':
              result[key] = docs.length
              break

            case '$first':
              if (typeof accValue === 'string' && accValue.startsWith('$')) {
                const firstDoc = docs[0]
                result[key] = firstDoc !== undefined ? this._getNestedValue(firstDoc, accValue.slice(1)) : null
              }
              break

            case '$last':
              if (typeof accValue === 'string' && accValue.startsWith('$')) {
                const lastDoc = docs[docs.length - 1]
                result[key] = lastDoc !== undefined ? this._getNestedValue(lastDoc, accValue.slice(1)) : null
              }
              break

            case '$push':
              if (typeof accValue === 'string' && accValue.startsWith('$')) {
                result[key] = docs.map(d => this._getNestedValue(d, accValue.slice(1)))
              }
              break

            case '$addToSet':
              if (typeof accValue === 'string' && accValue.startsWith('$')) {
                const set = new Set()
                for (const d of docs) {
                  set.add(JSON.stringify(this._getNestedValue(d, accValue.slice(1))))
                }
                result[key] = Array.from(set).map(s => JSON.parse(s as string))
              }
              break
          }
        }
      }

      results.push(result)
    }

    return results
  }

  /**
   * Execute $sort stage
   * @internal
   */
  private _executeSortStage(
    documents: Document[],
    sortSpec: Record<string, 1 | -1>
  ): Document[] {
    return [...documents].sort((a, b) => {
      for (const [field, direction] of Object.entries(sortSpec)) {
        const aVal = this._getNestedValue(a, field)
        const bVal = this._getNestedValue(b, field)

        let comparison = 0
        if (aVal === bVal) {
          comparison = 0
        } else if (aVal === null || aVal === undefined) {
          comparison = -1
        } else if (bVal === null || bVal === undefined) {
          comparison = 1
        } else if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal)
        } else {
          comparison = (aVal as number) - (bVal as number)
        }

        if (comparison !== 0) {
          return comparison * direction
        }
      }
      return 0
    })
  }

  /**
   * Execute $unwind stage
   * @internal
   */
  private _executeUnwindStage(
    documents: Document[],
    unwindSpec: string | { path: string; preserveNullAndEmptyArrays?: boolean }
  ): Document[] {
    const path = typeof unwindSpec === 'string' ? unwindSpec : unwindSpec.path
    const preserveNull = typeof unwindSpec === 'object' && unwindSpec.preserveNullAndEmptyArrays === true
    const fieldPath = path.startsWith('$') ? path.slice(1) : path

    const results: Document[] = []

    for (const doc of documents) {
      const arrayValue = this._getNestedValue(doc, fieldPath)

      if (Array.isArray(arrayValue) && arrayValue.length > 0) {
        for (const item of arrayValue) {
          const newDoc = { ...doc }
          this._setNestedValue(newDoc, fieldPath, item)
          results.push(newDoc)
        }
      } else if (preserveNull) {
        results.push({ ...doc })
      }
    }

    return results
  }

  /**
   * Execute $addFields/$set stage
   * @internal
   */
  private _executeAddFieldsStage(
    documents: Document[],
    fieldsSpec: Record<string, unknown>
  ): Document[] {
    return documents.map(doc => {
      const result = { ...doc }

      for (const [field, value] of Object.entries(fieldsSpec)) {
        if (typeof value === 'string' && value.startsWith('$')) {
          result[field] = this._getNestedValue(doc, value.slice(1))
        } else if (typeof value === 'object' && value !== null) {
          result[field] = this._evaluateExpression(doc, value)
        } else {
          result[field] = value
        }
      }

      return result
    })
  }

  /**
   * Execute $lookup stage
   * @internal
   */
  private _executeLookupStage(
    documents: Document[],
    lookupSpec: {
      from: string
      localField?: string
      foreignField?: string
      as: string
    }
  ): Document[] {
    const targetCollection = this.database.collection(lookupSpec.from)
    const targetDocs = targetCollection._findDocuments({})

    return documents.map(doc => {
      const result = { ...doc }

      if (lookupSpec.localField && lookupSpec.foreignField) {
        const localValue = this._getNestedValue(doc, lookupSpec.localField)
        const matched = targetDocs.filter(targetDoc => {
          const foreignValue = this._getNestedValue(targetDoc as Record<string, unknown>, lookupSpec.foreignField!)
          return this._valuesEqual(localValue, foreignValue)
        })
        result[lookupSpec.as] = matched
      } else {
        result[lookupSpec.as] = []
      }

      return result
    })
  }

  /**
   * Evaluate an expression (simplified)
   * @internal
   */
  private _evaluateExpression(doc: Document, expr: unknown): unknown {
    if (expr === null || typeof expr !== 'object') {
      return expr
    }

    const exprObj = expr as Record<string, unknown>
    const operator = Object.keys(exprObj)[0]
    if (operator === undefined) return expr
    const operand = exprObj[operator]

    switch (operator) {
      case '$concat':
        if (Array.isArray(operand)) {
          return operand.map(item => {
            if (typeof item === 'string' && item.startsWith('$')) {
              return String(this._getNestedValue(doc, item.slice(1)) ?? '')
            }
            return String(item)
          }).join('')
        }
        break

      case '$add':
        if (Array.isArray(operand)) {
          return operand.reduce((sum, item) => {
            if (typeof item === 'string' && item.startsWith('$')) {
              return sum + (Number(this._getNestedValue(doc, item.slice(1))) || 0)
            }
            return sum + (Number(item) || 0)
          }, 0)
        }
        break

      case '$subtract':
        if (Array.isArray(operand) && operand.length === 2) {
          const a = typeof operand[0] === 'string' && operand[0].startsWith('$')
            ? Number(this._getNestedValue(doc, operand[0].slice(1)))
            : Number(operand[0])
          const b = typeof operand[1] === 'string' && operand[1].startsWith('$')
            ? Number(this._getNestedValue(doc, operand[1].slice(1)))
            : Number(operand[1])
          return a - b
        }
        break

      case '$multiply':
        if (Array.isArray(operand)) {
          return operand.reduce((product, item) => {
            if (typeof item === 'string' && item.startsWith('$')) {
              return product * (Number(this._getNestedValue(doc, item.slice(1))) || 0)
            }
            return product * (Number(item) || 0)
          }, 1)
        }
        break

      case '$divide':
        if (Array.isArray(operand) && operand.length === 2) {
          const a = typeof operand[0] === 'string' && operand[0].startsWith('$')
            ? Number(this._getNestedValue(doc, operand[0].slice(1)))
            : Number(operand[0])
          const b = typeof operand[1] === 'string' && operand[1].startsWith('$')
            ? Number(this._getNestedValue(doc, operand[1].slice(1)))
            : Number(operand[1])
          return b !== 0 ? a / b : null
        }
        break

      case '$cond':
        if (typeof operand === 'object' && operand !== null) {
          const cond = operand as { if: unknown; then: unknown; else: unknown }
          const condition = this._evaluateCondition(doc, cond.if)
          return condition
            ? this._evaluateExpression(doc, cond.then)
            : this._evaluateExpression(doc, cond.else)
        }
        break

      case '$ifNull':
        if (Array.isArray(operand) && operand.length === 2) {
          const value = typeof operand[0] === 'string' && operand[0].startsWith('$')
            ? this._getNestedValue(doc, operand[0].slice(1))
            : operand[0]
          return value ?? operand[1]
        }
        break
    }

    return expr
  }

  /**
   * Evaluate a condition
   * @internal
   */
  private _evaluateCondition(doc: Document, condition: unknown): boolean {
    if (typeof condition !== 'object' || condition === null) {
      return Boolean(condition)
    }

    const condObj = condition as Record<string, unknown>
    const operator = Object.keys(condObj)[0]
    if (operator === undefined) return true
    const operand = condObj[operator] as unknown[]

    switch (operator) {
      case '$eq':
        return this._compareExprValues(doc, operand[0], operand[1]) === 0
      case '$ne':
        return this._compareExprValues(doc, operand[0], operand[1]) !== 0
      case '$gt':
        return this._compareExprValues(doc, operand[0], operand[1]) > 0
      case '$gte':
        return this._compareExprValues(doc, operand[0], operand[1]) >= 0
      case '$lt':
        return this._compareExprValues(doc, operand[0], operand[1]) < 0
      case '$lte':
        return this._compareExprValues(doc, operand[0], operand[1]) <= 0
      case '$and':
        return (operand as unknown[]).every(c => this._evaluateCondition(doc, c))
      case '$or':
        return (operand as unknown[]).some(c => this._evaluateCondition(doc, c))
      default:
        return true
    }
  }

  /**
   * Compare two expression values
   * @internal
   */
  private _compareExprValues(doc: Document, a: unknown, b: unknown): number {
    const resolveValue = (val: unknown): unknown => {
      if (typeof val === 'string' && val.startsWith('$')) {
        return this._getNestedValue(doc, val.slice(1))
      }
      return val
    }

    const aVal = resolveValue(a)
    const bVal = resolveValue(b)

    if (aVal === bVal) return 0
    if (aVal === null || aVal === undefined) return -1
    if (bVal === null || bVal === undefined) return 1
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return aVal - bVal
    }
    return String(aVal).localeCompare(String(bVal))
  }
}

export default MongoCollection
