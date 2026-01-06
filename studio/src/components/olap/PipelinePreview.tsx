/**
 * PipelinePreview Component
 *
 * Displays aggregation pipeline execution results with pagination, loading states,
 * error handling, and JSON formatting.
 */

import { useState, useCallback, useEffect, useRef, KeyboardEvent, memo, useReducer } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'

export interface PipelinePreviewProps {
  results: Record<string, unknown>[]
  loading?: boolean
  error?: string | null
  errorDetails?: string
  errorStage?: number
  onRefresh?: () => void
  pageSize?: number
  page?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  showPageSizeSelector?: boolean
  loadingMessage?: string
  emptyMessage?: string
  executionTimeMs?: number
  collapsible?: boolean
  showViewToggle?: boolean
  defaultViewMode?: 'json' | 'table'
  maxDocuments?: number
}

// Styles
const containerStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${palette.gray.light2};
  background: ${palette.gray.light3};
`

const headerLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const headerRightStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const titleStyles = css`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: ${palette.gray.dark3};
`

const resultCountStyles = css`
  font-size: 12px;
  color: ${palette.gray.dark1};
`

const executionTimeStyles = css`
  font-size: 12px;
  color: ${palette.gray.dark1};
  padding: 2px 6px;
  background: ${palette.gray.light2};
  border-radius: 4px;
`

const buttonStyles = css`
  padding: 6px 12px;
  font-size: 12px;
  border: 1px solid ${palette.gray.light1};
  border-radius: 4px;
  background: ${palette.white};
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${palette.gray.light3};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const resultsStyles = css`
  flex: 1;
  overflow: auto;
  padding: 12px;
  &:focus {
    outline: 2px solid ${palette.blue.base};
    outline-offset: -2px;
  }
`

const documentStyles = css`
  padding: 12px;
  margin-bottom: 8px;
  background: ${palette.gray.light3};
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  &:last-child {
    margin-bottom: 0;
  }
  &:focus {
    outline: 2px solid ${palette.blue.base};
    outline-offset: -2px;
  }
`

const documentHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`

const documentIndexStyles = css`
  font-size: 11px;
  font-weight: 600;
  color: ${palette.gray.dark1};
  background: ${palette.gray.light2};
  padding: 2px 8px;
  border-radius: 4px;
`

const documentActionsStyles = css`
  display: flex;
  gap: 4px;
`

const iconButtonStyles = css`
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid ${palette.gray.light1};
  border-radius: 4px;
  background: ${palette.white};
  cursor: pointer;
  &:hover {
    background: ${palette.gray.light2};
  }
`

const documentContentStyles = css`
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`

const jsonKeyStyles = css`
  color: ${palette.purple.dark2};
`

const jsonStringStyles = css`
  color: ${palette.green.dark2};
`

const jsonNumberStyles = css`
  color: ${palette.blue.dark1};
`

const jsonBooleanStyles = css`
  color: ${palette.red.dark2};
`

const jsonNullStyles = css`
  color: ${palette.gray.dark1};
`

const collapsedStyles = css`
  color: ${palette.gray.dark1};
  font-style: italic;
`

const collapseToggleStyles = css`
  display: inline-block;
  width: 16px;
  height: 16px;
  margin-right: 4px;
  border: none;
  background: none;
  cursor: pointer;
  font-family: monospace;
  font-size: 12px;
  color: ${palette.gray.dark1};
  &:hover {
    color: ${palette.gray.dark3};
  }
`

const paginationStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid ${palette.gray.light2};
  background: ${palette.gray.light3};
`

const paginationControlsStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const paginationButtonStyles = css`
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid ${palette.gray.light1};
  border-radius: 4px;
  background: ${palette.white};
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${palette.gray.light2};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const pageInfoStyles = css`
  font-size: 12px;
  color: ${palette.gray.dark1};
`

const pageSizeSelectStyles = css`
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid ${palette.gray.light1};
  border-radius: 4px;
  background: ${palette.white};
`

const loadingStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  gap: 16px;
`

