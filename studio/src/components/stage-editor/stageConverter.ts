/**
 * Stage Converter Utility
 *
 * Converts UI AggregationStage types to MongoDB pipeline format.
 * Extracted from ExportToCode.tsx and QueryBuilder.tsx to provide
 * a shared, well-tested conversion layer.
 *
 * @module stageConverter
 */

import type {
  AggregationStage,
  MatchStage,
  ProjectStage,
  GroupStage,
  SortStage,
  LimitStage,
  SkipStage,
  UnwindStage,
  LookupStage,
  AddFieldsStage,
  CountStage,
  MatchCondition,
} from './types'

/**
 * Converts a string value to the appropriate JavaScript type based on valueType.
 *
 * @param value - The string value to convert
 * @param valueType - The target type ('string', 'number', 'boolean', 'null', 'auto')
 * @returns The converted value
 */
function convertValue(value: string, valueType?: string): unknown {
  if (valueType === 'null') {
    return null
  }

  if (valueType === 'boolean') {
    return value === 'true'
  }

  if (valueType === 'number') {
    return Number(value)
  }

  if (valueType === 'string') {
    return value
  }

  // Auto-detect type
  if (valueType === 'auto' || valueType === undefined) {
    // Try JSON parse first (for arrays like ["electronics", "books"])
    if (value.startsWith('[') || value.startsWith('{')) {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }

    // Try number
    const num = Number(value)
    if (!isNaN(num) && value.trim() !== '') {
      return num
    }

    // Try boolean
    if (value === 'true') return true
    if (value === 'false') return false

    // Try null
    if (value === 'null') return null

    // Return as string
    return value
  }

  return value
}

/**
 * Converts a match condition to MongoDB query format.
 *
 * @param condition - The match condition to convert
 * @returns The MongoDB query object for this condition
 */
function convertMatchCondition(condition: MatchCondition): Record<string, unknown> {
  const { field, operator, value, valueType, regexOptions } = condition

  const convertedValue = convertValue(value, valueType)

  if (operator === '$regex') {
    const regexObj: Record<string, unknown> = { $regex: convertedValue }
    if (regexOptions) {
      regexObj.$options = regexOptions
    }
    return { [field]: regexObj }
  }

  return { [field]: { [operator]: convertedValue } }
}

/**
 * Converts a MatchStage to MongoDB $match format.
 *
 * @param stage - The MatchStage to convert
 * @returns The MongoDB $match stage object
 */
function convertMatchStage(stage: MatchStage): Record<string, unknown> {
  if (stage.useRawJson && stage.rawJson) {
    return { $match: JSON.parse(stage.rawJson) }
  }

  if (stage.conditions.length === 0) {
    return { $match: {} }
  }

  // Single condition without logical operator
  if (stage.conditions.length === 1) {
    const condition = convertMatchCondition(stage.conditions[0])
    return { $match: condition }
  }

  // Multiple conditions with logical operator
  if (stage.logicalOperator === '$or' || stage.logicalOperator === '$and') {
    const conditions = stage.conditions.map(convertMatchCondition)
    return { $match: { [stage.logicalOperator]: conditions } }
  }

  // Multiple conditions without explicit logical operator - merge into single object
  const merged: Record<string, unknown> = {}
  for (const cond of stage.conditions) {
    const converted = convertMatchCondition(cond)
    Object.assign(merged, converted)
  }
  return { $match: merged }
}

/**
 * Converts a ProjectStage to MongoDB $project format.
 *
 * @param stage - The ProjectStage to convert
 * @returns The MongoDB $project stage object
 */
function convertProjectStage(stage: ProjectStage): Record<string, unknown> {
  if (stage.useRawJson && stage.rawJson) {
    return { $project: JSON.parse(stage.rawJson) }
  }

  const projectObj: Record<string, unknown> = {}

  if (stage.excludeId) {
    projectObj._id = 0
  }

  for (const field of stage.fields) {
    if (field.isExpression && typeof field.include === 'string') {
      // Parse expression string to object
      try {
        projectObj[field.field] = JSON.parse(field.include)
      } catch {
        projectObj[field.field] = field.include
      }
    } else {
      projectObj[field.field] = field.include ? 1 : 0
    }
  }

  return { $project: projectObj }
}

