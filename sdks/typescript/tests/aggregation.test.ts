/**
 * Tests for aggregation pipeline operations to increase coverage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient } from '../src/client.js';
import { Collection } from '../src/collection.js';
import type { Document } from '../src/types.js';

interface SalesDoc extends Document {
  product: string;
  category: string;
  quantity: number;
  price: number;
  date: string;
}

describe('Aggregation Pipeline', () => {
  let client: MongoClient;
  let collection: Collection<SalesDoc>;

  beforeEach(async () => {
    client = await MongoClient.connect('mongodb://localhost/testdb');
    collection = client.db('testdb').collection<SalesDoc>('sales');
    await collection.insertMany([
      { product: 'Widget A', category: 'widgets', quantity: 10, price: 100, date: '2024-01-01' },
      { product: 'Widget B', category: 'widgets', quantity: 20, price: 150, date: '2024-01-02' },
      { product: 'Gadget A', category: 'gadgets', quantity: 5, price: 200, date: '2024-01-01' },
      { product: 'Gadget B', category: 'gadgets', quantity: 15, price: 250, date: '2024-01-02' },
      { product: 'Widget C', category: 'widgets', quantity: 8, price: 120, date: '2024-01-03' },
    ]);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('$group stage', () => {
    it('should group with $sum of field', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', totalQuantity: { $sum: '$quantity' } } },
      ]).toArray();

      expect(result).toHaveLength(2);
      const widgets = result.find((r) => r._id === 'widgets');
      const gadgets = result.find((r) => r._id === 'gadgets');
      expect(widgets?.totalQuantity).toBe(38);
      expect(gadgets?.totalQuantity).toBe(20);
    });

    it('should group with $avg', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', avgPrice: { $avg: '$price' } } },
      ]).toArray();

      expect(result).toHaveLength(2);
      const widgets = result.find((r) => r._id === 'widgets');
      expect(Math.round(widgets?.avgPrice as number)).toBe(123); // (100+150+120)/3
    });

    it('should group with $min', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', minPrice: { $min: '$price' } } },
      ]).toArray();

      expect(result).toHaveLength(2);
      const widgets = result.find((r) => r._id === 'widgets');
      expect(widgets?.minPrice).toBe(100);
    });

    it('should group with $max', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', maxPrice: { $max: '$price' } } },
      ]).toArray();

      expect(result).toHaveLength(2);
      const widgets = result.find((r) => r._id === 'widgets');
      expect(widgets?.maxPrice).toBe(150);
    });

    it('should group with $first', async () => {
      const result = await collection.aggregate([
        { $sort: { price: 1 } },
        { $group: { _id: '$category', firstProduct: { $first: '$product' } } },
      ]).toArray();

      expect(result).toHaveLength(2);
      const widgets = result.find((r) => r._id === 'widgets');
      expect(widgets?.firstProduct).toBeDefined();
    });

    it('should group with $last', async () => {
      const result = await collection.aggregate([
        { $sort: { price: 1 } },
        { $group: { _id: '$category', lastProduct: { $last: '$product' } } },
      ]).toArray();

      expect(result).toHaveLength(2);
      const widgets = result.find((r) => r._id === 'widgets');
      expect(widgets?.lastProduct).toBeDefined();
    });

    it('should group with $push', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', products: { $push: '$product' } } },
      ]).toArray();

      expect(result).toHaveLength(2);
      const widgets = result.find((r) => r._id === 'widgets');
      expect(widgets?.products).toHaveLength(3);
      expect(widgets?.products).toContain('Widget A');
    });

    it('should group with $addToSet', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', dates: { $addToSet: '$date' } } },
      ]).toArray();

      expect(result).toHaveLength(2);
      const widgets = result.find((r) => r._id === 'widgets');
      expect(widgets?.dates).toHaveLength(3); // 3 unique dates
    });

    it('should group with null _id for total aggregation', async () => {
      const result = await collection.aggregate([
        { $group: { _id: null, total: { $sum: '$quantity' }, count: { $sum: 1 } } },
      ]).toArray();

      expect(result).toHaveLength(1);
      expect(result[0]._id).toBeNull();
      expect(result[0].total).toBe(58);
      expect(result[0].count).toBe(5);
    });

    it('should group with multiple accumulators', async () => {
      const result = await collection.aggregate([
        {
          $group: {
            _id: '$category',
            total: { $sum: '$quantity' },
            avg: { $avg: '$price' },
            min: { $min: '$price' },
            max: { $max: '$price' },
          },
        },
      ]).toArray();

      expect(result).toHaveLength(2);
      const widgets = result.find((r) => r._id === 'widgets');
      expect(widgets?.total).toBe(38);
      expect(widgets?.min).toBe(100);
      expect(widgets?.max).toBe(150);
    });
  });

  describe('combined pipeline stages', () => {
    it('should combine $match and $group', async () => {
      const result = await collection.aggregate([
        { $match: { category: 'widgets' } },
        { $group: { _id: '$category', total: { $sum: '$quantity' } } },
      ]).toArray();

      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(38);
    });

    it('should combine $match, $group, and $sort', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', total: { $sum: '$quantity' } } },
        { $sort: { total: -1 } },
      ]).toArray();

      expect(result).toHaveLength(2);
      expect(result[0]._id).toBe('widgets');
    });

    it('should use $skip in pipeline', async () => {
      const result = await collection.aggregate([
        { $sort: { price: 1 } },
        { $skip: 2 },
      ]).toArray();

      expect(result).toHaveLength(3);
    });
  });

  describe('expression evaluation', () => {
    it('should handle literal values in expressions', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]).toArray();

      expect(result).toHaveLength(2);
    });

    it('should handle null expressions', async () => {
      const coll = client.db('testdb').collection('nulltest');
      await coll.insertMany([
        { name: 'test1', value: null },
        { name: 'test2', value: 10 },
      ]);

      const result = await coll.aggregate([
        { $group: { _id: null, count: { $sum: 1 } } },
      ]).toArray();

      expect(result[0].count).toBe(2);
    });

    it('should handle literal string expressions', async () => {
      // Use $group with literal string that doesn't start with $
      const result = await collection.aggregate([
        { $group: { _id: '$category', label: { $first: 'literal_string' } } },
      ]).toArray();

      expect(result).toHaveLength(2);
    });

    it('should handle numeric expressions', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', fixed: { $first: 42 } } },
      ]).toArray();

      expect(result).toHaveLength(2);
    });

    it('should handle object expressions with operators', async () => {
      // This covers the case where an expression is an object with $ operator
      const result = await collection.aggregate([
        { $group: { _id: '$category', complex: { $first: { $literal: 'test' } } } },
      ]).toArray();

      expect(result).toHaveLength(2);
    });

    it('should handle empty object expressions', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', empty: { $first: {} } } },
      ]).toArray();

      expect(result).toHaveLength(2);
    });

    it('should handle plain object expressions', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', obj: { $first: { key: 'value' } } } },
      ]).toArray();

      expect(result).toHaveLength(2);
    });

    it('should handle null expressions', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$category', nullVal: { $first: null } } },
      ]).toArray();

      expect(result).toHaveLength(2);
      expect(result[0].nullVal).toBeNull();
    });
  });
});

describe('Additional $pull tests', () => {
  let client: MongoClient;
  let collection: Collection<Document>;

  beforeEach(async () => {
    client = await MongoClient.connect('mongodb://localhost/testdb');
    collection = client.db('testdb').collection('pulltest');
  });

  afterEach(async () => {
    await client.close();
  });

  it('should pull object values without operators', async () => {
    await collection.insertOne({
      name: 'test',
      items: [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ],
    });

    await collection.updateOne(
      { name: 'test' },
      { $pull: { items: { type: 'a', value: 1 } } }
    );

    const doc = await collection.findOne({ name: 'test' });
    expect(doc?.items).toHaveLength(2);
  });
});
