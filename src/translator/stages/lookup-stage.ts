/**
 * $lookup stage - Performs a left outer join with another collection
 * Translates to SQL LEFT JOIN or subquery
 */

import type { StageResult, StageContext, LookupStage } from './types'
import { getFieldPath } from './expression-translator'

export function translateLookupStage(
  lookup: LookupStage,
  context: StageContext
): StageResult {
  const params: unknown[] = []
  const { localField, foreignField } = lookup

  if (localField && foreignField) {
    // Simple lookup with localField/foreignField
    return translateSimpleLookup(lookup, context, params)
  } else if (lookup.let && lookup.pipeline) {
    // Pipeline lookup
    return translatePipelineLookup(lookup, context, params)
  }

  throw new Error('$lookup requires either localField/foreignField or let/pipeline')
}

function translateSimpleLookup(
  lookup: LookupStage,
  context: StageContext,
  params: unknown[]
): StageResult {
  const { from, localField, foreignField, as } = lookup

  const source = context.previousCte || context.collection
  const localPath = getFieldPath('$' + localField!)
  const foreignPath = getFieldPath('$' + foreignField!)

  // Use a subquery to collect matching documents as a JSON array
  const cteName = `stage_${context.cteIndex}`
  const cteExpression = `
    SELECT
      ${source}.data,
      COALESCE(
        (SELECT json_group_array(${from}.data)
         FROM ${from}
         WHERE json_extract(${from}.data, '${foreignPath}') = json_extract(${source}.data, '${localPath}')),
        '[]'
      ) AS lookup_result
    FROM ${source}
  `

  // The result should merge lookup_result into data as the 'as' field
  const selectClause = `json_set(data, '$.${as}', json(lookup_result)) AS data`

  return {
    cteExpression: cteExpression.trim(),
    cteName,
    selectClause,
    params,
    transformsShape: true
  }
}

function translatePipelineLookup(
  lookup: LookupStage,
  context: StageContext,
  params: unknown[]
): StageResult {
  const { from, as } = lookup

  // For pipeline lookups, we need to handle variable substitution
  // This is a simplified implementation
  const source = context.previousCte || context.collection
  const cteName = `stage_${context.cteIndex}`

  // Build the inner query for the lookup
  // In a full implementation, we'd translate the pipeline with variable substitution
  const cteExpression = `
    SELECT
      ${source}.data,
      COALESCE(
        (SELECT json_group_array(${from}.data) FROM ${from}),
        '[]'
      ) AS lookup_result
    FROM ${source}
  `

  const selectClause = `json_set(data, '$.${as}', json(lookup_result)) AS data`

  return {
    cteExpression: cteExpression.trim(),
    cteName,
    selectClause,
    params,
    transformsShape: true
  }
}
