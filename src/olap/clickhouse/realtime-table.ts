/**
 * ClickHouse Real-time Table Definitions
 *
 * Provides destination table schemas for real-time CDC ingestion.
 * Uses ReplacingMergeTree engine with columnar JSON support for
 * efficient document storage and deduplication.
 *
 * Key features:
 * - ReplacingMergeTree for automatic deduplication by version
 * - Columnar JSON with dynamic paths for flexible schemas
 * - Partitioning by collection and date for efficient queries
 * - Soft delete support via is_deleted flag
 *
 * Issue: mondodb-50bs - ClickHouse S3Queue Integration
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Column definition for real-time tables
 */
export interface RealtimeColumn {
  /** Column name */
  name: string;
  /** ClickHouse data type */
  type: string;
  /** Default value expression */
  defaultValue?: string;
  /** Codec for compression */
  codec?: string;
  /** Column comment */
  comment?: string;
}

/**
 * Real-time table configuration
 */
export interface RealtimeTableConfig {
  /** Database name */
  database: string;
  /** Table name */
  table: string;
  /** Column definitions */
  columns: RealtimeColumn[];
  /** ReplacingMergeTree version column */
  versionColumn: string;
  /** ORDER BY columns */
  orderBy: string[];
  /** PARTITION BY expression (optional) */
  partitionBy?: string;
  /** PRIMARY KEY (defaults to orderBy if not specified) */
  primaryKey?: string[];
  /** Table TTL expression (optional) */
  ttl?: string;
  /** Additional table settings */
  settings?: Record<string, string | number | boolean>;
}

/**
 * Tombstone table configuration for tracking deletions
 */
export interface TombstoneTableConfig {
  /** Database name */
  database: string;
  /** Table name */
  table: string;
  /** TTL for tombstone records (e.g., '30 DAY') */
  ttl?: string;
}

/**
 * Document state in the real-time table
 */
export interface DocumentState {
  /** Document ID */
  _id: string;
  /** Collection name */
  collection: string;
  /** Database name */
  database: string;
  /** Document data as JSON */
  data: string;
  /** Last update timestamp */
  updated_at: Date;
  /** Version number for deduplication */
  version: bigint;
  /** Whether the document is deleted */
  is_deleted: boolean;
}

// =============================================================================
// Real-time Table Generator
// =============================================================================

/**
 * Generator for real-time destination table DDL
 */
export class RealtimeTableGenerator {
  /**
   * Escape a string for SQL
   */
  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }

  /**
   * Generate CREATE TABLE statement for real-time table
   */
  generateCreateTable(config: RealtimeTableConfig): string {
    const { database, table, columns, versionColumn, orderBy, partitionBy, primaryKey, ttl, settings } = config;

    // Build column definitions
    const columnDefs = columns
      .map((col) => {
        let def = `    ${col.name} ${col.type}`;
        if (col.defaultValue) {
          def += ` DEFAULT ${col.defaultValue}`;
        }
        if (col.codec) {
          def += ` CODEC(${col.codec})`;
        }
        if (col.comment) {
          def += ` COMMENT '${this.escapeString(col.comment)}'`;
        }
        return def;
      })
      .join(',\n');

    // Build ORDER BY clause
    const orderByClause = orderBy.join(', ');

    // Build PRIMARY KEY clause (defaults to ORDER BY if not specified)
    const primaryKeyClause = primaryKey ? primaryKey.join(', ') : orderByClause;

    // Build PARTITION BY clause
    const partitionClause = partitionBy ? `\nPARTITION BY ${partitionBy}` : '';

    // Build TTL clause
    const ttlClause = ttl ? `\nTTL ${ttl}` : '';

    // Build settings clause
    let settingsClause = '';
    if (settings && Object.keys(settings).length > 0) {
      const settingsList = Object.entries(settings)
        .map(([key, value]) => {
          if (typeof value === 'string') {
            return `${key} = '${value}'`;
          }
          return `${key} = ${value}`;
        })
        .join(', ');
      settingsClause = `\nSETTINGS ${settingsList}`;
    }

    return `CREATE TABLE ${database}.${table}
(
${columnDefs}
)
ENGINE = ReplacingMergeTree(${versionColumn})${partitionClause}
PRIMARY KEY (${primaryKeyClause})
ORDER BY (${orderByClause})${ttlClause}${settingsClause}`;
  }

  /**
   * Generate DROP TABLE statement
   */
  generateDropTable(database: string, table: string): string {
    return `DROP TABLE IF EXISTS ${database}.${table}`;
  }

  /**
   * Generate OPTIMIZE TABLE statement for forcing merge
   */
  generateOptimize(database: string, table: string, final: boolean = true): string {
    return `OPTIMIZE TABLE ${database}.${table}${final ? ' FINAL' : ''}`;
  }

  /**
   * Generate query to get latest document state (with FINAL)
   */
  generateSelectLatest(
    database: string,
    table: string,
    collection: string,
    docId?: string
  ): string {
    let sql = `SELECT * FROM ${database}.${table} FINAL WHERE collection = '${this.escapeString(collection)}'`;
    if (docId) {
      sql += ` AND doc_id = '${this.escapeString(docId)}'`;
    }
    sql += ' AND is_deleted = 0';
    return sql;
  }

  /**
   * Generate tombstone table CREATE statement
   */
  generateTombstoneTable(config: TombstoneTableConfig): string {
    const { database, table, ttl } = config;

    const ttlClause = ttl ? `\nTTL deleted_at + INTERVAL ${ttl}` : '';

    return `CREATE TABLE ${database}.${table}
(
    doc_id String,
    collection LowCardinality(String),
    database LowCardinality(String),
    deleted_at DateTime64(3),
    sequence UInt64
)
ENGINE = MergeTree()
ORDER BY (collection, database, doc_id)${ttlClause}`;
  }
}

