/**
 * Aggregation Pipeline API
 * Functions for running pipelines and managing pipeline templates
 */

import type { AggregationStage } from '@components/stage-editor/types'
import rpcClient from '@/lib/rpc-client'

// Types
export interface PipelineRunRequest {
  database: string
  collection: string
  pipeline: Record<string, unknown>[]
  sampleSize?: number
}

export interface PipelineRunResult {
  documents: Record<string, unknown>[]
  count: number
}

export interface PipelineTemplate {
  id: string
  name: string
  description?: string
  pipeline: Record<string, unknown>[]
  createdAt?: string
  updatedAt?: string
}

export interface SaveTemplateRequest {
  name: string
  description?: string
  pipeline: Record<string, unknown>[]
}

/**
 * Run an aggregation pipeline using the RPC client
 */
export async function runPipeline(request: PipelineRunRequest): Promise<PipelineRunResult> {
  const { database, collection, pipeline, sampleSize = 20 } = request

  // Add a $limit stage if sampleSize is specified to limit results for preview
  const pipelineWithLimit = sampleSize > 0
    ? [...pipeline, { $limit: sampleSize }]
    : pipeline

  const documents = await rpcClient.aggregate(database, collection, pipelineWithLimit)

  return {
    documents: documents as Record<string, unknown>[],
    count: documents.length,
  }
}

/**
 * Save a pipeline template
 */
export async function saveTemplate(request: SaveTemplateRequest): Promise<{ id: string }> {
  const response = await fetch('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error('Failed to save template')
  }

  return response.json()
}

/**
 * Load a pipeline template by ID
 */
export async function loadTemplate(id: string): Promise<PipelineTemplate> {
  const response = await fetch(`/api/templates/${id}`)

  if (!response.ok) {
    throw new Error('Failed to load template')
  }

  return response.json()
}

/**
 * List all pipeline templates
 */
export async function listTemplates(): Promise<PipelineTemplate[]> {
  const response = await fetch('/api/templates')

  if (!response.ok) {
    throw new Error('Failed to list templates')
  }

  return response.json()
}

/**
 * Delete a pipeline template
 */
export async function deleteTemplate(id: string): Promise<void> {
  const response = await fetch(`/api/templates/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Failed to delete template')
  }
}

/**
 * Convert internal stage representation to MongoDB pipeline format
 * Note: The caller is responsible for filtering stages (e.g., by enabled status)
 */
export function stagesToPipeline(stages: AggregationStage[]): Record<string, unknown>[] {
  return stages
    .map((stage) => {
      switch (stage.type) {
        case '$match':
          if (stage.useRawJson && stage.rawJson) {
            try {
              return { $match: JSON.parse(stage.rawJson) }
            } catch {
              return { $match: {} }
            }
          }
          return {
            $match: conditionsToMatchObject(
              stage.conditions,
              stage.logicalOperator
            ),
          }

        case '$group':
          if (stage.useRawJson && stage.rawJson) {
            try {
              return { $group: JSON.parse(stage.rawJson) }
            } catch {
              return { $group: { _id: null } }
            }
          }
          return {
            $group: {
              _id: stage.groupByField ? `$${stage.groupByField}` : null,
              ...accumulatorsToObject(stage.accumulators),
            },
          }

        case '$sort':
          return {
            $sort: stage.fields.reduce(
              (acc, field) => ({
                ...acc,
                [field.field]: field.direction,
              }),
              {} as Record<string, number>
            ),
          }

        case '$project':
          if (stage.useRawJson && stage.rawJson) {
            try {
              return { $project: JSON.parse(stage.rawJson) }
            } catch {
              return { $project: {} }
            }
          }
          return {
            $project: {
              ...(stage.excludeId ? { _id: 0 } : {}),
              ...stage.fields.reduce(
                (acc, field) => ({
                  ...acc,
                  [field.field]: field.isExpression
                    ? JSON.parse(field.expression || '""')
                    : field.include
                      ? 1
                      : 0,
                }),
                {} as Record<string, unknown>
              ),
            },
          }

        case '$limit':
          return { $limit: stage.limit }

        case '$skip':
          return { $skip: stage.skip }

        case '$lookup':
          if (stage.usePipeline) {
            try {
              return {
                $lookup: {
                  from: stage.config.from,
                  as: stage.config.as,
                  let: stage.letVariables ? JSON.parse(stage.letVariables) : undefined,
                  pipeline: JSON.parse(stage.pipelineJson || '[]'),
                },
              }
            } catch {
              return { $lookup: stage.config }
            }
          }
          return { $lookup: stage.config }

        case '$unwind':
          if (stage.config.includeArrayIndex || stage.config.preserveNullAndEmptyArrays) {
            return {
              $unwind: {
                path: stage.config.path,
                ...(stage.config.includeArrayIndex && {
                  includeArrayIndex: stage.config.includeArrayIndex,
                }),
                ...(stage.config.preserveNullAndEmptyArrays && {
                  preserveNullAndEmptyArrays: true,
                }),
              },
            }
          }
          return { $unwind: stage.config.path }

        case '$addFields':
          if (stage.useRawJson && stage.rawJson) {
            try {
              return { $addFields: JSON.parse(stage.rawJson) }
            } catch {
              return { $addFields: {} }
            }
          }
          return {
            $addFields: stage.fields.reduce(
              (acc, field) => ({
                ...acc,
                [field.field]: JSON.parse(field.expression || '""'),
              }),
              {} as Record<string, unknown>
            ),
          }

        case '$count':
          return { $count: stage.outputField }

        default:
          return {}
      }
    })
}

function conditionsToMatchObject(
  conditions: { field: string; operator: string; value: string }[],
  logicalOperator?: '$and' | '$or'
): Record<string, unknown> {
  if (conditions.length === 0) return {}

  const matchConditions = conditions
    .filter((c) => c.field)
    .map((c) => {
      if (c.operator === '$eq') {
        return { [c.field]: parseValue(c.value) }
      }
      if (c.operator === '$exists') {
        return { [c.field]: { $exists: c.value === 'true' } }
      }
      if (c.operator === '$in' || c.operator === '$nin') {
        try {
          return { [c.field]: { [c.operator]: JSON.parse(c.value) } }
        } catch {
          return { [c.field]: { [c.operator]: [] } }
        }
      }
      return { [c.field]: { [c.operator]: parseValue(c.value) } }
    })

  if (matchConditions.length === 0) return {}
  if (matchConditions.length === 1) return matchConditions[0]

  if (logicalOperator === '$or') {
    return { $or: matchConditions }
  }

  // Default to AND - merge conditions
  return matchConditions.reduce((acc, cond) => ({ ...acc, ...cond }), {})
}

function accumulatorsToObject(
  accumulators: { outputField: string; operator: string; inputField: string; useConstant?: boolean; constantValue?: number }[]
): Record<string, unknown> {
  return accumulators.reduce((acc, accum) => {
    if (accum.operator === '$count') {
      return { ...acc, [accum.outputField]: { $sum: 1 } }
    }
    if (accum.useConstant && accum.constantValue !== undefined) {
      return { ...acc, [accum.outputField]: { [accum.operator]: accum.constantValue } }
    }
    return {
      ...acc,
      [accum.outputField]: { [accum.operator]: `$${accum.inputField}` },
    }
  }, {} as Record<string, unknown>)
}

function parseValue(value: string): unknown {
  if (value === '') return ''
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  const num = Number(value)
  if (!isNaN(num) && value.trim() !== '') return num
  return value
}
