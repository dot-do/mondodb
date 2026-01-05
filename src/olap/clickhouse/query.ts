/**
 * ClickHouse Query Execution
 *
 * Provides query execution capabilities for ClickHouse via HTTP interface.
 * Supports analytical queries including JOINs, window functions, CTEs,
 * JSON columns, and query cancellation.
 *
 * Issue: mondodb-vyf4
 */

import { ClickHouseIcebergClient } from './iceberg';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Query execution options
 */
export interface QueryOptions {
  /** Custom query ID for tracking/cancellation */
  queryId?: string;
  /** Query timeout in milliseconds */
  timeout?: number;
  /** Maximum rows to read */
  maxRows?: number;
  /** Output format (JSONEachRow, JSON, etc.) */
  format?: string;
  /** Enable query profiling */
  profile?: boolean;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * Column metadata from query result
 */
export interface ColumnMeta {
  /** Column name */
  name: string;
  /** ClickHouse data type */
  type: string;
}

/**
 * Query statistics
 */
export interface QueryStatistics {
  /** Query execution time in seconds */
  elapsed: number;
  /** Number of rows read */
  rowsRead: number;
  /** Number of bytes read */
  bytesRead: number;
}

/**
 * Query result with metadata
 */
export interface QueryResult<T = Record<string, unknown>> {
  /** Result rows */
  rows: T[];
  /** Column metadata */
  meta: Array<{ name: string; type: string }>;
  /** Query statistics */
  statistics: QueryStatistics;
  /** Query ID */
  queryId?: string;
  /** Profile information (when profiling enabled) */
  profile?: Record<string, unknown>;
}

// Re-export QueryResult from query-executor.ts for backward compatibility
export { ClickHouseQueryExecutor } from './query-executor';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique query ID using web-compatible crypto
 */
function generateQueryId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Serialize parameter value for ClickHouse URL params
 */
function serializeParam(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => serializeParam(v)).join(',')}]`;
  }
  if (typeof value === 'string') {
    // Escape single quotes for ClickHouse
    return `'${value.replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return String(value);
}

// =============================================================================
// Query Tracking for Cancellation
// =============================================================================

/** Map of active query controllers for cancellation */
const activeQueries = new Map<string, AbortController>();

// =============================================================================
// Iceberg Query Executor (Legacy Stub)
// =============================================================================

/**
 * Legacy Executor for ClickHouse queries via Iceberg connection
 * Note: The main ClickHouseQueryExecutor is in query-executor.ts
 */
export class IcebergQueryExecutor {
  private _connection: ClickHouseIcebergClient;

  constructor(connection: ClickHouseIcebergClient) {
    this._connection = connection;
  }

  /**
   * Execute a query
   */
  async execute<T = Record<string, unknown>>(
    sql: string,
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    return executeQuery(this._connection, sql, options);
  }

  /**
   * Execute a parameterized query
   */
  async executeWithParams<T = Record<string, unknown>>(
    sql: string,
    params: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    return executeQueryWithParams(this._connection, sql, params, options);
  }

  /**
   * Cancel a running query
   */
  async cancel(queryId: string): Promise<void> {
    return cancelQuery(this._connection, queryId);
  }
}

// =============================================================================
// Query Builder
// =============================================================================

/**
 * Fluent query builder for ClickHouse
 */
export interface ClickHouseQueryBuilder {
  /** Add SELECT clause */
  select(columns: string[]): ClickHouseQueryBuilder;
  /** Add FROM clause */
  from(table: string, alias?: string): ClickHouseQueryBuilder;
  /** Add WHERE clause */
  where(condition: string, params?: unknown[]): ClickHouseQueryBuilder;
  /** Add JOIN clause */
  join(table: string, alias: string, condition: string): ClickHouseQueryBuilder;
  /** Add LEFT JOIN clause */
  leftJoin(table: string, alias: string, condition: string): ClickHouseQueryBuilder;
  /** Add GROUP BY clause */
  groupBy(columns: string | string[]): ClickHouseQueryBuilder;
  /** Add HAVING clause */
  having(condition: string): ClickHouseQueryBuilder;
  /** Add ORDER BY clause */
  orderBy(column: string, direction?: 'ASC' | 'DESC'): ClickHouseQueryBuilder;
  /** Add LIMIT clause */
  limit(count: number): ClickHouseQueryBuilder;
  /** Add OFFSET clause */
  offset(count: number): ClickHouseQueryBuilder;
  /** Add CTE (WITH clause) */
  withCTE(name: string, query: string): ClickHouseQueryBuilder;
  /** Generate SQL string */
  toSQL(): string;
  /** Execute the built query */
  execute<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
}

/**
 * Internal query builder implementation
 */
class QueryBuilderImpl implements ClickHouseQueryBuilder {
  private _connection: ClickHouseIcebergClient;
  private _ctes: Array<{ name: string; query: string }> = [];
  private _selectColumns: string[] = [];
  private _fromTable: string = '';
  private _fromAlias?: string;
  private _joins: Array<{ type: 'INNER' | 'LEFT'; table: string; alias: string; condition: string }> = [];
  private _whereConditions: string[] = [];
  private _whereParams: unknown[] = [];
  private _groupByColumns: string[] = [];
  private _havingCondition?: string;
  private _orderByClause?: { column: string; direction: 'ASC' | 'DESC' };
  private _limitValue?: number;
  private _offsetValue?: number;

  constructor(connection: ClickHouseIcebergClient) {
    this._connection = connection;
  }

  select(columns: string[]): ClickHouseQueryBuilder {
    this._selectColumns = columns;
    return this;
  }

  from(table: string, alias?: string): ClickHouseQueryBuilder {
    this._fromTable = table;
    this._fromAlias = alias;
    return this;
  }

  where(condition: string, params?: unknown[]): ClickHouseQueryBuilder {
    this._whereConditions.push(condition);
    if (params) {
      this._whereParams.push(...params);
    }
    return this;
  }

  join(table: string, alias: string, condition: string): ClickHouseQueryBuilder {
    this._joins.push({ type: 'INNER', table, alias, condition });
    return this;
  }

  leftJoin(table: string, alias: string, condition: string): ClickHouseQueryBuilder {
    this._joins.push({ type: 'LEFT', table, alias, condition });
    return this;
  }

  groupBy(columns: string | string[]): ClickHouseQueryBuilder {
    if (Array.isArray(columns)) {
      this._groupByColumns = columns;
    } else {
      this._groupByColumns = [columns];
    }
    return this;
  }

  having(condition: string): ClickHouseQueryBuilder {
    this._havingCondition = condition;
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): ClickHouseQueryBuilder {
    this._orderByClause = { column, direction };
    return this;
  }

  limit(count: number): ClickHouseQueryBuilder {
    this._limitValue = count;
    return this;
  }

  offset(count: number): ClickHouseQueryBuilder {
    this._offsetValue = count;
    return this;
  }

  withCTE(name: string, query: string): ClickHouseQueryBuilder {
    this._ctes.push({ name, query });
    return this;
  }

  toSQL(): string {
    const parts: string[] = [];

    // CTEs
    if (this._ctes.length > 0) {
      const cteStrings = this._ctes.map((cte) => `${cte.name} AS (${cte.query})`);
      parts.push(`WITH ${cteStrings.join(', ')}`);
    }

    // SELECT
    parts.push(`SELECT ${this._selectColumns.join(', ')}`);

    // FROM
    if (this._fromTable) {
      parts.push(`FROM ${this._fromTable}${this._fromAlias ? ` ${this._fromAlias}` : ''}`);
    }

    // JOINs
    for (const join of this._joins) {
      parts.push(`${join.type} JOIN ${join.table} ${join.alias} ON ${join.condition}`);
    }

    // WHERE
    if (this._whereConditions.length > 0) {
      let whereClause = this._whereConditions.join(' AND ');
      // Replace ? placeholders with actual values
      let paramIndex = 0;
      whereClause = whereClause.replace(/\?/g, () => {
        const param = this._whereParams[paramIndex++];
        return serializeParam(param);
      });
      parts.push(`WHERE ${whereClause}`);
    }

    // GROUP BY
    if (this._groupByColumns.length > 0) {
      parts.push(`GROUP BY ${this._groupByColumns.join(', ')}`);
    }

    // HAVING
    if (this._havingCondition) {
      parts.push(`HAVING ${this._havingCondition}`);
    }

    // ORDER BY
    if (this._orderByClause) {
      parts.push(`ORDER BY ${this._orderByClause.column} ${this._orderByClause.direction}`);
    }

    // LIMIT
    if (this._limitValue !== undefined) {
      parts.push(`LIMIT ${this._limitValue}`);
    }

    // OFFSET
    if (this._offsetValue !== undefined) {
      parts.push(`OFFSET ${this._offsetValue}`);
    }

    return parts.join(' ');
  }

