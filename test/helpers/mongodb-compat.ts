/**
 * MongoDB Compatibility Test Helper
 *
 * This module provides utilities for running compatibility tests between
 * real MongoDB (via MongoMemoryServer) and mongo.do.
 */

import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient as RealMongoClient, Collection as RealCollection, Db as RealDb, Document as RealDocument } from 'mongodb'
import { MongoClient as MondoClient } from '../../src/client/MongoClient'
import { MongoDatabase as MondoDatabase } from '../../src/client/mongo-database'
import { MongoCollection as MondoCollection } from '../../src/client/mongo-collection'

export interface CompatTestContext {
  /** The MongoMemoryServer instance */
  mongoServer: MongoMemoryServer
  /** Real MongoDB client */
  mongoClient: RealMongoClient
  /** Real MongoDB database */
  mongoDb: RealDb
  /** Mondodb client */
  mondoClient: MondoClient
  /** Mondodb database */
  mondoDb: MondoDatabase
  /** Get a collection pair (both real and mondo) */
  getCollections: <T extends RealDocument = RealDocument>(name: string) => {
    mongo: RealCollection<T>
    mondo: MondoCollection<T>
  }
  /** Clean up all resources */
  cleanup: () => Promise<void>
}

/**
 * Start the MongoDB compatibility test environment
 *
 * Creates both a real MongoDB instance (via MongoMemoryServer) and a mongo.do
 * client, allowing side-by-side comparison of operation results.
 *
 * @param dbName - Database name to use (default: 'compat-test')
 * @returns CompatTestContext with both clients and helper methods
 *
 * @example
 * ```typescript
 * const ctx = await startCompatEnvironment('mytest')
 * try {
 *   const { mongo, mondo } = ctx.getCollections('users')
 *   // Run tests against both
 * } finally {
 *   await ctx.cleanup()
 * }
 * ```
 */
export async function startCompatEnvironment(dbName: string = 'compat-test'): Promise<CompatTestContext> {
  // Start MongoMemoryServer
  const mongoServer = await MongoMemoryServer.create()
  const mongoUri = mongoServer.getUri()

  // Connect real MongoDB client
  const mongoClient = new RealMongoClient(mongoUri)
  await mongoClient.connect()
  const mongoDb = mongoClient.db(dbName)

  // Create mongo.do client (uses in-memory storage for testing)
  const mondoClient = new MondoClient(`mongodo://localhost/${dbName}`)
  await mondoClient.connect()
  const mondoDb = mondoClient.db(dbName)

  return {
    mongoServer,
    mongoClient,
    mongoDb,
    mondoClient,
    mondoDb,

    getCollections<T extends RealDocument = RealDocument>(name: string) {
      return {
        mongo: mongoDb.collection<T>(name),
        mondo: mondoDb.collection<T>(name) as MondoCollection<T>,
      }
    },

    async cleanup() {
      await mongoClient.close()
      await mondoClient.close()
      await mongoServer.stop()
    },
  }
}

/**
 * Result comparison interface
 */
export interface ComparisonResult<T> {
  /** Whether the results match */
  match: boolean
  /** Result from MongoDB */
  mongoResult: T
  /** Result from mongo.do */
  mondoResult: T
  /** Description of any differences */
  differences?: string[]
}

/**
 * Compare operation results between MongoDB and mongo.do
 *
 * @param mongoResult - Result from real MongoDB
 * @param mondoResult - Result from mongo.do
 * @param options - Comparison options
 * @returns ComparisonResult with match status and details
 */
export function compareResults<T>(
  mongoResult: T,
  mondoResult: T,
  options: {
    /** Fields to ignore when comparing (e.g., '_id' if auto-generated) */
    ignoreFields?: string[]
    /** Custom comparison function */
    customCompare?: (mongo: T, mondo: T) => boolean
  } = {}
): ComparisonResult<T> {
  const { ignoreFields = [], customCompare } = options
  const differences: string[] = []

  // Use custom compare if provided
  if (customCompare) {
    const match = customCompare(mongoResult, mondoResult)
    return {
      match,
      mongoResult,
      mondoResult,
      differences: match ? undefined : ['Custom comparison failed'],
    }
  }

  // Deep compare with field ignoring
  const normalizedMongo = normalizeForComparison(mongoResult, ignoreFields)
  const normalizedMondo = normalizeForComparison(mondoResult, ignoreFields)

  const match = deepEqual(normalizedMongo, normalizedMondo, differences)

  return {
    match,
    mongoResult,
    mondoResult,
    differences: match ? undefined : differences,
  }
}

/**
 * Normalize a value for comparison by removing ignored fields
 */
function normalizeForComparison<T>(value: T, ignoreFields: string[]): T {
  if (value === null || value === undefined) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeForComparison(item, ignoreFields)) as T
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (!ignoreFields.includes(key)) {
        result[key] = normalizeForComparison(val, ignoreFields)
      }
    }
    return result as T
  }

  return value
}

