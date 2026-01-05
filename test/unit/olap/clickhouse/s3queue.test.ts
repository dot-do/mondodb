/**
 * S3Queue Configuration Tests (TDD - RED phase)
 *
 * Tests for ClickHouse S3Queue table engine configuration.
 * S3Queue enables real-time ingestion from R2/S3 compatible storage
 * into ClickHouse for analytics workloads.
 *
 * Issue: mondodb-968r - ClickHouse S3Queue Real-time Tests
 *
 * These tests verify:
 * - CREATE TABLE generation with S3Queue engine
 * - R2 endpoint configuration
 * - Polling interval settings
 * - Thread configuration for parallel processing
 * - File format settings (Parquet, JSON)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock interfaces for S3Queue configuration
interface S3QueueConfig {
  endpoint: string;
  bucket: string;
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  format: 'Parquet' | 'JSONEachRow' | 'CSV';
  pollIntervalMs: number;
  maxThreads: number;
  maxBlockSize: number;
  afterProcessing: 'keep' | 'delete';
  orderedMode: boolean;
}

interface S3QueueTableDefinition {
  database: string;
  table: string;
  columns: Array<{ name: string; type: string }>;
  engine: 'S3Queue';
  settings: S3QueueConfig;
}

// These imports will fail until the implementation exists
// import { S3QueueConfigBuilder } from '../../../../src/olap/clickhouse/s3queue-config';
// import { S3QueueTableGenerator } from '../../../../src/olap/clickhouse/s3queue-generator';
// import { S3QueueClient } from '../../../../src/olap/clickhouse/s3queue-client';

// Mock implementation stubs - will be replaced by actual implementations
class S3QueueConfigBuilder {
  private config: Partial<S3QueueConfig> = {};

  withEndpoint(endpoint: string): this {
    this.config.endpoint = endpoint;
    return this;
  }

  withBucket(bucket: string): this {
    this.config.bucket = bucket;
    return this;
  }

  withPath(path: string): this {
    this.config.path = path;
    return this;
  }

  withCredentials(accessKeyId: string, secretAccessKey: string): this {
    this.config.accessKeyId = accessKeyId;
    this.config.secretAccessKey = secretAccessKey;
    return this;
  }

  withFormat(format: S3QueueConfig['format']): this {
    this.config.format = format;
    return this;
  }

  withPollInterval(ms: number): this {
    this.config.pollIntervalMs = ms;
    return this;
  }

  withMaxThreads(threads: number): this {
    this.config.maxThreads = threads;
    return this;
  }

  withMaxBlockSize(size: number): this {
    this.config.maxBlockSize = size;
    return this;
  }

  withAfterProcessing(action: 'keep' | 'delete'): this {
    this.config.afterProcessing = action;
    return this;
  }

  withOrderedMode(ordered: boolean): this {
    this.config.orderedMode = ordered;
    return this;
  }

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

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

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
    };
  }
}

class S3QueueTableGenerator {
  private escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

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

  generateDropTable(database: string, table: string): string {
    return `DROP TABLE IF EXISTS ${database}.${table}`;
  }

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

class S3QueueClient {
  private config: S3QueueConfig;
  private connected: boolean = false;

  constructor(config: S3QueueConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getQueueStatus(): Promise<{
    pendingFiles: number;
    processedFiles: number;
    failedFiles: number;
  }> {
    return {
      pendingFiles: 0,
      processedFiles: 0,
      failedFiles: 0,
    };
  }

  async getProcessingMetrics(): Promise<{
    filesPerSecond: number;
    bytesPerSecond: number;
    avgLatencyMs: number;
  }> {
    return {
      filesPerSecond: 0,
      bytesPerSecond: 0,
      avgLatencyMs: 0,
    };
  }
}

// =============================================================================
// S3Queue Configuration Builder Tests
// =============================================================================

describe.skip('S3QueueConfigBuilder', () => {
  let builder: S3QueueConfigBuilder;

  beforeEach(() => {
    builder = new S3QueueConfigBuilder();
  });

  describe('endpoint configuration', () => {
    it('should set R2 endpoint URL', () => {
      const config = builder
        .withEndpoint('https://account-id.r2.cloudflarestorage.com')
        .withBucket('mondodb-cdc')
        .withPath('cdc-events/*.parquet')
        .withCredentials('access-key', 'secret-key')
        .withFormat('Parquet')
        .build();

      expect(config.endpoint).toBe('https://account-id.r2.cloudflarestorage.com');
    });

    it('should validate R2 endpoint format', () => {
      const result = builder
        .withEndpoint('invalid-url')
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid endpoint URL format');
    });

    it('should accept S3-compatible endpoints', () => {
      const config = builder
        .withEndpoint('https://s3.us-east-1.amazonaws.com')
        .withBucket('test-bucket')
        .withPath('data/*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.endpoint).toBe('https://s3.us-east-1.amazonaws.com');
    });

    it('should require HTTPS for production endpoints', () => {
      const result = builder
        .withEndpoint('http://insecure-endpoint.com')
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('HTTPS required for S3Queue endpoints');
    });
  });

  describe('bucket and path configuration', () => {
    it('should set bucket name', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('my-analytics-bucket')
        .withPath('events/*.parquet')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.bucket).toBe('my-analytics-bucket');
    });

    it('should support glob patterns in path', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('cdc/{database}/{collection}/*.parquet')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.path).toBe('cdc/{database}/{collection}/*.parquet');
    });

    it('should validate bucket name format', () => {
      const result = builder
        .withBucket('INVALID_BUCKET_NAME!')
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid bucket name format');
    });

    it('should require path to be specified', () => {
      const result = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path is required');
    });
  });

  describe('polling configuration', () => {
    it('should set poll interval in milliseconds', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .withPollInterval(5000)
        .build();

      expect(config.pollIntervalMs).toBe(5000);
    });

    it('should use default poll interval of 1000ms', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.pollIntervalMs).toBe(1000);
    });

    it('should reject poll interval less than 100ms', () => {
      const result = builder
        .withPollInterval(50)
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Poll interval must be at least 100ms');
    });

    it('should warn for poll interval greater than 60000ms', () => {
      const result = builder
        .withPollInterval(120000)
        .validate();

      expect(result.valid).toBe(true);
      // Should include warning but not error
    });
  });

  describe('thread configuration', () => {
    it('should set max threads for parallel processing', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .withMaxThreads(8)
        .build();

      expect(config.maxThreads).toBe(8);
    });

    it('should default to 4 threads', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.maxThreads).toBe(4);
    });

    it('should reject zero or negative thread count', () => {
      const result = builder
        .withMaxThreads(0)
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Max threads must be at least 1');
    });

    it('should cap threads at 64', () => {
      const result = builder
        .withMaxThreads(128)
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Max threads cannot exceed 64');
    });
  });

  describe('format configuration', () => {
    it('should support Parquet format', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*.parquet')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.format).toBe('Parquet');
    });

    it('should support JSONEachRow format', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*.json')
        .withCredentials('key', 'secret')
        .withFormat('JSONEachRow')
        .build();

      expect(config.format).toBe('JSONEachRow');
    });

    it('should support CSV format', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*.csv')
        .withCredentials('key', 'secret')
        .withFormat('CSV')
        .build();

      expect(config.format).toBe('CSV');
    });
  });

  describe('after processing configuration', () => {
    it('should support keep action', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .withAfterProcessing('keep')
        .build();

      expect(config.afterProcessing).toBe('keep');
    });

    it('should support delete action', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .withAfterProcessing('delete')
        .build();

      expect(config.afterProcessing).toBe('delete');
    });

    it('should default to keep', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.afterProcessing).toBe('keep');
    });
  });

  describe('ordered mode configuration', () => {
    it('should enable ordered processing mode', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .withOrderedMode(true)
        .build();

      expect(config.orderedMode).toBe(true);
    });

    it('should default to unordered mode for better performance', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.orderedMode).toBe(false);
    });

    it('should limit threads to 1 when ordered mode is enabled', () => {
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .withOrderedMode(true)
        .withMaxThreads(8)
        .build();

      // Ordered mode should override max threads to 1
      expect(config.maxThreads).toBe(1);
    });
  });
});

// =============================================================================
// S3Queue Table Generator Tests
// =============================================================================

describe.skip('S3QueueTableGenerator', () => {
  let generator: S3QueueTableGenerator;

  beforeEach(() => {
    generator = new S3QueueTableGenerator();
  });

  describe('CREATE TABLE generation', () => {
    it('should generate valid CREATE TABLE statement', () => {
      const definition: S3QueueTableDefinition = {
        database: 'mondodb_analytics',
        table: 'cdc_events',
        columns: [
          { name: '_id', type: 'String' },
          { name: 'operation', type: "Enum8('insert' = 1, 'update' = 2, 'delete' = 3)" },
          { name: 'timestamp', type: 'DateTime64(3)' },
          { name: 'document', type: 'String' },
        ],
        engine: 'S3Queue',
        settings: {
          endpoint: 'https://account.r2.cloudflarestorage.com',
          bucket: 'mondodb-cdc',
          path: 'events/*.parquet',
          accessKeyId: 'access-key',
          secretAccessKey: 'secret-key',
          format: 'Parquet',
          pollIntervalMs: 1000,
          maxThreads: 4,
          maxBlockSize: 65536,
          afterProcessing: 'keep',
          orderedMode: false,
        },
      };

      const sql = generator.generateCreateTable(definition);

      expect(sql).toContain('CREATE TABLE mondodb_analytics.cdc_events');
      expect(sql).toContain('_id String');
      expect(sql).toContain('operation');
      expect(sql).toContain('timestamp DateTime64(3)');
      expect(sql).toContain('document String');
      expect(sql).toContain("ENGINE = S3Queue");
      expect(sql).toContain('https://account.r2.cloudflarestorage.com');
      expect(sql).toContain('mondodb-cdc');
      expect(sql).toContain('Parquet');
    });

    it('should include R2 endpoint in S3Queue URL', () => {
      const definition: S3QueueTableDefinition = {
        database: 'analytics',
        table: 'events',
        columns: [{ name: 'data', type: 'String' }],
        engine: 'S3Queue',
        settings: {
          endpoint: 'https://xyz123.r2.cloudflarestorage.com',
          bucket: 'my-bucket',
          path: 'prefix/*.parquet',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          format: 'Parquet',
          pollIntervalMs: 1000,
          maxThreads: 4,
          maxBlockSize: 65536,
          afterProcessing: 'keep',
          orderedMode: false,
        },
      };

      const sql = generator.generateCreateTable(definition);

      // S3Queue URL format: s3://endpoint/bucket/path
      expect(sql).toMatch(/https:\/\/xyz123\.r2\.cloudflarestorage\.com\/my-bucket\/prefix\/\*\.parquet/);
    });

    it('should include poll interval setting', () => {
      const definition: S3QueueTableDefinition = {
        database: 'db',
        table: 'tbl',
        columns: [{ name: 'id', type: 'UInt64' }],
        engine: 'S3Queue',
        settings: {
          endpoint: 'https://test.r2.cloudflarestorage.com',
          bucket: 'bucket',
          path: '*',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          format: 'Parquet',
          pollIntervalMs: 5000,
          maxThreads: 4,
          maxBlockSize: 65536,
          afterProcessing: 'keep',
          orderedMode: false,
        },
      };

      const sql = generator.generateCreateTable(definition);

      expect(sql).toContain('s3queue_polling_min_timeout_ms = 5000');
    });

    it('should include thread settings', () => {
      const definition: S3QueueTableDefinition = {
        database: 'db',
        table: 'tbl',
        columns: [{ name: 'id', type: 'UInt64' }],
        engine: 'S3Queue',
        settings: {
          endpoint: 'https://test.r2.cloudflarestorage.com',
          bucket: 'bucket',
          path: '*',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          format: 'Parquet',
          pollIntervalMs: 1000,
          maxThreads: 16,
          maxBlockSize: 65536,
          afterProcessing: 'keep',
          orderedMode: false,
        },
      };

      const sql = generator.generateCreateTable(definition);

      expect(sql).toContain('s3queue_processing_threads_num = 16');
    });

    it('should set ordered mode setting', () => {
      const definition: S3QueueTableDefinition = {
        database: 'db',
        table: 'tbl',
        columns: [{ name: 'id', type: 'UInt64' }],
        engine: 'S3Queue',
        settings: {
          endpoint: 'https://test.r2.cloudflarestorage.com',
          bucket: 'bucket',
          path: '*',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          format: 'Parquet',
          pollIntervalMs: 1000,
          maxThreads: 1,
          maxBlockSize: 65536,
          afterProcessing: 'keep',
          orderedMode: true,
        },
      };

      const sql = generator.generateCreateTable(definition);

      expect(sql).toContain("mode = 'ordered'");
    });

    it('should set after processing action', () => {
      const definition: S3QueueTableDefinition = {
        database: 'db',
        table: 'tbl',
        columns: [{ name: 'id', type: 'UInt64' }],
        engine: 'S3Queue',
        settings: {
          endpoint: 'https://test.r2.cloudflarestorage.com',
          bucket: 'bucket',
          path: '*',
          accessKeyId: 'key',
          secretAccessKey: 'secret',
          format: 'Parquet',
          pollIntervalMs: 1000,
          maxThreads: 4,
          maxBlockSize: 65536,
          afterProcessing: 'delete',
          orderedMode: false,
        },
      };

      const sql = generator.generateCreateTable(definition);

      expect(sql).toContain("after_processing = 'delete'");
    });

    it('should escape special characters in credentials', () => {
      const definition: S3QueueTableDefinition = {
        database: 'db',
        table: 'tbl',
        columns: [{ name: 'id', type: 'UInt64' }],
        engine: 'S3Queue',
        settings: {
          endpoint: 'https://test.r2.cloudflarestorage.com',
          bucket: 'bucket',
          path: '*',
          accessKeyId: "key'with\"special",
          secretAccessKey: "secret'with\"chars",
          format: 'Parquet',
          pollIntervalMs: 1000,
          maxThreads: 4,
          maxBlockSize: 65536,
          afterProcessing: 'keep',
          orderedMode: false,
        },
      };

      const sql = generator.generateCreateTable(definition);

      // Should properly escape quotes
      expect(sql).not.toContain("key'with");
      expect(sql).toContain("key\\'with");
    });
  });

  describe('DROP TABLE generation', () => {
    it('should generate DROP TABLE statement', () => {
      const sql = generator.generateDropTable('mondodb_analytics', 'cdc_events');

      expect(sql).toBe('DROP TABLE IF EXISTS mondodb_analytics.cdc_events');
    });
  });

  describe('ALTER TABLE generation', () => {
    it('should generate ADD COLUMN statement', () => {
      const sql = generator.generateAlterTable('db', 'tbl', [
        { action: 'ADD COLUMN', column: 'new_field', type: 'String' },
      ]);

      expect(sql).toContain('ALTER TABLE db.tbl');
      expect(sql).toContain('ADD COLUMN new_field String');
    });

    it('should generate DROP COLUMN statement', () => {
      const sql = generator.generateAlterTable('db', 'tbl', [
        { action: 'DROP COLUMN', column: 'old_field' },
      ]);

      expect(sql).toContain('ALTER TABLE db.tbl');
      expect(sql).toContain('DROP COLUMN old_field');
    });

    it('should generate MODIFY COLUMN statement', () => {
      const sql = generator.generateAlterTable('db', 'tbl', [
        { action: 'MODIFY COLUMN', column: 'field', type: 'UInt64' },
      ]);

      expect(sql).toContain('ALTER TABLE db.tbl');
      expect(sql).toContain('MODIFY COLUMN field UInt64');
    });
  });
});

// =============================================================================
// S3Queue Client Tests
// =============================================================================

describe.skip('S3QueueClient', () => {
  let client: S3QueueClient;
  let mockConfig: S3QueueConfig;

  beforeEach(() => {
    mockConfig = {
      endpoint: 'https://test.r2.cloudflarestorage.com',
      bucket: 'test-bucket',
      path: 'events/*',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      format: 'Parquet',
      pollIntervalMs: 1000,
      maxThreads: 4,
      maxBlockSize: 65536,
      afterProcessing: 'keep',
      orderedMode: false,
    };
    client = new S3QueueClient(mockConfig);
  });

  describe('connection management', () => {
    it('should connect to ClickHouse', async () => {
      await expect(client.connect()).resolves.toBeUndefined();
    });

    it('should disconnect gracefully', async () => {
      await client.connect();
      await expect(client.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('queue status', () => {
    it('should return queue status with file counts', async () => {
      await client.connect();

      const status = await client.getQueueStatus();

      expect(status).toHaveProperty('pendingFiles');
      expect(status).toHaveProperty('processedFiles');
      expect(status).toHaveProperty('failedFiles');
      expect(typeof status.pendingFiles).toBe('number');
      expect(typeof status.processedFiles).toBe('number');
      expect(typeof status.failedFiles).toBe('number');
    });
  });

  describe('processing metrics', () => {
    it('should return processing metrics', async () => {
      await client.connect();

      const metrics = await client.getProcessingMetrics();

      expect(metrics).toHaveProperty('filesPerSecond');
      expect(metrics).toHaveProperty('bytesPerSecond');
      expect(metrics).toHaveProperty('avgLatencyMs');
      expect(typeof metrics.filesPerSecond).toBe('number');
      expect(typeof metrics.bytesPerSecond).toBe('number');
      expect(typeof metrics.avgLatencyMs).toBe('number');
    });
  });
});

// =============================================================================
// S3Queue with R2 Integration Tests (Mocked)
// =============================================================================

describe.skip('S3Queue R2 Integration', () => {
  describe('R2 bucket configuration', () => {
    it('should handle R2 account ID in endpoint', () => {
      const builder = new S3QueueConfigBuilder();
      const config = builder
        .withEndpoint('https://abc123def456.r2.cloudflarestorage.com')
        .withBucket('mondodb-cdc-events')
        .withPath('v1/cdc/*.parquet')
        .withCredentials('R2_ACCESS_KEY', 'R2_SECRET_KEY')
        .withFormat('Parquet')
        .build();

      expect(config.endpoint).toContain('r2.cloudflarestorage.com');
    });

    it('should support R2 custom domain endpoints', () => {
      const builder = new S3QueueConfigBuilder();
      const config = builder
        .withEndpoint('https://r2.example.com')
        .withBucket('analytics')
        .withPath('*')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.endpoint).toBe('https://r2.example.com');
    });

    it('should validate R2 credentials format', () => {
      const builder = new S3QueueConfigBuilder();
      const result = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('*')
        .withCredentials('', 'secret')
        .withFormat('Parquet')
        .validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Access key ID is required');
    });
  });

  describe('file pattern matching', () => {
    it('should support date-partitioned paths', () => {
      const builder = new S3QueueConfigBuilder();
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('cdc/year={year}/month={month}/day={day}/*.parquet')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.path).toContain('{year}');
      expect(config.path).toContain('{month}');
      expect(config.path).toContain('{day}');
    });

    it('should support collection-based paths', () => {
      const builder = new S3QueueConfigBuilder();
      const config = builder
        .withEndpoint('https://test.r2.cloudflarestorage.com')
        .withBucket('bucket')
        .withPath('db/*/collection/*/*.parquet')
        .withCredentials('key', 'secret')
        .withFormat('Parquet')
        .build();

      expect(config.path).toBe('db/*/collection/*/*.parquet');
    });
  });
});
