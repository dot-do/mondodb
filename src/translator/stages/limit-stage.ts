/**
 * $limit stage - Limits the number of documents
 * Translates to SQL LIMIT clause
 */

import type { StageResult, StageContext } from './types'

export function translateLimitStage(
  limit: number,
  _context: StageContext
): StageResult {
  return {
    limitClause: `LIMIT ${limit}`,
    params: []
  }
}