// =============================================================================
// Standard Table Definitions
// =============================================================================

/**
 * Standard columns for the mondodb_realtime table
 */
export const REALTIME_TABLE_COLUMNS: RealtimeColumn[] = [
  {
    name: 'collection',
    type: 'LowCardinality(String)',
    comment: 'Collection name',
  },
  {
    name: 'doc_id',
    type: 'String',
    comment: 'Document ID',
  },
  {
    name: 'data',
    type: 'JSON(max_dynamic_paths=512)',
    comment: 'Document data with columnar JSON',
  },
  {
    name: 'updated_at',
    type: 'DateTime64(3)',
    comment: 'Last update timestamp',
  },
  {
    name: 'version',
    type: 'UInt64',
    defaultValue: '0',
    comment: 'Version for ReplacingMergeTree deduplication',
  },
  {
    name: 'is_deleted',
    type: 'UInt8',
    defaultValue: '0',
    comment: 'Soft delete flag (0 = active, 1 = deleted)',
  },
];

/**
 * Extended columns with type hints for common MongoDB fields
 */
export const REALTIME_TABLE_COLUMNS_EXTENDED: RealtimeColumn[] = [
  {
    name: 'collection',
    type: 'LowCardinality(String)',
    comment: 'Collection name',
  },
  {
    name: 'doc_id',
    type: 'String',
    comment: 'Document ID',
  },
  {
    name: 'data',
    type: `JSON(
      max_dynamic_paths=512,
      _id String,
      createdAt DateTime64(3),
      updatedAt DateTime64(3)
    )`,
    comment: 'Document data with type hints for common fields',
  },
  {
    name: 'updated_at',
    type: 'DateTime64(3)',
    comment: 'Last update timestamp',
  },
  {
    name: 'version',
    type: 'UInt64',
    defaultValue: '0',
    comment: 'Version for ReplacingMergeTree deduplication',
  },
  {
    name: 'is_deleted',
    type: 'UInt8',
    defaultValue: '0',
    comment: 'Soft delete flag (0 = active, 1 = deleted)',
  },
];

/**
 * Create a standard real-time table configuration
 */
export function createRealtimeTableConfig(
  database: string,
  table: string = 'mondodb_realtime',
  options?: {
    useExtendedColumns?: boolean;
    partitionByMonth?: boolean;
    ttlDays?: number;
  }
): RealtimeTableConfig {
  const columns = options?.useExtendedColumns
    ? REALTIME_TABLE_COLUMNS_EXTENDED
    : REALTIME_TABLE_COLUMNS;

  const partitionBy = options?.partitionByMonth
    ? '(collection, toYYYYMM(updated_at))'
    : undefined;

  const ttl = options?.ttlDays
    ? `updated_at + INTERVAL ${options.ttlDays} DAY`
    : undefined;

  return {
    database,
    table,
    columns,
    versionColumn: 'version',
    orderBy: ['collection', 'doc_id'],
    partitionBy,
    ttl,
  };
}

/**
 * Create a tombstone table configuration
 */
export function createTombstoneTableConfig(
  database: string,
  table: string = 'mondodb_tombstones',
  ttl: string = '30 DAY'
): TombstoneTableConfig {
  return {
    database,
    table,
    ttl,
  };
}

// =============================================================================
// Collection-Specific Table Definitions
// =============================================================================

/**
 * Create a collection-specific real-time table configuration
 *
 * This creates a dedicated table for a single collection with
 * optimized partitioning and ordering.
 */
