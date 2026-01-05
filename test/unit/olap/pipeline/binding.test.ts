/**
 * Cloudflare Pipeline Binding Tests (TDD - RED phase)
 *
 * Tests for Cloudflare Pipelines integration including:
 * - PipelineBinding - detect binding, send events, handle backpressure
 * - StreamConfig - configure from wrangler, validate stream
 *
 * Cloudflare Pipelines provide a managed event streaming service
 * for ingesting and processing data at scale.
 *
 * Issue: mongo.do-s6mp - Pipeline Integration Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Cloudflare Pipeline binding interface (mirrors Workers runtime)
 */
interface Pipeline {
  send(message: unknown): Promise<void>;
  sendBatch(messages: unknown[]): Promise<void>;
}

/**
 * Pipeline binding configuration from wrangler.jsonc
 */
interface PipelineBindingConfig {
  name: string;
  pipeline: string;
}

/**
 * Stream configuration options
 */
interface StreamConfig {
  binding: string;
  batchSize: number;
  flushIntervalMs: number;
  maxRetries: number;
  backpressureThreshold: number;
  compressionEnabled: boolean;
  format: 'json' | 'ndjson' | 'parquet';
}

/**
 * Backpressure status
 */
interface BackpressureStatus {
  isBackpressured: boolean;
  queueDepth: number;
  maxQueueDepth: number;
  pendingMessages: number;
}

/**
 * Send result with metadata
 */
interface SendResult {
  success: boolean;
  messageId?: string;
  error?: Error;
  retryable: boolean;
  timestamp: Date;
}

/**
 * Batch send result
 */
interface BatchSendResult {
  successCount: number;
  failureCount: number;
  results: SendResult[];
  totalLatencyMs: number;
}

// =============================================================================
// Mock Implementation Stubs
// =============================================================================

class PipelineBinding {
  constructor(_env: { PIPELINE?: Pipeline }) {
    throw new Error('Not implemented');
  }

  isAvailable(): boolean {
    throw new Error('Not implemented');
  }

  async send(_message: unknown): Promise<SendResult> {
    throw new Error('Not implemented');
  }

  async sendBatch(_messages: unknown[]): Promise<BatchSendResult> {
    throw new Error('Not implemented');
  }

  getBackpressureStatus(): BackpressureStatus {
    throw new Error('Not implemented');
  }

  async waitForBackpressureRelief(_timeoutMs: number): Promise<boolean> {
    throw new Error('Not implemented');
  }

  setBackpressureThreshold(_threshold: number): void {
    throw new Error('Not implemented');
  }
}

class StreamConfigBuilder {
  withBinding(_binding: string): this {
    throw new Error('Not implemented');
  }

  withBatchSize(_size: number): this {
    throw new Error('Not implemented');
  }

  withFlushInterval(_ms: number): this {
    throw new Error('Not implemented');
  }

  withMaxRetries(_retries: number): this {
    throw new Error('Not implemented');
  }

  withBackpressureThreshold(_threshold: number): this {
    throw new Error('Not implemented');
  }

  withCompression(_enabled: boolean): this {
    throw new Error('Not implemented');
  }

  withFormat(_format: 'json' | 'ndjson' | 'parquet'): this {
    throw new Error('Not implemented');
  }

  build(): StreamConfig {
    throw new Error('Not implemented');
  }

  validate(): { valid: boolean; errors: string[] } {
    throw new Error('Not implemented');
  }

  static fromWrangler(_config: PipelineBindingConfig): StreamConfigBuilder {
    throw new Error('Not implemented');
  }
}

class PipelineStreamManager {
  constructor(_config: StreamConfig, _binding: PipelineBinding) {
    throw new Error('Not implemented');
  }

  async start(): Promise<void> {
    throw new Error('Not implemented');
  }

  async stop(): Promise<void> {
    throw new Error('Not implemented');
  }

  async enqueue(_message: unknown): Promise<void> {
    throw new Error('Not implemented');
  }

