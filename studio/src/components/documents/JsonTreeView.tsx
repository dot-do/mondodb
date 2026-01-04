import { useState, useCallback, memo } from 'react'
import { css, cx } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import Icon from '@leafygreen-ui/icon'
import type { Document } from '@lib/rpc-client'

const containerStyles = css`
  font-family: 'Source Code Pro', 'Menlo', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
`

const documentContainerStyles = css`
  margin-bottom: 16px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  overflow: hidden;

  &:last-child {
    margin-bottom: 0;
  }
`

const documentHeaderStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${palette.gray.light3};
  border-bottom: 1px solid ${palette.gray.light2};
  cursor: pointer;

  &:hover {
    background: ${palette.gray.light2};
  }
`

const documentSelectedStyles = css`
  background: ${palette.blue.light3};

  &:hover {
    background: ${palette.blue.light2};
  }
`

const documentBodyStyles = css`
  padding: 12px;
  background: ${palette.white};
`

const lineStyles = css`
  display: flex;
  align-items: flex-start;
  padding: 2px 0;

  &:hover {
    background: ${palette.gray.light3};
  }
`

const indentStyles = css`
  display: inline-block;
  flex-shrink: 0;
`

const expandIconStyles = css`
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  color: ${palette.gray.dark1};

  &:hover {
    color: ${palette.gray.dark3};
  }
`

const keyStyles = css`
  color: ${palette.purple.base};
  margin-right: 4px;
`

const colonStyles = css`
  color: ${palette.gray.dark1};
  margin-right: 4px;
`

const stringValueStyles = css`
  color: ${palette.green.dark2};
`

const numberValueStyles = css`
  color: ${palette.blue.base};
`

const booleanValueStyles = css`
  color: ${palette.yellow.dark2};
`

const nullValueStyles = css`
  color: ${palette.gray.base};
  font-style: italic;
`

const bracketStyles = css`
  color: ${palette.gray.dark1};
`

const collapsedInfoStyles = css`
  color: ${palette.gray.base};
  font-style: italic;
`

export interface JsonTreeViewProps {
  documents: Document[]
  selectedIds?: Set<string>
  selectable?: boolean
  onSelect?: (id: string) => void
  defaultExpanded?: boolean
}

export const JsonTreeView = memo(function JsonTreeView({
  documents,
  selectedIds,
  selectable = false,
  onSelect,
  defaultExpanded = true,
}: JsonTreeViewProps) {
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(
    defaultExpanded ? new Set(documents.map((d) => d._id)) : new Set()
  )

  const toggleDoc = useCallback((id: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  return (
    <div className={containerStyles} data-testid="json-tree-view">
      {documents.map((doc) => (
        <div key={doc._id} className={documentContainerStyles}>
          <div
            className={cx(
              documentHeaderStyles,
              selectedIds?.has(doc._id) && documentSelectedStyles
            )}
            onClick={() => {
              if (selectable && onSelect) {
                onSelect(doc._id)
              } else {
                toggleDoc(doc._id)
              }
            }}
            data-testid={`json-doc-header-${doc._id}`}
          >
            {selectable && (
              <input
                type="checkbox"
                checked={selectedIds?.has(doc._id) ?? false}
                onChange={() => onSelect?.(doc._id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select document ${doc._id}`}
              />
            )}
            <Icon
              glyph={expandedDocs.has(doc._id) ? 'ChevronDown' : 'ChevronRight'}
              size="small"
            />
            <span className={keyStyles}>_id:</span>
            <span className={stringValueStyles}>"{doc._id}"</span>
          </div>
          {expandedDocs.has(doc._id) && (
            <div className={documentBodyStyles}>
              <JsonValue value={doc} isRoot />
            </div>
          )}
        </div>
      ))}
    </div>
  )
})

interface JsonValueProps {
  value: unknown
  keyName?: string
  indent?: number
  isRoot?: boolean
  isLast?: boolean
}

