import { describe, it, expect } from 'vitest'
import { VectorTranslator } from '../../../src/translator/vector-translator'
import type { VectorSearchStage } from '../../../src/translator/vector-translator'

describe('VectorTranslator', () => {
  describe('constructor', () => {
    it('should create a VectorTranslator instance', () => {
      const translator = new VectorTranslator()
      expect(translator).toBeInstanceOf(VectorTranslator)
    })
  })

  describe('translateVectorSearch', () => {
    it('should translate basic $vectorSearch stage', () => {
      const translator = new VectorTranslator()
      const stage: VectorSearchStage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        numCandidates: 100,
        limit: 10
      }

      const result = translator.translateVectorSearch(stage, 'products')

      expect(result).toBeDefined()
      expect(result.vectorIndexName).toBe('vector_index')
      expect(result.vectorPath).toBe('embedding')
      expect(result.queryVector).toEqual([0.1, 0.2, 0.3])
      expect(result.numCandidates).toBe(100)
      expect(result.limit).toBe(10)
    })

    it('should handle $vectorSearch with filter', () => {
      const translator = new VectorTranslator()
      const stage: VectorSearchStage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        numCandidates: 100,
        limit: 10,
        filter: { category: 'electronics' }
      }

      const result = translator.translateVectorSearch(stage, 'products')

      expect(result.filter).toEqual({ category: 'electronics' })
      expect(result.whereClause).toBeDefined()
    })

    it('should handle $vectorSearch with exact search', () => {
      const translator = new VectorTranslator()
      const stage: VectorSearchStage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        numCandidates: 100,
        limit: 10,
        exact: true
      }

      const result = translator.translateVectorSearch(stage, 'products')

      expect(result.exact).toBe(true)
    })

    it('should use default numCandidates when not specified', () => {
      const translator = new VectorTranslator()
      const stage: VectorSearchStage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10
      }

      const result = translator.translateVectorSearch(stage, 'products')

      // Default numCandidates should be limit * 10
      expect(result.numCandidates).toBe(100)
    })
  })

  describe('generateVectorId', () => {
    it('should generate a vector ID from collection and document ID', () => {
      const translator = new VectorTranslator()
      const vectorId = translator.generateVectorId('products', '12345')

      expect(vectorId).toBe('products:12345')
    })
  })

  describe('parseVectorId', () => {
    it('should parse a vector ID into collection and document ID', () => {
      const translator = new VectorTranslator()
      const { collection, documentId } = translator.parseVectorId('products:12345')

      expect(collection).toBe('products')
      expect(documentId).toBe('12345')
    })

    it('should handle document IDs containing colons', () => {
      const translator = new VectorTranslator()
      const { collection, documentId } = translator.parseVectorId('products:abc:123:xyz')

      expect(collection).toBe('products')
      expect(documentId).toBe('abc:123:xyz')
    })
  })

  describe('extractScoreField', () => {
    it('should extract score field name from stage options', () => {
      const translator = new VectorTranslator()
      const stage: VectorSearchStage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
        scoreField: 'searchScore'
      }

      const result = translator.translateVectorSearch(stage, 'products')

      expect(result.scoreField).toBe('searchScore')
    })

    it('should use default score field name when not specified', () => {
      const translator = new VectorTranslator()
      const stage: VectorSearchStage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10
      }

      const result = translator.translateVectorSearch(stage, 'products')

      expect(result.scoreField).toBe('score')
    })
  })
})
