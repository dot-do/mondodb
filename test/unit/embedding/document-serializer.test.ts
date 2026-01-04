import { describe, it, expect, beforeEach } from 'vitest';
import {
  serializeForEmbedding,
  serializeDocument,
  serializeDocuments,
  DocumentSerializer,
  type SerializationOptions
} from '../../../src/embedding/document-serializer';

describe('serializeForEmbedding', () => {
  it('should serialize document to YAML by default', () => {
    const doc = { title: 'Hello', content: 'World' };
    const result = serializeForEmbedding(doc, { serializer: 'yaml' });
    expect(result).toContain('title: Hello');
    expect(result).toContain('content: World');
  });

  it('should serialize to JSON when configured', () => {
    const doc = { title: 'Hello' };
    const result = serializeForEmbedding(doc, { serializer: 'json' });
    expect(JSON.parse(result)).toEqual({ title: 'Hello' });
  });

  it('should exclude _id by default', () => {
    const doc = { _id: '123', title: 'Hello' };
    const result = serializeForEmbedding(doc, {});
    expect(result).not.toContain('_id');
  });

  it('should exclude fields ending in Id', () => {
    const doc = { userId: '456', title: 'Hello' };
    const result = serializeForEmbedding(doc, {});
    expect(result).not.toContain('userId');
  });

  it('should exclude timestamps by default', () => {
    const doc = { title: 'Hello', createdAt: new Date(), updatedAt: new Date() };
    const result = serializeForEmbedding(doc, {});
    expect(result).not.toContain('createdAt');
  });

  it('should handle nested objects up to maxDepth', () => {
    const doc = { level1: { level2: { level3: { level4: 'deep' } } } };
    const result = serializeForEmbedding(doc, { auto: { maxDepth: 2 } });
    expect(result).toContain('level1');
    expect(result).not.toContain('level3');
  });

  it('should extract text from document', () => {
    const doc = { title: 'Hello', items: ['a', 'b'] };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toContain('Hello');
    expect(result).toContain('a');
  });

  it('should exclude embedding/vector fields by default', () => {
    const doc = {
      title: 'Document',
      embedding: [0.1, 0.2, 0.3, 0.4],
      vector: [0.5, 0.6, 0.7, 0.8],
      content_embedding: [0.9, 1.0]
    };
    const result = serializeForEmbedding(doc, { serializer: 'yaml' });
    expect(result).toContain('title');
    expect(result).not.toContain('embedding');
    expect(result).not.toContain('vector');
  });

  it('should handle boolean fields', () => {
    const doc = { name: 'Item', inStock: true, discontinued: false };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toContain('Item');
    expect(result).toContain('true');
    expect(result).toContain('false');
  });

  it('should serialize number fields as strings in text mode', () => {
    const doc = { name: 'Product', price: 29.99, quantity: 100 };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toContain('Product');
    expect(result).toContain('29.99');
    expect(result).toContain('100');
  });

  it('should handle empty document', () => {
    const doc = { _id: 'empty' };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toBe('');
  });
});

describe('serializeDocument', () => {
  it('should return SerializedDocument with documentId and text', () => {
    const doc = { _id: '123', title: 'Hello World', description: 'A simple test' };
    const result = serializeDocument(doc, { serializer: 'text' });
    expect(result.documentId).toBe('123');
    expect(result.text).toContain('Hello World');
    expect(result.text).toContain('A simple test');
  });

  it('should handle ObjectId-like toString method', () => {
    const doc = {
      _id: { toString: () => 'objectid123' },
      content: 'test'
    };
    const result = serializeDocument(doc, { serializer: 'text' });
    expect(result.documentId).toBe('objectid123');
  });

  it('should extract metadata fields when specified', () => {
    const doc = {
      _id: '1',
      title: 'Test Document',
      category: 'tech',
      priority: 5
    };
    const options: SerializationOptions = {
      serializer: 'text',
      auto: { metadataFields: ['category', 'priority'] }
    };
    const result = serializeDocument(doc, options);
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.category).toBe('tech');
    expect(result.metadata?.priority).toBe(5);
  });

  it('should handle missing metadata fields gracefully', () => {
    const doc = { _id: '2', title: 'Test', existingField: 'value' };
    const options: SerializationOptions = {
      serializer: 'text',
      auto: { metadataFields: ['existingField', 'missingField'] }
    };
    const result = serializeDocument(doc, options);
    expect(result.metadata?.existingField).toBe('value');
    expect(result.metadata?.missingField).toBeUndefined();
  });

  it('should extract nested metadata fields using dot notation', () => {
    const doc = {
      _id: '3',
      content: 'text',
      info: { author: 'Jane', year: 2024 }
    };
    const options: SerializationOptions = {
      serializer: 'text',
      auto: { metadataFields: ['info.author', 'info.year'] }
    };
    const result = serializeDocument(doc, options);
    expect(result.metadata?.['info.author']).toBe('Jane');
    expect(result.metadata?.['info.year']).toBe(2024);
  });

  it('should convert array metadata to string arrays', () => {
    const doc = { _id: '4', title: 'Tagged', tags: ['a', 'b', 'c'] };
    const options: SerializationOptions = {
      serializer: 'text',
      auto: { metadataFields: ['tags'] }
    };
    const result = serializeDocument(doc, options);
    expect(result.metadata?.tags).toEqual(['a', 'b', 'c']);
  });

  it('should handle document with no _id', () => {
    const doc = { title: 'No ID' };
    const result = serializeDocument(doc, { serializer: 'text' });
    expect(result.documentId).toBe('');
    expect(result.text).toContain('No ID');
  });
});