/**
 * Deep equality check with difference tracking
 */
function deepEqual(a: unknown, b: unknown, differences: string[], path: string = ''): boolean {
  // Handle null/undefined
  if (a === null && b === null) return true
  if (a === undefined && b === undefined) return true
  if (a === null || b === null || a === undefined || b === undefined) {
    differences.push(`${path || 'root'}: one is null/undefined, other is not`)
    return false
  }

  // Handle ObjectId-like objects (compare by string representation)
  if (isObjectIdLike(a) && isObjectIdLike(b)) {
    const aStr = getObjectIdString(a)
    const bStr = getObjectIdString(b)
    if (aStr === bStr) return true
    differences.push(`${path || 'root'}: ObjectId mismatch: ${aStr} vs ${bStr}`)
    return false
  }

  // Handle Date objects
  if (a instanceof Date && b instanceof Date) {
    if (a.getTime() === b.getTime()) return true
    differences.push(`${path || 'root'}: Date mismatch: ${a.toISOString()} vs ${b.toISOString()}`)
    return false
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      differences.push(`${path || 'root'}: array length mismatch: ${a.length} vs ${b.length}`)
      return false
    }
    let allMatch = true
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], differences, `${path}[${i}]`)) {
        allMatch = false
      }
    }
    return allMatch
  }

  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object)
    const keysB = Object.keys(b as object)

    // Check for missing keys
    const allKeys = new Set([...keysA, ...keysB])
    let allMatch = true

    for (const key of allKeys) {
      const hasA = key in (a as object)
      const hasB = key in (b as object)

      if (!hasA) {
        differences.push(`${path ? path + '.' : ''}${key}: missing in first object`)
        allMatch = false
        continue
      }

      if (!hasB) {
        differences.push(`${path ? path + '.' : ''}${key}: missing in second object`)
        allMatch = false
        continue
      }

      if (
        !deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          differences,
          `${path ? path + '.' : ''}${key}`
        )
      ) {
        allMatch = false
      }
    }

    return allMatch
  }

  // Primitive comparison
  if (a === b) return true
  differences.push(`${path || 'root'}: value mismatch: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
  return false
}

/**
 * Check if a value looks like an ObjectId
 */
function isObjectIdLike(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value !== 'object') return false

  // Check for MongoDB ObjectId
  if ('toHexString' in value && typeof (value as { toHexString: unknown }).toHexString === 'function') {
    return true
  }

  // Check for mongo.do ObjectId
  if ('_hexString' in value) {
    return true
  }

  return false
}

/**
 * Get string representation of an ObjectId-like value
 */
function getObjectIdString(value: unknown): string {
  if (value === null || value === undefined) return ''

  // MongoDB ObjectId
  if (typeof (value as { toHexString?: () => string }).toHexString === 'function') {
    return (value as { toHexString: () => string }).toHexString()
  }

  // mongo.do ObjectId
  if (typeof (value as { toString?: () => string }).toString === 'function') {
    return (value as { toString: () => string }).toString()
  }

  return String(value)
}

/**
 * Assert that both operations produce equivalent results
 *
 * @param description - Description of the test
 * @param mongoOp - Operation to run on MongoDB
 * @param mondoOp - Operation to run on mongo.do
 * @param options - Comparison options
 * @throws Error if results don't match
 */
export async function assertCompatible<T>(
  description: string,
  mongoOp: () => Promise<T>,
  mondoOp: () => Promise<T>,
  options: {
    ignoreFields?: string[]
    customCompare?: (mongo: T, mondo: T) => boolean
  } = {}
): Promise<void> {
  const mongoResult = await mongoOp()
  const mondoResult = await mondoOp()

  const comparison = compareResults(mongoResult, mondoResult, options)

  if (!comparison.match) {
    const diffStr = comparison.differences?.join('\n  - ') || 'Unknown differences'
    throw new Error(
      `Compatibility test failed: ${description}\n` +
        `Differences:\n  - ${diffStr}\n` +
        `MongoDB result: ${JSON.stringify(mongoResult, null, 2)}\n` +
        `mongo.do result: ${JSON.stringify(mondoResult, null, 2)}`
    )
  }
}

/**
 * Run a compatibility test that compares results from both databases
 *
 * @param ctx - Compatibility test context
 * @param collectionName - Collection to test against
 * @param test - Test function that receives both collections
 */
export async function runCompatTest<T extends RealDocument = RealDocument>(
  ctx: CompatTestContext,
  collectionName: string,
  test: (collections: { mongo: RealCollection<T>; mondo: MondoCollection<T> }) => Promise<void>
): Promise<void> {
  // Clear both collections before test
  const { mongo, mondo } = ctx.getCollections<T>(collectionName)
  await mongo.deleteMany({})
  await mondo.deleteMany({})

  // Run the test
  await test({ mongo, mondo })
}
