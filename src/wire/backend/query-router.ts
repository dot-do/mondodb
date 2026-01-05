/**
 * Query Router for OLTP/OLAP Backend Selection
 *
 * Analyzes queries and routes them to the optimal backend:
 * - SQLite (OLTP): Simple lookups, writes, small result sets
 * - ClickHouse (OLAP): Heavy aggregations, large scans, analytics
 *
 * Issue: mongo.do-aioe
 */

import type { Document } from 'bson';
import type {
  MondoBackend,
  FindOptions,
  FindResult,
  AggregateResult,
  InsertResult,
  UpdateResult,
  DeleteResult,
  DatabaseInfo,
  CollectionInfo,
  CollStats,
  DbStats,
  IndexInfo,
  IndexSpec,
  CursorState,
} from './interface.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Backend selection mode
 */
export type BackendMode = 'sqlite' | 'clickhouse' | 'auto';

/**
 * Extended find options with backend selection
 */
export interface RouterFindOptions extends FindOptions {
  /** Explicit backend selection - overrides auto-routing */
  backend?: BackendMode;
}

/**
 * Extended aggregate options with backend selection
 */
export interface RouterAggregateOptions {
  batchSize?: number;
  allowDiskUse?: boolean;
  /** Explicit backend selection - overrides auto-routing */
  backend?: BackendMode;
}

/**
 * Query characteristics for routing decisions
 */
export interface QueryCharacteristics {
  /** Pipeline contains heavy aggregation stages ($group, $bucket, $facet) */
  hasHeavyAggregation: boolean;
  /** Estimated number of rows to process */
  estimatedRows: number;
  /** Query includes time-range filters on timestamp fields */
  isTimeRangeQuery: boolean;
  /** Query requires real-time/fresh data */
  requiresRealtime: boolean;
  /** Pipeline stages that suggest OLAP routing */
  olapStages: string[];
  /** Has simple _id lookup */
  hasIdLookup: boolean;
}

/**
 * Routing configuration thresholds
 */
export interface RoutingConfig {
  /** Estimated row threshold for OLAP routing (default: 10000) */
  rowThreshold: number;
  /** Fields considered as CDC timestamp fields */
  cdcTimestampFields: string[];
  /** Enable automatic routing (default: true) */
  autoRouting: boolean;
  /** Prefer OLAP for aggregations even with small data (default: false) */
  preferOlapForAggregations: boolean;
}

/**
 * Query router configuration
 */
export interface QueryRouterConfig {
  /** OLTP backend (SQLite) - required */
  oltp: MondoBackend;
  /** OLAP backend (ClickHouse) - optional */
  olap?: MondoBackend;
  /** Routing configuration */
  routing?: Partial<RoutingConfig>;
}

/**
 * Result of routing decision
 */
export interface RoutingDecision {
  /** Selected backend */
  backend: 'oltp' | 'olap';
  /** Reason for the decision */
  reason: string;
  /** Query characteristics that led to decision */
  characteristics: QueryCharacteristics;
}

// =============================================================================
// Constants
// =============================================================================

/** Default routing configuration */
const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  rowThreshold: 10000,
  cdcTimestampFields: ['_cdc_timestamp', 'created_at', 'updated_at', 'timestamp'],
  autoRouting: true,
  preferOlapForAggregations: false,
};

/** Aggregation stages that suggest OLAP is more efficient */
const HEAVY_AGGREGATION_STAGES = [
  '$group',
  '$bucket',
  '$bucketAuto',
  '$facet',
  '$graphLookup',
  '$sortByCount',
  '$densify',
  '$fill',
];

/**
 * Stages that are lightweight and suitable for OLTP.
 * Used by the query analyzer to determine routing decisions.
 */
const LIGHTWEIGHT_STAGES: readonly string[] = [
  '$match',
  '$project',
  '$limit',
  '$skip',
  '$sort',
  '$count',
];

// Export for testing
export { LIGHTWEIGHT_STAGES };

// =============================================================================
// Query Analysis Functions
// =============================================================================

/**
 * Analyze a MongoDB filter to determine query characteristics
 */
