/**
 * AggregationExecutor - Handles async execution of aggregation pipelines
 *
 * This class manages the execution of MongoDB aggregation pipelines that may
 * contain $function operators. It:
 * 1. Translates the pipeline to SQL using AggregationTranslator
 * 2. Executes the SQL query
 * 3. Detects function placeholders in the results
 * 4. Executes user functions via FunctionExecutor
 * 5. Merges function results back into documents
 */

import { FunctionExecutor } from './function-executor'
import { AggregationTranslator } from '../translator/aggregation-translator'
import type { WorkerLoader } from '../types/function'
import type { PipelineStage } from '../translator/aggregation-translator'

/**
 * Environment bindings for the aggregation executor
 */
interface AggregationExecutorEnv {
  LOADER?: WorkerLoader
}

/**
 * SQL interface for executing queries
 */
interface SqlInterface {
  exec: (query: string, ...params: unknown[]) => { results: unknown[]; toArray?: () => unknown[] }
}

/**
 * Parsed function specification from placeholder
 */
interface ParsedFunctionSpec {
  __type: 'function'
  body: string
  argPaths: string[]
  literalArgs: Record<number, unknown>
  argOrder: Array<{ type: 'field'; path: string } | { type: 'literal'; index: number }>
}

/**
 * Batch execution item for grouping functions
 */
interface BatchItem {
  docIndex: number
  fieldPath: string[]
  fnSpec: ParsedFunctionSpec
  args: unknown[]
}

/**
 * AggregationExecutor handles the execution of aggregation pipelines
 * with support for $function operators that require async execution
 */
export class AggregationExecutor {
  private functionExecutor: FunctionExecutor | null

  constructor(
    private sql: SqlInterface,
    private env: AggregationExecutorEnv
  ) {
    this.functionExecutor = env.LOADER ? new FunctionExecutor(env) : null
  }

  /**
   * Execute an aggregation pipeline
   */
  async execute(collection: string, pipeline: PipelineStage[]): Promise<unknown[]> {
    const translator = new AggregationTranslator(collection)
    const { sql, params, facets } = translator.translate(pipeline)

    // Handle facets separately
    if (facets) {
      return this.executeFacets(facets)
    }

    // Execute SQL query
    const rawResults = this.sql.exec(sql, ...params)
    const results = rawResults.toArray ? rawResults.toArray() : rawResults.results

    // Parse results
    const documents = results.map(row => {
      const data = (row as { data: string }).data
      return JSON.parse(data) as Record<string, unknown>
    })

    // Check if any results contain function placeholders
    const hasFunctions = documents.some(doc => this.documentHasFunctions(doc))

    if (!hasFunctions) {
      return documents
    }

    // Process function placeholders, passing pipeline for post-sort if needed
    return this.executeWithFunctions(documents, pipeline)
  }

  /**
   * Check if a document contains any function placeholders
   * The marker may be wrapped in quotes from SQL string output
   */
  private documentHasFunctions(doc: Record<string, unknown>): boolean {
    for (const value of Object.values(doc)) {
      if (typeof value === 'string' && value.includes('__FUNCTION__')) {
        return true
      }
      if (typeof value === 'object' && value !== null) {
        if (this.documentHasFunctions(value as Record<string, unknown>)) {
          return true
        }
      }
    }
    return false
  }

  /**
   * Execute pipeline with function placeholders
   */
  private async executeWithFunctions(
    documents: Record<string, unknown>[],
    pipeline: PipelineStage[] = []
  ): Promise<unknown[]> {
    // Collect all function invocations for batch processing
    const batchItems: BatchItem[] = []

    for (let docIndex = 0; docIndex < documents.length; docIndex++) {
      const doc = documents[docIndex]
      this.collectFunctionInvocations(doc, doc, [], docIndex, batchItems)
    }

    // Group by function body for batch execution
    const functionGroups = this.groupByFunction(batchItems)

    // Execute each function group
    for (const [body, items] of functionGroups.entries()) {
      const argsArray = items.map(item => item.args)

      try {
        let results: unknown[]

        if (this.functionExecutor) {
          // Use secure sandboxed execution via worker-loader
          results = await this.functionExecutor.executeBatch(body, argsArray)
        } else {
          // Fallback: direct evaluation (for development/testing without worker_loaders)
          // WARNING: This is NOT sandboxed and should only be used in trusted environments
          results = this.executeDirectBatch(body, argsArray)
        }

        // Apply results back to documents
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const result = results[i]
          this.setFieldValue(documents[item.docIndex], item.fieldPath, result)
        }
      } catch (error) {
        // Re-throw with context
        throw error
      }
    }

    // Re-apply $sort stages after function execution
    // This is needed because SQL sorting happened on placeholder strings, not computed values
    // Use the last $sort stage since that represents the final ordering intent
    const sortStages = pipeline.filter(stage => '$sort' in stage);
    const lastSortStage = sortStages[sortStages.length - 1] as { $sort: Record<string, number> } | undefined;
    if (lastSortStage) {
      documents.sort((a, b) => {
        for (const [field, direction] of Object.entries(lastSortStage.$sort)) {
          const aVal = this.extractFieldValue(a, `$.${field}`)
          const bVal = this.extractFieldValue(b, `$.${field}`)

          // Handle different types
          if (aVal === bVal) continue
          if (aVal === null || aVal === undefined) return direction
          if (bVal === null || bVal === undefined) return -direction

          // Compare values
          const comparison = aVal < bVal ? -1 : 1
          return comparison * direction
        }
        return 0
      })
    }

