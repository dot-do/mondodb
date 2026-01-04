/**
 * QueryTranslator - Translates MongoDB-style queries to SQL
 * using json_extract for field access on JSON documents.
 *
 * Features:
 * - Operator registry pattern for extensibility
 * - Automatic flattening of nested $and/$or for SQL optimization
 * - CTE-based optimization for multiple array operations
 * - Parameterized queries for SQL injection prevention
 * - $text operator for full-text search with FTS5
 * - Multi-dialect support (SQLite, ClickHouse)
 */

import { validateFieldPath } from '../utils/sql-safety.js';
import {
  type SQLDialect,
  type DialectOptions,
  validateDialect,
  jsonExtract as dialectJsonExtract,
  jsonType as dialectJsonType,
  jsonTypeWithPath as dialectJsonTypeWithPath,
  jsonArrayLength as dialectJsonArrayLength,
  regexMatch as dialectRegexMatch,
} from './dialect.js';

export interface TranslatedQuery {
  sql: string;
  params: unknown[];
  /** Whether this query requires an FTS5 join */
  requiresFTS?: boolean;
  /** The FTS5 match expression (for building full query) */
  ftsMatch?: string;
}

type QueryValue = unknown;
type QueryCondition = Record<string, QueryValue>;

/**
 * Operator handler type for the registry pattern
 */
type OperatorHandler = (
  path: string,
  value: QueryValue,
  params: unknown[]
) => string;

/**
 * MongoDB type to SQLite json_type mapping
 */
const MONGO_TYPE_TO_SQLITE: Record<string, string | string[]> = {
  string: 'text',
  number: ['integer', 'real'],
  bool: ['true', 'false'],
  boolean: ['true', 'false'],
  array: 'array',
  object: 'object',
  null: 'null',
};

/**
 * Options for query translation
 */
export interface TranslateOptions extends DialectOptions {
  /**
   * Enable CTE optimization for array operations
   * When enabled, multiple array checks on the same field use a single CTE
   */
  useCTE?: boolean;

  /**
   * Flatten nested logical operators
   * When enabled, nested $and/$or of the same type are merged
   */
  flattenLogical?: boolean;
}

const DEFAULT_OPTIONS: TranslateOptions = {
  useCTE: true,
  flattenLogical: true,
  dialect: 'sqlite',
};

/**
 * QueryTranslator - Converts MongoDB query syntax to SQL with json_extract
 */
export class QueryTranslator {
  private options: TranslateOptions;
  private dialect: SQLDialect;

  constructor(options: TranslateOptions = {}) {
    // Validate dialect before merging options
    const dialect = validateDialect(options.dialect);
    this.options = { ...DEFAULT_OPTIONS, ...options, dialect };
    this.dialect = dialect;
  }

