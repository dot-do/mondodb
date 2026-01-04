/**
 * $project stage - Reshapes documents by including, excluding, or computing fields
 * Translates to SQL SELECT with json_object, json_remove, or computed expressions
 */

import type { StageResult, StageContext } from './types'
import { translateExpression, isFieldReference, getFieldPath } from './expression-translator'
import { validateFieldPath } from '../../utils/sql-safety.js'

/**
 * Recursively collect all field references from a $function expression's args
 */
function collectFunctionFieldRefs(expr: unknown): string[] {
  if (!expr || typeof expr !== 'object') return []

  const fields: string[] = []
  const exprObj = expr as Record<string, unknown>

  // Check if this is a $function expression
  if ('$function' in exprObj) {
    const fnSpec = exprObj.$function as { args?: unknown[] }
    if (fnSpec.args && Array.isArray(fnSpec.args)) {
      for (const arg of fnSpec.args) {
        if (isFieldReference(arg)) {
          // Extract field name from $fieldName reference
          const fieldName = (arg as string).substring(1).split('.')[0]
          fields.push(fieldName)
        }
      }
    }
  }

  // Recursively check nested objects
  for (const value of Object.values(exprObj)) {
    if (value && typeof value === 'object') {
      fields.push(...collectFunctionFieldRefs(value))
    }
  }

  return fields
}

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
    .map(([key]) => {
      // Validate field name to prevent SQL injection
      validateFieldPath(key)
      return `'$.${key}'`
    })

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

  // Collect all field references needed by $function expressions
  // These need to be included in the output so the function executor can extract them
  const functionFieldRefs = new Set<string>()
  for (const [key, value] of Object.entries(projection)) {
    if (typeof value === 'object' && value !== null) {
      const refs = collectFunctionFieldRefs(value)
      refs.forEach(ref => functionFieldRefs.add(ref))
    }
  }

  // First, add the explicitly projected fields
  const explicitFields = new Set<string>()
  for (const [key, value] of Object.entries(projection)) {
    // Validate key (output field name) to prevent SQL injection
    validateFieldPath(key)
    explicitFields.add(key)
    if (value === 1) {
      // Include existing field
      jsonParts.push(`'${key}', json_extract(data, '$.${key}')`)
    } else if (typeof value === 'string' && value.startsWith('$')) {
      // Field reference (renaming) - getFieldPath validates the field
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

  // Add source fields needed by $function that aren't already projected
  // These will be used by the function executor to extract argument values
  for (const fieldRef of functionFieldRefs) {
    if (!explicitFields.has(fieldRef)) {
      // Validate field reference to prevent SQL injection
      validateFieldPath(fieldRef)
      jsonParts.push(`'${fieldRef}', json_extract(data, '$.${fieldRef}')`)
    }
  }

  const selectClause = `json_object(${jsonParts.join(', ')}) AS data`

  return {
    selectClause,
    params,
    transformsShape: true
  }
}
