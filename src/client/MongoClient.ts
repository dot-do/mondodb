/**
 * MongoClient - MongoDB-compatible client for mongo.do
 *
 * Provides connection management and database access for
 * MongoDB-compatible operations. Supports two modes:
 *
 * 1. URI-based connection (for testing/in-memory):
 *    const client = new MongoClient('mongodo://localhost:27017/mydb')
 *
 * 2. Env-based connection (for Cloudflare Durable Objects):
 *    const client = new MongoClient(env)
 *
 * The URI-based mode uses in-memory storage and is suitable for testing.
 * The Env-based mode connects to Cloudflare Durable Objects for production.
 */

import type { Env } from '../types/env'
import { Database } from './Database'
import { MongoDatabase } from './mongo-database'
import {
  ClientSession,
  ClientSessionOptions,
  TransactionOptions,
  ReadConcern,
  WriteConcern,
  TransactionState,
  SessionId,
} from './session'

// Re-export session types for convenience
export { ClientSession, SessionId }
export type {
  ClientSessionOptions,
  TransactionOptions,
  ReadConcern,
  WriteConcern,
  TransactionState,
}

/**
 * Options for MongoClient
 */
export interface MongoClientOptions {
  /**
   * Application name for connection metadata
   */
  appName?: string

  /**
   * Host for the connection (URI mode)
   */
  host?: string

  /**
   * Port for the connection (URI mode)
   */
  port?: number

  /**
   * Maximum connection pool size (URI mode)
   */
  maxPoolSize?: number

  /**
   * Minimum connection pool size (URI mode)
   */
  minPoolSize?: number

  /**
   * Connection timeout in milliseconds
   */
  connectTimeoutMS?: number

  /**
   * Socket timeout in milliseconds
   */
  socketTimeoutMS?: number
}

/**
 * Parsed URI components
 */
interface ParsedURI {
  scheme: string
  host: string
  port: number
  database: string
  username?: string
  password?: string
  options: Record<string, string>
}

/**
 * Parse a mongodo:// or mongodb:// URI into its components
 */
function parseURI(uri: string): ParsedURI {
  if (!uri || uri.trim() === '') {
    throw new Error('Invalid URI: URI cannot be empty')
  }

  // Match scheme
  const schemeMatch = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)
  if (!schemeMatch) {
    throw new Error(`Invalid URI: Missing scheme in "${uri}"`)
  }

  const scheme = schemeMatch[1]!.toLowerCase()
  if (scheme !== 'mongodo' && scheme !== 'mongodb') {
    throw new Error(`Invalid URI scheme: Expected "mongodo://" or "mongodb://", got "${scheme}://"`)
  }

  // Remove scheme from URI
  let remaining = uri.slice(schemeMatch[0].length)

  // Extract query string
  let queryString = ''
  const queryIndex = remaining.indexOf('?')
  if (queryIndex !== -1) {
    queryString = remaining.slice(queryIndex + 1)
    remaining = remaining.slice(0, queryIndex)
  }

  // Parse query parameters
  const options: Record<string, string> = {}
  if (queryString) {
    for (const param of queryString.split('&')) {
      const [key, value] = param.split('=')
      if (key) {
        options[key] = decodeURIComponent(value || '')
      }
    }
  }

  // Extract database name
  let database = 'test'
  const pathIndex = remaining.indexOf('/')
  if (pathIndex !== -1) {
    database = remaining.slice(pathIndex + 1) || 'test'
    remaining = remaining.slice(0, pathIndex)
  }

  // Check for authentication (user:pass@)
  let username: string | undefined
  let password: string | undefined
  const atIndex = remaining.lastIndexOf('@')
  if (atIndex !== -1) {
    const authPart = remaining.slice(0, atIndex)
    remaining = remaining.slice(atIndex + 1)
    const colonIndex = authPart.indexOf(':')
    if (colonIndex !== -1) {
      username = decodeURIComponent(authPart.slice(0, colonIndex))
      password = decodeURIComponent(authPart.slice(colonIndex + 1))
    } else {
      username = decodeURIComponent(authPart)
    }
  }

  // Parse host and port
  let host = 'localhost'
  let port = 27017
  const colonIndex = remaining.lastIndexOf(':')
  if (colonIndex !== -1) {
    host = remaining.slice(0, colonIndex) || 'localhost'
    const portStr = remaining.slice(colonIndex + 1)
    if (portStr) {
      port = parseInt(portStr, 10)
      if (isNaN(port)) {
        throw new Error(`Invalid port: "${portStr}"`)
      }
    }
  } else {
    host = remaining || 'localhost'
  }

  const result: ParsedURI = {
    scheme,
    host,
    port,
    database,
    options,
  }

  // Only include auth fields if they are defined
  if (username !== undefined) {
    result.username = username
  }
  if (password !== undefined) {
    result.password = password
  }

  return result
}

/**
 * Connection mode for the client
 */
type ConnectionMode = 'uri' | 'env'