  /**
   * Registry of comparison operators and their SQL translations
   */
  private comparisonOperators: Record<string, OperatorHandler> = {
    $eq: (path, value, params) => {
      if (value === null) {
        return `${this.jsonExtract(path)} IS NULL`;
      }
      // SQLite's json_extract returns 1/0 for booleans, so convert JS booleans
      const sqlValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      params.push(sqlValue);
      return `${this.jsonExtract(path)} = ?`;
    },
    $ne: (path, value, params) => {
      if (value === null) {
        return `${this.jsonExtract(path)} IS NOT NULL`;
      }
      // SQLite's json_extract returns 1/0 for booleans, so convert JS booleans
      const sqlValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      params.push(sqlValue);
      return `${this.jsonExtract(path)} != ?`;
    },
    $gt: (path, value, params) => {
      params.push(value);
      return `${this.jsonExtract(path)} > ?`;
    },
    $gte: (path, value, params) => {
      params.push(value);
      return `${this.jsonExtract(path)} >= ?`;
    },
    $lt: (path, value, params) => {
      params.push(value);
      return `${this.jsonExtract(path)} < ?`;
    },
    $lte: (path, value, params) => {
      params.push(value);
      return `${this.jsonExtract(path)} <= ?`;
    },
    $in: (path, value, params) => {
      const arr = value as unknown[];
      if (arr.length === 0) {
        return '0 = 1';
      }
      params.push(...arr);
      const placeholders = arr.map(() => '?').join(', ');
      return `${this.jsonExtract(path)} IN (${placeholders})`;
    },
    $nin: (path, value, params) => {
      const arr = value as unknown[];
      if (arr.length === 0) {
        return '1 = 1';
      }
      params.push(...arr);
      const placeholders = arr.map(() => '?').join(', ');
      return `${this.jsonExtract(path)} NOT IN (${placeholders})`;
    },
    $regex: (path, value, params) => {
      // Handle both { $regex: "pattern" } and { $regex: "pattern", $options: "i" }
      // Also handle direct { field: { $regex: /pattern/i } } form
      // Also support $regexType: 'glob' for SQLite GLOB syntax
      let pattern: string;
      let options: string = '';
      let regexType: string = 'like'; // default to LIKE pattern matching

      if (typeof value === 'string') {
        pattern = value;
      } else if (value instanceof RegExp) {
        pattern = value.source;
        options = value.flags;
      } else if (value && typeof value === 'object') {
        const regexObj = value as { $regex?: string; $options?: string; $regexType?: string };
        pattern = regexObj.$regex || '';
        options = regexObj.$options || '';
        regexType = regexObj.$regexType || 'like';
      } else {
        pattern = String(value);
      }

      const fieldExpr = this.jsonExtract(path);
      const caseInsensitive = options.includes('i');

      // Handle GLOB type for SQLite
      if (regexType === 'glob' && this.dialect === 'sqlite') {
        params.push(pattern);
        const typeCheck = `json_type(${fieldExpr}) = 'text'`;
        return `(${typeCheck} AND ${fieldExpr} GLOB ?)`;
      }

      // Convert regex pattern to LIKE pattern
      // This is a simplified conversion that handles common cases
      const likePattern = this.regexToLike(pattern, options);
      params.push(likePattern);

      // First ensure the field is a string type (regex only works on strings)
      if (this.dialect === 'clickhouse') {
        const typeCheck = `JSONType(data, ${path.replace(/^\$\.?/, '').split('.').map(p => `'${p}'`).join(', ')}) = 'String'`;
        const matchExpr = dialectRegexMatch(this.dialect, fieldExpr, '?', caseInsensitive);
        return `(${typeCheck} AND ${matchExpr})`;
      }

      const typeCheck = `json_type(${fieldExpr}) = 'text'`;
      const matchExpr = dialectRegexMatch(this.dialect, fieldExpr, '?', caseInsensitive);
      return `(${typeCheck} AND ${matchExpr})`;
    },
    $mod: (path, value, params) => {
      // $mod: [divisor, remainder] - matches if field % divisor == remainder
      const [divisor, remainder] = value as [number, number];
      params.push(divisor, remainder);
      // Check that the field is numeric and apply modulo
      // Use CAST to handle float truncation like MongoDB
      return `(json_type(${this.jsonExtract(path)}) IN ('integer', 'real') AND CAST(${this.jsonExtract(path)} AS INTEGER) % ? = ?)`;
    },
  };

  /**
   * Registry of element operators
   */
  private elementOperators: Record<string, OperatorHandler> = {
    $exists: (path, value, _params) => {
      // MongoDB $exists distinguishes between missing fields and null values:
      // - $exists: true  -> field exists (including explicit null values)
      // - $exists: false -> field is completely missing from the document
      //
      // SQLite's json_extract returns NULL for both missing fields AND null values,
      // but json_type returns 'null' for explicit nulls and NULL for missing fields.
      // So we use json_type with path directly to properly detect field existence.
      if (path.startsWith('$')) {
        // JSON path - use json_type(data, path) directly for existence checks
        const typeExpr = dialectJsonTypeWithPath(this.dialect, 'data', path);
        if (value) {
          return `${typeExpr} IS NOT NULL`;
        }
        return `${typeExpr} IS NULL`;
      }
      // Direct reference (for elemMatch context) - use json_type
      if (this.dialect === 'clickhouse') {
        if (value) {
          return `JSONType(${path}) IS NOT NULL`;
        }
        return `JSONType(${path}) IS NULL`;
      }
      if (value) {
        return `json_type(${path}) IS NOT NULL`;
      }
      return `json_type(${path}) IS NULL`;
    },
    $type: (path, value, _params) => {
      const mongoType = value as string;
      const sqliteType = MONGO_TYPE_TO_SQLITE[mongoType];
      const typeExpr = dialectJsonType(this.dialect, 'data', path);

      if (Array.isArray(sqliteType)) {
        if (mongoType === 'number') {
          if (this.dialect === 'clickhouse') {
            return `${typeExpr} IN ('Int64', 'Float64', 'UInt64')`;
          }
          return `${typeExpr} IN ('integer', 'real')`;
        }
        // bool type checks for true/false values
        if (this.dialect === 'clickhouse') {
          return `${typeExpr} = 'Bool'`;
        }
        return `${typeExpr} IN ('true', 'false')`;
      }
      if (this.dialect === 'clickhouse') {
        const chType = mongoType === 'string' ? 'String' : mongoType === 'array' ? 'Array' : mongoType === 'object' ? 'Object' : sqliteType;
        return `${typeExpr} = '${chType}'`;
      }
      return `${typeExpr} = '${sqliteType}'`;
    },
  };

