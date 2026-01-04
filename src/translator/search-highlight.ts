/**
 * Search Highlight and Snippet utilities for FTS5
 *
 * FTS5 provides built-in functions for highlighting search results:
 * - highlight(fts_table, column_index, start_tag, end_tag): Wraps matching terms
 * - snippet(fts_table, column_index, start, end, ellipsis, tokens): Returns context around matches
 *
 * @see https://www.sqlite.org/fts5.html#the_highlight_function
 * @see https://www.sqlite.org/fts5.html#the_snippet_function
 */

export interface HighlightOptions {
  /** The path/column to highlight */
  path: string;
  /** Column index in FTS table (default: 0) */
  columnIndex?: number;
  /** Opening tag for highlighted terms (default: '<b>') */
  startTag?: string;
  /** Closing tag for highlighted terms (default: '</b>') */
  endTag?: string;
}

export interface SnippetOptions {
  /** The path/column to extract snippet from */
  path: string;
  /** Column index in FTS table (default: 0) */
  columnIndex?: number;
  /** Opening tag for highlighted terms (default: '<b>') */
  startTag?: string;
  /** Closing tag for highlighted terms (default: '</b>') */
  endTag?: string;
  /** String to show for truncated text (default: '...') */
  ellipsis?: string;
  /** Maximum number of tokens to return (default: 10) */
  maxTokens?: number;
  /** Maximum characters to examine for snippets (informational, not directly used by FTS5) */
  maxCharsToExamine?: number;
}

/**
 * Build a FTS5 highlight() function call for highlighting matching terms
 *
 * @param ftsTable The FTS5 table name
 * @param options Highlight options
 * @returns SQL expression for highlight function
 *
 * @example
 * buildHighlightSQL('articles_fts', { path: 'content', startTag: '<em>', endTag: '</em>' })
 * // Returns: "highlight(articles_fts, 0, '<em>', '</em>')"
 */
export function buildHighlightSQL(ftsTable: string, options: HighlightOptions): string {
  const {
    columnIndex = 0,
    startTag = '<b>',
    endTag = '</b>'
  } = options;

  // FTS5 highlight function: highlight(fts_table, column_index, start_tag, end_tag)
  return `highlight(${ftsTable}, ${columnIndex}, '${escapeSQL(startTag)}', '${escapeSQL(endTag)}')`;
}

/**
 * Build a FTS5 snippet() function call for extracting text snippets with context
 *
 * @param ftsTable The FTS5 table name
 * @param options Snippet options
 * @returns SQL expression for snippet function
 *
 * @example
 * buildSnippetSQL('articles_fts', { path: 'content', maxTokens: 20, ellipsis: '...' })
 * // Returns: "snippet(articles_fts, 0, '<b>', '</b>', '...', 20)"
 */
export function buildSnippetSQL(ftsTable: string, options: SnippetOptions): string {
  const {
    columnIndex = 0,
    startTag = '<b>',
    endTag = '</b>',
    ellipsis = '...',
    maxTokens = 10
  } = options;

  // FTS5 snippet function: snippet(fts_table, column_index, start, end, ellipsis, tokens)
  return `snippet(${ftsTable}, ${columnIndex}, '${escapeSQL(startTag)}', '${escapeSQL(endTag)}', '${escapeSQL(ellipsis)}', ${maxTokens})`;
}

/**
 * Escape single quotes in SQL strings
 */
function escapeSQL(str: string): string {
  return str.replace(/'/g, "''");
}

/**
 * Build a complete SELECT clause with highlight for search results
 *
 * @param ftsTable The FTS5 table name
 * @param columns Array of columns to select with their highlight options
 * @returns SQL SELECT clause
 */
export function buildHighlightSelectClause(
  ftsTable: string,
  columns: Array<{ name: string; highlight?: HighlightOptions }>
): string {
  const selectParts = columns.map((col) => {
    if (col.highlight) {
      const highlightExpr = buildHighlightSQL(ftsTable, col.highlight);
      return `${highlightExpr} AS ${col.name}_highlighted`;
    }
    return col.name;
  });

  return selectParts.join(', ');
}

/**
 * Build a complete SELECT clause with snippets for search results
 *
 * @param ftsTable The FTS5 table name
 * @param columns Array of columns to select with their snippet options
 * @returns SQL SELECT clause
 */
export function buildSnippetSelectClause(
  ftsTable: string,
  columns: Array<{ name: string; snippet?: SnippetOptions }>
): string {
  const selectParts = columns.map((col) => {
    if (col.snippet) {
      const snippetExpr = buildSnippetSQL(ftsTable, col.snippet);
      return `${snippetExpr} AS ${col.name}_snippet`;
    }
    return col.name;
  });

  return selectParts.join(', ');
}
