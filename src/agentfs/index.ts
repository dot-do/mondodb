/**
 * AgentFS - Virtual Filesystem for AI Agents
 *
 * A MondoDB-backed virtual filesystem for storing and managing
 * files, key-value pairs, and tool call records for AI agents.
 */

export type {
  FileType,
  FileStat,
  AgentFSFile,
  AgentFSKVEntry,
  AgentFSToolCall,
  GlobOptions,
  GrepOptions,
  GrepMatch,
  FileSystem,
  KeyValueStore,
} from './types'

export { AgentGrep, createGrep } from './grep'
export type { GlobMatcher as GlobMatcherInterface } from './grep'

// Glob pattern matching
export {
  matchGlob,
  matchAnyGlob,
  filterGlob,
  compileGlob,
  globToRegex,
  GlobMatcher,
  normalizePath,
  getGlobBase,
  isGlobPattern,
} from './glob'
export type { GlobMatchResult, CompiledGlob } from './glob'

export { AgentFilesystem } from './vfs'
export type { AgentFSDatabase } from './vfs'

export { AgentFSKVStore, createInMemoryBackend } from './kv-store'
export type { KVStorageBackend, KVStorageDocument } from './kv-store'

// Tool call audit logging
export { ToolCallAuditLog, createInMemoryAuditBackend, ImmutableEntryError } from './toolcalls'
export type { ToolCallEntry, AuditBackend, AuditQueryOptions, TimeRange, RecordOptions } from './toolcalls'
