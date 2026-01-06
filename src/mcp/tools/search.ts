/**
 * Search Tool for MCP Server
 *
 * Implements document search functionality following OpenAI Deep Research format.
 * Supports JSON filters, collection-prefixed queries, and natural language search.
 *
 * ## Supported Query Formats
 *
 * 1. **JSON Filter** - MongoDB-style query objects
 *    ```
 *    {"name": "Alice", "age": {"$gt": 21}}
 *    {"status": {"$in": ["active", "pending"]}}
 *    ```
 *
 * 2. **Collection-Prefixed** - Simple field = value queries with collection prefix
 *    ```
 *    users: name = Alice
 *    products: price = 99.99
 *    ```
 *
 * 3. **Database.Collection-Prefixed** - Include database name
 *    ```
 *    mydb.users: status = active
 *    ```
 *
 * 4. **Natural Language** - Full-text search across common fields
 *    ```
 *    find all users named Alice
 *    software engineer with Python experience
 *    ```
 *
 * 5. **With Pagination** - Append LIMIT and OFFSET to any query
 *    ```
 *    users: status = active LIMIT 10 OFFSET 20
 *    {"type": "article"} LIMIT 5
 *    ```
 *
 * ## Search Options
 *
 * - `limit` - Maximum results to return (default: 100)
 * - `offset` - Number of results to skip for pagination
 * - `sortBy` - Field to sort by
 * - `sortOrder` - 'asc' or 'desc' (default: 'desc')
 * - `collection` - Specific collection to search
 * - `database` - Database name (default: 'default')
 */

import type { DatabaseAccess, McpToolResponse, SearchResult, FindOptions } from '../types'

/** Maximum number of results to return */
const MAX_RESULTS = 100

/** Maximum length for preview text */
const MAX_PREVIEW_LENGTH = 500

/** Default database name if not specified */
const DEFAULT_DATABASE = 'default'

/** Document type from database */
interface Document {
  _id?: string | { toString(): string }
  _collection?: string
  _database?: string
  title?: string
  name?: string
  [key: string]: unknown
}

/** Options for search */
export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number
  /** Number of results to skip (for pagination) */
  offset?: number
  /** Field to sort results by */
  sortBy?: string
  /** Sort order: 'asc' for ascending, 'desc' for descending */
  sortOrder?: 'asc' | 'desc'
  /** Specific collection to search in */
  collection?: string
  /** Database name */
  database?: string
}

/** Parsed query result with filter and pagination */
interface ParsedQuery {
  collection?: string
  filter: object
  database: string
  paginationOptions: {
    limit?: number
    offset?: number
  }
}

/**
 * Search tool implementation
 *
 * @param dbAccess - Database access interface
 * @param query - Search query (JSON filter, collection:query, or natural language)
 * @param options - Optional search options
 * @returns MCP tool response with search results
 *
 * @example
 * // JSON filter search
 * await searchTool(db, '{"status": "active"}')
 *
 * @example
 * // Collection-prefixed search
 * await searchTool(db, 'users: name = Alice')
 *
 * @example
 * // With pagination
 * await searchTool(db, 'products: category = electronics LIMIT 10 OFFSET 20')
 *
 * @example
 * // Natural language search
 * await searchTool(db, 'find software engineers')
 */
