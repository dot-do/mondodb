/**
 * ClickHouse S3Queue Integration
 *
 * Provides S3Queue table engine support for streaming data from S3/R2
 * into ClickHouse for real-time analytics. S3Queue enables continuous
 * ingestion of Parquet, JSON, or CSV files from object storage.
 *
 * Key features:
 * - R2/S3 compatible endpoint configuration
 * - Ordered and unordered processing modes
 * - Configurable polling intervals and thread counts
 * - Support for Parquet, JSONEachRow, and CSV formats
 * - After-processing actions (keep/delete files)
 *
 * Issue: mondodb-50bs - ClickHouse S3Queue Integration
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * S3Queue configuration options
 */
export interface S3QueueConfig {
  /** S3/R2 endpoint URL (e.g., https://account-id.r2.cloudflarestorage.com) */
  endpoint: string;
  /** Bucket name */
  bucket: string;
  /** Path pattern with optional glob (e.g., cdc/*.parquet) */
  path: string;
  /** Access key ID for authentication */
  accessKeyId: string;
  /** Secret access key for authentication */
  secretAccessKey: string;
  /** File format */
  format: 'Parquet' | 'JSONEachRow' | 'CSV';
  /** Polling interval in milliseconds (minimum 100ms) */
  pollIntervalMs: number;
  /** Maximum processing threads (1-64) */
  maxThreads: number;
  /** Maximum block size for reading */
  maxBlockSize: number;
  /** Action after processing files */
  afterProcessing: 'keep' | 'delete';
  /** Enable ordered processing mode (limits threads to 1) */
  orderedMode: boolean;
}

/**
 * S3Queue table definition
 */
export interface S3QueueTableDefinition {
  /** Database name */
  database: string;
  /** Table name */
  table: string;
  /** Column definitions */
  columns: Array<{ name: string; type: string }>;
  /** Table engine (always S3Queue) */
  engine: 'S3Queue';
  /** S3Queue settings */
  settings: S3QueueConfig;
}

/**
 * S3Queue table column definition
 */
export interface S3QueueColumn {
  /** Column name */
  name: string;
  /** ClickHouse data type */
  type: string;
  /** Optional default value */
  defaultValue?: string;
  /** Optional column comment */
  comment?: string;
}

/**
 * S3Queue status information
 */
export interface S3QueueStatus {
  /** Number of files pending processing */
  pendingFiles: number;
  /** Number of successfully processed files */
  processedFiles: number;
  /** Number of files that failed to process */
  failedFiles: number;
}

/**
 * S3Queue processing metrics
 */
export interface S3QueueMetrics {
  /** Files processed per second */
  filesPerSecond: number;
  /** Bytes processed per second */
  bytesPerSecond: number;
  /** Average processing latency in milliseconds */
  avgLatencyMs: number;
}

/**
 * Validation result for S3Queue configuration
 */
export interface S3QueueValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
}

// =============================================================================
// S3Queue Configuration Builder
// =============================================================================

/**
 * Builder for S3Queue configuration
 *
 * Provides a fluent API for constructing S3Queue configurations
 * with validation support.
 *
 * @example
 * ```typescript
 * const config = new S3QueueConfigBuilder()
 *   .withEndpoint('https://account.r2.cloudflarestorage.com')
 *   .withBucket('mondodb-cdc')
 *   .withPath('cdc/*.parquet')
 *   .withCredentials('access-key', 'secret-key')
 *   .withFormat('Parquet')
 *   .withPollInterval(1000)
 *   .build();
 * ```
 */
export class S3QueueConfigBuilder {
  private config: Partial<S3QueueConfig> = {};

  /**
   * Set the S3/R2 endpoint URL
   */
  withEndpoint(endpoint: string): this {
    this.config.endpoint = endpoint;
    return this;
  }

  /**
   * Set the bucket name
   */
  withBucket(bucket: string): this {
    this.config.bucket = bucket;
    return this;
  }

  /**
   * Set the path pattern
   */
  withPath(path: string): this {
    this.config.path = path;
    return this;
  }

  /**
   * Set the credentials
   */
  withCredentials(accessKeyId: string, secretAccessKey: string): this {
    this.config.accessKeyId = accessKeyId;
    this.config.secretAccessKey = secretAccessKey;
    return this;
  }

  /**
   * Set the file format
   */
  withFormat(format: S3QueueConfig['format']): this {
    this.config.format = format;
    return this;
  }

  /**
   * Set the polling interval in milliseconds
   */
  withPollInterval(ms: number): this {
    this.config.pollIntervalMs = ms;
    return this;
  }

