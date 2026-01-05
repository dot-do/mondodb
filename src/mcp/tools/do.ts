/**
 * Do Tool for MCP Server
 *
 * Executes arbitrary JavaScript code in a sandboxed environment.
 * This is the "do" capability for AI agents, allowing them to run
 * custom code with access to database operations.
 *
 * The tool uses a CodeLoader interface to execute code in a secure
 * sandbox (Worker Loader or Miniflare).
 */

import type { CodeLoader } from '../server'
import type { DoResult, McpToolResponse } from '../types'

// =============================================================================
// Constants
// =============================================================================

/** Maximum code length in characters (100KB) */
const MAX_CODE_LENGTH = 100_000

/** Default timeout in milliseconds (30 seconds) */
const DEFAULT_TIMEOUT = 30_000

/** Maximum number of logs to capture */
const DEFAULT_MAX_LOGS = 100

/** Patterns that may indicate potentially dangerous code */
const DANGEROUS_PATTERNS = [
  { pattern: /\beval\s*\(/, name: 'eval()' },
  { pattern: /\bFunction\s*\(/, name: 'Function()' },
  { pattern: /\bimport\s*\(/, name: 'dynamic import()' },
  { pattern: /\brequire\s*\(/, name: 'require()' },
  { pattern: /\bprocess\s*\./, name: 'process access' },
  { pattern: /\b__proto__\b/, name: '__proto__ access' },
  { pattern: /\bconstructor\s*\[/, name: 'constructor bracket access' },
]

/** Helpful hints for common issues */
const DEBUG_HINTS = [
  'Use console.log() to debug intermediate values',
  'The db object is available for database operations',
  'Use "return" to output a value from your code',
  'Async operations require "await" keyword',
]

// =============================================================================
// Types
// =============================================================================

/**
 * Options for code execution
 */
export interface DoToolOptions {
  /** Execution timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Maximum number of log entries to capture (default: 100) */
  maxLogs?: number
  /** Additional context to pass to the code loader */
  context?: Record<string, unknown>
}

/**
 * Validation result for code
 */
interface CodeValidationResult {
  valid: boolean
  error?: string
  warnings: string[]
}

// =============================================================================
// Code Validation
// =============================================================================

/**
 * Validate code before execution
 *
 * Checks for:
 * - Non-empty string
 * - Length limits
 * - Potentially dangerous patterns (warnings only)
 *
 * @param code - JavaScript code to validate
 * @returns Validation result with any warnings
 */
function validateCode(code: string): CodeValidationResult {
  const warnings: string[] = []

  // Check for empty or invalid input
  if (!code || typeof code !== 'string') {
    return {
      valid: false,
      error: 'Code must be a non-empty string',
      warnings,
    }
  }

  // Check for whitespace-only code
  if (code.trim() === '') {
    return {
      valid: false,
      error: 'Code cannot be empty or whitespace-only',
      warnings,
    }
  }

  // Check length limit
  if (code.length > MAX_CODE_LENGTH) {
    return {
      valid: false,
      error: `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters (${code.length} provided)`,
      warnings,
    }
  }

  // Check for potentially dangerous patterns (warn only, don't block)
  for (const { pattern, name } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push(`Potentially dangerous pattern detected: ${name}`)
    }
  }

  return { valid: true, warnings }
}

// =============================================================================
// Result Formatting
// =============================================================================

/**
 * Detect the language type of the code
 *
 * @param code - Source code to analyze
 * @returns Detected language ('javascript' or 'typescript')
 */
function detectLanguage(code: string): 'javascript' | 'typescript' {
  // Simple heuristic: look for TypeScript-specific syntax
  const typescriptIndicators = [
    /:\s*(string|number|boolean|any|void|never|unknown)\b/,
    /interface\s+\w+/,
    /type\s+\w+\s*=/,
    /<\w+>/,
    /as\s+\w+/,
    /\w+\s*\?\s*:/,
  ]

  for (const pattern of typescriptIndicators) {
    if (pattern.test(code)) {
      return 'typescript'
    }
  }

  return 'javascript'
}

/**
 * Extract line numbers from error messages
 *
 * @param error - Error message to parse
 * @returns Array of line numbers mentioned in the error
 */
function extractErrorLines(error: string): number[] {
  const lines: number[] = []
  // Match patterns like "line 5", "Line: 5", ":5:", "at line 5"
  const patterns = [
    /line\s*:?\s*(\d+)/gi,
    /:(\d+):/g,
    /at\s+.*:(\d+)/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(error)) !== null) {
      const lineNum = parseInt(match[1], 10)
      if (!isNaN(lineNum) && !lines.includes(lineNum)) {
        lines.push(lineNum)
      }
    }
  }

  return lines.sort((a, b) => a - b)
}

/**
 * Format result value for display
 *
 * Handles special types like undefined, null, functions, Dates, etc.
 *
 * @param result - Value to format
 * @returns Formatted string representation
 */
function formatResult(result: unknown): unknown {
  // Handle special cases
  if (result === undefined) return undefined
  if (result === null) return null
  if (typeof result === 'function') return '[Function]'
  if (result instanceof Date) return result.toISOString()
  if (result instanceof Error) {
    return {
      name: result.name,
      message: result.message,
      stack: result.stack,
    }
  }
  if (result instanceof RegExp) return result.toString()
  if (typeof result === 'bigint') return result.toString() + 'n'
  if (typeof result === 'symbol') return result.toString()

  // Handle arrays and objects (may contain special types)
  if (Array.isArray(result)) {
    return result.map(formatResult)
  }

  if (typeof result === 'object' && result !== null) {
    const formatted: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(result)) {
      formatted[key] = formatResult(value)
    }
    return formatted
  }

  // Primitives (string, number, boolean) pass through
  return result
}

/**
 * Truncate logs array to maximum length
 *
 * @param logs - Array of log entries
 * @param maxLogs - Maximum number of entries
 * @returns Truncated array with indication if truncated
 */
function truncateLogs(logs: string[], maxLogs: number): string[] {
  if (logs.length <= maxLogs) {
    return logs
  }

  const truncated = logs.slice(0, maxLogs)
  truncated.push(`... (${logs.length - maxLogs} more log entries truncated)`)
  return truncated
}

// =============================================================================
// Main Tool Function
// =============================================================================

/**
 * Execute JavaScript code in a sandbox
 *
 * @param codeLoader - Code loader interface for executing code
 * @param code - JavaScript code to execute
 * @param description - Optional description of what the code does
 * @param options - Execution options (timeout, maxLogs, context)
 * @returns MCP tool response with DoResult
 */
export async function doTool(
  codeLoader: CodeLoader,
  code: string,
  description?: string,
  options: DoToolOptions = {}
): Promise<McpToolResponse> {
  const startTime = Date.now()
  const { timeout = DEFAULT_TIMEOUT, maxLogs = DEFAULT_MAX_LOGS, context = {} } = options

  // Validate code
  const validation = validateCode(code)

  if (!validation.valid) {
    const errorResult: DoResult = {
      success: false,
      error: validation.error ?? 'Missing required field: code',
      hints: DEBUG_HINTS,
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResult),
        },
      ],
      isError: true,
    }
  }

  // Include warnings from validation
  const warnings = validation.warnings

  try {
    // Execute code using the code loader
    const executeResult = await codeLoader.execute(code, {
      description,
      timeout,
      ...context,
    })

    const duration = Date.now() - startTime

    // Format the result
    const formattedResult = formatResult(executeResult.result)

    // Build the DoResult
    const result: DoResult = {
      success: executeResult.success,
      result: formattedResult,
      duration,
    }

    // Include error details if present
    if (executeResult.error) {
      result.error = executeResult.error

      // Add hints for error cases
      result.hints = DEBUG_HINTS

      // Add code metadata with error line highlighting
      result.code = {
        source: code,
        language: detectLanguage(code),
        errorLines: extractErrorLines(executeResult.error),
      }
    }

    // Include logs if available
    if ('logs' in executeResult && Array.isArray((executeResult as { logs?: string[] }).logs)) {
      const logs = (executeResult as { logs: string[] }).logs
      result.logs = truncateLogs(logs, maxLogs)
    }

    // Include warnings if any
    if (warnings.length > 0) {
      result.warnings = warnings
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
      isError: !executeResult.success,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Handle unexpected errors from the code loader itself
    const errorResult: DoResult = {
      success: false,
      error: errorMessage,
      duration,
      hints: DEBUG_HINTS,
      code: {
        source: code,
        language: detectLanguage(code),
        errorLines: extractErrorLines(errorMessage),
      },
    }

    // Include validation warnings even on errors
    if (warnings.length > 0) {
      errorResult.warnings = warnings
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResult),
        },
      ],
      isError: true,
    }
  }
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * MCP Tool Definition for do
 *
 * Provides comprehensive documentation for AI agents using this tool.
 */
export const doToolDefinition = {
  name: 'do',
  description: `Execute JavaScript code in a secure sandbox with database access.

The code runs in an isolated environment with the following globals:
- \`db\` - Database access object for MongoDB-like operations
- \`console\` - Console for logging (logs are captured and returned)

Key features:
- Async/await supported for database operations
- Results from the last expression or \`return\` statement are captured
- Console output is captured in the response
- 30 second default timeout

Examples:
- Query: \`return await db.collection("users").find({})\`
- Insert: \`return await db.collection("users").insertOne({ name: "Alice" })\`
- Aggregate: \`return await db.collection("orders").aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])\`
- Transform: \`const users = await db.collection("users").find({}); return users.map(u => u.name)\``,
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description:
          'JavaScript code to execute. Supports async/await. Use `return` to output a value. The `db` object provides database access.',
      },
      description: {
        type: 'string',
        description:
          'Optional description of what the code does. Useful for logging, auditing, and debugging.',
      },
    },
    required: ['code'],
  },
  annotations: {
    title: 'Execute Code',
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
}

export default doTool
