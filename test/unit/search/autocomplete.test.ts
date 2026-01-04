import { describe, it, expect } from 'vitest';
import { SearchTranslator } from '../../../src/translator/search-translator';

describe('autocomplete operator', () => {
  const translator = new SearchTranslator();

  it('should translate autocomplete to FTS5 prefix query', () => {
    const result = translator.translateSearch({
      autocomplete: { query: 'mach', path: 'title' }
    }, 'articles');

    // FTS5 prefix matching uses * suffix
    expect(result.ftsMatch).toBe('title:mach*');
  });

  it('should handle multiple autocomplete terms', () => {
    const result = translator.translateSearch({
      autocomplete: { query: 'mach learn', path: 'content' }
    }, 'articles');

    expect(result.ftsMatch).toContain('mach*');
    expect(result.ftsMatch).toContain('learn*');
  });

  it('should support tokenOrder sequential', () => {
    const result = translator.translateSearch({
      autocomplete: {
        query: 'new york',
        path: 'city',
        tokenOrder: 'sequential'
      }
    }, 'places');

    // Sequential requires phrase-like matching
    expect(result.ftsMatch).toContain('new*');
  });

  it('should support fuzzy autocomplete', () => {
    const result = translator.translateSearch({
      autocomplete: {
        query: 'machin',
        path: 'title',
        fuzzy: { maxEdits: 1 }
      }
    }, 'articles');

    expect(result.ftsMatch).toBeDefined();
  });

  it('should handle autocomplete without path', () => {
    const result = translator.translateSearch({
      autocomplete: { query: 'test' }
    }, 'articles');

    expect(result.ftsMatch).toBe('test*');
  });

  it('should handle array of paths', () => {
    const result = translator.translateSearch({
      autocomplete: { query: 'hello', path: ['title', 'content'] }
    }, 'articles');

    // Should search in first path or create OR expression
    expect(result.ftsMatch).toContain('hello*');
  });
});
