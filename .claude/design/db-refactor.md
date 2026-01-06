# DB Base Class Extraction - Architecture Design Document

## Executive Summary

Extract a lightweight `DB` base class from `MondoDatabase` that extends `@cloudflare/agents.Agent`, providing core CRUD operations while allowing `MongoDB` to extend it with full MongoDB compatibility features.

**Goal**: Enable workers that need simple document storage to import a ~50KB bundle instead of the current ~302KB monolith.

---

## Current Architecture Analysis

### MondoDatabase Monolith (831 lines)

```
┌─────────────────────────────────────────────────────────────┐
│                    MondoDatabase                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Core CRUD (~200 lines)                              │   │
│  │  - insertOne, insertMany                            │   │
│  │  - findOne, find                                    │   │
│  │  - updateOne, deleteOne, deleteMany                 │   │
│  │  - countDocuments                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Query Building (~100 lines)                        │   │
│  │  - buildWhereClause (9 operators)                   │   │
│  │  - fieldToJsonPath                                  │   │
│  │  - setNestedValue, deleteNestedValue                │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Collection Management (~50 lines)                  │   │
│  │  - getOrCreateCollection                            │   │
│  │  - getCollectionId                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Advanced Features                                  │   │
│  │  - aggregate() → AggregationExecutor                │   │
│  │  - MCP handler integration                          │   │
│  │  - HTTP API (15+ endpoints)                         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Schema Management                                  │   │
│  │  - SchemaManager integration                        │   │
│  │  - Migration system                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

Dependencies:
├── SchemaManager (366 lines) - Schema init & migrations
├── IndexManager (939 lines) - Index CRUD & TTL
├── AggregationExecutor (359 lines) - Pipeline execution
│   ├── AggregationTranslator (400+ lines)
│   ├── FunctionExecutor (200 lines)
│   └── VectorSearchExecutor (150 lines)
├── QueryTranslator (1500 lines) - 26 operators
├── mcp-handler.ts (273 lines) - MCP protocol
└── ObjectId (150 lines) - ID generation
```

### Current Bundle Sizes

| Build     | Raw    | Gzipped |
|-----------|--------|---------|
| index.js  | 302 KB | 60 KB   |
| worker.js | 181 KB | 37 KB   |

---

## Proposed Architecture

### Class Hierarchy

```
┌──────────────────────────────────────────────────────────────┐
│                @cloudflare/agents.Agent                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Built-in Primitives:                                  │  │
│  │  - this.sql: SQLite interface                          │  │
│  │  - this.ctx.storage: Durable Object storage            │  │
│  │  - setState(state) / getState(): State management      │  │
│  │  - onConnect() / onMessage(): WebSocket handling       │  │
│  │  - onRequest(): HTTP handling                          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ extends
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                         DB                                    │
│              (@mondo/db package - ~50KB)                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Core CRUD:                                            │  │
│  │  - insertOne(collection, doc)                          │  │
│  │  - insertMany(collection, docs)                        │  │
│  │  - findOne(collection, filter)                         │  │
│  │  - find(collection, filter, options?)                  │  │
│  │  - updateOne(collection, filter, update)               │  │
│  │  - updateMany(collection, filter, update)              │  │
│  │  - deleteOne(collection, filter)                       │  │
│  │  - deleteMany(collection, filter)                      │  │
│  │  - countDocuments(collection, filter?)                 │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Collection Management:                                │  │
│  │  - listCollections()                                   │  │
│  │  - createCollection(name)                              │  │
│  │  - dropCollection(name)                                │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Basic Query Operators (17):                           │  │
│  │  $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin,            │  │
│  │  $exists, $type, $and, $or, $nor, $not,                │  │
│  │  $size, $all, $elemMatch                               │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Schema (Minimal):                                     │  │
│  │  - collections table                                   │  │
│  │  - documents table                                     │  │
│  │  - Basic indexes                                       │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ extends
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐  ┌────────────────┐  ┌────────────────┐
│     MongoDB     │  │    McpDB       │  │   VectorDB     │
│  (mongo.do)     │  │  (MCP-only)    │  │  (Vectorize)   │
│  ~100KB added   │  │  ~30KB added   │  │  ~40KB added   │
├─────────────────┤  ├────────────────┤  ├────────────────┤
│ + Aggregation   │  │ + MCP handler  │  │ + Embeddings   │
│ + Full indexes  │  │ + AI tools     │  │ + Similarity   │
│ + $regex, $text │  │ + Resources    │  │ + Vectorize    │
│ + $function     │  │                │  │                │
│ + Wire protocol │  │                │  │                │
│ + HTTP API      │  │                │  │                │
└─────────────────┘  └────────────────┘  └────────────────┘
```

