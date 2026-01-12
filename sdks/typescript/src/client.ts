/**
 * MongoClient class - MongoDB-compatible client built on rpc.do
 */

import type { Document, MongoClientOptions, RpcTransport } from './types.js';
import { Db } from './db.js';

/**
 * Parse a MongoDB connection URI
 */
export function parseConnectionUri(uri: string): {
  protocol: string;
  host: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  options: Record<string, string>;
} {
  // Handle mongodb:// and mongodb+srv://
  const protocolMatch = uri.match(/^(mongodb(?:\+srv)?):\/\//);
  if (!protocolMatch) {
    throw new Error('Invalid MongoDB URI: must start with mongodb:// or mongodb+srv://');
  }

  const protocol = protocolMatch[1];
  let remaining = uri.slice(protocolMatch[0].length);

  // Extract credentials if present
  let username: string | undefined;
  let password: string | undefined;

  const atIndex = remaining.indexOf('@');
  if (atIndex !== -1) {
    const credentials = remaining.slice(0, atIndex);
    remaining = remaining.slice(atIndex + 1);

    const colonIndex = credentials.indexOf(':');
    if (colonIndex !== -1) {
      username = decodeURIComponent(credentials.slice(0, colonIndex));
      password = decodeURIComponent(credentials.slice(colonIndex + 1));
    } else {
      username = decodeURIComponent(credentials);
    }
  }

  // Extract query string if present
  let options: Record<string, string> = {};
  const queryIndex = remaining.indexOf('?');
  if (queryIndex !== -1) {
    const queryString = remaining.slice(queryIndex + 1);
    remaining = remaining.slice(0, queryIndex);

    for (const pair of queryString.split('&')) {
      const [key, value] = pair.split('=');
      if (key && value !== undefined) {
        options[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }
  }

  // Extract database name
  let database: string | undefined;
  const pathIndex = remaining.indexOf('/');
  let hostPart = remaining;

  if (pathIndex !== -1) {
    hostPart = remaining.slice(0, pathIndex);
    database = remaining.slice(pathIndex + 1) || undefined;
  }

  // Parse host and port
  const portMatch = hostPart.match(/:(\d+)$/);
  let host = hostPart;
  let port: number | undefined;

  if (portMatch) {
    host = hostPart.slice(0, -portMatch[0].length);
    port = parseInt(portMatch[1], 10);
  }

  return {
    protocol,
    host,
    port,
    database,
    username,
    password,
    options,
  };
}

/**
 * Mock RPC transport for testing
 */
export class MockRpcTransport implements RpcTransport {
  private _data: Map<string, Map<string, Document[]>> = new Map();
  private _nextId = 1;
  private _closed = false;
  private _callLog: Array<{ method: string; args: unknown[] }> = [];

  /**
   * Get call log for testing
   */
  get callLog(): Array<{ method: string; args: unknown[] }> {
    return this._callLog;
  }

  /**
   * Clear call log
   */
  clearCallLog(): void {
    this._callLog = [];
  }

  /**
   * Make an RPC call
   */
  async call(method: string, ...args: unknown[]): Promise<unknown> {
    if (this._closed) {
      throw new Error('Transport is closed');
    }

    this._callLog.push({ method, args });

    switch (method) {
      case 'connect':
        return { ok: 1 };

      case 'ping':
        return { ok: 1 };

      case 'insertOne': {
        const [dbName, collName, doc] = args as [string, string, Document];
        const collection = this._getOrCreateCollection(dbName, collName);
        const id = doc._id ?? `id_${this._nextId++}`;
        collection.push({ ...doc, _id: id });
        return { acknowledged: true, insertedId: id };
      }

      case 'insertMany': {
        const [dbName, collName, docs] = args as [string, string, Document[]];
        const collection = this._getOrCreateCollection(dbName, collName);
        const insertedIds: Record<number, string> = {};
        docs.forEach((doc, i) => {
          const id = doc._id ?? `id_${this._nextId++}`;
          collection.push({ ...doc, _id: id });
          insertedIds[i] = String(id);
        });
        return { acknowledged: true, insertedCount: docs.length, insertedIds };
      }

      case 'find': {
        const [dbName, collName, filter, options] = args as [string, string, Document, Document];
        const collection = this._getCollection(dbName, collName);
        let results = collection.filter((doc) => this._matchesFilter(doc, filter));

        if (options?.sort) {
          results = this._sortDocs(results, options.sort as Record<string, 1 | -1>);
        }
        if (options?.skip) {
          results = results.slice(options.skip as number);
        }
        if (options?.limit !== undefined) {
          results = results.slice(0, options.limit as number);
        }
        if (options?.projection) {
          results = results.map((doc) => this._applyProjection(doc, options.projection as Record<string, 0 | 1>));
        }

        return results;
      }

      case 'findOneAndUpdate': {
        const [dbName, collName, filter, update, options] = args as [string, string, Document, Document, Document];
        const collection = this._getCollection(dbName, collName);
        const index = collection.findIndex((doc) => this._matchesFilter(doc, filter));

        if (index === -1) {
          if (options?.upsert) {
            const id = `id_${this._nextId++}`;
            const newDoc = { _id: id, ...filter, ...this._applyUpdate({}, update) };
            collection.push(newDoc);
            return options?.returnDocument === 'after' ? newDoc : null;
          }
          return null;
        }

        const original = { ...collection[index] };
        collection[index] = this._applyUpdate(collection[index], update);

        return options?.returnDocument === 'after' ? collection[index] : original;
      }

      case 'findOneAndDelete': {
        const [dbName, collName, filter] = args as [string, string, Document];
        const collection = this._getCollection(dbName, collName);
        const index = collection.findIndex((doc) => this._matchesFilter(doc, filter));

        if (index === -1) return null;

        const deleted = collection[index];
        collection.splice(index, 1);
        return deleted;
      }

      case 'findOneAndReplace': {
        const [dbName, collName, filter, replacement, options] = args as [string, string, Document, Document, Document];
        const collection = this._getCollection(dbName, collName);
        const index = collection.findIndex((doc) => this._matchesFilter(doc, filter));

        if (index === -1) {
          if (options?.upsert) {
            const id = `id_${this._nextId++}`;
            const newDoc = { _id: id, ...replacement };
            collection.push(newDoc);
            return options?.returnDocument === 'after' ? newDoc : null;
          }
          return null;
        }

        const original = { ...collection[index] };
        collection[index] = { _id: original._id, ...replacement };

        return options?.returnDocument === 'after' ? collection[index] : original;
      }

      case 'updateOne': {
        const [dbName, collName, filter, update, options] = args as [string, string, Document, Document, Document];
        const collection = this._getCollection(dbName, collName);
        const index = collection.findIndex((doc) => this._matchesFilter(doc, filter));

        if (index === -1) {
          if (options?.upsert) {
            const id = `id_${this._nextId++}`;
            const newDoc = { _id: id, ...this._applyUpdate({}, update) };
            collection.push(newDoc);
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: id, upsertedCount: 1 };
          }
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        }

        collection[index] = this._applyUpdate(collection[index], update);
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
      }

      case 'updateMany': {
        const [dbName, collName, filter, update, options] = args as [string, string, Document, Document, Document];
        const collection = this._getCollection(dbName, collName);
        let matchedCount = 0;
        let modifiedCount = 0;

        collection.forEach((doc, i) => {
          if (this._matchesFilter(doc, filter)) {
            matchedCount++;
            const updated = this._applyUpdate(doc, update);
            if (JSON.stringify(updated) !== JSON.stringify(doc)) {
              collection[i] = updated;
              modifiedCount++;
            }
          }
        });

        if (matchedCount === 0 && options?.upsert) {
          const id = `id_${this._nextId++}`;
          const newDoc = { _id: id, ...this._applyUpdate({}, update) };
          collection.push(newDoc);
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: id, upsertedCount: 1 };
        }

        return { acknowledged: true, matchedCount, modifiedCount };
      }

      case 'replaceOne': {
        const [dbName, collName, filter, replacement, options] = args as [string, string, Document, Document, Document];
        const collection = this._getCollection(dbName, collName);
        const index = collection.findIndex((doc) => this._matchesFilter(doc, filter));

        if (index === -1) {
          if (options?.upsert) {
            const id = `id_${this._nextId++}`;
            const newDoc = { _id: id, ...replacement };
            collection.push(newDoc);
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: id, upsertedCount: 1 };
          }
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        }

        const original = collection[index];
        collection[index] = { _id: original._id, ...replacement };
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
      }

      case 'deleteOne': {
        const [dbName, collName, filter] = args as [string, string, Document];
        const collection = this._getCollection(dbName, collName);
        const index = collection.findIndex((doc) => this._matchesFilter(doc, filter));

        if (index === -1) {
          return { acknowledged: true, deletedCount: 0 };
        }

        collection.splice(index, 1);
        return { acknowledged: true, deletedCount: 1 };
      }

      case 'deleteMany': {
        const [dbName, collName, filter] = args as [string, string, Document];
        const collection = this._getCollection(dbName, collName);
        const toDelete: number[] = [];

        collection.forEach((doc, i) => {
          if (this._matchesFilter(doc, filter)) {
            toDelete.push(i);
          }
        });

        // Delete in reverse order to maintain indices
        for (let i = toDelete.length - 1; i >= 0; i--) {
          collection.splice(toDelete[i], 1);
        }

        return { acknowledged: true, deletedCount: toDelete.length };
      }

      case 'countDocuments': {
        const [dbName, collName, filter, options] = args as [string, string, Document, Document];
        const collection = this._getCollection(dbName, collName);
        let results = collection.filter((doc) => this._matchesFilter(doc, filter));

        if (options?.skip) {
          results = results.slice(options.skip as number);
        }
        if (options?.limit) {
          results = results.slice(0, options.limit as number);
        }

        return results.length;
      }

      case 'estimatedDocumentCount': {
        const [dbName, collName] = args as [string, string];
        const collection = this._getCollection(dbName, collName);
        return collection.length;
      }

      case 'aggregate': {
        const [dbName, collName, pipeline] = args as [string, string, Document[]];
        let results = [...this._getCollection(dbName, collName)];

        for (const stage of pipeline) {
          if (stage.$match) {
            results = results.filter((doc) => this._matchesFilter(doc, stage.$match as Document));
          } else if (stage.$limit) {
            results = results.slice(0, stage.$limit as number);
          } else if (stage.$skip) {
            results = results.slice(stage.$skip as number);
          } else if (stage.$sort) {
            results = this._sortDocs(results, stage.$sort as Record<string, 1 | -1>);
          } else if (stage.$project) {
            results = results.map((doc) => this._applyProjection(doc, stage.$project as Record<string, 0 | 1>));
          } else if (stage.$count) {
            results = [{ [stage.$count as string]: results.length }];
          } else if (stage.$group) {
            results = this._groupDocs(results, stage.$group as Document);
          }
        }

        return results;
      }

      case 'distinct': {
        const [dbName, collName, field, filter] = args as [string, string, string, Document];
        const collection = this._getCollection(dbName, collName);
        const filtered = filter ? collection.filter((doc) => this._matchesFilter(doc, filter)) : collection;
        const values = new Set<unknown>();

        for (const doc of filtered) {
          const value = this._getFieldValue(doc, field);
          if (value !== undefined) {
            values.add(value);
          }
        }

        return Array.from(values);
      }

      case 'createCollection': {
        const [dbName, collName] = args as [string, string];
        this._getOrCreateCollection(dbName, collName);
        return { ok: 1 };
      }

      case 'dropCollection': {
        const [dbName, collName] = args as [string, string];
        const db = this._data.get(dbName);
        if (db) {
          db.delete(collName);
        }
        return true;
      }

      case 'dropDatabase': {
        const [dbName] = args as [string];
        this._data.delete(dbName);
        return true;
      }

      case 'listCollections': {
        const [dbName] = args as [string];
        const db = this._data.get(dbName);
        if (!db) return [];
        return Array.from(db.keys()).map((name) => ({ name, type: 'collection' }));
      }

      case 'listDatabases': {
        const databases = Array.from(this._data.keys()).map((name) => ({
          name,
          sizeOnDisk: 0,
          empty: (this._data.get(name)?.size ?? 0) === 0,
        }));
        return { databases, totalSize: 0 };
      }

      case 'createIndex':
        return 'index_name';

      case 'createIndexes':
        return ['index_1', 'index_2'];

      case 'dropIndex':
      case 'dropIndexes':
        return;

      case 'listIndexes':
        return [{ v: 2, key: { _id: 1 }, name: '_id_' }];

      case 'runCommand': {
        const [, command] = args as [string, Document];
        if (command.dbStats) {
          return { db: args[0], collections: 0, objects: 0, avgObjSize: 0, dataSize: 0, storageSize: 0, indexes: 0, indexSize: 0, ok: 1 };
        }
        return { ok: 1 };
      }

      case 'serverStatus':
        return { host: 'localhost', version: '1.0.0', ok: 1 };

      case 'adminCommand':
        return { ok: 1 };

      case 'renameCollection': {
        const [dbName, fromName, toName] = args as [string, string, string];
        const db = this._data.get(dbName);
        if (db) {
          const collection = db.get(fromName);
          if (collection) {
            db.delete(fromName);
            db.set(toName, collection);
          }
        }
        return;
      }

      case 'bulkWrite': {
        const [dbName, collName, operations] = args as [string, string, Document[]];
        let insertedCount = 0;
        let matchedCount = 0;
        let modifiedCount = 0;
        let deletedCount = 0;
        let upsertedCount = 0;
        const upsertedIds: Record<number, string> = {};

        for (let i = 0; i < operations.length; i++) {
          const op = operations[i];
          if (op.insertOne) {
            await this.call('insertOne', dbName, collName, op.insertOne.document);
            insertedCount++;
          } else if (op.updateOne) {
            const result = await this.call('updateOne', dbName, collName, op.updateOne.filter, op.updateOne.update, { upsert: op.updateOne.upsert }) as { matchedCount: number; modifiedCount: number; upsertedId?: string; upsertedCount?: number };
            matchedCount += result.matchedCount;
            modifiedCount += result.modifiedCount;
            if (result.upsertedId) {
              upsertedIds[i] = result.upsertedId;
              upsertedCount += result.upsertedCount ?? 0;
            }
          } else if (op.updateMany) {
            const result = await this.call('updateMany', dbName, collName, op.updateMany.filter, op.updateMany.update, { upsert: op.updateMany.upsert }) as { matchedCount: number; modifiedCount: number };
            matchedCount += result.matchedCount;
            modifiedCount += result.modifiedCount;
          } else if (op.deleteOne) {
            const result = await this.call('deleteOne', dbName, collName, op.deleteOne.filter) as { deletedCount: number };
            deletedCount += result.deletedCount;
          } else if (op.deleteMany) {
            const result = await this.call('deleteMany', dbName, collName, op.deleteMany.filter) as { deletedCount: number };
            deletedCount += result.deletedCount;
          } else if (op.replaceOne) {
            const result = await this.call('replaceOne', dbName, collName, op.replaceOne.filter, op.replaceOne.replacement, { upsert: op.replaceOne.upsert }) as { matchedCount: number; modifiedCount: number; upsertedId?: string };
            matchedCount += result.matchedCount;
            modifiedCount += result.modifiedCount;
            if (result.upsertedId) {
              upsertedIds[i] = result.upsertedId;
              upsertedCount++;
            }
          }
        }

        return { insertedCount, matchedCount, modifiedCount, deletedCount, upsertedCount, upsertedIds };
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    this._closed = true;
  }

  /**
   * Check if closed
   */
  get isClosed(): boolean {
    return this._closed;
  }

  /**
   * Get or create a database
   */
  private _getOrCreateDb(name: string): Map<string, Document[]> {
    let db = this._data.get(name);
    if (!db) {
      db = new Map();
      this._data.set(name, db);
    }
    return db;
  }

  /**
   * Get or create a collection
   */
  private _getOrCreateCollection(dbName: string, collName: string): Document[] {
    const db = this._getOrCreateDb(dbName);
    let collection = db.get(collName);
    if (!collection) {
      collection = [];
      db.set(collName, collection);
    }
    return collection;
  }

  /**
   * Get a collection (returns empty array if not exists)
   */
  private _getCollection(dbName: string, collName: string): Document[] {
    return this._getOrCreateCollection(dbName, collName);
  }

  /**
   * Check if a document matches a filter
   */
  private _matchesFilter(doc: Document, filter: Document): boolean {
    if (!filter || Object.keys(filter).length === 0) {
      return true;
    }

    for (const [key, value] of Object.entries(filter)) {
      // Handle special operators
      if (key === '$and') {
        if (!Array.isArray(value)) return false;
        if (!value.every((f: Document) => this._matchesFilter(doc, f))) return false;
        continue;
      }
      if (key === '$or') {
        if (!Array.isArray(value)) return false;
        if (!value.some((f: Document) => this._matchesFilter(doc, f))) return false;
        continue;
      }
      if (key === '$nor') {
        if (!Array.isArray(value)) return false;
        if (value.some((f: Document) => this._matchesFilter(doc, f))) return false;
        continue;
      }

      const docValue = this._getFieldValue(doc, key);

      // Handle operator objects
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const operators = value as Record<string, unknown>;
        let allMatch = true;

        for (const [op, opValue] of Object.entries(operators)) {
          if (!op.startsWith('$')) {
            // Not an operator, just nested object comparison
            if (!this._compareValues(docValue, value)) {
              allMatch = false;
              break;
            }
            continue;
          }

          switch (op) {
            case '$eq':
              if (opValue === null) {
                if (docValue !== null && docValue !== undefined) allMatch = false;
              } else if (!this._compareValues(docValue, opValue)) {
                allMatch = false;
              }
              break;
            case '$ne':
              if (this._compareValues(docValue, opValue)) allMatch = false;
              break;
            case '$gt':
              if (docValue === undefined || docValue === null || docValue <= (opValue as number)) allMatch = false;
              break;
            case '$gte':
              if (docValue === undefined || docValue === null || docValue < (opValue as number)) allMatch = false;
              break;
            case '$lt':
              if (docValue === undefined || docValue === null || docValue >= (opValue as number)) allMatch = false;
              break;
            case '$lte':
              if (docValue === undefined || docValue === null || docValue > (opValue as number)) allMatch = false;
              break;
            case '$in':
              if (!Array.isArray(opValue) || !opValue.some((v) => this._compareValues(docValue, v))) allMatch = false;
              break;
            case '$nin':
              if (!Array.isArray(opValue) || opValue.some((v) => this._compareValues(docValue, v))) allMatch = false;
              break;
            case '$exists':
              if ((opValue && docValue === undefined) || (!opValue && docValue !== undefined)) allMatch = false;
              break;
            case '$regex': {
              const pattern = typeof opValue === 'string' ? opValue : String(opValue);
              const flags = operators.$options as string | undefined;
              const regex = new RegExp(pattern, flags);
              if (typeof docValue !== 'string' || !regex.test(docValue)) allMatch = false;
              break;
            }
            case '$size':
              if (!Array.isArray(docValue) || docValue.length !== opValue) allMatch = false;
              break;
            case '$all':
              if (!Array.isArray(docValue) || !Array.isArray(opValue) || !opValue.every((v) => docValue.some((dv) => this._compareValues(dv, v)))) allMatch = false;
              break;
            case '$elemMatch':
              if (!Array.isArray(docValue)) {
                allMatch = false;
              } else {
                // For primitive array elements, wrap in object and check operators directly
                const elemFilter = opValue as Record<string, unknown>;
                const hasOperators = Object.keys(elemFilter).some((k) => k.startsWith('$'));
                if (hasOperators) {
                  // Primitive array with operators like { $gt: 90 }
                  allMatch = docValue.some((elem) => this._matchesOperator(elem, elemFilter));
                } else {
                  // Object array - use standard filter matching
                  allMatch = docValue.some((elem) => this._matchesFilter(elem as Document, elemFilter as Document));
                }
              }
              break;
            case '$not':
              if (this._matchesOperator(docValue, opValue as Record<string, unknown>)) allMatch = false;
              break;
            case '$options':
              // Handled with $regex
              break;
            default:
              // Unknown operator - skip
              break;
          }

          if (!allMatch) break;
        }

        if (!allMatch) return false;
      } else {
        // Direct value comparison
        // Handle null matching undefined fields
        if (value === null) {
          if (docValue !== null && docValue !== undefined) {
            return false;
          }
        } else if (Array.isArray(docValue)) {
          // If docValue is an array and we're comparing directly to a non-array value,
          // check if the array contains that value (MongoDB array element matching)
          if (!Array.isArray(value) && !docValue.some((elem) => this._compareValues(elem, value))) {
            return false;
          } else if (Array.isArray(value) && !this._compareValues(docValue, value)) {
            return false;
          }
        } else if (!this._compareValues(docValue, value)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Match a single operator
   */
  private _matchesOperator(docValue: unknown, operators: Record<string, unknown>): boolean {
    for (const [op, opValue] of Object.entries(operators)) {
      switch (op) {
        case '$eq':
          if (!this._compareValues(docValue, opValue)) return false;
          break;
        case '$ne':
          if (this._compareValues(docValue, opValue)) return false;
          break;
        case '$gt':
          if (docValue === undefined || docValue === null || docValue <= (opValue as number)) return false;
          break;
        case '$gte':
          if (docValue === undefined || docValue === null || docValue < (opValue as number)) return false;
          break;
        case '$lt':
          if (docValue === undefined || docValue === null || docValue >= (opValue as number)) return false;
          break;
        case '$lte':
          if (docValue === undefined || docValue === null || docValue > (opValue as number)) return false;
          break;
        case '$in':
          if (!Array.isArray(opValue) || !opValue.some((v) => this._compareValues(docValue, v))) return false;
          break;
        case '$nin':
          if (!Array.isArray(opValue) || opValue.some((v) => this._compareValues(docValue, v))) return false;
          break;
        case '$exists':
          if ((opValue && docValue === undefined) || (!opValue && docValue !== undefined)) return false;
          break;
        case '$regex': {
          const pattern = typeof opValue === 'string' ? opValue : String(opValue);
          const flags = operators.$options as string | undefined;
          const regex = new RegExp(pattern, flags);
          if (typeof docValue !== 'string' || !regex.test(docValue)) return false;
          break;
        }
      }
    }
    return true;
  }

  /**
   * Get a nested field value using dot notation
   */
  private _getFieldValue(doc: Document, path: string): unknown {
    const parts = path.split('.');
    let value: unknown = doc;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      if (typeof value !== 'object') return undefined;
      value = (value as Record<string, unknown>)[part];
    }

    return value;
  }

  /**
   * Set a nested field value using dot notation
   */
  private _setFieldValue(doc: Document, path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = doc;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Delete a nested field using dot notation
   */
  private _deleteFieldValue(doc: Document, path: string): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = doc;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined || current[part] === null) return;
      current = current[part] as Record<string, unknown>;
    }

    delete current[parts[parts.length - 1]];
  }

  /**
   * Compare two values for equality
   */
  private _compareValues(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (a === undefined || b === undefined) return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => this._compareValues(v, b[i]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a as object);
      const keysB = Object.keys(b as object);
      if (keysA.length !== keysB.length) return false;
      return keysA.every((key) => this._compareValues((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
    }

    return false;
  }

  /**
   * Sort documents
   */
  private _sortDocs(docs: Document[], sort: Record<string, 1 | -1>): Document[] {
    return [...docs].sort((a, b) => {
      for (const [key, direction] of Object.entries(sort)) {
        const aVal = this._getFieldValue(a, key);
        const bVal = this._getFieldValue(b, key);

        if (aVal === bVal) continue;
        if (aVal === undefined || aVal === null) return direction;
        if (bVal === undefined || bVal === null) return -direction;

        if (aVal < bVal) return -direction;
        if (aVal > bVal) return direction;
      }
      return 0;
    });
  }

  /**
   * Apply projection to a document
   */
  private _applyProjection(doc: Document, projection: Record<string, 0 | 1>): Document {
    const hasInclusion = Object.values(projection).some((v) => v === 1);
    const hasExclusion = Object.values(projection).some((v) => v === 0);

    if (hasInclusion && hasExclusion) {
      // Only _id can be excluded with inclusions
      const result: Document = { _id: doc._id };
      for (const [key, value] of Object.entries(projection)) {
        if (value === 1 && key !== '_id') {
          result[key] = this._getFieldValue(doc, key);
        }
      }
      if (projection._id === 0) {
        delete result._id;
      }
      return result;
    }

    if (hasInclusion) {
      const result: Document = projection._id !== 0 ? { _id: doc._id } : {};
      for (const [key, value] of Object.entries(projection)) {
        if (value === 1) {
          result[key] = this._getFieldValue(doc, key);
        }
      }
      return result;
    }

    // Exclusion only
    const result = { ...doc };
    for (const [key, value] of Object.entries(projection)) {
      if (value === 0) {
        delete result[key];
      }
    }
    return result;
  }

  /**
   * Apply update operators to a document
   */
  private _applyUpdate(doc: Document, update: Document): Document {
    const result = { ...doc };

    if (update.$set) {
      for (const [key, value] of Object.entries(update.$set as Record<string, unknown>)) {
        this._setFieldValue(result, key, value);
      }
    }

    if (update.$unset) {
      for (const key of Object.keys(update.$unset as Record<string, unknown>)) {
        this._deleteFieldValue(result, key);
      }
    }

    if (update.$inc) {
      for (const [key, value] of Object.entries(update.$inc as Record<string, number>)) {
        const current = this._getFieldValue(result, key);
        this._setFieldValue(result, key, (typeof current === 'number' ? current : 0) + value);
      }
    }

    if (update.$mul) {
      for (const [key, value] of Object.entries(update.$mul as Record<string, number>)) {
        const current = this._getFieldValue(result, key);
        this._setFieldValue(result, key, (typeof current === 'number' ? current : 0) * value);
      }
    }

    if (update.$min) {
      for (const [key, value] of Object.entries(update.$min as Record<string, unknown>)) {
        const current = this._getFieldValue(result, key);
        if (current === undefined || (value as number) < (current as number)) {
          this._setFieldValue(result, key, value);
        }
      }
    }

    if (update.$max) {
      for (const [key, value] of Object.entries(update.$max as Record<string, unknown>)) {
        const current = this._getFieldValue(result, key);
        if (current === undefined || (value as number) > (current as number)) {
          this._setFieldValue(result, key, value);
        }
      }
    }

    if (update.$rename) {
      for (const [oldKey, newKey] of Object.entries(update.$rename as Record<string, string>)) {
        const value = this._getFieldValue(result, oldKey);
        this._deleteFieldValue(result, oldKey);
        this._setFieldValue(result, newKey, value);
      }
    }

    if (update.$push) {
      for (const [key, value] of Object.entries(update.$push as Record<string, unknown>)) {
        let current = this._getFieldValue(result, key);
        if (!Array.isArray(current)) {
          current = [];
          this._setFieldValue(result, key, current);
        }
        const arr = current as unknown[];

        if (value !== null && typeof value === 'object' && '$each' in (value as Record<string, unknown>)) {
          const modifier = value as { $each: unknown[]; $position?: number; $slice?: number; $sort?: 1 | -1 | Record<string, 1 | -1> };
          const position = modifier.$position ?? arr.length;
          arr.splice(position, 0, ...modifier.$each);

          if (modifier.$sort !== undefined) {
            if (typeof modifier.$sort === 'number') {
              arr.sort((a, b) => {
                if (a === b) return 0;
                if (a === undefined || a === null) return modifier.$sort;
                if (b === undefined || b === null) return -modifier.$sort;
                if (a < b) return -modifier.$sort;
                if (a > b) return modifier.$sort;
                return 0;
              });
            } else {
              const sorted = this._sortDocs(arr as Document[], modifier.$sort);
              arr.length = 0;
              arr.push(...sorted);
            }
          }

          if (modifier.$slice !== undefined) {
            if (modifier.$slice >= 0) {
              arr.splice(modifier.$slice);
            } else {
              arr.splice(0, arr.length + modifier.$slice);
            }
          }
        } else {
          arr.push(value);
        }
      }
    }

    if (update.$addToSet) {
      for (const [key, value] of Object.entries(update.$addToSet as Record<string, unknown>)) {
        let current = this._getFieldValue(result, key);
        if (!Array.isArray(current)) {
          current = [];
          this._setFieldValue(result, key, current);
        }
        const arr = current as unknown[];

        if (value !== null && typeof value === 'object' && '$each' in (value as Record<string, unknown>)) {
          const items = (value as { $each: unknown[] }).$each;
          for (const item of items) {
            if (!arr.some((v) => this._compareValues(v, item))) {
              arr.push(item);
            }
          }
        } else {
          if (!arr.some((v) => this._compareValues(v, value))) {
            arr.push(value);
          }
        }
      }
    }

    if (update.$pop) {
      for (const [key, value] of Object.entries(update.$pop as Record<string, 1 | -1>)) {
        const current = this._getFieldValue(result, key);
        if (Array.isArray(current)) {
          if (value === 1) {
            current.pop();
          } else {
            current.shift();
          }
        }
      }
    }

    if (update.$pull) {
      for (const [key, value] of Object.entries(update.$pull as Record<string, unknown>)) {
        const current = this._getFieldValue(result, key);
        if (Array.isArray(current)) {
          const filtered = current.filter((item) => {
            if (value !== null && typeof value === 'object') {
              // Check if it's a filter
              const hasOperator = Object.keys(value as object).some((k) => k.startsWith('$'));
              if (hasOperator) {
                return !this._matchesFilter({ item } as Document, { item: value } as Document);
              }
              return !this._compareValues(item, value);
            }
            return !this._compareValues(item, value);
          });
          this._setFieldValue(result, key, filtered);
        }
      }
    }

    if (update.$currentDate) {
      for (const [key, value] of Object.entries(update.$currentDate as Record<string, unknown>)) {
        const now = new Date();
        if (value === true || (typeof value === 'object' && (value as { $type: string }).$type === 'date')) {
          this._setFieldValue(result, key, now);
        } else if (typeof value === 'object' && (value as { $type: string }).$type === 'timestamp') {
          this._setFieldValue(result, key, { t: Math.floor(now.getTime() / 1000), i: 1 });
        }
      }
    }

    return result;
  }

  /**
   * Group documents by _id field in $group stage
   */
  private _groupDocs(docs: Document[], groupSpec: Document): Document[] {
    const groups = new Map<string, { key: unknown; docs: Document[] }>();

    for (const doc of docs) {
      const keyValue = groupSpec._id === null ? null : this._evaluateExpression(doc, groupSpec._id);
      const keyStr = JSON.stringify(keyValue);

      if (!groups.has(keyStr)) {
        groups.set(keyStr, { key: keyValue, docs: [] });
      }
      groups.get(keyStr)!.docs.push(doc);
    }

    const results: Document[] = [];

    for (const [, { key, docs: groupDocs }] of groups) {
      const result: Document = { _id: key };

      for (const [field, spec] of Object.entries(groupSpec)) {
        if (field === '_id') continue;

        if (typeof spec === 'object' && spec !== null) {
          const accSpec = spec as Record<string, unknown>;

          if ('$sum' in accSpec) {
            if (accSpec.$sum === 1) {
              result[field] = groupDocs.length;
            } else {
              result[field] = groupDocs.reduce((sum, d) => sum + (this._evaluateExpression(d, accSpec.$sum) as number), 0);
            }
          } else if ('$avg' in accSpec) {
            const values = groupDocs.map((d) => this._evaluateExpression(d, accSpec.$avg) as number);
            result[field] = values.reduce((a, b) => a + b, 0) / values.length;
          } else if ('$min' in accSpec) {
            result[field] = Math.min(...groupDocs.map((d) => this._evaluateExpression(d, accSpec.$min) as number));
          } else if ('$max' in accSpec) {
            result[field] = Math.max(...groupDocs.map((d) => this._evaluateExpression(d, accSpec.$max) as number));
          } else if ('$first' in accSpec) {
            result[field] = groupDocs.length > 0 ? this._evaluateExpression(groupDocs[0], accSpec.$first) : null;
          } else if ('$last' in accSpec) {
            result[field] = groupDocs.length > 0 ? this._evaluateExpression(groupDocs[groupDocs.length - 1], accSpec.$last) : null;
          } else if ('$push' in accSpec) {
            result[field] = groupDocs.map((d) => this._evaluateExpression(d, accSpec.$push));
          } else if ('$addToSet' in accSpec) {
            const values = groupDocs.map((d) => this._evaluateExpression(d, accSpec.$addToSet));
            result[field] = [...new Set(values.map((v) => JSON.stringify(v)))].map((v) => JSON.parse(v));
          }
        }
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Evaluate an aggregation expression
   */
  private _evaluateExpression(doc: Document, expr: unknown): unknown {
    if (expr === null) return null;

    if (typeof expr === 'string') {
      if (expr.startsWith('$')) {
        return this._getFieldValue(doc, expr.substring(1));
      }
      return expr;
    }

    if (typeof expr !== 'object') {
      return expr;
    }

    // Handle object expressions
    const exprObj = expr as Record<string, unknown>;
    const keys = Object.keys(exprObj);

    if (keys.length === 0) return expr;

    // If it's an operator, evaluate it
    if (keys[0].startsWith('$')) {
      // For now, just return the raw expression
      return expr;
    }

    return expr;
  }
}

/**
 * MongoClient class - the main entry point for database connections
 */
export class MongoClient {
  private _uri: string;
  private _options: MongoClientOptions;
  private _transport: RpcTransport | null = null;
  private _connected = false;
  private _databases: Map<string, Db> = new Map();
  private _defaultDbName?: string;

  /**
   * Create a new MongoClient
   */
  constructor(uri: string, options?: MongoClientOptions) {
    this._uri = uri;
    this._options = options ?? {};

    // Parse the URI to get default database name
    try {
      const parsed = parseConnectionUri(uri);
      this._defaultDbName = parsed.database;
    } catch {
      // Ignore parse errors for now
    }
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<MongoClient> {
    if (this._connected) {
      return this;
    }

    // Create the transport
    // In a real implementation, this would create an actual RPC client
    // For now, we use a mock transport for testing
    this._transport = new MockRpcTransport();

    // Perform initial connection handshake
    await this._transport.call('connect', this._uri);

    this._connected = true;
    return this;
  }

  /**
   * Get a database by name
   */
  db(name?: string): Db {
    if (!this._transport) {
      throw new Error('Client must be connected before calling db()');
    }

    const dbName = name ?? this._defaultDbName ?? 'test';

    let database = this._databases.get(dbName);
    if (!database) {
      database = new Db(this._transport, dbName);
      this._databases.set(dbName, database);
    }

    return database;
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this._transport) {
      await this._transport.close();
      this._transport = null;
    }
    this._connected = false;
    this._databases.clear();
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this._connected;
  }

  /**
   * Get the internal transport (for testing)
   */
  get transport(): RpcTransport | null {
    return this._transport;
  }

  /**
   * Set a custom transport (for testing or custom RPC implementations)
   */
  setTransport(transport: RpcTransport): void {
    this._transport = transport;
    this._connected = true;
  }

  /**
   * Static connect method for convenience
   */
  static async connect(uri: string, options?: MongoClientOptions): Promise<MongoClient> {
    const client = new MongoClient(uri, options);
    return client.connect();
  }
}