  async enqueueBatch(_messages: unknown[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async flush(): Promise<BatchSendResult> {
    throw new Error('Not implemented');
  }

  getMetrics(): {
    messagesSent: number;
    messagesQueued: number;
    batchesSent: number;
    errors: number;
    avgLatencyMs: number;
  } {
    throw new Error('Not implemented');
  }
}

// =============================================================================
// Pipeline Binding Detection Tests
// =============================================================================

describe.skip('PipelineBinding', () => {
  let mockPipeline: Pipeline;

  beforeEach(() => {
    mockPipeline = {
      send: vi.fn().mockResolvedValue(undefined),
      sendBatch: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Binding Detection
  // ==========================================================================

  describe('binding detection', () => {
    it('should detect when Pipeline binding is available', () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });

      expect(binding.isAvailable()).toBe(true);
    });

    it('should detect when Pipeline binding is not available', () => {
      const binding = new PipelineBinding({});

      expect(binding.isAvailable()).toBe(false);
    });

    it('should detect when Pipeline binding is undefined', () => {
      const binding = new PipelineBinding({ PIPELINE: undefined });

      expect(binding.isAvailable()).toBe(false);
    });

    it('should handle null env gracefully', () => {
      const binding = new PipelineBinding(null as unknown as { PIPELINE?: Pipeline });

      expect(binding.isAvailable()).toBe(false);
    });

    it('should detect binding by custom name', () => {
      const customEnv = { MY_CUSTOM_PIPELINE: mockPipeline } as unknown as { PIPELINE?: Pipeline };
      const binding = new PipelineBinding(customEnv);

      // Should still return false for default PIPELINE key
      expect(binding.isAvailable()).toBe(false);
    });
  });

  // ==========================================================================
  // Send Events
  // ==========================================================================

  describe('send events', () => {
    it('should send a single message to Pipeline', async () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      const message = { type: 'insert', document: { _id: '123', name: 'Test' } };

      const result = await binding.send(message);

      expect(result.success).toBe(true);
      expect(mockPipeline.send).toHaveBeenCalledWith(message);
    });

    it('should return messageId on successful send', async () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      const message = { type: 'insert', data: 'test' };

      const result = await binding.send(message);

      expect(result.messageId).toBeDefined();
      expect(typeof result.messageId).toBe('string');
    });

    it('should include timestamp in send result', async () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      const beforeSend = new Date();

      const result = await binding.send({ data: 'test' });

      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(beforeSend.getTime());
    });

    it('should handle send failure gracefully', async () => {
      mockPipeline.send = vi.fn().mockRejectedValue(new Error('Pipeline unavailable'));
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });

      const result = await binding.send({ data: 'test' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Pipeline unavailable');
    });

    it('should mark transient errors as retryable', async () => {
      mockPipeline.send = vi.fn().mockRejectedValue(new Error('Temporary failure'));
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });

      const result = await binding.send({ data: 'test' });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it('should mark permanent errors as non-retryable', async () => {
      mockPipeline.send = vi.fn().mockRejectedValue(new Error('Invalid message format'));
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });

      const result = await binding.send({ data: 'test' });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
    });

    it('should throw when Pipeline binding is not available', async () => {
      const binding = new PipelineBinding({});

      await expect(binding.send({ data: 'test' })).rejects.toThrow(
        'Pipeline binding is not available'
      );
    });

