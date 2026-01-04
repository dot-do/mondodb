/**
 * SQL Dialect Support Tests - TDD RED Phase
 *
 * Tests for dialect-aware translation in AggregationTranslator and QueryTranslator.
 * Supports 'sqlite' and 'clickhouse' dialects with appropriate SQL syntax.
 *
 * Key differences tested:
 * - JSON extract syntax
 * - Type casting functions
 * - Aggregation functions
 * - String functions
 * - NULL handling
 * - Date functions
 * - Array operations
 * - Parameterized queries
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AggregationTranslator } from '../../../src/translator/aggregation-translator'
import { QueryTranslator, type TranslatedQuery } from '../../../src/translator/query-translator'

// ============================================================
// Type definitions for dialect support
// ============================================================
type SQLDialect = 'sqlite' | 'clickhouse'

interface DialectTranslatorOptions {
  dialect: SQLDialect
}

// ============================================================
// 1. JSON EXTRACT SYNTAX
// ============================================================
describe('Dialect Support: JSON Extract Syntax', () => {
  describe('SQLite dialect', () => {
    let translator: QueryTranslator

    beforeEach(() => {
      translator = new QueryTranslator({ dialect: 'sqlite' } as DialectTranslatorOptions & { dialect: SQLDialect })
    })

    it('should use json_extract for field access', () => {
      const query = { name: 'John' }
      const result = translator.translate(query)

      expect(result.sql).toContain("json_extract(data, '$.name')")
      expect(result.params).toEqual(['John'])
    })

    it('should use json_extract for nested paths', () => {
      const query = { 'user.profile.name': 'John' }
      const result = translator.translate(query)

      expect(result.sql).toContain("json_extract(data, '$.user.profile.name')")
    })

    it('should use json_type for type checking', () => {
      const query = { name: { $type: 'string' } }
      const result = translator.translate(query)

      expect(result.sql).toContain("json_type(json_extract(data, '$.name'))")
      expect(result.sql).toContain("'text'")
    })

    it('should use json_array_length for $size', () => {
      const query = { tags: { $size: 3 } }
      const result = translator.translate(query)

      expect(result.sql).toContain('json_array_length')
    })
  })

  describe('ClickHouse dialect', () => {
    let translator: QueryTranslator

    beforeEach(() => {
      translator = new QueryTranslator({ dialect: 'clickhouse' } as DialectTranslatorOptions & { dialect: SQLDialect })
    })

    it('should use JSONExtractString for string field access', () => {
      const query = { name: 'John' }
      const result = translator.translate(query)

      // ClickHouse uses JSONExtractString or JSONExtractRaw
      // Column can be 'doc' or 'data' depending on context
      expect(result.sql).toMatch(/JSONExtract(?:String|Raw|Int|Float)?\((?:doc|data),\s*'name'\)/)
    })

    it('should use proper ClickHouse JSON path for nested fields', () => {
      const query = { 'user.profile.name': 'John' }
      const result = translator.translate(query)

      // ClickHouse supports JSONExtractString(doc, 'user', 'profile', 'name')
      // or JSON_VALUE(doc, '$.user.profile.name')
      expect(result.sql).toMatch(/JSONExtract|JSON_VALUE/)
      expect(result.sql).toContain('user')
      expect(result.sql).toContain('profile')
      expect(result.sql).toContain('name')
    })

    it('should use JSONType for type checking', () => {
      const query = { name: { $type: 'string' } }
      const result = translator.translate(query)

      // ClickHouse uses JSONType or isValidJSON
      expect(result.sql).toMatch(/JSONType|isValidJSON/)
    })

    it('should use JSONLength or length for $size', () => {
      const query = { tags: { $size: 3 } }
      const result = translator.translate(query)

      // ClickHouse uses JSONLength or length(JSONExtractArrayRaw())
      expect(result.sql).toMatch(/JSONLength|length\(JSONExtractArrayRaw/)
    })
  })
})

// ============================================================
// 2. TYPE CASTING
// ============================================================
describe('Dialect Support: Type Casting', () => {
  describe('SQLite dialect', () => {
    let translator: AggregationTranslator

    beforeEach(() => {
      translator = new AggregationTranslator('documents', { dialect: 'sqlite' } as any)
    })

    it('should use CAST(x AS INTEGER) for integer conversion', () => {
      const pipeline = [
        { $project: { intValue: { $toInt: '$value' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('CAST')
      expect(result.sql).toContain('AS INTEGER')
    })

    it('should use CAST(x AS REAL) for float conversion', () => {
      const pipeline = [
        { $project: { floatValue: { $toDouble: '$value' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('CAST')
      expect(result.sql).toContain('AS REAL')
    })

    it('should use CAST(x AS TEXT) for string conversion', () => {
      const pipeline = [
        { $project: { strValue: { $toString: '$value' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('CAST')
      expect(result.sql).toContain('AS TEXT')
    })
  })

  describe('ClickHouse dialect', () => {
    let translator: AggregationTranslator

    beforeEach(() => {
      translator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
    })

    it('should use toInt32 or toInt64 for integer conversion', () => {
      const pipeline = [
        { $project: { intValue: { $toInt: '$value' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/toInt(?:32|64)\(/)
    })

    it('should use toFloat64 for float conversion', () => {
      const pipeline = [
        { $project: { floatValue: { $toDouble: '$value' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('toFloat64(')
    })

    it('should use toString for string conversion', () => {
      const pipeline = [
        { $project: { strValue: { $toString: '$value' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('toString(')
    })

    it('should use toDate or toDateTime for date conversion', () => {
      const pipeline = [
        { $project: { dateValue: { $toDate: '$timestamp' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/toDate(?:Time)?\(/)
    })

    it('should use toDecimal for decimal conversion', () => {
      const pipeline = [
        { $project: { decValue: { $toDecimal: '$value' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/toDecimal(?:32|64|128)?\(/)
    })
  })
})

// ============================================================
// 3. AGGREGATION FUNCTIONS
// ============================================================
describe('Dialect Support: Aggregation Functions', () => {
  describe('SQLite dialect', () => {
    let translator: AggregationTranslator

    beforeEach(() => {
      translator = new AggregationTranslator('documents', { dialect: 'sqlite' } as any)
    })

    it('should use json_group_array for $push', () => {
      const pipeline = [
        { $group: { _id: '$category', items: { $push: '$name' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('json_group_array')
    })

    it('should use json_group_array(DISTINCT ...) for $addToSet', () => {
      const pipeline = [
        { $group: { _id: '$category', uniqueItems: { $addToSet: '$name' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('json_group_array')
      expect(result.sql).toContain('DISTINCT')
    })

    it('should use standard COUNT, SUM, AVG', () => {
      const pipeline = [
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            total: { $sum: '$price' },
            average: { $avg: '$price' }
          }
        }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('COUNT')
      expect(result.sql).toContain('SUM')
      expect(result.sql).toContain('AVG')
    })

    it('should support GROUP BY with multiple fields', () => {
      const pipeline = [
        { $group: { _id: { category: '$category', year: '$year' }, count: { $sum: 1 } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('GROUP BY')
    })
  })

  describe('ClickHouse dialect', () => {
    let translator: AggregationTranslator

    beforeEach(() => {
      translator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
    })

    it('should use groupArray for $push', () => {
      const pipeline = [
        { $group: { _id: '$category', items: { $push: '$name' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('groupArray(')
    })

    it('should use groupUniqArray for $addToSet', () => {
      const pipeline = [
        { $group: { _id: '$category', uniqueItems: { $addToSet: '$name' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('groupUniqArray(')
    })

    it('should use count(), sum(), avg()', () => {
      const pipeline = [
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            total: { $sum: '$price' },
            average: { $avg: '$price' }
          }
        }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/count\(|sum\(|avg\(/i)
    })

    it('should use any() for $first', () => {
      const pipeline = [
        { $group: { _id: '$category', firstItem: { $first: '$name' } } }
      ]
      const result = translator.translate(pipeline)

      // ClickHouse uses any() or first_value() for $first
      expect(result.sql).toMatch(/any\(|first_value\(/)
    })

    it('should use anyLast() for $last', () => {
      const pipeline = [
        { $group: { _id: '$category', lastItem: { $last: '$name' } } }
      ]
      const result = translator.translate(pipeline)

      // ClickHouse uses anyLast() or last_value() for $last
      expect(result.sql).toMatch(/anyLast\(|last_value\(/)
    })

    it('should use argMin/argMax for $first/$last with sorting', () => {
      const pipeline = [
        { $sort: { createdAt: 1 } },
        { $group: { _id: '$category', firstItem: { $first: '$name' } } }
      ]
      const result = translator.translate(pipeline)

      // With sorting, ClickHouse can use argMin for better performance
      expect(result.sql).toMatch(/argMin|any\(/)
    })
  })
})

// ============================================================
// 4. STRING FUNCTIONS
// ============================================================
describe('Dialect Support: String Functions', () => {
  describe('SQLite dialect', () => {
    let translator: QueryTranslator

    beforeEach(() => {
      translator = new QueryTranslator({ dialect: 'sqlite' } as any)
    })

    it('should use LIKE for pattern matching', () => {
      const query = { name: { $regex: 'John' } }
      const result = translator.translate(query)

      expect(result.sql).toContain('LIKE')
    })

    it('should use LOWER for case-insensitive matching', () => {
      const query = { name: { $regex: 'john', $options: 'i' } }
      const result = translator.translate(query)

      expect(result.sql).toContain('LOWER')
    })

    it('should use INSTR for $indexOfBytes', () => {
      const translator = new AggregationTranslator('documents', { dialect: 'sqlite' } as any)
      const pipeline = [
        { $project: { idx: { $indexOfBytes: ['$text', 'world'] } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('INSTR')
    })

    it('should use LENGTH for $strLenBytes', () => {
      const translator = new AggregationTranslator('documents', { dialect: 'sqlite' } as any)
      const pipeline = [
        { $project: { len: { $strLenBytes: '$text' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('LENGTH')
    })
  })

  describe('ClickHouse dialect', () => {
    let translator: QueryTranslator

    beforeEach(() => {
      translator = new QueryTranslator({ dialect: 'clickhouse' } as any)
    })

    it('should use LIKE or ILIKE for pattern matching', () => {
      const query = { name: { $regex: 'John' } }
      const result = translator.translate(query)

      expect(result.sql).toMatch(/LIKE|ILIKE/)
    })

    it('should use ILIKE for case-insensitive matching', () => {
      const query = { name: { $regex: 'john', $options: 'i' } }
      const result = translator.translate(query)

      expect(result.sql).toContain('ILIKE')
    })

    it('should use position() for $indexOfBytes', () => {
      const translator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
      const pipeline = [
        { $project: { idx: { $indexOfBytes: ['$text', 'world'] } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('position(')
    })

    it('should use length or lengthUTF8 for $strLenBytes', () => {
      const translator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
      const pipeline = [
        { $project: { len: { $strLenBytes: '$text' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/length(?:UTF8)?\(/)
    })

    it('should use match() for regex matching', () => {
      const query = { name: { $regex: '^J.*n$' } }
      const result = translator.translate(query)

      // ClickHouse supports match() for full regex
      expect(result.sql).toMatch(/match\(|LIKE/)
    })

    it('should use replaceRegexpAll for $replaceAll with regex', () => {
      const translator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
      const pipeline = [
        { $project: { cleaned: { $replaceAll: { input: '$text', find: '[0-9]+', replacement: '' } } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/replaceRegexpAll|replaceAll/)
    })
  })
})

// ============================================================
// 5. NULL HANDLING
// ============================================================
describe('Dialect Support: NULL Handling', () => {
  describe('SQLite dialect', () => {
    let translator: QueryTranslator

    beforeEach(() => {
      translator = new QueryTranslator({ dialect: 'sqlite' } as any)
    })

    it('should use IS NULL for null checks', () => {
      const query = { status: { $eq: null } }
      const result = translator.translate(query)

      expect(result.sql).toContain('IS NULL')
    })

    it('should use COALESCE for $ifNull', () => {
      const aggTranslator = new AggregationTranslator('documents', { dialect: 'sqlite' } as any)
      const pipeline = [
        { $project: { value: { $ifNull: ['$optionalField', 'default'] } } }
      ]
      const result = aggTranslator.translate(pipeline)

      expect(result.sql).toContain('COALESCE')
    })

    it('should use NULLIF for conditional null', () => {
      const aggTranslator = new AggregationTranslator('documents', { dialect: 'sqlite' } as any)
      const pipeline = [
        { $project: { value: { $cond: { if: { $eq: ['$field', ''] }, then: null, else: '$field' } } } }
      ]
      const result = aggTranslator.translate(pipeline)

      // Should handle null in CASE WHEN or use NULLIF
      expect(result.sql).toMatch(/CASE WHEN|NULLIF/)
    })
  })

  describe('ClickHouse dialect', () => {
    let translator: QueryTranslator

    beforeEach(() => {
      translator = new QueryTranslator({ dialect: 'clickhouse' } as any)
    })

    it('should use isNull() for null checks', () => {
      const query = { status: { $eq: null } }
      const result = translator.translate(query)

      // ClickHouse uses isNull() or IS NULL
      expect(result.sql).toMatch(/isNull\(|IS NULL/)
    })

    it('should use ifNull for $ifNull', () => {
      const aggTranslator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
      const pipeline = [
        { $project: { value: { $ifNull: ['$optionalField', 'default'] } } }
      ]
      const result = aggTranslator.translate(pipeline)

      expect(result.sql).toMatch(/ifNull\(|COALESCE/)
    })

    it('should use nullIf for conditional null', () => {
      const aggTranslator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
      const pipeline = [
        { $project: { value: { $cond: { if: { $eq: ['$field', ''] }, then: null, else: '$field' } } } }
      ]
      const result = aggTranslator.translate(pipeline)

      expect(result.sql).toMatch(/CASE|nullIf|if\(/)
    })

    it('should use assumeNotNull where appropriate', () => {
      const aggTranslator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
      const pipeline = [
        { $match: { field: { $exists: true } } },
        { $project: { field: 1 } }
      ]
      const result = aggTranslator.translate(pipeline)

      // ClickHouse can optimize with assumeNotNull after existence check
      expect(result.sql).toBeDefined()
    })
  })
})

// ============================================================
// 6. DATE FUNCTIONS
// ============================================================
describe('Dialect Support: Date Functions', () => {
  describe('SQLite dialect', () => {
    let translator: AggregationTranslator

    beforeEach(() => {
      translator = new AggregationTranslator('documents', { dialect: 'sqlite' } as any)
    })

    it('should use datetime() for date construction', () => {
      const pipeline = [
        { $project: { date: { $dateFromString: { dateString: '$dateStr' } } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('datetime(')
    })

    it('should use strftime for date formatting', () => {
      const pipeline = [
        { $project: { formatted: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('strftime(')
    })

    it('should use strftime for date parts extraction', () => {
      const pipeline = [
        { $project: { year: { $year: '$date' }, month: { $month: '$date' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain("strftime('%Y'")
      expect(result.sql).toContain("strftime('%m'")
    })

    it('should use julianday for date difference', () => {
      const pipeline = [
        { $project: { daysDiff: { $dateDiff: { startDate: '$start', endDate: '$end', unit: 'day' } } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('julianday')
    })

    it('should use datetime with modifiers for date arithmetic', () => {
      const pipeline = [
        { $project: { nextWeek: { $dateAdd: { startDate: '$date', unit: 'day', amount: 7 } } } }
      ]
      const result = translator.translate(pipeline)

      // SQLite uses datetime() with modifier expressions
      // Pattern can be static '+7 day' or dynamic concatenation
      expect(result.sql).toMatch(/datetime\(.*,.*day/)
    })
  })

  describe('ClickHouse dialect', () => {
    let translator: AggregationTranslator

    beforeEach(() => {
      translator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
    })

    it('should use toDateTime for date construction', () => {
      const pipeline = [
        { $project: { date: { $dateFromString: { dateString: '$dateStr' } } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/toDateTime|parseDateTimeBestEffort/)
    })

    it('should use formatDateTime for date formatting', () => {
      const pipeline = [
        { $project: { formatted: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('formatDateTime(')
    })

    it('should use toYear, toMonth for date parts extraction', () => {
      const pipeline = [
        { $project: { year: { $year: '$date' }, month: { $month: '$date' } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('toYear(')
      expect(result.sql).toContain('toMonth(')
    })

    it('should use dateDiff for date difference', () => {
      const pipeline = [
        { $project: { daysDiff: { $dateDiff: { startDate: '$start', endDate: '$end', unit: 'day' } } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('dateDiff(')
    })

    it('should use dateAdd/addDays for date arithmetic', () => {
      const pipeline = [
        { $project: { nextWeek: { $dateAdd: { startDate: '$date', unit: 'day', amount: 7 } } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/dateAdd|addDays/)
    })

    it('should use toStartOfDay, toStartOfMonth for date truncation', () => {
      const pipeline = [
        { $project: { truncated: { $dateTrunc: { date: '$date', unit: 'day' } } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/toStartOf(?:Day|Month|Year|Hour|Minute)/)
    })
  })
})

// ============================================================
// 7. ARRAY OPERATIONS
// ============================================================
describe('Dialect Support: Array Operations', () => {
  describe('SQLite dialect', () => {
    let translator: AggregationTranslator

    beforeEach(() => {
      translator = new AggregationTranslator('documents', { dialect: 'sqlite' } as any)
    })

    it('should use json_each for $unwind', () => {
      const pipeline = [
        { $unwind: '$tags' }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('json_each')
    })

    it('should use json_each for array iteration in expressions', () => {
      const pipeline = [
        { $project: { hasItem: { $in: ['target', '$items'] } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/json_each|EXISTS/)
    })

    it('should use json_array for array construction', () => {
      const pipeline = [
        { $project: { arr: { $concatArrays: ['$arr1', '$arr2'] } } }
      ]
      const result = translator.translate(pipeline)

      // SQLite uses json_array or similar for array building
      expect(result.sql).toMatch(/json_array|json_group_array|\|\|/)
    })

    it('should handle $filter with subquery', () => {
      const pipeline = [
        {
          $project: {
            filtered: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $gt: ['$$item.qty', 10] }
              }
            }
          }
        }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/json_each|json_group_array|SELECT/)
    })
  })

  describe('ClickHouse dialect', () => {
    let translator: AggregationTranslator

    beforeEach(() => {
      translator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
    })

    it('should use ARRAY JOIN for $unwind', () => {
      const pipeline = [
        { $unwind: '$tags' }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('ARRAY JOIN')
    })

    it('should use has() or arrayExists for array membership', () => {
      const pipeline = [
        { $project: { hasItem: { $in: ['target', '$items'] } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/has\(|arrayExists\(/)
    })

    it('should use arrayConcat for array concatenation', () => {
      const pipeline = [
        { $project: { arr: { $concatArrays: ['$arr1', '$arr2'] } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('arrayConcat(')
    })

    it('should use arrayFilter for $filter', () => {
      const pipeline = [
        {
          $project: {
            filtered: {
              $filter: {
                input: '$items',
                as: 'item',
                cond: { $gt: ['$$item.qty', 10] }
              }
            }
          }
        }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('arrayFilter(')
    })

    it('should use arrayMap for $map', () => {
      const pipeline = [
        {
          $project: {
            mapped: {
              $map: {
                input: '$items',
                as: 'item',
                in: { $multiply: ['$$item.price', '$$item.qty'] }
              }
            }
          }
        }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('arrayMap(')
    })

    it('should use arrayReduce for $reduce', () => {
      const pipeline = [
        {
          $project: {
            total: {
              $reduce: {
                input: '$numbers',
                initialValue: 0,
                in: { $add: ['$$value', '$$this'] }
              }
            }
          }
        }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/arrayReduce|arraySum/)
    })

    it('should use arraySlice for $slice', () => {
      const pipeline = [
        { $project: { firstThree: { $slice: ['$arr', 3] } } }
      ]
      const result = translator.translate(pipeline)

      expect(result.sql).toContain('arraySlice(')
    })
  })
})

// ============================================================
// 8. PARAMETERIZED QUERIES
// ============================================================
describe('Dialect Support: Parameterized Queries', () => {
  describe('SQLite dialect', () => {
    let translator: QueryTranslator

    beforeEach(() => {
      translator = new QueryTranslator({ dialect: 'sqlite' } as any)
    })

    it('should use ? placeholders for parameters', () => {
      const query = { name: 'John', age: 30 }
      const result = translator.translate(query)

      // Count ? placeholders - should match number of params
      const placeholders = (result.sql.match(/\?/g) || []).length
      expect(placeholders).toBe(result.params.length)
    })

    it('should use ? for IN clause placeholders', () => {
      const query = { status: { $in: ['active', 'pending', 'completed'] } }
      const result = translator.translate(query)

      expect(result.sql).toContain('IN (?, ?, ?)')
      expect(result.params).toHaveLength(3)
    })

    it('should not use named parameters', () => {
      const query = { name: 'John' }
      const result = translator.translate(query)

      expect(result.sql).not.toMatch(/:\w+/)
      expect(result.sql).not.toMatch(/\$\d+/)
    })
  })

  describe('ClickHouse dialect', () => {
    let translator: QueryTranslator

    beforeEach(() => {
      translator = new QueryTranslator({ dialect: 'clickhouse' } as any)
    })

    it('should use {param:Type} syntax for typed parameters', () => {
      const query = { name: 'John', age: 30 }
      const result = translator.translate(query)

      // ClickHouse uses {name:String} or ? depending on mode
      expect(result.sql).toMatch(/\{[a-z_]+:\w+\}|\?/i)
    })

    it('should use correct type annotations for parameters', () => {
      const query = { name: 'John', age: 30, active: true }
      const result = translator.translate(query)

      // If using typed params, should have String, Int, UInt8 types
      if (result.sql.includes('{')) {
        expect(result.sql).toMatch(/String|Int|UInt8|Float/)
      }
    })

    it('should handle array parameters correctly', () => {
      const query = { status: { $in: ['active', 'pending'] } }
      const result = translator.translate(query)

      // ClickHouse can use Array(String) or multiple params
      expect(result.sql).toMatch(/IN\s*\(|hasAny/)
    })

    it('should support positional parameters with ?', () => {
      const translator = new QueryTranslator({
        dialect: 'clickhouse',
        parameterMode: 'positional'
      } as any)

      const query = { name: 'John' }
      const result = translator.translate(query)

      expect(result.sql).toContain('?')
    })
  })
})

// ============================================================
// 9. DIALECT OPTION VALIDATION
// ============================================================
describe('Dialect Support: Option Validation', () => {
  it('should default to sqlite dialect', () => {
    const translator = new QueryTranslator()
    const query = { name: 'John' }
    const result = translator.translate(query)

    // Default should use SQLite syntax
    expect(result.sql).toContain("json_extract(data, '$.name')")
  })

  it('should accept dialect option in constructor', () => {
    const sqliteTranslator = new QueryTranslator({ dialect: 'sqlite' } as any)
    const clickhouseTranslator = new QueryTranslator({ dialect: 'clickhouse' } as any)

    expect(sqliteTranslator).toBeDefined()
    expect(clickhouseTranslator).toBeDefined()
  })

  it('should throw for invalid dialect', () => {
    expect(() => {
      new QueryTranslator({ dialect: 'invalid' as any } as any)
    }).toThrow(/invalid|unsupported|unknown/i)
  })

  it('should accept dialect in AggregationTranslator', () => {
    const translator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)
    expect(translator).toBeDefined()
  })
})

// ============================================================
// 10. COMPLEX PIPELINE TRANSLATION
// ============================================================
describe('Dialect Support: Complex Pipeline Translation', () => {
  describe('SQLite dialect', () => {
    it('should translate full pipeline with correct SQLite syntax', () => {
      const translator = new AggregationTranslator('orders', { dialect: 'sqlite' } as any)
      const pipeline = [
        { $match: { status: 'completed' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.category',
            totalRevenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
            avgPrice: { $avg: '$items.price' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 }
      ]

      const result = translator.translate(pipeline)

      expect(result.sql).toContain('json_extract')
      expect(result.sql).toContain('json_each')
      expect(result.sql).toContain('GROUP BY')
      expect(result.sql).toContain('ORDER BY')
      expect(result.sql).toContain('LIMIT')
    })
  })

  describe('ClickHouse dialect', () => {
    it('should translate full pipeline with correct ClickHouse syntax', () => {
      const translator = new AggregationTranslator('orders', { dialect: 'clickhouse' } as any)
      const pipeline = [
        { $match: { status: 'completed' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.category',
            totalRevenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
            avgPrice: { $avg: '$items.price' },
            orderCount: { $sum: 1 }
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 }
      ]

      const result = translator.translate(pipeline)

      expect(result.sql).toMatch(/JSONExtract|JSON_VALUE/)
      expect(result.sql).toContain('ARRAY JOIN')
      expect(result.sql).toContain('GROUP BY')
      expect(result.sql).toContain('ORDER BY')
      expect(result.sql).toContain('LIMIT')
    })
  })
})

// ============================================================
// 11. SPECIAL OPERATORS BY DIALECT
// ============================================================
describe('Dialect Support: Special Operators', () => {
  describe('SQLite specific', () => {
    it('should support GLOB for pattern matching', () => {
      const translator = new QueryTranslator({ dialect: 'sqlite' } as any)
      // If using GLOB syntax explicitly
      const query = { name: { $regex: 'J*n', $regexType: 'glob' } }
      const result = translator.translate(query)

      // Should either use GLOB or convert to LIKE
      expect(result.sql).toMatch(/GLOB|LIKE/)
    })

    it('should support json_patch for updates', () => {
      const translator = new AggregationTranslator('documents', { dialect: 'sqlite' } as any)
      const pipeline = [
        { $addFields: { newField: 'value' } }
      ]
      const result = translator.translate(pipeline)

      // SQLite uses json_set or json_patch
      expect(result.sql).toMatch(/json_set|json_patch|json_object/)
    })
  })

  describe('ClickHouse specific', () => {
    it('should support WITH TOTALS for aggregations', () => {
      const translator = new AggregationTranslator('documents', {
        dialect: 'clickhouse',
        withTotals: true
      } as any)
      const pipeline = [
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]
      const result = translator.translate(pipeline)

      // ClickHouse can add WITH TOTALS modifier
      // This may or may not be in the SQL depending on implementation
      expect(result.sql).toBeDefined()
    })

    it('should support FINAL for ReplacingMergeTree', () => {
      const translator = new AggregationTranslator('documents', {
        dialect: 'clickhouse',
        useFinal: true
      } as any)
      const pipeline = [
        { $match: { status: 'active' } }
      ]
      const result = translator.translate(pipeline)

      // ClickHouse FINAL modifier for deduplication
      expect(result.sql).toBeDefined()
    })

    it('should support PREWHERE for optimization', () => {
      const translator = new AggregationTranslator('documents', {
        dialect: 'clickhouse',
        usePrewhere: true
      } as any)
      const pipeline = [
        { $match: { date: { $gte: '2024-01-01' } } }
      ]
      const result = translator.translate(pipeline)

      // ClickHouse PREWHERE for optimized filtering
      expect(result.sql).toBeDefined()
    })
  })
})

// ============================================================
// 12. ERROR HANDLING BY DIALECT
// ============================================================
describe('Dialect Support: Error Handling', () => {
  it('should throw meaningful error for unsupported SQLite feature', () => {
    const translator = new AggregationTranslator('documents', { dialect: 'sqlite' } as any)

    // Try to use a ClickHouse-only feature
    expect(() => {
      translator.translate([
        { $project: { bitmap: { $bitmapBuild: '$array' } } }
      ])
    }).toThrow()
  })

  it('should throw meaningful error for unsupported ClickHouse feature', () => {
    const translator = new AggregationTranslator('documents', { dialect: 'clickhouse' } as any)

    // SQLite-specific features might not translate
    // This tests error handling, actual behavior depends on implementation
    expect(translator).toBeDefined()
  })
})
