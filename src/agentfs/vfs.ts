/**
 * AgentFS Virtual Filesystem Implementation
 *
 * Virtual filesystem stored in MondoDB collections.
 * Provides a file-system-like interface backed by MongoDB/MondoDB.
 */

import type { FileSystem, FileStat, FileType } from './types'

/**
 * Database interface for AgentFilesystem
 * Methods take collection name as first parameter
 */
export interface AgentFSDatabase {
  findOne(collection: string, query: Record<string, unknown>): Promise<Record<string, unknown> | null>
  find(collection: string, query: Record<string, unknown>): Promise<Record<string, unknown>[]>
  insertOne(collection: string, document: Record<string, unknown>): Promise<{ insertedId: string }>
  updateOne(
    collection: string,
    filter: Record<string, unknown>,
    update: { $set?: Record<string, unknown>; $setOnInsert?: Record<string, unknown> },
    options?: { upsert?: boolean }
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: string }>
  deleteOne(collection: string, filter: Record<string, unknown>): Promise<{ deletedCount: number }>
  deleteMany(collection: string, filter: Record<string, unknown>): Promise<{ deletedCount: number }>
}

/**
 * Internal file document structure
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
 * Uses MongoDB collection with path as key for O(1) lookups.
 * Supports files and directories with proper upsert semantics.
 */
export class AgentFilesystem implements FileSystem {
  private db: AgentFSDatabase
  private collection = '__agentfs.files'

  constructor(db: AgentFSDatabase) {
    this.db = db
  }

  /**
   * Normalize a path to ensure consistency
   * - Always starts with /
   * - No duplicate slashes
   * - No trailing slash (except for root)
   * - Resolves . and .. components
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
   * Get the basename (file/directory name) from a path
   */
  private getBasename(path: string): string {
    const normalized = this.normalizePath(path)
    if (normalized === '/') return ''
    const lastSlash = normalized.lastIndexOf('/')
    return normalized.substring(lastSlash + 1)
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * Read file content at path
   * @throws Error if file does not exist or is a directory
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
   * Write content to file at path
   * Creates parent directories implicitly
   * Uses upsert - creates new file or updates existing
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
   * Create implicit parent directories for a file path
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
   * Delete file at path
   * @throws Error if file does not exist or is a directory
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
   * List entries in directory
   * Returns only direct children (not nested)
   * @throws Error if path does not exist or is not a directory
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
   * Create directory at path
   * Creates parent directories implicitly (recursive by default)
   * Idempotent - does not throw if directory already exists
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
   * Remove directory at path
   * @throws Error if directory does not exist, is not empty, or is a file
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
   * Get file/directory statistics
   * @throws Error if path does not exist
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
   * Check if path exists
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
   * Find files matching glob pattern
   * Supports basic glob patterns: *, **, ?
   */
  async glob(pattern: string): Promise<string[]> {
    // Convert glob pattern to regex
    const regexPattern = this.globToRegex(pattern)

    const files = await this.db.find(this.collection, {
      path: { $regex: regexPattern },
    })

    // Filter to only include files, not directories
    return files
      .filter((f) => (f as FileDocument).type === 'file')
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
