/**
 * Project initialization tests
 *
 * Verifies that the project structure is correctly set up by importing
 * modules and checking their exports.
 */
import { describe, it, expect } from 'vitest'

// Import main exports to verify they exist
import {
  MondoDatabase,
  ObjectId,
  MongoClient,
  MongoCollection,
  SchemaManager,
  IndexManager,
} from '../../src/index'

// Import RPC components
import {
  RpcTarget,
  MondoRpcTarget,
  RpcClient,
  WebSocketRpcTransport,
  WorkerEntrypoint,
  MondoEntrypoint,
} from '../../src/index'

// Import from submodules to verify structure
import { QueryTranslator } from '../../src/translator/query-translator'
import { UpdateTranslator } from '../../src/translator/update-translator'
import { AggregationTranslator } from '../../src/translator/aggregation-translator'

describe('Project Initialization', () => {
  describe('Main exports', () => {
    it('should export MondoDatabase Durable Object', () => {
      expect(MondoDatabase).toBeDefined()
      expect(typeof MondoDatabase).toBe('function')
    })

    it('should export ObjectId class', () => {
      expect(ObjectId).toBeDefined()
      expect(typeof ObjectId).toBe('function')
    })

    it('should export MongoClient class', () => {
      expect(MongoClient).toBeDefined()
      expect(typeof MongoClient).toBe('function')
    })

    it('should export MongoCollection class', () => {
      expect(MongoCollection).toBeDefined()
      expect(typeof MongoCollection).toBe('function')
    })

    it('should export SchemaManager class', () => {
      expect(SchemaManager).toBeDefined()
      expect(typeof SchemaManager).toBe('function')
    })

    it('should export IndexManager class', () => {
      expect(IndexManager).toBeDefined()
      expect(typeof IndexManager).toBe('function')
    })
  })

  describe('RPC exports', () => {
    it('should export RpcTarget', () => {
      expect(RpcTarget).toBeDefined()
    })

    it('should export MondoRpcTarget', () => {
      expect(MondoRpcTarget).toBeDefined()
    })

    it('should export RpcClient', () => {
      expect(RpcClient).toBeDefined()
      expect(typeof RpcClient).toBe('function')
    })

    it('should export WebSocketRpcTransport', () => {
      expect(WebSocketRpcTransport).toBeDefined()
      expect(typeof WebSocketRpcTransport).toBe('function')
    })

    it('should export WorkerEntrypoint', () => {
      expect(WorkerEntrypoint).toBeDefined()
      expect(typeof WorkerEntrypoint).toBe('function')
    })

    it('should export MondoEntrypoint', () => {
      expect(MondoEntrypoint).toBeDefined()
      expect(typeof MondoEntrypoint).toBe('function')
    })
  })

  describe('Translator module', () => {
    it('should export QueryTranslator', () => {
      expect(QueryTranslator).toBeDefined()
      expect(typeof QueryTranslator).toBe('function')
    })

    it('should export UpdateTranslator', () => {
      expect(UpdateTranslator).toBeDefined()
      expect(typeof UpdateTranslator).toBe('function')
    })

    it('should export AggregationTranslator', () => {
      expect(AggregationTranslator).toBeDefined()
      expect(typeof AggregationTranslator).toBe('function')
    })
  })

  describe('ObjectId functionality', () => {
    it('should generate unique IDs', () => {
      const id1 = new ObjectId()
      const id2 = new ObjectId()
      expect(id1.toString()).not.toBe(id2.toString())
    })

    it('should create from hex string', () => {
      const hex = '507f1f77bcf86cd799439011'
      const id = new ObjectId(hex)
      expect(id.toString()).toBe(hex)
    })

    it('should extract timestamp', () => {
      const id = new ObjectId()
      const timestamp = id.getTimestamp()
      expect(timestamp).toBeInstanceOf(Date)
      expect(timestamp.getTime()).toBeGreaterThan(0)
    })

    it('should have valid hex string format', () => {
      const id = new ObjectId()
      const hex = id.toHexString()
      expect(hex).toMatch(/^[0-9a-f]{24}$/)
    })

    it('should implement equals() method', () => {
      const id1 = new ObjectId('507f1f77bcf86cd799439011')
      const id2 = new ObjectId('507f1f77bcf86cd799439011')
      const id3 = new ObjectId()
      expect(id1.equals(id2)).toBe(true)
      expect(id1.equals(id3)).toBe(false)
    })
  })

  describe('QueryTranslator functionality', () => {
    it('should translate simple equality query', () => {
      const translator = new QueryTranslator()
      const result = translator.translate({ name: 'test' })
      expect(result.sql).toContain("json_extract")
      expect(result.params).toContain('test')
    })

    it('should translate $gt operator', () => {
      const translator = new QueryTranslator()
      const result = translator.translate({ age: { $gt: 18 } })
      expect(result.sql).toContain('>')
      expect(result.params).toContain(18)
    })

    it('should translate $or operator', () => {
      const translator = new QueryTranslator()
      const result = translator.translate({ $or: [{ a: 1 }, { b: 2 }] })
      expect(result.sql).toContain('OR')
    })
  })

  describe('UpdateTranslator functionality', () => {
    it('should translate $set operator', () => {
      const translator = new UpdateTranslator()
      const result = translator.translate({ $set: { name: 'test' } })
      expect(result.sets).toBeDefined()
    })

    it('should translate $inc operator', () => {
      const translator = new UpdateTranslator()
      const result = translator.translate({ $inc: { count: 1 } })
      expect(result.sets).toBeDefined()
    })

    it('should translate $unset operator', () => {
      const translator = new UpdateTranslator()
      const result = translator.translate({ $unset: { field: '' } })
      expect(result.unsets).toBeDefined()
    })
  })

  describe('AggregationTranslator functionality', () => {
    it('should translate $match stage', () => {
      const translator = new AggregationTranslator('users')
      const result = translator.translate([
        { $match: { status: 'active' } }
      ])
      expect(result.sql).toContain('WHERE')
    })

    it('should translate $sort stage', () => {
      const translator = new AggregationTranslator('users')
      const result = translator.translate([
        { $sort: { name: 1 } }
      ])
      expect(result.sql).toContain('ORDER BY')
    })

    it('should translate $limit stage', () => {
      const translator = new AggregationTranslator('users')
      const result = translator.translate([
        { $match: {} },
        { $limit: 10 }
      ])
      expect(result.sql).toContain('LIMIT')
    })
  })
})
