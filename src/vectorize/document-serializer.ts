/**
 * DocumentSerializer - Extracts text content from MongoDB documents for embedding
 *
 * This serializer prepares documents for vector embedding by:
 * - Extracting text content from specified fields
 * - Handling nested objects and arrays
 * - Supporting configurable field selection (include/exclude)
 * - Extracting metadata for vector storage
 *
 * Part of the Vector & Hybrid Search epic (mondodb-txn.3.1)
 */

import type { VectorizeMetadata, VectorizeMetadataValue } from '../types/vectorize'

/**
 * Options for document serialization
 */
export interface SerializerOptions {
  /**
   * Fields to include in the serialized text.
   * Supports dot notation for nested fields (e.g., 'metadata.author')
   * Supports wildcards (e.g., 'details.*' for all fields under details)
   * If provided, only these fields will be serialized.
   */
  includedFields?: string[]

  /**
   * Fields to exclude from the serialized text.
   * Supports dot notation for nested fields.
   * Applied after includedFields if both are specified.
   */
  excludedFields?: string[]

  /**
   * Separator to use between field values.
   * Default: ' ' (space)
   */
  separator?: string

  /**
   * Fields to extract as metadata for vector storage.
   * Supports dot notation for nested fields.
   */
  metadataFields?: string[]

  /**
   * Maximum depth to traverse nested objects.
   * Default: 10
   */
  maxDepth?: number

  /**
   * Order of fields in the serialized output.
   * Fields not in this list appear after ordered fields.
   */
  fieldOrder?: string[]
}

/**
 * Result of document serialization
 */
export interface SerializedDocument {
  /** The document ID */
  documentId: string
  /** The serialized text content for embedding */
  text: string
  /** Optional metadata extracted from the document */
  metadata?: VectorizeMetadata
}

/**
 * Fields that are automatically excluded as they likely contain embedding vectors
 */
const DEFAULT_EXCLUDED_PATTERNS = [
  'embedding',
  'vector',
  '_embedding',
  '_vector',
  'embeddings',
  'vectors'
]

/**
 * Check if a field name matches vector/embedding patterns
 */
function isEmbeddingField(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase()
  return DEFAULT_EXCLUDED_PATTERNS.some(pattern =>
    lowerName === pattern ||
    lowerName.endsWith('_' + pattern) ||
    lowerName.endsWith(pattern)
  )
}

/**
 * DocumentSerializer - Converts MongoDB documents to text for embedding
 */
export class DocumentSerializer {
  /**
   * Serialize a single document to text for embedding
   *
   * @param doc - The MongoDB document to serialize
   * @param options - Serialization options
   * @returns Serialized document with text and metadata
   */
  serialize(
    doc: Record<string, unknown>,
    options: SerializerOptions = {}
  ): SerializedDocument {
    const {
      includedFields,
      excludedFields,
      separator = ' ',
      metadataFields,
      maxDepth = 10,
      fieldOrder
    } = options

    // Extract document ID
    const documentId = this.extractDocumentId(doc)

    // Extract metadata if requested
    const metadata = metadataFields
      ? this.extractMetadata(doc, metadataFields)
      : undefined

    // Get fields to serialize (excluding _id)
    const fieldsToSerialize = this.getFieldsToSerialize(
      doc,
      includedFields,
      excludedFields,
      fieldOrder
    )

    // Serialize field values to text
    const textParts: string[] = []
    for (const field of fieldsToSerialize) {
      const value = this.getNestedValue(doc, field)
      if (value !== undefined && value !== null) {
        const serialized = this.serializeValue(value, 0, maxDepth, field, excludedFields)
        if (serialized) {
          textParts.push(serialized)
        }
      }
    }

    return {
      documentId,
      text: textParts.join(separator),
      metadata
    }
  }

  /**
   * Serialize multiple documents in batch
   *
   * @param docs - Array of MongoDB documents
   * @param options - Serialization options applied to all documents
   * @returns Array of serialized documents
   */
  serializeBatch(
    docs: Record<string, unknown>[],
    options: SerializerOptions = {}
  ): SerializedDocument[] {
    return docs.map(doc => this.serialize(doc, options))
  }

  /**
   * Extract the document ID from various formats
   */
  private extractDocumentId(doc: Record<string, unknown>): string {
    const id = doc._id
    if (id === undefined || id === null) {
      return ''
    }
    if (typeof id === 'string') {
      return id
    }
    if (typeof id === 'object' && id !== null && 'toString' in id) {
      return (id as { toString(): string }).toString()
    }
    return String(id)
  }

  /**
   * Get the list of fields to serialize based on include/exclude options
   */
  private getFieldsToSerialize(
    doc: Record<string, unknown>,
    includedFields?: string[],
    excludedFields?: string[],
    fieldOrder?: string[]
  ): string[] {
    let fields: string[]

    if (includedFields && includedFields.length > 0) {
      // Expand wildcards and use only included fields
      fields = this.expandFieldPatterns(doc, includedFields)
    } else {
      // Use all fields except _id
      fields = Object.keys(doc).filter(f => f !== '_id')
    }

    // Apply exclusions
    if (excludedFields && excludedFields.length > 0) {
      const excludeSet = new Set(excludedFields)
      fields = fields.filter(f => {
        // Check exact match
        if (excludeSet.has(f)) return false
        // Check if any exclusion pattern matches as prefix
        for (const exclude of excludedFields) {
          if (f.startsWith(exclude + '.')) return false
          // Check dot notation matches
          if (this.matchesDotNotation(f, exclude)) return false
        }
        return true
      })
    }

    // Filter out embedding fields by default
    fields = fields.filter(f => !isEmbeddingField(f))

    // Apply field ordering if specified
    if (fieldOrder && fieldOrder.length > 0) {
      const orderMap = new Map(fieldOrder.map((f, i) => [f, i]))
      fields.sort((a, b) => {
        const aOrder = orderMap.get(a) ?? Infinity
        const bOrder = orderMap.get(b) ?? Infinity
        if (aOrder === bOrder) return 0
        return aOrder - bOrder
      })
    }

    return fields
  }

