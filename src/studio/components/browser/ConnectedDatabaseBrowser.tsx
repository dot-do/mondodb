/**
 * ConnectedDatabaseBrowser - DatabaseBrowser wired to RPC layer
 *
 * This component connects the DatabaseBrowser to the RPC layer using
 * the useDatabaseBrowser hook for listDatabases/listCollections operations.
 */

import React, { useCallback, useState } from 'react'
import { DatabaseBrowser, type DatabaseBrowserProps } from './DatabaseBrowser'
import { useDatabaseBrowser, type UseDatabaseBrowserOptions } from '../../hooks/useDatabaseBrowser'
import type { RpcClient } from '../../../rpc/rpc-client'

// ============================================================================
// Types
// ============================================================================

export interface ConnectedDatabaseBrowserProps {
  /**
   * RPC client instance for making API calls
   */
  rpcClient?: RpcClient | null

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

  /**
   * Custom class name
   */
  className?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * Database browser connected to the RPC layer
 */
export function ConnectedDatabaseBrowser({
  rpcClient = null,
  rpcUrl = '/rpc',
  autoRefreshInterval = 0,
  initialDatabase,
  initialCollection,
  onDatabaseSelect,
  onCollectionSelect,
  onError,
  className,
}: ConnectedDatabaseBrowserProps): React.ReactElement {
  // Modal states for create dialogs
  const [showCreateDatabase, setShowCreateDatabase] = useState(false)
  const [showCreateCollection, setShowCreateCollection] = useState<string | null>(null)
  const [newDatabaseName, setNewDatabaseName] = useState('')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Use the database browser hook
  const {
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
  } = useDatabaseBrowser({
    rpcClient,
    rpcUrl,
    autoRefreshInterval,
    initialDatabase,
    initialCollection,
    onDatabaseSelect,
    onCollectionSelect,
    onError,
  })

  /**
   * Handle create database button click
   */
  const handleCreateDatabase = useCallback(() => {
    setShowCreateDatabase(true)
    setNewDatabaseName('')
  }, [])

  /**
   * Handle create collection button click
   */
  const handleCreateCollection = useCallback((database: string) => {
    setShowCreateCollection(database)
    setNewCollectionName('')
  }, [])

  /**
   * Handle create database submit
   */
  const handleCreateDatabaseSubmit = useCallback(async () => {
    if (!newDatabaseName.trim()) return

    setIsCreating(true)
    try {
      await createDatabase(newDatabaseName.trim())
      setShowCreateDatabase(false)
      setNewDatabaseName('')
    } catch (err) {
      // Error is handled in the hook
    } finally {
      setIsCreating(false)
    }
  }, [newDatabaseName, createDatabase])

  /**
   * Handle create collection submit
   */
  const handleCreateCollectionSubmit = useCallback(async () => {
    if (!showCreateCollection || !newCollectionName.trim()) return

    setIsCreating(true)
    try {
      await createCollection(showCreateCollection, newCollectionName.trim())
      setShowCreateCollection(null)
      setNewCollectionName('')
    } catch (err) {
      // Error is handled in the hook
    } finally {
      setIsCreating(false)
    }
  }, [showCreateCollection, newCollectionName, createCollection])

  /**
   * Handle drop database with confirmation
   */
  const handleDropDatabase = useCallback(
    async (database: string) => {
      // Confirmation is handled in the CollectionTree component
      await dropDatabase(database)
    },
    [dropDatabase]
  )

  /**
   * Handle drop collection with confirmation
   */
  const handleDropCollection = useCallback(
    async (database: string, collection: string) => {
      // Confirmation is handled in the CollectionItem component
      await dropCollection(database, collection)
    },
    [dropCollection]
  )

  // Simple modal styles
  const modalStyles = {
    overlay: {
      position: 'fixed' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    modal: {
      backgroundColor: '#fff',
      borderRadius: '8px',
      padding: '24px',
      minWidth: '320px',
      maxWidth: '400px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
    },
    title: {
      fontSize: '16px',
      fontWeight: 600,
      marginBottom: '16px',
      color: '#333',
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid #ddd',
      borderRadius: '6px',
      fontSize: '14px',
      marginBottom: '16px',
      boxSizing: 'border-box' as const,
    },
    buttons: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '8px',
    },
    button: {
      padding: '8px 16px',
      borderRadius: '6px',
      fontSize: '14px',
      cursor: 'pointer',
      border: '1px solid #ddd',
      backgroundColor: '#fff',
      color: '#333',
    },
    primaryButton: {
      padding: '8px 16px',
      borderRadius: '6px',
      fontSize: '14px',
      cursor: 'pointer',
      border: 'none',
      backgroundColor: '#016bf8',
      color: '#fff',
    },
  }

  return (
    <div className={className}>
      <DatabaseBrowser
        databases={databases}
        fetchCollections={fetchCollections}
        fetchCollectionStats={fetchCollectionStats}
        fetchDatabaseStats={fetchDatabaseStats}
        selectedDatabase={selectedDatabase}
        selectedCollection={selectedCollection}
        isLoading={isLoading}
        error={error}
        onRefresh={refresh}
        onDatabaseSelect={selectDatabase}
        onCollectionSelect={selectCollection}
        onCreateDatabase={handleCreateDatabase}
        onDropDatabase={handleDropDatabase}
        onCreateCollection={handleCreateCollection}
        onDropCollection={handleDropCollection}
      />

      {/* Create Database Modal */}
      {showCreateDatabase && (
        <div
          style={modalStyles.overlay}
          onClick={() => setShowCreateDatabase(false)}
          data-testid="create-database-modal"
        >
          <div
            style={modalStyles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalStyles.title}>Create Database</div>
            <input
              type="text"
              placeholder="Database name"
              value={newDatabaseName}
              onChange={(e) => setNewDatabaseName(e.target.value)}
              style={modalStyles.input}
              autoFocus
              data-testid="new-database-name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateDatabaseSubmit()
                } else if (e.key === 'Escape') {
                  setShowCreateDatabase(false)
                }
              }}
            />
            <div style={modalStyles.buttons}>
              <button
                style={modalStyles.button}
                onClick={() => setShowCreateDatabase(false)}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                style={{
                  ...modalStyles.primaryButton,
                  opacity: isCreating || !newDatabaseName.trim() ? 0.6 : 1,
                }}
                onClick={handleCreateDatabaseSubmit}
                disabled={isCreating || !newDatabaseName.trim()}
                data-testid="submit-create-database"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Collection Modal */}
      {showCreateCollection && (
        <div
          style={modalStyles.overlay}
          onClick={() => setShowCreateCollection(null)}
          data-testid="create-collection-modal"
        >
          <div
            style={modalStyles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalStyles.title}>
              Create Collection in "{showCreateCollection}"
            </div>
            <input
              type="text"
              placeholder="Collection name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              style={modalStyles.input}
              autoFocus
              data-testid="new-collection-name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateCollectionSubmit()
                } else if (e.key === 'Escape') {
                  setShowCreateCollection(null)
                }
              }}
            />
            <div style={modalStyles.buttons}>
              <button
                style={modalStyles.button}
                onClick={() => setShowCreateCollection(null)}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                style={{
                  ...modalStyles.primaryButton,
                  opacity: isCreating || !newCollectionName.trim() ? 0.6 : 1,
                }}
                onClick={handleCreateCollectionSubmit}
                disabled={isCreating || !newCollectionName.trim()}
                data-testid="submit-create-collection"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConnectedDatabaseBrowser
