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
  StoredChangeEvent,
} from './change-stream'
import { ClientSession, TransactableCollection } from './session'

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
  projection?: Record<string, 0 | 1>
  sort?: Record<string, 1 | -1>
  limit?: number
  skip?: number
}

export interface InsertOneOptions extends SessionOption {}

export interface InsertManyOptions extends SessionOption {}

export interface UpdateOptions extends SessionOption {
  upsert?: boolean
  arrayFilters?: object[]
}

export interface ReplaceOptions extends SessionOption {
  upsert?: boolean
}

export interface DeleteOptions extends SessionOption {}

export interface FindOneAndUpdateOptions extends SessionOption {
  projection?: Record<string, 0 | 1>
  sort?: Record<string, 1 | -1>
  upsert?: boolean
  returnDocument?: 'before' | 'after'
}

export interface FindOneAndDeleteOptions extends SessionOption {
  projection?: Record<string, 0 | 1>
  sort?: Record<string, 1 | -1>
}

export interface FindOneAndReplaceOptions extends SessionOption {
  projection?: Record<string, 0 | 1>
  sort?: Record<string, 1 | -1>
  upsert?: boolean
  returnDocument?: 'before' | 'after'
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
  private _created: boolean = false
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
    this._created = true
    this.database._registerCollection(this._collectionName)
  }

  /**
   * Drop collection data
   * @internal
   */
  async _drop(): Promise<void> {
    this.documents.clear()
    this._created = false
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
      const result = await this.insertOne(docs[i], options)
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
    return options?.projection ? this._applyProjection(doc, options.projection) : doc
  }

  /**
   * Find multiple documents, returns a cursor
   */
  find(filter: object = {}, options?: FindOptions): FindCursor<TSchema & { _id: ObjectId }> {
    return new FindCursor<TSchema & { _id: ObjectId }>(this as any, filter, options)
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
    const docId = docs[0]._id
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
    const docs = this._findDocuments(filter, { sort: options?.sort })

    if (docs.length === 0) {
      if (options?.upsert) {
        const newDoc = this._applyUpdate({} as TSchema, update, filter)
        await this.insertOne(newDoc)
        return options?.returnDocument === 'after'
          ? this.findOne(filter, { projection: options?.projection })
          : null
      }
      return null
    }

    const doc = docs[0]
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
    const docs = this._findDocuments(filter, { sort: options?.sort })

    if (docs.length === 0) {
      return null
    }

    const doc = docs[0]
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
    const docs = this._findDocuments(filter, { sort: options?.sort })

    if (docs.length === 0) {
      if (options?.upsert) {
        await this.insertOne(replacement)
        return options?.returnDocument === 'after'
          ? this.findOne(filter, { projection: options?.projection })
          : null
      }
      return null
    }

    const doc = docs[0]
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

      try {
        if (isInsertOneModel(op)) {
          const insertResult = await this.insertOne(op.insertOne.document)
          result.insertedCount++
          result.insertedIds[i] = insertResult.insertedId
        } else if (isUpdateOneModel(op)) {
          const updateResult = await this.updateOne(
            op.updateOne.filter,
            op.updateOne.update,
            { upsert: op.updateOne.upsert, arrayFilters: op.updateOne.arrayFilters }
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
            { upsert: op.updateMany.upsert, arrayFilters: op.updateMany.arrayFilters }
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
            { upsert: op.replaceOne.upsert }
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
      if (current[part] === undefined || current[part] === null) {
        current[part] = {}
      }
      current = current[part] as Record<string, unknown>
    }

    current[parts[parts.length - 1]] = value
  }

  /**
   * Delete a nested value from an object
   */
  private _deleteNestedValue(obj: Record<string, unknown>, path: string): void {
    const parts = path.split('.')
    let current = obj

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (current[part] === undefined || current[part] === null) {
        return
      }
      current = current[part] as Record<string, unknown>
    }

    delete current[parts[parts.length - 1]]
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
}

export default MongoCollection
