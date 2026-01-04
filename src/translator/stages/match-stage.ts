/**
 * $match stage - Filters documents based on a query condition
 * Translates to SQL WHERE clause using QueryTranslator
 */

import { QueryTranslator } from '../query-translator'
import type { StageResult, StageContext } from './types'

export function translateMatchStage(
  matchQuery: Record<string, unknown>,
  context: StageContext
): StageResult {
  const queryTranslator = new QueryTranslator()
  const { sql, params } = queryTranslator.translate(matchQuery)

  return {
    whereClause: sql,
    params
  }
}