export async function searchTool(
  dbAccess: DatabaseAccess,
  query: string,
  options: SearchOptions = {}
): Promise<McpToolResponse> {
  // Validate inputs early
  if (!query || typeof query !== 'string') {
    return createErrorResponse('Query is required and must be a string')
  }

  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return createErrorResponse('Query cannot be empty')
  }

  try {
    const parsed = parseQuery(trimmedQuery, options)
    const { collection, filter, database, paginationOptions } = parsed

    // Merge pagination from query string with options (query string takes precedence)
    const limit = Math.min(
      paginationOptions.limit ?? options.limit ?? MAX_RESULTS,
      MAX_RESULTS
    )
    const offset = paginationOptions.offset ?? options.offset ?? 0

    // Validate pagination parameters
    if (limit < 0) {
      return createErrorResponse('Limit must be a non-negative number')
    }
    if (offset < 0) {
      return createErrorResponse('Offset must be a non-negative number')
    }

    // Build find options
    const findOptions: FindOptions = {
      limit: limit + offset, // Fetch extra for offset handling
    }

    // Add sorting if specified
    if (options.sortBy) {
      findOptions.sort = {
        [options.sortBy]: options.sortOrder === 'asc' ? 1 : -1,
      }
    }

    // Execute search
    const documents = await executeSearch(
      dbAccess,
      collection ?? options.collection,
      filter,
      findOptions.limit ?? MAX_RESULTS
    )

    // Apply offset and limit after fetching
    const paginatedDocs = documents.slice(offset, offset + limit)

    // Format results to OpenAI Deep Research standard
    const results: SearchResult[] = paginatedDocs.map((doc) =>
      formatSearchResult(
        doc,
        doc._collection ?? collection ?? options.collection ?? 'unknown',
        doc._database ?? database ?? options.database ?? DEFAULT_DATABASE
      )
    )

    // Include metadata about pagination
    const response: {
      results: SearchResult[]
      pagination?: {
        limit: number
        offset: number
        total: number
        hasMore: boolean
      }
    } = { results }

    // Add pagination info if using pagination
    if (offset > 0 || limit < documents.length) {
      response.pagination = {
        limit,
        offset,
        total: documents.length,
        hasMore: documents.length > offset + limit,
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    }
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : 'Search failed',
      error
    )
  }
}

/**
 * Create a standardized error response
 */
function createErrorResponse(
  message: string,
  originalError?: unknown
): McpToolResponse {
  const errorDetails: { error: string; details?: string } = { error: message }

  // Add additional context for debugging if available
  if (originalError instanceof Error && originalError.message !== message) {
    errorDetails.details = originalError.message
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(errorDetails),
      },
    ],
    isError: true,
  }
}

/**
 * Parse a search query into collection, filter, database, and pagination options
 *
 * Supports the following query formats:
 * - JSON filter: {"name": "Alice"}
 * - Collection-prefixed: users: name = Alice
 * - Database.collection-prefixed: mydb.users: name = Alice
 * - Natural language: find users named Alice
 * - With pagination: any of above + LIMIT n OFFSET m
 */
function parseQuery(
  query: string,
  options: SearchOptions = {}
): ParsedQuery {
  // Extract pagination from the end of the query first
  const { queryWithoutPagination, paginationOptions } = extractPagination(query)
  const trimmedQuery = queryWithoutPagination.trim()

  // Try to parse as JSON filter first
  if (trimmedQuery.startsWith('{')) {
    try {
      const filter = JSON.parse(trimmedQuery) as object
      const result: ParsedQuery = {
        filter,
        database: options.database ?? DEFAULT_DATABASE,
        paginationOptions,
      }
      if (options.collection) {
        result.collection = options.collection
      }
      return result
    } catch {
      // Fall through to other parsing methods
    }
  }

  // Try db.collection: query format
  const dbCollMatch = trimmedQuery.match(/^(\w+)\.(\w+):\s*(.+)$/)
  if (dbCollMatch) {
    const dbName = dbCollMatch[1]
    const collName = dbCollMatch[2]
    const queryPart = dbCollMatch[3]
    return {
      database: dbName,
      collection: collName,
      filter: parseSimpleQuery(queryPart),
      paginationOptions,
    }
  }

  // Try collection: query format
  const colonMatch = trimmedQuery.match(/^(\w+):\s*(.+)$/)
  if (colonMatch) {
    const collName = colonMatch[1]
    const queryPart = colonMatch[2]
    return {
      collection: collName,
      filter: parseSimpleQuery(queryPart),
      database: options.database ?? DEFAULT_DATABASE,
      paginationOptions,
    }
  }

  // Treat as natural language - search all text fields
  const result: ParsedQuery = {
    filter: { $text: { $search: trimmedQuery } },
    database: options.database ?? DEFAULT_DATABASE,
    paginationOptions,
  }
  if (options.collection) {
    result.collection = options.collection
  }
  return result
}

