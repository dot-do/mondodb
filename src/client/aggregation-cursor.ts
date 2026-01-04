/**
 * AggregationCursor - Async cursor for MongoDB aggregation pipeline results
 *
 * Provides:
 * - Async iteration with for-await-of
 * - toArray() for collecting all results
 * - Support for async pipeline stages ($function, $lookup with pipeline)
 * - Proper error propagation from async stages
 */

import { EventEmitter } from 'events'
import type { Document } from './mongo-collection'
import type { PipelineStage } from '../translator/stages/types'

/**
 * Options for aggregation cursor
 */
export interface AggregationCursorOptions {
  /** Batch size for streaming results */
  batchSize?: number
  /** Allow disk use for large result sets */
  allowDiskUse?: boolean
  /** Maximum time for operation (ms) */
  maxTimeMS?: number
  /** Comment for the operation */
  comment?: string
}

/**
 * Async function stage definition ($function)
 */
export interface FunctionStage {
  body: string | ((...args: unknown[]) => unknown | Promise<unknown>)
  args: unknown[]
  lang: 'js'
}

/**
 * Result from async stage execution
 */
export interface AsyncStageResult<T = Document> {
  documents: T[]
  hasMore: boolean
  error?: Error
}

/**
 * Executor function type for running pipeline against data
 */
export type PipelineExecutor<T> = (
  documents: T[],
  stage: PipelineStage,
  context: AsyncExecutionContext
) => Promise<T[]>

/**
 * Context for async pipeline execution
 */
export interface AsyncExecutionContext {
  /** Collection name being aggregated */
  collectionName: string
  /** Lookup function for $lookup stages */
  lookupCollection?: (name: string) => Promise<Document[]>
  /** Custom function executor for $function stages */
  functionExecutor?: (fn: FunctionStage, doc: Document) => Promise<unknown>
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
}

/**
 * AggregationCursor provides async iteration over aggregation pipeline results
 */
export class AggregationCursor<TSchema extends Document = Document> extends EventEmitter {
  private readonly _pipeline: PipelineStage[]
  private readonly _options: AggregationCursorOptions
  private readonly _fetchFn: () => Promise<TSchema[]>
  private readonly _asyncExecutor: PipelineExecutor<TSchema> | undefined
  private readonly _context: AsyncExecutionContext

  private _buffer: TSchema[] = []
  private _position: number = 0
  private _fetched: boolean = false
  private _closed: boolean = false
  private _error: Error | null = null

  /**
   * Create a new AggregationCursor
   *
   * @param pipeline - The aggregation pipeline stages
   * @param fetchFn - Function to fetch and execute the pipeline
   * @param options - Cursor options
   * @param asyncExecutor - Optional executor for async stages
   * @param context - Execution context
   */
  constructor(
    pipeline: PipelineStage[],
    fetchFn: () => Promise<TSchema[]>,
    options: AggregationCursorOptions = {},
    asyncExecutor?: PipelineExecutor<TSchema>,
    context: AsyncExecutionContext = { collectionName: '' }
  ) {
    super()
    this._pipeline = pipeline
    this._fetchFn = fetchFn
    this._options = options
    this._asyncExecutor = asyncExecutor
    this._context = context
  }

  /**
   * Whether the cursor is closed
   */
  get closed(): boolean {
    return this._closed
  }

  /**
   * Get the pipeline being executed
   */
  get pipeline(): PipelineStage[] {
    return [...this._pipeline]
  }

  /**
   * Number of documents currently buffered
   */
  get bufferedCount(): number {
    return this._closed ? 0 : Math.max(0, this._buffer.length - this._position)
  }

  /**
   * Execute the pipeline and fetch results
   */
  private async ensureFetched(): Promise<void> {
    if (this._fetched || this._closed) return
    if (this._error) throw this._error

    // Check for abort signal
    if (this._context.abortSignal?.aborted) {
      throw new Error('Aggregation was aborted')
    }

    try {
      // Execute the pipeline
      let results = await this._fetchFn()

      // Check for async stages that need additional processing
      if (this._asyncExecutor && this.hasAsyncStages()) {
        results = await this.executeAsyncStages(results)
      }

      this._buffer = results
      this._fetched = true
    } catch (error) {
      this._error = error instanceof Error ? error : new Error(String(error))
      this._closed = true
      throw this._error
    }
  }

