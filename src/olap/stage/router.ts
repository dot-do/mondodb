/**
 * Query Router for $olap Stage
 *
 * Routes analytical queries to the appropriate OLAP engine based on
 * query complexity, features used, and engine availability.
 */

import type { OlapStageOptions, OlapEngine } from './parser';

// ============================================================================
// Types
// ============================================================================

export interface EngineAvailability {
  r2sql: boolean;
  clickhouse: boolean;
}

export interface EngineCapabilities {
  supportsJoins: boolean;
  supportsWindowFunctions: boolean;
  supportsCTEs: boolean;
  supportsSubqueries: boolean;
  maxConcurrentQueries: number;
  maxRowsPerQuery: number;
  supportedFunctions: string[];
}

export interface QueryFeatures {
  hasJoins: boolean;
  hasImplicitJoin: boolean;
  hasWindowFunctions: boolean;
  hasCTEs: boolean;
  hasRecursiveCTE: boolean;
  hasSubqueries: boolean;
  hasUnion: boolean;
  hasIntersect: boolean;
  hasExcept: boolean;
  hasGroupBy: boolean;
  hasHaving: boolean;
  hasOrderBy: boolean;
  hasDistinct: boolean;
  tableCount: number;
  estimatedComplexity: 'simple' | 'medium' | 'complex';
  estimatedResultSize?: number;
}

export interface RoutingDecision {
  engine: OlapEngine;
  reason: string;
  features?: QueryFeatures;
  overridden?: boolean;
  fallback?: boolean;
  warnings?: string[];
  mayFail?: boolean;
  timestamp?: number;
  routerVersion?: string;
  estimatedRows?: number;
  complexity?: 'low' | 'medium' | 'high';
}

export interface CostFactors {
  baseCost: number;
  perRowCost: number;
}

export interface QueryRouterConfig {
  availability?: EngineAvailability;
  capabilities?: Record<string, EngineCapabilities>;
  defaultEngine?: OlapEngine;
  preferEngine?: OlapEngine;
  enableCostBasedRouting?: boolean;
  costFactors?: Record<string, CostFactors>;
}

// ============================================================================
// Constants
// ============================================================================

const JOIN_PATTERNS = [
  /\bINNER\s+JOIN\b/i,
  /\bLEFT\s+(?:OUTER\s+)?JOIN\b/i,
  /\bRIGHT\s+(?:OUTER\s+)?JOIN\b/i,
  /\bFULL\s+(?:OUTER\s+)?JOIN\b/i,
  /\bCROSS\s+JOIN\b/i,
  /\bJOIN\b/i,
];

const IMPLICIT_JOIN_PATTERN = /\bFROM\s+[\w.]+(?:\s+\w+)?\s*,/i;