  /**
   * Set the maximum number of processing threads
   */
  withMaxThreads(threads: number): this {
    this.config.maxThreads = threads;
    return this;
  }

  /**
   * Set the maximum block size
   */
  withMaxBlockSize(size: number): this {
    this.config.maxBlockSize = size;
    return this;
  }

  /**
   * Set the after-processing action
   */
  withAfterProcessing(action: 'keep' | 'delete'): this {
    this.config.afterProcessing = action;
    return this;
  }

  /**
   * Enable or disable ordered processing mode
   */
  withOrderedMode(ordered: boolean): this {
    this.config.orderedMode = ordered;
    return this;
  }

  /**
   * Build the final configuration with defaults applied
   */
  build(): S3QueueConfig {
    // Apply defaults
    const config: S3QueueConfig = {
      endpoint: this.config.endpoint || '',
      bucket: this.config.bucket || '',
      path: this.config.path || '',
      accessKeyId: this.config.accessKeyId || '',
      secretAccessKey: this.config.secretAccessKey || '',
      format: this.config.format || 'Parquet',
      pollIntervalMs: this.config.pollIntervalMs ?? 1000,
      maxThreads: this.config.maxThreads ?? 4,
      maxBlockSize: this.config.maxBlockSize ?? 65536,
      afterProcessing: this.config.afterProcessing ?? 'keep',
      orderedMode: this.config.orderedMode ?? false,
    };

    // If ordered mode is enabled, limit threads to 1
    if (config.orderedMode) {
      config.maxThreads = 1;
    }

    return config;
  }

  /**
   * Validate the current configuration
   */
  validate(): S3QueueValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate endpoint
    if (this.config.endpoint) {
      try {
        const url = new URL(this.config.endpoint);
        if (url.protocol !== 'https:') {
          errors.push('HTTPS required for S3Queue endpoints');
        }
      } catch {
        errors.push('Invalid endpoint URL format');
      }
    }

    // Validate bucket name format (S3/R2 bucket naming rules)
    if (this.config.bucket) {
      const bucketRegex = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
      if (!bucketRegex.test(this.config.bucket)) {
        errors.push('Invalid bucket name format');
      }
    }

    // Validate path is specified (only if other required fields are present)
    if (this.config.endpoint && this.config.bucket && !this.config.path) {
      errors.push('Path is required');
    }

    // Validate poll interval
    if (this.config.pollIntervalMs !== undefined && this.config.pollIntervalMs < 100) {
      errors.push('Poll interval must be at least 100ms');
    }

    // Warn for very long poll intervals
    if (this.config.pollIntervalMs !== undefined && this.config.pollIntervalMs > 60000) {
      warnings.push('Poll interval is greater than 60 seconds, which may cause delays');
    }

    // Validate max threads
    if (this.config.maxThreads !== undefined) {
      if (this.config.maxThreads < 1) {
        errors.push('Max threads must be at least 1');
      }
      if (this.config.maxThreads > 64) {
        errors.push('Max threads cannot exceed 64');
      }
    }

