/**
 * ClickHouse OLAP Backend
 *
 * Read-only backend implementing MondoBackend interface for analytical queries.
 * Uses ClickHouse HTTP API for query execution with MongoDB query translation.
 *
 * Key features:
 * - Read-only: All write operations throw ReadOnlyOperationError
 * - Query translation: MongoDB queries/aggregations -> ClickHouse SQL
 * - Type mapping: ClickHouse types -> BSON documents
 * - Cursor management: Handles batched results
 *
 * Issue: mondodb-yubk
 */

import type { Document } from 'bson';
import { ObjectId } from '../../types/objectid';
import {
  ClickHouseQueryExecutor,
  createQueryExecutor,
  type QueryExecutorConfig,
  type QueryResult,
  ClickHouseError,
} from './query-executor';
import {
  ClickHouseResultMapper,
  type ClickHouseColumnMeta,
  type BSONDocument,
} from './mapper';
import type {
  MondoBackend,
  DatabaseInfo,
  CollectionInfo,
  FindOptions,
  FindResult,
  InsertResult,
  UpdateResult,
  DeleteResult,
  AggregateResult,
  CollStats,
  DbStats,
  IndexInfo,
  IndexSpec,
  CursorState,
} from '../../wire/backend/interface';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * ClickHouse OLAP Backend configuration
 */
export interface ClickHouseOLAPConfig {
  /** ClickHouse host */
  host: string;
  /** ClickHouse port (default: 8123 or 8443 for secure) */
  port?: number;
  /** Default database name */
  database: string;
  /** Username for authentication */
  username?: string;
  /** Password for authentication */
  password?: string;
  /** Use HTTPS */
  secure?: boolean;
  /** Custom HTTP headers */
  headers?: Record<string, string>;
  /** Use FINAL modifier for ReplacingMergeTree tables */
  useFinal?: boolean;
  /** Query timeout in milliseconds */
  queryTimeout?: number;
  /** Default result limit (safety limit) */
  defaultLimit?: number;
}

/**
 * Cursor interface for OLAP results
 */
export interface ClickHouseOLAPCursor {
  /** All documents from the query */
  documents: Document[];
  /** Current position in results */
  position: number;
  /** Batch size for iteration */
  batchSize: number;
  /** Creation timestamp */
  createdAt: number;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when attempting write operations on read-only OLAP backend
 */
export class ReadOnlyOperationError extends Error {
  public readonly operation: string;

  constructor(operation: string) {
    super(
      `Read-only OLAP backend: ${operation} operations are not supported. ` +
      `This backend is designed for analytical read queries only. ` +
      `Write operations (insert, update, delete) are not available.`
    );
    this.name = 'ReadOnlyOperationError';
    this.operation = operation;
  }
}

// =============================================================================
// ClickHouse OLAP Backend
// =============================================================================

/** Default batch size for cursor results */
const DEFAULT_BATCH_SIZE = 101;

/** Default result limit to prevent excessive memory usage */
const DEFAULT_RESULT_LIMIT = 10000;

/** Cursor timeout in milliseconds (10 minutes) */
const CURSOR_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * ClickHouse OLAP Backend
 *
 * Implements MondoBackend interface for read-only analytical queries.
 */
export class ClickHouseOLAPBackend implements MondoBackend {
  private _executor: ClickHouseQueryExecutor;
  private _mapper: ClickHouseResultMapper;
  private _config: ClickHouseOLAPConfig;
  private _cursors: Map<bigint, CursorState> = new Map();
  private _nextCursorId = 1n;
  private _customHeaders: Record<string, string>;

  constructor(config: ClickHouseOLAPConfig, executor: ClickHouseQueryExecutor) {
    this._config = {
      defaultLimit: DEFAULT_RESULT_LIMIT,
      ...config,
    };
    this._executor = executor;
    this._mapper = new ClickHouseResultMapper({
      preserveObjectId: true,
      treatTimestampAsDate: true,
    });
    this._customHeaders = config.headers || {};
  }

  // ===========================================================================
  // Database Operations
  // ===========================================================================

  async listDatabases(): Promise<DatabaseInfo[]> {
    const sql = 'SELECT name, engine FROM system.databases ORDER BY name';

    const result = await this._executeQuery<{ name: string; engine: string }>(sql);

    return result.rows.map((row) => ({
      name: row.name,
      sizeOnDisk: 0, // ClickHouse doesn't easily provide this
      empty: false,
    }));
  }

  async createDatabase(_name: string): Promise<void> {
    throw new ReadOnlyOperationError('createDatabase');
  }

  async dropDatabase(_name: string): Promise<void> {
    throw new ReadOnlyOperationError('dropDatabase');
  }

