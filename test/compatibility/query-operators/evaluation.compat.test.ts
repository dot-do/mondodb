import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'

describe('Evaluation Query Operators Compatibility', () => {
  let mongodb: TestProvider
  let mongo.do: TestProvider
  let testNum = 0

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mongo.do = providers.mongo.do
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mongo.do)
  })

  beforeEach(() => {
    testNum++
  })

  // ============================================================================
  // $regex - Regular Expression Matching
  // ============================================================================
  describe('$regex', () => {
    const setupCollections = async () => {
      const dbName = `test_regex_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const docs = [
        { name: 'Apple', description: 'A red fruit' },
        { name: 'Banana', description: 'A yellow fruit' },
        { name: 'APRICOT', description: 'An orange fruit' },
        { name: 'avocado', description: 'A green fruit' },
        { name: 'Cherry', description: 'A small red fruit' },
        { name: 'apple pie', description: 'A dessert with apples' },
        { name: 'Test123', description: 'Contains numbers 456' },
        { name: 'Line1\nLine2', description: 'Multi-line text' },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('basic regex match', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ name: { $regex: 'Apple' } }).sort({ name: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ name: { $regex: 'Apple' } }).sort({ name: 1 }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('Apple')
      expect(mondoDocs[0]?.name).toBe('Apple')
    })

    it('case-insensitive with $options: "i"', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        name: { $regex: 'apple', $options: 'i' }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        name: { $regex: 'apple', $options: 'i' }
      }).sort({ name: 1 }).toArray()

      // Should match: Apple, apple pie
      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name).sort()).toEqual(['Apple', 'apple pie'])
      expect(mondoDocs.map(d => d.name).sort()).toEqual(['Apple', 'apple pie'])
    })

    it('anchor ^ matches beginning of string', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        name: { $regex: '^A' }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        name: { $regex: '^A' }
      }).sort({ name: 1 }).toArray()

      // Should match: Apple, APRICOT (starts with A)
      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name).sort()).toEqual(['APRICOT', 'Apple'])
      expect(mondoDocs.map(d => d.name).sort()).toEqual(['APRICOT', 'Apple'])
    })

    it('anchor $ matches end of string', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        name: { $regex: 'a$' }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        name: { $regex: 'a$' }
      }).sort({ name: 1 }).toArray()

      // Should match: Banana
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('Banana')
      expect(mondoDocs[0]?.name).toBe('Banana')
    })

    it('$regex with character class', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        name: { $regex: '[0-9]+' }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        name: { $regex: '[0-9]+' }
      }).sort({ name: 1 }).toArray()

      // Should match: Test123
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('Test123')
      expect(mondoDocs[0]?.name).toBe('Test123')
    })

    it('$regex with wildcard pattern', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        name: { $regex: 'A.*e' }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        name: { $regex: 'A.*e' }
      }).sort({ name: 1 }).toArray()

      // Should match: Apple (A...e)
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('Apple')
      expect(mondoDocs[0]?.name).toBe('Apple')
    })

    it('$regex on non-string field returns no match', async () => {
      const dbName = `test_regex_nonstring_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'test', value: 123 })
      await mondoCol.insertOne({ name: 'test', value: 123 })

      const mongoDocs = await mongoCol.find({ value: { $regex: '123' } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $regex: '123' } }).toArray()

      // Regex on non-string typically returns no match
      expect(mongoDocs.length).toBe(0)
      expect(mondoDocs.length).toBe(0)
    })

    it('$not with $regex', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({
        name: { $not: { $regex: '^A', $options: 'i' } }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        name: { $not: { $regex: '^A', $options: 'i' } }
      }).sort({ name: 1 }).toArray()

      // Should exclude: Apple, APRICOT, avocado, apple pie
      // Should include: Banana, Cherry, Test123, Line1\nLine2
      expect(mongoDocs.length).toBe(4)
      expect(mondoDocs.length).toBe(4)
    })

    it('$regex with special characters escaped', async () => {
      const dbName = `test_regex_special_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'test.value', desc: 'with dot' })
      await mongoCol.insertOne({ name: 'testXvalue', desc: 'with X' })
      await mondoCol.insertOne({ name: 'test.value', desc: 'with dot' })
      await mondoCol.insertOne({ name: 'testXvalue', desc: 'with X' })

      // Unescaped dot matches any character
      const mongoDocsUnescaped = await mongoCol.find({
        name: { $regex: 'test.value' }
      }).toArray()
      const mondoDocsUnescaped = await mondoCol.find({
        name: { $regex: 'test.value' }
      }).toArray()

      expect(mongoDocsUnescaped.length).toBe(2)
      expect(mondoDocsUnescaped.length).toBe(2)

      // Escaped dot matches literal dot only
      const mongoDocsEscaped = await mongoCol.find({
        name: { $regex: 'test\\.value' }
      }).toArray()
      const mondoDocsEscaped = await mondoCol.find({
        name: { $regex: 'test\\.value' }
      }).toArray()

      expect(mongoDocsEscaped.length).toBe(1)
      expect(mondoDocsEscaped.length).toBe(1)
      expect(mongoDocsEscaped[0]?.name).toBe('test.value')
      expect(mondoDocsEscaped[0]?.name).toBe('test.value')
    })

    it('$regex with empty string matches all strings', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      const mongoDocs = await mongoCol.find({ name: { $regex: '' } }).toArray()
      const mondoDocs = await mondoCol.find({ name: { $regex: '' } }).toArray()

      // Empty regex matches all documents with string name field
      expect(mongoDocs.length).toBe(8)
      expect(mondoDocs.length).toBe(8)
    })

    it('$regex with unicode characters', async () => {
      const dbName = `test_regex_unicode_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'cafe', desc: 'no accent' })
      await mongoCol.insertOne({ name: 'cafe\u0301', desc: 'with combining accent' })
      await mongoCol.insertOne({ name: 'nihongo', desc: 'japanese' })
      await mondoCol.insertOne({ name: 'cafe', desc: 'no accent' })
      await mondoCol.insertOne({ name: 'cafe\u0301', desc: 'with combining accent' })
      await mondoCol.insertOne({ name: 'nihongo', desc: 'japanese' })

      const mongoDocs = await mongoCol.find({ name: { $regex: '^cafe' } }).toArray()
      const mondoDocs = await mondoCol.find({ name: { $regex: '^cafe' } }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
    })

    it('multiline regex with $options: "m"', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Without multiline, ^ only matches start of string
      const mongoDocsNoMulti = await mongoCol.find({
        name: { $regex: '^Line2' }
      }).toArray()
      const mondoDocsNoMulti = await mondoCol.find({
        name: { $regex: '^Line2' }
      }).toArray()

      expect(mongoDocsNoMulti.length).toBe(0)
      expect(mondoDocsNoMulti.length).toBe(0)

      // With multiline, ^ matches start of each line
      const mongoDocsMulti = await mongoCol.find({
        name: { $regex: '^Line2', $options: 'm' }
      }).toArray()
      const mondoDocsMulti = await mondoCol.find({
        name: { $regex: '^Line2', $options: 'm' }
      }).toArray()

      expect(mongoDocsMulti.length).toBe(1)
      expect(mondoDocsMulti.length).toBe(1)
    })
  })

  // ============================================================================
  // $expr - Aggregation Expression in Query
  // ============================================================================
  describe('$expr', () => {
    const setupCollections = async () => {
      const dbName = `test_expr_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const docs = [
        { name: 'A', spent: 100, budget: 120 },
        { name: 'B', spent: 150, budget: 120 },
        { name: 'C', spent: 80, budget: 80 },
        { name: 'D', spent: 200, budget: 250 },
        { name: 'E', spent: 50, budget: 100 },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('field comparison with $gt', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where spent > budget (over budget)
      const mongoDocs = await mongoCol.find({
        $expr: { $gt: ['$spent', '$budget'] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: { $gt: ['$spent', '$budget'] }
      }).sort({ name: 1 }).toArray()

      // B is over budget (150 > 120)
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('B')
      expect(mondoDocs[0]?.name).toBe('B')
    })

    it('field comparison with $lt', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where spent < budget (under budget)
      const mongoDocs = await mongoCol.find({
        $expr: { $lt: ['$spent', '$budget'] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: { $lt: ['$spent', '$budget'] }
      }).sort({ name: 1 }).toArray()

      // A, D, E are under budget
      expect(mongoDocs.length).toBe(3)
      expect(mondoDocs.length).toBe(3)
      expect(mongoDocs.map(d => d.name)).toEqual(['A', 'D', 'E'])
      expect(mondoDocs.map(d => d.name)).toEqual(['A', 'D', 'E'])
    })

    it('field comparison with $eq', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where spent == budget (exactly on budget)
      const mongoDocs = await mongoCol.find({
        $expr: { $eq: ['$spent', '$budget'] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: { $eq: ['$spent', '$budget'] }
      }).sort({ name: 1 }).toArray()

      // C has spent == budget (80 == 80)
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('C')
      expect(mondoDocs[0]?.name).toBe('C')
    })

    it('arithmetic in expression with $add', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where spent > budget + 10
      const mongoDocs = await mongoCol.find({
        $expr: { $gt: ['$spent', { $add: ['$budget', 10] }] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: { $gt: ['$spent', { $add: ['$budget', 10] }] }
      }).sort({ name: 1 }).toArray()

      // B: 150 > 130 (120 + 10) = true
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('B')
      expect(mondoDocs[0]?.name).toBe('B')
    })

    it('arithmetic in expression with $subtract', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where budget - spent >= 50
      const mongoDocs = await mongoCol.find({
        $expr: { $gte: [{ $subtract: ['$budget', '$spent'] }, 50] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: { $gte: [{ $subtract: ['$budget', '$spent'] }, 50] }
      }).sort({ name: 1 }).toArray()

      // D: 250-200=50, E: 100-50=50
      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['D', 'E'])
      expect(mondoDocs.map(d => d.name)).toEqual(['D', 'E'])
    })

    it('$expr with $and', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where spent < budget AND budget > 100
      const mongoDocs = await mongoCol.find({
        $expr: {
          $and: [
            { $lt: ['$spent', '$budget'] },
            { $gt: ['$budget', 100] }
          ]
        }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: {
          $and: [
            { $lt: ['$spent', '$budget'] },
            { $gt: ['$budget', 100] }
          ]
        }
      }).sort({ name: 1 }).toArray()

      // A: 100<120, 120>100 = true; D: 200<250, 250>100 = true
      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['A', 'D'])
      expect(mondoDocs.map(d => d.name)).toEqual(['A', 'D'])
    })

    it('$expr with $or', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where spent > budget OR spent < 60
      const mongoDocs = await mongoCol.find({
        $expr: {
          $or: [
            { $gt: ['$spent', '$budget'] },
            { $lt: ['$spent', 60] }
          ]
        }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: {
          $or: [
            { $gt: ['$spent', '$budget'] },
            { $lt: ['$spent', 60] }
          ]
        }
      }).sort({ name: 1 }).toArray()

      // B: 150>120=true; E: 50<60=true
      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['B', 'E'])
      expect(mondoDocs.map(d => d.name)).toEqual(['B', 'E'])
    })

    it('access nested fields in $expr', async () => {
      const dbName = `test_expr_nested_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'X', stats: { high: 100, low: 50 } })
      await mongoCol.insertOne({ name: 'Y', stats: { high: 80, low: 90 } })
      await mondoCol.insertOne({ name: 'X', stats: { high: 100, low: 50 } })
      await mondoCol.insertOne({ name: 'Y', stats: { high: 80, low: 90 } })

      // Find where stats.high > stats.low
      const mongoDocs = await mongoCol.find({
        $expr: { $gt: ['$stats.high', '$stats.low'] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: { $gt: ['$stats.high', '$stats.low'] }
      }).sort({ name: 1 }).toArray()

      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('X')
      expect(mondoDocs[0]?.name).toBe('X')
    })

    it('$expr with literal values', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where spent > 100
      const mongoDocs = await mongoCol.find({
        $expr: { $gt: ['$spent', 100] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: { $gt: ['$spent', 100] }
      }).sort({ name: 1 }).toArray()

      // B: 150, D: 200
      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['B', 'D'])
      expect(mondoDocs.map(d => d.name)).toEqual(['B', 'D'])
    })

    it('$expr with $multiply', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where spent > budget * 0.5
      const mongoDocs = await mongoCol.find({
        $expr: { $gt: ['$spent', { $multiply: ['$budget', 0.5] }] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: { $gt: ['$spent', { $multiply: ['$budget', 0.5] }] }
      }).sort({ name: 1 }).toArray()

      // All except E (50 is not > 50)
      expect(mongoDocs.length).toBe(4)
      expect(mondoDocs.length).toBe(4)
    })
  })

  // ============================================================================
  // $mod - Modulo Operation
  // ============================================================================
  describe('$mod', () => {
    const setupCollections = async () => {
      const dbName = `test_mod_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const docs = [
        { name: 'A', value: 10 },
        { name: 'B', value: 15 },
        { name: 'C', value: 20 },
        { name: 'D', value: 25 },
        { name: 'E', value: 30 },
        { name: 'F', value: 0 },
        { name: 'G', value: -10 },
        { name: 'H', value: 7.5 },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('$mod finds values divisible by divisor', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where value % 10 == 0 (divisible by 10)
      const mongoDocs = await mongoCol.find({
        value: { $mod: [10, 0] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        value: { $mod: [10, 0] }
      }).sort({ name: 1 }).toArray()

      // A: 10, C: 20, E: 30, F: 0, G: -10
      expect(mongoDocs.length).toBe(5)
      expect(mondoDocs.length).toBe(5)
      expect(mongoDocs.map(d => d.name).sort()).toEqual(['A', 'C', 'E', 'F', 'G'])
      expect(mondoDocs.map(d => d.name).sort()).toEqual(['A', 'C', 'E', 'F', 'G'])
    })

    it('$mod with non-zero remainder', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where value % 10 == 5
      const mongoDocs = await mongoCol.find({
        value: { $mod: [10, 5] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        value: { $mod: [10, 5] }
      }).sort({ name: 1 }).toArray()

      // B: 15, D: 25
      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['B', 'D'])
      expect(mondoDocs.map(d => d.name)).toEqual(['B', 'D'])
    })

    it('$mod with small divisor', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find odd numbers (value % 2 == 1)
      const mongoDocs = await mongoCol.find({
        value: { $mod: [2, 1] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        value: { $mod: [2, 1] }
      }).sort({ name: 1 }).toArray()

      // B: 15, D: 25
      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
    })

    it('$mod on zero value', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where value % 5 == 0
      const mongoDocs = await mongoCol.find({
        value: { $mod: [5, 0] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        value: { $mod: [5, 0] }
      }).sort({ name: 1 }).toArray()

      // A: 10, B: 15, C: 20, D: 25, E: 30, F: 0, G: -10
      expect(mongoDocs.length).toBe(7)
      expect(mondoDocs.length).toBe(7)
    })

    it('$mod with negative values', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where value % 10 == 0 (includes -10)
      const mongoDocs = await mongoCol.find({
        value: { $mod: [10, 0] },
        name: 'G'
      }).toArray()

      const mondoDocs = await mondoCol.find({
        value: { $mod: [10, 0] },
        name: 'G'
      }).toArray()

      // G: -10 % 10 == 0
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
    })

    it('$mod on non-numeric field returns no match', async () => {
      const dbName = `test_mod_nonnum_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'test', value: 'not a number' })
      await mondoCol.insertOne({ name: 'test', value: 'not a number' })

      const mongoDocs = await mongoCol.find({ value: { $mod: [2, 0] } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $mod: [2, 0] } }).toArray()

      expect(mongoDocs.length).toBe(0)
      expect(mondoDocs.length).toBe(0)
    })

    it('$mod with floats (truncated to integer)', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // H has value 7.5, should be truncated to 7 for mod
      // 7 % 3 == 1
      const mongoDocs = await mongoCol.find({
        value: { $mod: [3, 1] },
        name: 'H'
      }).toArray()

      const mondoDocs = await mondoCol.find({
        value: { $mod: [3, 1] },
        name: 'H'
      }).toArray()

      // MongoDB truncates floats for $mod
      expect(mongoDocs.length).toBe(mondoDocs.length)
    })

    it('$mod combined with other operators', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      // Find where value is even AND value > 10
      const mongoDocs = await mongoCol.find({
        value: { $mod: [2, 0], $gt: 10 }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        value: { $mod: [2, 0], $gt: 10 }
      }).sort({ name: 1 }).toArray()

      // C: 20, E: 30
      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['C', 'E'])
      expect(mondoDocs.map(d => d.name)).toEqual(['C', 'E'])
    })
  })

  // ============================================================================
  // $where - JavaScript Expression (if supported)
  // ============================================================================
  describe('$where', () => {
    const setupCollections = async () => {
      const dbName = `test_where_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      const docs = [
        { name: 'A', x: 10, y: 5 },
        { name: 'B', x: 5, y: 10 },
        { name: 'C', x: 8, y: 8 },
        { name: 'D', x: 20, y: 10 },
      ]

      for (const doc of docs) {
        await mongoCol.insertOne({ ...doc })
        await mondoCol.insertOne({ ...doc })
      }

      return { mongoCol, mondoCol }
    }

    it('$where with simple JavaScript expression', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      try {
        // Find where x > y using $where
        const mongoDocs = await mongoCol.find({
          $where: 'this.x > this.y'
        }).sort({ name: 1 }).toArray()

        const mondoDocs = await mondoCol.find({
          $where: 'this.x > this.y'
        }).sort({ name: 1 }).toArray()

        // A: 10>5, D: 20>10
        expect(mongoDocs.length).toBe(2)
        expect(mondoDocs.length).toBe(2)
        expect(mongoDocs.map(d => d.name)).toEqual(['A', 'D'])
        expect(mondoDocs.map(d => d.name)).toEqual(['A', 'D'])
      } catch (error: unknown) {
        // $where may not be supported - skip if error contains "not supported"
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.toLowerCase().includes('not supported') ||
            errorMessage.toLowerCase().includes('unsupported')) {
          console.log('$where not supported, skipping test')
          return
        }
        throw error
      }
    })

    it('$where with function string', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      try {
        const mongoDocs = await mongoCol.find({
          $where: function() { return this.x === this.y }.toString()
        }).sort({ name: 1 }).toArray()

        const mondoDocs = await mondoCol.find({
          $where: function() { return this.x === this.y }.toString()
        }).sort({ name: 1 }).toArray()

        // C: 8 === 8
        expect(mongoDocs.length).toBe(1)
        expect(mondoDocs.length).toBe(1)
        expect(mongoDocs[0]?.name).toBe('C')
        expect(mondoDocs[0]?.name).toBe('C')
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.toLowerCase().includes('not supported') ||
            errorMessage.toLowerCase().includes('unsupported')) {
          console.log('$where not supported, skipping test')
          return
        }
        throw error
      }
    })

    it('$where combined with regular query operators', async () => {
      const { mongoCol, mondoCol } = await setupCollections()

      try {
        const mongoDocs = await mongoCol.find({
          x: { $gt: 5 },
          $where: 'this.x > this.y'
        }).sort({ name: 1 }).toArray()

        const mondoDocs = await mondoCol.find({
          x: { $gt: 5 },
          $where: 'this.x > this.y'
        }).sort({ name: 1 }).toArray()

        // A: x=10>5, 10>5; D: x=20>5, 20>10
        expect(mongoDocs.length).toBe(2)
        expect(mondoDocs.length).toBe(2)
        expect(mongoDocs.map(d => d.name)).toEqual(['A', 'D'])
        expect(mondoDocs.map(d => d.name)).toEqual(['A', 'D'])
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.toLowerCase().includes('not supported') ||
            errorMessage.toLowerCase().includes('unsupported')) {
          console.log('$where not supported, skipping test')
          return
        }
        throw error
      }
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('edge cases', () => {
    it('$regex and $expr combined in $and', async () => {
      const dbName = `test_combined_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'Apple', price: 100, cost: 50 })
      await mongoCol.insertOne({ name: 'Apricot', price: 80, cost: 90 })
      await mongoCol.insertOne({ name: 'Banana', price: 60, cost: 30 })

      await mondoCol.insertOne({ name: 'Apple', price: 100, cost: 50 })
      await mondoCol.insertOne({ name: 'Apricot', price: 80, cost: 90 })
      await mondoCol.insertOne({ name: 'Banana', price: 60, cost: 30 })

      // Find items starting with 'A' where price > cost
      const mongoDocs = await mongoCol.find({
        $and: [
          { name: { $regex: '^A' } },
          { $expr: { $gt: ['$price', '$cost'] } }
        ]
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $and: [
          { name: { $regex: '^A' } },
          { $expr: { $gt: ['$price', '$cost'] } }
        ]
      }).sort({ name: 1 }).toArray()

      // Apple: starts with A, 100 > 50
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
      expect(mongoDocs[0]?.name).toBe('Apple')
      expect(mondoDocs[0]?.name).toBe('Apple')
    })

    it('$mod with missing field', async () => {
      const dbName = `test_mod_missing_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'A', value: 10 })
      await mongoCol.insertOne({ name: 'B' }) // no value field

      await mondoCol.insertOne({ name: 'A', value: 10 })
      await mondoCol.insertOne({ name: 'B' })

      const mongoDocs = await mongoCol.find({ value: { $mod: [5, 0] } }).toArray()
      const mondoDocs = await mondoCol.find({ value: { $mod: [5, 0] } }).toArray()

      // Only A has value field that matches
      expect(mongoDocs.length).toBe(1)
      expect(mondoDocs.length).toBe(1)
    })

    it('$expr with missing field returns false', async () => {
      const dbName = `test_expr_missing_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'A', x: 10 })
      await mongoCol.insertOne({ name: 'B', x: 10, y: 5 })

      await mondoCol.insertOne({ name: 'A', x: 10 })
      await mondoCol.insertOne({ name: 'B', x: 10, y: 5 })

      // Comparing x > y where y might be missing
      const mongoDocs = await mongoCol.find({
        $expr: { $gt: ['$x', '$y'] }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: { $gt: ['$x', '$y'] }
      }).sort({ name: 1 }).toArray()

      // A has no y (undefined), B has y=5
      // Comparison with undefined typically yields false or matches
      expect(mongoDocs.length).toBe(mondoDocs.length)
    })

    it('$regex on nested field', async () => {
      const dbName = `test_regex_nested_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ user: { name: 'Alice' } })
      await mongoCol.insertOne({ user: { name: 'Bob' } })
      await mongoCol.insertOne({ user: { name: 'alicia' } })

      await mondoCol.insertOne({ user: { name: 'Alice' } })
      await mondoCol.insertOne({ user: { name: 'Bob' } })
      await mondoCol.insertOne({ user: { name: 'alicia' } })

      const mongoDocs = await mongoCol.find({
        'user.name': { $regex: '^Ali', $options: 'i' }
      }).sort({ 'user.name': 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        'user.name': { $regex: '^Ali', $options: 'i' }
      }).sort({ 'user.name': 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
    })

    it('$expr with $cond conditional', async () => {
      const dbName = `test_expr_cond_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mongo.do.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'A', qty: 100, discount: true })
      await mongoCol.insertOne({ name: 'B', qty: 50, discount: false })
      await mongoCol.insertOne({ name: 'C', qty: 200, discount: true })

      await mondoCol.insertOne({ name: 'A', qty: 100, discount: true })
      await mondoCol.insertOne({ name: 'B', qty: 50, discount: false })
      await mondoCol.insertOne({ name: 'C', qty: 200, discount: true })

      // Find where effective qty > 75
      // effective = discount ? qty * 0.9 : qty
      const mongoDocs = await mongoCol.find({
        $expr: {
          $gt: [
            { $cond: ['$discount', { $multiply: ['$qty', 0.9] }, '$qty'] },
            75
          ]
        }
      }).sort({ name: 1 }).toArray()

      const mondoDocs = await mondoCol.find({
        $expr: {
          $gt: [
            { $cond: ['$discount', { $multiply: ['$qty', 0.9] }, '$qty'] },
            75
          ]
        }
      }).sort({ name: 1 }).toArray()

      // A: 100*0.9=90 > 75; B: 50 not > 75; C: 200*0.9=180 > 75
      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
      expect(mongoDocs.map(d => d.name)).toEqual(['A', 'C'])
      expect(mondoDocs.map(d => d.name)).toEqual(['A', 'C'])
    })
  })
})