---

## DB Base Class Interface

### Type Definitions

```typescript
// @mondo/db/types.ts

export interface Document {
  _id?: string | ObjectId;
  [key: string]: unknown;
}

export interface Filter {
  [key: string]: unknown;
}

export interface Update {
  $set?: Document;
  $unset?: Record<string, unknown>;
  $inc?: Record<string, number>;
  $push?: Record<string, unknown>;
  $pull?: Record<string, unknown>;
}

export interface FindOptions {
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
}

export interface InsertOneResult {
  acknowledged: boolean;
  insertedId: string;
}

export interface InsertManyResult {
  acknowledged: boolean;
  insertedCount: number;
  insertedIds: string[];
}

export interface UpdateResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: string;
}

export interface DeleteResult {
  acknowledged: boolean;
  deletedCount: number;
}
```

### DB Base Class

```typescript
// @mondo/db/index.ts

import { Agent } from '@cloudflare/agents';
import { ObjectId } from './objectid';

export interface DBEnv {
  // Minimal env - no required bindings
}

export interface DBState {
  initialized: boolean;
  schemaVersion: number;
}

export class DB<Env extends DBEnv = DBEnv> extends Agent<Env, DBState> {

  // ─────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────

  async onStart(): Promise<void> {
    // Initialize schema on first access
    await this.initializeSchema();
  }

  protected async initializeSchema(): Promise<void> {
    const state = this.getState();
    if (state?.initialized) return;

    // Create minimal schema using this.sql from Agent
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        _id TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(collection_id, _id),
        FOREIGN KEY (collection_id) REFERENCES collections(id)
      )
    `);

    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_docs_id ON documents(_id)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_docs_coll ON documents(collection_id, _id)`);

    this.setState({ initialized: true, schemaVersion: 1 });
  }

  // ─────────────────────────────────────────────────────────
  // INSERT OPERATIONS
  // ─────────────────────────────────────────────────────────

  async insertOne(collection: string, document: Document): Promise<InsertOneResult> {
    const collectionId = this.getOrCreateCollection(collection);
    const docId = document._id?.toString() ?? new ObjectId().toHexString();
    const docWithId = { ...document, _id: docId };

    this.sql.exec(
      `INSERT INTO documents (collection_id, _id, data) VALUES (?, ?, json(?))`,
      collectionId, docId, JSON.stringify(docWithId)
    );

    return { acknowledged: true, insertedId: docId };
  }

  async insertMany(collection: string, documents: Document[]): Promise<InsertManyResult> {
    const collectionId = this.getOrCreateCollection(collection);
    const insertedIds: string[] = [];

    // Use transaction for atomicity
    this.sql.exec('BEGIN TRANSACTION');
    try {
      for (const doc of documents) {
        const docId = doc._id?.toString() ?? new ObjectId().toHexString();
        const docWithId = { ...doc, _id: docId };
        this.sql.exec(
          `INSERT INTO documents (collection_id, _id, data) VALUES (?, ?, json(?))`,
          collectionId, docId, JSON.stringify(docWithId)
        );
        insertedIds.push(docId);
      }
      this.sql.exec('COMMIT');
    } catch (e) {
      this.sql.exec('ROLLBACK');
      throw e;
    }

    return { acknowledged: true, insertedCount: insertedIds.length, insertedIds };
  }

  // ─────────────────────────────────────────────────────────
  // FIND OPERATIONS
  // ─────────────────────────────────────────────────────────

  async findOne(collection: string, filter: Filter = {}): Promise<Document | null> {
    const collectionId = this.getCollectionId(collection);
    if (!collectionId) return null;

    const { whereClause, params } = this.buildWhereClause(filter);
    const sql = `SELECT data FROM documents WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ''} LIMIT 1`;

    const result = this.sql.exec(sql, collectionId, ...params).toArray();
    if (!result[0]) return null;

    return JSON.parse((result[0] as { data: string }).data);
  }

  async find(collection: string, filter: Filter = {}, options?: FindOptions): Promise<Document[]> {
    const collectionId = this.getCollectionId(collection);
    if (!collectionId) return [];

    const { whereClause, params } = this.buildWhereClause(filter);
    let sql = `SELECT data FROM documents WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ''}`;

    if (options?.sort) {
      const sortClauses = Object.entries(options.sort).map(([field, dir]) =>
        `json_extract(data, '$.${field}') ${dir === 1 ? 'ASC' : 'DESC'}`
      );
      sql += ` ORDER BY ${sortClauses.join(', ')}`;
    }

    if (options?.limit) sql += ` LIMIT ${options.limit}`;
    if (options?.skip) sql += ` OFFSET ${options.skip}`;

    const result = this.sql.exec(sql, collectionId, ...params).toArray();
    return result.map(row => JSON.parse((row as { data: string }).data));
  }

  // ─────────────────────────────────────────────────────────
  // UPDATE OPERATIONS
  // ─────────────────────────────────────────────────────────

  async updateOne(collection: string, filter: Filter, update: Update): Promise<UpdateResult> {
    const doc = await this.findOne(collection, filter);
    if (!doc) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };

    const updated = this.applyUpdate(doc, update);
    this.sql.exec(
      `UPDATE documents SET data = json(?), updated_at = datetime('now') WHERE collection_id = ? AND _id = ?`,
      JSON.stringify(updated), this.getCollectionId(collection), doc._id
    );

    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(collection: string, filter: Filter, update: Update): Promise<UpdateResult> {
    const docs = await this.find(collection, filter);
    if (docs.length === 0) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };

    const collectionId = this.getCollectionId(collection);
    this.sql.exec('BEGIN TRANSACTION');
    try {
      for (const doc of docs) {
        const updated = this.applyUpdate(doc, update);
        this.sql.exec(
          `UPDATE documents SET data = json(?), updated_at = datetime('now') WHERE collection_id = ? AND _id = ?`,
          JSON.stringify(updated), collectionId, doc._id
        );
      }
      this.sql.exec('COMMIT');
    } catch (e) {
      this.sql.exec('ROLLBACK');
      throw e;
    }

    return { acknowledged: true, matchedCount: docs.length, modifiedCount: docs.length };
  }

  // ─────────────────────────────────────────────────────────
  // DELETE OPERATIONS
  // ─────────────────────────────────────────────────────────

  async deleteOne(collection: string, filter: Filter): Promise<DeleteResult> {
    const doc = await this.findOne(collection, filter);
    if (!doc) return { acknowledged: true, deletedCount: 0 };

    this.sql.exec(
      `DELETE FROM documents WHERE collection_id = ? AND _id = ?`,
      this.getCollectionId(collection), doc._id
    );

    return { acknowledged: true, deletedCount: 1 };
  }

  async deleteMany(collection: string, filter: Filter = {}): Promise<DeleteResult> {
    const collectionId = this.getCollectionId(collection);
    if (!collectionId) return { acknowledged: true, deletedCount: 0 };

    const { whereClause, params } = this.buildWhereClause(filter);

    // Count first
    const countSql = `SELECT COUNT(*) as count FROM documents WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ''}`;
    const countResult = this.sql.exec(countSql, collectionId, ...params).toArray();
    const count = (countResult[0] as { count: number })?.count ?? 0;

    // Then delete
    const deleteSql = `DELETE FROM documents WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ''}`;
    this.sql.exec(deleteSql, collectionId, ...params);

    return { acknowledged: true, deletedCount: count };
  }

  // ─────────────────────────────────────────────────────────
  // COUNT
  // ─────────────────────────────────────────────────────────

  async countDocuments(collection: string, filter: Filter = {}): Promise<number> {
    const collectionId = this.getCollectionId(collection);
    if (!collectionId) return 0;

    const { whereClause, params } = this.buildWhereClause(filter);
    const sql = `SELECT COUNT(*) as count FROM documents WHERE collection_id = ?${whereClause ? ` AND ${whereClause}` : ''}`;

    const result = this.sql.exec(sql, collectionId, ...params).toArray();
    return (result[0] as { count: number })?.count ?? 0;
  }

  // ─────────────────────────────────────────────────────────
  // COLLECTION MANAGEMENT
  // ─────────────────────────────────────────────────────────

  async listCollections(): Promise<string[]> {
    const result = this.sql.exec('SELECT name FROM collections').toArray();
    return result.map(row => (row as { name: string }).name);
  }

  async createCollection(name: string): Promise<void> {
    this.getOrCreateCollection(name);
  }

  async dropCollection(name: string): Promise<boolean> {
    const collectionId = this.getCollectionId(name);
    if (!collectionId) return false;

    this.sql.exec('DELETE FROM documents WHERE collection_id = ?', collectionId);
    this.sql.exec('DELETE FROM collections WHERE id = ?', collectionId);
    return true;
  }

  // ─────────────────────────────────────────────────────────
  // PROTECTED HELPERS (for subclass override)
  // ─────────────────────────────────────────────────────────

  protected getOrCreateCollection(name: string): number {
    const existing = this.sql.exec('SELECT id FROM collections WHERE name = ?', name).toArray();
    if (existing[0]) return (existing[0] as { id: number }).id;

    this.sql.exec('INSERT INTO collections (name) VALUES (?)', name);
    const result = this.sql.exec('SELECT id FROM collections WHERE name = ?', name).toArray();
    return (result[0] as { id: number }).id;
  }

  protected getCollectionId(name: string): number | undefined {
    const result = this.sql.exec('SELECT id FROM collections WHERE name = ?', name).toArray();
    return result[0] ? (result[0] as { id: number }).id : undefined;
  }

  protected buildWhereClause(filter: Filter): { whereClause: string; params: unknown[] } {
    // Basic 17 operators - can be overridden for more
    const conditions: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (key === '_id') {
        conditions.push('_id = ?');
        params.push(String(value));
      } else if (key.startsWith('$')) {
        // Logical operators
        this.handleLogicalOperator(key, value, conditions, params);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Field with operators
        this.handleFieldOperators(key, value as Record<string, unknown>, conditions, params);
      } else {
        // Implicit $eq
        conditions.push(`json_extract(data, '$.${key}') = ?`);
        params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
      }
    }

    return { whereClause: conditions.join(' AND '), params };
  }

  private handleLogicalOperator(
    op: string,
    value: unknown,
    conditions: string[],
    params: unknown[]
  ): void {
    const arr = value as Filter[];
    switch (op) {
      case '$and': {
        const parts = arr.map(f => {
          const { whereClause, params: p } = this.buildWhereClause(f);
          params.push(...p);
          return `(${whereClause})`;
        });
        conditions.push(`(${parts.join(' AND ')})`);
        break;
      }
      case '$or': {
        const parts = arr.map(f => {
          const { whereClause, params: p } = this.buildWhereClause(f);
          params.push(...p);
          return `(${whereClause})`;
        });
        conditions.push(`(${parts.join(' OR ')})`);
        break;
      }
      case '$nor': {
        const parts = arr.map(f => {
          const { whereClause, params: p } = this.buildWhereClause(f);
          params.push(...p);
          return `(${whereClause})`;
        });
        conditions.push(`NOT (${parts.join(' OR ')})`);
        break;
      }
    }
  }

  private handleFieldOperators(
    field: string,
    operators: Record<string, unknown>,
    conditions: string[],
    params: unknown[]
  ): void {
    const path = `$.${field}`;

    for (const [op, value] of Object.entries(operators)) {
      switch (op) {
        case '$eq':
          conditions.push(`json_extract(data, '${path}') = ?`);
          params.push(value);
          break;
        case '$ne':
          conditions.push(`json_extract(data, '${path}') != ?`);
          params.push(value);
          break;
        case '$gt':
          conditions.push(`json_extract(data, '${path}') > ?`);
          params.push(value);
          break;
        case '$gte':
          conditions.push(`json_extract(data, '${path}') >= ?`);
          params.push(value);
          break;
        case '$lt':
          conditions.push(`json_extract(data, '${path}') < ?`);
          params.push(value);
          break;
        case '$lte':
          conditions.push(`json_extract(data, '${path}') <= ?`);
          params.push(value);
          break;
        case '$in': {
          const arr = value as unknown[];
          const placeholders = arr.map(() => '?').join(', ');
          conditions.push(`json_extract(data, '${path}') IN (${placeholders})`);
          params.push(...arr);
          break;
        }
        case '$nin': {
          const arr = value as unknown[];
          const placeholders = arr.map(() => '?').join(', ');
          conditions.push(`json_extract(data, '${path}') NOT IN (${placeholders})`);
          params.push(...arr);
          break;
        }
        case '$exists':
          conditions.push(value
            ? `json_type(data, '${path}') IS NOT NULL`
            : `json_type(data, '${path}') IS NULL`
          );
          break;
        case '$type':
          // Map MongoDB types to SQLite json_type
          conditions.push(`json_type(data, '${path}') = ?`);
          params.push(this.mongoTypeToSqlite(value as string));
          break;
        case '$size':
          conditions.push(`json_array_length(data, '${path}') = ?`);
          params.push(value);
          break;
        case '$all': {
          const arr = value as unknown[];
          for (const v of arr) {
            conditions.push(`EXISTS (SELECT 1 FROM json_each(json_extract(data, '${path}')) WHERE value = ?)`);
            params.push(v);
          }
          break;
        }
        case '$elemMatch': {
          const elemFilter = value as Record<string, unknown>;
          const elemConditions: string[] = [];
          for (const [k, v] of Object.entries(elemFilter)) {
            if (typeof v === 'object' && v !== null) {
              // Handle operators in elemMatch
              for (const [eOp, eVal] of Object.entries(v as Record<string, unknown>)) {
                switch (eOp) {
                  case '$eq':
                    elemConditions.push(`json_extract(value, '$.${k}') = ?`);
                    params.push(eVal);
                    break;
                  case '$gt':
                    elemConditions.push(`json_extract(value, '$.${k}') > ?`);
                    params.push(eVal);
                    break;
                  // ... more operators
                }
              }
            } else {
              elemConditions.push(`json_extract(value, '$.${k}') = ?`);
              params.push(v);
            }
          }
          conditions.push(`EXISTS (SELECT 1 FROM json_each(json_extract(data, '${path}')) WHERE ${elemConditions.join(' AND ')})`);
          break;
        }
        case '$not': {
          const { whereClause, params: p } = this.buildWhereClause({ [field]: value });
          params.push(...p);
          conditions.push(`NOT (${whereClause})`);
          break;
        }
      }
    }
  }

  private mongoTypeToSqlite(type: string): string {
    const map: Record<string, string> = {
      string: 'text',
      number: 'integer', // Also 'real'
      bool: 'true',
      boolean: 'true',
      array: 'array',
      object: 'object',
      null: 'null',
    };
    return map[type] ?? type;
  }

  protected applyUpdate(doc: Document, update: Update): Document {
    const result = { ...doc };

    if (update.$set) {
      for (const [key, value] of Object.entries(update.$set)) {
        if (key !== '_id') this.setNestedValue(result, key, value);
      }
    }

    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) {
        if (key !== '_id') this.deleteNestedValue(result, key);
      }
    }

    if (update.$inc) {
      for (const [key, value] of Object.entries(update.$inc)) {
        const current = this.getNestedValue(result, key) ?? 0;
        this.setNestedValue(result, key, (current as number) + value);
      }
    }

    return result;
  }

  private setNestedValue(obj: Document, path: string, value: unknown): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]!;
      if (!(key in current)) current[key] = {};
      current = current[key] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]!] = value;
  }

  private deleteNestedValue(obj: Document, path: string): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]!;
      if (!(key in current)) return;
      current = current[key] as Record<string, unknown>;
    }
    delete current[keys[keys.length - 1]!];
  }

  private getNestedValue(obj: Document, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;
    for (const key of keys) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }
}

// Re-export types
export type { Document, Filter, Update, FindOptions };
export type { InsertOneResult, InsertManyResult, UpdateResult, DeleteResult };
export { ObjectId } from './objectid';
```

