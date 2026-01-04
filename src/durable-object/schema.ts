/**
 * SQLite Schema Management for MondoDB
 *
 * This module handles the initialization and management of SQLite tables
 * for MongoDB-compatible document storage in Cloudflare Durable Objects.
 *
 * UNIFIED SCHEMA TYPES:
 * This module serves as the single source of truth for all schema-related types
 * used by both IndexManager and MondoDatabase.
 */

import {
  migrations,
  getMigrationsInRange,
  getLatestVersion,
  validateMigrations,
} from './migrations';

// Re-export common types from src/types for convenience
export type {
  IndexSpec,
  IndexInfo,
  CreateIndexOptions,
  CreateIndexResult,
  DropIndexResult,
  Document,
  InsertOneResult,
  InsertManyResult,
  DeleteResult,
  UpdateResult,
  FindOptions,
  CollectionMetadata,
} from '../types';

/**
 * Current schema version - derived from migrations module
 */
export const SCHEMA_VERSION = getLatestVersion();

/**
 * Schema key used for storing version in Durable Object storage
 */
export const SCHEMA_VERSION_KEY = 'schema_version';

/**
 * Table definitions for the schema (exported for reference/testing)
 *
 * UNIFIED SCHEMA: This schema supports both MondoDatabase and IndexManager:
 * - collections table: stores collection metadata including indexes JSON
 * - documents table: stores documents with _id as the document identifier
 *
 * Note: The actual table creation is handled by migrations.ts.
 * These definitions are kept in sync for reference and testing.
 */
export const SCHEMA_TABLES = {
  collections: {
    name: 'collections',
    sql: `
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        options TEXT DEFAULT '{}',
        indexes TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `.trim(),
  },
  documents: {
    name: 'documents',
    sql: `
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        _id TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(collection_id, _id),
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      )
    `.trim(),
  },
} as const;

/**
 * Index definitions for optimized queries
 */
export const SCHEMA_INDEXES = {
  documents_id: {
    name: 'idx_documents_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_documents_id ON documents(_id)`,
  },
  documents_collection_id: {
    name: 'idx_documents_collection_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_documents_collection_id ON documents(collection_id, _id)`,
  },
} as const;

// ============================================================================
// UNIFIED SQL STORAGE INTERFACES
// ============================================================================
// These interfaces are used by both IndexManager and MondoDatabase to interact
// with SQLite storage. The two styles (prepared statements vs exec) are both
// supported to accommodate different use cases.

/**
 * Interface for SQL query result with parameter binding
 * Used by MondoDatabase with Cloudflare's native SQL interface
 */
export interface SqlQueryResult {
  toArray(): unknown[];
  run(): void;
  bind(...params: unknown[]): SqlQueryResult;
}

/**
 * Interface for Cloudflare Durable Object SQL storage
 * Used by MondoDatabase for direct SQL execution
 */
export interface SqlStorage {
  exec(sql: string, ...params: unknown[]): SqlQueryResult;
}

/**
 * Interface for Cloudflare Durable Object storage
 * Used by MondoDatabase and SchemaManager
 */
export interface DurableObjectStorage {
  sql: SqlStorage;
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  /**
   * Execute a synchronous callback wrapped in a transaction.
   * If the callback throws, the transaction is rolled back.
   * Only available for SQLite-backed Durable Objects.
   */
  transactionSync<T>(callback: () => T): T;
}

/**
 * Interface for SQL prepared statement
 * Used by IndexManager for prepared statement execution
 */
export interface SQLStatement {
  bind(...params: unknown[]): SQLStatement;
  run(): void;
  first<T = unknown>(): T | null;
  all<T = unknown>(): T[];
}

/**
 * Interface for SQLite-compatible storage with SQL execution
 * Used by IndexManager for prepared statement-based operations
 *
 * This is an alternative interface to DurableObjectStorage that provides
 * a prepare() method for creating prepared statements, which is useful
 * for operations that need to retrieve results or bind parameters.
 */
export interface SQLStorage {
  exec(sql: string): void;
  prepare(sql: string): SQLStatement;
}

// ============================================================================
// TTL INDEX TYPES
// ============================================================================
// These types support Time-To-Live (TTL) indexes for automatic document expiration

/**
 * TTL Index information with collection context
 */
export interface TTLIndexInfo {
  collectionName: string;
  collectionId: number;
  indexName: string;
  field: string;
  expireAfterSeconds: number;
}

/**
 * TTL metadata for tracking cleanup operations
 */
