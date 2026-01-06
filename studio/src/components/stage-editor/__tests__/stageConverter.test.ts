/**
 * Stage Converter Utility Tests
 *
 * RED Phase - Issue: mondodb-uu5u
 *
 * These tests verify the stageConverter utility functions that convert
 * UI AggregationStage types to MongoDB pipeline format.
 *
 * Functions under test:
 * - stageToMongoDBFormat(stage: AggregationStage): Record<string, unknown>
 * - stagesToPipeline(stages: AggregationStage[]): Record<string, unknown>[]
 *
 * These tests should FAIL initially because the stageConverter module
 * does not exist yet (RED phase of TDD).
 */

import { describe, it, expect } from 'vitest'

// Import the converter functions that don't exist yet (RED phase)
import { stageToMongoDBFormat, stagesToPipeline } from '../stageConverter'

// Import types from the existing types module
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
} from '../types'

// Helper to create test stages with required base properties
function createBaseStage<T extends AggregationStage['type']>(type: T): { id: string; type: T; enabled: boolean } {
  return {
    id: `test-${type}-${Date.now()}`,
    type,
    enabled: true,
  }
}

describe('stageConverter', () => {
  describe('stageToMongoDBFormat', () => {
    describe('$match stage conversion', () => {
      it('should convert a simple $match stage with one condition', () => {
        const stage: MatchStage = {
          ...createBaseStage('$match'),
          conditions: [
            {
              id: 'cond-1',
              field: 'status',
              operator: '$eq',
              value: 'active',
              valueType: 'string',
            },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $match: {
            status: { $eq: 'active' },
          },
        })
      })

      it('should convert $match stage with $and logical operator', () => {
        const stage: MatchStage = {
          ...createBaseStage('$match'),
          conditions: [
            { id: 'cond-1', field: 'status', operator: '$eq', value: 'active', valueType: 'string' },
            { id: 'cond-2', field: 'age', operator: '$gte', value: '18', valueType: 'number' },
          ],
          logicalOperator: '$and',
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $match: {
            $and: [
              { status: { $eq: 'active' } },
              { age: { $gte: 18 } },
            ],
          },
        })
      })

      it('should convert $match stage with $or logical operator', () => {
        const stage: MatchStage = {
          ...createBaseStage('$match'),
          conditions: [
            { id: 'cond-1', field: 'status', operator: '$eq', value: 'active', valueType: 'string' },
            { id: 'cond-2', field: 'status', operator: '$eq', value: 'pending', valueType: 'string' },
          ],
          logicalOperator: '$or',
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $match: {
            $or: [
              { status: { $eq: 'active' } },
              { status: { $eq: 'pending' } },
            ],
          },
        })
      })

      it('should handle $exists operator correctly', () => {
        const stage: MatchStage = {
          ...createBaseStage('$match'),
          conditions: [
            { id: 'cond-1', field: 'deletedAt', operator: '$exists', value: 'false', valueType: 'boolean' },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $match: {
            deletedAt: { $exists: false },
          },
        })
      })

      it('should handle $in operator with array values', () => {
        const stage: MatchStage = {
          ...createBaseStage('$match'),
          conditions: [
            { id: 'cond-1', field: 'category', operator: '$in', value: '["electronics", "books"]', valueType: 'auto' },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $match: {
            category: { $in: ['electronics', 'books'] },
          },
        })
      })

      it('should handle $regex operator with options', () => {
        const stage: MatchStage = {
          ...createBaseStage('$match'),
          conditions: [
            { id: 'cond-1', field: 'name', operator: '$regex', value: '^test', regexOptions: 'i' },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $match: {
            name: { $regex: '^test', $options: 'i' },
          },
        })
      })

      it('should use rawJson when useRawJson is true', () => {
        const stage: MatchStage = {
          ...createBaseStage('$match'),
          conditions: [],
          useRawJson: true,
          rawJson: '{ "status": "active", "$text": { "$search": "mongodb" } }',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $match: {
            status: 'active',
            $text: { $search: 'mongodb' },
          },
        })
      })

      it('should handle null value type', () => {
        const stage: MatchStage = {
          ...createBaseStage('$match'),
          conditions: [
            { id: 'cond-1', field: 'deletedAt', operator: '$eq', value: 'null', valueType: 'null' },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $match: {
            deletedAt: { $eq: null },
          },
        })
      })
    })

    describe('$project stage conversion', () => {
      it('should convert a simple $project stage with field inclusion', () => {
        const stage: ProjectStage = {
          ...createBaseStage('$project'),
          fields: [
            { id: 'field-1', field: 'name', include: true, isExpression: false },
            { id: 'field-2', field: 'email', include: true, isExpression: false },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $project: {
            name: 1,
            email: 1,
          },
        })
      })

      it('should convert $project with field exclusion', () => {
        const stage: ProjectStage = {
          ...createBaseStage('$project'),
          fields: [
            { id: 'field-1', field: 'password', include: false, isExpression: false },
            { id: 'field-2', field: 'internal', include: false, isExpression: false },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $project: {
            password: 0,
            internal: 0,
          },
        })
      })

      it('should handle excludeId option', () => {
        const stage: ProjectStage = {
          ...createBaseStage('$project'),
          fields: [
            { id: 'field-1', field: 'name', include: true, isExpression: false },
          ],
          excludeId: true,
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $project: {
            _id: 0,
            name: 1,
          },
        })
      })

      it('should handle expression fields', () => {
        const stage: ProjectStage = {
          ...createBaseStage('$project'),
          fields: [
            { id: 'field-1', field: 'fullName', include: '{ $concat: ["$firstName", " ", "$lastName"] }', isExpression: true },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $project: {
            fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          },
        })
      })

      it('should use rawJson when useRawJson is true', () => {
        const stage: ProjectStage = {
          ...createBaseStage('$project'),
          fields: [],
          useRawJson: true,
          rawJson: '{ "name": 1, "computed": { "$multiply": ["$price", "$quantity"] } }',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $project: {
            name: 1,
            computed: { $multiply: ['$price', '$quantity'] },
          },
        })
      })
    })

    describe('$group stage conversion', () => {
      it('should convert a simple $group stage with single field grouping', () => {
        const stage: GroupStage = {
          ...createBaseStage('$group'),
          groupByField: 'category',
          groupByExpression: '',
          useCompoundKey: false,
          accumulators: [
            { id: 'acc-1', outputField: 'count', operator: '$sum', inputField: '', useConstant: true, constantValue: 1 },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $group: {
            _id: '$category',
            count: { $sum: 1 },
          },
        })
      })

      it('should handle null grouping (group all documents)', () => {
        const stage: GroupStage = {
          ...createBaseStage('$group'),
          groupByField: '',
          groupByExpression: '',
          useCompoundKey: false,
          accumulators: [
            { id: 'acc-1', outputField: 'total', operator: '$sum', inputField: 'amount', useConstant: false },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        })
      })

      it('should handle compound key grouping', () => {
        const stage: GroupStage = {
          ...createBaseStage('$group'),
          groupByField: '',
          groupByExpression: '{ "year": { "$year": "$date" }, "month": { "$month": "$date" } }',
          useCompoundKey: true,
          accumulators: [
            { id: 'acc-1', outputField: 'totalSales', operator: '$sum', inputField: 'amount', useConstant: false },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $group: {
            _id: { year: { $year: '$date' }, month: { $month: '$date' } },
            totalSales: { $sum: '$amount' },
          },
        })
      })

      it('should handle multiple accumulators', () => {
        const stage: GroupStage = {
          ...createBaseStage('$group'),
          groupByField: 'category',
          groupByExpression: '',
          useCompoundKey: false,
          accumulators: [
            { id: 'acc-1', outputField: 'count', operator: '$sum', inputField: '', useConstant: true, constantValue: 1 },
            { id: 'acc-2', outputField: 'totalPrice', operator: '$sum', inputField: 'price', useConstant: false },
            { id: 'acc-3', outputField: 'avgPrice', operator: '$avg', inputField: 'price', useConstant: false },
            { id: 'acc-4', outputField: 'minPrice', operator: '$min', inputField: 'price', useConstant: false },
            { id: 'acc-5', outputField: 'maxPrice', operator: '$max', inputField: 'price', useConstant: false },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalPrice: { $sum: '$price' },
            avgPrice: { $avg: '$price' },
            minPrice: { $min: '$price' },
            maxPrice: { $max: '$price' },
          },
        })
      })

      it('should handle $push and $addToSet accumulators', () => {
        const stage: GroupStage = {
          ...createBaseStage('$group'),
          groupByField: 'author',
          groupByExpression: '',
          useCompoundKey: false,
          accumulators: [
            { id: 'acc-1', outputField: 'titles', operator: '$push', inputField: 'title', useConstant: false },
            { id: 'acc-2', outputField: 'uniqueTags', operator: '$addToSet', inputField: 'tag', useConstant: false },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $group: {
            _id: '$author',
            titles: { $push: '$title' },
            uniqueTags: { $addToSet: '$tag' },
          },
        })
      })

      it('should use rawJson when useRawJson is true', () => {
        const stage: GroupStage = {
          ...createBaseStage('$group'),
          groupByField: '',
          groupByExpression: '',
          useCompoundKey: false,
          accumulators: [],
          useRawJson: true,
          rawJson: '{ "_id": "$region", "total": { "$sum": "$sales" } }',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $group: {
            _id: '$region',
            total: { $sum: '$sales' },
          },
        })
      })
    })

    describe('$sort stage conversion', () => {
      it('should convert a single field sort', () => {
        const stage: SortStage = {
          ...createBaseStage('$sort'),
          fields: [
            { id: 'sort-1', field: 'createdAt', direction: -1 },
          ],
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $sort: {
            createdAt: -1,
          },
        })
      })

      it('should convert multi-field sort preserving order', () => {
        const stage: SortStage = {
          ...createBaseStage('$sort'),
          fields: [
            { id: 'sort-1', field: 'category', direction: 1 },
            { id: 'sort-2', field: 'name', direction: 1 },
            { id: 'sort-3', field: 'createdAt', direction: -1 },
          ],
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $sort: {
            category: 1,
            name: 1,
            createdAt: -1,
          },
        })
      })
    })

    describe('$limit stage conversion', () => {
      it('should convert a $limit stage', () => {
        const stage: LimitStage = {
          ...createBaseStage('$limit'),
          limit: 10,
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $limit: 10,
        })
      })

      it('should handle large limit values', () => {
        const stage: LimitStage = {
          ...createBaseStage('$limit'),
          limit: 1000000,
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $limit: 1000000,
        })
      })
    })

    describe('$skip stage conversion', () => {
      it('should convert a $skip stage', () => {
        const stage: SkipStage = {
          ...createBaseStage('$skip'),
          skip: 20,
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $skip: 20,
        })
      })

      it('should handle zero skip', () => {
        const stage: SkipStage = {
          ...createBaseStage('$skip'),
          skip: 0,
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $skip: 0,
        })
      })
    })

    describe('$unwind stage conversion', () => {
      it('should convert a simple $unwind stage', () => {
        const stage: UnwindStage = {
          ...createBaseStage('$unwind'),
          config: {
            path: 'items',
            preserveNullAndEmptyArrays: false,
          },
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $unwind: '$items',
        })
      })

      it('should convert $unwind with preserveNullAndEmptyArrays', () => {
        const stage: UnwindStage = {
          ...createBaseStage('$unwind'),
          config: {
            path: 'tags',
            preserveNullAndEmptyArrays: true,
          },
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $unwind: {
            path: '$tags',
            preserveNullAndEmptyArrays: true,
          },
        })
      })

      it('should convert $unwind with includeArrayIndex', () => {
        const stage: UnwindStage = {
          ...createBaseStage('$unwind'),
          config: {
            path: 'items',
            includeArrayIndex: 'itemIndex',
            preserveNullAndEmptyArrays: false,
          },
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $unwind: {
            path: '$items',
            includeArrayIndex: 'itemIndex',
          },
        })
      })

      it('should convert $unwind with all options', () => {
        const stage: UnwindStage = {
          ...createBaseStage('$unwind'),
          config: {
            path: 'items',
            includeArrayIndex: 'idx',
            preserveNullAndEmptyArrays: true,
          },
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $unwind: {
            path: '$items',
            includeArrayIndex: 'idx',
            preserveNullAndEmptyArrays: true,
          },
        })
      })
    })

    describe('$lookup stage conversion', () => {
      it('should convert a basic $lookup stage', () => {
        const stage: LookupStage = {
          ...createBaseStage('$lookup'),
          config: {
            from: 'orders',
            localField: '_id',
            foreignField: 'userId',
            as: 'userOrders',
          },
          usePipeline: false,
          pipelineJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $lookup: {
            from: 'orders',
            localField: '_id',
            foreignField: 'userId',
            as: 'userOrders',
          },
        })
      })

      it('should convert $lookup with pipeline', () => {
        const stage: LookupStage = {
          ...createBaseStage('$lookup'),
          config: {
            from: 'comments',
            localField: '',
            foreignField: '',
            as: 'recentComments',
          },
          usePipeline: true,
          pipelineJson: '[{ "$match": { "$expr": { "$eq": ["$postId", "$$postId"] } } }, { "$sort": { "createdAt": -1 } }, { "$limit": 5 }]',
          letVariables: '{ "postId": "$_id" }',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $lookup: {
            from: 'comments',
            let: { postId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$postId', '$$postId'] } } },
              { $sort: { createdAt: -1 } },
              { $limit: 5 },
            ],
            as: 'recentComments',
          },
        })
      })
    })

    describe('$addFields stage conversion', () => {
      it('should convert a simple $addFields stage', () => {
        const stage: AddFieldsStage = {
          ...createBaseStage('$addFields'),
          fields: [
            { id: 'field-1', field: 'totalPrice', expression: '{ "$multiply": ["$price", "$quantity"] }' },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $addFields: {
            totalPrice: { $multiply: ['$price', '$quantity'] },
          },
        })
      })

      it('should convert $addFields with multiple fields', () => {
        const stage: AddFieldsStage = {
          ...createBaseStage('$addFields'),
          fields: [
            { id: 'field-1', field: 'fullName', expression: '{ "$concat": ["$firstName", " ", "$lastName"] }' },
            { id: 'field-2', field: 'age', expression: '{ "$dateDiff": { "startDate": "$birthDate", "endDate": "$$NOW", "unit": "year" } }' },
          ],
          useRawJson: false,
          rawJson: '',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $addFields: {
            fullName: { $concat: ['$firstName', ' ', '$lastName'] },
            age: { $dateDiff: { startDate: '$birthDate', endDate: '$$NOW', unit: 'year' } },
          },
        })
      })

      it('should use rawJson when useRawJson is true', () => {
        const stage: AddFieldsStage = {
          ...createBaseStage('$addFields'),
          fields: [],
          useRawJson: true,
          rawJson: '{ "discountedPrice": { "$subtract": ["$price", { "$multiply": ["$price", 0.1] }] } }',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $addFields: {
            discountedPrice: { $subtract: ['$price', { $multiply: ['$price', 0.1] }] },
          },
        })
      })
    })

    describe('$count stage conversion', () => {
      it('should convert a $count stage', () => {
        const stage: CountStage = {
          ...createBaseStage('$count'),
          outputField: 'totalDocuments',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $count: 'totalDocuments',
        })
      })

      it('should handle custom output field names', () => {
        const stage: CountStage = {
          ...createBaseStage('$count'),
          outputField: 'numberOfResults',
        }

        const result = stageToMongoDBFormat(stage)

        expect(result).toEqual({
          $count: 'numberOfResults',
        })
      })
    })
  })

  describe('stagesToPipeline', () => {
    it('should convert an array of stages to a complete pipeline', () => {
      const stages: AggregationStage[] = [
        {
          id: 'stage-1',
          type: '$match',
          enabled: true,
          conditions: [{ id: 'cond-1', field: 'status', operator: '$eq', value: 'active', valueType: 'string' }],
          useRawJson: false,
          rawJson: '',
        } as MatchStage,
        {
          id: 'stage-2',
          type: '$sort',
          enabled: true,
          fields: [{ id: 'sort-1', field: 'createdAt', direction: -1 }],
        } as SortStage,
        {
          id: 'stage-3',
          type: '$limit',
          enabled: true,
          limit: 10,
        } as LimitStage,
      ]

      const result = stagesToPipeline(stages)

      expect(result).toEqual([
        { $match: { status: { $eq: 'active' } } },
        { $sort: { createdAt: -1 } },
        { $limit: 10 },
      ])
    })

    it('should exclude disabled stages from the pipeline', () => {
      const stages: AggregationStage[] = [
        {
          id: 'stage-1',
          type: '$match',
          enabled: true,
          conditions: [{ id: 'cond-1', field: 'status', operator: '$eq', value: 'active', valueType: 'string' }],
          useRawJson: false,
          rawJson: '',
        } as MatchStage,
        {
          id: 'stage-2',
          type: '$sort',
          enabled: false, // Disabled
          fields: [{ id: 'sort-1', field: 'createdAt', direction: -1 }],
        } as SortStage,
        {
          id: 'stage-3',
          type: '$limit',
          enabled: true,
          limit: 10,
        } as LimitStage,
      ]

      const result = stagesToPipeline(stages)

      expect(result).toEqual([
        { $match: { status: { $eq: 'active' } } },
        { $limit: 10 },
      ])
    })

    it('should handle all disabled stages', () => {
      const stages: AggregationStage[] = [
        {
          id: 'stage-1',
          type: '$match',
          enabled: false,
          conditions: [],
          useRawJson: false,
          rawJson: '',
        } as MatchStage,
        {
          id: 'stage-2',
          type: '$limit',
          enabled: false,
          limit: 10,
        } as LimitStage,
      ]

      const result = stagesToPipeline(stages)

      expect(result).toEqual([])
    })

    it('should return an empty array for empty input', () => {
      const stages: AggregationStage[] = []

      const result = stagesToPipeline(stages)

      expect(result).toEqual([])
    })

    it('should preserve stage order in the pipeline', () => {
      const stages: AggregationStage[] = [
        {
          id: 'stage-1',
          type: '$skip',
          enabled: true,
          skip: 10,
        } as SkipStage,
        {
          id: 'stage-2',
          type: '$limit',
          enabled: true,
          limit: 5,
        } as LimitStage,
        {
          id: 'stage-3',
          type: '$sort',
          enabled: true,
          fields: [{ id: 'sort-1', field: 'name', direction: 1 }],
        } as SortStage,
      ]

      const result = stagesToPipeline(stages)

      expect(result).toEqual([
        { $skip: 10 },
        { $limit: 5 },
        { $sort: { name: 1 } },
      ])
    })

    it('should handle a complex pipeline with multiple stage types', () => {
      const stages: AggregationStage[] = [
        {
          id: 'stage-1',
          type: '$match',
          enabled: true,
          conditions: [{ id: 'cond-1', field: 'year', operator: '$gte', value: '2020', valueType: 'number' }],
          useRawJson: false,
          rawJson: '',
        } as MatchStage,
        {
          id: 'stage-2',
          type: '$unwind',
          enabled: true,
          config: { path: 'items', preserveNullAndEmptyArrays: false },
        } as UnwindStage,
        {
          id: 'stage-3',
          type: '$group',
          enabled: true,
          groupByField: 'category',
          groupByExpression: '',
          useCompoundKey: false,
          accumulators: [
            { id: 'acc-1', outputField: 'totalRevenue', operator: '$sum', inputField: 'items.price', useConstant: false },
          ],
          useRawJson: false,
          rawJson: '',
        } as GroupStage,
        {
          id: 'stage-4',
          type: '$sort',
          enabled: true,
          fields: [{ id: 'sort-1', field: 'totalRevenue', direction: -1 }],
        } as SortStage,
        {
          id: 'stage-5',
          type: '$limit',
          enabled: true,
          limit: 5,
        } as LimitStage,
      ]

      const result = stagesToPipeline(stages)

      expect(result).toEqual([
        { $match: { year: { $gte: 2020 } } },
        { $unwind: '$items' },
        { $group: { _id: '$category', totalRevenue: { $sum: '$items.price' } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 },
      ])
    })

    it('should handle mixed enabled and disabled stages correctly', () => {
      const stages: AggregationStage[] = [
        {
          id: 'stage-1',
          type: '$match',
          enabled: true,
          conditions: [{ id: 'cond-1', field: 'active', operator: '$eq', value: 'true', valueType: 'boolean' }],
          useRawJson: false,
          rawJson: '',
        } as MatchStage,
        {
          id: 'stage-2',
          type: '$project',
          enabled: false, // Disabled
          fields: [{ id: 'field-1', field: 'name', include: true, isExpression: false }],
          useRawJson: false,
          rawJson: '',
        } as ProjectStage,
        {
          id: 'stage-3',
          type: '$sort',
          enabled: true,
          fields: [{ id: 'sort-1', field: 'name', direction: 1 }],
        } as SortStage,
        {
          id: 'stage-4',
          type: '$skip',
          enabled: false, // Disabled
          skip: 10,
        } as SkipStage,
        {
          id: 'stage-5',
          type: '$limit',
          enabled: true,
          limit: 20,
        } as LimitStage,
      ]

      const result = stagesToPipeline(stages)

      expect(result).toEqual([
        { $match: { active: { $eq: true } } },
        { $sort: { name: 1 } },
        { $limit: 20 },
      ])
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty match conditions', () => {
      const stage: MatchStage = {
        ...createBaseStage('$match'),
        conditions: [],
        useRawJson: false,
        rawJson: '',
      }

      const result = stageToMongoDBFormat(stage)

      expect(result).toEqual({
        $match: {},
      })
    })

    it('should handle empty project fields', () => {
      const stage: ProjectStage = {
        ...createBaseStage('$project'),
        fields: [],
        useRawJson: false,
        rawJson: '',
      }

      const result = stageToMongoDBFormat(stage)

      expect(result).toEqual({
        $project: {},
      })
    })

    it('should handle empty group accumulators', () => {
      const stage: GroupStage = {
        ...createBaseStage('$group'),
        groupByField: 'category',
        groupByExpression: '',
        useCompoundKey: false,
        accumulators: [],
        useRawJson: false,
        rawJson: '',
      }

      const result = stageToMongoDBFormat(stage)

      expect(result).toEqual({
        $group: {
          _id: '$category',
        },
      })
    })

    it('should handle empty sort fields', () => {
      const stage: SortStage = {
        ...createBaseStage('$sort'),
        fields: [],
      }

      const result = stageToMongoDBFormat(stage)

      expect(result).toEqual({
        $sort: {},
      })
    })

    it('should handle empty addFields', () => {
      const stage: AddFieldsStage = {
        ...createBaseStage('$addFields'),
        fields: [],
        useRawJson: false,
        rawJson: '',
      }

      const result = stageToMongoDBFormat(stage)

      expect(result).toEqual({
        $addFields: {},
      })
    })

    it('should handle invalid JSON in rawJson gracefully', () => {
      const stage: MatchStage = {
        ...createBaseStage('$match'),
        conditions: [],
        useRawJson: true,
        rawJson: '{ invalid json }',
      }

      // Should throw or return null/undefined for invalid JSON
      expect(() => stageToMongoDBFormat(stage)).toThrow()
    })

    it('should handle special characters in field names', () => {
      const stage: MatchStage = {
        ...createBaseStage('$match'),
        conditions: [
          { id: 'cond-1', field: 'nested.field.name', operator: '$eq', value: 'test', valueType: 'string' },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = stageToMongoDBFormat(stage)

      expect(result).toEqual({
        $match: {
          'nested.field.name': { $eq: 'test' },
        },
      })
    })

    it('should handle numeric string to number conversion', () => {
      const stage: MatchStage = {
        ...createBaseStage('$match'),
        conditions: [
          { id: 'cond-1', field: 'count', operator: '$gt', value: '100', valueType: 'number' },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = stageToMongoDBFormat(stage)

      expect(result).toEqual({
        $match: {
          count: { $gt: 100 },
        },
      })
    })

    it('should handle boolean string to boolean conversion', () => {
      const stage: MatchStage = {
        ...createBaseStage('$match'),
        conditions: [
          { id: 'cond-1', field: 'isActive', operator: '$eq', value: 'true', valueType: 'boolean' },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = stageToMongoDBFormat(stage)

      expect(result).toEqual({
        $match: {
          isActive: { $eq: true },
        },
      })
    })

    it('should handle auto value type detection', () => {
      const stage: MatchStage = {
        ...createBaseStage('$match'),
        conditions: [
          { id: 'cond-1', field: 'value', operator: '$eq', value: '42', valueType: 'auto' },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = stageToMongoDBFormat(stage)

      // Auto should detect "42" as a number
      expect(result).toEqual({
        $match: {
          value: { $eq: 42 },
        },
      })
    })

    it('should handle unwind path without dollar sign prefix', () => {
      const stage: UnwindStage = {
        ...createBaseStage('$unwind'),
        config: {
          path: 'items', // No $ prefix
          preserveNullAndEmptyArrays: false,
        },
      }

      const result = stageToMongoDBFormat(stage)

      // Should add $ prefix automatically
      expect(result).toEqual({
        $unwind: '$items',
      })
    })

    it('should handle unwind path with dollar sign prefix', () => {
      const stage: UnwindStage = {
        ...createBaseStage('$unwind'),
        config: {
          path: '$items', // With $ prefix
          preserveNullAndEmptyArrays: false,
        },
      }

      const result = stageToMongoDBFormat(stage)

      // Should not double the $ prefix
      expect(result).toEqual({
        $unwind: '$items',
      })
    })
  })
})
