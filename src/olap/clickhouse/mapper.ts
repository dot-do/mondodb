/**
 * ClickHouse Result Mapper
 *
 * Maps ClickHouse JSON responses to BSON documents and vice versa.
 * Handles type conversion, nested objects, arrays, and type preservation
 * for MongoDB-compatible data structures.
 *
 * Issue: mongo.do-vyf4
 */

import { ObjectId } from '../../types/objectid';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * A row from ClickHouse query result
 */
export type ClickHouseRow = Record<string, unknown>;

/**
 * Column metadata from ClickHouse
 */
export interface ClickHouseColumnMeta {
  /** Column name */
  name: string;
  /** ClickHouse data type */
  type: string;
}

/**
 * A BSON document
 */
export type BSONDocument = Record<string, unknown>;

/**
 * Type mapping options
 */
export interface TypeMappingOptions {
  /** Treat UInt8 values (0/1) as booleans */
  treatUInt8AsBool?: boolean;
  /** Treat timestamp values as Date objects */
  treatTimestampAsDate?: boolean;
  /** Preserve ObjectId strings as ObjectId instances */
  preserveObjectId?: boolean;
  /** Preserve binary data (base64 strings to Binary) */
  preserveBinary?: boolean;
  /** Custom field mappers */
  customMappers?: Record<string, (value: unknown) => unknown>;
  /** Field name remapping */
  fieldRenames?: Record<string, string>;
  /** Fields to exclude from result */
  excludeFields?: string[];
  /** Fields to include in result (if specified, only these are included) */
  includeFields?: string[];
}

// =============================================================================
// Long (Int64) Simple Implementation
// =============================================================================

/**
 * Simple Long wrapper for 64-bit integer values
 */
export class Long {
  readonly _bsontype = 'Long' as const;
  private readonly value: bigint;

  constructor(value: string | number | bigint) {
    if (typeof value === 'bigint') {
      this.value = value;
    } else if (typeof value === 'string') {
      this.value = BigInt(value);
    } else {
      this.value = BigInt(value);
    }
  }

  toString(): string {
    return this.value.toString();
  }

  toJSON(): string {
    return this.value.toString();
  }

  toBigInt(): bigint {
    return this.value;
  }
}

// =============================================================================
// Decimal128 Simple Implementation
// =============================================================================

/**
 * Simple Decimal128 wrapper for high-precision decimal values
 */
export class Decimal128 {
  readonly _bsontype = 'Decimal128' as const;
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}

// =============================================================================
// UUID Simple Wrapper
// =============================================================================

/**
 * Simple UUID wrapper for ClickHouse UUID values
 */
export class UUID {
  readonly _bsontype = 'UUID' as const;
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}

// =============================================================================
// Binary Simple Wrapper
// =============================================================================

/**
 * Simple Binary wrapper for binary data
 */
export class Binary {
  readonly _bsontype = 'Binary' as const;
  readonly buffer: Uint8Array;
  readonly length: number;

  constructor(data: Uint8Array | string) {
    if (typeof data === 'string') {
      // Decode base64
      const binary = atob(data);
      this.buffer = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        this.buffer[i] = binary.charCodeAt(i);
      }
    } else {
      this.buffer = data;
    }
    this.length = this.buffer.length;
  }

  toString(): string {
    return btoa(String.fromCharCode.apply(null, Array.from(this.buffer)));
  }

  toJSON(): string {
    return this.toString();
  }
}

// =============================================================================
// Type Parsing Helpers
// =============================================================================

/**
 * Regex patterns for type parsing
 */
const OBJECTID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Check if a string looks like a valid ObjectId
 */
function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && OBJECTID_PATTERN.test(value);
}

/**
 * Check if a string looks like valid JSON object/array
 */
