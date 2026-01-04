/**
 * $count stage - Counts documents and returns a single document with the count
 * Translates to SELECT COUNT(*) AS fieldName
 */

import type { StageResult, StageContext } from './types'

export function translateCountStage(
  fieldName: string,
  context: StageContext
): StageResult {
  return {
    selectClause: `json_object('${fieldName}', COUNT(*)) AS data`,
    params: [],
    transformsShape: true
  }
}
