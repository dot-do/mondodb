/**
 * Pipeline Client
 *
 * Cloudflare Pipeline binding wrapper for sending CDC events
 * to downstream analytics systems.
 *
 * Features:
 * - Binding detection and availability checking
 * - Single and batch event sending
 * - Backpressure handling and monitoring
 * - Retry logic for transient failures
 */

import { randomUUID } from 'crypto';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Cloudflare Pipeline binding interface (mirrors Workers runtime)
 */
export interface Pipeline {
  send(message: unknown): Promise<void>;
  sendBatch(messages: unknown[]): Promise<void>;
}

/**
 * Send result with metadata
 */
export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: Error;
  retryable: boolean;
  timestamp: Date;
}

/**
 * Batch send result
 */
export interface BatchSendResult {
  successCount: number;
  failureCount: number;
  results: SendResult[];
  totalLatencyMs: number;
}

/**
 * Backpressure status
 */
export interface BackpressureStatus {
  isBackpressured: boolean;
  queueDepth: number;
  maxQueueDepth: number;
  pendingMessages: number;
}

/**
 * Environment with optional Pipeline binding
 */
export interface PipelineEnv {
  PIPELINE?: Pipeline;
}

// ============================================================================
// Constants
// ============================================================================

/** Default maximum queue depth for backpressure */
const DEFAULT_MAX_QUEUE_DEPTH = 10000;

/** Transient error patterns that indicate retryable failures */
const TRANSIENT_ERROR_PATTERNS = [
  'temporary',
  'timeout',
  'unavailable',
  'connection',
  'network',
  'retry',
  'overload',
  'rate limit',
];

/** Permanent error patterns that should not be retried */
const PERMANENT_ERROR_PATTERNS = [
  'invalid',
  'format',
  'malformed',
  'schema',
  'validation',
  'unsupported',
];

// ============================================================================
// PipelineBinding Class
// ============================================================================

/**
 * PipelineBinding wraps a Cloudflare Pipeline binding with
 * additional features like backpressure handling and retries.
 */
export class PipelineBinding {
  /** The underlying Pipeline binding */
  private readonly pipeline?: Pipeline;

  /** Maximum queue depth for backpressure */
  private maxQueueDepth: number = DEFAULT_MAX_QUEUE_DEPTH;

  /** Current pending message count */
  private pendingMessages: number = 0;

  /** Current queue depth */
  private queueDepth: number = 0;

  /**
   * Create a new PipelineBinding
   *
   * @param env - Environment object containing Pipeline binding
   */
  constructor(env: PipelineEnv | null) {
    if (env && 'PIPELINE' in env && env.PIPELINE !== undefined) {
      this.pipeline = env.PIPELINE;
    }
  }

  /**
   * Check if the Pipeline binding is available
   */
  isAvailable(): boolean {
    return this.pipeline !== undefined;
  }

  /**
   * Send a single message to the Pipeline
   *
   * @param message - Message to send
   * @returns Send result with success/failure information
   */
  async send(message: unknown): Promise<SendResult> {
    if (!this.isAvailable()) {
      throw new Error('Pipeline binding is not available');
    }

    const messageId = randomUUID();

    try {
      this.pendingMessages++;
      this.queueDepth++;

      await this.pipeline!.send(message);

      return {
        success: true,
        messageId,
        retryable: false,
        timestamp: new Date(),
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const retryable = this.isRetryableError(err);

      return {
        success: false,
        messageId,
        error: err,
        retryable,
        timestamp: new Date(),
      };
    } finally {
      this.pendingMessages--;
      this.queueDepth = Math.max(0, this.queueDepth - 1);
    }
  }

  /**
   * Send a batch of messages to the Pipeline
   *
   * @param messages - Array of messages to send
   * @returns Batch send result with individual results
   */
  async sendBatch(messages: unknown[]): Promise<BatchSendResult> {
    if (!this.isAvailable()) {
      throw new Error('Pipeline binding is not available');
    }

    // Handle empty batch
    if (messages.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        results: [],
        totalLatencyMs: 0,
      };
    }

    const startTime = Date.now();
    const results: SendResult[] = [];

    try {
      this.pendingMessages += messages.length;
      this.queueDepth += messages.length;

      await this.pipeline!.sendBatch(messages);

      // All messages succeeded
      for (let i = 0; i < messages.length; i++) {
        results.push({
          success: true,
          messageId: randomUUID(),
          retryable: false,
          timestamp: new Date(),
        });
      }

      return {
        successCount: messages.length,
        failureCount: 0,
        results,
        totalLatencyMs: Date.now() - startTime,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const retryable = this.isRetryableError(err);

      // All messages failed
      for (let i = 0; i < messages.length; i++) {
        results.push({
          success: false,
          messageId: randomUUID(),
          error: err,
          retryable,
          timestamp: new Date(),
        });
      }

      return {
        successCount: 0,
        failureCount: messages.length,
        results,
        totalLatencyMs: Date.now() - startTime,
      };
    } finally {
      this.pendingMessages = Math.max(0, this.pendingMessages - messages.length);
      this.queueDepth = Math.max(0, this.queueDepth - messages.length);
    }
  }

  /**
   * Get the current backpressure status
   */
  getBackpressureStatus(): BackpressureStatus {
    return {
      isBackpressured: this.queueDepth >= this.maxQueueDepth,
      queueDepth: this.queueDepth,
      maxQueueDepth: this.maxQueueDepth,
      pendingMessages: this.pendingMessages,
    };
  }

  /**
   * Wait for backpressure to be relieved
   *
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @returns true if backpressure was relieved, false if timeout
   */
  async waitForBackpressureRelief(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 50; // Check every 50ms

    while (Date.now() - startTime < timeoutMs) {
      if (!this.getBackpressureStatus().isBackpressured) {
        return true;
      }
      await this.delay(pollInterval);
    }

    return false;
  }

  /**
   * Set the backpressure threshold
   *
   * @param threshold - Maximum queue depth before backpressure is applied
   */
  setBackpressureThreshold(threshold: number): void {
    this.maxQueueDepth = threshold;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Check if an error is retryable (transient)
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Check for permanent error patterns first
    for (const pattern of PERMANENT_ERROR_PATTERNS) {
      if (message.includes(pattern)) {
        return false;
      }
    }

    // Check for transient error patterns
    for (const pattern of TRANSIENT_ERROR_PATTERNS) {
      if (message.includes(pattern)) {
        return true;
      }
    }

    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
