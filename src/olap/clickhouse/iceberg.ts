/**
 * ClickHouse Iceberg Integration
 *
 * Provides connection and catalog discovery for ClickHouse with Apache Iceberg.
 * This module enables querying Iceberg tables stored in object storage
 * (S3, GCS, Azure Blob) through ClickHouse's native Iceberg support.
 *
 * Issue: mongo.do-vyf4
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Configuration for connecting to ClickHouse with Iceberg support
 */
export interface IcebergConnectionConfig {
  /** ClickHouse server hostname */
  host: string;
  /** ClickHouse server port (defaults to 8443 for HTTPS, 8123 for HTTP) */
  port?: number;
  /** Database name */
  database: string;
  /** Username for authentication */
  username?: string;
  /** Password for authentication */
  password?: string;
  /** JWT token for authentication (alternative to username/password) */
  jwtToken?: string;
  /** Use HTTPS connection */
  secure?: boolean;
  /** Iceberg catalog name */
  icebergCatalog: string;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Query timeout in milliseconds */
  queryTimeout?: number;
  /** Connection pool size */
  poolSize?: number;
  /** Maximum retry attempts for transient errors */
  maxRetries?: number;
}

/**
 * Represents an Iceberg catalog in ClickHouse
 */
export interface IcebergCatalog {
  /** Catalog name */
  name: string;
  /** Catalog type (iceberg) */
  type: string;
  /** Warehouse location (S3/GCS/Azure path) */
  warehouse: string;
  /** Metadata path */
  metadataPath?: string;
  /** Creation timestamp */
  createdAt?: Date;
}

/**
 * Represents an Iceberg table
 */
export interface IcebergTable {
  /** Table name */
  name: string;
  /** Namespace/schema */
  namespace: string;
  /** Table format */
  format: string;
  /** Storage location */
  location?: string;
  /** Partition specification */
  partitionSpec?: string;
  /** Current snapshot ID */
  currentSnapshotId?: string;
  /** Total record count */
  totalRecords?: number;
  /** Total size in bytes */
  totalSizeBytes?: number;
}

/**
 * Represents an Iceberg table schema
 */
export interface IcebergSchema {
  /** Schema columns */
  columns: IcebergColumn[];
}

/**
 * Represents a column in an Iceberg table
 */
export interface IcebergColumn {
  /** Column name */
  name: string;
  /** ClickHouse data type */
  type: string;
  /** Position in schema */
  position: number;
  /** Whether the column is nullable */
  nullable: boolean;
  /** Default value */
  default?: unknown;
  /** Column comment/description */
  comment?: string;
  /** Whether this column is part of the partition key */
  isPartitionKey?: boolean;
}

/**
 * Raw catalog row from ClickHouse
 */
interface CatalogRow {
  name: string;
  type: string;
  warehouse: string;
  metadata_path?: string;
  created_at?: string;
}

/**
 * Raw table row from ClickHouse
 */
interface TableRow {
  namespace: string;
  table_name: string;
  format: string;
  location?: string;
  partition_spec?: string;
  current_snapshot_id?: string;
  total_records?: number;
  total_size_bytes?: number;
}

/**
 * Raw column row from ClickHouse
 */
interface ColumnRow {
  name: string;
  type: string;
  position: number;
  nullable?: boolean;
  default?: unknown;
  comment?: string;
  is_partition_key?: boolean;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error for Iceberg connection issues
 */
export class IcebergConnectionError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'IcebergConnectionError';
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Validate the connection configuration
 */
function validateConfig(config: IcebergConnectionConfig): void {
  if (!config.host || config.host.trim() === '') {
    throw new IcebergConnectionError('Invalid connection configuration: host is required');
  }
  if (config.port !== undefined && config.port <= 0) {
    throw new IcebergConnectionError('Invalid connection configuration: port must be positive');
  }
  if (!config.database || config.database.trim() === '') {
    throw new IcebergConnectionError('Invalid connection configuration: database is required');
  }
  if (!config.icebergCatalog || config.icebergCatalog.trim() === '') {
    throw new IcebergConnectionError('Invalid connection configuration: icebergCatalog is required');
  }
}

/**
 * Check if an error is retryable (transient)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('connection reset') ||
      message.includes('connection closed') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('socket hang up')
    );
  }
  return false;
}

/**
 * Check if an error is SSL/TLS related
 */
function isSSLError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('ssl') ||
      message.includes('tls') ||
      message.includes('certificate')
    );
  }
  return false;
}

/**
 * Check if an error is a network error
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('fetch failed')
    );
  }
  return false;
}

/**
 * Delay for retry with exponential backoff
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a timeout promise that rejects after the specified duration
 */
