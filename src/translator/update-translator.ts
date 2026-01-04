/**
 * UpdateTranslator - Translates MongoDB-style update operations to SQLite SQL
 * using json_set, json_remove, and related functions for JSON document updates.
 *
 * REFACTORED: Optimized with combined json_set calls, validation, and CTE-based array operations.
 */

import { validateFieldPath } from '../utils/sql-safety.js';

export interface TranslatedUpdate {
  sql: string;
  params: unknown[];
}

type UpdateOperation = {
  sql: string;
  params: unknown[];
};

/**
 * Represents a pending field update before SQL generation.
 * Used to combine multiple updates efficiently.
 */
interface PendingUpdate {
  path: string;
  jsonPath: string;
  type: 'set' | 'unset' | 'inc' | 'mul' | 'min' | 'max' | 'rename';
  value?: unknown;
  newPath?: string; // For rename operations
}

/**
 * Converts a MongoDB-style field path to a JSONPath expression.
 * Handles nested paths and array indices.
 *
 * Examples:
 * - "name" -> "$.name"
 * - "address.city" -> "$.address.city"
 * - "items.0.name" -> "$.items[0].name"
 *
 * SECURITY: Validates field path to prevent SQL injection attacks.
 * @throws Error if field path contains invalid characters
 */
function toJsonPath(fieldPath: string): string {
  // Validate the entire field path to prevent SQL injection
  validateFieldPath(fieldPath);

  const parts = fieldPath.split('.');
  let result = '$';

  for (const part of parts) {
    // Check if this part is a numeric array index
    if (/^\d+$/.test(part)) {
      result += `[${part}]`;
    } else {
      result += `.${part}`;
    }
  }

  return result;
}

/**
 * Validates that a value is a valid number for arithmetic operations.
 */
function validateNumericValue(value: unknown, operator: string): void {
  if (typeof value !== 'number') {
    throw new Error(`${operator} requires numeric values, got ${typeof value}`);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`${operator} requires finite numeric values`);
  }
}

/**
 * Validates that an operator's fields are valid.
 */
function validateOperatorFields(operator: string, fields: Record<string, unknown>): void {
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
    throw new Error(`${operator} requires an object argument`);
  }

  const fieldPaths = Object.keys(fields);
  if (fieldPaths.length === 0) {
    throw new Error(`${operator} requires at least one field`);
  }

  // Validate specific operators
  switch (operator) {
    case '$inc':
    case '$mul':
      for (const [path, value] of Object.entries(fields)) {
        validateNumericValue(value, operator);
      }
      break;
    case '$min':
    case '$max':
      for (const [path, value] of Object.entries(fields)) {
        if (value === null || value === undefined) {
          throw new Error(`${operator} cannot use null or undefined values`);
        }
      }
      break;
    case '$rename':
      for (const [oldPath, newPath] of Object.entries(fields)) {
        if (typeof newPath !== 'string') {
          throw new Error(`$rename target must be a string, got ${typeof newPath}`);
        }
        if (oldPath === newPath) {
          throw new Error(`$rename source and target cannot be the same: ${oldPath}`);
        }
      }
      break;
    case '$pop':
      for (const [path, value] of Object.entries(fields)) {
        if (value !== 1 && value !== -1) {
          throw new Error(`$pop requires 1 (last) or -1 (first), got ${value}`);
        }
      }
      break;
  }
}

/**
 * Detects conflicts between update operators.
 * MongoDB does not allow updating the same field with multiple operators.
 */
