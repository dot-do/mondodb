/**
 * Expression Translator - Translates MongoDB aggregation expressions to SQL
 * Handles arithmetic, string, conditional, comparison, and function operators
 * Supports multiple SQL dialects (SQLite, ClickHouse)
 */

import type { FunctionSpec, FunctionExpression } from '../../types/function'
import { validateFieldPath } from '../../utils/sql-safety.js'
import {
  type SQLDialect,
  jsonExtract as dialectJsonExtract,
  getCastFunctions,
  getStringFunctions,
  getDateFunctions,
  getArrayFunctions,
  ifNull as dialectIfNull,
} from '../dialect'

/**
 * Check if a value is a field reference (starts with $)
 */
export function isFieldReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('$') && !value.startsWith('$$')
}

/**
 * Get the JSON path for a field reference
 *
 * SECURITY: Validates field name to prevent SQL injection attacks.
 * @throws Error if field contains invalid characters
 */
export function getFieldPath(fieldRef: string): string {
  // Remove the leading $ and convert to JSON path
  const field = fieldRef.substring(1)

  // Validate the field path to prevent SQL injection
  validateFieldPath(field)

  const parts = field.split('.')
  let path = '$'

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      path += `[${part}]`
    } else {
      path += `.${part}`
    }
  }

  return path
}

/**
 * Translate an expression value (field reference, literal, or expression object)
 */
export function translateExpressionValue(value: unknown, params: unknown[], dialect: SQLDialect = 'sqlite'): string {
  if (isFieldReference(value)) {
    const path = getFieldPath(value)
    return dialectJsonExtract(dialect, 'data', path)
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return translateExpression(value as Record<string, unknown>, params, dialect)
  }

  if (typeof value === 'string') {
    params.push(value)
    return '?'
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value === null) {
    return 'NULL'
  }

  params.push(JSON.stringify(value))
  return '?'
}

/**
 * Main expression translator
 */
