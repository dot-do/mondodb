/**
 * ClickHouse Materialized Views for CDC Processing
 *
 * Provides materialized view definitions that transform CDC events
 * from S3Queue into the real-time destination tables. These views
 * handle operation routing, tombstone creation, and data transformation.
 *
 * Key features:
 * - Automatic transformation of CDC events to columnar format
 * - Routing of insert/update/delete operations
 * - Tombstone generation for delete operations
 * - Collection-based filtering and routing
 *
 * Issue: mondodb-50bs - ClickHouse S3Queue Integration
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Materialized view configuration
 */
export interface MaterializedViewConfig {
  /** View name */
  name: string;
  /** Source table (S3Queue) */
  sourceTable: string;
  /** Destination table */
  destinationTable: string;
  /** Database name */
  database: string;
  /** SELECT query for the view */
  selectQuery?: string;
  /** Collection filter (optional, for collection-specific views) */
  collectionFilter?: string;
  /** Whether to populate existing data on creation */
  populate?: boolean;
}

/**
 * CDC event structure from S3Queue
 */
export interface CDCEvent {
  /** Operation type */
  op: 'insert' | 'update' | 'delete';
  /** Database name */
  db: string;
  /** Collection name */
  coll: string;
  /** Document ID */
  doc_id: string;
  /** Document data (JSON) */
  data: Record<string, unknown>;
  /** Event timestamp */
  ts: Date;
}

/**
 * Transformed columnar document
 */
export interface ColumnarDocument {
  /** Collection name */
  collection: string;
  /** Document ID */
  doc_id: string;
  /** Document data as JSON */
  data: string;
  /** Last update timestamp */
  updated_at: Date;
  /** Version for deduplication */
  version: bigint;
  /** Soft delete flag */
  is_deleted: number;
}

/**
 * View status information
 */
export interface MaterializedViewStatus {
  /** View name */
  name: string;
  /** Row count in destination */
  rowCount: number;
  /** Last data timestamp */
  lastDataTime?: Date;
  /** Whether the view is healthy */
  isHealthy: boolean;
  /** Any errors */
  errors?: string[];
}

// =============================================================================
// Materialized View Generator
// =============================================================================

/**
 * Generator for CDC materialized view DDL statements
 */
export class MaterializedViewGenerator {
  /**
   * Escape a string for SQL
   */
  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }

  /**
   * Generate the standard CDC to columnar transformation SELECT
   */
  private generateCDCTransformSelect(
    sourceTable: string,
    collectionFilter?: string
  ): string {
    const whereClause = collectionFilter
      ? `WHERE coll = '${this.escapeString(collectionFilter)}'`
      : '';

    return `
SELECT
    coll AS collection,
    doc_id,
    data,
    ts AS updated_at,
    toUnixTimestamp64Milli(ts) AS version,
    if(op = 'delete', 1, 0) AS is_deleted
FROM ${sourceTable}
${whereClause}`.trim();
  }

  /**
   * Generate CREATE MATERIALIZED VIEW statement
   */
  generateCreateView(config: MaterializedViewConfig): string {
    const { name, sourceTable, destinationTable, database, selectQuery, collectionFilter, populate } = config;

    // Use custom select query or generate standard CDC transformation
    const select = selectQuery || this.generateCDCTransformSelect(
      `${database}.${sourceTable}`,
      collectionFilter
    );

    const populateClause = populate ? 'POPULATE' : '';

    return `CREATE MATERIALIZED VIEW ${database}.${name}
TO ${database}.${destinationTable}
${populateClause}
AS ${select}`.trim();
  }

  /**
   * Generate DROP VIEW statement
   */
  generateDropView(database: string, name: string): string {
    return `DROP VIEW IF EXISTS ${database}.${name}`;
  }

  /**
   * Generate a view that routes to tombstone table for deletes
   */
  generateTombstoneView(config: {
    name: string;
    sourceTable: string;
    tombstoneTable: string;
    database: string;
    collectionFilter?: string;
  }): string {
    const { name, sourceTable, tombstoneTable, database, collectionFilter } = config;

    const whereClause = collectionFilter
      ? `WHERE op = 'delete' AND coll = '${this.escapeString(collectionFilter)}'`
      : "WHERE op = 'delete'";

    return `CREATE MATERIALIZED VIEW ${database}.${name}
TO ${database}.${tombstoneTable}
AS
SELECT
    doc_id,
    coll AS collection,
    db AS database,
    ts AS deleted_at,
    toUnixTimestamp64Milli(ts) AS sequence
FROM ${database}.${sourceTable}
${whereClause}`;
  }

  /**
   * Generate ALTER VIEW statement (for refreshing or modifying)
   */
  generateAlterView(
    database: string,
    name: string,
    modification: { setting: string; value: string | number }
  ): string {
    const valueStr = typeof modification.value === 'string'
      ? `'${modification.value}'`
      : String(modification.value);

    return `ALTER TABLE ${database}.${name} MODIFY SETTING ${modification.setting} = ${valueStr}`;
  }

  /**
   * Generate query to check view health
   */
  generateHealthCheck(database: string, viewName: string): string {
    return `
SELECT
    count() as row_count,
    max(updated_at) as last_update,
    1 as is_healthy
FROM ${database}.${viewName}_target FINAL
WHERE is_deleted = 0`;
  }
}

