/**
 * Types for $function operator - secure user code execution via worker-loader
 */

// Import and re-export worker loader types from consolidated RPC types
import type {
  WorkerLoader,
  WorkerCode,
  WorkerStub,
  WorkerEntrypoint,
} from './rpc'

export type { WorkerLoader, WorkerCode, WorkerStub, WorkerEntrypoint }

/**
 * MongoDB $function operator specification
 */
export interface FunctionSpec {
  /** Function body - string or actual function */
  body: string | ((...args: unknown[]) => unknown)
  /** Arguments to pass - can include field references like "$fieldName" */
  args: unknown[]
  /** Language - only "js" supported */
  lang: 'js'
}

/**
 * Function definition for user-defined functions in aggregation pipelines
 * Used for $function and $accumulator operators
 */
export interface FunctionDefinition {
  /** Function code as string or serialized function */
  code: string | ((...args: unknown[]) => unknown)
  /** Arguments passed to the function - can include field references ($fieldName) or literals */
  args: unknown[]
  /** Language for execution - currently only JavaScript supported */
  language: 'js'
}

/**
 * Execution context passed to user functions
 * Provides controlled access to document data and execution environment
 */
export interface FunctionContext {
  /** Current document being processed */
  document: Record<string, unknown>
  /** Access to specific field values from the document */
  getField: (fieldPath: string) => unknown
  /** Resolved arguments with field references replaced by actual values */
  resolvedArgs: unknown[]
  /** Unique execution ID for tracing/debugging */
  executionId: string
  /** Timestamp when execution started */
  startTime: number
  /** Maximum allowed execution time in milliseconds */
  timeout: number
}

/**
 * Result from function execution
 */
export interface FunctionResult {
  success: boolean
  value?: unknown
  error?: string
  duration: number
}

/**
 * Marker for deferred function execution in expression translation
 */
export interface FunctionExpression {
  __type: 'function'
  body: string
  argPaths: string[]  // Field paths to extract from documents
  literalArgs: Map<number, unknown>  // Position -> literal value
}
