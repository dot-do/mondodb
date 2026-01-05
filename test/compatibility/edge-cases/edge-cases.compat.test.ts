import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createBothProviders, cleanupProviders } from '../providers/factory'
import { TestProvider } from '../providers/types'

describe('Edge Cases Compatibility', () => {
  let mongodb: TestProvider
  let mondodo: TestProvider
  let testNum = 0

  beforeAll(async () => {
    const providers = await createBothProviders()
    mongodb = providers.mongodb
    mondodo = providers.mondodo
  })

  afterAll(async () => {
    await cleanupProviders(mongodb, mondodo)
  })

  beforeEach(() => {
    testNum++
  })

  describe('Null/Undefined Handling', () => {
    it('insert and query document with null field', async () => {
      const dbName = `test_null_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'test', value: null })
      await mondoCol.insertOne({ name: 'test', value: null })

      const mongoDoc = await mongoCol.findOne({ value: null })
      const mondoDoc = await mondoCol.findOne({ value: null })

      expect(mongoDoc?.name).toBe('test')
      expect(mondoDoc?.name).toBe('test')
      expect(mongoDoc?.value).toBeNull()
      expect(mondoDoc?.value).toBeNull()
    })

    it('query for null matches null AND missing fields', async () => {
      const dbName = `test_null_missing_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'hasNull', value: null })
      await mongoCol.insertOne({ name: 'noField' })
      await mondoCol.insertOne({ name: 'hasNull', value: null })
      await mondoCol.insertOne({ name: 'noField' })

      const mongoDocs = await mongoCol.find({ value: null }).sort({ name: 1 }).toArray()
      const mondoDocs = await mondoCol.find({ value: null }).sort({ name: 1 }).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
    })

    it('$set to null vs $unset difference', async () => {
      const dbName = `test_set_null_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ name: 'a', value: 10 })
      await mongoCol.insertOne({ name: 'b', value: 20 })
      await mondoCol.insertOne({ name: 'a', value: 10 })
      await mondoCol.insertOne({ name: 'b', value: 20 })

      // Set to null
      await mongoCol.updateOne({ name: 'a' }, { $set: { value: null } })
      await mondoCol.updateOne({ name: 'a' }, { $set: { value: null } })

      // Unset
      await mongoCol.updateOne({ name: 'b' }, { $unset: { value: '' } })
      await mondoCol.updateOne({ name: 'b' }, { $unset: { value: '' } })

      const mongoA = await mongoCol.findOne({ name: 'a' })
      const mondoA = await mondoCol.findOne({ name: 'a' })
      const mongoB = await mongoCol.findOne({ name: 'b' })
      const mondoB = await mondoCol.findOne({ name: 'b' })

      // 'a' has value: null
      expect(mongoA?.value).toBeNull()
      expect(mondoA?.value).toBeNull()
      expect('value' in (mongoA || {})).toBe(true)
      expect('value' in (mondoA || {})).toBe(true)

      // 'b' has no value field
      expect(mongoB?.value).toBeUndefined()
      expect(mondoB?.value).toBeUndefined()
    })
  })

  describe('Empty Values', () => {
    it('empty string as field value', async () => {
      const dbName = `test_empty_str_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ name: '' })
      await mondoCol.insertOne({ name: '' })

      const mongoDoc = await mongoCol.findOne({ name: '' })
      const mondoDoc = await mondoCol.findOne({ name: '' })

      expect(mongoDoc?.name).toBe('')
      expect(mondoDoc?.name).toBe('')
    })

    it('empty object as field value', async () => {
      const dbName = `test_empty_obj_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ data: {} })
      await mondoCol.insertOne({ data: {} })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.data).toEqual({})
      expect(mondoDoc?.data).toEqual({})
    })

    it('empty array as field value', async () => {
      const dbName = `test_empty_arr_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ items: [] })
      await mondoCol.insertOne({ items: [] })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.items).toEqual([])
      expect(mondoDoc?.items).toEqual([])
    })

    it('empty filter matches all', async () => {
      const dbName = `test_empty_filter_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ a: 1 })
      await mongoCol.insertOne({ b: 2 })
      await mondoCol.insertOne({ a: 1 })
      await mondoCol.insertOne({ b: 2 })

      const mongoDocs = await mongoCol.find({}).toArray()
      const mondoDocs = await mondoCol.find({}).toArray()

      expect(mongoDocs.length).toBe(2)
      expect(mondoDocs.length).toBe(2)
    })
  })

  describe('Nested Documents', () => {
    it('deeply nested document insert and query', async () => {
      const dbName = `test_nested_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const deep = { a: { b: { c: { d: { e: 'deep' } } } } }
      await mongoCol.insertOne(deep)
      await mondoCol.insertOne({ ...deep })

      const mongoDoc = await mongoCol.findOne({ 'a.b.c.d.e': 'deep' })
      const mondoDoc = await mondoCol.findOne({ 'a.b.c.d.e': 'deep' })

      expect(mongoDoc?.a?.b?.c?.d?.e).toBe('deep')
      expect(mondoDoc?.a?.b?.c?.d?.e).toBe('deep')
    })

    it('$set on nested path', async () => {
      const dbName = `test_nested_set_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ user: { name: 'Alice' } })
      await mondoCol.insertOne({ user: { name: 'Alice' } })

      await mongoCol.updateOne({}, { $set: { 'user.age': 30 } })
      await mondoCol.updateOne({}, { $set: { 'user.age': 30 } })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.user?.name).toBe('Alice')
      expect(mondoDoc?.user?.name).toBe('Alice')
      expect(mongoDoc?.user?.age).toBe(30)
      expect(mondoDoc?.user?.age).toBe(30)
    })
  })

  describe('Special Characters / Unicode', () => {
    it('unicode in field values', async () => {
      const dbName = `test_unicode_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const doc = { name: '日本語', emoji: '🎉', mixed: 'Hello 世界' }
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })

      const mongoDoc = await mongoCol.findOne({ name: '日本語' })
      const mondoDoc = await mondoCol.findOne({ name: '日本語' })

      expect(mongoDoc?.name).toBe('日本語')
      expect(mondoDoc?.name).toBe('日本語')
      expect(mongoDoc?.emoji).toBe('🎉')
      expect(mondoDoc?.emoji).toBe('🎉')
    })

    it('special characters in string values', async () => {
      const dbName = `test_special_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      const doc = {
        tab: 'hello\tworld',
        newline: 'hello\nworld',
        quote: 'it\'s "quoted"',
        backslash: 'path\\to\\file'
      }
      await mongoCol.insertOne({ ...doc })
      await mondoCol.insertOne({ ...doc })

      const mongoDoc = await mongoCol.findOne({})
      const mondoDoc = await mondoCol.findOne({})

      expect(mongoDoc?.tab).toBe('hello\tworld')
      expect(mondoDoc?.tab).toBe('hello\tworld')
      expect(mongoDoc?.quote).toBe('it\'s "quoted"')
      expect(mondoDoc?.quote).toBe('it\'s "quoted"')
    })
  })

  describe('Type Coercion', () => {
    it('number string vs number', async () => {
      const dbName = `test_coerce_${testNum}`
      const mongoCol = mongodb.database(dbName).collection('items')
      const mondoCol = mondodo.database(dbName).collection('items')

      await mongoCol.insertOne({ numStr: '123', num: 123 })
      await mondoCol.insertOne({ numStr: '123', num: 123 })

      // Query for number should not match string
      const mongoByNum = await mongoCol.find({ numStr: 123 }).toArray()
      const mondoByNum = await mondoCol.find({ numStr: 123 }).toArray()

      // Query for string should not match number
      const mongoByStr = await mongoCol.find({ num: '123' }).toArray()
      const mondoByStr = await mondoCol.find({ num: '123' }).toArray()

      expect(mongoByNum.length).toBe(0)
      expect(mondoByNum.length).toBe(0)
      expect(mongoByStr.length).toBe(0)
      expect(mondoByStr.length).toBe(0)
    })
  })
})
