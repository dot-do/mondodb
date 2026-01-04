/**
 * Security Tests: Path Traversal Prevention in Database Names
 *
 * Tests that the LocalSQLiteBackend properly sanitizes database names
 * to prevent path traversal attacks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { LocalSQLiteBackend } from '../../../src/wire/backend/local-sqlite'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('LocalSQLiteBackend - Path Traversal Security', () => {
  let backend: LocalSQLiteBackend
  let testDataDir: string

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDataDir = path.join(os.tmpdir(), `mondodb-security-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(testDataDir, { recursive: true })
    backend = new LocalSQLiteBackend(testDataDir)
  })

  afterEach(() => {
    backend.close()
    // Clean up test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true })
    }
  })

  describe('Path Traversal Prevention', () => {
    it('should reject database names with ../', () => {
      expect(() => {
        backend['getDatabase']('../../../etc/passwd')
      }).toThrow('Invalid database name "../../../etc/passwd": contains path traversal characters')
    })

    it('should reject database names with forward slashes', () => {
      expect(() => {
        backend['getDatabase']('foo/bar')
      }).toThrow('Invalid database name "foo/bar": contains path traversal characters')
    })

    it('should reject database names with backslashes', () => {
      expect(() => {
        backend['getDatabase']('foo\\bar')
      }).toThrow('Invalid database name "foo\\bar": contains path traversal characters')
    })

    it('should reject database names starting with a dot', () => {
      expect(() => {
        backend['getDatabase']('.hidden')
      }).toThrow('Invalid database name ".hidden": cannot start with a dot')
    })

    it('should reject database names with null bytes', () => {
      expect(() => {
        backend['getDatabase']('test\0evil')
      }).toThrow('Invalid database name: contains null byte')
    })

    it('should reject empty database names', () => {
      expect(() => {
        backend['getDatabase']('')
      }).toThrow('Database name must be a non-empty string')
    })

    it('should reject database names with special characters', () => {
      expect(() => {
        backend['getDatabase']("test'; DROP TABLE users;--")
      }).toThrow('only alphanumeric characters, underscores, and hyphens are allowed')
    })

    it('should reject very long database names', () => {
      const longName = 'a'.repeat(256)
      expect(() => {
        backend['getDatabase'](longName)
      }).toThrow('Database name too long: 256 characters (max 255)')
    })
  })

  describe('Valid Database Names', () => {
    it('should accept simple alphanumeric names', () => {
      expect(() => {
        backend['getDatabase']('mydb')
      }).not.toThrow()
    })

    it('should accept names with underscores', () => {
      expect(() => {
        backend['getDatabase']('my_database')
      }).not.toThrow()
    })

    it('should accept names with hyphens', () => {
      expect(() => {
        backend['getDatabase']('my-database')
      }).not.toThrow()
    })

    it('should accept names with numbers', () => {
      expect(() => {
        backend['getDatabase']('db123')
      }).not.toThrow()
    })

    it('should accept mixed alphanumeric with underscores and hyphens', () => {
      expect(() => {
        backend['getDatabase']('My_Database-v2')
      }).not.toThrow()
    })

    it('should accept admin database', () => {
      expect(() => {
        backend['getDatabase']('admin')
      }).not.toThrow()
    })

    it('should accept test database', () => {
      expect(() => {
        backend['getDatabase']('test')
      }).not.toThrow()
    })
  })

  describe('Database Operations with Path Traversal Attempts', () => {
    it('should throw on createDatabase with path traversal', async () => {
      await expect(backend.createDatabase('../../../tmp/evil')).rejects.toThrow(
        'contains path traversal characters'
      )
    })

    it('should throw on dropDatabase with path traversal', async () => {
      await expect(backend.dropDatabase('../../../etc/passwd')).rejects.toThrow(
        'contains path traversal characters'
      )
    })

    it('should throw on databaseExists with path traversal', async () => {
      await expect(backend.databaseExists('../../../etc/passwd')).rejects.toThrow(
        'contains path traversal characters'
      )
    })

    it('should throw on listCollections with path traversal in dbName', async () => {
      await expect(backend.listCollections('../../../etc/passwd')).rejects.toThrow(
        'contains path traversal characters'
      )
    })

    it('should throw on insertOne with path traversal in dbName', async () => {
      await expect(backend.insertOne('../../../etc/passwd', 'test', { foo: 'bar' })).rejects.toThrow(
        'contains path traversal characters'
      )
    })

    it('should throw on find with path traversal in dbName', async () => {
      await expect(backend.find('../../../etc/passwd', 'test', {})).rejects.toThrow(
        'contains path traversal characters'
      )
    })
  })

  describe('Filesystem Isolation', () => {
    it('should not create files outside the data directory', async () => {
      const parentDir = path.dirname(testDataDir)
      const evilFilePath = path.join(parentDir, 'evil.sqlite')

      // Ensure the evil file doesn't exist before the test
      if (fs.existsSync(evilFilePath)) {
        fs.unlinkSync(evilFilePath)
      }

      // Attempt to create a database with path traversal (should fail)
      try {
        await backend.createDatabase('../evil')
      } catch {
        // Expected to throw
      }

      // Verify no file was created outside the data directory
      expect(fs.existsSync(evilFilePath)).toBe(false)
    })

    it('should create database files only within the data directory', async () => {
      await backend.createDatabase('legitimate')

      const expectedPath = path.join(testDataDir, 'legitimate.sqlite')
      expect(fs.existsSync(expectedPath)).toBe(true)

      // Verify no other files were created in parent directories
      const parentDir = path.dirname(testDataDir)
      const filesInParent = fs.readdirSync(parentDir)
      const sqliteFilesInParent = filesInParent.filter((f) => f.endsWith('.sqlite'))
      expect(sqliteFilesInParent.length).toBe(0)
    })
  })

  describe('Collection Name Validation', () => {
    it('should reject empty collection names', async () => {
      await expect(backend.createCollection('test', '')).rejects.toThrow(
        'Collection name must be a non-empty string'
      )
    })

    it('should reject collection names with null bytes', async () => {
      await expect(backend.createCollection('test', 'coll\0evil')).rejects.toThrow(
        'Invalid collection name: contains null byte'
      )
    })

    it('should reject collection names that are too long', async () => {
      const longName = 'a'.repeat(256)
      await expect(backend.createCollection('test', longName)).rejects.toThrow(
        'Collection name too long: 256 characters (max 255)'
      )
    })

    it('should reject collection names starting with numbers', async () => {
      await expect(backend.createCollection('test', '123collection')).rejects.toThrow(
        'must start with a letter or underscore'
      )
    })

    it('should reject collection names with special characters', async () => {
      await expect(backend.createCollection('test', 'coll@name')).rejects.toThrow(
        'must start with a letter or underscore'
      )
    })

    it('should reject reserved system. prefix', async () => {
      await expect(backend.createCollection('test', 'system.evil')).rejects.toThrow(
        'cannot use reserved \'system.\' prefix'
      )
    })

    it('should accept valid collection names', async () => {
      // createCollection returns void, so we just verify it doesn't throw
      await backend.createCollection('test', 'valid_collection')
      await backend.createCollection('test', '_privateCollection')
      await backend.createCollection('test', 'collection-v2')
      await backend.createCollection('test', 'collection.subname')
      // Verify collections were created
      expect(await backend.collectionExists('test', 'valid_collection')).toBe(true)
      expect(await backend.collectionExists('test', '_privateCollection')).toBe(true)
      expect(await backend.collectionExists('test', 'collection-v2')).toBe(true)
      expect(await backend.collectionExists('test', 'collection.subname')).toBe(true)
    })

    it('should accept known system collections', async () => {
      // createCollection returns void, so we just verify it doesn't throw
      await backend.createCollection('test', 'system.users')
      await backend.createCollection('test', 'system.indexes')
      expect(await backend.collectionExists('test', 'system.users')).toBe(true)
      expect(await backend.collectionExists('test', 'system.indexes')).toBe(true)
    })

    it('should throw on dropCollection with invalid name', async () => {
      await expect(backend.dropCollection('test', '')).rejects.toThrow(
        'Collection name must be a non-empty string'
      )
    })

    it('should throw on collectionExists with invalid name', async () => {
      await expect(backend.collectionExists('test', '')).rejects.toThrow(
        'Collection name must be a non-empty string'
      )
    })

    it('should throw on insertMany with invalid collection name', async () => {
      await expect(backend.insertMany('test', '', [{ foo: 'bar' }])).rejects.toThrow(
        'Collection name must be a non-empty string'
      )
    })

    it('should throw on find with invalid collection name', async () => {
      await expect(backend.find('test', '', {})).rejects.toThrow(
        'Collection name must be a non-empty string'
      )
    })

    it('should throw on updateOne with invalid collection name', async () => {
      await expect(backend.updateOne('test', '', {}, { $set: { foo: 'bar' } })).rejects.toThrow(
        'Collection name must be a non-empty string'
      )
    })

    it('should throw on deleteOne with invalid collection name', async () => {
      await expect(backend.deleteOne('test', '', {})).rejects.toThrow(
        'Collection name must be a non-empty string'
      )
    })
  })
})
