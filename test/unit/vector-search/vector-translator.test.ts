/**
 * Unit tests for VectorTranslator (mongo.do-rn0)
 *
 * RED phase tests for vector search translation with Cloudflare Vectorize
 * and AI binding support for embedding generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VectorTranslator } from '../../../src/translator/vector-translator'
import type {
  VectorTranslatorOptions,
  VectorSearchStage,
  VectorSearchResult,
} from '../../../src/translator/vector-translator'
import type { VectorizeIndex, Ai } from '../../../src/types/vectorize'

describe('VectorTranslator', () => {
  let mockVectorize: VectorizeIndex
  let mockAi: Ai

  beforeEach(() => {
    // Create mock Vectorize binding
    mockVectorize = {
      query: vi.fn().mockResolvedValue({
        count: 2,
        matches: [
          { id: 'products:doc1', score: 0.95 },
          { id: 'products:doc2', score: 0.87 },
        ],
      }),
      insert: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
      upsert: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
      deleteByIds: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
      getByIds: vi.fn().mockResolvedValue([]),
      describe: vi.fn().mockResolvedValue({
        dimensions: 768,
        vectorsCount: 0,
        config: { dimensions: 768, metric: 'cosine' },
      }),
    } as VectorizeIndex

    // Create mock AI binding
    mockAi = {
      run: vi.fn().mockResolvedValue({
        data: [[0.1, 0.2, 0.3, 0.4, 0.5]],
      }),
    } as unknown as Ai
  })

  // ============================================================
  // CONSTRUCTOR TESTS
  // ============================================================
  describe('constructor', () => {
    it('should accept Vectorize binding', () => {
      const options: VectorTranslatorOptions = {
        vectorize: mockVectorize,
      }

      const translator = new VectorTranslator(options)

      expect(translator).toBeInstanceOf(VectorTranslator)
    })

    it('should accept optional AI binding', () => {
      const options: VectorTranslatorOptions = {
        vectorize: mockVectorize,
        ai: mockAi,
      }

      const translator = new VectorTranslator(options)

      expect(translator).toBeInstanceOf(VectorTranslator)
    })

    it('should accept custom embedding model', () => {
      const options: VectorTranslatorOptions = {
        vectorize: mockVectorize,
        ai: mockAi,
        embeddingModel: '@cf/baai/bge-base-en-v1.5',
      }

      const translator = new VectorTranslator(options)

      expect(translator).toBeInstanceOf(VectorTranslator)
      expect(translator.embeddingModel).toBe('@cf/baai/bge-base-en-v1.5')
    })
  })

  // ============================================================
  // translateVectorSearch TESTS
  // ============================================================
  describe('translateVectorSearch', () => {
    it('should translate basic $vectorSearch with queryVector', async () => {
      const translator = new VectorTranslator({
        vectorize: mockVectorize,
      })

      const stage: VectorSearchStage = {
        index: 'product_embeddings',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3, 0.4, 0.5],
        numCandidates: 100,
        limit: 10,
      }

      const result = await translator.translateVectorSearch(stage, 'products')

      expect(result).toBeDefined()
      expect(result.docIds).toEqual(['doc1', 'doc2'])
      expect(result.scores).toEqual([0.95, 0.87])
      expect(mockVectorize.query).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3, 0.4, 0.5],
        expect.objectContaining({ topK: 10 })
      )
    })

    it('should throw if no queryVector and no AI binding', async () => {
      const translator = new VectorTranslator({
        vectorize: mockVectorize,
        // No AI binding provided
      })

      const stage: VectorSearchStage = {
        index: 'product_embeddings',
        path: 'embedding',
        queryText: 'wireless headphones', // Using queryText instead of queryVector
        numCandidates: 100,
        limit: 10,
      }

      await expect(translator.translateVectorSearch(stage, 'products')).rejects.toThrow(
        /AI binding.*required|queryVector.*required|embedding.*not configured/i
      )
    })

    it('should use AI binding to generate embeddings when queryVector not provided', async () => {
      const translator = new VectorTranslator({
        vectorize: mockVectorize,
        ai: mockAi,
      })

      const stage: VectorSearchStage = {
        index: 'product_embeddings',
        path: 'embedding',
        queryText: 'wireless headphones',
        numCandidates: 100,
        limit: 10,
      }

      const result = await translator.translateVectorSearch(stage, 'products')

      expect(mockAi.run).toHaveBeenCalledWith(
        expect.any(String), // embedding model
        expect.objectContaining({ text: 'wireless headphones' })
      )
      expect(result.docIds).toBeDefined()
      expect(result.scores).toBeDefined()
    })

    it('should respect limit parameter', async () => {
      const translator = new VectorTranslator({
        vectorize: mockVectorize,
      })

      const stage: VectorSearchStage = {
        index: 'product_embeddings',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 5,
      }

      await translator.translateVectorSearch(stage, 'products')

      expect(mockVectorize.query).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ topK: 5 })
      )
    })

    it('should handle filter parameter', async () => {
      const translator = new VectorTranslator({
        vectorize: mockVectorize,
      })

      const stage: VectorSearchStage = {
        index: 'product_embeddings',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
        filter: { category: 'electronics', inStock: true },
      }

      await translator.translateVectorSearch(stage, 'products')

      expect(mockVectorize.query).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          filter: { category: 'electronics', inStock: true },
        })
      )
    })

    it('should return docIds and scores', async () => {
      mockVectorize.query = vi.fn().mockResolvedValue({
        count: 3,
        matches: [
          { id: 'products:abc123', score: 0.98 },
          { id: 'products:def456', score: 0.92 },
          { id: 'products:ghi789', score: 0.85 },
        ],
      })

      const translator = new VectorTranslator({
        vectorize: mockVectorize,
      })

      const stage: VectorSearchStage = {
        index: 'product_embeddings',
        path: 'embedding',
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
      }

      const result = await translator.translateVectorSearch(stage, 'products')

      expect(result.docIds).toEqual(['abc123', 'def456', 'ghi789'])
      expect(result.scores).toEqual([0.98, 0.92, 0.85])
    })
  })

  // ============================================================
  // embedText TESTS
  // ============================================================
  describe('embedText', () => {
    it('should generate embeddings using AI binding', async () => {
      (mockAi.run as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [[0.11, 0.22, 0.33, 0.44, 0.55]],
      })

      const translator = new VectorTranslator({
        vectorize: mockVectorize,
        ai: mockAi,
      })

      const embedding = await translator.embedText('sample text for embedding')

      expect(mockAi.run).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ text: 'sample text for embedding' })
      )
      expect(embedding).toEqual([0.11, 0.22, 0.33, 0.44, 0.55])
    })

    it('should throw if AI binding not configured', async () => {
      const translator = new VectorTranslator({
        vectorize: mockVectorize,
        // No AI binding
      })

      await expect(translator.embedText('some text')).rejects.toThrow(
        /AI binding.*not configured|AI.*required/i
      )
    })

    it('should handle embedding errors', async () => {
      (mockAi.run as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('AI model unavailable'))

      const translator = new VectorTranslator({
        vectorize: mockVectorize,
        ai: mockAi,
      })

      await expect(translator.embedText('test text')).rejects.toThrow(
        /AI model unavailable|embedding.*failed|error.*generating/i
      )
    })
  })
})
