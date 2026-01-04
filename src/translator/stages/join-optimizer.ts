/**
 * Join Optimizer - Optimizes $lookup stages for better performance
 *
 * Strategies:
 * 1. Index hints for join conditions
 * 2. Predicate pushdown into subqueries
 * 3. Query rewriting for specific patterns
 */

import type { LookupStage, PipelineStage } from './types'

export interface JoinOptimization {
  /** Suggested index for the lookup */
  suggestedIndex?: {
    collection: string
    fields: string[]
  }
  /** Optimized lookup configuration */
  optimizedLookup: LookupStage
  /** Pre-filter that can be applied to foreign collection */
  foreignPreFilter?: Record<string, unknown>
}

/**
 * Analyze a $lookup stage and suggest optimizations
 */
export function optimizeLookup(
  lookup: LookupStage,
  followingStages: PipelineStage[]
): JoinOptimization {
  const result: JoinOptimization = {
    optimizedLookup: { ...lookup }
  }

  // Suggest index for the join condition
  if (lookup.foreignField) {
    result.suggestedIndex = {
      collection: lookup.from,
      fields: [lookup.foreignField]
    }
  }

  // Look for $match stages that filter on the lookup result
  // These can potentially be pushed into the lookup subquery
  for (const stage of followingStages) {
    if ('$match' in stage) {
      const match = stage.$match as Record<string, unknown>
      const lookupFieldPrefix = `${lookup.as}.`

      // Extract conditions that reference the lookup field
      const pushableConditions: Record<string, unknown> = {}
      for (const [field, condition] of Object.entries(match)) {
        if (field.startsWith(lookupFieldPrefix)) {
          const foreignField = field.substring(lookupFieldPrefix.length)
          pushableConditions[foreignField] = condition
        }
      }

      if (Object.keys(pushableConditions).length > 0) {
        result.foreignPreFilter = pushableConditions

        // If we have a pipeline lookup, add the filter to the pipeline
        if (lookup.pipeline) {
          result.optimizedLookup = {
            ...lookup,
            pipeline: [
              { $match: pushableConditions } as PipelineStage,
              ...lookup.pipeline
            ]
          }
        }
      }

      // Only check the first $match after the lookup
      break
    }

    // Stop if we hit a stage that transforms the data
    if ('$group' in stage || '$project' in stage || '$unwind' in stage) {
      break
    }
  }

  return result
}

/**
 * Check if a lookup can use an index-based strategy
 */
export function canUseIndexLookup(lookup: LookupStage): boolean {
  // Simple lookups on _id fields are most efficient
  return lookup.foreignField === '_id'
}

/**
 * Estimate lookup cost based on heuristics
 */
export function estimateLookupCost(
  lookup: LookupStage,
  estimatedDocumentCount: number = 1000
): number {
  let cost = estimatedDocumentCount

  // Nested lookups are more expensive
  if (lookup.pipeline) {
    // Each pipeline stage adds overhead
    cost *= (lookup.pipeline.length + 1)
  }

  // Lookups on indexed fields are cheaper
  if (canUseIndexLookup(lookup)) {
    cost *= 0.1
  }

  return cost
}

/**
 * Suggest a rewritten lookup for specific patterns
 */
export function suggestLookupRewrite(
  lookup: LookupStage
): LookupStage | null {
  // Pattern: Simple equality join can be converted to correlated subquery
  // This is already what we do, so no change needed

  // Pattern: Self-join can sometimes be replaced with window functions
  // SQLite doesn't support this well, so skip

  return null
}
