/**
 * Search Tool for MCP Server
 *
 * Implements document search functionality following OpenAI Deep Research format.
 * Supports JSON filters, collection-prefixed queries, and natural language search.
 */

import type { DatabaseAccess, McpToolResponse, SearchResult } from '../types'

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
  limit?: number
  collection?: string
  database?: string
}

/**
 * Search tool implementation
 *
 * @param dbAccess - Database access interface
 * @param query - Search query (JSON filter, collection:query, or natural language)
 * @param options - Optional search options
 * @returns MCP tool response with search results
 */
export async function searchTool(
  dbAccess: DatabaseAccess,
  query: string,
  options: SearchOptions = {}
): Promise<McpToolResponse> {
  try {
    const { collection, filter, database } = parseQuery(query, options)
    const limit = options.limit ?? MAX_RESULTS

    // Execute search
    const documents = await executeSearch(
      dbAccess,
      collection ?? options.collection,
      filter,
      limit
    )

    // Format results to OpenAI Deep Research standard
    const results: SearchResult[] = documents.slice(0, limit).map((doc) =>
      formatSearchResult(
        doc,
        doc._collection ?? collection ?? options.collection ?? 'unknown',
        doc._database ?? database ?? options.database ?? DEFAULT_DATABASE
      )
    )

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ results }),
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : 'Search failed',
          }),
        },
      ],
      isError: true,
    }
  }
}

/**
 * Parse a search query into collection, filter, and database
 */
function parseQuery(
  query: string,
  options: SearchOptions = {}
): {
  collection?: string
  filter: object
  database: string
} {
  const trimmedQuery = query.trim()

  // Try to parse as JSON filter first
  if (trimmedQuery.startsWith('{')) {
    try {
      const filter = JSON.parse(trimmedQuery)
      return {
        filter,
        database: options.database ?? DEFAULT_DATABASE,
        collection: options.collection,
      }
    } catch {
      // Fall through to other parsing methods
    }
  }

  // Try db.collection: query format
  const dbCollMatch = trimmedQuery.match(/^(\w+)\.(\w+):\s*(.+)$/)
  if (dbCollMatch) {
    return {
      database: dbCollMatch[1],
      collection: dbCollMatch[2],
      filter: parseSimpleQuery(dbCollMatch[3]),
    }
  }

  // Try collection: query format
  const colonMatch = trimmedQuery.match(/^(\w+):\s*(.+)$/)
  if (colonMatch) {
    return {
      collection: colonMatch[1],
      filter: parseSimpleQuery(colonMatch[2]),
      database: options.database ?? DEFAULT_DATABASE,
    }
  }

  // Treat as natural language - search all text fields
  return {
    filter: { $text: { $search: trimmedQuery } },
    database: options.database ?? DEFAULT_DATABASE,
    collection: options.collection,
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
    const field = eqMatch[1]
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
      return { [field]: numValue }
    }

    return { [field]: value }
  }

  // Default to text search
  return { $text: { $search: trimmed } }
}

/**
 * Execute search against database
 */
async function executeSearch(
  dbAccess: DatabaseAccess,
  collection: string | undefined,
  filter: object,
  limit: number
): Promise<Document[]> {
  const searchOptions = { limit }

  if (collection) {
    try {
      return (await dbAccess.find(collection, filter, searchOptions)) as Document[]
    } catch (error) {
      // If $text search fails (index not available), try regex fallback
      if (
        error instanceof Error &&
        (error.message.includes('$text') || error.message.includes('text index'))
      ) {
        return executeRegexFallback(dbAccess, collection, filter, searchOptions)
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
      const docs = (await dbAccess.find(coll, filter, {
        limit: limit - allResults.length,
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
    return (await dbAccess.find(collection, filter, options)) as Document[]
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

  return (await dbAccess.find(collection, regexFilter, options)) as Document[]
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