const WINDOW_FUNCTION_PATTERNS = [
  /\bROW_NUMBER\s*\(/i,
  /\bRANK\s*\(/i,
  /\bDENSE_RANK\s*\(/i,
  /\bLAG\s*\(/i,
  /\bLEAD\s*\(/i,
  /\bNTILE\s*\(/i,
  /\bFIRST_VALUE\s*\(/i,
  /\bLAST_VALUE\s*\(/i,
  /\bOVER\s*\(/i,
  /\bPARTITION\s+BY\b/i,
];

const CTE_PATTERN = /\bWITH\s+(?!(?:TIME\s+ZONE|LOCAL\s+TIME))/i;
const RECURSIVE_CTE_PATTERN = /\bWITH\s+RECURSIVE\b/i;
const UNION_PATTERN = /\bUNION\b/i;
const INTERSECT_PATTERN = /\bINTERSECT\b/i;
const EXCEPT_PATTERN = /\bEXCEPT\b/i;
const SUBQUERY_PATTERN = /\(\s*SELECT\b/i;
const GROUP_BY_PATTERN = /\bGROUP\s+BY\b/i;
const HAVING_PATTERN = /\bHAVING\b/i;
const ORDER_BY_PATTERN = /\bORDER\s+BY\b/i;
const DISTINCT_PATTERN = /\bDISTINCT\b/i;
// TABLE_PATTERN used only in countTables function with its own local pattern

const LARGE_RESULT_THRESHOLD = 100000;
const ROUTER_VERSION = '1.0.0';

const DEFAULT_CAPABILITIES: Record<string, EngineCapabilities> = {
  r2sql: {
    supportsJoins: false,
    supportsWindowFunctions: false,
    supportsCTEs: false,
    supportsSubqueries: true,
    maxConcurrentQueries: 10,
    maxRowsPerQuery: 100000,
    supportedFunctions: ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'GROUP BY', 'ORDER BY'],
  },
  clickhouse: {
    supportsJoins: true,
    supportsWindowFunctions: true,
    supportsCTEs: true,
    supportsSubqueries: true,
    maxConcurrentQueries: 100,
    maxRowsPerQuery: 10000000,
    supportedFunctions: [
      'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'GROUP BY', 'ORDER BY',
      'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
      'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'OVER', 'PARTITION BY',
      'WITH', 'UNION', 'INTERSECT', 'EXCEPT',
    ],
  },
};

// ============================================================================
// QueryRouter Class
// ============================================================================

export class QueryRouter {
  private _config: Required<Pick<QueryRouterConfig, 'availability' | 'capabilities' | 'defaultEngine'>> & QueryRouterConfig;

  constructor(config: QueryRouterConfig = {}) {
    this._config = {
      availability: config.availability ?? { r2sql: true, clickhouse: true },
      capabilities: config.capabilities ?? DEFAULT_CAPABILITIES,
      defaultEngine: config.defaultEngine ?? 'auto',
      ...(config.preferEngine !== undefined && { preferEngine: config.preferEngine }),
      ...(config.enableCostBasedRouting !== undefined && { enableCostBasedRouting: config.enableCostBasedRouting }),
      ...(config.costFactors !== undefined && { costFactors: config.costFactors }),
    };
  }

  /**
   * Map feature complexity to decision complexity
   */
  private _mapComplexity(features: QueryFeatures): 'low' | 'medium' | 'high' {
    // High complexity: JOINs, window functions, CTEs, or many tables
    if (features.hasJoins || features.hasImplicitJoin || features.hasWindowFunctions ||
        features.hasCTEs || features.tableCount >= 4) {
      return 'high';
    }
    // Medium complexity: GROUP BY, HAVING, subqueries
    if (features.hasGroupBy || features.hasHaving || features.hasSubqueries ||
        features.hasUnion || features.hasIntersect || features.hasExcept) {
      return 'medium';
    }
    // Low complexity: simple queries
    return 'low';
  }

  /**
   * Add metadata to routing decision
   */
  private _addMetadata(decision: RoutingDecision, options: OlapStageOptions): RoutingDecision {
    const complexity = decision.features ? this._mapComplexity(decision.features) : 'low';
    const estimatedRows = options.maxRows ?? (options.partition ? 10000 : undefined);
    return {
      ...decision,
      timestamp: Date.now(),
      routerVersion: ROUTER_VERSION,
      ...(estimatedRows !== undefined && { estimatedRows }),
      complexity,
    };
  }

  /**
   * Route a query to the appropriate OLAP engine
   */
  route(options: OlapStageOptions): RoutingDecision {
    const { availability, capabilities } = this._config;

    // Check if any engine is available
    if (!availability.r2sql && !availability.clickhouse) {
      throw new Error('No OLAP engine available');
    }

    const query = typeof options.query === 'string' ? options.query : '';
    const features = detectQueryFeatures(query);
    const warnings: string[] = [];

    // Handle explicit engine selection
    if (options.engine !== 'auto') {
      const decision = this._handleExplicitEngine(options.engine, features, availability, capabilities, warnings);
      return this._addMetadata(decision, options);
    }

    // Handle preferEngine hint
    if (this._config.preferEngine && this._config.preferEngine !== 'auto') {
      const preferred = this._config.preferEngine;
      if ((preferred === 'r2sql' && availability.r2sql) || (preferred === 'clickhouse' && availability.clickhouse)) {
        return this._addMetadata({
          engine: preferred,
          reason: `Preferred engine: ${preferred}`,
          features,
          overridden: true,
        }, options);
      }
    }

    // Auto-select engine based on query features
    const decision = this._autoSelectEngine(options, features, availability, capabilities, warnings);
    return this._addMetadata(decision, options);
  }

  private _handleExplicitEngine(
    engine: OlapEngine,
    features: QueryFeatures,
    availability: EngineAvailability,
    capabilities: Record<string, EngineCapabilities>,
    warnings: string[]
  ): RoutingDecision {
    // Check if requested engine is available
    if (engine === 'r2sql' && !availability.r2sql) {
      if (availability.clickhouse) {
        return {
          engine: 'clickhouse',
          reason: 'R2 SQL unavailable, falling back to ClickHouse',
          features,
          fallback: true,
          warnings: ['Requested engine R2 SQL is unavailable'],
        };
      }
      throw new Error('No OLAP engine available');
    }

    if (engine === 'clickhouse' && !availability.clickhouse) {
      if (availability.r2sql) {
        return {
          engine: 'r2sql',
          reason: 'ClickHouse unavailable, falling back to R2 SQL',
          features,
          fallback: true,
          warnings: ['Requested engine ClickHouse is unavailable'],
        };
      }
      throw new Error('No OLAP engine available');
    }

    // Engine is available - check for compatibility warnings
    if (engine === 'r2sql') {
      const r2Caps = capabilities['r2sql'];
      if ((features.hasJoins || features.hasImplicitJoin) && !r2Caps?.supportsJoins) {
        warnings.push('R2 SQL does not support JOINs');
      }
      if (features.hasWindowFunctions && !r2Caps?.supportsWindowFunctions) {
        warnings.push('window functions');
      }
      if (features.hasCTEs && !r2Caps?.supportsCTEs) {
        warnings.push('R2 SQL does not support CTEs');
      }
    }

    const result: RoutingDecision = {
      engine,
      reason: `Explicitly selected ${engine}`,
      features,
      overridden: true,
    };
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    return result;
  }

  private _autoSelectEngine(
    options: OlapStageOptions,
    features: QueryFeatures,
    availability: EngineAvailability,
    capabilities: Record<string, EngineCapabilities>,
    warnings: string[]
  ): RoutingDecision {
    const r2Caps = capabilities['r2sql'];

    // Features that require ClickHouse
    const requiresClickHouse =
      features.hasJoins ||
      features.hasImplicitJoin ||
      features.hasWindowFunctions ||
      features.hasCTEs ||
      features.hasUnion ||
      features.hasIntersect ||
      features.hasExcept ||
      features.estimatedComplexity === 'complex';

    // Large result sets should use ClickHouse
    const hasLargeResultSet =
      options.maxRows && options.maxRows > (r2Caps?.maxRowsPerQuery || LARGE_RESULT_THRESHOLD);

    // Determine preferred engine
    let preferredEngine: OlapEngine;
    let reason: string;

    if (requiresClickHouse) {
      preferredEngine = 'clickhouse';
      if (features.hasJoins || features.hasImplicitJoin) {
        reason = 'complex query contains JOIN operations - routing to ClickHouse';
      } else if (features.hasWindowFunctions) {
        reason = 'complex query contains window functions - routing to ClickHouse';
      } else if (features.hasCTEs) {
        reason = 'complex query contains CTEs - routing to ClickHouse';
      } else if (features.estimatedComplexity === 'complex') {
        reason = 'complex query - routing to ClickHouse';
      } else {
        reason = 'complex query requires advanced features - routing to ClickHouse';
      }
    } else if (hasLargeResultSet) {
      preferredEngine = 'clickhouse';
      reason = 'Query expects large result set - routing to ClickHouse';
    } else {
      preferredEngine = 'r2sql';
      reason = 'simple aggregation - routing to R2 SQL';
    }

    // Check availability and fallback if needed
    if (preferredEngine === 'clickhouse' && !availability.clickhouse) {
      if (availability.r2sql) {
        // Check if query might fail on R2 SQL
        const mayFail = requiresClickHouse && (
          (features.hasJoins && !r2Caps?.supportsJoins) ||
          (features.hasWindowFunctions && !r2Caps?.supportsWindowFunctions) ||
          (features.hasCTEs && !r2Caps?.supportsCTEs)
        );

        if (features.hasJoins || features.hasImplicitJoin) {
          warnings.push('JOINs are not supported');
        }
        if (features.hasWindowFunctions) {
          warnings.push('window functions are not supported');
        }
        if (features.hasCTEs) {
          warnings.push('CTEs are not supported');
        }

        const fallbackResult: RoutingDecision = {
          engine: 'r2sql',
          reason: 'ClickHouse unavailable, falling back to R2 SQL',
          features,
          fallback: true,
          mayFail,
        };
        if (warnings.length > 0) {
          fallbackResult.warnings = warnings;
        }
        return fallbackResult;
      }
      throw new Error('No OLAP engine available');
    }

    if (preferredEngine === 'r2sql' && !availability.r2sql) {
      if (availability.clickhouse) {
        return {
          engine: 'clickhouse',
          reason: 'R2 SQL unavailable, falling back to ClickHouse',
          features,
          fallback: true,
        };
      }
      throw new Error('No OLAP engine available');
    }

    // Check if we're in a degraded state (one engine unavailable)
    const inDegradedState = !availability.r2sql || !availability.clickhouse;

    const result: RoutingDecision = {
      engine: preferredEngine,
      reason,
      features,
    };
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    if (inDegradedState) {
      result.fallback = true;
    }
    return result;
  }
}

// ============================================================================
// Feature Detection Functions
// ============================================================================

/**
 * Count tables referenced in a query
 */
function countTables(query: string): number {
  const tables = new Set<string>();
  let match;
  const pattern = /\b(?:FROM|JOIN)\s+(\w+)/gi;
  while ((match = pattern.exec(query)) !== null) {
    if (match[1]) {
      tables.add(match[1].toLowerCase());
    }
  }
  return tables.size;
}

/**
 * Detect query features for routing decisions
 */
export function detectQueryFeatures(query: string): QueryFeatures {
  const hasJoins = JOIN_PATTERNS.some((pattern) => pattern.test(query));
  const hasImplicitJoin = IMPLICIT_JOIN_PATTERN.test(query);
  const hasWindowFunctions = WINDOW_FUNCTION_PATTERNS.some((pattern) => pattern.test(query));
  const hasCTEs = CTE_PATTERN.test(query);
  const hasRecursiveCTE = RECURSIVE_CTE_PATTERN.test(query);
  const hasSubqueries = SUBQUERY_PATTERN.test(query);
  const hasUnion = UNION_PATTERN.test(query);
  const hasIntersect = INTERSECT_PATTERN.test(query);
  const hasExcept = EXCEPT_PATTERN.test(query);
  const hasGroupBy = GROUP_BY_PATTERN.test(query);
  const hasHaving = HAVING_PATTERN.test(query);
  const hasOrderBy = ORDER_BY_PATTERN.test(query);
  const hasDistinct = DISTINCT_PATTERN.test(query);
  const tableCount = countTables(query);

  // Estimate complexity
  let complexityScore = 0;
  if (hasJoins || hasImplicitJoin) complexityScore += 2;
  if (hasWindowFunctions) complexityScore += 2;
  if (hasCTEs) complexityScore += 2;
  if (hasRecursiveCTE) complexityScore += 3;
  if (hasSubqueries) complexityScore += 1;
  if (hasUnion || hasIntersect || hasExcept) complexityScore += 1;

  let estimatedComplexity: 'simple' | 'medium' | 'complex';
  if (complexityScore === 0) {
    estimatedComplexity = 'simple';
  } else if (complexityScore <= 2) {
    estimatedComplexity = 'medium';
  } else {
    estimatedComplexity = 'complex';
  }

  return {
    hasJoins,
    hasImplicitJoin,
    hasWindowFunctions,
    hasCTEs,
    hasRecursiveCTE,
    hasSubqueries,
    hasUnion,
    hasIntersect,
    hasExcept,
    hasGroupBy,
    hasHaving,
    hasOrderBy,
    hasDistinct,
    tableCount,
    estimatedComplexity,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create a query router with the given config
 */
export function createQueryRouter(config: QueryRouterConfig = {}): QueryRouter {
  return new QueryRouter(config);
}

/**
 * Route a query using a default router configuration
 */
export function routeQuery(
  options: OlapStageOptions,
  config: QueryRouterConfig = {}
): RoutingDecision {
  const router = new QueryRouter(config);
  return router.route(options);
}
