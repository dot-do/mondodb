/**
 * CollectionItem - A single collection item in the database browser tree
 *
 * Displays collection name, type badge, and stats (document count, size).
 * Supports selection, hover states, and context menu actions.
 */

import React, { useState, useCallback } from 'react'
import type { CollectionInfo, CollectionStats } from './types'

export interface CollectionItemProps {
  /** Collection information */
  collection: CollectionInfo
  /** Collection statistics (optional) */
  stats?: CollectionStats
  /** Database this collection belongs to */
  database: string
  /** Whether this collection is currently selected */
  isSelected?: boolean
  /** Whether stats are currently loading */
  isLoadingStats?: boolean
  /** Called when the collection is clicked */
  onClick?: (database: string, collection: string) => void
  /** Called when drop collection is requested */
  onDropCollection?: (database: string, collection: string) => void
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px 6px 32px',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 0.15s ease',
    userSelect: 'none' as const,
  },
  containerHover: {
    backgroundColor: '#f5f6f7',
  },
  containerSelected: {
    backgroundColor: '#e8f4f8',
    color: '#016bf8',
  },
  icon: {
    width: '16px',
    height: '16px',
    marginRight: '8px',
    flexShrink: 0,
  },
  name: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  badge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: '10px',
    marginLeft: '8px',
    textTransform: 'uppercase' as const,
  },
  viewBadge: {
    backgroundColor: '#fef7e0',
    color: '#944f01',
  },
  stats: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginLeft: '8px',
    fontSize: '11px',
    color: '#889397',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  dropButton: {
    opacity: 0,
    padding: '2px 4px',
    marginLeft: '4px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    borderRadius: '4px',
    color: '#889397',
    transition: 'opacity 0.15s ease, color 0.15s ease',
  },
  dropButtonVisible: {
    opacity: 1,
  },
  dropButtonHover: {
    color: '#cf4747',
  },
  loadingStats: {
    width: '40px',
    height: '12px',
    backgroundColor: '#e8e8e8',
    borderRadius: '4px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
}

/** Format bytes to human-readable size */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/** Format number with abbreviation for large numbers */
function formatCount(count: number): string {
  if (count < 1000) return count.toString()
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`
  return `${(count / 1000000).toFixed(1)}M`
}

/** Collection icon SVG */
function CollectionIcon({ isView }: { isView?: boolean }) {
  if (isView) {
    return (
      <svg style={styles.icon} viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 3C4.5 3 1.5 5.5 1.5 8s3 5 6.5 5 6.5-2.5 6.5-5-3-5-6.5-5zm0 8c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3zm0-4.5c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5 1.5-.7 1.5-1.5-.7-1.5-1.5-1.5z" />
      </svg>
    )
  }
  return (
    <svg style={styles.icon} viewBox="0 0 16 16" fill="currentColor">
      <path d="M14 3H2c-.6 0-1 .4-1 1v8c0 .6.4 1 1 1h12c.6 0 1-.4 1-1V4c0-.6-.4-1-1-1zm-1 8H3V5h10v6z" />
      <path d="M4 6h8v1H4zM4 8h6v1H4z" />
    </svg>
  )
}

/** Trash icon SVG */
function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5zM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 5.885 16h4.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1H11z" />
    </svg>
  )
}

export function CollectionItem({
  collection,
  stats,
  database,
  isSelected = false,
  isLoadingStats = false,
  onClick,
  onDropCollection,
}: CollectionItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isDropHovered, setIsDropHovered] = useState(false)

  const handleClick = useCallback(() => {
    onClick?.(database, collection.name)
  }, [onClick, database, collection.name])

  const handleDropClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDropCollection?.(database, collection.name)
    },
    [onDropCollection, database, collection.name]
  )

  const isView = collection.type === 'view'

  return (
    <div
      style={{
        ...styles.container,
        ...(isHovered && !isSelected ? styles.containerHover : {}),
        ...(isSelected ? styles.containerSelected : {}),
      }}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="treeitem"
      aria-selected={isSelected}
      data-testid={`collection-item-${collection.name}`}
    >
      <CollectionIcon isView={isView} />
      <span style={styles.name}>{collection.name}</span>

      {isView && (
        <span style={{ ...styles.badge, ...styles.viewBadge }}>View</span>
      )}

      {isLoadingStats ? (
        <div style={styles.loadingStats} data-testid="stats-loading" />
      ) : stats ? (
        <div style={styles.stats}>
          <span style={styles.statItem} title={`${stats.count} documents`}>
            {formatCount(stats.count)} docs
          </span>
          <span style={styles.statItem} title={`${stats.size} bytes`}>
            {formatSize(stats.size)}
          </span>
        </div>
      ) : null}

      {onDropCollection && (
        <button
          style={{
            ...styles.dropButton,
            ...(isHovered ? styles.dropButtonVisible : {}),
            ...(isDropHovered ? styles.dropButtonHover : {}),
          }}
          onClick={handleDropClick}
          onMouseEnter={() => setIsDropHovered(true)}
          onMouseLeave={() => setIsDropHovered(false)}
          title="Drop collection"
          aria-label={`Drop collection ${collection.name}`}
          data-testid={`drop-collection-${collection.name}`}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  )
}

export default CollectionItem
