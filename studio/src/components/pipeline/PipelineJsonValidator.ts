/**
 * PipelineJsonValidator
 *
 * Issue: mondodb-u90b - GREEN: Add zod schema validation for pipeline JSON input
 *
 * Validates user-provided pipeline JSON using Zod schemas.
 * Provides detailed error messages with paths for invalid input.
 */

import { z } from 'zod'

/**
 * Validation error information
 */
export interface PipelineValidationError {
  message: string
  path: string
  code: string
}

/**
 * Validation result for pipeline validation
 */
export interface PipelineJsonValidationResult {
  success: boolean
  errors?: PipelineValidationError[]
  warnings?: string[]
  data?: unknown[]
}

/**
 * Validation result for single stage validation
 */
export interface StageJsonValidationResult {
  success: boolean
  errors?: PipelineValidationError[]
  warnings?: string[]
  data?: Record<string, unknown>
}

// =============================================================================
// Valid aggregation stage operators
// =============================================================================

const VALID_STAGE_OPERATORS = new Set([
  '$match',
  '$project',
  '$group',
  '$sort',
  '$limit',
  '$skip',
  '$unwind',
  '$lookup',
  '$addFields',
  '$set',
  '$count',
  '$sample',
  '$facet',
  '$bucket',
  '$bucketAuto',
  '$out',
  '$merge',
  '$replaceRoot',
  '$replaceWith',
  '$redact',
  '$geoNear',
  '$graphLookup',
  '$sortByCount',
  '$unionWith',
  '$densify',
  '$fill',
  '$setWindowFields',
  '$documents',
  '$vectorSearch',
  '$search',
  '$searchMeta',
])

// =============================================================================
// Zod Schemas for specific stage types
// =============================================================================

/**
 * Schema for $lookup stage with required fields
 * Supports both standard lookup and pipeline lookup
 */
const LookupStageSchema = z.object({
  from: z.string().min(1, 'from field is required and cannot be empty'),
}).passthrough().superRefine((obj, ctx) => {
  const hasLocalForeign = 'localField' in obj && 'foreignField' in obj
  const hasPipeline = 'pipeline' in obj

  // Must have either localField/foreignField or pipeline
  if (!hasLocalForeign && !hasPipeline) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'localField and foreignField are required (or pipeline for subquery lookup)',
    })
  }

  // Must have 'as' field
  if (!('as' in obj)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'as field is required',
    })
  }
})

// Valid accumulator operators for $group stage
const VALID_ACCUMULATOR_OPERATORS = new Set([
  '$sum', '$avg', '$first', '$last', '$max', '$min', '$push', '$addToSet',
  '$stdDevPop', '$stdDevSamp', '$count', '$accumulator', '$mergeObjects',
  '$bottom', '$bottomN', '$firstN', '$lastN', '$maxN', '$minN', '$top', '$topN',
])

/**
 * Schema for $group stage (requires _id)
 * Uses a custom validation since _id can be any type including null
 * Also validates accumulator operators
 */
