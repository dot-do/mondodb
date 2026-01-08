import type { VectorStorageAdapter, VectorSearchOptions, VectorMatch, VectorBatchInput, VectorBatchResult } from './vector-types'

/**
 * Maximum number of statements per libSQL batch operation
 * Keeps individual transactions manageable
 */
const LIBSQL_BATCH_LIMIT = 100

interface LibSQLClient {
  execute: (stmt: { sql: string; args: unknown[] }) => Promise<{ rows?: unknown[]; rowsAffected?: number }>
  batch: (stmts: { sql: string; args?: unknown[] }[]) => Promise<unknown[]>
}

export class LibSQLVectorAdapter implements VectorStorageAdapter {
  private client: LibSQLClient | null
  private tableInitialized: boolean = false

  constructor(client: LibSQLClient) {
    this.client = client || null
  }

  isAvailable(): boolean {
    return this.client !== null
  }

  private ensureClient(): LibSQLClient {
    if (!this.client) {
      throw new Error('libSQL client is not configured')
    }
    return this.client
  }

  async upsertVector(
    collection: string,
    documentId: string,
    vector: number[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const client = this.ensureClient()

    // On first operation, create table via batch
    if (!this.tableInitialized) {
      await client.batch([
        {
          sql: `CREATE TABLE IF NOT EXISTS vector_embeddings (
            document_id TEXT NOT NULL,
            collection TEXT NOT NULL,
            embedding F32_BLOB(1536),
            metadata TEXT,
            PRIMARY KEY (collection, document_id)
          )`
        }
      ])
      this.tableInitialized = true
    }

    // All upserts use execute
    await client.execute({
      sql: `INSERT OR REPLACE INTO vector_embeddings (document_id, collection, embedding, metadata)
            VALUES (?, ?, vector32(?), ?)`,
      args: [
        documentId,
        collection,
        new Float32Array(vector),
        JSON.stringify(metadata || {})
      ]
    })
  }

  /**
   * Batch upsert multiple vectors in a single efficient operation.
   * Uses chunked batch transactions for optimal performance.
   *
   * @param collection - The collection namespace
   * @param vectors - Array of vectors with documentId, vector values, and optional metadata
   * @returns Result with count and IDs of upserted vectors
   */
  async upsertVectors(collection: string, vectors: VectorBatchInput[]): Promise<VectorBatchResult> {
    if (vectors.length === 0) {
      return { count: 0, ids: [] }
    }

    const client = this.ensureClient()

    // Ensure table exists on first batch operation
    if (!this.tableInitialized) {
      await client.batch([
        {
          sql: `CREATE TABLE IF NOT EXISTS vector_embeddings (
            document_id TEXT NOT NULL,
            collection TEXT NOT NULL,
            embedding F32_BLOB(1536),
            metadata TEXT,
            PRIMARY KEY (collection, document_id)
          )`
        }
      ])
      this.tableInitialized = true
    }

    const ids: string[] = []

    // Process vectors in chunks to respect batch limits
    for (let i = 0; i < vectors.length; i += LIBSQL_BATCH_LIMIT) {
      const chunk = vectors.slice(i, i + LIBSQL_BATCH_LIMIT)

      const statements = chunk.map(({ documentId, vector, metadata }) => ({
        sql: `INSERT OR REPLACE INTO vector_embeddings (document_id, collection, embedding, metadata)
              VALUES (?, ?, vector32(?), ?)`,
        args: [
          documentId,
          collection,
          new Float32Array(vector),
          JSON.stringify(metadata || {})
        ]
      }))

      await client.batch(statements)

      // Collect IDs for return value
      chunk.forEach(({ documentId }) => ids.push(documentId))
    }

    return { count: vectors.length, ids }
  }

  async deleteVector(collection: string, documentId: string): Promise<void> {
    const client = this.ensureClient()

    await client.execute({
      sql: `DELETE FROM vector_embeddings WHERE document_id = ? AND collection = ?`,
      args: [documentId, collection]
    })
  }

  async vectorSearch(
    collection: string,
    queryVector: number[],
    options?: VectorSearchOptions
  ): Promise<VectorMatch[]> {
    const client = this.ensureClient()
    const limit = options?.limit ?? 10

    const result = await client.execute({
      sql: `SELECT document_id, collection, metadata,
            vector_distance_cos(embedding, vector32(?)) as distance
            FROM vector_embeddings
            WHERE collection = ?
            ORDER BY distance ASC
            LIMIT ?`,
      args: [new Float32Array(queryVector), collection, limit]
    })

    if (!result.rows) {
      return []
    }

    return result.rows.map((row: any) => {
      const distance = row.distance as number
      // libSQL cosine distance: 0 = identical, 2 = opposite
      // Convert to similarity score: 0-1 range
      const score = 1 - (distance / 2)

      let metadata: Record<string, unknown> = {}
      if (row.metadata) {
        try {
          metadata = JSON.parse(row.metadata as string)
        } catch {
          // Handle malformed JSON gracefully
          metadata = {}
        }
      }

      return {
        documentId: row.document_id as string,
        score,
        metadata
      }
    })
  }
}