// =============================================================================
// Standard View Definitions
// =============================================================================

/**
 * Create the main CDC materialized view configuration
 *
 * This view transforms all CDC events from S3Queue to the real-time table.
 */
export function createMainCDCView(
  database: string,
  sourceTable: string = 'mondodb_cdc_queue',
  destinationTable: string = 'mondodb_realtime'
): MaterializedViewConfig {
  return {
    name: 'mondodb_cdc_mv',
    sourceTable,
    destinationTable,
    database,
    populate: false,
  };
}

/**
 * Create a collection-specific CDC view configuration
 *
 * This creates a view that only processes events for a specific collection.
 */
export function createCollectionCDCView(
  database: string,
  collection: string,
  sourceTable: string = 'mondodb_cdc_queue',
  destinationTable?: string
): MaterializedViewConfig {
  return {
    name: `${collection}_cdc_mv`,
    sourceTable,
    destinationTable: destinationTable || `${collection}_realtime`,
    database,
    collectionFilter: collection,
    populate: false,
  };
}

/**
 * Create a tombstone view configuration
 *
 * This view captures delete operations and routes them to a tombstone table.
 */
export function createTombstoneView(
  database: string,
  sourceTable: string = 'mondodb_cdc_queue',
  tombstoneTable: string = 'mondodb_tombstones'
): MaterializedViewConfig {
  const generator = new MaterializedViewGenerator();

  return {
    name: 'mondodb_tombstone_mv',
    sourceTable,
    destinationTable: tombstoneTable,
    database,
    selectQuery: `
SELECT
    doc_id,
    coll AS collection,
    db AS database,
    ts AS deleted_at,
    toUnixTimestamp64Milli(ts) AS sequence
FROM ${database}.${sourceTable}
WHERE op = 'delete'`.trim(),
    populate: false,
  };
}

// =============================================================================
// CDC Pipeline Setup
// =============================================================================

/**
 * Configuration for the complete CDC pipeline
 */
export interface CDCPipelineConfig {
  /** Database name */
  database: string;
  /** S3Queue table name */
  queueTable: string;
  /** Real-time destination table name */
  realtimeTable: string;
  /** Tombstone table name */
  tombstoneTable: string;
  /** Materialized view name */
  viewName: string;
  /** Tombstone view name */
  tombstoneViewName: string;
}

/**
 * Default CDC pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: Omit<CDCPipelineConfig, 'database'> = {
  queueTable: 'mondodb_cdc_queue',
  realtimeTable: 'mondodb_realtime',
  tombstoneTable: 'mondodb_tombstones',
  viewName: 'mondodb_cdc_mv',
  tombstoneViewName: 'mondodb_tombstone_mv',
};

/**
 * Generate all DDL statements for a complete CDC pipeline
 */
export function generatePipelineDDL(config: CDCPipelineConfig): {
  createView: string;
  createTombstoneView: string;
  dropView: string;
  dropTombstoneView: string;
} {
  const generator = new MaterializedViewGenerator();

  const viewConfig = createMainCDCView(
    config.database,
    config.queueTable,
    config.realtimeTable
  );
  viewConfig.name = config.viewName;

  const tombstoneViewConfig = createTombstoneView(
    config.database,
    config.queueTable,
    config.tombstoneTable
  );
  tombstoneViewConfig.name = config.tombstoneViewName;

  return {
    createView: generator.generateCreateView(viewConfig),
    createTombstoneView: generator.generateCreateView(tombstoneViewConfig),
    dropView: generator.generateDropView(config.database, config.viewName),
    dropTombstoneView: generator.generateDropView(config.database, config.tombstoneViewName),
  };
}

