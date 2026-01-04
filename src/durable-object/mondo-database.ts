/**
 * MondoDatabase - MongoDB-compatible Durable Object
 *
 * This is the main Durable Object class that provides MongoDB-compatible
 * operations backed by Cloudflare's SQLite storage.
 */

import {
  SchemaManager,
  DurableObjectStorage,
} from './schema';
import { ObjectId } from '../types/objectid';
import type { WorkerLoader } from '../types/function';
import { AggregationExecutor } from '../executor/aggregation-executor';
import type { PipelineStage } from '../translator/aggregation-translator';

/**
 * Interface for Durable Object state
 */
export interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): void;
}

/**
 * Interface for Cloudflare Environment bindings
 */
export interface Env {
  /** Optional worker-loader binding for $function support */
  LOADER?: WorkerLoader
}

/**
 * MongoDB-style document with optional _id field
 */
export interface Document {
  _id?: string | ObjectId;
  [key: string]: unknown;
}

/**
 * Result of an insertOne operation
 */
export interface InsertOneResult {
  acknowledged: boolean;
  insertedId: string;
}

/**
 * Result of an insertMany operation
 */
export interface InsertManyResult {
  acknowledged: boolean;
  insertedCount: number;
  insertedIds: string[];
}

/**
 * Result of an update operation
 */
export interface UpdateResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: string;
}

/**
 * Result of a delete operation
 */
export interface DeleteResult {
  acknowledged: boolean;
  deletedCount: number;
}

/**
 * MondoDatabase Durable Object
 *
 * Provides MongoDB-compatible document storage using Cloudflare Durable Objects
 * with SQLite as the backing store.
 */
export class MondoDatabase {
  private state: DurableObjectState;
  private env: Env;
  private schemaManager: SchemaManager;
  private initialized: boolean = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.schemaManager = new SchemaManager(state.storage);