export function translateExpression(
  expr: Record<string, unknown>,
  params: unknown[],
  dialect: SQLDialect = 'sqlite'
): string {
  const keys = Object.keys(expr)

  if (keys.length === 0) {
    return 'NULL'
  }

  const operator = keys[0]

  // Arithmetic operators
  if (operator === '$add') {
    return translateArithmetic(expr.$add as unknown[], params, '+', dialect)
  }
  if (operator === '$subtract') {
    return translateArithmetic(expr.$subtract as unknown[], params, '-', dialect)
  }
  if (operator === '$multiply') {
    return translateArithmetic(expr.$multiply as unknown[], params, '*', dialect)
  }
  if (operator === '$divide') {
    return translateArithmetic(expr.$divide as unknown[], params, '/', dialect)
  }
  if (operator === '$mod') {
    return translateArithmetic(expr.$mod as unknown[], params, '%', dialect)
  }

  // Type conversion operators
  const castFns = getCastFunctions(dialect)
  if (operator === '$toInt') {
    const val = translateExpressionValue(expr.$toInt, params, dialect)
    return castFns.toInt(val)
  }
  if (operator === '$toDouble') {
    const val = translateExpressionValue(expr.$toDouble, params, dialect)
    return castFns.toDouble(val)
  }
  if (operator === '$toString') {
    const val = translateExpressionValue(expr.$toString, params, dialect)
    return castFns.toString(val)
  }
  if (operator === '$toDate') {
    const val = translateExpressionValue(expr.$toDate, params, dialect)
    return castFns.toDate(val)
  }
  if (operator === '$toDecimal') {
    const val = translateExpressionValue(expr.$toDecimal, params, dialect)
    return castFns.toDecimal(val)
  }

  // String operators
  const strFns = getStringFunctions(dialect)
  if (operator === '$concat') {
    return translateConcat(expr.$concat as unknown[], params, dialect)
  }
  if (operator === '$substr') {
    return translateSubstr(expr.$substr as unknown[], params, dialect)
  }
  if (operator === '$toLower') {
    const val = translateExpressionValue(expr.$toLower, params, dialect)
    return strFns.lower(val)
  }
  if (operator === '$toUpper') {
    const val = translateExpressionValue(expr.$toUpper, params, dialect)
    return strFns.upper(val)
  }
  if (operator === '$indexOfBytes') {
    const args = expr.$indexOfBytes as unknown[]
    const str = translateExpressionValue(args[0], params, dialect)
    const search = translateExpressionValue(args[1], params, dialect)
    return strFns.indexOf(str, search)
  }
  if (operator === '$strLenBytes') {
    const val = translateExpressionValue(expr.$strLenBytes, params, dialect)
    return strFns.strLength(val)
  }
  if (operator === '$replaceAll') {
    const spec = expr.$replaceAll as { input: unknown; find: unknown; replacement: unknown }
    const input = translateExpressionValue(spec.input, params, dialect)
    const find = translateExpressionValue(spec.find, params, dialect)
    const replacement = translateExpressionValue(spec.replacement, params, dialect)
    return strFns.replaceAll(input, find, replacement)
  }

  // Date operators
  const dateFns = getDateFunctions(dialect)
  if (operator === '$dateFromString') {
    const spec = expr.$dateFromString as { dateString: unknown }
    const str = translateExpressionValue(spec.dateString, params, dialect)
    return dateFns.fromString(str)
  }
  if (operator === '$dateToString') {
    const spec = expr.$dateToString as { format: string; date: unknown }
    const date = translateExpressionValue(spec.date, params, dialect)
    params.push(spec.format)
    return dateFns.toString(date, '?')
  }
  if (operator === '$year') {
    const val = translateExpressionValue(expr.$year, params, dialect)
    return dateFns.year(val)
  }
  if (operator === '$month') {
    const val = translateExpressionValue(expr.$month, params, dialect)
    return dateFns.month(val)
  }
  if (operator === '$dayOfMonth') {
    const val = translateExpressionValue(expr.$dayOfMonth, params, dialect)
    return dateFns.day(val)
  }
  if (operator === '$hour') {
    const val = translateExpressionValue(expr.$hour, params, dialect)
    return dateFns.hour(val)
  }
  if (operator === '$minute') {
    const val = translateExpressionValue(expr.$minute, params, dialect)
    return dateFns.minute(val)
  }
  if (operator === '$second') {
    const val = translateExpressionValue(expr.$second, params, dialect)
    return dateFns.second(val)
  }
  if (operator === '$dateDiff') {
    const spec = expr.$dateDiff as { startDate: unknown; endDate: unknown; unit: string }
    const start = translateExpressionValue(spec.startDate, params, dialect)
    const end = translateExpressionValue(spec.endDate, params, dialect)
    return dateFns.dateDiff(spec.unit, start, end)
  }
  if (operator === '$dateAdd') {
    const spec = expr.$dateAdd as { startDate: unknown; unit: string; amount: unknown }
    const date = translateExpressionValue(spec.startDate, params, dialect)
    const amount = translateExpressionValue(spec.amount, params, dialect)
    return dateFns.dateAdd(date, spec.unit, amount)
  }
  if (operator === '$dateTrunc') {
    const spec = expr.$dateTrunc as { date: unknown; unit: string }
    const date = translateExpressionValue(spec.date, params, dialect)
    return dateFns.dateTrunc(date, spec.unit)
  }

  // Array operators
  const arrFns = getArrayFunctions(dialect)
  if (operator === '$in') {
    const args = expr.$in as unknown[]
    const value = translateExpressionValue(args[0], params, dialect)
    const array = translateExpressionValue(args[1], params, dialect)
    return arrFns.in(value, array)
  }
  if (operator === '$concatArrays') {
    const args = expr.$concatArrays as unknown[]
    const arrays = args.map(a => translateExpressionValue(a, params, dialect))
    return arrFns.concat(arrays)
  }
  if (operator === '$filter') {
    const spec = expr.$filter as { input: unknown; as: string; cond: unknown }
    const array = translateExpressionValue(spec.input, params, dialect)
    const cond = translateExpressionValue(spec.cond, params, dialect)
    return arrFns.filter(array, spec.as || 'this', cond)
  }
  if (operator === '$map') {
    const spec = expr.$map as { input: unknown; as: string; in: unknown }
    const array = translateExpressionValue(spec.input, params, dialect)
    const inExpr = translateExpressionValue(spec.in, params, dialect)
    return arrFns.map(array, spec.as || 'this', inExpr)
  }
  if (operator === '$reduce') {
    const spec = expr.$reduce as { input: unknown; initialValue: unknown; in: unknown }
    const array = translateExpressionValue(spec.input, params, dialect)
    const initial = translateExpressionValue(spec.initialValue, params, dialect)
    const inExpr = translateExpressionValue(spec.in, params, dialect)
    return arrFns.reduce(array, initial, 'this', 'value', inExpr)
  }
  if (operator === '$slice') {
    const args = expr.$slice as unknown[]
    const array = translateExpressionValue(args[0], params, dialect)
    const count = translateExpressionValue(args[1], params, dialect)
    return arrFns.slice(array, '0', count)
  }

  // Conditional operators
  if (operator === '$cond') {
    return translateCond(expr.$cond as Record<string, unknown> | unknown[], params, dialect)
  }
  if (operator === '$ifNull') {
    return translateIfNull(expr.$ifNull as unknown[], params, dialect)
  }
  if (operator === '$switch') {
    return translateSwitch(expr.$switch as Record<string, unknown>, params, dialect)
  }

  // Comparison operators (in expression context)
  if (operator === '$eq') {
    const args = expr.$eq as unknown[]
    const left = translateExpressionValue(args[0], params, dialect)
    const right = translateExpressionValue(args[1], params, dialect)
    return `(${left} = ${right})`
  }
  if (operator === '$ne') {
    const args = expr.$ne as unknown[]
    const left = translateExpressionValue(args[0], params, dialect)
    const right = translateExpressionValue(args[1], params, dialect)
    return `(${left} != ${right})`
  }
  if (operator === '$gt') {
    const args = expr.$gt as unknown[]
    const left = translateExpressionValue(args[0], params, dialect)
    const right = translateExpressionValue(args[1], params, dialect)
    return `(${left} > ${right})`
  }
  if (operator === '$gte') {
    const args = expr.$gte as unknown[]
    const left = translateExpressionValue(args[0], params, dialect)
    const right = translateExpressionValue(args[1], params, dialect)
    return `(${left} >= ${right})`
  }
  if (operator === '$lt') {
    const args = expr.$lt as unknown[]
    const left = translateExpressionValue(args[0], params, dialect)
    const right = translateExpressionValue(args[1], params, dialect)
    return `(${left} < ${right})`
  }
  if (operator === '$lte') {
    const args = expr.$lte as unknown[]
    const left = translateExpressionValue(args[0], params, dialect)
    const right = translateExpressionValue(args[1], params, dialect)
    return `(${left} <= ${right})`
  }

  // Logical operators
  if (operator === '$and') {
    const conditions = (expr.$and as unknown[]).map(c =>
      translateExpressionValue(c, params, dialect)
    )
    return `(${conditions.join(' AND ')})`
  }
  if (operator === '$or') {
    const conditions = (expr.$or as unknown[]).map(c =>
      translateExpressionValue(c, params, dialect)
    )
    return `(${conditions.join(' OR ')})`
  }
  if (operator === '$not') {
    const val = translateExpressionValue(expr.$not, params, dialect)
    return `NOT (${val})`
  }

  // $expr for match conditions - extract the inner expression
  if (operator === '$expr') {
    return translateExpression(expr.$expr as Record<string, unknown>, params, dialect)
  }

  // $function operator - custom JavaScript function execution
  if (operator === '$function') {
    return translateFunction(expr.$function as FunctionSpec, params)
  }

  throw new Error(`Unknown expression operator: ${operator}`)
}