const spinnerStyles = css`
  width: 32px;
  height: 32px;
  border: 3px solid ${palette.gray.light2};
  border-top-color: ${palette.blue.base};
  border-radius: 50%;
  animation: spin 1s linear infinite;
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`

const errorStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  margin: 12px;
  background: ${palette.red.light3};
  border: 1px solid ${palette.red.light1};
  border-radius: 6px;
`

const errorIconStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${palette.red.base};
  color: ${palette.white};
  font-weight: bold;
  font-size: 14px;
`

const errorContentStyles = css`
  flex: 1;
`

const errorStageStyles = css`
  font-size: 11px;
  font-weight: 600;
  color: ${palette.red.dark2};
  margin-bottom: 4px;
`

const errorMessageStyles = css`
  margin: 0;
  font-size: 13px;
  color: ${palette.red.dark2};
`

const showDetailsButtonStyles = css`
  margin-top: 8px;
  padding: 4px 8px;
  font-size: 11px;
  border: none;
  background: none;
  color: ${palette.red.dark2};
  text-decoration: underline;
  cursor: pointer;
`

const errorDetailsStyles = css`
  margin-top: 8px;
  padding: 8px;
  font-size: 12px;
  background: ${palette.red.light2};
  border-radius: 4px;
  font-family: monospace;
`

const retryButtonStyles = css`
  padding: 6px 12px;
  font-size: 12px;
  border: 1px solid ${palette.red.dark2};
  border-radius: 4px;
  background: ${palette.white};
  color: ${palette.red.dark2};
  cursor: pointer;
  &:hover {
    background: ${palette.red.light3};
  }
`

const emptyStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  gap: 12px;
  color: ${palette.gray.dark1};
  text-align: center;
`

const emptyIconStyles = css`
  font-size: 24px;
  color: ${palette.gray.base};
`

const viewToggleStyles = css`
  display: flex;
  border: 1px solid ${palette.gray.light1};
  border-radius: 4px;
  overflow: hidden;
`

const viewToggleButtonStyles = css`
  padding: 4px 12px;
  font-size: 11px;
  border: none;
  background: ${palette.white};
  cursor: pointer;
  &:hover {
    background: ${palette.gray.light3};
  }
`

const viewToggleActiveStyles = css`
  background: ${palette.blue.light3};
  color: ${palette.blue.dark2};
`

const tableViewStyles = css`
  overflow: auto;
`

const tableStyles = css`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  th, td {
    padding: 8px 12px;
    text-align: left;
    border: 1px solid ${palette.gray.light2};
  }
  th {
    background: ${palette.gray.light3};
    font-weight: 600;
  }
  tr:nth-child(even) {
    background: ${palette.gray.light3};
  }
`

const expandedViewStyles = css`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80%;
  max-width: 800px;
  max-height: 80vh;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light1};
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  &:focus {
    outline: none;
  }
`

const expandedHeaderStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${palette.gray.light2};
  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
`

const closeButtonStyles = css`
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid ${palette.gray.light1};
  border-radius: 4px;
  background: ${palette.white};
  cursor: pointer;
  &:hover {
    background: ${palette.gray.light3};
  }
`

const expandedContentStyles = css`
  flex: 1;
  overflow: auto;
  padding: 16px;
  pre {
    margin: 0;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }
`

const copyAllButtonStyles = css`
  padding: 4px 12px;
  font-size: 11px;
  border: 1px solid ${palette.gray.light1};
  border-radius: 4px;
  background: ${palette.white};
  cursor: pointer;
  &:hover {
    background: ${palette.gray.light3};
  }
`

const truncationMessageStyles = css`
  padding: 8px 16px;
  font-size: 12px;
  color: ${palette.yellow.dark2};
  background: ${palette.yellow.light3};
  border-bottom: 1px solid ${palette.yellow.light2};
`

const copiedNotificationStyles = css`
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: ${palette.gray.dark3};
  color: ${palette.white};
  border-radius: 4px;
  font-size: 12px;
  z-index: 1001;
`


// JSON value rendering with syntax highlighting
interface JsonValueProps {
  value: unknown
  keyName?: string
  collapsible?: boolean
  documentIndex?: number
  isRoot?: boolean
  isLast?: boolean
}

