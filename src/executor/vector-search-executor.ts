/**
 * VectorSearchExecutor - Executes vector similarity searches using Cloudflare Vectorize
 *
 * This class handles:
 * 1. Querying Vectorize for similar vectors
 * 2. Retrieving document data from metadata
 * 3. Adding similarity scores to results
 * 4. Managing vector storage (insert, update, delete)
 */

import type { VectorizeIndex, VectorizeVector, VectorizeMatch } from '../types/vectorize'

/**
 * Translation parameters for vector search execution
 */
export interface VectorSearchTranslation {
  /** The query vector for similarity search */
  queryVector: number[]
  /** Maximum number of results to return */
  limit: number
  /** Field name to store the similarity score */
  scoreField: string
}

/**
 * SQL interface for executing queries
 */
interface SqlInterface {
  exec: (query: string, ...params: unknown[]) => { results: unknown[]; toArray?: () => unknown[] }
}

/**
 * Executes vector search operations using Cloudflare Vectorize
 */
export class VectorSearchExecutor {
  constructor(
    _sql: SqlInterface,
    private vectorize?: VectorizeIndex
  ) {
    // SQL interface available for potential future use
  }

  /**
   * Execute a vector search query
   *
   * @param translation - The translated vector search parameters
   * @param collection - The collection name
   * @returns Array of documents with similarity scores
   */
  async executeVectorSearch(
    translation: VectorSearchTranslation,
    collection: string
  ): Promise<Record<string, unknown>[]> {
    if (!this.vectorize) {
      throw new Error('Vectorize is not configured. Add VECTORIZE binding to your worker.')
    }

    const {
      queryVector,
      limit,
      scoreField
    } = translation

    // Query Vectorize
    const queryResult = await this.vectorize.query(queryVector, {
      topK: limit,
      returnMetadata: 'all'
    })

    // Process results
    const documents: Record<string, unknown>[] = []
    const collectionPrefix = `${collection}:`

    for (const match of queryResult.matches) {
      // Filter by collection prefix
      if (!match.id.startsWith(collectionPrefix)) {
        continue
      }

      // Extract document from metadata
      const doc = this.extractDocument(match)
      if (doc) {
        // Add similarity score
        doc[scoreField] = match.score
        documents.push(doc)
      }
    }

    return documents
  }

  /**
   * Upsert a vector for a document
   *
   * @param collection - The collection name
   * @param documentId - The document ID
   * @param vector - The embedding vector
   * @param document - The document data to store in metadata
   */
  async upsertVector(
    collection: string,
    documentId: string,
    vector: number[],
    document: Record<string, unknown>
  ): Promise<void> {
    if (!this.vectorize) {
      throw new Error('Vectorize is not configured. Add VECTORIZE binding to your worker.')
    }

    const vectorId = this.generateVectorId(collection, documentId)

    const vectorData: VectorizeVector = {
      id: vectorId,
      values: vector,
      metadata: {
        _data: JSON.stringify(document),
        _collection: collection,
        _documentId: documentId
      }
    }

    await this.vectorize.upsert([vectorData])
  }

  /**
   * Delete a vector for a document
   *
   * @param collection - The collection name
   * @param documentId - The document ID
   */
  async deleteVector(
    collection: string,
    documentId: string
  ): Promise<void> {
    if (!this.vectorize) {
      throw new Error('Vectorize is not configured. Add VECTORIZE binding to your worker.')
    }

    const vectorId = this.generateVectorId(collection, documentId)
    await this.vectorize.deleteByIds([vectorId])
  }

  /**
   * Generate a unique vector ID from collection and document ID
   */
  private generateVectorId(collection: string, documentId: string): string {
    return `${collection}:${documentId}`
  }

  /**
   * Extract document from vector match metadata
   */
  private extractDocument(match: VectorizeMatch): Record<string, unknown> | null {
    if (!match.metadata || !match.metadata._data) {
      return null
    }

    try {
      const dataStr = match.metadata._data as string
      return JSON.parse(dataStr) as Record<string, unknown>
    } catch {
      return null
    }
  }
}