/**
 * Extract LIMIT and OFFSET from the end of a query string
 *
 * @example
 * extractPagination('users: status = active LIMIT 10 OFFSET 20')
 * // Returns: { queryWithoutPagination: 'users: status = active', paginationOptions: { limit: 10, offset: 20 } }
 */
function extractPagination(query: string): {
  queryWithoutPagination: string
  paginationOptions: { limit?: number; offset?: number }
} {
  const paginationOptions: { limit?: number; offset?: number } = {}

  // Match LIMIT and OFFSET (case-insensitive)
  // Pattern: LIMIT n [OFFSET m] or just OFFSET m
  const limitMatch = query.match(/\s+LIMIT\s+(\d+)/i)
  const offsetMatch = query.match(/\s+OFFSET\s+(\d+)/i)

  if (limitMatch) {
    paginationOptions.limit = parseInt(limitMatch[1], 10)
  }
  if (offsetMatch) {
    paginationOptions.offset = parseInt(offsetMatch[1], 10)
  }

  // Remove pagination clauses from query
  let cleanQuery = query
    .replace(/\s+LIMIT\s+\d+/gi, '')
    .replace(/\s+OFFSET\s+\d+/gi, '')
    .trim()

  return {
    queryWithoutPagination: cleanQuery,
    paginationOptions,
  }
}

/**
 * Parse simple field = value query syntax
 */
function parseSimpleQuery(query: string): object {
  const trimmed = query.trim()

  // Handle "field = value" syntax
  const eqMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/)
  if (eqMatch) {
    const field = eqMatch[1] as string
    let value: string | number = eqMatch[2].trim()

    // Remove quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // Try to parse as number
    const numValue = Number(value)
    if (!isNaN(numValue) && value === String(numValue)) {
      return { [field]: numValue } as Record<string, unknown>
    }

    return { [field]: value } as Record<string, unknown>
  }

  // Default to text search
  return { $text: { $search: trimmed } }
}

/** Default projection to optimize large collection queries */
const SEARCH_PROJECTION = {
  _id: 1,
  name: 1,
  title: 1,
  description: 1,
  content: 1,
  createdAt: 1,
  updatedAt: 1,
} as const

/**
 * Execute search against database
 *
 * Optimizes for large collections by:
 * - Using projection to limit returned fields
 * - Enforcing result limits
 * - Graceful fallback when $text search unavailable
 */
async function executeSearch(
  dbAccess: DatabaseAccess,
  collection: string | undefined,
  filter: object,
  limit: number
): Promise<Document[]> {
  const searchOptions: FindOptions = {
    limit,
    // Use projection to limit fields for large collections
    projection: SEARCH_PROJECTION as Record<string, 0 | 1>,
  }

  if (collection) {
    try {
      return (await dbAccess.find(collection, filter as Record<string, unknown>, searchOptions)) as Document[]
    } catch (error) {
      // If $text search fails (index not available), try regex fallback
      if (
        error instanceof Error &&
        (error.message.includes('$text') || error.message.includes('text index'))
      ) {
        return executeRegexFallback(dbAccess, collection, filter, { limit })
      }
      throw error
    }
  }

  // Search all collections if none specified
  const collections = await dbAccess.listCollections()
  const allResults: Document[] = []
  let lastError: Error | null = null

  // Limit to first 10 collections to prevent overwhelming searches
  for (const coll of collections.slice(0, 10)) {
    if (allResults.length >= limit) break

    try {
      const docs = (await dbAccess.find(coll, filter as Record<string, unknown>, {
        limit: limit - allResults.length,
        projection: SEARCH_PROJECTION as Record<string, 0 | 1>,
      })) as Document[]
      allResults.push(
        ...docs.map((d) => ({
          ...d,
          _collection: coll,
        }))
      )
    } catch (error) {
      // Track the last error - if all collections fail, we should report it
      lastError = error instanceof Error ? error : new Error(String(error))
      continue
    }
  }

  // If we got no results and had errors, throw the last error
  if (allResults.length === 0 && lastError) {
    throw lastError
  }

  return allResults
}

