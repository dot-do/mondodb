import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * AgentFS Virtual Filesystem - RED Phase Tests
 *
 * These tests define the expected API behavior for the AgentFS filesystem operations.
 * Tests are comprehensive and define the contract that the implementation must fulfill.
 */

// Type definitions for the filesystem operations we're testing
interface FileStat {
  type: 'file' | 'directory'
  size: number
  createdAt: Date
  updatedAt: Date
}

interface WriteOptions {
  metadata?: Record<string, unknown>
  encoding?: 'utf-8' | 'base64'
}

interface ReadOptions {
  encoding?: 'utf-8' | 'base64'
}

interface ReaddirEntry {
  name: string
  type: 'file' | 'directory'
}

interface MkdirOptions {
  recursive?: boolean
}

interface RmdirOptions {
  recursive?: boolean
}

/**
 * The Filesystem interface that we're testing against.
 * Implementation will need to provide these methods.
 */
interface Filesystem {
  // File operations
  writeFile(path: string, content: string, options?: WriteOptions): Promise<void>
  readFile(path: string, options?: ReadOptions): Promise<string | null>
  deleteFile(path: string): Promise<boolean>
  existsFile(path: string): Promise<boolean>
  statFile(path: string): Promise<FileStat | null>

  // Directory operations
  readdir(path: string): Promise<string[]>
  readdirWithTypes(path: string): Promise<ReaddirEntry[]>
  mkdir(path: string, options?: MkdirOptions): Promise<void>
  rmdir(path: string, options?: RmdirOptions): Promise<boolean>

  // Path utilities
  normalizePath(path: string): string
  isAbsolutePath(path: string): boolean
  dirname(path: string): string
  basename(path: string): string
  join(...paths: string[]): string
}

/**
 * Mock database interface for testing
 */
interface MockDocument {
  _id: string
  path: string
  content?: string
  type: 'file' | 'directory'
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

interface MockCollection {
  findOne: ReturnType<typeof vi.fn>
  insertOne: ReturnType<typeof vi.fn>
  updateOne: ReturnType<typeof vi.fn>
  deleteOne: ReturnType<typeof vi.fn>
  deleteMany: ReturnType<typeof vi.fn>
  find: ReturnType<typeof vi.fn>
  countDocuments: ReturnType<typeof vi.fn>
}

interface MockDatabase {
  collection: (name: string) => MockCollection
  _storage: Map<string, MockDocument>
}

/**
 * Create a mock database with in-memory storage for testing
 */
function createMockDatabase(): MockDatabase {
  const storage = new Map<string, MockDocument>()

  const mockCollection: MockCollection = {
    findOne: vi.fn(async (query: { _id?: string; path?: string | { $regex: string } }) => {
      if (query._id) {
        return storage.get(query._id) || null
      }
      if (typeof query.path === 'string') {
        return storage.get(query.path) || null
      }
      return null
    }),

    insertOne: vi.fn(async (doc: MockDocument) => {
      storage.set(doc._id || doc.path, doc)
      return { insertedId: doc._id || doc.path }
    }),

    updateOne: vi.fn(
      async (
        filter: { _id?: string; path?: string },
        update: { $set?: Partial<MockDocument>; $setOnInsert?: Partial<MockDocument> },
        options?: { upsert?: boolean }
      ) => {
        const key = filter._id || filter.path
        if (!key) return { matchedCount: 0, modifiedCount: 0 }

        const existing = storage.get(key)
        if (existing) {
          storage.set(key, { ...existing, ...update.$set })
          return { matchedCount: 1, modifiedCount: 1 }
        } else if (options?.upsert) {
          const newDoc = { ...update.$setOnInsert, ...update.$set } as MockDocument
          storage.set(key, newDoc)
          return { matchedCount: 0, modifiedCount: 0, upsertedId: key }
        }
        return { matchedCount: 0, modifiedCount: 0 }
      }
    ),

    deleteOne: vi.fn(async (filter: { _id?: string; path?: string }) => {
      const key = filter._id || filter.path
      if (key && storage.has(key)) {
        storage.delete(key)
        return { deletedCount: 1 }
      }
      return { deletedCount: 0 }
    }),

    deleteMany: vi.fn(async (filter: { path?: { $regex: string } }) => {
      let count = 0
      if (filter.path?.$regex) {
        const regex = new RegExp(filter.path.$regex)
        for (const [key, doc] of storage) {
          if (regex.test(doc.path)) {
            storage.delete(key)
            count++
          }
        }
      }
      return { deletedCount: count }
    }),

    find: vi.fn((query: { path?: string | { $regex: string } }) => ({
      toArray: async () => {
        const results: MockDocument[] = []
        if (query.path && typeof query.path === 'object' && '$regex' in query.path) {
          const regex = new RegExp(query.path.$regex)
          for (const doc of storage.values()) {
            if (regex.test(doc.path)) {
              results.push(doc)
            }
          }
        } else if (!query.path) {
          return Array.from(storage.values())
        }
        return results
      },
    })),

    countDocuments: vi.fn(async (query: { path?: { $regex: string } }) => {
      if (query.path?.$regex) {
        const regex = new RegExp(query.path.$regex)
        let count = 0
        for (const doc of storage.values()) {
          if (regex.test(doc.path)) {
            count++
          }
        }
        return count
      }
      return storage.size
    }),
  }

  return {
    collection: vi.fn(() => mockCollection),
    _storage: storage,
  }
}

/**
 * Stub implementation for RED phase testing.
 * This implementation provides minimal functionality to demonstrate failing tests.
 */
class StubFilesystem implements Filesystem {
  private db: MockDatabase
  private filesCollection = '__agentfs.files'

