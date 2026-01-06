/**
 * Stage Converter Tests
 *
 * RED Phase - Issue: mondodb-uu5u
 *
 * This test suite verifies the conversion between UI stage format and MongoDB pipeline format.
 * These tests should FAIL initially - the stageConverter.ts utility doesn't exist yet.
 *
 * The stageConverter utility should handle:
 * 1. Converting UI stage format (with id, type, enabled) to MongoDB pipeline format
 * 2. Converting MongoDB pipeline format to UI stage format
 * 3. All stage types: $match, $group, $project, $sort, $limit, $skip, $unwind, $lookup, $addFields, $count, $vectorSearch, $search
 * 4. Preserving all stage properties during conversion
 * 5. Error handling for invalid stages
 */

import { describe, it, expect } from 'vitest'
import {
  convertUIStageToMongoDB,
  convertMongoDBStageToUI,
  convertUIStageArrayToMongoDB,
  convertMongoDBStageArrayToUI,
  validateUIStage,
  validateMongoDBStage,
} from '../stageConverter'

// Import UI stage types
import type {
  AggregationStage,
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
  MatchCondition,
  GroupAccumulator,
  ProjectField,
  SortField,
  AddFieldEntry,
} from '../../components/stage-editor/types'

// Import MongoDB pipeline types
import type {
  AggregationStage as MongoDBStage,
  Filter,
} from '@/../../src/types/mongodb'

