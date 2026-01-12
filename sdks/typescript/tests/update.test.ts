/**
 * Tests for update operators
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient } from '../src/client.js';
import { Collection } from '../src/collection.js';
import type { Document } from '../src/types.js';

interface TestDoc extends Document {
  name: string;
  age?: number;
  score?: number;
  tags?: string[];
  nested?: { field: string; value?: number };
  items?: { name: string; qty: number }[];
  oldField?: string;
  newField?: string;
  date?: Date;
  timestamp?: { t: number; i: number };
}

describe('Update Operators', () => {
  let client: MongoClient;
  let collection: Collection<TestDoc>;

  beforeEach(async () => {
    client = await MongoClient.connect('mongodb://localhost/testdb');
    collection = client.db('testdb').collection<TestDoc>('test');
  });

  afterEach(async () => {
    await client.close();
  });

  describe('$set', () => {
    it('should set a field', async () => {
      await collection.insertOne({ name: 'Test', age: 25 });
      await collection.updateOne({ name: 'Test' }, { $set: { age: 30 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.age).toBe(30);
    });

    it('should set multiple fields', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, { $set: { age: 30, score: 100 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.age).toBe(30);
      expect(doc?.score).toBe(100);
    });

    it('should create field if not exists', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, { $set: { score: 100 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBe(100);
    });

    it('should set nested field with dot notation', async () => {
      await collection.insertOne({ name: 'Test', nested: { field: 'old' } });
      await collection.updateOne({ name: 'Test' }, { $set: { 'nested.field': 'new' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.nested?.field).toBe('new');
    });

    it('should create nested structure if not exists', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, { $set: { 'nested.field': 'value' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.nested?.field).toBe('value');
    });
  });

  describe('$unset', () => {
    it('should remove a field', async () => {
      await collection.insertOne({ name: 'Test', age: 25, score: 100 });
      await collection.updateOne({ name: 'Test' }, { $unset: { score: '' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBeUndefined();
      expect(doc?.age).toBe(25);
    });

    it('should remove nested field', async () => {
      await collection.insertOne({ name: 'Test', nested: { field: 'test', value: 100 } });
      await collection.updateOne({ name: 'Test' }, { $unset: { 'nested.value': '' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.nested?.field).toBe('test');
      expect(doc?.nested?.value).toBeUndefined();
    });
  });

  describe('$inc', () => {
    it('should increment a field', async () => {
      await collection.insertOne({ name: 'Test', age: 25 });
      await collection.updateOne({ name: 'Test' }, { $inc: { age: 5 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.age).toBe(30);
    });

    it('should decrement a field with negative value', async () => {
      await collection.insertOne({ name: 'Test', age: 25 });
      await collection.updateOne({ name: 'Test' }, { $inc: { age: -5 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.age).toBe(20);
    });

    it('should create field with increment value if not exists', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, { $inc: { score: 10 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBe(10);
    });
  });

  describe('$mul', () => {
    it('should multiply a field', async () => {
      await collection.insertOne({ name: 'Test', score: 10 });
      await collection.updateOne({ name: 'Test' }, { $mul: { score: 2 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBe(20);
    });

    it('should set field to 0 if not exists', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, { $mul: { score: 5 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBe(0);
    });
  });

  describe('$min', () => {
    it('should update to lower value', async () => {
      await collection.insertOne({ name: 'Test', score: 100 });
      await collection.updateOne({ name: 'Test' }, { $min: { score: 50 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBe(50);
    });

    it('should not update to higher value', async () => {
      await collection.insertOne({ name: 'Test', score: 100 });
      await collection.updateOne({ name: 'Test' }, { $min: { score: 150 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBe(100);
    });

    it('should set field if not exists', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, { $min: { score: 50 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBe(50);
    });
  });

  describe('$max', () => {
    it('should update to higher value', async () => {
      await collection.insertOne({ name: 'Test', score: 100 });
      await collection.updateOne({ name: 'Test' }, { $max: { score: 150 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBe(150);
    });

    it('should not update to lower value', async () => {
      await collection.insertOne({ name: 'Test', score: 100 });
      await collection.updateOne({ name: 'Test' }, { $max: { score: 50 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBe(100);
    });

    it('should set field if not exists', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, { $max: { score: 150 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.score).toBe(150);
    });
  });

  describe('$rename', () => {
    it('should rename a field', async () => {
      await collection.insertOne({ name: 'Test', oldField: 'value' });
      await collection.updateOne({ name: 'Test' }, { $rename: { oldField: 'newField' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.oldField).toBeUndefined();
      expect(doc?.newField).toBe('value');
    });
  });

  describe('$push', () => {
    it('should push to array', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'b'] });
      await collection.updateOne({ name: 'Test' }, { $push: { tags: 'c' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['a', 'b', 'c']);
    });

    it('should create array if not exists', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, { $push: { tags: 'a' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['a']);
    });

    it('should push multiple with $each', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a'] });
      await collection.updateOne({ name: 'Test' }, {
        $push: { tags: { $each: ['b', 'c'] } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['a', 'b', 'c']);
    });

    it('should push with $position', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'c'] });
      await collection.updateOne({ name: 'Test' }, {
        $push: { tags: { $each: ['b'], $position: 1 } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['a', 'b', 'c']);
    });

    it('should push with $slice (positive)', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'b'] });
      await collection.updateOne({ name: 'Test' }, {
        $push: { tags: { $each: ['c', 'd'], $slice: 3 } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toHaveLength(3);
    });

    it('should push with $slice (negative)', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'b'] });
      await collection.updateOne({ name: 'Test' }, {
        $push: { tags: { $each: ['c', 'd'], $slice: -3 } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toHaveLength(3);
      expect(doc?.tags?.[0]).toBe('b');
    });

    it('should push with $sort (ascending)', async () => {
      await collection.insertOne({ name: 'Test', tags: ['c', 'a'] });
      await collection.updateOne({ name: 'Test' }, {
        $push: { tags: { $each: ['b'], $sort: 1 } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['a', 'b', 'c']);
    });

    it('should push with $sort (descending)', async () => {
      await collection.insertOne({ name: 'Test', tags: ['c', 'a'] });
      await collection.updateOne({ name: 'Test' }, {
        $push: { tags: { $each: ['b'], $sort: -1 } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['c', 'b', 'a']);
    });

    it('should push with $sort for objects', async () => {
      await collection.insertOne({
        name: 'Test',
        items: [{ name: 'z', score: 10 }, { name: 'a', score: 50 }] as unknown as string[],
      });
      await collection.updateOne({ name: 'Test' }, {
        $push: { items: { $each: [{ name: 'm', score: 30 }], $sort: { score: 1 } } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.items).toHaveLength(3);
      expect((doc?.items?.[0] as unknown as { score: number }).score).toBe(10);
    });

    it('should handle equal values in $sort', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'b', 'a'] });
      await collection.updateOne({ name: 'Test' }, {
        $push: { tags: { $each: [], $sort: 1 } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toHaveLength(3);
    });

    it('should handle NaN values in $sort', async () => {
      const coll = client.db('testdb').collection('nantest');
      await coll.insertOne({ name: 'Test', values: [NaN, 1, NaN, 2] });
      await coll.updateOne({ name: 'Test' }, {
        $push: { values: { $each: [], $sort: 1 } },
      });
      const doc = await coll.findOne({ name: 'Test' });
      expect(doc?.values).toHaveLength(4);
    });

    it('should handle null and undefined values in $sort', async () => {
      const coll = client.db('testdb').collection('nullsort');
      await coll.insertOne({ name: 'Test', values: [3, null, 1, undefined, 2] });
      await coll.updateOne({ name: 'Test' }, {
        $push: { values: { $each: [], $sort: 1 } },
      });
      const doc = await coll.findOne({ name: 'Test' });
      expect(doc?.values).toHaveLength(5);
    });
  });

  describe('$addToSet', () => {
    it('should add unique value to array', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'b'] });
      await collection.updateOne({ name: 'Test' }, { $addToSet: { tags: 'c' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toContain('c');
    });

    it('should not add duplicate value', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'b'] });
      await collection.updateOne({ name: 'Test' }, { $addToSet: { tags: 'a' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toHaveLength(2);
    });

    it('should add multiple unique values with $each', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a'] });
      await collection.updateOne({ name: 'Test' }, {
        $addToSet: { tags: { $each: ['a', 'b', 'c'] } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['a', 'b', 'c']);
    });

    it('should create array if not exists', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, { $addToSet: { tags: 'a' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['a']);
    });
  });

  describe('$pop', () => {
    it('should remove last element with 1', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'b', 'c'] });
      await collection.updateOne({ name: 'Test' }, { $pop: { tags: 1 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['a', 'b']);
    });

    it('should remove first element with -1', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'b', 'c'] });
      await collection.updateOne({ name: 'Test' }, { $pop: { tags: -1 } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['b', 'c']);
    });
  });

  describe('$pull', () => {
    it('should remove matching value', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'b', 'c'] });
      await collection.updateOne({ name: 'Test' }, { $pull: { tags: 'b' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['a', 'c']);
    });

    it('should remove all matching values', async () => {
      await collection.insertOne({ name: 'Test', tags: ['a', 'b', 'a', 'c'] });
      await collection.updateOne({ name: 'Test' }, { $pull: { tags: 'a' } });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.tags).toEqual(['b', 'c']);
    });

    it('should remove with condition', async () => {
      await collection.insertOne({ name: 'Test', scores: [10, 20, 30, 40] } as TestDoc);
      await collection.updateOne({ name: 'Test' }, {
        $pull: { scores: { $gt: 25 } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.scores).toEqual([10, 20]);
    });
  });

  describe('$currentDate', () => {
    it('should set current date', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, {
        $currentDate: { date: true },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.date).toBeInstanceOf(Date);
    });

    it('should set current date with $type: date', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, {
        $currentDate: { date: { $type: 'date' } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.date).toBeInstanceOf(Date);
    });

    it('should set timestamp with $type: timestamp', async () => {
      await collection.insertOne({ name: 'Test' });
      await collection.updateOne({ name: 'Test' }, {
        $currentDate: { timestamp: { $type: 'timestamp' } },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.timestamp).toHaveProperty('t');
      expect(doc?.timestamp).toHaveProperty('i');
    });
  });

  describe('combined operators', () => {
    it('should apply multiple operators in order', async () => {
      await collection.insertOne({ name: 'Test', age: 25, score: 100 });
      await collection.updateOne({ name: 'Test' }, {
        $set: { status: 'active' },
        $inc: { age: 1, score: 10 },
        $push: { tags: 'new' },
      });
      const doc = await collection.findOne({ name: 'Test' });
      expect(doc?.status).toBe('active');
      expect(doc?.age).toBe(26);
      expect(doc?.score).toBe(110);
      expect(doc?.tags).toEqual(['new']);
    });
  });
});
