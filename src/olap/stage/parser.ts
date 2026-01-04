/**
 * $olap Stage Parser
 *
 * Parses and validates the $olap aggregation stage for routing analytical
 * queries to OLAP engines (R2 SQL, ClickHouse) from within MongoDB pipelines.
 */

// ============================================================================
// Types
// ============================================================================

export type OlapEngine = 'r2sql' | 'clickhouse' | 'auto';

export interface StructuredQuery {
  select: string[];
  from: string;
  where?: Record<string, unknown>;
  groupBy?: string[];
  having?: Record<string, unknown>;
  orderBy?: Array<{ field: string; direction: 'ASC' | 'DESC' }>;
  limit?: number;
  offset?: number;
}

export type OlapQuery = string | StructuredQuery;

export interface PartitionOptions {
  column: string;
  start?: string | number | Date;
  end?: string | number | Date;
  interval?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  step?: number;
}

export interface OlapStageOptions {
  engine: OlapEngine;
  query: OlapQuery;
  partition?: PartitionOptions;
  parameters?: Record<string, unknown>;
  timeout?: number;
  maxRows?: number;
}

export interface OlapStageParseResult {
  isValid: boolean;
  options?: OlapStageOptions;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const VALID_ENGINES: OlapEngine[] = ['r2sql', 'clickhouse', 'auto'];
const VALID_INTERVALS = ['day', 'week', 'month', 'quarter', 'year'];
const DISALLOWED_STATEMENTS = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE'];

// ============================================================================
// OlapStageParser Class
// ============================================================================

export class OlapStageParser {
  /**
   * Parse a $olap stage from an aggregation pipeline
   */
  parse(stage: Record<string, unknown>): OlapStageParseResult {
    const olapSpec = stage.$olap;

    if (!olapSpec || typeof olapSpec !== 'object') {
      return {
        isValid: false,
        error: 'Invalid $olap stage: expected object',
      };
    }

    const spec = olapSpec as Record<string, unknown>;

    // Validate engine
    const engineResult = this._validateEngine(spec.engine);
    if (!engineResult.isValid) {
      return engineResult;
    }

    // Validate query
    const queryResult = this._validateQuery(spec.query);
    if (!queryResult.isValid) {
      return queryResult;
    }

    // Validate partition options if present
    if (spec.partition !== undefined) {
      const partitionResult = this._validatePartition(spec.partition);
      if (!partitionResult.isValid) {
        return partitionResult;
      }
    }

    // Validate parameters if present
    if (spec.parameters !== undefined) {
      const paramsResult = this._validateParameters(spec.parameters);
      if (!paramsResult.isValid) {
        return paramsResult;
      }
    }

    // Validate timeout if present
    if (spec.timeout !== undefined && typeof spec.timeout !== 'number') {
      return {
        isValid: false,
        error: 'Invalid timeout: expected number',
      };
    }

    // Validate maxRows if present
    if (spec.maxRows !== undefined && typeof spec.maxRows !== 'number') {
      return {
        isValid: false,
        error: 'Invalid maxRows: expected number',
      };
    }

    // Build valid options
    const options: OlapStageOptions = {
      engine: (spec.engine as OlapEngine) || 'auto',
      query: spec.query as OlapQuery,
    };

    if (spec.partition) {
      options.partition = spec.partition as PartitionOptions;
    }

    if (spec.parameters) {
      options.parameters = spec.parameters as Record<string, unknown>;
    }

    if (spec.timeout !== undefined) {
      options.timeout = spec.timeout as number;
    }

    if (spec.maxRows !== undefined) {
      options.maxRows = spec.maxRows as number;
    }

    return {
      isValid: true,
      options,
    };
  }

  private _validateEngine(engine: unknown): OlapStageParseResult {
    if (engine === undefined) {
      // Default to auto
      return { isValid: true };
    }

    if (typeof engine !== 'string') {
      return {
        isValid: false,
        error: 'Invalid engine: expected string',
      };
    }

    if (!VALID_ENGINES.includes(engine as OlapEngine)) {
      return {
        isValid: false,
        error: `Invalid engine '${engine}': must be one of ${VALID_ENGINES.join(', ')}`,
      };
    }

    return { isValid: true };
  }

  private _validateQuery(query: unknown): OlapStageParseResult {
    if (query === undefined || query === null) {
      return {
        isValid: false,
        error: 'Missing required field: query',
      };
    }

    // String query
    if (typeof query === 'string') {
      if (query.trim() === '') {
        return {
          isValid: false,
          error: 'Invalid query: cannot be empty',
        };
      }

      // Check for disallowed statements
      const upperQuery = query.toUpperCase();
      for (const stmt of DISALLOWED_STATEMENTS) {
        if (upperQuery.includes(stmt)) {
          return {
            isValid: false,
            error: `Disallowed statement: ${stmt} is not permitted in OLAP queries`,
          };
        }
      }

      // Check for multiple statements
      const statements = query.split(';').filter((s) => s.trim().length > 0);
      if (statements.length > 1) {
        return {
          isValid: false,
          error: 'Invalid query: multiple statements not allowed',
        };
      }

      return { isValid: true };
    }

    // Structured query object
    if (typeof query === 'object') {
      const q = query as Record<string, unknown>;

      if (!q.select || !Array.isArray(q.select)) {
        return {
          isValid: false,
          error: 'Invalid query: structured query requires select array',
        };
      }

      if (!q.from || typeof q.from !== 'string') {
        return {
          isValid: false,
          error: 'Invalid query: structured query requires from string',
        };
      }

      return { isValid: true };
    }

    return {
      isValid: false,
      error: 'Invalid query: expected string or structured query object',
    };
  }

  private _validatePartition(partition: unknown): OlapStageParseResult {
    if (typeof partition !== 'object' || partition === null) {
      return {
        isValid: false,
        error: 'Invalid partition: expected object',
      };
    }

    const p = partition as Record<string, unknown>;

    if (!p.column || typeof p.column !== 'string') {
      return {
        isValid: false,
        error: 'Invalid partition: column is required',
      };
    }

    if (p.interval !== undefined) {
      if (typeof p.interval !== 'string' || !VALID_INTERVALS.includes(p.interval)) {
        return {
          isValid: false,
          error: `Invalid partition interval: must be one of ${VALID_INTERVALS.join(', ')}`,
        };
      }
    }

    if (p.step !== undefined && typeof p.step !== 'number') {
      return {
        isValid: false,
        error: 'Invalid partition step: expected number',
      };
    }

    return { isValid: true };
  }

  private _validateParameters(parameters: unknown): OlapStageParseResult {
    if (typeof parameters !== 'object' || parameters === null) {
      return {
        isValid: false,
        error: 'Invalid parameters: expected object',
      };
    }

    const params = parameters as Record<string, unknown>;

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'function') {
        return {
          isValid: false,
          error: `Invalid parameter '${key}': functions are not allowed`,
        };
      }
    }

    return { isValid: true };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Parse an $olap stage using a new parser instance
 */
export function parseOlapStage(stage: Record<string, unknown>): OlapStageParseResult {
  const parser = new OlapStageParser();
  return parser.parse(stage);
}

/**
 * Validate $olap stage options
 */
export function validateOlapStageOptions(options: unknown): OlapStageParseResult {
  if (!options || typeof options !== 'object') {
    return {
      isValid: false,
      error: 'Invalid options: expected object',
    };
  }

  const parser = new OlapStageParser();
  return parser.parse({ $olap: options });
}
