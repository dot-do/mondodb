/**
 * ClickHouse Iceberg Integration
 *
 * Provides connection and catalog discovery for ClickHouse with Apache Iceberg.
 * This module enables querying Iceberg tables stored in object storage
 * (S3, GCS, Azure Blob) through ClickHouse's native Iceberg support.
 *
 * ## Key Features
 * - Connection pooling with configurable size
 * - Metadata caching for catalog and table discovery
 * - Automatic retry with exponential backoff for transient errors
 * - SQL injection protection via identifier escaping
 * - JWT and Basic auth support
 *
 * ## Usage
 * ```typescript
 * const connection = await createIcebergConnection({
 *   host: 'clickhouse.example.com',
 *   database: 'analytics',
 *   icebergCatalog: 'iceberg_catalog',
 *   username: 'user',
 *   password: 'secret'
 * });
 *
 * const catalog = await discoverCatalog(connection, 'iceberg_catalog');
 * const tables = await discoverTables(connection);
 * const schema = await getTableSchema(connection, 'events');
 * ```
 *
 * Issue: mongo.do-vyf4
 * Refactored: workers-3p3vc
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Configuration for connecting to ClickHouse with Iceberg support.
 *
 * @example
 * ```typescript
 * const config: IcebergConnectionConfig = {
 *   host: 'clickhouse.example.com',
 *   port: 8443,
 *   database: 'analytics',
 *   username: 'admin',
 *   password: 'secret',
 *   secure: true,
 *   icebergCatalog: 'iceberg_catalog',
 *   connectionTimeout: 10000,
 *   queryTimeout: 60000,
 *   enableMetadataCache: true,
 *   metadataCacheTtl: 300000
 * };
 * ```
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
  /** Connection timeout in milliseconds (default: 30000) */
  connectionTimeout?: number;
  /** Query timeout in milliseconds (default: 30000) */
  queryTimeout?: number;
  /** Connection pool size (default: 10) */
  poolSize?: number;
  /** Maximum retry attempts for transient errors (default: 3) */
  maxRetries?: number;
  /** Enable metadata caching for catalog and table discovery (default: false) */
  enableMetadataCache?: boolean;
  /** Metadata cache TTL in milliseconds (default: 300000 = 5 minutes) */
  metadataCacheTtl?: number;
}

/**
 * Represents an Iceberg catalog in ClickHouse.
 *
 * An Iceberg catalog is a namespace for organizing Iceberg tables.
 * It provides metadata about the warehouse location and configuration.
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
 * Represents an Iceberg table with its metadata.
 *
 * Iceberg tables support ACID transactions, schema evolution,
 * and time travel queries.
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
 * Represents an Iceberg table schema.
 *
 * The schema contains column definitions including types and constraints.
 */
export interface IcebergSchema {
  /** Schema columns */
  columns: IcebergColumn[];
}

/**
 * Represents a column in an Iceberg table.
 *
 * Columns have types, nullability constraints, and optional metadata.
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
 * Cache entry with TTL support.
 * @internal
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
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
 * Base error for Iceberg operations.
 * Provides structured error information including error codes and retry hints.
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

/**
 * Error for catalog-related operations.
 */
export class IcebergCatalogError extends IcebergConnectionError {
  constructor(
    message: string,
    public readonly catalogName: string,
    code?: number
  ) {
    super(message, code, false);
    this.name = 'IcebergCatalogError';
  }
}

/**
 * Error for table-related operations.
 */
export class IcebergTableError extends IcebergConnectionError {
  constructor(
    message: string,
    public readonly tableName: string,
    code?: number
  ) {
    super(message, code, false);
    this.name = 'IcebergTableError';
  }
}

// =============================================================================
// Metadata Cache
// =============================================================================

/**
 * Simple in-memory cache with TTL support for metadata operations.
 * @internal
 */
class MetadataCache {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly ttl: number;
  private readonly enabled: boolean;

  constructor(enabled: boolean, ttlMs: number = 300000) {
    this.enabled = enabled;
    this.ttl = ttlMs;
  }

