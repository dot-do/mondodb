/**
 * MCP Fetch Tool
 *
 * Fetches a document by its ID from MondoDB.
 * Returns OpenAI Deep Research compatible FetchResult format.
 *
 * ID format: database.collection.objectId
 * Returns: Full document content with metadata
 */

import type { DatabaseAccess, McpToolResponse, FetchResult } from '../types'

/**
 * Parsed ID components
 */
interface ParsedId {
  database: string
  collection: string
  objectId: string
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
 * Fetch a document by ID
 *
 * @param dbAccess - Database access interface
 * @param id - Document ID in format: database.collection.objectId
 * @returns MCP tool response with FetchResult or error
 */
export async function fetchTool(
  dbAccess: DatabaseAccess,
  id: string
): Promise<McpToolResponse> {
  try {
    const parsed = parseId(id)

    const document = (await dbAccess.findOne(parsed.collection, {
      _id: parsed.objectId,
    })) as Document | null

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

    const result: FetchResult = {
      id,
      title: getDocumentTitle(document),
      url: `mongodb://${parsed.database}/${parsed.collection}/${parsed.objectId}`,
      text: JSON.stringify(document, null, 2),
      metadata: {
        database: parsed.database,
        collection: parsed.collection,
        _id: parsed.objectId,
      },
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
