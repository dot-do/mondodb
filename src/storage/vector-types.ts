export interface VectorSearchOptions {
  limit: number
  filter?: Record<string, unknown>
}

export interface VectorMatch {
  documentId: string
  score: number  // 0-1 normalized similarity score
  metadata?: Record<string, unknown>
}

export interface VectorStorageAdapter {
  upsertVector(collection: string, documentId: string, vector: number[], metadata?: Record<string, unknown>): Promise<void>
  deleteVector(collection: string, documentId: string): Promise<void>
  vectorSearch(collection: string, queryVector: number[], options?: VectorSearchOptions): Promise<VectorMatch[]>
  isAvailable(): boolean
}
