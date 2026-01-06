/**
 * MCP Fetch Tool
 *
 * Fetches a document by its ID from MondoDB.
 * Returns OpenAI Deep Research compatible FetchResult format.
 *
 * ID format: database.collection.objectId
 * Returns: Full document content with metadata
 *
 * Features:
 * - Field projection support to limit returned fields
 * - Document size handling with truncation for large documents
 * - Related documents hints (finds ObjectId references)
 * - Document type detection for AI understanding
 */

import type { DatabaseAccess, McpToolResponse, FetchResult } from '../types'

/** Maximum document size before truncation (1MB) */
const MAX_DOCUMENT_SIZE = 1_000_000

/** ObjectId pattern: 24 hex characters */
const OBJECTID_PATTERN = /^[0-9a-fA-F]{24}$/

/**
 * Parsed ID components
 */
interface ParsedId {
  database: string
  collection: string
  objectId: string
}

/**
 * Options for fetching documents
 */
export interface FetchOptions {
  /** Fields to include/exclude (MongoDB projection syntax) */
  projection?: Record<string, 0 | 1>
  /** Include raw document without processing */
  includeRaw?: boolean
}

/**
 * Document type with common title fields
 */
type Document = Record<string, unknown> & {
  _id?: unknown
  title?: string
  name?: string
  subject?: string
  label?: string
}

/**
 * Extended FetchResult with additional metadata
 */
interface ExtendedFetchResult extends FetchResult {
  /** Document type hint for AI understanding */
  documentType?: string
  /** Related document IDs found in this document */
  relatedDocuments?: string[]
  /** Whether the document was truncated */
  truncated?: boolean
  /** Original document size if truncated */
  originalSize?: number
}

/**
 * Fetch a document by ID
 *
 * @param dbAccess - Database access interface
 * @param id - Document ID in format: database.collection.objectId
 * @param options - Optional fetch options (projection, includeRaw)
 * @returns MCP tool response with FetchResult or error
 */
export async function fetchTool(
  dbAccess: DatabaseAccess,
  id: string,
  options: FetchOptions = {}
): Promise<McpToolResponse> {
  try {
    const parsed = parseId(id)

    // Build find options with projection if specified
    const findOptions = options.projection ? { projection: options.projection } : undefined

    const document = (await dbAccess.findOne(
      parsed.collection,
      { _id: parsed.objectId },
      findOptions
    )) as Document | null

    if (!document) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: 'Document not found' }),
          },
        ],
        isError: true,
      }
    }

    // Serialize document with size handling
    const { text, truncated, originalSize } = serializeDocument(document)

    // Detect document type for AI understanding
    const documentType = detectDocumentType(document)

    // Find related document references
    const relatedDocuments = findRelatedDocuments(document, parsed.database)

    const result: ExtendedFetchResult = {
      id,
      title: getDocumentTitle(document),
      url: `mongodb://${parsed.database}/${parsed.collection}/${parsed.objectId}`,
      text,
      metadata: {
        database: parsed.database,
        collection: parsed.collection,
        _id: parsed.objectId,
      },
    }

    // Add extended metadata if present
    if (documentType !== 'document') {
      result.documentType = documentType
    }
    if (relatedDocuments.length > 0) {
      result.relatedDocuments = relatedDocuments
    }
    if (truncated) {
      result.truncated = true
      result.originalSize = originalSize
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : 'Fetch failed',
          }),
        },
      ],
      isError: true,
    }
  }
}

/**
 * Parse a document ID into its components
 *
 * @param id - ID string in format: database.collection.objectId
 * @returns Parsed ID components
 * @throws Error if ID format is invalid
 */
function parseId(id: string): ParsedId {
  const parts = id.split('.')

  if (parts.length < 3) {
    throw new Error('Invalid ID format. Expected: database.collection.objectId')
  }

  // Handle case where ObjectId contains dots
  const [database, collection, ...objectIdParts] = parts
  const objectId = objectIdParts.join('.')

  if (!database || !collection || !objectId) {
    throw new Error('Invalid ID format. Expected: database.collection.objectId')
  }

  return { database, collection, objectId }
}

/**
 * Extract a title from a document
 * Checks common title fields and falls back to _id
 *
 * @param doc - Document to extract title from
 * @returns Document title string
 */
function getDocumentTitle(doc: Document): string {
  return (
    doc.title ??
    doc.name ??
    doc.subject ??
    doc.label ??
    doc._id?.toString() ??
    'Untitled'
  )
}

/**
 * Serialize a document with size handling
 *
 * If the document exceeds MAX_DOCUMENT_SIZE, it will be truncated
 * and metadata about the truncation will be included.
 *
 * @param doc - Document to serialize
 * @returns Serialized text with truncation metadata
 */