function analyzeFilter(filter: Document | undefined): Partial<QueryCharacteristics> {
  if (!filter || Object.keys(filter).length === 0) {
    return {
      hasIdLookup: false,
      isTimeRangeQuery: false,
    };
  }

  const characteristics: Partial<QueryCharacteristics> = {
    hasIdLookup: false,
    isTimeRangeQuery: false,
  };

  // Check for _id lookup
  if ('_id' in filter) {
    const idValue = filter._id;
    // Direct _id lookup or $eq on _id
    if (typeof idValue !== 'object' || (idValue && '$eq' in idValue)) {
      characteristics.hasIdLookup = true;
    }
    // $in with small set of IDs
    if (idValue && typeof idValue === 'object' && '$in' in idValue) {
      const inArray = idValue.$in as unknown[];
      if (Array.isArray(inArray) && inArray.length <= 100) {
        characteristics.hasIdLookup = true;
      }
    }
  }

  // Check for time-range queries on common timestamp fields
  const timeFields = DEFAULT_ROUTING_CONFIG.cdcTimestampFields;
  for (const field of Object.keys(filter)) {
    if (timeFields.includes(field)) {
      const value = filter[field];
      if (typeof value === 'object' && value !== null) {
        // Check for range operators
        const hasRangeOp = ['$gt', '$gte', '$lt', '$lte'].some((op) => op in value);
        if (hasRangeOp) {
          characteristics.isTimeRangeQuery = true;
          break;
        }
      }
    }
  }

  return characteristics;
}

/**
 * Analyze an aggregation pipeline for routing decisions
 */
export function analyzeQuery(pipeline: Document[]): QueryCharacteristics {
  const characteristics: QueryCharacteristics = {
    hasHeavyAggregation: false,
    estimatedRows: 0,
    isTimeRangeQuery: false,
    requiresRealtime: false,
    olapStages: [],
    hasIdLookup: false,
  };

  let hasLimit = false;
  let limitValue = Infinity;
  let hasMatch = false;

  for (const stage of pipeline) {
    const stageType = Object.keys(stage)[0];
    if (!stageType) continue;
    const stageValue = stage[stageType];

    // Check for heavy aggregation stages
    if (HEAVY_AGGREGATION_STAGES.includes(stageType)) {
      characteristics.hasHeavyAggregation = true;
      characteristics.olapStages.push(stageType);
    }

    // Analyze specific stages
    switch (stageType) {
      case '$match': {
        hasMatch = true;
        const matchAnalysis = analyzeFilter(stageValue as Document);
        if (matchAnalysis.hasIdLookup) {
          characteristics.hasIdLookup = true;
        }
        if (matchAnalysis.isTimeRangeQuery) {
          characteristics.isTimeRangeQuery = true;
        }
        break;
      }

      case '$limit': {
        hasLimit = true;
        const limit = stageValue as number;
        if (limit < limitValue) {
          limitValue = limit;
        }
        break;
      }

      case '$sample': {
        // Sample suggests large dataset
        const size = (stageValue as { size: number }).size;
        if (size > 1000) {
          characteristics.olapStages.push('$sample');
        }
        break;
      }

      case '$lookup':
      case '$graphLookup': {
        // Joins can be expensive
        characteristics.olapStages.push(stageType);
        break;
      }
    }
  }

  // Estimate row count based on pipeline structure
  if (characteristics.hasIdLookup && hasMatch) {
    // _id lookup typically returns 1 or few documents
    characteristics.estimatedRows = 1;
  } else if (hasLimit) {
    characteristics.estimatedRows = limitValue;
  } else if (hasMatch) {
    // Unknown, assume medium size
    characteristics.estimatedRows = 1000;
  } else {
    // Full collection scan likely
    characteristics.estimatedRows = DEFAULT_ROUTING_CONFIG.rowThreshold + 1;
  }

  return characteristics;
}

/**
 * Analyze a find query for routing decisions
 */
export function analyzeFindQuery(options: FindOptions): QueryCharacteristics {
  const filterAnalysis = analyzeFilter(options.filter);

  const characteristics: QueryCharacteristics = {
    hasHeavyAggregation: false,
    estimatedRows: 0,
    isTimeRangeQuery: filterAnalysis.isTimeRangeQuery ?? false,
    requiresRealtime: false,
    olapStages: [],
    hasIdLookup: filterAnalysis.hasIdLookup ?? false,
  };

  // Estimate row count
  if (characteristics.hasIdLookup) {
    characteristics.estimatedRows = 1;
  } else if (options.limit) {
    characteristics.estimatedRows = options.limit;
  } else if (options.filter && Object.keys(options.filter).length > 0) {
    // Has filter but no limit - medium estimate
    characteristics.estimatedRows = 1000;
  } else {
    // No filter, no limit - full scan
    characteristics.estimatedRows = DEFAULT_ROUTING_CONFIG.rowThreshold + 1;
  }

  return characteristics;
}