    // Use blockConcurrencyWhile to ensure atomic schema initialization
    // This prevents race conditions when multiple requests arrive simultaneously
    this.state.blockConcurrencyWhile(async () => {
      await this.schemaManager.initializeSchema();
      this.initialized = true;
    });
  }

  /**
   * Check if the database is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the schema manager for advanced operations
   */
  getSchemaManager(): SchemaManager {
    return this.schemaManager;
  }

  /**
   * Get the underlying storage
   */
  getStorage(): DurableObjectStorage {
    return this.state.storage;
  }

  /**
   * Get or create a collection by name, returning the collection_id
   */
  private getOrCreateCollection(name: string): number {
    const sql = this.state.storage.sql;

    // Try to get existing collection
    const existing = sql.exec(
      `SELECT id FROM collections WHERE name = ?`,
      name
    ).toArray() as { id: number }[];

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new collection
    sql.exec(
      `INSERT INTO collections (name, options) VALUES (?, '{}')`,
      name
    );

    // Get the inserted id
    const result = sql.exec(
      `SELECT id FROM collections WHERE name = ?`,
      name
    ).toArray() as { id: number }[];

    return result[0].id;
  }

  /**
   * Get collection ID by name, returns undefined if not found
   */
  private getCollectionId(name: string): number | undefined {
    const sql = this.state.storage.sql;
    const result = sql.exec(
      `SELECT id FROM collections WHERE name = ?`,
      name
    ).toArray() as { id: number }[];

    return result.length > 0 ? result[0].id : undefined;
  }

  /**
   * Insert a single document into a collection
   */
  async insertOne(collection: string, document: Document): Promise<InsertOneResult> {
    const collectionId = this.getOrCreateCollection(collection);
    const sql = this.state.storage.sql;

    // Generate _id if not provided
    const docId = document._id
      ? (document._id instanceof ObjectId ? document._id.toHexString() : String(document._id))
      : new ObjectId().toHexString();

    // Create document with _id included
    const docWithId = { ...document, _id: docId };

    // Insert document using json() for proper JSON storage
    sql.exec(
      `INSERT INTO documents (collection_id, _id, data) VALUES (?, ?, json(?))`,
      collectionId,
      docId,
      JSON.stringify(docWithId)
    );

    return {
      acknowledged: true,
      insertedId: docId,
    };
  }

  /**
   * Insert multiple documents into a collection
   */
  async insertMany(collection: string, documents: Document[]): Promise<InsertManyResult> {
    const collectionId = this.getOrCreateCollection(collection);
    const sql = this.state.storage.sql;
    const insertedIds: string[] = [];

    for (const document of documents) {
      // Generate _id if not provided
      const docId = document._id
        ? (document._id instanceof ObjectId ? document._id.toHexString() : String(document._id))
        : new ObjectId().toHexString();

      // Create document with _id included
      const docWithId = { ...document, _id: docId };

      // Insert document
      sql.exec(
        `INSERT INTO documents (collection_id, _id, data) VALUES (?, ?, json(?))`,
        collectionId,
        docId,
        JSON.stringify(docWithId)
      );

      insertedIds.push(docId);
    }

    return {
      acknowledged: true,
      insertedCount: insertedIds.length,
      insertedIds,
    };
  }

  /**
   * Find a single document matching the query
   */
  async findOne(collection: string, query: Document = {}): Promise<Document | null> {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === undefined) {
      return null;
    }

    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(query);

    const sqlQuery = `
      SELECT data FROM documents
      WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ''}
      LIMIT 1
    `;

    const result = sql.exec(sqlQuery, collectionId, ...params).toArray() as { data: string }[];

    if (result.length === 0) {
      return null;
    }

    return JSON.parse(result[0].data) as Document;
  }

  /**
   * Find all documents matching the query
   */
  async find(collection: string, query: Document = {}): Promise<Document[]> {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === undefined) {
      return [];
    }

    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(query);

    const sqlQuery = `
      SELECT data FROM documents
      WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ''}
    `;

    const result = sql.exec(sqlQuery, collectionId, ...params).toArray() as { data: string }[];

    return result.map((row) => JSON.parse(row.data) as Document);
  }

  /**
   * Update a single document matching the filter
   */
  async updateOne(
    collection: string,
    filter: Document,
    update: { $set?: Document; $unset?: Record<string, unknown> }
  ): Promise<UpdateResult> {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === undefined) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    }

    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(filter);

    // Find the document to update
    const findQuery = `
      SELECT id, data FROM documents
      WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ''}
      LIMIT 1
    `;

    const found = sql.exec(findQuery, collectionId, ...params).toArray() as { id: number; data: string }[];

    if (found.length === 0) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    }

    const docRowId = found[0].id;
    const existingDoc = JSON.parse(found[0].data) as Document;

    // Apply $set updates
    let updatedDoc = { ...existingDoc };
    if (update.$set) {
      for (const [key, value] of Object.entries(update.$set)) {
        if (key !== '_id') {
          this.setNestedValue(updatedDoc, key, value);
        }
      }
    }

    // Apply $unset to remove fields
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) {
        if (key !== '_id') {
          this.deleteNestedValue(updatedDoc, key);
        }
      }
    }

    // Update the document in the database
    sql.exec(
      `UPDATE documents SET data = json(?) WHERE id = ?`,
      JSON.stringify(updatedDoc),
      docRowId
    );

    return {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
    };
  }

  /**
   * Delete a single document matching the filter
   */
  async deleteOne(collection: string, filter: Document): Promise<DeleteResult> {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === undefined) {
      return { acknowledged: true, deletedCount: 0 };
    }

    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(filter);

    // Find the document to delete
    const findQuery = `
      SELECT id FROM documents
      WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ''}
      LIMIT 1
    `;

    const found = sql.exec(findQuery, collectionId, ...params).toArray() as { id: number }[];

    if (found.length === 0) {
      return { acknowledged: true, deletedCount: 0 };
    }

    // Delete the document
    sql.exec(`DELETE FROM documents WHERE id = ?`, found[0].id);

    return {
      acknowledged: true,
      deletedCount: 1,
    };
  }

  /**
   * Build WHERE clause from MongoDB-style query
   * Supports: _id, simple field equality, $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $exists
   */
  private buildWhereClause(query: Document): { whereClause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(query)) {
      if (key === '_id') {
        // Direct _id comparison on the _id column
        conditions.push('_id = ?');
        params.push(value instanceof ObjectId ? value.toHexString() : String(value));
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle MongoDB operators
        for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
          const jsonPath = this.fieldToJsonPath(key);
          switch (op) {
            case '$eq': {
              conditions.push(`json_extract(data, ?) = ?`);
              const eqValue = typeof opValue === 'boolean' ? (opValue ? 1 : 0) : opValue;
              params.push(jsonPath, eqValue);
              break;
            }
            case '$ne': {
              conditions.push(`json_extract(data, ?) != ?`);
              const neValue = typeof opValue === 'boolean' ? (opValue ? 1 : 0) : opValue;
              params.push(jsonPath, neValue);
              break;
            }
            case '$gt':
              conditions.push(`json_extract(data, ?) > ?`);
              params.push(jsonPath, opValue);
              break;
            case '$gte':
              conditions.push(`json_extract(data, ?) >= ?`);
              params.push(jsonPath, opValue);
              break;
            case '$lt':
              conditions.push(`json_extract(data, ?) < ?`);
              params.push(jsonPath, opValue);
              break;
            case '$lte':
              conditions.push(`json_extract(data, ?) <= ?`);
              params.push(jsonPath, opValue);
              break;
            case '$in':
              if (Array.isArray(opValue) && opValue.length > 0) {
                const placeholders = opValue.map(() => '?').join(', ');
                conditions.push(`json_extract(data, ?) IN (${placeholders})`);
                params.push(jsonPath, ...opValue);
              }
              break;
            case '$nin':
              if (Array.isArray(opValue) && opValue.length > 0) {
                const placeholders = opValue.map(() => '?').join(', ');
                conditions.push(`json_extract(data, ?) NOT IN (${placeholders})`);
                params.push(jsonPath, ...opValue);
              }
              break;
            case '$exists':
              if (opValue) {
                conditions.push(`json_extract(data, ?) IS NOT NULL`);
              } else {
                conditions.push(`json_extract(data, ?) IS NULL`);
              }
              params.push(jsonPath);
              break;
          }
        }
      } else {
        // Implicit $eq for simple values using json_extract
        const jsonPath = this.fieldToJsonPath(key);
        conditions.push(`json_extract(data, ?) = ?`);
        // SQLite's json_extract returns 1/0 for booleans, so convert JS booleans
        const sqlValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
        params.push(jsonPath, sqlValue);
      }
    }

    return {
      whereClause: conditions.join(' AND '),
      params,
    };
  }

  /**
   * Convert a field name (possibly with dot notation) to JSON path
   * e.g., "profile.level" -> "$.profile.level"
   */
  private fieldToJsonPath(field: string): string {
    return `$.${field}`;
  }

  /**
   * Set a nested value in an object using dot notation path
   */
  private setNestedValue(obj: Document, path: string, value: unknown): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Delete a nested value from an object using dot notation path
   */
  private deleteNestedValue(obj: Document, path: string): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        return; // Path doesn't exist
      }
      current = current[key] as Record<string, unknown>;
    }

    delete current[keys[keys.length - 1]];
  }

  /**
   * Delete multiple documents matching the filter
   */
  async deleteMany(collection: string, filter: Document = {}): Promise<DeleteResult> {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === undefined) {
      return { acknowledged: true, deletedCount: 0 };
    }

    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(filter);

    // If no filter, delete all documents in collection
    if (!whereClause) {
      const countResult = sql.exec(
        `SELECT COUNT(*) as count FROM documents WHERE collection_id = ?`,
        collectionId
      ).toArray() as { count: number }[];

      const count = countResult[0]?.count || 0;

      sql.exec(`DELETE FROM documents WHERE collection_id = ?`, collectionId);

      return { acknowledged: true, deletedCount: count };
    }

    // Find and delete matching documents
    const findQuery = `
      SELECT id FROM documents
      WHERE collection_id = ? AND ${whereClause}
    `;

    const found = sql.exec(findQuery, collectionId, ...params).toArray() as { id: number }[];

    for (const row of found) {
      sql.exec(`DELETE FROM documents WHERE id = ?`, row.id);
    }

    return {
      acknowledged: true,
      deletedCount: found.length,
    };
  }

  /**
   * Count documents matching the filter
   */
  async countDocuments(collection: string, filter: Document = {}): Promise<number> {
    const collectionId = this.getCollectionId(collection);
    if (collectionId === undefined) {
      return 0;
    }

    const sql = this.state.storage.sql;
    const { whereClause, params } = this.buildWhereClause(filter);

    const countQuery = `
      SELECT COUNT(*) as count FROM documents
      WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ''}
    `;

    const result = sql.exec(countQuery, collectionId, ...params).toArray() as { count: number }[];

    return result[0]?.count || 0;
  }

  /**
   * Execute an aggregation pipeline on a collection
   *
   * Supports async execution for $function operators that require
   * JavaScript execution via worker-loader.
   *
   * @param collection - The collection name
   * @param pipeline - Array of aggregation pipeline stages
   * @returns Array of result documents
   */
  async aggregate(collection: string, pipeline: PipelineStage[]): Promise<unknown[]> {
    // Ensure collection exists - create view for documents
    const collectionId = this.getCollectionId(collection);

    if (collectionId === undefined) {
      // Return empty for non-existent collection
      return [];
    }

    // Create SQL interface that wraps the storage.sql for AggregationExecutor
    const sqlInterface = {
      exec: (query: string, ...params: unknown[]) => {
        // The AggregationTranslator generates SQL that selects from collection name directly
        // We need to replace the collection name with a subquery that filters by collection_id
        // Handle both cases: with and without existing WHERE clause
        let modifiedQuery: string;
        const fromPattern = new RegExp(`FROM\\s+${collection}\\b(\\s+WHERE\\s+)?`, 'gi');
        modifiedQuery = query.replace(fromPattern, (match, hasWhere) => {
          if (hasWhere) {
            // There's an existing WHERE clause, use AND to combine conditions
            return `FROM documents WHERE collection_id = ${collectionId} AND `;
          } else {
            // No existing WHERE clause
            return `FROM documents WHERE collection_id = ${collectionId}`;
          }
        });
        const result = this.state.storage.sql.exec(modifiedQuery, ...params);
        const array = result.toArray();
        return {
          results: array,
          toArray: () => array
        };
      }
    };

    const executor = new AggregationExecutor(sqlInterface, this.env);
    return executor.execute(collection, pipeline);
  }

  /**
   * Reset database - for testing purposes
   */
  private async reset(): Promise<void> {
    const sql = this.state.storage.sql;
    sql.exec(`DELETE FROM documents`);
    sql.exec(`DELETE FROM collections`);
  }

  /**
   * Dump database contents - for debugging
   */
  private async dump(): Promise<{ collections: unknown[]; documents: unknown[] }> {
    const sql = this.state.storage.sql;
    const collections = sql.exec(`SELECT * FROM collections`).toArray();
    const documents = sql.exec(`SELECT * FROM documents`).toArray();
    return { collections, documents };
  }

  /**
   * Handle incoming fetch requests
   * Implements HTTP API for MongoDB-compatible operations
   */
  async fetch(request: Request): Promise<Response> {
    // Ensure initialization is complete
    if (!this.initialized) {
      return new Response(JSON.stringify({ error: 'Database initializing' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check endpoint
      if (path === '/health') {
        const isValid = await this.schemaManager.validateSchema();
        return new Response(
          JSON.stringify({
            status: isValid ? 'healthy' : 'unhealthy',
            schemaVersion: await this.schemaManager.getSchemaVersion(),
          }),
          {
            status: isValid ? 200 : 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Internal endpoints for testing
      if (request.method === 'POST' && path === '/internal/reset') {
        await this.reset();
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (request.method === 'GET' && path === '/internal/dump') {
        const data = await this.dump();
        return new Response(JSON.stringify(data), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // CRUD endpoints
      if (request.method === 'POST') {
        const body = await request.json() as Record<string, unknown>;
        const collection = body.collection as string;

        if (!collection) {
          return new Response(JSON.stringify({ error: 'Collection name required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (path === '/insertOne') {
          const result = await this.insertOne(collection, body.document as Document || {});
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (path === '/insertMany') {
          const result = await this.insertMany(collection, body.documents as Document[] || []);
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (path === '/findOne') {
          const result = await this.findOne(collection, body.filter as Document || {});
          return new Response(JSON.stringify({ document: result }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (path === '/find') {
          const result = await this.find(collection, body.filter as Document || {});
          return new Response(JSON.stringify({ documents: result }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (path === '/updateOne') {
          const result = await this.updateOne(
            collection,
            body.filter as Document || {},
            body.update as { $set?: Document; $unset?: Record<string, unknown> } || {}
          );
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (path === '/deleteOne') {
          const result = await this.deleteOne(collection, body.filter as Document || {});
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (path === '/deleteMany') {
          const result = await this.deleteMany(collection, body.filter as Document || {});
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (path === '/countDocuments') {
          const result = await this.countDocuments(collection, body.filter as Document || {});
          return new Response(JSON.stringify({ count: result }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (path === '/aggregate') {
          const result = await this.aggregate(collection, body.pipeline as PipelineStage[] || []);
          return new Response(JSON.stringify({ documents: result }), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}
