/**
 * CollectionTree - Tree view showing databases and their collections
 *
 * Displays a hierarchical tree of databases and collections with:
 * - Expandable/collapsible database nodes
 * - Collection items with stats
 * - Loading states for async data
 * - Empty states when no data
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { CollectionItem } from './CollectionItem'
import type { DatabaseInfo, CollectionInfo, CollectionStats, DatabaseStats } from './types'

export interface CollectionTreeProps {
  /** List of databases to display */
  databases: DatabaseInfo[]
  /** Map of database name to collections */
  collectionsByDatabase: Map<string, CollectionInfo[]>
  /** Map of collection key (db.collection) to stats */
  collectionStats?: Map<string, CollectionStats>
  /** Map of database name to stats */
  databaseStats?: Map<string, DatabaseStats>
  /** Currently selected database */
  selectedDatabase?: string
  /** Currently selected collection */
  selectedCollection?: string
  /** Databases that are currently loading collections */
  loadingDatabases?: Set<string>
  /** Collections that are currently loading stats */
  loadingStats?: Set<string>
  /** Whether the entire tree is loading */
  isLoading?: boolean
  /** Called when a database is clicked/toggled */
  onDatabaseToggle?: (database: string, isExpanded: boolean) => void
  /** Called when a database is selected */
  onDatabaseSelect?: (database: string) => void
  /** Called when a collection is selected */
  onCollectionSelect?: (database: string, collection: string) => void
  /** Called when drop database is requested */
  onDropDatabase?: (database: string) => void
  /** Called when drop collection is requested */
  onDropCollection?: (database: string, collection: string) => void
  /** Called when create collection is requested */
  onCreateCollection?: (database: string) => void
  /** Called when a collection is double-clicked to open */
  onCollectionOpen?: (database: string, collection: string) => void
  /** Called when multiple collections are selected (multi-select mode) */
  onMultiSelect?: (selections: Array<{ database: string; collection: string }>) => void
  /** Whether multi-select mode is enabled */
  multiSelectEnabled?: boolean
  /** Whether to show breadcrumb for current selection */
  showBreadcrumb?: boolean
  /** Called when collapse all is triggered */
  onCollapseAll?: () => void
}

