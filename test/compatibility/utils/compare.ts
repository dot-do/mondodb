/**
 * Comparison utilities for verifying mondodb results match MongoDB results
 *
 * Features:
 * - Compare documents ignoring _id differences (ObjectId formats may differ)
 * - Compare arrays with order sensitivity options
 * - Handle floating point comparisons with epsilon
 * - Produce clear diff output when mismatches occur
 * - Support ignoring specific fields
 */

import { ObjectId } from '../../../src/types/objectid'

// ============================================================================
// Types
// ============================================================================

export interface CompareOptions {
  /**
   * Fields to skip during comparison. Supports:
   * - Simple field names: 'createdAt'
   * - Dot-notation paths: 'user.settings.theme'
   * - The special '_id' field is commonly ignored
   */
  ignoreFields?: string[]

  /**
   * Compare ObjectId types rather than values
   * When true: { _id: ObjectId('a') } matches { _id: ObjectId('b') }
   * When false: ObjectId values must be identical
   * @default true
   */
  normalizeObjectIds?: boolean

  /**
   * Ignore array element ordering
   * When true: [1, 2, 3] matches [3, 1, 2]
   * When false: array elements must be in same order
   * @default false
   */
  ignoreArrayOrder?: boolean

  /**
   * Epsilon for floating point comparisons
   * Values are considered equal if |a - b| <= epsilon
   * @default 1e-10
   */
  floatEpsilon?: number

  /**
   * Compare numbers with relative tolerance instead of absolute
   * When true, uses: |a - b| <= epsilon * max(|a|, |b|)
   * @default false
   */
  useRelativeTolerance?: boolean

  /**
   * Maximum depth to compare nested objects
   * Helps prevent infinite recursion with circular references
   * @default 100
   */
  maxDepth?: number
}

export type DifferenceType =
  | 'missing'        // Field exists in expected but not actual
  | 'extra'          // Field exists in actual but not expected
  | 'value_mismatch' // Values differ
  | 'type_mismatch'  // Types differ
  | 'length_mismatch' // Array lengths differ

export interface Difference {
  /** Dot-notation path to the differing value */
  path: string
  /** Type of difference */
  type: DifferenceType
  /** Value from MongoDB (expected) */
  expected: unknown
  /** Value from mondodb (actual) */
  actual: unknown
  /** Human-readable description */
  message: string
}