function detectConflicts(update: Record<string, unknown>): void {
  const updatedPaths = new Map<string, string>(); // path -> operator

  for (const [operator, fields] of Object.entries(update)) {
    if (!operator.startsWith('$')) continue;
    if (typeof fields !== 'object' || fields === null) continue;

    for (const path of Object.keys(fields as Record<string, unknown>)) {
      // For $rename, check both source and target
      if (operator === '$rename') {
        const targetPath = (fields as Record<string, unknown>)[path] as string;
        if (updatedPaths.has(path)) {
          throw new Error(`Conflicting update: ${path} is modified by both ${updatedPaths.get(path)} and ${operator}`);
        }
        if (updatedPaths.has(targetPath)) {
          throw new Error(`Conflicting update: ${targetPath} is modified by both ${updatedPaths.get(targetPath)} and ${operator}`);
        }
        updatedPaths.set(path, operator);
        updatedPaths.set(targetPath, operator);
      } else {
        // Check for conflicts with existing updates
        if (updatedPaths.has(path)) {
          const existingOp = updatedPaths.get(path)!;
          // Allow $min and $max on same field as they're complementary
          if (!((operator === '$min' && existingOp === '$max') ||
                (operator === '$max' && existingOp === '$min'))) {
            throw new Error(`Conflicting update: ${path} is modified by both ${existingOp} and ${operator}`);
          }
        }
        updatedPaths.set(path, operator);
      }
    }
  }
}

/**
 * Creates a SQL value expression for a given value.
 * Returns the SQL fragment and any parameters needed.
 */
function createValueExpression(value: unknown): { sql: string; params: unknown[] } {
  if (value === null) {
    return { sql: "json('null')", params: [] };
  }

  if (typeof value === 'boolean') {
    return { sql: 'json(?)', params: [value.toString()] };
  }

  if (typeof value === 'object') {
    return { sql: 'json(?)', params: [JSON.stringify(value)] };
  }

  return { sql: '?', params: [value] };
}

export class UpdateTranslator {
  private static readonly SUPPORTED_OPERATORS = new Set([
    '$set', '$unset', '$inc', '$mul', '$min', '$max', '$rename',
    '$push', '$pull', '$addToSet', '$pop'
  ]);

  // Operator processing order - ensures proper nesting and conflict resolution
  private static readonly OPERATOR_ORDER = [
    '$rename', '$unset', '$set', '$inc', '$mul', '$min', '$max',
    '$push', '$addToSet', '$pull', '$pop'
  ];

  /**
   * Translates a MongoDB-style update object to SQLite SQL.
   * Returns the SQL expression and parameters for updating the data column.
   *
   * @param update - MongoDB update document with operators like $set, $inc, etc.
   * @returns Translated SQL expression and parameters
   * @throws Error if operators are invalid or conflicting
   */
  translate(update: Record<string, unknown>): TranslatedUpdate {
    const operators = Object.keys(update);

    // Handle empty update - return data as-is
    if (operators.length === 0) {
      return { sql: 'data', params: [] };
    }

    // Validate all operators
    for (const op of operators) {
      if (!op.startsWith('$')) {
        throw new Error(`Invalid update operator: ${op}. Update operators must start with $`);
      }
      if (!UpdateTranslator.SUPPORTED_OPERATORS.has(op)) {
        throw new Error(`Unknown update operator: ${op}`);
      }
      validateOperatorFields(op, update[op] as Record<string, unknown>);
    }

    // Detect conflicts between operators
    detectConflicts(update);

    // Process updates in defined order
    let currentSql = 'data';
    let currentParams: unknown[] = [];

    for (const op of UpdateTranslator.OPERATOR_ORDER) {
      if (update[op]) {
        const result = this.translateOperator(
          op,
          update[op] as Record<string, unknown>,
          currentSql,
          currentParams
        );
        currentSql = result.sql;
        currentParams = result.params;
      }
    }

    return { sql: currentSql, params: currentParams };
  }