---

## MongoDB Extended Class (mongo.do)

```typescript
// mongo.do/src/mongodb.ts

import { DB, type Document, type Filter } from '@mondo/db';
import { IndexManager } from './index-manager';
import { AggregationExecutor } from './aggregation-executor';
import { QueryTranslator } from './query-translator';
import { createMcpHandler } from './mcp-handler';

export interface MongoDBEnv {
  LOADER?: WorkerLoader;          // For $function support
  VECTORIZE?: VectorizeBinding;   // For vector search
  ENABLE_DEBUG_ENDPOINTS?: string;
}

export class MongoDB<Env extends MongoDBEnv = MongoDBEnv> extends DB<Env> {
  private indexManager?: IndexManager;
  private queryTranslator?: QueryTranslator;
  private mcpHandler?: HttpHandler;

  // ─────────────────────────────────────────────────────────
  // ADVANCED QUERY (Override with 26 operators)
  // ─────────────────────────────────────────────────────────

  protected override buildWhereClause(filter: Filter): { whereClause: string; params: unknown[] } {
    if (!this.queryTranslator) {
      this.queryTranslator = new QueryTranslator({ dialect: 'sqlite' });
    }
    return this.queryTranslator.translate(filter);
  }

  // ─────────────────────────────────────────────────────────
  // AGGREGATION PIPELINE
  // ─────────────────────────────────────────────────────────

  async aggregate(collection: string, pipeline: PipelineStage[]): Promise<unknown[]> {
    const collectionId = this.getCollectionId(collection);
    if (!collectionId) return [];

    const sqlInterface = {
      exec: (query: string, ...params: unknown[]) => {
        const modifiedQuery = query.replace(
          new RegExp(`FROM\\s+${collection}\\b`, 'gi'),
          `FROM documents WHERE collection_id = ${collectionId}`
        );
        return this.sql.exec(modifiedQuery, ...params);
      }
    };

    const executor = new AggregationExecutor(sqlInterface, this.env);
    return executor.execute(collection, pipeline);
  }

  // ─────────────────────────────────────────────────────────
  // INDEX MANAGEMENT
  // ─────────────────────────────────────────────────────────

  async createIndex(collection: string, keys: IndexSpec, options?: CreateIndexOptions): Promise<CreateIndexResult> {
    if (!this.indexManager) {
      this.indexManager = new IndexManager(this.sql);
    }
    return this.indexManager.createIndex(collection, keys, options);
  }

  async dropIndex(collection: string, indexName: string): Promise<DropIndexResult> {
    if (!this.indexManager) {
      this.indexManager = new IndexManager(this.sql);
    }
    return this.indexManager.dropIndex(collection, indexName);
  }

  async listIndexes(collection: string): Promise<IndexInfo[]> {
    if (!this.indexManager) {
      this.indexManager = new IndexManager(this.sql);
    }
    return this.indexManager.listIndexes(collection);
  }

  // ─────────────────────────────────────────────────────────
  // HTTP API (Override onRequest from Agent)
  // ─────────────────────────────────────────────────────────

  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // MCP endpoint
    if (path.startsWith('/mcp')) {
      if (!this.mcpHandler) {
        this.mcpHandler = createMcpHandler(this);
      }
      return this.mcpHandler(request);
    }

    // Health check
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'healthy' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // CRUD API
    if (request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>;
      const collection = body.collection as string;

      switch (path.replace('/internal', '')) {
        case '/insertOne':
          return Response.json(await this.insertOne(collection, body.document as Document));
        case '/insertMany':
          return Response.json(await this.insertMany(collection, body.documents as Document[]));
        case '/findOne':
          return Response.json(await this.findOne(collection, body.filter as Filter));
        case '/find':
          return Response.json(await this.find(collection, body.filter as Filter, body.options));
        case '/updateOne':
          return Response.json(await this.updateOne(collection, body.filter as Filter, body.update));
        case '/deleteOne':
          return Response.json(await this.deleteOne(collection, body.filter as Filter));
        case '/deleteMany':
          return Response.json(await this.deleteMany(collection, body.filter as Filter));
        case '/aggregate':
          return Response.json(await this.aggregate(collection, body.pipeline as PipelineStage[]));
        case '/countDocuments':
          return Response.json(await this.countDocuments(collection, body.filter as Filter));
        case '/listCollections':
          return Response.json(await this.listCollections());
      }
    }

    return new Response('Not Found', { status: 404 });
  }
}
```