// =============================================================================
// QueryRouter Class
// =============================================================================

/**
 * Smart query router that analyzes queries and routes to optimal backend.
 *
 * Routing Strategy:
 * 1. Explicit backend selection overrides auto-routing
 * 2. Write operations always go to OLTP (SQLite)
 * 3. Heavy aggregations prefer OLAP (ClickHouse)
 * 4. Simple _id lookups prefer OLTP
 * 5. Large result sets prefer OLAP
 * 6. Time-range queries on CDC fields prefer OLAP
 *
 * @example
 * ```typescript
 * const router = new QueryRouter({
 *   oltp: sqliteBackend,
 *   olap: clickhouseBackend,
 *   routing: { rowThreshold: 5000 }
 * });
 *
 * // Auto-routing
 * await router.find('db', 'users', { filter: { _id: '123' } });
 *
 * // Explicit backend
 * await router.aggregate('db', 'events', pipeline, { backend: 'clickhouse' });
 * ```
 */
export class QueryRouter implements MondoBackend {
  private _oltp: MondoBackend;
  private _olap: MondoBackend | undefined;
  private _config: RoutingConfig;

  constructor(config: QueryRouterConfig) {
    this._oltp = config.oltp;
    this._olap = config.olap;
    this._config = {
      ...DEFAULT_ROUTING_CONFIG,
      ...config.routing,
    };
  }

  // ===========================================================================
  // Routing Logic
  // ===========================================================================

  /**
   * Determine which backend to use for a find query
   */
  routeFind(options: RouterFindOptions): RoutingDecision {
    // Explicit backend selection
    if (options.backend && options.backend !== 'auto') {
      const backend = options.backend === 'clickhouse' ? 'olap' : 'oltp';
      return {
        backend: this._olap && backend === 'olap' ? 'olap' : 'oltp',
        reason: `Explicit backend selection: ${options.backend}`,
        characteristics: analyzeFindQuery(options),
      };
    }

    // No OLAP available - always use OLTP
    if (!this._olap) {
      return {
        backend: 'oltp',
        reason: 'OLAP backend not available',
        characteristics: analyzeFindQuery(options),
      };
    }

    // Auto-routing disabled
    if (!this._config.autoRouting) {
      return {
        backend: 'oltp',
        reason: 'Auto-routing disabled',
        characteristics: analyzeFindQuery(options),
      };
    }

    const characteristics = analyzeFindQuery(options);

    // Simple _id lookup - use OLTP
    if (characteristics.hasIdLookup) {
      return {
        backend: 'oltp',
        reason: 'Simple _id lookup',
        characteristics,
      };
    }

    // Time-range query on CDC fields - use OLAP
    if (characteristics.isTimeRangeQuery) {
      return {
        backend: 'olap',
        reason: 'Time-range query on timestamp field',
        characteristics,
      };
    }

    // Large result set expected - use OLAP
    if (characteristics.estimatedRows > this._config.rowThreshold) {
      return {
        backend: 'olap',
        reason: `Estimated rows (${characteristics.estimatedRows}) exceeds threshold (${this._config.rowThreshold})`,
        characteristics,
      };
    }

    // Default to OLTP for small queries
    return {
      backend: 'oltp',
      reason: 'Small query - default to OLTP',
      characteristics,
    };
  }