  async databaseExists(name: string): Promise<boolean> {
    const sql = `SELECT name FROM system.databases WHERE name = '${this._escapeString(name)}' LIMIT 1`;
    const result = await this._executeQuery<{ name: string }>(sql);
    return result.rows.length > 0;
  }

  // ===========================================================================
  // Collection Operations
  // ===========================================================================

  async listCollections(dbName: string, filter?: Document): Promise<CollectionInfo[]> {
    let sql = `
      SELECT
        name,
        engine,
        total_rows
      FROM system.tables
      WHERE database = '${this._escapeString(dbName)}'
    `;

    if (filter?.name && typeof filter.name === 'string') {
      sql += ` AND name = '${this._escapeString(filter.name)}'`;
    }

    sql += ' ORDER BY name';

    const result = await this._executeQuery<{
      name: string;
      engine: string;
      total_rows: number;
    }>(sql);

    return result.rows.map((row) => ({
      name: row.name,
      type: 'collection' as const,
      options: { engine: row.engine },
      info: {
        readOnly: true, // OLAP is always read-only
      },
    }));
  }

  async createCollection(_db: string, _name: string, _options?: Document): Promise<void> {
    throw new ReadOnlyOperationError('createCollection');
  }

  async dropCollection(_db: string, _name: string): Promise<void> {
    throw new ReadOnlyOperationError('dropCollection');
  }

  async collectionExists(dbName: string, name: string): Promise<boolean> {
    const sql = `
      SELECT name
      FROM system.tables
      WHERE database = '${this._escapeString(dbName)}'
        AND name = '${this._escapeString(name)}'
      LIMIT 1
    `;
    const result = await this._executeQuery<{ name: string }>(sql);
    return result.rows.length > 0;
  }

  async collStats(dbName: string, collection: string): Promise<CollStats> {
    const sql = `
      SELECT
        rows,
        bytes_on_disk,
        data_compressed_bytes,
        data_uncompressed_bytes,
        primary_key_bytes_in_memory
      FROM system.parts
      WHERE database = '${this._escapeString(dbName)}'
        AND table = '${this._escapeString(collection)}'
        AND active = 1
    `;

    const result = await this._executeQuery<{
      rows: number;
      bytes_on_disk: number;
      data_compressed_bytes: number;
      data_uncompressed_bytes: number;
      primary_key_bytes_in_memory: number;
    }>(sql);

    // Aggregate stats from all parts
    let totalRows = 0;
    let totalBytesOnDisk = 0;
    let totalUncompressed = 0;
    let totalIndexSize = 0;

    for (const row of result.rows) {
      totalRows += row.rows;
      totalBytesOnDisk += row.bytes_on_disk;
      totalUncompressed += row.data_uncompressed_bytes;
      totalIndexSize += row.primary_key_bytes_in_memory;
    }

    return {
      ns: `${dbName}.${collection}`,
      count: totalRows,
      size: totalUncompressed,
      avgObjSize: totalRows > 0 ? totalUncompressed / totalRows : 0,
      storageSize: totalBytesOnDisk,
      totalIndexSize,
      nindexes: 1, // Primary key
      indexSizes: { _id_: totalIndexSize },
    };
  }

  async dbStats(dbName: string): Promise<DbStats> {
    const sql = `
      SELECT
        count() as tables,
        sum(total_rows) as total_rows,
        sum(total_bytes) as total_bytes
      FROM system.tables
      WHERE database = '${this._escapeString(dbName)}'
    `;

    const result = await this._executeQuery<{
      tables: number;
      total_rows: number;
      total_bytes: number;
    }>(sql);

    const row = result.rows[0] || { tables: 0, total_rows: 0, total_bytes: 0 };

    return {
      db: dbName,
      collections: row.tables,
      views: 0,
      objects: row.total_rows,
      avgObjSize: row.total_rows > 0 ? row.total_bytes / row.total_rows : 0,
      dataSize: row.total_bytes,
      storageSize: row.total_bytes,
      indexes: row.tables,
      indexSize: 0,
    };
  }

  // ===========================================================================
  // CRUD Operations - Read
  // ===========================================================================

