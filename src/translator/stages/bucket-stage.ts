/**
 * $bucket stage - Categorizes documents into groups (buckets) based on a specified expression
 * Translates to SQL using CASE WHEN for bucket boundaries
 */

import type { StageResult, StageContext, BucketStage } from './types'
import { getFieldPath, translateExpressionValue } from './expression-translator'
import { validateFieldPath } from '../../utils/sql-safety.js'

export function translateBucketStage(
  bucket: BucketStage,
  context: StageContext
): StageResult {
  const params: unknown[] = []
  const { groupBy, boundaries, output } = bucket
  const defaultBucket = bucket.default

  // Get the field to bucket on - getFieldPath validates the field reference
  // If not a $ reference, validate directly
  let fieldPath: string
  if (groupBy.startsWith('$')) {
    fieldPath = getFieldPath(groupBy)
  } else {
    validateFieldPath(groupBy)
    fieldPath = `$.${groupBy}`
  }
  const fieldExpr = `json_extract(data, '${fieldPath}')`

  // Build CASE WHEN expression for bucket assignment
  const bucketCases: string[] = []

  for (let i = 0; i < boundaries.length - 1; i++) {
    const lower = boundaries[i]
    const upper = boundaries[i + 1]
    bucketCases.push(`WHEN ${fieldExpr} >= ${lower} AND ${fieldExpr} < ${upper} THEN ${lower}`)
  }

  // Handle default bucket
  const defaultCase = defaultBucket !== undefined
    ? `ELSE '${defaultBucket}'`
    : `ELSE NULL`

  const bucketExpr = `CASE ${bucketCases.join(' ')} ${defaultCase} END`

  // Build the output accumulators
  const selectParts: string[] = [`'_id', ${bucketExpr}`]

  if (output) {
    for (const [field, accumulator] of Object.entries(output)) {
      const accSql = translateBucketAccumulator(accumulator as Record<string, unknown>, params)
      selectParts.push(`'${field}', ${accSql}`)
    }
  } else {
    // Default output is count
    selectParts.push(`'count', COUNT(*)`)
  }

  return {
    selectClause: `json_object(${selectParts.join(', ')}) AS data`,
    groupByClause: bucketExpr,
    params,
    transformsShape: true
  }
}

function translateBucketAccumulator(
  accumulator: Record<string, unknown>,
  params: unknown[]
): string {
  const operator = Object.keys(accumulator)[0]
  const value = accumulator[operator]

  switch (operator) {
    case '$sum': {
      if (typeof value === 'number') {
        return `COUNT(*)`
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

    case '$push': {
      const expr = translateExpressionValue(value, params)
      return `json_group_array(${expr})`
    }

    default:
      throw new Error(`Unknown bucket accumulator operator: ${operator}`)
  }
}
