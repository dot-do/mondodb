/**
 * Db class - MongoDB-compatible database operations
 */

import type { Document, RpcTransport } from './types.js';
import { Collection } from './collection.js';

/**
 * Create collection options
 */
export interface CreateCollectionOptions {
  capped?: boolean;
  size?: number;
  max?: number;
  validator?: Document;
  validationLevel?: 'off' | 'strict' | 'moderate';
  validationAction?: 'error' | 'warn';
}

/**
 * Collection info returned by listCollections
 */
export interface CollectionInfo {
  name: string;
  type: string;
  options?: Document;
}

/**
 * Db class providing MongoDB-compatible database operations
 */
export class Db {
  private _transport: RpcTransport;
  private _name: string;
  private _collections: Map<string, Collection<Document>> = new Map();

  constructor(transport: RpcTransport, name: string) {
    this._transport = transport;
    this._name = name;
  }

  /**
   * Get the database name
   */
  get databaseName(): string {
    return this._name;
  }

  /**
   * Get a collection by name
   */
  collection<T extends Document = Document>(name: string): Collection<T> {
    // Return cached collection or create new one
    let coll = this._collections.get(name);
    if (!coll) {
      coll = new Collection<Document>(this._transport, this._name, name);
      this._collections.set(name, coll);
    }
    return coll as Collection<T>;
  }

  /**
   * Create a new collection
   */
  async createCollection<T extends Document = Document>(
    name: string,
    options?: CreateCollectionOptions
  ): Promise<Collection<T>> {
    await this._transport.call('createCollection', this._name, name, options ?? {});
    return this.collection<T>(name);
  }

  /**
   * Drop the database
   */
  async dropDatabase(): Promise<boolean> {
    const result = await this._transport.call('dropDatabase', this._name);
    this._collections.clear();
    return result as boolean;
  }

  /**
   * List all collections in the database
   */
  async listCollections(filter?: Document): Promise<CollectionInfo[]> {
    const result = await this._transport.call('listCollections', this._name, filter ?? {});
    return result as CollectionInfo[];
  }

  /**
   * Get collection names
   */
  async collections(): Promise<Collection<Document>[]> {
    const infos = await this.listCollections();
    return infos.map((info) => this.collection(info.name));
  }

  /**
   * Run a database command
   */
  async command(command: Document): Promise<Document> {
    const result = await this._transport.call('runCommand', this._name, command);
    return result as Document;
  }

  /**
   * Get database stats
   */
  async stats(): Promise<Document> {
    return this.command({ dbStats: 1 });
  }

  /**
   * Run an admin command
   */
  async admin(): Promise<AdminDb> {
    return new AdminDb(this._transport);
  }

  /**
   * Rename a collection
   */
  async renameCollection(fromName: string, toName: string, options?: { dropTarget?: boolean }): Promise<void> {
    await this._transport.call('renameCollection', this._name, fromName, toName, options ?? {});
    // Update collection cache
    const coll = this._collections.get(fromName);
    if (coll) {
      this._collections.delete(fromName);
      this._collections.set(toName, coll);
    }
  }
}

/**
 * Admin database for administrative operations
 */
export class AdminDb {
  private _transport: RpcTransport;

  constructor(transport: RpcTransport) {
    this._transport = transport;
  }

  /**
   * List all databases
   */
  async listDatabases(): Promise<{ databases: Array<{ name: string; sizeOnDisk: number; empty: boolean }>; totalSize: number }> {
    const result = await this._transport.call('listDatabases');
    return result as { databases: Array<{ name: string; sizeOnDisk: number; empty: boolean }>; totalSize: number };
  }

  /**
   * Get server status
   */
  async serverStatus(): Promise<Document> {
    const result = await this._transport.call('serverStatus');
    return result as Document;
  }

  /**
   * Ping the server
   */
  async ping(): Promise<Document> {
    const result = await this._transport.call('ping');
    return result as Document;
  }

  /**
   * Run an admin command
   */
  async command(command: Document): Promise<Document> {
    const result = await this._transport.call('adminCommand', command);
    return result as Document;
  }
}