    return documents
  }

  /**
   * SECURITY: Direct function execution has been disabled to prevent arbitrary code execution.
   *
   * The $function operator requires the LOADER binding for secure sandboxed execution
   * via Cloudflare worker-loader. Without this binding, $function operators cannot be used.
   *
   * This method is kept as a private placeholder that throws an error to prevent
   * any bypass attempts.
   *
   * @throws Error - Always throws to prevent unsafe code execution
   */
  private executeDirectBatch(_body: string, _argsArray: unknown[][]): never {
    // SECURITY: new Function() has been removed to prevent arbitrary code execution
    // The $function operator requires the LOADER binding for secure sandboxed execution
    throw new Error(
      'SECURITY: $function operator requires the LOADER binding for secure sandboxed execution. ' +
        'Direct function execution is disabled to prevent arbitrary code execution. ' +
        'Please configure the worker_loaders binding in your wrangler.toml to enable $function support.'
    )
  }

  /**
   * Collect all function invocations from a document
   */
  private collectFunctionInvocations(
    root: Record<string, unknown>,
    current: Record<string, unknown>,
    path: string[],
    docIndex: number,
    items: BatchItem[]
  ): void {
    for (const [key, value] of Object.entries(current)) {
      const fieldPath = [...path, key]

      if (typeof value === 'string' && value.includes('__FUNCTION__')) {
        const fnSpec = this.parseFunctionMarker(value)
        if (fnSpec) {
          const args = this.extractArgs(root, fnSpec)
          items.push({ docIndex, fieldPath, fnSpec, args })
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.collectFunctionInvocations(root, value as Record<string, unknown>, fieldPath, docIndex, items)
      }
    }
  }

  /**
   * Parse a function marker from a string value
   * Handles both direct markers and SQL string output with quotes
   */
  private parseFunctionMarker(value: string): ParsedFunctionSpec | null {
    // Try to find the __FUNCTION__ marker in the string
    // Match __FUNCTION__ followed by a JSON object
    const match = value.match(/__FUNCTION__({.+})$/) || value.match(/__FUNCTION__({.+})'?$/)
    if (match) {
      try {
        return JSON.parse(match[1])
      } catch {
        // Try unescaping single quotes (from SQL string escaping)
        try {
          const unescaped = match[1].replace(/''/g, "'")
          return JSON.parse(unescaped)
        } catch {
          return null
        }
      }
    }
    return null
  }

  /**
   * Group batch items by function body
   */
  private groupByFunction(items: BatchItem[]): Map<string, BatchItem[]> {
    const groups = new Map<string, BatchItem[]>()

    for (const item of items) {
      const body = item.fnSpec.body
      if (!groups.has(body)) {
        groups.set(body, [])
      }
      groups.get(body)!.push(item)
    }

    return groups
  }

  /**
   * Extract arguments for a function from document data
   */
  private extractArgs(doc: Record<string, unknown>, fnSpec: ParsedFunctionSpec): unknown[] {
    return fnSpec.argOrder.map(arg => {
      if (arg.type === 'literal') {
        return fnSpec.literalArgs[arg.index!]
      }
      // Extract field value using path
      return this.extractFieldValue(doc, arg.path!)
    })
  }

  /**
   * Extract a field value from a document using JSON path
   */
  private extractFieldValue(doc: Record<string, unknown>, path: string): unknown {
    // path is like "$.field" or "$.nested.field"
    const parts = path.replace(/^\$\./, '').split('.')
    let value: unknown = doc

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined
      }
      value = (value as Record<string, unknown>)[part]
    }

    return value
  }

  /**
   * Set a field value in a document using field path
   */
  private setFieldValue(doc: Record<string, unknown>, path: string[], value: unknown): void {
    let current: Record<string, unknown> = doc

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]] as Record<string, unknown>
    }

    current[path[path.length - 1]] = value
  }

  /**
   * Execute facet pipelines
   */
  private async executeFacets(
    facets: Record<string, { sql: string; params: unknown[] }>
  ): Promise<unknown[]> {
    const result: Record<string, unknown[]> = {}

    for (const [name, facet] of Object.entries(facets)) {
      const rawResults = this.sql.exec(facet.sql, ...facet.params)
      const results = rawResults.toArray ? rawResults.toArray() : rawResults.results

      result[name] = results.map(row => {
        const data = (row as { data: string }).data
        return JSON.parse(data)
      })
    }

    return [result]
  }

  /**
   * Process function placeholders in a document recursively (legacy single-doc mode)
   * Kept for potential future use with streaming results
   */
  private async processFunctionPlaceholders(
    root: Record<string, unknown>,
    doc: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const result = { ...doc }

    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string' && value.includes('__FUNCTION__')) {
        const fnSpec = this.parseFunctionMarker(value)
        if (fnSpec && this.functionExecutor) {
          const args = this.extractArgs(root, fnSpec)
          result[key] = await this.functionExecutor.execute(fnSpec.body, args)
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = await this.processFunctionPlaceholders(root, value as Record<string, unknown>)
      }
    }

    return result
  }
}
