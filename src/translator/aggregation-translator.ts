/**
 * AggregationTranslator - Translates MongoDB aggregation pipelines to SQL
 * Uses CTE-based pipeline execution for complex pipelines
 * Supports multiple SQL dialects (SQLite, ClickHouse)
 */

import type { StageResult, StageContext, PipelineStage, AggregationResult, GroupStage, LookupStage, UnwindStage, BucketStage } from './stages/types'
import { translateMatchStage } from './stages/match-stage'
import { translateProjectStage } from './stages/project-stage'
import { translateGroupStage } from './stages/group-stage'
import { translateSortStage } from './stages/sort-stage'
import { translateLimitStage } from './stages/limit-stage'
import { translateSkipStage } from './stages/skip-stage'
import { translateCountStage } from './stages/count-stage'
import { translateLookupStage } from './stages/lookup-stage'
import { translateUnwindStage } from './stages/unwind-stage'
import { translateAddFieldsStage } from './stages/add-fields-stage'
import { translateBucketStage } from './stages/bucket-stage'
import { translateFacetStage, FacetTranslator } from './stages/facet-stage'
import { translateSearchStage, type SearchStageInput, type SearchStageContext } from './stages/search-stage'
import { optimizePipeline } from './stages/optimizer'
import { type SQLDialect, type DialectOptions, validateDialect } from './dialect'

export interface TranslatorOptions extends DialectOptions {
  /** Enable pipeline optimization (default: true) */
  optimize?: boolean
}

export class AggregationTranslator implements FacetTranslator {
  private readonly options: TranslatorOptions
  private readonly dialect: SQLDialect

  constructor(private collection: string, options: TranslatorOptions = {}) {
    // Validate dialect before merging options
    const dialect = validateDialect(options.dialect)
    this.dialect = dialect
    this.options = {
      optimize: true,
      dialect,
      ...options
    }
  }

  /**
   * Translate a MongoDB aggregation pipeline to SQL
   */
  translate(pipeline: PipelineStage[]): AggregationResult {
    if (pipeline.length === 0) {
      throw new Error('Pipeline cannot be empty')
    }

    // Optionally optimize the pipeline
    const optimizedPipeline = this.options.optimize
      ? optimizePipeline(pipeline)
      : pipeline

    // Analyze pipeline to determine execution strategy
    const needsCte = this.needsCtePipeline(optimizedPipeline)

    if (needsCte) {
      return this.translateWithCte(optimizedPipeline)
    }

    return this.translateSimple(optimizedPipeline)
  }

  /**
   * Translate pipeline for use in facet (implements FacetTranslator)
   */
  translatePipeline(stages: PipelineStage[], collection: string): { sql: string; params: unknown[] } {
    const translator = new AggregationTranslator(collection)
    const result = translator.translate(stages)
    return { sql: result.sql, params: result.params }
  }

  /**
   * Determine if we need CTE-based execution
   */
  private needsCtePipeline(pipeline: PipelineStage[]): boolean {
    // Need CTEs for:
    // 1. Multiple stages that transform data shape
    // 2. $lookup, $unwind, $search stages
    // 3. $project followed by other stages
    let shapeTransformCount = 0

    for (const stage of pipeline) {
      const stageType = this.getStageType(stage)

      if (['$lookup', '$unwind', '$facet', '$search'].includes(stageType)) {
        return true
      }

      if (['$project', '$group', '$addFields'].includes(stageType)) {
        shapeTransformCount++
      }
    }

    return shapeTransformCount > 1
  }

