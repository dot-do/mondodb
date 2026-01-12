/**
 * Collection class - MongoDB-compatible collection operations
 */

import type {
  Document,
  WithId,
  Filter,
  UpdateFilter,
  FindOptions,
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  CountDocumentsOptions,
  UpdateOptions,
  ReplaceOptions,
  DeleteOptions,
  AggregationStage,
  AggregateOptions,
  RpcTransport,
} from './types.js';

import { FindCursor, AggregationCursor } from './cursor.js';

/**
 * Collection class providing MongoDB-compatible operations
 */
export class Collection<T extends Document = Document> {
  private _transport: RpcTransport;
  private _dbName: string;
  private _name: string;

  constructor(transport: RpcTransport, dbName: string, name: string) {
    this._transport = transport;
    this._dbName = dbName;
    this._name = name;
  }

  /**
   * Get the collection name
   */
  get collectionName(): string {
    return this._name;
  }

  /**
   * Get the database name
   */
  get dbName(): string {
    return this._dbName;
  }

  /**
   * Get the namespace
   */
  get namespace(): string {
    return `${this._dbName}.${this._name}`;
  }

  // ============================================================================
  // Insert Operations
  // ============================================================================

  /**
   * Insert a single document
   */
  async insertOne(doc: T): Promise<InsertOneResult> {
    const result = await this._transport.call('insertOne', this._dbName, this._name, doc);
    return result as InsertOneResult;
  }

  /**
   * Insert multiple documents
   */
  async insertMany(docs: T[]): Promise<InsertManyResult> {
    const result = await this._transport.call('insertMany', this._dbName, this._name, docs);
    return result as InsertManyResult;
  }

  // ============================================================================
  // Find Operations
  // ============================================================================

  /**
   * Find documents matching a filter - returns a cursor
   */
  find(filter: Filter<T> = {}, options?: FindOptions<T>): FindCursor<WithId<T>> {
    const cursor = new FindCursor<WithId<T>>(this._transport, this._dbName, this._name, filter as Document);

    if (options?.sort) cursor.sort(options.sort as { [key: string]: 1 | -1 });
    if (options?.limit !== undefined) cursor.limit(options.limit);
    if (options?.skip !== undefined) cursor.skip(options.skip);
    if (options?.projection) cursor.project(options.projection);
    if (options?.batchSize) cursor.batchSize(options.batchSize);
    if (options?.maxTimeMS) cursor.maxTimeMS(options.maxTimeMS);
    if (options?.hint) cursor.hint(options.hint);
    if (options?.comment) cursor.comment(options.comment);

    return cursor;
  }

  /**
   * Find a single document matching a filter
   */
  async findOne(filter: Filter<T> = {}, options?: FindOptions<T>): Promise<WithId<T> | null> {
    const cursor = this.find(filter, { ...options, limit: 1 });
    return cursor.next();
  }