/**
 * Fallback to regex search when $text search is not available
 */
async function executeRegexFallback(
  dbAccess: DatabaseAccess,
  collection: string,
  filter: object,
  options: { limit: number }
): Promise<Document[]> {
  const textFilter = filter as { $text?: { $search?: string } }
  if (!textFilter.$text?.$search) {
    return (await dbAccess.find(collection, filter as Record<string, unknown>, options)) as Document[]
  }

  const searchTerm = textFilter.$text.$search
  const regexFilter = {
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { content: { $regex: searchTerm, $options: 'i' } },
    ],
  }

  const results = (await dbAccess.find(collection, regexFilter, options)) as Document[]

  // Sort by relevance score
  return sortByRelevance(results, searchTerm)
}

/**
 * Calculate relevance score for a document based on search terms
 *
 * Higher scores indicate more relevant results based on:
 * - Number of term matches
 * - Position of matches (title/name weighted higher)
 * - Exact vs partial matches
 */
function scoreResult(doc: Document, query: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1)
  if (terms.length === 0) return 0

  let score = 0

  // Score title/name matches higher (weight: 3x)
  const titleText = (doc.title ?? doc.name ?? '').toString().toLowerCase()
  for (const term of terms) {
    if (titleText.includes(term)) {
      score += 3
      // Bonus for exact match
      if (titleText === term) score += 2
    }
  }

  // Score content matches (weight: 1x)
  const contentText = JSON.stringify(doc).toLowerCase()
  for (const term of terms) {
    const matches = contentText.split(term).length - 1
    score += Math.min(matches, 5) // Cap at 5 matches per term
  }

  return score
}

/**
 * Sort documents by relevance score (descending)
 */
function sortByRelevance(docs: Document[], query: string): Document[] {
  return [...docs].sort((a, b) => {
    const scoreA = scoreResult(a, query)
    const scoreB = scoreResult(b, query)
    return scoreB - scoreA // Higher score first
  })
}

/**
 * Format a document as a SearchResult
 */
function formatSearchResult(
  doc: Document,
  collection: string,
  database: string
): SearchResult {
  const id = doc._id?.toString() ?? 'unknown'

  return {
    id: `${database}.${collection}.${id}`,
    title: getDocumentTitle(doc),
    url: `mongodb://${database}/${collection}/${id}`,
    text: createPreview(doc),
  }
}

/**
 * Get a human-readable title for a document
 */
function getDocumentTitle(doc: Document): string {
  // Try common title fields
  if (typeof doc.title === 'string' && doc.title) {
    return doc.title
  }
  if (typeof doc.name === 'string' && doc.name) {
    return doc.name
  }

  // Fall back to _id
  if (doc._id) {
    return doc._id.toString()
  }

  return 'Untitled'
}

/**
 * Create a preview text snippet from a document
 */
function createPreview(doc: Document): string {
  // Create a clean copy without internal fields
  const cleanDoc = { ...doc }
  delete cleanDoc._collection
  delete cleanDoc._database

  const preview = JSON.stringify(cleanDoc, null, 2)

  if (preview.length > MAX_PREVIEW_LENGTH) {
    return preview.slice(0, MAX_PREVIEW_LENGTH - 3) + '...'
  }

  return preview
}

/**
 * MCP Tool Definition for search
 */
export const searchToolDefinition = {
  name: 'search',
  description:
    'Search for documents in MondoDB. Supports JSON filters, collection:query format, or natural language queries. Returns results in OpenAI Deep Research format.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query. Can be: JSON filter (e.g., {"name": "Alice"}), collection:query format (e.g., users: name = Alice), or natural language (e.g., find users named Alice)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 100, max: 100)',
      },
      collection: {
        type: 'string',
        description: 'Specific collection to search in. Optional.',
      },
      database: {
        type: 'string',
        description: 'Database name. Optional, defaults to "default".',
      },
    },
    required: ['query'],
  },
  annotations: {
    title: 'Search Documents',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}

export default searchTool