  /**
   * Simple translation without CTEs
   */
  private translateSimple(pipeline: PipelineStage[]): AggregationResult {
    const params: unknown[] = []

    let selectClause = 'data'
    let whereClause: string | undefined
    let groupByClause: string | undefined
    let orderByClause: string | undefined
    let limitClause: string | undefined
    let offsetClause: string | undefined

    const context: StageContext = {
      collection: this.collection,
      cteIndex: 0,
      existingParams: params,
      dialect: this.dialect,
      dialectOptions: this.options
    }

    for (const stage of pipeline) {
      const result = this.translateStage(stage, context)
      params.push(...result.params)

      if (result.selectClause) selectClause = result.selectClause
      if (result.whereClause) whereClause = result.whereClause
      if (result.groupByClause) groupByClause = result.groupByClause
      if (result.orderByClause) orderByClause = result.orderByClause
      if (result.limitClause) limitClause = result.limitClause
      if (result.offsetClause) offsetClause = result.offsetClause

      if (result.facets) {
        return {
          sql: '',
          params,
          facets: result.facets
        }
      }
    }

    // Build final SQL
    let sql = `SELECT ${selectClause} FROM ${this.collection}`

    if (whereClause) sql += ` WHERE ${whereClause}`
    if (groupByClause) sql += ` GROUP BY ${groupByClause}`
    if (orderByClause) sql += ` ORDER BY ${orderByClause}`
    if (limitClause) sql += ` ${limitClause}`
    if (offsetClause) sql += ` ${offsetClause}`

    return { sql, params }
  }

  /**
   * CTE-based translation for complex pipelines
   */
  private translateWithCte(pipeline: PipelineStage[]): AggregationResult {
    const params: unknown[] = []
    const ctes: string[] = []
    let cteIndex = 0
    let currentSource = this.collection

    // Accumulate simple clauses for current CTE
    let pendingClauses = {
      select: 'data',
      where: undefined as string | undefined,
      groupBy: undefined as string | undefined,
      orderBy: undefined as string | undefined,
      limit: undefined as string | undefined,
      offset: undefined as string | undefined
    }

    const flushPendingCte = () => {
      if (pendingClauses.select !== 'data' || pendingClauses.where || pendingClauses.groupBy) {
        const cteName = `stage_${cteIndex}`
        let cteSql = `SELECT ${pendingClauses.select} FROM ${currentSource}`

        if (pendingClauses.where) cteSql += ` WHERE ${pendingClauses.where}`
        if (pendingClauses.groupBy) cteSql += ` GROUP BY ${pendingClauses.groupBy}`
        if (pendingClauses.orderBy) cteSql += ` ORDER BY ${pendingClauses.orderBy}`
        if (pendingClauses.limit) cteSql += ` ${pendingClauses.limit}`
        if (pendingClauses.offset) cteSql += ` ${pendingClauses.offset}`

        ctes.push(`${cteName} AS (${cteSql})`)
        currentSource = cteName
        cteIndex++

        // Reset pending clauses
        pendingClauses = {
          select: 'data',
          where: undefined,
          groupBy: undefined,
          orderBy: undefined,
          limit: undefined,
          offset: undefined
        }
      }
    }

    const context: StageContext = {
      collection: this.collection,
      cteIndex,
      existingParams: params,
      dialect: this.dialect,
      dialectOptions: this.options,
      get previousCte() {
        return currentSource
      }
    }

    for (const stage of pipeline) {
      const stageType = this.getStageType(stage)

      // Stages that require their own CTE
      if (['$lookup', '$unwind'].includes(stageType)) {
        flushPendingCte()

        context.cteIndex = cteIndex
        const result = this.translateStage(stage, context)
        params.push(...result.params)

        if (result.cteExpression) {
          const cteName = result.cteName || `stage_${cteIndex}`
          ctes.push(`${cteName} AS (${result.cteExpression})`)
          currentSource = cteName
          cteIndex++
        }
      } else if (stageType === '$search') {
        // $search stage requires FTS join - must be first stage
        flushPendingCte()

        context.cteIndex = cteIndex
        const result = this.translateStage(stage, context) as StageResult & { ftsJoin?: string; ftsTable?: string; ftsMatch?: string }
        params.push(...result.params)

        // Build CTE with FTS join
        const ftsTable = result.ftsTable || `${this.collection}_fts`
        const selectClause = result.selectClause || 'documents.*'
        const cteSql = `SELECT ${selectClause} FROM documents JOIN ${ftsTable} ON documents.id = ${ftsTable}.rowid WHERE ${result.whereClause}`

        const cteName = `stage_${cteIndex}`
        ctes.push(`${cteName} AS (${cteSql})`)
        currentSource = cteName
        cteIndex++
      } else if (stageType === '$facet') {
        flushPendingCte()

        context.cteIndex = cteIndex
        const result = this.translateStage(stage, context)
        params.push(...result.params)

        if (result.facets) {
          // Build CTE for facets
          const sql = ctes.length > 0 ? `WITH ${ctes.join(', ')}\n` : ''
          return {
            sql,
            params,
            facets: result.facets
          }
        }
      } else {
        // Simple stages that can accumulate
        context.cteIndex = cteIndex
        const result = this.translateStage(stage, context)
        params.push(...result.params)

        // If this stage transforms shape and we already have transforms, flush first
        if (result.transformsShape && (pendingClauses.select !== 'data' || pendingClauses.groupBy)) {
          flushPendingCte()
          context.cteIndex = cteIndex
        }

        if (result.selectClause) pendingClauses.select = result.selectClause
        if (result.whereClause) pendingClauses.where = result.whereClause
        if (result.groupByClause) pendingClauses.groupBy = result.groupByClause
        if (result.orderByClause) pendingClauses.orderBy = result.orderByClause
        if (result.limitClause) pendingClauses.limit = result.limitClause
        if (result.offsetClause) pendingClauses.offset = result.offsetClause
      }
    }

    // Build final query from pending clauses
    let finalSql = `SELECT ${pendingClauses.select} FROM ${currentSource}`

    if (pendingClauses.where) finalSql += ` WHERE ${pendingClauses.where}`
    if (pendingClauses.groupBy) finalSql += ` GROUP BY ${pendingClauses.groupBy}`
    if (pendingClauses.orderBy) finalSql += ` ORDER BY ${pendingClauses.orderBy}`
    if (pendingClauses.limit) finalSql += ` ${pendingClauses.limit}`
    if (pendingClauses.offset) finalSql += ` ${pendingClauses.offset}`

    // Combine CTEs with final query
    const sql = ctes.length > 0
      ? `WITH ${ctes.join(', ')} ${finalSql}`
      : finalSql

    return { sql, params }
  }

