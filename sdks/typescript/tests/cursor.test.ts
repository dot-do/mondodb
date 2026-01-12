/**
 * Tests for cursor operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient } from '../src/client.js';
import { Collection } from '../src/collection.js';
import { FindCursor, AggregationCursor } from '../src/cursor.js';
import type { Document } from '../src/types.js';

interface TestDoc extends Document {
  name: string;
  value: number;
  category?: string;
}

describe('FindCursor', () => {
  let client: MongoClient;
  let collection: Collection<TestDoc>;

  beforeEach(async () => {
    client = await MongoClient.connect('mongodb://localhost/testdb');
    collection = client.db('testdb').collection<TestDoc>('test');
    await collection.insertMany([
      { name: 'doc1', value: 10, category: 'A' },
      { name: 'doc2', value: 20, category: 'B' },
      { name: 'doc3', value: 30, category: 'A' },
      { name: 'doc4', value: 40, category: 'B' },
      { name: 'doc5', value: 50, category: 'C' },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('toArray', () => {
    it('should return all documents', async () => {
      const docs = await collection.find().toArray();
      expect(docs).toHaveLength(5);
    });

    it('should return filtered documents', async () => {
      const docs = await collection.find({ category: 'A' }).toArray();
      expect(docs).toHaveLength(2);
    });
  });

  describe('next', () => {
    it('should return documents one by one', async () => {
      const cursor = collection.find();
      const doc1 = await cursor.next();
      const doc2 = await cursor.next();
      expect(doc1).not.toBeNull();
      expect(doc2).not.toBeNull();
      expect(doc1).not.toEqual(doc2);
    });

    it('should return null when exhausted', async () => {
      const cursor = collection.find().limit(1);
      await cursor.next();
      const doc = await cursor.next();
      expect(doc).toBeNull();
    });

    it('should return null when closed', async () => {
      const cursor = collection.find();
      await cursor.close();
      const doc = await cursor.next();
      expect(doc).toBeNull();
    });
  });

  describe('hasNext', () => {
    it('should return true if more documents', async () => {
      const cursor = collection.find().limit(2);
      expect(await cursor.hasNext()).toBe(true);
      await cursor.next();
      expect(await cursor.hasNext()).toBe(true);
      await cursor.next();
      expect(await cursor.hasNext()).toBe(false);
    });

    it('should return false when closed', async () => {
      const cursor = collection.find();
      await cursor.close();
      expect(await cursor.hasNext()).toBe(false);
    });
  });

  describe('forEach', () => {
    it('should iterate over all documents', async () => {
      const docs: TestDoc[] = [];
      await collection.find().forEach((doc) => {
        docs.push(doc);
      });
      expect(docs).toHaveLength(5);
    });

    it('should pass index to callback', async () => {
      const indices: number[] = [];
      await collection.find().forEach((_, index) => {
        indices.push(index);
      });
      expect(indices).toEqual([0, 1, 2, 3, 4]);
    });

    it('should stop on false return', async () => {
      const docs: TestDoc[] = [];
      await collection.find().forEach((doc) => {
        docs.push(doc);
        return docs.length < 3;
      });
      expect(docs).toHaveLength(3);
    });

    it('should handle async callback', async () => {
      const docs: TestDoc[] = [];
      await collection.find().forEach(async (doc) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        docs.push(doc);
      });
      expect(docs).toHaveLength(5);
    });

    it('should do nothing when closed', async () => {
      const cursor = collection.find();
      await cursor.close();
      const docs: TestDoc[] = [];
      await cursor.forEach((doc) => {
        docs.push(doc);
      });
      expect(docs).toHaveLength(0);
    });
  });

  describe('count', () => {
    it('should return remaining document count', async () => {
      const cursor = collection.find();
      expect(await cursor.count()).toBe(5);
      await cursor.next();
      expect(await cursor.count()).toBe(4);
    });
  });

  describe('close', () => {
    it('should close the cursor', async () => {
      const cursor = collection.find();
      expect(cursor.closed).toBe(false);
      await cursor.close();
      expect(cursor.closed).toBe(true);
    });

    it('should be idempotent', async () => {
      const cursor = collection.find();
      await cursor.close();
      await cursor.close();
      expect(cursor.closed).toBe(true);
    });

    it('should return empty array from toArray after close', async () => {
      const cursor = collection.find();
      await cursor.close();
      const docs = await cursor.toArray();
      expect(docs).toHaveLength(0);
    });
  });

  describe('sort', () => {
    it('should sort ascending', async () => {
      const docs = await collection.find().sort({ value: 1 }).toArray();
      expect(docs[0].value).toBe(10);
      expect(docs[4].value).toBe(50);
    });

    it('should sort descending', async () => {
      const docs = await collection.find().sort({ value: -1 }).toArray();
      expect(docs[0].value).toBe(50);
      expect(docs[4].value).toBe(10);
    });

    it('should sort by multiple fields', async () => {
      const docs = await collection.find().sort({ category: 1, value: -1 }).toArray();
      expect(docs[0].category).toBe('A');
      expect(docs[0].value).toBe(30);
    });
  });

  describe('limit', () => {
    it('should limit results', async () => {
      const docs = await collection.find().limit(3).toArray();
      expect(docs).toHaveLength(3);
    });

    it('should throw on negative limit', () => {
      expect(() => collection.find().limit(-1)).toThrow('non-negative');
    });

    it('should handle limit of 0', async () => {
      const docs = await collection.find().limit(0).toArray();
      expect(docs).toHaveLength(0);
    });
  });

  describe('skip', () => {
    it('should skip documents', async () => {
      const docs = await collection.find().sort({ value: 1 }).skip(2).toArray();
      expect(docs).toHaveLength(3);
      expect(docs[0].value).toBe(30);
    });

    it('should throw on negative skip', () => {
      expect(() => collection.find().skip(-1)).toThrow('non-negative');
    });
  });

  describe('project', () => {
    it('should include only specified fields', async () => {
      const docs = await collection.find().project({ name: 1 }).toArray();
      expect(docs[0]).toHaveProperty('name');
      expect(docs[0]).toHaveProperty('_id');
      expect(docs[0]).not.toHaveProperty('value');
    });

    it('should exclude specified fields', async () => {
      const docs = await collection.find().project({ value: 0 }).toArray();
      expect(docs[0]).toHaveProperty('name');
      expect(docs[0]).not.toHaveProperty('value');
    });

    it('should exclude _id when specified', async () => {
      const docs = await collection.find().project({ name: 1, _id: 0 }).toArray();
      expect(docs[0]).toHaveProperty('name');
      expect(docs[0]).not.toHaveProperty('_id');
    });
  });

  describe('chaining', () => {
    it('should support method chaining', async () => {
      const docs = await collection
        .find({ category: 'A' })
        .sort({ value: -1 })
        .limit(1)
        .project({ name: 1 })
        .toArray();

      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('doc3');
    });
  });

  describe('async iterator', () => {
    it('should support for-await-of', async () => {
      const docs: TestDoc[] = [];
      for await (const doc of collection.find()) {
        docs.push(doc);
      }
      expect(docs).toHaveLength(5);
    });

    it('should close cursor after iteration', async () => {
      const cursor = collection.find();
      for await (const _ of cursor) {
        // iterate
      }
      expect(cursor.closed).toBe(true);
    });
  });

  describe('clone', () => {
    it('should create a copy of the cursor', async () => {
      const cursor1 = collection.find().sort({ value: 1 }).limit(2);
      const cursor2 = cursor1.clone();

      const docs1 = await cursor1.toArray();
      const docs2 = await cursor2.toArray();

      expect(docs1).toEqual(docs2);
    });
  });

  describe('rewind', () => {
    it('should reset the cursor', async () => {
      const cursor = collection.find().limit(2);
      await cursor.toArray();
      expect(cursor.closed).toBe(true);

      cursor.rewind();
      expect(cursor.closed).toBe(false);

      const docs = await cursor.toArray();
      expect(docs).toHaveLength(2);
    });
  });

  describe('additional methods', () => {
    it('should support batchSize', () => {
      const cursor = collection.find().batchSize(100);
      expect(cursor).toBeDefined();
    });

    it('should support maxTimeMS', () => {
      const cursor = collection.find().maxTimeMS(5000);
      expect(cursor).toBeDefined();
    });

    it('should support hint', () => {
      const cursor = collection.find().hint('_id_');
      expect(cursor).toBeDefined();
    });

    it('should support comment', () => {
      const cursor = collection.find().comment('test query');
      expect(cursor).toBeDefined();
    });
  });

  describe('sort edge cases', () => {
    it('should sort documents with all equal values', async () => {
      const coll = client.db('testdb').collection('sortequal');
      await coll.insertMany([
        { name: 'a', value: 10 },
        { name: 'b', value: 10 },
        { name: 'c', value: 10 },
      ]);

      const docs = await coll.find().sort({ value: 1 }).toArray();
      expect(docs).toHaveLength(3);
    });

    it('should handle null values in sort', async () => {
      const coll = client.db('testdb').collection('sortnull');
      await coll.insertMany([
        { name: 'a', value: 10 },
        { name: 'b' },
        { name: 'c', value: 5 },
      ]);

      const docs = await coll.find().sort({ value: 1 }).toArray();
      expect(docs).toHaveLength(3);
    });
  });
});

describe('AggregationCursor', () => {
  let client: MongoClient;
  let collection: Collection<TestDoc>;

  beforeEach(async () => {
    client = await MongoClient.connect('mongodb://localhost/testdb');
    collection = client.db('testdb').collection<TestDoc>('test');
    await collection.insertMany([
      { name: 'doc1', value: 10, category: 'A' },
      { name: 'doc2', value: 20, category: 'B' },
      { name: 'doc3', value: 30, category: 'A' },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('toArray', () => {
    it('should return aggregation results', async () => {
      const results = await collection.aggregate([
        { $group: { _id: '$category', total: { $sum: '$value' } } },
      ]).toArray();
      expect(results).toHaveLength(2);
    });
  });

  describe('next', () => {
    it('should return results one by one', async () => {
      const cursor = collection.aggregate([{ $match: {} }]);
      const doc1 = await cursor.next();
      const doc2 = await cursor.next();
      expect(doc1).not.toBeNull();
      expect(doc2).not.toBeNull();
    });
  });

  describe('forEach', () => {
    it('should iterate over results', async () => {
      const results: Document[] = [];
      await collection.aggregate([{ $match: {} }]).forEach((doc) => {
        results.push(doc);
      });
      expect(results).toHaveLength(3);
    });
  });

  describe('async iterator', () => {
    it('should support for-await-of', async () => {
      const results: Document[] = [];
      const cursor = collection.aggregate([{ $match: {} }]);
      for await (const doc of cursor) {
        results.push(doc);
      }
      expect(results).toHaveLength(3);
    });
  });

  describe('close', () => {
    it('should close the cursor', async () => {
      const cursor = collection.aggregate([]);
      await cursor.close();
      expect(cursor.closed).toBe(true);
    });
  });
});
