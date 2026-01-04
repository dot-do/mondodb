/**
 * $facet stage - Processes multiple aggregation pipelines in a single stage
 * Translates to multiple separate queries (can be run in parallel)
 */

import type { StageResult, StageContext, PipelineStage } from './types'

export interface FacetTranslator {
  translatePipeline(stages: PipelineStage[], collection: string): { sql: string; params: unknown[] }
}

export function translateFacetStage(
  facet: Record<string, PipelineStage[]>,
  context: StageContext,
  pipelineTranslator: FacetTranslator
): StageResult {
  const params: unknown[] = []
  const facets: Record<string, { sql: string; params: unknown[] }> = {}

  // Each facet is an independent pipeline
  for (const [facetName, pipeline] of Object.entries(facet)) {
    // Use the previous CTE or collection as the source for each facet
    const source = context.previousCte || context.collection

    // Translate each facet pipeline independently
    const result = pipelineTranslator.translatePipeline(pipeline, source)
    facets[facetName] = result
  }

  // The final result combines all facets
  // In practice, this would be assembled in the application layer
  // Here we provide the individual queries

  return {
    facets,
    params,
    selectClause: 'NULL', // Facets are handled separately
    transformsShape: true
  }
}