export interface ComparisonResult {
  /** Whether the results match */
  match: boolean
  /** List of differences found */
  differences: Difference[]
  /** Summary statistics */
  stats: {
    fieldsCompared: number
    missingFields: number
    extraFields: number
    valueMismatches: number
    typeMismatches: number
  }
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<Omit<CompareOptions, 'ignoreFields'>> & { ignoreFields: string[] } = {
  ignoreFields: [],
  normalizeObjectIds: true,
  ignoreArrayOrder: false,
  floatEpsilon: 1e-10,
  useRelativeTolerance: false,
  maxDepth: 100,
}

// ============================================================================
// Core Comparison
// ============================================================================

/**
 * Compare MongoDB result (expected) with mondodb result (actual)
 *
 * @param expected - The MongoDB result (ground truth)
 * @param actual - The mondodb result to verify
 * @param options - Comparison options
 * @returns ComparisonResult with match status and differences
 *
 * @example
 * ```ts
 * const mongoResult = await mongoCollection.find({}).toArray()
 * const mondoResult = await mondoCollection.find({}).toArray()
 *
 * const result = compareResults(mongoResult, mondoResult, {
 *   ignoreFields: ['_id'],
 *   floatEpsilon: 0.001
 * })
 *
 * if (!result.match) {
 *   console.log(formatDiff(result))
 * }
 * ```
 */
export function compareResults<T>(
  expected: T,
  actual: T,
  options: CompareOptions = {}
): ComparisonResult {
  const differences: Difference[] = []
  const stats = {
    fieldsCompared: 0,
    missingFields: 0,
    extraFields: 0,
    valueMismatches: 0,
    typeMismatches: 0,
  }

  const opts = { ...DEFAULT_OPTIONS, ...options }

  compare(expected, actual, '', differences, opts, stats, 0)

  return {
    match: differences.length === 0,
    differences,
    stats,
  }
}

/**
 * Recursive comparison function
 */
function compare(
  expected: unknown,
  actual: unknown,
  path: string,
  differences: Difference[],
  options: Required<Omit<CompareOptions, 'ignoreFields'>> & { ignoreFields: string[] },
  stats: ComparisonResult['stats'],
  depth: number
): void {
  stats.fieldsCompared++

  // Depth check
  if (depth > options.maxDepth) {
    differences.push({
      path,
      type: 'value_mismatch',
      expected: '[max depth exceeded]',
      actual: '[max depth exceeded]',
      message: `Max comparison depth (${options.maxDepth}) exceeded at ${path || 'root'}`,
    })
    return
  }

  // Check if field should be ignored
  if (shouldIgnoreField(path, options.ignoreFields)) {
    return
  }

  // Handle null/undefined
  if (expected === null && actual === null) return
  if (expected === undefined && actual === undefined) return

  if (expected === null && actual !== null) {
    differences.push({
      path,
      type: 'value_mismatch',
      expected: null,
      actual,
      message: `Expected null at ${pathDisplay(path)}, got ${typeOf(actual)}`,
    })
    stats.valueMismatches++
    return
  }

  if (expected !== null && actual === null) {
    differences.push({
      path,
      type: 'value_mismatch',
      expected,
      actual: null,
      message: `Expected ${typeOf(expected)} at ${pathDisplay(path)}, got null`,
    })
    stats.valueMismatches++
    return
  }

  if (expected === undefined && actual !== undefined) {
    differences.push({
      path,
      type: 'extra',
      expected: undefined,
      actual,
      message: `Unexpected value at ${pathDisplay(path)}`,
    })
    stats.extraFields++
    return
  }

  if (expected !== undefined && actual === undefined) {
    differences.push({
      path,
      type: 'missing',
      expected,
      actual: undefined,
      message: `Missing value at ${pathDisplay(path)}`,
    })
    stats.missingFields++
    return
  }

  // Handle ObjectId comparison
  if (isObjectId(expected) || isObjectId(actual)) {
    compareObjectIds(expected, actual, path, differences, options, stats)
    return
  }

  // Handle Date comparison
  if (expected instanceof Date || actual instanceof Date) {
    compareDates(expected, actual, path, differences, stats)
    return
  }

  // Handle RegExp comparison
  if (expected instanceof RegExp || actual instanceof RegExp) {
    compareRegExps(expected, actual, path, differences, stats)
    return
  }

  // Handle arrays
  if (Array.isArray(expected) || Array.isArray(actual)) {
    compareArraysInternal(expected, actual, path, differences, options, stats, depth)
    return
  }

  // Handle numbers (with epsilon for floats)
  if (typeof expected === 'number' && typeof actual === 'number') {
    compareNumbers(expected, actual, path, differences, options, stats)
    return
  }

  // Handle objects
  if (typeof expected === 'object' && typeof actual === 'object') {
    compareObjects(expected as Record<string, unknown>, actual as Record<string, unknown>, path, differences, options, stats, depth)
    return
  }

  // Handle primitives (string, boolean)
  if (expected !== actual) {
    if (typeof expected !== typeof actual) {
      differences.push({
        path,
        type: 'type_mismatch',
        expected,
        actual,
        message: `Type mismatch at ${pathDisplay(path)}: expected ${typeOf(expected)}, got ${typeOf(actual)}`,
      })
      stats.typeMismatches++
    } else {
      differences.push({
        path,
        type: 'value_mismatch',
        expected,
        actual,
        message: `Value mismatch at ${pathDisplay(path)}: ${formatValue(expected)} !== ${formatValue(actual)}`,
      })
      stats.valueMismatches++
    }
  }
}

// ============================================================================
// Type-specific Comparisons
// ============================================================================

function compareObjectIds(
  expected: unknown,
  actual: unknown,
  path: string,
  differences: Difference[],
  options: Required<Omit<CompareOptions, 'ignoreFields'>> & { ignoreFields: string[] },
  stats: ComparisonResult['stats']
): void {
  if (options.normalizeObjectIds) {
    // Just verify both are ObjectId-like
    if (!isObjectId(expected)) {
      differences.push({
        path,
        type: 'type_mismatch',
        expected,
        actual,
        message: `Expected ObjectId at ${pathDisplay(path)}, got ${typeOf(expected)}`,
      })
      stats.typeMismatches++
    } else if (!isObjectId(actual)) {
      differences.push({
        path,
        type: 'type_mismatch',
        expected,
        actual,
        message: `Expected ObjectId at ${pathDisplay(path)}, got ${typeOf(actual)}`,
      })
      stats.typeMismatches++
    }
    // If both are ObjectIds, they match (we don't compare values)
  } else {
    // Compare actual ObjectId values
    const expStr = isObjectId(expected) ? getObjectIdString(expected) : String(expected)
    const actStr = isObjectId(actual) ? getObjectIdString(actual) : String(actual)
    if (expStr !== actStr) {
      differences.push({
        path,
        type: 'value_mismatch',
        expected: expStr,
        actual: actStr,
        message: `ObjectId mismatch at ${pathDisplay(path)}: ${expStr} !== ${actStr}`,
      })
      stats.valueMismatches++
    }
  }
}

function compareDates(
  expected: unknown,
  actual: unknown,
  path: string,
  differences: Difference[],
  stats: ComparisonResult['stats']
): void {
  if (!(expected instanceof Date)) {
    differences.push({
      path,
      type: 'type_mismatch',
      expected,
      actual,
      message: `Expected non-Date at ${pathDisplay(path)}, got Date`,
    })
    stats.typeMismatches++
    return
  }
  if (!(actual instanceof Date)) {
    differences.push({
      path,
      type: 'type_mismatch',
      expected,
      actual,
      message: `Expected Date at ${pathDisplay(path)}, got ${typeOf(actual)}`,
    })
    stats.typeMismatches++
    return
  }
  if (expected.getTime() !== actual.getTime()) {
    differences.push({
      path,
      type: 'value_mismatch',
      expected: expected.toISOString(),
      actual: actual.toISOString(),
      message: `Date mismatch at ${pathDisplay(path)}: ${expected.toISOString()} !== ${actual.toISOString()}`,
    })
    stats.valueMismatches++
  }
}

function compareRegExps(
  expected: unknown,
  actual: unknown,
  path: string,
  differences: Difference[],
  stats: ComparisonResult['stats']
): void {
  if (!(expected instanceof RegExp)) {
    differences.push({
      path,
      type: 'type_mismatch',
      expected,
      actual,
      message: `Expected non-RegExp at ${pathDisplay(path)}, got RegExp`,
    })
    stats.typeMismatches++
    return
  }
  if (!(actual instanceof RegExp)) {
    differences.push({
      path,
      type: 'type_mismatch',
      expected,
      actual,
      message: `Expected RegExp at ${pathDisplay(path)}, got ${typeOf(actual)}`,
    })
    stats.typeMismatches++
    return
  }
  if (expected.source !== actual.source || expected.flags !== actual.flags) {
    differences.push({
      path,
      type: 'value_mismatch',
      expected: expected.toString(),
      actual: actual.toString(),
      message: `RegExp mismatch at ${pathDisplay(path)}: ${expected} !== ${actual}`,
    })
    stats.valueMismatches++
  }
}

function compareNumbers(
  expected: number,
  actual: number,
  path: string,
  differences: Difference[],
  options: Required<Omit<CompareOptions, 'ignoreFields'>> & { ignoreFields: string[] },
  stats: ComparisonResult['stats']
): void {
  // Handle NaN
  if (Number.isNaN(expected) && Number.isNaN(actual)) {
    return // Both NaN, consider equal
  }
  if (Number.isNaN(expected) || Number.isNaN(actual)) {
    differences.push({
      path,
      type: 'value_mismatch',
      expected,
      actual,
      message: `Number mismatch at ${pathDisplay(path)}: ${expected} !== ${actual} (NaN comparison)`,
    })
    stats.valueMismatches++
    return
  }

  // Handle Infinity
  if (!Number.isFinite(expected) || !Number.isFinite(actual)) {
    if (expected !== actual) {
      differences.push({
        path,
        type: 'value_mismatch',
        expected,
        actual,
        message: `Number mismatch at ${pathDisplay(path)}: ${expected} !== ${actual} (infinity comparison)`,
      })
      stats.valueMismatches++
    }
    return
  }

  // Floating point comparison with epsilon
  const diff = Math.abs(expected - actual)
  let isEqual: boolean

  if (options.useRelativeTolerance) {
    // Relative tolerance: |a - b| <= epsilon * max(|a|, |b|)
    const maxAbs = Math.max(Math.abs(expected), Math.abs(actual))
    isEqual = maxAbs === 0 ? diff === 0 : diff <= options.floatEpsilon * maxAbs
  } else {
    // Absolute tolerance: |a - b| <= epsilon
    isEqual = diff <= options.floatEpsilon
  }

  if (!isEqual) {
    differences.push({
      path,
      type: 'value_mismatch',
      expected,
      actual,
      message: `Number mismatch at ${pathDisplay(path)}: ${expected} !== ${actual} (diff: ${diff}, epsilon: ${options.floatEpsilon})`,
    })
    stats.valueMismatches++
  }
}

function compareArraysInternal(
  expected: unknown,
  actual: unknown,
  path: string,
  differences: Difference[],
  options: Required<Omit<CompareOptions, 'ignoreFields'>> & { ignoreFields: string[] },
  stats: ComparisonResult['stats'],
  depth: number
): void {
  if (!Array.isArray(expected)) {
    differences.push({
      path,
      type: 'type_mismatch',
      expected,
      actual,
      message: `Expected non-array at ${pathDisplay(path)}, got array`,
    })
    stats.typeMismatches++
    return
  }
  if (!Array.isArray(actual)) {
    differences.push({
      path,
      type: 'type_mismatch',
      expected,
      actual,
      message: `Expected array at ${pathDisplay(path)}, got ${typeOf(actual)}`,
    })
    stats.typeMismatches++
    return
  }

  if (expected.length !== actual.length) {
    differences.push({
      path,
      type: 'length_mismatch',
      expected: expected.length,
      actual: actual.length,
      message: `Array length mismatch at ${pathDisplay(path)}: expected ${expected.length} elements, got ${actual.length}`,
    })
  }

  if (options.ignoreArrayOrder) {
    // Unordered comparison - check each expected element exists in actual
    const unmatchedActual = [...actual]

    for (let i = 0; i < expected.length; i++) {
      const matchIndex = unmatchedActual.findIndex(act => {
        const testResult = compareResults(expected[i], act, { ...options })
        return testResult.match
      })

      if (matchIndex === -1) {
        differences.push({
          path: `${path}[${i}]`,
          type: 'missing',
          expected: expected[i],
          actual: undefined,
          message: `Array element at ${pathDisplay(path)}[${i}] not found in actual array`,
        })
        stats.missingFields++
      } else {
        // Remove matched element to prevent double-matching
        unmatchedActual.splice(matchIndex, 1)
      }
    }

    // Report any unmatched elements in actual
    for (const unmatched of unmatchedActual) {
      differences.push({
        path: `${path}[?]`,
        type: 'extra',
        expected: undefined,
        actual: unmatched,
        message: `Extra element in actual array at ${pathDisplay(path)}: ${formatValue(unmatched)}`,
      })
      stats.extraFields++
    }
  } else {
    // Ordered comparison
    const len = Math.max(expected.length, actual.length)
    for (let i = 0; i < len; i++) {
      const elemPath = path ? `${path}[${i}]` : `[${i}]`

      if (i >= expected.length) {
        differences.push({
          path: elemPath,
          type: 'extra',
          expected: undefined,
          actual: actual[i],
          message: `Extra element at ${pathDisplay(elemPath)}`,
        })
        stats.extraFields++
      } else if (i >= actual.length) {
        differences.push({
          path: elemPath,
          type: 'missing',
          expected: expected[i],
          actual: undefined,
          message: `Missing element at ${pathDisplay(elemPath)}`,
        })
        stats.missingFields++
      } else {
        compare(expected[i], actual[i], elemPath, differences, options, stats, depth + 1)
      }
    }
  }
}

function compareObjects(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  path: string,
  differences: Difference[],
  options: Required<Omit<CompareOptions, 'ignoreFields'>> & { ignoreFields: string[] },
  stats: ComparisonResult['stats'],
  depth: number
): void {
  const expKeys = Object.keys(expected)
  const actKeys = Object.keys(actual)
  const allKeys = Array.from(new Set([...expKeys, ...actKeys]))

  for (const key of allKeys) {
    const keyPath = path ? `${path}.${key}` : key

    // Skip ignored fields
    if (shouldIgnoreField(keyPath, options.ignoreFields) || shouldIgnoreField(key, options.ignoreFields)) {
      continue
    }

    const hasExpected = key in expected
    const hasActual = key in actual

    if (!hasExpected && hasActual) {
      differences.push({
        path: keyPath,
        type: 'extra',
        expected: undefined,
        actual: actual[key],
        message: `Extra field '${key}' at ${pathDisplay(keyPath)}`,
      })
      stats.extraFields++
    } else if (hasExpected && !hasActual) {
      differences.push({
        path: keyPath,
        type: 'missing',
        expected: expected[key],
        actual: undefined,
        message: `Missing field '${key}' at ${pathDisplay(keyPath)}`,
      })
      stats.missingFields++
    } else {
      compare(expected[key], actual[key], keyPath, differences, options, stats, depth + 1)
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if value is an ObjectId (either our implementation or MongoDB's)
 */
function isObjectId(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  // Our ObjectId
  if (value instanceof ObjectId) return true

  // MongoDB ObjectId (check constructor name)
  if (value.constructor?.name === 'ObjectId') return true

  // Duck typing: has toHexString method and _bsontype
  if (
    typeof (value as any).toHexString === 'function' &&
    (value as any)._bsontype === 'ObjectId'
  ) {
    return true
  }

  // Duck typing: has toHexString method
  if (typeof (value as any).toHexString === 'function') return true

  return false
}

/**
 * Get hex string from ObjectId-like value
 */
function getObjectIdString(value: unknown): string {
  if (value instanceof ObjectId) return value.toHexString()
  if (typeof (value as any).toHexString === 'function') return (value as any).toHexString()
  if (typeof (value as any).toString === 'function') return (value as any).toString()
  return String(value)
}

/**
 * Check if a path should be ignored based on ignoreFields
 */
function shouldIgnoreField(path: string, ignoreFields: string[]): boolean {
  if (!path || ignoreFields.length === 0) return false

  // Exact match
  if (ignoreFields.includes(path)) return true

  // Match the last segment of the path (field name only)
  const lastSegment = path.split('.').pop() || ''
  if (ignoreFields.includes(lastSegment)) return true

  // Check for wildcard patterns
  for (const pattern of ignoreFields) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      if (regex.test(path)) return true
    }
  }

  return false
}

/**
 * Get human-readable type name
 */
function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'Date'
  if (value instanceof RegExp) return 'RegExp'
  if (isObjectId(value)) return 'ObjectId'
  return typeof value
}

/**
 * Format path for display (handle empty root path)
 */
function pathDisplay(path: string): string {
  return path || 'root'
}

/**
 * Format value for display in messages
 */
function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'object') {
    try {
      const str = JSON.stringify(value)
      return str.length > 50 ? str.slice(0, 47) + '...' : str
    } catch {
      return '[circular]'
    }
  }
  return String(value)
}

