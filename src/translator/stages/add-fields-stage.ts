/**
 * $addFields stage - Adds new fields to documents
 * Translates to SQL using json_set
 */

import type { StageResult, StageContext } from './types'
import { translateExpressionValue, isFieldReference, getFieldPath } from './expression-translator'

export function translateAddFieldsStage(
  addFields: Record<string, unknown>,
  context: StageContext
): StageResult {
  const params: unknown[] = []
  const source = context.previousCte || context.collection

  // Build nested json_set calls for each field
  let result = 'data'

  for (const [field, value] of Object.entries(addFields)) {
    const jsonPath = `'$.${field}'`

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Expression
      const exprSql = translateExpressionValue(value, params)
      result = `json_set(${result}, ${jsonPath}, ${exprSql})`
    } else if (isFieldReference(value)) {
      // Field reference
      const fieldPath = getFieldPath(value)
      result = `json_set(${result}, ${jsonPath}, json_extract(data, '${fieldPath}'))`
    } else if (typeof value === 'string') {
      params.push(value)
      result = `json_set(${result}, ${jsonPath}, ?)`
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      result = `json_set(${result}, ${jsonPath}, ${JSON.stringify(value)})`
    } else if (Array.isArray(value)) {
      params.push(JSON.stringify(value))
      result = `json_set(${result}, ${jsonPath}, json(?))`
    }
  }

  return {
    selectClause: `${result} AS data`,
    params,
    transformsShape: true
  }
}
