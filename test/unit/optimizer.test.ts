import { describe, it, expect } from 'vitest'
import { optimizePipeline } from '../../src/translator/stages/optimizer'
import type { PipelineStage } from '../../src/translator/stages/types'

describe('Pipeline Optimizer', () => {
  describe('Predicate Pushdown', () => {
    it('pushes $match before $sort when fields are independent', () => {
      const pipeline: PipelineStage[] = [
        { $sort: { createdAt: -1 } },
        { $match: { status: 'active' } }
      ]

      const optimized = optimizePipeline(pipeline)

      // $match should come first
      expect(Object.keys(optimized[0])[0]).toBe('$match')
      expect(Object.keys(optimized[1])[0]).toBe('$sort')
    })

    it('does not push $match past $group', () => {
      const pipeline: PipelineStage[] = [
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $match: { total: { $gt: 100 } } }
      ]

      const optimized = optimizePipeline(pipeline)

      // Order should remain unchanged
      expect(Object.keys(optimized[0])[0]).toBe('$group')
      expect(Object.keys(optimized[1])[0]).toBe('$match')
    })

    it('does not push $match past $limit', () => {
      const pipeline: PipelineStage[] = [
        { $limit: 10 },
        { $match: { status: 'active' } }
      ]

      const optimized = optimizePipeline(pipeline)

      // Order should remain unchanged
      expect(Object.keys(optimized[0])[0]).toBe('$limit')
      expect(Object.keys(optimized[1])[0]).toBe('$match')
    })

    it('does not push $match past $project that affects matched fields', () => {
      const pipeline: PipelineStage[] = [
        { $project: { status: { $toLower: '$status' } } },
        { $match: { status: 'active' } }
      ]

      const optimized = optimizePipeline(pipeline)

      // Order should remain unchanged since $project affects the matched field
      expect(Object.keys(optimized[0])[0]).toBe('$project')
      expect(Object.keys(optimized[1])[0]).toBe('$match')
    })
  })

  describe('Stage Merging', () => {
    it('merges adjacent $match stages', () => {
      const pipeline: PipelineStage[] = [
        { $match: { status: 'active' } },
        { $match: { type: 'user' } }
      ]

      const optimized = optimizePipeline(pipeline)

      expect(optimized.length).toBe(1)
      const matchStage = optimized[0] as { $match: Record<string, unknown> }
      expect(matchStage.$match.$and).toBeDefined()
    })

    it('merges adjacent $addFields stages', () => {
      const pipeline: PipelineStage[] = [
        { $addFields: { field1: 'value1' } },
        { $addFields: { field2: 'value2' } }
      ]

      const optimized = optimizePipeline(pipeline)

      expect(optimized.length).toBe(1)
      const addFieldsStage = optimized[0] as { $addFields: Record<string, unknown> }
      expect(addFieldsStage.$addFields.field1).toBe('value1')
      expect(addFieldsStage.$addFields.field2).toBe('value2')
    })

    it('does not merge incompatible $project stages', () => {
      const pipeline: PipelineStage[] = [
        { $project: { name: 1, email: 1 } },
        { $project: { password: 0 } }
      ]

      const optimized = optimizePipeline(pipeline)

      // Should not merge inclusion and exclusion projections
      expect(optimized.length).toBe(2)
    })
  })

  describe('Redundant Stage Elimination', () => {
    it('removes empty $match stages', () => {
      const pipeline: PipelineStage[] = [
        { $match: {} },
        { $sort: { name: 1 } }
      ]

      const optimized = optimizePipeline(pipeline)

      expect(optimized.length).toBe(1)
      expect(Object.keys(optimized[0])[0]).toBe('$sort')
    })
  })

  describe('Complex Pipeline Optimization', () => {
    it('optimizes a realistic pipeline', () => {
      const pipeline: PipelineStage[] = [
        { $sort: { createdAt: -1 } },
        { $match: { status: 'active' } },
        { $addFields: { isRecent: true } },
        { $addFields: { processed: true } },
        { $match: { type: 'order' } }
      ]

      const optimized = optimizePipeline(pipeline)

      // Multiple $match stages should be merged
      // Multiple $addFields should be merged
      // $match should be pushed before $sort
      expect(optimized.length).toBeLessThanOrEqual(3)
    })
  })
})
