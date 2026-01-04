/**
 * CDC Emitter
 *
 * Responsible for emitting Change Data Capture events to downstream systems.
 * Handles batching, buffering, and graceful degradation when Pipeline binding
 * is unavailable.
 */

import type { CDCEvent, InsertEvent, UpdateEvent, DeleteEvent } from './cdc-schema';
import { createInsertEvent, createUpdateEvent, createDeleteEvent } from './cdc-schema';
import { CDCBuffer } from './cdc-buffer';
import type { ObjectId } from '../../types/objectid';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Pipeline binding interface (Cloudflare Pipelines)
 */
export interface Pipeline {
  send(data: unknown): Promise<void>;
  sendBatch(data: unknown[]): Promise<void>;
}

/**
 * Configuration options for the CDC emitter
 */
export interface CDCEmitterConfig {
  /** Pipeline binding for sending events */
  pipeline?: Pipeline;
  /** Database name */
  database: string;
  /** Collection name */
  collection: string;
  /** Batch size for buffering (default: 1 for immediate send) */
  batchSize?: number;
  /** Batch timeout in milliseconds */
  batchTimeoutMs?: number;
  /** Number of retry attempts on failure (default: 0) */
  retryAttempts?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_RETRY_ATTEMPTS = 0;
const RETRY_DELAY_MS = 100;

// ============================================================================
// CDCEmitter Class
// ============================================================================

/**
 * CDCEmitter handles emitting CDC events to Cloudflare Pipelines.
 *
 * Features:
 * - Emits insert, update, and delete events
 * - Supports batching for efficiency
 * - Graceful degradation when Pipeline unavailable
 * - Retry logic for transient failures
 */
export class CDCEmitter {
  /** Pipeline binding */
  private readonly pipeline?: Pipeline;

  /** Database name */
  private readonly database: string;

  /** Collection name */
  private readonly collection: string;

  /** Buffer for batching events */
  private readonly buffer: CDCBuffer;

  /** Whether batching is enabled */
  private readonly batchingEnabled: boolean;

  /** Number of retry attempts */
  private readonly retryAttempts: number;

  /**
   * Create a new CDC emitter
   *
   * @param config - Configuration options
   */
  constructor(config: CDCEmitterConfig) {
    this.pipeline = config.pipeline;
    this.database = config.database;
    this.collection = config.collection;
    this.retryAttempts = config.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;

    // Initialize buffer if batching is configured
    this.batchingEnabled = (config.batchSize ?? 1) > 1;
    this.buffer = new CDCBuffer({
      maxBatchSize: config.batchSize ?? 1,
      flushTimeoutMs: config.batchTimeoutMs,
    });

    // Start auto-flush if batching is enabled and pipeline is available
    if (this.batchingEnabled && this.pipeline) {
      this.buffer.startAutoFlush(async (events) => {
        await this.sendBatchToPipeline(events);
      });
    }
  }

  /**
   * Emit an insert event for a new document
   *
   * @param document - The inserted document
   */
  async emitInsert(document: Record<string, unknown> & { _id: ObjectId }): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('CDC Pipeline not available - insert event dropped');
      return;
    }

    const event = createInsertEvent({
      database: this.database,
      collection: this.collection,
      document,
    });

    await this.emitEvent(event);
  }

  /**
   * Emit an update event for a document change
   *
   * @param before - The document before the change (null if not available)
   * @param after - The document after the change
   */
  async emitUpdate(
    before: Record<string, unknown> | null,
    after: Record<string, unknown> & { _id: ObjectId }
  ): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('CDC Pipeline not available - update event dropped');
      return;
    }

    const event = createUpdateEvent({
      database: this.database,
      collection: this.collection,
      documentKey: { _id: after._id },
      before,
      after,
    });

    await this.emitEvent(event);
  }

  /**
   * Emit a delete event for a removed document
   *
   * @param document - The deleted document
   */
  async emitDelete(document: Record<string, unknown> & { _id: ObjectId }): Promise<void> {
    if (!this.isAvailable()) {
      console.warn('CDC Pipeline not available - delete event dropped');
      return;
    }

    const event = createDeleteEvent({
      database: this.database,
      collection: this.collection,
      documentKey: { _id: document._id },
      deletedDocument: document,
    });

    await this.emitEvent(event);
  }

  /**
   * Emit multiple events in bulk
   *
   * @param events - Array of CDC events to emit
   */
  async emitBulk(events: CDCEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    if (!this.isAvailable()) {
      console.warn('CDC Pipeline not available - bulk events dropped');
      return;
    }

    await this.sendBatchToPipeline(events);
  }

  /**
   * Flush any buffered events immediately
   */
  async flush(): Promise<void> {
    const events = this.buffer.flush();

    if (events.length === 0) {
      return;
    }

    if (!this.isAvailable()) {
      return;
    }

    await this.sendBatchToPipeline(events);
  }

  /**
   * Check if the Pipeline binding is available
   */
  isAvailable(): boolean {
    return this.pipeline !== undefined;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Emit a single event, either directly or via buffer
   */
  private async emitEvent(event: CDCEvent): Promise<void> {
    if (this.batchingEnabled) {
      this.buffer.add(event);
    } else {
      await this.sendToPipeline(event);
    }
  }

  /**
   * Send a single event to the pipeline with retry logic
   */
  private async sendToPipeline(event: CDCEvent): Promise<void> {
    if (!this.pipeline) {
      return;
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        await this.pipeline.send(event);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.retryAttempts) {
          // Wait before retry
          await this.delay(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    // All retries failed - log but don't throw
    console.error('CDC Pipeline send failed after retries:', lastError);
  }

  /**
   * Send a batch of events to the pipeline
   */
  private async sendBatchToPipeline(events: CDCEvent[]): Promise<void> {
    if (!this.pipeline || events.length === 0) {
      return;
    }

    try {
      await this.pipeline.sendBatch(events);
    } catch (error) {
      console.error('CDC Pipeline sendBatch failed:', error);
    }
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
