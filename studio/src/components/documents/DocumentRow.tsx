import { memo, useCallback } from 'react'
import { css, cx } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, InlineCode } from '@leafygreen-ui/typography'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import { DocumentViewer } from './DocumentViewer'
import type { Document } from '@lib/rpc-client'
import type { ColumnConfig } from './DocumentList'

export interface DocumentRowProps {
  document: Document
  columns: ColumnConfig[]
  selected?: boolean
  expanded?: boolean
  selectable?: boolean
  expandable?: boolean
  onSelect?: () => void
  onToggleExpand?: () => void
  onClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

// Styles
const rowStyles = css`
  border-bottom: 1px solid ${palette.gray.light2};
  transition: background-color 0.15s ease;

  &:hover {
    background: ${palette.gray.light3};
  }

  &:last-child {
    border-bottom: none;
  }
`

const rowSelectedStyles = css`
  background: ${palette.blue.light3};

  &:hover {
    background: ${palette.blue.light2};
  }
`

const rowClickableStyles = css`
  cursor: pointer;
`

const cellStyles = css`
  padding: 12px 16px;
  vertical-align: top;
  font-size: 13px;
  color: ${palette.gray.dark3};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 0;
`

const checkboxCellStyles = css`
  width: 48px;
  text-align: center;
  vertical-align: middle;
`

const expandCellStyles = css`
  width: 40px;
  text-align: center;
  vertical-align: middle;
  padding: 8px;
`

const expandButtonStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  color: ${palette.gray.dark1};
  transition: all 0.15s ease;