---

## File-by-File Extraction Plan

### Phase 1: Create @mondo/db Package

```
packages/db/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # DB class + exports
│   ├── types.ts           # Document, Filter, Update, Results
│   ├── objectid.ts        # ObjectId implementation (copy from src/types)
│   └── operators/
│       └── basic.ts       # 17 basic operator handlers
└── test/
    ├── db.test.ts         # Core CRUD tests
    └── operators.test.ts  # Operator tests
```

**Source files to copy/adapt:**
| From | To | Lines | Notes |
|------|------|-------|-------|
| `src/types/objectid.ts` | `packages/db/src/objectid.ts` | 150 | Direct copy |
| `src/types/index.ts` (subset) | `packages/db/src/types.ts` | ~50 | Document, Filter types |
| `src/durable-object/mondo-database.ts` (partial) | `packages/db/src/index.ts` | ~350 | Extract core CRUD |
| `src/durable-object/schema.ts` (partial) | `packages/db/src/index.ts` | ~50 | Minimal schema |

### Phase 2: Refactor mongo.do to Extend DB

```
src/
├── index.ts                    # Export MongoDB
├── mongodb.ts                  # MongoDB extends DB
├── durable-object/
│   ├── index-manager.ts        # Unchanged
│   ├── schema.ts               # Advanced schema (indexes JSON, etc)
│   └── mcp-handler.ts          # Unchanged
├── executor/
│   ├── aggregation-executor.ts # Unchanged
│   ├── function-executor.ts    # Unchanged
│   └── vector-search-executor.ts
├── translator/
│   ├── query-translator.ts     # Full 26 operators
│   └── aggregation-translator.ts
└── mcp/
    └── server.ts               # MCP tools
```