  /**
   * Expand field patterns including wildcards
   */
  private expandFieldPatterns(
    doc: Record<string, unknown>,
    patterns: string[]
  ): string[] {
    const result: string[] = []

    for (const pattern of patterns) {
      if (pattern.endsWith('.*')) {
        // Wildcard pattern - expand to all fields under the prefix
        const prefix = pattern.slice(0, -2)
        const nested = this.getNestedValue(doc, prefix)
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
          for (const key of Object.keys(nested as Record<string, unknown>)) {
            result.push(`${prefix}.${key}`)
          }
        }
      } else {
        result.push(pattern)
      }
    }

    return result
  }

  /**
   * Check if a field path matches a dot notation pattern
   */
  private matchesDotNotation(fieldPath: string, pattern: string): boolean {
    const fieldParts = fieldPath.split('.')
    const patternParts = pattern.split('.')

    if (patternParts.length > fieldParts.length) return false

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] !== fieldParts[i]) return false
    }

    return true
  }

  /**
   * Get a nested value from an object using dot notation
   */
  private getNestedValue(
    obj: Record<string, unknown>,
    path: string
  ): unknown {
    const parts = path.split('.')
    let current: unknown = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      if (typeof current !== 'object') {
        return undefined
      }
      current = (current as Record<string, unknown>)[part]
    }

    return current
  }

  /**
   * Serialize a value to text
   */
  private serializeValue(
    value: unknown,
    depth: number,
    maxDepth: number,
    fieldPath: string = '',
    excludedFields?: string[]
  ): string {
    // Check depth limit
    if (depth >= maxDepth) {
      return ''
    }

    // Handle null/undefined
    if (value === null || value === undefined) {
      return ''
    }

    // Handle primitives
    if (typeof value === 'string') {
      return value
    }
    if (typeof value === 'number') {
      return String(value)
    }
    if (typeof value === 'boolean') {
      return String(value)
    }

    // Handle Date
    if (value instanceof Date) {
      return value.toISOString()
    }

    // Handle arrays
    if (Array.isArray(value)) {
      // Skip if it looks like an embedding vector (array of numbers)
      if (value.length > 0 && typeof value[0] === 'number' && isEmbeddingField(fieldPath)) {
        return ''
      }

      const parts: string[] = []
      for (const item of value) {
        const serialized = this.serializeValue(item, depth + 1, maxDepth, fieldPath, excludedFields)
        if (serialized) {
          parts.push(serialized)
        }
      }
      return parts.join(' ')
    }

    // Handle objects
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>
      const parts: string[] = []

      for (const [key, val] of Object.entries(obj)) {
        // Skip embedding fields
        if (isEmbeddingField(key)) {
          continue
        }

        // Build the full path for this nested field
        const nestedPath = fieldPath ? `${fieldPath}.${key}` : key

        // Check if this nested path should be excluded
        if (excludedFields && this.isFieldExcluded(nestedPath, excludedFields)) {
          continue
        }

        const serialized = this.serializeValue(val, depth + 1, maxDepth, nestedPath, excludedFields)
        if (serialized) {
          parts.push(serialized)
        }
      }
      return parts.join(' ')
    }

    // Fallback for other types
    return String(value)
  }

  /**
   * Check if a field path should be excluded
   */
  private isFieldExcluded(fieldPath: string, excludedFields: string[]): boolean {
    for (const exclude of excludedFields) {
      // Exact match
      if (fieldPath === exclude) return true
      // The field is a parent of an excluded field (include it, but children will be checked)
      // The field starts with the exclusion pattern (it's a child of excluded path)
      if (fieldPath.startsWith(exclude + '.')) return true
    }
    return false
  }

  /**
   * Extract metadata fields from the document
   */
  private extractMetadata(
    doc: Record<string, unknown>,
    metadataFields: string[]
  ): VectorizeMetadata {
    const metadata: VectorizeMetadata = {}

    for (const field of metadataFields) {
      const value = this.getNestedValue(doc, field)
      if (value !== undefined) {
        const metaValue = this.toMetadataValue(value)
        if (metaValue !== undefined) {
          metadata[field] = metaValue
        }
      }
    }

    return metadata
  }

  /**
   * Convert a value to a valid VectorizeMetadataValue
   */
  private toMetadataValue(value: unknown): VectorizeMetadataValue | undefined {
    if (value === null || value === undefined) {
      return undefined
    }

    if (typeof value === 'string') {
      return value
    }
    if (typeof value === 'number') {
      return value
    }
    if (typeof value === 'boolean') {
      return value
    }

    // Handle string arrays
    if (Array.isArray(value)) {
      if (value.every(item => typeof item === 'string')) {
        return value as string[]
      }
      // Convert non-string arrays to string arrays
      return value.map(item => String(item))
    }

    // For other types, convert to string
    return String(value)
  }
}
