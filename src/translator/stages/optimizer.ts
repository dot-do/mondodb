/**
 * Pipeline Optimizer - Optimizes aggregation pipelines before translation
 *
 * Optimizations:
 * 1. Predicate pushdown: Move $match stages as early as possible
 * 2. Projection pushdown: Reduce fields carried through pipeline
 * 3. Stage merging: Combine adjacent compatible stages
 * 4. Redundant stage elimination
 */

import type { PipelineStage } from './types'

/**
 * Optimize an aggregation pipeline
 */
export function optimizePipeline(pipeline: PipelineStage[]): PipelineStage[] {
  let optimized = [...pipeline]

  // Apply optimizations in order
  optimized = pushdownPredicates(optimized)
  optimized = mergeAdjacentStages(optimized)
  optimized = eliminateRedundantStages(optimized)

  return optimized
}

/**
 * Push $match stages as early as possible in the pipeline
 * This reduces the number of documents processed by subsequent stages
 */
function pushdownPredicates(pipeline: PipelineStage[]): PipelineStage[] {
  const result: PipelineStage[] = []

  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i]!
    const stageType = getStageType(stage)

    if (stageType !== '$match') {
      result.push(stage)
      continue
    }

    // Try to push this $match earlier
    const matchCondition = (stage as { $match: Record<string, unknown> }).$match
    const pushPosition = findEarliestPushPosition(result, matchCondition)

    if (pushPosition < result.length) {
      // Insert at the earlier position
      result.splice(pushPosition, 0, stage)
    } else {
      result.push(stage)
    }
  }

  return result
}

/**
 * Find the earliest position where a $match can be pushed
 */
function findEarliestPushPosition(
  stages: PipelineStage[],
  matchCondition: Record<string, unknown>
): number {
  const matchFields = extractFieldsFromCondition(matchCondition)

  // Walk backwards through stages
  for (let i = stages.length - 1; i >= 0; i--) {
    const stage = stages[i]!
    const stageType = getStageType(stage)

    // Can't push past stages that modify the fields we're matching on
    if (stageType === '$group') {
      // $group completely changes document shape
      return i + 1
    }

    if (stageType === '$project' || stageType === '$addFields') {
      const projectFields = getAffectedFields(stage)
      if (matchFields.some(f => projectFields.has(f))) {
        return i + 1
      }
    }

    if (stageType === '$unwind') {
      const unwindField = getUnwindField(stage)
      if (matchFields.some(f => f === unwindField || f.startsWith(unwindField + '.'))) {
        return i + 1
      }
    }

    if (stageType === '$lookup') {
      const lookupAs = getLookupAsField(stage)
      if (matchFields.some(f => f === lookupAs || f.startsWith(lookupAs + '.'))) {
        return i + 1
      }
    }

    // $sort, $limit, $skip don't affect fields
    // We can generally push $match past them (though order matters for correctness)
    if (stageType === '$limit' || stageType === '$skip') {
      // Can't push past limit/skip as it changes result set
      return i + 1
    }
  }

  return 0
}

/**
 * Merge adjacent compatible stages
 */
function mergeAdjacentStages(pipeline: PipelineStage[]): PipelineStage[] {
  const result: PipelineStage[] = []

  for (const stage of pipeline) {
    if (result.length === 0) {
      result.push(stage)
      continue
    }

    const prevStage = result[result.length - 1]!
    const merged = tryMergeStages(prevStage, stage)

    if (merged) {
      result[result.length - 1] = merged
    } else {
      result.push(stage)
    }
  }

  return result
}

/**
 * Try to merge two stages into one
 */