function translateArithmetic(args: unknown[], params: unknown[], op: string, dialect: SQLDialect = 'sqlite'): string {
  const parts = args.map(arg => translateExpressionValue(arg, params, dialect))
  return `(${parts.join(` ${op} `)})`
}

function translateConcat(args: unknown[], params: unknown[], dialect: SQLDialect = 'sqlite'): string {
  const parts = args.map(arg => translateExpressionValue(arg, params, dialect))
  const strFns = getStringFunctions(dialect)
  return strFns.concat(parts)
}

function translateSubstr(args: unknown[], params: unknown[], dialect: SQLDialect = 'sqlite'): string {
  const str = translateExpressionValue(args[0], params, dialect)
  const start = translateExpressionValue(args[1], params, dialect)
  const len = translateExpressionValue(args[2], params, dialect)
  const strFns = getStringFunctions(dialect)
  return strFns.substr(str, start, len)
}

function translateCond(
  cond: Record<string, unknown> | unknown[],
  params: unknown[],
  dialect: SQLDialect = 'sqlite'
): string {
  let ifCond: unknown, thenVal: unknown, elseVal: unknown

  if (Array.isArray(cond)) {
    [ifCond, thenVal, elseVal] = cond
  } else {
    ifCond = cond.if
    thenVal = cond.then
    elseVal = cond.else
  }

  const condSql = translateExpressionValue(ifCond, params, dialect)
  const thenSql = translateExpressionValue(thenVal, params, dialect)
  const elseSql = translateExpressionValue(elseVal, params, dialect)

  return `CASE WHEN ${condSql} THEN ${thenSql} ELSE ${elseSql} END`
}

