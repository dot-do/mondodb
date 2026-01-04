import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingManager, EmbeddingConfig } from '../../../src/embedding/embedding-manager';
import type { VectorizeIndex, Ai, VectorizeMutationResult, EmbeddingResult } from '../../../src/types/vectorize';

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

describe('EmbeddingManager', () => {
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

  describe('constructor', () => {
    it('should create an EmbeddingManager instance', () => {
      expect(manager).toBeInstanceOf(EmbeddingManager);
    });

    it('should use default model if not specified', () => {
      const config = manager.getConfig();
      expect(config.model).toBe('@cf/baai/bge-m3');
    });

    it('should use custom model if specified', () => {
      const customManager = new EmbeddingManager({
        vectorize: mockVectorize,
        ai: mockAi,
        collection: 'test',
        model: '@cf/custom/model'
      });
      expect(customManager.getConfig().model).toBe('@cf/custom/model');
    });
  });

  describe('embedDocument', () => {
    it('should serialize document and generate embedding', async () => {
      const doc = { _id: 'doc1', title: 'Hello', content: 'World' };

      await manager.embedDocument(doc);

      expect(mockAi.run).toHaveBeenCalledWith(
        '@cf/baai/bge-m3',
        expect.objectContaining({ text: expect.any(Array) })
      );
    });

    it('should upsert embedding to Vectorize', async () => {
      const doc = { _id: 'doc1', title: 'Hello' };

      await manager.embedDocument(doc);

      expect(mockVectorize.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: expect.stringContaining('doc1'),
          values: expect.any(Array)
        })
      ]);
    });

    it('should include collection in vector ID', async () => {
      const doc = { _id: 'doc1', title: 'Hello' };

      await manager.embedDocument(doc);

      expect(mockVectorize.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'test_collection:doc1'
        })
      ]);
    });

    it('should include metadata in vector', async () => {
      const doc = { _id: 'doc1', title: 'Hello', category: 'test' };

      await manager.embedDocument(doc, { metadata: { category: 'test' } });

      expect(mockVectorize.upsert).toHaveBeenCalledWith([
        expect.objectContaining({
          metadata: expect.objectContaining({ category: 'test' })
        })
      ]);
    });
  });

  describe('embedDocuments', () => {
    it('should batch embed multiple documents', async () => {
      const docs = [
        { _id: 'doc1', title: 'Hello' },
        { _id: 'doc2', title: 'World' }
      ];

      // Mock batch embedding response
      (mockAi.run as any).mockResolvedValueOnce({
        data: [[0.1, 0.2], [0.3, 0.4]],
        shape: [2, 2]
      });

      await manager.embedDocuments(docs);

      expect(mockAi.run).toHaveBeenCalledWith(
        '@cf/baai/bge-m3',
        expect.objectContaining({ text: expect.any(Array) })
      );
      expect(mockVectorize.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'test_collection:doc1' }),
          expect.objectContaining({ id: 'test_collection:doc2' })
        ])
      );
    });

    it('should handle empty document array', async () => {
      const result = await manager.embedDocuments([]);

      expect(mockAi.run).not.toHaveBeenCalled();
      expect(mockVectorize.upsert).not.toHaveBeenCalled();
      expect(result.count).toBe(0);
    });
  });

  describe('deleteDocument', () => {
    it('should delete embedding from Vectorize', async () => {
      await manager.deleteDocument('doc1');

      expect(mockVectorize.deleteByIds).toHaveBeenCalledWith(['test_collection:doc1']);
    });
  });

  describe('deleteDocuments', () => {
    it('should delete multiple embeddings', async () => {
      await manager.deleteDocuments(['doc1', 'doc2']);

      expect(mockVectorize.deleteByIds).toHaveBeenCalledWith([
        'test_collection:doc1',
        'test_collection:doc2'
      ]);
    });
  });

  describe('getVectorId', () => {
    it('should generate correct vector ID format', () => {
      const vectorId = manager.getVectorId('my-doc-id');
      expect(vectorId).toBe('test_collection:my-doc-id');
    });
  });

  describe('parseVectorId', () => {
    it('should parse vector ID into components', () => {
      const { collection, documentId } = manager.parseVectorId('test_collection:my-doc-id');
      expect(collection).toBe('test_collection');
      expect(documentId).toBe('my-doc-id');
    });

    it('should handle document IDs with colons', () => {
      const { collection, documentId } = manager.parseVectorId('test_collection:doc:with:colons');
      expect(collection).toBe('test_collection');
      expect(documentId).toBe('doc:with:colons');
    });
  });
});
