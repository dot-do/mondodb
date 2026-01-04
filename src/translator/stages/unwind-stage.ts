/**
 * $unwind stage - Deconstructs an array field to output one document per element
 * Translates to SQL using json_each for array expansion
 */

import type { StageResult, StageContext, UnwindStage } from './types'
import { getFieldPath } from './expression-translator'

export function translateUnwindStage(
  unwind: string | UnwindStage,
  context: StageContext
): StageResult {
  const params: unknown[] = []

  // Normalize to UnwindStage format
  const config: UnwindStage = typeof unwind === 'string'
    ? { path: unwind }
    : unwind

  const { path, includeArrayIndex, preserveNullAndEmptyArrays } = config

  // Remove leading $ from path
  const fieldName = path.startsWith('$') ? path.substring(1) : path
  const jsonPath = getFieldPath('$' + fieldName)

  const source = context.previousCte || context.collection
  const cteName = `stage_${context.cteIndex}`

  // Build the join type based on preserveNullAndEmptyArrays
  const joinType = preserveNullAndEmptyArrays ? 'LEFT JOIN' : 'JOIN'

  // Build the SELECT clause
  let selectParts = `json_set(${source}.data, '${jsonPath}', each.value) AS data`

  if (includeArrayIndex) {
    // Include the array index in the output
    selectParts = `json_set(json_set(${source}.data, '${jsonPath}', each.value), '$.${includeArrayIndex}', each.key) AS data`
  }

  const cteExpression = `
    SELECT ${selectParts}
    FROM ${source}
    ${joinType} json_each(json_extract(${source}.data, '${jsonPath}')) AS each
  `

  return {
    cteExpression: cteExpression.trim(),
    cteName,
    params,
    transformsShape: true
  }
}
