/**
 * Tests for query filtering and operators
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient } from '../src/client.js';
import { Collection } from '../src/collection.js';
import type { Document } from '../src/types.js';

interface TestDoc extends Document {
  name: string;
  age: number;
  status?: string;
  tags?: string[];
  nested?: { field: string; value?: number };
  scores?: number[];
}

describe('Query Filters', () => {
  let client: MongoClient;
  let collection: Collection<TestDoc>;

  beforeEach(async () => {
    client = await MongoClient.connect('mongodb://localhost/testdb');
    collection = client.db('testdb').collection<TestDoc>('test');
    await collection.insertMany([
      { name: 'Alice', age: 25, status: 'active', tags: ['developer', 'senior'], scores: [85, 90, 95] },
      { name: 'Bob', age: 30, status: 'active', tags: ['manager'], scores: [70, 80] },
      { name: 'Charlie', age: 35, status: 'inactive', tags: ['developer'], scores: [60, 65, 70] },
      { name: 'David', age: 40, status: 'active', nested: { field: 'test', value: 100 } },
      { name: 'Eve', age: 28 },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('comparison operators', () => {
    it('should filter with $eq', async () => {
      const docs = await collection.find({ age: { $eq: 30 } }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('Bob');
    });

    it('should filter with $ne', async () => {
      const docs = await collection.find({ status: { $ne: 'active' } }).toArray();
      expect(docs.some((d) => d.name === 'Charlie')).toBe(true);
      expect(docs.some((d) => d.name === 'Eve')).toBe(true);
    });

    it('should filter with $gt', async () => {
      const docs = await collection.find({ age: { $gt: 30 } }).toArray();
      expect(docs).toHaveLength(2);
      expect(docs.every((d) => d.age > 30)).toBe(true);
    });

    it('should filter with $gte', async () => {
      const docs = await collection.find({ age: { $gte: 30 } }).toArray();
      expect(docs).toHaveLength(3);
      expect(docs.every((d) => d.age >= 30)).toBe(true);
    });

    it('should filter with $lt', async () => {
      const docs = await collection.find({ age: { $lt: 30 } }).toArray();
      expect(docs).toHaveLength(2);
      expect(docs.every((d) => d.age < 30)).toBe(true);
    });

    it('should filter with $lte', async () => {
      const docs = await collection.find({ age: { $lte: 30 } }).toArray();
      expect(docs).toHaveLength(3);
      expect(docs.every((d) => d.age <= 30)).toBe(true);
    });

    it('should filter with $in', async () => {
      const docs = await collection.find({ age: { $in: [25, 35] } }).toArray();
      expect(docs).toHaveLength(2);
    });

    it('should filter with $nin', async () => {
      const docs = await collection.find({ age: { $nin: [25, 35] } }).toArray();
      expect(docs).toHaveLength(3);
    });
  });

  describe('logical operators', () => {
    it('should filter with $and', async () => {
      const docs = await collection.find({
        $and: [{ status: 'active' }, { age: { $gt: 25 } }],
      }).toArray();
      expect(docs).toHaveLength(2);
      expect(docs.every((d) => d.status === 'active' && d.age > 25)).toBe(true);
    });

    it('should filter with implicit $and', async () => {
      const docs = await collection.find({
        status: 'active',
        age: { $gt: 25 },
      }).toArray();
      expect(docs).toHaveLength(2);
    });

    it('should filter with $or', async () => {
      const docs = await collection.find({
        $or: [{ status: 'inactive' }, { age: { $lt: 26 } }],
      }).toArray();
      expect(docs).toHaveLength(2);
    });

    it('should filter with $nor', async () => {
      const docs = await collection.find({
        $nor: [{ status: 'active' }, { status: 'inactive' }],
      }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('Eve');
    });
  });

  describe('element operators', () => {
    it('should filter with $exists: true', async () => {
      const docs = await collection.find({ status: { $exists: true } }).toArray();
      expect(docs).toHaveLength(4);
    });

    it('should filter with $exists: false', async () => {
      const docs = await collection.find({ status: { $exists: false } }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('Eve');
    });
  });

  describe('evaluation operators', () => {
    it('should filter with $regex', async () => {
      const docs = await collection.find({ name: { $regex: '^A' } }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('Alice');
    });

    it('should filter with $regex and $options', async () => {
      const docs = await collection.find({
        name: { $regex: '^a', $options: 'i' },
      }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('Alice');
    });

    it('should filter with $not', async () => {
      const docs = await collection.find({
        age: { $not: { $gt: 30 } },
      }).toArray();
      expect(docs).toHaveLength(3);
      expect(docs.every((d) => d.age <= 30)).toBe(true);
    });

    it('should filter with $not and $in', async () => {
      const docs = await collection.find({
        age: { $not: { $in: [25, 30] } },
      }).toArray();
      expect(docs.every((d) => d.age !== 25 && d.age !== 30)).toBe(true);
    });

    it('should filter with $not and $nin', async () => {
      const docs = await collection.find({
        age: { $not: { $nin: [25, 30] } },
      }).toArray();
      expect(docs.every((d) => d.age === 25 || d.age === 30)).toBe(true);
    });

    it('should filter with $not and $exists', async () => {
      const docs = await collection.find({
        status: { $not: { $exists: false } },
      }).toArray();
      expect(docs.every((d) => d.status !== undefined)).toBe(true);
    });

    it('should filter with $not and $regex', async () => {
      const docs = await collection.find({
        name: { $not: { $regex: '^A' } },
      }).toArray();
      expect(docs.every((d) => !d.name.startsWith('A'))).toBe(true);
    });

    it('should filter with $not and $eq', async () => {
      const docs = await collection.find({
        age: { $not: { $eq: 25 } },
      }).toArray();
      expect(docs.every((d) => d.age !== 25)).toBe(true);
    });

    it('should filter with $not and $ne', async () => {
      const docs = await collection.find({
        age: { $not: { $ne: 25 } },
      }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].age).toBe(25);
    });

    it('should filter with $not and $gte', async () => {
      const docs = await collection.find({
        age: { $not: { $gte: 30 } },
      }).toArray();
      expect(docs.every((d) => d.age < 30)).toBe(true);
    });

    it('should filter with $not and $lt', async () => {
      const docs = await collection.find({
        age: { $not: { $lt: 30 } },
      }).toArray();
      expect(docs.every((d) => d.age >= 30)).toBe(true);
    });

    it('should filter with $not and $lte', async () => {
      const docs = await collection.find({
        age: { $not: { $lte: 30 } },
      }).toArray();
      expect(docs.every((d) => d.age > 30)).toBe(true);
    });
  });

  describe('array operators', () => {
    it('should filter with $size', async () => {
      const docs = await collection.find({ tags: { $size: 2 } }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('Alice');
    });

    it('should filter with $all', async () => {
      const docs = await collection.find({
        tags: { $all: ['developer', 'senior'] },
      }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('Alice');
    });

    it('should filter with $elemMatch', async () => {
      const docs = await collection.find({
        scores: { $elemMatch: { $gt: 90 } },
      }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('Alice');
    });

    it('should match array element directly', async () => {
      const docs = await collection.find({ tags: 'developer' }).toArray();
      expect(docs).toHaveLength(2);
    });
  });

  describe('dot notation', () => {
    it('should filter nested fields', async () => {
      const docs = await collection.find({ 'nested.field': 'test' }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('David');
    });

    it('should filter nested fields with operators', async () => {
      const docs = await collection.find({
        'nested.value': { $gte: 100 },
      }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('David');
    });
  });

  describe('empty filter', () => {
    it('should match all documents with empty object', async () => {
      const docs = await collection.find({}).toArray();
      expect(docs).toHaveLength(5);
    });
  });

  describe('null and undefined', () => {
    it('should handle null comparison', async () => {
      const docs = await collection.find({ status: null }).toArray();
      // Matches documents where status is null or doesn't exist
      expect(docs).toHaveLength(1);
    });

    it('should handle $eq with null', async () => {
      const docs = await collection.find({ status: { $eq: null } }).toArray();
      expect(docs).toHaveLength(1);
    });

    it('should not match non-null values with null filter', async () => {
      const docs = await collection.find({ age: null }).toArray();
      // None of the docs have age as null
      expect(docs).toHaveLength(0);
    });
  });

  describe('combined operators', () => {
    it('should combine multiple operators on same field', async () => {
      const docs = await collection.find({
        age: { $gte: 25, $lte: 35 },
      }).toArray();
      expect(docs).toHaveLength(4);
      expect(docs.every((d) => d.age >= 25 && d.age <= 35)).toBe(true);
    });

    it('should handle complex nested queries', async () => {
      const docs = await collection.find({
        $and: [
          { status: 'active' },
          { $or: [{ age: { $lt: 30 } }, { tags: 'manager' }] },
        ],
      }).toArray();
      expect(docs).toHaveLength(2);
    });
  });

  describe('array and object comparison', () => {
    it('should compare arrays for equality', async () => {
      const coll = client.db('testdb').collection('arraytest');
      await coll.insertMany([
        { name: 'test1', arr: [1, 2, 3] },
        { name: 'test2', arr: [1, 2] },
        { name: 'test3', arr: [1, 2, 3] },
      ]);

      const docs = await coll.find({ arr: [1, 2, 3] }).toArray();
      expect(docs).toHaveLength(2);
    });

    it('should compare objects for equality', async () => {
      const coll = client.db('testdb').collection('objtest');
      await coll.insertMany([
        { name: 'test1', obj: { a: 1, b: 2 } },
        { name: 'test2', obj: { a: 1 } },
        { name: 'test3', obj: { a: 1, b: 2 } },
      ]);

      const docs = await coll.find({ obj: { a: 1, b: 2 } }).toArray();
      expect(docs).toHaveLength(2);
    });

    it('should handle arrays with different lengths', async () => {
      const coll = client.db('testdb').collection('arrdiff');
      await coll.insertMany([
        { name: 'test1', arr: [1, 2, 3] },
        { name: 'test2', arr: [1, 2] },
      ]);

      const docs = await coll.find({ arr: [1, 2, 3] }).toArray();
      expect(docs).toHaveLength(1);
    });

    it('should handle objects with different keys', async () => {
      const coll = client.db('testdb').collection('objdiff');
      await coll.insertMany([
        { name: 'test1', obj: { a: 1, b: 2 } },
        { name: 'test2', obj: { a: 1, c: 2 } },
      ]);

      const docs = await coll.find({ obj: { a: 1, b: 2 } }).toArray();
      expect(docs).toHaveLength(1);
    });
  });

  describe('$elemMatch with objects', () => {
    it('should filter object arrays with $elemMatch', async () => {
      const coll = client.db('testdb').collection('elemmatchobj');
      await coll.insertMany([
        { name: 'test1', items: [{ type: 'a', value: 1 }, { type: 'b', value: 2 }] },
        { name: 'test2', items: [{ type: 'c', value: 3 }] },
      ]);

      const docs = await coll.find({
        items: { $elemMatch: { type: 'a', value: 1 } },
      }).toArray();

      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('test1');
    });
  });

  describe('nested object filtering', () => {
    it('should compare nested objects in filter', async () => {
      const coll = client.db('testdb').collection('nestobj');
      await coll.insertMany([
        { name: 'test1', config: { nested: { a: 1, b: 2 } } },
        { name: 'test2', config: { nested: { a: 1 } } },
      ]);

      // This should be treated as direct nested object comparison
      const docs = await coll.find({ config: { nested: { a: 1, b: 2 } } }).toArray();
      expect(docs).toHaveLength(1);
    });
  });

  describe('unknown operators', () => {
    it('should ignore unknown operators', async () => {
      const docs = await collection.find({
        age: { $unknownOperator: true },
      }).toArray();
      // Unknown operators should be skipped/ignored
      expect(docs).toHaveLength(5);
    });
  });
});
