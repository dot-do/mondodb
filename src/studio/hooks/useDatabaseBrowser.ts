/**
 * useDatabaseBrowser Hook
 *
 * React hook for managing the database browser state and RPC operations.
 * Provides listDatabases, listCollections, and other database operations.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { RpcClient } from '../../rpc/rpc-client'
import type { DatabaseInfo, CollectionInfo, CollectionStats, DatabaseStats } from '../components/browser/types'

// ============================================================================
// Types
// ============================================================================

export interface UseDatabaseBrowserOptions {
  /**
   * RPC client instance for making API calls
   */
  rpcClient: RpcClient | null

  /**
   * RPC endpoint URL (used if rpcClient is not provided)
   */
  rpcUrl?: string

  /**
   * Auto-refresh interval in milliseconds (0 to disable)
   */
  autoRefreshInterval?: number

  /**
   * Initial selected database
   */
  initialDatabase?: string

  /**
   * Initial selected collection
   */
  initialCollection?: string

  /**
   * Called when a database is selected
   */
  onDatabaseSelect?: (database: string) => void

  /**
   * Called when a collection is selected
   */
  onCollectionSelect?: (database: string, collection: string) => void

  /**
   * Called on error
   */
  onError?: (error: Error) => void
}

export interface UseDatabaseBrowserReturn {
  /**
   * List of databases
   */
  databases: DatabaseInfo[]

  /**
   * Whether databases are loading
   */
  isLoading: boolean

  /**
   * Error message if loading failed
   */
  error: string | undefined

  /**
   * Currently selected database
   */
  selectedDatabase: string | undefined

  /**
   * Currently selected collection
   */
  selectedCollection: string | undefined

  /**
   * Fetch collections for a database
   */
  fetchCollections: (database: string) => Promise<CollectionInfo[]>

  /**
   * Fetch stats for a collection
   */
  fetchCollectionStats: (database: string, collection: string) => Promise<CollectionStats>

  /**
   * Fetch stats for a database
   */
  fetchDatabaseStats: (database: string) => Promise<DatabaseStats>

  /**
   * Refresh the database list
   */
  refresh: () => Promise<void>

  /**
   * Select a database
   */
  selectDatabase: (database: string) => void

  /**
   * Select a collection
   */
  selectCollection: (database: string, collection: string) => void

  /**
   * Create a new database
   */
  createDatabase: (database: string) => Promise<void>

  /**
   * Drop a database
   */
  dropDatabase: (database: string) => Promise<void>

  /**
   * Create a new collection
   */
  createCollection: (database: string, collection: string) => Promise<void>

  /**
   * Drop a collection
   */
  dropCollection: (database: string, collection: string) => Promise<void>
}

// ============================================================================
// RPC Helper Functions
// ============================================================================

/**
 * Makes an RPC call to the endpoint
 */
