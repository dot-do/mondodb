/**
 * $project stage - Reshapes documents by including, excluding, or computing fields
 * Translates to SQL SELECT with json_object, json_remove, or computed expressions
 */

import type { StageResult, StageContext } from './types'
import { translateExpression, isFieldReference, getFieldPath } from './expression-translator'

export function translateProjectStage(
  projection: Record<string, unknown>,
  context: StageContext
): StageResult {
  const params: unknown[] = []
  const fields = Object.entries(projection)

  // Check if it's an exclusion projection (all values are 0 except _id)
  const isExclusion = fields.every(([key, value]) => {
    if (key === '_id') return true
    return value === 0
  })

  if (isExclusion) {
    return translateExclusionProject(projection, context, params)
  }

  // Inclusion or computed projection
  return translateInclusionProject(projection, context, params)
}

function translateExclusionProject(
  projection: Record<string, unknown>,
  context: StageContext,
  params: unknown[]
): StageResult {
  const fieldsToRemove = Object.entries(projection)
    .filter(([key, value]) => value === 0 && key !== '_id')
    .map(([key]) => `'$.${key}'`)

  const source = context.previousCte || context.collection
  const selectClause = fieldsToRemove.length > 0
    ? `json_remove(data, ${fieldsToRemove.join(', ')}) AS data`
    : 'data'

  return {
    selectClause,
    params
  }
}

function translateInclusionProject(
  projection: Record<string, unknown>,
  context: StageContext,
  params: unknown[]
): StageResult {
  const jsonParts: string[] = []

  for (const [key, value] of Object.entries(projection)) {
    if (value === 1) {
      // Include existing field
      jsonParts.push(`'${key}', json_extract(data, '$.${key}')`)
    } else if (typeof value === 'string' && value.startsWith('$')) {
      // Field reference (renaming)
      const fieldPath = getFieldPath(value)
      jsonParts.push(`'${key}', json_extract(data, '${fieldPath}')`)
    } else if (typeof value === 'object' && value !== null) {
      // Expression
      const exprSql = translateExpression(value as Record<string, unknown>, params)
      jsonParts.push(`'${key}', ${exprSql}`)
    } else if (value !== 0) {
      // Literal value
      if (typeof value === 'string') {
        params.push(value)
        jsonParts.push(`'${key}', ?`)
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        jsonParts.push(`'${key}', ${JSON.stringify(value)}`)
      }
    }
  }

  const selectClause = `json_object(${jsonParts.join(', ')}) AS data`

  return {
    selectClause,
    params,
    transformsShape: true
  }
}