  /**
   * Registry of array operators
   */
  private arrayOperators: Record<string, OperatorHandler> = {
    $size: (path, value, params) => {
      params.push(value);
      const lenExpr = dialectJsonArrayLength(this.dialect, 'data', path);
      return `${lenExpr} = ?`;
    },
    $all: (path, value, params) => {
      const arr = value as unknown[];
      if (arr.length === 0) {
        return '1 = 1';
      }
      // Each value must exist in the array using EXISTS with json_each
      const conditions = arr.map((v) => {
        params.push(v);
        return `EXISTS (SELECT 1 FROM json_each(${this.jsonExtract(path)}) WHERE value = ?)`;
      });
      return conditions.length === 1
        ? conditions[0]
        : `(${conditions.join(' AND ')})`;
    },
    $elemMatch: (path, value, params) => {
      const conditions = value as QueryCondition;
      // Generate subquery for array element matching
      const innerConditions = this.translateElemMatchConditions(conditions, params);
      return `EXISTS (SELECT 1 FROM json_each(${this.jsonExtract(path)}) WHERE ${innerConditions})`;
    },
  };

  /**
   * Main entry point - translate a MongoDB query to SQL
   */
  translate(query: Record<string, unknown>): TranslatedQuery {
    const params: unknown[] = [];

    if (Object.keys(query).length === 0) {
      return { sql: '1 = 1', params: [] };
    }

    // Pre-process to flatten nested logical operators if enabled
    const processedQuery = this.options.flattenLogical
      ? this.flattenLogicalOperators(query)
      : query;

    const sql = this.translateDocument(processedQuery, params);
    return { sql, params };
  }

  /**
   * Flatten nested logical operators of the same type
   * E.g., $and: [{ $and: [a, b] }, c] -> $and: [a, b, c]
   */
  private flattenLogicalOperators(
    query: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(query)) {
      if (key === '$and' || key === '$or') {
        const conditions = value as Record<string, unknown>[];
        const flattened: Record<string, unknown>[] = [];

        for (const condition of conditions) {
          // Recursively flatten nested conditions
          const flatCondition = this.flattenLogicalOperators(condition);

          // If the nested condition is the same logical operator, merge it
          if (Object.keys(flatCondition).length === 1 && flatCondition[key]) {
            const nestedConditions = flatCondition[key] as Record<string, unknown>[];
            flattened.push(...nestedConditions);
          } else {
            flattened.push(flatCondition);
          }
        }

        result[key] = flattened;
      } else if (key === '$nor') {
        // $nor cannot be flattened the same way, but we still process nested conditions
        const conditions = value as Record<string, unknown>[];
        result[key] = conditions.map(c => this.flattenLogicalOperators(c));
      } else if (key.startsWith('$')) {
        // Other operators, just copy
        result[key] = value;
      } else {
        // Field condition - recursively process if it's an object
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const operators = value as Record<string, unknown>;
          const processedOps: Record<string, unknown> = {};

          for (const [op, opValue] of Object.entries(operators)) {
            if (op === '$not' && opValue && typeof opValue === 'object') {
              processedOps[op] = this.flattenLogicalOperators(opValue as Record<string, unknown>);
            } else if (op === '$elemMatch' && opValue && typeof opValue === 'object') {
              processedOps[op] = this.flattenLogicalOperators(opValue as Record<string, unknown>);
            } else {
              processedOps[op] = opValue;
            }
          }
          result[key] = processedOps;
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Translate a query document (top-level or nested)
   */
  private translateDocument(
    query: Record<string, unknown>,
    params: unknown[]
  ): string {
    const conditions: string[] = [];

    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith('$')) {
        // Logical operator at top level
        const sql = this.translateLogicalOperator(key, value, params);
        conditions.push(sql);
      } else {
        // Field condition
        const sql = this.translateField(key, value, params);
        conditions.push(sql);
      }
    }

    if (conditions.length === 0) {
      return '1 = 1';
    }

    if (conditions.length === 1) {
      return conditions[0];
    }

    return `(${conditions.join(' AND ')})`;
  }

  /**
   * Translate a field condition
   */
  private translateField(
    field: string,
    value: unknown,
    params: unknown[]
  ): string {
    const path = this.fieldToJsonPath(field);

    // Direct value comparison (implicit $eq)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return this.comparisonOperators.$eq(path, value, params);
    }

    // Object with operators
    const operators = value as Record<string, unknown>;
    const operatorKeys = Object.keys(operators);

    // Check if it's an object with operators
    if (operatorKeys.length > 0 && operatorKeys.every(k => k.startsWith('$'))) {
      return this.translateFieldConditions(path, operators, params, false);
    }