export function createCollectionTableConfig(
  database: string,
  collection: string,
  options?: {
    additionalColumns?: RealtimeColumn[];
    partitionByMonth?: boolean;
    ttlDays?: number;
  }
): RealtimeTableConfig {
  const baseColumns: RealtimeColumn[] = [
    {
      name: 'doc_id',
      type: 'String',
      comment: 'Document ID',
    },
    {
      name: 'data',
      type: 'JSON(max_dynamic_paths=512)',
      comment: 'Document data with columnar JSON',
    },
    {
      name: 'updated_at',
      type: 'DateTime64(3)',
      comment: 'Last update timestamp',
    },
    {
      name: 'version',
      type: 'UInt64',
      defaultValue: '0',
      comment: 'Version for ReplacingMergeTree deduplication',
    },
    {
      name: 'is_deleted',
      type: 'UInt8',
      defaultValue: '0',
      comment: 'Soft delete flag',
    },
  ];

  const columns = options?.additionalColumns
    ? [...baseColumns, ...options.additionalColumns]
    : baseColumns;

  const partitionBy = options?.partitionByMonth
    ? 'toYYYYMM(updated_at)'
    : undefined;

  const ttl = options?.ttlDays
    ? `updated_at + INTERVAL ${options.ttlDays} DAY`
    : undefined;

  return {
    database,
    table: `${collection}_realtime`,
    columns,
    versionColumn: 'version',
    orderBy: ['doc_id'],
    partitionBy,
    ttl,
  };
}

// =============================================================================
// Query Builders for Real-time Tables
// =============================================================================

/**
 * Builder for queries against real-time tables
 */
export class RealtimeQueryBuilder {
  private database: string;
  private table: string;
  private selectColumns: string[] = ['*'];
  private whereConditions: string[] = [];
  private useFinal: boolean = true;
  private limitValue?: number;
  private offsetValue?: number;
  private orderByClause?: string;

  constructor(database: string, table: string) {
    this.database = database;
    this.table = table;
  }

  /**
   * Select specific columns
   */
  select(columns: string[]): this {
    this.selectColumns = columns;
    return this;
  }

  /**
   * Filter by collection
   */
  collection(name: string): this {
    this.whereConditions.push(`collection = '${name.replace(/'/g, "''")}'`);
    return this;
  }

  /**
   * Filter by document ID
   */
  docId(id: string): this {
    this.whereConditions.push(`doc_id = '${id.replace(/'/g, "''")}'`);
    return this;
  }

  /**
   * Exclude deleted documents
   */
  excludeDeleted(): this {
    this.whereConditions.push('is_deleted = 0');
    return this;
  }

  /**
   * Include only deleted documents
   */
  onlyDeleted(): this {
    this.whereConditions.push('is_deleted = 1');
    return this;
  }

  /**
   * Filter by updated_at range
   */
  updatedAfter(date: Date): this {
    this.whereConditions.push(`updated_at >= '${date.toISOString()}'`);
    return this;
  }

  /**
   * Filter by updated_at range
   */
  updatedBefore(date: Date): this {
    this.whereConditions.push(`updated_at < '${date.toISOString()}'`);
    return this;
  }

  /**
   * Add custom WHERE condition
   */
  where(condition: string): this {
    this.whereConditions.push(condition);
    return this;
  }

  /**
   * Use or skip FINAL modifier
   */
  final(use: boolean = true): this {
    this.useFinal = use;
    return this;
  }

  /**
   * Set ORDER BY clause
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByClause = `${column} ${direction}`;
    return this;
  }

  /**
   * Set LIMIT
   */
  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  /**
   * Set OFFSET
   */
  offset(value: number): this {
    this.offsetValue = value;
    return this;
  }

  /**
   * Build the final SQL query
   */
  build(): string {
    let sql = `SELECT ${this.selectColumns.join(', ')} FROM ${this.database}.${this.table}`;

    if (this.useFinal) {
      sql += ' FINAL';
    }

    if (this.whereConditions.length > 0) {
      sql += ` WHERE ${this.whereConditions.join(' AND ')}`;
    }

    if (this.orderByClause) {
      sql += ` ORDER BY ${this.orderByClause}`;
    }

    if (this.limitValue !== undefined) {
      sql += ` LIMIT ${this.limitValue}`;
    }

    if (this.offsetValue !== undefined) {
      sql += ` OFFSET ${this.offsetValue}`;
    }

    return sql;
  }
}

// =============================================================================
// Exports
// =============================================================================

export {
  RealtimeTableGenerator as TableGenerator,
  RealtimeQueryBuilder as QueryBuilder,
};