**Changes to existing files:**
| File | Change |
|------|--------|
| `src/worker.ts` | Export `MongoDB` instead of `MondoDatabase` |
| `src/durable-object/mondo-database.ts` | Delete (replaced by mongodb.ts) |
| `package.json` | Add `@cloudflare/agents` dependency |
| `wrangler.jsonc` | Update class_name to `MongoDB` |

### Phase 3: Add @cloudflare/agents Dependency

```json
// packages/db/package.json
{
  "name": "@mondo/db",
  "version": "0.1.0",
  "dependencies": {
    "@cloudflare/agents": "^0.1.0"
  },
  "peerDependencies": {
    "@cloudflare/workers-types": "^4.0.0"
  }
}
```

```json
// package.json (mongo.do)
{
  "dependencies": {
    "@mondo/db": "workspace:*",
    "@cloudflare/agents": "^0.1.0"
  }
}
```

---

## Bundle Size Estimates

### @mondo/db Package

| Component | Lines | Est. Size |
|-----------|-------|-----------|
| DB class | ~350 | 12 KB |
| ObjectId | ~150 | 5 KB |
| Types | ~100 | 3 KB |
| Basic operators (17) | ~200 | 7 KB |
| **Subtotal** | ~800 | **27 KB** |
| @cloudflare/agents | - | ~20 KB |
| **Total (raw)** | - | **~50 KB** |
| **Total (gzipped)** | - | **~15 KB** |

