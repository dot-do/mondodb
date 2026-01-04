/**
 * Integration tests for SQLite schema initialization
 * These tests verify that the MondoDatabase Durable Object properly initializes
 * the SQLite schema for MongoDB-compatible storage.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MondoDatabase } from '../../src/durable-object/mondo-database';
import { SchemaManager, SCHEMA_VERSION, SCHEMA_TABLES } from '../../src/durable-object/schema';

// Mock types for Cloudflare Durable Object storage
interface MockSqlStorage {
  exec: ReturnType<typeof vi.fn>;
}

interface MockStorage {
  sql: MockSqlStorage;
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
}

interface MockState {
  storage: MockStorage;
  blockConcurrencyWhile: ReturnType<typeof vi.fn>;
}

function createMockState(): MockState {
  const mockSql: MockSqlStorage = {
    exec: vi.fn().mockReturnValue({ toArray: () => [] }),
  };

  const mockStorage: MockStorage = {
    sql: mockSql,
    get: vi.fn(),
    put: vi.fn(),
  };

  const mockState: MockState = {
    storage: mockStorage,
    blockConcurrencyWhile: vi.fn(async (callback: () => Promise<void>) => {
      await callback();
    }),
  };

  return mockState;
}

describe('SQLite Schema Initialization', () => {
  let mockState: MockState;

  beforeEach(() => {
    mockState = createMockState();
    vi.clearAllMocks();
  });

  describe('Schema creates collections table', () => {
    it('should create collections table with correct structure', async () => {
      const schemaManager = new SchemaManager(mockState.storage as any);
      await schemaManager.initializeSchema();

      const execCalls = mockState.storage.sql.exec.mock.calls;
      const createTableCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE TABLE') && call[0].includes('collections')
      );

      expect(createTableCalls.length).toBeGreaterThan(0);
      const createCollectionsSQL = createTableCalls[0][0];
      expect(createCollectionsSQL).toContain('id INTEGER PRIMARY KEY');
      expect(createCollectionsSQL).toContain('name TEXT');
      expect(createCollectionsSQL).toContain('UNIQUE');
      expect(createCollectionsSQL).toContain('options TEXT');
    });
  });

  describe('Schema creates documents table with JSON storage', () => {
    it('should create documents table with correct structure', async () => {
      const schemaManager = new SchemaManager(mockState.storage as any);
      await schemaManager.initializeSchema();

      const execCalls = mockState.storage.sql.exec.mock.calls;
      const createTableCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE TABLE') && call[0].includes('documents')
      );

      expect(createTableCalls.length).toBeGreaterThan(0);
      const createDocumentsSQL = createTableCalls[0][0];
      expect(createDocumentsSQL).toContain('id INTEGER PRIMARY KEY');
      expect(createDocumentsSQL).toContain('collection_id INTEGER');
      expect(createDocumentsSQL).toContain('_id TEXT');
      expect(createDocumentsSQL).toContain('UNIQUE');
      expect(createDocumentsSQL).toContain('data TEXT');
    });

    it('should have foreign key reference to collections table', async () => {
      const schemaManager = new SchemaManager(mockState.storage as any);
      await schemaManager.initializeSchema();

      const execCalls = mockState.storage.sql.exec.mock.calls;
      const createTableCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE TABLE') && call[0].includes('documents')
      );

      expect(createTableCalls.length).toBeGreaterThan(0);
      const createDocumentsSQL = createTableCalls[0][0];
      expect(createDocumentsSQL).toContain('REFERENCES collections');
    });
  });

  describe('Schema creates _id index', () => {
    it('should create index on documents._id for fast lookups', async () => {
      const schemaManager = new SchemaManager(mockState.storage as any);
      await schemaManager.initializeSchema();

      const execCalls = mockState.storage.sql.exec.mock.calls;
      const createIndexCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE INDEX') && call[0].includes('_id')
      );

      expect(createIndexCalls.length).toBeGreaterThan(0);
      const createIndexSQL = createIndexCalls[0][0];
      expect(createIndexSQL).toContain('documents');
      expect(createIndexSQL).toContain('_id');
    });

    it('should create composite index on collection_id and _id', async () => {
      const schemaManager = new SchemaManager(mockState.storage as any);
      await schemaManager.initializeSchema();

      const execCalls = mockState.storage.sql.exec.mock.calls;
      const createIndexCalls = execCalls.filter((call: string[]) =>
        call[0].includes('CREATE INDEX') && call[0].includes('collection_id')
      );

      expect(createIndexCalls.length).toBeGreaterThan(0);
    });
  });

  describe('blockConcurrencyWhile ensures atomic init', () => {
    it('should use blockConcurrencyWhile for atomic schema initialization', async () => {
      const mondoDb = new MondoDatabase(mockState as any, {} as any);

      expect(mockState.blockConcurrencyWhile).toHaveBeenCalled();
    });

    it('should only initialize schema once even with concurrent requests', async () => {
      mockState.storage.get.mockResolvedValue(undefined);

      const mondoDb = new MondoDatabase(mockState as any, {} as any);

      // Simulate that blockConcurrencyWhile was called
      expect(mockState.blockConcurrencyWhile).toHaveBeenCalledTimes(1);
    });
  });

  describe('Schema version tracking', () => {
    it('should store schema version in storage', async () => {
      mockState.storage.get.mockResolvedValue(undefined);

      const schemaManager = new SchemaManager(mockState.storage as any);
      await schemaManager.initializeSchema();

      expect(mockState.storage.put).toHaveBeenCalledWith(
        'schema_version',
        SCHEMA_VERSION
      );
    });

    it('should skip initialization if schema version matches', async () => {
      mockState.storage.get.mockResolvedValue(SCHEMA_VERSION);

      const schemaManager = new SchemaManager(mockState.storage as any);
      await schemaManager.initializeSchema();

      // Should not execute any SQL if version matches
      expect(mockState.storage.sql.exec).not.toHaveBeenCalled();
    });

    it('should run migrations if schema version is older', async () => {
      mockState.storage.get.mockResolvedValue(0); // Old version

      const schemaManager = new SchemaManager(mockState.storage as any);
      await schemaManager.initializeSchema();

      // Should execute SQL for migration
      expect(mockState.storage.sql.exec).toHaveBeenCalled();
      // Should update version
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'schema_version',
        SCHEMA_VERSION
      );
    });

    it('should export current SCHEMA_VERSION', () => {
      expect(typeof SCHEMA_VERSION).toBe('number');
      expect(SCHEMA_VERSION).toBeGreaterThan(0);
    });
  });

  describe('Schema table definitions', () => {
    it('should export SCHEMA_TABLES constant with table definitions', () => {
      expect(SCHEMA_TABLES).toBeDefined();
      expect(SCHEMA_TABLES.collections).toBeDefined();
      expect(SCHEMA_TABLES.documents).toBeDefined();
    });
  });

  describe('SchemaManager integration', () => {
    it('should validate schema integrity after initialization', async () => {
      mockState.storage.get.mockResolvedValue(undefined);

      // Mock the table and index check queries
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes("type='table'")) {
          return {
            toArray: () => [
              { name: 'collections' },
              { name: 'documents' },
            ],
          };
        }
        if (sql.includes("type='index'")) {
          return {
            toArray: () => [
              { name: 'idx_documents_id' },
              { name: 'idx_documents_collection_id' },
            ],
          };
        }
        return { toArray: () => [] };
      });

      const schemaManager = new SchemaManager(mockState.storage as any);
      await schemaManager.initializeSchema();
      const isValid = await schemaManager.validateSchema();

      expect(isValid).toBe(true);
    });

    it('should return false for invalid schema', async () => {
      mockState.storage.get.mockResolvedValue(SCHEMA_VERSION);

      // Mock missing tables and indexes
      mockState.storage.sql.exec.mockImplementation((sql: string) => {
        if (sql.includes('sqlite_master')) {
          return {
            toArray: () => [], // No tables or indexes found
          };
        }
        return { toArray: () => [] };
      });

      const schemaManager = new SchemaManager(mockState.storage as any);
      const isValid = await schemaManager.validateSchema();

      expect(isValid).toBe(false);
    });
  });
});
