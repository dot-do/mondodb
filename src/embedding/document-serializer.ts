import yaml from 'js-yaml';

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
   */
  excludeFields?: string[];

  /**
   * Fields to include (if specified, only these fields are included)
   */
  includeFields?: string[];
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
 * Default fields to exclude from embedding serialization
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  /^_id$/,           // MongoDB _id field
  /Id$/,             // Fields ending in Id (userId, parentId, etc.)
  /^createdAt$/,     // Common timestamp field
  /^updatedAt$/,     // Common timestamp field
  /^__v$/,           // Mongoose version key
];

/**
 * Check if a field should be excluded based on patterns
 */
function shouldExcludeField(fieldName: string, additionalExcludes: string[] = []): boolean {
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
      if (!includeFields.includes(key)) {
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
 * Extract only primitive values from an object (no nested objects)
 */
function extractPrimitives(
  doc: Record<string, unknown>,
  excludeFields: string[] = [],
  includeFields?: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(doc)) {
    // Check inclusion/exclusion
    if (includeFields && includeFields.length > 0) {
      if (!includeFields.includes(key)) {
        continue;
      }
    } else if (shouldExcludeField(key, excludeFields)) {
      continue;
    }

    // Only include primitives, arrays of primitives, and dates
    if (value === null || value === undefined) {
      continue;
    } else if (typeof value !== 'object') {
      result[key] = value;
    } else if (value instanceof Date) {
      result[key] = value;
    } else if (Array.isArray(value)) {
      // Only include array if it contains primitives
      const primitiveItems = value.filter(item =>
        item === null || typeof item !== 'object' || item instanceof Date
      );
      if (primitiveItems.length > 0) {
        result[key] = primitiveItems;
      }
    }
    // Skip nested objects
  }

  return result;
}

/**
 * Extract text content from a document for embedding
 */
function extractText(doc: Record<string, unknown>, depth: number = 0, maxDepth: number = 3): string {
  const parts: string[] = [];

  for (const value of Object.values(doc)) {
    if (typeof value === 'string') {
      parts.push(value);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value));
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          parts.push(item);
        } else if (typeof item === 'number' || typeof item === 'boolean') {
          parts.push(String(item));
        } else if (item !== null && typeof item === 'object' && depth < maxDepth) {
          parts.push(extractText(item as Record<string, unknown>, depth + 1, maxDepth));
        }
      }
    } else if (value !== null && typeof value === 'object' && !(value instanceof Date) && depth < maxDepth) {
      parts.push(extractText(value as Record<string, unknown>, depth + 1, maxDepth));
    }
  }

  return parts.filter(p => p.trim().length > 0).join(' ');
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

  // Filter the document
  const filtered = filterDocument(doc, auto);

  // Serialize based on format
  switch (serializer) {
    case 'json':
      return JSON.stringify(filtered);

    case 'text':
      return extractText(filtered, 0, auto.maxDepth ?? 3);

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
