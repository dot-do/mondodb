/**
 * Schema Migrations for MondoDB
 *
 * This module contains all schema migrations in a separate, organized structure.
 * Each migration is a function that transforms the database from one version to the next.
 */

import type { DurableObjectStorage } from './schema';

/**
 * Migration function signature
 */
export type Migration = {
  version: number;
  description: string;
  up: (storage: DurableObjectStorage) => Promise<void>;
  down?: (storage: DurableObjectStorage) => Promise<void>;
};

/**
 * SQL statements for initial schema (v1)
 *
 * UNIFIED SCHEMA: This schema supports both MondoDatabase and IndexManager:
 * - collections table: stores collection metadata including indexes JSON
 * - documents table: stores documents with _id as the document identifier
 *
 * Both components import these definitions from schema.ts which re-exports them.
 */
const INITIAL_SCHEMA_SQL = {
  createCollections: `
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      options TEXT DEFAULT '{}',
      indexes TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `.trim(),

  createDocuments: `
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

  createIdIndex: `
    CREATE INDEX IF NOT EXISTS idx_documents_id ON documents(_id)
  `.trim(),

  createCompositeIndex: `
    CREATE INDEX IF NOT EXISTS idx_documents_collection_id ON documents(collection_id, _id)
  `.trim(),
};

/**
 * All migrations in order
 */
export const migrations: Migration[] = [
  {
    version: 1,
    description: 'Initial schema - collections and documents tables',
    up: async (storage: DurableObjectStorage) => {
      // Create tables
      storage.sql.exec(INITIAL_SCHEMA_SQL.createCollections);
      storage.sql.exec(INITIAL_SCHEMA_SQL.createDocuments);

      // Create indexes for optimized queries
      storage.sql.exec(INITIAL_SCHEMA_SQL.createIdIndex);
      storage.sql.exec(INITIAL_SCHEMA_SQL.createCompositeIndex);
    },
    down: async (storage: DurableObjectStorage) => {
      // Drop in reverse order
      storage.sql.exec('DROP INDEX IF EXISTS idx_documents_collection_id');
      storage.sql.exec('DROP INDEX IF EXISTS idx_documents_id');
      storage.sql.exec('DROP TABLE IF EXISTS documents');
      storage.sql.exec('DROP TABLE IF EXISTS collections');
    },
  },
];

/**
 * Get migration by version number
 */
export function getMigration(version: number): Migration | undefined {
  return migrations.find((m) => m.version === version);
}

/**
 * Get all migrations from a starting version to an ending version
 */
export function getMigrationsInRange(
  fromVersion: number,
  toVersion: number
): Migration[] {
  return migrations.filter(
    (m) => m.version > fromVersion && m.version <= toVersion
  );
}

/**
 * Get the latest migration version
 */
export function getLatestVersion(): number {
  if (migrations.length === 0) return 0;
  return Math.max(...migrations.map((m) => m.version));
}

/**
 * Validate migration sequence - ensures no gaps in version numbers
 */
export function validateMigrations(): { valid: boolean; error?: string } {
  if (migrations.length === 0) {
    return { valid: true };
  }

  const sortedVersions = [...migrations].sort((a, b) => a.version - b.version);

  // Check for duplicates
  const seen = new Set<number>();
  for (const migration of sortedVersions) {
    if (seen.has(migration.version)) {
      return {
        valid: false,
        error: `Duplicate migration version: ${migration.version}`,
      };
    }
    seen.add(migration.version);
  }

  // Check for gaps (starting from 1)
  for (let i = 0; i < sortedVersions.length; i++) {
    if (sortedVersions[i].version !== i + 1) {
      return {
        valid: false,
        error: `Missing migration version: ${i + 1}`,
      };
    }
  }

  return { valid: true };
}
