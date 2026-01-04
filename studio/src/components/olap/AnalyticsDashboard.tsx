import { useState, useCallback } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H2, Body, Subtitle } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import Badge from '@leafygreen-ui/badge'
import { QueryBuilder, type AggregationStage } from './QueryBuilder'
import { ResultsViewer } from './ResultsViewer'
import { EngineInfo, type QueryStats } from './EngineInfo'
import rpcClient from '@lib/rpc-client'

const dashboardStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const headerLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const contentStyles = css`
  display: flex;
  flex: 1;
  gap: 16px;
  min-height: 0;
`

const queryPanelStyles = css`
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
`

const resultsPanelStyles = css`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
`

const actionsStyles = css`
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid ${palette.gray.light2};
`

const placeholderStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${palette.gray.dark1};
  text-align: center;
  gap: 12px;
`

export interface AnalyticsDashboardProps {
  database: string
  collection: string
}

export function AnalyticsDashboard({ database, collection }: AnalyticsDashboardProps) {
  const [pipeline, setPipeline] = useState<AggregationStage[]>([])
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queryStats, setQueryStats] = useState<QueryStats | null>(null)

  const handleExecute = useCallback(async () => {
    setIsExecuting(true)
    setError(null)

    const startTime = performance.now()

    try {
      // Convert AggregationStage[] to MongoDB pipeline format
      const mongoPipeline = pipeline.map(stageToPipelineStage)

      // Execute aggregation via RPC
      const queryResults = await rpcClient.aggregate(
        database,
        collection,
        mongoPipeline
      )

      const endTime = performance.now()

      setResults(queryResults)
      setQueryStats({
        executionTime: Math.round(endTime - startTime),
        rowsReturned: queryResults.length,
        // Determine engine based on pipeline complexity
        // Complex aggregations may be routed to R2SQL/ClickHouse
        engine: determineQueryEngine(mongoPipeline),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query execution failed')
    } finally {
      setIsExecuting(false)
    }
  }, [pipeline, database, collection])

  const handleClear = useCallback(() => {
    setPipeline([])
    setResults(null)
    setQueryStats(null)
    setError(null)
  }, [])

  const handleExport = useCallback((format: 'csv' | 'json') => {
    if (!results) return

    const content = format === 'json'
      ? JSON.stringify(results, null, 2)
      : convertToCSV(results)

    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/csv'
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${collection}-export-${new Date().toISOString().split('T')[0]}.${format}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [results, collection])

  return (
    <div className={dashboardStyles} data-testid="analytics-dashboard">
      <div className={headerStyles}>
        <div className={headerLeftStyles}>
          <Icon glyph="Charts" size="large" />
          <H2>Analytics</H2>
          <Badge variant="blue">{collection}</Badge>
        </div>
        {queryStats && <EngineInfo stats={queryStats} />}
      </div>

      <div className={contentStyles}>
        <div className={queryPanelStyles}>
          <Subtitle>Query Builder</Subtitle>
          <QueryBuilder
            pipeline={pipeline}
            onChange={setPipeline}
          />

          <div className={actionsStyles}>
            <Button
              variant="primary"
              leftGlyph={<Icon glyph="Play" />}
              onClick={handleExecute}
              disabled={isExecuting}
              data-testid="run-query"
            >
              {isExecuting ? 'Executing...' : 'Run Query'}
            </Button>
            <Button
              variant="default"
              leftGlyph={<Icon glyph="X" />}
              onClick={handleClear}
              disabled={pipeline.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className={resultsPanelStyles}>
          {error ? (
            <div className={placeholderStyles}>
              <Icon glyph="Warning" size="xlarge" color={palette.red.base} />
              <Body style={{ color: palette.red.dark2 }}>{error}</Body>
            </div>
          ) : results ? (
            <ResultsViewer
              data={results}
              onExport={handleExport}
            />
          ) : (
            <div className={placeholderStyles}>
              <Icon glyph="Charts" size="xlarge" />
              <Body>Build a query and click Run to see results</Body>
              <Body style={{ fontSize: 13 }}>
                Use the query builder to create aggregation pipelines
              </Body>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function convertToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return ''

  const firstRow = data[0]
  if (!firstRow) return ''

  const headers = Object.keys(firstRow)
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h]
      if (val === null || val === undefined) return ''
      if (typeof val === 'object') return JSON.stringify(val)
      return String(val)
    }).join(',')
  )

  return [headers.join(','), ...rows].join('\n')
}

/**
 * Convert an AggregationStage to a MongoDB pipeline stage format.
 */
function stageToPipelineStage(stage: AggregationStage): Record<string, unknown> {
  switch (stage.type) {
    case '$match': {
      const conditions: Record<string, unknown> = {}
      for (const cond of stage.match ?? []) {
        if (cond.operator === '$eq') {
          conditions[cond.field] = cond.value
        } else {
          conditions[cond.field] = { [cond.operator]: cond.value }
        }
      }
      return { $match: conditions }
    }

    case '$group': {
      const groupStage: Record<string, unknown> = {
        _id: stage.groupBy ? `$${stage.groupBy}` : null,
      }
      for (const acc of stage.accumulators ?? []) {
        if (acc.operator === '$count') {
          groupStage[acc.name] = { $sum: 1 }
        } else {
          groupStage[acc.name] = {
            [acc.operator]: acc.field.startsWith('$') ? acc.field : `$${acc.field}`,
          }
        }
      }
      return { $group: groupStage }
    }

    case '$project':
      return { $project: stage.project ?? {} }

    case '$sort':
      return { $sort: stage.sort ?? {} }

    case '$limit':
      return { $limit: stage.limit ?? 10 }

    case '$skip':
      return { $skip: stage.skip ?? 0 }

    case '$unwind':
      return { $unwind: `$${stage.unwindPath ?? ''}` }

    default:
      return {}
  }
}

/**
 * Determine which query engine to use based on pipeline complexity.
 * Simple queries run on SQLite, complex OLAP queries route to R2SQL/ClickHouse.
 */
function determineQueryEngine(
  pipeline: Record<string, unknown>[]
): 'SQLite' | 'R2SQL' | 'ClickHouse' {
  // Check for OLAP-specific operators that benefit from columnar storage
  const olapOperators = ['$group', '$bucket', '$bucketAuto', '$facet', '$graphLookup']
  const hasComplexOlap = pipeline.some(stage => {
    const stageType = Object.keys(stage)[0]
    return olapOperators.includes(stageType ?? '')
  })

  // Check for large data operations
  const hasLookup = pipeline.some(stage => '$lookup' in stage)
  const hasUnwind = pipeline.some(stage => '$unwind' in stage)

  // Route to R2SQL for complex analytics
  if (hasComplexOlap && pipeline.length >= 2) {
    return 'R2SQL'
  }

  // Route to ClickHouse for very complex multi-stage pipelines
  if (pipeline.length >= 4 && (hasLookup || hasUnwind)) {
    return 'ClickHouse'
  }

  // Default to SQLite for simple queries
  return 'SQLite'
}
