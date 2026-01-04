import { describe, it, expect } from 'vitest'
import { AggregationTranslator } from '../../src/translator/aggregation-translator'

describe('AggregationTranslator', () => {
  const translator = new AggregationTranslator('users')

  describe('Basic Stages', () => {
    describe('$match stage', () => {
      it('translates $match to WHERE clause', () => {
        const pipeline = [
          { $match: { status: 'active' } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('WHERE')
        expect(result.sql).toContain("json_extract(data, '$.status') = ?")
        expect(result.params).toContain('active')
      })

      it('translates $match with multiple conditions', () => {
        const pipeline = [
          { $match: { status: 'active', age: { $gte: 18 } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('WHERE')
        expect(result.sql).toContain("json_extract(data, '$.status') = ?")
        expect(result.sql).toContain("json_extract(data, '$.age') >= ?")
        expect(result.params).toContain('active')
        expect(result.params).toContain(18)
      })

      it('translates $match with $and operator', () => {
        const pipeline = [
          { $match: { $and: [{ status: 'active' }, { age: { $gte: 18 } }] } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('AND')
      })

      it('translates $match with $or operator', () => {
        const pipeline = [
          { $match: { $or: [{ status: 'active' }, { status: 'pending' }] } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('OR')
      })

      it('translates $match with $in operator', () => {
        const pipeline = [
          { $match: { status: { $in: ['active', 'pending'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('IN')
      })

      it('translates $match with comparison operators', () => {
        const pipeline = [
          { $match: { age: { $gt: 18, $lt: 65 } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('>')
        expect(result.sql).toContain('<')
      })
    })

    describe('$project stage', () => {
      it('translates $project with inclusion', () => {
        const pipeline = [
          { $project: { name: 1, email: 1 } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('json_object')
        expect(result.sql).toContain("'name'")
        expect(result.sql).toContain("'email'")
      })

      it('translates $project with exclusion', () => {
        const pipeline = [
          { $project: { password: 0 } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('json_remove')
        expect(result.sql).toContain('$.password')
      })

      it('translates $project with field renaming', () => {
        const pipeline = [
          { $project: { userName: '$name', userEmail: '$email' } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('json_object')
        expect(result.sql).toContain("'userName'")
        expect(result.sql).toContain("json_extract(data, '$.name')")
      })

      it('translates $project with computed fields', () => {
        const pipeline = [
          { $project: { fullName: { $concat: ['$firstName', ' ', '$lastName'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain("'fullName'")
        expect(result.sql).toContain('||')
      })

      it('translates $project with nested field access', () => {
        const pipeline = [
          { $project: { city: '$address.city' } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain("json_extract(data, '$.address.city')")
      })
    })

    describe('$group stage', () => {
      it('translates $group with $sum', () => {
        const pipeline = [
          { $group: { _id: '$status', total: { $sum: '$amount' } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('GROUP BY')
        expect(result.sql).toContain('SUM')
        expect(result.sql).toContain("json_extract(data, '$.status')")
      })

      it('translates $group with $avg', () => {
        const pipeline = [
          { $group: { _id: '$category', avgPrice: { $avg: '$price' } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('GROUP BY')
        expect(result.sql).toContain('AVG')
      })

      it('translates $group with $min and $max', () => {
        const pipeline = [
          { $group: { _id: '$type', minVal: { $min: '$value' }, maxVal: { $max: '$value' } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('MIN')
        expect(result.sql).toContain('MAX')
      })

      it('translates $group with $count', () => {
        const pipeline = [
          { $group: { _id: '$status', count: { $count: {} } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('COUNT(*)')
      })

      it('translates $group with null _id for total aggregation', () => {
        const pipeline = [
          { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('SUM')
        expect(result.sql).not.toContain('GROUP BY')
      })

      it('translates $group with compound _id', () => {
        const pipeline = [
          { $group: { _id: { year: '$year', month: '$month' }, count: { $count: {} } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('GROUP BY')
        expect(result.sql).toContain("json_extract(data, '$.year')")
        expect(result.sql).toContain("json_extract(data, '$.month')")
      })

      it('translates $group with $first and $last', () => {
        const pipeline = [
          { $group: { _id: '$category', firstItem: { $first: '$name' }, lastItem: { $last: '$name' } } }
        ]
        const result = translator.translate(pipeline)
        // SQLite doesn't have native FIRST/LAST, implementation varies
        expect(result.sql).toContain('GROUP BY')
      })

      it('translates $group with $push for array accumulation', () => {
        const pipeline = [
          { $group: { _id: '$category', items: { $push: '$name' } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('json_group_array')
      })
    })

    describe('$sort stage', () => {
      it('translates $sort ascending', () => {
        const pipeline = [
          { $sort: { name: 1 } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('ORDER BY')
        expect(result.sql).toContain("json_extract(data, '$.name') ASC")
      })

      it('translates $sort descending', () => {
        const pipeline = [
          { $sort: { createdAt: -1 } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('ORDER BY')
        expect(result.sql).toContain("json_extract(data, '$.createdAt') DESC")
      })

      it('translates $sort with multiple fields', () => {
        const pipeline = [
          { $sort: { status: 1, createdAt: -1 } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('ORDER BY')
        expect(result.sql).toContain('ASC')
        expect(result.sql).toContain('DESC')
      })
    })

    describe('$limit stage', () => {
      it('translates $limit', () => {
        const pipeline = [
          { $limit: 10 }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('LIMIT 10')
      })

      it('translates $limit with $skip', () => {
        const pipeline = [
          { $skip: 20 },
          { $limit: 10 }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('LIMIT 10')
        expect(result.sql).toContain('OFFSET 20')
      })
    })

    describe('$skip stage', () => {
      it('translates $skip', () => {
        const pipeline = [
          { $skip: 5 }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('OFFSET 5')
      })
    })

    describe('$count stage', () => {
      it('translates $count', () => {
        const pipeline = [
          { $count: 'totalDocs' }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('COUNT(*)')
        expect(result.sql).toContain('totalDocs')
      })
    })
  })

  describe('Pipeline Combinations', () => {
    it('translates $match followed by $group', () => {
      const pipeline = [
        { $match: { status: 'active' } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } }
      ]
      const result = translator.translate(pipeline)
      expect(result.sql).toContain('WHERE')
      expect(result.sql).toContain('GROUP BY')
      expect(result.sql).toContain('SUM')
    })

    it('translates full pipeline with match, group, sort, limit', () => {
      const pipeline = [
        { $match: { status: 'active' } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
        { $limit: 5 }
      ]
      const result = translator.translate(pipeline)
      expect(result.sql).toContain('WHERE')
      expect(result.sql).toContain('GROUP BY')
      expect(result.sql).toContain('ORDER BY')
      expect(result.sql).toContain('LIMIT')
    })

    it('uses CTE for complex pipelines', () => {
      const pipeline = [
        { $match: { status: 'active' } },
        { $project: { name: 1, amount: 1 } },
        { $group: { _id: '$name', total: { $sum: '$amount' } } }
      ]
      const result = translator.translate(pipeline)
      expect(result.sql).toContain('WITH')
    })
  })

  describe('Advanced Stages', () => {
    describe('$lookup stage', () => {
      it('translates $lookup to correlated subquery', () => {
        const pipeline = [
          {
            $lookup: {
              from: 'orders',
              localField: 'userId',
              foreignField: '_id',
              as: 'userOrders'
            }
          }
        ]
        const result = translator.translate(pipeline)
        // Uses correlated subquery with json_group_array for joining
        expect(result.sql).toContain('json_group_array')
        expect(result.sql).toContain('orders')
        expect(result.sql).toContain('COALESCE')
      })

      it('translates $lookup with pipeline', () => {
        const pipeline = [
          {
            $lookup: {
              from: 'orders',
              let: { userId: '$_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$customerId', '$$userId'] } } }
              ],
              as: 'matchedOrders'
            }
          }
        ]
        const result = translator.translate(pipeline)
        // Uses subquery for pipeline lookup
        expect(result.sql).toContain('json_group_array')
        expect(result.sql).toContain('orders')
      })
    })

    describe('$unwind stage', () => {
      it('translates $unwind to json_each', () => {
        const pipeline = [
          { $unwind: '$tags' }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('json_each')
        expect(result.sql).toContain('tags')
      })

      it('translates $unwind with preserveNullAndEmptyArrays', () => {
        const pipeline = [
          { $unwind: { path: '$tags', preserveNullAndEmptyArrays: true } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('LEFT JOIN')
        expect(result.sql).toContain('json_each')
      })

      it('translates $unwind with includeArrayIndex', () => {
        const pipeline = [
          { $unwind: { path: '$items', includeArrayIndex: 'itemIndex' } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('json_each')
        // Should include index access
      })
    })

    describe('$addFields stage', () => {
      it('translates $addFields with literal values', () => {
        const pipeline = [
          { $addFields: { newField: 'constant' } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('json_set')
        expect(result.sql).toContain("'$.newField'")
      })

      it('translates $addFields with field references', () => {
        const pipeline = [
          { $addFields: { totalPrice: { $multiply: ['$price', '$quantity'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('json_set')
        expect(result.sql).toContain('*')
      })

      it('translates $addFields with conditional expression', () => {
        const pipeline = [
          {
            $addFields: {
              status: {
                $cond: {
                  if: { $gte: ['$score', 70] },
                  then: 'pass',
                  else: 'fail'
                }
              }
            }
          }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('CASE WHEN')
      })
    })

    describe('$bucket stage', () => {
      it('translates $bucket with boundaries', () => {
        const pipeline = [
          {
            $bucket: {
              groupBy: '$price',
              boundaries: [0, 100, 500, 1000],
              default: 'Other',
              output: {
                count: { $sum: 1 }
              }
            }
          }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('CASE WHEN')
        expect(result.sql).toContain('GROUP BY')
      })

      it('translates $bucket with output accumulators', () => {
        const pipeline = [
          {
            $bucket: {
              groupBy: '$age',
              boundaries: [0, 18, 30, 50, 100],
              output: {
                count: { $sum: 1 },
                avgIncome: { $avg: '$income' }
              }
            }
          }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('CASE WHEN')
        expect(result.sql).toContain('COUNT')
        expect(result.sql).toContain('AVG')
      })
    })

    describe('$facet stage', () => {
      it('translates $facet with multiple pipelines', () => {
        const pipeline = [
          {
            $facet: {
              byCategory: [
                { $group: { _id: '$category', count: { $count: {} } } }
              ],
              byStatus: [
                { $group: { _id: '$status', count: { $count: {} } } }
              ]
            }
          }
        ]
        const result = translator.translate(pipeline)
        // Facet generates multiple queries or UNION
        expect(result.sql).toBeDefined()
        expect(result.facets).toBeDefined()
        expect(result.facets?.byCategory).toBeDefined()
        expect(result.facets?.byStatus).toBeDefined()
      })

      it('translates $facet with complex nested pipelines', () => {
        const pipeline = [
          {
            $facet: {
              priceStats: [
                { $match: { status: 'active' } },
                { $group: { _id: null, avgPrice: { $avg: '$price' }, maxPrice: { $max: '$price' } } }
              ],
              topProducts: [
                { $sort: { sales: -1 } },
                { $limit: 5 }
              ]
            }
          }
        ]
        const result = translator.translate(pipeline)
        expect(result.facets?.priceStats).toBeDefined()
        expect(result.facets?.topProducts).toBeDefined()
      })
    })
  })

  describe('Expression Operators', () => {
    describe('Arithmetic Operators', () => {
      it('translates $add', () => {
        const pipeline = [
          { $project: { total: { $add: ['$price', '$tax'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('+')
      })

      it('translates $subtract', () => {
        const pipeline = [
          { $project: { profit: { $subtract: ['$revenue', '$cost'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('-')
      })

      it('translates $multiply', () => {
        const pipeline = [
          { $project: { total: { $multiply: ['$price', '$quantity'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('*')
      })

      it('translates $divide', () => {
        const pipeline = [
          { $project: { average: { $divide: ['$total', '$count'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('/')
      })

      it('translates $mod', () => {
        const pipeline = [
          { $project: { remainder: { $mod: ['$value', 3] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('%')
      })
    })

    describe('String Operators', () => {
      it('translates $concat', () => {
        const pipeline = [
          { $project: { fullName: { $concat: ['$firstName', ' ', '$lastName'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('||')
      })

      it('translates $substr', () => {
        const pipeline = [
          { $project: { initial: { $substr: ['$name', 0, 1] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('SUBSTR')
      })

      it('translates $toLower', () => {
        const pipeline = [
          { $project: { nameLower: { $toLower: '$name' } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('LOWER')
      })

      it('translates $toUpper', () => {
        const pipeline = [
          { $project: { nameUpper: { $toUpper: '$name' } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('UPPER')
      })
    })

    describe('Conditional Operators', () => {
      it('translates $cond', () => {
        const pipeline = [
          {
            $project: {
              grade: {
                $cond: { if: { $gte: ['$score', 70] }, then: 'Pass', else: 'Fail' }
              }
            }
          }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('CASE WHEN')
        expect(result.sql).toContain('THEN')
        expect(result.sql).toContain('ELSE')
      })

      it('translates $ifNull', () => {
        const pipeline = [
          { $project: { value: { $ifNull: ['$field', 'default'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('COALESCE')
      })

      it('translates $switch', () => {
        const pipeline = [
          {
            $project: {
              category: {
                $switch: {
                  branches: [
                    { case: { $lt: ['$price', 100] }, then: 'budget' },
                    { case: { $lt: ['$price', 500] }, then: 'mid-range' }
                  ],
                  default: 'premium'
                }
              }
            }
          }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('CASE')
        expect(result.sql).toContain('WHEN')
      })
    })

    describe('Comparison Operators', () => {
      it('translates $eq in expression context', () => {
        const pipeline = [
          { $project: { isActive: { $eq: ['$status', 'active'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('=')
      })

      it('translates $ne in expression context', () => {
        const pipeline = [
          { $project: { notDeleted: { $ne: ['$status', 'deleted'] } } }
        ]
        const result = translator.translate(pipeline)
        expect(result.sql).toContain('!=')
      })
    })
  })

  describe('Error Handling', () => {
    it('throws on unknown stage', () => {
      const pipeline = [
        { $unknownStage: {} }
      ]
      expect(() => translator.translate(pipeline)).toThrow('Unknown aggregation stage: $unknownStage')
    })

    it('throws on invalid $group without _id', () => {
      const pipeline = [
        { $group: { total: { $sum: '$amount' } } }
      ]
      expect(() => translator.translate(pipeline)).toThrow('$group requires _id field')
    })

    it('throws on invalid $sort value', () => {
      const pipeline = [
        { $sort: { name: 0 } }
      ]
      expect(() => translator.translate(pipeline)).toThrow('$sort direction must be 1 or -1')
    })

    it('throws on empty pipeline', () => {
      const pipeline: any[] = []
      expect(() => translator.translate(pipeline)).toThrow('Pipeline cannot be empty')
    })
  })
})