const GroupStageSchema = z.object({}).passthrough().superRefine((obj, ctx) => {
  if (!('_id' in obj)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '_id is required for $group stage',
    })
    return
  }

  // Validate accumulator fields (everything except _id)
  for (const [key, value] of Object.entries(obj)) {
    if (key === '_id') continue

    // Accumulator must be an object with a single operator
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const operators = Object.keys(value).filter((k) => k.startsWith('$'))
      if (operators.length === 1) {
        const op = operators[0]
        if (!VALID_ACCUMULATOR_OPERATORS.has(op!)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown accumulator operator: ${op}`,
          })
        }
      }
    }
  }
})

/**
 * Schema for $unwind stage (string or object with path)
 * Handles both string shorthand ("$field") and object form ({ path: "$field", ... })
 */
const UnwindStageSchema = z.unknown().superRefine((val, ctx) => {
  // String form: must start with $
  if (typeof val === 'string') {
    if (!val.startsWith('$')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'path must start with $',
      })
    }
    return
  }

  // Object form: must have path field starting with $
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>
    if (!('path' in obj)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'path is required for $unwind stage',
      })
      return
    }
    if (typeof obj.path !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'path must be a string',
      })
      return
    }
    if (!obj.path.startsWith('$')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'path must start with $',
      })
    }
    return
  }

  // Neither string nor object
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'path is required for $unwind stage',
  })
})

/**
 * Schema for $limit stage (positive integer, coerces strings)
 */
const LimitStageSchema = z.coerce.number().int('$limit must be an integer').positive('$limit must be a positive integer')

/**
 * Schema for $skip stage (non-negative integer, coerces strings)
 */
const SkipStageSchema = z.coerce.number().int().min(0, '$skip must be a non-negative integer')

/**
 * Schema for $count stage (string field name)
 */
const CountStageSchema = z.string().min(1, '$count field name cannot be empty')

/**
 * Schema for $sample stage
 */
const SampleStageSchema = z.object({
  size: z.number().int().positive('size must be a positive integer'),
})

/**
 * Coerce and validate $sort stage values
 * Sort directions should be 1, -1, or { $meta: "textScore" }
 * Accepts string numbers like '1' and '-1'
 */
function coerceSortStage(value: unknown): { valid: boolean; data?: Record<string, unknown>; error?: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { valid: false, error: '$sort must be an object' }
  }

  const result: Record<string, unknown> = {}
  for (const [key, dir] of Object.entries(value)) {
    if (typeof dir === 'number') {
      if (dir !== 1 && dir !== -1) {
        return { valid: false, error: `Sort direction for '${key}' must be 1 or -1` }
      }
      result[key] = dir
    } else if (typeof dir === 'string') {
      const n = Number(dir)
      if (n !== 1 && n !== -1) {
        return { valid: false, error: `Sort direction for '${key}' must be 1 or -1` }
      }
      result[key] = n
    } else if (typeof dir === 'object' && dir !== null && '$meta' in dir) {
      result[key] = dir
    } else {
      return { valid: false, error: `Invalid sort direction for '${key}'` }
    }
  }

  return { valid: true, data: result }
}

/**
 * Schema for $vectorSearch stage (Atlas Vector Search)
 * Required: path, queryVector, numCandidates, limit
 */
const VectorSearchStageSchema = z.object({
  index: z.string().optional(),
  path: z.string({ required_error: 'path is required for $vectorSearch' }),
  queryVector: z.array(z.number(), { required_error: 'queryVector is required for $vectorSearch' }),
  numCandidates: z.number({ required_error: 'numCandidates is required for $vectorSearch' }).int().positive(),
  limit: z.number({ required_error: 'limit is required for $vectorSearch' }).int().positive(),
  filter: z.record(z.unknown()).optional(),
}).passthrough()

// =============================================================================
// Stage validation
// =============================================================================

/**
 * Validate a single stage based on its operator
 * Returns errors, warnings, and optionally transformed data for coercion
 */
function validateStageByOperator(operator: string, value: unknown): { valid: boolean; errors: string[]; warnings?: string[]; data?: unknown } {
  const errors: string[] = []
  const warnings: string[] = []

  switch (operator) {
    case '$group': {
      const result = GroupStageSchema.safeParse(value)
      if (!result.success) {
        result.error.issues.forEach((e) => {
          errors.push(e.message)
        })
      }
      break
    }

    case '$lookup': {
      const result = LookupStageSchema.safeParse(value)
      if (!result.success) {
        result.error.issues.forEach((e) => {
          errors.push(e.message)
        })
      }
      break
    }

    case '$unwind': {
      const result = UnwindStageSchema.safeParse(value)
      if (!result.success) {
        result.error.issues.forEach((e) => {
          errors.push(e.message)
        })
      } else {
        // Warn if using string form (no preserveNullAndEmptyArrays)
        if (typeof value === 'string') {
          warnings.push('$unwind without preserveNullAndEmptyArrays may remove documents with null or empty arrays')
        } else if (typeof value === 'object' && value !== null) {
          const obj = value as Record<string, unknown>
          if (!('preserveNullAndEmptyArrays' in obj)) {
            warnings.push('$unwind without preserveNullAndEmptyArrays may remove documents with null or empty arrays')
          }
        }
        if (warnings.length > 0) {
          return { valid: true, errors: [], warnings }
        }
      }
      break
    }

    case '$sort': {
      const result = coerceSortStage(value)
      if (!result.valid) {
        errors.push(result.error ?? 'Invalid $sort stage')
      } else {
        return { valid: true, errors: [], data: result.data }
      }
      break
    }

    case '$limit': {
      const result = LimitStageSchema.safeParse(value)
      if (!result.success) {
        result.error.issues.forEach((e) => {
          errors.push(e.message)
        })
      } else {
        // Warn for very large limit values
        if (result.data >= 100000) {
          warnings.push('Large $limit value may impact performance')
        }
        return { valid: true, errors: [], warnings: warnings.length > 0 ? warnings : undefined, data: result.data }
      }
      break
    }

    case '$skip': {
      const result = SkipStageSchema.safeParse(value)
      if (!result.success) {
        result.error.issues.forEach((e) => {
          errors.push(e.message)
        })
      } else {
        return { valid: true, errors: [], data: result.data }
      }
      break
    }

    case '$count': {
      const result = CountStageSchema.safeParse(value)
      if (!result.success) {
        result.error.issues.forEach((e) => {
          errors.push(e.message)
        })
      }
      break
    }

    case '$sample': {
      const result = SampleStageSchema.safeParse(value)
      if (!result.success) {
        result.error.issues.forEach((e) => {
          errors.push(e.message)
        })
      }
      break
    }

    case '$vectorSearch': {
      const result = VectorSearchStageSchema.safeParse(value)
      if (!result.success) {
        result.error.issues.forEach((e) => {
          errors.push(e.message)
        })
      }
      break
    }

    // For other stages, accept any object/value
    default:
      // No additional validation needed
      break
  }

  return { valid: errors.length === 0, errors, warnings: warnings.length > 0 ? warnings : undefined }
}

/**
 * Zod schema for a single aggregation pipeline stage
 */
export const StageJsonSchema = z.record(z.unknown()).refine(
  (obj) => {
    const keys = Object.keys(obj)
    return keys.length === 1 && keys[0]?.startsWith('$')
  },
  { message: 'Stage must have exactly one key starting with $' }
)

/**
 * Zod schema for a complete aggregation pipeline
 */
export const PipelineJsonSchema = z.array(
  z.object({}).passthrough()
)

/**
 * Validates a complete aggregation pipeline JSON
 *
 * @param pipeline - The pipeline array to validate (user-provided JSON)
 * @returns Validation result with errors if invalid, or validated data if valid
 */
export function validatePipelineJson(pipeline: unknown): PipelineJsonValidationResult {
  // Check if input is an array
  if (!Array.isArray(pipeline)) {
    return {
      success: false,
      errors: [
        {
          message: 'Pipeline must be an array',
          path: '',
          code: 'invalid_type',
        },
      ],
    }
  }

  const errors: PipelineValidationError[] = []
  const warnings: string[] = []
  const transformedPipeline: unknown[] = []

  // Validate each stage
  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i]
    const basePath = `[${i}]`

    // Check if stage is null
    if (stage === null) {
      errors.push({
        message: 'Stage cannot be null',
        path: basePath,
        code: 'invalid_type',
      })
      continue
    }

    // Check if stage is an object (and not an array)
    if (typeof stage !== 'object' || Array.isArray(stage)) {
      errors.push({
        message: 'Stage must be an object',
        path: basePath,
        code: 'invalid_type',
      })
      continue
    }

    const keys = Object.keys(stage)

    // Check for empty object
    if (keys.length === 0) {
      errors.push({
        message: 'Stage cannot be empty - must have an operator',
        path: basePath,
        code: 'invalid_stage',
      })
      continue
    }

    // Check for multiple operators
    const operators = keys.filter((k) => k.startsWith('$'))
    if (operators.length > 1) {
      errors.push({
        message: 'Stage can only have a single operator',
        path: basePath,
        code: 'multiple_operators',
      })
      continue
    }

    // Get the operator (first key starting with $)
    const operator = operators[0]
    if (!operator) {
      errors.push({
        message: 'Stage must have an operator starting with $',
        path: basePath,
        code: 'missing_operator',
      })
      continue
    }

    // Check for unknown operator
    if (!VALID_STAGE_OPERATORS.has(operator)) {
      errors.push({
        message: `Unknown or unsupported stage operator: ${operator}`,
        path: `${basePath}.${operator}`,
        code: 'unknown_operator',
      })
      continue
    }

    // Validate the stage value based on operator
    const stageObj = stage as Record<string, unknown>
    const value = stageObj[operator]
    const validation = validateStageByOperator(operator, value)

    if (!validation.valid) {
      validation.errors.forEach((msg) => {
        errors.push({
          message: msg,
          path: `${basePath}.${operator}`,
          code: 'validation_error',
        })
      })
    } else {
      // Collect warnings from stage validation
      if (validation.warnings) {
        warnings.push(...validation.warnings)
      }
      // Use transformed data if available (for coercion), otherwise use original
      if (validation.data !== undefined) {
        transformedPipeline.push({ [operator]: validation.data })
      } else {
        transformedPipeline.push(stage)
      }
    }
  }

  // Check for $match at end of pipeline (performance warning)
  if (pipeline.length >= 2) {
    const lastStage = pipeline[pipeline.length - 1]
    if (typeof lastStage === 'object' && lastStage !== null && '$match' in lastStage) {
      warnings.push('$match at the end of pipeline may impact performance - consider moving it to the beginning')
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }

  return {
    success: true,
    data: transformedPipeline,
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}

/**
 * Validates a single pipeline stage JSON
 *
 * @param stage - The stage object to validate (user-provided JSON)
 * @returns Validation result with errors if invalid, or validated data if valid
 */
export function validateStageJson(stage: unknown): StageJsonValidationResult {
  // Check if stage is null
  if (stage === null) {
    return {
      success: false,
      errors: [
        {
          message: 'Stage cannot be null',
          path: '',
          code: 'invalid_type',
        },
      ],
    }
  }

  // Check if stage is an object (and not an array)
  if (typeof stage !== 'object' || Array.isArray(stage)) {
    return {
      success: false,
      errors: [
        {
          message: 'Stage must be an object',
          path: '',
          code: 'invalid_type',
        },
      ],
    }
  }

  const stageObj = stage as Record<string, unknown>
  const keys = Object.keys(stageObj)
  const errors: PipelineValidationError[] = []

  // Check for empty object
  if (keys.length === 0) {
    return {
      success: false,
      errors: [
        {
          message: 'Stage cannot be empty - must have an operator',
          path: '',
          code: 'invalid_stage',
        },
      ],
    }
  }

  // Check for multiple operators
  const operators = keys.filter((k) => k.startsWith('$'))
  if (operators.length > 1) {
    return {
      success: false,
      errors: [
        {
          message: 'Stage can only have a single operator',
          path: '',
          code: 'multiple_operators',
        },
      ],
    }
  }

  // Get the operator
  const operator = operators[0]
  if (!operator) {
    return {
      success: false,
      errors: [
        {
          message: 'Stage must have an operator starting with $',
          path: '',
          code: 'missing_operator',
        },
      ],
    }
  }

  // Check for unknown operator
  if (!VALID_STAGE_OPERATORS.has(operator)) {
    return {
      success: false,
      errors: [
        {
          message: `Unknown or unsupported stage operator: ${operator}`,
          path: operator,
          code: 'unknown_operator',
        },
      ],
    }
  }

  // Validate the stage value based on operator
  const value = stageObj[operator]
  const validation = validateStageByOperator(operator, value)

  if (!validation.valid) {
    validation.errors.forEach((msg) => {
      errors.push({
        message: msg,
        path: operator,
        code: 'validation_error',
      })
    })
    return {
      success: false,
      errors,
    }
  }

  // Use transformed data if available (for coercion), otherwise use original
  const resultData = validation.data !== undefined
    ? { [operator]: validation.data }
    : stageObj

  return {
    success: true,
    data: resultData,
  }
}