    it('should serialize complex objects', async () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      const complexMessage = {
        nested: {
          array: [1, 2, { deep: true }],
          date: new Date('2024-01-15'),
        },
      };

      await binding.send(complexMessage);

      expect(mockPipeline.send).toHaveBeenCalledWith(
        expect.objectContaining({
          nested: expect.objectContaining({
            array: expect.arrayContaining([1, 2, { deep: true }]),
          }),
        })
      );
    });
  });

  // ==========================================================================
  // Send Batch
  // ==========================================================================

  describe('send batch', () => {
    it('should send batch of messages to Pipeline', async () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      const messages = [
        { type: 'insert', id: '1' },
        { type: 'update', id: '2' },
        { type: 'delete', id: '3' },
      ];

      const result = await binding.sendBatch(messages);

      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(mockPipeline.sendBatch).toHaveBeenCalledWith(messages);
    });

    it('should return individual results for each message', async () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      const messages = [{ id: '1' }, { id: '2' }];

      const result = await binding.sendBatch(messages);

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });

    it('should track total latency for batch', async () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      const messages = [{ id: '1' }, { id: '2' }, { id: '3' }];

      const result = await binding.sendBatch(messages);

      expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.totalLatencyMs).toBe('number');
    });

    it('should handle partial batch failure', async () => {
      // Simulate partial failure by having sendBatch throw for some messages
      mockPipeline.sendBatch = vi.fn().mockResolvedValue({
        results: [
          { success: true },
          { success: false, error: 'Message too large' },
          { success: true },
        ],
      });
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      const messages = [{ id: '1' }, { id: '2' }, { id: '3' }];

      const result = await binding.sendBatch(messages);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
    });

    it('should handle empty batch', async () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });

      const result = await binding.sendBatch([]);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(mockPipeline.sendBatch).not.toHaveBeenCalled();
    });

    it('should handle batch send failure', async () => {
      mockPipeline.sendBatch = vi.fn().mockRejectedValue(new Error('Batch send failed'));
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      const messages = [{ id: '1' }, { id: '2' }];

      const result = await binding.sendBatch(messages);

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(2);
    });

    it('should throw when Pipeline binding is not available for batch', async () => {
      const binding = new PipelineBinding({});

      await expect(binding.sendBatch([{ data: 'test' }])).rejects.toThrow(
        'Pipeline binding is not available'
      );
    });
  });

  // ==========================================================================
  // Backpressure Handling
  // ==========================================================================

  describe('backpressure handling', () => {
    it('should report backpressure status', () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });

      const status = binding.getBackpressureStatus();

      expect(status).toHaveProperty('isBackpressured');
      expect(status).toHaveProperty('queueDepth');
      expect(status).toHaveProperty('maxQueueDepth');
      expect(status).toHaveProperty('pendingMessages');
    });

    it('should detect when backpressure is applied', () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      binding.setBackpressureThreshold(10);

      // Simulate queue filling up (implementation would track this)
      const status = binding.getBackpressureStatus();

      expect(typeof status.isBackpressured).toBe('boolean');
    });

    it('should report queue depth', () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });

      const status = binding.getBackpressureStatus();

      expect(status.queueDepth).toBeGreaterThanOrEqual(0);
      expect(status.queueDepth).toBeLessThanOrEqual(status.maxQueueDepth);
    });

    it('should allow setting backpressure threshold', () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });

      binding.setBackpressureThreshold(1000);

      const status = binding.getBackpressureStatus();
      expect(status.maxQueueDepth).toBe(1000);
    });

    it('should wait for backpressure relief', async () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });

      const relieved = await binding.waitForBackpressureRelief(5000);

      expect(typeof relieved).toBe('boolean');
    });

    it('should timeout waiting for backpressure relief', async () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });
      // Simulate sustained backpressure
      binding.setBackpressureThreshold(1);

      const relieved = await binding.waitForBackpressureRelief(100);

      expect(relieved).toBe(false);
    });

    it('should track pending messages count', () => {
      const binding = new PipelineBinding({ PIPELINE: mockPipeline });

      const status = binding.getBackpressureStatus();

      expect(typeof status.pendingMessages).toBe('number');
      expect(status.pendingMessages).toBeGreaterThanOrEqual(0);
    });
  });
});

// =============================================================================
// Stream Configuration Tests
// =============================================================================

