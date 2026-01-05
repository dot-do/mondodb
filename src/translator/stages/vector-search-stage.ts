/**
 * $vectorSearch stage - Performs vector similarity search
 *
 * Translates MongoDB Atlas $vectorSearch stage for use with Cloudflare Vectorize.
 * This stage must be the first stage in an aggregation pipeline.
 */

import type { VectorSearchStage } from '../vector-translator'
import type { StageResult, StageContext } from './types'

/**
 * Translated vector search result with normalized field names
 */
export interface TranslatedVectorSearch {
  /** The name of the vector index to use */
  vectorIndexName: string
  /** Path to the vector field in documents */
  vectorPath: string
  /** Query vector for similarity search */
  queryVector?: number[]
  /** Text query to convert to embedding (requires AI binding) */
  queryText?: string
  /** Maximum number of documents to return */
  limit: number
  /** Optional filter for pre-filtering documents */
  filter?: Record<string, unknown>
  /** WHERE clause generated from filter */
  whereClause?: string
  /** Field to store the similarity score */
  scoreField?: string
  /** Whether to perform exact (brute-force) search */
  exact?: boolean
}

/**
 * Extended StageResult for $vectorSearch that includes vector search info
 */
export interface VectorSearchStageResult extends StageResult {
  /** Flag indicating this is a vector search stage */
  isVectorSearchStage: boolean
  /** The collection being searched */
  collection: string
  /** Vector search stage specification (to be executed later with VectorTranslator) */
  vectorSearchStage?: VectorSearchStage
  /** Translated vector search parameters */
  vectorSearch?: TranslatedVectorSearch
}

/**
 * Generate a simple WHERE clause from a filter object
 */
function generateWhereClause(filter: Record<string, unknown>): string {
  const conditions: string[] = []
  for (const [key, value] of Object.entries(filter)) {
    if (typeof value === 'string') {
      conditions.push(`${key} = '${value}'`)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      conditions.push(`${key} = ${value}`)
    } else {
      conditions.push(`${key} = ${JSON.stringify(value)}`)
    }
  }
  return conditions.join(' AND ')
}

/**
 * Translate a $vectorSearch stage
 *
 * @param stage - The $vectorSearch stage specification
 * @param context - The stage context with collection and CTE info
 * @returns Stage result with vector search parameters
 */
export function translateVectorSearchStage(
  stage: VectorSearchStage,
  context: StageContext
): VectorSearchStageResult {
  // Build the translated vector search object
  const vectorSearch: TranslatedVectorSearch = {
    vectorIndexName: stage.index,
    vectorPath: stage.path,
    queryVector: stage.queryVector,
    queryText: stage.queryText,
    limit: stage.limit,
  }

  // Add filter and generate WHERE clause if provided
  if (stage.filter) {
    vectorSearch.filter = stage.filter as Record<string, unknown>
    vectorSearch.whereClause = generateWhereClause(stage.filter as Record<string, unknown>)
  }

  // Add optional fields if present
  if (stage.scoreField !== undefined) {
    vectorSearch.scoreField = stage.scoreField
  }
  if (stage.exact !== undefined) {
    vectorSearch.exact = stage.exact
  }

  return {
    isVectorSearchStage: true,
    collection: context.collection,
    vectorSearchStage: stage,
    vectorSearch,
    params: [],
    transformsShape: true
  }
}