export interface TTLMetadata {
  field: string;
  expireAfterSeconds: number;
  lastCleanupAt?: string;
  lastCleanupCount?: number;
}

/**
 * Result of a TTL cleanup operation
 */
export interface TTLCleanupResult {
  ok: 1;
  collectionsProcessed: number;
  documentsDeleted: number;
  errors?: string[];
}

/**
 * Query info for deleting expired documents
 */
export interface ExpiredDocumentsQuery {
  sql: string;
  params: unknown[];
}

/**
 * Legacy migration type (kept for backwards compatibility)
 * @deprecated Use migrations module instead
 */
export type MigrationFn = (storage: DurableObjectStorage) => Promise<void>;

/**
 * Legacy migration registry (kept for backwards compatibility)
 * @deprecated Use migrations module instead
 */
export const MIGRATIONS: Record<number, MigrationFn> = Object.fromEntries(
  migrations.map((m) => [m.version, m.up])
);

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean;
  missingTables: string[];
  missingIndexes: string[];
  errors: string[];
}

/**
 * Required tables for schema integrity
 */
const REQUIRED_TABLES = ['collections', 'documents'];

/**
 * Required indexes for schema integrity
 */
const REQUIRED_INDEXES = ['idx_documents_id', 'idx_documents_collection_id'];

/**
 * SchemaManager handles SQLite schema initialization and migrations
 */
export class SchemaManager {
  private storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.storage = storage;

    // Validate migrations on construction
    const validation = validateMigrations();
    if (!validation.valid) {
      throw new Error(`Invalid migrations: ${validation.error}`);
    }
  }

  /**
   * Initialize the schema, running migrations if needed
   */
  async initializeSchema(): Promise<void> {
    const currentVersion = await this.storage.get<number>(SCHEMA_VERSION_KEY);

    // Skip if already at current version
    if (currentVersion === SCHEMA_VERSION) {
      return;
    }

    const startVersion = currentVersion ?? 0;

    // Get and run all applicable migrations
    const migrationsToRun = getMigrationsInRange(startVersion, SCHEMA_VERSION);

    for (const migration of migrationsToRun) {
      await migration.up(this.storage);
    }

    // Update schema version
    await this.storage.put(SCHEMA_VERSION_KEY, SCHEMA_VERSION);
  }

  /**
   * Validate that the schema is properly initialized
   * Returns true if all required tables exist
   */
  async validateSchema(): Promise<boolean> {
    const result = await this.validateSchemaDetailed();
    return result.valid;
  }

  /**
   * Detailed schema validation with specific error information
   */
  async validateSchemaDetailed(): Promise<SchemaValidationResult> {
    const result: SchemaValidationResult = {
      valid: true,
      missingTables: [],
      missingIndexes: [],
      errors: [],
    };

    try {
      // Check for required tables
      const tablesResult = this.storage.sql.exec(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('collections', 'documents')`
      );
      const tables = tablesResult.toArray() as { name: string }[];
      const tableNames = new Set(tables.map((t) => t.name));

      for (const requiredTable of REQUIRED_TABLES) {
        if (!tableNames.has(requiredTable)) {
          result.missingTables.push(requiredTable);
          result.valid = false;
        }
      }

      // Check for required indexes
      const indexesResult = this.storage.sql.exec(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`
      );
      const indexes = indexesResult.toArray() as { name: string }[];
      const indexNames = new Set(indexes.map((i) => i.name));

      for (const requiredIndex of REQUIRED_INDEXES) {
        if (!indexNames.has(requiredIndex)) {
          result.missingIndexes.push(requiredIndex);
          result.valid = false;
        }
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(
        error instanceof Error ? error.message : 'Unknown error during validation'
      );
    }

    return result;
  }

  /**
   * Get the current schema version from storage
   */
  async getSchemaVersion(): Promise<number> {
    const version = await this.storage.get<number>(SCHEMA_VERSION_KEY);
    return version ?? 0;
  }

  /**
   * Check if schema needs migration
   */
  async needsMigration(): Promise<boolean> {
    const currentVersion = await this.getSchemaVersion();
    return currentVersion < SCHEMA_VERSION;
  }

  /**
   * Get list of pending migrations
   */
  async getPendingMigrations(): Promise<number[]> {
    const currentVersion = await this.getSchemaVersion();
    const pending = getMigrationsInRange(currentVersion, SCHEMA_VERSION);
    return pending.map((m) => m.version);
  }
}