function translateIfNull(args: unknown[], params: unknown[], dialect: SQLDialect = 'sqlite'): string {
  const parts = args.map(arg => translateExpressionValue(arg, params, dialect))
  return dialectIfNull(dialect, parts)
}

function translateSwitch(
  switchExpr: Record<string, unknown>,
  params: unknown[],
  dialect: SQLDialect = 'sqlite'
): string {
  const branches = switchExpr.branches as Array<{ case: unknown; then: unknown }>
  const defaultVal = switchExpr.default

  const whenClauses = branches.map(branch => {
    const caseSql = translateExpressionValue(branch.case, params, dialect)
    const thenSql = translateExpressionValue(branch.then, params, dialect)
    return `WHEN ${caseSql} THEN ${thenSql}`
  })

  const elseSql = defaultVal !== undefined
    ? translateExpressionValue(defaultVal, params, dialect)
    : 'NULL'

  return `CASE ${whenClauses.join(' ')} ELSE ${elseSql} END`
}

/**
 * Translate $function operator to a marker for deferred execution
 * Returns a JSON marker string that will be processed by the aggregation executor
 *
 * The $function operator allows custom JavaScript functions in aggregation pipelines.
 * Since SQLite cannot execute JavaScript, we:
 * 1. Generate a JSON marker embedded in SQL output
 * 2. Extract field references from args for document binding
 * 3. Store the function expression metadata for post-processing
 */
function translateFunction(spec: FunctionSpec, params: unknown[]): string {
  // Validate required fields
  if (!spec.body) {
    throw new Error('$function requires body')
  }
  if (!spec.args) {
    throw new Error('$function requires args')
  }
  if (spec.lang !== 'js') {
    throw new Error('$function only supports lang: "js"')
  }

  // Normalize body to string
  const body = typeof spec.body === 'function'
    ? spec.body.toString()
    : spec.body

  // Process arguments - extract field paths and literal positions
  const argPaths: string[] = []
  const literalArgs: Record<number, unknown> = {}

  spec.args.forEach((arg, index) => {
    if (isFieldReference(arg)) {
      argPaths.push(getFieldPath(arg as string))
    } else {
      literalArgs[index] = arg
    }
  })

  // Create marker object
  const marker = {
    __type: 'function',
    body,
    argPaths,
    literalArgs,
    argOrder: spec.args.map((arg, i) =>
      isFieldReference(arg) ? { type: 'field', path: getFieldPath(arg as string) } : { type: 'literal', index: i }
    )
  }

  // Return as a JSON string that can be detected and parsed later
  return `'__FUNCTION__${JSON.stringify(marker).replace(/'/g, "''")}'`
}

/**
 * Generate a unique function ID for placeholder identification
 */
let functionIdCounter = 0
function generateFunctionId(): string {
  return `fn${++functionIdCounter}`
}

/**
 * Reset function ID counter (useful for testing)
 */
export function resetFunctionIdCounter(): void {
  functionIdCounter = 0
}

/**
 * Check if a value is a $function operator
 */
export function isFunctionOperator(value: unknown): value is { $function: FunctionSpec } {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$function' in value
  )
}

/**
 * Create a FunctionExpression from a $function spec
 * Utility for external code that needs to work with function expressions
 */
export function createFunctionExpression(spec: FunctionSpec): FunctionExpression {
  const bodyStr = typeof spec.body === 'function'
    ? spec.body.toString()
    : spec.body

  const argPaths: string[] = []
  const literalArgs = new Map<number, unknown>()

  for (let i = 0; i < spec.args.length; i++) {
    const arg = spec.args[i]

    if (isFieldReference(arg)) {
      const path = getFieldPath(arg as string)
      argPaths.push(path)
    } else {
      literalArgs.set(i, arg)
    }
  }

  return {
    __type: 'function',
    body: bodyStr,
    argPaths,
    literalArgs
  }
}

/**
 * Parse a function marker from SQL output
 * Returns the parsed function expression or null if not a function marker
 */
export function parseFunctionPlaceholder(sql: string): {
  __type: 'function'
  body: string
  argPaths: string[]
  literalArgs: Record<number, unknown>
  argOrder: Array<{ type: 'field'; path: string } | { type: 'literal'; index: number }>
} | null {
  const match = sql.match(/'__FUNCTION__(.+?)'/)
  if (!match) return null

  try {
    // Unescape single quotes and parse JSON
    const json = match[1].replace(/''/g, "'")
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Check if SQL contains function markers
 */
export function hasFunctionPlaceholders(sql: string): boolean {
  return /__FUNCTION__/.test(sql)
}
