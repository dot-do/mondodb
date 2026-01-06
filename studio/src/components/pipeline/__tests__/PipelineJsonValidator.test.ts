/**
 * PipelineJsonValidator Unit Tests - RED PHASE
 *
 * Issue: mondodb-c40b - Test JSON schema validation for user pipeline input
 *
 * These tests define the expected behavior for validating user-provided pipeline JSON
 * using Zod schemas. The validator should:
 * 1. Validate pipeline arrays with proper structure
 * 2. Detect invalid stage types
 * 3. Report missing required fields
 * 4. Handle type coercion properly
 * 5. Provide detailed error messages with paths
 *
 * These tests are written FIRST (RED) - they should FAIL until the implementation
 * is completed in the GREEN phase.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  validatePipelineJson,
  validateStageJson,
  PipelineJsonSchema,
  StageJsonSchema,
  type PipelineJsonValidationResult,
  type StageJsonValidationResult,
} from '../PipelineJsonValidator'

describe('PipelineJsonValidator', () => {
  describe('validatePipelineJson - valid pipeline arrays', () => {
    it('validates an empty pipeline array', () => {
      const result = validatePipelineJson([])

      expect(result.success).toBe(true)
      expect(result.errors).toBeUndefined()
      expect(result.data).toEqual([])
    })

    it('validates a pipeline with a single $match stage', () => {
      const pipeline = [
        { $match: { status: 'active' } },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.errors).toBeUndefined()
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with a single $project stage', () => {
      const pipeline = [
        { $project: { name: 1, email: 1, _id: 0 } },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with a single $group stage', () => {
      const pipeline = [
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            total: { $sum: '$amount' },
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with a single $sort stage', () => {
      const pipeline = [
        { $sort: { createdAt: -1, name: 1 } },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with a single $limit stage', () => {
      const pipeline = [
        { $limit: 10 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with a single $skip stage', () => {
      const pipeline = [
        { $skip: 20 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with a single $unwind stage (string path)', () => {
      const pipeline = [
        { $unwind: '$items' },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with a single $unwind stage (object config)', () => {
      const pipeline = [
        {
          $unwind: {
            path: '$items',
            includeArrayIndex: 'arrayIndex',
            preserveNullAndEmptyArrays: true,
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with a single $lookup stage', () => {
      const pipeline = [
        {
          $lookup: {
            from: 'orders',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customerOrders',
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with a single $addFields stage', () => {
      const pipeline = [
        {
          $addFields: {
            totalPrice: { $multiply: ['$price', '$quantity'] },
            status: 'pending',
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with a single $count stage', () => {
      const pipeline = [
        { $count: 'totalDocuments' },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a complex multi-stage pipeline', () => {
      const pipeline = [
        { $match: { status: 'active', amount: { $gt: 100 } } },
        { $project: { name: 1, amount: 1, category: 1 } },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with $vectorSearch stage', () => {
      const pipeline = [
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: [0.1, 0.2, 0.3],
            numCandidates: 100,
            limit: 10,
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates a pipeline with $search stage', () => {
      const pipeline = [
        {
          $search: {
            index: 'default',
            text: {
              query: 'mongodb',
              path: 'description',
            },
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })
  })

  describe('validatePipelineJson - invalid stage types', () => {
    it('rejects a stage with an unknown operator', () => {
      const pipeline = [
        { $unknownStage: { field: 'value' } },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
      expect(result.errors![0]!.message).toMatch(/invalid|unknown|unsupported/i)
    })

    it('rejects a stage with multiple operators', () => {
      const pipeline = [
        { $match: { status: 'active' }, $project: { name: 1 } },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/multiple|single|one/i)
    })

    it('rejects a stage that is not an object', () => {
      const pipeline = [
        'not an object',
      ] as unknown[]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/object/i)
    })

    it('rejects an empty object as a stage', () => {
      const pipeline = [
        {},
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/empty|operator|required/i)
    })

    it('rejects null as a stage', () => {
      const pipeline = [null] as unknown[]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('rejects an array as a stage', () => {
      const pipeline = [
        ['$match', { status: 'active' }],
      ] as unknown[]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/object/i)
    })

    it('provides error path for invalid stage in multi-stage pipeline', () => {
      const pipeline = [
        { $match: { status: 'active' } },
        { $invalidStage: {} },
        { $limit: 10 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.path).toContain('[1]')
    })
  })

  describe('validatePipelineJson - missing required fields', () => {
    it('rejects $group without _id field', () => {
      const pipeline = [
        { $group: { count: { $sum: 1 } } },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/_id|required/i)
    })

    it('rejects $lookup without required fields', () => {
      const pipeline = [
        { $lookup: { from: 'orders' } }, // Missing localField, foreignField, as
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.some(e => e.message.match(/localField|foreignField|as|required/i))).toBe(true)
    })

    it('rejects $lookup with empty from field', () => {
      const pipeline = [
        {
          $lookup: {
            from: '',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/from|empty|required/i)
    })

    it('rejects $unwind without path when using object form', () => {
      const pipeline = [
        { $unwind: { preserveNullAndEmptyArrays: true } }, // Missing path
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/path|required/i)
    })

    it('rejects $count with empty string', () => {
      const pipeline = [
        { $count: '' },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/empty|required|field/i)
    })

    it('rejects $vectorSearch without required fields', () => {
      const pipeline = [
        { $vectorSearch: { index: 'vector_index' } }, // Missing path, queryVector, numCandidates, limit
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })
  })

  describe('validatePipelineJson - type coercion', () => {
    it('coerces string numbers to numbers for $limit', () => {
      const pipeline = [
        { $limit: '10' as unknown as number },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data![0]).toEqual({ $limit: 10 })
    })

    it('coerces string numbers to numbers for $skip', () => {
      const pipeline = [
        { $skip: '5' as unknown as number },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data![0]).toEqual({ $skip: 5 })
    })

    it('coerces sort direction strings to numbers', () => {
      const pipeline = [
        { $sort: { name: '1', createdAt: '-1' } as unknown as Record<string, number> },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data![0]).toEqual({ $sort: { name: 1, createdAt: -1 } })
    })

    it('rejects non-numeric string for $limit', () => {
      const pipeline = [
        { $limit: 'ten' as unknown as number },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/number|integer|numeric/i)
    })

    it('rejects negative numbers for $limit', () => {
      const pipeline = [
        { $limit: -5 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/positive|negative|greater/i)
    })

    it('rejects negative numbers for $skip', () => {
      const pipeline = [
        { $skip: -10 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/positive|negative|greater/i)
    })

    it('rejects zero for $limit', () => {
      const pipeline = [
        { $limit: 0 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/positive|zero|greater/i)
    })

    it('accepts zero for $skip', () => {
      const pipeline = [
        { $skip: 0 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data![0]).toEqual({ $skip: 0 })
    })

    it('rejects float numbers for $limit', () => {
      const pipeline = [
        { $limit: 10.5 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/integer|whole/i)
    })

    it('accepts boolean values in $match', () => {
      const pipeline = [
        { $match: { isActive: true, isDeleted: false } },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('accepts null values in $match', () => {
      const pipeline = [
        { $match: { deletedAt: null } },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })
  })

  describe('validatePipelineJson - input type validation', () => {
    it('rejects non-array input', () => {
      const pipeline = { $match: { status: 'active' } } as unknown

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/array/i)
    })

    it('rejects null input', () => {
      const result = validatePipelineJson(null as unknown)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('rejects undefined input', () => {
      const result = validatePipelineJson(undefined as unknown)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('rejects string input', () => {
      const result = validatePipelineJson('[]' as unknown)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.message).toMatch(/array/i)
    })

    it('rejects number input', () => {
      const result = validatePipelineJson(123 as unknown)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })
  })

  describe('validatePipelineJson - error message quality', () => {
    it('provides clear path for nested errors', () => {
      const pipeline = [
        {
          $group: {
            _id: '$category',
            total: { $invalidOperator: '$amount' },
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.path).toContain('$group')
    })

    it('provides error code for programmatic handling', () => {
      const pipeline = [
        { $limit: -1 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]!.code).toBeDefined()
      expect(typeof result.errors![0]!.code).toBe('string')
    })

    it('provides human-readable error messages', () => {
      const pipeline = [
        { $unknownStage: {} },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      // Error message should be understandable to users
      expect(result.errors![0]!.message.length).toBeGreaterThan(10)
      expect(result.errors![0]!.message).not.toMatch(/^\[object/i)
    })

    it('collects multiple errors in a single validation', () => {
      const pipeline = [
        { $limit: -1 },
        { $skip: -1 },
        { $unknownStage: {} },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('validateStageJson - single stage validation', () => {
    it('validates a valid $match stage', () => {
      const stage = { $match: { status: 'active' } }

      const result = validateStageJson(stage)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(stage)
    })

    it('validates a valid $project stage', () => {
      const stage = { $project: { name: 1, email: 1 } }

      const result = validateStageJson(stage)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(stage)
    })

    it('validates a valid $group stage', () => {
      const stage = { $group: { _id: '$category', count: { $sum: 1 } } }

      const result = validateStageJson(stage)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(stage)
    })

    it('rejects an invalid stage', () => {
      const stage = { $invalidStage: {} }

      const result = validateStageJson(stage)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('rejects non-object input', () => {
      const result = validateStageJson('not an object' as unknown)

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('coerces types in single stage validation', () => {
      const stage = { $limit: '10' as unknown as number }

      const result = validateStageJson(stage)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ $limit: 10 })
    })
  })

  describe('PipelineJsonSchema - direct schema access', () => {
    it('exports PipelineJsonSchema for advanced use cases', () => {
      expect(PipelineJsonSchema).toBeDefined()
      expect(typeof PipelineJsonSchema.parse).toBe('function')
      expect(typeof PipelineJsonSchema.safeParse).toBe('function')
    })

    it('exports StageJsonSchema for single stage validation', () => {
      expect(StageJsonSchema).toBeDefined()
      expect(typeof StageJsonSchema.parse).toBe('function')
      expect(typeof StageJsonSchema.safeParse).toBe('function')
    })

    it('schema validates correctly with safeParse', () => {
      const result = PipelineJsonSchema.safeParse([{ $match: { x: 1 } }])

      expect(result.success).toBe(true)
    })

    it('schema throws on parse with invalid input', () => {
      expect(() => {
        PipelineJsonSchema.parse('invalid')
      }).toThrow()
    })
  })

  describe('advanced validation scenarios', () => {
    it('validates deeply nested $match queries', () => {
      const pipeline = [
        {
          $match: {
            $and: [
              { status: 'active' },
              {
                $or: [
                  { role: 'admin' },
                  { permissions: { $in: ['write', 'delete'] } },
                ],
              },
              { age: { $gte: 18, $lte: 65 } },
            ],
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates $lookup with pipeline subquery', () => {
      const pipeline = [
        {
          $lookup: {
            from: 'orders',
            let: { customerId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$customerId', '$$customerId'] } } },
              { $sort: { createdAt: -1 } },
              { $limit: 5 },
            ],
            as: 'recentOrders',
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates complex $project with expressions', () => {
      const pipeline = [
        {
          $project: {
            name: 1,
            fullName: { $concat: ['$firstName', ' ', '$lastName'] },
            year: { $year: '$createdAt' },
            isAdult: { $gte: ['$age', 18] },
            status: {
              $cond: {
                if: { $eq: ['$active', true] },
                then: 'Active',
                else: 'Inactive',
              },
            },
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates $group with multiple accumulators', () => {
      const pipeline = [
        {
          $group: {
            _id: { year: { $year: '$date' }, month: { $month: '$date' } },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' },
            maxAmount: { $max: '$amount' },
            minAmount: { $min: '$amount' },
            count: { $sum: 1 },
            items: { $push: '$item' },
            uniqueItems: { $addToSet: '$item' },
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('validates pipeline with all supported stage types', () => {
      const pipeline = [
        { $match: { status: 'active' } },
        { $addFields: { fullName: { $concat: ['$firstName', ' ', '$lastName'] } } },
        { $project: { fullName: 1, email: 1 } },
        { $unwind: '$tags' },
        {
          $lookup: {
            from: 'departments',
            localField: 'departmentId',
            foreignField: '_id',
            as: 'department',
          },
        },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $skip: 5 },
        { $limit: 10 },
        { $count: 'totalResults' },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })
  })

  describe('validation result types', () => {
    it('returns PipelineJsonValidationResult with correct success structure', () => {
      const result: PipelineJsonValidationResult = validatePipelineJson([])

      expect('success' in result).toBe(true)
      expect('data' in result || 'errors' in result).toBe(true)
    })

    it('returns PipelineJsonValidationResult with correct error structure', () => {
      const result: PipelineJsonValidationResult = validatePipelineJson('invalid' as unknown)

      expect('success' in result).toBe(true)
      expect(result.success).toBe(false)
      expect('errors' in result).toBe(true)
      expect(Array.isArray(result.errors)).toBe(true)
    })

    it('returns StageJsonValidationResult with correct structure', () => {
      const result: StageJsonValidationResult = validateStageJson({ $match: {} })

      expect('success' in result).toBe(true)
    })

    it('error objects have required properties', () => {
      const result = validatePipelineJson([{ $invalid: {} }])

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toHaveProperty('message')
      expect(result.errors![0]).toHaveProperty('path')
      expect(result.errors![0]).toHaveProperty('code')
    })
  })

  describe('warnings for potential issues', () => {
    it('provides warning for very large $limit values', () => {
      const pipeline = [
        { $limit: 1000000 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.warnings).toBeDefined()
      expect(result.warnings!.some(w => w.match(/large|performance/i))).toBe(true)
    })

    it('provides warning for $unwind without preserveNullAndEmptyArrays', () => {
      const pipeline = [
        { $unwind: '$items' },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.warnings).toBeDefined()
      expect(result.warnings!.some(w => w.match(/preserveNullAndEmptyArrays|null|empty/i))).toBe(true)
    })

    it('provides warning for $match at end of pipeline', () => {
      const pipeline = [
        { $project: { name: 1 } },
        { $sort: { name: 1 } },
        { $match: { status: 'active' } },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.warnings).toBeDefined()
      expect(result.warnings!.some(w => w.match(/\$match|beginning|performance/i))).toBe(true)
    })

    it('provides no warnings for optimized pipelines', () => {
      const pipeline = [
        { $match: { status: 'active' } },
        { $project: { name: 1 } },
        { $limit: 10 },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.warnings?.length ?? 0).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('handles deeply nested objects in $match', () => {
      const pipeline = [
        {
          $match: {
            'address.city.name': 'New York',
            'metadata.tags.0': 'important',
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('handles field names with special characters', () => {
      const pipeline = [
        {
          $match: {
            'field.with.dots': 'value',
            '$specialField': { $exists: true },
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
    })

    it('handles empty $match', () => {
      const pipeline = [
        { $match: {} },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('handles empty $project', () => {
      const pipeline = [
        { $project: {} },
      ]

      const result = validatePipelineJson(pipeline)

      // Empty project may be valid but could trigger a warning
      expect(result.success).toBe(true)
    })

    it('handles large arrays in input', () => {
      const pipeline = Array.from({ length: 100 }, (_, i) => ({
        $match: { [`field${i}`]: i },
      }))

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(100)
    })

    it('handles Unicode characters in field names and values', () => {
      const pipeline = [
        {
          $match: {
            '': 'Tokyo',
            'description': 'Contains emoji: test',
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(pipeline)
    })

    it('handles dates in various formats', () => {
      const pipeline = [
        {
          $match: {
            createdAt: { $gte: new Date('2023-01-01').toISOString() },
          },
        },
      ]

      const result = validatePipelineJson(pipeline)

      expect(result.success).toBe(true)
    })
  })
})