  /**
   * Check if pipeline contains async stages
   */
  private hasAsyncStages(): boolean {
    return this._pipeline.some(stage => {
      const stageType = Object.keys(stage)[0]
      return stageType === '$function' ||
             (stageType === '$lookup' && this.isAsyncLookup(stage))
    })
  }

  /**
   * Check if $lookup stage requires async execution
   */
  private isAsyncLookup(stage: PipelineStage): boolean {
    if ('$lookup' in stage) {
      const lookup = (stage as { $lookup: { pipeline?: PipelineStage[] } }).$lookup
      return Array.isArray(lookup.pipeline) && lookup.pipeline.length > 0
    }
    return false
  }

  /**
   * Execute async stages in the pipeline
   */
  private async executeAsyncStages(documents: TSchema[]): Promise<TSchema[]> {
    let results = documents

    for (const stage of this._pipeline) {
      // Check for abort
      if (this._context.abortSignal?.aborted) {
        throw new Error('Aggregation was aborted')
      }

      const stageType = Object.keys(stage)[0]

      if (stageType === '$function') {
        results = await this.executeFunctionStage(results, stage)
      } else if (stageType === '$lookup' && this.isAsyncLookup(stage)) {
        results = await this.executeAsyncLookup(results, stage)
      } else if (this._asyncExecutor) {
        results = await this._asyncExecutor(results, stage, this._context)
      }
    }

    return results
  }

  /**
   * Execute $function stage
   */
  private async executeFunctionStage(
    documents: TSchema[],
    stage: PipelineStage
  ): Promise<TSchema[]> {
    const funcDef = (stage as unknown as { $function: FunctionStage }).$function

    if (!this._context.functionExecutor) {
      throw new Error('$function stage requires a function executor in context')
    }

    const results: TSchema[] = []
    const errors: Error[] = []

    // Process documents in parallel with concurrency limit
    const concurrency = 10
    for (let i = 0; i < documents.length; i += concurrency) {
      const batch = documents.slice(i, i + concurrency)

      const batchResults = await Promise.allSettled(
        batch.map(async (doc) => {
          try {
            const result = await this._context.functionExecutor!(funcDef, doc)
            return { ...doc, ...result as object } as TSchema
          } catch (error) {
            errors.push(error instanceof Error ? error : new Error(String(error)))
            return doc
          }
        })
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        }
      }
    }

    // Propagate first error if any
    if (errors.length > 0) {
      throw new AggregationError(
        `$function stage failed: ${errors[0].message}`,
        errors
      )
    }

