/**
 * AgentFS Core Types
 *
 * Virtual filesystem stored in MondoDB collections for AI agent operations.
 */

/**
 * Type union for file system entry types
 */
export type FileType = 'file' | 'directory'

/**
 * File statistics including type, size, and timestamps
 */
export interface FileStat {
  type: FileType
  size: number
  createdAt: Date
  updatedAt: Date
}

/**
 * Represents a file in the AgentFS virtual filesystem.
 * Files are stored with their full path as the identifier.
 */
export interface AgentFSFile {
  /** MongoDB _id - same as path */
  _id: string
  /** Absolute path (must start with /) */
  path: string
  /** File contents (string, or base64 for binary) */
  content: string
  /** Optional metadata including type, encoding, permissions, etc. */
  metadata?: {
    type?: string
    encoding?: string
    mimeType?: string
    size?: number
    permissions?: Record<string, unknown>
    tags?: string[]
    [key: string]: unknown
  }
  /** Timestamp when the file was created */
  createdAt: Date
  /** Timestamp when the file was last updated */
  updatedAt: Date
}

/**
 * Represents a key-value entry in the AgentFS KV store.
 * Values can be any JSON-serializable type.
 */
export interface AgentFSKVEntry {
  /** MongoDB _id - same as key */
  _id: string
  /** Unique key identifier */
  key: string
  /** JSON-serializable value (primitives, objects, arrays, null) */
  value: unknown
  /** Timestamp when the entry was created */
  createdAt: Date
  /** Timestamp when the entry was last updated */
  updatedAt: Date
}

/**
 * Represents an immutable tool call record.
 * Tool calls are append-only and cannot be updated or deleted.
 */
export interface AgentFSToolCall {
  /** MongoDB _id - ObjectId as string */
  _id: string
  /** Unique identifier for the tool call (alias for _id for compatibility) */
  id: string
  /** Name of the tool that was invoked */
  tool: string
  /** Input parameters passed to the tool */
  inputs: unknown
  /** Output/result from the tool execution */
  outputs: unknown
  /** Timestamp when the tool was called (immutable) */
  timestamp: Date
  /** Optional duration of the tool call in milliseconds */
  durationMs?: number
}

/**
 * Options for glob pattern matching operations
 */
export interface GlobOptions {
  /** Glob pattern to match (e.g., '**\/*.ts') */
  pattern: string
  /** Working directory for relative patterns (defaults to /) */
  cwd?: string
  /** Include dot files/directories (default: false) */
  dot?: boolean
  /** Case-insensitive matching (default: false) */
  nocase?: boolean
}

/**
 * Options for grep/search operations
 */
export interface GrepOptions {
  /** Regular expression pattern to search for */
  pattern: string
  /** Optional glob pattern to filter files */
  glob?: string | undefined
  /** Case-insensitive search (default: false) */
  caseInsensitive?: boolean | undefined
  /** Maximum number of results to return */
  maxResults?: number | undefined
  /** Number of context lines before and after match */
  contextLines?: number | undefined
}

/**
 * Represents a single grep/search match result
 */
export interface GrepMatch {
  /** Absolute path to the file containing the match */
  file: string
  /** Line number (1-indexed) */
  line: number
  /** Column number (1-indexed) */
  column: number
  /** Content of the matching line */
  content: string
  /** Optional context lines before and after the match */
  context?: {
    before: string[]
    after: string[]
  }
}

/**
 * Core filesystem interface for AgentFS operations.
 * All paths must be absolute (starting with /).
 */
export interface FileSystem {
  /** Read file contents at the given path */
  readFile(path: string): Promise<string>
  /** Write content to a file at the given path */
  writeFile(path: string, content: string): Promise<void>
  /** Delete a file at the given path */
  deleteFile(path: string): Promise<void>
  /** List directory contents at the given path */
  readdir(path: string): Promise<string[]>
  /** Create a directory at the given path */
  mkdir(path: string): Promise<void>
  /** Remove a directory at the given path */
  rmdir(path: string): Promise<void>
  /** Get file/directory statistics */
  stat(path: string): Promise<FileStat>
  /** Check if a file/directory exists at the given path */
  exists(path: string): Promise<boolean>
  /** Find files matching a glob pattern */
  glob(pattern: string): Promise<string[]>
}

/**
 * Key-Value Store interface for AgentFS operations.
 * Provides simple key-value storage with JSON-serializable values.
 */
export interface KeyValueStore {
  /** Get a value by key, returns undefined if not found */
  get(key: string): Promise<unknown | undefined>
  /** Set a key-value pair (creates or updates) */
  set(key: string, value: unknown): Promise<void>
  /** Delete a key, returns true if key existed */
  delete(key: string): Promise<boolean>
  /** Check if a key exists */
  has(key: string): Promise<boolean>
  /** List all keys, optionally filtered by prefix */
  keys(prefix?: string): Promise<string[]>
  /** Get all entries as AgentFSKVEntry objects, optionally filtered by prefix */
  entries(prefix?: string): Promise<AgentFSKVEntry[]>
  /** Clear all entries, optionally filtered by prefix. Returns count of deleted entries */
  clear(prefix?: string): Promise<number>
}
