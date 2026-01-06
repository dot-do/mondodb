/**
 * libSQL Database Connection Unit Tests (RED Phase)
 *
 * TDD RED: These tests verify libSQL database connection and file path handling.
 * They will fail until the LibSQLStorageAdapter is implemented in src/storage/libsql-adapter.ts
 *
 * Issue: mondodb-1cii - RED: Test libSQL database connection and file path
 *
 * Tests verify:
 * 1. libSQL connects successfully with a file path
 * 2. The database file is created at `.mongo/[database].db` path
 * 3. Connection can be closed properly
 * 4. Multiple connections to the same database work
 *
 * Note: These tests are designed for TDD RED phase - they import a module that doesn't exist yet.
 * When the LibSQLStorageAdapter is implemented, the file system tests should verify actual file creation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// This import will fail initially - RED phase
// The LibSQLStorageAdapter doesn't exist yet and must be created to make tests pass
import { LibSQLStorageAdapter } from '../../../src/storage/libsql-adapter'

describe('LibSQLStorageAdapter Connection', () => {
  let adapter: LibSQLStorageAdapter

  afterEach(async () => {
    // Clean up: close adapter if it exists
    if (adapter && adapter.isConnected && adapter.isConnected()) {
      await adapter.close()
    }
  })

  describe('File Path Connection', () => {
    it('should connect successfully with a file path', async () => {
      adapter = new LibSQLStorageAdapter({
        database: 'testdb',
        dataDir: '/tmp/libsql-test',
      })

      // Adapter should be created without throwing
      expect(adapter).toBeInstanceOf(LibSQLStorageAdapter)

      // The adapter should have a connected state
      expect(adapter.isConnected()).toBe(true)
    })

    it('should create database file at .mongo/[database].db path', async () => {
      const databaseName = 'myappdb'

      adapter = new LibSQLStorageAdapter({
        database: databaseName,
        dataDir: '/tmp/libsql-test',
      })

      // Verify we can get the database path from the adapter
      const expectedPath = '/tmp/libsql-test/.mongo/myappdb.db'
      expect(adapter.getDatabasePath()).toBe(expectedPath)
    })

    it('should create .mongo directory structure in path', async () => {
      adapter = new LibSQLStorageAdapter({
        database: 'newdb',
        dataDir: '/tmp/libsql-test-new',
      })

      // The path should include .mongo subdirectory
      expect(adapter.getDatabasePath()).toContain('.mongo')
      expect(adapter.getDatabasePath()).toContain('newdb.db')
    })

    it('should handle database names with special characters', async () => {
      const databaseName = 'my-app_db.v2'

      adapter = new LibSQLStorageAdapter({
        database: databaseName,
        dataDir: '/tmp/libsql-test',
      })

      expect(adapter.getDatabasePath()).toContain(`${databaseName}.db`)
    })
  })

  describe('Connection Close', () => {
    it('should close connection properly', async () => {
      adapter = new LibSQLStorageAdapter({
        database: 'closetest',
        dataDir: '/tmp/libsql-test',
      })

      expect(adapter.isConnected()).toBe(true)

      await adapter.close()

      expect(adapter.isConnected()).toBe(false)
    })

    it('should not throw when closing an already closed connection', async () => {
      adapter = new LibSQLStorageAdapter({
        database: 'doubleclose',
        dataDir: '/tmp/libsql-test',
      })

      await adapter.close()
      // Second close should not throw
      await expect(adapter.close()).resolves.not.toThrow()
    })

    it('should throw error when performing operations after close', async () => {
      adapter = new LibSQLStorageAdapter({
        database: 'opsafterclose',
        dataDir: '/tmp/libsql-test',
      })

      await adapter.close()

      // Operations after close should throw
      await expect(
        adapter.insertOne('collection', { name: 'test' })
      ).rejects.toThrow(/closed|not connected/i)
    })
  })

  describe('Multiple Connections', () => {
    it('should allow multiple connections to the same database', async () => {
      const databaseName = 'shareddb'
      const dataDir = '/tmp/libsql-test-multi'

      const adapter1 = new LibSQLStorageAdapter({
        database: databaseName,
        dataDir,
      })

      const adapter2 = new LibSQLStorageAdapter({
        database: databaseName,
        dataDir,
      })

      expect(adapter1.isConnected()).toBe(true)
      expect(adapter2.isConnected()).toBe(true)

      // Both should point to the same database file
      expect(adapter1.getDatabasePath()).toBe(adapter2.getDatabasePath())

      // Clean up both adapters
      await adapter1.close()
      await adapter2.close()

      // Set adapter to adapter1 for afterEach cleanup (already closed)
      adapter = adapter1
    })

    it('should share data between multiple connections to the same database', async () => {
      const databaseName = `datashare-${Date.now()}`
      const dataDir = '/tmp/libsql-test-share'

      const adapter1 = new LibSQLStorageAdapter({
        database: databaseName,
        dataDir,
      })

      // Insert data through first connection
      await adapter1.insertOne('users', { _id: 'user1', name: 'Alice' })

      const adapter2 = new LibSQLStorageAdapter({
        database: databaseName,
        dataDir,
      })

      // Read data through second connection
      const user = await adapter2.findOne('users', { _id: 'user1' })

      expect(user).toBeDefined()
      expect(user?.name).toBe('Alice')

      // Clean up
      await adapter1.close()
      await adapter2.close()
      adapter = adapter1
    })

    it('should allow connections to different databases simultaneously', async () => {
      const dataDir = '/tmp/libsql-test-different'

      const adapter1 = new LibSQLStorageAdapter({
        database: 'database1',
        dataDir,
      })

      const adapter2 = new LibSQLStorageAdapter({
        database: 'database2',
        dataDir,
      })

      expect(adapter1.isConnected()).toBe(true)
      expect(adapter2.isConnected()).toBe(true)

      // They should have different database paths
      expect(adapter1.getDatabasePath()).not.toBe(adapter2.getDatabasePath())
      expect(adapter1.getDatabasePath()).toContain('database1.db')
      expect(adapter2.getDatabasePath()).toContain('database2.db')

      // Clean up
      await adapter1.close()
      await adapter2.close()
      adapter = adapter1
    })

    it('should handle concurrent operations on the same database', async () => {
      const databaseName = `concurrentdb-${Date.now()}`
      const dataDir = '/tmp/libsql-test-concurrent'

      const adapter1 = new LibSQLStorageAdapter({
        database: databaseName,
        dataDir,
      })

      const adapter2 = new LibSQLStorageAdapter({
        database: databaseName,
        dataDir,
      })

      // Perform concurrent inserts
      const [result1, result2] = await Promise.all([
        adapter1.insertOne('items', { _id: 'item1', value: 1 }),
        adapter2.insertOne('items', { _id: 'item2', value: 2 }),
      ])

      expect(result1.acknowledged).toBe(true)
      expect(result2.acknowledged).toBe(true)

      // Verify both items exist
      const items = await adapter1.find('items', {})
      expect(items).toHaveLength(2)

      // Clean up
      await adapter1.close()
      await adapter2.close()
      adapter = adapter1
    })
  })

  describe('Configuration Options', () => {
    it('should accept custom data directory', async () => {
      const customDir = '/tmp/libsql-custom-data'

      adapter = new LibSQLStorageAdapter({
        database: 'customdb',
        dataDir: customDir,
      })

      const expectedPath = `${customDir}/.mongo/customdb.db`
      expect(adapter.getDatabasePath()).toBe(expectedPath)
    })

    it('should use default data directory when not specified', async () => {
      // When dataDir is not specified, it should use current working directory
      adapter = new LibSQLStorageAdapter({
        database: 'defaultdirdb',
      })

      // The path should contain .mongo and the database name
      expect(adapter.getDatabasePath()).toContain('.mongo')
      expect(adapter.getDatabasePath()).toContain('defaultdirdb.db')
    })

    it('should accept libsql connection options', async () => {
      adapter = new LibSQLStorageAdapter({
        database: 'optionsdb',
        dataDir: '/tmp/libsql-test-options',
        options: {
          // libsql-specific options like journal mode, synchronous mode, etc.
          journalMode: 'WAL',
        },
      })

      expect(adapter.isConnected()).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should throw error for invalid database name', async () => {
      expect(() => {
        new LibSQLStorageAdapter({
          database: '', // Empty database name
          dataDir: '/tmp/libsql-test',
        })
      }).toThrow(/invalid.*database.*name/i)
    })

    it('should throw error for database name with path separators', async () => {
      expect(() => {
        new LibSQLStorageAdapter({
          database: 'path/to/db', // Path separators not allowed
          dataDir: '/tmp/libsql-test',
        })
      }).toThrow(/invalid.*database.*name/i)
    })
  })

  describe('StorageAdapter Interface Compliance', () => {
    it('should implement required StorageAdapter methods', async () => {
      adapter = new LibSQLStorageAdapter({
        database: 'interfacetest',
        dataDir: '/tmp/libsql-test-interface',
      })

      // Verify all StorageAdapter methods exist
      expect(typeof adapter.insertOne).toBe('function')
      expect(typeof adapter.insertMany).toBe('function')
      expect(typeof adapter.findOne).toBe('function')
      expect(typeof adapter.find).toBe('function')
      expect(typeof adapter.updateOne).toBe('function')
      expect(typeof adapter.updateMany).toBe('function')
      expect(typeof adapter.deleteOne).toBe('function')
      expect(typeof adapter.deleteMany).toBe('function')
      expect(typeof adapter.countDocuments).toBe('function')
      expect(typeof adapter.close).toBe('function')
    })

    it('should implement additional libsql-specific methods', async () => {
      adapter = new LibSQLStorageAdapter({
        database: 'specifictest',
        dataDir: '/tmp/libsql-test-specific',
      })

      // Verify libsql-specific methods
      expect(typeof adapter.isConnected).toBe('function')
      expect(typeof adapter.getDatabasePath).toBe('function')
    })
  })
})
