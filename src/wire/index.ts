/**
 * Wire Protocol Module
 *
 * Exports for the MongoDB wire protocol implementation.
 */

// Server
export { WireProtocolServer, createServer, type ServerOptions, type TlsOptions } from './server.js'

// Types
export * from './types.js'

// Message parsing
export {
  parseHeader,
  serializeHeader,
  parseOpMsg,
  parseOpQuery,
  serializeOpMsg,
  serializeOpReply,
  parseMessage,
  extractCommand,
} from './message.js'

// Backend interface
export type {
  MondoBackend,
  DatabaseInfo,
  CollectionInfo,
  FindOptions,
  FindResult,
  InsertResult,
  UpdateResult,
  DeleteResult,
  AggregateResult,
  CollStats,
  DbStats,
  IndexInfo,
  IndexSpec,
  CursorState,
} from './backend/interface.js'

// Local SQLite backend
export { LocalSQLiteBackend } from './backend/local-sqlite.js'

// Command router
export { CommandRouter, type RouterOptions } from './commands/router.js'

// Authentication
export {
  ScramAuthenticator,
  InMemoryCredentialsProvider,
  createScramCredentials,
  type StoredCredentials,
  type CredentialsProvider,
} from './auth/scram.js'
export { requiresAuthentication, UNAUTHENTICATED_COMMANDS } from './commands/auth.js'
export type { AuthOptions } from './server.js'
