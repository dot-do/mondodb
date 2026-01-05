/**
 * SQL Dialect Support - Types and helpers for multi-database SQL generation
 *
 * Supports:
 * - sqlite: Default dialect, uses json_extract, CAST, etc.
 * - clickhouse: Uses JSONExtract*, toInt32, groupArray, etc.
 */

export type SQLDialect = 'sqlite' | 'clickhouse'

export interface DialectOptions {
  /** SQL dialect to use (default: 'sqlite') */
  dialect?: SQLDialect
  /** For ClickHouse: use positional ? parameters instead of typed {name:Type} */
  parameterMode?: 'positional' | 'typed'
  /** For ClickHouse: add WITH TOTALS to GROUP BY */
  withTotals?: boolean
  /** For ClickHouse: add FINAL modifier for ReplacingMergeTree tables */
  useFinal?: boolean
  /** For ClickHouse: use PREWHERE instead of WHERE for optimization */
  usePrewhere?: boolean
}

const VALID_DIALECTS: SQLDialect[] = ['sqlite', 'clickhouse']

/**
 * Validate dialect option and return normalized value
 */
export function validateDialect(dialect?: SQLDialect): SQLDialect {
  if (!dialect) return 'sqlite'
  if (!VALID_DIALECTS.includes(dialect)) {
    throw new Error(`Invalid dialect '${dialect}'. Supported dialects: ${VALID_DIALECTS.join(', ')}`)
  }
  return dialect
}

/**
 * Helper to choose SQL syntax based on dialect
 * @param dialect The SQL dialect
 * @param options Object with dialect-specific SQL strings
 */
export function dialectFn<T>(
  dialect: SQLDialect,
  options: { sqlite: T; clickhouse: T }
): T {
  return options[dialect]
}

/**
 * JSON Extract functions by dialect
 */
export function jsonExtract(dialect: SQLDialect, dataColumn: string, path: string): string {
  if (dialect === 'clickhouse') {
    // Convert $.field.nested to 'field', 'nested' format
    const parts = path.replace(/^\$\.?/, '').split('.')
    if (parts.length === 1 && parts[0] === '') {
      return dataColumn // root path
    }
    const pathArgs = parts.map(p => `'${p}'`).join(', ')
    return `JSONExtractRaw(${dataColumn}, ${pathArgs})`
  }
  // SQLite
  return `json_extract(${dataColumn}, '${path}')`
}

/**
 * JSON type checking by dialect
 */
export function jsonType(dialect: SQLDialect, dataColumn: string, path: string): string {
  if (dialect === 'clickhouse') {
    const parts = path.replace(/^\$\.?/, '').split('.')
    const pathArgs = parts.filter(p => p).map(p => `'${p}'`).join(', ')
    if (pathArgs) {
      return `JSONType(${dataColumn}, ${pathArgs})`
    }
    return `JSONType(${dataColumn})`
  }
  // SQLite - use json_extract then json_type for consistency
  return `json_type(json_extract(${dataColumn}, '${path}'))`
}

/**
 * JSON type checking with path argument directly (for $exists)
 */
export function jsonTypeWithPath(dialect: SQLDialect, dataColumn: string, path: string): string {
  if (dialect === 'clickhouse') {
    const parts = path.replace(/^\$\.?/, '').split('.')
    const pathArgs = parts.filter(p => p).map(p => `'${p}'`).join(', ')
    if (pathArgs) {
      return `JSONType(${dataColumn}, ${pathArgs})`
    }
    return `JSONType(${dataColumn})`
  }
  // SQLite - json_type can take data and path directly for existence checks
  return `json_type(${dataColumn}, '${path}')`
}

/**
 * JSON array length by dialect
 */
export function jsonArrayLength(dialect: SQLDialect, dataColumn: string, path: string): string {
  if (dialect === 'clickhouse') {
    const parts = path.replace(/^\$\.?/, '').split('.')
    const pathArgs = parts.filter(p => p).map(p => `'${p}'`).join(', ')
    return `JSONLength(${dataColumn}, ${pathArgs})`
  }
  // SQLite
  return `json_array_length(json_extract(${dataColumn}, '${path}'))`
}

/**
 * Type casting by dialect
 */
export interface CastOptions {
  toInt: (expr: string) => string
  toDouble: (expr: string) => string
  toString: (expr: string) => string
  toDate: (expr: string) => string
  toDecimal: (expr: string) => string
}

export function getCastFunctions(dialect: SQLDialect): CastOptions {
  if (dialect === 'clickhouse') {
    return {
      toInt: (expr) => `toInt64(${expr})`,
      toDouble: (expr) => `toFloat64(${expr})`,
      toString: (expr) => `toString(${expr})`,
      toDate: (expr) => `toDateTime(${expr})`,
      toDecimal: (expr) => `toDecimal64(${expr}, 4)`
    }
  }
  // SQLite
  return {
    toInt: (expr) => `CAST(${expr} AS INTEGER)`,
    toDouble: (expr) => `CAST(${expr} AS REAL)`,
    toString: (expr) => `CAST(${expr} AS TEXT)`,
    toDate: (expr) => `datetime(${expr})`,
    toDecimal: (expr) => `CAST(${expr} AS REAL)`
  }
}

