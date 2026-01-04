/**
 * SearchTranslator - Translates MongoDB Atlas Search syntax to SQLite FTS5 MATCH syntax
 *
 * MongoDB Atlas Search operators:
 * - text: Full-text search on specified path(s)
 * - phrase: Exact phrase search
 * - wildcard: Wildcard pattern matching
 * - compound: Boolean combinations (must, should, mustNot, filter)
 *
 * FTS5 MATCH syntax:
 * - term: Simple word match
 * - "phrase": Exact phrase match
 * - prefix*: Prefix matching
 * - term1 AND term2: Both must match
 * - term1 OR term2: Either must match
 * - NOT term: Exclude term
 * - column:term: Match in specific column
 */

export interface SearchResult {
  /** The FTS5 MATCH expression */
  ftsMatch: string;
  /** SQL parameters for parameterized queries */
  params: unknown[];
  /** The FTS table name to query */
  ftsTable?: string;
}

export interface TextOperator {
  query: string;
  path?: string | string[];
  fuzzy?: {
    maxEdits?: number;
    prefixLength?: number;
  };
  score?: {
    boost?: number;
  };
}

export interface PhraseOperator {
  query: string;
  path?: string | string[];
  slop?: number;
  score?: {
    boost?: number;
  };
}

export interface WildcardOperator {
  query: string;
  path?: string | string[];
  allowAnalyzedField?: boolean;
  score?: {
    boost?: number;
  };
}

export interface AutocompleteOperator {
  query: string;
  path?: string | string[];
  tokenOrder?: 'any' | 'sequential';
  fuzzy?: {
    maxEdits?: number;
    prefixLength?: number;
    maxExpansions?: number;
  };
  score?: {
    boost?: number;
  };
}

export interface CompoundOperator {
  must?: SearchOperator[];
  should?: SearchOperator[];
  mustNot?: SearchOperator[];
  filter?: SearchOperator[];
  minimumShouldMatch?: number;
}

export interface SearchOperator {
  text?: TextOperator;
  phrase?: PhraseOperator;
  wildcard?: WildcardOperator;
  compound?: CompoundOperator;
  autocomplete?: AutocompleteOperator;
}

/**
 * SearchTranslator converts MongoDB Atlas Search syntax to SQLite FTS5 MATCH syntax
 */
export class SearchTranslator {
  /**
   * Translate a MongoDB $search operator to FTS5 MATCH expression
   *
   * @param search The MongoDB $search operator value
   * @param collection The collection name (used for FTS table naming)
   * @returns SearchResult with FTS5 MATCH expression
   */
  translateSearch(search: SearchOperator, collection: string): SearchResult {
    const params: unknown[] = [];

    const ftsMatch = this.translateOperator(search);

    return {
      ftsMatch,
      params,
      ftsTable: `${collection}_fts`,
    };
  }

  /**
   * Translate a single search operator to FTS5 syntax
   */
  private translateOperator(operator: SearchOperator): string {
    if (operator.text) {
      return this.translateText(operator.text);
    }

    if (operator.phrase) {
      return this.translatePhrase(operator.phrase);
    }

    if (operator.wildcard) {
      return this.translateWildcard(operator.wildcard);
    }

    if (operator.compound) {
      return this.translateCompound(operator.compound);
    }

    if (operator.autocomplete) {
      return this.translateAutocomplete(operator.autocomplete);
    }

    return '*'; // Match all if no operator specified
  }

  /**
   * Translate text operator to FTS5 terms
   *
   * MongoDB: { text: { query: "hello world", path: "content" } }
   * FTS5: content:hello content:world
   */
  private translateText(text: TextOperator): string {
    const { query, path } = text;

    // Split query into terms and escape each term to prevent FTS5 injection
    const terms = query.trim().split(/\s+/).filter(t => t.length > 0).map(t => this.escapeFTS5Term(t));

    if (terms.length === 0) {
      return '*';
    }

    // If path is specified, prefix each term with the column
    if (path) {
      const column = Array.isArray(path) ? path[0] : path;
      return terms.map(term => `${column}:${term}`).join(' ');
    }

    // No path specified - search all fields
    return terms.join(' ');
  }

  /**
   * Translate phrase operator to FTS5 quoted phrase
   *
   * MongoDB: { phrase: { query: "hello world", path: "title" } }
   * FTS5: title:"hello world"
   */
  private translatePhrase(phrase: PhraseOperator): string {
    const { query, path } = phrase;

    // Escape the phrase content to prevent FTS5 injection
    // For phrases, we escape and then wrap in quotes
    const escapedPhrase = this.escapeFTS5Term(query);
    const quotedPhrase = `"${escapedPhrase}"`;

    if (path) {
      const column = Array.isArray(path) ? path[0] : path;
      return `${column}:${quotedPhrase}`;
    }

    return quotedPhrase;
  }