  private translateOperator(
    operator: string,
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    switch (operator) {
      case '$set':
        return this.translateSet(fields, baseSql, baseParams);
      case '$unset':
        return this.translateUnset(fields, baseSql, baseParams);
      case '$inc':
        return this.translateInc(fields, baseSql, baseParams);
      case '$mul':
        return this.translateMul(fields, baseSql, baseParams);
      case '$min':
        return this.translateMin(fields, baseSql, baseParams);
      case '$max':
        return this.translateMax(fields, baseSql, baseParams);
      case '$rename':
        return this.translateRename(fields, baseSql, baseParams);
      case '$push':
        return this.translatePush(fields, baseSql, baseParams);
      case '$pull':
        return this.translatePull(fields, baseSql, baseParams);
      case '$addToSet':
        return this.translateAddToSet(fields, baseSql, baseParams);
      case '$pop':
        return this.translatePop(fields, baseSql, baseParams);
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  // ============================================================
  // FIELD UPDATE OPERATORS
  // ============================================================

  /**
   * Translates $set operator using optimized multi-path json_set.
   *
   * OPTIMIZATION: SQLite's json_set supports multiple path-value pairs in a single call:
   * json_set(data, '$.a', 1, '$.b', 2) instead of json_set(json_set(data, '$.a', 1), '$.b', 2)
   */
  private translateSet(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    const entries = Object.entries(fields);
    if (entries.length === 0) {
      return { sql: baseSql, params: baseParams };
    }

    // Build optimized multi-path json_set
    const pathValuePairs: string[] = [];
    const params = [...baseParams];

    for (const [path, value] of entries) {
      const jsonPath = toJsonPath(path);
      const valueExpr = createValueExpression(value);

      pathValuePairs.push(`'${jsonPath}'`);
      pathValuePairs.push(valueExpr.sql);
      params.push(...valueExpr.params);
    }

    return {
      sql: `json_set(${baseSql}, ${pathValuePairs.join(', ')})`,
      params
    };
  }

  /**
   * Translates $unset operator using optimized multi-path json_remove.
   *
   * OPTIMIZATION: SQLite's json_remove supports multiple paths in a single call.
   */
  private translateUnset(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    const paths = Object.keys(fields);
    if (paths.length === 0) {
      return { sql: baseSql, params: baseParams };
    }

    // Build optimized multi-path json_remove
    const jsonPaths = paths.map(p => `'${toJsonPath(p)}'`).join(', ');

    return {
      sql: `json_remove(${baseSql}, ${jsonPaths})`,
      params: baseParams
    };
  }

  /**
   * Translates $inc operator to json_set with addition.
   * Uses COALESCE to handle missing fields (defaulting to 0).
   */
  private translateInc(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    let sql = baseSql;
    let params = [...baseParams];

    for (const [path, increment] of Object.entries(fields)) {
      const jsonPath = toJsonPath(path);
      sql = `json_set(${sql}, '${jsonPath}', COALESCE(json_extract(data, '${jsonPath}'), 0) + ?)`;
      params.push(increment);
    }

    return { sql, params };
  }

  /**
   * Translates $mul operator to json_set with multiplication.
   * Uses COALESCE to handle missing fields (defaulting to 0, which means result is 0).
   */
  private translateMul(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    let sql = baseSql;
    let params = [...baseParams];

    for (const [path, multiplier] of Object.entries(fields)) {
      const jsonPath = toJsonPath(path);
      sql = `json_set(${sql}, '${jsonPath}', COALESCE(json_extract(data, '${jsonPath}'), 0) * ?)`;
      params.push(multiplier);
    }

    return { sql, params };
  }

  /**
   * Translates $min operator to conditional update.
   * Sets the field to the smaller of current value or specified value.
   * If field doesn't exist, sets it to the specified value.
   */
  private translateMin(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    let sql = baseSql;
    let params = [...baseParams];

    for (const [path, value] of Object.entries(fields)) {
      const jsonPath = toJsonPath(path);
      sql = `json_set(${sql}, '${jsonPath}', CASE WHEN json_extract(data, '${jsonPath}') IS NULL OR ? < json_extract(data, '${jsonPath}') THEN ? ELSE json_extract(data, '${jsonPath}') END)`;
      params.push(value, value);
    }

    return { sql, params };
  }

  /**
   * Translates $max operator to conditional update.
   * Sets the field to the larger of current value or specified value.
   * If field doesn't exist, sets it to the specified value.
   */
  private translateMax(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    let sql = baseSql;
    let params = [...baseParams];

    for (const [path, value] of Object.entries(fields)) {
      const jsonPath = toJsonPath(path);
      sql = `json_set(${sql}, '${jsonPath}', CASE WHEN json_extract(data, '${jsonPath}') IS NULL OR ? > json_extract(data, '${jsonPath}') THEN ? ELSE json_extract(data, '${jsonPath}') END)`;
      params.push(value, value);
    }

    return { sql, params };
  }

  /**
   * Translates $rename operator to json_set + json_remove combination.
   * Moves a field from one location to another.
   */
  private translateRename(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    let sql = baseSql;
    const params = [...baseParams];

    for (const [oldPath, newPath] of Object.entries(fields)) {
      const oldJsonPath = toJsonPath(oldPath);
      const newJsonPath = toJsonPath(newPath as string);
      // Extract value, remove old path, set new path
      sql = `json_set(json_remove(${sql}, '${oldJsonPath}'), '${newJsonPath}', json_extract(data, '${oldJsonPath}'))`;
    }

    return { sql, params };
  }

  // ============================================================
  // ARRAY UPDATE OPERATORS
  // ============================================================

  /**
   * Translates $push operator to append values to an array.
   * Supports $each and $slice modifiers.
   */
  private translatePush(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    let sql = baseSql;
    let params = [...baseParams];

    for (const [path, value] of Object.entries(fields)) {
      const jsonPath = toJsonPath(path);

      // Check for $each and $slice modifiers
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const modifiers = value as Record<string, unknown>;
        if ('$each' in modifiers) {
          const result = this.translatePushEach(path, modifiers, sql, params);
          sql = result.sql;
          params = result.params;
          continue;
        }
      }

      // Simple push - append single value
      const valueExpr = createValueExpression(value);
      sql = `json_set(${sql}, '${jsonPath}', json_insert(COALESCE(json_extract(data, '${jsonPath}'), '[]'), '$[#]', ${valueExpr.sql}))`;
      params.push(...valueExpr.params);
    }

    return { sql, params };
  }

  /**
   * Handles $push with $each modifier for batch appending.
   * Uses CTE for efficient array building when $slice is present.
   */
  private translatePushEach(
    path: string,
    modifiers: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    const jsonPath = toJsonPath(path);
    const values = modifiers.$each as unknown[];
    const slice = modifiers.$slice as number | undefined;

    if (values.length === 0) {
      // No values to push - ensure array exists
      if (slice !== undefined) {
        return this.applySliceWithCTE(baseSql, jsonPath, slice, baseParams);
      }
      return {
        sql: `json_set(${baseSql}, '${jsonPath}', COALESCE(json_extract(data, '${jsonPath}'), '[]'))`,
        params: baseParams
      };
    }

    let params = [...baseParams];

    // Build nested json_insert calls for batch append
    let insertChain = `COALESCE(json_extract(data, '${jsonPath}'), '[]')`;
    for (const value of values) {
      const valueExpr = createValueExpression(value);
      insertChain = `json_insert(${insertChain}, '$[#]', ${valueExpr.sql})`;
      params.push(...valueExpr.params);
    }

    let sql = `json_set(${baseSql}, '${jsonPath}', ${insertChain})`;

    // Apply $slice with CTE optimization
    if (slice !== undefined) {
      return this.applySliceWithCTE(sql, jsonPath, slice, params);
    }

    return { sql, params };
  }

  /**
   * Applies $slice modifier using CTE for efficient array slicing.
   * CTE provides better performance for large arrays.
   */
  private applySliceWithCTE(
    baseSql: string,
    jsonPath: string,
    slice: number,
    baseParams: unknown[]
  ): UpdateOperation {
    if (slice === 0) {
      // Empty array result
      return {
        sql: `json_set(${baseSql}, '${jsonPath}', json('[]'))`,
        params: baseParams
      };
    }

    const params = [...baseParams];

    if (slice > 0) {
      // Keep first N elements using CTE
      return {
        sql: `json_set(${baseSql}, '${jsonPath}', (
          WITH array_elements AS (
            SELECT value, CAST(key AS INTEGER) as idx
            FROM json_each(json_extract(${baseSql}, '${jsonPath}'))
          )
          SELECT COALESCE(json_group_array(value), '[]')
          FROM (
            SELECT value FROM array_elements
            ORDER BY idx
            LIMIT ${slice}
          )
        ))`,
        params
      };
    } else {
      // Keep last N elements (slice is negative) using CTE
      const limit = Math.abs(slice);
      return {
        sql: `json_set(${baseSql}, '${jsonPath}', (
          WITH array_elements AS (
            SELECT value, CAST(key AS INTEGER) as idx
            FROM json_each(json_extract(${baseSql}, '${jsonPath}'))
          ),
          total AS (SELECT COUNT(*) as cnt FROM array_elements),
          filtered AS (
            SELECT value, idx FROM array_elements, total
            WHERE idx >= (cnt - ${limit})
          )
          SELECT COALESCE(json_group_array(value), '[]')
          FROM (SELECT value FROM filtered ORDER BY idx)
        ))`,
        params
      };
    }
  }

  /**
   * Translates $pull operator to remove matching elements.
   * Uses CTE for efficient filtering.
   */
  private translatePull(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    let sql = baseSql;
    let params = [...baseParams];

    for (const [path, condition] of Object.entries(fields)) {
      const jsonPath = toJsonPath(path);

      // Check if condition is a simple value or a query
      if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
        // Query condition - use CTE for complex filtering
        const result = this.translatePullWithQueryCTE(path, condition as Record<string, unknown>, sql, params);
        sql = result.sql;
        params = result.params;
      } else {
        // Simple value match using CTE
        sql = `json_set(${sql}, '${jsonPath}', (
          WITH array_elements AS (
            SELECT value, CAST(key AS INTEGER) as idx
            FROM json_each(json_extract(data, '${jsonPath}'))
          )
          SELECT COALESCE(json_group_array(value), '[]')
          FROM (
            SELECT value FROM array_elements
            WHERE value != json(?)
            ORDER BY idx
          )
        ))`;
        // JSON stringify for comparison
        params.push(JSON.stringify(condition));
      }
    }

    return { sql, params };
  }

