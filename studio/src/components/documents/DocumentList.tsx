import { useState, useMemo, useCallback } from 'react'
import { css, cx } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Subtitle } from '@leafygreen-ui/typography'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import Button from '@leafygreen-ui/button'
import TextInput from '@leafygreen-ui/text-input'
import { DocumentRow } from './DocumentRow'
import { Pagination } from './Pagination'
import { JsonTreeView } from './JsonTreeView'
import type { Document } from '@lib/rpc-client'

// Types
export type ViewMode = 'table' | 'json'
export type SortDirection = 'asc' | 'desc' | null

export interface ColumnConfig {
  field: string
  label: string
  width?: number
  sortable?: boolean
  filterable?: boolean
  visible?: boolean
}

export interface SortConfig {
  field: string
  direction: SortDirection
}

export interface FilterConfig {
  field: string
  value: string
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex'
}

export interface DocumentListProps {
  documents: Document[]
  columns?: ColumnConfig[]
  loading?: boolean
  error?: string | null
  totalCount?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  onSort?: (sort: SortConfig | null) => void
  onFilter?: (filters: FilterConfig[]) => void
  onSelect?: (selectedIds: string[]) => void
  onDocumentClick?: (document: Document) => void
  onDocumentEdit?: (document: Document) => void
  onDocumentDelete?: (document: Document) => void
  selectable?: boolean
  multiSelect?: boolean
  expandable?: boolean
  defaultViewMode?: ViewMode
}

// Styles
const containerStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`

const toolbarStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid ${palette.gray.light2};
  flex-shrink: 0;
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

const viewToggleStyles = css`
  display: flex;
  align-items: center;
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  overflow: hidden;
`

const viewToggleButtonStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  background: ${palette.white};
  border: none;
  cursor: pointer;
  color: ${palette.gray.dark1};
  transition: all 0.15s ease;

  &:hover {
    background: ${palette.gray.light3};
  }

  &:not(:last-child) {
    border-right: 1px solid ${palette.gray.light2};
  }
`

const viewToggleButtonActiveStyles = css`
  background: ${palette.green.dark1};
  color: ${palette.white};

  &:hover {
    background: ${palette.green.dark2};
  }
`

const tableContainerStyles = css`
  flex: 1;
  overflow: auto;
  min-height: 0;
`

const tableStyles = css`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
`

const headerRowStyles = css`
  background: ${palette.gray.light3};
  position: sticky;
  top: 0;
  z-index: 10;
`

const headerCellStyles = css`
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: ${palette.gray.dark1};
  border-bottom: 1px solid ${palette.gray.light2};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
`

const headerCellSortableStyles = css`
  cursor: pointer;

  &:hover {
    background: ${palette.gray.light2};
  }
`

const headerCellContentStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
`

const sortIconStyles = css`
  opacity: 0.5;
  transition: opacity 0.15s ease;
`

const sortIconActiveStyles = css`
  opacity: 1;
  color: ${palette.green.dark1};
`

const checkboxCellStyles = css`
  width: 48px;
  text-align: center;
`

const expandCellStyles = css`
  width: 40px;
`

const emptyStateStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: ${palette.gray.dark1};
`

const loadingStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
`

const loadingRowStyles = css`
  height: 48px;
  background: linear-gradient(
    90deg,
    ${palette.gray.light2} 25%,
    ${palette.gray.light3} 50%,
    ${palette.gray.light2} 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
`

const errorStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: ${palette.red.base};
`

const jsonViewContainerStyles = css`
  flex: 1;
  overflow: auto;
  padding: 16px;
  min-height: 0;
`

const selectionInfoStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: ${palette.blue.light3};
  border-radius: 4px;
  font-size: 13px;
  color: ${palette.blue.dark2};
`

const filterBarStyles = css`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 1px solid ${palette.gray.light2};
`

const filterChipStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 12px;
  background: ${palette.gray.light3};
  border-radius: 16px;
  font-size: 12px;
  color: ${palette.gray.dark2};
`

const filterChipRemoveStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: transparent;
  border: none;
  cursor: pointer;
  color: ${palette.gray.dark1};

  &:hover {
    background: ${palette.gray.light1};
  }
`

const filterInputContainerStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const columnFilterStyles = css`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 20;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 8px;
`

const headerCellWithFilterStyles = css`
  position: relative;
`

// Helper to extract all unique field names from documents
function extractFields(documents: Document[]): string[] {
  const fieldSet = new Set<string>()
  for (const doc of documents) {
    for (const key of Object.keys(doc)) {
      fieldSet.add(key)
    }
  }
  // Always put _id first
  const fields = Array.from(fieldSet)
  const idIndex = fields.indexOf('_id')
  if (idIndex > 0) {
    fields.splice(idIndex, 1)
    fields.unshift('_id')
  }
  return fields
}

// Helper to generate default columns from fields
function generateColumns(fields: string[]): ColumnConfig[] {
  return fields.map((field) => ({
    field,
    label: field,
    sortable: true,
    filterable: true,
    visible: true,
  }))
}

export function DocumentList({
  documents,
  columns: providedColumns,
  loading = false,
  error = null,
  totalCount,
  page = 1,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  onSort,
  onFilter,
  onSelect,
  onDocumentClick,
  onDocumentEdit,
  onDocumentDelete,
  selectable = false,
  multiSelect = false,
  expandable = true,
  defaultViewMode = 'table',
}: DocumentListProps) {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null)
  const [filterInputValue, setFilterInputValue] = useState('')

  // Compute columns from documents if not provided
  const columns = useMemo(() => {
    if (providedColumns && providedColumns.length > 0) {
      return providedColumns
    }
    const fields = extractFields(documents)
    return generateColumns(fields)
  }, [documents, providedColumns])

  // Visible columns only
  const visibleColumns = useMemo(
    () => columns.filter((col) => col.visible !== false),
    [columns]
  )

  // Selection handlers
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set())
      onSelect?.([])
    } else {
      const allIds = new Set(documents.map((d) => d._id))
      setSelectedIds(allIds)
      onSelect?.(Array.from(allIds))
    }
  }, [documents, selectedIds.size, onSelect])

  const handleSelectRow = useCallback(
    (id: string) => {
      if (multiSelect) {
        const newSelected = new Set(selectedIds)
        if (newSelected.has(id)) {
          newSelected.delete(id)
        } else {
          newSelected.add(id)
        }
        setSelectedIds(newSelected)
        onSelect?.(Array.from(newSelected))
      } else {
        const newSelected = selectedIds.has(id) ? new Set<string>() : new Set([id])
        setSelectedIds(newSelected)
        onSelect?.(Array.from(newSelected))
      }
    },
    [multiSelect, selectedIds, onSelect]
  )

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
    onSelect?.([])
  }, [onSelect])

  // Expand handlers
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const newExpanded = new Set(prev)
      if (newExpanded.has(id)) {
        newExpanded.delete(id)
      } else {
        newExpanded.add(id)
      }
      return newExpanded
    })
  }, [])

  // Sort handler
  const handleSort = useCallback(
    (field: string) => {
      let newSort: SortConfig | null
      if (sortConfig?.field === field) {
        if (sortConfig.direction === 'asc') {
          newSort = { field, direction: 'desc' }
        } else if (sortConfig.direction === 'desc') {
          newSort = null
        } else {
          newSort = { field, direction: 'asc' }
        }
      } else {
        newSort = { field, direction: 'asc' }
      }
      setSortConfig(newSort)
      onSort?.(newSort)
    },
    [sortConfig, onSort]
  )

  // Filter handlers
  const handleAddFilter = useCallback(
    (field: string, value: string) => {
      if (!value.trim()) {
        setActiveFilterColumn(null)
        return
      }
      const newFilter: FilterConfig = {
        field,
        value: value.trim(),
        operator: 'contains',
      }
      const newFilters = [...filters, newFilter]
      setFilters(newFilters)
      onFilter?.(newFilters)
      setActiveFilterColumn(null)
      setFilterInputValue('')
    },
    [filters, onFilter]
  )

  const handleRemoveFilter = useCallback(
    (index: number) => {
      const newFilters = filters.filter((_, i) => i !== index)
      setFilters(newFilters)
      onFilter?.(newFilters)
    },
    [filters, onFilter]
  )

  const handleFilterClick = useCallback((field: string) => {
    setActiveFilterColumn((prev) => (prev === field ? null : field))
    setFilterInputValue('')
  }, [])

  // Render sort icon
  const renderSortIcon = (field: string) => {
    if (sortConfig?.field !== field) {
      return <Icon glyph="Unsorted" size="small" className={sortIconStyles} />
    }
    if (sortConfig.direction === 'asc') {
      return (
        <Icon
          glyph="SortAscending"
          size="small"
          className={cx(sortIconStyles, sortIconActiveStyles)}
        />
      )
    }
    return (
      <Icon
        glyph="SortDescending"
        size="small"
        className={cx(sortIconStyles, sortIconActiveStyles)}
      />
    )
  }

  // Calculate pagination info
  const actualTotalCount = totalCount ?? documents.length
  const totalPages = Math.ceil(actualTotalCount / pageSize)

  // Render loading state
  if (loading) {
    return (
      <div className={containerStyles} data-testid="document-list-loading">
        <div className={loadingStyles}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={loadingRowStyles} />
          ))}
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className={containerStyles} data-testid="document-list-error">
        <div className={errorStyles}>
          <Icon glyph="Warning" size="xlarge" />
          <Subtitle>Error loading documents</Subtitle>
          <Body>{error}</Body>
        </div>
      </div>
    )
  }

  // Render empty state
  if (documents.length === 0) {
    return (
      <div className={containerStyles} data-testid="document-list-empty">
        <div className={emptyStateStyles}>
          <Icon glyph="File" size="xlarge" />
          <Subtitle>No documents found</Subtitle>
          <Body>This collection is empty or no documents match your query.</Body>
        </div>
      </div>
    )
  }

  return (
    <div className={containerStyles} data-testid="document-list">
      {/* Toolbar */}
      <div className={toolbarStyles}>
        <div className={toolbarLeftStyles}>
          {selectedIds.size > 0 && (
            <div className={selectionInfoStyles} data-testid="selection-info">
              <span>{selectedIds.size} selected</span>
              <Button size="xsmall" onClick={handleClearSelection}>
                Clear
              </Button>
            </div>
          )}
          <Body>
            {actualTotalCount} document{actualTotalCount !== 1 ? 's' : ''}
          </Body>
        </div>

        <div className={toolbarRightStyles}>
          <div className={viewToggleStyles} role="group" aria-label="View mode">
            <button
              className={cx(
                viewToggleButtonStyles,
                viewMode === 'table' && viewToggleButtonActiveStyles
              )}
              onClick={() => setViewMode('table')}
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
              data-testid="view-toggle-table"
            >
              <Icon glyph="Menu" size="small" />
            </button>
            <button
              className={cx(
                viewToggleButtonStyles,
                viewMode === 'json' && viewToggleButtonActiveStyles
              )}
              onClick={() => setViewMode('json')}
              aria-label="JSON view"
              aria-pressed={viewMode === 'json'}
              data-testid="view-toggle-json"
            >
              <Icon glyph="CurlyBraces" size="small" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      {filters.length > 0 && (
        <div className={filterBarStyles} data-testid="filter-bar">
          {filters.map((filter, index) => (
            <div key={`${filter.field}-${index}`} className={filterChipStyles}>
              <span>
                {filter.field} {filter.operator} "{filter.value}"
              </span>
              <button
                className={filterChipRemoveStyles}
                onClick={() => handleRemoveFilter(index)}
                aria-label={`Remove filter ${filter.field}`}
                data-testid={`remove-filter-${index}`}
              >
                <Icon glyph="X" size="small" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className={tableContainerStyles}>
          <table className={tableStyles} data-testid="document-table">
            <thead>
              <tr className={headerRowStyles}>
                {selectable && (
                  <th className={cx(headerCellStyles, checkboxCellStyles)}>
                    {multiSelect && (
                      <input
                        type="checkbox"
                        checked={
                          selectedIds.size === documents.length &&
                          documents.length > 0
                        }
                        onChange={handleSelectAll}
                        aria-label="Select all"
                        data-testid="select-all-checkbox"
                      />
                    )}
                  </th>
                )}
                {expandable && (
                  <th className={cx(headerCellStyles, expandCellStyles)} />
                )}
                {visibleColumns.map((column) => (
                  <th
                    key={column.field}
                    className={cx(
                      headerCellStyles,
                      column.sortable && headerCellSortableStyles,
                      column.filterable && headerCellWithFilterStyles
                    )}
                    style={{ width: column.width }}
                    data-testid={`column-header-${column.field}`}
                  >
                    <div className={headerCellContentStyles}>
                      <span
                        onClick={
                          column.sortable ? () => handleSort(column.field) : undefined
                        }
                        style={{ cursor: column.sortable ? 'pointer' : 'default' }}
                      >
                        {column.label}
                      </span>
                      {column.sortable && renderSortIcon(column.field)}
                      {column.filterable && (
                        <IconButton
                          aria-label={`Filter by ${column.field}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleFilterClick(column.field)
                          }}
                          data-testid={`filter-button-${column.field}`}
                        >
                          <Icon glyph="Filter" size="small" />
                        </IconButton>
                      )}
                    </div>
                    {activeFilterColumn === column.field && (
                      <div
                        className={columnFilterStyles}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`filter-dropdown-${column.field}`}
                      >
                        <div className={filterInputContainerStyles}>
                          <TextInput
                            aria-label={`Filter value for ${column.field}`}
                            placeholder={`Filter by ${column.field}...`}
                            value={filterInputValue}
                            onChange={(e) => setFilterInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleAddFilter(column.field, filterInputValue)
                              }
                              if (e.key === 'Escape') {
                                setActiveFilterColumn(null)
                              }
                            }}
                            autoFocus
                            data-testid={`filter-input-${column.field}`}
                          />
                          <Button
                            size="xsmall"
                            onClick={() => handleAddFilter(column.field, filterInputValue)}
                          >
                            Apply
                          </Button>
                        </div>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <DocumentRow
                  key={document._id}
                  document={document}
                  columns={visibleColumns}
                  selected={selectedIds.has(document._id)}
                  expanded={expandedIds.has(document._id)}
                  selectable={selectable}
                  expandable={expandable}
                  onSelect={() => handleSelectRow(document._id)}
                  onToggleExpand={() => handleToggleExpand(document._id)}
                  onClick={
                    onDocumentClick ? () => onDocumentClick(document) : undefined
                  }
                  onEdit={
                    onDocumentEdit ? () => onDocumentEdit(document) : undefined
                  }
                  onDelete={
                    onDocumentDelete ? () => onDocumentDelete(document) : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* JSON View */}
      {viewMode === 'json' && (
        <div className={jsonViewContainerStyles} data-testid="json-view">
          <JsonTreeView
            documents={documents}
            selectedIds={selectedIds}
            selectable={selectable}
            onSelect={handleSelectRow}
          />
        </div>
      )}

      {/* Pagination */}
      {onPageChange && totalPages > 1 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          totalCount={actualTotalCount}
          totalPages={totalPages}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  )
}

export default DocumentList
