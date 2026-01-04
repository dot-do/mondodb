/**
 * VectorTranslator - Translates MongoDB $vectorSearch stages
 *
 * Handles the translation of vector search operations for use with
 * Cloudflare Vectorize. This translator prepares the vector search
 * parameters that will be executed by the VectorSearchExecutor.
 */

import { QueryTranslator } from './query-translator'

/**
 * MongoDB Atlas $vectorSearch stage specification
 */
export interface VectorSearchStage {
  /** Name of the vector search index */
  index: string
  /** Path to the vector field in documents */
  path: string
  /** The query vector to search for */
  queryVector: number[]
  /** Number of candidates to consider (default: limit * 10) */
  numCandidates?: number
  /** Maximum number of results to return */
  limit: number
  /** Optional filter to apply before vector search */
  filter?: Record<string, unknown>
  /** Whether to perform exact search (slower but more accurate) */
  exact?: boolean
  /** Field name to store the similarity score (default: 'score') */
  scoreField?: string
}

/**
 * Result from translating a $vectorSearch stage
 */
export interface VectorSearchTranslation {
  /** The vector index name */
  vectorIndexName: string
  /** Path to the vector field */
  vectorPath: string
  /** The query vector */
  queryVector: number[]
  /** Number of candidates to consider */
  numCandidates: number
  /** Maximum results to return */
  limit: number
  /** Original filter object */
  filter?: Record<string, unknown>
  /** SQL WHERE clause for filtering */
  whereClause?: string
  /** Parameters for the WHERE clause */
  whereParams?: unknown[]
  /** Whether to perform exact search */
  exact: boolean
  /** Field name for similarity score */
  scoreField: string
}

/**
 * Translates MongoDB $vectorSearch stages for use with Cloudflare Vectorize
 */
export class VectorTranslator {
  private queryTranslator: QueryTranslator

  constructor() {
    this.queryTranslator = new QueryTranslator()
  }

  /**
   * Translate a $vectorSearch stage into vector search parameters
   * @param stage - The $vectorSearch stage specification
   * @param collection - The collection name
   * @returns Translation result with vector search parameters
   */
  translateVectorSearch(
    stage: VectorSearchStage,
    collection: string
  ): VectorSearchTranslation {
    const {
      index,
      path,
      queryVector,
      numCandidates,
      limit,
      filter,
      exact = false,
      scoreField = 'score'
    } = stage

    // Default numCandidates to limit * 10 for better recall
    const effectiveNumCandidates = numCandidates ?? limit * 10

    const result: VectorSearchTranslation = {
      vectorIndexName: index,
      vectorPath: path,
      queryVector,
      numCandidates: effectiveNumCandidates,
      limit,
      exact,
      scoreField
    }

    // Translate filter to SQL WHERE clause if present
    if (filter && Object.keys(filter).length > 0) {
      result.filter = filter
      const { sql, params } = this.queryTranslator.translate(filter)
      result.whereClause = sql
      result.whereParams = params
    }

    return result
  }

  /**
   * Generate a vector ID from collection and document ID
   * Format: "collection:documentId"
   * @param collection - The collection name
   * @param documentId - The document ID
   * @returns The vector ID
   */
  generateVectorId(collection: string, documentId: string): string {
    return `${collection}:${documentId}`
  }

  /**
   * Parse a vector ID into collection and document ID
   * @param vectorId - The vector ID in format "collection:documentId"
   * @returns Object with collection and documentId
   */
  parseVectorId(vectorId: string): { collection: string; documentId: string } {
    const colonIndex = vectorId.indexOf(':')
    if (colonIndex === -1) {
      throw new Error(`Invalid vector ID format: ${vectorId}`)
    }

    return {
      collection: vectorId.substring(0, colonIndex),
      documentId: vectorId.substring(colonIndex + 1)
    }
  }
}