/** Format bytes to human-readable size */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(0))} ${sizes[i]}`
}

/** Format number with commas */
function formatNumber(num: number): string {
  return num.toLocaleString()
}

const styles = {
  container: {
    width: '100%',
    overflow: 'auto',
  },
  loading: {
    padding: '16px',
    color: '#889397',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  empty: {
    padding: '24px 16px',
    color: '#889397',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  databaseNode: {
    userSelect: 'none' as const,
  },
  databaseHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 0.15s ease',
    outline: 'none',
  },
  databaseHeaderHover: {
    backgroundColor: '#f5f6f7',
  },
  databaseHeaderSelected: {
    backgroundColor: '#e8f4f8',
    color: '#016bf8',
  },
  expandChevron: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    marginRight: '4px',
    flexShrink: 0,
    transition: 'transform 0.15s ease',
  },
  expandIcon: {
    width: '16px',
    height: '16px',
    marginRight: '4px',
    transition: 'transform 0.15s ease',
    flexShrink: 0,
  },
  expandIconExpanded: {
    transform: 'rotate(90deg)',
  },
  databaseIcon: {
    width: '16px',
    height: '16px',
    marginRight: '8px',
    flexShrink: 0,
  },
  databaseName: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  databaseStats: {
    fontSize: '11px',
    color: '#889397',
    marginLeft: '8px',
  },
  collectionList: {
    paddingLeft: '8px',
  },
  actionButton: {
    opacity: 0,
    padding: '2px 6px',
    marginLeft: '4px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    borderRadius: '4px',
    color: '#889397',
    fontSize: '11px',
    transition: 'opacity 0.15s ease, color 0.15s ease, background-color 0.15s ease',
  },
  actionButtonVisible: {
    opacity: 1,
  },
  actionButtonHover: {
    backgroundColor: '#e8e8e8',
    color: '#333',
  },
  dropButtonHover: {
    color: '#cf4747',
  },
  loadingCollections: {
    padding: '8px 8px 8px 40px',
    color: '#889397',
    fontSize: '12px',
  },
  emptyCollections: {
    padding: '8px 8px 8px 40px',
    color: '#889397',
    fontSize: '12px',
    fontStyle: 'italic' as const,
  },
  skeleton: {
    height: '16px',
    backgroundColor: '#e8e8e8',
    borderRadius: '4px',
    margin: '8px 0 8px 40px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
}

/** Chevron icon for expand/collapse */
function ChevronIcon() {
  return (
    <svg style={styles.expandIcon} viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  )
}

/** Database icon SVG */
function DatabaseIcon() {
  return (
    <svg style={styles.databaseIcon} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1C4.7 1 2 2.3 2 4v8c0 1.7 2.7 3 6 3s6-1.3 6-3V4c0-1.7-2.7-3-6-3zm0 2c2.8 0 4 .9 4 1s-1.2 1-4 1-4-.9-4-1 1.2-1 4-1zm4 9c0 .1-1.2 1-4 1s-4-.9-4-1v-1.5c1 .6 2.4 1 4 1s3-.4 4-1V12zm0-4c0 .1-1.2 1-4 1s-4-.9-4-1V6.5c1 .6 2.4 1 4 1s3-.4 4-1V8z" />
    </svg>
  )
}

/** Plus icon for create actions */
function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Trash icon for delete actions */
function TrashIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5zM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 5.885 16h4.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1H11z" />
    </svg>
  )
}

interface DatabaseNodeProps {
  database: DatabaseInfo
  collections: CollectionInfo[]
  stats?: DatabaseStats
  collectionStats?: Map<string, CollectionStats>
  isSelected: boolean
  selectedCollection?: string
  isLoading?: boolean
  isExpanded: boolean
  loadingStats?: Set<string>
  onToggle: (database: string, isExpanded: boolean) => void
  onSelect?: (database: string) => void
  onCollectionSelect?: (database: string, collection: string) => void
  onDropDatabase?: (database: string) => void
  onDropCollection?: (database: string, collection: string) => void
  onCreateCollection?: (database: string) => void
}

function DatabaseNode({
  database,
  collections,
  stats,
  collectionStats,
  isSelected,
  selectedCollection,
  isLoading,
  isExpanded,
  loadingStats,
  onToggle,
  onSelect,
  onCollectionSelect,
  onDropDatabase,
  onDropCollection,
  onCreateCollection,
}: DatabaseNodeProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isCreateHovered, setIsCreateHovered] = useState(false)
  const [isDropHovered, setIsDropHovered] = useState(false)

  const handleClick = useCallback(() => {
    onToggle(database.name, !isExpanded)
    onSelect?.(database.name)
  }, [database.name, isExpanded, onToggle, onSelect])

  const handleCreateClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onCreateCollection?.(database.name)
    },
    [database.name, onCreateCollection]
  )

  const handleDropClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!window.confirm(`Are you sure you want to drop database "${database.name}"? This cannot be undone.`)) {
        return
      }
      onDropDatabase?.(database.name)
    },
    [database.name, onDropDatabase]
  )

  return (
    <div style={styles.databaseNode} data-testid={`database-node-${database.name}`}>
      <div
        style={{
          ...styles.databaseHeader,
          ...(isHovered && !isSelected ? styles.databaseHeaderHover : {}),
          ...(isSelected ? styles.databaseHeaderSelected : {}),
        }}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="treeitem"
        aria-expanded={isExpanded}
        aria-selected={isSelected}
      >
        <span
          style={{
            ...styles.expandIcon,
            ...(isExpanded ? styles.expandIconExpanded : {}),
          }}
        >
          <ChevronIcon />
        </span>
        <DatabaseIcon />
        <span style={styles.databaseName}>{database.name}</span>

        {stats && (
          <span style={styles.databaseStats}>
            {stats.collections} col{stats.collections !== 1 ? 's' : ''}
          </span>
        )}

        {onCreateCollection && (
          <button
            style={{
              ...styles.actionButton,
              ...(isHovered ? styles.actionButtonVisible : {}),
              ...(isCreateHovered ? styles.actionButtonHover : {}),
            }}
            onClick={handleCreateClick}
            onMouseEnter={() => setIsCreateHovered(true)}
            onMouseLeave={() => setIsCreateHovered(false)}
            title="Create collection"
            aria-label={`Create collection in ${database.name}`}
            data-testid={`create-collection-${database.name}`}
          >
            <PlusIcon />
          </button>
        )}

        {onDropDatabase && (
          <button
            style={{
              ...styles.actionButton,
              ...(isHovered ? styles.actionButtonVisible : {}),
              ...(isDropHovered ? { ...styles.actionButtonHover, ...styles.dropButtonHover } : {}),
            }}
            onClick={handleDropClick}
            onMouseEnter={() => setIsDropHovered(true)}
            onMouseLeave={() => setIsDropHovered(false)}
            title="Drop database"
            aria-label={`Drop database ${database.name}`}
            data-testid={`drop-database-${database.name}`}
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {isExpanded && (
        <div style={styles.collectionList} role="group">
          {isLoading ? (
            <>
              <div style={styles.skeleton} data-testid="collection-skeleton" />
              <div style={{ ...styles.skeleton, width: '60%' }} />
            </>
          ) : collections.length === 0 ? (
            <div style={styles.emptyCollections}>No collections</div>
          ) : (
            collections.map((collection) => {
              const statsKey = `${database.name}.${collection.name}`
              return (
                <CollectionItem
                  key={collection.name}
                  collection={collection}
                  database={database.name}
                  stats={collectionStats?.get(statsKey)}
                  isSelected={
                    isSelected && selectedCollection === collection.name
                  }
                  isLoadingStats={loadingStats?.has(statsKey)}
                  onClick={onCollectionSelect}
                  onDropCollection={onDropCollection}
                />
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export function CollectionTree({
  databases,
  collectionsByDatabase,
  collectionStats,
  databaseStats,
  selectedDatabase,
  selectedCollection,
  loadingDatabases,
  loadingStats,
  isLoading = false,
  onDatabaseToggle,
  onDatabaseSelect,
  onCollectionSelect,
  onDropDatabase,
  onDropCollection,
  onCreateCollection,
}: CollectionTreeProps) {
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(
    new Set(selectedDatabase ? [selectedDatabase] : [])
  )

  const handleDatabaseToggle = useCallback(
    (database: string, isExpanded: boolean) => {
      setExpandedDatabases((prev) => {
        const next = new Set(prev)
        if (isExpanded) {
          next.add(database)
        } else {
          next.delete(database)
        }
        return next
      })
      onDatabaseToggle?.(database, isExpanded)
    },
    [onDatabaseToggle]
  )

  // Sort databases alphabetically
  const sortedDatabases = useMemo(
    () => [...databases].sort((a, b) => a.name.localeCompare(b.name)),
    [databases]
  )

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading databases...</div>
      </div>
    )
  }

  if (databases.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>
          No databases found.
          <br />
          Create a database to get started.
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container} role="tree" aria-label="Database browser">
      {sortedDatabases.map((database) => {
        const collections = collectionsByDatabase.get(database.name) || []
        const isExpanded = expandedDatabases.has(database.name)
        const isDbLoading = loadingDatabases?.has(database.name)

        return (
          <DatabaseNode
            key={database.name}
            database={database}
            collections={collections}
            stats={databaseStats?.get(database.name)}
            collectionStats={collectionStats}
            isSelected={selectedDatabase === database.name}
            selectedCollection={selectedCollection}
            isLoading={isDbLoading}
            isExpanded={isExpanded}
            loadingStats={loadingStats}
            onToggle={handleDatabaseToggle}
            onSelect={onDatabaseSelect}
            onCollectionSelect={onCollectionSelect}
            onDropDatabase={onDropDatabase}
            onDropCollection={onDropCollection}
            onCreateCollection={onCreateCollection}
          />
        )
      })}
    </div>
  )
}

export default CollectionTree
