import { useState, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import { SegmentedControl, SegmentedControlOption } from '@leafygreen-ui/segmented-control'
import { Menu, MenuItem } from '@leafygreen-ui/menu'

const viewerStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
`

const toolbarStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const toolbarLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const toolbarRightStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const contentStyles = css`
  flex: 1;
  overflow: auto;
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
`

const tableStyles = css`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;

  th, td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid ${palette.gray.light2};
  }

  th {
    background: ${palette.gray.light3};
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
    cursor: pointer;
    user-select: none;

    &:hover {
      background: ${palette.gray.light2};
    }
  }
`

const ROW_HEIGHT = 37 // Height of each row in pixels

const virtualTableBodyStyles = css`
  position: relative;
`

const virtualRowStyles = css`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  display: table;
  table-layout: fixed;

  &:hover td {
    background: ${palette.blue.light3};
  }

  td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid ${palette.gray.light2};
  }
`

const chartPlaceholderStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${palette.gray.dark1};
  gap: 12px;
`

const statsStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: ${palette.gray.dark1};
`

export interface ResultsViewerProps {
  data: Record<string, unknown>[]
  onExport: (format: 'csv' | 'json') => void
}

type ViewMode = 'table' | 'chart'
type SortDirection = 'asc' | 'desc' | null

export function ResultsViewer({ data, onExport }: ResultsViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const parentRef = useRef<HTMLDivElement>(null)

  const columns = useMemo(() => {
    if (data.length === 0) return []
    const firstRow = data[0]
    if (!firstRow) return []
    return Object.keys(firstRow)
  }, [data])

  const sortedData = useMemo(() => {
    if (!sortField || !sortDirection) return data

    return [...data].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]

      if (aVal === bVal) return 0
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      const comparison = aVal < bVal ? -1 : 1
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [data, sortField, sortDirection])

  const rowVirtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10, // Render 10 extra rows above/below visible area
  })

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else if (sortDirection === 'desc') {
        setSortField(null)
        setSortDirection(null)
      }
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  return (
    <div className={viewerStyles}>
      <div className={toolbarStyles}>
        <div className={toolbarLeftStyles}>
          <SegmentedControl
            value={viewMode}
            onChange={(val) => setViewMode(val as ViewMode)}
            aria-label="View mode"
          >
            <SegmentedControlOption value="table" data-testid="view-toggle-table">
              <Icon glyph="Menu" /> Table
            </SegmentedControlOption>
            <SegmentedControlOption value="chart" data-testid="view-toggle-chart">
              <Icon glyph="Charts" /> Chart
            </SegmentedControlOption>
          </SegmentedControl>

          <div className={statsStyles}>
            <Body data-testid="rows-returned">{data.length} rows</Body>
          </div>
        </div>

        <div className={toolbarRightStyles}>
          <Menu
            trigger={
              <Button
                variant="default"
                size="small"
                leftGlyph={<Icon glyph="Export" />}
              >
                Export
              </Button>
            }
          >
            <MenuItem onClick={() => onExport('csv')} data-testid="export-csv">
              Export as CSV
            </MenuItem>
            <MenuItem onClick={() => onExport('json')} data-testid="export-json">
              Export as JSON
            </MenuItem>
          </Menu>
        </div>
      </div>

      <div className={contentStyles} ref={parentRef}>
        {viewMode === 'table' ? (
          <table className={tableStyles} data-testid="results-table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                  >
                    {col}
                    {sortField === col && (
                      <Icon
                        glyph={sortDirection === 'asc' ? 'SortAscending' : 'SortDescending'}
                        size="small"
                        data-testid={`sort-indicator-${sortDirection}`}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              className={virtualTableBodyStyles}
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = sortedData[virtualRow.index]
                if (!row) return null
                return (
                  <tr
                    key={virtualRow.index}
                    className={virtualRowStyles}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    data-index={virtualRow.index}
                  >
                    {columns.map(col => (
                      <td key={col}>
                        {formatValue(row[col])}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className={chartPlaceholderStyles} data-testid="chart-container">
            <Icon glyph="Charts" size="xlarge" />
            <Body>Chart visualization coming soon</Body>
            <Body style={{ fontSize: 12 }}>
              Integration with charting library planned for next iteration
            </Body>
          </div>
        )}
      </div>
    </div>
  )
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'number') {
    // Format numbers nicely
    if (Number.isInteger(value)) return value.toLocaleString()
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return String(value)
}
