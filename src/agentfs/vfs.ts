/**
 * AgentFS Virtual Filesystem Implementation
 *
 * Virtual filesystem stored in MondoDB collections.
 * Provides a file-system-like interface backed by MongoDB/MondoDB.
 *
 * @module agentfs/vfs
 *
 * @example
 * ```typescript
 * import { AgentFilesystem } from './vfs'
 *
 * const fs = new AgentFilesystem(database)
 *
 * // Write and read files
 * await fs.writeFile('/config.json', '{"key": "value"}')
 * const content = await fs.readFile('/config.json')
 *
 * // Directory operations
 * await fs.mkdir('/src')
 * const files = await fs.readdir('/src')
 *
 * // Glob pattern matching
 * const tsFiles = await fs.glob('**\/*.ts')
 * ```
 */

import type { FileSystem, FileStat, FileType } from './types'

/**
 * Database interface for AgentFilesystem operations.
 *
 * This interface abstracts the underlying MongoDB-compatible database,
 * allowing the filesystem to work with any compatible backend.
 * Methods take the collection name as the first parameter.
 */
export interface AgentFSDatabase {
  /** Find a single document matching the query */
  findOne(collection: string, query: Record<string, unknown>): Promise<Record<string, unknown> | null>
  /** Find all documents matching the query */
  find(collection: string, query: Record<string, unknown>): Promise<Record<string, unknown>[]>
  /** Insert a new document */
  insertOne(collection: string, document: Record<string, unknown>): Promise<{ insertedId: string }>
  /** Update a single document matching the filter */
  updateOne(
    collection: string,
    filter: Record<string, unknown>,
    update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
    options?: { upsert?: boolean }
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: string }>
  /** Delete a single document matching the filter */
  deleteOne(collection: string, filter: Record<string, unknown>): Promise<{ deletedCount: number }>
  /** Delete all documents matching the filter */
  deleteMany(collection: string, filter: Record<string, unknown>): Promise<{ deletedCount: number }>
}

/**
 * Internal file document structure stored in the database.
 * @internal
 */
interface FileDocument {
  _id: string
  path: string
  content: string
  type: FileType
  createdAt: Date
  updatedAt: Date
}

/**
 * AgentFilesystem - Virtual filesystem backed by MondoDB
 *
 * Implements the FileSystem interface using a MongoDB-compatible database.
 * Uses the file path as the document _id for O(1) lookups.
 *
 * Features:
 * - Files and directories with proper POSIX-like semantics
 * - Implicit parent directory creation
 * - Path normalization (removes duplicate slashes, resolves . and ..)
 * - Glob pattern matching for file discovery
 *
 * Error codes follow POSIX conventions:
 * - ENOENT: File or directory does not exist
 * - EISDIR: Illegal operation on a directory
 * - ENOTDIR: Not a directory
 * - EEXIST: File already exists
 * - ENOTEMPTY: Directory not empty
 * - EPERM: Operation not permitted
 *
 * @example
 * ```typescript
 * const fs = new AgentFilesystem(database)
 *
 * // Create and read files
 * await fs.writeFile('/data/config.json', '{}')
 * const content = await fs.readFile('/data/config.json')
 *
 * // Directories are created implicitly
 * const stat = await fs.stat('/data')
 * // stat.type === 'directory'
 * ```
 */
export class AgentFilesystem implements FileSystem {
  private db: AgentFSDatabase
  private collection = '__agentfs.files'

  /**
   * Create a new AgentFilesystem instance.
   *
   * @param db - Database backend implementing AgentFSDatabase interface
   */
  constructor(db: AgentFSDatabase) {
    this.db = db
  }