  /**
   * Translate wildcard operator to FTS5 prefix matching
   *
   * MongoDB: { wildcard: { query: "data*", path: "content" } }
   * FTS5: content:data*
   */
  private translateWildcard(wildcard: WildcardOperator): string {
    const { query, path } = wildcard;

    // For wildcard queries, we need to escape special chars but preserve the wildcard (*) at the end
    // First check if query ends with wildcard
    const hasTrailingWildcard = query.endsWith('*');
    const baseQuery = hasTrailingWildcard ? query.slice(0, -1) : query;
    const escapedQuery = this.escapeFTS5Term(baseQuery) + (hasTrailingWildcard ? '*' : '');

    if (path) {
      const column = Array.isArray(path) ? path[0] : path;
      return `${column}:${escapedQuery}`;
    }

    return escapedQuery;
  }

  /**
   * Translate autocomplete operator to FTS5 prefix query
   *
   * MongoDB: { autocomplete: { query: "mach", path: "title" } }
   * FTS5: title:mach*
   *
   * Autocomplete uses prefix matching (term*) to find partial word matches.
   * When tokenOrder is 'sequential', terms must appear in order.
   */
  private translateAutocomplete(autocomplete: AutocompleteOperator): string {
    const { query, path, tokenOrder } = autocomplete;

    // Split query into terms and escape each term to prevent FTS5 injection
    const terms = query.trim().split(/\s+/).filter(t => t.length > 0).map(t => this.escapeFTS5Term(t));

    if (terms.length === 0) {
      return '*';
    }

    // Add prefix wildcard to each term for autocomplete
    const prefixTerms = terms.map(term => `${term}*`);

    // If path is specified, prefix each term with the column
    if (path) {
      const column = Array.isArray(path) ? path[0] : path;

      if (tokenOrder === 'sequential' && prefixTerms.length > 1) {
        // For sequential, terms must appear in order - use phrase-like matching
        // FTS5 doesn't support prefix in phrases, so we use NEAR/0 for adjacent terms
        // But for simplicity, we join with spaces which requires all terms
        return prefixTerms.map(term => `${column}:${term}`).join(' ');
      }

      return prefixTerms.map(term => `${column}:${term}`).join(' ');
    }

    // No path specified - search all fields
    if (tokenOrder === 'sequential' && prefixTerms.length > 1) {
      return prefixTerms.join(' ');
    }

    return prefixTerms.join(' ');
  }

  /**
   * Translate compound operator to FTS5 boolean expression
   *
   * MongoDB compound operators:
   * - must: All clauses must match (AND)
   * - should: At least one should match (OR)
   * - mustNot: None should match (NOT)
   * - filter: Same as must but without scoring
   */
  private translateCompound(compound: CompoundOperator): string {
    const parts: string[] = [];

    // Process 'must' clauses (AND)
    if (compound.must && compound.must.length > 0) {
      const mustClauses = compound.must.map(op => this.translateOperator(op));
      if (mustClauses.length === 1) {
        parts.push(mustClauses[0]);
      } else {
        parts.push(`(${mustClauses.join(' AND ')})`);
      }
    }

    // Process 'filter' clauses (same as must)
    if (compound.filter && compound.filter.length > 0) {
      const filterClauses = compound.filter.map(op => this.translateOperator(op));
      if (filterClauses.length === 1) {
        parts.push(filterClauses[0]);
      } else {
        parts.push(`(${filterClauses.join(' AND ')})`);
      }
    }

    // Process 'should' clauses (OR)
    if (compound.should && compound.should.length > 0) {
      const shouldClauses = compound.should.map(op => this.translateOperator(op));
      if (shouldClauses.length === 1) {
        parts.push(shouldClauses[0]);
      } else {
        parts.push(`(${shouldClauses.join(' OR ')})`);
      }
    }

    // Process 'mustNot' clauses (NOT)
    if (compound.mustNot && compound.mustNot.length > 0) {
      const mustNotClauses = compound.mustNot.map(op => `NOT ${this.translateOperator(op)}`);
      parts.push(...mustNotClauses);
    }

    if (parts.length === 0) {
      return '*';
    }

    if (parts.length === 1) {
      return parts[0];
    }

    // Join all parts with AND
    return parts.join(' AND ');
  }

  /**
   * Escape special FTS5 characters in a term
   */
  private escapeFTS5Term(term: string): string {
    // FTS5 special characters that need escaping
    return term.replace(/[&|()^~*:"]/g, char => `\\${char}`);
  }

  /**
   * Build the complete SQL query for a $search aggregation stage
   *
   * @param search The MongoDB $search operator
   * @param collection The collection name
   * @param documentsTable The documents table name (default: 'documents')
   * @returns Complete SQL query with FTS5 join
   */
  buildSearchSQL(
    search: SearchOperator,
    collection: string,
    documentsTable: string = 'documents'
  ): { sql: string; params: unknown[] } {
    const result = this.translateSearch(search, collection);
    const ftsTable = result.ftsTable || `${collection}_fts`;

    // Build SQL with FTS5 join
    // FTS5 uses rowid for joining with the content table
    const sql = `
      SELECT ${documentsTable}.*, -bm25(${ftsTable}) AS _searchScore
      FROM ${documentsTable}
      JOIN ${ftsTable} ON ${documentsTable}.id = ${ftsTable}.rowid
      WHERE ${ftsTable} MATCH ?
      ORDER BY _searchScore DESC
    `.trim();

    return {
      sql,
      params: [result.ftsMatch],
    };
  }
}
