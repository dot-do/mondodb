/**
 * Parallel Facet Executor - Executes multiple facet pipelines concurrently
 *
 * This module provides utilities for executing facet queries in parallel,
 * taking advantage of the independent nature of each facet.
 */

export interface FacetQuery {
  name: string
  sql: string
  params: unknown[]
}

export interface FacetResult {
  name: string
  rows: unknown[]
}

export interface FacetExecutionPlan {
  /** Queries that can be executed in parallel */
  parallelQueries: FacetQuery[]
  /** Combined result structure */
  combineResults: (results: FacetResult[]) => Record<string, unknown[]>
}

/**
 * Create an execution plan for parallel facet queries
 */
export function createFacetExecutionPlan(
  facets: Record<string, { sql: string; params: unknown[] }>
): FacetExecutionPlan {
  const parallelQueries: FacetQuery[] = Object.entries(facets).map(([name, query]) => ({
    name,
    sql: query.sql,
    params: query.params
  }))

  return {
    parallelQueries,
    combineResults: (results: FacetResult[]) => {
      const combined: Record<string, unknown[]> = {}
      for (const result of results) {
        combined[result.name] = result.rows
      }
      return combined
    }
  }
}

/**
 * Example executor interface for parallel facet execution
 * This would be implemented by the database layer
 */
export interface ParallelExecutor {
  executeParallel(queries: FacetQuery[]): Promise<FacetResult[]>
}

/**
 * Create a mock parallel executor for testing
 */
export function createMockParallelExecutor(
  queryHandler: (sql: string, params: unknown[]) => unknown[]
): ParallelExecutor {
  return {
    async executeParallel(queries: FacetQuery[]): Promise<FacetResult[]> {
      // Execute all queries in parallel using Promise.all
      const results = await Promise.all(
        queries.map(async (query) => ({
          name: query.name,
          rows: queryHandler(query.sql, query.params)
        }))
      )
      return results
    }
  }
}

/**
 * Batch facet execution - groups queries for efficient execution
 */
export function batchFacetQueries(
  facets: Record<string, { sql: string; params: unknown[] }>,
  batchSize: number = 3
): FacetQuery[][] {
  const queries = Object.entries(facets).map(([name, query]) => ({
    name,
    sql: query.sql,
    params: query.params
  }))

  const batches: FacetQuery[][] = []
  for (let i = 0; i < queries.length; i += batchSize) {
    batches.push(queries.slice(i, i + batchSize))
  }

  return batches
}
