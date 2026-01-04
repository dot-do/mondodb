import { useState } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, InlineCode } from '@leafygreen-ui/typography'
import Icon from '@leafygreen-ui/icon'

const viewerStyles = css`
  font-family: 'Source Code Pro', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
`

const lineStyles = css`
  display: flex;
  align-items: flex-start;
  padding: 2px 0;

  &:hover {
    background: ${palette.gray.light3};
  }
`

const expandIconStyles = css`
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  margin-right: 4px;
`

const keyStyles = css`
  color: ${palette.purple.base};
  margin-right: 4px;
`

const valueStyles = css`
  color: ${palette.gray.dark3};
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

const indentStyles = css`
  display: inline-block;
`

interface DocumentViewerProps {
  document: Record<string, unknown>
  expanded?: boolean
  indentLevel?: number
}

export function DocumentViewer({
  document,
  expanded = false,
  indentLevel = 0,
}: DocumentViewerProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    expanded ? new Set(Object.keys(document)) : new Set()
  )

  const toggleKey = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const renderValue = (value: unknown, key: string): React.ReactNode => {
    if (value === null) {
      return <span className={nullValueStyles}>null</span>
    }

    if (value === undefined) {
      return <span className={nullValueStyles}>undefined</span>
    }

    if (typeof value === 'string') {
      return <span className={stringValueStyles}>"{value}"</span>
    }

    if (typeof value === 'number') {
      return <span className={numberValueStyles}>{value}</span>
    }

    if (typeof value === 'boolean') {
      return <span className={booleanValueStyles}>{String(value)}</span>
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className={bracketStyles}>[]</span>
      }

      const isExpanded = expandedKeys.has(key)
      return (
        <>
          <span
            className={expandIconStyles}
            onClick={(e) => {
              e.stopPropagation()
              toggleKey(key)
            }}
          >
            <Icon glyph={isExpanded ? 'ChevronDown' : 'ChevronRight'} size={12} />
          </span>
          <span className={bracketStyles}>[</span>
          {isExpanded ? (
            <>
              {value.map((item, i) => (
                <div key={i} className={lineStyles}>
                  <span
                    className={indentStyles}
                    style={{ width: (indentLevel + 1) * 16 }}
                  />
                  <span className={keyStyles}>{i}:</span>
                  {renderValue(item, `${key}.${i}`)}
                  {i < value.length - 1 && <span>,</span>}
                </div>
              ))}
              <div>
                <span
                  className={indentStyles}
                  style={{ width: indentLevel * 16 }}
                />
                <span className={bracketStyles}>]</span>
              </div>
            </>
          ) : (
            <span className={bracketStyles}>
              ...{value.length} items]
            </span>
          )}
        </>
      )
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
      if (entries.length === 0) {
        return <span className={bracketStyles}>{'{}'}</span>
      }

      const isExpanded = expandedKeys.has(key)
      return (
        <>
          <span
            className={expandIconStyles}
            onClick={(e) => {
              e.stopPropagation()
              toggleKey(key)
            }}
          >
            <Icon glyph={isExpanded ? 'ChevronDown' : 'ChevronRight'} size={12} />
          </span>
          <span className={bracketStyles}>{'{'}</span>
          {isExpanded ? (
            <>
              {entries.map(([k, v], i) => (
                <div key={k} className={lineStyles}>
                  <span
                    className={indentStyles}
                    style={{ width: (indentLevel + 1) * 16 }}
                  />
                  <span className={keyStyles}>"{k}":</span>
                  {renderValue(v, `${key}.${k}`)}
                  {i < entries.length - 1 && <span>,</span>}
                </div>
              ))}
              <div>
                <span
                  className={indentStyles}
                  style={{ width: indentLevel * 16 }}
                />
                <span className={bracketStyles}>{'}'}</span>
              </div>
            </>
          ) : (
            <span className={bracketStyles}>
              ...{entries.length} fields{'}'}
            </span>
          )}
        </>
      )
    }

    return <span className={valueStyles}>{String(value)}</span>
  }

  const entries = Object.entries(document)

  return (
    <div className={viewerStyles}>
      <span className={bracketStyles}>{'{'}</span>
      {entries.map(([key, value], i) => (
        <div key={key} className={lineStyles}>
          <span className={indentStyles} style={{ width: 16 }} />
          <span className={keyStyles}>"{key}":</span>
          {renderValue(value, key)}
          {i < entries.length - 1 && <span>,</span>}
        </div>
      ))}
      <span className={bracketStyles}>{'}'}</span>
    </div>
  )
}