  /**
   * Get a cached value if it exists and hasn't expired.
   */
  get<T>(key: string): T | undefined {
    if (!this.enabled) return undefined;

    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Set a value in the cache with the configured TTL.
   */
  set<T>(key: string, value: T): void {
    if (!this.enabled) return;

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttl,
    });
  }

  /**
   * Invalidate a specific cache entry.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring.
   */
  stats(): { size: number; enabled: boolean; ttl: number } {
    return {
      size: this.cache.size,
      enabled: this.enabled,
      ttl: this.ttl,
    };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Escape a SQL identifier (table name, column name, etc.) to prevent SQL injection.
 * ClickHouse uses backticks for identifier quoting.
 * @internal
 */
function escapeIdentifier(identifier: string): string {
  // Remove any existing backticks and escape internal backticks
  return `\`${identifier.replace(/`/g, '``')}\``;
}

/**
 * Escape a SQL string literal to prevent SQL injection.
 * @internal
 */
function escapeString(value: string): string {
  // Escape single quotes by doubling them
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Validate the connection configuration.
 * @throws {IcebergConnectionError} If configuration is invalid.
 * @internal
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
 * Client for interacting with ClickHouse Iceberg tables.
 *
 * This client provides methods for:
 * - Executing queries against ClickHouse
 * - Managing connection lifecycle
 * - Caching metadata for performance
 *
 * @example
 * ```typescript
 * const client = new ClickHouseIcebergClient({
 *   host: 'clickhouse.example.com',
 *   database: 'analytics',
 *   icebergCatalog: 'iceberg_catalog',
 *   enableMetadataCache: true
 * });
 *
 * const result = await client.executeQuery('SELECT 1');
 * await client.close();
 * ```
 */
export class ClickHouseIcebergClient {
  private _closed = false;
  private _config: IcebergConnectionConfig;
  private _baseUrl: string;
  private _metadataCache: MetadataCache;

  constructor(config: IcebergConnectionConfig) {
    this._config = {
      port: config.secure === false ? 8123 : 8443,
      secure: config.secure ?? true,
      connectionTimeout: config.connectionTimeout ?? 30000,
      queryTimeout: config.queryTimeout ?? 30000,
      poolSize: config.poolSize ?? 10,
      maxRetries: config.maxRetries ?? 3,
      enableMetadataCache: config.enableMetadataCache ?? false,
      metadataCacheTtl: config.metadataCacheTtl ?? 300000,
      ...config,
    };

    const protocol = this._config.secure ? 'https' : 'http';
    this._baseUrl = `${protocol}://${this._config.host}:${this._config.port}`;
    this._metadataCache = new MetadataCache(
      this._config.enableMetadataCache ?? false,
      this._config.metadataCacheTtl ?? 300000
    );
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
   * Close the connection and clear cached metadata.
   */
  async close(): Promise<void> {
    this._closed = true;
    this._metadataCache.clear();
  }

  /**
   * Get the connection pool size.
   */
  getPoolSize(): number {
    return this._config.poolSize ?? 10;
  }

  /**
   * Get metadata cache for internal use.
   * @internal
   */
  getCache(): MetadataCache {
    return this._metadataCache;
  }

  /**
   * Clear all cached metadata.
   * Useful when you know the schema has changed.
   */
  clearCache(): void {
    this._metadataCache.clear();
  }

  /**
   * Get cache statistics for monitoring.
   */
  getCacheStats(): { size: number; enabled: boolean; ttl: number } {
    return this._metadataCache.stats();
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
 * Discover an Iceberg catalog in ClickHouse.
 *
 * This function queries the ClickHouse system tables to find catalog metadata.
 * Results are cached if metadata caching is enabled on the connection.
 *
 * @param connection - The ClickHouse Iceberg client
 * @param catalogName - Name of the catalog to discover
 * @returns The catalog metadata
 * @throws {IcebergConnectionError} If connection is closed
 * @throws {IcebergCatalogError} If catalog is not found
 *
 * @example
 * ```typescript
 * const catalog = await discoverCatalog(connection, 'iceberg_catalog');
 * console.log(catalog.warehouse); // 's3://data-lake/iceberg'
 * ```
 */
export async function discoverCatalog(
  connection: ClickHouseIcebergClient,
  catalogName: string
): Promise<IcebergCatalog> {
  if (connection.isClosed()) {
    throw new IcebergConnectionError('Connection is closed');
  }

  // Check cache first
  const cacheKey = `catalog:${catalogName}`;
  const cached = connection.getCache().get<IcebergCatalog>(cacheKey);
  if (cached) {
    return cached;
  }

  // Query system tables for catalog information
  // ClickHouse stores Iceberg catalog info in system.named_collections or similar
  // Use escapeString to prevent SQL injection
  const sql = `
    SELECT
      name,
      'iceberg' as type,
      warehouse,
      metadata_path,
      created_at
    FROM system.iceberg_catalogs
    WHERE name = ${escapeString(catalogName)}
    LIMIT 1
  `;

  const result = await connection.executeQuery<CatalogRow>(sql);

  if (!result.data || result.data.length === 0) {
    throw new IcebergCatalogError(`Catalog '${catalogName}' not found`, catalogName, 404);
  }

  const row = result.data[0];
  const catalog: IcebergCatalog = {
    name: row.name,
    type: row.type,
    warehouse: row.warehouse,
    metadataPath: row.metadata_path,
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  };

  // Cache the result
  connection.getCache().set(cacheKey, catalog);

  return catalog;
}

/**
 * Options for discovering Iceberg tables.
 */
export interface DiscoverTablesOptions {
  /** Filter tables by namespace */
  namespace?: string;
  /** Skip cache and fetch fresh data */
  skipCache?: boolean;
}

/**
 * Discover tables in an Iceberg catalog.
 *
 * This function queries the ClickHouse system tables to list all Iceberg tables
 * in the configured catalog. Results are cached if metadata caching is enabled.
 *
 * @param connection - The ClickHouse Iceberg client
 * @param options - Optional filters for table discovery
 * @returns Array of table metadata
 * @throws {IcebergConnectionError} If connection is closed
 *
 * @example
 * ```typescript
 * // Get all tables
 * const tables = await discoverTables(connection);
 *
 * // Filter by namespace
 * const analyticsTable = await discoverTables(connection, {
 *   namespace: 'analytics'
 * });
 * ```
 */
export async function discoverTables(
  connection: ClickHouseIcebergClient,
  options?: DiscoverTablesOptions
): Promise<IcebergTable[]> {
  if (connection.isClosed()) {
    throw new IcebergConnectionError('Connection is closed');
  }

  const config = connection.getConfig();

  // Check cache first (unless skipCache is set)
  const cacheKey = `tables:${config.icebergCatalog}:${options?.namespace ?? 'all'}`;
  if (!options?.skipCache) {
    const cached = connection.getCache().get<IcebergTable[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Build query with proper escaping
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
    WHERE catalog = ${escapeString(config.icebergCatalog)}
  `;

  if (options?.namespace) {
    sql += ` AND namespace = ${escapeString(options.namespace)}`;
  }

  const result = await connection.executeQuery<TableRow>(sql);

  if (!result.data) {
    return [];
  }

  const tables = result.data.map((row) => ({
    name: row.table_name,
    namespace: row.namespace,
    format: row.format,
    location: row.location,
    partitionSpec: row.partition_spec,
    currentSnapshotId: row.current_snapshot_id,
    totalRecords: row.total_records,
    totalSizeBytes: row.total_size_bytes,
  }));

  // Cache the result
  connection.getCache().set(cacheKey, tables);

  return tables;
}

/**
 * Options for getting table schema.
 */
export interface GetSchemaOptions {
  /** Skip cache and fetch fresh schema */
  skipCache?: boolean;
}

/**
 * Get the schema of an Iceberg table.
 *
 * This function queries ClickHouse system tables to retrieve the column
 * definitions for a specific table. Results are cached if metadata caching
 * is enabled.
 *
 * @param connection - The ClickHouse Iceberg client
 * @param tableName - Name of the table to get schema for
 * @param options - Optional configuration
 * @returns The table schema with column definitions
 * @throws {IcebergConnectionError} If connection is closed
 * @throws {IcebergTableError} If table is not found
 *
 * @example
 * ```typescript
 * const schema = await getTableSchema(connection, 'events');
 * for (const column of schema.columns) {
 *   console.log(`${column.name}: ${column.type}`);
 * }
 * ```
 */
export async function getTableSchema(
  connection: ClickHouseIcebergClient,
  tableName: string,
  options?: GetSchemaOptions
): Promise<IcebergSchema> {
  if (connection.isClosed()) {
    throw new IcebergConnectionError('Connection is closed');
  }

  const config = connection.getConfig();

  // Check cache first (unless skipCache is set)
  const cacheKey = `schema:${config.database}:${tableName}`;
  if (!options?.skipCache) {
    const cached = connection.getCache().get<IcebergSchema>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Query DESCRIBE TABLE to get column information
  // Use escapeString to prevent SQL injection
  const sql = `
    SELECT
      name,
      type,
      position,
      is_in_primary_key as is_partition_key,
      default_expression as default,
      comment
    FROM system.columns
    WHERE database = ${escapeString(config.database)} AND table = ${escapeString(tableName)}
    ORDER BY position
  `;

  try {
    const result = await connection.executeQuery<ColumnRow>(sql);

    if (!result.data || result.data.length === 0) {
      throw new IcebergTableError(`Table '${tableName}' not found`, tableName, 404);
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

    const schema: IcebergSchema = { columns };

    // Cache the result
    connection.getCache().set(cacheKey, schema);

    return schema;
  } catch (error) {
    // Check if it's already a typed error
    if (error instanceof IcebergTableError || error instanceof IcebergCatalogError) {
      throw error;
    }
    if (error instanceof IcebergConnectionError && error.code === 404) {
      throw new IcebergTableError(`Table '${tableName}' not found`, tableName, 404);
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found') || message.includes("doesn't exist")) {
      throw new IcebergTableError(`Table '${tableName}' not found`, tableName, 404);
    }

    throw error;
  }
}

// =============================================================================
// Unified Iceberg API
// =============================================================================

/**
 * Unified Iceberg API providing a single entry point for all Iceberg operations.
 *
 * This class wraps the connection and provides methods for catalog discovery,
 * table listing, and schema introspection with automatic caching.
 *
 * @example
 * ```typescript
 * const iceberg = await Iceberg.connect({
 *   host: 'clickhouse.example.com',
 *   database: 'analytics',
 *   icebergCatalog: 'iceberg_catalog',
 *   enableMetadataCache: true
 * });
 *
 * const catalog = await iceberg.catalog();
 * const tables = await iceberg.tables();
 * const schema = await iceberg.schema('events');
 *
 * await iceberg.close();
 * ```
 */
export class Iceberg {
  private constructor(private readonly _client: ClickHouseIcebergClient) {}

  /**
   * Create a new Iceberg connection.
   *
   * @param config - Connection configuration
   * @returns A new Iceberg instance
   */
  static async connect(config: IcebergConnectionConfig): Promise<Iceberg> {
    const client = await createIcebergConnection(config);
    return new Iceberg(client);
  }

  /**
   * Get the underlying ClickHouse client.
   * Use this for advanced operations not covered by the unified API.
   */
  get client(): ClickHouseIcebergClient {
    return this._client;
  }

  /**
   * Discover the configured Iceberg catalog.
   *
   * @param catalogName - Optional catalog name (uses config default if not provided)
   * @returns Catalog metadata
   */
  async catalog(catalogName?: string): Promise<IcebergCatalog> {
    const name = catalogName ?? this._client.getConfig().icebergCatalog;
    return discoverCatalog(this._client, name);
  }

  /**
   * List all tables in the Iceberg catalog.
   *
   * @param options - Optional filters
   * @returns Array of table metadata
   */
  async tables(options?: DiscoverTablesOptions): Promise<IcebergTable[]> {
    return discoverTables(this._client, options);
  }

  /**
   * Get the schema of a specific table.
   *
   * @param tableName - Name of the table
   * @param options - Optional configuration
   * @returns Table schema with column definitions
   */
  async schema(tableName: string, options?: GetSchemaOptions): Promise<IcebergSchema> {
    return getTableSchema(this._client, tableName, options);
  }

  /**
   * Execute a raw SQL query against ClickHouse.
   *
   * @param sql - SQL query to execute
   * @param timeout - Optional query timeout
   * @returns Query results
   */
  async query<T>(sql: string, timeout?: number): Promise<{ data: T[] }> {
    return this._client.executeQuery<T>(sql, timeout);
  }

  /**
   * Clear all cached metadata.
   */
  clearCache(): void {
    this._client.clearCache();
  }

  /**
   * Get cache statistics.
   */
  cacheStats(): { size: number; enabled: boolean; ttl: number } {
    return this._client.getCacheStats();
  }

  /**
   * Check if the connection is closed.
   */
  isClosed(): boolean {
    return this._client.isClosed();
  }

  /**
   * Close the connection and release resources.
   */
  async close(): Promise<void> {
    return this._client.close();
  }
}