  /**
   * Normalize a path to ensure consistency.
   *
   * Normalization rules:
   * - Always starts with /
   * - No duplicate slashes (// becomes /)
   * - No trailing slash (except for root)
   * - Resolves . (current directory) components
   * - Resolves .. (parent directory) components
   *
   * @param path - Path to normalize
   * @returns Normalized absolute path
   * @internal
   */
  private normalizePath(path: string): string {
    // Handle empty path
    if (!path) {
      return '/'
    }

    // Add leading slash if missing (normalize relative paths)
    if (!path.startsWith('/')) {
      path = '/' + path
    }

    // Replace multiple slashes with single slash
    path = path.replace(/\/+/g, '/')

    // Remove trailing slash (unless it's the root)
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1)
    }

    // Resolve . and .. components
    const parts = path.split('/')
    const resolved: string[] = []

    for (const part of parts) {
      if (part === '' || part === '.') {
        continue
      } else if (part === '..') {
        if (resolved.length > 0) {
          resolved.pop()
        }
      } else {
        resolved.push(part)
      }
    }

    return '/' + resolved.join('/') || '/'
  }

  /**
   * Escape special regex characters in a string.
   *
   * @param str - String to escape
   * @returns String with regex special characters escaped
   * @internal
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * Read file content at the specified path.
   *
   * @param path - Absolute path to the file
   * @returns Promise resolving to the file content as a string
   * @throws {Error} ENOENT if file does not exist
   * @throws {Error} EISDIR if path is a directory
   */
  async readFile(path: string): Promise<string> {
    const normalizedPath = this.normalizePath(path)

    const doc = await this.db.findOne(this.collection, { _id: normalizedPath }) as FileDocument | null

    if (!doc) {
      throw new Error(`ENOENT: no such file or directory, '${normalizedPath}'`)
    }

    if (doc.type === 'directory') {
      throw new Error(`EISDIR: illegal operation on a directory, '${normalizedPath}'`)
    }

    return doc.content
  }

  /**
   * Write content to a file at the specified path.
   *
   * Creates parent directories implicitly if they don't exist.
   * If the file exists, it updates the content and updatedAt timestamp.
   * If the file doesn't exist, it creates a new file with createdAt set.
   *
   * @param path - Absolute path to the file
   * @param content - Content to write to the file
   * @throws {Error} EISDIR if path is a directory
   */
  async writeFile(path: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(path)
    const now = new Date()

    // Check if file exists to determine createdAt behavior
    const existing = await this.db.findOne(this.collection, { _id: normalizedPath }) as FileDocument | null

    if (existing) {
      if (existing.type === 'directory') {
        throw new Error(`EISDIR: illegal operation on a directory, '${normalizedPath}'`)
      }
      // Update existing file - preserve createdAt
      await this.db.updateOne(
        this.collection,
        { _id: normalizedPath },
        {
          $set: {
            content,
            updatedAt: now,
          },
        }
      )
    } else {
      // Create implicit parent directories
      await this.createImplicitDirs(normalizedPath)

      // Insert new file
      await this.db.insertOne(this.collection, {
        _id: normalizedPath,
        path: normalizedPath,
        content,
        type: 'file',
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  /**
   * Create implicit parent directories for a file path.
   *
   * Traverses up the path and creates any missing directory entries.
   *
   * @param filePath - Absolute path to the file (not the directory)
   * @internal
   */
  private async createImplicitDirs(filePath: string): Promise<void> {
    const parts = filePath.split('/').filter(Boolean)
    // Remove the last part (the file itself)
    parts.pop()

    let currentPath = ''
    for (const part of parts) {
      currentPath += '/' + part
      const exists = await this.db.findOne(this.collection, { _id: currentPath })
      if (!exists) {
        const now = new Date()
        await this.db.insertOne(this.collection, {
          _id: currentPath,
          path: currentPath,
          content: '',
          type: 'directory',
          createdAt: now,
          updatedAt: now,
        })
      }
    }
  }

  /**
   * Delete a file at the specified path.
   *
   * @param path - Absolute path to the file to delete
   * @throws {Error} ENOENT if file does not exist
   * @throws {Error} EISDIR if path is a directory (use rmdir instead)
   */
  async deleteFile(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path)

    // Check if it's a directory
    const doc = await this.db.findOne(this.collection, { _id: normalizedPath }) as FileDocument | null
    if (doc && doc.type === 'directory') {
      throw new Error(`EISDIR: illegal operation on a directory, '${normalizedPath}'`)
    }

    const result = await this.db.deleteOne(this.collection, { _id: normalizedPath })

    if (result.deletedCount === 0) {
      throw new Error(`ENOENT: no such file or directory, '${normalizedPath}'`)
    }
  }

  /**
   * List entries in a directory.
   *
   * Returns only direct children (not recursively nested).
   * Results are sorted alphabetically.
   *
   * @param path - Absolute path to the directory
   * @returns Promise resolving to array of entry names (not full paths)
   * @throws {Error} ENOENT if directory does not exist
   * @throws {Error} ENOTDIR if path is a file, not a directory
   */
  async readdir(path: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(path)

    // Check if the directory exists (explicit or implicit)
    const dirDoc = await this.db.findOne(this.collection, { _id: normalizedPath }) as FileDocument | null

    // Pattern to match entries under this directory
    const prefix = normalizedPath === '/' ? '' : normalizedPath

    // Find all files and directories under this path
    const allDocs = await this.db.find(this.collection, {
      path: { $regex: `^${this.escapeRegex(prefix)}/` },
    })

    // If directory doesn't exist and no children found
    if (!dirDoc && allDocs.length === 0) {
      throw new Error(`ENOENT: no such file or directory, '${normalizedPath}'`)
    }

    // If it's a file
    if (dirDoc && dirDoc.type === 'file') {
      throw new Error(`ENOTDIR: not a directory, '${normalizedPath}'`)
    }

    // Extract direct children only
    const entries = new Set<string>()

    for (const doc of allDocs) {
      const docPath = doc.path as string
      // Remove the prefix and leading slash
      const relativePath = docPath.substring(prefix.length + 1)
      // Get the first path segment (direct child)
      const firstSegment = relativePath.split('/')[0]
      if (firstSegment) {
        entries.add(firstSegment)
      }
    }

    return Array.from(entries).sort()
  }

  /**
   * Create a directory at the specified path.
   *
   * Creates parent directories implicitly (behaves like mkdir -p).
   * Idempotent - does not throw if directory already exists.
   *
   * @param path - Absolute path to the directory to create
   * @throws {Error} EEXIST if a file (not directory) already exists at path
   */
  async mkdir(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path)
    const now = new Date()

    // Check if already exists as a file
    const existing = await this.db.findOne(this.collection, { _id: normalizedPath }) as FileDocument | null

    if (existing) {
      if (existing.type === 'file') {
        throw new Error(`EEXIST: file already exists, '${normalizedPath}'`)
      }
      // Directory already exists - idempotent, just return
      return
    }

    // Create parent directories first
    const parts = normalizedPath.split('/').filter(Boolean)
    let currentPath = ''

    for (let i = 0; i < parts.length; i++) {
      currentPath += '/' + parts[i]
      const exists = await this.db.findOne(this.collection, { _id: currentPath }) as FileDocument | null

      if (!exists) {
        await this.db.insertOne(this.collection, {
          _id: currentPath,
          path: currentPath,
          content: '',
          type: 'directory',
          createdAt: now,
          updatedAt: now,
        })
      } else if (exists.type === 'file' && i < parts.length - 1) {
        throw new Error(`EEXIST: file already exists, '${currentPath}'`)
      }
    }
  }

  /**
   * Remove an empty directory at the specified path.
   *
   * The directory must be empty (no files or subdirectories).
   * Cannot remove the root directory.
   *
   * @param path - Absolute path to the directory to remove
   * @throws {Error} ENOENT if directory does not exist
   * @throws {Error} ENOTDIR if path is a file, not a directory
   * @throws {Error} ENOTEMPTY if directory contains entries
   * @throws {Error} EPERM if attempting to remove root directory
   */
  async rmdir(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path)

    // Cannot remove root
    if (normalizedPath === '/') {
      throw new Error(`EPERM: operation not permitted, '/'`)
    }

    // Check if it exists
    const doc = await this.db.findOne(this.collection, { _id: normalizedPath }) as FileDocument | null

    if (!doc) {
      throw new Error(`ENOENT: no such file or directory, '${normalizedPath}'`)
    }

    if (doc.type === 'file') {
      throw new Error(`ENOTDIR: not a directory, '${normalizedPath}'`)
    }

    // Check if empty
    const prefix = normalizedPath
    const children = await this.db.find(this.collection, {
      path: { $regex: `^${this.escapeRegex(prefix)}/` },
    })

    if (children.length > 0) {
      throw new Error(`ENOTEMPTY: directory not empty, '${normalizedPath}'`)
    }

    await this.db.deleteOne(this.collection, { _id: normalizedPath })
  }

  /**
   * Get file or directory statistics.
   *
   * Returns type, size, and timestamps for the entry.
   * For directories, size is always 0.
   * Supports implicit directories (directories inferred from file paths).
   *
   * @param path - Absolute path to the file or directory
   * @returns Promise resolving to FileStat with type, size, createdAt, updatedAt
   * @throws {Error} ENOENT if path does not exist
   */
  async stat(path: string): Promise<FileStat> {
    const normalizedPath = this.normalizePath(path)

    const doc = await this.db.findOne(this.collection, { _id: normalizedPath }) as FileDocument | null

    if (doc) {
      return {
        type: doc.type,
        size: doc.type === 'file' ? doc.content.length : 0,
        createdAt: new Date(doc.createdAt),
        updatedAt: new Date(doc.updatedAt),
      }
    }

    // Check if it's an implicit directory (has files inside)
    const prefix = normalizedPath === '/' ? '' : normalizedPath
    const filesInside = await this.db.find(this.collection, {
      path: { $regex: `^${this.escapeRegex(prefix)}/` },
    })

    if (filesInside.length > 0) {
      // It's an implicit directory
      const now = new Date()
      return {
        type: 'directory' as FileType,
        size: 0,
        createdAt: now,
        updatedAt: now,
      }
    }

    throw new Error(`ENOENT: no such file or directory, '${normalizedPath}'`)
  }

  /**
   * Check if a file or directory exists at the specified path.
   *
   * Does not throw errors for non-existent paths.
   *
   * @param path - Absolute path to check
   * @returns Promise resolving to true if path exists, false otherwise
   */
  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path)
      return true
    } catch {
      return false
    }
  }

  /**
   * Find files matching a glob pattern.
   *
   * Supports basic glob patterns:
   * - `*` matches any characters except /
   * - `**` matches any characters including /
   * - `?` matches any single character except /
   *
   * Returns only files, not directories.
   * Results are sorted alphabetically.
   *
   * @param pattern - Glob pattern to match against file paths
   * @returns Promise resolving to array of matching file paths
   *
   * @example
   * ```typescript
   * const tsFiles = await fs.glob('**\/*.ts')
   * const srcFiles = await fs.glob('/src/*.js')
   * ```
   */
  async glob(pattern: string): Promise<string[]> {
    // Convert glob pattern to regex
    const regexPattern = this.globToRegex(pattern)

    const files = await this.db.find(this.collection, {
      path: { $regex: regexPattern },
    })

    // Filter to only include files, not directories
    return files
      .filter((f) => (f as unknown as FileDocument).type === 'file')
      .map((f) => f.path as string)
      .sort()
  }

  /**
   * Convert a glob pattern to a regex string
   */
  private globToRegex(pattern: string): string {
    // Normalize the pattern
    let normalized = pattern
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized
    }

    // Escape regex special characters except glob wildcards
    let regex = normalized
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // ** matches any path segments
      .replace(/\*\*/g, '<<DOUBLE_STAR>>')
      // * matches any characters except /
      .replace(/\*/g, '[^/]*')
      // Restore ** as .*
      .replace(/<<DOUBLE_STAR>>/g, '.*')
      // ? matches single character except /
      .replace(/\?/g, '[^/]')

    return '^' + regex + '$'
  }
}
