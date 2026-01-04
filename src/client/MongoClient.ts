/**
 * MongoClient - MongoDB-compatible client interface
 *
 * Provides a familiar API for connecting to mondodb databases.
 */

import type { Env } from '../types/env'
import { Database } from './Database'

/**
 * Options for connecting to mondodb
 */
export interface MongoClientOptions {
  /**
   * Application name for connection metadata
   */
  appName?: string
}

/**
 * MongoClient class
 *
 * The main entry point for interacting with mondodb.
 * Provides a MongoDB-compatible API for database operations.
 */
export class MongoClient {
  private env: Env
  private options: MongoClientOptions
  private connected: boolean = false

  /**
   * Create a new MongoClient instance
   *
   * @param env - Cloudflare Workers environment with MONDO_DATABASE binding
   * @param options - Optional connection options
   */
  constructor(env: Env, options: MongoClientOptions = {}) {
    this.env = env
    this.options = options
  }

  /**
   * Connect to the database
   *
   * In mondodb, this is a no-op since connections are handled per-request.
   * Provided for API compatibility with MongoDB driver.
   */
  async connect(): Promise<MongoClient> {
    this.connected = true
    return this
  }

  /**
   * Close the connection
   *
   * In mondodb, this is a no-op since connections are handled per-request.
   * Provided for API compatibility with MongoDB driver.
   */
  async close(): Promise<void> {
    this.connected = false
  }

  /**
   * Get a database instance
   *
   * @param name - The name of the database
   * @returns A Database instance
   */
  db(name: string): Database {
    return new Database(this.env, name)
  }

  /**
   * Check if the client is connected
   */
  isConnected(): boolean {
    return this.connected
  }
}