// ============================================================================
// Diff Output Formatting
// ============================================================================

export interface DiffFormatOptions {
  /** Include colors (ANSI escape codes) in output */
  colors?: boolean
  /** Maximum number of differences to show */
  maxDiffs?: number
  /** Show context around values */
  showContext?: boolean
  /** Indent string */
  indent?: string
}

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
}

/**
 * Format differences as a human-readable diff string
 *
 * @example
 * ```ts
 * const result = compareResults(expected, actual)
 * if (!result.match) {
 *   console.log(formatDiff(result, { colors: true }))
 * }
 * ```
 */
export function formatDiff(
  result: ComparisonResult,
  options: DiffFormatOptions = {}
): string {
  const { colors = false, maxDiffs = 20, indent = '  ' } = options

  const c = colors ? COLORS : { red: '', green: '', yellow: '', blue: '', cyan: '', gray: '', reset: '', bold: '' }

  if (result.match) {
    return `${c.green}Results match${c.reset}`
  }

  const lines: string[] = []

  // Header
  lines.push(`${c.bold}${c.red}Results do not match${c.reset}`)
  lines.push('')

  // Stats
  lines.push(`${c.cyan}Statistics:${c.reset}`)
  lines.push(`${indent}Fields compared: ${result.stats.fieldsCompared}`)
  if (result.stats.missingFields > 0) {
    lines.push(`${indent}${c.red}Missing fields: ${result.stats.missingFields}${c.reset}`)
  }
  if (result.stats.extraFields > 0) {
    lines.push(`${indent}${c.yellow}Extra fields: ${result.stats.extraFields}${c.reset}`)
  }
  if (result.stats.valueMismatches > 0) {
    lines.push(`${indent}${c.red}Value mismatches: ${result.stats.valueMismatches}${c.reset}`)
  }
  if (result.stats.typeMismatches > 0) {
    lines.push(`${indent}${c.red}Type mismatches: ${result.stats.typeMismatches}${c.reset}`)
  }
  lines.push('')

  // Differences
  lines.push(`${c.cyan}Differences (${Math.min(result.differences.length, maxDiffs)} of ${result.differences.length}):${c.reset}`)
  lines.push('')

  const diffsToShow = result.differences.slice(0, maxDiffs)

  for (let i = 0; i < diffsToShow.length; i++) {
    const diff = diffsToShow[i]
    const num = `${i + 1}.`

    lines.push(`${c.bold}${num}${c.reset} ${c.blue}${diff.path || 'root'}${c.reset}`)

    switch (diff.type) {
      case 'missing':
        lines.push(`${indent}${c.gray}Type:${c.reset} ${c.red}MISSING${c.reset}`)
        lines.push(`${indent}${c.gray}Expected:${c.reset} ${c.green}${formatValue(diff.expected)}${c.reset}`)
        lines.push(`${indent}${c.gray}Actual:${c.reset} ${c.red}(not present)${c.reset}`)
        break
      case 'extra':
        lines.push(`${indent}${c.gray}Type:${c.reset} ${c.yellow}EXTRA${c.reset}`)
        lines.push(`${indent}${c.gray}Expected:${c.reset} ${c.green}(not present)${c.reset}`)
        lines.push(`${indent}${c.gray}Actual:${c.reset} ${c.yellow}${formatValue(diff.actual)}${c.reset}`)
        break
      case 'value_mismatch':
        lines.push(`${indent}${c.gray}Type:${c.reset} ${c.red}VALUE MISMATCH${c.reset}`)
        lines.push(`${indent}${c.gray}Expected:${c.reset} ${c.green}${formatValue(diff.expected)}${c.reset}`)
        lines.push(`${indent}${c.gray}Actual:${c.reset} ${c.red}${formatValue(diff.actual)}${c.reset}`)
        break
      case 'type_mismatch':
        lines.push(`${indent}${c.gray}Type:${c.reset} ${c.red}TYPE MISMATCH${c.reset}`)
        lines.push(`${indent}${c.gray}Expected:${c.reset} ${c.green}${typeOf(diff.expected)} (${formatValue(diff.expected)})${c.reset}`)
        lines.push(`${indent}${c.gray}Actual:${c.reset} ${c.red}${typeOf(diff.actual)} (${formatValue(diff.actual)})${c.reset}`)
        break
      case 'length_mismatch':
        lines.push(`${indent}${c.gray}Type:${c.reset} ${c.yellow}LENGTH MISMATCH${c.reset}`)
        lines.push(`${indent}${c.gray}Expected length:${c.reset} ${c.green}${diff.expected}${c.reset}`)
        lines.push(`${indent}${c.gray}Actual length:${c.reset} ${c.red}${diff.actual}${c.reset}`)
        break
    }

    lines.push('')
  }

  if (result.differences.length > maxDiffs) {
    lines.push(`${c.gray}... and ${result.differences.length - maxDiffs} more differences${c.reset}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Format differences as a simple list of messages (no colors)
 */
export function formatDifferences(differences: Difference[]): string {
  if (differences.length === 0) return 'No differences'

  return differences
    .map((d, i) => `${i + 1}. ${d.message}`)
    .join('\n')
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that two results match, throwing if they don't
 *
 * @throws Error with formatted diff if results don't match
 *
 * @example
 * ```ts
 * const mongoResult = await mongoCollection.find({}).toArray()
 * const mondoResult = await mondoCollection.find({}).toArray()
 *
 * // Throws if results don't match
 * assertResultsMatch(mongoResult, mondoResult, {
 *   ignoreFields: ['_id']
 * })
 * ```
 */
export function assertResultsMatch<T>(
  expected: T,
  actual: T,
  options: CompareOptions = {}
): void {
  const result = compareResults(expected, actual, options)
  if (!result.match) {
    throw new Error(formatDiff(result, { colors: false }))
  }
}

/**
 * Compare documents ignoring _id differences
 * Convenience wrapper for the common case of comparing documents
 */
export function compareDocuments<T>(
  expected: T,
  actual: T,
  options: CompareOptions = {}
): ComparisonResult {
  return compareResults(expected, actual, {
    ignoreFields: ['_id'],
    normalizeObjectIds: true,
    ...options,
  })
}

/**
 * Assert that documents match (ignoring _id differences)
 */
export function assertDocumentsMatch<T>(
  expected: T,
  actual: T,
  options: CompareOptions = {}
): void {
  assertResultsMatch(expected, actual, {
    ignoreFields: ['_id'],
    normalizeObjectIds: true,
    ...options,
  })
}

/**
 * Compare arrays with configurable order sensitivity
 */
export function compareArrays<T>(
  expected: T[],
  actual: T[],
  options: CompareOptions & { ordered?: boolean } = {}
): ComparisonResult {
  const { ordered = true, ...compareOpts } = options
  return compareResults(expected, actual, {
    ...compareOpts,
    ignoreArrayOrder: !ordered,
  })
}

/**
 * Assert that arrays match with configurable order sensitivity
 */
export function assertArraysMatch<T>(
  expected: T[],
  actual: T[],
  options: CompareOptions & { ordered?: boolean } = {}
): void {
  const result = compareArrays(expected, actual, options)
  if (!result.match) {
    throw new Error(formatDiff(result, { colors: false }))
  }
}

// ============================================================================
// Number Comparison Helpers
// ============================================================================

/**
 * Compare two numbers with epsilon tolerance
 */
export function numbersEqual(
  a: number,
  b: number,
  epsilon: number = 1e-10
): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b
  return Math.abs(a - b) <= epsilon
}

/**
 * Compare two numbers with relative tolerance
 */
export function numbersEqualRelative(
  a: number,
  b: number,
  epsilon: number = 1e-10
): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b
  const maxAbs = Math.max(Math.abs(a), Math.abs(b))
  if (maxAbs === 0) return a === b
  return Math.abs(a - b) <= epsilon * maxAbs
}