  async execute<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    const sql = this.toSQL();
    return executeQuery<T>(this._connection, sql);
  }
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Execute a query on the ClickHouse connection
 */
export async function executeQuery<T = Record<string, unknown>>(
  connection: ClickHouseIcebergClient,
  sql: string,
  options?: QueryOptions
): Promise<QueryResult<T>> {
  const queryId = options?.queryId || generateQueryId();
  const config = connection.getConfig();
  const baseUrl = connection.getBaseUrl();

  // Build URL with parameters
  const params = new URLSearchParams();
  params.set('database', config.database);
  params.set('default_format', 'JSON');

  if (config.username) {
    params.set('user', config.username);
  }
  if (config.password) {
    params.set('password', config.password);
  }

  // Set timeout in seconds
  if (options?.timeout) {
    const timeoutSeconds = Math.floor(options.timeout / 1000);
    params.set('max_execution_time', String(timeoutSeconds));
  }

  // Set max rows
  if (options?.maxRows) {
    params.set('max_rows_to_read', String(options.maxRows));
  }

  const url = `${baseUrl}/?${params.toString()}`;

  // Prepare the query body with format
  let queryBody = sql;
  if (options?.format) {
    queryBody = `${sql} FORMAT ${options.format}`;
  }

  // Create abort controller for cancellation
  const controller = new AbortController();
  activeQueries.set(queryId, controller);

  // Chain with user-provided signal
  if (options?.signal) {
    options.signal.addEventListener('abort', () => {
      controller.abort();
    });
  }

  try {
    // Create timeout promise if needed
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = options?.timeout
      ? new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error('Query timeout'));
          }, options.timeout);
        })
      : null;

    // Create abort promise that rejects when controller is aborted
    // This ensures cancellation works even if fetch doesn't respect the signal
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error('Query cancelled'));
      });
    });

    // Execute fetch
    const fetchPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-ClickHouse-Query-Id': queryId,
      },
      body: queryBody,
      signal: controller.signal,
    });

    // Race fetch against abort and timeout
    const racingPromises: Promise<Response | never>[] = [fetchPromise, abortPromise];
    if (timeoutPromise) {
      racingPromises.push(timeoutPromise);
    }

    const response = await Promise.race(racingPromises);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.exception || errorText;
      } catch {
        // Use raw text
      }

      throw new Error(errorMessage);
    }

    const json = (await response.json()) as {
      data: T[];
      meta: Array<{ name: string; type: string }>;
      statistics: { elapsed: number; rows_read: number; bytes_read: number };
    };

    const result: QueryResult<T> = {
      rows: json.data || [],
      meta: json.meta || [],
      statistics: {
        elapsed: json.statistics?.elapsed || 0,
        rowsRead: json.statistics?.rows_read || 0,
        bytesRead: json.statistics?.bytes_read || 0,
      },
      queryId,
    };

    // Add profile if requested
    if (options?.profile) {
      result.profile = {
        elapsed: json.statistics?.elapsed || 0,
        rowsRead: json.statistics?.rows_read || 0,
        bytesRead: json.statistics?.bytes_read || 0,
      };
    }

    return result;
  } catch (error) {
    // Handle abort errors - could be cancellation or timeout
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Query cancelled');
    }

    throw error;
  } finally {
    activeQueries.delete(queryId);
  }
}

/**
 * Execute a parameterized query
 */
