import { describe, it, expect } from 'vitest'
import { validatePipeline, validatePipelineStage } from '../pipelineValidator'

describe('pipelineValidator', () => {
  describe('validatePipeline', () => {
    describe('valid pipeline JSON', () => {
      it('should accept a valid simple pipeline with $match', () => {
        const pipeline = [
          {
            $match: {
              status: 'active',
            },
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(true)
        expect(result.errors).toBeUndefined()
      })

      it('should accept a valid multi-stage pipeline', () => {
        const pipeline = [
          {
            $match: {
              status: 'active',
            },
          },
          {
            $group: {
              _id: '$category',
              total: { $sum: 1 },
            },
          },
          {
            $sort: {
              total: -1,
            },
          },
          {
            $limit: 10,
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(true)
        expect(result.errors).toBeUndefined()
      })

      it('should accept valid $project stage', () => {
        const pipeline = [
          {
            $project: {
              name: 1,
              email: 1,
              _id: 0,
            },
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(true)
        expect(result.errors).toBeUndefined()
      })

      it('should accept valid $lookup stage', () => {
        const pipeline = [
          {
            $lookup: {
              from: 'orders',
              localField: '_id',
              foreignField: 'userId',
              as: 'userOrders',
            },
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(true)
        expect(result.errors).toBeUndefined()
      })

      it('should accept valid $unwind stage', () => {
        const pipeline = [
          {
            $unwind: {
              path: '$items',
              preserveNullAndEmptyArrays: true,
            },
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(true)
        expect(result.errors).toBeUndefined()
      })

      it('should accept valid $addFields stage', () => {
        const pipeline = [
          {
            $addFields: {
              fullName: { $concat: ['$firstName', ' ', '$lastName'] },
              isActive: true,
            },
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(true)
        expect(result.errors).toBeUndefined()
      })

      it('should accept valid $count stage', () => {
        const pipeline = [
          {
            $count: 'totalDocuments',
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(true)
        expect(result.errors).toBeUndefined()
      })
    })

    describe('invalid JSON structure', () => {
      it('should reject non-array pipeline with helpful error', () => {
        const pipeline = {
          $match: { status: 'active' },
        }

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.length).toBeGreaterThan(0)
        expect(result.errors?.[0].message).toContain('array')
      })

      it('should reject pipeline with non-object stages', () => {
        const pipeline = [
          '$match',
          { status: 'active' },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('object')
      })

      it('should reject stage with multiple operators', () => {
        const pipeline = [
          {
            $match: { status: 'active' },
            $limit: 10,
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('single stage operator')
      })

      it('should reject stage with unknown operator', () => {
        const pipeline = [
          {
            $unknown: { field: 'value' },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('unknown')
      })
    })

    describe('missing required fields', () => {
      it('should reject $match stage without filter object', () => {
        const pipeline = [
          {
            $match: null,
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('$match')
        expect(result.errors?.[0].message).toContain('object')
      })

      it('should reject $group stage without _id field', () => {
        const pipeline = [
          {
            $group: {
              total: { $sum: 1 },
            },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('_id')
      })

      it('should reject $lookup stage without required fields', () => {
        const pipeline = [
          {
            $lookup: {
              from: 'orders',
              // missing localField, foreignField, as
            },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toMatch(/localField|foreignField|as/)
      })

      it('should reject $unwind stage without path', () => {
        const pipeline = [
          {
            $unwind: {
              preserveNullAndEmptyArrays: true,
            },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('path')
      })

      it('should reject $count stage without field name', () => {
        const pipeline = [
          {
            $count: '',
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('field name')
      })
    })

    describe('type mismatches', () => {
      it('should reject $limit with string value', () => {
        const pipeline = [
          {
            $limit: '10',
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('number')
      })

      it('should reject $limit with negative number', () => {
        const pipeline = [
          {
            $limit: -10,
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('positive')
      })

      it('should reject $skip with string value', () => {
        const pipeline = [
          {
            $skip: 'five',
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('number')
      })

      it('should reject $skip with negative number', () => {
        const pipeline = [
          {
            $skip: -5,
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('non-negative')
      })

      it('should reject $sort with invalid direction', () => {
        const pipeline = [
          {
            $sort: {
              name: 'ascending',
            },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('1 or -1')
      })

      it('should reject $project with invalid field values', () => {
        const pipeline = [
          {
            $project: {
              name: 'yes',
            },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('1, 0, true, false')
      })

      it('should reject $lookup with non-string from field', () => {
        const pipeline = [
          {
            $lookup: {
              from: 123,
              localField: '_id',
              foreignField: 'userId',
              as: 'orders',
            },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('string')
      })
    })

    describe('stage-specific validation', () => {
      it('should reject $match with empty object', () => {
        const pipeline = [
          {
            $match: {},
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('at least one condition')
      })

      it('should validate $group accumulators', () => {
        const pipeline = [
          {
            $group: {
              _id: '$category',
              total: { $invalid: 1 },
            },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('accumulator')
      })

      it('should reject $sort with empty object', () => {
        const pipeline = [
          {
            $sort: {},
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('at least one field')
      })

      it('should reject $project with empty object', () => {
        const pipeline = [
          {
            $project: {},
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('at least one field')
      })

      it('should validate $unwind path starts with $', () => {
        const pipeline = [
          {
            $unwind: {
              path: 'items', // should be '$items'
            },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('must start with $')
      })

      it('should accept $unwind with string shorthand', () => {
        const pipeline = [
          {
            $unwind: '$items',
          },
        ]

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(true)
        expect(result.errors).toBeUndefined()
      })

      it('should validate $addFields field names are valid', () => {
        const pipeline = [
          {
            $addFields: {
              '': 'value', // empty field name
            },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].message).toContain('field name')
      })
    })

    describe('empty pipeline handling', () => {
      it('should accept empty pipeline array', () => {
        const pipeline: any[] = []

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(true)
        expect(result.errors).toBeUndefined()
      })

      it('should provide warning for empty pipeline', () => {
        const pipeline: any[] = []

        const result = validatePipeline(pipeline)
        expect(result.success).toBe(true)
        expect(result.warnings).toBeDefined()
        expect(result.warnings?.[0]).toContain('empty')
      })
    })

    describe('error message quality', () => {
      it('should provide stage index in error messages', () => {
        const pipeline = [
          { $match: { status: 'active' } },
          { $limit: 'ten' }, // error at index 1
          { $skip: 5 },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].path).toContain('[1]')
      })

      it('should provide field path in nested error messages', () => {
        const pipeline = [
          {
            $lookup: {
              from: 'orders',
              localField: 123, // should be string
              foreignField: 'userId',
              as: 'orders',
            },
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.[0].path).toContain('localField')
      })

      it('should accumulate multiple errors', () => {
        const pipeline = [
          {
            $match: null,
          },
          {
            $limit: -10,
          },
          {
            $sort: {},
          },
        ]

        const result = validatePipeline(pipeline as any)
        expect(result.success).toBe(false)
        expect(result.errors).toBeDefined()
        expect(result.errors?.length).toBeGreaterThanOrEqual(3)
      })
    })
  })

  describe('validatePipelineStage', () => {
    it('should validate individual $match stage', () => {
      const stage = {
        $match: {
          status: 'active',
        },
      }

      const result = validatePipelineStage(stage)
      expect(result.success).toBe(true)
    })

    it('should reject invalid individual stage', () => {
      const stage = {
        $limit: 'ten',
      }

      const result = validatePipelineStage(stage as any)
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('should validate complex $group stage', () => {
      const stage = {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
          },
          total: { $sum: '$amount' },
          avg: { $avg: '$amount' },
          count: { $sum: 1 },
        },
      }

      const result = validatePipelineStage(stage)
      expect(result.success).toBe(true)
    })

    it('should validate $lookup with pipeline', () => {
      const stage = {
        $lookup: {
          from: 'orders',
          let: { userId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$userId', '$$userId'] } } },
            { $limit: 10 },
          ],
          as: 'recentOrders',
        },
      }

      const result = validatePipelineStage(stage)
      expect(result.success).toBe(true)
    })
  })

  describe('complex validation scenarios', () => {
    it('should validate nested expressions in $match', () => {
      const pipeline = [
        {
          $match: {
            $or: [
              { status: 'active' },
              { status: 'pending' },
            ],
            age: { $gte: 18 },
          },
        },
      ]

      const result = validatePipeline(pipeline)
      expect(result.success).toBe(true)
    })

    it('should validate complex $project expressions', () => {
      const pipeline = [
        {
          $project: {
            name: 1,
            fullName: { $concat: ['$firstName', ' ', '$lastName'] },
            year: { $year: '$date' },
            _id: 0,
          },
        },
      ]

      const result = validatePipeline(pipeline)
      expect(result.success).toBe(true)
    })

    it('should validate faceted search pipeline', () => {
      const pipeline = [
        {
          $facet: {
            categorizedByTags: [
              { $unwind: '$tags' },
              { $sortByCount: '$tags' },
            ],
            categorizedByPrice: [
              {
                $match: { price: { $exists: true } },
              },
              {
                $bucket: {
                  groupBy: '$price',
                  boundaries: [0, 50, 100, 200],
                  default: 'Other',
                  output: { count: { $sum: 1 } },
                },
              },
            ],
          },
        },
      ]

      const result = validatePipeline(pipeline as any)
      // This might not be supported initially, but should fail gracefully
      expect(result.success).toBe(false)
      expect(result.errors?.[0].message).toContain('$facet')
    })
  })
})