describe('stageConverter - UI to MongoDB conversion', () => {
  describe('$match stage conversion', () => {
    it('should convert $match stage with single condition', () => {
      const uiStage: MatchStage = {
        id: 'match-1',
        type: '$match',
        enabled: true,
        conditions: [
          {
            id: 'cond-1',
            field: 'age',
            operator: '$gt',
            value: '25',
            valueType: 'number',
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $match: {
          age: { $gt: 25 },
        },
      })
    })

    it('should convert $match stage with multiple conditions using $and', () => {
      const uiStage: MatchStage = {
        id: 'match-2',
        type: '$match',
        enabled: true,
        conditions: [
          {
            id: 'cond-1',
            field: 'age',
            operator: '$gte',
            value: '18',
            valueType: 'number',
          },
          {
            id: 'cond-2',
            field: 'status',
            operator: '$eq',
            value: 'active',
            valueType: 'string',
          },
        ],
        logicalOperator: '$and',
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $match: {
          $and: [{ age: { $gte: 18 } }, { status: { $eq: 'active' } }],
        },
      })
    })

    it('should convert $match stage with $or operator', () => {
      const uiStage: MatchStage = {
        id: 'match-3',
        type: '$match',
        enabled: true,
        conditions: [
          {
            id: 'cond-1',
            field: 'role',
            operator: '$eq',
            value: 'admin',
            valueType: 'string',
          },
          {
            id: 'cond-2',
            field: 'role',
            operator: '$eq',
            value: 'moderator',
            valueType: 'string',
          },
        ],
        logicalOperator: '$or',
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $match: {
          $or: [{ role: { $eq: 'admin' } }, { role: { $eq: 'moderator' } }],
        },
      })
    })

    it('should convert $match stage with $regex operator', () => {
      const uiStage: MatchStage = {
        id: 'match-4',
        type: '$match',
        enabled: true,
        conditions: [
          {
            id: 'cond-1',
            field: 'email',
            operator: '$regex',
            value: '.*@example\\.com$',
            valueType: 'string',
            regexOptions: 'i',
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $match: {
          email: { $regex: '.*@example\\.com$', $options: 'i' },
        },
      })
    })

    it('should convert $match stage with $in operator', () => {
      const uiStage: MatchStage = {
        id: 'match-5',
        type: '$match',
        enabled: true,
        conditions: [
          {
            id: 'cond-1',
            field: 'status',
            operator: '$in',
            value: '["active", "pending", "verified"]',
            valueType: 'auto',
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $match: {
          status: { $in: ['active', 'pending', 'verified'] },
        },
      })
    })

    it('should convert $match stage with raw JSON', () => {
      const uiStage: MatchStage = {
        id: 'match-6',
        type: '$match',
        enabled: true,
        conditions: [],
        useRawJson: true,
        rawJson: '{ "age": { "$gte": 21 }, "country": "US" }',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $match: {
          age: { $gte: 21 },
          country: 'US',
        },
      })
    })

    it('should handle $exists operator', () => {
      const uiStage: MatchStage = {
        id: 'match-7',
        type: '$match',
        enabled: true,
        conditions: [
          {
            id: 'cond-1',
            field: 'deletedAt',
            operator: '$exists',
            value: 'false',
            valueType: 'boolean',
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $match: {
          deletedAt: { $exists: false },
        },
      })
    })
  })

  describe('$group stage conversion', () => {
    it('should convert $group stage with simple _id field', () => {
      const uiStage: GroupStage = {
        id: 'group-1',
        type: '$group',
        enabled: true,
        groupByField: 'category',
        groupByExpression: '',
        useCompoundKey: false,
        accumulators: [
          {
            id: 'acc-1',
            outputField: 'total',
            operator: '$sum',
            inputField: 'amount',
            useConstant: false,
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
        },
      })
    })

    it('should convert $group stage with null _id (count all)', () => {
      const uiStage: GroupStage = {
        id: 'group-2',
        type: '$group',
        enabled: true,
        groupByField: '',
        groupByExpression: '',
        useCompoundKey: false,
        accumulators: [
          {
            id: 'acc-1',
            outputField: 'count',
            operator: '$sum',
            inputField: '',
            useConstant: true,
            constantValue: 1,
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      })
    })

    it('should convert $group stage with compound key', () => {
      const uiStage: GroupStage = {
        id: 'group-3',
        type: '$group',
        enabled: true,
        groupByField: '',
        groupByExpression: '{ "year": { "$year": "$date" }, "month": { "$month": "$date" } }',
        useCompoundKey: true,
        accumulators: [
          {
            id: 'acc-1',
            outputField: 'revenue',
            operator: '$sum',
            inputField: 'amount',
            useConstant: false,
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' } },
          revenue: { $sum: '$amount' },
        },
      })
    })

    it('should convert $group stage with multiple accumulators', () => {
      const uiStage: GroupStage = {
        id: 'group-4',
        type: '$group',
        enabled: true,
        groupByField: 'department',
        groupByExpression: '',
        useCompoundKey: false,
        accumulators: [
          {
            id: 'acc-1',
            outputField: 'avgSalary',
            operator: '$avg',
            inputField: 'salary',
            useConstant: false,
          },
          {
            id: 'acc-2',
            outputField: 'maxSalary',
            operator: '$max',
            inputField: 'salary',
            useConstant: false,
          },
          {
            id: 'acc-3',
            outputField: 'minSalary',
            operator: '$min',
            inputField: 'salary',
            useConstant: false,
          },
          {
            id: 'acc-4',
            outputField: 'employeeCount',
            operator: '$count',
            inputField: '',
            useConstant: false,
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $group: {
          _id: '$department',
          avgSalary: { $avg: '$salary' },
          maxSalary: { $max: '$salary' },
          minSalary: { $min: '$salary' },
          employeeCount: { $count: {} },
        },
      })
    })

    it('should convert $group stage with $push and $addToSet operators', () => {
      const uiStage: GroupStage = {
        id: 'group-5',
        type: '$group',
        enabled: true,
        groupByField: 'userId',
        groupByExpression: '',
        useCompoundKey: false,
        accumulators: [
          {
            id: 'acc-1',
            outputField: 'allOrders',
            operator: '$push',
            inputField: 'orderId',
            useConstant: false,
          },
          {
            id: 'acc-2',
            outputField: 'uniqueProducts',
            operator: '$addToSet',
            inputField: 'productId',
            useConstant: false,
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $group: {
          _id: '$userId',
          allOrders: { $push: '$orderId' },
          uniqueProducts: { $addToSet: '$productId' },
        },
      })
    })

    it('should convert $group stage with raw JSON', () => {
      const uiStage: GroupStage = {
        id: 'group-6',
        type: '$group',
        enabled: true,
        groupByField: '',
        groupByExpression: '',
        useCompoundKey: false,
        accumulators: [],
        useRawJson: true,
        rawJson: '{ "_id": "$status", "count": { "$sum": 1 }, "avgAmount": { "$avg": "$amount" } }',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' },
        },
      })
    })
  })

  describe('$project stage conversion', () => {
    it('should convert $project stage with simple field inclusion', () => {
      const uiStage: ProjectStage = {
        id: 'project-1',
        type: '$project',
        enabled: true,
        fields: [
          { id: 'f-1', field: 'name', include: true, isExpression: false },
          { id: 'f-2', field: 'email', include: true, isExpression: false },
          { id: 'f-3', field: 'age', include: true, isExpression: false },
        ],
        excludeId: false,
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $project: {
          name: 1,
          email: 1,
          age: 1,
        },
      })
    })

    it('should convert $project stage with field exclusion', () => {
      const uiStage: ProjectStage = {
        id: 'project-2',
        type: '$project',
        enabled: true,
        fields: [
          { id: 'f-1', field: 'password', include: false, isExpression: false },
          { id: 'f-2', field: 'ssn', include: false, isExpression: false },
        ],
        excludeId: true,
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $project: {
          _id: 0,
          password: 0,
          ssn: 0,
        },
      })
    })

    it('should convert $project stage with expressions', () => {
      const uiStage: ProjectStage = {
        id: 'project-3',
        type: '$project',
        enabled: true,
        fields: [
          { id: 'f-1', field: 'name', include: true, isExpression: false },
          {
            id: 'f-2',
            field: 'fullName',
            include: '{ "$concat": ["$firstName", " ", "$lastName"] }',
            isExpression: true,
          },
          {
            id: 'f-3',
            field: 'ageInMonths',
            include: '{ "$multiply": ["$age", 12] }',
            isExpression: true,
          },
        ],
        excludeId: false,
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $project: {
          name: 1,
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          ageInMonths: { $multiply: ['$age', 12] },
        },
      })
    })

    it('should convert $project stage with raw JSON', () => {
      const uiStage: ProjectStage = {
        id: 'project-4',
        type: '$project',
        enabled: true,
        fields: [],
        excludeId: false,
        useRawJson: true,
        rawJson: '{ "name": 1, "email": 1, "isActive": { "$eq": ["$status", "active"] } }',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $project: {
          name: 1,
          email: 1,
          isActive: { $eq: ['$status', 'active'] },
        },
      })
    })
  })

  describe('$sort stage conversion', () => {
    it('should convert $sort stage with single field', () => {
      const uiStage: SortStage = {
        id: 'sort-1',
        type: '$sort',
        enabled: true,
        fields: [{ id: 'sf-1', field: 'createdAt', direction: -1 }],
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $sort: {
          createdAt: -1,
        },
      })
    })

    it('should convert $sort stage with multiple fields', () => {
      const uiStage: SortStage = {
        id: 'sort-2',
        type: '$sort',
        enabled: true,
        fields: [
          { id: 'sf-1', field: 'category', direction: 1 },
          { id: 'sf-2', field: 'price', direction: -1 },
          { id: 'sf-3', field: 'name', direction: 1 },
        ],
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $sort: {
          category: 1,
          price: -1,
          name: 1,
        },
      })
    })
  })

  describe('$limit stage conversion', () => {
    it('should convert $limit stage', () => {
      const uiStage: LimitStage = {
        id: 'limit-1',
        type: '$limit',
        enabled: true,
        limit: 10,
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $limit: 10,
      })
    })
  })

  describe('$skip stage conversion', () => {
    it('should convert $skip stage', () => {
      const uiStage: SkipStage = {
        id: 'skip-1',
        type: '$skip',
        enabled: true,
        skip: 20,
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $skip: 20,
      })
    })
  })

  describe('$unwind stage conversion', () => {
    it('should convert $unwind stage with simple path', () => {
      const uiStage: UnwindStage = {
        id: 'unwind-1',
        type: '$unwind',
        enabled: true,
        config: {
          path: 'tags',
          preserveNullAndEmptyArrays: false,
        },
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $unwind: '$tags',
      })
    })

    it('should convert $unwind stage with preserveNullAndEmptyArrays', () => {
      const uiStage: UnwindStage = {
        id: 'unwind-2',
        type: '$unwind',
        enabled: true,
        config: {
          path: 'items',
          preserveNullAndEmptyArrays: true,
        },
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $unwind: {
          path: '$items',
          preserveNullAndEmptyArrays: true,
        },
      })
    })

    it('should convert $unwind stage with includeArrayIndex', () => {
      const uiStage: UnwindStage = {
        id: 'unwind-3',
        type: '$unwind',
        enabled: true,
        config: {
          path: 'orders',
          includeArrayIndex: 'orderIndex',
          preserveNullAndEmptyArrays: false,
        },
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $unwind: {
          path: '$orders',
          includeArrayIndex: 'orderIndex',
        },
      })
    })
  })

  describe('$lookup stage conversion', () => {
    it('should convert $lookup stage with simple equality', () => {
      const uiStage: LookupStage = {
        id: 'lookup-1',
        type: '$lookup',
        enabled: true,
        config: {
          from: 'orders',
          localField: 'userId',
          foreignField: 'customerId',
          as: 'userOrders',
        },
        usePipeline: false,
        pipelineJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $lookup: {
          from: 'orders',
          localField: 'userId',
          foreignField: 'customerId',
          as: 'userOrders',
        },
      })
    })

    it('should convert $lookup stage with pipeline', () => {
      const uiStage: LookupStage = {
        id: 'lookup-2',
        type: '$lookup',
        enabled: true,
        config: {
          from: 'products',
          localField: '',
          foreignField: '',
          as: 'matchedProducts',
        },
        usePipeline: true,
        pipelineJson: '[{ "$match": { "$expr": { "$eq": ["$_id", "$$productId"] } } }]',
        letVariables: '{ "productId": "$productId" }',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $lookup: {
          from: 'products',
          let: { productId: '$productId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$productId'] },
              },
            },
          ],
          as: 'matchedProducts',
        },
      })
    })
  })

  describe('$addFields stage conversion', () => {
    it('should convert $addFields stage with simple fields', () => {
      const uiStage: AddFieldsStage = {
        id: 'addfields-1',
        type: '$addFields',
        enabled: true,
        fields: [
          {
            id: 'af-1',
            field: 'totalPrice',
            expression: '{ "$multiply": ["$quantity", "$price"] }',
          },
          {
            id: 'af-2',
            field: 'discountedPrice',
            expression: '{ "$subtract": ["$totalPrice", "$discount"] }',
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $addFields: {
          totalPrice: { $multiply: ['$quantity', '$price'] },
          discountedPrice: { $subtract: ['$totalPrice', '$discount'] },
        },
      })
    })

    it('should convert $addFields stage with raw JSON', () => {
      const uiStage: AddFieldsStage = {
        id: 'addfields-2',
        type: '$addFields',
        enabled: true,
        fields: [],
        useRawJson: true,
        rawJson: '{ "fullAddress": { "$concat": ["$street", ", ", "$city", ", ", "$state"] } }',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $addFields: {
          fullAddress: { $concat: ['$street', ', ', '$city', ', ', '$state'] },
        },
      })
    })
  })

  describe('$count stage conversion', () => {
    it('should convert $count stage', () => {
      const uiStage: CountStage = {
        id: 'count-1',
        type: '$count',
        enabled: true,
        outputField: 'totalDocuments',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $count: 'totalDocuments',
      })
    })
  })

  describe('disabled stages', () => {
    it('should return null for disabled stages', () => {
      const uiStage: LimitStage = {
        id: 'limit-1',
        type: '$limit',
        enabled: false,
        limit: 10,
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toBeNull()
    })
  })
})