    return results
  }

  /**
   * Execute $lookup with pipeline (async)
   */
  private async executeAsyncLookup(
    documents: TSchema[],
    stage: PipelineStage
  ): Promise<TSchema[]> {
    if (!this._context.lookupCollection) {
      throw new Error('$lookup requires lookupCollection in context')
    }

    const lookup = (stage as { $lookup: {
      from: string
      localField?: string
      foreignField?: string
      let?: Record<string, string>
      pipeline?: PipelineStage[]
      as: string
    }}).$lookup

    const lookupDocs = await this._context.lookupCollection(lookup.from)

    return documents.map(doc => {
      let matched: Document[]

      if (lookup.pipeline && lookup.pipeline.length > 0) {
        // Pipeline lookup - apply pipeline with let variables
        const letVars = lookup.let || {}
        const scopedVars: Record<string, unknown> = {}

        for (const [varName, fieldRef] of Object.entries(letVars)) {
          const field = fieldRef.startsWith('$') ? fieldRef.slice(1) : fieldRef
          scopedVars[varName] = this.getNestedValue(doc, field)
        }

        // Filter lookup docs based on pipeline (simplified)
        matched = lookupDocs.filter(lookupDoc => {
          // Check $match stages in pipeline
          return lookup.pipeline!.every(pipelineStage => {
            if ('$match' in pipelineStage) {
              return this.matchesExpression(lookupDoc, pipelineStage.$match, scopedVars)
            }
            return true
          })
        })
      } else if (lookup.localField && lookup.foreignField) {
        // Basic lookup
        const localValue = this.getNestedValue(doc, lookup.localField)
        matched = lookupDocs.filter(lookupDoc => {
          const foreignValue = this.getNestedValue(lookupDoc, lookup.foreignField!)
          return this.valuesEqual(localValue, foreignValue)
        })
      } else {
        matched = []
      }

      return {
        ...doc,
        [lookup.as]: matched
      } as TSchema
    })
  }

  /**
   * Get nested value from document
   */
  private getNestedValue(doc: Document, path: string): unknown {
    const parts = path.split('.')
    let value: unknown = doc

    for (const part of parts) {
      if (value === null || value === undefined) return undefined
      value = (value as Record<string, unknown>)[part]
    }

    return value
  }

  /**
   * Check if two values are equal
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (a === null || b === null) return false
    if (typeof a !== typeof b) return false

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((val, i) => this.valuesEqual(val, b[i]))
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a as object)
      const keysB = Object.keys(b as object)
      if (keysA.length !== keysB.length) return false
      return keysA.every(key =>
        this.valuesEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
      )
    }

    return false
  }

  /**
   * Check if document matches an expression (simplified)
   */
  private matchesExpression(
    doc: Document,
    expr: Record<string, unknown>,
    scopedVars: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(expr)) {
      if (key === '$expr') {
        return this.evaluateExpr(doc, value as Record<string, unknown>, scopedVars)
      }

      const docValue = this.getNestedValue(doc, key)

      if (typeof value === 'object' && value !== null) {
        const ops = value as Record<string, unknown>
        for (const [op, opValue] of Object.entries(ops)) {
          if (!this.evaluateOperator(docValue, op, opValue, scopedVars)) {
            return false
          }
        }
      } else if (!this.valuesEqual(docValue, value)) {
        return false
      }
    }
    return true
  }

  /**
   * Evaluate $expr
   */
  private evaluateExpr(
    doc: Document,
    expr: Record<string, unknown>,
    scopedVars: Record<string, unknown>
  ): boolean {
    const keys = Object.keys(expr)
    if (keys.length === 0) return true
    const operator = keys[0]
    const operands = expr[operator] as unknown[]

    const resolveValue = (val: unknown): unknown => {
      if (typeof val === 'string') {
        if (val.startsWith('$$')) {
          return scopedVars[val.slice(2)]
        }
        if (val.startsWith('$')) {
          return this.getNestedValue(doc, val.slice(1))
        }
      }
      return val
    }

    switch (operator) {
      case '$eq':
        return this.valuesEqual(resolveValue(operands[0]), resolveValue(operands[1]))
      case '$ne':
        return !this.valuesEqual(resolveValue(operands[0]), resolveValue(operands[1]))
      case '$gt':
        return (resolveValue(operands[0]) as number) > (resolveValue(operands[1]) as number)
      case '$gte':
        return (resolveValue(operands[0]) as number) >= (resolveValue(operands[1]) as number)
      case '$lt':
        return (resolveValue(operands[0]) as number) < (resolveValue(operands[1]) as number)
      case '$lte':
        return (resolveValue(operands[0]) as number) <= (resolveValue(operands[1]) as number)
      case '$and':
        return (operands as Record<string, unknown>[]).every(e =>
          this.evaluateExpr(doc, e, scopedVars)
        )
      case '$or':
        return (operands as Record<string, unknown>[]).some(e =>
          this.evaluateExpr(doc, e, scopedVars)
        )
      default:
        return true
    }
  }

  /**
   * Evaluate a comparison operator
   */
  private evaluateOperator(
    docValue: unknown,
    op: string,
    opValue: unknown,
    scopedVars: Record<string, unknown>
  ): boolean {
    const resolvedOpValue = typeof opValue === 'string' && opValue.startsWith('$$')
      ? scopedVars[opValue.slice(2)]
      : opValue

    switch (op) {
      case '$eq':
        return this.valuesEqual(docValue, resolvedOpValue)
      case '$ne':
        return !this.valuesEqual(docValue, resolvedOpValue)
      case '$gt':
        return (docValue as number) > (resolvedOpValue as number)
      case '$gte':
        return (docValue as number) >= (resolvedOpValue as number)
      case '$lt':
        return (docValue as number) < (resolvedOpValue as number)
      case '$lte':
        return (docValue as number) <= (resolvedOpValue as number)
      case '$in':
        return (resolvedOpValue as unknown[]).some(v => this.valuesEqual(docValue, v))
      case '$nin':
        return !(resolvedOpValue as unknown[]).some(v => this.valuesEqual(docValue, v))
      default:
        return true
    }
  }

  /**
   * Get the next document
   */
  async next(): Promise<TSchema | null> {
    if (this._closed) return null
    if (this._error) throw this._error

    await this.ensureFetched()

    if (this._position >= this._buffer.length) {
      return null
    }

    const doc = this._buffer[this._position++]
    return doc !== undefined ? doc : null
  }

  /**
   * Check if there are more documents
   */
  async hasNext(): Promise<boolean> {
    if (this._closed) return false
    if (this._error) return false

    await this.ensureFetched()
    return this._position < this._buffer.length
  }

  /**
   * Get all documents as an array
   */
  async toArray(): Promise<TSchema[]> {
    if (this._closed) return []
    if (this._error) throw this._error

    await this.ensureFetched()

    const remaining = this._buffer.slice(this._position)
    this._position = this._buffer.length

    // Close cursor after consuming
    await this.close()

    return remaining
  }

  /**
   * Execute callback for each document
   */
  async forEach(
    callback: (doc: TSchema, index: number) => void | false | Promise<void | false>
  ): Promise<void> {
    if (this._closed) return
    if (this._error) throw this._error

    await this.ensureFetched()

    let index = 0
    while (this._position < this._buffer.length) {
      const doc = this._buffer[this._position++]
      if (doc !== undefined) {
        const result = await callback(doc, index++)
        if (result === false) break
      }
    }
  }

  /**
   * Transform documents
   */
  map<U>(fn: (doc: TSchema, index: number) => U): MappedAggregationCursor<TSchema, U> {
    return new MappedAggregationCursor(this, fn)
  }

  /**
   * Close the cursor
   */
  async close(): Promise<void> {
    if (this._closed) return

    this._closed = true
    this._buffer = []
    this._position = 0

    this.emit('close')
  }

  /**
   * Async iterator support for for-await-of
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<TSchema> {
    try {
      while (await this.hasNext()) {
        const doc = await this.next()
        if (doc !== null) {
          yield doc
        }
      }
    } finally {
      await this.close()
    }
  }

  /**
   * Clone the cursor
   */
  clone(): AggregationCursor<TSchema> {
    return new AggregationCursor(
      this._pipeline,
      this._fetchFn,
      this._options,
      this._asyncExecutor,
      this._context
    )
  }

  /**
   * Explain the aggregation plan
   */
  explain(): AggregationPlan {
    return {
      pipeline: this._pipeline.map(stage => {
        const keys = Object.keys(stage)
        return {
          stage: keys.length > 0 ? keys[0] : '',
          isAsync: this.isAsyncStage(stage)
        }
      }),
      hasAsyncStages: this.hasAsyncStages(),
      options: this._options
    }
  }

  /**
   * Check if a stage is async
   */
  private isAsyncStage(stage: PipelineStage): boolean {
    const stageType = Object.keys(stage)[0]
    return stageType === '$function' ||
           (stageType === '$lookup' && this.isAsyncLookup(stage))
  }
}

