import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingManager, EmbeddingConfig } from '../../../src/embedding/embedding-manager';
import type { VectorizeIndex, Ai, EmbeddingResult } from '../../../src/types/vectorize';

// Mock Vectorize index
function createMockVectorize(): VectorizeIndex {
  return {
    query: vi.fn().mockResolvedValue({ count: 0, matches: [] }),
    insert: vi.fn().mockResolvedValue({ count: 1, ids: ['test-id'] }),
    upsert: vi.fn().mockResolvedValue({ count: 1, ids: ['test-id'] }),
    deleteByIds: vi.fn().mockResolvedValue({ count: 1, ids: ['test-id'] }),
    getByIds: vi.fn().mockResolvedValue([]),
    describe: vi.fn().mockResolvedValue({
      dimensions: 1024,
      vectorsCount: 0,
      config: { dimensions: 1024, metric: 'cosine' }
    })
  };
}

// Mock AI binding
function createMockAi(): Ai {
  return {
    run: vi.fn().mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]],
      shape: [1, 5]
    } as EmbeddingResult)
  };
}

describe('Collection Embedding Hooks', () => {
  let mockVectorize: VectorizeIndex;
  let mockAi: Ai;
  let manager: EmbeddingManager;

  beforeEach(() => {
    mockVectorize = createMockVectorize();
    mockAi = createMockAi();
    manager = new EmbeddingManager({
      vectorize: mockVectorize,
      ai: mockAi,
      collection: 'test_collection'
    });
  });

  describe('Insert hooks', () => {
    it('should embed document on insertOne', async () => {
      const doc = { _id: 'doc1', title: 'Test', content: 'Hello World' };

      await manager.embedDocument(doc);

      expect(mockAi.run).toHaveBeenCalled();
      expect(mockVectorize.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'test_collection:doc1'
        })
      ]);
    });

    it('should embed multiple documents on insertMany', async () => {
      const docs = [
        { _id: 'doc1', title: 'Test 1' },
        { _id: 'doc2', title: 'Test 2' },
        { _id: 'doc3', title: 'Test 3' }
      ];

      (mockAi.run as any).mockResolvedValueOnce({
        data: [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
        shape: [3, 2]
      });

      await manager.embedDocuments(docs);

      expect(mockAi.run).toHaveBeenCalledWith(
        '@cf/baai/bge-m3',
        expect.objectContaining({ text: expect.any(Array) })
      );
      expect(mockVectorize.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'test_collection:doc1' }),
          expect.objectContaining({ id: 'test_collection:doc2' }),
          expect.objectContaining({ id: 'test_collection:doc3' })
        ])
      );
    });
  });

  describe('Update hooks', () => {
    it('should re-embed document on update', async () => {
      const doc = { _id: 'doc1', title: 'Updated Title', content: 'New content' };

      await manager.embedDocument(doc);

      // Upsert should be called (not insert) for update
      expect(mockVectorize.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'test_collection:doc1'
        })
      ]);
    });

    it('should re-embed document on replace', async () => {
      const doc = { _id: 'doc1', title: 'Replaced Document' };

      await manager.embedDocument(doc);

      expect(mockVectorize.upsert).toHaveBeenCalled();
    });
  });

  describe('Delete hooks', () => {
    it('should delete embedding on deleteOne', async () => {
      await manager.deleteDocument('doc1');

      expect(mockVectorize.deleteByIds).toHaveBeenCalledWith(['test_collection:doc1']);
    });

    it('should delete multiple embeddings on deleteMany', async () => {
      await manager.deleteDocuments(['doc1', 'doc2', 'doc3']);

      expect(mockVectorize.deleteByIds).toHaveBeenCalledWith([
        'test_collection:doc1',
        'test_collection:doc2',
        'test_collection:doc3'
      ]);
    });
  });

  describe('Configuration', () => {
    it('should respect serialization options', async () => {
      // Create fresh mocks for this test
      const localMockAi = createMockAi();
      const localMockVectorize = createMockVectorize();

      const customManager = new EmbeddingManager({
        vectorize: localMockVectorize,
        ai: localMockAi,
        collection: 'test_collection',
        serialization: {
          serializer: 'json',
          auto: {
            excludeFields: ['internal']
          }
        }
      });

      const doc = { _id: 'doc1', title: 'Test', internal: 'secret' };

      await customManager.embedDocument(doc);

      // Check that the AI was called with text that doesn't contain 'internal'
      const aiCall = (localMockAi.run as any).mock.calls[0];
      const textArg = aiCall[1].text[0];
      expect(textArg).not.toContain('internal');
    });

    it('should use custom model when specified', async () => {
      const customManager = new EmbeddingManager({
        vectorize: mockVectorize,
        ai: mockAi,
        collection: 'test_collection',
        model: '@cf/custom/embedding-model'
      });

      const doc = { _id: 'doc1', title: 'Test' };

      await customManager.embedDocument(doc);

      expect(mockAi.run).toHaveBeenCalledWith(
        '@cf/custom/embedding-model',
        expect.any(Object)
      );
    });
  });

  describe('Metadata handling', () => {
    it('should include collection and documentId in metadata', async () => {
      const doc = { _id: 'doc1', title: 'Test' };

      await manager.embedDocument(doc);

      expect(mockVectorize.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          metadata: expect.objectContaining({
            collection: 'test_collection',
            documentId: 'doc1'
          })
        })
      ]);
    });

    it('should include custom metadata', async () => {
      const doc = { _id: 'doc1', title: 'Test' };

      await manager.embedDocument(doc, {
        metadata: { category: 'test', priority: 1 }
      });

      expect(mockVectorize.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          metadata: expect.objectContaining({
            collection: 'test_collection',
            documentId: 'doc1',
            category: 'test',
            priority: 1
          })
        })
      ]);
    });
  });
});
