import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchTool } from '../../../../src/mcp/tools/search'
import type { DatabaseAccess, McpToolResponse } from '../../../../src/mcp/types'

/**
 * Helper to create a mock database access
 */
function createMockDb(
  documents: Array<{ _id?: string; [key: string]: unknown }> = [],
  collection = 'users',
  database = 'mydb'
): DatabaseAccess {
  return {
    find: vi.fn().mockResolvedValue(
      documents.map((d, i) => ({
        ...d,
        _id: d._id ?? `id_${i}`,
        _collection: collection,
        _database: database,
      }))
    ),
    findOne: vi.fn().mockResolvedValue(documents[0] ?? null),
    insertOne: vi.fn().mockResolvedValue({ insertedId: 'new_id' }),
    insertMany: vi.fn().mockResolvedValue({ insertedIds: [] }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    aggregate: vi.fn().mockResolvedValue([]),
    countDocuments: vi.fn().mockResolvedValue(documents.length),
    listCollections: vi.fn().mockResolvedValue([collection]),
    listDatabases: vi.fn().mockResolvedValue([database]),
  }
}

describe('searchTool', () => {
  describe('Basic Search Functionality', () => {
    it('should return results array matching OpenAI format', async () => {
      const mockDb = createMockDb([
        { _id: 'abc123', name: 'Alice', email: 'alice@example.com' },
      ])

      const result = await searchTool(mockDb, 'Alice')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results).toBeInstanceOf(Array)
      expect(parsed.results[0]).toHaveProperty('id')
      expect(parsed.results[0]).toHaveProperty('title')
      expect(parsed.results[0]).toHaveProperty('url')
      expect(parsed.results[0]).toHaveProperty('text')
    })

    it('should format id as db.collection.ObjectId', async () => {
      const mockDb = createMockDb(
        [{ _id: 'abc123', name: 'Test' }],
        'users',
        'mydb'
      )

      const result = await searchTool(mockDb, 'Test')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results[0].id).toBe('mydb.users.abc123')
    })

    it('should format url as mongodb://db/collection/ObjectId', async () => {
      const mockDb = createMockDb(
        [{ _id: 'abc123', name: 'Test' }],
        'users',
        'mydb'
      )

      const result = await searchTool(mockDb, 'Test')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results[0].url).toBe('mongodb://mydb/users/abc123')
    })

    it('should include preview text snippet', async () => {
      const mockDb = createMockDb([
        { _id: 'abc123', name: 'Alice', bio: 'Software engineer...' },
      ])

      const result = await searchTool(mockDb, 'Alice')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results[0].text).toContain('Alice')
    })

    it('should return McpToolResponse format', async () => {
      const mockDb = createMockDb([{ _id: 'abc123', name: 'Test' }])

      const result = await searchTool(mockDb, 'Test')

      expect(result).toHaveProperty('content')
      expect(Array.isArray(result.content)).toBe(true)
      expect(result.content[0]).toHaveProperty('type', 'text')
      expect(result.content[0]).toHaveProperty('text')
    })
  })

  describe('Query Parsing', () => {
    it('should handle natural language queries', async () => {
      const mockDb = createMockDb([{ _id: 'id1', name: 'Alice' }])

      const result = await searchTool(mockDb, 'find users named Alice')

      expect(result.content[0].text).toBeDefined()
      expect(result.isError).not.toBe(true)
    })

    it('should handle MongoDB-style JSON filters', async () => {
      const mockDb = createMockDb([{ _id: 'id1', name: 'Alice' }])

      const result = await searchTool(mockDb, '{"name": "Alice"}')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results).toBeDefined()
      expect(mockDb.find).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'Alice' }),
        expect.anything()
      )
    })

    it('should handle collection-prefixed queries', async () => {
      const mockDb = createMockDb([{ _id: 'id1', name: 'Alice' }])

      const result = await searchTool(mockDb, 'users: name = Alice')

      expect(result.content[0].text).toBeDefined()
      expect(mockDb.find).toHaveBeenCalled()
    })

    it('should parse db.collection prefix', async () => {
      const mockDb = createMockDb([{ _id: 'id1', name: 'Alice' }])

      const result = await searchTool(mockDb, 'mydb.users: name = Alice')

      expect(result.isError).not.toBe(true)
      expect(result.content[0].text).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should return empty results for no matches', async () => {
      const mockDb = createMockDb([])

      const result = await searchTool(mockDb, 'nonexistent')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results).toEqual([])
    })

    it('should limit results to prevent huge responses', async () => {
      const docs = Array(1000)
        .fill(null)
        .map((_, i) => ({ _id: `id_${i}`, name: 'Test' }))
      const mockDb = createMockDb(docs)

      const result = await searchTool(mockDb, 'Test')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results.length).toBeLessThanOrEqual(100)
    })

    it('should truncate preview text for large documents', async () => {
      const mockDb = createMockDb([
        { _id: 'abc', content: 'x'.repeat(10000) },
      ])

      const result = await searchTool(mockDb, 'content')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results[0].text.length).toBeLessThanOrEqual(500)
    })

    it('should handle invalid JSON query gracefully', async () => {
      const mockDb = createMockDb([])

      // Invalid JSON should not crash - should treat as text search
      const result = await searchTool(mockDb, '{{invalid json')

      // Should still return a valid response (either search results or error)
      expect(result.content).toBeDefined()
      expect(result.content[0].type).toBe('text')
    })

    it('should handle database errors gracefully', async () => {
      const mockDb = createMockDb([])
      ;(mockDb.find as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database error')
      )

      const result = await searchTool(mockDb, 'test')

      expect(result.isError).toBe(true)
      const parsed = JSON.parse(result.content[0].text)
      expect(parsed.error).toBeDefined()
    })
  })

  describe('Title Generation', () => {
    it('should use title field if present', async () => {
      const mockDb = createMockDb([
        { _id: 'id1', title: 'My Document Title', content: 'body' },
      ])

      const result = await searchTool(mockDb, 'document')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results[0].title).toBe('My Document Title')
    })

    it('should use name field if no title', async () => {
      const mockDb = createMockDb([
        { _id: 'id1', name: 'Alice Smith', email: 'alice@example.com' },
      ])

      const result = await searchTool(mockDb, 'alice')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results[0].title).toBe('Alice Smith')
    })

    it('should fallback to _id if no title or name', async () => {
      const mockDb = createMockDb([
        { _id: 'doc_12345', value: 42 },
      ])

      const result = await searchTool(mockDb, 'value')
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results[0].title).toBe('doc_12345')
    })
  })

  describe('Search Options', () => {
    it('should respect limit option in query', async () => {
      const docs = Array(50)
        .fill(null)
        .map((_, i) => ({ _id: `id_${i}`, name: 'Test' }))
      const mockDb = createMockDb(docs)

      const result = await searchTool(mockDb, 'Test', { limit: 10 })
      const parsed = JSON.parse(result.content[0].text)

      expect(parsed.results.length).toBeLessThanOrEqual(10)
    })

    it('should search specific collection when specified', async () => {
      const mockDb = createMockDb([{ _id: 'id1', name: 'Alice' }], 'customers')

      await searchTool(mockDb, 'Alice', { collection: 'customers' })

      expect(mockDb.find).toHaveBeenCalledWith(
        'customers',
        expect.anything(),
        expect.anything()
      )
    })
  })
})