  /**
   * Handles $pull with query conditions using CTE.
   */
  private translatePullWithQueryCTE(
    path: string,
    condition: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    const jsonPath = toJsonPath(path);
    const params = [...baseParams];

    // Build WHERE clause for the condition
    const conditions: string[] = [];
    for (const [field, value] of Object.entries(condition)) {
      // Validate field name to prevent SQL injection
      validateFieldPath(field);
      if (typeof value === 'object' && value !== null) {
        // Handle operators like $gte, $lte, etc.
        for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
          const sqlOp = this.mongoOpToSql(op);
          conditions.push(`json_extract(value, '$.${field}') ${sqlOp} ?`);
          params.push(opValue);
        }
      } else {
        conditions.push(`json_extract(value, '$.${field}') = ?`);
        params.push(value);
      }
    }

    const whereClause = conditions.length > 0 ? `NOT (${conditions.join(' AND ')})` : '1=1';

    return {
      sql: `json_set(${baseSql}, '${jsonPath}', (
        WITH array_elements AS (
          SELECT value, CAST(key AS INTEGER) as idx
          FROM json_each(json_extract(data, '${jsonPath}'))
        )
        SELECT COALESCE(json_group_array(value), '[]')
        FROM (
          SELECT value FROM array_elements
          WHERE ${whereClause}
          ORDER BY idx
        )
      ))`,
      params
    };
  }

  private mongoOpToSql(op: string): string {
    switch (op) {
      case '$eq': return '=';
      case '$ne': return '!=';
      case '$gt': return '>';
      case '$gte': return '>=';
      case '$lt': return '<';
      case '$lte': return '<=';
      default: throw new Error(`Unsupported operator in $pull: ${op}`);
    }
  }

  /**
   * Translates $addToSet operator to push if value doesn't exist.
   * Uses CTE for efficient uniqueness check.
   */
  private translateAddToSet(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    let sql = baseSql;
    let params = [...baseParams];

    for (const [path, value] of Object.entries(fields)) {
      const jsonPath = toJsonPath(path);

      // Check for $each modifier
      if (value && typeof value === 'object' && !Array.isArray(value) && '$each' in (value as Record<string, unknown>)) {
        const values = (value as Record<string, unknown>).$each as unknown[];
        for (const v of values) {
          const result = this.translateAddToSetSingleWithCTE(jsonPath, v, sql, params);
          sql = result.sql;
          params = result.params;
        }
        continue;
      }

      const result = this.translateAddToSetSingleWithCTE(jsonPath, value, sql, params);
      sql = result.sql;
      params = result.params;
    }

    return { sql, params };
  }

  /**
   * Single value $addToSet using CTE for uniqueness check.
   */
  private translateAddToSetSingleWithCTE(
    jsonPath: string,
    value: unknown,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    const params = [...baseParams];
    const valueExpr = createValueExpression(value);

    // Check if value exists in array, if not add it
    const sql = `json_set(${baseSql}, '${jsonPath}',
      CASE
        WHEN EXISTS (
          SELECT 1 FROM json_each(COALESCE(json_extract(data, '${jsonPath}'), '[]'))
          WHERE value = json(?)
        )
        THEN COALESCE(json_extract(data, '${jsonPath}'), '[]')
        ELSE json_insert(COALESCE(json_extract(data, '${jsonPath}'), '[]'), '$[#]', ${valueExpr.sql})
      END
    )`;

    // First param is for the EXISTS check (needs JSON stringification)
    params.push(JSON.stringify(value));
    // Subsequent params are for the value expression
    params.push(...valueExpr.params);

    return { sql, params };
  }

  /**
   * Translates $pop operator to remove first or last element.
   * Uses CTE for efficient element removal.
   */
  private translatePop(
    fields: Record<string, unknown>,
    baseSql: string,
    baseParams: unknown[]
  ): UpdateOperation {
    let sql = baseSql;
    const params = [...baseParams];

    for (const [path, direction] of Object.entries(fields)) {
      const jsonPath = toJsonPath(path);
      const dir = direction as number;

      if (dir === 1) {
        // Remove last element using CTE
        sql = `json_set(${sql}, '${jsonPath}', (
          WITH array_elements AS (
            SELECT value, CAST(key AS INTEGER) as idx
            FROM json_each(COALESCE(json_extract(data, '${jsonPath}'), '[]'))
          ),
          total AS (SELECT COUNT(*) as cnt FROM array_elements)
          SELECT COALESCE(json_group_array(value), '[]')
          FROM (
            SELECT value FROM array_elements, total
            WHERE idx < cnt - 1
            ORDER BY idx
          )
        ))`;
      } else {
        // Remove first element using CTE
        sql = `json_set(${sql}, '${jsonPath}', (
          WITH array_elements AS (
            SELECT value, CAST(key AS INTEGER) as idx
            FROM json_each(COALESCE(json_extract(data, '${jsonPath}'), '[]'))
          )
          SELECT COALESCE(json_group_array(value), '[]')
          FROM (
            SELECT value FROM array_elements
            WHERE idx > 0
            ORDER BY idx
          )
        ))`;
      }
    }

    return { sql, params };
  }
}
