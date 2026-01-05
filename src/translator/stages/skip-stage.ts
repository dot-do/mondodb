/**
 * $skip stage - Skips a number of documents
 * Translates to SQL OFFSET clause
 */

import type { StageResult, StageContext } from './types'

export function translateSkipStage(
  skip: number,
  _context: StageContext
): StageResult {
  return {
    offsetClause: `OFFSET ${skip}`,
    params: []
  }
}
