/**
 * $vectorSearch stage - Performs vector similarity search
 *
 * Translates MongoDB Atlas $vectorSearch stage for use with Cloudflare Vectorize.
 * This stage must be the first stage in an aggregation pipeline.
 */

import type { VectorSearchStage, VectorSearchResult } from '../vector-translator'
import type { StageResult, StageContext } from './types'

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
  /** Vector search translation result (populated after async execution) */
  vectorSearch?: VectorSearchResult
}

/**
 * Translate a $vectorSearch stage
 *
 * Note: This only prepares the stage for execution. Actual vector search
 * requires async operation with a configured VectorTranslator instance
 * that has access to Vectorize and AI bindings.
 *
 * @param stage - The $vectorSearch stage specification
 * @param context - The stage context with collection and CTE info
 * @returns Stage result with vector search parameters
 */
export function translateVectorSearchStage(
  stage: VectorSearchStage,
  context: StageContext
): VectorSearchStageResult {
  // Store the stage spec for deferred execution
  // Actual vector search happens in the executor with proper bindings
  return {
    isVectorSearchStage: true,
    collection: context.collection,
    vectorSearchStage: stage,
    params: [],
    transformsShape: true
  }
}
