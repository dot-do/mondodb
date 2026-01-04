/**
 * SQLite Schema Management for MondoDB
 *
 * This module handles the initialization and management of SQLite tables
 * for MongoDB-compatible document storage in Cloudflare Durable Objects.
 */

import {
  migrations,
  getMigrationsInRange,
  getLatestVersion,
  validateMigrations,
} from './migrations';

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
 */
export const SCHEMA_TABLES = {
  collections: {
    name: 'collections',
    sql: `
      CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        options TEXT DEFAULT '{}'
      )
    `.trim(),
  },
  documents: {
    name: 'documents',
    sql: `
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        _id TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL DEFAULT '{}',
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

/**
 * Interface for SQL query result with parameter binding
 */
export interface SqlQueryResult {
  toArray(): unknown[];
  run(): void;
  bind(...params: unknown[]): SqlQueryResult;
}

/**
 * Interface for Cloudflare Durable Object SQL storage
 */
export interface SqlStorage {
  exec(sql: string, ...params: unknown[]): SqlQueryResult;
}

/**
 * Interface for Cloudflare Durable Object storage
 */
export interface DurableObjectStorage {
  sql: SqlStorage;
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
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