    // Plain object equality (implicit $eq)
    return this.comparisonOperators.$eq(path, value, params);
  }

  /**
   * Translate conditions on a single field
   */
  private translateFieldConditions(
    path: string,
    conditions: Record<string, unknown>,
    params: unknown[],
    isElemMatch: boolean
  ): string {
    const sqlParts: string[] = [];

    // Check for $regex with sibling $options or $regexType
    const hasRegexWithOptions = '$regex' in conditions && ('$options' in conditions || '$regexType' in conditions);

    for (const [op, value] of Object.entries(conditions)) {
      // Skip $options and $regexType when they're siblings of $regex (handled together with $regex)
      if ((op === '$options' || op === '$regexType') && hasRegexWithOptions) {
        continue;
      }

      let sql: string;

      if (op === '$not') {
        // $not wraps another operator
        const innerConditions = value as Record<string, unknown>;
        const innerSql = this.translateFieldConditions(path, innerConditions, params, isElemMatch);
        sql = `NOT (${innerSql})`;
      } else if (op === '$regex' && hasRegexWithOptions) {
        // Handle $regex with sibling $options or $regexType
        const actualPath = isElemMatch ? this.elemMatchFieldPath(path, '') : path;
        const regexValue = {
          $regex: value,
          $options: conditions.$options,
          $regexType: conditions.$regexType
        };
        sql = this.comparisonOperators[op](actualPath, regexValue, params);
      } else if (this.comparisonOperators[op]) {
        const actualPath = isElemMatch ? this.elemMatchFieldPath(path, '') : path;
        sql = this.comparisonOperators[op](actualPath, value, params);
      } else if (this.elementOperators[op]) {
        const actualPath = isElemMatch ? this.elemMatchFieldPath(path, '') : path;
        sql = this.elementOperators[op](actualPath, value, params);
      } else if (this.arrayOperators[op]) {
        const actualPath = isElemMatch ? this.elemMatchFieldPath(path, '') : path;
        sql = this.arrayOperators[op](actualPath, value, params);
      } else {
        // Unknown operator - treat as nested field in elemMatch context
        if (isElemMatch) {
          const nestedPath = this.elemMatchFieldPath(path, op.replace('$', ''));
          sql = this.translateFieldConditions(nestedPath, { $eq: value }, params, true);
        } else {
          throw new Error(`Unknown operator: ${op}`);
        }
      }

      sqlParts.push(sql);
    }

    if (sqlParts.length === 0) {
      return '1 = 1';
    }

    if (sqlParts.length === 1) {
      return sqlParts[0];
    }

    return `(${sqlParts.join(' AND ')})`;
  }

  /**
   * Translate logical operators ($and, $or, $not, $nor, $text)
   */
  private translateLogicalOperator(
    op: string,
    value: unknown,
    params: unknown[]
  ): string {
    switch (op) {
      case '$and': {
        const conditions = value as Record<string, unknown>[];
        if (conditions.length === 0) {
          return '1 = 1';
        }
        const parts = conditions.map(c => this.translateDocument(c, params));
        if (parts.length === 1) {
          return parts[0];
        }
        return `(${parts.join(' AND ')})`;
      }

      case '$or': {
        const conditions = value as Record<string, unknown>[];
        if (conditions.length === 0) {
          return '0 = 1';
        }
        const parts = conditions.map(c => this.translateDocument(c, params));
        if (parts.length === 1) {
          return parts[0];
        }
        return `(${parts.join(' OR ')})`;
      }

      case '$nor': {
        const conditions = value as Record<string, unknown>[];
        if (conditions.length === 0) {
          return '1 = 1';
        }
        const parts = conditions.map(c => this.translateDocument(c, params));
        return `NOT (${parts.join(' OR ')})`;
      }

      case '$not': {
        // $not at top level wraps a condition
        const innerSql = this.translateDocument(value as Record<string, unknown>, params);
        return `NOT (${innerSql})`;
      }

      case '$text': {
        // $text operator for full-text search
        const textOp = value as Record<string, unknown>;
        const { sql } = this.translateTextOperator(textOp, params);
        return sql;
      }

      default:
        throw new Error(`Unknown logical operator: ${op}`);
    }
  }

  /**
   * Convert a field name to a JSON path
   * e.g., "a.b.c" -> "$.a.b.c"
   * e.g., "items.0.name" -> "$.items[0].name"
   *
   * SECURITY: Validates field name to prevent SQL injection attacks.
   * @throws Error if field contains invalid characters
   */
  private fieldToJsonPath(field: string): string {
    // Validate the entire field path to prevent SQL injection
    validateFieldPath(field);

    const parts = field.split('.');
    let path = '$';

    for (const part of parts) {
      // Check if part is a numeric index
      if (/^\d+$/.test(part)) {
        path += `[${part}]`;
      } else {
        path += `.${part}`;
      }
    }

    return path;
  }

  /**
   * Generate json_extract SQL for a path
   */
  private jsonExtract(path: string): string {
    // If path starts with $, it's a JSON path
    if (path.startsWith('$')) {
      return dialectJsonExtract(this.dialect, 'data', path);
    }
    // Otherwise, it's a direct reference (for elemMatch context)
    return path;
  }

  /**
   * Generate path for elemMatch field access
   * SECURITY: Validates field name to prevent SQL injection attacks.
   */
  private elemMatchFieldPath(basePath: string, field: string): string {
    if (basePath === 'value') {
      // Inside json_each, value is the current element
      if (field === '') {
        return 'value';
      }
      // Validate field name to prevent SQL injection
      validateFieldPath(field);
      return `json_extract(value, '$.${field}')`;
    }
    if (field === '') {
      return basePath;
    }
    // Validate field name to prevent SQL injection
    validateFieldPath(field);
    return `${basePath}.${field}`;
  }

  /**
   * Convert a regex pattern to SQLite LIKE/GLOB pattern
   * This handles common regex patterns:
   * - ^pattern -> pattern% (starts with)
   * - pattern$ -> %pattern (ends with)
   * - ^pattern$ -> pattern (exact match)
   * - .* or .+ -> % (any characters)
   * - . -> _ (single character)
   * - [0-9] -> character class (converted to GLOB syntax)
   * - [a-z] -> character class (converted to GLOB syntax)
   * - Literal text -> %text% (contains, default behavior)
   *
   * @param pattern The regex pattern to convert
   * @param options Regex options (i=case-insensitive, m=multiline)
   */
  private regexToLike(pattern: string, options: string = ''): string {
    // For multiline mode, we need special handling of ^ and $
    // In multiline mode, ^ matches start of line (after \n) and $ matches before \n
    const isMultiline = options.includes('m');

    // Handle anchors
    let startsWithAnchor = pattern.startsWith('^');
    let endsWithAnchor = pattern.endsWith('$') && !pattern.endsWith('\\$');

    // In multiline mode, anchors match line boundaries, not string boundaries
    // Since LIKE can't match line boundaries, we convert to contains match
    if (isMultiline && (startsWithAnchor || endsWithAnchor)) {
      // For multiline, we treat ^ and $ as matching within the string
      // This is an approximation - LIKE can't truly match line boundaries
      // But we can check for patterns after newline or before newline
      startsWithAnchor = false;
      endsWithAnchor = false;
    }

    // Remove anchors for processing
    let processed = pattern;
    if (pattern.startsWith('^')) {
      processed = processed.slice(1);
    }
    if (processed.endsWith('$') && !processed.endsWith('\\$')) {
      processed = processed.slice(0, -1);
    }

    // Process character by character to handle escaping properly
    let result = '';
    let i = 0;
    while (i < processed.length) {
      const char = processed[i];
      const nextChar = processed[i + 1];

      if (char === '\\' && nextChar !== undefined) {
        // Escaped character in regex - keep literal character
        // But we need to escape it for LIKE if it's a special LIKE character
        if (nextChar === '%' || nextChar === '_') {
          result += '\\' + nextChar;
        } else {
          result += nextChar;
        }
        i += 2;
      } else if (char === '[') {
        // Character class - find the closing bracket
        const endBracket = processed.indexOf(']', i + 1);
        if (endBracket !== -1) {
          const charClass = processed.slice(i + 1, endBracket);
          // Convert common character classes to approximate LIKE patterns
          // [0-9] -> _ (single digit) or % for multiple
          // [a-zA-Z] -> _ (single letter)
          // For now, use _ as a single character match (approximation)
          if (charClass.includes('+') || processed[endBracket + 1] === '+') {
            result += '%';
            i = endBracket + (processed[endBracket + 1] === '+' ? 2 : 1);
          } else if (processed[endBracket + 1] === '*') {
            result += '%';
            i = endBracket + 2;
          } else {
            result += '_';
            i = endBracket + 1;
          }
        } else {
          // No closing bracket, treat [ as literal
          result += char;
          i += 1;
        }
      } else if (char === '.' && nextChar === '*') {
        // .* -> % (any characters)
        result += '%';
        i += 2;
      } else if (char === '.' && nextChar === '+') {
        // .+ -> % (one or more characters, approximate with %)
        result += '%';
        i += 2;
      } else if (char === '.') {
        // . -> _ (single character)
        result += '_';
        i += 1;
      } else if (char === '%') {
        // Escape literal % for LIKE
        result += '\\%';
        i += 1;
      } else if (char === '_') {
        // Escape literal _ for LIKE
        result += '\\_';
        i += 1;
      } else if (char === '+' || char === '*' || char === '?' || char === '|' || char === '(' || char === ')') {
        // Skip regex quantifiers and grouping - not directly translatable to LIKE
        // These would need more sophisticated handling
        i += 1;
      } else {
        // Regular character
        result += char;
        i += 1;
      }
    }

    // Apply wildcards based on anchors
    if (!startsWithAnchor && !endsWithAnchor) {
      // No anchors: match anywhere (contains)
      return `%${result}%`;
    } else if (startsWithAnchor && !endsWithAnchor) {
      // Starts with anchor only
      return `${result}%`;
    } else if (!startsWithAnchor && endsWithAnchor) {
      // Ends with anchor only
      return `%${result}`;
    } else {
      // Both anchors: exact match
      return result;
    }
  }

  /**
   * Translate conditions inside $elemMatch
   * This handles document conditions like { field: value, field: { $op: value } }
   * SECURITY: Validates field names to prevent SQL injection attacks.
   */
  private translateElemMatchConditions(
    conditions: Record<string, unknown>,
    params: unknown[]
  ): string {
    const sqlParts: string[] = [];

    for (const [field, value] of Object.entries(conditions)) {
      // Validate field name to prevent SQL injection
      validateFieldPath(field);
      // In elemMatch, 'value' refers to the current array element from json_each
      // For nested fields, we use json_extract(value, '$.field')
      const extractPath = `json_extract(value, '$.${field}')`;

      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        // Direct value comparison
        if (value === null) {
          sqlParts.push(`${extractPath} IS NULL`);
        } else {
          params.push(value);
          sqlParts.push(`${extractPath} = ?`);
        }
      } else {
        // Object with operators
        const operators = value as Record<string, unknown>;
        const opKeys = Object.keys(operators);

        if (opKeys.length > 0 && opKeys.every(k => k.startsWith('$'))) {
          // It's operators like { $gte: 90 }
          for (const [op, opValue] of Object.entries(operators)) {
            const opSql = this.translateElemMatchOperator(extractPath, op, opValue, params);
            sqlParts.push(opSql);
          }
        } else {
          // Plain object equality
          params.push(JSON.stringify(value));
          sqlParts.push(`${extractPath} = json(?)`);
        }
      }
    }

    if (sqlParts.length === 0) {
      return '1 = 1';
    }

    return sqlParts.length === 1 ? sqlParts[0] : `(${sqlParts.join(' AND ')})`;
  }

  /**
   * Translate a single operator for elemMatch context
   */
  private translateElemMatchOperator(
    path: string,
    op: string,
    value: unknown,
    params: unknown[]
  ): string {
    switch (op) {
      case '$eq': {
        if (value === null) {
          return `${path} IS NULL`;
        }
        // SQLite's json_extract returns 1/0 for booleans, so convert JS booleans
        const eqValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
        params.push(eqValue);
        return `${path} = ?`;
      }
      case '$ne': {
        if (value === null) {
          return `${path} IS NOT NULL`;
        }
        // SQLite's json_extract returns 1/0 for booleans, so convert JS booleans
        const neValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
        params.push(neValue);
        return `${path} != ?`;
      }
      case '$gt':
        params.push(value);
        return `${path} > ?`;
      case '$gte':
        params.push(value);
        return `${path} >= ?`;
      case '$lt':
        params.push(value);
        return `${path} < ?`;
      case '$lte':
        params.push(value);
        return `${path} <= ?`;
      case '$in': {
        const arr = value as unknown[];
        if (arr.length === 0) return '0 = 1';
        params.push(...arr);
        return `${path} IN (${arr.map(() => '?').join(', ')})`;
      }
      case '$nin': {
        const arr = value as unknown[];
        if (arr.length === 0) return '1 = 1';
        params.push(...arr);
        return `${path} NOT IN (${arr.map(() => '?').join(', ')})`;
      }
      case '$exists':
        // Use json_type to distinguish between null values and missing fields
        return value ? `json_type(${path}) IS NOT NULL` : `json_type(${path}) IS NULL`;
      case '$regex': {
        // Handle $regex in elemMatch context
        let pattern: string;
        let options: string = '';

        if (typeof value === 'string') {
          pattern = value;
        } else if (value instanceof RegExp) {
          pattern = value.source;
          options = value.flags;
        } else if (value && typeof value === 'object') {
          const regexObj = value as { $regex?: string; $options?: string };
          pattern = regexObj.$regex || '';
          options = regexObj.$options || '';
        } else {
          pattern = String(value);
        }

        const likePattern = this.regexToLike(pattern, options);
        params.push(likePattern);

        // Add type check to ensure we only match string values
        const typeCheck = `json_type(${path}) = 'text'`;

        if (options.includes('i')) {
          return `(${typeCheck} AND LOWER(${path}) LIKE LOWER(?))`;
        }
        return `(${typeCheck} AND ${path} LIKE ?)`;
      }
      case '$mod': {
        // Handle $mod in elemMatch context
        const [divisor, remainder] = value as [number, number];
        params.push(divisor, remainder);
        return `(json_type(${path}) IN ('integer', 'real') AND CAST(${path} AS INTEGER) % ? = ?)`;
      }
      default:
        throw new Error(`Unsupported operator in $elemMatch: ${op}`);
    }
  }

  /**
   * Generate optimized SQL with CTE for multiple array operations on the same field
   * This is useful when you have multiple $all checks or $elemMatch on the same array
   *
   * Example output:
   * WITH array_cte AS (
   *   SELECT value FROM json_each(json_extract(data, '$.tags'))
   * )
   * SELECT * FROM documents WHERE
   *   EXISTS (SELECT 1 FROM array_cte WHERE value = ?) AND
   *   EXISTS (SELECT 1 FROM array_cte WHERE value = ?)
   */
  translateWithCTE(
    query: Record<string, unknown>,
    tableName: string = 'documents'
  ): TranslatedQuery {
    const params: unknown[] = [];

    if (Object.keys(query).length === 0) {
      return { sql: `SELECT * FROM ${tableName}`, params: [] };
    }

    // Collect all array fields that have multiple operations
    const arrayFieldOps = this.collectArrayOperations(query);
    const cteDefinitions: string[] = [];
    const cteAliases: Map<string, string> = new Map();
    let cteIndex = 0;

    // Create CTEs for fields with multiple array operations
    for (const [field, count] of arrayFieldOps.entries()) {
      if (count > 1) {
        const alias = `arr_cte_${cteIndex++}`;
        const path = this.fieldToJsonPath(field);
        cteDefinitions.push(
          `${alias} AS (SELECT value FROM json_each(json_extract(data, '${path}')))`
        );
        cteAliases.set(field, alias);
      }
    }

    // Translate the query, replacing repeated json_each with CTE references
    const whereClause = this.translateDocumentWithCTE(query, params, cteAliases);

    let sql: string;
    if (cteDefinitions.length > 0) {
      sql = `WITH ${cteDefinitions.join(', ')} SELECT * FROM ${tableName} WHERE ${whereClause}`;
    } else {
      sql = `SELECT * FROM ${tableName} WHERE ${whereClause}`;
    }

    return { sql, params };
  }

  /**
   * Collect array operations for CTE optimization analysis
   */
  private collectArrayOperations(
    query: Record<string, unknown>,
    counts: Map<string, number> = new Map()
  ): Map<string, number> {
    for (const [key, value] of Object.entries(query)) {
      if (key === '$and' || key === '$or' || key === '$nor') {
        const conditions = value as Record<string, unknown>[];
        for (const condition of conditions) {
          this.collectArrayOperations(condition, counts);
        }
      } else if (!key.startsWith('$') && value && typeof value === 'object') {
        const operators = value as Record<string, unknown>;
        for (const op of Object.keys(operators)) {
          if (op === '$all' || op === '$elemMatch') {
            counts.set(key, (counts.get(key) || 0) + 1);
          }
        }
      }
    }
    return counts;
  }

  /**
   * Translate document using CTE aliases where applicable
   */
  private translateDocumentWithCTE(
    query: Record<string, unknown>,
    params: unknown[],
    cteAliases: Map<string, string>
  ): string {
    // For now, fall back to standard translation
    // CTE optimization would replace json_each references with CTE aliases
    // This is a placeholder for full CTE implementation
    return this.translateDocument(query, params);
  }

  /**
   * Register a custom comparison operator
   * Allows extending the translator with custom operators
   */
  registerOperator(name: string, handler: OperatorHandler): void {
    if (!name.startsWith('$')) {
      throw new Error('Operator name must start with $');
    }
    this.comparisonOperators[name] = handler;
  }

  /**
   * Register a custom element operator
   */
  registerElementOperator(name: string, handler: OperatorHandler): void {
    if (!name.startsWith('$')) {
      throw new Error('Operator name must start with $');
    }
    this.elementOperators[name] = handler;
  }

  /**
   * Register a custom array operator
   */
  registerArrayOperator(name: string, handler: OperatorHandler): void {
    if (!name.startsWith('$')) {
      throw new Error('Operator name must start with $');
    }
    this.arrayOperators[name] = handler;
  }

  /**
   * Translate a MongoDB $text query to FTS5 MATCH SQL
   */
  private translateTextOperator(
    textOp: Record<string, unknown>,
    params: unknown[]
  ): { sql: string; ftsMatch: string } {
    const search = textOp.$search as string;
    const caseSensitive = textOp.$caseSensitive as boolean | undefined;
    const diacriticSensitive = textOp.$diacriticSensitive as boolean | undefined;

    // Handle empty search string
    if (!search || search.trim() === '') {
      return { sql: '0 = 1', ftsMatch: '' };
    }

    // Convert MongoDB text search syntax to FTS5 syntax
    const ftsQuery = this.convertToFTS5Query(search, caseSensitive, diacriticSensitive);

    params.push(ftsQuery);

    // Generate the FTS5 MATCH condition
    // This will be joined with the main documents table using rowid
    const sql = `id IN (SELECT rowid FROM {{FTS_TABLE}} WHERE {{FTS_TABLE}} MATCH ?)`;

    return { sql, ftsMatch: ftsQuery };
  }

  /**
   * Convert MongoDB text search syntax to FTS5 query syntax
   *
   * MongoDB syntax:
   * - "word" -> matches word
   * - "word1 word2" -> matches word1 OR word2
   * - "\"phrase\"" -> matches exact phrase
   * - "-word" -> excludes word (negation)
   *
   * FTS5 syntax:
   * - "word" -> matches word
   * - "word1 OR word2" -> matches word1 or word2
   * - "word1 word2" -> matches word1 AND word2
   * - "\"phrase\"" -> matches exact phrase
   * - "NOT word" -> excludes word
   */
  private convertToFTS5Query(
    search: string,
    caseSensitive?: boolean,
    diacriticSensitive?: boolean
  ): string {
    // Escape special FTS5 characters except quotes and minus
    const escaped = search.replace(/[&|()^~*:]/g, (char) => {
      return '\\' + char;
    });

    const tokens: string[] = [];
    let remaining = escaped.trim();

    // Parse the search string for phrases and terms
    while (remaining.length > 0) {
      remaining = remaining.trim();

      // Check for quoted phrase
      if (remaining.startsWith('"')) {
        const endQuote = remaining.indexOf('"', 1);
        if (endQuote > 1) {
          const phrase = remaining.slice(1, endQuote);
          tokens.push(`"${phrase}"`);
          remaining = remaining.slice(endQuote + 1);
          continue;
        }
      }

      // Check for negation
      if (remaining.startsWith('-')) {
        const spaceIdx = remaining.indexOf(' ');
        const term = spaceIdx > 0 ? remaining.slice(1, spaceIdx) : remaining.slice(1);
        if (term) {
          tokens.push(`NOT ${term}`);
        }
        remaining = spaceIdx > 0 ? remaining.slice(spaceIdx + 1) : '';
        continue;
      }

      // Regular term
      const spaceIdx = remaining.indexOf(' ');
      const term = spaceIdx > 0 ? remaining.slice(0, spaceIdx) : remaining;
      if (term) {
        tokens.push(term);
      }
      remaining = spaceIdx > 0 ? remaining.slice(spaceIdx + 1) : '';
    }

    // Join tokens - MongoDB uses OR by default for multiple terms
    // FTS5 uses AND by default, so we explicitly use OR
    if (tokens.length === 0) {
      return '*'; // Match all if no valid tokens
    }

    // Separate NOT terms from regular terms
    const notTerms = tokens.filter(t => t.startsWith('NOT '));
    const regularTerms = tokens.filter(t => !t.startsWith('NOT '));

    let query = '';
    if (regularTerms.length > 0) {
      // Use OR for regular terms (MongoDB default behavior)
      query = regularTerms.join(' OR ');
    }

    // Add NOT terms with AND
    if (notTerms.length > 0) {
      if (query) {
        query = `(${query}) AND ${notTerms.join(' AND ')}`;
      } else {
        // Only negations - need a base to negate from
        query = `* AND ${notTerms.join(' AND ')}`;
      }
    }

    return query;
  }

  /**
   * Translate a query with $meta projection support for textScore
   *
   * @param query The MongoDB query (must contain $text for textScore)
   * @param projection The projection with potential {$meta: "textScore"} fields
   * @param sort Optional sort with potential {$meta: "textScore"} fields
   */
  translateWithMeta(
    query: Record<string, unknown>,
    projection?: Record<string, unknown>,
    sort?: Record<string, unknown>
  ): TranslatedQuery {
    const params: unknown[] = [];

    // Check if query has $text
    const hasText = '$text' in query;

    if (!hasText) {
      // No text search, fall back to regular translation
      const baseResult = this.translate(query);
      return baseResult;
    }

    // Extract $text operator
    const textOp = query.$text as Record<string, unknown>;
    const { sql: textSql, ftsMatch } = this.translateTextOperator(textOp, params);

    // Process remaining query conditions
    const remainingQuery: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query)) {
      if (key !== '$text') {
        remainingQuery[key] = value;
      }
    }

    let whereClause = textSql;
    if (Object.keys(remainingQuery).length > 0) {
      const remainingResult = this.translateDocument(remainingQuery, params);
      whereClause = `(${textSql}) AND (${remainingResult})`;
    }

    // Build SELECT clause with textScore if projected
    let selectClause = '*';
    const hasTextScoreProjection = projection && Object.values(projection).some(
      v => v && typeof v === 'object' && (v as Record<string, unknown>).$meta === 'textScore'
    );

    if (hasTextScoreProjection) {
      // FTS5 uses bm25() for relevance ranking
      // bm25() returns negative values (more negative = more relevant)
      // We negate it to get positive scores where higher = more relevant
      selectClause = '*, -bm25({{FTS_TABLE}}) as rank';
    }

    // Build ORDER BY clause
    let orderByClause = '';
    if (sort) {
      const hasTextScoreSort = Object.values(sort).some(
        v => v && typeof v === 'object' && (v as Record<string, unknown>).$meta === 'textScore'
      );

      if (hasTextScoreSort) {
        // Sort by rank (descending by default for textScore)
        orderByClause = ' ORDER BY rank DESC';
      }
    }

    return {
      sql: `SELECT ${selectClause} WHERE ${whereClause}${orderByClause}`,
      params,
      requiresFTS: true,
      ftsMatch,
    };
  }
}
