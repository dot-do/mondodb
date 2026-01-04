import { describe, it, expect } from 'vitest';
import { translateSearchStage } from '../../../src/translator/stages/search-stage';
import type { StageContext } from '../../../src/translator/stages/types';

describe('$search aggregation stage', () => {
  const baseContext: StageContext = {
    collection: 'articles',
    cteIndex: 0,
    existingParams: [],
  };

  describe('basic text search', () => {
    it('should translate $search with text operator', () => {
      const result = translateSearchStage(
        {
          text: {
            query: 'database',
            path: 'content',
          },
        },
        baseContext
      );

      expect(result.ftsJoin).toBeDefined();
      expect(result.ftsMatch).toBe('content:database');
      expect(result.params).toBeDefined();
    });

    it('should translate $search with multiple terms', () => {
      const result = translateSearchStage(
        {
          text: {
            query: 'mongodb database',
            path: 'content',
          },
        },
        baseContext
      );

      expect(result.ftsMatch).toBe('content:mongodb content:database');
    });

    it('should handle text search without path', () => {
      const result = translateSearchStage(
        {
          text: {
            query: 'hello',
          },
        },
        baseContext
      );

      expect(result.ftsMatch).toBe('hello');
    });
  });

  describe('phrase search', () => {
    it('should translate phrase operator', () => {
      const result = translateSearchStage(
        {
          phrase: {
            query: 'full text search',
            path: 'title',
          },
        },
        baseContext
      );

      expect(result.ftsMatch).toBe('title:"full text search"');
    });
  });

  describe('wildcard search', () => {
    it('should translate wildcard operator', () => {
      const result = translateSearchStage(
        {
          wildcard: {
            query: 'data*',
            path: 'content',
          },
        },
        baseContext
      );

      expect(result.ftsMatch).toBe('content:data*');
    });
  });

  describe('compound search', () => {
    it('should translate compound must (AND)', () => {
      const result = translateSearchStage(
        {
          compound: {
            must: [
              { text: { query: 'mongodb', path: 'title' } },
              { text: { query: 'database', path: 'content' } },
            ],
          },
        },
        baseContext
      );

      expect(result.ftsMatch).toContain('AND');
      expect(result.ftsMatch).toContain('title:mongodb');
      expect(result.ftsMatch).toContain('content:database');
    });

    it('should translate compound should (OR)', () => {
      const result = translateSearchStage(
        {
          compound: {
            should: [
              { text: { query: 'mongodb' } },
              { text: { query: 'postgresql' } },
            ],
          },
        },
        baseContext
      );

      expect(result.ftsMatch).toContain('OR');
    });

    it('should translate compound mustNot (NOT)', () => {
      const result = translateSearchStage(
        {
          compound: {
            must: [{ text: { query: 'database' } }],
            mustNot: [{ text: { query: 'deprecated' } }],
          },
        },
        baseContext
      );

      expect(result.ftsMatch).toContain('NOT');
    });
  });

  describe('search with index option', () => {
    it('should support index option for named search indexes', () => {
      const result = translateSearchStage(
        {
          index: 'default',
          text: {
            query: 'hello',
            path: 'content',
          },
        },
        baseContext
      );

      expect(result.ftsMatch).toBeDefined();
    });
  });

  describe('search score', () => {
    it('should include score in result when requested', () => {
      const result = translateSearchStage(
        {
          text: {
            query: 'database',
            path: 'content',
          },
        },
        { ...baseContext, includeScore: true }
      );

      expect(result.selectClause).toContain('bm25');
    });
  });

  describe('FTS table naming', () => {
    it('should use collection name for FTS table', () => {
      const result = translateSearchStage(
        {
          text: {
            query: 'test',
          },
        },
        { ...baseContext, collection: 'products' }
      );

      expect(result.ftsTable).toBe('products_fts');
    });
  });
});
