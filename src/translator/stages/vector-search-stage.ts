/**
 * $vectorSearch stage - Performs vector similarity search
 *
 * Translates MongoDB Atlas $vectorSearch stage for use with Cloudflare Vectorize.
 * This stage must be the first stage in an aggregation pipeline.
 */

import { VectorTranslator, type VectorSearchStage, type VectorSearchTranslation } from '../vector-translator'
import type { StageResult, StageContext } from './types'

/**
 * Extended StageResult for $vectorSearch that includes vector search info
 */
export interface VectorSearchStageResult extends StageResult {
  /** Flag indicating this is a vector search stage */
  isVectorSearchStage: boolean
  /** The collection being searched */
  collection: string
  /** Vector search translation result */
  vectorSearch?: VectorSearchTranslation
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
  const translator = new VectorTranslator()
  const vectorSearch = translator.translateVectorSearch(stage, context.collection)

  return {
    isVectorSearchStage: true,
    collection: context.collection,
    vectorSearch,
    params: [],
    transformsShape: true
  }
}