### mongo.do Package (extends DB)

| Component | Lines | Est. Size |
|-----------|-------|-----------|
| MongoDB class | ~200 | 7 KB |
| QueryTranslator | 1500 | 45 KB |
| AggregationTranslator | 400 | 15 KB |
| AggregationExecutor | 359 | 12 KB |
| IndexManager | 939 | 30 KB |
| FunctionExecutor | 200 | 7 KB |
| MCP handler | 273 | 9 KB |
| **Subtotal** | ~4000 | **~125 KB** |
| @mondo/db | - | ~50 KB |
| **Total (raw)** | - | **~175 KB** |
| **Total (gzipped)** | - | **~40 KB** |

### Comparison

| Build | Current | After Refactor |
|-------|---------|----------------|
| @mondo/db only | N/A | 50 KB (15 KB gz) |
| mongo.do full | 302 KB (60 KB gz) | 175 KB (40 KB gz) |
| Savings | - | **42% smaller** |

---

## Migration Strategy

### Step 1: Create @mondo/db (Non-Breaking)
1. Create `packages/db/` directory
2. Implement DB class extending Agent
3. Add tests
4. Publish as `@mondo/db`

### Step 2: Refactor mongo.do (Non-Breaking)
1. Add `@mondo/db` as dependency
2. Create `MongoDB extends DB` in `src/mongodb.ts`
3. Move advanced features from MondoDatabase to MongoDB
4. Update exports
5. Run existing tests - should all pass