    // Validate credentials
    if (this.config.accessKeyId === '') {
      errors.push('Access key ID is required');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

// =============================================================================
// S3Queue Table Generator
// =============================================================================

/**
 * Generator for S3Queue DDL statements
 *
 * Creates CREATE TABLE, DROP TABLE, and ALTER TABLE statements
 * for S3Queue tables in ClickHouse.
 */
export class S3QueueTableGenerator {
  /**
   * Escape a string value for SQL
   */
  private escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  /**
   * Generate CREATE TABLE statement for S3Queue
   */
  generateCreateTable(definition: S3QueueTableDefinition): string {
    const { database, table, columns, settings } = definition;

    // Build column definitions
    const columnDefs = columns
      .map((col) => `    ${col.name} ${col.type}`)
      .join(',\n');

    // Build S3Queue URL: endpoint/bucket/path
    const s3Url = `${settings.endpoint}/${settings.bucket}/${settings.path}`;

    // Escape credentials
    const escapedAccessKey = this.escapeString(settings.accessKeyId);
    const escapedSecretKey = this.escapeString(settings.secretAccessKey);

    // Build settings
    const settingsList: string[] = [];
    settingsList.push(`s3queue_polling_min_timeout_ms = ${settings.pollIntervalMs}`);
    settingsList.push(`s3queue_processing_threads_num = ${settings.maxThreads}`);

    if (settings.orderedMode) {
      settingsList.push(`mode = 'ordered'`);
    }

    settingsList.push(`after_processing = '${settings.afterProcessing}'`);

    const settingsStr = settingsList.join(',\n    ');

    const sql = `CREATE TABLE ${database}.${table}
(
${columnDefs}
)
ENGINE = S3Queue('${s3Url}', '${escapedAccessKey}', '${escapedSecretKey}', '${settings.format}')
SETTINGS
    ${settingsStr}`;

    return sql;
  }

  /**
   * Generate DROP TABLE statement
   */
  generateDropTable(database: string, table: string): string {
    return `DROP TABLE IF EXISTS ${database}.${table}`;
  }

  /**
   * Generate ALTER TABLE statement
   */
  generateAlterTable(
    database: string,
    table: string,
    alterations: Array<{ action: string; column?: string; type?: string }>
  ): string {
    const alterClauses = alterations
      .map((alt) => {
        if (alt.action === 'ADD COLUMN') {
          return `ADD COLUMN ${alt.column} ${alt.type}`;
        } else if (alt.action === 'DROP COLUMN') {
          return `DROP COLUMN ${alt.column}`;
        } else if (alt.action === 'MODIFY COLUMN') {
          return `MODIFY COLUMN ${alt.column} ${alt.type}`;
        }
        return '';
      })
      .filter((clause) => clause !== '')
      .join(', ');

    return `ALTER TABLE ${database}.${table} ${alterClauses}`;
  }
}

// =============================================================================
// S3Queue Client
// =============================================================================

/**
 * Client for managing S3Queue tables and monitoring their status
 */
export class S3QueueClient {
  private config: S3QueueConfig;
  private connected: boolean = false;

  constructor(config: S3QueueConfig) {
    this.config = config;
  }

  /**
   * Connect to ClickHouse for S3Queue management
   */
  async connect(_clickhouseEndpoint?: string, _database?: string): Promise<void> {
    // Parameters reserved for future implementation when actual ClickHouse queries are added
    this.connected = true;
  }

  /**
   * Disconnect from ClickHouse
   */
  async disconnect(): Promise<void> {
    this.connected = false;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the queue status (files pending, processed, failed)
   */
  async getQueueStatus(): Promise<S3QueueStatus> {
    // In a real implementation, this would query system.s3queue_log
    return {
      pendingFiles: 0,
      processedFiles: 0,
      failedFiles: 0,
    };
  }

  /**
   * Get processing metrics
   */
  async getProcessingMetrics(): Promise<S3QueueMetrics> {
    // In a real implementation, this would calculate from system tables
    return {
      filesPerSecond: 0,
      bytesPerSecond: 0,
      avgLatencyMs: 0,
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): S3QueueConfig {
    return this.config;
  }
}

// =============================================================================
// CDC S3Queue Configuration Factory
// =============================================================================

/**
 * Default columns for CDC events table
 */
export const CDC_QUEUE_COLUMNS: S3QueueColumn[] = [
  { name: 'op', type: "LowCardinality(String)", comment: 'Operation type: insert, update, delete' },
  { name: 'db', type: 'LowCardinality(String)', comment: 'Database name' },
  { name: 'coll', type: 'LowCardinality(String)', comment: 'Collection name' },
  { name: 'doc_id', type: 'String', comment: 'Document ID' },
  { name: 'data', type: 'JSON(max_dynamic_paths=512)', comment: 'Document data as columnar JSON' },
  { name: 'ts', type: 'DateTime64(3)', comment: 'Event timestamp' },
];

/**
 * Create a standard CDC S3Queue table definition
 */
export function createCDCQueueDefinition(
  database: string,
  table: string,
  r2Config: {
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    path?: string;
  },
  options?: {
    pollIntervalMs?: number;
    maxThreads?: number;
    orderedMode?: boolean;
  }
): S3QueueTableDefinition {
  const builder = new S3QueueConfigBuilder()
    .withEndpoint(`https://${r2Config.accountId}.r2.cloudflarestorage.com`)
    .withBucket(r2Config.bucket)
    .withPath(r2Config.path || 'cdc/*.parquet')
    .withCredentials(r2Config.accessKeyId, r2Config.secretAccessKey)
    .withFormat('Parquet')
    .withPollInterval(options?.pollIntervalMs ?? 1000)
    .withMaxThreads(options?.maxThreads ?? 8)
    .withOrderedMode(options?.orderedMode ?? true)
    .withAfterProcessing('keep');

  return {
    database,
    table,
    columns: CDC_QUEUE_COLUMNS.map((col) => ({ name: col.name, type: col.type })),
    engine: 'S3Queue',
    settings: builder.build(),
  };
}

// =============================================================================
// Exports
// =============================================================================

export {
  S3QueueConfigBuilder as ConfigBuilder,
  S3QueueTableGenerator as TableGenerator,
  S3QueueClient as Client,
};
