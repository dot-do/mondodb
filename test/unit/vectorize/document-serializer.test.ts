import { describe, it, expect, beforeEach } from 'vitest'
import {
  DocumentSerializer,
  type SerializerOptions,
  type SerializedDocument
} from '../../../src/embedding/document-serializer'

describe('DocumentSerializer', () => {
  let serializer: DocumentSerializer

  beforeEach(() => {
    serializer = new DocumentSerializer()
  })

  // ============================================================================
  // Basic Serialization
  // ============================================================================

  describe('basic serialization', () => {
    it('should serialize a simple document with string fields', () => {
      const doc = {
        _id: '123',
        title: 'Hello World',
        description: 'A simple test document'
      }

      const result = serializer.serialize(doc)

      expect(result.text).toBe('Hello World A simple test document')
      expect(result.documentId).toBe('123')
    })

    it('should serialize document with number fields as strings', () => {
      const doc = {
        _id: '456',
        name: 'Product',
        price: 29.99,
        quantity: 100
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('Product')
      expect(result.text).toContain('29.99')
      expect(result.text).toContain('100')
    })

    it('should handle boolean fields', () => {
      const doc = {
        _id: '789',
        name: 'Item',
        inStock: true,
        discontinued: false
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('Item')
      expect(result.text).toContain('true')
      expect(result.text).toContain('false')
    })

    it('should exclude null and undefined values', () => {
      const doc = {
        _id: 'abc',
        title: 'Test',
        nullField: null,
        undefinedField: undefined
      }

      const result = serializer.serialize(doc)

      expect(result.text).toBe('Test')
      expect(result.text).not.toContain('null')
      expect(result.text).not.toContain('undefined')
    })

    it('should handle empty document', () => {
      const doc = { _id: 'empty' }

      const result = serializer.serialize(doc)

      expect(result.text).toBe('')
      expect(result.documentId).toBe('empty')
    })

    it('should use ObjectId string representation', () => {
      const doc = {
        _id: { toString: () => 'objectid123' },
        content: 'test'
      }

      const result = serializer.serialize(doc)

      expect(result.documentId).toBe('objectid123')
    })
  })

  // ============================================================================
  // Nested Fields
  // ============================================================================

  describe('nested fields', () => {
    it('should serialize nested object fields', () => {
      const doc = {
        _id: '1',
        title: 'Main Title',
        metadata: {
          author: 'John Doe',
          category: 'Technology'
        }
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('Main Title')
      expect(result.text).toContain('John Doe')
      expect(result.text).toContain('Technology')
    })

    it('should serialize deeply nested objects', () => {
      const doc = {
        _id: '2',
        article: {
          content: {
            body: {
              text: 'Deep nested content'
            }
          }
        }
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('Deep nested content')
    })

    it('should handle mixed nested and top-level fields', () => {
      const doc = {
        _id: '3',
        name: 'Product X',
        details: {
          description: 'Excellent product',
          specs: {
            weight: '1kg'
          }
        },
        category: 'Electronics'
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('Product X')
      expect(result.text).toContain('Excellent product')
      expect(result.text).toContain('1kg')
      expect(result.text).toContain('Electronics')
    })
  })

  // ============================================================================
  // Array Handling
  // ============================================================================

  describe('array handling', () => {
    it('should serialize string arrays', () => {
      const doc = {
        _id: '1',
        title: 'Tagged Document',
        tags: ['javascript', 'typescript', 'nodejs']
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('Tagged Document')
      expect(result.text).toContain('javascript')
      expect(result.text).toContain('typescript')
      expect(result.text).toContain('nodejs')
    })

    it('should serialize array of objects', () => {
      const doc = {
        _id: '2',
        name: 'Recipe',
        ingredients: [
          { name: 'flour', amount: '2 cups' },
          { name: 'sugar', amount: '1 cup' }
        ]
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('Recipe')
      expect(result.text).toContain('flour')
      expect(result.text).toContain('2 cups')
      expect(result.text).toContain('sugar')
      expect(result.text).toContain('1 cup')
    })

    it('should handle empty arrays', () => {
      const doc = {
        _id: '3',
        title: 'Empty List',
        items: []
      }

      const result = serializer.serialize(doc)

      expect(result.text).toBe('Empty List')
    })

    it('should handle nested arrays', () => {
      const doc = {
        _id: '4',
        matrix: [
          ['a', 'b'],
          ['c', 'd']
        ]
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('a')
      expect(result.text).toContain('b')
      expect(result.text).toContain('c')
      expect(result.text).toContain('d')
    })

    it('should serialize number arrays', () => {
      const doc = {
        _id: '5',
        scores: [95, 87, 92]
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('95')
      expect(result.text).toContain('87')
      expect(result.text).toContain('92')
    })
  })

  // ============================================================================
  // Field Selection
  // ============================================================================

  describe('field selection', () => {
    it('should only serialize specified fields when includedFields provided', () => {
      const doc = {
        _id: '1',
        title: 'Important Title',
        description: 'Important Description',
        internalCode: 'ABC123',
        secretField: 'should not appear'
      }

      const options: SerializerOptions = {
        includedFields: ['title', 'description']
      }

      const result = serializer.serialize(doc, options)

      expect(result.text).toContain('Important Title')
      expect(result.text).toContain('Important Description')
      expect(result.text).not.toContain('ABC123')
      expect(result.text).not.toContain('should not appear')
    })

    it('should exclude specified fields when excludedFields provided', () => {
      const doc = {
        _id: '2',
        title: 'Public Title',
        content: 'Public Content',
        password: 'secret123',
        apiKey: 'key456'
      }

      const options: SerializerOptions = {
        excludedFields: ['password', 'apiKey']
      }

      const result = serializer.serialize(doc, options)

      expect(result.text).toContain('Public Title')
      expect(result.text).toContain('Public Content')
      expect(result.text).not.toContain('secret123')
      expect(result.text).not.toContain('key456')
    })

    it('should support dot notation for nested field inclusion', () => {
      const doc = {
        _id: '3',
        name: 'Document',
        metadata: {
          author: 'Alice',
          internal: {
            revision: 5,
            notes: 'Internal notes'
          }
        }
      }

      const options: SerializerOptions = {
        includedFields: ['name', 'metadata.author']
      }

      const result = serializer.serialize(doc, options)

      expect(result.text).toContain('Document')
      expect(result.text).toContain('Alice')
      expect(result.text).not.toContain('5')
      expect(result.text).not.toContain('Internal notes')
    })

    it('should support dot notation for nested field exclusion', () => {
      const doc = {
        _id: '4',
        title: 'Article',
        content: 'Main content',
        meta: {
          views: 1000,
          secret: 'hidden'
        }
      }

      const options: SerializerOptions = {
        excludedFields: ['meta.secret']
      }

      const result = serializer.serialize(doc, options)

      expect(result.text).toContain('Article')
      expect(result.text).toContain('Main content')
      expect(result.text).toContain('1000')
      expect(result.text).not.toContain('hidden')
    })

    it('should always exclude _id from text content', () => {
      const doc = {
        _id: 'sensitive-id-123',
        title: 'Test'
      }

      const result = serializer.serialize(doc)

      expect(result.text).not.toContain('sensitive-id-123')
      expect(result.documentId).toBe('sensitive-id-123')
    })

    it('should handle includedFields with wildcard for nested objects', () => {
      const doc = {
        _id: '5',
        title: 'Main',
        details: {
          a: 'value a',
          b: 'value b',
          c: 'value c'
        },
        other: 'excluded'
      }

      const options: SerializerOptions = {
        includedFields: ['title', 'details.*']
      }

      const result = serializer.serialize(doc, options)

      expect(result.text).toContain('Main')
      expect(result.text).toContain('value a')
      expect(result.text).toContain('value b')
      expect(result.text).toContain('value c')
      expect(result.text).not.toContain('excluded')
    })
  })

  // ============================================================================
  // Custom Separator
  // ============================================================================

  describe('custom separator', () => {
    it('should use default space separator', () => {
      const doc = {
        _id: '1',
        field1: 'value1',
        field2: 'value2'
      }

      const result = serializer.serialize(doc)

      expect(result.text).toBe('value1 value2')
    })

    it('should use custom separator when provided', () => {
      const doc = {
        _id: '2',
        field1: 'value1',
        field2: 'value2'
      }

      const options: SerializerOptions = {
        separator: ' | '
      }

      const result = serializer.serialize(doc, options)

      expect(result.text).toBe('value1 | value2')
    })

    it('should use newline separator', () => {
      const doc = {
        _id: '3',
        title: 'Title',
        body: 'Body content'
      }

      const options: SerializerOptions = {
        separator: '\n'
      }

      const result = serializer.serialize(doc, options)

      expect(result.text).toBe('Title\nBody content')
    })
  })

  // ============================================================================
  // Metadata Extraction
  // ============================================================================

  describe('metadata extraction', () => {
    it('should extract metadata fields for vector storage', () => {
      const doc = {
        _id: '1',
        title: 'Test Document',
        category: 'tech',
        priority: 5
      }

      const options: SerializerOptions = {
        metadataFields: ['category', 'priority']
      }

      const result = serializer.serialize(doc, options)

      expect(result.metadata).toBeDefined()
      expect(result.metadata?.category).toBe('tech')
      expect(result.metadata?.priority).toBe(5)
    })

    it('should handle missing metadata fields gracefully', () => {
      const doc = {
        _id: '2',
        title: 'Test',
        existingField: 'value'
      }

      const options: SerializerOptions = {
        metadataFields: ['existingField', 'missingField']
      }

      const result = serializer.serialize(doc, options)

      expect(result.metadata?.existingField).toBe('value')
      expect(result.metadata?.missingField).toBeUndefined()
    })

    it('should extract nested metadata fields', () => {
      const doc = {
        _id: '3',
        content: 'text',
        info: {
          author: 'Jane',
          year: 2024
        }
      }

      const options: SerializerOptions = {
        metadataFields: ['info.author', 'info.year']
      }

      const result = serializer.serialize(doc, options)

      expect(result.metadata?.['info.author']).toBe('Jane')
      expect(result.metadata?.['info.year']).toBe(2024)
    })

    it('should convert array metadata to string arrays', () => {
      const doc = {
        _id: '4',
        title: 'Tagged',
        tags: ['a', 'b', 'c']
      }

      const options: SerializerOptions = {
        metadataFields: ['tags']
      }

      const result = serializer.serialize(doc, options)

      expect(result.metadata?.tags).toEqual(['a', 'b', 'c'])
    })
  })

  // ============================================================================
  // Batch Serialization
  // ============================================================================

  describe('batch serialization', () => {
    it('should serialize multiple documents', () => {
      const docs = [
        { _id: '1', title: 'First' },
        { _id: '2', title: 'Second' },
        { _id: '3', title: 'Third' }
      ]

      const results = serializer.serializeBatch(docs)

      expect(results).toHaveLength(3)
      expect(results[0].documentId).toBe('1')
      expect(results[0].text).toBe('First')
      expect(results[1].documentId).toBe('2')
      expect(results[2].documentId).toBe('3')
    })

    it('should apply options to all documents in batch', () => {
      const docs = [
        { _id: '1', title: 'Title 1', secret: 'hide1' },
        { _id: '2', title: 'Title 2', secret: 'hide2' }
      ]

      const options: SerializerOptions = {
        excludedFields: ['secret']
      }

      const results = serializer.serializeBatch(docs, options)

      expect(results[0].text).not.toContain('hide1')
      expect(results[1].text).not.toContain('hide2')
    })

    it('should handle empty batch', () => {
      const results = serializer.serializeBatch([])

      expect(results).toHaveLength(0)
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle Date objects', () => {
      const doc = {
        _id: '1',
        title: 'Event',
        date: new Date('2024-01-15T10:00:00Z')
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('Event')
      expect(result.text).toContain('2024')
    })

    it('should handle special characters in text', () => {
      const doc = {
        _id: '2',
        content: 'Special chars: <>&"\' and unicode: \u00e9\u00e0\u00fc'
      }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('<>&"\'')
      expect(result.text).toContain('\u00e9\u00e0\u00fc')
    })

    it('should handle very long text fields', () => {
      const longText = 'word '.repeat(10000)
      const doc = {
        _id: '3',
        content: longText
      }

      const result = serializer.serialize(doc)

      expect(result.text.length).toBeGreaterThan(0)
    })

    it('should handle circular reference protection (nested same object)', () => {
      const doc = {
        _id: '4',
        title: 'Test',
        nested: {} as Record<string, unknown>
      }
      // Creating a structure that could cause issues but isn't truly circular
      doc.nested = { ref: { title: 'inner' } }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('Test')
      expect(result.text).toContain('inner')
    })

    it('should handle documents with only _id', () => {
      const doc = { _id: 'only-id' }

      const result = serializer.serialize(doc)

      expect(result.text).toBe('')
      expect(result.documentId).toBe('only-id')
    })

    it('should skip embedding/vector fields by default', () => {
      const doc = {
        _id: '5',
        title: 'Document',
        embedding: [0.1, 0.2, 0.3, 0.4],
        vector: [0.5, 0.6, 0.7, 0.8],
        content_embedding: [0.9, 1.0]
      }

      const result = serializer.serialize(doc)

      expect(result.text).toBe('Document')
      expect(result.text).not.toContain('0.1')
      expect(result.text).not.toContain('0.5')
    })
  })

  // ============================================================================
  // Max Depth Configuration
  // ============================================================================

  describe('max depth configuration', () => {
    it('should respect maxDepth option', () => {
      const doc = {
        _id: '1',
        level1: {
          level2: {
            level3: {
              level4: 'deep value'
            }
          }
        }
      }

      const options: SerializerOptions = {
        maxDepth: 2
      }

      const result = serializer.serialize(doc, options)

      // Should not include content beyond depth 2
      expect(result.text).not.toContain('deep value')
    })

    it('should use default maxDepth of 10', () => {
      let nested: Record<string, unknown> = { value: 'found' }
      for (let i = 0; i < 8; i++) {
        nested = { inner: nested }
      }
      const doc = { _id: '2', deep: nested }

      const result = serializer.serialize(doc)

      expect(result.text).toContain('found')
    })
  })

  // ============================================================================
  // Field Ordering
  // ============================================================================

  describe('field ordering', () => {
    it('should serialize fields in specified order when fieldOrder provided', () => {
      const doc = {
        _id: '1',
        z_field: 'z',
        a_field: 'a',
        m_field: 'm'
      }

      const options: SerializerOptions = {
        fieldOrder: ['a_field', 'm_field', 'z_field']
      }

      const result = serializer.serialize(doc, options)

      const aIndex = result.text.indexOf('a')
      const mIndex = result.text.indexOf('m')
      const zIndex = result.text.indexOf('z')

      expect(aIndex).toBeLessThan(mIndex)
      expect(mIndex).toBeLessThan(zIndex)
    })
  })
})
