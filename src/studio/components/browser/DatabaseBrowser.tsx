/**
 * DatabaseBrowser - Main database/collection browser component
 *
 * A comprehensive browser component that displays:
 * - Search/filter input for databases and collections
 * - Refresh button to reload data
 * - Tree view showing databases -> collections hierarchy
 * - Create/drop database and collection actions
 * - Collection stats (document count, size)
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { CollectionTree } from './CollectionTree'
import type {
  DatabaseInfo,
  CollectionInfo,
  CollectionStats,
  DatabaseStats,
} from './types'

export interface DatabaseBrowserProps {
  /** List of databases */
  databases: DatabaseInfo[]
  /** Function to fetch collections for a database */
  fetchCollections: (database: string) => Promise<CollectionInfo[]>
  /** Function to fetch stats for a collection */
  fetchCollectionStats?: (
    database: string,
    collection: string
  ) => Promise<CollectionStats>
  /** Function to fetch stats for a database */
  fetchDatabaseStats?: (database: string) => Promise<DatabaseStats>
  /** Currently selected database */
  selectedDatabase?: string
  /** Currently selected collection */
  selectedCollection?: string
  /** Whether databases are loading */
  isLoading?: boolean
  /** Error message if loading failed */
  error?: string
  /** Called when refresh is requested */
  onRefresh?: () => void
  /** Called when a database is selected */
  onDatabaseSelect?: (database: string) => void
  /** Called when a collection is selected */
  onCollectionSelect?: (database: string, collection: string) => void
  /** Called when a collection is double-clicked to open */
  onCollectionOpen?: (database: string, collection: string) => void
  /** Called when create database is requested */
  onCreateDatabase?: () => void
  /** Called when drop database is requested */
  onDropDatabase?: (database: string) => void
  /** Called when create collection is requested */
  onCreateCollection?: (database: string) => void
  /** Called when drop collection is requested */
  onDropCollection?: (database: string, collection: string) => void
  /** Whether to show breadcrumb for selection */
  showBreadcrumb?: boolean
  /** Whether multi-select is enabled */
  multiSelectEnabled?: boolean
  /** Called when multiple items are selected */
  onMultiSelect?: (selections: Array<{ database: string; collection: string }>) => void
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: '#fff',
    borderRight: '1px solid #e8e8e8',
  },
  header: {
    padding: '12px',
    borderBottom: '1px solid #e8e8e8',
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  titleText: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#333',
  },
  headerActions: {
    display: 'flex',
    gap: '4px',
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#666',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease, color 0.15s ease',
  },
  iconButtonHover: {
    backgroundColor: '#e8e8e8',
    color: '#333',
  },
  iconButtonActive: {
    backgroundColor: '#016bf8',
    color: '#fff',
  },
  searchContainer: {
    position: 'relative' as const,
  },
  searchInput: {
    width: '100%',
    padding: '8px 32px 8px 32px',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    boxSizing: 'border-box' as const,
  },
  searchInputFocused: {
    borderColor: '#016bf8',
    boxShadow: '0 0 0 2px rgba(1, 107, 248, 0.15)',
  },
  searchIcon: {
    position: 'absolute' as const,
    left: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '14px',
    height: '14px',
    color: '#889397',
    pointerEvents: 'none' as const,
  },
  clearButton: {
    position: 'absolute' as const,
    right: '6px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '20px',
    height: '20px',
    padding: 0,
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    color: '#889397',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.15s ease',
  },
  clearButtonHover: {
    backgroundColor: '#e8e8e8',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 0',
  },
  error: {
    padding: '16px',
    margin: '8px 12px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    color: '#b91c1c',
    fontSize: '13px',
  },
  createDatabaseButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: 'calc(100% - 24px)',
    margin: '8px 12px',
    padding: '10px 12px',
    border: '1px dashed #d0d0d0',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#666',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease',
  },
  createDatabaseButtonHover: {
    borderColor: '#016bf8',
    color: '#016bf8',
    backgroundColor: '#f8fafc',
  },
  footer: {
    padding: '12px',
    borderTop: '1px solid #e8e8e8',
    fontSize: '12px',
    color: '#889397',
    textAlign: 'center' as const,
  },
  spinAnimation: {
    animation: 'spin 1s linear infinite',
  },
}

/** Search/magnifying glass icon */
function SearchIcon() {
  return (
    <svg
      style={styles.searchIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l3.5 3.5" />
    </svg>
  )
}

/** X/clear icon */
function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Refresh icon */
function RefreshIcon({ isSpinning }: { isSpinning?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      style={isSpinning ? styles.spinAnimation : undefined}
    >
      <path d="M2 8a6 6 0 0 1 10.5-4" />
      <path d="M14 8a6 6 0 0 1-10.5 4" />
      <path d="M12.5 2v2.5H10" />
      <path d="M3.5 14v-2.5H6" />
    </svg>
  )
}

/** Plus icon */
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Collapse all icon */
function CollapseAllIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h12M2 8h8M2 12h4" />
    </svg>
  )
}

