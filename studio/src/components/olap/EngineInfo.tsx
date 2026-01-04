import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body } from '@leafygreen-ui/typography'
import Badge from '@leafygreen-ui/badge'
import Icon from '@leafygreen-ui/icon'
import Tooltip from '@leafygreen-ui/tooltip'

const engineInfoStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const statStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: ${palette.gray.dark1};
`

export interface QueryStats {
  executionTime: number
  rowsReturned: number
  engine: 'SQLite' | 'R2SQL' | 'ClickHouse'
  queryPlan?: string
}

export interface EngineInfoProps {
  stats: QueryStats
}

export function EngineInfo({ stats }: EngineInfoProps) {
  const engineVariant = stats.engine === 'SQLite' ? 'green' : 'blue'
  const engineDescription = getEngineDescription(stats.engine)

  return (
    <div className={engineInfoStyles} data-testid="query-stats">
      <Tooltip
        align="bottom"
        justify="middle"
        trigger={
          <Badge
            variant={engineVariant}
            data-testid="engine-badge"
          >
            {stats.engine}
          </Badge>
        }
      >
        <div data-testid="query-plan-tooltip">
          <Body>{engineDescription}</Body>
          {stats.queryPlan && (
            <pre style={{ fontSize: 11, marginTop: 8 }}>
              {stats.queryPlan}
            </pre>
          )}
        </div>
      </Tooltip>

      <div className={statStyles} data-testid="execution-time">
        <Icon glyph="Clock" size="small" />
        <Body>{stats.executionTime}ms</Body>
      </div>

      <div className={statStyles}>
        <Icon glyph="Document" size="small" />
        <Body data-testid="rows-returned">{stats.rowsReturned} rows</Body>
      </div>
    </div>
  )
}

function getEngineDescription(engine: QueryStats['engine']): string {
  switch (engine) {
    case 'SQLite':
      return 'Query executed locally on SQLite for fast single-document operations'
    case 'R2SQL':
      return 'Query routed to R2 SQL for OLAP analytics across the datalake'
    case 'ClickHouse':
      return 'Query executed on ClickHouse for complex analytical workloads'
    default:
      return 'Unknown query engine'
  }
}
