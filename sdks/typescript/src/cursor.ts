/**
 * Cursor implementation for iterating over query results
 */

import type { Document, FindOptions, ForEachCallback, SortDirection, Projection, RpcTransport } from './types.js';

/**
 * Abstract cursor providing iteration methods
 */
export abstract class AbstractCursor<T extends Document = Document> {
  protected _buffer: T[] = [];
  protected _position = 0;
  protected _fetched = false;
  protected _closed = false;

  /**
   * Check if the cursor is closed
   */
  get closed(): boolean {
    return this._closed;
  }

  /**
   * Fetch data from the server - must be implemented by subclasses
   */
  protected abstract fetchData(): Promise<T[]>;

  /**
   * Ensure data has been fetched
   */
  protected async ensureFetched(): Promise<void> {
    if (this._fetched || this._closed) return;
    this._buffer = await this.fetchData();
    this._fetched = true;
  }

  /**
   * Get the next document
   */
  async next(): Promise<T | null> {
    if (this._closed) return null;
    await this.ensureFetched();
    if (this._position >= this._buffer.length) return null;
    return this._buffer[this._position++] ?? null;
  }

  /**
   * Check if there are more documents
   */
  async hasNext(): Promise<boolean> {
    if (this._closed) return false;
    await this.ensureFetched();
    return this._position < this._buffer.length;
  }

  /**
   * Get all remaining documents as an array
   */
  async toArray(): Promise<T[]> {
    if (this._closed) return [];
    await this.ensureFetched();
    const remaining = this._buffer.slice(this._position);
    this._position = this._buffer.length;
    await this.close();
    return remaining;
  }

  /**
   * Iterate over all documents
   */
  async forEach(callback: ForEachCallback<T>): Promise<void> {
    if (this._closed) return;
    await this.ensureFetched();
    let index = 0;
    while (this._position < this._buffer.length) {
      const doc = this._buffer[this._position++];
      if (doc !== undefined) {
        const result = await callback(doc, index++);
        if (result === false) break;
      }
    }
  }

  /**
   * Get the count of remaining documents
   */
  async count(): Promise<number> {
    await this.ensureFetched();
    return this._buffer.length - this._position;
  }

  /**
   * Close the cursor
   */
  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    this._buffer = [];
    this._position = 0;
  }

  /**
   * Async iterator support
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    try {
      while (await this.hasNext()) {
        const doc = await this.next();
        if (doc !== null) yield doc;
      }
    } finally {
      await this.close();
    }
  }
}

/**
 * Find cursor with fluent query building
 */
export class FindCursor<T extends Document = Document> extends AbstractCursor<T> {
  private _transport: RpcTransport;
  private _dbName: string;
  private _collectionName: string;
  private _filter: Document;
  private _options: FindOptions<T> = {};

  constructor(
    transport: RpcTransport,
    dbName: string,
    collectionName: string,
    filter: Document = {}
  ) {
    super();
    this._transport = transport;
    this._dbName = dbName;
    this._collectionName = collectionName;
    this._filter = filter;
  }

  /**
   * Set sort order
   */
  sort(spec: { [key: string]: SortDirection }): this {
    this._options.sort = spec;
    return this;
  }

  /**
   * Limit the number of results
   */
  limit(count: number): this {
    if (count < 0) throw new Error('Limit must be non-negative');
    this._options.limit = count;
    return this;
  }

  /**
   * Skip a number of results
   */
  skip(count: number): this {
    if (count < 0) throw new Error('Skip must be non-negative');
    this._options.skip = count;
    return this;
  }

  /**
   * Set projection
   */
  project(spec: Projection<T>): this {
    this._options.projection = spec;
    return this;
  }

  /**
   * Set batch size
   */
  batchSize(size: number): this {
    this._options.batchSize = size;
    return this;
  }

  /**
   * Set max time
   */
  maxTimeMS(ms: number): this {
    this._options.maxTimeMS = ms;
    return this;
  }

  /**
   * Set hint
   */
  hint(hint: string | Document): this {
    this._options.hint = hint;
    return this;
  }

  /**
   * Set comment
   */
  comment(comment: string): this {
    this._options.comment = comment;
    return this;
  }

  /**
   * Fetch data from the server
   */
  protected async fetchData(): Promise<T[]> {
    const result = await this._transport.call('find', this._dbName, this._collectionName, this._filter, this._options);
    return (result as T[]) ?? [];
  }

  /**
   * Clone the cursor with current options
   */
  clone(): FindCursor<T> {
    const cursor = new FindCursor<T>(this._transport, this._dbName, this._collectionName, this._filter);
    cursor._options = { ...this._options };
    return cursor;
  }

  /**
   * Rewind the cursor to the beginning
   */
  rewind(): void {
    this._position = 0;
    this._fetched = false;
    this._closed = false;
  }
}

/**
 * Aggregation cursor for pipeline results
 */
export class AggregationCursor<T extends Document = Document> extends AbstractCursor<T> {
  private _transport: RpcTransport;
  private _dbName: string;
  private _collectionName: string;
  private _pipeline: Document[];
  private _options: Record<string, unknown>;

  constructor(
    transport: RpcTransport,
    dbName: string,
    collectionName: string,
    pipeline: Document[] = [],
    options: Record<string, unknown> = {}
  ) {
    super();
    this._transport = transport;
    this._dbName = dbName;
    this._collectionName = collectionName;
    this._pipeline = pipeline;
    this._options = options;
  }

  /**
   * Fetch data from the server
   */
  protected async fetchData(): Promise<T[]> {
    const result = await this._transport.call('aggregate', this._dbName, this._collectionName, this._pipeline, this._options);
    return (result as T[]) ?? [];
  }
}
