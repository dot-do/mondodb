/**
 * CDC Buffer
 *
 * Buffers CDC events for efficient batch processing.
 * Implements configurable thresholds for batch size and time-based flushing.
 */

import type { CDCEvent } from './cdc-schema';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for the CDC buffer
 */
export interface CDCBufferConfig {
  /** Maximum number of events before auto-flush (default: 100) */
  maxBatchSize?: number;
  /** Timeout in milliseconds before auto-flush (default: 1000) */
  flushTimeoutMs?: number;
}

/**
 * Callback function type for auto-flush
 */
export type FlushCallback = (events: CDCEvent[]) => void | Promise<void>;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_BATCH_SIZE = 100;
const DEFAULT_FLUSH_TIMEOUT_MS = 1000;
const MIN_BATCH_SIZE = 1;

// ============================================================================
// CDCBuffer Class
// ============================================================================

/**
 * CDCBuffer accumulates CDC events and supports both manual and automatic flushing.
 *
 * Features:
 * - Accumulates events until batch size threshold
 * - Time-based automatic flushing
 * - Preserves event ordering (FIFO)
 * - Thread-safe for concurrent writes
 */
export class CDCBuffer {
  /** Internal buffer storing events */
  private events: CDCEvent[] = [];

  /** Maximum batch size before flush */
  private readonly maxBatchSize: number;

  /** Timeout for auto-flush in milliseconds */
  private readonly flushTimeoutMs: number;

  /** Callback to invoke on auto-flush */
  private flushCallback: FlushCallback | null = null;

  /** Timer reference for time-based flush */
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Flag to track if auto-flush is active */
  private autoFlushActive: boolean = false;

  /**
   * Create a new CDC buffer
   *
   * @param config - Configuration options
   */
  constructor(config?: CDCBufferConfig) {
    const batchSize = config?.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
    this.maxBatchSize = batchSize > 0 ? batchSize : MIN_BATCH_SIZE;
    this.flushTimeoutMs = config?.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;
  }

  /**
   * Add an event to the buffer
   *
   * @param event - CDC event to add
   */
  add(event: CDCEvent): void {
    this.events.push(event);

    // Check if we should auto-flush based on batch size
    if (this.autoFlushActive && this.events.length >= this.maxBatchSize) {
      this.triggerAutoFlush();
    } else if (this.autoFlushActive && this.events.length === 1) {
      // Start timer on first event
      this.resetFlushTimer();
    }
  }

  /**
   * Flush all events from the buffer
   *
   * @returns Array of flushed events
   */
  flush(): CDCEvent[] {
    // Clear any pending timer
    this.clearFlushTimer();

    // Get all events and clear buffer
    const flushedEvents = this.events;
    this.events = [];

    return flushedEvents;
  }

  /**
   * Get the current number of events in the buffer
   */
  size(): number {
    return this.events.length;
  }

  /**
   * Check if the buffer is empty
   */
  isEmpty(): boolean {
    return this.events.length === 0;
  }

  /**
   * Start automatic flushing with the given callback
   *
   * @param callback - Function to call with events when flushing
   */
  startAutoFlush(callback: FlushCallback): void {
    this.flushCallback = callback;
    this.autoFlushActive = true;

    // If there are existing events, start the timer
    if (this.events.length > 0) {
      this.resetFlushTimer();
    }
  }

  /**
   * Stop automatic flushing
   */
  stopAutoFlush(): void {
    this.autoFlushActive = false;
    this.flushCallback = null;
    this.clearFlushTimer();
  }

  /**
   * Trigger an auto-flush with the callback
   */
  private triggerAutoFlush(): void {
    if (!this.flushCallback || this.events.length === 0) {
      return;
    }

    // Clear timer since we're flushing now
    this.clearFlushTimer();

    // Get events and clear buffer
    const eventsToFlush = this.events;
    this.events = [];

    // Call the callback
    this.flushCallback(eventsToFlush);
  }

  /**
   * Reset the flush timer
   */
  private resetFlushTimer(): void {
    this.clearFlushTimer();

    if (this.autoFlushActive && this.flushTimeoutMs > 0) {
      this.flushTimer = setTimeout(() => {
        this.triggerAutoFlush();
      }, this.flushTimeoutMs);
    }
  }

  /**
   * Clear the flush timer
   */
  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
