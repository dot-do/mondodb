/**
 * Test setup for mondodb with Miniflare
 *
 * This file is loaded before all tests and sets up the test environment.
 */

import { env, SELF, runInDurableObject } from 'cloudflare:test';

// Re-export test utilities for use in tests
export { env, SELF, runInDurableObject };

/**
 * Get a MondoDatabase Durable Object instance by name
 */
export function getDatabaseStub(name: string = 'test-db'): DurableObjectStub {
  const id = env.MONDO_DATABASE.idFromName(name);
  return env.MONDO_DATABASE.get(id);
}

/**
 * Clean up test data between tests
 */
export async function cleanupDatabase(name: string = 'test-db'): Promise<void> {
  const stub = getDatabaseStub(name);

  // Send a cleanup request to the DO
  await stub.fetch('http://test/internal/reset', {
    method: 'POST',
  });
}

/**
 * Test fixture utilities
 */
export const fixtures = {
  /**
   * Generate a test document with random data
   */
  document(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: `test-${Date.now()}`,
      createdAt: new Date().toISOString(),
      value: Math.random(),
      ...overrides,
    };
  },

  /**
   * Generate multiple test documents
   */
  documents(count: number, overrides: Record<string, unknown> = {}): Record<string, unknown>[] {
    return Array.from({ length: count }, (_, i) => ({
      ...fixtures.document(overrides),
      index: i,
    }));
  },
};

/**
 * Debug utilities for storage inspection
 */
export const debug = {
  /**
   * Dump all data from a database instance
   */
  async dumpDatabase(name: string = 'test-db'): Promise<{
    collections: unknown[];
    documents: unknown[];
  }> {
    const stub = getDatabaseStub(name);
    const response = await stub.fetch('http://test/internal/dump', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to dump database: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Log current database state for debugging
   */
  async logDatabaseState(name: string = 'test-db'): Promise<void> {
    const data = await debug.dumpDatabase(name);
    console.log('=== Database State ===');
    console.log('Collections:', JSON.stringify(data.collections, null, 2));
    console.log('Documents:', JSON.stringify(data.documents, null, 2));
    console.log('======================');
  },
};