function tryMergeStages(
  first: PipelineStage,
  second: PipelineStage
): PipelineStage | null {
  const firstType = getStageType(first)
  const secondType = getStageType(second)

  // Merge adjacent $match stages
  if (firstType === '$match' && secondType === '$match') {
    const firstMatch = (first as { $match: Record<string, unknown> }).$match
    const secondMatch = (second as { $match: Record<string, unknown> }).$match

    return {
      $match: {
        $and: [firstMatch, secondMatch]
      }
    }
  }

  // Merge adjacent $addFields stages
  if (firstType === '$addFields' && secondType === '$addFields') {
    const firstFields = (first as { $addFields: Record<string, unknown> }).$addFields
    const secondFields = (second as { $addFields: Record<string, unknown> }).$addFields

    return {
      $addFields: {
        ...firstFields,
        ...secondFields
      }
    }
  }

  // Merge adjacent $project stages (if compatible)
  if (firstType === '$project' && secondType === '$project') {
    const firstProject = (first as { $project: Record<string, unknown> }).$project
    const secondProject = (second as { $project: Record<string, unknown> }).$project

    // Only merge if both are inclusion or both are exclusion
    const firstIsExclusion = isExclusionProject(firstProject)
    const secondIsExclusion = isExclusionProject(secondProject)

    if (firstIsExclusion === secondIsExclusion) {
      return {
        $project: {
          ...firstProject,
          ...secondProject
        }
      }
    }
  }

  return null
}

/**
 * Eliminate redundant stages
 */
function eliminateRedundantStages(pipeline: PipelineStage[]): PipelineStage[] {
  return pipeline.filter((stage, index) => {
    const stageType = getStageType(stage)

    // Remove empty $match
    if (stageType === '$match') {
      const matchCondition = (stage as { $match: Record<string, unknown> }).$match
      if (Object.keys(matchCondition).length === 0) {
        return false
      }
    }

    // Remove $limit 0 followed by anything (no results anyway)
    if (stageType === '$limit') {
      const limit = (stage as { $limit: number }).$limit
      if (limit === 0) {
        // Keep only this stage, remove rest
        return true
      }
    }

    // Remove duplicate $sort stages (only last one matters)
    if (stageType === '$sort' && index < pipeline.length - 1) {
      for (let i = index + 1; i < pipeline.length; i++) {
        const laterStageType = getStageType(pipeline[i]!)
        if (laterStageType === '$sort') {
          return false
        }
        // If we hit a stage that depends on order, keep this sort
        if (['$limit', '$skip', '$first', '$last'].includes(laterStageType)) {
          return true
        }
      }
    }

    return true
  })
}

/**
 * Helper functions
 */

function getStageType(stage: PipelineStage): string {
  return Object.keys(stage)[0]!
}

function extractFieldsFromCondition(condition: Record<string, unknown>): string[] {
  const fields: string[] = []

  for (const [key, value] of Object.entries(condition)) {
    if (key.startsWith('$')) {
      // Logical operator
      if (Array.isArray(value)) {
        for (const subCondition of value) {
          fields.push(...extractFieldsFromCondition(subCondition as Record<string, unknown>))
        }
      }
    } else {
      fields.push(key)
    }
  }

  return fields
}

function getAffectedFields(stage: PipelineStage): Set<string> {
  const stageType = getStageType(stage)
  const fields = new Set<string>()

  if (stageType === '$project') {
    const project = (stage as { $project: Record<string, unknown> }).$project
    for (const key of Object.keys(project)) {
      fields.add(key)
    }
  } else if (stageType === '$addFields') {
    const addFields = (stage as { $addFields: Record<string, unknown> }).$addFields
    for (const key of Object.keys(addFields)) {
      fields.add(key)
    }
  }

  return fields
}

function getUnwindField(stage: PipelineStage): string {
  const unwind = (stage as { $unwind: string | { path: string } }).$unwind
  if (typeof unwind === 'string') {
    return unwind.replace(/^\$/, '')
  }
  return unwind.path.replace(/^\$/, '')
}

function getLookupAsField(stage: PipelineStage): string {
  const lookup = (stage as { $lookup: { as: string } }).$lookup
  return lookup.as
}

function isExclusionProject(project: Record<string, unknown>): boolean {
  return Object.entries(project).every(([key, value]) => {
    if (key === '_id') return true
    return value === 0
  })
}