### Step 3: Deprecate MondoDatabase
1. Add deprecation warning to MondoDatabase
2. Update docs to use MongoDB
3. Keep MondoDatabase as alias for 1 minor version

### Step 4: Remove MondoDatabase
1. Remove MondoDatabase class
2. Remove deprecation alias
3. Major version bump

---

## Risk Assessment

### Low Risk
- ObjectId extraction - self-contained, no dependencies
- Type definitions - pure types, no runtime
- Schema migration - additive, no breaking changes

### Medium Risk
- Query operator split - need to ensure basic operators work identically
- Agent integration - new dependency, needs testing
- Bundle size - estimates may vary with tree-shaking

### High Risk
- Breaking changes to MondoDatabase interface - mitigated by deprecation period
- @cloudflare/agents API stability - new package, may have breaking changes

---

## Testing Strategy

### Unit Tests
1. `@mondo/db` tests: All 17 basic operators
2. `@mondo/db` tests: All CRUD operations
3. `mongo.do` tests: Advanced operators (9)
4. `mongo.do` tests: Aggregation pipeline
5. Integration: MongoDB extends DB correctly

### Compatibility Tests
1. Existing MondoDatabase tests pass with MongoDB
2. MCP handler works identically
3. HTTP API unchanged
4. Wire protocol unchanged

