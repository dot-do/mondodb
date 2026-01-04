/**
 * $group stage - Groups documents by a specified expression
 * Translates to SQL GROUP BY with aggregate functions
 */

import type { StageResult, StageContext, GroupStage } from './types'
import { isFieldReference, getFieldPath, translateExpressionValue } from './expression-translator'

export function translateGroupStage(
  group: GroupStage,
  context: StageContext
): StageResult {
  const params: unknown[] = []

  // Validate _id is present
  if (!('_id' in group)) {
    throw new Error('$group requires _id field')
  }

  const { _id, ...accumulators } = group

  // Build GROUP BY clause
  const groupByFields: string[] = []
  const selectParts: string[] = []

  if (_id === null) {
    // Total aggregation - no GROUP BY
    selectParts.push("'_id', NULL")
  } else if (typeof _id === 'string' && isFieldReference(_id)) {
    // Simple field grouping
    const path = getFieldPath(_id)
    const fieldExpr = `json_extract(data, '${path}')`
    groupByFields.push(fieldExpr)
    selectParts.push(`'_id', ${fieldExpr}`)
  } else if (typeof _id === 'object' && _id !== null) {
    // Compound _id
    const idParts: string[] = []
    for (const [key, value] of Object.entries(_id)) {
      if (typeof value === 'string' && isFieldReference(value)) {
        const path = getFieldPath(value)
        const fieldExpr = `json_extract(data, '${path}')`
        groupByFields.push(fieldExpr)
        idParts.push(`'${key}', ${fieldExpr}`)
      }
    }
    selectParts.push(`'_id', json_object(${idParts.join(', ')})`)
  }

  // Build accumulators
  for (const [field, accumulator] of Object.entries(accumulators)) {
    const accSql = translateAccumulator(accumulator as Record<string, unknown>, params)
    selectParts.push(`'${field}', ${accSql}`)
  }

  const selectClause = `json_object(${selectParts.join(', ')}) AS data`
  const groupByClause = groupByFields.length > 0 ? groupByFields.join(', ') : undefined

  return {
    selectClause,
    groupByClause,
    params,
    transformsShape: true
  }
}

function translateAccumulator(
  accumulator: Record<string, unknown>,
  params: unknown[]
): string {
  const operator = Object.keys(accumulator)[0]
  const value = accumulator[operator]

  switch (operator) {
    case '$sum': {
      if (typeof value === 'number') {
        // $sum: 1 counts documents
        return `SUM(${value})`
      }
      const expr = translateExpressionValue(value, params)
      return `SUM(${expr})`
    }

    case '$avg': {
      const expr = translateExpressionValue(value, params)
      return `AVG(${expr})`
    }

    case '$min': {
      const expr = translateExpressionValue(value, params)
      return `MIN(${expr})`
    }

    case '$max': {
      const expr = translateExpressionValue(value, params)
      return `MAX(${expr})`
    }

    case '$count': {
      return 'COUNT(*)'
    }

    case '$first': {
      // SQLite doesn't have FIRST, use MIN with ROWID ordering or subquery
      // For simplicity, we use a workaround
      const expr = translateExpressionValue(value, params)
      return `(SELECT ${expr} FROM (SELECT data FROM ${params.length > 0 ? 'stage' : 'data'} LIMIT 1))`
    }

    case '$last': {
      // Similar workaround for LAST
      const expr = translateExpressionValue(value, params)
      return `(SELECT ${expr} FROM (SELECT data FROM ${params.length > 0 ? 'stage' : 'data'} ORDER BY ROWID DESC LIMIT 1))`
    }

    case '$push': {
      const expr = translateExpressionValue(value, params)
      return `json_group_array(${expr})`
    }

    case '$addToSet': {
      const expr = translateExpressionValue(value, params)
      return `json_group_array(DISTINCT ${expr})`
    }

    default:
      throw new Error(`Unknown accumulator operator: ${operator}`)
  }
}
