import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchTool, fetchToolDefinition } from '../../../../src/mcp/tools/fetch'
import type { DatabaseAccess, FetchResult } from '../../../../src/mcp/types'

describe('fetchTool', () => {
  let mockDbAccess: DatabaseAccess

  beforeEach(() => {
    mockDbAccess = {
      findOne: vi.fn(),
      find: vi.fn(),
      insertOne: vi.fn(),
      updateOne: vi.fn(),
      deleteOne: vi.fn(),
    }
  })

  describe('successful fetch', () => {
    it('should fetch a document by ID and return FetchResult', async () => {
      const mockDoc = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Document',
        content: 'Hello World',
      }

      vi.mocked(mockDbAccess.findOne).mockResolvedValue(mockDoc)

      const result = await fetchTool(mockDbAccess, 'testdb.users.507f1f77bcf86cd799439011')

      expect(result.isError).toBeUndefined()
      expect(result.content).toHaveLength(1)
      expect(result.content[0].type).toBe('text')

      const fetchResult: FetchResult = JSON.parse(result.content[0].text)
      expect(fetchResult.id).toBe('testdb.users.507f1f77bcf86cd799439011')
      expect(fetchResult.title).toBe('Test Document')
      expect(fetchResult.url).toBe('mongodb://testdb/users/507f1f77bcf86cd799439011')
      expect(fetchResult.metadata.database).toBe('testdb')
      expect(fetchResult.metadata.collection).toBe('users')
      expect(fetchResult.metadata._id).toBe('507f1f77bcf86cd799439011')

      // Verify the text contains the full document
      const docInText = JSON.parse(fetchResult.text)
      expect(docInText.title).toBe('Test Document')
      expect(docInText.content).toBe('Hello World')
    })

    it('should use name field as title fallback', async () => {
      const mockDoc = {
        _id: 'abc123',
        name: 'John Doe',
        email: 'john@example.com',
      }

      vi.mocked(mockDbAccess.findOne).mockResolvedValue(mockDoc)

      const result = await fetchTool(mockDbAccess, 'db.contacts.abc123')
      const fetchResult: FetchResult = JSON.parse(result.content[0].text)

      expect(fetchResult.title).toBe('John Doe')
    })

    it('should use subject field as title fallback', async () => {
      const mockDoc = {
        _id: 'email123',
        subject: 'Important Meeting',
        body: 'Please join us...',
      }

      vi.mocked(mockDbAccess.findOne).mockResolvedValue(mockDoc)

      const result = await fetchTool(mockDbAccess, 'mail.messages.email123')
      const fetchResult: FetchResult = JSON.parse(result.content[0].text)

      expect(fetchResult.title).toBe('Important Meeting')
    })

    it('should use label field as title fallback', async () => {
      const mockDoc = {
        _id: 'item456',
        label: 'Category A',
        value: 100,
      }

      vi.mocked(mockDbAccess.findOne).mockResolvedValue(mockDoc)

      const result = await fetchTool(mockDbAccess, 'store.items.item456')
      const fetchResult: FetchResult = JSON.parse(result.content[0].text)

      expect(fetchResult.title).toBe('Category A')
    })

    it('should use _id as title when no other fields available', async () => {
      const mockDoc = {
        _id: 'unique789',
        data: { nested: true },
      }

      vi.mocked(mockDbAccess.findOne).mockResolvedValue(mockDoc)

      const result = await fetchTool(mockDbAccess, 'db.collection.unique789')
      const fetchResult: FetchResult = JSON.parse(result.content[0].text)

      expect(fetchResult.title).toBe('unique789')
    })

    it('should handle ObjectId with dots', async () => {
      const mockDoc = {
        _id: 'complex.id.with.dots',
        title: 'Complex ID Document',
      }

      vi.mocked(mockDbAccess.findOne).mockResolvedValue(mockDoc)

      const result = await fetchTool(mockDbAccess, 'mydb.docs.complex.id.with.dots')

      expect(result.isError).toBeUndefined()

      const fetchResult: FetchResult = JSON.parse(result.content[0].text)
      expect(fetchResult.metadata.database).toBe('mydb')
      expect(fetchResult.metadata.collection).toBe('docs')
      expect(fetchResult.metadata._id).toBe('complex.id.with.dots')
    })

    it('should call findOne with correct collection and filter', async () => {
      const mockDoc = { _id: 'test123', title: 'Test' }
      vi.mocked(mockDbAccess.findOne).mockResolvedValue(mockDoc)

      await fetchTool(mockDbAccess, 'database.collection.test123')

      expect(mockDbAccess.findOne).toHaveBeenCalledWith('collection', {
        _id: 'test123',
      })
    })
  })

  describe('document not found', () => {
    it('should return error when document not found', async () => {
      vi.mocked(mockDbAccess.findOne).mockResolvedValue(null)

      const result = await fetchTool(mockDbAccess, 'db.collection.notfound')

      expect(result.isError).toBe(true)
      expect(result.content).toHaveLength(1)

      const errorResponse = JSON.parse(result.content[0].text)
      expect(errorResponse.error).toBe('Document not found')
    })
  })

  describe('invalid ID format', () => {
    it('should return error for ID with only one part', async () => {
      const result = await fetchTool(mockDbAccess, 'onlyoneid')

      expect(result.isError).toBe(true)
      const errorResponse = JSON.parse(result.content[0].text)
      expect(errorResponse.error).toBe(
        'Invalid ID format. Expected: database.collection.objectId'
      )
    })

    it('should return error for ID with only two parts', async () => {
      const result = await fetchTool(mockDbAccess, 'db.collection')

      expect(result.isError).toBe(true)
      const errorResponse = JSON.parse(result.content[0].text)
      expect(errorResponse.error).toBe(
        'Invalid ID format. Expected: database.collection.objectId'
      )
    })

    it('should return error for empty ID', async () => {
      const result = await fetchTool(mockDbAccess, '')

      expect(result.isError).toBe(true)
      const errorResponse = JSON.parse(result.content[0].text)
      expect(errorResponse.error).toBe(
        'Invalid ID format. Expected: database.collection.objectId'
      )
    })
  })

  describe('database errors', () => {
    it('should handle database errors gracefully', async () => {
      vi.mocked(mockDbAccess.findOne).mockRejectedValue(new Error('Connection failed'))

      const result = await fetchTool(mockDbAccess, 'db.collection.id123')

      expect(result.isError).toBe(true)
      const errorResponse = JSON.parse(result.content[0].text)
      expect(errorResponse.error).toBe('Connection failed')
    })

    it('should handle non-Error throws', async () => {
      vi.mocked(mockDbAccess.findOne).mockRejectedValue('Unknown error')

      const result = await fetchTool(mockDbAccess, 'db.collection.id123')

      expect(result.isError).toBe(true)
      const errorResponse = JSON.parse(result.content[0].text)
      expect(errorResponse.error).toBe('Fetch failed')
    })
  })
})

describe('fetchToolDefinition', () => {
  it('should have correct name', () => {
    expect(fetchToolDefinition.name).toBe('fetch')
  })

  it('should have description', () => {
    expect(fetchToolDefinition.description).toBeDefined()
    expect(typeof fetchToolDefinition.description).toBe('string')
  })

  it('should have correct input schema', () => {
    expect(fetchToolDefinition.inputSchema.type).toBe('object')
    expect(fetchToolDefinition.inputSchema.properties).toBeDefined()
    expect(fetchToolDefinition.inputSchema.properties?.id).toBeDefined()
    expect(fetchToolDefinition.inputSchema.properties?.id.type).toBe('string')
    expect(fetchToolDefinition.inputSchema.required).toContain('id')
  })

  it('should have correct annotations', () => {
    expect(fetchToolDefinition.annotations?.readOnlyHint).toBe(true)
    expect(fetchToolDefinition.annotations?.destructiveHint).toBe(false)
    expect(fetchToolDefinition.annotations?.idempotentHint).toBe(true)
  })
})