  /**
   * Determine which backend to use for an aggregate query
   */
  routeAggregate(pipeline: Document[], options?: RouterAggregateOptions): RoutingDecision {
    // Explicit backend selection
    if (options?.backend && options.backend !== 'auto') {
      const backend = options.backend === 'clickhouse' ? 'olap' : 'oltp';
      return {
        backend: this._olap && backend === 'olap' ? 'olap' : 'oltp',
        reason: `Explicit backend selection: ${options.backend}`,
        characteristics: analyzeQuery(pipeline),
      };
    }

    // No OLAP available - always use OLTP
    if (!this._olap) {
      return {
        backend: 'oltp',
        reason: 'OLAP backend not available',
        characteristics: analyzeQuery(pipeline),
      };
    }

    // Auto-routing disabled
    if (!this._config.autoRouting) {
      return {
        backend: 'oltp',
        reason: 'Auto-routing disabled',
        characteristics: analyzeQuery(pipeline),
      };
    }

    const characteristics = analyzeQuery(pipeline);

    // Heavy aggregation stages - prefer OLAP
    if (characteristics.hasHeavyAggregation) {
      return {
        backend: 'olap',
        reason: `Heavy aggregation stages: ${characteristics.olapStages.join(', ')}`,
        characteristics,
      };
    }

    // Simple _id lookup in $match - use OLTP
    if (characteristics.hasIdLookup && characteristics.estimatedRows <= 1) {
      return {
        backend: 'oltp',
        reason: 'Simple _id lookup in $match',
        characteristics,
      };
    }

    // Time-range query - prefer OLAP
    if (characteristics.isTimeRangeQuery) {
      return {
        backend: 'olap',
        reason: 'Time-range query on timestamp field',
        characteristics,
      };
    }

    // Large result set expected - use OLAP
    if (characteristics.estimatedRows > this._config.rowThreshold) {
      return {
        backend: 'olap',
        reason: `Estimated rows (${characteristics.estimatedRows}) exceeds threshold (${this._config.rowThreshold})`,
        characteristics,
      };
    }

    // Prefer OLAP for aggregations if configured
    if (this._config.preferOlapForAggregations && characteristics.olapStages.length > 0) {
      return {
        backend: 'olap',
        reason: 'Preferring OLAP for aggregations (config)',
        characteristics,
      };
    }

    // Default to OLTP for simple aggregations
    return {
      backend: 'oltp',
      reason: 'Simple aggregation - default to OLTP',
      characteristics,
    };
  }

  /**
   * Get the appropriate backend based on routing decision
   */
  private getBackend(decision: RoutingDecision): MondoBackend {
    if (decision.backend === 'olap' && this._olap) {
      return this._olap;
    }
    return this._oltp;
  }

  // ===========================================================================
  // MondoBackend Implementation - Read Operations
  // ===========================================================================

  async find(
    db: string,
    collection: string,
    options: RouterFindOptions
  ): Promise<FindResult> {
    const decision = this.routeFind(options);
    const backend = this.getBackend(decision);
    return backend.find(db, collection, options);
  }

  async aggregate(
    db: string,
    collection: string,
    pipeline: Document[],
    options?: RouterAggregateOptions
  ): Promise<AggregateResult> {
    const decision = this.routeAggregate(pipeline, options);
    const backend = this.getBackend(decision);
    return backend.aggregate(db, collection, pipeline, options);
  }

  async count(db: string, collection: string, query?: Document): Promise<number> {
    // Route count queries like find queries
    const findOptions: FindOptions = {}
    if (query) {
      findOptions.filter = query
    }
    const characteristics = analyzeFindQuery(findOptions);

    if (this._olap && characteristics.estimatedRows > this._config.rowThreshold) {
      return this._olap.count(db, collection, query);
    }

    return this._oltp.count(db, collection, query);
  }

  async distinct(
    db: string,
    collection: string,
    field: string,
    query?: Document
  ): Promise<unknown[]> {
    // Distinct on large collections benefits from OLAP
    const findOptions: FindOptions = {}
    if (query) {
      findOptions.filter = query
    }
    const characteristics = analyzeFindQuery(findOptions);

    if (this._olap && characteristics.estimatedRows > this._config.rowThreshold) {
      return this._olap.distinct(db, collection, field, query);
    }

    return this._oltp.distinct(db, collection, field, query);
  }

  // ===========================================================================
  // MondoBackend Implementation - Write Operations (Always OLTP)
  // ===========================================================================

  async insertOne(db: string, collection: string, doc: Document): Promise<InsertResult> {
    // Writes always go to OLTP
    return this._oltp.insertOne(db, collection, doc);
  }

  async insertMany(db: string, collection: string, docs: Document[]): Promise<InsertResult> {
    // Writes always go to OLTP
    return this._oltp.insertMany(db, collection, docs);
  }

  async updateOne(
    db: string,
    collection: string,
    filter: Document,
    update: Document,
    options?: { upsert?: boolean; arrayFilters?: Document[] }
  ): Promise<UpdateResult> {
    // Writes always go to OLTP
    return this._oltp.updateOne(db, collection, filter, update, options);
  }

  async updateMany(
    db: string,
    collection: string,
    filter: Document,
    update: Document,
    options?: { upsert?: boolean; arrayFilters?: Document[] }
  ): Promise<UpdateResult> {
    // Writes always go to OLTP
    return this._oltp.updateMany(db, collection, filter, update, options);
  }

  async deleteOne(db: string, collection: string, filter: Document): Promise<DeleteResult> {
    // Writes always go to OLTP
    return this._oltp.deleteOne(db, collection, filter);
  }