describe.skip('StreamConfigBuilder', () => {
  let builder: StreamConfigBuilder;

  beforeEach(() => {
    builder = new StreamConfigBuilder();
  });

  // ==========================================================================
  // Basic Configuration
  // ==========================================================================

  describe('basic configuration', () => {
    it('should build stream config with binding name', () => {
      const config = builder
        .withBinding('CDC_PIPELINE')
        .withBatchSize(100)
        .withFlushInterval(1000)
        .build();

      expect(config.binding).toBe('CDC_PIPELINE');
    });

    it('should set batch size', () => {
      const config = builder
        .withBinding('PIPELINE')
        .withBatchSize(500)
        .build();

      expect(config.batchSize).toBe(500);
    });

    it('should set flush interval', () => {
      const config = builder
        .withBinding('PIPELINE')
        .withFlushInterval(5000)
        .build();

      expect(config.flushIntervalMs).toBe(5000);
    });

    it('should set max retries', () => {
      const config = builder
        .withBinding('PIPELINE')
        .withMaxRetries(5)
        .build();

      expect(config.maxRetries).toBe(5);
    });

    it('should set backpressure threshold', () => {
      const config = builder
        .withBinding('PIPELINE')
        .withBackpressureThreshold(10000)
        .build();

      expect(config.backpressureThreshold).toBe(10000);
    });

    it('should enable compression', () => {
      const config = builder
        .withBinding('PIPELINE')
        .withCompression(true)
        .build();

      expect(config.compressionEnabled).toBe(true);
    });

    it('should set output format to json', () => {
      const config = builder
        .withBinding('PIPELINE')
        .withFormat('json')
        .build();

      expect(config.format).toBe('json');
    });

    it('should set output format to ndjson', () => {
      const config = builder
        .withBinding('PIPELINE')
        .withFormat('ndjson')
        .build();

      expect(config.format).toBe('ndjson');
    });

    it('should set output format to parquet', () => {
      const config = builder
        .withBinding('PIPELINE')
        .withFormat('parquet')
        .build();

      expect(config.format).toBe('parquet');
    });
  });

  // ==========================================================================
  // Default Values
  // ==========================================================================

  describe('default values', () => {
    it('should use default batch size of 100', () => {
      const config = builder.withBinding('PIPELINE').build();

      expect(config.batchSize).toBe(100);
    });

    it('should use default flush interval of 1000ms', () => {
      const config = builder.withBinding('PIPELINE').build();

      expect(config.flushIntervalMs).toBe(1000);
    });

    it('should use default max retries of 3', () => {
      const config = builder.withBinding('PIPELINE').build();

      expect(config.maxRetries).toBe(3);
    });

    it('should use default backpressure threshold of 10000', () => {
      const config = builder.withBinding('PIPELINE').build();

      expect(config.backpressureThreshold).toBe(10000);
    });

    it('should disable compression by default', () => {
      const config = builder.withBinding('PIPELINE').build();

      expect(config.compressionEnabled).toBe(false);
    });

    it('should use json format by default', () => {
      const config = builder.withBinding('PIPELINE').build();

      expect(config.format).toBe('json');
    });
  });

  // ==========================================================================
  // Validation
  // ==========================================================================

  describe('validation', () => {
    it('should require binding name', () => {
      const result = builder.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Binding name is required');
    });

    it('should reject empty binding name', () => {
      const result = builder.withBinding('').validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Binding name cannot be empty');
    });

    it('should reject invalid batch size', () => {
      const result = builder
        .withBinding('PIPELINE')
        .withBatchSize(0)
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Batch size must be at least 1');
    });

    it('should reject negative batch size', () => {
      const result = builder
        .withBinding('PIPELINE')
        .withBatchSize(-10)
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Batch size must be at least 1');
    });

    it('should reject batch size exceeding maximum', () => {
      const result = builder
        .withBinding('PIPELINE')
        .withBatchSize(100001)
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Batch size cannot exceed 100000');
    });

    it('should reject invalid flush interval', () => {
      const result = builder
        .withBinding('PIPELINE')
        .withFlushInterval(0)
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Flush interval must be at least 100ms');
    });

    it('should reject flush interval less than 100ms', () => {
      const result = builder
        .withBinding('PIPELINE')
        .withFlushInterval(50)
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Flush interval must be at least 100ms');
    });

    it('should reject negative max retries', () => {
      const result = builder
        .withBinding('PIPELINE')
        .withMaxRetries(-1)
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Max retries cannot be negative');
    });

    it('should reject negative backpressure threshold', () => {
      const result = builder
        .withBinding('PIPELINE')
        .withBackpressureThreshold(-100)
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Backpressure threshold must be positive');
    });

    it('should pass validation with valid config', () => {
      const result = builder
        .withBinding('CDC_PIPELINE')
        .withBatchSize(100)
        .withFlushInterval(1000)
        .withMaxRetries(3)
        .withBackpressureThreshold(10000)
        .validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Configure from Wrangler
  // ==========================================================================

  describe('configure from wrangler', () => {
    it('should create config from wrangler pipeline binding', () => {
      const wranglerConfig: PipelineBindingConfig = {
        name: 'CDC_PIPELINE',
        pipeline: 'mongo.do-cdc-pipeline',
      };

      const configBuilder = StreamConfigBuilder.fromWrangler(wranglerConfig);
      const config = configBuilder.build();

      expect(config.binding).toBe('CDC_PIPELINE');
    });

    it('should preserve pipeline name in config', () => {
      const wranglerConfig: PipelineBindingConfig = {
        name: 'ANALYTICS',
        pipeline: 'analytics-stream',
      };

      const configBuilder = StreamConfigBuilder.fromWrangler(wranglerConfig);
      const config = configBuilder.build();

      expect(config.binding).toBe('ANALYTICS');
    });

    it('should allow overriding wrangler defaults', () => {
      const wranglerConfig: PipelineBindingConfig = {
        name: 'PIPELINE',
        pipeline: 'test-pipeline',
      };

      const configBuilder = StreamConfigBuilder.fromWrangler(wranglerConfig);
      const config = configBuilder
        .withBatchSize(500)
        .withFormat('ndjson')
        .build();

      expect(config.batchSize).toBe(500);
      expect(config.format).toBe('ndjson');
    });

    it('should validate wrangler config', () => {
      const invalidConfig: PipelineBindingConfig = {
        name: '',
        pipeline: 'test',
      };

      const configBuilder = StreamConfigBuilder.fromWrangler(invalidConfig);
      const result = configBuilder.validate();

      expect(result.valid).toBe(false);
    });
  });
});

// =============================================================================
// Pipeline Stream Manager Tests
// =============================================================================

describe.skip('PipelineStreamManager', () => {
  let mockPipeline: Pipeline;
  let binding: PipelineBinding;
  let config: StreamConfig;

  beforeEach(() => {
    mockPipeline = {
      send: vi.fn().mockResolvedValue(undefined),
      sendBatch: vi.fn().mockResolvedValue(undefined),
    };
    binding = new PipelineBinding({ PIPELINE: mockPipeline });
    config = new StreamConfigBuilder()
      .withBinding('PIPELINE')
      .withBatchSize(10)
      .withFlushInterval(1000)
      .build();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  describe('lifecycle', () => {
    it('should start the stream manager', async () => {
      const manager = new PipelineStreamManager(config, binding);

      await expect(manager.start()).resolves.toBeUndefined();
    });

    it('should stop the stream manager', async () => {
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      await expect(manager.stop()).resolves.toBeUndefined();
    });

    it('should flush pending messages on stop', async () => {
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      await manager.enqueue({ data: 'test' });
      await manager.stop();

      expect(mockPipeline.sendBatch).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Enqueue Operations
  // ==========================================================================

  describe('enqueue operations', () => {
    it('should enqueue a single message', async () => {
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      await expect(manager.enqueue({ type: 'test' })).resolves.toBeUndefined();

      const metrics = manager.getMetrics();
      expect(metrics.messagesQueued).toBeGreaterThanOrEqual(1);
    });

    it('should enqueue batch of messages', async () => {
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      const messages = [{ id: '1' }, { id: '2' }, { id: '3' }];
      await manager.enqueueBatch(messages);

      const metrics = manager.getMetrics();
      expect(metrics.messagesQueued).toBeGreaterThanOrEqual(3);
    });

    it('should auto-flush when batch size reached', async () => {
      const smallBatchConfig = new StreamConfigBuilder()
        .withBinding('PIPELINE')
        .withBatchSize(3)
        .withFlushInterval(10000)
        .build();

      const manager = new PipelineStreamManager(smallBatchConfig, binding);
      await manager.start();

      // Add exactly batch size messages
      await manager.enqueue({ id: '1' });
      await manager.enqueue({ id: '2' });
      await manager.enqueue({ id: '3' });

      expect(mockPipeline.sendBatch).toHaveBeenCalled();
    });

    it('should reject enqueue when manager is stopped', async () => {
      const manager = new PipelineStreamManager(config, binding);

      await expect(manager.enqueue({ data: 'test' })).rejects.toThrow(
        'Stream manager is not running'
      );
    });
  });

  // ==========================================================================
  // Manual Flush
  // ==========================================================================

  describe('manual flush', () => {
    it('should manually flush pending messages', async () => {
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      await manager.enqueue({ id: '1' });
      await manager.enqueue({ id: '2' });

      const result = await manager.flush();

      expect(result.successCount).toBe(2);
      expect(mockPipeline.sendBatch).toHaveBeenCalled();
    });

    it('should return empty result when no pending messages', async () => {
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      const result = await manager.flush();

      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
    });
  });

  // ==========================================================================
  // Metrics
  // ==========================================================================

  describe('metrics', () => {
    it('should track messages sent', async () => {
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      await manager.enqueue({ id: '1' });
      await manager.flush();

      const metrics = manager.getMetrics();
      expect(metrics.messagesSent).toBe(1);
    });

    it('should track batches sent', async () => {
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      await manager.enqueue({ id: '1' });
      await manager.enqueue({ id: '2' });
      await manager.flush();

      const metrics = manager.getMetrics();
      expect(metrics.batchesSent).toBe(1);
    });

    it('should track errors', async () => {
      mockPipeline.sendBatch = vi.fn().mockRejectedValue(new Error('Send failed'));
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      await manager.enqueue({ id: '1' });
      await manager.flush();

      const metrics = manager.getMetrics();
      expect(metrics.errors).toBeGreaterThanOrEqual(1);
    });

    it('should track average latency', async () => {
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      await manager.enqueue({ id: '1' });
      await manager.flush();

      const metrics = manager.getMetrics();
      expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should track queued messages', async () => {
      const manager = new PipelineStreamManager(config, binding);
      await manager.start();

      await manager.enqueue({ id: '1' });
      await manager.enqueue({ id: '2' });

      const metrics = manager.getMetrics();
      expect(metrics.messagesQueued).toBe(2);
    });
  });
});