function createTimeoutPromise(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

// =============================================================================
// ClickHouse Iceberg Client
// =============================================================================

/**
 * Client for interacting with ClickHouse Iceberg tables
 */
export class ClickHouseIcebergClient {
  private _closed = false;
  private _config: IcebergConnectionConfig;
  private _baseUrl: string;

  constructor(config: IcebergConnectionConfig) {
    this._config = {
      port: config.secure === false ? 8123 : 8443,
      secure: config.secure ?? true,
      connectionTimeout: config.connectionTimeout ?? 30000,
      queryTimeout: config.queryTimeout ?? 30000,
      poolSize: config.poolSize ?? 10,
      maxRetries: config.maxRetries ?? 3,
      ...config,
    };

    const protocol = this._config.secure ? 'https' : 'http';
    this._baseUrl = `${protocol}://${this._config.host}:${this._config.port}`;
  }

  /**
   * Get the configuration
   */
  getConfig(): IcebergConnectionConfig {
    return this._config;
  }

  /**
   * Get the base URL
   */
  getBaseUrl(): string {
    return this._baseUrl;
  }

  /**
   * Check if the connection is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    return !!(this._config.username || this._config.jwtToken);
  }

  /**
   * Get the connection timeout
   */
  getTimeout(): number {
    return this._config.connectionTimeout ?? 30000;
  }

  /**
   * Get the connection timeout
   */
  getConnectionTimeout(): number {
    return this._config.connectionTimeout ?? 30000;
  }

  /**
   * Get the query timeout
   */
  getQueryTimeout(): number {
    return this._config.queryTimeout ?? 30000;
  }

  /**
   * Check if the connection is closed
   */
  isClosed(): boolean {
    return this._closed;
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    this._closed = true;
  }

  /**
   * Get the connection pool size
   */
  getPoolSize(): number {
    return this._config.poolSize ?? 10;
  }

  /**
   * Build request headers based on authentication type
   */
  buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain',
    };

    if (this._config.jwtToken) {
      headers['Authorization'] = `Bearer ${this._config.jwtToken}`;
    } else if (this._config.username && this._config.password) {
      const credentials = btoa(`${this._config.username}:${this._config.password}`);
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return headers;
  }

  /**
   * Build URL parameters for requests
   */
  buildParams(): URLSearchParams {
    const params = new URLSearchParams();
    params.set('database', this._config.database);
    params.set('default_format', 'JSON');

    // Add credentials as URL params (alternative to headers)
    if (!this._config.jwtToken && this._config.username) {
      params.set('user', this._config.username);
      if (this._config.password) {
        params.set('password', this._config.password);
      }
    }

    return params;
  }

  /**
   * Execute a query against ClickHouse
   */
  async executeQuery<T>(sql: string, timeout?: number): Promise<{ data: T[] }> {
    if (this._closed) {
      throw new IcebergConnectionError('Connection is closed');
    }

    const params = this.buildParams();
    const headers = this.buildHeaders();
    const url = `${this._baseUrl}/?${params.toString()}`;
    const queryTimeout = timeout ?? this._config.queryTimeout ?? 30000;
    const maxRetries = this._config.maxRetries ?? 3;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), queryTimeout);

        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: sql,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();

            // Check for authentication failure
            if (response.status === 401) {
              throw new IcebergConnectionError('Authentication failed', 401, false);
            }

            throw new IcebergConnectionError(errorText, response.status, response.status >= 500);
          }

          const json = (await response.json()) as { data: T[] };
          return json;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      } catch (error) {
        // Handle abort errors as timeout
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new IcebergConnectionError(`Query timeout after ${queryTimeout}ms`, 0, true);
        }

        // Check for SSL errors
        if (isSSLError(error)) {
          throw new IcebergConnectionError('SSL/TLS connection error', 0, false);
        }

        // Check for network errors
        if (isNetworkError(error)) {
          throw new IcebergConnectionError('Failed to connect to ClickHouse: Network error', 0, true);
        }

        // Check if retryable
        if (isRetryableError(error) && attempt < maxRetries) {
          lastError = error instanceof Error ? error : new Error(String(error));
          await delay(100 * Math.pow(2, attempt));
          continue;
        }

        // Re-throw the error
        throw error;
      }
    }

    throw lastError || new Error('Query failed after retries');
  }
}

// =============================================================================
// Connection Functions
// =============================================================================

/**
 * Create a new Iceberg connection to ClickHouse
 */