  async deleteMany(db: string, collection: string, filter: Document): Promise<DeleteResult> {
    // Writes always go to OLTP
    return this._oltp.deleteMany(db, collection, filter);
  }

  // ===========================================================================
  // MondoBackend Implementation - Database Operations (Always OLTP)
  // ===========================================================================

  async listDatabases(): Promise<DatabaseInfo[]> {
    // List from OLTP (source of truth)
    return this._oltp.listDatabases();
  }

  async createDatabase(name: string): Promise<void> {
    // Writes always go to OLTP
    return this._oltp.createDatabase(name);
  }

  async dropDatabase(name: string): Promise<void> {
    // Writes always go to OLTP
    return this._oltp.dropDatabase(name);
  }

  async databaseExists(name: string): Promise<boolean> {
    return this._oltp.databaseExists(name);
  }

  // ===========================================================================
  // MondoBackend Implementation - Collection Operations (Always OLTP)
  // ===========================================================================

  async listCollections(db: string, filter?: Document): Promise<CollectionInfo[]> {
    // List from OLTP (source of truth)
    return this._oltp.listCollections(db, filter);
  }

  async createCollection(db: string, name: string, options?: Document): Promise<void> {
    // Writes always go to OLTP
    return this._oltp.createCollection(db, name, options);
  }

  async dropCollection(db: string, name: string): Promise<void> {
    // Writes always go to OLTP
    return this._oltp.dropCollection(db, name);
  }

  async collectionExists(db: string, name: string): Promise<boolean> {
    return this._oltp.collectionExists(db, name);
  }

  async collStats(db: string, collection: string): Promise<CollStats> {
    // Stats from OLTP (real-time data)
    return this._oltp.collStats(db, collection);
  }

  async dbStats(db: string): Promise<DbStats> {
    // Stats from OLTP (real-time data)
    return this._oltp.dbStats(db);
  }

  // ===========================================================================
  // MondoBackend Implementation - Index Operations (Always OLTP)
  // ===========================================================================

  async listIndexes(db: string, collection: string): Promise<IndexInfo[]> {
    return this._oltp.listIndexes(db, collection);
  }

  async createIndexes(db: string, collection: string, indexes: IndexSpec[]): Promise<string[]> {
    // Writes always go to OLTP
    return this._oltp.createIndexes(db, collection, indexes);
  }

  async dropIndex(db: string, collection: string, indexName: string): Promise<void> {
    // Writes always go to OLTP
    return this._oltp.dropIndex(db, collection, indexName);
  }

  async dropIndexes(db: string, collection: string): Promise<void> {
    // Writes always go to OLTP
    return this._oltp.dropIndexes(db, collection);
  }

  // ===========================================================================
  // MondoBackend Implementation - Cursor Management
  // ===========================================================================

  createCursor(state: CursorState): void {
    // Cursors are managed by the backend that created them
    // For the router, we delegate to OLTP as the primary
    this._oltp.createCursor(state);
  }

  getCursor(id: bigint): CursorState | undefined {
    // Try OLTP first, then OLAP
    const cursor = this._oltp.getCursor(id);
    if (cursor) return cursor;
    return this._olap?.getCursor(id);
  }

  advanceCursor(id: bigint, count: number): Document[] {
    // Try OLTP first, then OLAP
    const oltpDocs = this._oltp.advanceCursor(id, count);
    if (oltpDocs.length > 0) return oltpDocs;
    return this._olap?.advanceCursor(id, count) ?? [];
  }

  closeCursor(id: bigint): boolean {
    // Try to close on both backends
    const oltpClosed = this._oltp.closeCursor(id);
    const olapClosed = this._olap?.closeCursor(id) ?? false;
    return oltpClosed || olapClosed;
  }

  cleanupExpiredCursors(): void {
    this._oltp.cleanupExpiredCursors();
    this._olap?.cleanupExpiredCursors();
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get routing configuration
   */
  getConfig(): RoutingConfig {
    return { ...this._config };
  }

  /**
   * Check if OLAP backend is available
   */
  hasOlapBackend(): boolean {
    return this._olap !== undefined;
  }

  /**
   * Get the OLTP backend directly
   */
  getOltpBackend(): MondoBackend {
    return this._oltp;
  }

  /**
   * Get the OLAP backend directly (if available)
   */
  getOlapBackend(): MondoBackend | undefined {
    return this._olap;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a query router instance
 */
export function createQueryRouter(config: QueryRouterConfig): QueryRouter {
  return new QueryRouter(config);
}
