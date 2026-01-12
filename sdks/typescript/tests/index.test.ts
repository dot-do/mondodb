/**
 * Tests for main exports and errors
 */

import { describe, it, expect } from 'vitest';
import {
  MongoClient,
  Db,
  Collection,
  FindCursor,
  AggregationCursor,
  AbstractCursor,
  VERSION,
  MongoError,
  MongoConnectionError,
  MongoInvalidOperationError,
  MongoWriteConcernError,
  parseConnectionUri,
  MockRpcTransport,
} from '../src/index.js';

describe('exports', () => {
  it('should export MongoClient', () => {
    expect(MongoClient).toBeDefined();
    expect(typeof MongoClient).toBe('function');
  });

  it('should export Db', () => {
    expect(Db).toBeDefined();
    expect(typeof Db).toBe('function');
  });

  it('should export Collection', () => {
    expect(Collection).toBeDefined();
    expect(typeof Collection).toBe('function');
  });

  it('should export FindCursor', () => {
    expect(FindCursor).toBeDefined();
    expect(typeof FindCursor).toBe('function');
  });

  it('should export AggregationCursor', () => {
    expect(AggregationCursor).toBeDefined();
    expect(typeof AggregationCursor).toBe('function');
  });

  it('should export AbstractCursor', () => {
    expect(AbstractCursor).toBeDefined();
    expect(typeof AbstractCursor).toBe('function');
  });

  it('should export parseConnectionUri', () => {
    expect(parseConnectionUri).toBeDefined();
    expect(typeof parseConnectionUri).toBe('function');
  });

  it('should export MockRpcTransport', () => {
    expect(MockRpcTransport).toBeDefined();
    expect(typeof MockRpcTransport).toBe('function');
  });

  it('should export VERSION', () => {
    expect(VERSION).toBeDefined();
    expect(typeof VERSION).toBe('string');
    expect(VERSION).toBe('0.1.0');
  });
});

describe('error classes', () => {
  describe('MongoError', () => {
    it('should create an error with message', () => {
      const error = new MongoError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('MongoError');
    });

    it('should create an error with code', () => {
      const error = new MongoError('Test error', 'TEST_CODE');
      expect(error.code).toBe('TEST_CODE');
    });

    it('should create an error with details', () => {
      const details = { foo: 'bar' };
      const error = new MongoError('Test error', 'TEST_CODE', details);
      expect(error.details).toEqual(details);
    });

    it('should be an instance of Error', () => {
      const error = new MongoError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('MongoConnectionError', () => {
    it('should create a connection error', () => {
      const error = new MongoConnectionError('Connection failed');
      expect(error.message).toBe('Connection failed');
      expect(error.name).toBe('MongoConnectionError');
      expect(error.code).toBe('CONNECTION_ERROR');
    });

    it('should be an instance of MongoError', () => {
      const error = new MongoConnectionError('Test');
      expect(error).toBeInstanceOf(MongoError);
    });

    it('should accept details', () => {
      const error = new MongoConnectionError('Test', { host: 'localhost' });
      expect(error.details).toEqual({ host: 'localhost' });
    });
  });

  describe('MongoInvalidOperationError', () => {
    it('should create an invalid operation error', () => {
      const error = new MongoInvalidOperationError('Invalid operation');
      expect(error.message).toBe('Invalid operation');
      expect(error.name).toBe('MongoInvalidOperationError');
      expect(error.code).toBe('INVALID_OPERATION');
    });

    it('should be an instance of MongoError', () => {
      const error = new MongoInvalidOperationError('Test');
      expect(error).toBeInstanceOf(MongoError);
    });
  });

  describe('MongoWriteConcernError', () => {
    it('should create a write concern error', () => {
      const error = new MongoWriteConcernError('Write concern failed');
      expect(error.message).toBe('Write concern failed');
      expect(error.name).toBe('MongoWriteConcernError');
      expect(error.code).toBe('WRITE_CONCERN_ERROR');
    });

    it('should be an instance of MongoError', () => {
      const error = new MongoWriteConcernError('Test');
      expect(error).toBeInstanceOf(MongoError);
    });
  });
});

describe('integration', () => {
  it('should work end-to-end', async () => {
    const client = await MongoClient.connect('mongodb://localhost/testdb');
    const db = client.db('integration_test');
    const collection = db.collection('users');

    // Insert
    const insertResult = await collection.insertOne({ name: 'Test User', age: 25 });
    expect(insertResult.acknowledged).toBe(true);

    // Find
    const user = await collection.findOne({ name: 'Test User' });
    expect(user?.name).toBe('Test User');
    expect(user?.age).toBe(25);

    // Update
    await collection.updateOne(
      { name: 'Test User' },
      { $set: { age: 26 }, $push: { tags: 'updated' } }
    );
    const updated = await collection.findOne({ name: 'Test User' });
    expect(updated?.age).toBe(26);
    expect(updated?.tags).toContain('updated');

    // Delete
    const deleteResult = await collection.deleteOne({ name: 'Test User' });
    expect(deleteResult.deletedCount).toBe(1);

    // Verify deleted
    const notFound = await collection.findOne({ name: 'Test User' });
    expect(notFound).toBeNull();

    await client.close();
  });

  it('should handle cursor operations', async () => {
    const client = await MongoClient.connect('mongodb://localhost/testdb');
    const collection = client.db('cursor_test').collection('items');

    // Insert test data
    await collection.insertMany([
      { name: 'Item 1', value: 10 },
      { name: 'Item 2', value: 20 },
      { name: 'Item 3', value: 30 },
    ]);

    // Test cursor methods
    const docs = await collection
      .find({})
      .sort({ value: -1 })
      .limit(2)
      .toArray();

    expect(docs).toHaveLength(2);
    expect(docs[0].value).toBe(30);

    // Test aggregation
    const agg = await collection
      .aggregate([
        { $group: { _id: null, total: { $sum: '$value' } } },
      ])
      .toArray();

    expect(agg[0].total).toBe(60);

    await client.close();
  });

  it('should handle complex queries', async () => {
    const client = await MongoClient.connect('mongodb://localhost/testdb');
    const collection = client.db('query_test').collection('products');

    await collection.insertMany([
      { name: 'Product A', price: 100, category: 'electronics', inStock: true },
      { name: 'Product B', price: 120, category: 'electronics', inStock: false },
      { name: 'Product C', price: 50, category: 'books', inStock: true },
    ]);

    // Complex query: electronics AND (inStock OR price < 150)
    // Product A: electronics=yes, inStock=true -> matches
    // Product B: electronics=yes, inStock=false but price=120 < 150 -> matches
    // Product C: electronics=no -> no match
    const results = await collection
      .find({
        $and: [
          { category: 'electronics' },
          { $or: [{ inStock: true }, { price: { $lt: 150 } }] },
        ],
      })
      .toArray();

    expect(results).toHaveLength(2);

    await client.close();
  });
});
