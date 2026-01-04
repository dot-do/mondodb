/**
 * MongoClient - MongoDB-compatible client for mondodb
 *
 * Provides connection management and database access for
 * MongoDB-compatible operations backed by Cloudflare Durable Objects SQLite.
 */

import { MongoDatabase } from './mongo-database'

export interface MongoClientOptions {
  host?: string
  port?: number
  maxPoolSize?: number
  minPoolSize?: number
  connectTimeoutMS?: number
  socketTimeoutMS?: number
}

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
 * Parse a mondodb:// URI into its components
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

  const scheme = schemeMatch[1].toLowerCase()
  if (scheme !== 'mondodb' && scheme !== 'mongodb') {
    throw new Error(`Invalid URI scheme: Expected "mondodb://" or "mongodb://", got "${scheme}://"`)
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

  return {
    scheme,
    host,
    port,
    database,
    username,
    password,
    options,
  }
}

export class MongoClient {
  private readonly uri: string
  private readonly parsedURI: ParsedURI
  private readonly _options: MongoClientOptions
  private _isConnected: boolean = false
  private readonly databaseCache: Map<string, MongoDatabase> = new Map()

  constructor(uri: string, options?: MongoClientOptions) {
    this.uri = uri
    this.parsedURI = parseURI(uri)

    // Merge parsed options with provided options
    const parsedOptions: MongoClientOptions = {
      host: this.parsedURI.host,
      port: this.parsedURI.port,
      maxPoolSize: this.parsedURI.options.maxPoolSize
        ? parseInt(this.parsedURI.options.maxPoolSize, 10)
        : 100,
      minPoolSize: this.parsedURI.options.minPoolSize
        ? parseInt(this.parsedURI.options.minPoolSize, 10)
        : 0,
    }

    this._options = {
      ...parsedOptions,
      ...options,
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
   * Connect to the database
   * Returns this client for chaining
   */
  async connect(): Promise<MongoClient> {
    if (this._isConnected) {
      return this
    }

    // In a real implementation, this would establish connection
    // For mondodb backed by Durable Objects, connection is lazy
    this._isConnected = true
    return this
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (!this._isConnected) {
      return
    }

    // Clear database cache
    this.databaseCache.clear()
    this._isConnected = false
  }

  /**
   * Get a database instance
   * @param dbName - Database name (optional, uses default from URI if not provided)
   */
  db(dbName?: string): MongoDatabase {
    const name = dbName || this.parsedURI.database

    // Return cached instance if available
    let database = this.databaseCache.get(name)
    if (database) {
      return database
    }

    // Create new database instance
    database = new MongoDatabase(this, name)
    this.databaseCache.set(name, database)
    return database
  }

  /**
   * Get the default database name from the connection URI
   */
  get defaultDatabase(): string {
    return this.parsedURI.database
  }

  /**
   * Start a client session (placeholder for transaction support)
   */
  startSession(): ClientSession {
    return new ClientSession(this)
  }
}

/**
 * Client session for transaction support (placeholder)
 */
export class ClientSession {
  private readonly client: MongoClient
  private _inTransaction: boolean = false

  constructor(client: MongoClient) {
    this.client = client
  }

  startTransaction(): void {
    this._inTransaction = true
  }

  async commitTransaction(): Promise<void> {
    this._inTransaction = false
  }

  async abortTransaction(): Promise<void> {
    this._inTransaction = false
  }

  get inTransaction(): boolean {
    return this._inTransaction
  }

  async endSession(): Promise<void> {
    if (this._inTransaction) {
      await this.abortTransaction()
    }
  }
}

export default MongoClient
