/**
 * Type Guard Functions for MongoDB Aggregation Pipeline Stages
 *
 * These type guard functions are used to narrow the AggregationStage union type
 * to specific stage types. Each function returns a type predicate that tells
 * TypeScript the specific type of the stage when the function returns true.
 */

import type {
  AggregationStage,
  MatchStage,
  GroupStage,
  SortStage,
  ProjectStage,
  LimitStage,
  SkipStage,
  UnwindStage,
  LookupStage,
  AddFieldsStage,
  CountStage,
} from './types'

/**
 * Type guard for MatchStage
 * Returns true if the stage is a $match stage
 */
export function isMatchStage(stage: AggregationStage): stage is MatchStage {
  return stage != null && stage.type === '$match'
}

/**
 * Type guard for GroupStage
 * Returns true if the stage is a $group stage
 */
export function isGroupStage(stage: AggregationStage): stage is GroupStage {
  return stage != null && stage.type === '$group'
}

/**
 * Type guard for SortStage
 * Returns true if the stage is a $sort stage
 */
export function isSortStage(stage: AggregationStage): stage is SortStage {
  return stage != null && stage.type === '$sort'
}

/**
 * Type guard for ProjectStage
 * Returns true if the stage is a $project stage
 */
export function isProjectStage(stage: AggregationStage): stage is ProjectStage {
  return stage != null && stage.type === '$project'
}

/**
 * Type guard for LimitStage
 * Returns true if the stage is a $limit stage
 */
export function isLimitStage(stage: AggregationStage): stage is LimitStage {
  return stage != null && stage.type === '$limit'
}

/**
 * Type guard for SkipStage
 * Returns true if the stage is a $skip stage
 */
export function isSkipStage(stage: AggregationStage): stage is SkipStage {
  return stage != null && stage.type === '$skip'
}

/**
 * Type guard for UnwindStage
 * Returns true if the stage is a $unwind stage
 */
export function isUnwindStage(stage: AggregationStage): stage is UnwindStage {
  return stage != null && stage.type === '$unwind'
}

/**
 * Type guard for LookupStage
 * Returns true if the stage is a $lookup stage
 */
export function isLookupStage(stage: AggregationStage): stage is LookupStage {
  return stage != null && stage.type === '$lookup'
}

/**
 * Type guard for AddFieldsStage
 * Returns true if the stage is a $addFields stage
 */
export function isAddFieldsStage(stage: AggregationStage): stage is AddFieldsStage {
  return stage != null && stage.type === '$addFields'
}

/**
 * Type guard for CountStage
 * Returns true if the stage is a $count stage
 */
export function isCountStage(stage: AggregationStage): stage is CountStage {
  return stage != null && stage.type === '$count'
}
