/**
 * $search stage - MongoDB Atlas Search integration
 *
 * Translates MongoDB $search aggregation stage to SQLite FTS5 queries.
 * The $search stage must be the first stage in an aggregation pipeline.
 *
 * Supported operators:
 * - text: Full-text search on specified fields
 * - phrase: Exact phrase matching
 * - wildcard: Wildcard pattern matching
 * - compound: Boolean combinations (must, should, mustNot, filter)
 */

import { SearchTranslator, type SearchOperator } from '../search-translator';
import type { StageResult, StageContext } from './types';

/**
 * Extended context for search stage
 */
export interface SearchStageContext extends StageContext {
  /** Include relevance score in results */
  includeScore?: boolean;
}

/**
 * Result from search stage translation
 */
export interface SearchStageResult extends StageResult {
  /** FTS5 MATCH expression */
  ftsMatch: string;
  /** FTS table name */
  ftsTable: string;
  /** JOIN clause for FTS table */
  ftsJoin: string;
}

/**
 * $search stage input with optional index name
 */
export interface SearchStageInput extends SearchOperator {
  /** Named search index to use */
  index?: string;
}

/**
 * Translate a $search aggregation stage to SQL
 *
 * @param searchSpec The $search stage specification
 * @param context Stage context including collection name
 * @returns SearchStageResult with FTS5 query components
 */
export function translateSearchStage(
  searchSpec: SearchStageInput,
  context: SearchStageContext
): SearchStageResult {
  const translator = new SearchTranslator();

  // Extract the search operator (remove 'index' if present)
  const { index, ...searchOperator } = searchSpec;

  // Determine FTS table name
  const ftsTable = `${context.collection}_fts`;

  // Translate the search operator to FTS5 MATCH expression
  const searchResult = translator.translateSearch(searchOperator, context.collection);

  // Build the JOIN clause for FTS5 table
  const ftsJoin = `JOIN ${ftsTable} ON documents.id = ${ftsTable}.rowid`;

  // Build SELECT clause with optional score
  let selectClause: string | undefined;
  if (context.includeScore) {
    // FTS5 bm25() returns negative values (more negative = more relevant)
    // Negate to get positive scores where higher = more relevant
    selectClause = `*, -bm25(${ftsTable}) AS _searchScore`;
  }

  // Build WHERE clause
  const whereClause = `${ftsTable} MATCH ?`;

  // Build ORDER BY clause for relevance ranking
  const orderByClause = context.includeScore ? `_searchScore DESC` : undefined;

  return {
    ftsMatch: searchResult.ftsMatch,
    ftsTable,
    ftsJoin,
    selectClause,
    whereClause,
    orderByClause,
    params: [searchResult.ftsMatch],
    transformsShape: context.includeScore, // Score adds a new field
  };
}

/**
 * Build complete SQL for a $search stage
 *
 * @param searchSpec The $search specification
 * @param collection Collection name
 * @param includeScore Whether to include relevance score
 * @returns Complete SQL query and parameters
 */
export function buildSearchSQL(
  searchSpec: SearchStageInput,
  collection: string,
  includeScore: boolean = false
): { sql: string; params: unknown[] } {
  const context: SearchStageContext = {
    collection,
    cteIndex: 0,
    existingParams: [],
    includeScore,
  };

  const result = translateSearchStage(searchSpec, context);

  const selectClause = result.selectClause || '*';
  const ftsTable = result.ftsTable;

  const sql = `
    SELECT ${selectClause}
    FROM documents
    ${result.ftsJoin}
    WHERE ${result.whereClause}
    ${result.orderByClause ? `ORDER BY ${result.orderByClause}` : ''}
  `.trim().replace(/\s+/g, ' ');

  return {
    sql,
    params: result.params,
  };
}