function JsonValue({
  value,
  keyName,
  collapsible,
  documentIndex,
  isRoot = false,
  isLast = true,
}: JsonValueProps) {
  const [expanded, setExpanded] = useState(true)
  const [clickCount, setClickCount] = useState(0)

  const handleToggle = useCallback(() => {
    setClickCount(c => c + 1)
    setExpanded(prev => !prev)
  }, [])

  const keyElement = keyName !== undefined ? (
    <>
      <span data-testid="json-key" className={jsonKeyStyles}>"{keyName}"</span>
      <span>: </span>
    </>
  ) : null

  if (value === null) {
    return (
      <span>
        {keyElement}
        <span data-testid="json-null" className={jsonNullStyles}>null</span>
        {!isLast && ', '}
      </span>
    )
  }

  if (typeof value === 'boolean') {
    return (
      <span>
        {keyElement}
        <span data-testid="json-boolean" className={jsonBooleanStyles}>{String(value)}</span>
        {!isLast && ', '}
      </span>
    )
  }

  if (typeof value === 'number') {
    return (
      <span>
        {keyElement}
        <span data-testid="json-number" className={jsonNumberStyles}>{value}</span>
        {!isLast && ', '}
      </span>
    )
  }

  if (typeof value === 'string') {
    return (
      <span>
        {keyElement}
        <span data-testid="json-string" className={jsonStringStyles}>
          <span>"</span>
          {value}
          <span>"</span>
        </span>
        {!isLast && ', '}
      </span>
    )
  }

  if (Array.isArray(value)) {
    // Determine testid for collapse toggle
    const collapseTestId = collapsible && documentIndex === 0 && keyName
      ? `collapse-toggle-${keyName}`
      : undefined

    return (
      <span>
        {collapsible && (
          <button
            data-testid={collapseTestId}
            data-click-count={clickCount}
            onClick={handleToggle}
            className={collapseToggleStyles}
            type="button"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '-' : '+'}
          </button>
        )}
        {keyElement}
        {expanded ? (
          <>
            {'['}
            {value.map((item, idx) => (
              <JsonValue
                key={idx}
                value={item}
                collapsible={collapsible}
                documentIndex={documentIndex}
                isLast={idx === value.length - 1}
              />
            ))}
            {']'}
          </>
        ) : (
          <span className={collapsedStyles}>[...]</span>
        )}
        {!isLast && ', '}
      </span>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)

    // Determine testid for collapse toggle - only for top-level keys in first document
    const collapseTestId = collapsible && documentIndex === 0 && keyName
      ? `collapse-toggle-${keyName}`
      : undefined

    // For root objects, don't show toggle button
    if (isRoot) {
      return (
        <span>
          {'{'}
          {entries.map(([key, val], idx) => (
            <JsonValue
              key={key}
              value={val}
              keyName={key}
              collapsible={collapsible}
              documentIndex={documentIndex}
              isLast={idx === entries.length - 1}
            />
          ))}
          {'}'}
        </span>
      )
    }

    // Stable toggle button and content wrapper
    const toggleButton = collapsible ? (
      <button
        key="toggle"
        data-testid={collapseTestId}
        data-click-count={clickCount}
        onClick={handleToggle}
        className={collapseToggleStyles}
        type="button"
        aria-label={expanded ? 'Collapse' : 'Expand'}
      >
        {expanded ? '-' : '+'}
      </button>
    ) : null

    const content = expanded ? (
      <span key="content">
        {'{'}
        {entries.map(([key, val], idx) => (
          <JsonValue
            key={key}
            value={val}
            keyName={key}
            collapsible={collapsible}
            documentIndex={documentIndex}
            isLast={idx === entries.length - 1}
          />
        ))}
        {'}'}
      </span>
    ) : (
      <span key="content" className={collapsedStyles}>{'{...}'}</span>
    )

    return (
      <span>
        {toggleButton}
        {keyElement}
        {content}
        {!isLast && ', '}
      </span>
    )
  }

  return (
    <span>
      {keyElement}
      {String(value)}
      {!isLast && ', '}
    </span>
  )
}

