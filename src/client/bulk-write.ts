/**
 * Bulk Write Operations - MongoDB-compatible bulk write support
 *
 * Provides types and utilities for bulk write operations that can
 * batch multiple insert, update, and delete operations into a single
 * request for improved performance.
 */

import type { ObjectId } from '../types/objectid'

/**
 * Base document type
 */
export type Document = Record<string, unknown>

/**
 * Insert one operation in a bulk write
 */
export interface InsertOneModel<TDocument extends Document = Document> {
  insertOne: {
    document: TDocument
  }
}

/**
 * Update one operation in a bulk write
 */
export interface UpdateOneModel<TDocument extends Document = Document> {
  updateOne: {
    filter: object
    update: object
    upsert?: boolean
    arrayFilters?: object[]
    hint?: string | object
    collation?: object
  }
}

/**
 * Update many operation in a bulk write
 */
export interface UpdateManyModel<TDocument extends Document = Document> {
  updateMany: {
    filter: object
    update: object
    upsert?: boolean
    arrayFilters?: object[]
    hint?: string | object
    collation?: object
  }
}

/**
 * Replace one operation in a bulk write
 */
export interface ReplaceOneModel<TDocument extends Document = Document> {
  replaceOne: {
    filter: object
    replacement: TDocument
    upsert?: boolean
    hint?: string | object
    collation?: object
  }
}

/**
 * Delete one operation in a bulk write
 */
export interface DeleteOneModel {
  deleteOne: {
    filter: object
    hint?: string | object
    collation?: object
  }
}

/**
 * Delete many operation in a bulk write
 */
export interface DeleteManyModel {
  deleteMany: {
    filter: object
    hint?: string | object
    collation?: object
  }
}

/**
 * Union type of all bulk write operation models
 */
export type BulkWriteOperation<TDocument extends Document = Document> =
  | InsertOneModel<TDocument>
  | UpdateOneModel<TDocument>
  | UpdateManyModel<TDocument>
  | ReplaceOneModel<TDocument>
  | DeleteOneModel
  | DeleteManyModel

/**
 * Options for bulk write operations
 */
export interface BulkWriteOptions {
  /**
   * If true (default), operations are executed in order.
   * If an error occurs, remaining operations are not executed.
   * If false, operations may be executed in any order, and all
   * operations are attempted regardless of errors.
   */
  ordered?: boolean

  /**
   * If true, bypass document validation during write operations
   */
  bypassDocumentValidation?: boolean

  /**
   * Comment to attach to the operation
   */
  comment?: string | object

  /**
   * Map of parameter names and values for use with $$var syntax
   */
  let?: Document
}

/**
 * Error information for a failed write operation
 */
export interface BulkWriteError {
  /**
   * Index of the operation in the operations array that caused the error
   */
  index: number

  /**
   * Error code
   */
  code: number

  /**
   * Human-readable error message
   */
  errmsg: string

  /**
   * The operation that caused the error
   */
  op?: BulkWriteOperation
}

/**
 * Upserted document information
 */
export interface BulkWriteUpsertedId {
  /**
   * Index of the upsert operation in the operations array
   */
  index: number

  /**
   * The _id of the upserted document
   */
  _id: ObjectId | string
}

/**
 * Result of a bulk write operation
 */
export interface BulkWriteResult {
  /**
   * Whether the write was acknowledged by the server
   */
  acknowledged: boolean

  /**
   * Number of documents inserted
   */
  insertedCount: number

  /**
   * Number of documents matched for update/replace operations
   */
  matchedCount: number

  /**
   * Number of documents modified by update/replace operations
   */
  modifiedCount: number

  /**
   * Number of documents deleted
   */
  deletedCount: number

  /**
   * Number of documents upserted
   */
  upsertedCount: number

  /**
   * Map of operation index to inserted document _id
   */
  insertedIds: Record<number, ObjectId | string>

  /**
   * Array of upserted document information
   */
  upsertedIds: Record<number, ObjectId | string>
}

/**
 * Error thrown when bulk write operations fail
 */
export class BulkWriteException extends Error {
  /**
   * Partial result of operations that succeeded before the error
   */
  result: BulkWriteResult

  /**
   * Array of write errors
   */
  writeErrors: BulkWriteError[]

  constructor(message: string, result: BulkWriteResult, writeErrors: BulkWriteError[]) {
    super(message)
    this.name = 'BulkWriteException'
    this.result = result
    this.writeErrors = writeErrors
  }
}

/**
 * Type guard to check if an operation is an insertOne
 */
export function isInsertOneModel<T extends Document>(
  op: BulkWriteOperation<T>
): op is InsertOneModel<T> {
  return 'insertOne' in op
}

/**
 * Type guard to check if an operation is an updateOne
 */
export function isUpdateOneModel<T extends Document>(
  op: BulkWriteOperation<T>
): op is UpdateOneModel<T> {
  return 'updateOne' in op
}

/**
 * Type guard to check if an operation is an updateMany
 */
export function isUpdateManyModel<T extends Document>(
  op: BulkWriteOperation<T>
): op is UpdateManyModel<T> {
  return 'updateMany' in op
}

/**
 * Type guard to check if an operation is a replaceOne
 */
export function isReplaceOneModel<T extends Document>(
  op: BulkWriteOperation<T>
): op is ReplaceOneModel<T> {
  return 'replaceOne' in op
}

/**
 * Type guard to check if an operation is a deleteOne
 */
export function isDeleteOneModel(op: BulkWriteOperation): op is DeleteOneModel {
  return 'deleteOne' in op
}

/**
 * Type guard to check if an operation is a deleteMany
 */
export function isDeleteManyModel(op: BulkWriteOperation): op is DeleteManyModel {
  return 'deleteMany' in op
}