  constructor(db: MockDatabase) {
    this.db = db
  }

  // Path utilities
  normalizePath(path: string): string {
    if (!path || path === '') {
      throw new Error('Path cannot be empty')
    }
    // Remove duplicate slashes and trailing slash
    let normalized = path.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
    // Resolve . and .. components
    const parts = normalized.split('/').filter((p) => p !== '.')
    const resolved: string[] = []
    for (const part of parts) {
      if (part === '..') {
        resolved.pop()
      } else if (part) {
        resolved.push(part)
      }
    }
    return '/' + resolved.join('/')
  }

  isAbsolutePath(path: string): boolean {
    return path.startsWith('/')
  }

  dirname(path: string): string {
    const normalized = this.normalizePath(path)
    if (normalized === '/') return '/'
    const lastSlash = normalized.lastIndexOf('/')
    return lastSlash === 0 ? '/' : normalized.substring(0, lastSlash)
  }

  basename(path: string): string {
    const normalized = this.normalizePath(path)
    if (normalized === '/') return ''
    const lastSlash = normalized.lastIndexOf('/')
    return normalized.substring(lastSlash + 1)
  }

  join(...paths: string[]): string {
    if (paths.length === 0) return '/'
    const joined = paths.join('/')
    return this.normalizePath(joined)
  }

  private validateAbsolutePath(path: string): string {
    if (!this.isAbsolutePath(path)) {
      throw new Error(`Path must be absolute: ${path}`)
    }
    return this.normalizePath(path)
  }