// =============================================================================
// CDC Event Transformer
// =============================================================================

/**
 * Transformer for CDC events to columnar format
 *
 * This class provides programmatic transformation of CDC events
 * (for use in application code, not SQL).
 */
export class CDCEventTransformer {
  /**
   * Transform a single CDC event to columnar format
   */
  transform(event: CDCEvent): ColumnarDocument {
    return {
      collection: event.coll,
      doc_id: event.doc_id,
      data: event.op === 'delete' ? 'null' : JSON.stringify(event.data),
      updated_at: event.ts,
      version: BigInt(event.ts.getTime()),
      is_deleted: event.op === 'delete' ? 1 : 0,
    };
  }

  /**
   * Transform a batch of CDC events
   */
  transformBatch(events: CDCEvent[]): ColumnarDocument[] {
    return events.map((event) => this.transform(event));
  }

  /**
   * Create a tombstone record from a delete event
   */
  createTombstone(event: CDCEvent): {
    doc_id: string;
    collection: string;
    database: string;
    deleted_at: Date;
    sequence: bigint;
  } {
    return {
      doc_id: event.doc_id,
      collection: event.coll,
      database: event.db,
      deleted_at: event.ts,
      sequence: BigInt(event.ts.getTime()),
    };
  }

  /**
   * Check if an event is a delete operation
   */
  isDelete(event: CDCEvent): boolean {
    return event.op === 'delete';
  }

  /**
   * Check if an event is an insert operation
   */
  isInsert(event: CDCEvent): boolean {
    return event.op === 'insert';
  }

  /**
   * Check if an event is an update operation
   */
  isUpdate(event: CDCEvent): boolean {
    return event.op === 'update';
  }
}

// =============================================================================
// Event Router
// =============================================================================

/**
 * Routing rule for CDC events
 */
export interface RoutingRule {
  /** Pattern to match (db and/or coll) */
  pattern: {
    db?: string;
    coll?: string;
  };
  /** Target table name */
  targetTable: string;
}

/**
 * Router for CDC events to destination tables
 */
export class CDCEventRouter {
  private rules: RoutingRule[];
  private defaultTable: string;

  constructor(rules: RoutingRule[], defaultTable: string = 'mondodb_realtime') {
    // Sort rules by specificity (both db and coll > coll only > db only > default)
    this.rules = [...rules].sort((a, b) => {
      const aScore = (a.pattern.db ? 2 : 0) + (a.pattern.coll ? 1 : 0);
      const bScore = (b.pattern.db ? 2 : 0) + (b.pattern.coll ? 1 : 0);
      return bScore - aScore;
    });
    this.defaultTable = defaultTable;
  }

  /**
   * Route a single event to a target table
   */
  route(event: CDCEvent): string {
    for (const rule of this.rules) {
      const matchDb = !rule.pattern.db || rule.pattern.db === event.db;
      const matchColl = !rule.pattern.coll || rule.pattern.coll === event.coll;

      if (matchDb && matchColl) {
        return rule.targetTable;
      }
    }
    return this.defaultTable;
  }

  /**
   * Route a batch of events, grouping by target table
   */
  routeBatch(events: CDCEvent[]): Map<string, CDCEvent[]> {
    const result = new Map<string, CDCEvent[]>();

    for (const event of events) {
      const target = this.route(event);
      const existing = result.get(target) || [];
      existing.push(event);
      result.set(target, existing);
    }

    return result;
  }

  /**
   * Get all routing rules
   */
  getRules(): RoutingRule[] {
    return [...this.rules];
  }

  /**
   * Add a new routing rule
   */
  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    // Re-sort by specificity
    this.rules.sort((a, b) => {
      const aScore = (a.pattern.db ? 2 : 0) + (a.pattern.coll ? 1 : 0);
      const bScore = (b.pattern.db ? 2 : 0) + (b.pattern.coll ? 1 : 0);
      return bScore - aScore;
    });
  }
}

// =============================================================================
// Exports
// =============================================================================

export {
  MaterializedViewGenerator as ViewGenerator,
  CDCEventTransformer as EventTransformer,
  CDCEventRouter as EventRouter,
};