function JsonValue({
  value,
  keyName,
  indent = 0,
  isRoot = false,
  isLast = true,
}: JsonValueProps) {
  const [expanded, setExpanded] = useState(true)

  if (value === null) {
    return (
      <Line keyName={keyName} indent={indent} isLast={isLast}>
        <span className={nullValueStyles}>null</span>
      </Line>
    )
  }

  if (value === undefined) {
    return (
      <Line keyName={keyName} indent={indent} isLast={isLast}>
        <span className={nullValueStyles}>undefined</span>
      </Line>
    )
  }

  if (typeof value === 'string') {
    return (
      <Line keyName={keyName} indent={indent} isLast={isLast}>
        <span className={stringValueStyles}>"{value}"</span>
      </Line>
    )
  }

  if (typeof value === 'number') {
    return (
      <Line keyName={keyName} indent={indent} isLast={isLast}>
        <span className={numberValueStyles}>{value}</span>
      </Line>
    )
  }

  if (typeof value === 'boolean') {
    return (
      <Line keyName={keyName} indent={indent} isLast={isLast}>
        <span className={booleanValueStyles}>{String(value)}</span>
      </Line>
    )
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <Line keyName={keyName} indent={indent} isLast={isLast}>
          <span className={bracketStyles}>[]</span>
        </Line>
      )
    }

    return (
      <>
        <Line keyName={keyName} indent={indent} expandable onToggle={() => setExpanded(!expanded)}>
          <span
            className={expandIconStyles}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            <Icon glyph={expanded ? 'ChevronDown' : 'ChevronRight'} size={12} />
          </span>
          <span className={bracketStyles}>[</span>
          {!expanded && (
            <span className={collapsedInfoStyles}>{value.length} items</span>
          )}
        </Line>
        {expanded && (
          <>
            {value.map((item, i) => (
              <JsonValue
                key={i}
                value={item}
                keyName={String(i)}
                indent={indent + 1}
                isLast={i === value.length - 1}
              />
            ))}
            <Line indent={indent} isLast={isLast}>
              <span className={bracketStyles}>]</span>
            </Line>
          </>
        )}
      </>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)

    if (entries.length === 0) {
      return (
        <Line keyName={keyName} indent={indent} isLast={isLast}>
          <span className={bracketStyles}>{'{}'}</span>
        </Line>
      )
    }

    // Skip root wrapper
    if (isRoot) {
      return (
        <>
          {entries.map(([key, val], i) => (
            <JsonValue
              key={key}
              value={val}
              keyName={key}
              indent={indent}
              isLast={i === entries.length - 1}
            />
          ))}
        </>
      )
    }

    return (
      <>
        <Line keyName={keyName} indent={indent} expandable onToggle={() => setExpanded(!expanded)}>
          <span
            className={expandIconStyles}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            <Icon glyph={expanded ? 'ChevronDown' : 'ChevronRight'} size={12} />
          </span>
          <span className={bracketStyles}>{'{'}</span>
          {!expanded && (
            <span className={collapsedInfoStyles}>{entries.length} fields</span>
          )}
        </Line>
        {expanded && (
          <>
            {entries.map(([key, val], i) => (
              <JsonValue
                key={key}
                value={val}
                keyName={key}
                indent={indent + 1}
                isLast={i === entries.length - 1}
              />
            ))}
            <Line indent={indent} isLast={isLast}>
              <span className={bracketStyles}>{'}'}</span>
            </Line>
          </>
        )}
      </>
    )
  }

  return (
    <Line keyName={keyName} indent={indent} isLast={isLast}>
      <span>{String(value)}</span>
    </Line>
  )
}

interface LineProps {
  children: React.ReactNode
  keyName?: string
  indent?: number
  isLast?: boolean
  expandable?: boolean
  onToggle?: () => void
}

function Line({
  children,
  keyName,
  indent = 0,
  isLast = true,
  expandable = false,
  onToggle,
}: LineProps) {
  return (
    <div className={lineStyles} onClick={expandable ? onToggle : undefined}>
      <span className={indentStyles} style={{ width: indent * 16 }} />
      {keyName !== undefined && (
        <>
          <span className={keyStyles}>"{keyName}"</span>
          <span className={colonStyles}>:</span>
        </>
      )}
      {children}
      {!isLast && <span>,</span>}
    </div>
  )
}

export default JsonTreeView