describe('serializeDocuments', () => {
  it('should serialize multiple documents', () => {
    const docs = [
      { _id: '1', title: 'First' },
      { _id: '2', title: 'Second' },
      { _id: '3', title: 'Third' }
    ];
    const results = serializeDocuments(docs, { serializer: 'text' });
    expect(results).toHaveLength(3);
    expect(results[0].documentId).toBe('1');
    expect(results[0].text).toContain('First');
    expect(results[1].documentId).toBe('2');
    expect(results[2].documentId).toBe('3');
  });

  it('should apply options to all documents in batch', () => {
    const docs = [
      { _id: '1', title: 'Title 1', category: 'cat1' },
      { _id: '2', title: 'Title 2', category: 'cat2' }
    ];
    const options: SerializationOptions = {
      serializer: 'text',
      auto: { metadataFields: ['category'] }
    };
    const results = serializeDocuments(docs, options);
    expect(results[0].metadata?.category).toBe('cat1');
    expect(results[1].metadata?.category).toBe('cat2');
  });

  it('should handle empty batch', () => {
    const results = serializeDocuments([], { serializer: 'text' });
    expect(results).toHaveLength(0);
  });
});

describe('DocumentSerializer class', () => {
  let serializer: DocumentSerializer;

  beforeEach(() => {
    serializer = new DocumentSerializer({ serializer: 'text' });
  });

  it('should serialize a document using instance options', () => {
    const doc = { _id: '123', title: 'Hello World' };
    const result = serializer.serialize(doc);
    expect(result.documentId).toBe('123');
    expect(result.text).toContain('Hello World');
  });

  it('should allow override options per call', () => {
    const doc = { _id: '1', title: 'Test', body: 'Content' };
    const result = serializer.serialize(doc, { serializer: 'json' });
    expect(JSON.parse(result.text)).toEqual({ title: 'Test', body: 'Content' });
  });

  it('should batch serialize documents', () => {
    const docs = [
      { _id: '1', title: 'First' },
      { _id: '2', title: 'Second' }
    ];
    const results = serializer.serializeBatch(docs);
    expect(results).toHaveLength(2);
    expect(results[0].documentId).toBe('1');
    expect(results[1].documentId).toBe('2');
  });

  it('should provide serializeToText for simple API', () => {
    const doc = { title: 'Hello', description: 'World' };
    const text = serializer.serializeToText(doc);
    expect(text).toContain('Hello');
    expect(text).toContain('World');
  });
});

describe('field selection', () => {
  it('should only serialize specified fields when includeFields provided', () => {
    const doc = {
      title: 'Important Title',
      description: 'Important Description',
      internalCode: 'ABC123',
      secretField: 'should not appear'
    };
    const options: SerializationOptions = {
      serializer: 'text',
      auto: { includeFields: ['title', 'description'] }
    };
    const result = serializeForEmbedding(doc, options);
    expect(result).toContain('Important Title');
    expect(result).toContain('Important Description');
    expect(result).not.toContain('ABC123');
    expect(result).not.toContain('should not appear');
  });

  it('should exclude specified fields when excludeFields provided', () => {
    const doc = {
      title: 'Public Title',
      content: 'Public Content',
      password: 'secret123',
      apiKey: 'key456'
    };
    const options: SerializationOptions = {
      serializer: 'text',
      auto: { excludeFields: ['password', 'apiKey'] }
    };
    const result = serializeForEmbedding(doc, options);
    expect(result).toContain('Public Title');
    expect(result).toContain('Public Content');
    expect(result).not.toContain('secret123');
    expect(result).not.toContain('key456');
  });
});

