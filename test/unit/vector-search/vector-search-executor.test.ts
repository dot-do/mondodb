import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VectorSearchExecutor } from '../../../src/executor/vector-search-executor'
import type { VectorizeIndex, VectorizeQueryResult, VectorizeMatch } from '../../../src/types/vectorize'

// Mock SQL interface
const createMockSql = () => ({
  exec: vi.fn().mockReturnValue({
    results: [],
    toArray: () => []
  })
})

// Mock Vectorize index
const createMockVectorize = (matches: VectorizeMatch[] = []): VectorizeIndex => ({
  query: vi.fn().mockResolvedValue({
    count: matches.length,
    matches
  } as VectorizeQueryResult),
  insert: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
  upsert: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
  deleteByIds: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
  getByIds: vi.fn().mockResolvedValue([]),
  describe: vi.fn().mockResolvedValue({
    dimensions: 384,
    vectorsCount: 0,
    config: { dimensions: 384, metric: 'cosine' }
  })
})

describe('VectorSearchExecutor', () => {
  describe('constructor', () => {
    it('should create a VectorSearchExecutor instance', () => {
      const sql = createMockSql()
      const vectorize = createMockVectorize()
      const executor = new VectorSearchExecutor(sql, vectorize)

      expect(executor).toBeInstanceOf(VectorSearchExecutor)
    })

    it('should work without vectorize binding', () => {
      const sql = createMockSql()
      const executor = new VectorSearchExecutor(sql, undefined)

      expect(executor).toBeInstanceOf(VectorSearchExecutor)
    })
  })

  describe('executeVectorSearch', () => {
    it('should throw error if vectorize is not configured', async () => {
      const sql = createMockSql()
      const executor = new VectorSearchExecutor(sql, undefined)

      await expect(
        executor.executeVectorSearch({
          vectorIndexName: 'test_index',
          vectorPath: 'embedding',
          queryVector: [0.1, 0.2, 0.3],
          numCandidates: 100,
          limit: 10,
          exact: false,
          scoreField: 'score'
        }, 'products')
      ).rejects.toThrow('Vectorize is not configured')
    })

    it('should query vectorize with the provided vector', async () => {
      const sql = createMockSql()
      const vectorize = createMockVectorize([
        { id: 'products:doc1', score: 0.95, metadata: { _data: '{"_id":"doc1","name":"Product 1"}' } },
        { id: 'products:doc2', score: 0.85, metadata: { _data: '{"_id":"doc2","name":"Product 2"}' } }
      ])
      const executor = new VectorSearchExecutor(sql, vectorize)

      await executor.executeVectorSearch({
        vectorIndexName: 'test_index',
        vectorPath: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        numCandidates: 100,
        limit: 10,
        exact: false,
        scoreField: 'score'
      }, 'products')

      expect(vectorize.query).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        expect.objectContaining({
          topK: 10,
          returnMetadata: 'all'
        })
      )
    })

    it('should return documents with score field', async () => {
      const sql = createMockSql()
      const vectorize = createMockVectorize([
        { id: 'products:doc1', score: 0.95, metadata: { _data: '{"_id":"doc1","name":"Product 1"}' } },
        { id: 'products:doc2', score: 0.85, metadata: { _data: '{"_id":"doc2","name":"Product 2"}' } }
      ])
      const executor = new VectorSearchExecutor(sql, vectorize)

      const results = await executor.executeVectorSearch({
        vectorIndexName: 'test_index',
        vectorPath: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        numCandidates: 100,
        limit: 10,
        exact: false,
        scoreField: 'score'
      }, 'products')

      expect(results).toHaveLength(2)
      expect(results[0]).toMatchObject({
        _id: 'doc1',
        name: 'Product 1',
        score: 0.95
      })
      expect(results[1]).toMatchObject({
        _id: 'doc2',
        name: 'Product 2',
        score: 0.85
      })
    })

    it('should use custom score field name', async () => {
      const sql = createMockSql()
      const vectorize = createMockVectorize([
        { id: 'products:doc1', score: 0.95, metadata: { _data: '{"_id":"doc1"}' } }
      ])
      const executor = new VectorSearchExecutor(sql, vectorize)

      const results = await executor.executeVectorSearch({
        vectorIndexName: 'test_index',
        vectorPath: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        numCandidates: 100,
        limit: 10,
        exact: false,
        scoreField: 'similarity'
      }, 'products')

      expect(results[0]).toHaveProperty('similarity', 0.95)
      expect(results[0]).not.toHaveProperty('score')
    })

    it('should filter results by collection prefix', async () => {
      const sql = createMockSql()
      const vectorize = createMockVectorize([
        { id: 'products:doc1', score: 0.95, metadata: { _data: '{"_id":"doc1"}' } },
        { id: 'other:doc2', score: 0.90, metadata: { _data: '{"_id":"doc2"}' } },
        { id: 'products:doc3', score: 0.85, metadata: { _data: '{"_id":"doc3"}' } }
      ])
      const executor = new VectorSearchExecutor(sql, vectorize)

      const results = await executor.executeVectorSearch({
        vectorIndexName: 'test_index',
        vectorPath: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        numCandidates: 100,
        limit: 10,
        exact: false,
        scoreField: 'score'
      }, 'products')

      expect(results).toHaveLength(2)
      expect(results.every((r: any) => r._id.startsWith('doc'))).toBe(true)
    })
  })

  describe('upsertVector', () => {
    it('should upsert a vector with document metadata', async () => {
      const sql = createMockSql()
      const vectorize = createMockVectorize()
      const executor = new VectorSearchExecutor(sql, vectorize)

      await executor.upsertVector(
        'products',
        'doc1',
        [0.1, 0.2, 0.3],
        { _id: 'doc1', name: 'Product 1' }
      )

      expect(vectorize.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'products:doc1',
          values: [0.1, 0.2, 0.3],
          metadata: expect.objectContaining({
            _data: expect.any(String)
          })
        })
      ])
    })

    it('should throw error if vectorize is not configured', async () => {
      const sql = createMockSql()
      const executor = new VectorSearchExecutor(sql, undefined)

      await expect(
        executor.upsertVector('products', 'doc1', [0.1, 0.2, 0.3], {})
      ).rejects.toThrow('Vectorize is not configured')
    })
  })

  describe('deleteVector', () => {
    it('should delete a vector by ID', async () => {
      const sql = createMockSql()
      const vectorize = createMockVectorize()
      const executor = new VectorSearchExecutor(sql, vectorize)

      await executor.deleteVector('products', 'doc1')

      expect(vectorize.deleteByIds).toHaveBeenCalledWith(['products:doc1'])
    })

    it('should throw error if vectorize is not configured', async () => {
      const sql = createMockSql()
      const executor = new VectorSearchExecutor(sql, undefined)

      await expect(
        executor.deleteVector('products', 'doc1')
      ).rejects.toThrow('Vectorize is not configured')
    })
  })
})