/**
 * MongoClient - The main entry point for interacting with mongo.do
 *
 * Provides a MongoDB-compatible API for database operations.
 * Supports both URI-based connections (for testing) and
 * Cloudflare Workers environment bindings (for production).
 *
 * @example URI-based (testing/in-memory):
 * ```typescript
 * const client = new MongoClient('mongodo://localhost:27017/mydb')
 * await client.connect()
 * const db = client.db('mydb')
 * ```
 *
 * @example Env-based (Cloudflare Durable Objects):
 * ```typescript
 * const client = new MongoClient(env)
 * await client.connect()
 * const db = client.db('mydb')
 * ```
 */
export class MongoClient {
  private readonly _mode: ConnectionMode
  private readonly _uri?: string
  private readonly _parsedURI?: ParsedURI
  private readonly _env?: Env
  private readonly _options: MongoClientOptions
  private _isConnected: boolean = false
  private readonly _mongoDatabaseCache: Map<string, MongoDatabase> = new Map()
  private readonly _databaseCache: Map<string, Database> = new Map()

  /**
   * Create a new MongoClient instance
   *
   * @param uriOrEnv - Either a connection URI string or Cloudflare Workers environment
   * @param options - Optional connection options
   */
  constructor(uriOrEnv: string | Env, options?: MongoClientOptions) {
    this._options = options || {}

    if (typeof uriOrEnv === 'string') {
      // URI-based mode (for testing/in-memory)
      this._mode = 'uri'
      this._uri = uriOrEnv
      this._parsedURI = parseURI(uriOrEnv)

      // Merge parsed options with provided options
      const parsedOptions: MongoClientOptions = {
        host: this._parsedURI.host,
        port: this._parsedURI.port,
        maxPoolSize: this._parsedURI.options.maxPoolSize
          ? parseInt(this._parsedURI.options.maxPoolSize, 10)
          : 100,
        minPoolSize: this._parsedURI.options.minPoolSize
          ? parseInt(this._parsedURI.options.minPoolSize, 10)
          : 0,
      }

      this._options = {
        ...parsedOptions,
        ...this._options,
      }
    } else {
      // Env-based mode (for Cloudflare Durable Objects)
      this._mode = 'env'
      this._env = uriOrEnv
    }
  }

  /**
   * Get the client options
   */
  get options(): Readonly<MongoClientOptions> {
    return this._options
  }

  /**
   * Check if the client is currently connected
   */
  get isConnected(): boolean {
    return this._isConnected
  }

  /**
   * Get the connection mode
   */
  get mode(): ConnectionMode {
    return this._mode
  }

  /**
   * Get the connection URI (URI mode only)
   */
  get uri(): string | undefined {
    return this._uri
  }

  /**
   * Connect to the database
   *
   * In mongo.do, this is mostly a no-op since connections are handled lazily.
   * For Durable Objects mode, connections are per-request.
   * For URI mode (in-memory), this initializes the connection state.
   *
   * @returns This client for chaining
   */
  async connect(): Promise<MongoClient> {
    if (this._isConnected) {
      return this
    }

    // Connection is lazy in mongo.do
    this._isConnected = true
    return this
  }

  /**
   * Close the connection
   *
   * Clears database caches and resets connection state.
   */
  async close(): Promise<void> {
    if (!this._isConnected) {
      return
    }

    // Clear database caches
    this._mongoDatabaseCache.clear()
    this._databaseCache.clear()
    this._isConnected = false
  }

  /**
   * Get a database instance
   *
   * In URI mode, returns a MongoDatabase (in-memory).
   * In Env mode, returns a Database (Durable Objects).
   *
   * @param dbName - Database name (optional in URI mode, uses default from URI)
   * @returns A database instance (MongoDatabase or Database based on mode)
   */
  db(dbName?: string): MongoDatabase | Database {
    if (this._mode === 'uri') {
      return this._getMongoDatabase(dbName)
    } else {
      return this._getDatabase(dbName || 'test')
    }
  }

  /**
   * Get a MongoDatabase instance (URI/in-memory mode)
   * @internal
   */
  private _getMongoDatabase(dbName?: string): MongoDatabase {
    const name = dbName || this._parsedURI?.database || 'test'

    // Return cached instance if available
    let database = this._mongoDatabaseCache.get(name)
    if (database) {
      return database
    }

    // Create new database instance
    database = new MongoDatabase(this, name)
    this._mongoDatabaseCache.set(name, database)
    return database
  }

  /**
   * Get a Database instance (Env/Durable Objects mode)
   * @internal
   */
  private _getDatabase(dbName: string): Database {
    // Return cached instance if available
    let database = this._databaseCache.get(dbName)
    if (database) {
      return database
    }

    if (!this._env) {
      throw new Error('No environment provided for Durable Objects mode')
    }

    // Create new database instance
    database = new Database(this._env, dbName)
    this._databaseCache.set(dbName, database)
    return database
  }

  /**
   * Get the default database name from the connection URI
   * Only available in URI mode.
   */
  get defaultDatabase(): string {
    if (this._parsedURI) {
      return this._parsedURI.database
    }
    return 'test'
  }

  /**
   * Start a client session for transaction support
   *
   * Sessions are primarily used in URI/in-memory mode.
   * Durable Objects mode uses SQLite transactions internally.
   *
   * @param options - Session options including default transaction options
   * @returns A new ClientSession instance
   */
  startSession(options?: ClientSessionOptions): ClientSession {
    return new ClientSession(this, options)
  }
}

export default MongoClient
