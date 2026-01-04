import { describe, it, expect } from 'vitest'
import { translateVectorSearchStage } from '../../../src/translator/stages/vector-search-stage'
import type { StageContext } from '../../../src/translator/stages/types'

describe('$vectorSearch stage translator', () => {
  const createContext = (overrides: Partial<StageContext> = {}): StageContext => ({
    collection: 'products',
    cteIndex: 0,
    existingParams: [],
    ...overrides
  })

  describe('translateVectorSearchStage', () => {
    it('should translate basic $vectorSearch stage', () => {
      const stage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        numCandidates: 100,
        limit: 10
      }

      const result = translateVectorSearchStage(stage, createContext())

      expect(result).toBeDefined()
      expect(result.vectorSearch).toBeDefined()
      expect(result.vectorSearch?.vectorIndexName).toBe('vector_index')
      expect(result.vectorSearch?.vectorPath).toBe('embedding')
      expect(result.vectorSearch?.queryVector).toEqual([0.1, 0.2, 0.3])
      expect(result.vectorSearch?.limit).toBe(10)
      expect(result.params).toEqual([])
    })

    it('should return isVectorSearchStage flag', () => {
      const stage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10
      }

      const result = translateVectorSearchStage(stage, createContext())

      expect(result.isVectorSearchStage).toBe(true)
    })

    it('should include filter in translation', () => {
      const stage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
        filter: { category: 'electronics' }
      }

      const result = translateVectorSearchStage(stage, createContext())

      expect(result.vectorSearch?.filter).toEqual({ category: 'electronics' })
      expect(result.vectorSearch?.whereClause).toBeDefined()
    })

    it('should set transformsShape to true', () => {
      const stage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10
      }

      const result = translateVectorSearchStage(stage, createContext())

      expect(result.transformsShape).toBe(true)
    })

    it('should handle scoreField option', () => {
      const stage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
        scoreField: 'similarity'
      }

      const result = translateVectorSearchStage(stage, createContext())

      expect(result.vectorSearch?.scoreField).toBe('similarity')
    })

    it('should handle exact search option', () => {
      const stage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
        exact: true
      }

      const result = translateVectorSearchStage(stage, createContext())

      expect(result.vectorSearch?.exact).toBe(true)
    })

    it('should use collection from context', () => {
      const stage = {
        index: 'vector_index',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10
      }

      const result = translateVectorSearchStage(stage, createContext({ collection: 'articles' }))

      expect(result.collection).toBe('articles')
    })
  })
})
