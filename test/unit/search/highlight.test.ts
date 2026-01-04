import { describe, it, expect } from 'vitest';
import { buildHighlightSQL, buildSnippetSQL } from '../../../src/translator/search-highlight';

describe('search highlight', () => {
  it('should build FTS5 highlight function call', () => {
    const sql = buildHighlightSQL('articles_fts', {
      path: 'content',
      startTag: '<em>',
      endTag: '</em>'
    });

    expect(sql).toContain("highlight(articles_fts");
    expect(sql).toContain("'<em>'");
    expect(sql).toContain("'</em>'");
  });

  it('should use default tags when not specified', () => {
    const sql = buildHighlightSQL('articles_fts', {
      path: 'title'
    });

    expect(sql).toContain("highlight(articles_fts");
    // Default tags
    expect(sql).toContain("'<b>'");
    expect(sql).toContain("'</b>'");
  });

  it('should handle column index for specific path', () => {
    const sql = buildHighlightSQL('articles_fts', {
      path: 'content',
      columnIndex: 1
    });

    // highlight(fts_table, column_index, start_tag, end_tag)
    expect(sql).toContain("highlight(articles_fts, 1,");
  });
});

describe('search snippet', () => {
  it('should build FTS5 snippet function call', () => {
    const sql = buildSnippetSQL('articles_fts', {
      path: 'content',
      maxCharsToExamine: 200,
      ellipsis: '...'
    });

    expect(sql).toContain("snippet(articles_fts");
  });

  it('should include ellipsis in snippet call', () => {
    const sql = buildSnippetSQL('articles_fts', {
      path: 'content',
      ellipsis: '***'
    });

    expect(sql).toContain("'***'");
  });

  it('should use default values when not specified', () => {
    const sql = buildSnippetSQL('articles_fts', {
      path: 'content'
    });

    expect(sql).toContain("snippet(articles_fts");
    // Default ellipsis
    expect(sql).toContain("'...'");
  });

  it('should support custom token count', () => {
    const sql = buildSnippetSQL('articles_fts', {
      path: 'content',
      maxTokens: 20
    });

    // snippet(fts_table, column_index, start, end, ellipsis, tokens)
    expect(sql).toContain("20");
  });

  it('should support custom start and end tags', () => {
    const sql = buildSnippetSQL('articles_fts', {
      path: 'content',
      startTag: '<mark>',
      endTag: '</mark>'
    });

    expect(sql).toContain("'<mark>'");
    expect(sql).toContain("'</mark>'");
  });
});
