/**
 * $addFields stage - Adds new fields to documents
 * Translates to SQL using json_set (SQLite) or tuple functions (ClickHouse)
 */

import type { StageResult, StageContext } from './types'
import { translateExpressionValue, isFieldReference, getFieldPath } from './expression-translator'
import { validateFieldPath } from '../../utils/sql-safety.js'
import { type SQLDialect, jsonExtract as dialectJsonExtract } from '../dialect'

export function translateAddFieldsStage(
  addFields: Record<string, unknown>,
  context: StageContext
): StageResult {
  const params: unknown[] = []
  const dialect: SQLDialect = context.dialect || 'sqlite'

  // Build nested json_set calls for each field
  let result = 'data'

  for (const [field, value] of Object.entries(addFields)) {
    // Validate field name to prevent SQL injection
    validateFieldPath(field)
    const jsonPath = `'$.${field}'`

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Expression
      const exprSql = translateExpressionValue(value, params, dialect)
      if (dialect === 'clickhouse') {
        // ClickHouse would need different handling
        result = `tuple(${result}, '${field}', ${exprSql})`
      } else {
        result = `json_set(${result}, ${jsonPath}, ${exprSql})`
      }
    } else if (isFieldReference(value)) {
      // Field reference - getFieldPath validates the field
      const fieldPath = getFieldPath(value)
      const fieldExpr = dialectJsonExtract(dialect, 'data', fieldPath)
      if (dialect === 'clickhouse') {
        result = `tuple(${result}, '${field}', ${fieldExpr})`
      } else {
        result = `json_set(${result}, ${jsonPath}, ${fieldExpr})`
      }
    } else if (typeof value === 'string') {
      params.push(value)
      if (dialect === 'clickhouse') {
        result = `tuple(${result}, '${field}', ?)`
      } else {
        result = `json_set(${result}, ${jsonPath}, ?)`
      }
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      if (dialect === 'clickhouse') {
        result = `tuple(${result}, '${field}', ${JSON.stringify(value)})`
      } else {
        result = `json_set(${result}, ${jsonPath}, ${JSON.stringify(value)})`
      }
    } else if (Array.isArray(value)) {
      params.push(JSON.stringify(value))
      if (dialect === 'clickhouse') {
        result = `tuple(${result}, '${field}', ?)`
      } else {
        result = `json_set(${result}, ${jsonPath}, json(?))`
      }
    }
  }

  return {
    selectClause: `${result} AS data`,
    params,
    transformsShape: true
  }
}