function serializeDocument(doc: Document): {
  text: string
  truncated: boolean
  originalSize?: number
} {
  const json = JSON.stringify(doc, null, 2)

  if (json.length <= MAX_DOCUMENT_SIZE) {
    return { text: json, truncated: false }
  }

  // Document is too large - truncate it
  const truncated = truncateDocument(doc, MAX_DOCUMENT_SIZE)
  const truncatedJson = JSON.stringify(
    {
      _truncated: true,
      _originalSize: json.length,
      _fields: Object.keys(doc),
      ...truncated,
    },
    null,
    2
  )

  return {
    text: truncatedJson,
    truncated: true,
    originalSize: json.length,
  }
}

/**
 * Truncate a document to fit within size limit
 *
 * Strategy:
 * 1. Keep _id, title, name fields
 * 2. Truncate large string fields
 * 3. Remove nested objects/arrays if still too large
 */
function truncateDocument(doc: Document, maxSize: number): Document {
  const result: Document = {}
  const priorityFields = ['_id', 'title', 'name', 'subject', 'label', 'type']

  // Always include priority fields
  for (const field of priorityFields) {
    if (field in doc) {
      result[field] = doc[field]
    }
  }

  // Add other fields until we approach the limit
  const remaining = maxSize - JSON.stringify(result).length - 100 // Reserve 100 for overhead

  for (const [key, value] of Object.entries(doc)) {
    if (priorityFields.includes(key)) continue

    const valueSize = JSON.stringify(value).length

    if (valueSize < remaining / Object.keys(doc).length) {
      // Field is small enough to include
      result[key] = value
    } else if (typeof value === 'string') {
      // Truncate large strings
      result[key] = value.slice(0, 500) + '...[truncated]'
    } else if (Array.isArray(value)) {
      // Truncate arrays to first few items
      result[key] = value.slice(0, 3)
      if (value.length > 3) {
        (result[key] as unknown[]).push(`...(${value.length - 3} more items)`)
      }
    }
    // Skip large objects entirely
  }

  return result
}

/**
 * Detect the type of document based on its fields
 *
 * @param doc - Document to analyze
 * @returns Detected document type
 */
function detectDocumentType(doc: Document): string {
  // Explicit type field takes precedence
  if (typeof doc.type === 'string') return doc.type
  if (typeof doc._type === 'string') return doc._type as string

  // Detect based on field patterns
  if ('email' in doc && 'password' in doc) return 'user'
  if ('email' in doc && !('password' in doc)) return 'contact'
  if ('price' in doc || 'sku' in doc) return 'product'
  if ('content' in doc || 'body' in doc) {
    if ('author' in doc || 'publishedAt' in doc) return 'article'
    return 'post'
  }
  if ('items' in doc || 'products' in doc) {
    if ('total' in doc || 'subtotal' in doc) return 'order'
    return 'cart'
  }
  if ('createdAt' in doc && 'status' in doc) return 'event'
  if ('message' in doc || 'text' in doc) return 'message'
  if ('url' in doc || 'href' in doc) return 'link'
  if ('permissions' in doc || 'role' in doc) return 'role'
  if ('settings' in doc || 'config' in doc) return 'configuration'

  return 'document'
}

/**
 * Find related document references in a document
 *
 * Scans the document for ObjectId-like strings and returns them
 * formatted as document IDs.
 *
 * @param doc - Document to scan
 * @param database - Database name for ID formatting
 * @returns Array of related document ID hints
 */
function findRelatedDocuments(doc: Document, database: string): string[] {
  const refs: string[] = []
  const docId = doc._id?.toString()

  function scan(obj: unknown, path: string = ''): void {
    if (typeof obj === 'string' && isObjectId(obj) && obj !== docId) {
      // Try to infer collection from field name
      const fieldName = path.split('.').pop() ?? ''
      const collection = inferCollectionFromField(fieldName)
      refs.push(`${database}.${collection}.${obj}`)
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => scan(item, `${path}[${index}]`))
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        scan(value, path ? `${path}.${key}` : key)
      }
    }
  }

  scan(doc)

  // Deduplicate and limit
  return [...new Set(refs)].slice(0, 10)
}

/**
 * Check if a string looks like a MongoDB ObjectId
 */
function isObjectId(str: string): boolean {
  return OBJECTID_PATTERN.test(str)
}

/**
 * Infer collection name from a field name
 *
 * @example
 * inferCollectionFromField('userId') // 'users'
 * inferCollectionFromField('productIds') // 'products'
 * inferCollectionFromField('authorRef') // 'authors'
 */
function inferCollectionFromField(fieldName: string): string {
  // Remove common suffixes
  let name = fieldName
    .replace(/Id$/, '')
    .replace(/Ids$/, '')
    .replace(/Ref$/, '')
    .replace(/Refs$/, '')
    .replace(/_id$/, '')

  // Pluralize if not already plural
  if (!name.endsWith('s') && name.length > 0) {
    name += 's'
  }

  return name || 'documents'
}

/**
 * MCP Tool Definition for fetch
 */
export const fetchToolDefinition = {
  name: 'fetch',
  description:
    'Fetch a document by ID from MondoDB. Returns the full document content.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description:
          'Document ID in format: database.collection.objectId (e.g., mydb.users.507f1f77bcf86cd799439011)',
      },
    },
    required: ['id'],
  },
  annotations: {
    title: 'Fetch Document',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}