// Document component
interface DocumentComponentProps {
  document: Record<string, unknown>
  index: number
  collapsible?: boolean
  onCopy: (doc: Record<string, unknown>) => void
  onExpand: () => void
}

function DocumentComponent({ document, index, collapsible, onCopy, onExpand }: DocumentComponentProps) {
  return (
    <div
      data-testid={`result-document-${index}`}
      className={documentStyles}
      role="listitem"
      tabIndex={0}
    >
      <div className={documentHeaderStyles}>
        <span data-testid={`document-index-${index}`} className={documentIndexStyles}>
          {index + 1}
        </span>
        <div className={documentActionsStyles}>
          <button
            data-testid={`copy-document-${index}`}
            onClick={() => onCopy(document)}
            className={iconButtonStyles}
            type="button"
            aria-label="Copy document"
          >
            Copy
          </button>
          <button
            data-testid={`expand-document-${index}`}
            onClick={onExpand}
            className={iconButtonStyles}
            type="button"
            aria-label="Expand document"
          >
            Expand
          </button>
        </div>
      </div>
      <div className={documentContentStyles}>
        <JsonValue
          value={document}
          collapsible={collapsible}
          documentIndex={index}
          isRoot
        />
      </div>
    </div>
  )
}

// Table View Component
interface TableViewProps {
  documents: Record<string, unknown>[]
}