/**
 * Converts a GroupStage to MongoDB $group format.
 *
 * @param stage - The GroupStage to convert
 * @returns The MongoDB $group stage object
 */
function convertGroupStage(stage: GroupStage): Record<string, unknown> {
  if (stage.useRawJson && stage.rawJson) {
    return { $group: JSON.parse(stage.rawJson) }
  }

  const groupObj: Record<string, unknown> = {}

  // Determine _id value
  if (stage.useCompoundKey && stage.groupByExpression) {
    try {
      groupObj._id = JSON.parse(stage.groupByExpression)
    } catch {
      groupObj._id = stage.groupByExpression
    }
  } else if (stage.groupByField) {
    groupObj._id = `$${stage.groupByField}`
  } else {
    groupObj._id = null
  }

  // Add accumulators
  for (const acc of stage.accumulators) {
    if (acc.useConstant) {
      groupObj[acc.outputField] = { [acc.operator]: acc.constantValue }
    } else {
      groupObj[acc.outputField] = { [acc.operator]: `$${acc.inputField}` }
    }
  }

  return { $group: groupObj }
}

/**
 * Converts a SortStage to MongoDB $sort format.
 *
 * @param stage - The SortStage to convert
 * @returns The MongoDB $sort stage object
 */
function convertSortStage(stage: SortStage): Record<string, unknown> {
  const sortObj: Record<string, number> = {}

  for (const field of stage.fields) {
    sortObj[field.field] = field.direction
  }

  return { $sort: sortObj }
}

/**
 * Converts a LimitStage to MongoDB $limit format.
 *
 * @param stage - The LimitStage to convert
 * @returns The MongoDB $limit stage object
 */
function convertLimitStage(stage: LimitStage): Record<string, unknown> {
  return { $limit: stage.limit }
}

/**
 * Converts a SkipStage to MongoDB $skip format.
 *
 * @param stage - The SkipStage to convert
 * @returns The MongoDB $skip stage object
 */
function convertSkipStage(stage: SkipStage): Record<string, unknown> {
  return { $skip: stage.skip }
}

/**
 * Ensures a path has a $ prefix for MongoDB field references.
 *
 * @param path - The field path
 * @returns The path with $ prefix
 */
function ensureDollarPrefix(path: string): string {
  return path.startsWith('$') ? path : `$${path}`
}

/**
 * Converts an UnwindStage to MongoDB $unwind format.
 *
 * @param stage - The UnwindStage to convert
 * @returns The MongoDB $unwind stage object
 */
function convertUnwindStage(stage: UnwindStage): Record<string, unknown> {
  const { path, preserveNullAndEmptyArrays, includeArrayIndex } = stage.config
  const normalizedPath = ensureDollarPrefix(path)

  // Simple form: just the path string
  if (!preserveNullAndEmptyArrays && !includeArrayIndex) {
    return { $unwind: normalizedPath }
  }

  // Extended form: object with options
  const unwindObj: Record<string, unknown> = {
    path: normalizedPath,
  }

  if (includeArrayIndex) {
    unwindObj.includeArrayIndex = includeArrayIndex
  }

  if (preserveNullAndEmptyArrays) {
    unwindObj.preserveNullAndEmptyArrays = true
  }

  return { $unwind: unwindObj }
}

/**
 * Converts a LookupStage to MongoDB $lookup format.
 *
 * @param stage - The LookupStage to convert
 * @returns The MongoDB $lookup stage object
 */
