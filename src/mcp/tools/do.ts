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

/**
 * Execute JavaScript code in a sandbox
 *
 * @param codeLoader - Code loader interface for executing code
 * @param code - JavaScript code to execute
 * @param description - Optional description of what the code does
 * @returns MCP tool response with DoResult
 */
export async function doTool(
  codeLoader: CodeLoader,
  code: string,
  description?: string
): Promise<McpToolResponse> {
  const startTime = Date.now()

  // Validate code is a non-empty string
  if (!code || typeof code !== 'string' || code.trim() === '') {
    const errorResult: DoResult = {
      success: false,
      error: 'Missing required field: code',
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

  try {
    // Execute code using the code loader
    const executeResult = await codeLoader.execute(code, { description })

    const duration = Date.now() - startTime

    // Format the result as DoResult
    const result: DoResult = {
      success: executeResult.success,
      result: executeResult.result,
      duration,
    }

    // Include error if present
    if (executeResult.error) {
      result.error = executeResult.error
    }

    // Include logs if available (some code loaders may capture console output)
    if ('logs' in executeResult && Array.isArray((executeResult as { logs?: string[] }).logs)) {
      result.logs = (executeResult as { logs: string[] }).logs
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

    // Handle unexpected errors from the code loader itself
    const errorResult: DoResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
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

/**
 * MCP Tool Definition for do
 */
export const doToolDefinition = {
  name: 'do',
  description:
    'Execute JavaScript code in a secure sandbox. The code has access to database operations via the `db` object. Returns the result of the last expression or explicit return statement.',
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description:
          'JavaScript code to execute. Can include await for async operations. Example: return await db.collection("users").find({})',
      },
      description: {
        type: 'string',
        description:
          'Optional description of what the code does. Useful for logging and auditing.',
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
