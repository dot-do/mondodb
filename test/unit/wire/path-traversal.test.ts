/**
 * Security Tests: Path Traversal Prevention in Database Names
 *
 * Tests that the validation functions properly sanitize database and collection names
 * to prevent path traversal attacks.
 */

import { describe, it, expect } from 'vitest'
import {
  sanitizeDatabaseName,
  validateCollectionName,
} from '../../../src/wire/backend/validation.js'

describe('Database Name Validation - Path Traversal Security', () => {
  describe('Path Traversal Prevention', () => {
    it('should reject database names with ../', () => {
      expect(() => {
        sanitizeDatabaseName('../../../etc/passwd')
      }).toThrow('Invalid database name "../../../etc/passwd": contains path traversal characters')
    })

    it('should reject database names with forward slashes', () => {
      expect(() => {
        sanitizeDatabaseName('foo/bar')
      }).toThrow('Invalid database name "foo/bar": contains path traversal characters')
    })

    it('should reject database names with backslashes', () => {
      expect(() => {
        sanitizeDatabaseName('foo\\bar')
      }).toThrow('Invalid database name "foo\\bar": contains path traversal characters')
    })

    it('should reject database names starting with a dot', () => {
      expect(() => {
        sanitizeDatabaseName('.hidden')
      }).toThrow('Invalid database name ".hidden": cannot start with a dot')
    })

    it('should reject database names with null bytes', () => {
      expect(() => {
        sanitizeDatabaseName('test\0evil')
      }).toThrow('Invalid database name: contains null byte')
    })

    it('should reject empty database names', () => {
      expect(() => {
        sanitizeDatabaseName('')
      }).toThrow('Database name must be a non-empty string')
    })

    it('should reject database names with special characters', () => {
      expect(() => {
        sanitizeDatabaseName("test'; DROP TABLE users;--")
      }).toThrow('only alphanumeric characters, underscores, and hyphens are allowed')
    })

    it('should reject very long database names', () => {
      const longName = 'a'.repeat(256)
      expect(() => {
        sanitizeDatabaseName(longName)
      }).toThrow('Database name too long: 256 characters (max 255)')
    })
  })

  describe('Valid Database Names', () => {
    it('should accept simple alphanumeric names', () => {
      expect(() => {
        sanitizeDatabaseName('mydb')
      }).not.toThrow()
    })

    it('should accept names with underscores', () => {
      expect(() => {
        sanitizeDatabaseName('my_database')
      }).not.toThrow()
    })

    it('should accept names with hyphens', () => {
      expect(() => {
        sanitizeDatabaseName('my-database')
      }).not.toThrow()
    })

    it('should accept names with numbers', () => {
      expect(() => {
        sanitizeDatabaseName('db123')
      }).not.toThrow()
    })

    it('should accept mixed alphanumeric with underscores and hyphens', () => {
      expect(() => {
        sanitizeDatabaseName('My_Database-v2')
      }).not.toThrow()
    })

    it('should accept admin database', () => {
      expect(() => {
        sanitizeDatabaseName('admin')
      }).not.toThrow()
    })

    it('should accept test database', () => {
      expect(() => {
        sanitizeDatabaseName('test')
      }).not.toThrow()
    })

    it('should return the sanitized name', () => {
      expect(sanitizeDatabaseName('mydb')).toBe('mydb')
      expect(sanitizeDatabaseName('my_database')).toBe('my_database')
      expect(sanitizeDatabaseName('My-Database123')).toBe('My-Database123')
    })
  })
})

describe('Collection Name Validation', () => {
  it('should reject empty collection names', () => {
    expect(() => validateCollectionName('')).toThrow(
      'Collection name must be a non-empty string'
    )
  })

  it('should reject collection names with null bytes', () => {
    expect(() => validateCollectionName('coll\0evil')).toThrow(
      'Invalid collection name: contains null byte'
    )
  })

  it('should reject collection names that are too long', () => {
    const longName = 'a'.repeat(256)
    expect(() => validateCollectionName(longName)).toThrow(
      'Collection name too long: 256 characters (max 255)'
    )
  })

  it('should reject collection names starting with numbers', () => {
    expect(() => validateCollectionName('123collection')).toThrow(
      'must start with a letter or underscore'
    )
  })

  it('should reject collection names with special characters', () => {
    expect(() => validateCollectionName('coll@name')).toThrow(
      'must start with a letter or underscore'
    )
  })

  it('should reject reserved system. prefix', () => {
    expect(() => validateCollectionName('system.evil')).toThrow(
      "cannot use reserved 'system.' prefix"
    )
  })

  it('should accept valid collection names', () => {
    expect(() => validateCollectionName('valid_collection')).not.toThrow()
    expect(() => validateCollectionName('_privateCollection')).not.toThrow()
    expect(() => validateCollectionName('collection-v2')).not.toThrow()
    expect(() => validateCollectionName('collection.subname')).not.toThrow()
  })

  it('should accept known system collections', () => {
    expect(() => validateCollectionName('system.users')).not.toThrow()
    expect(() => validateCollectionName('system.indexes')).not.toThrow()
    expect(() => validateCollectionName('system.namespaces')).not.toThrow()
  })

  it('should return the validated name', () => {
    expect(validateCollectionName('myCollection')).toBe('myCollection')
    expect(validateCollectionName('_private')).toBe('_private')
    expect(validateCollectionName('system.users')).toBe('system.users')
  })
})