  // File operations
  async writeFile(path: string, content: string, options?: WriteOptions): Promise<void> {
    const normalizedPath = this.validateAbsolutePath(path)
    const now = new Date()
    const collection = this.db.collection(this.filesCollection)

    const existing = await collection.findOne({ _id: normalizedPath })

    if (existing) {
      await collection.updateOne(
        { _id: normalizedPath },
        {
          $set: {
            content,
            metadata: options?.metadata || {},
            updatedAt: now,
          },
        }
      )
    } else {
      await collection.insertOne({
        _id: normalizedPath,
        path: normalizedPath,
        content,
        type: 'file',
        metadata: options?.metadata || {},
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  async readFile(path: string, _options?: ReadOptions): Promise<string | null> {
    const normalizedPath = this.validateAbsolutePath(path)
    const collection = this.db.collection(this.filesCollection)
    const doc = await collection.findOne({ _id: normalizedPath })

    if (!doc) {
      return null
    }

    if (doc.type === 'directory') {
      throw new Error(`EISDIR: illegal operation on a directory, read '${normalizedPath}'`)
    }

    return doc.content !== undefined ? doc.content : null
  }

  async deleteFile(path: string): Promise<boolean> {
    const normalizedPath = this.validateAbsolutePath(path)
    const collection = this.db.collection(this.filesCollection)
    const result = await collection.deleteOne({ _id: normalizedPath })
    return result.deletedCount > 0
  }

  async existsFile(path: string): Promise<boolean> {
    const normalizedPath = this.validateAbsolutePath(path)
    const collection = this.db.collection(this.filesCollection)
    const doc = await collection.findOne({ _id: normalizedPath })
    return doc !== null && doc.type === 'file'
  }

  async statFile(path: string): Promise<FileStat | null> {
    const normalizedPath = this.validateAbsolutePath(path)
    const collection = this.db.collection(this.filesCollection)
    const doc = await collection.findOne({ _id: normalizedPath })

    if (!doc) {
      return null
    }

    return {
      type: doc.type,
      size: doc.content?.length || 0,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    }
  }

  // Directory operations
  async readdir(path: string): Promise<string[]> {
    const normalizedPath = this.validateAbsolutePath(path)
    const collection = this.db.collection(this.filesCollection)
    const prefix = normalizedPath === '/' ? '' : normalizedPath

    const docs = await collection.find({ path: { $regex: `^${prefix}/[^/]+$` } }).toArray()
    const entries = new Set<string>()

    for (const doc of docs) {
      const basename = this.basename(doc.path)
      if (basename) entries.add(basename)
    }

    // Check for implicit directories from nested files
    const allDocs = await collection.find({ path: { $regex: `^${prefix}/` } }).toArray()
    for (const doc of allDocs) {
      const relativePath = doc.path.substring(prefix.length + 1)
      const firstSegment = relativePath.split('/')[0]
      if (firstSegment) entries.add(firstSegment)
    }

    return Array.from(entries).sort()
  }

  async readdirWithTypes(path: string): Promise<ReaddirEntry[]> {
    const normalizedPath = this.validateAbsolutePath(path)
    const collection = this.db.collection(this.filesCollection)
    const prefix = normalizedPath === '/' ? '' : normalizedPath

    const docs = await collection.find({ path: { $regex: `^${prefix}/[^/]+$` } }).toArray()
    const entries = new Map<string, ReaddirEntry>()

    for (const doc of docs) {
      const basename = this.basename(doc.path)
      if (basename) {
        entries.set(basename, { name: basename, type: doc.type })
      }
    }

    // Check for implicit directories from nested files
    const allDocs = await collection.find({ path: { $regex: `^${prefix}/` } }).toArray()
    for (const doc of allDocs) {
      const relativePath = doc.path.substring(prefix.length + 1)
      const firstSegment = relativePath.split('/')[0]
      if (firstSegment && !entries.has(firstSegment)) {
        entries.set(firstSegment, { name: firstSegment, type: 'directory' })
      }
    }

    return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    const normalizedPath = this.validateAbsolutePath(path)
    const collection = this.db.collection(this.filesCollection)
    const now = new Date()

    // Check if already exists
    const existing = await collection.findOne({ _id: normalizedPath })
    if (existing) {
      if (existing.type === 'file') {
        throw new Error(`EEXIST: file already exists, '${normalizedPath}'`)
      }
      return // Directory already exists, no-op
    }

    // Create parent directories if recursive
    if (options?.recursive) {
      const parts = normalizedPath.split('/').filter(Boolean)
      let currentPath = ''
      for (const part of parts.slice(0, -1)) {
        currentPath += '/' + part
        const parentExists = await collection.findOne({ _id: currentPath })
        if (!parentExists) {
          await collection.insertOne({
            _id: currentPath,
            path: currentPath,
            type: 'directory',
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }

    await collection.insertOne({
      _id: normalizedPath,
      path: normalizedPath,
      type: 'directory',
      createdAt: now,
      updatedAt: now,
    })
  }

  async rmdir(path: string, options?: RmdirOptions): Promise<boolean> {
    const normalizedPath = this.validateAbsolutePath(path)

    if (normalizedPath === '/') {
      throw new Error(`EPERM: operation not permitted, rmdir '/'`)
    }

    const collection = this.db.collection(this.filesCollection)
    const prefix = normalizedPath

    // Check if directory exists
    const existing = await collection.findOne({ _id: normalizedPath })

    // Check for contents
    const childDocs = await collection.find({ path: { $regex: `^${prefix}/` } }).toArray()

    if (childDocs.length > 0) {
      if (options?.recursive) {
        // Delete all children
        await collection.deleteMany({ path: { $regex: `^${prefix}/` } })
      } else {
        throw new Error(`ENOTEMPTY: directory not empty, '${normalizedPath}'`)
      }
    }

    if (!existing) {
      // Directory doesn't exist explicitly, but may be implicit
      if (childDocs.length === 0) {
        return false
      }
    } else {
      await collection.deleteOne({ _id: normalizedPath })
    }

    return true
  }
}

describe('AgentFS Filesystem', () => {
  let mockDb: MockDatabase
  let fs: Filesystem

  beforeEach(() => {
    mockDb = createMockDatabase()
    fs = new StubFilesystem(mockDb)
  })

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  describe('writeFile', () => {
    it('creates new file with content', async () => {
      await fs.writeFile('/test.txt', 'hello world')
      const result = await fs.readFile('/test.txt')
      expect(result).toBe('hello world')
    })

    it('creates file with empty content', async () => {
      await fs.writeFile('/empty.txt', '')
      const result = await fs.readFile('/empty.txt')
      expect(result).toBe('')
    })

    it('updates existing file content', async () => {
      await fs.writeFile('/test.txt', 'version 1')
      await fs.writeFile('/test.txt', 'version 2')
      const result = await fs.readFile('/test.txt')
      expect(result).toBe('version 2')
    })

    it('preserves createdAt timestamp when updating', async () => {
      await fs.writeFile('/test.txt', 'version 1')
      const stat1 = await fs.statFile('/test.txt')

      await new Promise((resolve) => setTimeout(resolve, 10))

      await fs.writeFile('/test.txt', 'version 2')
      const stat2 = await fs.statFile('/test.txt')

      expect(stat2!.createdAt.getTime()).toBe(stat1!.createdAt.getTime())
    })

    it('updates updatedAt timestamp when modifying', async () => {
      await fs.writeFile('/test.txt', 'version 1')
      const stat1 = await fs.statFile('/test.txt')

      await new Promise((resolve) => setTimeout(resolve, 10))

      await fs.writeFile('/test.txt', 'version 2')
      const stat2 = await fs.statFile('/test.txt')

      expect(stat2!.updatedAt.getTime()).toBeGreaterThan(stat1!.updatedAt.getTime())
    })

    it('handles unicode content correctly', async () => {
      const unicodeContent = 'Hello World \u4e16\u754c \ud83d\udc4b \u00e9\u00e0\u00fc'
      await fs.writeFile('/unicode.txt', unicodeContent)
      const result = await fs.readFile('/unicode.txt')
      expect(result).toBe(unicodeContent)
    })

    it('handles large file content', async () => {
      const largeContent = 'x'.repeat(1024 * 1024) // 1MB
      await fs.writeFile('/large.txt', largeContent)
      const result = await fs.readFile('/large.txt')
      expect(result).toBe(largeContent)
    })

    it('handles binary content as base64', async () => {
      const binaryBase64 = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]).toString('base64')
      await fs.writeFile('/binary.bin', binaryBase64, { encoding: 'base64' })
      const result = await fs.readFile('/binary.bin')
      expect(result).toBe(binaryBase64)
    })

    it('stores optional metadata', async () => {
      await fs.writeFile('/doc.md', '# Title', {
        metadata: { mimeType: 'text/markdown', author: 'test' },
      })
      const stat = await fs.statFile('/doc.md')
      expect(stat).not.toBeNull()
    })

    it('creates nested path implicitly', async () => {
      await fs.writeFile('/a/b/c/file.txt', 'content')
      const result = await fs.readFile('/a/b/c/file.txt')
      expect(result).toBe('content')
    })

    it('throws error for relative path', async () => {
      await expect(fs.writeFile('relative/path.txt', 'content')).rejects.toThrow(
        /path must be absolute/i
      )
    })

    it('throws error for empty path', async () => {
      await expect(fs.writeFile('', 'content')).rejects.toThrow()
    })

    it('normalizes double slashes in path', async () => {
      await fs.writeFile('//path//to//file.txt', 'content')
      const result = await fs.readFile('/path/to/file.txt')
      expect(result).toBe('content')
    })

    it('normalizes trailing slash in path', async () => {
      await fs.writeFile('/path/to/file.txt/', 'content')
      const result = await fs.readFile('/path/to/file.txt')
      expect(result).toBe('content')
    })
  })

  describe('readFile', () => {
    it('returns content for existing file', async () => {
      await fs.writeFile('/test.txt', 'hello')
      const result = await fs.readFile('/test.txt')
      expect(result).toBe('hello')
    })

    it('returns null for non-existent file', async () => {
      const result = await fs.readFile('/nonexistent.txt')
      expect(result).toBeNull()
    })

    it('returns empty string for file with empty content', async () => {
      await fs.writeFile('/empty.txt', '')
      const result = await fs.readFile('/empty.txt')
      expect(result).toBe('')
    })

    it('throws error when reading directory as file', async () => {
      await fs.mkdir('/mydir')
      await expect(fs.readFile('/mydir')).rejects.toThrow(/EISDIR|is a directory/i)
    })

    it('throws error for relative path', async () => {
      await expect(fs.readFile('relative.txt')).rejects.toThrow(/path must be absolute/i)
    })

    it('normalizes path before reading', async () => {
      await fs.writeFile('/path/file.txt', 'content')
      const result = await fs.readFile('//path//file.txt')
      expect(result).toBe('content')
    })
  })

  describe('deleteFile', () => {
    it('removes existing file', async () => {
      await fs.writeFile('/test.txt', 'content')
      const result = await fs.deleteFile('/test.txt')
      expect(result).toBe(true)
      expect(await fs.existsFile('/test.txt')).toBe(false)
    })

    it('returns false for non-existent file', async () => {
      const result = await fs.deleteFile('/nonexistent.txt')
      expect(result).toBe(false)
    })

    it('throws error for relative path', async () => {
      await expect(fs.deleteFile('relative.txt')).rejects.toThrow(/path must be absolute/i)
    })

    it('handles deletion of file with empty content', async () => {
      await fs.writeFile('/empty.txt', '')
      const result = await fs.deleteFile('/empty.txt')
      expect(result).toBe(true)
    })

    it('allows deletion of file in nested path', async () => {
      await fs.writeFile('/a/b/c/file.txt', 'content')
      const result = await fs.deleteFile('/a/b/c/file.txt')
      expect(result).toBe(true)
    })
  })

  describe('existsFile', () => {
    it('returns true for existing file', async () => {
      await fs.writeFile('/test.txt', 'content')
      const result = await fs.existsFile('/test.txt')
      expect(result).toBe(true)
    })

    it('returns false for non-existent file', async () => {
      const result = await fs.existsFile('/nonexistent.txt')
      expect(result).toBe(false)
    })

    it('returns false for directory path', async () => {
      await fs.mkdir('/mydir')
      const result = await fs.existsFile('/mydir')
      expect(result).toBe(false)
    })

    it('throws error for relative path', async () => {
      await expect(fs.existsFile('relative.txt')).rejects.toThrow(/path must be absolute/i)
    })

    it('returns true for file after write', async () => {
      await fs.writeFile('/new-file.txt', 'content')
      expect(await fs.existsFile('/new-file.txt')).toBe(true)
    })

    it('returns false for file after deletion', async () => {
      await fs.writeFile('/temp.txt', 'content')
      await fs.deleteFile('/temp.txt')
      expect(await fs.existsFile('/temp.txt')).toBe(false)
    })
  })

  describe('statFile', () => {
    it('returns metadata for existing file', async () => {
      await fs.writeFile('/test.txt', 'hello world')
      const stat = await fs.statFile('/test.txt')

      expect(stat).not.toBeNull()
      expect(stat!.type).toBe('file')
      expect(stat!.size).toBe(11)
      expect(stat!.createdAt).toBeInstanceOf(Date)
      expect(stat!.updatedAt).toBeInstanceOf(Date)
    })

    it('returns metadata for directory', async () => {
      await fs.mkdir('/mydir')
      const stat = await fs.statFile('/mydir')

      expect(stat).not.toBeNull()
      expect(stat!.type).toBe('directory')
      expect(stat!.size).toBe(0)
    })

    it('returns null for non-existent path', async () => {
      const stat = await fs.statFile('/nonexistent')
      expect(stat).toBeNull()
    })

    it('calculates correct size for content', async () => {
      await fs.writeFile('/test.txt', 'abc123')
      const stat = await fs.statFile('/test.txt')
      expect(stat!.size).toBe(6)
    })

    it('calculates size for empty content', async () => {
      await fs.writeFile('/empty.txt', '')
      const stat = await fs.statFile('/empty.txt')
      expect(stat!.size).toBe(0)
    })

    it('throws error for relative path', async () => {
      await expect(fs.statFile('relative')).rejects.toThrow(/path must be absolute/i)
    })

    it('timestamps are valid Date objects', async () => {
      const before = new Date()
      await fs.writeFile('/test.txt', 'content')
      const after = new Date()

      const stat = await fs.statFile('/test.txt')
      expect(stat!.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(stat!.createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  // ============================================================================
  // DIRECTORY OPERATIONS
  // ============================================================================

  describe('readdir', () => {
    it('lists files in directory', async () => {
      await fs.writeFile('/src/file1.txt', 'content1')
      await fs.writeFile('/src/file2.txt', 'content2')
      await fs.writeFile('/src/file3.txt', 'content3')

      const entries = await fs.readdir('/src')
      expect(entries).toHaveLength(3)
      expect(entries).toContain('file1.txt')
      expect(entries).toContain('file2.txt')
      expect(entries).toContain('file3.txt')
    })

    it('lists subdirectories', async () => {
      await fs.mkdir('/src/components')
      await fs.mkdir('/src/utils')
      await fs.writeFile('/src/index.ts', 'export {}')

      const entries = await fs.readdir('/src')
      expect(entries).toContain('components')
      expect(entries).toContain('utils')
      expect(entries).toContain('index.ts')
    })

    it('returns empty array for empty directory', async () => {
      await fs.mkdir('/empty')
      const entries = await fs.readdir('/empty')
      expect(entries).toEqual([])
    })

    it('only lists direct children, not nested files', async () => {
      await fs.writeFile('/src/index.ts', 'export {}')
      await fs.writeFile('/src/components/Button.tsx', 'export {}')
      await fs.writeFile('/src/components/nested/Input.tsx', 'export {}')

      const entries = await fs.readdir('/src')
      expect(entries).toContain('index.ts')
      expect(entries).toContain('components')
      expect(entries).not.toContain('Button.tsx')
      expect(entries).not.toContain('Input.tsx')
      expect(entries).not.toContain('nested')
    })

    it('handles root directory listing', async () => {
      await fs.writeFile('/file.txt', 'content')
      await fs.mkdir('/dir')

      const entries = await fs.readdir('/')
      expect(entries).toContain('file.txt')
      expect(entries).toContain('dir')
    })

    it('shows implicit directories from nested files', async () => {
      await fs.writeFile('/project/src/app/index.ts', 'content')

      const entries = await fs.readdir('/project')
      expect(entries).toContain('src')
    })

    it('returns sorted entries', async () => {
      await fs.writeFile('/dir/zebra.txt', 'z')
      await fs.writeFile('/dir/apple.txt', 'a')
      await fs.writeFile('/dir/banana.txt', 'b')

      const entries = await fs.readdir('/dir')
      expect(entries).toEqual(['apple.txt', 'banana.txt', 'zebra.txt'])
    })

    it('throws error for relative path', async () => {
      await expect(fs.readdir('relative')).rejects.toThrow(/path must be absolute/i)
    })
  })

  describe('readdirWithTypes', () => {
    it('returns entries with type information', async () => {
      await fs.writeFile('/src/index.ts', 'export {}')
      await fs.mkdir('/src/lib')

      const entries = await fs.readdirWithTypes('/src')

      const fileEntry = entries.find((e) => e.name === 'index.ts')
      expect(fileEntry).toBeDefined()
      expect(fileEntry!.type).toBe('file')

      const dirEntry = entries.find((e) => e.name === 'lib')
      expect(dirEntry).toBeDefined()
      expect(dirEntry!.type).toBe('directory')
    })

    it('identifies implicit directories as directory type', async () => {
      await fs.writeFile('/project/src/index.ts', 'export {}')

      const entries = await fs.readdirWithTypes('/project')
      const srcEntry = entries.find((e) => e.name === 'src')
      expect(srcEntry).toBeDefined()
      expect(srcEntry!.type).toBe('directory')
    })
  })

  describe('mkdir', () => {
    it('creates a new directory', async () => {
      await fs.mkdir('/newdir')
      const stat = await fs.statFile('/newdir')
      expect(stat).not.toBeNull()
      expect(stat!.type).toBe('directory')
    })

    it('creates directory with correct timestamps', async () => {
      const before = new Date()
      await fs.mkdir('/newdir')
      const after = new Date()

      const stat = await fs.statFile('/newdir')
      expect(stat!.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(stat!.createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('is idempotent - creating same directory twice succeeds', async () => {
      await fs.mkdir('/mydir')
      await expect(fs.mkdir('/mydir')).resolves.not.toThrow()
    })

    it('throws error if file exists at path', async () => {
      await fs.writeFile('/myfile', 'content')
      await expect(fs.mkdir('/myfile')).rejects.toThrow(/EEXIST|already exists/i)
    })

    it('creates nested directories with recursive option', async () => {
      await fs.mkdir('/a/b/c', { recursive: true })

      expect((await fs.statFile('/a'))?.type).toBe('directory')
      expect((await fs.statFile('/a/b'))?.type).toBe('directory')
      expect((await fs.statFile('/a/b/c'))?.type).toBe('directory')
    })

    it('throws error for relative path', async () => {
      await expect(fs.mkdir('relative/path')).rejects.toThrow(/path must be absolute/i)
    })

    it('normalizes path before creating', async () => {
      await fs.mkdir('//double//slash//')
      const stat = await fs.statFile('/double/slash')
      expect(stat).not.toBeNull()
      expect(stat!.type).toBe('directory')
    })
  })

  describe('rmdir', () => {
    it('removes empty directory', async () => {
      await fs.mkdir('/mydir')
      const result = await fs.rmdir('/mydir')
      expect(result).toBe(true)
      expect(await fs.statFile('/mydir')).toBeNull()
    })

    it('returns false for non-existent directory', async () => {
      const result = await fs.rmdir('/nonexistent')
      expect(result).toBe(false)
    })

    it('throws error for non-empty directory', async () => {
      await fs.mkdir('/mydir')
      await fs.writeFile('/mydir/file.txt', 'content')

      await expect(fs.rmdir('/mydir')).rejects.toThrow(/ENOTEMPTY|not empty/i)
    })

    it('removes non-empty directory with recursive option', async () => {
      await fs.mkdir('/mydir')
      await fs.writeFile('/mydir/file.txt', 'content')
      await fs.writeFile('/mydir/subdir/nested.txt', 'nested')

      const result = await fs.rmdir('/mydir', { recursive: true })
      expect(result).toBe(true)
      expect(await fs.statFile('/mydir')).toBeNull()
      expect(await fs.readFile('/mydir/file.txt')).toBeNull()
    })

    it('throws error when removing root directory', async () => {
      await expect(fs.rmdir('/')).rejects.toThrow(/EPERM|operation not permitted/i)
    })

    it('throws error for relative path', async () => {
      await expect(fs.rmdir('relative')).rejects.toThrow(/path must be absolute/i)
    })
  })

  // ============================================================================
  // PATH HANDLING
  // ============================================================================

  describe('path handling', () => {
    describe('normalizePath', () => {
      it('preserves simple absolute path', () => {
        expect(fs.normalizePath('/simple/path')).toBe('/simple/path')
      })

      it('removes duplicate slashes', () => {
        expect(fs.normalizePath('//double//slashes//')).toBe('/double/slashes')
      })

      it('removes trailing slash', () => {
        expect(fs.normalizePath('/path/with/trailing/')).toBe('/path/with/trailing')
      })

      it('preserves root path', () => {
        expect(fs.normalizePath('/')).toBe('/')
      })

      it('adds leading slash if missing', () => {
        expect(fs.normalizePath('no/leading/slash')).toBe('/no/leading/slash')
      })

      it('resolves . in path', () => {
        expect(fs.normalizePath('/path/./to/./file')).toBe('/path/to/file')
      })

      it('resolves .. in path', () => {
        expect(fs.normalizePath('/path/to/../file')).toBe('/path/file')
      })

      it('handles complex path with . and ..', () => {
        expect(fs.normalizePath('/a/b/../c/./d/../e')).toBe('/a/c/e')
      })

      it('throws error for empty path', () => {
        expect(() => fs.normalizePath('')).toThrow()
      })
    })

    describe('isAbsolutePath', () => {
      it('returns true for path starting with /', () => {
        expect(fs.isAbsolutePath('/absolute')).toBe(true)
      })

      it('returns false for relative path', () => {
        expect(fs.isAbsolutePath('relative')).toBe(false)
      })

      it('returns false for path starting with .', () => {
        expect(fs.isAbsolutePath('./relative')).toBe(false)
      })

      it('returns true for root path', () => {
        expect(fs.isAbsolutePath('/')).toBe(true)
      })
    })

    describe('dirname', () => {
      it('returns parent directory of file', () => {
        expect(fs.dirname('/path/to/file.txt')).toBe('/path/to')
      })

      it('returns / for file in root', () => {
        expect(fs.dirname('/file.txt')).toBe('/')
      })

      it('returns / for root', () => {
        expect(fs.dirname('/')).toBe('/')
      })

      it('handles trailing slash', () => {
        expect(fs.dirname('/path/to/dir/')).toBe('/path/to')
      })
    })

    describe('basename', () => {
      it('returns filename from path', () => {
        expect(fs.basename('/path/to/file.txt')).toBe('file.txt')
      })

      it('returns directory name', () => {
        expect(fs.basename('/path/to/dir')).toBe('dir')
      })

      it('returns empty string for root', () => {
        expect(fs.basename('/')).toBe('')
      })

      it('handles trailing slash', () => {
        expect(fs.basename('/path/to/dir/')).toBe('dir')
      })
    })

    describe('join', () => {
      it('joins path segments', () => {
        expect(fs.join('/path', 'to', 'file.txt')).toBe('/path/to/file.txt')
      })

      it('normalizes result', () => {
        expect(fs.join('/path/', '/to/', 'file.txt')).toBe('/path/to/file.txt')
      })

      it('handles empty segments', () => {
        expect(fs.join('/path', '', 'file.txt')).toBe('/path/file.txt')
      })

      it('returns / for empty args', () => {
        expect(fs.join()).toBe('/')
      })
    })

    describe('all operations require absolute paths', () => {
      it('writeFile rejects relative path', async () => {
        await expect(fs.writeFile('relative.txt', 'content')).rejects.toThrow(
          /path must be absolute/i
        )
      })

      it('readFile rejects relative path', async () => {
        await expect(fs.readFile('relative.txt')).rejects.toThrow(/path must be absolute/i)
      })

      it('deleteFile rejects relative path', async () => {
        await expect(fs.deleteFile('relative.txt')).rejects.toThrow(/path must be absolute/i)
      })

      it('existsFile rejects relative path', async () => {
        await expect(fs.existsFile('relative.txt')).rejects.toThrow(/path must be absolute/i)
      })

      it('statFile rejects relative path', async () => {
        await expect(fs.statFile('relative.txt')).rejects.toThrow(/path must be absolute/i)
      })

      it('readdir rejects relative path', async () => {
        await expect(fs.readdir('relative')).rejects.toThrow(/path must be absolute/i)
      })

      it('mkdir rejects relative path', async () => {
        await expect(fs.mkdir('relative')).rejects.toThrow(/path must be absolute/i)
      })

      it('rmdir rejects relative path', async () => {
        await expect(fs.rmdir('relative')).rejects.toThrow(/path must be absolute/i)
      })
    })
  })

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('edge cases', () => {
    it('reading non-existent file returns null', async () => {
      const result = await fs.readFile('/does/not/exist.txt')
      expect(result).toBeNull()
    })

    it('writing to deeply nested path works', async () => {
      await fs.writeFile('/a/b/c/d/e/f/g/h/file.txt', 'deep content')
      const result = await fs.readFile('/a/b/c/d/e/f/g/h/file.txt')
      expect(result).toBe('deep content')
    })

    it('overwriting existing file updates timestamp', async () => {
      vi.useFakeTimers()
      const startTime = new Date('2024-01-01T00:00:00Z')
      vi.setSystemTime(startTime)

      await fs.writeFile('/test.txt', 'v1')
      const stat1 = await fs.statFile('/test.txt')

      // Advance time by 1 second
      vi.advanceTimersByTime(1000)

      await fs.writeFile('/test.txt', 'v2')
      const stat2 = await fs.statFile('/test.txt')

      expect(stat2!.updatedAt.getTime()).toBeGreaterThan(stat1!.updatedAt.getTime())

      vi.useRealTimers()
    })

    it('empty content handling - write and read', async () => {
      await fs.writeFile('/empty.txt', '')
      const content = await fs.readFile('/empty.txt')
      expect(content).toBe('')

      const stat = await fs.statFile('/empty.txt')
      expect(stat!.size).toBe(0)
    })

    it('handles special characters in path', async () => {
      await fs.writeFile('/path with spaces/file.txt', 'content')
      const result = await fs.readFile('/path with spaces/file.txt')
      expect(result).toBe('content')
    })

    it('handles special characters in filename', async () => {
      await fs.writeFile('/file-with-dashes_and_underscores.txt', 'content')
      expect(await fs.existsFile('/file-with-dashes_and_underscores.txt')).toBe(true)
    })

    it('handles dot files', async () => {
      await fs.writeFile('/.hidden', 'secret')
      await fs.writeFile('/.gitignore', '*.log')

      expect(await fs.readFile('/.hidden')).toBe('secret')
      expect(await fs.readFile('/.gitignore')).toBe('*.log')
    })

    it('handles files starting with double dots', async () => {
      await fs.writeFile('/..config', 'content')
      expect(await fs.readFile('/..config')).toBe('content')
    })

    it('concurrent writes to same file - last write wins', async () => {
      const writes = Promise.all([
        fs.writeFile('/concurrent.txt', 'write-1'),
        fs.writeFile('/concurrent.txt', 'write-2'),
        fs.writeFile('/concurrent.txt', 'write-3'),
      ])

      await writes
      const result = await fs.readFile('/concurrent.txt')
      expect(['write-1', 'write-2', 'write-3']).toContain(result)
    })

    it('handles very long path names', async () => {
      const longSegment = 'a'.repeat(100)
      const longPath = `/${longSegment}/${longSegment}/${longSegment}/file.txt`
      await fs.writeFile(longPath, 'content')
      expect(await fs.readFile(longPath)).toBe('content')
    })

    it('handles very long filenames', async () => {
      const longFilename = 'x'.repeat(200) + '.txt'
      await fs.writeFile(`/${longFilename}`, 'content')
      expect(await fs.existsFile(`/${longFilename}`)).toBe(true)
    })

    it('distinguishes between file and directory with same base name', async () => {
      await fs.writeFile('/item', 'this is a file')
      await fs.mkdir('/itemdir')

      expect((await fs.statFile('/item'))?.type).toBe('file')
      expect((await fs.statFile('/itemdir'))?.type).toBe('directory')
    })

    it('handles null bytes in content', async () => {
      const contentWithNull = 'before\x00after'
      await fs.writeFile('/null.bin', contentWithNull)
      const result = await fs.readFile('/null.bin')
      expect(result).toBe(contentWithNull)
    })

    it('handles newlines in content', async () => {
      const multiline = 'line1\nline2\r\nline3\rline4'
      await fs.writeFile('/multiline.txt', multiline)
      const result = await fs.readFile('/multiline.txt')
      expect(result).toBe(multiline)
    })
  })

  // ============================================================================
  // INTEGRATION SCENARIOS
  // ============================================================================

  describe('integration scenarios', () => {
    it('creates project structure', async () => {
      // Create a typical project structure
      await fs.mkdir('/project/src', { recursive: true })
      await fs.mkdir('/project/test', { recursive: true })
      await fs.writeFile('/project/package.json', '{"name": "test"}')
      await fs.writeFile('/project/src/index.ts', 'export const main = () => {}')
      await fs.writeFile('/project/test/index.test.ts', 'test("main", () => {})')

      // Verify structure
      const rootEntries = await fs.readdir('/project')
      expect(rootEntries).toContain('src')
      expect(rootEntries).toContain('test')
      expect(rootEntries).toContain('package.json')

      const srcEntries = await fs.readdir('/project/src')
      expect(srcEntries).toContain('index.ts')
    })

    it('file move simulation (copy + delete)', async () => {
      await fs.writeFile('/old/location/file.txt', 'content')

      // Read from old location
      const content = await fs.readFile('/old/location/file.txt')

      // Write to new location
      await fs.writeFile('/new/location/file.txt', content!)

      // Delete old location
      await fs.deleteFile('/old/location/file.txt')

      // Verify
      expect(await fs.readFile('/old/location/file.txt')).toBeNull()
      expect(await fs.readFile('/new/location/file.txt')).toBe('content')
    })

    it('recursive directory deletion', async () => {
      // Create nested structure
      await fs.writeFile('/to-delete/a/file1.txt', 'content1')
      await fs.writeFile('/to-delete/a/b/file2.txt', 'content2')
      await fs.writeFile('/to-delete/c/file3.txt', 'content3')

      // Delete recursively
      await fs.rmdir('/to-delete', { recursive: true })

      // Verify all gone
      expect(await fs.statFile('/to-delete')).toBeNull()
      expect(await fs.readFile('/to-delete/a/file1.txt')).toBeNull()
      expect(await fs.readFile('/to-delete/a/b/file2.txt')).toBeNull()
    })

    it('directory listing after modifications', async () => {
      await fs.writeFile('/mutable/file1.txt', 'content1')
      await fs.writeFile('/mutable/file2.txt', 'content2')

      let entries = await fs.readdir('/mutable')
      expect(entries).toHaveLength(2)

      // Add a file
      await fs.writeFile('/mutable/file3.txt', 'content3')
      entries = await fs.readdir('/mutable')
      expect(entries).toHaveLength(3)

      // Delete a file
      await fs.deleteFile('/mutable/file1.txt')
      entries = await fs.readdir('/mutable')
      expect(entries).toHaveLength(2)
      expect(entries).not.toContain('file1.txt')
    })
  })
})