export function DatabaseBrowser({
  databases,
  fetchCollections,
  fetchCollectionStats,
  fetchDatabaseStats,
  selectedDatabase,
  selectedCollection,
  isLoading = false,
  error,
  onRefresh,
  onDatabaseSelect,
  onCollectionSelect,
  onCollectionOpen,
  onCreateDatabase,
  onDropDatabase,
  onCreateCollection,
  onDropCollection,
  showBreadcrumb,
  multiSelectEnabled,
  onMultiSelect,
}: DatabaseBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [isRefreshHovered, setIsRefreshHovered] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCreateHovered, setIsCreateHovered] = useState(false)
  const [isClearHovered, setIsClearHovered] = useState(false)
  const [isCollapseAllHovered, setIsCollapseAllHovered] = useState(false)

  // Expanded databases state
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(
    new Set(selectedDatabase ? [selectedDatabase] : [])
  )

  // Multi-select state
  const [multiSelectedItems, setMultiSelectedItems] = useState<
    Array<{ database: string; collection: string }>
  >([])

  // Collections cache
  const [collectionsByDatabase, setCollectionsByDatabase] = useState<
    Map<string, CollectionInfo[]>
  >(new Map())
  const [loadingDatabases, setLoadingDatabases] = useState<Set<string>>(
    new Set()
  )

  // Stats cache
  const [collectionStats, setCollectionStats] = useState<
    Map<string, CollectionStats>
  >(new Map())
  const [databaseStats, setDatabaseStats] = useState<Map<string, DatabaseStats>>(
    new Map()
  )
  const [loadingStats, setLoadingStats] = useState<Set<string>>(new Set())

  // Load collections when a database is expanded
  const handleDatabaseToggle = useCallback(
    async (database: string, isExpanded: boolean) => {
      if (isExpanded && !collectionsByDatabase.has(database)) {
        setLoadingDatabases((prev) => new Set(prev).add(database))
        try {
          const collections = await fetchCollections(database)
          setCollectionsByDatabase((prev) => {
            const next = new Map(prev)
            next.set(database, collections)
            return next
          })

          // Fetch stats for each collection if available
          if (fetchCollectionStats) {
            for (const collection of collections) {
              const statsKey = `${database}.${collection.name}`
              setLoadingStats((prev) => new Set(prev).add(statsKey))
              try {
                const stats = await fetchCollectionStats(
                  database,
                  collection.name
                )
                setCollectionStats((prev) => {
                  const next = new Map(prev)
                  next.set(statsKey, stats)
                  return next
                })
              } catch (e) {
                console.error(`Failed to fetch stats for ${statsKey}:`, e)
              } finally {
                setLoadingStats((prev) => {
                  const next = new Set(prev)
                  next.delete(statsKey)
                  return next
                })
              }
            }
          }

          // Fetch database stats if available
          if (fetchDatabaseStats) {
            try {
              const stats = await fetchDatabaseStats(database)
              setDatabaseStats((prev) => {
                const next = new Map(prev)
                next.set(database, stats)
                return next
              })
            } catch (e) {
              console.error(`Failed to fetch database stats for ${database}:`, e)
            }
          }
        } catch (e) {
          console.error(`Failed to fetch collections for ${database}:`, e)
        } finally {
          setLoadingDatabases((prev) => {
            const next = new Set(prev)
            next.delete(database)
            return next
          })
        }
      }
    },
    [fetchCollections, fetchCollectionStats, fetchDatabaseStats, collectionsByDatabase]
  )

  // Filter databases and collections based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return { databases, collectionsByDatabase }
    }

    const query = searchQuery.toLowerCase()
    const filteredDatabases: DatabaseInfo[] = []
    const filteredCollections = new Map<string, CollectionInfo[]>()

    for (const db of databases) {
      const dbMatches = db.name.toLowerCase().includes(query)
      const collections = collectionsByDatabase.get(db.name) || []
      const matchingCollections = collections.filter((c) =>
        c.name.toLowerCase().includes(query)
      )

      if (dbMatches || matchingCollections.length > 0) {
        filteredDatabases.push(db)
        // If db matches, show all collections; otherwise show only matching
        filteredCollections.set(
          db.name,
          dbMatches ? collections : matchingCollections
        )
      }
    }

    return { databases: filteredDatabases, collectionsByDatabase: filteredCollections }
  }, [databases, collectionsByDatabase, searchQuery])

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    setCollectionsByDatabase(new Map())
    setCollectionStats(new Map())
    setDatabaseStats(new Map())
    setExpandedDatabases(new Set())
    onRefresh?.()
    // Give visual feedback for at least 500ms
    setTimeout(() => setIsRefreshing(false), 500)
  }, [onRefresh])

  // Handle search clear
  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  // Handle collapse all
  const handleCollapseAll = useCallback(() => {
    setExpandedDatabases(new Set())
  }, [])

  // Handle multi-select
  const handleMultiSelect = useCallback(
    (selections: Array<{ database: string; collection: string }>) => {
      setMultiSelectedItems(selections)
      onMultiSelect?.(selections)
    },
    [onMultiSelect]
  )

  // Auto-expand selected database on mount
  useEffect(() => {
    if (selectedDatabase && !collectionsByDatabase.has(selectedDatabase)) {
      handleDatabaseToggle(selectedDatabase, true)
    }
  }, [selectedDatabase, collectionsByDatabase, handleDatabaseToggle])

  // Scroll selected collection into view
  useEffect(() => {
    if (selectedDatabase && selectedCollection && collectionsByDatabase.has(selectedDatabase)) {
      // Use requestAnimationFrame to wait for DOM update
      requestAnimationFrame(() => {
        const selectedElement = document.querySelector(
          `[data-testid="collection-item-${selectedCollection}"]`
        )
        if (selectedElement && typeof selectedElement.scrollIntoView === 'function') {
          selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      })
    }
  }, [selectedDatabase, selectedCollection, collectionsByDatabase])

  return (
    <div style={styles.container} data-testid="database-browser">
      <div style={styles.header}>
        <div style={styles.title}>
          <span style={styles.titleText}>Databases</span>
          <div style={styles.headerActions}>
            <button
              style={{
                ...styles.iconButton,
                ...(isCollapseAllHovered ? styles.iconButtonHover : {}),
              }}
              onClick={handleCollapseAll}
              onMouseEnter={() => setIsCollapseAllHovered(true)}
              onMouseLeave={() => setIsCollapseAllHovered(false)}
              title="Collapse all"
              aria-label="Collapse all databases"
              data-testid="collapse-all-button"
            >
              <CollapseAllIcon />
            </button>
            <button
              style={{
                ...styles.iconButton,
                ...(isRefreshHovered ? styles.iconButtonHover : {}),
              }}
              onClick={handleRefresh}
              onMouseEnter={() => setIsRefreshHovered(true)}
              onMouseLeave={() => setIsRefreshHovered(false)}
              title="Refresh"
              aria-label="Refresh databases"
              data-testid="refresh-button"
              disabled={isRefreshing}
            >
              <RefreshIcon isSpinning={isRefreshing || isLoading} />
            </button>
          </div>
        </div>

        <div style={styles.searchContainer}>
          <SearchIcon />
          <input
            type="text"
            placeholder="Search databases and collections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            style={{
              ...styles.searchInput,
              ...(isSearchFocused ? styles.searchInputFocused : {}),
            }}
            aria-label="Search databases and collections"
            data-testid="search-input"
          />
          {searchQuery && (
            <button
              style={{
                ...styles.clearButton,
                ...(isClearHovered ? styles.clearButtonHover : {}),
              }}
              onClick={handleClearSearch}
              onMouseEnter={() => setIsClearHovered(true)}
              onMouseLeave={() => setIsClearHovered(false)}
              title="Clear search"
              aria-label="Clear search"
              data-testid="clear-search"
            >
              <ClearIcon />
            </button>
          )}
        </div>
      </div>

      <div style={styles.content}>
        {error && (
          <div style={styles.error} role="alert" data-testid="error-message">
            {error}
          </div>
        )}

        {showBreadcrumb && selectedDatabase && selectedCollection && (
          <div
            style={{
              padding: '8px 12px',
              fontSize: '12px',
              color: '#666',
              borderBottom: '1px solid #e8e8e8',
            }}
            data-testid="selection-breadcrumb"
          >
            {selectedDatabase} &gt; {selectedCollection}
          </div>
        )}

        <CollectionTree
          databases={filteredData.databases}
          collectionsByDatabase={filteredData.collectionsByDatabase}
          collectionStats={collectionStats}
          databaseStats={databaseStats}
          selectedDatabase={selectedDatabase}
          selectedCollection={selectedCollection}
          loadingDatabases={loadingDatabases}
          loadingStats={loadingStats}
          isLoading={isLoading}
          onDatabaseToggle={handleDatabaseToggle}
          onDatabaseSelect={onDatabaseSelect}
          onCollectionSelect={onCollectionSelect}
          onDropDatabase={onDropDatabase}
          onDropCollection={onDropCollection}
          onCreateCollection={onCreateCollection}
          onCollectionOpen={onCollectionOpen}
          onMultiSelect={handleMultiSelect}
          multiSelectEnabled={multiSelectEnabled}
          expandedDatabases={expandedDatabases}
          setExpandedDatabases={setExpandedDatabases}
          multiSelectedItems={multiSelectedItems}
        />

        {onCreateDatabase && (
          <button
            style={{
              ...styles.createDatabaseButton,
              ...(isCreateHovered ? styles.createDatabaseButtonHover : {}),
            }}
            onClick={onCreateDatabase}
            onMouseEnter={() => setIsCreateHovered(true)}
            onMouseLeave={() => setIsCreateHovered(false)}
            data-testid="create-database-button"
          >
            <PlusIcon />
            <span>Create Database</span>
          </button>
        )}
      </div>

      <div style={styles.footer}>
        {filteredData.databases.length} database
        {filteredData.databases.length !== 1 ? 's' : ''}
        {searchQuery && ` (filtered)`}
      </div>
    </div>
  )
}

export default DatabaseBrowser
