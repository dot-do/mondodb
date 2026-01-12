/**
 * Tests for Db class
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient } from '../src/client.js';
import { Db } from '../src/db.js';
import { Collection } from '../src/collection.js';

describe('Db', () => {
  let client: MongoClient;
  let db: Db;

  beforeEach(async () => {
    client = await MongoClient.connect('mongodb://localhost/testdb');
    db = client.db('testdb');
  });

  afterEach(async () => {
    await client.close();
  });

  describe('properties', () => {
    it('should have correct database name', () => {
      expect(db.databaseName).toBe('testdb');
    });
  });

  describe('collection', () => {
    it('should return a collection instance', () => {
      const collection = db.collection('users');
      expect(collection).toBeInstanceOf(Collection);
      expect(collection.collectionName).toBe('users');
    });

    it('should cache collection instances', () => {
      const coll1 = db.collection('users');
      const coll2 = db.collection('users');
      expect(coll1).toBe(coll2);
    });

    it('should return different collections for different names', () => {
      const users = db.collection('users');
      const posts = db.collection('posts');
      expect(users).not.toBe(posts);
    });

    it('should support generic type parameter', () => {
      interface User {
        name: string;
        age: number;
      }
      const users = db.collection<User>('users');
      expect(users.collectionName).toBe('users');
    });
  });

  describe('createCollection', () => {
    it('should create a new collection', async () => {
      const collection = await db.createCollection('newcollection');
      expect(collection).toBeInstanceOf(Collection);
      expect(collection.collectionName).toBe('newcollection');
    });

    it('should create collection with options', async () => {
      const collection = await db.createCollection('capped', {
        capped: true,
        size: 1000000,
        max: 1000,
      });
      expect(collection.collectionName).toBe('capped');
    });
  });

  describe('dropDatabase', () => {
    it('should drop the database', async () => {
      const result = await db.dropDatabase();
      expect(result).toBe(true);
    });
  });

  describe('listCollections', () => {
    it('should list collections', async () => {
      await db.createCollection('coll1');
      await db.createCollection('coll2');
      const collections = await db.listCollections();
      expect(Array.isArray(collections)).toBe(true);
      expect(collections.some((c) => c.name === 'coll1')).toBe(true);
      expect(collections.some((c) => c.name === 'coll2')).toBe(true);
    });

    it('should return empty array for empty database', async () => {
      const freshDb = client.db('emptydb');
      const collections = await freshDb.listCollections();
      expect(collections).toHaveLength(0);
    });
  });

  describe('collections', () => {
    it('should return collection instances', async () => {
      await db.createCollection('coll1');
      await db.createCollection('coll2');
      const collections = await db.collections();
      expect(collections.every((c) => c instanceof Collection)).toBe(true);
    });
  });

  describe('command', () => {
    it('should run a database command', async () => {
      const result = await db.command({ ping: 1 });
      expect(result.ok).toBe(1);
    });
  });

  describe('stats', () => {
    it('should get database stats', async () => {
      const stats = await db.stats();
      expect(stats.ok).toBe(1);
    });
  });

  describe('admin', () => {
    it('should return admin db', async () => {
      const admin = await db.admin();
      expect(admin).toBeDefined();
    });
  });

  describe('renameCollection', () => {
    it('should rename a collection', async () => {
      await db.createCollection('oldname');
      await db.renameCollection('oldname', 'newname');
      const collections = await db.listCollections();
      expect(collections.some((c) => c.name === 'newname')).toBe(true);
      expect(collections.some((c) => c.name === 'oldname')).toBe(false);
    });
  });
});

describe('AdminDb', () => {
  let client: MongoClient;
  let db: Db;

  beforeEach(async () => {
    client = await MongoClient.connect('mongodb://localhost/testdb');
    db = client.db('testdb');
  });

  afterEach(async () => {
    await client.close();
  });

  describe('listDatabases', () => {
    it('should list all databases', async () => {
      const admin = await db.admin();
      const result = await admin.listDatabases();
      expect(result.databases).toBeInstanceOf(Array);
      expect(typeof result.totalSize).toBe('number');
    });

    it('should include database info with empty flag', async () => {
      // Create a second database with data
      const db2 = client.db('testdb2');
      await db2.collection('test').insertOne({ name: 'test' });

      const admin = await db.admin();
      const result = await admin.listDatabases();

      expect(result.databases.length).toBeGreaterThanOrEqual(1);
      const dbInfo = result.databases.find((d: { name: string }) => d.name === 'testdb2');
      expect(dbInfo).toBeDefined();
      expect(dbInfo?.empty).toBe(false);
    });
  });

  describe('serverStatus', () => {
    it('should get server status', async () => {
      const admin = await db.admin();
      const status = await admin.serverStatus();
      expect(status.ok).toBe(1);
    });
  });

  describe('ping', () => {
    it('should ping the server', async () => {
      const admin = await db.admin();
      const result = await admin.ping();
      expect(result.ok).toBe(1);
    });
  });

  describe('command', () => {
    it('should run admin command', async () => {
      const admin = await db.admin();
      const result = await admin.command({ serverStatus: 1 });
      expect(result.ok).toBe(1);
    });
  });
});