describe('nested fields', () => {
  it('should serialize nested object fields', () => {
    const doc = {
      title: 'Main Title',
      metadata: { author: 'John Doe', category: 'Technology' }
    };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toContain('Main Title');
    expect(result).toContain('John Doe');
    expect(result).toContain('Technology');
  });

  it('should serialize deeply nested objects within maxDepth', () => {
    const doc = {
      article: {
        content: { text: 'Deep nested content' }
      }
    };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toContain('Deep nested content');
  });

  it('should truncate objects beyond maxDepth', () => {
    const doc = {
      level1: {
        level2: { level3: { level4: { level5: 'too deep' } } }
      }
    };
    // Default maxDepth is 3, so level4 and level5 should be truncated
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).not.toContain('too deep');
  });

  it('should allow custom maxDepth for deep nesting', () => {
    const doc = {
      article: {
        content: { body: { text: 'Deep nested content' } }
      }
    };
    const result = serializeForEmbedding(doc, {
      serializer: 'text',
      auto: { maxDepth: 5 }
    });
    expect(result).toContain('Deep nested content');
  });
});

describe('array handling', () => {
  it('should serialize string arrays', () => {
    const doc = { title: 'Tagged Document', tags: ['javascript', 'typescript', 'nodejs'] };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toContain('Tagged Document');
    expect(result).toContain('javascript');
    expect(result).toContain('typescript');
    expect(result).toContain('nodejs');
  });

  it('should serialize array of objects', () => {
    const doc = {
      name: 'Recipe',
      ingredients: [
        { name: 'flour', amount: '2 cups' },
        { name: 'sugar', amount: '1 cup' }
      ]
    };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toContain('Recipe');
    expect(result).toContain('flour');
    expect(result).toContain('2 cups');
    expect(result).toContain('sugar');
    expect(result).toContain('1 cup');
  });

  it('should handle empty arrays', () => {
    const doc = { title: 'Empty List', items: [] };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toBe('Empty List');
  });

  it('should serialize number arrays', () => {
    const doc = { scores: [95, 87, 92] };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toContain('95');
    expect(result).toContain('87');
    expect(result).toContain('92');
  });
});

describe('edge cases', () => {
  it('should handle Date objects', () => {
    const doc = { title: 'Event', date: new Date('2024-01-15T10:00:00Z') };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toContain('Event');
    expect(result).toContain('2024');
  });

  it('should handle special characters in text', () => {
    const doc = { content: 'Special chars: <>&"\' and unicode: \u00e9\u00e0\u00fc' };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toContain('<>&"\'');
    expect(result).toContain('\u00e9\u00e0\u00fc');
  });

  it('should handle very long text fields', () => {
    const longText = 'word '.repeat(10000);
    const doc = { content: longText };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result.length).toBeGreaterThan(0);
  });

  it('should exclude null and undefined values', () => {
    const doc = { title: 'Test', nullField: null, undefinedField: undefined };
    const result = serializeForEmbedding(doc, { serializer: 'text' });
    expect(result).toBe('Test');
    expect(result).not.toContain('null');
    expect(result).not.toContain('undefined');
  });
});

describe('custom separator', () => {
  it('should use custom separator when provided in text mode', () => {
    const doc = { field1: 'value1', field2: 'value2' };
    const options: SerializationOptions = {
      serializer: 'text',
      auto: { separator: ' | ' }
    };
    const result = serializeForEmbedding(doc, options);
    expect(result).toBe('value1 | value2');
  });

  it('should use newline separator', () => {
    const doc = { title: 'Title', body: 'Body content' };
    const options: SerializationOptions = {
      serializer: 'text',
      auto: { separator: '\n' }
    };
    const result = serializeForEmbedding(doc, options);
    expect(result).toBe('Title\nBody content');
  });
});
