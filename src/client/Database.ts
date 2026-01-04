/**
 * Database - MongoDB-compatible database interface
 *
 * Represents a database in mondodb and provides access to collections.
 */

import type { Env } from '../types/env'
import { Collection } from './Collection'

/**
 * Database class
 *
 * Provides access to collections within a database.
 * Each database corresponds to a Durable Object instance.
 */
export class Database {
  private env: Env
  private dbName: string

  /**
   * Create a new Database instance
   *
   * @param env - Cloudflare Workers environment with MONDO_DATABASE binding
   * @param name - The name of the database
   */
  constructor(env: Env, name: string) {
    this.env = env
    this.dbName = name
  }

  /**
   * Get the name of this database
   */
  get databaseName(): string {
    return this.dbName
  }

  /**
   * Get a collection from this database
   *
   * @param name - The name of the collection
   * @returns A Collection instance
   */
  collection<TDocument extends Record<string, unknown> = Record<string, unknown>>(
    name: string
  ): Collection<TDocument> {
    return new Collection<TDocument>(this.env, this.dbName, name)
  }

  /**
   * List all collections in this database
   *
   * @returns Array of collection names
   */
  async listCollections(): Promise<{ name: string; type: string }[]> {
    const id = this.env.MONDO_DATABASE.idFromName(this.dbName)
    const stub = this.env.MONDO_DATABASE.get(id)

    const response = await stub.fetch(
      new Request(`https://mondo.internal/${this.dbName}/_listCollections`, {
        method: 'GET',
      })
    )

    if (!response.ok) {
      throw new Error(`Failed to list collections: ${response.statusText}`)
    }

    const result = await response.json() as { collections: { name: string; type: string }[] }
    return result.collections
  }

  /**
   * Create a new collection
   *
   * @param name - The name of the collection to create
   * @returns void
   */
  async createCollection(name: string): Promise<void> {
    const id = this.env.MONDO_DATABASE.idFromName(this.dbName)
    const stub = this.env.MONDO_DATABASE.get(id)

    const response = await stub.fetch(
      new Request(`https://mondo.internal/${this.dbName}/_createCollection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
    )

    if (!response.ok) {
      throw new Error(`Failed to create collection: ${response.statusText}`)
    }
  }

  /**
   * Drop a collection from this database
   *
   * @param name - The name of the collection to drop
   * @returns true if collection was dropped, false if it didn't exist
   */
  async dropCollection(name: string): Promise<boolean> {
    const id = this.env.MONDO_DATABASE.idFromName(this.dbName)
    const stub = this.env.MONDO_DATABASE.get(id)

    const response = await stub.fetch(
      new Request(`https://mondo.internal/${this.dbName}/${name}/_drop`, {
        method: 'POST',
      })
    )

    if (response.status === 404) {
      return false
    }

    if (!response.ok) {
      throw new Error(`Failed to drop collection: ${response.statusText}`)
    }

    return true
  }

  /**
   * Get database statistics
   */
  async stats(): Promise<{
    db: string
    collections: number
    objects: number
    dataSize: number
  }> {
    const id = this.env.MONDO_DATABASE.idFromName(this.dbName)
    const stub = this.env.MONDO_DATABASE.get(id)

    const response = await stub.fetch(
      new Request(`https://mondo.internal/${this.dbName}/_stats`, {
        method: 'GET',
      })
    )

    if (!response.ok) {
      throw new Error(`Failed to get stats: ${response.statusText}`)
    }

    return response.json() as Promise<{
      db: string
      collections: number
      objects: number
      dataSize: number
    }>
  }
}