export async function createIcebergConnection(
  config: IcebergConnectionConfig
): Promise<ClickHouseIcebergClient> {
  // Validate configuration
  validateConfig(config);

  const client = new ClickHouseIcebergClient(config);
  const timeout = config.connectionTimeout ?? 30000;
  const maxRetries = config.maxRetries ?? 3;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Test connection with timeout
      const fetchPromise = client.executeQuery<{ version: string }>('SELECT version()');
      const timeoutPromise = createTimeoutPromise(
        timeout,
        `Connection timeout after ${timeout}ms`
      );

      await Promise.race([fetchPromise, timeoutPromise]);
      return client;
    } catch (error) {
      // Handle authentication errors - don't retry
      if (error instanceof IcebergConnectionError) {
        if (error.message.includes('Authentication failed')) {
          throw error;
        }
        if (error.message.includes('SSL/TLS')) {
          throw error;
        }
        if (error.message.includes('timeout')) {
          throw error;
        }
      }

      // Check for network errors
      if (isNetworkError(error)) {
        throw new IcebergConnectionError('Failed to connect to ClickHouse: Network error', 0, true);
      }

      // Check for SSL errors
      if (isSSLError(error)) {
        throw new IcebergConnectionError('SSL/TLS connection error', 0, false);
      }

      // Check if retryable
      if (isRetryableError(error) && attempt < maxRetries) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await delay(100 * Math.pow(2, attempt));
        continue;
      }

      // Re-throw IcebergConnectionError as-is
      if (error instanceof IcebergConnectionError) {
        throw error;
      }

      // Wrap other errors
      const message = error instanceof Error ? error.message : String(error);
      throw new IcebergConnectionError(`Failed to connect to ClickHouse: ${message}`, 0, false);
    }
  }

  throw lastError || new Error('Connection failed after retries');
}

/**
 * Discover an Iceberg catalog in ClickHouse
 */
export async function discoverCatalog(
  connection: ClickHouseIcebergClient,
  catalogName: string
): Promise<IcebergCatalog> {
  if (connection.isClosed()) {
    throw new IcebergConnectionError('Connection is closed');
  }

  // Query system tables for catalog information
  // ClickHouse stores Iceberg catalog info in system.named_collections or similar
  const sql = `
    SELECT
      name,
      'iceberg' as type,
      warehouse,
      metadata_path,
      created_at
    FROM system.iceberg_catalogs
    WHERE name = '${catalogName}'
    LIMIT 1
  `;

  const result = await connection.executeQuery<CatalogRow>(sql);

  if (!result.data || result.data.length === 0) {
    throw new IcebergConnectionError(`Catalog '${catalogName}' not found`, 404, false);
  }

  const row = result.data[0];
  const catalog: IcebergCatalog = {
    name: row.name,
    type: row.type,
    warehouse: row.warehouse,
    metadataPath: row.metadata_path,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  };

  return catalog;
}

/**
 * Discover tables in an Iceberg catalog
 */
export async function discoverTables(
  connection: ClickHouseIcebergClient,
  options?: { namespace?: string }
): Promise<IcebergTable[]> {
  if (connection.isClosed()) {
    throw new IcebergConnectionError('Connection is closed');
  }

  const config = connection.getConfig();
  let sql = `
    SELECT
      namespace,
      table_name,
      format,
      location,
      partition_spec,
      current_snapshot_id,
      total_records,
      total_size_bytes
    FROM system.iceberg_tables
    WHERE catalog = '${config.icebergCatalog}'
  `;

  if (options?.namespace) {
    sql += ` AND namespace = '${options.namespace}'`;
  }

  const result = await connection.executeQuery<TableRow>(sql);

  if (!result.data) {
    return [];
  }

  return result.data.map((row) => ({
    name: row.table_name,
    namespace: row.namespace,
    format: row.format,
    location: row.location,
    partitionSpec: row.partition_spec,
    currentSnapshotId: row.current_snapshot_id,
    totalRecords: row.total_records,
    totalSizeBytes: row.total_size_bytes,
  }));
}

/**
 * Get the schema of an Iceberg table
 */
export async function getTableSchema(
  connection: ClickHouseIcebergClient,
  tableName: string
): Promise<IcebergSchema> {
  if (connection.isClosed()) {
    throw new IcebergConnectionError('Connection is closed');
  }

  const config = connection.getConfig();

  // Query DESCRIBE TABLE to get column information
  const sql = `
    SELECT
      name,
      type,
      position,
      is_in_primary_key as is_partition_key,
      default_expression as default,
      comment
    FROM system.columns
    WHERE database = '${config.database}' AND table = '${tableName}'
    ORDER BY position
  `;

  try {
    const result = await connection.executeQuery<ColumnRow>(sql);

    if (!result.data || result.data.length === 0) {
      throw new IcebergConnectionError(`Table '${tableName}' not found`, 404, false);
    }

    const columns: IcebergColumn[] = result.data.map((row) => ({
      name: row.name,
      type: row.type,
      position: row.position,
      nullable: row.type.startsWith('Nullable'),
      default: row.default,
      comment: row.comment,
      isPartitionKey: row.is_partition_key ?? false,
    }));

    return { columns };
  } catch (error) {
    // Check if it's a table not found error
    if (error instanceof IcebergConnectionError && error.code === 404) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found') || message.includes("doesn't exist")) {
      throw new IcebergConnectionError(`Table '${tableName}' not found`, 404, false);
    }

    throw error;
  }
}