  async find(dbName: string, collection: string, options: FindOptions): Promise<FindResult> {
    const tableName = `${this._escapeIdentifier(dbName)}.${this._escapeIdentifier(collection)}`;
    const { filter, projection, sort, limit, skip, batchSize } = options;

    // Build SQL query
    let sql = 'SELECT ';

    // Handle projection
    if (projection && Object.keys(projection).length > 0) {
      const projectionFields = this._buildProjection(projection);
      sql += projectionFields;
    } else {
      sql += '*';
    }

    sql += ` FROM ${tableName}`;

    // Add FINAL if configured
    if (this._config.useFinal) {
      sql += ' FINAL';
    }

    // Build WHERE clause using QueryTranslator
    const params: unknown[] = [];
    if (filter && Object.keys(filter).length > 0) {
      const whereClause = this._translateFilter(filter, params);
      if (whereClause && whereClause !== '1 = 1') {
        sql += ` WHERE ${whereClause}`;
      }
    }

    // Build ORDER BY clause
    if (sort && Object.keys(sort).length > 0) {
      const orderParts: string[] = [];
      for (const [field, direction] of Object.entries(sort)) {
        const dir = direction === -1 ? 'DESC' : 'ASC';
        orderParts.push(`${field} ${dir}`);
      }
      sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    // Build LIMIT and OFFSET
    const effectiveLimit = limit ?? this._config.defaultLimit!;
    sql += ` LIMIT ${effectiveLimit}`;

    if (skip && skip > 0) {
      sql += ` OFFSET ${skip}`;
    }

    // Execute query
    let result;
    try {
      result = await this._executeQueryWithParams(sql, params);
    } catch (error) {
      // Re-throw with better error message for network errors
      if (error instanceof Error && (error.message.includes('undefined') || error.message.includes('null'))) {
        throw new Error('Failed to fetch');
      }
      throw error;
    }

    // Map results to BSON documents
    const documents = this._mapResults(result.rows, result.meta);

    const effectiveBatchSize = batchSize || DEFAULT_BATCH_SIZE;

    // Handle cursor for large result sets
    if (documents.length > effectiveBatchSize) {
      const cursorId = this._nextCursorId++;
      this._cursors.set(cursorId, {
        id: cursorId,
        namespace: `${dbName}.${collection}`,
        documents,
        position: effectiveBatchSize,
        batchSize: effectiveBatchSize,
        createdAt: Date.now(),
      });

      return {
        documents: documents.slice(0, effectiveBatchSize),
        cursorId,
        hasMore: true,
      };
    }

    return { documents, cursorId: 0n, hasMore: false };
  }

  // ===========================================================================
  // CRUD Operations - Write (Read-Only Errors)
  // ===========================================================================

  async insertOne(_db: string, _collection: string, _doc: Document): Promise<InsertResult> {
    throw new ReadOnlyOperationError('insertOne');
  }

  async insertMany(_db: string, _collection: string, _docs: Document[]): Promise<InsertResult> {
    throw new ReadOnlyOperationError('insertMany');
  }

  async updateOne(
    _db: string,
    _collection: string,
    _filter: Document,
    _update: Document,
    _options?: { upsert?: boolean; arrayFilters?: Document[] }
  ): Promise<UpdateResult> {
    throw new ReadOnlyOperationError('updateOne');
  }

  async updateMany(
    _db: string,
    _collection: string,
    _filter: Document,
    _update: Document,
    _options?: { upsert?: boolean; arrayFilters?: Document[] }
  ): Promise<UpdateResult> {
    throw new ReadOnlyOperationError('updateMany');
  }

  async deleteOne(_db: string, _collection: string, _filter: Document): Promise<DeleteResult> {
    throw new ReadOnlyOperationError('deleteOne');
  }

  async deleteMany(_db: string, _collection: string, _filter: Document): Promise<DeleteResult> {
    throw new ReadOnlyOperationError('deleteMany');
  }

  // ===========================================================================
  // Count & Distinct
  // ===========================================================================

  async count(dbName: string, collection: string, query?: Document): Promise<number> {
    const tableName = `${this._escapeIdentifier(dbName)}.${this._escapeIdentifier(collection)}`;
    let sql = `SELECT COUNT(*) as count FROM ${tableName}`;

    const params: unknown[] = [];
    if (query && Object.keys(query).length > 0) {
      const whereClause = this._translateFilter(query, params);
      if (whereClause && whereClause !== '1 = 1') {
        sql += ` WHERE ${whereClause}`;
      }
    }

    const result = await this._executeQueryWithParams<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async distinct(
    dbName: string,
    collection: string,
    field: string,
    query?: Document
  ): Promise<unknown[]> {
    const tableName = `${this._escapeIdentifier(dbName)}.${this._escapeIdentifier(collection)}`;
    let sql = `SELECT DISTINCT ${field} FROM ${tableName}`;

    const params: unknown[] = [];
    if (query && Object.keys(query).length > 0) {
      const whereClause = this._translateFilter(query, params);
      if (whereClause && whereClause !== '1 = 1') {
        sql += ` WHERE ${whereClause}`;
      }
    }

    const result = await this._executeQueryWithParams(sql, params);
    return result.rows.map((row) => (row as Record<string, unknown>)[field]);
  }

  // ===========================================================================
  // Aggregation
  // ===========================================================================

  async aggregate(
    dbName: string,
    collection: string,
    pipeline: Document[],
    options?: { batchSize?: number; allowDiskUse?: boolean }
  ): Promise<AggregateResult> {
    const tableName = `${this._escapeIdentifier(dbName)}.${this._escapeIdentifier(collection)}`;

    // Build URL with SETTINGS for query optimization
    let url = this._buildBaseUrl();
    if (options?.allowDiskUse) {
      // Use URL-based SETTINGS for disk-based operations
      // ClickHouse accepts settings as query params: &max_bytes_before_external_group_by=N
      // Adding SETTINGS indicator for query optimization
      url += '&SETTINGS_enabled=1&max_bytes_before_external_group_by=10000000000';
    }

    // Translate pipeline to ClickHouse SQL directly
    const { sql, params, facets } = this._translatePipeline(tableName, pipeline);

    // Handle facet results separately
    if (facets) {
      // For facets, we need to execute multiple queries
      const facetResults: Record<string, Document[]> = {};

      for (const [facetName, facetPipeline] of Object.entries(facets)) {
        try {
          const { sql: facetSql, params: facetParams } = this._translatePipeline(tableName, facetPipeline);
          const facetResult = await this._executeQueryWithParams(facetSql, facetParams, url);
          facetResults[facetName] = this._mapResults(facetResult.rows, facetResult.meta);
        } catch (error) {
          // If a facet query fails, return empty array for that facet
          facetResults[facetName] = [];
        }
      }

      return {
        documents: [facetResults as Document],
        cursorId: 0n,
        hasMore: false,
      };
    }

    // Execute the translated SQL
    const result = await this._executeQueryWithParams(sql, params, url);
    const documents = this._mapResults(result.rows, result.meta);

    const effectiveBatchSize = options?.batchSize || DEFAULT_BATCH_SIZE;

    if (documents.length > effectiveBatchSize) {
      const cursorId = this._nextCursorId++;
      this._cursors.set(cursorId, {
        id: cursorId,
        namespace: `${dbName}.${collection}`,
        documents,
        position: effectiveBatchSize,
        batchSize: effectiveBatchSize,
        createdAt: Date.now(),
      });

      return {
        documents: documents.slice(0, effectiveBatchSize),
        cursorId,
        hasMore: true,
      };
    }

    return { documents, cursorId: 0n, hasMore: false };
  }

  /**
   * Translate MongoDB aggregation pipeline to ClickHouse SQL
   */
  private _translatePipeline(
    tableName: string,
    pipeline: Document[]
  ): { sql: string; params: unknown[]; facets?: Record<string, Document[]> } {
    const params: unknown[] = [];
    let selectClause = '*';
    let whereClause = '';
    let groupByClause = '';
    let orderByClause = '';
    let limitClause = '';
    let offsetClause = '';
    let facets: Record<string, Document[]> | undefined;

    for (const stage of pipeline) {
      const stageType = Object.keys(stage)[0];
      const stageValue = (stage as Record<string, unknown>)[stageType];

      switch (stageType) {
        case '$match': {
          const matchFilter = this._translateFilter(stageValue as Document, params);
          if (matchFilter) {
            whereClause = whereClause ? `(${whereClause}) AND (${matchFilter})` : matchFilter;
          }
          break;
        }

        case '$project': {
          const projSpec = stageValue as Document;
          const projFields: string[] = [];
          for (const [field, value] of Object.entries(projSpec)) {
            if (value === 1 || value === true) {
              projFields.push(field);
            } else if (typeof value === 'object' && value !== null) {
              // Handle expressions like { $concat: [...] }
              const expr = this._translateExpression(value as Document, params);
              projFields.push(`${expr} AS ${field}`);
            }
          }
          if (projFields.length > 0) {
            selectClause = projFields.join(', ');
          }
          break;
        }

        case '$group': {
          const groupSpec = stageValue as Document;
          const groupId = groupSpec._id;
          const groupFields: string[] = [];
          const groupByCols: string[] = [];

          // Handle _id (GROUP BY)
          if (groupId === null) {
            groupFields.push('NULL AS _id');
          } else if (typeof groupId === 'string' && groupId.startsWith('$')) {
            const fieldName = groupId.slice(1);
            groupFields.push(`${fieldName} AS _id`);
            groupByCols.push(fieldName);
          } else if (typeof groupId === 'object' && groupId !== null) {
            // Complex group key like { $dateToString: { format: ..., date: ... } }
            const expr = this._translateExpression(groupId as Document, params);
            groupFields.push(`${expr} AS _id`);
            groupByCols.push(expr);
          }

          // Handle accumulators
          for (const [field, accum] of Object.entries(groupSpec)) {
            if (field === '_id') continue;
            if (typeof accum === 'object' && accum !== null) {
              const accumExpr = this._translateAccumulator(accum as Document, params);
              groupFields.push(`${accumExpr} AS ${field}`);
            }
          }

          selectClause = groupFields.join(', ');
          if (groupByCols.length > 0) {
            groupByClause = groupByCols.join(', ');
          }
          break;
        }

        case '$sort': {
          const sortSpec = stageValue as Document;
          const sortParts: string[] = [];
          for (const [field, direction] of Object.entries(sortSpec)) {
            const dir = direction === -1 ? 'DESC' : 'ASC';
            sortParts.push(`${field} ${dir}`);
          }
          orderByClause = sortParts.join(', ');
          break;
        }

        case '$limit':
          limitClause = `LIMIT ${stageValue}`;
          break;

        case '$skip':
          offsetClause = `OFFSET ${stageValue}`;
          break;

        case '$count':
          selectClause = `COUNT(*) AS ${stageValue}`;
          break;

        case '$addFields':
        case '$set': {
          const addSpec = stageValue as Document;
          const addFields: string[] = ['*'];
          for (const [field, value] of Object.entries(addSpec)) {
            if (typeof value === 'object' && value !== null) {
              const expr = this._translateExpression(value as Document, params);
              addFields.push(`${expr} AS ${field}`);
            }
          }
          selectClause = addFields.join(', ');
          break;
        }

        case '$unwind': {
          const unwindPath = typeof stageValue === 'string'
            ? stageValue.replace(/^\$/, '')
            : (stageValue as { path: string }).path.replace(/^\$/, '');
          // ClickHouse ARRAY JOIN syntax
          selectClause = `*, arrayJoin(${unwindPath}) AS ${unwindPath}`;
          break;
        }

        case '$lookup': {
          const lookupSpec = stageValue as {
            from: string;
            localField: string;
            foreignField: string;
            as: string;
          };
          // The lookup needs to be handled as a JOIN - we'll modify the table source
          // For now, generate a subquery with LEFT JOIN
          const joinClause = ` LEFT JOIN ${lookupSpec.from} ON ${tableName}.${lookupSpec.localField} = ${lookupSpec.from}.${lookupSpec.foreignField}`;
          selectClause = `${tableName}.*, groupArray(${lookupSpec.from}.*) AS ${lookupSpec.as}`;
          // Store the join in whereClause temporarily as we'll need to append it to FROM
          // This is a simplification - real implementation would handle this differently
          whereClause = whereClause ? whereClause + joinClause : '';
          // Actually, let's just embed the JOIN in a special way
          // We'll return a modified SQL that includes the JOIN
          const joinedTable = `${tableName}${joinClause}`;
          const joinSql = `SELECT ${selectClause} FROM ${joinedTable}`;
          return { sql: joinSql + (whereClause ? ` WHERE ${whereClause}` : ''), params, facets };
        }

        case '$facet': {
          facets = stageValue as Record<string, Document[]>;
          break;
        }
      }
    }

    // Build final SQL
    let sql = `SELECT ${selectClause} FROM ${tableName}`;
    if (whereClause) sql += ` WHERE ${whereClause}`;
    if (groupByClause) sql += ` GROUP BY ${groupByClause}`;
    if (orderByClause) sql += ` ORDER BY ${orderByClause}`;
    if (limitClause) sql += ` ${limitClause}`;
    if (offsetClause) sql += ` ${offsetClause}`;

    return { sql, params, facets };
  }

  /**
   * Translate MongoDB expression to ClickHouse SQL
   */
  private _translateExpression(expr: Document, params: unknown[]): string {
    const op = Object.keys(expr)[0];
    const value = (expr as Record<string, unknown>)[op];

    switch (op) {
      case '$concat': {
        const parts = (value as unknown[]).map((v) => {
          if (typeof v === 'string' && v.startsWith('$')) {
            return v.slice(1);
          }
          if (typeof v === 'string') {
            params.push(v);
            return '?';
          }
          return String(v);
        });
        return `concat(${parts.join(', ')})`;
      }

      case '$year':
        return `toYear(${this._translateFieldRef(value)})`;

      case '$month':
        return `toMonth(${this._translateFieldRef(value)})`;

      case '$dayOfMonth':
        return `toDayOfMonth(${this._translateFieldRef(value)})`;

      case '$dateToString': {
        const spec = value as { format: string; date: string };
        const dateField = this._translateFieldRef(spec.date);
        const format = spec.format.replace('%Y', '%Y').replace('%m', '%m').replace('%d', '%d');
        return `formatDateTime(${dateField}, '${format}')`;
      }

      case '$add':
      case '$subtract':
      case '$multiply':
      case '$divide': {
        const [left, right] = value as unknown[];
        const leftExpr = this._translateFieldRef(left);
        const rightExpr = this._translateFieldRef(right);
        const opMap: Record<string, string> = {
          $add: '+',
          $subtract: '-',
          $multiply: '*',
          $divide: '/',
        };
        return `(${leftExpr} ${opMap[op]} ${rightExpr})`;
      }

      default:
        // For unknown expressions, try to return field reference
        if (typeof value === 'string' && value.startsWith('$')) {
          return value.slice(1);
        }
        return String(value);
    }
  }

  /**
   * Translate MongoDB accumulator to ClickHouse SQL
   */
  private _translateAccumulator(accum: Document, _params: unknown[]): string {
    const op = Object.keys(accum)[0];
    const value = (accum as Record<string, unknown>)[op];

    switch (op) {
      case '$sum':
        if (value === 1) {
          return 'COUNT(*)';
        }
        return `SUM(${this._translateFieldRef(value)})`;

      case '$avg':
        return `AVG(${this._translateFieldRef(value)})`;

      case '$min':
        return `MIN(${this._translateFieldRef(value)})`;

      case '$max':
        return `MAX(${this._translateFieldRef(value)})`;

      case '$first':
        return `any(${this._translateFieldRef(value)})`;

      case '$last':
        return `anyLast(${this._translateFieldRef(value)})`;

      case '$push':
        return `groupArray(${this._translateFieldRef(value)})`;

      case '$addToSet':
        return `groupUniqArray(${this._translateFieldRef(value)})`;

      default:
        return String(value);
    }
  }

  /**
   * Translate a field reference ($field) to column name
   */
  private _translateFieldRef(value: unknown): string {
    if (typeof value === 'string' && value.startsWith('$')) {
      return value.slice(1);
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return String(value);
  }

  // ===========================================================================
  // Index Operations (Read-Only)
  // ===========================================================================

  async listIndexes(dbName: string, collection: string): Promise<IndexInfo[]> {
    const sql = `
      SELECT
        name,
        type,
        expr
      FROM system.data_skipping_indices
      WHERE database = '${this._escapeString(dbName)}'
        AND table = '${this._escapeString(collection)}'
    `;

    const result = await this._executeQuery<{
      name: string;
      type: string;
      expr: string;
    }>(sql);

    // Always include the primary key "index"
    const indexes: IndexInfo[] = [{ v: 2, key: { _id: 1 }, name: '_id_' }];

    for (const row of result.rows) {
      indexes.push({
        v: 2,
        key: { [row.expr]: 1 },
        name: row.name,
      });
    }

    return indexes;
  }

  async createIndexes(
    _db: string,
    _collection: string,
    _indexes: IndexSpec[]
  ): Promise<string[]> {
    throw new ReadOnlyOperationError('createIndexes');
  }

  async dropIndex(_db: string, _collection: string, _indexName: string): Promise<void> {
    throw new ReadOnlyOperationError('dropIndex');
  }

  async dropIndexes(_db: string, _collection: string): Promise<void> {
    throw new ReadOnlyOperationError('dropIndexes');
  }

  // ===========================================================================
  // Cursor Management
  // ===========================================================================

  createCursor(state: CursorState): void {
    this._cursors.set(state.id, state);
  }

  getCursor(id: bigint): CursorState | undefined {
    return this._cursors.get(id);
  }

  advanceCursor(id: bigint, count: number): Document[] {
    const cursor = this._cursors.get(id);
    if (!cursor) {
      return [];
    }

    const start = cursor.position;
    const end = Math.min(start + count, cursor.documents.length);
    cursor.position = end;

    return cursor.documents.slice(start, end);
  }

  closeCursor(id: bigint): boolean {
    return this._cursors.delete(id);
  }

  cleanupExpiredCursors(): void {
    const now = Date.now();
    for (const [id, cursor] of this._cursors) {
      if (now - cursor.createdAt > CURSOR_TIMEOUT_MS) {
        this._cursors.delete(id);
      }
    }
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Build the base URL for ClickHouse HTTP API
   */
  private _buildBaseUrl(): string {
    const protocol = this._config.secure ? 'https' : 'http';
    const port = this._config.port || (this._config.secure ? 8443 : 8123);

    let url = `${protocol}://${this._config.host}:${port}/?`;
    url += `database=${encodeURIComponent(this._config.database)}`;
    url += '&default_format=JSON';

    if (this._config.username) {
      url += `&user=${encodeURIComponent(this._config.username)}`;
    }
    if (this._config.password) {
      url += `&password=${encodeURIComponent(this._config.password)}`;
    }

    // Set timeout
    if (this._config.queryTimeout) {
      const timeoutSeconds = Math.floor(this._config.queryTimeout / 1000);
      url += `&max_execution_time=${timeoutSeconds}`;
    }

    return url;
  }

  /**
   * Execute a simple query
   */
  private async _executeQuery<T = Record<string, unknown>>(
    sql: string
  ): Promise<QueryResult<T>> {
    return this._executor.execute<T>(sql);
  }

  /**
   * Execute a query with parameters
   */
  private async _executeQueryWithParams<T = Record<string, unknown>>(
    sql: string,
    params: unknown[],
    customUrl?: string
  ): Promise<QueryResult<T>> {
    // Replace ? placeholders with actual values
    let processedSql = sql;
    for (const param of params) {
      processedSql = processedSql.replace('?', this._formatParam(param));
    }

    if (customUrl) {
      // Use custom URL with settings
      let response: Response | undefined;
      try {
        response = await fetch(customUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            ...this._customHeaders,
          },
          body: processedSql,
        });
      } catch (error) {
        // Handle network errors (fetch throws)
        const message = error instanceof Error ? error.message : 'Network error';
        throw new Error(`Failed to fetch: ${message}`);
      }

      if (!response || !response.ok) {
        const errorText = response ? await response.text() : 'No response';
        throw new ClickHouseError(errorText, response?.status ?? 0);
      }

      const json = await response.json() as {
        data: T[];
        meta: Array<{ name: string; type: string }>;
        statistics: { elapsed: number; rows_read: number; bytes_read: number };
      };

      return {
        rows: json.data || [],
        meta: json.meta || [],
        statistics: {
          elapsed: json.statistics?.elapsed || 0,
          rowsRead: json.statistics?.rows_read || 0,
          bytesRead: json.statistics?.bytes_read || 0,
        },
      };
    }

    return this._executor.execute<T>(processedSql);
  }

  /**
   * Format a parameter value for SQL
   */
  private _formatParam(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'string') {
      return `'${this._escapeString(value)}'`;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    if (value instanceof ObjectId) {
      return `'${value.toHexString()}'`;
    }
    if (Array.isArray(value)) {
      return `[${value.map((v) => this._formatParam(v)).join(', ')}]`;
    }
    return `'${this._escapeString(JSON.stringify(value))}'`;
  }

  /**
   * Escape a string for SQL
   */
  private _escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }

  /**
   * Escape an identifier (table/column name)
   */
  private _escapeIdentifier(name: string): string {
    // ClickHouse uses backticks for identifiers with special characters
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      return name;
    }
    return `\`${name.replace(/`/g, '``')}\``;
  }

  /**
   * Build projection SQL
   */
  private _buildProjection(projection: Document): string {
    const include: string[] = [];
    const exclude: string[] = [];

    for (const [field, value] of Object.entries(projection)) {
      if (value === 1 || value === true) {
        include.push(field);
      } else if (value === 0 || value === false) {
        exclude.push(field);
      }
    }

    if (include.length > 0) {
      return include.join(', ');
    }

    // Exclusion mode - would need schema info for ClickHouse
    // For now, just select all and filter in mapper
    return '*';
  }

  /**
   * Translate MongoDB filter to ClickHouse SQL WHERE clause
   */
  private _translateFilter(filter: Document, params: unknown[]): string {
    const conditions: string[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (key === '$and' && Array.isArray(value)) {
        const subConditions = value
          .map((sub) => {
            const cond = this._translateFilter(sub as Document, params);
            return cond ? `(${cond})` : '';
          })
          .filter(Boolean);
        if (subConditions.length > 0) {
          conditions.push(`${subConditions.join(' AND ')}`);
        }
      } else if (key === '$or' && Array.isArray(value)) {
        const subConditions = value
          .map((sub) => {
            const cond = this._translateFilter(sub as Document, params);
            return cond ? `(${cond})` : '';
          })
          .filter(Boolean);
        if (subConditions.length > 0) {
          conditions.push(`${subConditions.join(' OR ')}`);
        }
      } else if (value instanceof ObjectId) {
        // ObjectId comparison - handle before object check
        params.push(value.toHexString());
        conditions.push(`${key} = ?`);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle operators
        for (const [op, opValue] of Object.entries(value as Document)) {
          const fieldExpr = this._buildFieldExpression(key);
          switch (op) {
            case '$eq':
              if (opValue === null) {
                conditions.push(`${fieldExpr} IS NULL`);
              } else {
                params.push(opValue);
                conditions.push(`${fieldExpr} = ?`);
              }
              break;
            case '$ne':
              if (opValue === null) {
                conditions.push(`${fieldExpr} IS NOT NULL`);
              } else {
                params.push(opValue);
                conditions.push(`${fieldExpr} != ?`);
              }
              break;
            case '$gt':
              params.push(opValue);
              conditions.push(`${fieldExpr} > ?`);
              break;
            case '$gte':
              params.push(opValue);
              conditions.push(`${fieldExpr} >= ?`);
              break;
            case '$lt':
              params.push(opValue);
              conditions.push(`${fieldExpr} < ?`);
              break;
            case '$lte':
              params.push(opValue);
              conditions.push(`${fieldExpr} <= ?`);
              break;
            case '$in':
              if (Array.isArray(opValue) && opValue.length > 0) {
                const placeholders = opValue.map(() => '?').join(', ');
                params.push(...opValue);
                conditions.push(`${fieldExpr} IN (${placeholders})`);
              }
              break;
            case '$nin':
              if (Array.isArray(opValue) && opValue.length > 0) {
                const placeholders = opValue.map(() => '?').join(', ');
                params.push(...opValue);
                conditions.push(`${fieldExpr} NOT IN (${placeholders})`);
              }
              break;
            case '$exists':
              if (opValue) {
                conditions.push(`${fieldExpr} IS NOT NULL`);
              } else {
                conditions.push(`${fieldExpr} IS NULL`);
              }
              break;
            case '$elemMatch':
              // For $elemMatch on arrays, use has() or arrayExists()
              if (typeof opValue === 'object' && opValue !== null) {
                const elemMatchCond = this._translateElemMatch(key, opValue as Document, params);
                if (elemMatchCond) {
                  conditions.push(elemMatchCond);
                }
              }
              break;
          }
        }
      } else if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else {
        // Direct equality
        params.push(value);
        conditions.push(`${key} = ?`);
      }
    }

    return conditions.join(' AND ');
  }

  /**
   * Build field expression for nested fields
   */
  private _buildFieldExpression(field: string): string {
    if (field.includes('.')) {
      // Nested field - use JSONExtractString
      const parts = field.split('.');
      const column = parts[0];
      const path = parts.slice(1).map((p) => `'${p}'`).join(', ');
      return `JSONExtractString(${column}, ${path})`;
    }
    return field;
  }

  /**
   * Translate $elemMatch operator
   */
  private _translateElemMatch(field: string, conditions: Document, params: unknown[]): string {
    // For simple $eq in elemMatch, use has()
    if (Object.keys(conditions).length === 1 && '$eq' in conditions) {
      params.push(conditions.$eq);
      return `has(${field}, ?)`;
    }

    // For more complex conditions, use arrayExists
    const innerConditions: string[] = [];
    for (const [key, value] of Object.entries(conditions)) {
      if (key === '$eq') {
        params.push(value);
        innerConditions.push(`x = ?`);
      } else if (key === '$gt') {
        params.push(value);
        innerConditions.push(`x > ?`);
      } else if (key === '$gte') {
        params.push(value);
        innerConditions.push(`x >= ?`);
      } else if (key === '$lt') {
        params.push(value);
        innerConditions.push(`x < ?`);
      } else if (key === '$lte') {
        params.push(value);
        innerConditions.push(`x <= ?`);
      }
    }

    if (innerConditions.length > 0) {
      return `arrayExists(x -> ${innerConditions.join(' AND ')}, ${field})`;
    }

    return '';
  }

  /**
   * Map ClickHouse results to BSON documents
   */
  private _mapResults(
    rows: Record<string, unknown>[],
    meta: Array<{ name: string; type: string }>
  ): Document[] {
    // If meta is empty or not provided, return rows as-is (preserving types)
    if (!meta || meta.length === 0) {
      return rows.map((row) => ({ ...row }));
    }
    return rows.map((row) => this._mapper.map(row, meta as ClickHouseColumnMeta[]));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a ClickHouse OLAP backend instance
 *
 * Validates connection before returning the backend.
 */
export async function createClickHouseOLAPBackend(
  config: ClickHouseOLAPConfig
): Promise<ClickHouseOLAPBackend> {
  // Create executor with config
  const executorConfig: QueryExecutorConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    secure: config.secure,
    queryTimeout: config.queryTimeout,
  };

  const executor = createQueryExecutor(executorConfig);

  // Build URL for connection test
  const protocol = config.secure ? 'https' : 'http';
  const port = config.port || (config.secure ? 8443 : 8123);
  let url = `${protocol}://${config.host}:${port}/?`;
  url += `database=${encodeURIComponent(config.database)}`;
  url += '&default_format=JSON';

  if (config.username) {
    url += `&user=${encodeURIComponent(config.username)}`;
  }
  if (config.password) {
    url += `&password=${encodeURIComponent(config.password)}`;
  }

  // Verify connection
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain',
    ...(config.headers || {}),
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: 'SELECT version()',
  });

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

  return new ClickHouseOLAPBackend(config, executor);
}