function looksLikeJSON(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

/**
 * Try to parse JSON, return null if invalid
 */
function tryParseJSON(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Parse a ClickHouse type string and extract the inner type for wrapper types
 * Examples:
 * - "Nullable(String)" -> { wrapper: "Nullable", inner: "String" }
 * - "Array(Int32)" -> { wrapper: "Array", inner: "Int32" }
 * - "LowCardinality(String)" -> { wrapper: "LowCardinality", inner: "String" }
 */
function parseWrapperType(type: string): { wrapper: string; inner: string } | null {
  const match = type.match(/^(\w+)\((.+)\)$/);
  if (match && match[1] && match[2]) {
    return { wrapper: match[1], inner: match[2] };
  }
  return null;
}

/**
 * Parse a DateTime string to Date object
 */
function parseDateTime(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // Unix timestamp in seconds
    return new Date(value * 1000);
  }
  if (typeof value === 'string') {
    // Handle ISO format or ClickHouse format
    // ClickHouse: "2024-01-15 10:30:45" or "2024-01-15 10:30:45.123"
    const normalized = value.replace(' ', 'T');
    // Add Z suffix if not present to treat as UTC
    const withTimezone = normalized.includes('Z') || normalized.includes('+') || normalized.includes('-', 10)
      ? normalized
      : normalized + 'Z';
    return new Date(withTimezone);
  }
  return new Date(String(value));
}

/**
 * Parse a Date string (date only, no time)
 */
function parseDateOnly(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    // YYYY-MM-DD format
    return new Date(value + 'T00:00:00Z');
  }
  return new Date(String(value));
}

// =============================================================================
// Result Mapper Class
// =============================================================================

/**
 * Mapper for converting between ClickHouse and BSON formats
 */
export class ClickHouseResultMapper {
  private _options: TypeMappingOptions;

  constructor(options?: TypeMappingOptions) {
    this._options = options ?? {};
  }

  /**
   * Map a single ClickHouse row to BSON document
   */
  map(row: ClickHouseRow, meta: ClickHouseColumnMeta[]): BSONDocument {
    const result: BSONDocument = {};
    const typeMap = new Map(meta.map((m) => [m.name, m.type]));

    for (const [key, value] of Object.entries(row)) {
      // Check if field should be excluded
      if (this._options.excludeFields?.includes(key)) {
        continue;
      }

      // Check if only specific fields should be included
      if (this._options.includeFields && !this._options.includeFields.includes(key)) {
        continue;
      }

      // Get the output key (apply field renaming if configured)
      const outputKey = this._options.fieldRenames?.[key] ?? key;

      // Check for custom mapper for this field
      if (this._options.customMappers?.[key]) {
        result[outputKey] = this._options.customMappers[key](value);
        continue;
      }

      const type = typeMap.get(key) || 'String';
      result[outputKey] = this.convertValue(value, type);
    }

    return result;
  }

  /**
   * Map multiple ClickHouse rows to BSON documents
   */
  mapBatch(rows: ClickHouseRow[], meta: ClickHouseColumnMeta[]): BSONDocument[] {
    return rows.map((row) => this.map(row, meta));
  }

  /**
   * Convert a value based on ClickHouse type
   */
  private convertValue(value: unknown, type: string): unknown {
    // Handle null values
    if (value === null || value === undefined) {
      return null;
    }

    // Handle wrapper types first
    const wrapper = parseWrapperType(type);
    if (wrapper) {
      return this.handleWrapperType(value, wrapper.wrapper, wrapper.inner);
    }

    // Handle base types
    return this.convertBaseType(value, type);
  }