export async function executeQueryWithParams<T = Record<string, unknown>>(
  connection: ClickHouseIcebergClient,
  sql: string,
  params: Record<string, unknown>,
  options?: QueryOptions
): Promise<QueryResult<T>> {
  const queryId = options?.queryId || generateQueryId();
  const config = connection.getConfig();
  const baseUrl = connection.getBaseUrl();

  // Build URL with parameters
  const urlParams = new URLSearchParams();
  urlParams.set('database', config.database);
  urlParams.set('default_format', 'JSON');

  if (config.username) {
    urlParams.set('user', config.username);
  }
  if (config.password) {
    urlParams.set('password', config.password);
  }

  // Set timeout in seconds
  if (options?.timeout) {
    const timeoutSeconds = Math.floor(options.timeout / 1000);
    urlParams.set('max_execution_time', String(timeoutSeconds));
  }

  // Set max rows
  if (options?.maxRows) {
    urlParams.set('max_rows_to_read', String(options.maxRows));
  }

  // Add query parameters
  for (const [key, value] of Object.entries(params)) {
    urlParams.set(`param_${key}`, serializeParam(value));
  }

  const url = `${baseUrl}/?${urlParams.toString()}`;

  // Prepare the query body with format
  let queryBody = sql;
  if (options?.format) {
    queryBody = `${sql} FORMAT ${options.format}`;
  }

  // Create abort controller for cancellation
  const controller = new AbortController();
  activeQueries.set(queryId, controller);

  // Chain with user-provided signal
  if (options?.signal) {
    options.signal.addEventListener('abort', () => {
      controller.abort();
    });
  }

  try {
    // Create timeout promise if needed
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = options?.timeout
      ? new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error('Query timeout'));
          }, options.timeout);
        })
      : null;

    // Create abort promise that rejects when controller is aborted
    // This ensures cancellation works even if fetch doesn't respect the signal
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error('Query cancelled'));
      });
    });

    // Execute fetch
    const fetchPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-ClickHouse-Query-Id': queryId,
      },
      body: queryBody,
      signal: controller.signal,
    });

    // Race fetch against abort and timeout
    const racingPromises: Promise<Response | never>[] = [fetchPromise, abortPromise];
    if (timeoutPromise) {
      racingPromises.push(timeoutPromise);
    }

    const response = await Promise.race(racingPromises);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.exception || errorText;
      } catch {
        // Use raw text
      }

      throw new Error(errorMessage);
    }

    const json = (await response.json()) as {
      data: T[];
      meta: Array<{ name: string; type: string }>;
      statistics: { elapsed: number; rows_read: number; bytes_read: number };
    };

    const result: QueryResult<T> = {
      rows: json.data || [],
      meta: json.meta || [],
      statistics: {
        elapsed: json.statistics?.elapsed || 0,
        rowsRead: json.statistics?.rows_read || 0,
        bytesRead: json.statistics?.bytes_read || 0,
      },
      queryId,
    };

    // Add profile if requested
    if (options?.profile) {
      result.profile = {
        elapsed: json.statistics?.elapsed || 0,
        rowsRead: json.statistics?.rows_read || 0,
        bytesRead: json.statistics?.bytes_read || 0,
      };
    }

    return result;
  } catch (error) {
    // Handle abort errors - could be cancellation or timeout
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Query cancelled');
    }

    throw error;
  } finally {
    activeQueries.delete(queryId);
  }
}

/**
 * Cancel a running query
 */
export async function cancelQuery(
  connection: ClickHouseIcebergClient,
  queryId: string
): Promise<void> {
  const config = connection.getConfig();
  const baseUrl = connection.getBaseUrl();

  // First, abort any local controller
  const controller = activeQueries.get(queryId);
  if (controller) {
    controller.abort();
    activeQueries.delete(queryId);
  }

  // Build URL for KILL QUERY
  const params = new URLSearchParams();
  params.set('database', config.database);

  if (config.username) {
    params.set('user', config.username);
  }
  if (config.password) {
    params.set('password', config.password);
  }

  const url = `${baseUrl}/?${params.toString()}`;

  // Send KILL QUERY command
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: `KILL QUERY WHERE query_id = '${queryId}'`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('not found') || response.status === 404) {
      throw new Error('Query not found');
    }
    throw new Error(errorText);
  }
}

/**
 * Create a query builder instance
 */
export function createQueryBuilder(
  connection: ClickHouseIcebergClient
): ClickHouseQueryBuilder {
  return new QueryBuilderImpl(connection);
}
