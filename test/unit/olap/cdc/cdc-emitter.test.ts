/**
 * CDC Emitter Tests (TDD - RED phase)
 *
 * Tests for the CDC Emitter responsible for emitting change events
 * to downstream systems like Cloudflare Pipelines.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ObjectId } from '../../../../src/types/objectid';
import { CDCEmitter, type CDCEmitterConfig } from '../../../../src/olap/cdc/cdc-emitter';
import type { CDCEvent } from '../../../../src/olap/cdc/cdc-schema';

// ============================================================================
// Mock Pipeline Binding
// ============================================================================

interface MockPipeline {
  send: ReturnType<typeof vi.fn>;
  sendBatch: ReturnType<typeof vi.fn>;
}

function createMockPipeline(): MockPipeline {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    sendBatch: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// CDC Emitter Tests
// ============================================================================

describe('CDCEmitter', () => {
  let mockPipeline: MockPipeline;
  let emitter: CDCEmitter;

  const testDatabase = 'testdb';
  const testCollection = 'users';

  beforeEach(() => {
    mockPipeline = createMockPipeline();
    emitter = new CDCEmitter({
      pipeline: mockPipeline as unknown as Pipeline,
      database: testDatabase,
      collection: testCollection,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Insert Event Emission
  // ==========================================================================

  describe('emitInsert', () => {
    it('should emit event on document insert', async () => {
      const document = {
        _id: new ObjectId(),
        name: 'John Doe',
        email: 'john@example.com',
      };

      await emitter.emitInsert(document);

      expect(mockPipeline.send).toHaveBeenCalledTimes(1);
      expect(mockPipeline.send).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'insert',
          fullDocument: expect.objectContaining({
            name: 'John Doe',
            email: 'john@example.com',
          }),
          ns: { db: testDatabase, coll: testCollection },
        })
      );
    });

    it('should include document _id in event', async () => {
      const docId = new ObjectId();
      const document = { _id: docId, value: 42 };

      await emitter.emitInsert(document);

      expect(mockPipeline.send).toHaveBeenCalledWith(
        expect.objectContaining({
          documentKey: { _id: docId },
        })
      );
    });

    it('should include timestamp in emitted event', async () => {
      const document = { _id: new ObjectId(), value: 1 };

      await emitter.emitInsert(document);

      expect(mockPipeline.send).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
        })
      );
    });
  });

  // ==========================================================================
  // Update Event Emission
  // ==========================================================================

  describe('emitUpdate', () => {
    it('should emit event on document update', async () => {
      const docId = new ObjectId();
      const before = { _id: docId, name: 'John', value: 10 };
      const after = { _id: docId, name: 'John', value: 20 };

      await emitter.emitUpdate(before, after);

      expect(mockPipeline.send).toHaveBeenCalledTimes(1);
      expect(mockPipeline.send).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'update',
          fullDocumentBeforeChange: before,
          fullDocument: after,
          ns: { db: testDatabase, coll: testCollection },
        })
      );
    });

    it('should include updateDescription with changed fields', async () => {
      const docId = new ObjectId();
      const before = { _id: docId, name: 'John', value: 10 };
      const after = { _id: docId, name: 'John', value: 20, newField: 'added' };

      await emitter.emitUpdate(before, after);

      expect(mockPipeline.send).toHaveBeenCalledWith(
        expect.objectContaining({
          updateDescription: expect.objectContaining({
            updatedFields: expect.any(Object),
          }),
        })
      );
    });

    it('should handle null before document', async () => {
      const docId = new ObjectId();
      const after = { _id: docId, name: 'John', value: 20 };

      await emitter.emitUpdate(null, after);

      expect(mockPipeline.send).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'update',
          fullDocumentBeforeChange: null,
          fullDocument: after,
        })
      );
    });
  });

  // ==========================================================================
  // Delete Event Emission
  // ==========================================================================

  describe('emitDelete', () => {
    it('should emit event on document delete', async () => {
      const docId = new ObjectId();
      const deletedDocument = { _id: docId, name: 'John', value: 42 };

      await emitter.emitDelete(deletedDocument);

      expect(mockPipeline.send).toHaveBeenCalledTimes(1);
      expect(mockPipeline.send).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'delete',
          documentKey: { _id: docId },
          fullDocumentBeforeChange: deletedDocument,
          ns: { db: testDatabase, coll: testCollection },
        })
      );
    });

    it('should work with minimal document (just _id)', async () => {
      const docId = new ObjectId();
      const deletedDocument = { _id: docId };

      await emitter.emitDelete(deletedDocument);

      expect(mockPipeline.send).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'delete',
          documentKey: { _id: docId },
        })
      );
    });
  });

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  describe('emitBulk', () => {
    it('should emit events for bulk operations', async () => {
      const events: CDCEvent[] = [
        {
          eventId: '1',
          operationType: 'insert',
          ns: { db: testDatabase, coll: testCollection },
          documentKey: { _id: new ObjectId() },
          fullDocument: { _id: new ObjectId(), value: 1 },
          timestamp: new Date(),
        } as CDCEvent,
        {
          eventId: '2',
          operationType: 'insert',
          ns: { db: testDatabase, coll: testCollection },
          documentKey: { _id: new ObjectId() },
          fullDocument: { _id: new ObjectId(), value: 2 },
          timestamp: new Date(),
        } as CDCEvent,
        {
          eventId: '3',
          operationType: 'delete',
          ns: { db: testDatabase, coll: testCollection },
          documentKey: { _id: new ObjectId() },
          timestamp: new Date(),
        } as CDCEvent,
      ];

      await emitter.emitBulk(events);

      expect(mockPipeline.sendBatch).toHaveBeenCalledTimes(1);
      expect(mockPipeline.sendBatch).toHaveBeenCalledWith(events);
    });

    it('should handle empty events array', async () => {
      await emitter.emitBulk([]);

      expect(mockPipeline.sendBatch).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Pipeline Unavailable Handling
  // ==========================================================================

  describe('Pipeline binding unavailable', () => {
    it('should handle Pipeline binding unavailable gracefully', async () => {
      const emitterWithoutPipeline = new CDCEmitter({
        pipeline: undefined,
        database: testDatabase,
        collection: testCollection,
      });

      const document = { _id: new ObjectId(), value: 1 };

      // Should not throw
      await expect(
        emitterWithoutPipeline.emitInsert(document)
      ).resolves.not.toThrow();
    });

    it('should return isAvailable false when Pipeline not configured', () => {
      const emitterWithoutPipeline = new CDCEmitter({
        pipeline: undefined,
        database: testDatabase,
        collection: testCollection,
      });

      expect(emitterWithoutPipeline.isAvailable()).toBe(false);
    });

    it('should return isAvailable true when Pipeline is configured', () => {
      expect(emitter.isAvailable()).toBe(true);
    });

    it('should log warning when emitting without Pipeline', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const emitterWithoutPipeline = new CDCEmitter({
        pipeline: undefined,
        database: testDatabase,
        collection: testCollection,
      });

      await emitterWithoutPipeline.emitInsert({ _id: new ObjectId(), value: 1 });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Pipeline')
      );

      consoleSpy.mockRestore();
    });
  });

  // ==========================================================================
  // Batching for Efficiency
  // ==========================================================================

  describe('batching', () => {
    it('should batch events for efficiency', async () => {
      const batchingEmitter = new CDCEmitter({
        pipeline: mockPipeline as unknown as Pipeline,
        database: testDatabase,
        collection: testCollection,
        batchSize: 10,
        batchTimeoutMs: 100,
      });

      // Emit multiple events quickly
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          batchingEmitter.emitInsert({ _id: new ObjectId(), value: i })
        );
      }

      await Promise.all(promises);
      await batchingEmitter.flush();

      // Should have batched into fewer calls
      expect(mockPipeline.sendBatch).toHaveBeenCalled();
    });

    it('should respect max batch size', async () => {
      const maxBatchSize = 3;
      const batchingEmitter = new CDCEmitter({
        pipeline: mockPipeline as unknown as Pipeline,
        database: testDatabase,
        collection: testCollection,
        batchSize: maxBatchSize,
      });

      // Emit more events than batch size
      for (let i = 0; i < 10; i++) {
        await batchingEmitter.emitInsert({ _id: new ObjectId(), value: i });
      }

      await batchingEmitter.flush();

      // Verify no batch exceeded max size
      for (const call of mockPipeline.sendBatch.mock.calls) {
        expect(call[0].length).toBeLessThanOrEqual(maxBatchSize);
      }
    });

    it('should flush on timeout', async () => {
      const batchTimeoutMs = 50;
      const batchingEmitter = new CDCEmitter({
        pipeline: mockPipeline as unknown as Pipeline,
        database: testDatabase,
        collection: testCollection,
        batchSize: 100, // Large batch size
        batchTimeoutMs,
      });

      // Emit a single event
      await batchingEmitter.emitInsert({ _id: new ObjectId(), value: 1 });

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, batchTimeoutMs + 20));

      // Should have flushed due to timeout even though batch not full
      expect(mockPipeline.sendBatch).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Flush Method
  // ==========================================================================

  describe('flush', () => {
    it('should flush pending events immediately', async () => {
      const batchingEmitter = new CDCEmitter({
        pipeline: mockPipeline as unknown as Pipeline,
        database: testDatabase,
        collection: testCollection,
        batchSize: 100, // Large batch to prevent auto-flush
      });

      await batchingEmitter.emitInsert({ _id: new ObjectId(), value: 1 });
      await batchingEmitter.emitInsert({ _id: new ObjectId(), value: 2 });

      // Events should be buffered
      expect(mockPipeline.sendBatch).not.toHaveBeenCalled();

      // Flush should send all buffered events
      await batchingEmitter.flush();

      expect(mockPipeline.sendBatch).toHaveBeenCalledTimes(1);
      expect(mockPipeline.sendBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ operationType: 'insert' }),
          expect.objectContaining({ operationType: 'insert' }),
        ])
      );
    });

    it('should be safe to call flush with no pending events', async () => {
      await expect(emitter.flush()).resolves.not.toThrow();
      expect(mockPipeline.sendBatch).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('should handle Pipeline send errors gracefully', async () => {
      mockPipeline.send.mockRejectedValueOnce(new Error('Pipeline error'));

      const document = { _id: new ObjectId(), value: 1 };

      // Should not throw, but handle gracefully
      await expect(emitter.emitInsert(document)).resolves.not.toThrow();
    });

    it('should retry on transient errors', async () => {
      mockPipeline.send
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce(undefined);

      const retryEmitter = new CDCEmitter({
        pipeline: mockPipeline as unknown as Pipeline,
        database: testDatabase,
        collection: testCollection,
        retryAttempts: 3,
      });

      await retryEmitter.emitInsert({ _id: new ObjectId(), value: 1 });

      expect(mockPipeline.send).toHaveBeenCalledTimes(2);
    });
  });
});

// Type declaration for Pipeline binding
declare interface Pipeline {
  send(data: unknown): Promise<void>;
  sendBatch(data: unknown[]): Promise<void>;
}