/**
 * Aggregation functions by dialect
 */
export interface AggregationFunctions {
  push: (expr: string) => string
  addToSet: (expr: string) => string
  first: (expr: string) => string
  last: (expr: string) => string
  sum: (expr: string) => string
  avg: (expr: string) => string
  min: (expr: string) => string
  max: (expr: string) => string
  count: () => string
}

export function getAggregationFunctions(dialect: SQLDialect): AggregationFunctions {
  if (dialect === 'clickhouse') {
    return {
      push: (expr) => `groupArray(${expr})`,
      addToSet: (expr) => `groupUniqArray(${expr})`,
      first: (expr) => `any(${expr})`,
      last: (expr) => `anyLast(${expr})`,
      sum: (expr) => `sum(${expr})`,
      avg: (expr) => `avg(${expr})`,
      min: (expr) => `min(${expr})`,
      max: (expr) => `max(${expr})`,
      count: () => `count()`
    }
  }
  // SQLite
  return {
    push: (expr) => `json_group_array(${expr})`,
    addToSet: (expr) => `json_group_array(DISTINCT ${expr})`,
    first: (expr) => `(SELECT ${expr} LIMIT 1)`,
    last: (expr) => `(SELECT ${expr} ORDER BY ROWID DESC LIMIT 1)`,
    sum: (expr) => `SUM(${expr})`,
    avg: (expr) => `AVG(${expr})`,
    min: (expr) => `MIN(${expr})`,
    max: (expr) => `MAX(${expr})`,
    count: () => `COUNT(*)`
  }
}

/**
 * String functions by dialect
 */
export interface StringFunctions {
  indexOf: (str: string, search: string) => string
  strLength: (str: string) => string
  replaceAll: (str: string, find: string, replace: string) => string
  lower: (str: string) => string
  upper: (str: string) => string
  substr: (str: string, start: string, len: string) => string
  concat: (parts: string[]) => string
}

export function getStringFunctions(dialect: SQLDialect): StringFunctions {
  if (dialect === 'clickhouse') {
    return {
      indexOf: (str, search) => `position(${str}, ${search})`,
      strLength: (str) => `length(${str})`,
      replaceAll: (str, find, replace) => `replaceAll(${str}, ${find}, ${replace})`,
      lower: (str) => `lower(${str})`,
      upper: (str) => `upper(${str})`,
      substr: (str, start, len) => `substring(${str}, ${start} + 1, ${len})`,
      concat: (parts) => `concat(${parts.join(', ')})`
    }
  }
  // SQLite
  return {
    indexOf: (str, search) => `INSTR(${str}, ${search})`,
    strLength: (str) => `LENGTH(${str})`,
    replaceAll: (str, find, replace) => `REPLACE(${str}, ${find}, ${replace})`,
    lower: (str) => `LOWER(${str})`,
    upper: (str) => `UPPER(${str})`,
    substr: (str, start, len) => `SUBSTR(${str}, ${start} + 1, ${len})`,
    concat: (parts) => parts.join(' || ')
  }
}

/**
 * Date functions by dialect
 */
export interface DateFunctions {
  fromString: (str: string) => string
  toString: (date: string, format: string) => string
  year: (date: string) => string
  month: (date: string) => string
  day: (date: string) => string
  hour: (date: string) => string
  minute: (date: string) => string
  second: (date: string) => string
  dateDiff: (unit: string, start: string, end: string) => string
  dateAdd: (date: string, unit: string, amount: string) => string
  dateTrunc: (date: string, unit: string) => string
}

export function getDateFunctions(dialect: SQLDialect): DateFunctions {
  if (dialect === 'clickhouse') {
    return {
      fromString: (str) => `parseDateTimeBestEffort(${str})`,
      toString: (date, format) => `formatDateTime(${date}, ${format})`,
      year: (date) => `toYear(${date})`,
      month: (date) => `toMonth(${date})`,
      day: (date) => `toDayOfMonth(${date})`,
      hour: (date) => `toHour(${date})`,
      minute: (date) => `toMinute(${date})`,
      second: (date) => `toSecond(${date})`,
      dateDiff: (unit, start, end) => `dateDiff('${unit}', ${start}, ${end})`,
      dateAdd: (date, unit, amount) => `dateAdd(${unit}, ${amount}, ${date})`,
      dateTrunc: (date, unit) => {
        const fnMap: Record<string, string> = {
          day: 'toStartOfDay',
          month: 'toStartOfMonth',
          year: 'toStartOfYear',
          hour: 'toStartOfHour',
          minute: 'toStartOfMinute'
        }
        return `${fnMap[unit] || 'toStartOfDay'}(${date})`
      }
    }
  }
  // SQLite
  return {
    fromString: (str) => `datetime(${str})`,
    toString: (date, format) => `strftime(${format}, ${date})`,
    year: (date) => `CAST(strftime('%Y', ${date}) AS INTEGER)`,
    month: (date) => `CAST(strftime('%m', ${date}) AS INTEGER)`,
    day: (date) => `CAST(strftime('%d', ${date}) AS INTEGER)`,
    hour: (date) => `CAST(strftime('%H', ${date}) AS INTEGER)`,
    minute: (date) => `CAST(strftime('%M', ${date}) AS INTEGER)`,
    second: (date) => `CAST(strftime('%S', ${date}) AS INTEGER)`,
    dateDiff: (unit, start, end) => {
      if (unit === 'day') {
        return `CAST(julianday(${end}) - julianday(${start}) AS INTEGER)`
      }
      return `CAST((julianday(${end}) - julianday(${start})) * 24 AS INTEGER)` // hours
    },
    dateAdd: (date, unit, amount) => `datetime(${date}, '+' || ${amount} || ' ${unit}')`,
    dateTrunc: (date, unit) => {
      if (unit === 'day') {
        return `date(${date})`
      }
      if (unit === 'month') {
        return `date(${date}, 'start of month')`
      }
      if (unit === 'year') {
        return `date(${date}, 'start of year')`
      }
      return `datetime(${date})`
    }
  }
}

