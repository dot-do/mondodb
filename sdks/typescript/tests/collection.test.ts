/**
 * Tests for Collection class - CRUD operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient } from '../src/client.js';
import { Collection } from '../src/collection.js';
import type { Document } from '../src/types.js';

interface User extends Document {
  name: string;
  age: number;
  email?: string;
  status?: string;
  tags?: string[];
  nested?: { field: string };
}

describe('Collection', () => {
  let client: MongoClient;
  let collection: Collection<User>;

  beforeEach(async () => {
    client = await MongoClient.connect('mongodb://localhost/testdb');
    const db = client.db('testdb');
    collection = db.collection<User>('users');
  });

  afterEach(async () => {
    await client.close();
  });

  describe('properties', () => {
    it('should have correct collection name', () => {
      expect(collection.collectionName).toBe('users');
    });

    it('should have correct database name', () => {
      expect(collection.dbName).toBe('testdb');
    });

    it('should have correct namespace', () => {
      expect(collection.namespace).toBe('testdb.users');
    });
  });

  describe('insertOne', () => {
    it('should insert a document', async () => {
      const result = await collection.insertOne({ name: 'John', age: 30 });
      expect(result.acknowledged).toBe(true);
      expect(result.insertedId).toBeDefined();
    });

    it('should use provided _id', async () => {
      const result = await collection.insertOne({ _id: 'custom-id', name: 'Jane', age: 25 } as User);
      expect(result.insertedId).toBe('custom-id');
    });
  });

  describe('insertMany', () => {
    it('should insert multiple documents', async () => {
      const result = await collection.insertMany([
        { name: 'Alice', age: 28 },
        { name: 'Bob', age: 35 },
      ]);
      expect(result.acknowledged).toBe(true);
      expect(result.insertedCount).toBe(2);
      expect(Object.keys(result.insertedIds)).toHaveLength(2);
    });

    it('should handle empty array', async () => {
      const result = await collection.insertMany([]);
      expect(result.insertedCount).toBe(0);
    });
  });

  describe('findOne', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);
    });

    it('should find a document', async () => {
      const doc = await collection.findOne({ name: 'John' });
      expect(doc).not.toBeNull();
      expect(doc?.name).toBe('John');
    });

    it('should return null if not found', async () => {
      const doc = await collection.findOne({ name: 'Nobody' });
      expect(doc).toBeNull();
    });

    it('should find with empty filter', async () => {
      const doc = await collection.findOne({});
      expect(doc).not.toBeNull();
    });
  });

  describe('find', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'Alice', age: 28, status: 'active' },
        { name: 'Bob', age: 35, status: 'active' },
        { name: 'Charlie', age: 42, status: 'inactive' },
      ]);
    });

    it('should return a cursor', () => {
      const cursor = collection.find({});
      expect(cursor).toBeDefined();
    });

    it('should find all documents', async () => {
      const docs = await collection.find({}).toArray();
      expect(docs).toHaveLength(3);
    });

    it('should filter documents', async () => {
      const docs = await collection.find({ status: 'active' }).toArray();
      expect(docs).toHaveLength(2);
    });

    it('should support limit', async () => {
      const docs = await collection.find({}).limit(2).toArray();
      expect(docs).toHaveLength(2);
    });

    it('should support skip', async () => {
      const docs = await collection.find({}).skip(1).toArray();
      expect(docs).toHaveLength(2);
    });

    it('should support sort', async () => {
      const docs = await collection.find({}).sort({ age: -1 }).toArray();
      expect(docs[0].name).toBe('Charlie');
      expect(docs[2].name).toBe('Alice');
    });

    it('should support projection', async () => {
      const docs = await collection.find({}).project({ name: 1 }).toArray();
      expect(docs[0]).toHaveProperty('name');
      expect(docs[0]).toHaveProperty('_id');
      expect(docs[0]).not.toHaveProperty('age');
    });

    it('should support options in find', async () => {
      const docs = await collection.find({}, {
        sort: { age: 1 },
        limit: 1,
        skip: 1,
      }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].name).toBe('Bob');
    });

    it('should support all cursor options in find', async () => {
      const docs = await collection.find({}, {
        projection: { name: 1 },
        batchSize: 10,
        maxTimeMS: 5000,
        hint: '_id_',
        comment: 'test query',
      }).toArray();
      expect(docs).toHaveLength(3);
      expect(docs[0]).toHaveProperty('name');
      expect(docs[0]).not.toHaveProperty('age');
    });
  });

  describe('updateOne', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);
    });

    it('should update a document', async () => {
      const result = await collection.updateOne(
        { name: 'John' },
        { $set: { age: 31 } }
      );
      expect(result.matchedCount).toBe(1);
      expect(result.modifiedCount).toBe(1);
    });

    it('should not update if not found', async () => {
      const result = await collection.updateOne(
        { name: 'Nobody' },
        { $set: { age: 100 } }
      );
      expect(result.matchedCount).toBe(0);
      expect(result.modifiedCount).toBe(0);
    });

    it('should support upsert', async () => {
      const result = await collection.updateOne(
        { name: 'NewUser' },
        { $set: { age: 20 } },
        { upsert: true }
      );
      expect(result.upsertedId).toBeDefined();
      expect(result.upsertedCount).toBe(1);
    });
  });

  describe('updateMany', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'User1', age: 30, status: 'active' },
        { name: 'User2', age: 25, status: 'active' },
        { name: 'User3', age: 35, status: 'inactive' },
      ]);
    });

    it('should update multiple documents', async () => {
      const result = await collection.updateMany(
        { status: 'active' },
        { $set: { status: 'updated' } }
      );
      expect(result.matchedCount).toBe(2);
      expect(result.modifiedCount).toBe(2);
    });

    it('should update all with empty filter', async () => {
      const result = await collection.updateMany({}, { $inc: { age: 1 } });
      expect(result.matchedCount).toBe(3);
    });

    it('should support upsert when no documents match', async () => {
      const result = await collection.updateMany(
        { name: 'NonExistent' },
        { $set: { name: 'NonExistent', age: 50 } },
        { upsert: true }
      );
      expect(result.matchedCount).toBe(0);
      expect(result.upsertedId).toBeDefined();

      const doc = await collection.findOne({ name: 'NonExistent' });
      expect(doc?.age).toBe(50);
    });
  });

  describe('replaceOne', () => {
    beforeEach(async () => {
      await collection.insertOne({ name: 'John', age: 30 });
    });

    it('should replace a document', async () => {
      const result = await collection.replaceOne(
        { name: 'John' },
        { name: 'John Doe', age: 31 }
      );
      expect(result.matchedCount).toBe(1);
      expect(result.modifiedCount).toBe(1);

      const doc = await collection.findOne({ name: 'John Doe' });
      expect(doc?.age).toBe(31);
    });

    it('should support upsert', async () => {
      const result = await collection.replaceOne(
        { name: 'NewUser' },
        { name: 'NewUser', age: 20 },
        { upsert: true }
      );
      expect(result.upsertedId).toBeDefined();
    });

    it('should return zero matches when document not found without upsert', async () => {
      const result = await collection.replaceOne(
        { name: 'NonExistent' },
        { name: 'NewName', age: 99 }
      );
      expect(result.matchedCount).toBe(0);
      expect(result.modifiedCount).toBe(0);
      expect(result.upsertedId).toBeUndefined();
    });
  });

  describe('deleteOne', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ]);
    });

    it('should delete a document', async () => {
      const result = await collection.deleteOne({ name: 'John' });
      expect(result.deletedCount).toBe(1);

      const doc = await collection.findOne({ name: 'John' });
      expect(doc).toBeNull();
    });

    it('should return 0 if not found', async () => {
      const result = await collection.deleteOne({ name: 'Nobody' });
      expect(result.deletedCount).toBe(0);
    });
  });

  describe('deleteMany', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'User1', status: 'active', age: 30 },
        { name: 'User2', status: 'active', age: 25 },
        { name: 'User3', status: 'inactive', age: 35 },
      ]);
    });

    it('should delete multiple documents', async () => {
      const result = await collection.deleteMany({ status: 'active' });
      expect(result.deletedCount).toBe(2);
    });

    it('should delete all with empty filter', async () => {
      const result = await collection.deleteMany({});
      expect(result.deletedCount).toBe(3);
    });
  });

  describe('findOneAndUpdate', () => {
    beforeEach(async () => {
      await collection.insertOne({ name: 'John', age: 30 });
    });

    it('should return the original document', async () => {
      const doc = await collection.findOneAndUpdate(
        { name: 'John' },
        { $set: { age: 31 } }
      );
      expect(doc?.age).toBe(30);
    });

    it('should return the updated document with returnDocument: after', async () => {
      const doc = await collection.findOneAndUpdate(
        { name: 'John' },
        { $set: { age: 31 } },
        { returnDocument: 'after' }
      );
      expect(doc?.age).toBe(31);
    });

    it('should return null if not found', async () => {
      const doc = await collection.findOneAndUpdate(
        { name: 'Nobody' },
        { $set: { age: 100 } }
      );
      expect(doc).toBeNull();
    });

    it('should support upsert', async () => {
      const doc = await collection.findOneAndUpdate(
        { name: 'NewUser' },
        { $set: { age: 20 } },
        { upsert: true, returnDocument: 'after' }
      );
      expect(doc).not.toBeNull();
      expect(doc?.name).toBe('NewUser');
    });
  });

  describe('findOneAndDelete', () => {
    beforeEach(async () => {
      await collection.insertOne({ name: 'John', age: 30 });
    });

    it('should return the deleted document', async () => {
      const doc = await collection.findOneAndDelete({ name: 'John' });
      expect(doc?.name).toBe('John');

      const found = await collection.findOne({ name: 'John' });
      expect(found).toBeNull();
    });

    it('should return null if not found', async () => {
      const doc = await collection.findOneAndDelete({ name: 'Nobody' });
      expect(doc).toBeNull();
    });
  });

  describe('findOneAndReplace', () => {
    beforeEach(async () => {
      await collection.insertOne({ name: 'John', age: 30 });
    });

    it('should return the original document', async () => {
      const doc = await collection.findOneAndReplace(
        { name: 'John' },
        { name: 'John Doe', age: 31 }
      );
      expect(doc?.name).toBe('John');
    });

    it('should return the new document with returnDocument: after', async () => {
      const doc = await collection.findOneAndReplace(
        { name: 'John' },
        { name: 'John Doe', age: 31 },
        { returnDocument: 'after' }
      );
      expect(doc?.name).toBe('John Doe');
    });

    it('should support upsert', async () => {
      const doc = await collection.findOneAndReplace(
        { name: 'NewUser' },
        { name: 'NewUser', age: 20 },
        { upsert: true, returnDocument: 'after' }
      );
      expect(doc).not.toBeNull();
    });

    it('should return null when document not found without upsert', async () => {
      const doc = await collection.findOneAndReplace(
        { name: 'NonExistent' },
        { name: 'NewName', age: 99 }
      );
      expect(doc).toBeNull();
    });
  });

  describe('countDocuments', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'User1', status: 'active', age: 30 },
        { name: 'User2', status: 'active', age: 25 },
        { name: 'User3', status: 'inactive', age: 35 },
      ]);
    });

    it('should count all documents', async () => {
      const count = await collection.countDocuments();
      expect(count).toBe(3);
    });

    it('should count filtered documents', async () => {
      const count = await collection.countDocuments({ status: 'active' });
      expect(count).toBe(2);
    });

    it('should support skip option', async () => {
      const count = await collection.countDocuments({}, { skip: 1 });
      expect(count).toBe(2);
    });

    it('should support limit option', async () => {
      const count = await collection.countDocuments({}, { limit: 2 });
      expect(count).toBe(2);
    });
  });

  describe('estimatedDocumentCount', () => {
    it('should return estimated count', async () => {
      await collection.insertMany([
        { name: 'User1', age: 30 },
        { name: 'User2', age: 25 },
      ]);
      const count = await collection.estimatedDocumentCount();
      expect(count).toBe(2);
    });
  });

  describe('distinct', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'User1', status: 'active', age: 30 },
        { name: 'User2', status: 'active', age: 25 },
        { name: 'User3', status: 'inactive', age: 30 },
      ]);
    });

    it('should return distinct values', async () => {
      const statuses = await collection.distinct('status');
      expect(statuses).toContain('active');
      expect(statuses).toContain('inactive');
      expect(statuses).toHaveLength(2);
    });

    it('should support filter', async () => {
      const ages = await collection.distinct('age', { status: 'active' });
      expect(ages).toContain(30);
      expect(ages).toContain(25);
    });
  });

  describe('aggregate', () => {
    beforeEach(async () => {
      await collection.insertMany([
        { name: 'User1', status: 'active', age: 30 },
        { name: 'User2', status: 'active', age: 25 },
        { name: 'User3', status: 'inactive', age: 35 },
      ]);
    });

    it('should return an aggregation cursor', () => {
      const cursor = collection.aggregate([]);
      expect(cursor).toBeDefined();
    });

    it('should execute pipeline with $match', async () => {
      const result = await collection.aggregate([
        { $match: { status: 'active' } },
      ]).toArray();
      expect(result).toHaveLength(2);
    });

    it('should execute pipeline with $group', async () => {
      const result = await collection.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).toArray();
      expect(result).toHaveLength(2);
    });

    it('should execute pipeline with $sort and $limit', async () => {
      const result = await collection.aggregate([
        { $sort: { age: -1 } },
        { $limit: 1 },
      ]).toArray();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('User3');
    });

    it('should execute pipeline with $count', async () => {
      const result = await collection.aggregate([
        { $count: 'total' },
      ]).toArray();
      expect(result[0].total).toBe(3);
    });

    it('should execute pipeline with $project', async () => {
      const result = await collection.aggregate([
        { $project: { name: 1 } },
      ]).toArray();
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).not.toHaveProperty('age');
    });
  });

  describe('index operations', () => {
    it('should create an index', async () => {
      const result = await collection.createIndex({ name: 1 });
      expect(result).toBeDefined();
    });

    it('should create index with options', async () => {
      const result = await collection.createIndex(
        { email: 1 },
        { unique: true }
      );
      expect(result).toBeDefined();
    });

    it('should create multiple indexes', async () => {
      const result = await collection.createIndexes([
        { key: { name: 1 } },
        { key: { age: -1 } },
      ]);
      expect(result).toHaveLength(2);
    });

    it('should list indexes', async () => {
      const indexes = await collection.listIndexes();
      expect(Array.isArray(indexes)).toBe(true);
    });

    it('should drop an index', async () => {
      await collection.createIndex({ name: 1 });
      await collection.dropIndex('name_1');
      // Should not throw
    });

    it('should drop all indexes', async () => {
      await collection.createIndex({ name: 1 });
      await collection.dropIndexes();
      // Should not throw
    });
  });

  describe('collection operations', () => {
    it('should drop the collection', async () => {
      await collection.insertOne({ name: 'Test', age: 30 });
      const result = await collection.drop();
      expect(result).toBe(true);
    });

    it('should rename the collection', async () => {
      await collection.insertOne({ name: 'Test', age: 30 });
      await collection.rename('users_renamed');
      expect(collection.collectionName).toBe('users_renamed');
    });
  });

  describe('bulkWrite', () => {
    it('should perform bulk operations', async () => {
      const result = await collection.bulkWrite([
        { insertOne: { document: { name: 'User1', age: 30 } } },
        { insertOne: { document: { name: 'User2', age: 25 } } },
        { updateOne: { filter: { name: 'User1' }, update: { $set: { age: 31 } } } },
        { deleteOne: { filter: { name: 'User2' } } },
      ]);

      expect(result.insertedCount).toBe(2);
      expect(result.matchedCount).toBe(1);
      expect(result.modifiedCount).toBe(1);
      expect(result.deletedCount).toBe(1);
    });

    it('should handle empty operations', async () => {
      const result = await collection.bulkWrite([]);
      expect(result.insertedCount).toBe(0);
    });

    it('should support updateMany in bulk', async () => {
      await collection.insertMany([
        { name: 'User1', status: 'active', age: 30 },
        { name: 'User2', status: 'active', age: 25 },
      ]);

      const result = await collection.bulkWrite([
        { updateMany: { filter: { status: 'active' }, update: { $set: { status: 'processed' } } } },
      ]);

      expect(result.matchedCount).toBe(2);
      expect(result.modifiedCount).toBe(2);
    });

    it('should support deleteMany in bulk', async () => {
      await collection.insertMany([
        { name: 'User1', status: 'active', age: 30 },
        { name: 'User2', status: 'active', age: 25 },
      ]);

      const result = await collection.bulkWrite([
        { deleteMany: { filter: { status: 'active' } } },
      ]);

      expect(result.deletedCount).toBe(2);
    });

    it('should support replaceOne in bulk', async () => {
      await collection.insertOne({ name: 'User1', age: 30 });

      const result = await collection.bulkWrite([
        { replaceOne: { filter: { name: 'User1' }, replacement: { name: 'User1Updated', age: 31 } } },
      ]);

      expect(result.matchedCount).toBe(1);
      expect(result.modifiedCount).toBe(1);
    });

    it('should support updateOne with upsert in bulk', async () => {
      const result = await collection.bulkWrite([
        { updateOne: { filter: { name: 'NewUser' }, update: { $set: { name: 'NewUser', age: 25 } }, upsert: true } },
      ]);

      expect(result.matchedCount).toBe(0);
      expect(result.upsertedCount).toBe(1);
      expect(Object.keys(result.upsertedIds)).toHaveLength(1);
      expect(result.upsertedIds[0]).toBeDefined();

      const doc = await collection.findOne({ name: 'NewUser' });
      expect(doc?.age).toBe(25);
    });

    it('should support replaceOne with upsert in bulk', async () => {
      const result = await collection.bulkWrite([
        { replaceOne: { filter: { name: 'NewUser' }, replacement: { name: 'NewUser', age: 30 }, upsert: true } },
      ]);

      expect(result.matchedCount).toBe(0);
      expect(result.upsertedCount).toBe(1);
      expect(Object.keys(result.upsertedIds)).toHaveLength(1);
      expect(result.upsertedIds[0]).toBeDefined();

      const doc = await collection.findOne({ name: 'NewUser' });
      expect(doc?.age).toBe(30);
    });
  });
});
