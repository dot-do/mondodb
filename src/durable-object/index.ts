/**
 * Durable Object exports for MondoDB
 */

export { MondoDatabase } from './mondo-database';
export type { DurableObjectState, Env } from './mondo-database';

export {
  SchemaManager,
  SCHEMA_VERSION,
  SCHEMA_VERSION_KEY,
  SCHEMA_TABLES,
  SCHEMA_INDEXES,
  MIGRATIONS,
} from './schema';
export type {
  SqlStorage,
  DurableObjectStorage,
  MigrationFn,
  SchemaValidationResult,
} from './schema';

export {
  migrations,
  getMigration,
  getMigrationsInRange,
  getLatestVersion,
  validateMigrations,
} from './migrations';
export type { Migration } from './migrations';

export {
  IndexManager,
  generateIndexName,
  generateSQLiteIndexName,
  buildCreateIndexSQL,
} from './index-manager';
export type { SQLStorage, SQLStatement } from './index-manager';
