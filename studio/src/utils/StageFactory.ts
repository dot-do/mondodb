/**
 * StageFactory
 * Factory utility for creating properly initialized aggregation pipeline stages
 * with default values and unique IDs.
 */

import type {
  StageType,
  BaseStage,
  MatchStage,
  GroupStage,
  ProjectStage,
  SortStage,
  LimitStage,
  SkipStage,
  UnwindStage,
  LookupStage,
  AddFieldsStage,
  CountStage,
} from '../components/stage-editor/types'

/**
 * Generates a unique ID for stages
 */
function generateId(): string {
  return `stage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Creates a base stage with common properties
 */
function createBaseStage(type: StageType): BaseStage {
  return {
    id: generateId(),
    type,
    enabled: true,
  }
}

/**
 * StageFactory - Creates properly initialized stage objects with unique IDs
 */
export const StageFactory = {
  /**
   * Creates a new stage of the specified type with default values
   * @param type - The stage type (e.g., '$match', '$group', etc.)
   * @returns A properly initialized stage object
   * @throws Error if the stage type is invalid or unsupported
   */
  create(type: StageType): BaseStage {
    // Validate input
    if (type === null || type === undefined || type === '') {
      throw new Error('Invalid stage type: stage type cannot be null, undefined, or empty')
    }

    if (typeof type !== 'string' || !type.startsWith('$')) {
      throw new Error(`Invalid stage type: "${type}" must start with $`)
    }

    switch (type) {
      case '$match':
        return {
          ...createBaseStage('$match'),
          type: '$match',
          conditions: [],
          useRawJson: false,
          rawJson: '',
        } as MatchStage

      case '$group':
        return {
          ...createBaseStage('$group'),
          type: '$group',
          groupByField: '',
          groupByExpression: '',
          useCompoundKey: false,
          accumulators: [],
          useRawJson: false,
          rawJson: '',
        } as GroupStage

      case '$project':
        return {
          ...createBaseStage('$project'),
          type: '$project',
          fields: [],
          useRawJson: false,
          rawJson: '',
        } as ProjectStage

      case '$sort':
        return {
          ...createBaseStage('$sort'),
          type: '$sort',
          fields: [],
        } as SortStage

      case '$limit':
        return {
          ...createBaseStage('$limit'),
          type: '$limit',
          limit: 10,
        } as LimitStage

      case '$skip':
        return {
          ...createBaseStage('$skip'),
          type: '$skip',
          skip: 0,
        } as SkipStage

      case '$unwind':
        return {
          ...createBaseStage('$unwind'),
          type: '$unwind',
          config: {
            path: '',
            preserveNullAndEmptyArrays: false,
          },
        } as UnwindStage

      case '$lookup':
        return {
          ...createBaseStage('$lookup'),
          type: '$lookup',
          config: {
            from: '',
            localField: '',
            foreignField: '',
            as: '',
          },
          usePipeline: false,
          pipelineJson: '',
        } as LookupStage

      case '$addFields':
        return {
          ...createBaseStage('$addFields'),
          type: '$addFields',
          fields: [],
          useRawJson: false,
          rawJson: '',
        } as AddFieldsStage

      case '$count':
        return {
          ...createBaseStage('$count'),
          type: '$count',
          outputField: 'count',
        } as CountStage

      case '$vectorSearch':
        return createBaseStage('$vectorSearch')

      case '$search':
        return createBaseStage('$search')

      default:
        throw new Error(`Unsupported stage type: "${type}"`)
    }
  },
}
