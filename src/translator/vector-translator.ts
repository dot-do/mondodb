/**
 * VectorTranslator - Translates MongoDB $vectorSearch stages (mongo.do-rn0)
 *
 * Handles the translation of vector search operations for use with
 * Cloudflare Vectorize and AI bindings for embedding generation.
 *
 * This file contains type definitions and a stub implementation for the RED
 * phase of TDD. Tests should compile but fail because methods are not
 * implemented.
 */

import type { VectorizeIndex, Ai, VectorizeMetadataValue, EmbeddingResult } from '../types/vectorize'

/**
 * Options for configuring the VectorTranslator
 */
export interface VectorTranslatorOptions {
  /** Cloudflare Vectorize index binding */
  vectorize: VectorizeIndex
  /** Optional Workers AI binding for generating embeddings from text */
  ai?: Ai
  /** Optional embedding model to use (default: '@cf/baai/bge-m3') */
  embeddingModel?: string
}

/**
 * MongoDB $vectorSearch aggregation stage
 * @see https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-stage/
 */
export interface VectorSearchStage {
  /** Name of the vector search index */
  index: string
  /** Path to the vector field in documents */
  path: string
  /** Query vector for similarity search */
  queryVector?: number[]
  /** Text query to convert to embedding (requires AI binding) */
  queryText?: string
  /** Number of candidates to consider */
  numCandidates?: number
  /** Maximum number of documents to return */
  limit: number
  /** Optional filter for pre-filtering documents */
  filter?: Record<string, VectorizeMetadataValue>
  /** Optional field name to store the similarity score in results */
  scoreField?: string
  /** Whether to perform exact (brute-force) search instead of approximate */
  exact?: boolean
}

/**
 * Result from a vector search operation
 */
export interface VectorSearchResult {
  /** Document IDs in order of similarity */
  docIds: string[]
  /** Similarity scores corresponding to each doc ID */
  scores: number[]
}

/**
 * VectorTranslator class for translating MongoDB $vectorSearch to Cloudflare Vectorize
 */
export class VectorTranslator {
  /** The embedding model to use for text-to-vector conversion */
  public readonly embeddingModel: string

  /** The Vectorize index binding */
  protected readonly vectorize: VectorizeIndex

  /** The AI binding for text embedding */
  protected readonly ai: Ai | undefined

  constructor(options?: VectorTranslatorOptions) {
    this.vectorize = options?.vectorize as VectorizeIndex
    this.ai = options?.ai
    this.embeddingModel = options?.embeddingModel ?? '@cf/baai/bge-m3'
  }

  /** Get the vectorize index (for subclasses or testing) */
  protected getVectorize(): VectorizeIndex {
    return this.vectorize
  }

  /** Get the AI binding (for subclasses or testing) */
  protected getAi(): Ai | undefined {
    return this.ai
  }

  /**
   * Translate a MongoDB $vectorSearch stage to Cloudflare Vectorize query
   *
   * @param stage - The $vectorSearch stage from the aggregation pipeline
   * @param collectionName - The name of the collection being searched
   * @returns Promise resolving to document IDs and scores
   * @throws Error if queryVector not provided and AI binding not configured
   */
  async translateVectorSearch(
    stage: VectorSearchStage,
    _collectionName: string
  ): Promise<VectorSearchResult> {
    // Get the query vector - either from stage or by generating embedding
    let queryVector: number[]

    if (stage.queryVector) {
      queryVector = stage.queryVector
    } else if (stage.queryText) {
      if (!this.ai) {
        throw new Error('AI binding is required to generate embeddings from queryText')
      }
      queryVector = await this.embedText(stage.queryText)
    } else {
      throw new Error('queryVector is required when AI binding is not configured')
    }

    // Build query options for Vectorize
    const queryOptions: { topK: number; filter?: Record<string, VectorizeMetadataValue> } = {
      topK: stage.limit,
    }

    if (stage.filter) {
      queryOptions.filter = stage.filter
    }

    // Execute vector search
    const result = await this.vectorize.query(queryVector, queryOptions)

    // Extract doc IDs (strip collection prefix) and scores
    const docIds: string[] = []
    const scores: number[] = []

    for (const match of result.matches) {
      // Vector IDs are stored as "collection:docId"
      const id = match.id
      const colonIdx = id.indexOf(':')
      const docId = colonIdx >= 0 ? id.slice(colonIdx + 1) : id
      docIds.push(docId)
      scores.push(match.score)
    }

    return { docIds, scores }
  }

  /**
   * Generate an embedding vector from text using the AI binding
   *
   * @param text - The text to embed
   * @returns Promise resolving to the embedding vector
   * @throws Error if AI binding not configured
   */
  async embedText(text: string): Promise<number[]> {
    if (!this.ai) {
      throw new Error('AI binding is not configured')
    }

    try {
      const result = await this.ai.run<EmbeddingResult>(this.embeddingModel, { text })
      // AI returns { data: [[embedding values]] }
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        return result.data[0]
      }
      throw new Error('Unexpected embedding result format')
    } catch (err) {
      if (err instanceof Error && err.message.includes('AI binding')) {
        throw err
      }
      throw err
    }
  }
}