  /**
   * Handle wrapper types like Nullable, Array, LowCardinality
   */
  private handleWrapperType(value: unknown, wrapper: string, inner: string): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    switch (wrapper) {
      case 'Nullable':
        return this.convertValue(value, inner);

      case 'LowCardinality':
        return this.convertValue(value, inner);

      case 'Array':
        if (Array.isArray(value)) {
          // For mixed type arrays, process each item recursively to preserve types
          return value.map((item) => {
            // If item is null/undefined, preserve it
            if (item === null || item === undefined) {
              return item;
            }
            // If inner type is String but item is not a string, preserve original type
            // This handles JSON-like mixed type arrays stored as Array(String)
            if (inner === 'String' && typeof item !== 'string') {
              if (typeof item === 'object') {
                return this.processObjectRecursively(item);
              }
              // Preserve primitives (number, boolean) as-is
              return item;
            }
            // If item is an object, process recursively
            if (typeof item === 'object') {
              return this.processObjectRecursively(item);
            }
            // Otherwise convert based on inner type
            return this.convertValue(item, inner);
          });
        }
        return value;

      case 'Tuple':
        // Tuple is typically returned as an object with named fields
        return this.convertObject(value, inner);

      case 'Object':
        return this.convertObject(value, inner);

      default:
        return this.convertBaseType(value, `${wrapper}(${inner})`);
    }
  }

  /**
   * Convert nested objects, handling ObjectId preservation
   */
  private convertObject(value: unknown, _innerType: string): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    // If it's a string that looks like JSON, try to parse it
    if (looksLikeJSON(value)) {
      const parsed = tryParseJSON(value);
      if (parsed !== null) {
        return this.processObjectRecursively(parsed);
      }
      return value;
    }

    // If it's already an object, process it recursively
    if (typeof value === 'object') {
      return this.processObjectRecursively(value);
    }

    return value;
  }

  /**
   * Process an object recursively, converting ObjectIds and nested structures
   */
  private processObjectRecursively(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map((item) => this.processObjectRecursively(item));
    }

    // Handle objects
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (this._options.preserveObjectId && isObjectIdString(val)) {
          result[key] = new ObjectId(val);
        } else {
          result[key] = this.processObjectRecursively(val);
        }
      }
      return result;
    }

    // Handle primitive ObjectId strings
    if (this._options.preserveObjectId && isObjectIdString(value)) {
      return new ObjectId(value);
    }

    return value;
  }

  /**
   * Convert base types
   */
  private convertBaseType(value: unknown, type: string): unknown {
    // UInt8 can be treated as boolean
    if (type === 'UInt8' && this._options.treatUInt8AsBool) {
      return this.convertBool(value);
    }

    // Large integer types (64/128/256 bit) need special handling
    if (type.match(/^U?Int(64|128|256)$/)) {
      // Check if this should be treated as a timestamp (Date)
      if (this._options.treatTimestampAsDate && typeof value === 'number') {
        return new Date(value);
      }
      return this.convertLargeInteger(value, type);
    }

    // Regular integer types
    if (type.match(/^U?Int(8|16|32)$/)) {
      return this.convertInteger(value);
    }

    // Float types
    if (type.match(/^Float(32|64)$/)) {
      return this.convertFloat(value);
    }

    // Boolean
    if (type === 'Bool') {
      return this.convertBool(value);
    }

    // String types
    if (type === 'String' || type.startsWith('FixedString')) {
      return this.convertString(value, type);
    }

    // DateTime types (includes DateTime, DateTime('UTC'), DateTime64(3), etc.)
    if (type === 'DateTime' || type.startsWith('DateTime(')) {
      return parseDateTime(value);
    }

    if (type.startsWith('DateTime64')) {
      return parseDateTime(value);
    }

    // Date types
    if (type === 'Date' || type === 'Date32') {
      return parseDateOnly(value);
    }

    // UUID
    if (type === 'UUID') {
      return new UUID(String(value));
    }

    // Decimal types
    if (type.startsWith('Decimal')) {
      return new Decimal128(String(value));
    }

    // Enum types
    if (type.startsWith('Enum8') || type.startsWith('Enum16')) {
      return String(value);
    }

    // JSON/Object types
    if (type.startsWith('Object') || type === 'JSON') {
      return this.convertObject(value, type);
    }

    // Array types (without wrapper parsing)
    if (Array.isArray(value)) {
      return value.map((item) => this.processObjectRecursively(item));
    }

    // Default: return as-is
    return value;
  }

  /**
   * Convert integer values
   */
  private convertInteger(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return Number(value);
  }

  /**
   * Convert large integer values (64/128/256 bit)
   * Returns Long wrapper for values that exceed safe integer range
   */
  private convertLargeInteger(value: unknown, _type: string): number | Long | bigint {
    // If it's already a number and within safe range, return as-is
    if (typeof value === 'number') {
      if (Number.isSafeInteger(value)) {
        return value;
      }
      // Value is too large, wrap in Long
      return new Long(BigInt(Math.round(value)));
    }

    // If it's a string (common for large numbers from ClickHouse JSON)
    if (typeof value === 'string') {
      const strValue = value.trim();
      // Try to parse as BigInt first
      try {
        const bigIntValue = BigInt(strValue);
        // Check if it fits in safe integer range
        if (bigIntValue >= BigInt(Number.MIN_SAFE_INTEGER) && bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER)) {
          return Number(bigIntValue);
        }
        // For very large values (e.g., max UInt64), return BigInt directly
        // This provides better interoperability with BigInt operations
        // Long wrapper is still returned for BSON serialization cases
        return bigIntValue;
      } catch {
        // Fallback to regular parsing
        const parsed = parseInt(strValue, 10);
        return isNaN(parsed) ? 0 : parsed;
      }
    }

    return Number(value);
  }

  /**
   * Convert float values
   */
  private convertFloat(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? NaN : parsed;
    }
    return Number(value);
  }

  /**
   * Convert boolean values
   */
  private convertBool(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return Boolean(value);
  }

  /**
   * Convert string values, handling ObjectId and JSON
   */
  private convertString(value: unknown, type: string): unknown {
    // If value is already an object (e.g., nested JSON passed as object), process it directly
    if (typeof value === 'object' && value !== null) {
      return this.processObjectRecursively(value);
    }

    const strValue = String(value);

    // Check for ObjectId in String or FixedString(24)
    if (this._options.preserveObjectId) {
      if (type === 'FixedString(24)' && isObjectIdString(strValue)) {
        return new ObjectId(strValue);
      }
      if (type === 'String' && isObjectIdString(strValue)) {
        return new ObjectId(strValue);
      }
    }

    // Check for binary data (preserveBinary option)
    if (this._options.preserveBinary && type === 'String') {
      // Simple heuristic: if it looks like base64 and isn't JSON
      if (this.looksLikeBase64(strValue) && !looksLikeJSON(strValue)) {
        try {
          return new Binary(strValue);
        } catch {
          // Not valid base64, return as string
        }
      }
      // Handle empty strings
      if (strValue === '') {
        return '';
      }
    }

    // Check for JSON objects in strings
    if (looksLikeJSON(strValue)) {
      const parsed = tryParseJSON(strValue);
      if (parsed !== null) {
        return this.processObjectRecursively(parsed);
      }
    }

    return strValue;
  }

  /**
   * Check if a string looks like base64 encoded data
   */
  private looksLikeBase64(value: string): boolean {
    if (value.length === 0) return false;
    // Base64 pattern: alphanumeric, +, /, and = for padding
    return /^[A-Za-z0-9+/]+=*$/.test(value) && value.length % 4 === 0;
  }

  /**
   * Map a BSON document to ClickHouse format
   */
  reverse(doc: BSONDocument): ClickHouseRow {
    const result: ClickHouseRow = {};
    for (const [key, value] of Object.entries(doc)) {
      const converted = convertBSONType(value, this._options);
      // Skip undefined values
      if (converted !== undefined) {
        result[key] = converted;
      }
    }
    return result;
  }
}