  &:hover {
    background: ${palette.gray.light2};
    color: ${palette.gray.dark2};
  }
`

const expandedRowStyles = css`
  background: ${palette.gray.light3};
`

const expandedContentStyles = css`
  padding: 16px;
  background: ${palette.white};
  border-top: 1px solid ${palette.gray.light2};
`

const expandedContentHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`

const expandedContentActionsStyles = css`
  display: flex;
  gap: 4px;
`

const valueContainerStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  overflow: hidden;
`

const objectIdStyles = css`
  font-family: 'Source Code Pro', 'Menlo', monospace;
  font-size: 12px;
  color: ${palette.purple.dark2};
  background: ${palette.purple.light3};
  padding: 2px 6px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
`

const stringValueStyles = css`
  color: ${palette.green.dark2};
`

const numberValueStyles = css`
  color: ${palette.blue.base};
  font-family: 'Source Code Pro', 'Menlo', monospace;
`

const booleanValueStyles = css`
  color: ${palette.yellow.dark2};
  font-family: 'Source Code Pro', 'Menlo', monospace;
`

const nullValueStyles = css`
  color: ${palette.gray.base};
  font-style: italic;
`

const objectValueStyles = css`
  color: ${palette.gray.dark1};
  font-family: 'Source Code Pro', 'Menlo', monospace;
  font-size: 12px;
`

const arrayValueStyles = css`
  color: ${palette.gray.dark1};
  font-family: 'Source Code Pro', 'Menlo', monospace;
  font-size: 12px;
`

const dateValueStyles = css`
  color: ${palette.blue.dark1};
  font-size: 12px;
`

const nestedIndicatorStyles = css`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: ${palette.gray.light3};
  border-radius: 4px;
  font-size: 11px;
  color: ${palette.gray.dark1};
`

// Helper to format a cell value for display
function formatCellValue(value: unknown): { display: string; type: string } {
  if (value === null) {
    return { display: 'null', type: 'null' }
  }

  if (value === undefined) {
    return { display: 'undefined', type: 'null' }
  }

  if (typeof value === 'string') {
    return { display: value, type: 'string' }
  }

  if (typeof value === 'number') {
    return { display: String(value), type: 'number' }
  }

  if (typeof value === 'boolean') {
    return { display: String(value), type: 'boolean' }
  }

  if (value instanceof Date) {
    return { display: value.toISOString(), type: 'date' }
  }

  if (Array.isArray(value)) {
    return { display: `Array(${value.length})`, type: 'array' }
  }

  if (typeof value === 'object') {
    // Check for ObjectId-like structure
    if ('$oid' in value) {
      return { display: (value as { $oid: string }).$oid, type: 'objectId' }
    }
    // Check for Date-like structure
    if ('$date' in value) {
      const dateValue = (value as { $date: string | number }).$date
      const date = new Date(dateValue)
      return { display: date.toISOString(), type: 'date' }
    }
    const keys = Object.keys(value)
    return { display: `Object(${keys.length})`, type: 'object' }
  }

  return { display: String(value), type: 'unknown' }
}

// Component for rendering cell values with appropriate styling
function CellValue({ value }: { value: unknown }) {
  const { display, type } = formatCellValue(value)

  switch (type) {
    case 'null':
      return <span className={nullValueStyles}>{display}</span>
    case 'string':
      return <span className={stringValueStyles} title={display}>{display}</span>
    case 'number':
      return <span className={numberValueStyles}>{display}</span>
    case 'boolean':
      return <span className={booleanValueStyles}>{display}</span>
    case 'date':
      return <span className={dateValueStyles}>{display}</span>
    case 'objectId':
      return <span className={objectIdStyles} title={display}>{display}</span>
    case 'array':
      return (
        <span className={nestedIndicatorStyles}>
          <Icon glyph="Array" size="small" />
          {display}
        </span>
      )
    case 'object':
      return (
        <span className={nestedIndicatorStyles}>
          <Icon glyph="CurlyBraces" size="small" />
          {display}
        </span>
      )
    default:
      return <span>{display}</span>
  }
}

export const DocumentRow = memo(function DocumentRow({
  document,
  columns,
  selected = false,
  expanded = false,
  selectable = false,
  expandable = true,
  onSelect,
  onToggleExpand,
  onClick,
  onEdit,
  onDelete,
}: DocumentRowProps) {
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't trigger row click if clicking on buttons or inputs
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'BUTTON' ||
        target.closest('button')
      ) {
        return
      }
      onClick?.()
    },
    [onClick]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick?.()
      }
    },
    [onClick]
  )

  // Check if document has nested content
  const hasNestedContent = Object.values(document).some(
    (value) =>
      (typeof value === 'object' && value !== null) ||
      (Array.isArray(value) && value.length > 0)
  )

  return (
    <>
      <tr
        className={cx(
          rowStyles,
          selected && rowSelectedStyles,
          onClick && rowClickableStyles
        )}
        onClick={onClick ? handleRowClick : undefined}
        onKeyDown={onClick ? handleKeyDown : undefined}
        tabIndex={onClick ? 0 : undefined}
        role={onClick ? 'button' : undefined}
        aria-selected={selected}
        data-testid={`document-row-${document._id}`}
      >
        {selectable && (
          <td className={cx(cellStyles, checkboxCellStyles)}>
            <input
              type="checkbox"
              checked={selected}
              onChange={onSelect}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select document ${document._id}`}
              data-testid={`select-checkbox-${document._id}`}
            />
          </td>
        )}
        {expandable && (
          <td className={cx(cellStyles, expandCellStyles)}>
            {hasNestedContent && (
              <button
                className={expandButtonStyles}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand?.()
                }}
                aria-label={expanded ? 'Collapse row' : 'Expand row'}
                aria-expanded={expanded}
                data-testid={`expand-button-${document._id}`}
              >
                <Icon
                  glyph={expanded ? 'ChevronDown' : 'ChevronRight'}
                  size="small"
                />
              </button>
            )}
          </td>
        )}
        {columns.map((column) => (
          <td
            key={column.field}
            className={cellStyles}
            data-testid={`cell-${document._id}-${column.field}`}
          >
            <div className={valueContainerStyles}>
              <CellValue value={document[column.field]} />
            </div>
          </td>
        ))}
      </tr>
      {expanded && (
        <tr className={expandedRowStyles} data-testid={`expanded-row-${document._id}`}>
          <td colSpan={columns.length + (selectable ? 1 : 0) + (expandable ? 1 : 0)}>
            <div className={expandedContentStyles}>
              <div className={expandedContentHeaderStyles}>
                <InlineCode>_id: {document._id}</InlineCode>
                <div className={expandedContentActionsStyles}>
                  {onEdit && (
                    <IconButton
                      aria-label="Edit document"
                      onClick={onEdit}
                      data-testid={`edit-button-${document._id}`}
                    >
                      <Icon glyph="Edit" />
                    </IconButton>
                  )}
                  <IconButton
                    aria-label="Copy document"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(document, null, 2))
                    }}
                    data-testid={`copy-button-${document._id}`}
                  >
                    <Icon glyph="Copy" />
                  </IconButton>
                  {onDelete && (
                    <IconButton
                      aria-label="Delete document"
                      onClick={onDelete}
                      data-testid={`delete-button-${document._id}`}
                    >
                      <Icon glyph="Trash" />
                    </IconButton>
                  )}
                </div>
              </div>
              <DocumentViewer document={document} expanded />
            </div>
          </td>
        </tr>
      )}
    </>
  )
})

export default DocumentRow