  /**
   * Get the stage type from a stage object
   */
  private getStageType(stage: PipelineStage): string {
    return Object.keys(stage)[0]!
  }

  /**
   * Translate a single pipeline stage
   */
  private translateStage(stage: PipelineStage, context: StageContext): StageResult {
    const stageType = this.getStageType(stage)
    const stageValue = (stage as Record<string, unknown>)[stageType]

    switch (stageType) {
      case '$match':
        return translateMatchStage(stageValue as Record<string, unknown>, context)

      case '$project':
        return translateProjectStage(stageValue as Record<string, unknown>, context)

      case '$group':
        return translateGroupStage(stageValue as GroupStage, context)

      case '$sort':
        return translateSortStage(stageValue as Record<string, 1 | -1>, context)

      case '$limit':
        return translateLimitStage(stageValue as number, context)

      case '$skip':
        return translateSkipStage(stageValue as number, context)

      case '$count':
        return translateCountStage(stageValue as string, context)

      case '$lookup':
        return translateLookupStage(stageValue as LookupStage, context)

      case '$unwind':
        return translateUnwindStage(stageValue as string | UnwindStage, context)

      case '$addFields':
      case '$set': // $set is an alias for $addFields
        return translateAddFieldsStage(stageValue as Record<string, unknown>, context)

      case '$bucket':
        return translateBucketStage(stageValue as BucketStage, context)

      case '$facet':
        return translateFacetStage(
          stageValue as Record<string, PipelineStage[]>,
          context,
          this
        )

      case '$search':
        return translateSearchStage(
          stageValue as SearchStageInput,
          context as SearchStageContext
        )

      default:
        throw new Error(`Unknown aggregation stage: ${stageType}`)
    }
  }
}

// Export types
export type { AggregationResult, PipelineStage }
