/**
 * Miniflare test helpers for mongo.do
 *
 * This module provides utilities for testing Durable Objects with Miniflare.
 */

import { env, runInDurableObject } from 'cloudflare:test';
import type { MondoDatabase } from '../../src/durable-object/mondo-database';

/**
 * Options for creating a test database context
 */
export interface TestDatabaseOptions {
  /** Database instance name (for isolation) */
  name?: string;
  /** Whether to reset the database before use */
  reset?: boolean;
}

/**
 * Create a test database context with helpers
 */
export async function createTestDatabase(options: TestDatabaseOptions = {}): Promise<{
  stub: DurableObjectStub;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  insertOne: (collection: string, document: Record<string, unknown>) => Promise<{ insertedId: string }>;
  findOne: (collection: string, filter: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  find: (collection: string, filter?: Record<string, unknown>) => Promise<{ documents: Record<string, unknown>[] }>;
  updateOne: (collection: string, filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<{ matchedCount: number; modifiedCount: number }>;
  deleteOne: (collection: string, filter: Record<string, unknown>) => Promise<{ deletedCount: number }>;
  deleteMany: (collection: string, filter?: Record<string, unknown>) => Promise<{ deletedCount: number }>;
  countDocuments: (collection: string, filter?: Record<string, unknown>) => Promise<number>;
  reset: () => Promise<void>;
}> {
  const { name = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`, reset = true } = options;

  const id = env.MONDO_DATABASE.idFromName(name);
  const stub = env.MONDO_DATABASE.get(id);

  const fetchDb = async (path: string, init?: RequestInit): Promise<Response> => {
    return stub.fetch(`http://test${path}`, init);
  };

  // Helper for sending POST requests with JSON body
  const postJson = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
    const response = await fetchDb(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Request failed: ${JSON.stringify(error)}`);
    }

    return response.json() as Promise<T>;
  };

  // Reset database if requested
  if (reset) {
    try {
      await fetchDb('/internal/reset', { method: 'POST' });
    } catch {
      // Ignore errors on reset (may not be implemented yet)
    }
  }

  return {
    stub,
    fetch: fetchDb,

    async insertOne(collection: string, document: Record<string, unknown>) {
      return postJson('/insertOne', { collection, document });
    },

    async findOne(collection: string, filter: Record<string, unknown>) {
      const result = await postJson<{ document: Record<string, unknown> | null }>('/findOne', { collection, filter });
      return result.document;
    },

    async find(collection: string, filter: Record<string, unknown> = {}) {
      return postJson('/find', { collection, filter });
    },

    async updateOne(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>) {
      return postJson('/updateOne', { collection, filter, update });
    },

    async deleteOne(collection: string, filter: Record<string, unknown>) {
      return postJson('/deleteOne', { collection, filter });
    },

    async deleteMany(collection: string, filter: Record<string, unknown> = {}) {
      return postJson('/deleteMany', { collection, filter });
    },

    async countDocuments(collection: string, filter: Record<string, unknown> = {}) {
      const result = await postJson<{ count: number }>('/countDocuments', { collection, filter });
      return result.count;
    },

    async reset() {
      await fetchDb('/internal/reset', { method: 'POST' });
    },
  };
}

/**
 * Run a function inside a Durable Object context
 *
 * This allows direct access to the DO's internal state for testing.
 */
export async function runInMondoDatabase<T>(
  callback: (db: MondoDatabase, storage: DurableObjectStorage) => T | Promise<T>,
  name: string = 'test-db'
): Promise<T> {
  const id = env.MONDO_DATABASE.idFromName(name);
  const stub = env.MONDO_DATABASE.get(id);

  return runInDurableObject(stub, async (instance, state) => {
    return callback(instance as unknown as MondoDatabase, state.storage);
  });
}

/**
 * Persistence path utilities for custom persistence locations
 */
export const persistence = {
  /**
   * Get the default persistence path
   */
  getDefaultPath(): string {
    return './test-data';
  },

  /**
   * Generate a unique persistence path for a test suite
   */
  getSuitePath(suiteName: string): string {
    const sanitized = suiteName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `./test-data/${sanitized}`;
  },
};

/**
 * Test isolation utilities
 */
export const isolation = {
  /**
   * Generate a unique database name for parallel test isolation
   */
  uniqueName(prefix: string = 'test'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  },

  /**
   * Create an isolated test context that won't interfere with other tests
   */
  async createIsolatedContext(prefix: string = 'test') {
    const name = isolation.uniqueName(prefix);
    return createTestDatabase({ name, reset: false });
  },
};
