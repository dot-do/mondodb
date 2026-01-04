import { describe, it, expect } from 'vitest';
import { SearchTranslator } from '../../../src/translator/search-translator';

describe('SearchTranslator', () => {
  const translator = new SearchTranslator();

  describe('text operator', () => {
    it('should translate basic text search', () => {
      const result = translator.translateSearch({
        text: { query: 'hello world', path: 'content' }
      }, 'articles');

      expect(result.ftsMatch).toBe('content:hello content:world');
    });

    it('should handle text search without path (all fields)', () => {
      const result = translator.translateSearch({
        text: { query: 'hello' }
      }, 'articles');

      expect(result.ftsMatch).toBe('hello');
    });
  });

  describe('phrase operator', () => {
    it('should translate phrase search', () => {
      const result = translator.translateSearch({
        phrase: { query: 'hello world', path: 'title' }
      }, 'articles');

      expect(result.ftsMatch).toBe('title:"hello world"');
    });
  });

  describe('wildcard operator', () => {
    it('should translate prefix wildcard', () => {
      const result = translator.translateSearch({
        wildcard: { query: 'data*', path: 'content' }
      }, 'articles');

      expect(result.ftsMatch).toBe('content:data*');
    });
  });

  describe('compound operator', () => {
    it('should translate must as AND', () => {
      const result = translator.translateSearch({
        compound: {
          must: [
            { text: { query: 'hello', path: 'title' } },
            { text: { query: 'world', path: 'content' } }
          ]
        }
      }, 'articles');

      expect(result.ftsMatch).toContain('AND');
    });

    it('should translate should as OR', () => {
      const result = translator.translateSearch({
        compound: {
          should: [
            { text: { query: 'hello' } },
            { text: { query: 'world' } }
          ]
        }
      }, 'articles');

      expect(result.ftsMatch).toContain('OR');
    });

    it('should translate mustNot as NOT', () => {
      const result = translator.translateSearch({
        compound: {
          must: [{ text: { query: 'hello' } }],
          mustNot: [{ text: { query: 'goodbye' } }]
        }
      }, 'articles');

      expect(result.ftsMatch).toContain('NOT');
    });
  });
});
