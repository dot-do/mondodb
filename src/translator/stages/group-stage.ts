/**
 * $group stage - Groups documents by a specified expression
 * Translates to SQL GROUP BY with aggregate functions
 * Supports multiple SQL dialects (SQLite, ClickHouse)
 */

import type { StageResult, StageContext, GroupStage } from './types'
import { isFieldReference, getFieldPath, translateExpressionValue } from './expression-translator'
import { validateFieldPath } from '../../utils/sql-safety.js'
import { type SQLDialect, getAggregationFunctions, jsonExtract as dialectJsonExtract } from '../dialect'

export function translateGroupStage(
  group: GroupStage,
  context: StageContext
): StageResult {
  const params: unknown[] = []
  const dialect: SQLDialect = context.dialect || 'sqlite'

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
    const fieldExpr = dialectJsonExtract(dialect, 'data', path)
    groupByFields.push(fieldExpr)
    selectParts.push(`'_id', ${fieldExpr}`)
  } else if (typeof _id === 'object' && _id !== null) {
    // Compound _id
    const idParts: string[] = []
    for (const [key, value] of Object.entries(_id)) {
      // Validate key to prevent SQL injection
      validateFieldPath(key)
      if (typeof value === 'string' && isFieldReference(value)) {
        // getFieldPath validates the field reference
        const path = getFieldPath(value)
        const fieldExpr = dialectJsonExtract(dialect, 'data', path)
        groupByFields.push(fieldExpr)
        idParts.push(`'${key}', ${fieldExpr}`)
      }
    }
    if (dialect === 'clickhouse') {
      selectParts.push(`'_id', tuple(${idParts.join(', ')})`)
    } else {
      selectParts.push(`'_id', json_object(${idParts.join(', ')})`)
    }
  }

  // Build accumulators
  for (const [field, accumulator] of Object.entries(accumulators)) {
    // Validate field name to prevent SQL injection
    validateFieldPath(field)
    const accSql = translateAccumulator(accumulator as Record<string, unknown>, params, dialect)
    selectParts.push(`'${field}', ${accSql}`)
  }

  const selectClause = dialect === 'clickhouse'
    ? `tuple(${selectParts.join(', ')}) AS data`
    : `json_object(${selectParts.join(', ')}) AS data`
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
  params: unknown[],
  dialect: SQLDialect = 'sqlite'
): string {
  const operator = Object.keys(accumulator)[0]
  const value = accumulator[operator]
  const aggFns = getAggregationFunctions(dialect)

  switch (operator) {
    case '$sum': {
      if (typeof value === 'number') {
        // $sum: 1 counts documents
        if (value === 1) {
          return aggFns.count()
        }
        return aggFns.sum(String(value))
      }
      const expr = translateExpressionValue(value, params, dialect)
      return aggFns.sum(expr)
    }

    case '$avg': {
      const expr = translateExpressionValue(value, params, dialect)
      return aggFns.avg(expr)
    }

    case '$min': {
      const expr = translateExpressionValue(value, params, dialect)
      return aggFns.min(expr)
    }

    case '$max': {
      const expr = translateExpressionValue(value, params, dialect)
      return aggFns.max(expr)
    }

    case '$count': {
      return aggFns.count()
    }

    case '$first': {
      const expr = translateExpressionValue(value, params, dialect)
      return aggFns.first(expr)
    }

    case '$last': {
      const expr = translateExpressionValue(value, params, dialect)
      return aggFns.last(expr)
    }

    case '$push': {
      const expr = translateExpressionValue(value, params, dialect)
      return aggFns.push(expr)
    }

    case '$addToSet': {
      const expr = translateExpressionValue(value, params, dialect)
      return aggFns.addToSet(expr)
    }

    default:
      throw new Error(`Unknown accumulator operator: ${operator}`)
  }
}
