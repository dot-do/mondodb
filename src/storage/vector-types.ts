export interface VectorSearchOptions {
  limit: number
  filter?: Record<string, unknown>
}

export interface VectorMatch {
  documentId: string
  score: number  // 0-1 normalized similarity score
  metadata?: Record<string, unknown>
}

/**
 * Batch vector input for bulk upsert operations
 */
export interface VectorBatchInput {
  documentId: string
  vector: number[]
  metadata?: Record<string, unknown>
}

/**
 * Result from batch upsert operations
 */
export interface VectorBatchResult {
  count: number
  ids: string[]
}

export interface VectorStorageAdapter {
  upsertVector(collection: string, documentId: string, vector: number[], metadata?: Record<string, unknown>): Promise<void>
  /**
   * Batch upsert multiple vectors in a single efficient operation.
   * Uses chunked transactions for optimal performance.
   */
  upsertVectors(collection: string, vectors: VectorBatchInput[]): Promise<VectorBatchResult>
  deleteVector(collection: string, documentId: string): Promise<void>
  vectorSearch(collection: string, queryVector: number[], options?: VectorSearchOptions): Promise<VectorMatch[]>
  isAvailable(): boolean
}
