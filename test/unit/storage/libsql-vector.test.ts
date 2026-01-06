import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LibSQLVectorAdapter } from '../../../src/storage/libsql-vector-adapter'
import type { VectorStorageAdapter } from '../../../src/storage/vector-storage-adapter'

/**
 * RED Phase Tests: LibSQL Native Vector Search Operations
 *
 * These tests verify that the LibSQLVectorAdapter implements VectorStorageAdapter
 * with proper support for:
 * - F32_BLOB column storage for vectors
 * - vector_distance_cos() for cosine similarity search
 * - Normalized scores (0-1) from libSQL distance (0-2)
 *
 * Issue: mondodb-gslt
 */

// Mock libSQL client interface
interface MockLibSQLClient {
  execute: ReturnType<typeof vi.fn>
  batch: ReturnType<typeof vi.fn>
}

function createMockLibSQLClient(): MockLibSQLClient {
  return {
    execute: vi.fn(),
    batch: vi.fn()
  }
}

describe('LibSQLVectorAdapter', () => {
  let mockClient: MockLibSQLClient
  let adapter: VectorStorageAdapter

  beforeEach(() => {
    mockClient = createMockLibSQLClient()
    adapter = new LibSQLVectorAdapter(mockClient as any)
  })

  describe('interface compliance', () => {
    it('should implement VectorStorageAdapter interface', () => {
      expect(adapter).toBeDefined()
      expect(typeof adapter.upsertVector).toBe('function')
      expect(typeof adapter.deleteVector).toBe('function')
      expect(typeof adapter.vectorSearch).toBe('function')
      expect(typeof adapter.isAvailable).toBe('function')
    })
  })

  describe('isAvailable', () => {
    it('should return true when libSQL client is configured', async () => {
      const result = await adapter.isAvailable()
      expect(result).toBe(true)
    })

    it('should return false when libSQL client is not configured', async () => {
      const adapterWithoutClient = new LibSQLVectorAdapter(null as any)
      const result = await adapterWithoutClient.isAvailable()
      expect(result).toBe(false)
    })
  })

  describe('upsertVector', () => {
    it('should store vector with F32_BLOB column', async () => {
      mockClient.execute.mockResolvedValueOnce({ rowsAffected: 1 })

      const vector = [0.1, 0.2, 0.3, 0.4, 0.5]
      const documentId = 'doc-123'
      const collection = 'products'
      const metadata = { name: 'Test Product', price: 99.99 }

      await adapter.upsertVector(collection, documentId, vector, metadata)

      expect(mockClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('INSERT OR REPLACE'),
          args: expect.arrayContaining([
            documentId,
            collection,
            expect.any(Object), // F32_BLOB encoded vector
            expect.any(String)  // JSON metadata
          ])
        })
      )

      // Verify the vector is passed as Float32Array for F32_BLOB storage
      const callArgs = mockClient.execute.mock.calls[0][0]
      expect(callArgs.sql).toContain('vector_embeddings')
    })

    it('should create table if not exists on first upsert', async () => {
      mockClient.batch.mockResolvedValueOnce([{ rowsAffected: 0 }, { rowsAffected: 1 }])

      const vector = [0.1, 0.2, 0.3]
      await adapter.upsertVector('products', 'doc-1', vector, {})

      // Should include CREATE TABLE statement
      expect(mockClient.batch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            sql: expect.stringMatching(/CREATE TABLE IF NOT EXISTS.*vector_embeddings/)
          })
        ])
      )
    })

    it('should handle vector dimension variations', async () => {
      mockClient.execute.mockResolvedValueOnce({ rowsAffected: 1 })

      // Test with different vector dimensions
      const smallVector = [0.1, 0.2]
      const largeVector = new Array(1536).fill(0.1) // OpenAI embedding size

      await adapter.upsertVector('products', 'doc-small', smallVector, {})

      mockClient.execute.mockResolvedValueOnce({ rowsAffected: 1 })
      await adapter.upsertVector('products', 'doc-large', largeVector, {})

      expect(mockClient.execute).toHaveBeenCalledTimes(2)
    })
  })

  describe('deleteVector', () => {
    it('should remove vector by document ID', async () => {
      mockClient.execute.mockResolvedValueOnce({ rowsAffected: 1 })

      await adapter.deleteVector('products', 'doc-123')

      expect(mockClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('DELETE FROM'),
          args: expect.arrayContaining(['doc-123', 'products'])
        })
      )
    })

    it('should not throw if document does not exist', async () => {
      mockClient.execute.mockResolvedValueOnce({ rowsAffected: 0 })

      await expect(
        adapter.deleteVector('products', 'non-existent')
      ).resolves.not.toThrow()
    })

    it('should delete from correct collection scope', async () => {
      mockClient.execute.mockResolvedValueOnce({ rowsAffected: 1 })

      await adapter.deleteVector('orders', 'order-456')

      const callArgs = mockClient.execute.mock.calls[0][0]
      expect(callArgs.args).toContain('orders')
    })
  })

  describe('vectorSearch', () => {
    it('should find similar vectors using vector_distance_cos()', async () => {
      // Mock search results with libSQL distance format (0-2 range for cosine)
      mockClient.execute.mockResolvedValueOnce({
        rows: [
          { document_id: 'doc-1', collection: 'products', metadata: '{"name":"Product A"}', distance: 0.1 },
          { document_id: 'doc-2', collection: 'products', metadata: '{"name":"Product B"}', distance: 0.3 },
          { document_id: 'doc-3', collection: 'products', metadata: '{"name":"Product C"}', distance: 0.5 }
        ]
      })

      const queryVector = [0.1, 0.2, 0.3, 0.4, 0.5]
      const results = await adapter.vectorSearch('products', queryVector, { limit: 10 })

      expect(mockClient.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: expect.stringContaining('vector_distance_cos')
        })
      )

      expect(results).toHaveLength(3)
      expect(results[0].documentId).toBe('doc-1')
      expect(results[1].documentId).toBe('doc-2')
      expect(results[2].documentId).toBe('doc-3')
    })

    it('should normalize scores to 0-1 range from libSQL distance (0-2)', async () => {
      // libSQL cosine distance returns 0-2 where:
      // 0 = identical vectors (score should be 1.0)
      // 2 = opposite vectors (score should be 0.0)
      mockClient.execute.mockResolvedValueOnce({
        rows: [
          { document_id: 'doc-1', collection: 'products', metadata: '{}', distance: 0.0 },   // Perfect match
          { document_id: 'doc-2', collection: 'products', metadata: '{}', distance: 0.5 },   // High similarity
          { document_id: 'doc-3', collection: 'products', metadata: '{}', distance: 1.0 },   // Orthogonal
          { document_id: 'doc-4', collection: 'products', metadata: '{}', distance: 2.0 }    // Opposite
        ]
      })

      const queryVector = [1.0, 0.0, 0.0]
      const results = await adapter.vectorSearch('products', queryVector, { limit: 10 })

      // Score = 1 - (distance / 2) to normalize from 0-2 distance to 0-1 similarity
      expect(results[0].score).toBe(1.0)    // distance 0.0 -> score 1.0
      expect(results[1].score).toBe(0.75)   // distance 0.5 -> score 0.75
      expect(results[2].score).toBe(0.5)    // distance 1.0 -> score 0.5
      expect(results[3].score).toBe(0.0)    // distance 2.0 -> score 0.0
    })

    it('should respect limit parameter', async () => {
      mockClient.execute.mockResolvedValueOnce({
        rows: [
          { document_id: 'doc-1', collection: 'products', metadata: '{}', distance: 0.1 }
        ]
      })

      const queryVector = [0.1, 0.2, 0.3]
      await adapter.vectorSearch('products', queryVector, { limit: 5 })

      const callArgs = mockClient.execute.mock.calls[0][0]
      expect(callArgs.sql).toContain('LIMIT')
      expect(callArgs.args).toContain(5)
    })

    it('should filter by collection', async () => {
      mockClient.execute.mockResolvedValueOnce({ rows: [] })

      const queryVector = [0.1, 0.2, 0.3]
      await adapter.vectorSearch('orders', queryVector, { limit: 10 })

      const callArgs = mockClient.execute.mock.calls[0][0]
      expect(callArgs.sql).toContain('collection = ?')
      expect(callArgs.args).toContain('orders')
    })

    it('should return parsed metadata with results', async () => {
      mockClient.execute.mockResolvedValueOnce({
        rows: [
          {
            document_id: 'doc-1',
            collection: 'products',
            metadata: '{"name":"Product A","price":29.99,"tags":["sale","new"]}',
            distance: 0.2
          }
        ]
      })

      const queryVector = [0.1, 0.2, 0.3]
      const results = await adapter.vectorSearch('products', queryVector, { limit: 10 })

      expect(results[0].metadata).toEqual({
        name: 'Product A',
        price: 29.99,
        tags: ['sale', 'new']
      })
    })

    it('should handle empty results', async () => {
      mockClient.execute.mockResolvedValueOnce({ rows: [] })

      const queryVector = [0.1, 0.2, 0.3]
      const results = await adapter.vectorSearch('products', queryVector, { limit: 10 })

      expect(results).toEqual([])
    })

    it('should order results by similarity (ascending distance)', async () => {
      mockClient.execute.mockResolvedValueOnce({
        rows: [
          { document_id: 'doc-1', collection: 'products', metadata: '{}', distance: 0.1 },
          { document_id: 'doc-2', collection: 'products', metadata: '{}', distance: 0.2 },
          { document_id: 'doc-3', collection: 'products', metadata: '{}', distance: 0.3 }
        ]
      })

      const queryVector = [0.1, 0.2, 0.3]
      await adapter.vectorSearch('products', queryVector, { limit: 10 })

      const callArgs = mockClient.execute.mock.calls[0][0]
      expect(callArgs.sql).toContain('ORDER BY')
      expect(callArgs.sql).toMatch(/ORDER BY.*distance|ORDER BY.*vector_distance_cos/)
    })
  })

  describe('vector similarity verification', () => {
    it('should find most similar vectors first', async () => {
      // Setup vectors with known similarity relationships
      // Vector A: [1, 0, 0] - reference
      // Vector B: [0.9, 0.1, 0] - very similar to A
      // Vector C: [0, 1, 0] - orthogonal to A
      // Vector D: [-1, 0, 0] - opposite to A

      mockClient.execute.mockResolvedValueOnce({
        rows: [
          { document_id: 'vec-b', collection: 'test', metadata: '{"label":"similar"}', distance: 0.02 },
          { document_id: 'vec-c', collection: 'test', metadata: '{"label":"orthogonal"}', distance: 1.0 },
          { document_id: 'vec-d', collection: 'test', metadata: '{"label":"opposite"}', distance: 2.0 }
        ]
      })

      const queryVector = [1, 0, 0] // Reference vector
      const results = await adapter.vectorSearch('test', queryVector, { limit: 10 })

      // Most similar should be first (highest score)
      expect(results[0].documentId).toBe('vec-b')
      expect(results[0].score).toBeGreaterThan(0.9) // Very similar

      // Orthogonal should have middle score
      expect(results[1].documentId).toBe('vec-c')
      expect(results[1].score).toBeCloseTo(0.5, 1) // Orthogonal

      // Opposite should have lowest score
      expect(results[2].documentId).toBe('vec-d')
      expect(results[2].score).toBeCloseTo(0, 1) // Opposite
    })

    it('should handle normalized vectors correctly', async () => {
      // Test with pre-normalized unit vectors
      const normalizedQuery = [0.5773, 0.5773, 0.5773] // Approximately [1,1,1] normalized

      mockClient.execute.mockResolvedValueOnce({
        rows: [
          { document_id: 'doc-1', collection: 'test', metadata: '{}', distance: 0.0 }
        ]
      })

      const results = await adapter.vectorSearch('test', normalizedQuery, { limit: 5 })

      expect(results[0].score).toBe(1.0) // Perfect match should have score 1.0
    })
  })

  describe('error handling', () => {
    it('should throw error when client is not available for search', async () => {
      const adapterWithoutClient = new LibSQLVectorAdapter(null as any)

      await expect(
        adapterWithoutClient.vectorSearch('products', [0.1, 0.2], { limit: 10 })
      ).rejects.toThrow('libSQL client is not configured')
    })

    it('should throw error when client is not available for upsert', async () => {
      const adapterWithoutClient = new LibSQLVectorAdapter(null as any)

      await expect(
        adapterWithoutClient.upsertVector('products', 'doc-1', [0.1, 0.2], {})
      ).rejects.toThrow('libSQL client is not configured')
    })

    it('should handle database errors gracefully', async () => {
      mockClient.execute.mockRejectedValueOnce(new Error('Database connection failed'))

      await expect(
        adapter.vectorSearch('products', [0.1, 0.2], { limit: 10 })
      ).rejects.toThrow('Database connection failed')
    })

    it('should handle malformed metadata JSON', async () => {
      mockClient.execute.mockResolvedValueOnce({
        rows: [
          { document_id: 'doc-1', collection: 'products', metadata: 'invalid-json', distance: 0.1 }
        ]
      })

      const results = await adapter.vectorSearch('products', [0.1, 0.2], { limit: 10 })

      // Should handle gracefully, returning empty or null metadata
      expect(results[0].documentId).toBe('doc-1')
      expect(results[0].metadata).toEqual({}) // Or null, depending on implementation
    })
  })

  describe('F32_BLOB encoding', () => {
    it('should encode vectors as Float32Array for F32_BLOB storage', async () => {
      mockClient.execute.mockResolvedValueOnce({ rowsAffected: 1 })

      const vector = [0.1, 0.2, 0.3, 0.4]
      await adapter.upsertVector('products', 'doc-1', vector, {})

      const callArgs = mockClient.execute.mock.calls[0][0]

      // The vector argument should be a typed array or buffer compatible with F32_BLOB
      const vectorArg = callArgs.args.find((arg: any) =>
        arg instanceof Float32Array ||
        arg instanceof ArrayBuffer ||
        Buffer.isBuffer(arg)
      )

      expect(vectorArg).toBeDefined()
    })

    it('should handle Float32Array input directly', async () => {
      mockClient.execute.mockResolvedValueOnce({ rowsAffected: 1 })

      const vector = new Float32Array([0.1, 0.2, 0.3, 0.4])
      await adapter.upsertVector('products', 'doc-1', Array.from(vector), {})

      expect(mockClient.execute).toHaveBeenCalled()
    })
  })
})