async function rpcCall<T>(
  rpcUrl: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method,
      ...params,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(errorData.error || `RPC call failed with status ${response.status}`)
  }

  const data = await response.json() as { ok: 1; result: T }
  return data.result
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useDatabaseBrowser(options: UseDatabaseBrowserOptions): UseDatabaseBrowserReturn {
  const {
    rpcClient,
    rpcUrl = '/rpc',
    autoRefreshInterval = 0,
    initialDatabase,
    initialCollection,
    onDatabaseSelect,
    onCollectionSelect,
    onError,
  } = options

  // State
  const [databases, setDatabases] = useState<DatabaseInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()
  const [selectedDatabase, setSelectedDatabase] = useState<string | undefined>(initialDatabase)
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>(initialCollection)

  // Refs for caching
  const collectionsCache = useRef<Map<string, CollectionInfo[]>>(new Map())
  const statsCache = useRef<Map<string, CollectionStats>>(new Map())
  const dbStatsCache = useRef<Map<string, DatabaseStats>>(new Map())
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /**
   * Make an RPC call using client or URL
   */
  const callRpc = useCallback(async <T>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> => {
    if (rpcClient) {
      return rpcClient.call(method, [params]) as Promise<T>
    }
    return rpcCall<T>(rpcUrl, method, params)
  }, [rpcClient, rpcUrl])

  /**
   * Fetch databases from RPC
   */
  const fetchDatabases = useCallback(async (): Promise<DatabaseInfo[]> => {
    try {
      const result = await callRpc<{ databases: DatabaseInfo[] }>('listDatabases')
      return result.databases || []
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to fetch databases')
    }
  }, [callRpc])

  /**
   * Refresh database list
   */
  const refresh = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true)
      setError(undefined)

      // Clear caches
      collectionsCache.current.clear()
      statsCache.current.clear()
      dbStatsCache.current.clear()

      const dbs = await fetchDatabases()
      setDatabases(dbs)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load databases'
      setError(errorMessage)
      onError?.(err instanceof Error ? err : new Error(errorMessage))
    } finally {
      setIsLoading(false)
    }
  }, [fetchDatabases, onError])

  /**
   * Fetch collections for a database
   */
  const fetchCollections = useCallback(async (database: string): Promise<CollectionInfo[]> => {
    // Check cache first
    if (collectionsCache.current.has(database)) {
      return collectionsCache.current.get(database)!
    }

    try {
      const result = await callRpc<{ collections: CollectionInfo[] }>('listCollections', { db: database })
      const collections = result.collections || []

      // Cache the result
      collectionsCache.current.set(database, collections)

      return collections
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to fetch collections')
    }
  }, [callRpc])

  /**
   * Fetch stats for a collection
   */
  const fetchCollectionStats = useCallback(async (
    database: string,
    collection: string
  ): Promise<CollectionStats> => {
    const cacheKey = `${database}.${collection}`

    // Check cache first
    if (statsCache.current.has(cacheKey)) {
      return statsCache.current.get(cacheKey)!
    }

    try {
      const result = await callRpc<CollectionStats>('collStats', {
        db: database,
        collection,
      })

      // Cache the result
      statsCache.current.set(cacheKey, result)

      return result
    } catch (err) {
      // Return default stats if error
      return {
        name: collection,
        count: 0,
        size: 0,
      }
    }
  }, [callRpc])

  /**
   * Fetch stats for a database
   */
  const fetchDatabaseStats = useCallback(async (database: string): Promise<DatabaseStats> => {
    // Check cache first
    if (dbStatsCache.current.has(database)) {
      return dbStatsCache.current.get(database)!
    }

    try {
      const result = await callRpc<DatabaseStats>('dbStats', { db: database })

      // Cache the result
      dbStatsCache.current.set(database, result)

      return result
    } catch (err) {
      // Return default stats if error
      return {
        name: database,
        collections: 0,
        objects: 0,
        dataSize: 0,
      }
    }
  }, [callRpc])

  /**
   * Select a database
   */
  const selectDatabase = useCallback((database: string): void => {
    setSelectedDatabase(database)
    onDatabaseSelect?.(database)
  }, [onDatabaseSelect])

  /**
   * Select a collection
   */
  const selectCollection = useCallback((database: string, collection: string): void => {
    setSelectedDatabase(database)
    setSelectedCollection(collection)
    onCollectionSelect?.(database, collection)
  }, [onCollectionSelect])

  /**
   * Create a new database
   */
  const createDatabase = useCallback(async (database: string): Promise<void> => {
    try {
      // Creating a database typically requires creating a collection first
      await callRpc('createCollection', { db: database, collection: '_init' })

      // Refresh database list
      await refresh()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create database'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [callRpc, refresh])

  /**
   * Drop a database
   */
  const dropDatabase = useCallback(async (database: string): Promise<void> => {
    try {
      await callRpc('dropDatabase', { db: database })

      // Remove from local state
      setDatabases((prev) => prev.filter((db) => db.name !== database))

      // Clear caches for this database
      collectionsCache.current.delete(database)
      dbStatsCache.current.delete(database)

      // Clear stats cache entries for this database
      for (const key of statsCache.current.keys()) {
        if (key.startsWith(`${database}.`)) {
          statsCache.current.delete(key)
        }
      }

      // Clear selection if this was selected
      if (selectedDatabase === database) {
        setSelectedDatabase(undefined)
        setSelectedCollection(undefined)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to drop database'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [callRpc, selectedDatabase])

  /**
   * Create a new collection
   */
  const createCollection = useCallback(async (
    database: string,
    collection: string
  ): Promise<void> => {
    try {
      await callRpc('createCollection', { db: database, collection })

      // Invalidate cache for this database
      collectionsCache.current.delete(database)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create collection'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [callRpc])

  /**
   * Drop a collection
   */
  const dropCollection = useCallback(async (
    database: string,
    collection: string
  ): Promise<void> => {
    try {
      await callRpc('dropCollection', { db: database, collection })

      // Invalidate caches
      collectionsCache.current.delete(database)
      statsCache.current.delete(`${database}.${collection}`)

      // Clear selection if this was selected
      if (selectedDatabase === database && selectedCollection === collection) {
        setSelectedCollection(undefined)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to drop collection'
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [callRpc, selectedDatabase, selectedCollection])

  // Initial load
  useEffect(() => {
    refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (autoRefreshInterval > 0) {
      refreshIntervalRef.current = setInterval(() => {
        refresh()
      }, autoRefreshInterval)

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current)
        }
      }
    }
  }, [autoRefreshInterval, refresh])

  return {
    databases,
    isLoading,
    error,
    selectedDatabase,
    selectedCollection,
    fetchCollections,
    fetchCollectionStats,
    fetchDatabaseStats,
    refresh,
    selectDatabase,
    selectCollection,
    createDatabase,
    dropDatabase,
    createCollection,
    dropCollection,
  }
}

export default useDatabaseBrowser
