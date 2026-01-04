/**
 * Cloudflare Vectorize types for vector search
 *
 * These interfaces match the Cloudflare Vectorize API for compatibility
 * with the Workers AI embeddings and vector similarity search.
 */

/**
 * Supported metadata value types for vector storage
 */
export type VectorizeMetadataValue = string | number | boolean | string[]

/**
 * Metadata object attached to vectors
 */
export type VectorizeMetadata = Record<string, VectorizeMetadataValue>

/**
 * A vector with its ID, values, and optional metadata
 */
export interface VectorizeVector {
  /** Unique identifier for the vector */
  id: string
  /** The embedding vector values */
  values: number[] | Float32Array | Float64Array
  /** Optional namespace for organizing vectors */
  namespace?: string
  /** Optional metadata attached to the vector */
  metadata?: VectorizeMetadata
}

/**
 * Options for querying vectors
 */
export interface VectorizeQueryOptions {
  /** Number of results to return (default: 10) */
  topK?: number
  /** Optional namespace to search within */
  namespace?: string
  /** Whether to return vector values (default: false) */
  returnValues?: boolean
  /** Whether to return metadata (default: false) */
  returnMetadata?: 'none' | 'indexed' | 'all'
  /** Optional filter expression for metadata filtering */
  filter?: Record<string, VectorizeMetadataValue>
}

/**
 * A match result from a vector query
 */
export interface VectorizeMatch {
  /** The vector ID */
  id: string
  /** Similarity score (higher is more similar) */
  score: number
  /** The vector values (if returnValues was true) */
  values?: number[]
  /** The metadata (if returnMetadata was set) */
  metadata?: VectorizeMetadata
}

/**
 * Result from a vector query operation
 */
export interface VectorizeQueryResult {
  /** Number of matches returned */
  count: number
  /** The matching vectors */
  matches: VectorizeMatch[]
}

/**
 * Result from a vector mutation operation (insert, upsert, delete)
 */
export interface VectorizeMutationResult {
  /** Number of vectors affected */
  count: number
  /** IDs of affected vectors */
  ids: string[]
}

/**
 * Vectorize index interface matching Cloudflare's API
 */
export interface VectorizeIndex {
  /**
   * Query the index for similar vectors
   * @param vector - The query vector
   * @param options - Query options
   */
  query(
    vector: number[] | Float32Array | Float64Array,
    options?: VectorizeQueryOptions
  ): Promise<VectorizeQueryResult>

  /**
   * Insert vectors into the index
   * @param vectors - Vectors to insert
   */
  insert(vectors: VectorizeVector[]): Promise<VectorizeMutationResult>

  /**
   * Upsert vectors into the index (insert or update)
   * @param vectors - Vectors to upsert
   */
  upsert(vectors: VectorizeVector[]): Promise<VectorizeMutationResult>

  /**
   * Delete vectors by ID
   * @param ids - IDs of vectors to delete
   */
  deleteByIds(ids: string[]): Promise<VectorizeMutationResult>

  /**
   * Get vectors by ID
   * @param ids - IDs of vectors to retrieve
   */
  getByIds(ids: string[]): Promise<VectorizeVector[]>

  /**
   * Describe the index configuration
   */
  describe(): Promise<{
    dimensions: number
    vectorsCount: number
    config: {
      dimensions: number
      metric: 'cosine' | 'euclidean' | 'dot-product'
    }
  }>
}

/**
 * Workers AI binding interface for embeddings
 */
export interface Ai {
  /**
   * Run an AI model
   * @param model - The model identifier (e.g., '@cf/baai/bge-m3')
   * @param inputs - The inputs for the model
   */
  run<T = unknown>(
    model: string,
    inputs: Record<string, unknown>
  ): Promise<T>
}

/**
 * Result from an embedding model
 */
export interface EmbeddingResult {
  /** The embedding vectors for each input */
  data: number[][]
  /** Shape of the embeddings [count, dimensions] */
  shape: [number, number]
}
