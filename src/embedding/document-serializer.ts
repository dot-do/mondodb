import yaml from 'js-yaml';
import type { VectorizeMetadata, VectorizeMetadataValue } from '../types/vectorize';

/**
 * Document Serializer - Unified document serialization for embedding generation
 *
 * This module provides document serialization for vector embedding by:
 * - Extracting text content from specified fields
 * - Handling nested objects and arrays
 * - Supporting configurable field selection (include/exclude)
 * - Extracting metadata for vector storage
 * - Supporting multiple output formats (yaml, json, text)
 *
 * Consolidates functionality from both embedding and vectorize serializers.
 */

/**
 * Configuration options for automatic embedding generation
 */
export interface AutoEmbeddingConfig {
  /**
   * Maximum depth for nested object traversal (default: 3)
   */
  maxDepth?: number;

  /**
   * Fields to exclude from serialization (in addition to defaults)
   * Supports dot notation for nested fields (e.g., 'metadata.internal')
   */
  excludeFields?: string[];

  /**
   * Fields to include (if specified, only these fields are included)
   * Supports dot notation for nested fields (e.g., 'metadata.author')
   * Supports wildcards (e.g., 'details.*' for all fields under details)
   */
  includeFields?: string[];

  /**
   * Fields to extract as metadata for vector storage
   * Supports dot notation for nested fields
   */
  metadataFields?: string[];

  /**
   * Separator to use between field values in text mode
   * Default: ' ' (space)
   */
  separator?: string;
}

/**
 * Serialization options for document embedding
 */
export interface SerializationOptions {
  /**
   * Serialization format: 'yaml' (default), 'json', or 'text'
   */
  serializer?: 'yaml' | 'json' | 'text';

  /**
   * Automatic embedding configuration
   */
  auto?: AutoEmbeddingConfig;
}

/**
 * Result of document serialization with metadata
 */
export interface SerializedDocument {
  /** The document ID */
  documentId: string;
  /** The serialized text content for embedding */
  text: string;
  /** Optional metadata extracted from the document */
  metadata?: VectorizeMetadata;
}

/**
 * Default regex patterns to exclude from embedding serialization
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  /^_id$/,           // MongoDB _id field
  /Id$/,             // Fields ending in Id (userId, parentId, etc.)
  /^createdAt$/,     // Common timestamp field
  /^updatedAt$/,     // Common timestamp field
  /^__v$/,           // Mongoose version key
];

/**
 * Fields that are automatically excluded as they likely contain embedding vectors
 */
const EMBEDDING_FIELD_PATTERNS = [
  'embedding',
  'vector',
  '_embedding',
  '_vector',
  'embeddings',
  'vectors'
];

/**
 * Check if a field name matches vector/embedding patterns
 */
function isEmbeddingField(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase();
  return EMBEDDING_FIELD_PATTERNS.some(pattern =>
    lowerName === pattern ||
    lowerName.endsWith('_' + pattern) ||
    lowerName.endsWith(pattern)
  );
}

/**
 * Check if a field should be excluded based on patterns
 */
function shouldExcludeField(fieldName: string, additionalExcludes: string[] = []): boolean {
  // Check for embedding/vector fields
  if (isEmbeddingField(fieldName)) {
    return true;
  }

  // Check default patterns
  for (const pattern of DEFAULT_EXCLUDE_PATTERNS) {
    if (pattern.test(fieldName)) {
      return true;
    }
  }

  // Check additional excludes
  if (additionalExcludes.includes(fieldName)) {
    return true;
  }

  return false;
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Convert a value to a valid VectorizeMetadataValue
 */
function toMetadataValue(value: unknown): VectorizeMetadataValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value;
  }

  // Handle string arrays
  if (Array.isArray(value)) {
    if (value.every(item => typeof item === 'string')) {
      return value as string[];
    }
    // Convert non-string arrays to string arrays
    return value.map(item => String(item));
  }

  // For other types, convert to string
  return String(value);
}