function convertLookupStage(stage: LookupStage): Record<string, unknown> {
  const { from, localField, foreignField, as } = stage.config

  // Pipeline-based lookup
  if (stage.usePipeline && stage.pipelineJson) {
    const lookupObj: Record<string, unknown> = {
      from,
      as,
    }

    if (stage.letVariables) {
      try {
        lookupObj.let = JSON.parse(stage.letVariables)
      } catch {
        // Invalid let variables JSON, skip
      }
    }

    try {
      lookupObj.pipeline = JSON.parse(stage.pipelineJson)
    } catch {
      lookupObj.pipeline = []
    }

    return { $lookup: lookupObj }
  }

  // Simple equality lookup
  return {
    $lookup: {
      from,
      localField,
      foreignField,
      as,
    },
  }
}

/**
 * Converts an AddFieldsStage to MongoDB $addFields format.
 *
 * @param stage - The AddFieldsStage to convert
 * @returns The MongoDB $addFields stage object
 */
function convertAddFieldsStage(stage: AddFieldsStage): Record<string, unknown> {
  if (stage.useRawJson && stage.rawJson) {
    return { $addFields: JSON.parse(stage.rawJson) }
  }

  const addFieldsObj: Record<string, unknown> = {}

  for (const field of stage.fields) {
    try {
      addFieldsObj[field.field] = JSON.parse(field.expression)
    } catch {
      addFieldsObj[field.field] = field.expression
    }
  }

  return { $addFields: addFieldsObj }
}

/**
 * Converts a CountStage to MongoDB $count format.
 *
 * @param stage - The CountStage to convert
 * @returns The MongoDB $count stage object
 */
function convertCountStage(stage: CountStage): Record<string, unknown> {
  return { $count: stage.outputField }
}

/**
 * Converts a single UI AggregationStage to MongoDB pipeline format.
 *
 * @param stage - The AggregationStage to convert
 * @returns The MongoDB pipeline stage object
 * @throws Error if rawJson is enabled but contains invalid JSON
 *
 * @example
 * ```ts
 * const matchStage: MatchStage = {
 *   id: '1',
 *   type: '$match',
 *   enabled: true,
 *   conditions: [{ id: 'c1', field: 'status', operator: '$eq', value: 'active', valueType: 'string' }],
 *   useRawJson: false,
 *   rawJson: '',
 * }
 * const result = stageToMongoDBFormat(matchStage)
 * // { $match: { status: { $eq: 'active' } } }
 * ```
 */
export function stageToMongoDBFormat(stage: AggregationStage): Record<string, unknown> {
  switch (stage.type) {
    case '$match':
      return convertMatchStage(stage)
    case '$project':
      return convertProjectStage(stage)
    case '$group':
      return convertGroupStage(stage)
    case '$sort':
      return convertSortStage(stage)
    case '$limit':
      return convertLimitStage(stage)
    case '$skip':
      return convertSkipStage(stage)
    case '$unwind':
      return convertUnwindStage(stage)
    case '$lookup':
      return convertLookupStage(stage)
    case '$addFields':
      return convertAddFieldsStage(stage)
    case '$count':
      return convertCountStage(stage)
    default:
      // For unsupported stage types, return empty object
      return {}
  }
}

/**
 * Converts an array of UI AggregationStages to a MongoDB aggregation pipeline.
 * Disabled stages are automatically filtered out.
 *
 * @param stages - The array of AggregationStages to convert
 * @returns The MongoDB aggregation pipeline array
 *
 * @example
 * ```ts
 * const stages: AggregationStage[] = [
 *   { id: '1', type: '$match', enabled: true, ... },
 *   { id: '2', type: '$sort', enabled: false, ... }, // Disabled, will be excluded
 *   { id: '3', type: '$limit', enabled: true, limit: 10 },
 * ]
 * const pipeline = stagesToPipeline(stages)
 * // [{ $match: {...} }, { $limit: 10 }]
 * ```
 */
export function stagesToPipeline(stages: AggregationStage[]): Record<string, unknown>[] {
  return stages
    .filter((stage) => stage.enabled)
    .map((stage) => stageToMongoDBFormat(stage))
}
