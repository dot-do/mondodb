/**
 * $sort stage - Sorts documents by specified fields
 * Translates to SQL ORDER BY clause
 */

import type { StageResult, StageContext } from './types'
import { getFieldPath } from './expression-translator'

export function translateSortStage(
  sort: Record<string, 1 | -1>,
  context: StageContext
): StageResult {
  const orderParts: string[] = []

  for (const [field, direction] of Object.entries(sort)) {
    if (direction !== 1 && direction !== -1) {
      throw new Error('$sort direction must be 1 or -1')
    }

    const path = getFieldPath('$' + field)
    const dirStr = direction === 1 ? 'ASC' : 'DESC'
    orderParts.push(`json_extract(data, '${path}') ${dirStr}`)
  }

  return {
    orderByClause: orderParts.join(', '),
    params: []
  }
}