### Performance Tests
1. Bundle size verification
2. CRUD operation latency
3. Aggregation performance
4. Memory usage

---

## Timeline (No Estimates)

### Phase 1: Foundation
- [ ] Create packages/db directory structure
- [ ] Extract ObjectId
- [ ] Extract types
- [ ] Implement DB base class
- [ ] Implement 17 basic operators
- [ ] Write unit tests

### Phase 2: Integration
- [ ] Add @cloudflare/agents dependency
- [ ] Test Agent primitives (sql, storage, state)
- [ ] Create MongoDB class extending DB
- [ ] Move advanced features to MongoDB
- [ ] Run compatibility tests

### Phase 3: Migration
- [ ] Update exports
- [ ] Update documentation
- [ ] Add deprecation warnings
- [ ] Publish @mondo/db package

### Phase 4: Cleanup
- [ ] Remove MondoDatabase
- [ ] Clean up imports
- [ ] Final bundle size verification
- [ ] Major version release

---

## Appendix: Query Operator Classification

### Basic (17) - In @mondo/db

| Category | Operators |
|----------|-----------|
| Comparison | `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin` |
| Element | `$exists`, `$type` |
| Array | `$size`, `$all`, `$elemMatch` |
| Logical | `$and`, `$or`, `$nor`, `$not` |

### Advanced (9) - In mongo.do

| Category | Operators |
|----------|-----------|
| Pattern | `$regex` |
| Arithmetic | `$mod` |
| Bitwise | `$bitsAllSet`, `$bitsAnyClear`, `$bitsAllClear`, `$bitsAnySet` |
| Text | `$text` |
| Expression | `$expr`, `$jsonSchema` |