/**
 * Array functions by dialect
 */
export interface ArrayFunctions {
  unwind: (source: string, arrayPath: string, aliasName: string) => { sql: string; joinType: 'JOIN' | 'ARRAY JOIN' }
  filter: (array: string, varName: string, condition: string) => string
  map: (array: string, varName: string, expr: string) => string
  reduce: (array: string, initial: string, varName: string, accName: string, expr: string) => string
  slice: (array: string, start: string, count?: string) => string
  concat: (arrays: string[]) => string
  in: (value: string, array: string) => string
}

export function getArrayFunctions(dialect: SQLDialect): ArrayFunctions {
  if (dialect === 'clickhouse') {
    return {
      unwind: (_source, arrayPath, aliasName) => ({
        sql: `${arrayPath} AS ${aliasName}`,
        joinType: 'ARRAY JOIN'
      }),
      filter: (array, varName, condition) => `arrayFilter(${varName} -> ${condition}, ${array})`,
      map: (array, varName, expr) => `arrayMap(${varName} -> ${expr}, ${array})`,
      reduce: (array, _initial, _varName, _accName, _expr) => `arrayReduce('sumState', ${array})`,
      slice: (array, start, count) => count ? `arraySlice(${array}, ${start}, ${count})` : `arraySlice(${array}, ${start})`,
      concat: (arrays) => `arrayConcat(${arrays.join(', ')})`,
      in: (value, array) => `has(${array}, ${value})`
    }
  }
  // SQLite
  return {
    unwind: (_source, arrayPath, aliasName) => ({
      sql: `json_each(${arrayPath}) AS ${aliasName}`,
      joinType: 'JOIN'
    }),
    filter: (array, varName, condition) => `(SELECT json_group_array(value) FROM json_each(${array}) WHERE ${condition.replace(new RegExp(varName, 'g'), 'value')})`,
    map: (array, varName, expr) => `(SELECT json_group_array(${expr.replace(new RegExp(varName, 'g'), 'value')}) FROM json_each(${array}))`,
    reduce: (array, initial, _varName, _accName, _expr) => `(SELECT ${initial} + TOTAL(value) FROM json_each(${array}))`,
    slice: (array, start, count) => count
      ? `(SELECT json_group_array(value) FROM (SELECT value FROM json_each(${array}) LIMIT ${count} OFFSET ${start}))`
      : `(SELECT json_group_array(value) FROM (SELECT value FROM json_each(${array}) OFFSET ${start}))`,
    concat: (arrays) => arrays.length === 2 ? `json_array(${arrays[0]}, ${arrays[1]})` : `json_array(${arrays.join(', ')})`,
    in: (value, array) => `EXISTS (SELECT 1 FROM json_each(${array}) WHERE value = ${value})`
  }
}

/**
 * Regex/pattern matching by dialect
 */
export function regexMatch(dialect: SQLDialect, column: string, pattern: string, caseInsensitive: boolean): string {
  if (dialect === 'clickhouse') {
    if (caseInsensitive) {
      return `${column} ILIKE ${pattern}`
    }
    return `${column} LIKE ${pattern}`
  }
  // SQLite
  if (caseInsensitive) {
    return `LOWER(${column}) LIKE LOWER(${pattern})`
  }
  return `${column} LIKE ${pattern}`
}

/**
 * NULL handling by dialect
 */
export function nullCheck(_dialect: SQLDialect, column: string): string {
  // Both dialects support IS NULL
  return `${column} IS NULL`
}

export function ifNull(dialect: SQLDialect, exprs: string[]): string {
  if (dialect === 'clickhouse') {
    // ClickHouse supports ifNull for 2 args, coalesce for more
    if (exprs.length === 2) {
      return `ifNull(${exprs[0]}, ${exprs[1]})`
    }
    return `coalesce(${exprs.join(', ')})`
  }
  // SQLite uses COALESCE
  return `COALESCE(${exprs.join(', ')})`
}
