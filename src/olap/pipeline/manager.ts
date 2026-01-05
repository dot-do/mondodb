/**
 * Pipeline Stream Manager
 *
 * Manages the lifecycle of streaming events to Cloudflare Pipelines.
 * Handles batching, automatic flushing, and metrics collection.
 */

import type { StreamConfig } from './config';
import type { PipelineBinding, BatchSendResult } from './client';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Stream manager metrics
 */
export interface StreamMetrics {
  /** Total messages successfully sent */
  messagesSent: number;
  /** Current messages in the queue */
  messagesQueued: number;
  /** Total batches sent */
  batchesSent: number;
  /** Total error count */
  errors: number;
  /** Average latency in milliseconds */
  avgLatencyMs: number;
}

// ============================================================================
// PipelineStreamManager Class
// ============================================================================

/**
 * PipelineStreamManager handles batching and streaming of events
 * to Cloudflare Pipelines with configurable settings.
 */
export class PipelineStreamManager {
  /** Stream configuration */
  private readonly config: StreamConfig;

  /** Pipeline binding */
  private readonly binding: PipelineBinding;

  /** Message queue */
  private queue: unknown[] = [];

  /** Whether the manager is running */
  private running: boolean = false;

  /** Flush timer */
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Metrics tracking */
  private metrics: StreamMetrics = {
    messagesSent: 0,
    messagesQueued: 0,
    batchesSent: 0,
    errors: 0,
    avgLatencyMs: 0,
  };

  /** Total latency accumulator for averaging */
  private totalLatencyMs: number = 0;

  /** Total batches for averaging */
  private totalBatches: number = 0;

  /**
   * Create a new PipelineStreamManager
   *
   * @param config - Stream configuration
   * @param binding - Pipeline binding
   */
  constructor(config: StreamConfig, binding: PipelineBinding) {
    this.config = config;
    this.binding = binding;
  }

  /**
   * Start the stream manager
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    // Start flush timer if flush interval is configured
    if (this.config.flushIntervalMs > 0) {
      this.startFlushTimer();
    }
  }

  /**
   * Stop the stream manager
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Stop flush timer
    this.stopFlushTimer();

    // Flush remaining messages
    if (this.queue.length > 0) {
      await this.flush();
    }
  }

  /**
   * Enqueue a single message
   *
   * @param message - Message to enqueue
   */
  async enqueue(message: unknown): Promise<void> {
    if (!this.running) {
      throw new Error('Stream manager is not running');
    }

    this.queue.push(message);
    this.metrics.messagesQueued = this.queue.length;

    // Auto-flush if batch size reached
    if (this.queue.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Enqueue a batch of messages
   *
   * @param messages - Messages to enqueue
   */
  async enqueueBatch(messages: unknown[]): Promise<void> {
    if (!this.running) {
      throw new Error('Stream manager is not running');
    }

    this.queue.push(...messages);
    this.metrics.messagesQueued = this.queue.length;

    // Auto-flush if batch size reached
    while (this.queue.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  /**
   * Flush pending messages to the Pipeline
   *
   * @returns Batch send result
   */
  async flush(): Promise<BatchSendResult> {
    if (this.queue.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        results: [],
        totalLatencyMs: 0,
      };
    }

    // Get messages to send (up to batch size)
    const messagesToSend = this.queue.splice(0, this.config.batchSize);
    this.metrics.messagesQueued = this.queue.length;

    // Send batch
    const result = await this.binding.sendBatch(messagesToSend);

    // Update metrics
    this.metrics.messagesSent += result.successCount;
    this.metrics.batchesSent++;
    this.metrics.errors += result.failureCount;

    // Update average latency
    this.totalLatencyMs += result.totalLatencyMs;
    this.totalBatches++;
    this.metrics.avgLatencyMs = this.totalLatencyMs / this.totalBatches;

    return result;
  }

  /**
   * Get current metrics
   *
   * @returns Stream metrics
   */
  getMetrics(): StreamMetrics {
    return { ...this.metrics };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Start the automatic flush timer
   */
  private startFlushTimer(): void {
    this.stopFlushTimer();

    this.flushTimer = setInterval(async () => {
      if (this.queue.length > 0) {
        await this.flush();
      }
    }, this.config.flushIntervalMs);
  }

  /**
   * Stop the automatic flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
