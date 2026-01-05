/**
 * Pipeline Configuration
 *
 * Stream configuration builder for Cloudflare Pipelines.
 * Supports building configurations from wrangler.jsonc and validation.
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Pipeline binding configuration from wrangler.jsonc
 */
export interface PipelineBindingConfig {
  name: string;
  pipeline: string;
}

/**
 * Stream configuration options
 */
export interface StreamConfig {
  binding: string;
  batchSize: number;
  flushIntervalMs: number;
  maxRetries: number;
  backpressureThreshold: number;
  compressionEnabled: boolean;
  format: 'json' | 'ndjson' | 'parquet';
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// Constants
// ============================================================================

/** Default batch size */
const DEFAULT_BATCH_SIZE = 100;

/** Default flush interval in milliseconds */
const DEFAULT_FLUSH_INTERVAL_MS = 1000;

/** Default max retries */
const DEFAULT_MAX_RETRIES = 3;

/** Default backpressure threshold */
const DEFAULT_BACKPRESSURE_THRESHOLD = 10000;

/** Default compression setting */
const DEFAULT_COMPRESSION_ENABLED = false;

/** Default format */
const DEFAULT_FORMAT: StreamConfig['format'] = 'json';

/** Maximum allowed batch size */
const MAX_BATCH_SIZE = 100000;

/** Minimum flush interval in milliseconds */
const MIN_FLUSH_INTERVAL_MS = 100;

// ============================================================================
// StreamConfigBuilder Class
// ============================================================================

/**
 * Builder for StreamConfig with fluent API and validation.
 */
export class StreamConfigBuilder {
  private bindingName: string = '';
  private batchSize: number = DEFAULT_BATCH_SIZE;
  private flushIntervalMs: number = DEFAULT_FLUSH_INTERVAL_MS;
  private maxRetries: number = DEFAULT_MAX_RETRIES;
  private backpressureThreshold: number = DEFAULT_BACKPRESSURE_THRESHOLD;
  private compressionEnabled: boolean = DEFAULT_COMPRESSION_ENABLED;
  private format: StreamConfig['format'] = DEFAULT_FORMAT;

  /**
   * Set the binding name
   *
   * @param binding - The binding name from wrangler.jsonc
   */
  withBinding(binding: string): this {
    this.bindingName = binding;
    return this;
  }

  /**
   * Set the batch size
   *
   * @param size - Number of messages per batch
   */
  withBatchSize(size: number): this {
    this.batchSize = size;
    return this;
  }

  /**
   * Set the flush interval
   *
   * @param ms - Milliseconds between automatic flushes
   */
  withFlushInterval(ms: number): this {
    this.flushIntervalMs = ms;
    return this;
  }

  /**
   * Set the max retries
   *
   * @param retries - Maximum retry attempts on failure
   */
  withMaxRetries(retries: number): this {
    this.maxRetries = retries;
    return this;
  }

  /**
   * Set the backpressure threshold
   *
   * @param threshold - Maximum queue depth before backpressure
   */
  withBackpressureThreshold(threshold: number): this {
    this.backpressureThreshold = threshold;
    return this;
  }

  /**
   * Enable or disable compression
   *
   * @param enabled - Whether to compress messages
   */
  withCompression(enabled: boolean): this {
    this.compressionEnabled = enabled;
    return this;
  }

  /**
   * Set the output format
   *
   * @param format - Message format ('json', 'ndjson', or 'parquet')
   */
  withFormat(format: 'json' | 'ndjson' | 'parquet'): this {
    this.format = format;
    return this;
  }

  /**
   * Build the StreamConfig
   *
   * @returns The built StreamConfig
   */
  build(): StreamConfig {
    return {
      binding: this.bindingName,
      batchSize: this.batchSize,
      flushIntervalMs: this.flushIntervalMs,
      maxRetries: this.maxRetries,
      backpressureThreshold: this.backpressureThreshold,
      compressionEnabled: this.compressionEnabled,
      format: this.format,
    };
  }

  /**
   * Validate the current configuration
   *
   * @returns Validation result with any errors
   */
  validate(): ValidationResult {
    const errors: string[] = [];

    // Validate binding name
    if (!this.bindingName) {
      errors.push('Binding name is required');
    } else if (this.bindingName.trim() === '') {
      errors.push('Binding name cannot be empty');
    }

    // Validate batch size
    if (this.batchSize < 1) {
      errors.push('Batch size must be at least 1');
    } else if (this.batchSize > MAX_BATCH_SIZE) {
      errors.push(`Batch size cannot exceed ${MAX_BATCH_SIZE}`);
    }

    // Validate flush interval
    if (this.flushIntervalMs < MIN_FLUSH_INTERVAL_MS) {
      errors.push(`Flush interval must be at least ${MIN_FLUSH_INTERVAL_MS}ms`);
    }

    // Validate max retries
    if (this.maxRetries < 0) {
      errors.push('Max retries cannot be negative');
    }

    // Validate backpressure threshold
    if (this.backpressureThreshold <= 0) {
      errors.push('Backpressure threshold must be positive');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create a StreamConfigBuilder from wrangler pipeline config
   *
   * @param config - Pipeline binding configuration from wrangler.jsonc
   * @returns A new StreamConfigBuilder with binding name set
   */
  static fromWrangler(config: PipelineBindingConfig): StreamConfigBuilder {
    const builder = new StreamConfigBuilder();
    builder.bindingName = config.name;
    return builder;
  }
}
