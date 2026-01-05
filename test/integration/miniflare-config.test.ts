/**
 * Integration tests for Miniflare configuration
 *
 * These tests verify that Miniflare is correctly configured for mongo.do testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';

describe('Miniflare Configuration', () => {
  describe('Environment bindings', () => {
    it('should have MONDO_DATABASE namespace binding', () => {
      expect(env).toBeDefined();
      expect(env.MONDO_DATABASE).toBeDefined();
    });

    it('should be able to create DO IDs from name', () => {
      const id = env.MONDO_DATABASE.idFromName('test-db');
      expect(id).toBeDefined();
      expect(typeof id.toString()).toBe('string');
    });

    it('should be able to get DO stub from ID', () => {
      const id = env.MONDO_DATABASE.idFromName('test-db');
      const stub = env.MONDO_DATABASE.get(id);
      expect(stub).toBeDefined();
    });

    it('should create different IDs for different names', () => {
      const id1 = env.MONDO_DATABASE.idFromName('db-1');
      const id2 = env.MONDO_DATABASE.idFromName('db-2');
      expect(id1.toString()).not.toBe(id2.toString());
    });

    it('should create the same ID for the same name', () => {
      const id1 = env.MONDO_DATABASE.idFromName('consistent-db');
      const id2 = env.MONDO_DATABASE.idFromName('consistent-db');
      expect(id1.toString()).toBe(id2.toString());
    });
  });

  describe('SELF binding', () => {
    it('should have SELF binding for fetch testing', () => {
      expect(SELF).toBeDefined();
    });
  });

  describe('DO stub functionality', () => {
    it('should be able to fetch from DO stub', async () => {
      const id = env.MONDO_DATABASE.idFromName('fetch-test');
      const stub = env.MONDO_DATABASE.get(id);

      const response = await stub.fetch('http://test/health');
      // Always consume response body to properly close the connection
      const body = await response.text();

      expect(response).toBeDefined();
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(body).toBeDefined();
    });

    it('should respond with JSON from health endpoint', async () => {
      const id = env.MONDO_DATABASE.idFromName('health-test');
      const stub = env.MONDO_DATABASE.get(id);

      const response = await stub.fetch('http://test/health');
      const data = await response.json() as { status: string };

      expect(data).toBeDefined();
      expect(typeof data.status).toBe('string');
    });
  });
});