/**
 * Extract metadata fields from the document
 */
function extractMetadata(
  doc: Record<string, unknown>,
  metadataFields: string[]
): VectorizeMetadata {
  const metadata: VectorizeMetadata = {};

  for (const field of metadataFields) {
    const value = getNestedValue(doc, field);
    if (value !== undefined) {
      const metaValue = toMetadataValue(value);
      if (metaValue !== undefined) {
        metadata[field] = metaValue;
      }
    }
  }

  return metadata;
}

/**
 * Extract the document ID from various formats
 */
function extractDocumentId(doc: Record<string, unknown>): string {
  const id = doc._id;
  if (id === undefined || id === null) {
    return '';
  }
  if (typeof id === 'string') {
    return id;
  }
  if (typeof id === 'object' && id !== null && 'toString' in id) {
    return (id as { toString(): string }).toString();
  }
  return String(id);
}

/**
 * Filter document fields based on inclusion/exclusion rules
 *
 * maxDepth controls how many levels deep we traverse:
 * - maxDepth 0: only top-level primitives
 * - maxDepth 1: top-level + one level of nesting
 * - maxDepth 2: top-level + two levels of nesting
 */
function filterDocument(
  doc: Record<string, unknown>,
  options: AutoEmbeddingConfig = {},
  currentDepth: number = 0
): Record<string, unknown> {
  const { maxDepth = 3, excludeFields = [], includeFields } = options;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(doc)) {
    // Check if we should include this field
    if (includeFields && includeFields.length > 0) {
      // Handle wildcard patterns for includeFields
      const shouldInclude = includeFields.some(pattern => {
        if (pattern === key) return true;
        if (pattern.endsWith('.*')) {
          const prefix = pattern.slice(0, -2);
          return key === prefix;
        }
        // Check if current key is part of a dot-notation path
        if (pattern.startsWith(key + '.')) return true;
        return false;
      });
      if (!shouldInclude) {
        continue;
      }
    } else if (shouldExcludeField(key, excludeFields)) {
      continue;
    }

    // Handle nested objects
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // Only recurse if we haven't reached maxDepth
      if (currentDepth + 1 < maxDepth) {
        const filtered = filterDocument(value as Record<string, unknown>, options, currentDepth + 1);
        // Include the key even if filtered is empty (shows structure exists)
        result[key] = Object.keys(filtered).length > 0 ? filtered : '...';
      } else {
        // At maxDepth - don't recurse further, just indicate truncation
        result[key] = '...';
      }
    } else if (Array.isArray(value)) {
      // Skip if it looks like an embedding vector (array of numbers)
      if (value.length > 0 && typeof value[0] === 'number' && isEmbeddingField(key)) {
        continue;
      }

      // Handle arrays - filter nested objects within arrays
      const filteredArray = value.map(item => {
        if (item !== null && typeof item === 'object' && !(item instanceof Date)) {
          if (currentDepth + 1 < maxDepth) {
            const filtered = filterDocument(item as Record<string, unknown>, options, currentDepth + 1);
            return Object.keys(filtered).length > 0 ? filtered : '...';
          }
          return '...'; // Truncated at maxDepth
        }
        return item;
      });

      if (filteredArray.length > 0) {
        result[key] = filteredArray;
      }
    } else {
      // Primitive values or dates
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract text content from a document for embedding
 */
function extractText(
  doc: Record<string, unknown>,
  depth: number = 0,
  maxDepth: number = 3,
  separator: string = ' '
): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(doc)) {
    // Skip embedding fields
    if (isEmbeddingField(key)) {
      continue;
    }

    if (typeof value === 'string') {
      parts.push(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value));
    } else if (Array.isArray(value)) {
      // Skip if it looks like an embedding vector
      if (value.length > 0 && typeof value[0] === 'number' && isEmbeddingField(key)) {
        continue;
      }

      for (const item of value) {
        if (typeof item === 'string') {
          parts.push(item);
        } else if (typeof item === 'number' || typeof item === 'boolean') {
          parts.push(String(item));
        } else if (item !== null && typeof item === 'object' && depth < maxDepth) {
          parts.push(extractText(item as Record<string, unknown>, depth + 1, maxDepth, separator));
        }
      }
    } else if (value !== null && typeof value === 'object' && !(value instanceof Date) && depth < maxDepth) {
      parts.push(extractText(value as Record<string, unknown>, depth + 1, maxDepth, separator));
    } else if (value instanceof Date) {
      parts.push(value.toISOString());
    }
  }

  return parts.filter(p => p.trim().length > 0).join(separator);
}

