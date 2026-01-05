/**
 * Stage Editor Types
 * Types and interfaces for MongoDB aggregation pipeline stage editing
 */

// All supported stage types (top 10)
export type StageType =
  | '$match'
  | '$project'
  | '$group'
  | '$sort'
  | '$limit'
  | '$skip'
  | '$unwind'
  | '$lookup'
  | '$addFields'
  | '$count'

// Comparison operators for $match
export type ComparisonOperator =
  | '$eq'
  | '$ne'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'
  | '$in'
  | '$nin'
  | '$regex'
  | '$exists'

// Accumulator operators for $group
export type AccumulatorOperator =
  | '$sum'
  | '$avg'
  | '$min'
  | '$max'
  | '$first'
  | '$last'
  | '$push'
  | '$addToSet'
  | '$count'
  | '$stdDevPop'
  | '$stdDevSamp'

// Sort direction
export type SortDirection = 1 | -1

// Match condition
export interface MatchCondition {
  id: string
  field: string
  operator: ComparisonOperator
  value: string
}

// Group accumulator
export interface GroupAccumulator {
  id: string
  outputField: string
  operator: AccumulatorOperator
  inputField: string
}

// Project field
export interface ProjectField {
  id: string
  field: string
  include: boolean | string // true/false for inclusion, or expression string
  isExpression: boolean
}

// Sort field
export interface SortField {
  id: string
  field: string
  direction: SortDirection
}

// Add field entry
export interface AddFieldEntry {
  id: string
  field: string
  expression: string
}

// Lookup configuration
export interface LookupConfig {
  from: string
  localField: string
  foreignField: string
  as: string
}

// Unwind configuration
export interface UnwindConfig {
  path: string
  includeArrayIndex?: string
  preserveNullAndEmptyArrays: boolean
}

// Base stage interface
export interface BaseStage {
  id: string
  type: StageType
  enabled: boolean
}

// Stage-specific interfaces
export interface MatchStage extends BaseStage {
  type: '$match'
  conditions: MatchCondition[]
  useRawJson: boolean
  rawJson: string
}

export interface ProjectStage extends BaseStage {
  type: '$project'
  fields: ProjectField[]
  useRawJson: boolean
  rawJson: string
}

export interface GroupStage extends BaseStage {
  type: '$group'
  groupByField: string // '' for null, field name for $fieldName
  groupByExpression: string // For compound keys
  useCompoundKey: boolean
  accumulators: GroupAccumulator[]
  useRawJson: boolean
  rawJson: string
}

export interface SortStage extends BaseStage {
  type: '$sort'
  fields: SortField[]
}

export interface LimitStage extends BaseStage {
  type: '$limit'
  limit: number
}

export interface SkipStage extends BaseStage {
  type: '$skip'
  skip: number
}

export interface UnwindStage extends BaseStage {
  type: '$unwind'
  config: UnwindConfig
}

export interface LookupStage extends BaseStage {
  type: '$lookup'
  config: LookupConfig
  usePipeline: boolean
  pipelineJson: string
}

export interface AddFieldsStage extends BaseStage {
  type: '$addFields'
  fields: AddFieldEntry[]
  useRawJson: boolean
  rawJson: string
}

export interface CountStage extends BaseStage {
  type: '$count'
  outputField: string
}

// Union type for all stages
export type AggregationStage =
  | MatchStage
  | ProjectStage
  | GroupStage
  | SortStage
  | LimitStage
  | SkipStage
  | UnwindStage
  | LookupStage
  | AddFieldsStage
  | CountStage

// Stage metadata for UI
export interface StageMetadata {
  type: StageType
  label: string
  description: string
  icon: string
  color: string
}

// Validation result
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

// Stage editor props
export interface StageEditorProps {
  stage: AggregationStage
  index: number
  onChange: (stage: AggregationStage) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDuplicate?: () => void
  collapsible?: boolean
  defaultCollapsed?: boolean
  availableFields?: string[]
  availableCollections?: string[]
}