/**
 * Mapped cursor for transformed results
 */
class MappedAggregationCursor<TSchema extends Document, U> {
  private readonly _cursor: AggregationCursor<TSchema>
  private readonly _mapFn: (doc: TSchema, index: number) => U

  constructor(cursor: AggregationCursor<TSchema>, mapFn: (doc: TSchema, index: number) => U) {
    this._cursor = cursor
    this._mapFn = mapFn
  }

  async toArray(): Promise<U[]> {
    const docs = await this._cursor.toArray()
    return docs.map(this._mapFn)
  }

  async forEach(callback: (doc: U, index: number) => void | false | Promise<void | false>): Promise<void> {
    let index = 0
    await this._cursor.forEach(async (doc) => {
      const mapped = this._mapFn(doc, index)
      return callback(mapped, index++)
    })
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<U> {
    let index = 0
    for await (const doc of this._cursor) {
      yield this._mapFn(doc, index++)
    }
  }
}

/**
 * Aggregation plan interface
 */
export interface AggregationPlan {
  pipeline: Array<{ stage: string; isAsync: boolean }>
  hasAsyncStages: boolean
  options: AggregationCursorOptions
}

/**
 * Error class for aggregation failures
 */
export class AggregationError extends Error {
  public readonly errors: Error[]

  constructor(message: string, errors: Error[] = []) {
    super(message)
    this.name = 'AggregationError'
    this.errors = errors
  }
}

export default AggregationCursor
