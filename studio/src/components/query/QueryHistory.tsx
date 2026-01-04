import { useState, useMemo } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Subtitle, Description } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import { SearchInput } from '@leafygreen-ui/search-input'
import Tooltip from '@leafygreen-ui/tooltip'
import { useQueryStore, QueryHistoryEntry } from '@stores/query'

const containerStyles = css`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 8px;
  overflow: hidden;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${palette.gray.light2};
  background: ${palette.gray.light3};
`

const headerActionsStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const searchContainerStyles = css`
  padding: 12px 16px;
  border-bottom: 1px solid ${palette.gray.light2};
`

const listStyles = css`
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
`

const emptyStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: ${palette.gray.base};
  text-align: center;
  padding: 24px;
`

const historyItemStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover {
    background: ${palette.gray.light3};
  }
`

const historyItemActiveStyles = css`
  background: ${palette.green.light3};

  &:hover {
    background: ${palette.green.light3};
  }
`

const historyItemContentStyles = css`
  flex: 1;
  min-width: 0;
`

const queryPreviewStyles = css`
  font-family: 'Source Code Pro', Menlo, Monaco, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
  color: ${palette.gray.dark3};
  background: ${palette.gray.light3};
  padding: 8px 12px;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
`

const metaStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: ${palette.gray.base};
`

const metaItemStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
`

const actionsStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;

  ${historyItemStyles}:hover & {
    opacity: 1;
  }
`

const tabsStyles = css`
  display: flex;
  gap: 4px;
  padding: 8px 16px;
  border-bottom: 1px solid ${palette.gray.light2};
`

const tabButtonStyles = css`
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: ${palette.gray.dark1};
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${palette.gray.light2};
  }
`

const tabButtonActiveStyles = css`
  background: ${palette.green.light3};
  color: ${palette.green.dark2};

  &:hover {
    background: ${palette.green.light3};
  }
`

const errorBadgeStyles = css`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 500;
  background: ${palette.red.light3};
  color: ${palette.red.dark2};
  border-radius: 4px;
`

interface QueryHistoryProps {
  database?: string
  collection?: string
  onSelect?: (query: string) => void
  className?: string
}

type TabType = 'all' | 'favorites'

function formatTimestamp(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) {
    return 'Just now'
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000)
    return `${minutes}m ago`
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    return `${hours}h ago`
  } else if (diff < 604800000) {
    const days = Math.floor(diff / 86400000)
    return `${days}d ago`
  } else {
    return new Date(timestamp).toLocaleDateString()
  }
}

function formatExecutionTime(ms: number): string {
  if (ms < 1) {
    return '<1ms'
  } else if (ms < 1000) {
    return `${Math.round(ms)}ms`
  } else {
    return `${(ms / 1000).toFixed(2)}s`
  }
}

function truncateQuery(query: string, maxLength = 100): string {
  const normalized = query.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return normalized.substring(0, maxLength) + '...'
}

export function QueryHistory({
  database,
  collection,
  onSelect,
  className,
}: QueryHistoryProps) {
  const {
    history,
    removeFromHistory,
    toggleFavorite,
    clearHistory,
    loadFromHistory,
    currentQuery,
  } = useQueryStore()

  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Filter history based on context and search
  const filteredHistory = useMemo(() => {
    let filtered = history

    // Filter by database/collection if provided
    if (database && collection) {
      filtered = filtered.filter(
        (h) => h.database === database && h.collection === collection
      )
    }

    // Filter by tab
    if (activeTab === 'favorites') {
      filtered = filtered.filter((h) => h.isFavorite)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const search = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (h) =>
          h.query.toLowerCase().includes(search) ||
          h.database.toLowerCase().includes(search) ||
          h.collection.toLowerCase().includes(search)
      )
    }

    return filtered
  }, [history, database, collection, activeTab, searchQuery])

  const handleSelect = (entry: QueryHistoryEntry) => {
    loadFromHistory(entry.id)
    onSelect?.(entry.query)
  }

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    removeFromHistory(id)
  }

  const handleToggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    toggleFavorite(id)
  }

  const handleClearHistory = () => {
    if (window.confirm('Clear all query history? Favorites will be kept.')) {
      clearHistory()
    }
  }

  return (
    <div className={`${containerStyles} ${className ?? ''}`}>
      <div className={headerStyles}>
        <Subtitle>Query History</Subtitle>
        <div className={headerActionsStyles}>
          <IconButton
            aria-label="Clear history"
            onClick={handleClearHistory}
            disabled={history.filter((h) => !h.isFavorite).length === 0}
          >
            <Icon glyph="Trash" />
          </IconButton>
        </div>
      </div>

      <div className={tabsStyles}>
        <button
          className={`${tabButtonStyles} ${activeTab === 'all' ? tabButtonActiveStyles : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All ({history.length})
        </button>
        <button
          className={`${tabButtonStyles} ${activeTab === 'favorites' ? tabButtonActiveStyles : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          Favorites ({history.filter((h) => h.isFavorite).length})
        </button>
      </div>

      <div className={searchContainerStyles}>
        <SearchInput
          aria-label="Search history"
          placeholder="Search queries..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className={listStyles}>
        {filteredHistory.length === 0 ? (
          <div className={emptyStyles}>
            <Icon glyph="InfoWithCircle" size="large" />
            <Body>
              {searchQuery
                ? 'No matching queries found'
                : activeTab === 'favorites'
                  ? 'No favorite queries yet'
                  : 'No query history yet'}
            </Body>
            <Description>
              {!searchQuery && activeTab === 'all' && 'Run some queries to see them here'}
            </Description>
          </div>
        ) : (
          filteredHistory.map((entry) => (
            <div
              key={entry.id}
              className={`${historyItemStyles} ${entry.query === currentQuery ? historyItemActiveStyles : ''}`}
              onClick={() => handleSelect(entry)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelect(entry)
                }
              }}
            >
              <div className={historyItemContentStyles}>
                <div className={queryPreviewStyles}>{truncateQuery(entry.query)}</div>
                <div className={metaStyles}>
                  <span className={metaItemStyles}>
                    <Icon glyph="Database" size="small" />
                    {entry.database}.{entry.collection}
                  </span>
                  <span className={metaItemStyles}>
                    <Icon glyph="Clock" size="small" />
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  {entry.executionTime !== undefined && (
                    <span className={metaItemStyles}>
                      <Icon glyph="Wizard" size="small" />
                      {formatExecutionTime(entry.executionTime)}
                    </span>
                  )}
                  {entry.resultCount !== undefined && (
                    <span className={metaItemStyles}>
                      <Icon glyph="File" size="small" />
                      {entry.resultCount} docs
                    </span>
                  )}
                  {entry.error && (
                    <span className={errorBadgeStyles}>
                      <Icon glyph="Warning" size="small" />
                      Error
                    </span>
                  )}
                </div>
              </div>
              <div className={actionsStyles}>
                <Tooltip
                  trigger={
                    <IconButton
                      aria-label={entry.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      onClick={(e) => handleToggleFavorite(e, entry.id)}
                    >
                      <Icon
                        glyph="Favorite"
                        fill={entry.isFavorite ? palette.yellow.base : palette.gray.light1}
                      />
                    </IconButton>
                  }
                >
                  <span>{entry.isFavorite ? 'Remove from favorites' : 'Add to favorites'}</span>
                </Tooltip>
                <Tooltip trigger={<span>Delete</span>}>
                  <IconButton
                    aria-label="Delete from history"
                    onClick={(e) => handleDelete(e, entry.id)}
                  >
                    <Icon glyph="X" />
                  </IconButton>
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default QueryHistory
