import { describe, it, expect } from 'vitest';
import { serializeForEmbedding } from '../../../src/embedding/document-serializer';

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
});
