/**
 * CDC Buffer Tests (TDD - RED phase)
 *
 * Tests for the CDC Buffer responsible for accumulating and batching
 * CDC events for efficient processing.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ObjectId } from '../../../../src/types/objectid';
import { CDCBuffer, type CDCBufferConfig } from '../../../../src/olap/cdc/cdc-buffer';
import type { CDCEvent, InsertEvent, UpdateEvent, DeleteEvent } from '../../../../src/olap/cdc/cdc-schema';

// ============================================================================
// Helper Functions
// ============================================================================

function createMockInsertEvent(value: number): InsertEvent {
  const docId = new ObjectId();
  return {
    eventId: `event-${value}`,
    operationType: 'insert',
    ns: { db: 'testdb', coll: 'testcoll' },
    documentKey: { _id: docId },
    fullDocument: { _id: docId, value },
    timestamp: new Date(),
  } as InsertEvent;
}

function createMockUpdateEvent(value: number): UpdateEvent {
  const docId = new ObjectId();
  return {
    eventId: `event-update-${value}`,
    operationType: 'update',
    ns: { db: 'testdb', coll: 'testcoll' },
    documentKey: { _id: docId },
    fullDocumentBeforeChange: { _id: docId, value: value - 1 },
    fullDocument: { _id: docId, value },
    updateDescription: { updatedFields: { value }, removedFields: [] },
    timestamp: new Date(),
  } as UpdateEvent;
}

function createMockDeleteEvent(value: number): DeleteEvent {
  const docId = new ObjectId();
  return {
    eventId: `event-delete-${value}`,
    operationType: 'delete',
    ns: { db: 'testdb', coll: 'testcoll' },
    documentKey: { _id: docId },
    fullDocumentBeforeChange: { _id: docId, value },
    timestamp: new Date(),
  } as DeleteEvent;
}

// ============================================================================
// CDC Buffer Tests
// ============================================================================

describe('CDCBuffer', () => {
  let buffer: CDCBuffer;

  beforeEach(() => {
    buffer = new CDCBuffer({
      maxBatchSize: 10,
      flushTimeoutMs: 1000,
    });
  });

  afterEach(() => {
    buffer.stopAutoFlush();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // ==========================================================================
  // Basic Buffer Operations
  // ==========================================================================

  describe('basic operations', () => {
    it('should accumulate events until threshold', () => {
      const event1 = createMockInsertEvent(1);
      const event2 = createMockInsertEvent(2);
      const event3 = createMockInsertEvent(3);

      buffer.add(event1);
      buffer.add(event2);
      buffer.add(event3);

      expect(buffer.size()).toBe(3);
      expect(buffer.isEmpty()).toBe(false);
    });

    it('should start empty', () => {
      const emptyBuffer = new CDCBuffer();

      expect(emptyBuffer.size()).toBe(0);
      expect(emptyBuffer.isEmpty()).toBe(true);
    });

    it('should accept different event types', () => {
      buffer.add(createMockInsertEvent(1));
      buffer.add(createMockUpdateEvent(2));
      buffer.add(createMockDeleteEvent(3));

      expect(buffer.size()).toBe(3);
    });
  });

  // ==========================================================================
  // Flush When Batch Size Reached
  // ==========================================================================

  describe('flush when batch size reached', () => {
    it('should flush when batch size reached', () => {
      const smallBuffer = new CDCBuffer({ maxBatchSize: 3 });
      const flushCallback = vi.fn();

      smallBuffer.startAutoFlush(flushCallback);

      // Add events up to batch size
      smallBuffer.add(createMockInsertEvent(1));
      smallBuffer.add(createMockInsertEvent(2));
      smallBuffer.add(createMockInsertEvent(3));

      // Should have triggered flush
      expect(flushCallback).toHaveBeenCalledTimes(1);
      expect(flushCallback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ operationType: 'insert' }),
          expect.objectContaining({ operationType: 'insert' }),
          expect.objectContaining({ operationType: 'insert' }),
        ])
      );
      expect(smallBuffer.size()).toBe(0);
    });

    it('should return flushed events', () => {
      const event1 = createMockInsertEvent(1);
      const event2 = createMockInsertEvent(2);

      buffer.add(event1);
      buffer.add(event2);

      const flushed = buffer.flush();

      expect(flushed).toHaveLength(2);
      expect(flushed[0]).toBe(event1);
      expect(flushed[1]).toBe(event2);
    });

    it('should clear buffer after flush', () => {
      buffer.add(createMockInsertEvent(1));
      buffer.add(createMockInsertEvent(2));

      buffer.flush();

      expect(buffer.size()).toBe(0);
      expect(buffer.isEmpty()).toBe(true);
    });

    it('should return empty array when flushing empty buffer', () => {
      const flushed = buffer.flush();

      expect(flushed).toEqual([]);
    });
  });

  // ==========================================================================
  // Flush When Time Threshold Reached
  // ==========================================================================

  describe('flush when time threshold reached', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should flush when time threshold reached', async () => {
      const flushTimeoutMs = 100;
      const timedBuffer = new CDCBuffer({
        maxBatchSize: 100, // High batch size to prevent size-based flush
        flushTimeoutMs,
      });

      const flushCallback = vi.fn().mockResolvedValue(undefined);
      timedBuffer.startAutoFlush(flushCallback);

      // Add a single event (won't trigger size-based flush)
      timedBuffer.add(createMockInsertEvent(1));

      expect(flushCallback).not.toHaveBeenCalled();

      // Advance time past threshold
      vi.advanceTimersByTime(flushTimeoutMs + 10);

      // Should have triggered time-based flush
      expect(flushCallback).toHaveBeenCalledTimes(1);
      expect(flushCallback).toHaveBeenCalledWith([
        expect.objectContaining({ operationType: 'insert' }),
      ]);
    });

    it('should reset timer after flush', async () => {
      const flushTimeoutMs = 100;
      const timedBuffer = new CDCBuffer({
        maxBatchSize: 100,
        flushTimeoutMs,
      });

      const flushCallback = vi.fn().mockResolvedValue(undefined);
      timedBuffer.startAutoFlush(flushCallback);

      // Add event and wait for flush
      timedBuffer.add(createMockInsertEvent(1));
      vi.advanceTimersByTime(flushTimeoutMs + 10);

      expect(flushCallback).toHaveBeenCalledTimes(1);

      // Add another event
      timedBuffer.add(createMockInsertEvent(2));
      vi.advanceTimersByTime(flushTimeoutMs + 10);

      expect(flushCallback).toHaveBeenCalledTimes(2);
    });

    it('should not flush if no events pending', async () => {
      const flushTimeoutMs = 100;
      const timedBuffer = new CDCBuffer({
        maxBatchSize: 100,
        flushTimeoutMs,
      });

      const flushCallback = vi.fn().mockResolvedValue(undefined);
      timedBuffer.startAutoFlush(flushCallback);

      // Don't add any events, just advance time
      vi.advanceTimersByTime(flushTimeoutMs + 10);

      // Should not have called flush with empty buffer
      expect(flushCallback).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Concurrent Writes
  // ==========================================================================

  describe('handle concurrent writes', () => {
    it('should handle concurrent writes', async () => {
      const concurrentBuffer = new CDCBuffer({ maxBatchSize: 100 });

      // Simulate concurrent adds from multiple "threads"
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          Promise.resolve().then(() => {
            concurrentBuffer.add(createMockInsertEvent(i));
          })
        );
      }

      await Promise.all(promises);

      expect(concurrentBuffer.size()).toBe(50);
    });

    it('should not lose events during concurrent flush', async () => {
      const concurrentBuffer = new CDCBuffer({ maxBatchSize: 100 });

      // Add some events
      for (let i = 0; i < 20; i++) {
        concurrentBuffer.add(createMockInsertEvent(i));
      }

      // Flush while adding more events
      const flushPromise = Promise.resolve(concurrentBuffer.flush());
      concurrentBuffer.add(createMockInsertEvent(100));
      concurrentBuffer.add(createMockInsertEvent(101));

      const flushed = await flushPromise;

      expect(flushed).toHaveLength(20);
      expect(concurrentBuffer.size()).toBe(2);
    });

    it('should handle rapid add and flush cycles', async () => {
      const allFlushed: CDCEvent[] = [];
      const rapidBuffer = new CDCBuffer({ maxBatchSize: 5 });
      const flushCallback = vi.fn((events: CDCEvent[]) => {
        allFlushed.push(...events);
        return Promise.resolve();
      });

      rapidBuffer.startAutoFlush(flushCallback);

      // Rapid add cycle
      for (let i = 0; i < 100; i++) {
        rapidBuffer.add(createMockInsertEvent(i));
      }

      // Final flush
      const remaining = rapidBuffer.flush();
      allFlushed.push(...remaining);

      // All events should be accounted for
      expect(allFlushed).toHaveLength(100);
    });
  });

  // ==========================================================================
  // Event Ordering
  // ==========================================================================

  describe('preserve event ordering', () => {
    it('should preserve event ordering', () => {
      const events = [
        createMockInsertEvent(1),
        createMockUpdateEvent(2),
        createMockDeleteEvent(3),
        createMockInsertEvent(4),
        createMockUpdateEvent(5),
      ];

      for (const event of events) {
        buffer.add(event);
      }

      const flushed = buffer.flush();

      expect(flushed).toHaveLength(5);
      expect(flushed[0].eventId).toBe('event-1');
      expect(flushed[1].eventId).toBe('event-update-2');
      expect(flushed[2].eventId).toBe('event-delete-3');
      expect(flushed[3].eventId).toBe('event-4');
      expect(flushed[4].eventId).toBe('event-update-5');
    });

    it('should preserve ordering across multiple flushes', () => {
      const smallBuffer = new CDCBuffer({ maxBatchSize: 2 });
      const flushedBatches: CDCEvent[][] = [];

      smallBuffer.startAutoFlush((events) => {
        flushedBatches.push([...events]);
        return Promise.resolve();
      });

      // Add events that will trigger multiple flushes
      for (let i = 1; i <= 5; i++) {
        smallBuffer.add(createMockInsertEvent(i));
      }

      // Get remaining events
      const remaining = smallBuffer.flush();
      if (remaining.length > 0) {
        flushedBatches.push(remaining);
      }

      // Flatten and check order
      const allEvents = flushedBatches.flat();
      for (let i = 0; i < allEvents.length; i++) {
        expect(allEvents[i].eventId).toBe(`event-${i + 1}`);
      }
    });

    it('should maintain FIFO order', () => {
      const fifoBuffer = new CDCBuffer({ maxBatchSize: 100 });

      const insertOrder = [5, 2, 8, 1, 9, 3, 7, 4, 6, 10];
      for (const num of insertOrder) {
        fifoBuffer.add(createMockInsertEvent(num));
      }

      const flushed = fifoBuffer.flush();

      // Should be in insertion order, not sorted
      for (let i = 0; i < insertOrder.length; i++) {
        expect(flushed[i].eventId).toBe(`event-${insertOrder[i]}`);
      }
    });
  });

  // ==========================================================================
  // Auto Flush Control
  // ==========================================================================

  describe('auto flush control', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should start auto flush with callback', () => {
      const flushCallback = vi.fn().mockResolvedValue(undefined);

      buffer.startAutoFlush(flushCallback);

      // Add events to trigger batch flush
      for (let i = 0; i < 10; i++) {
        buffer.add(createMockInsertEvent(i));
      }

      expect(flushCallback).toHaveBeenCalled();
    });

    it('should stop auto flush', () => {
      const flushCallback = vi.fn().mockResolvedValue(undefined);

      buffer.startAutoFlush(flushCallback);
      buffer.stopAutoFlush();

      // Add events and wait for timeout
      buffer.add(createMockInsertEvent(1));
      vi.advanceTimersByTime(2000);

      // Should not have flushed after stopping
      expect(flushCallback).not.toHaveBeenCalled();
    });

    it('should allow restarting auto flush', () => {
      const flushCallback1 = vi.fn().mockResolvedValue(undefined);
      const flushCallback2 = vi.fn().mockResolvedValue(undefined);

      buffer.startAutoFlush(flushCallback1);
      buffer.stopAutoFlush();
      buffer.startAutoFlush(flushCallback2);

      // Trigger flush
      for (let i = 0; i < 10; i++) {
        buffer.add(createMockInsertEvent(i));
      }

      expect(flushCallback1).not.toHaveBeenCalled();
      expect(flushCallback2).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Configuration
  // ==========================================================================

  describe('configuration', () => {
    it('should use default batch size when not specified', () => {
      const defaultBuffer = new CDCBuffer();

      // Add many events
      for (let i = 0; i < 50; i++) {
        defaultBuffer.add(createMockInsertEvent(i));
      }

      // Should accumulate without automatic flush if no callback
      expect(defaultBuffer.size()).toBe(50);
    });

    it('should respect custom max batch size', () => {
      const customBatchSize = 5;
      const customBuffer = new CDCBuffer({ maxBatchSize: customBatchSize });
      const flushCallback = vi.fn().mockResolvedValue(undefined);

      customBuffer.startAutoFlush(flushCallback);

      // Add exactly batch size events
      for (let i = 0; i < customBatchSize; i++) {
        customBuffer.add(createMockInsertEvent(i));
      }

      expect(flushCallback).toHaveBeenCalledTimes(1);
      expect(flushCallback).toHaveBeenCalledWith(
        expect.arrayContaining(
          Array(customBatchSize).fill(
            expect.objectContaining({ operationType: 'insert' })
          )
        )
      );
    });

    it('should handle zero or negative batch size gracefully', () => {
      // Should use default or minimum value
      const invalidBuffer = new CDCBuffer({ maxBatchSize: 0 });

      invalidBuffer.add(createMockInsertEvent(1));

      expect(invalidBuffer.size()).toBe(1);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle very large events', () => {
      const docId = new ObjectId();
      const largeEvent: InsertEvent = {
        eventId: 'large-event',
        operationType: 'insert',
        ns: { db: 'testdb', coll: 'testcoll' },
        documentKey: { _id: docId },
        fullDocument: {
          _id: docId,
          largeField: 'x'.repeat(100000), // 100KB string
        },
        timestamp: new Date(),
      } as InsertEvent;

      buffer.add(largeEvent);
      const flushed = buffer.flush();

      expect(flushed).toHaveLength(1);
      expect((flushed[0] as InsertEvent).fullDocument.largeField).toHaveLength(100000);
    });

    it('should handle events with complex nested documents', () => {
      const docId = new ObjectId();
      const complexEvent: InsertEvent = {
        eventId: 'complex-event',
        operationType: 'insert',
        ns: { db: 'testdb', coll: 'testcoll' },
        documentKey: { _id: docId },
        fullDocument: {
          _id: docId,
          nested: {
            level1: {
              level2: {
                level3: {
                  value: 'deeply nested',
                  array: [1, 2, { innerNested: true }],
                },
              },
            },
          },
        },
        timestamp: new Date(),
      } as InsertEvent;

      buffer.add(complexEvent);
      const flushed = buffer.flush();

      expect(flushed).toHaveLength(1);
      expect(
        (flushed[0] as InsertEvent).fullDocument.nested.level1.level2.level3.value
      ).toBe('deeply nested');
    });

    it('should handle null and undefined values in documents', () => {
      const docId = new ObjectId();
      const eventWithNulls: InsertEvent = {
        eventId: 'null-event',
        operationType: 'insert',
        ns: { db: 'testdb', coll: 'testcoll' },
        documentKey: { _id: docId },
        fullDocument: {
          _id: docId,
          nullField: null,
          undefinedField: undefined,
          emptyString: '',
          zero: 0,
          falseValue: false,
        },
        timestamp: new Date(),
      } as InsertEvent;

      buffer.add(eventWithNulls);
      const flushed = buffer.flush();

      expect(flushed).toHaveLength(1);
      const doc = (flushed[0] as InsertEvent).fullDocument;
      expect(doc.nullField).toBeNull();
      expect(doc.emptyString).toBe('');
      expect(doc.zero).toBe(0);
      expect(doc.falseValue).toBe(false);
    });
  });
});