// =============================================================================
// Mapping Functions
// =============================================================================

/**
 * Map a ClickHouse row to a BSON document
 */
export function mapClickHouseToBSON(
  row: ClickHouseRow,
  meta: ClickHouseColumnMeta[],
  options?: TypeMappingOptions
): BSONDocument {
  const mapper = new ClickHouseResultMapper(options);
  return mapper.map(row, meta);
}

/**
 * Map a BSON document to ClickHouse format
 */
export function mapBSONToClickHouse(
  doc: BSONDocument,
  options?: TypeMappingOptions
): ClickHouseRow {
  const mapper = new ClickHouseResultMapper(options);
  return mapper.reverse(doc);
}

/**
 * Convert a ClickHouse value to its BSON equivalent
 */
export function convertClickHouseType(
  value: unknown,
  type: string,
  options?: TypeMappingOptions
): unknown {
  const mapper = new ClickHouseResultMapper(options);
  // Use the private method via a temporary row/meta
  const row: ClickHouseRow = { __value: value };
  const meta: ClickHouseColumnMeta[] = [{ name: '__value', type }];
  const result = mapper.map(row, meta);
  return result.__value;
}

/**
 * Format a Date to ClickHouse DateTime64 string format
 */
function formatClickHouseDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Convert a BSON value to its ClickHouse equivalent
 */
export function convertBSONType(
  value: unknown,
  options?: TypeMappingOptions
): unknown {
  // Return undefined to signal the field should be omitted
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  // Handle ObjectId
  if (value instanceof ObjectId) {
    return value.toHexString();
  }

  // Handle Decimal128
  if (value instanceof Decimal128) {
    return value.toString();
  }

  // Handle UUID
  if (value instanceof UUID) {
    return value.toString();
  }

  // Handle Binary
  if (value instanceof Binary) {
    return value.toString();
  }

  // Handle Long
  if (value instanceof Long) {
    return value.toString();
  }

  // Handle Date - format as ClickHouse DateTime64 string
  if (value instanceof Date) {
    return formatClickHouseDateTime(value);
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => convertBSONType(item, options));
  }

  // Handle objects
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const converted = convertBSONType(val, options);
      // Skip undefined values (don't include in result)
      if (converted !== undefined) {
        result[key] = converted;
      }
    }
    return result;
  }

  return value;
}