describe('stageConverter - MongoDB to UI conversion', () => {
  describe('$match stage conversion', () => {
    it('should convert MongoDB $match stage to UI format', () => {
      const mongoStage: MongoDBStage = {
        $match: {
          age: { $gt: 25 },
        },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$match')
      expect(result.enabled).toBe(true)
      expect(result.id).toBeDefined()
      expect((result as MatchStage).useRawJson).toBe(true)
      expect((result as MatchStage).rawJson).toContain('"age"')
      expect((result as MatchStage).rawJson).toContain('$gt')
    })

    it('should convert complex $match with $and', () => {
      const mongoStage: MongoDBStage = {
        $match: {
          $and: [{ age: { $gte: 18 } }, { status: 'active' }],
        },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$match')
      expect((result as MatchStage).useRawJson).toBe(true)
      expect((result as MatchStage).rawJson).toContain('$and')
    })
  })

  describe('$group stage conversion', () => {
    it('should convert MongoDB $group stage to UI format', () => {
      const mongoStage: MongoDBStage = {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
        },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$group')
      expect(result.enabled).toBe(true)
      expect((result as GroupStage).useRawJson).toBe(true)
      expect((result as GroupStage).rawJson).toContain('_id')
      expect((result as GroupStage).rawJson).toContain('$category')
    })

    it('should convert $group with null _id', () => {
      const mongoStage: MongoDBStage = {
        $group: {
          _id: null,
          count: { $sum: 1 },
        },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$group')
      expect((result as GroupStage).rawJson).toContain('null')
    })
  })

  describe('$project stage conversion', () => {
    it('should convert MongoDB $project stage to UI format', () => {
      const mongoStage: MongoDBStage = {
        $project: {
          name: 1,
          email: 1,
          age: 1,
        },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$project')
      expect(result.enabled).toBe(true)
      expect((result as ProjectStage).useRawJson).toBe(true)
      expect((result as ProjectStage).rawJson).toContain('name')
    })
  })

  describe('$sort stage conversion', () => {
    it('should convert MongoDB $sort stage to UI format', () => {
      const mongoStage: MongoDBStage = {
        $sort: {
          createdAt: -1,
          name: 1,
        },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$sort')
      expect(result.enabled).toBe(true)
      expect((result as SortStage).fields).toHaveLength(2)
      expect((result as SortStage).fields[0].field).toBe('createdAt')
      expect((result as SortStage).fields[0].direction).toBe(-1)
      expect((result as SortStage).fields[1].field).toBe('name')
      expect((result as SortStage).fields[1].direction).toBe(1)
    })
  })

  describe('$limit stage conversion', () => {
    it('should convert MongoDB $limit stage to UI format', () => {
      const mongoStage: MongoDBStage = {
        $limit: 10,
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$limit')
      expect(result.enabled).toBe(true)
      expect((result as LimitStage).limit).toBe(10)
    })
  })

  describe('$skip stage conversion', () => {
    it('should convert MongoDB $skip stage to UI format', () => {
      const mongoStage: MongoDBStage = {
        $skip: 20,
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$skip')
      expect(result.enabled).toBe(true)
      expect((result as SkipStage).skip).toBe(20)
    })
  })

  describe('$unwind stage conversion', () => {
    it('should convert MongoDB $unwind stage with string path', () => {
      const mongoStage: MongoDBStage = {
        $unwind: '$tags',
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$unwind')
      expect(result.enabled).toBe(true)
      expect((result as UnwindStage).config.path).toBe('tags')
      expect((result as UnwindStage).config.preserveNullAndEmptyArrays).toBe(false)
    })

    it('should convert MongoDB $unwind stage with object config', () => {
      const mongoStage: MongoDBStage = {
        $unwind: {
          path: '$items',
          preserveNullAndEmptyArrays: true,
        },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$unwind')
      expect((result as UnwindStage).config.path).toBe('items')
      expect((result as UnwindStage).config.preserveNullAndEmptyArrays).toBe(true)
    })
  })

  describe('$lookup stage conversion', () => {
    it('should convert MongoDB $lookup stage to UI format', () => {
      const mongoStage: MongoDBStage = {
        $lookup: {
          from: 'orders',
          localField: 'userId',
          foreignField: 'customerId',
          as: 'userOrders',
        },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$lookup')
      expect(result.enabled).toBe(true)
      expect((result as LookupStage).config.from).toBe('orders')
      expect((result as LookupStage).config.localField).toBe('userId')
      expect((result as LookupStage).config.foreignField).toBe('customerId')
      expect((result as LookupStage).config.as).toBe('userOrders')
      expect((result as LookupStage).usePipeline).toBe(false)
    })

    it('should convert $lookup with pipeline', () => {
      const mongoStage: MongoDBStage = {
        $lookup: {
          from: 'products',
          let: { productId: '$productId' },
          pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$productId'] } } }],
          as: 'matchedProducts',
        },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$lookup')
      expect((result as LookupStage).usePipeline).toBe(true)
      expect((result as LookupStage).pipelineJson).toBeDefined()
      expect((result as LookupStage).letVariables).toBeDefined()
    })
  })

  describe('$addFields stage conversion', () => {
    it('should convert MongoDB $addFields stage to UI format', () => {
      const mongoStage: MongoDBStage = {
        $addFields: {
          totalPrice: { $multiply: ['$quantity', '$price'] },
        },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$addFields')
      expect(result.enabled).toBe(true)
      expect((result as AddFieldsStage).useRawJson).toBe(true)
      expect((result as AddFieldsStage).rawJson).toContain('totalPrice')
    })
  })

  describe('$count stage conversion', () => {
    it('should convert MongoDB $count stage to UI format', () => {
      const mongoStage: MongoDBStage = {
        $count: 'totalDocuments',
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$count')
      expect(result.enabled).toBe(true)
      expect((result as CountStage).outputField).toBe('totalDocuments')
    })
  })

  describe('ID generation', () => {
    it('should generate unique IDs for converted stages', () => {
      const mongoStage1: MongoDBStage = { $limit: 10 }
      const mongoStage2: MongoDBStage = { $skip: 5 }

      const result1 = convertMongoDBStageToUI(mongoStage1)
      const result2 = convertMongoDBStageToUI(mongoStage2)

      expect(result1.id).toBeDefined()
      expect(result2.id).toBeDefined()
      expect(result1.id).not.toBe(result2.id)
    })
  })
})

describe('stageConverter - Array conversion', () => {
  describe('UI array to MongoDB array', () => {
    it('should convert array of UI stages to MongoDB pipeline', () => {
      const uiStages: AggregationStage[] = [
        {
          id: 'match-1',
          type: '$match',
          enabled: true,
          conditions: [],
          useRawJson: true,
          rawJson: '{ "status": "active" }',
        } as MatchStage,
        {
          id: 'sort-1',
          type: '$sort',
          enabled: true,
          fields: [{ id: 'sf-1', field: 'createdAt', direction: -1 }],
        } as SortStage,
        {
          id: 'limit-1',
          type: '$limit',
          enabled: true,
          limit: 10,
        } as LimitStage,
      ]

      const result = convertUIStageArrayToMongoDB(uiStages)

      expect(result).toHaveLength(3)
      expect(result[0]).toHaveProperty('$match')
      expect(result[1]).toHaveProperty('$sort')
      expect(result[2]).toHaveProperty('$limit')
    })

    it('should skip disabled stages in array conversion', () => {
      const uiStages: AggregationStage[] = [
        {
          id: 'match-1',
          type: '$match',
          enabled: true,
          conditions: [],
          useRawJson: true,
          rawJson: '{ "status": "active" }',
        } as MatchStage,
        {
          id: 'limit-1',
          type: '$limit',
          enabled: false,
          limit: 10,
        } as LimitStage,
        {
          id: 'skip-1',
          type: '$skip',
          enabled: true,
          skip: 5,
        } as SkipStage,
      ]

      const result = convertUIStageArrayToMongoDB(uiStages)

      expect(result).toHaveLength(2)
      expect(result[0]).toHaveProperty('$match')
      expect(result[1]).toHaveProperty('$skip')
    })

    it('should handle empty array', () => {
      const result = convertUIStageArrayToMongoDB([])
      expect(result).toEqual([])
    })
  })

  describe('MongoDB array to UI array', () => {
    it('should convert MongoDB pipeline to UI stages array', () => {
      const mongoPipeline: MongoDBStage[] = [
        { $match: { status: 'active' } },
        { $sort: { createdAt: -1 } },
        { $limit: 10 },
      ]

      const result = convertMongoDBStageArrayToUI(mongoPipeline)

      expect(result).toHaveLength(3)
      expect(result[0].type).toBe('$match')
      expect(result[1].type).toBe('$sort')
      expect(result[2].type).toBe('$limit')
      expect(result[0].enabled).toBe(true)
      expect(result[1].enabled).toBe(true)
      expect(result[2].enabled).toBe(true)
    })

    it('should handle empty pipeline', () => {
      const result = convertMongoDBStageArrayToUI([])
      expect(result).toEqual([])
    })

    it('should preserve stage order', () => {
      const mongoPipeline: MongoDBStage[] = [
        { $skip: 10 },
        { $limit: 5 },
        { $sort: { name: 1 } },
      ]

      const result = convertMongoDBStageArrayToUI(mongoPipeline)

      expect(result[0].type).toBe('$skip')
      expect(result[1].type).toBe('$limit')
      expect(result[2].type).toBe('$sort')
    })
  })

  describe('Round-trip conversion', () => {
    it('should preserve pipeline semantics through round-trip conversion', () => {
      const originalPipeline: MongoDBStage[] = [
        { $match: { age: { $gte: 18 } } },
        { $sort: { name: 1 } },
        { $limit: 100 },
      ]

      const uiStages = convertMongoDBStageArrayToUI(originalPipeline)
      const convertedBack = convertUIStageArrayToMongoDB(uiStages)

      expect(convertedBack).toHaveLength(originalPipeline.length)
      expect(convertedBack[0]).toHaveProperty('$match')
      expect(convertedBack[1]).toHaveProperty('$sort')
      expect(convertedBack[2]).toHaveProperty('$limit')
    })
  })
})

describe('stageConverter - Validation', () => {
  describe('validateUIStage', () => {
    it('should validate a valid $match stage', () => {
      const validStage: MatchStage = {
        id: 'match-1',
        type: '$match',
        enabled: true,
        conditions: [
          {
            id: 'cond-1',
            field: 'age',
            operator: '$gt',
            value: '25',
            valueType: 'number',
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = validateUIStage(validStage)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate a valid $limit stage', () => {
      const validStage: LimitStage = {
        id: 'limit-1',
        type: '$limit',
        enabled: true,
        limit: 10,
      }

      const result = validateUIStage(validStage)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject stage with missing required fields', () => {
      const invalidStage = {
        id: 'invalid-1',
        type: '$match',
        // Missing: enabled, conditions, useRawJson, rawJson
      } as unknown as MatchStage

      const result = validateUIStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should reject $match stage with invalid raw JSON', () => {
      const invalidStage: MatchStage = {
        id: 'match-1',
        type: '$match',
        enabled: true,
        conditions: [],
        useRawJson: true,
        rawJson: '{ invalid json',
      }

      const result = validateUIStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Invalid JSON in rawJson field')
    })

    it('should reject $limit stage with negative value', () => {
      const invalidStage: LimitStage = {
        id: 'limit-1',
        type: '$limit',
        enabled: true,
        limit: -5,
      }

      const result = validateUIStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Limit must be a positive number')
    })

    it('should reject $skip stage with negative value', () => {
      const invalidStage: SkipStage = {
        id: 'skip-1',
        type: '$skip',
        enabled: true,
        skip: -10,
      }

      const result = validateUIStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Skip must be a non-negative number')
    })

    it('should reject $group stage with empty accumulators and no raw JSON', () => {
      const invalidStage: GroupStage = {
        id: 'group-1',
        type: '$group',
        enabled: true,
        groupByField: 'category',
        groupByExpression: '',
        useCompoundKey: false,
        accumulators: [],
        useRawJson: false,
        rawJson: '',
      }

      const result = validateUIStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Group stage must have at least one accumulator')
    })

    it('should reject $count stage with empty output field', () => {
      const invalidStage: CountStage = {
        id: 'count-1',
        type: '$count',
        enabled: true,
        outputField: '',
      }

      const result = validateUIStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Count output field cannot be empty')
    })

    it('should provide warnings for potential issues', () => {
      const stageWithWarning: MatchStage = {
        id: 'match-1',
        type: '$match',
        enabled: true,
        conditions: [],
        useRawJson: false,
        rawJson: '',
      }

      const result = validateUIStage(stageWithWarning)

      expect(result.warnings).toContain('Match stage has no conditions')
    })
  })

  describe('validateMongoDBStage', () => {
    it('should validate a valid MongoDB $match stage', () => {
      const validStage: MongoDBStage = {
        $match: { age: { $gte: 18 } },
      }

      const result = validateMongoDBStage(validStage)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate a valid MongoDB $limit stage', () => {
      const validStage: MongoDBStage = {
        $limit: 10,
      }

      const result = validateMongoDBStage(validStage)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject stage with multiple stage operators', () => {
      const invalidStage = {
        $match: { status: 'active' },
        $limit: 10,
      } as unknown as MongoDBStage

      const result = validateMongoDBStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Stage must have exactly one stage operator')
    })

    it('should reject stage with unknown operator', () => {
      const invalidStage = {
        $unknown: { field: 'value' },
      } as unknown as MongoDBStage

      const result = validateMongoDBStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Unknown stage operator: $unknown')
    })

    it('should reject $limit with non-numeric value', () => {
      const invalidStage = {
        $limit: 'ten',
      } as unknown as MongoDBStage

      const result = validateMongoDBStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('$limit value must be a number')
    })

    it('should reject $skip with non-numeric value', () => {
      const invalidStage = {
        $skip: 'five',
      } as unknown as MongoDBStage

      const result = validateMongoDBStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('$skip value must be a number')
    })

    it('should reject $count with non-string value', () => {
      const invalidStage = {
        $count: 123,
      } as unknown as MongoDBStage

      const result = validateMongoDBStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('$count value must be a string')
    })

    it('should reject empty stage object', () => {
      const invalidStage = {} as unknown as MongoDBStage

      const result = validateMongoDBStage(invalidStage)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Stage must have exactly one stage operator')
    })
  })
})

describe('stageConverter - Error handling', () => {
  describe('convertUIStageToMongoDB error cases', () => {
    it('should throw error for unsupported stage type', () => {
      const invalidStage = {
        id: 'invalid-1',
        type: '$unknown',
        enabled: true,
      } as unknown as AggregationStage

      expect(() => convertUIStageToMongoDB(invalidStage)).toThrow(
        'Unsupported stage type: $unknown'
      )
    })

    it('should throw error for malformed raw JSON', () => {
      const invalidStage: MatchStage = {
        id: 'match-1',
        type: '$match',
        enabled: true,
        conditions: [],
        useRawJson: true,
        rawJson: '{ invalid: json }',
      }

      expect(() => convertUIStageToMongoDB(invalidStage)).toThrow(/JSON/)
    })
  })

  describe('convertMongoDBStageToUI error cases', () => {
    it('should throw error for unsupported MongoDB stage', () => {
      const invalidStage = {
        $unknown: { field: 'value' },
      } as unknown as MongoDBStage

      expect(() => convertMongoDBStageToUI(invalidStage)).toThrow(
        'Unsupported MongoDB stage operator'
      )
    })

    it('should throw error for empty stage object', () => {
      const emptyStage = {} as MongoDBStage

      expect(() => convertMongoDBStageToUI(emptyStage)).toThrow(
        'Invalid stage: must have exactly one stage operator'
      )
    })

    it('should throw error for stage with multiple operators', () => {
      const multiOperatorStage = {
        $match: { status: 'active' },
        $limit: 10,
      } as unknown as MongoDBStage

      expect(() => convertMongoDBStageToUI(multiOperatorStage)).toThrow(
        'Invalid stage: must have exactly one stage operator'
      )
    })
  })
})

describe('stageConverter - Edge cases', () => {
  describe('Special values handling', () => {
    it('should handle null values in MongoDB stages', () => {
      const mongoStage: MongoDBStage = {
        $match: { deletedAt: null },
      }

      const result = convertMongoDBStageToUI(mongoStage)

      expect(result.type).toBe('$match')
      expect((result as MatchStage).rawJson).toContain('null')
    })

    it('should handle boolean values in match conditions', () => {
      const uiStage: MatchStage = {
        id: 'match-1',
        type: '$match',
        enabled: true,
        conditions: [
          {
            id: 'cond-1',
            field: 'isActive',
            operator: '$eq',
            value: 'true',
            valueType: 'boolean',
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $match: {
          isActive: { $eq: true },
        },
      })
    })

    it('should handle nested field paths with dots', () => {
      const uiStage: MatchStage = {
        id: 'match-1',
        type: '$match',
        enabled: true,
        conditions: [
          {
            id: 'cond-1',
            field: 'address.city',
            operator: '$eq',
            value: 'New York',
            valueType: 'string',
          },
        ],
        useRawJson: false,
        rawJson: '',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $match: {
          'address.city': { $eq: 'New York' },
        },
      })
    })

    it('should handle array field paths in $unwind', () => {
      const uiStage: UnwindStage = {
        id: 'unwind-1',
        type: '$unwind',
        enabled: true,
        config: {
          path: 'items.tags',
          preserveNullAndEmptyArrays: false,
        },
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $unwind: '$items.tags',
      })
    })
  })

  describe('Empty and whitespace handling', () => {
    it('should handle empty string values appropriately', () => {
      const uiStage: CountStage = {
        id: 'count-1',
        type: '$count',
        enabled: true,
        outputField: 'total',
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $count: 'total',
      })
    })

    it('should trim whitespace from field names', () => {
      const uiStage: SortStage = {
        id: 'sort-1',
        type: '$sort',
        enabled: true,
        fields: [{ id: 'sf-1', field: '  name  ', direction: 1 }],
      }

      const result = convertUIStageToMongoDB(uiStage)

      expect(result).toEqual({
        $sort: {
          name: 1,
        },
      })
    })
  })

  describe('Large pipeline handling', () => {
    it('should handle pipeline with many stages', () => {
      const stages: AggregationStage[] = Array.from({ length: 100 }, (_, i) => ({
        id: `limit-${i}`,
        type: '$limit',
        enabled: true,
        limit: i + 1,
      })) as LimitStage[]

      const result = convertUIStageArrayToMongoDB(stages)

      expect(result).toHaveLength(100)
      expect(result[0]).toEqual({ $limit: 1 })
      expect(result[99]).toEqual({ $limit: 100 })
    })
  })
})