  /**
   * Find a document and update it
   */
  async findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options?: { returnDocument?: 'before' | 'after'; upsert?: boolean }
  ): Promise<WithId<T> | null> {
    const result = await this._transport.call(
      'findOneAndUpdate',
      this._dbName,
      this._name,
      filter,
      update,
      options ?? {}
    );
    return result as WithId<T> | null;
  }

  /**
   * Find a document and delete it
   */
  async findOneAndDelete(filter: Filter<T>): Promise<WithId<T> | null> {
    const result = await this._transport.call('findOneAndDelete', this._dbName, this._name, filter);
    return result as WithId<T> | null;
  }

  /**
   * Find a document and replace it
   */
  async findOneAndReplace(
    filter: Filter<T>,
    replacement: T,
    options?: { returnDocument?: 'before' | 'after'; upsert?: boolean }
  ): Promise<WithId<T> | null> {
    const result = await this._transport.call(
      'findOneAndReplace',
      this._dbName,
      this._name,
      filter,
      replacement,
      options ?? {}
    );
    return result as WithId<T> | null;
  }

  // ============================================================================
  // Update Operations
  // ============================================================================

  /**
   * Update a single document
   */
  async updateOne(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<UpdateResult> {
    const result = await this._transport.call('updateOne', this._dbName, this._name, filter, update, options ?? {});
    return result as UpdateResult;
  }

  /**
   * Update multiple documents
   */
  async updateMany(filter: Filter<T>, update: UpdateFilter<T>, options?: UpdateOptions): Promise<UpdateResult> {
    const result = await this._transport.call('updateMany', this._dbName, this._name, filter, update, options ?? {});
    return result as UpdateResult;
  }

  /**
   * Replace a single document
   */
  async replaceOne(filter: Filter<T>, replacement: T, options?: ReplaceOptions): Promise<UpdateResult> {
    const result = await this._transport.call('replaceOne', this._dbName, this._name, filter, replacement, options ?? {});
    return result as UpdateResult;
  }

  // ============================================================================
  // Delete Operations
  // ============================================================================

  /**
   * Delete a single document
   */
  async deleteOne(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult> {
    const result = await this._transport.call('deleteOne', this._dbName, this._name, filter, options ?? {});
    return result as DeleteResult;
  }

  /**
   * Delete multiple documents
   */
  async deleteMany(filter: Filter<T>, options?: DeleteOptions): Promise<DeleteResult> {
    const result = await this._transport.call('deleteMany', this._dbName, this._name, filter, options ?? {});
    return result as DeleteResult;
  }

  // ============================================================================
  // Count Operations
  // ============================================================================

  /**
   * Count documents matching a filter
   */
  async countDocuments(filter: Filter<T> = {}, options?: CountDocumentsOptions): Promise<number> {
    const result = await this._transport.call('countDocuments', this._dbName, this._name, filter, options ?? {});
    return result as number;
  }

  /**
   * Get an estimated document count
   */
  async estimatedDocumentCount(): Promise<number> {
    const result = await this._transport.call('estimatedDocumentCount', this._dbName, this._name);
    return result as number;
  }

  // ============================================================================
  // Aggregation Operations
  // ============================================================================

  /**
   * Run an aggregation pipeline
   */
  aggregate<R extends Document = Document>(
    pipeline: AggregationStage[] = [],
    options?: AggregateOptions
  ): AggregationCursor<R> {
    return new AggregationCursor<R>(
      this._transport,
      this._dbName,
      this._name,
      pipeline as Document[],
      options ?? {}
    );
  }

  /**
   * Get distinct values for a field
   */
  async distinct<K extends keyof T>(field: K, filter?: Filter<T>): Promise<T[K][]> {
    const result = await this._transport.call('distinct', this._dbName, this._name, String(field), filter ?? {});
    return result as T[K][];
  }

  // ============================================================================
  // Index Operations
  // ============================================================================

  /**
   * Create an index
   */
  async createIndex(keys: Document, options?: Document): Promise<string> {
    const result = await this._transport.call('createIndex', this._dbName, this._name, keys, options ?? {});
    return result as string;
  }

  /**
   * Create multiple indexes
   */
  async createIndexes(indexes: Array<{ key: Document; options?: Document }>): Promise<string[]> {
    const result = await this._transport.call('createIndexes', this._dbName, this._name, indexes);
    return result as string[];
  }

  /**
   * Drop an index
   */
  async dropIndex(indexName: string): Promise<void> {
    await this._transport.call('dropIndex', this._dbName, this._name, indexName);
  }

  /**
   * Drop all indexes
   */
  async dropIndexes(): Promise<void> {
    await this._transport.call('dropIndexes', this._dbName, this._name);
  }

  /**
   * List all indexes
   */
  async listIndexes(): Promise<Document[]> {
    const result = await this._transport.call('listIndexes', this._dbName, this._name);
    return result as Document[];
  }

  // ============================================================================
  // Collection Operations
  // ============================================================================

  /**
   * Drop the collection
   */
  async drop(): Promise<boolean> {
    const result = await this._transport.call('dropCollection', this._dbName, this._name);
    return result as boolean;
  }

  /**
   * Rename the collection
   */
  async rename(newName: string, options?: { dropTarget?: boolean }): Promise<void> {
    await this._transport.call('renameCollection', this._dbName, this._name, newName, options ?? {});
    this._name = newName;
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Perform bulk write operations
   */
  async bulkWrite(
    operations: Array<
      | { insertOne: { document: T } }
      | { updateOne: { filter: Filter<T>; update: UpdateFilter<T>; upsert?: boolean } }
      | { updateMany: { filter: Filter<T>; update: UpdateFilter<T>; upsert?: boolean } }
      | { deleteOne: { filter: Filter<T> } }
      | { deleteMany: { filter: Filter<T> } }
      | { replaceOne: { filter: Filter<T>; replacement: T; upsert?: boolean } }
    >,
    options?: { ordered?: boolean }
  ): Promise<{
    insertedCount: number;
    matchedCount: number;
    modifiedCount: number;
    deletedCount: number;
    upsertedCount: number;
    upsertedIds: Record<number, string>;
  }> {
    const result = await this._transport.call('bulkWrite', this._dbName, this._name, operations, options ?? {});
    return result as {
      insertedCount: number;
      matchedCount: number;
      modifiedCount: number;
      deletedCount: number;
      upsertedCount: number;
      upsertedIds: Record<number, string>;
    };
  }
}