function TableView({ documents }: TableViewProps) {
  if (documents.length === 0) return null

  // Extract all unique keys from all documents
  const allKeys = Array.from(
    new Set(documents.flatMap((doc) => Object.keys(doc)))
  )

  return (
    <div data-testid="table-view" className={tableViewStyles}>
      <table className={tableStyles}>
        <thead>
          <tr>
            {allKeys.map((key) => (
              <th key={key} data-testid={`column-header-${key}`}>
                {key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {documents.map((doc, idx) => (
            <tr key={idx} data-testid={`table-row-${idx}`}>
              {allKeys.map((key) => (
                <td key={key}>
                  {doc[key] !== undefined
                    ? typeof doc[key] === 'object'
                      ? JSON.stringify(doc[key])
                      : String(doc[key])
                    : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Expanded Document View
interface ExpandedDocumentViewProps {
  document: Record<string, unknown>
  onClose: () => void
}

function ExpandedDocumentView({ document, onClose }: ExpandedDocumentViewProps) {
  const viewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    viewRef.current?.focus()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      data-testid="expanded-document-view"
      className={expandedViewStyles}
      ref={viewRef}
      tabIndex={-1}
    >
      <div className={expandedHeaderStyles}>
        <h3>Document Details</h3>
        <button
          data-testid="close-expanded-view"
          onClick={onClose}
          className={closeButtonStyles}
          type="button"
          aria-label="Close expanded view"
        >
          Close
        </button>
      </div>
      <div className={expandedContentStyles}>
        <pre>{JSON.stringify(document, null, 2)}</pre>
      </div>
    </div>
  )
}

export function PipelinePreview({
  results,
  loading = false,
  error = null,
  errorDetails,
  errorStage,
  onRefresh,
  pageSize = 10,
  page: controlledPage,
  onPageChange,
  onPageSizeChange,
  showPageSizeSelector = false,
  loadingMessage,
  emptyMessage,
  executionTimeMs,
  collapsible = false,
  showViewToggle = false,
  defaultViewMode = 'json',
  maxDocuments,
}: PipelinePreviewProps) {
  const [internalPage, setInternalPage] = useState(1)
  const [internalPageSize, setInternalPageSize] = useState(pageSize)
  const [viewMode, setViewMode] = useState<'json' | 'table'>(defaultViewMode)
  const [expandedDocIndex, setExpandedDocIndex] = useState<number | null>(null)
  const [showErrorDetails, setShowErrorDetails] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const currentPage = controlledPage ?? internalPage
  const currentPageSize = internalPageSize

  // Apply maxDocuments limit
  const limitedResults = maxDocuments && results.length > maxDocuments
    ? results.slice(0, maxDocuments)
    : results
  const isTruncated = maxDocuments !== undefined && results.length > maxDocuments

  // Pagination calculations
  const totalResults = limitedResults.length
  const totalPages = Math.ceil(totalResults / currentPageSize)
  const startIndex = (currentPage - 1) * currentPageSize
  const endIndex = Math.min(startIndex + currentPageSize, totalResults)
  const currentPageResults = limitedResults.slice(startIndex, endIndex)
  const showPagination = totalResults > currentPageSize && !loading && !error

  // Reset page when pageSize prop changes
  useEffect(() => {
    setInternalPageSize(pageSize)
  }, [pageSize])

  const handlePageChange = useCallback((newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage)
    } else {
      setInternalPage(newPage)
    }
  }, [onPageChange])

  const handlePageSizeChange = useCallback((newSize: number) => {
    setInternalPageSize(newSize)
    if (onPageSizeChange) {
      onPageSizeChange(newSize)
    }
    // Reset to first page when page size changes
    if (onPageChange) {
      onPageChange(1)
    } else {
      setInternalPage(1)
    }
  }, [onPageChange, onPageSizeChange])

  const handleCopyDocument = useCallback(async (doc: Record<string, unknown>, index?: number) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(doc, null, 2))
      if (index !== undefined) {
        setCopiedIndex(index)
        setTimeout(() => setCopiedIndex(null), 2000)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [])

  const handleCopyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(results, null, 2))
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [results])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = Math.min(focusedIndex + 1, currentPageResults.length - 1)
      setFocusedIndex(nextIndex)
      const nextElement = document.querySelector(`[data-testid="result-document-${nextIndex}"]`) as HTMLElement
      nextElement?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = Math.max(focusedIndex - 1, 0)
      setFocusedIndex(prevIndex)
      const prevElement = document.querySelector(`[data-testid="result-document-${prevIndex}"]`) as HTMLElement
      prevElement?.focus()
    }
  }, [focusedIndex, currentPageResults.length])

  // Format execution time
  const formatExecutionTime = (ms: number): string => {
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(2)}s`
    }
    return `${ms}ms`
  }

  // Format result count
  const formatResultCount = (): string => {
    const count = isTruncated ? maxDocuments! : results.length
    const total = results.length
    const formatted = count.toLocaleString()

    if (isTruncated) {
      return `${formatted} of ${total.toLocaleString()} documents`
    }

    return `${formatted} document${count === 1 ? '' : 's'}`
  }

  return (
    <div
      data-testid="pipeline-preview"
      className={containerStyles}
      aria-label="Pipeline preview results"
      aria-busy={loading}
    >
      {/* Header */}
      <div data-testid="preview-header" className={headerStyles}>
        <div className={headerLeftStyles}>
          <h2 className={titleStyles}>Preview</h2>
          {!loading && !error && totalResults > 0 && (
            <span data-testid="result-count" className={resultCountStyles}>
              {formatResultCount()}
            </span>
          )}
          {executionTimeMs !== undefined && !loading && !error && (
            <span data-testid="execution-time" className={executionTimeStyles}>
              {formatExecutionTime(executionTimeMs)}
            </span>
          )}
        </div>
        <div className={headerRightStyles}>
          {showViewToggle && !loading && !error && totalResults > 0 && (
            <div data-testid="view-toggle" className={viewToggleStyles}>
              <button
                data-testid="view-toggle-json"
                onClick={() => setViewMode('json')}
                className={`${viewToggleButtonStyles} ${viewMode === 'json' ? viewToggleActiveStyles : ''}`}
                type="button"
              >
                JSON
              </button>
              <button
                data-testid="view-toggle-table"
                onClick={() => setViewMode('table')}
                className={`${viewToggleButtonStyles} ${viewMode === 'table' ? viewToggleActiveStyles : ''}`}
                type="button"
              >
                Table
              </button>
            </div>
          )}
          {totalResults > 1 && !loading && !error && (
            <button
              data-testid="copy-all-button"
              onClick={handleCopyAll}
              className={copyAllButtonStyles}
              type="button"
            >
              {copiedAll ? 'Copied!' : 'Copy All'}
            </button>
          )}
          <button
            data-testid="refresh-preview-button"
            onClick={onRefresh}
            disabled={loading}
            className={buttonStyles}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Truncation message */}
      {isTruncated && !loading && !error && (
        <div className={truncationMessageStyles}>
          Showing first {maxDocuments!.toLocaleString()} of {results.length.toLocaleString()} documents
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div
          data-testid="preview-loading"
          className={loadingStyles}
          role="progressbar"
        >
          <div className={spinnerStyles} />
          <p>{loadingMessage || 'Running pipeline...'}</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div
          data-testid="preview-error"
          className={`${errorStyles} error`}
          role="alert"
        >
          <span data-testid="error-icon" className={errorIconStyles}>
            !
          </span>
          <div className={errorContentStyles}>
            {errorStage !== undefined && (
              <span data-testid="error-stage-indicator" className={errorStageStyles}>
                Stage {errorStage}
              </span>
            )}
            <p className={errorMessageStyles}>{error}</p>
            {errorDetails && (
              <>
                <button
                  data-testid="show-error-details"
                  onClick={() => setShowErrorDetails(!showErrorDetails)}
                  className={showDetailsButtonStyles}
                  type="button"
                >
                  {showErrorDetails ? 'Hide Details' : 'Show Details'}
                </button>
                {showErrorDetails && (
                  <p className={errorDetailsStyles}>{errorDetails}</p>
                )}
              </>
            )}
          </div>
          {onRefresh && (
            <button
              data-testid="retry-button"
              onClick={onRefresh}
              className={retryButtonStyles}
              type="button"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && totalResults === 0 && (
        <div data-testid="preview-empty" className={emptyStyles}>
          <span data-testid="empty-icon" className={emptyIconStyles}>
            []
          </span>
          <p>
            {emptyMessage || 'No documents returned by pipeline. Try to modify your pipeline stages.'}
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && totalResults > 0 && (
        <>
          {viewMode === 'json' ? (
            <div
              data-testid="preview-results"
              className={resultsStyles}
              role="list"
              ref={resultsRef}
              tabIndex={0}
              onKeyDown={handleKeyDown}
            >
              <div data-testid="json-view">
                {currentPageResults.map((doc, idx) => (
                  <DocumentComponent
                    key={startIndex + idx}
                    document={doc}
                    index={idx}
                    collapsible={collapsible}
                    onCopy={(d) => handleCopyDocument(d, idx)}
                    onExpand={() => setExpandedDocIndex(startIndex + idx)}
                  />
                ))}
              </div>
              {copiedIndex !== null && (
                <div className={copiedNotificationStyles}>Copied!</div>
              )}
            </div>
          ) : (
            <div
              data-testid="preview-results"
              className={resultsStyles}
              role="list"
            >
              <TableView documents={currentPageResults} />
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {showPagination && (
        <div data-testid="preview-pagination" className={paginationStyles}>
          <div className={paginationControlsStyles}>
            <button
              data-testid="first-page-button"
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              className={paginationButtonStyles}
              type="button"
              aria-label="First page"
            >
              First
            </button>
            <button
              data-testid="prev-page-button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={paginationButtonStyles}
              type="button"
              aria-label="Previous page"
            >
              Prev
            </button>
            <span data-testid="page-info" className={pageInfoStyles}>
              {startIndex + 1}-{endIndex} of {totalResults}
            </span>
            <button
              data-testid="next-page-button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={paginationButtonStyles}
              type="button"
              aria-label="Next page"
            >
              Next
            </button>
            <button
              data-testid="last-page-button"
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              className={paginationButtonStyles}
              type="button"
              aria-label="Last page"
            >
              Last
            </button>
          </div>
          {showPageSizeSelector && (
            <select
              data-testid="page-size-select"
              value={currentPageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className={pageSizeSelectStyles}
            >
              <option value="10">10 per page</option>
              <option value="25">25 per page</option>
              <option value="50">50 per page</option>
              <option value="100">100 per page</option>
            </select>
          )}
        </div>
      )}

      {/* Expanded Document View */}
      {expandedDocIndex !== null && (
        <ExpandedDocumentView
          document={limitedResults[expandedDocIndex]!}
          onClose={() => setExpandedDocIndex(null)}
        />
      )}
    </div>
  )
}

export default PipelinePreview