/**
 * Serialize a document for embedding generation
 *
 * @param doc - The document to serialize
 * @param options - Serialization options
 * @returns Serialized string representation of the document
 */
export function serializeForEmbedding(
  doc: Record<string, unknown>,
  options: SerializationOptions = {}
): string {
  const { serializer = 'yaml', auto = {} } = options;
  const { separator = ' ' } = auto;

  // Filter the document
  const filtered = filterDocument(doc, auto);

  // Serialize based on format
  switch (serializer) {
    case 'json':
      return JSON.stringify(filtered);

    case 'text':
      return extractText(filtered, 0, auto.maxDepth ?? 3, separator);

    case 'yaml':
    default:
      return yaml.dump(filtered, {
        indent: 2,
        lineWidth: -1, // No line wrapping
        noRefs: true,  // Don't use YAML references
        sortKeys: true // Consistent ordering
      }).trim();
  }
}

/**
 * Serialize a document with full metadata extraction
 *
 * This is the advanced API that returns a structured result including
 * the document ID and extracted metadata for vector storage.
 *
 * @param doc - The document to serialize
 * @param options - Serialization options
 * @returns Serialized document with text and metadata
 */
export function serializeDocument(
  doc: Record<string, unknown>,
  options: SerializationOptions = {}
): SerializedDocument {
  const { auto = {} } = options;

  // Extract document ID
  const documentId = extractDocumentId(doc);

  // Serialize to text
  const text = serializeForEmbedding(doc, options);

  // Build result with optional metadata
  const result: SerializedDocument = {
    documentId,
    text
  };

  // Extract metadata if requested
  if (auto.metadataFields && auto.metadataFields.length > 0) {
    result.metadata = extractMetadata(doc, auto.metadataFields);
  }

  return result;
}

/**
 * Serialize multiple documents in batch
 *
 * @param docs - Array of MongoDB documents
 * @param options - Serialization options applied to all documents
 * @returns Array of serialized documents
 */
export function serializeDocuments(
  docs: Record<string, unknown>[],
  options: SerializationOptions = {}
): SerializedDocument[] {
  return docs.map(doc => serializeDocument(doc, options));
}

/**
 * DocumentSerializer class - Object-oriented API for document serialization
 *
 * Provides a class-based interface for cases where you need to reuse
 * serialization options across multiple operations.
 */
export class DocumentSerializer {
  private options: SerializationOptions;

  constructor(options: SerializationOptions = {}) {
    this.options = options;
  }

  /**
   * Serialize a single document to text for embedding
   */
  serialize(
    doc: Record<string, unknown>,
    options?: SerializationOptions
  ): SerializedDocument {
    return serializeDocument(doc, options || this.options);
  }

  /**
   * Serialize multiple documents in batch
   */
  serializeBatch(
    docs: Record<string, unknown>[],
    options?: SerializationOptions
  ): SerializedDocument[] {
    return serializeDocuments(docs, options || this.options);
  }

  /**
   * Get just the text representation (simple API)
   */
  serializeToText(
    doc: Record<string, unknown>,
    options?: SerializationOptions
  ): string {
    return serializeForEmbedding(doc, options || this.options);
  }
}

// Re-export types from vectorize for backwards compatibility
export type { VectorizeMetadata, VectorizeMetadataValue };
