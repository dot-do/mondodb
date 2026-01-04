/**
 * CDC Event Schema Tests (TDD - RED phase)
 *
 * Tests for Change Data Capture event schema creation and validation.
 * These tests define the expected behavior for CDC events that will be
 * emitted to downstream systems like Pipelines/ClickHouse.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectId } from '../../../../src/types/objectid';
import {
  createInsertEvent,
  createUpdateEvent,
  createDeleteEvent,
  serializeToJSON,
  serializeToBSON,
  validateEvent,
  type CDCEvent,
  type InsertEvent,
  type UpdateEvent,
  type DeleteEvent,
} from '../../../../src/olap/cdc/cdc-schema';

// ============================================================================
// CDC Event Schema Tests
// ============================================================================

describe('CDC Event Schema', () => {
  const testDatabase = 'testdb';
  const testCollection = 'users';

  // ==========================================================================
  // Insert Event Tests
  // ==========================================================================

  describe('createInsertEvent', () => {
    it('should create valid insert event with document data', () => {
      const document = {
        _id: new ObjectId(),
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: new Date(),
      };

      const event = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document,
      });

      expect(event).toBeDefined();
      expect(event.operationType).toBe('insert');
      expect(event.fullDocument).toEqual(document);
      expect(event.fullDocument._id).toEqual(document._id);
      expect(event.fullDocument.name).toBe('John Doe');
    });

    it('should include database and collection in namespace', () => {
      const document = { _id: new ObjectId(), value: 42 };

      const event = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document,
      });

      expect(event.ns).toBeDefined();
      expect(event.ns.db).toBe(testDatabase);
      expect(event.ns.coll).toBe(testCollection);
    });

    it('should include timestamp in event', () => {
      const beforeCreate = Date.now();
      const document = { _id: new ObjectId(), value: 1 };

      const event = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document,
      });

      const afterCreate = Date.now();

      expect(event.timestamp).toBeDefined();
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(beforeCreate);
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(afterCreate);
    });

    it('should generate unique event ID', () => {
      const document = { _id: new ObjectId(), value: 1 };

      const event1 = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document,
      });

      const event2 = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document,
      });

      expect(event1.eventId).toBeDefined();
      expect(event2.eventId).toBeDefined();
      expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('should include documentKey with _id', () => {
      const docId = new ObjectId();
      const document = { _id: docId, value: 1 };

      const event = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document,
      });

      expect(event.documentKey).toBeDefined();
      expect(event.documentKey._id).toEqual(docId);
    });
  });

  // ==========================================================================
  // Update Event Tests
  // ==========================================================================

  describe('createUpdateEvent', () => {
    it('should create valid update event with before/after documents', () => {
      const docId = new ObjectId();
      const before = { _id: docId, name: 'John', value: 10 };
      const after = { _id: docId, name: 'John', value: 20 };

      const event = createUpdateEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        before,
        after,
      });

      expect(event).toBeDefined();
      expect(event.operationType).toBe('update');
      expect(event.fullDocumentBeforeChange).toEqual(before);
      expect(event.fullDocument).toEqual(after);
    });

    it('should include updateDescription with changed fields', () => {
      const docId = new ObjectId();
      const before = { _id: docId, name: 'John', value: 10, status: 'active' };
      const after = { _id: docId, name: 'John', value: 20, status: 'active' };

      const event = createUpdateEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        before,
        after,
      });

      expect(event.updateDescription).toBeDefined();
      expect(event.updateDescription.updatedFields).toEqual({ value: 20 });
      expect(event.updateDescription.removedFields).toEqual([]);
    });

    it('should track removed fields in updateDescription', () => {
      const docId = new ObjectId();
      const before = { _id: docId, name: 'John', tempField: 'toRemove' };
      const after = { _id: docId, name: 'John' };

      const event = createUpdateEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        before,
        after,
      });

      expect(event.updateDescription.removedFields).toContain('tempField');
    });

    it('should handle null before document (for updates without pre-image)', () => {
      const docId = new ObjectId();
      const after = { _id: docId, name: 'John', value: 20 };

      const event = createUpdateEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        before: null,
        after,
      });

      expect(event.operationType).toBe('update');
      expect(event.fullDocumentBeforeChange).toBeNull();
      expect(event.fullDocument).toEqual(after);
    });

    it('should include database, collection, and timestamp', () => {
      const docId = new ObjectId();

      const event = createUpdateEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        before: { _id: docId },
        after: { _id: docId, value: 1 },
      });

      expect(event.ns.db).toBe(testDatabase);
      expect(event.ns.coll).toBe(testCollection);
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // Delete Event Tests
  // ==========================================================================

  describe('createDeleteEvent', () => {
    it('should create valid delete event with tombstone', () => {
      const docId = new ObjectId();
      const deletedDocument = { _id: docId, name: 'John', value: 42 };

      const event = createDeleteEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        deletedDocument,
      });

      expect(event).toBeDefined();
      expect(event.operationType).toBe('delete');
      expect(event.documentKey._id).toEqual(docId);
    });

    it('should include fullDocumentBeforeChange for pre-image', () => {
      const docId = new ObjectId();
      const deletedDocument = { _id: docId, name: 'John', value: 42 };

      const event = createDeleteEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        deletedDocument,
      });

      expect(event.fullDocumentBeforeChange).toEqual(deletedDocument);
    });

    it('should work without pre-image (deletedDocument null)', () => {
      const docId = new ObjectId();

      const event = createDeleteEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        deletedDocument: null,
      });

      expect(event.operationType).toBe('delete');
      expect(event.documentKey._id).toEqual(docId);
      expect(event.fullDocumentBeforeChange).toBeNull();
    });

    it('should include database, collection, and timestamp', () => {
      const docId = new ObjectId();

      const event = createDeleteEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        deletedDocument: null,
      });

      expect(event.ns.db).toBe(testDatabase);
      expect(event.ns.coll).toBe(testCollection);
      expect(event.timestamp).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // Common Event Properties
  // ==========================================================================

  describe('common event properties', () => {
    it('should include collection, database, timestamp in all event types', () => {
      const docId = new ObjectId();
      const doc = { _id: docId, value: 1 };

      const insertEvent = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document: doc,
      });

      const updateEvent = createUpdateEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        before: doc,
        after: { ...doc, value: 2 },
      });

      const deleteEvent = createDeleteEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        deletedDocument: doc,
      });

      for (const event of [insertEvent, updateEvent, deleteEvent]) {
        expect(event.ns).toBeDefined();
        expect(event.ns.db).toBe(testDatabase);
        expect(event.ns.coll).toBe(testCollection);
        expect(event.timestamp).toBeInstanceOf(Date);
        expect(event.eventId).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // Serialization Tests
  // ==========================================================================

  describe('serialization', () => {
    it('should serialize to JSON correctly', () => {
      const docId = new ObjectId();
      const document = { _id: docId, name: 'Test', value: 42 };

      const event = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document,
      });

      const json = serializeToJSON(event);

      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json);
      expect(parsed.operationType).toBe('insert');
      expect(parsed.ns.db).toBe(testDatabase);
      expect(parsed.ns.coll).toBe(testCollection);
      expect(parsed.fullDocument.name).toBe('Test');
    });

    it('should serialize ObjectId to string in JSON', () => {
      const docId = new ObjectId();
      const document = { _id: docId, value: 1 };

      const event = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document,
      });

      const json = serializeToJSON(event);
      const parsed = JSON.parse(json);

      expect(typeof parsed.fullDocument._id).toBe('string');
      expect(parsed.fullDocument._id).toBe(docId.toString());
    });

    it('should serialize Date to ISO string in JSON', () => {
      const docId = new ObjectId();
      const now = new Date();
      const document = { _id: docId, createdAt: now };

      const event = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document,
      });

      const json = serializeToJSON(event);
      const parsed = JSON.parse(json);

      expect(typeof parsed.fullDocument.createdAt).toBe('string');
      expect(parsed.timestamp).toBeDefined();
    });

    it('should serialize to BSON correctly', () => {
      const docId = new ObjectId();
      const document = { _id: docId, name: 'Test', value: 42 };

      const event = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document,
      });

      const bson = serializeToBSON(event);

      expect(bson).toBeInstanceOf(Uint8Array);
      expect(bson.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Validation Tests
  // ==========================================================================

  describe('validateEvent', () => {
    it('should validate required fields for insert event', () => {
      const docId = new ObjectId();
      const validEvent = createInsertEvent({
        database: testDatabase,
        collection: testCollection,
        document: { _id: docId, value: 1 },
      });

      expect(validateEvent(validEvent)).toBe(true);
    });

    it('should validate required fields for update event', () => {
      const docId = new ObjectId();
      const validEvent = createUpdateEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        before: { _id: docId },
        after: { _id: docId, value: 1 },
      });

      expect(validateEvent(validEvent)).toBe(true);
    });

    it('should validate required fields for delete event', () => {
      const docId = new ObjectId();
      const validEvent = createDeleteEvent({
        database: testDatabase,
        collection: testCollection,
        documentKey: { _id: docId },
        deletedDocument: null,
      });

      expect(validateEvent(validEvent)).toBe(true);
    });

    it('should reject event without namespace', () => {
      const invalidEvent = {
        operationType: 'insert',
        fullDocument: { _id: new ObjectId() },
        // Missing ns
      } as unknown as CDCEvent;

      expect(validateEvent(invalidEvent)).toBe(false);
    });

    it('should reject event without operationType', () => {
      const invalidEvent = {
        ns: { db: testDatabase, coll: testCollection },
        fullDocument: { _id: new ObjectId() },
        // Missing operationType
      } as unknown as CDCEvent;

      expect(validateEvent(invalidEvent)).toBe(false);
    });

    it('should reject event without documentKey', () => {
      const invalidEvent = {
        operationType: 'insert',
        ns: { db: testDatabase, coll: testCollection },
        fullDocument: { _id: new ObjectId() },
        // Missing documentKey
      } as unknown as CDCEvent;

      expect(validateEvent(invalidEvent)).toBe(false);
    });

    it('should reject event with invalid operationType', () => {
      const invalidEvent = {
        operationType: 'invalid',
        ns: { db: testDatabase, coll: testCollection },
        documentKey: { _id: new ObjectId() },
      } as unknown as CDCEvent;

      expect(validateEvent(invalidEvent)).toBe(false);
    });
  });
});
