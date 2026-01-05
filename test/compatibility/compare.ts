/**
 * Comparison utilities for compatibility testing
 * Deep compares MongoDB and mongo.do results with special handling for ObjectIds
 */

import { ObjectId } from '../../src/types/objectid'

// ============================================================================
// Types
// ============================================================================

export interface CompareOptions {
  /** Fields to skip during comparison */
  ignoreFields?: string[]
  /** Compare ObjectId types rather than values (default: true) */
  normalizeObjectIds?: boolean
  /** Ignore array element ordering (default: false) */
  ignoreArrayOrder?: boolean
  /** Current path for error reporting (internal) */
  path?: string
}

export interface Difference {
  /** Dot-notation path to the differing value */
  path: string
  /** Type of difference */
  type: 'missing' | 'extra' | 'value_mismatch' | 'type_mismatch'
  /** Value from MongoDB (expected) */
  expected: unknown
  /** Value from mongo.do (actual) */
  actual: unknown
  /** Human-readable description */
  message: string
}

export interface ComparisonResult {
  /** Whether the results match */
  match: boolean
  /** List of differences found */
  differences: Difference[]
}

// ============================================================================
// Core Comparison
// ============================================================================

/**
 * Compare MongoDB result (expected) with mongo.do result (actual)
 */
export function compareResults<T>(
  mongoResult: T,
  mondoResult: T,
  options: CompareOptions = {}
): ComparisonResult {
  const differences: Difference[] = []
  const opts: CompareOptions = {
    ignoreFields: options.ignoreFields || [],
    normalizeObjectIds: options.normalizeObjectIds ?? true,
    ignoreArrayOrder: options.ignoreArrayOrder ?? false,
    path: options.path || '',
  }

  compare(mongoResult, mondoResult, opts.path!, differences, opts)

  return {
    match: differences.length === 0,
    differences,
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
  options: CompareOptions
): void {
  // Check if field should be ignored
  if (options.ignoreFields?.includes(path)) {
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
      message: `Expected null at ${path}, got ${typeof actual}`,
    })
    return
  }

  if (expected !== null && actual === null) {
    differences.push({
      path,
      type: 'value_mismatch',
      expected,
      actual: null,
      message: `Expected ${typeof expected} at ${path}, got null`,
    })
    return
  }

  // Handle ObjectId comparison
  if (isObjectId(expected) || isObjectId(actual)) {
    if (options.normalizeObjectIds) {
      // Just verify both are ObjectId-like
      if (!isObjectId(expected)) {
        differences.push({
          path,
          type: 'type_mismatch',
          expected,
          actual,
          message: `Expected ObjectId at ${path}, got ${typeof expected}`,
        })
      } else if (!isObjectId(actual)) {
        differences.push({
          path,
          type: 'type_mismatch',
          expected,
          actual,
          message: `Expected ObjectId at ${path}, got ${typeof actual}`,
        })
      }
      // If both are ObjectIds, they match (we don't compare values)
      return
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
          message: `ObjectId mismatch at ${path}: ${expStr} !== ${actStr}`,
        })
      }
      return
    }
  }

  // Handle Date comparison
  if (expected instanceof Date || actual instanceof Date) {
    const expTime = expected instanceof Date ? expected.getTime() : null
    const actTime = actual instanceof Date ? actual.getTime() : null
    if (expTime !== actTime) {
      differences.push({
        path,
        type: 'value_mismatch',
        expected,
        actual,
        message: `Date mismatch at ${path}`,
      })
    }
    return
  }

  // Handle arrays
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected)) {
      differences.push({
        path,
        type: 'type_mismatch',
        expected,
        actual,
        message: `Expected non-array at ${path}, got array`,
      })
      return
    }
    if (!Array.isArray(actual)) {
      differences.push({
        path,
        type: 'type_mismatch',
        expected,
        actual,
        message: `Expected array at ${path}, got ${typeof actual}`,
      })
      return
    }

    if (expected.length !== actual.length) {
      differences.push({
        path,
        type: 'value_mismatch',
        expected: expected.length,
        actual: actual.length,
        message: `Array length mismatch at ${path}: ${expected.length} !== ${actual.length}`,
      })
    }

    if (options.ignoreArrayOrder) {
      // Unordered comparison - check each expected element exists in actual
      for (let i = 0; i < expected.length; i++) {
        const found = actual.some(act => {
          const testResult = compareResults(expected[i], act, { ...options, path: '' })
          return testResult.match
        })
        if (!found) {
          differences.push({
            path: `${path}[${i}]`,
            type: 'missing',
            expected: expected[i],
            actual: undefined,
            message: `Array element at ${path}[${i}] not found in actual array`,
          })
        }
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
            message: `Extra element at ${elemPath}`,
          })
        } else if (i >= actual.length) {
          differences.push({
            path: elemPath,
            type: 'missing',
            expected: expected[i],
            actual: undefined,
            message: `Missing element at ${elemPath}`,
          })
        } else {
          compare(expected[i], actual[i], elemPath, differences, options)
        }
      }
    }
    return
  }

  // Handle objects
  if (typeof expected === 'object' && typeof actual === 'object') {
    if (typeof expected !== 'object') {
      differences.push({
        path,
        type: 'type_mismatch',
        expected,
        actual,
        message: `Expected non-object at ${path}, got object`,
      })
      return
    }
    if (typeof actual !== 'object') {
      differences.push({
        path,
        type: 'type_mismatch',
        expected,
        actual,
        message: `Expected object at ${path}, got ${typeof actual}`,
      })
      return
    }

    const expObj = expected as Record<string, unknown>
    const actObj = actual as Record<string, unknown>
    const allKeys = Array.from(new Set([...Object.keys(expObj), ...Object.keys(actObj)]))

    for (const key of allKeys) {
      const keyPath = path ? `${path}.${key}` : key

      // Skip ignored fields
      if (options.ignoreFields?.includes(key) || options.ignoreFields?.includes(keyPath)) {
        continue
      }

      if (!(key in expObj)) {
        differences.push({
          path: keyPath,
          type: 'extra',
          expected: undefined,
          actual: actObj[key],
          message: `Extra field at ${keyPath}`,
        })
      } else if (!(key in actObj)) {
        differences.push({
          path: keyPath,
          type: 'missing',
          expected: expObj[key],
          actual: undefined,
          message: `Missing field at ${keyPath}`,
        })
      } else {
        compare(expObj[key], actObj[key], keyPath, differences, options)
      }
    }
    return
  }

  // Handle primitives
  if (expected !== actual) {
    if (typeof expected !== typeof actual) {
      differences.push({
        path,
        type: 'type_mismatch',
        expected,
        actual,
        message: `Type mismatch at ${path}: ${typeof expected} !== ${typeof actual}`,
      })
    } else {
      differences.push({
        path,
        type: 'value_mismatch',
        expected,
        actual,
        message: `Value mismatch at ${path}: ${JSON.stringify(expected)} !== ${JSON.stringify(actual)}`,
      })
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if value is an ObjectId (either our implementation or MongoDB's)
 */
function isObjectId(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  // Our ObjectId
  if (value instanceof ObjectId) return true

  // MongoDB ObjectId
  if (value.constructor?.name === 'ObjectId') return true

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
 * Format differences for human-readable output
 */
export function formatDifferences(differences: Difference[]): string {
  if (differences.length === 0) return 'No differences'

  return differences
    .map((d, i) => `${i + 1}. ${d.message}`)
    .join('\n')
}

/**
 * Assert that two results match, throwing if they don't
 */
export function assertResultsMatch<T>(
  mongoResult: T,
  mondoResult: T,
  options: CompareOptions = {}
): void {
  const comparison = compareResults(mongoResult, mondoResult, options)
  if (!comparison.match) {
    throw new Error(
      `Results do not match:\n${formatDifferences(comparison.differences)}`
    )
  }
}
