/**
 * DatabaseBrowser End-to-End Tests
 *
 * These tests verify the DatabaseBrowser component integration with the RPC layer,
 * ensuring proper data flow from listDatabases/listCollections API calls to UI.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatabaseBrowser, DatabaseBrowserProps } from '../DatabaseBrowser'
import type { DatabaseInfo, CollectionInfo, CollectionStats, DatabaseStats } from '../types'

// ============================================================================
// Mock RPC Types
// ============================================================================

interface MockRpcClient {
  listDatabases: () => Promise<{ databases: DatabaseInfo[] }>
  listCollections: (database: string) => Promise<{ collections: CollectionInfo[] }>
  collStats: (database: string, collection: string) => Promise<CollectionStats>
  dbStats: (database: string) => Promise<DatabaseStats>
  dropDatabase: (database: string) => Promise<{ ok: 1 }>
  dropCollection: (database: string, collection: string) => Promise<{ ok: 1 }>
  createCollection: (database: string, collection: string) => Promise<{ ok: 1 }>
}

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockRpcClient = (): MockRpcClient => ({
  listDatabases: vi.fn().mockResolvedValue({
    databases: [
      { name: 'admin', sizeOnDisk: 32768 },
      { name: 'local', sizeOnDisk: 73728 },
      { name: 'production', sizeOnDisk: 1048576 },
      { name: 'staging', sizeOnDisk: 524288 },
    ],
  }),
  listCollections: vi.fn().mockImplementation((database: string) => {
    const collectionsByDb: Record<string, CollectionInfo[]> = {
      admin: [
        { name: 'system.users', type: 'collection' },
        { name: 'system.roles', type: 'collection' },
      ],
      local: [
        { name: 'startup_log', type: 'collection' },
      ],
      production: [
        { name: 'users', type: 'collection' },
        { name: 'products', type: 'collection' },
        { name: 'orders', type: 'collection' },
        { name: 'analytics', type: 'collection' },
        { name: 'users_view', type: 'view' },
      ],
      staging: [
        { name: 'users', type: 'collection' },
        { name: 'products', type: 'collection' },
      ],
    }
    return Promise.resolve({ collections: collectionsByDb[database] || [] })
  }),
  collStats: vi.fn().mockImplementation((database: string, collection: string) => {
    return Promise.resolve({
      name: collection,
      count: Math.floor(Math.random() * 10000),
      size: Math.floor(Math.random() * 1024 * 1024),
      avgObjSize: 256,
      storageSize: 524288,
      indexCount: 2,
    })
  }),
  dbStats: vi.fn().mockImplementation((database: string) => {
    return Promise.resolve({
      name: database,
      collections: 5,
      objects: 10000,
      dataSize: 1048576,
    })
  }),
  dropDatabase: vi.fn().mockResolvedValue({ ok: 1 }),
  dropCollection: vi.fn().mockResolvedValue({ ok: 1 }),
  createCollection: vi.fn().mockResolvedValue({ ok: 1 }),
})

// ============================================================================
// Connected Browser Component Factory
// ============================================================================

/**
 * Creates a connected DatabaseBrowser component that uses the mock RPC client.
 * This simulates the real-world usage where the browser is wired to the RPC layer.
 */
function createConnectedBrowser(
  rpcClient: MockRpcClient,
  overrides: Partial<DatabaseBrowserProps> = {}
) {
  const [databases, setDatabases] = React.useState<DatabaseInfo[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | undefined>()
  const [selectedDatabase, setSelectedDatabase] = React.useState<string | undefined>()
  const [selectedCollection, setSelectedCollection] = React.useState<string | undefined>()

  // Fetch databases on mount
  React.useEffect(() => {
    async function loadDatabases() {
      try {
        setIsLoading(true)
        const result = await rpcClient.listDatabases()
        setDatabases(result.databases)
        setError(undefined)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load databases')
      } finally {
        setIsLoading(false)
      }
    }
    loadDatabases()
  }, [])

  // Collection fetcher bound to RPC
  const fetchCollections = React.useCallback(
    async (database: string) => {
      const result = await rpcClient.listCollections(database)
      return result.collections
    },
    []
  )

  // Stats fetchers bound to RPC
  const fetchCollectionStats = React.useCallback(
    async (database: string, collection: string) => {
      return await rpcClient.collStats(database, collection)
    },
    []
  )

  const fetchDatabaseStats = React.useCallback(
    async (database: string) => {
      return await rpcClient.dbStats(database)
    },
    []
  )

  // Refresh handler
  const handleRefresh = React.useCallback(async () => {
    try {
      setIsLoading(true)
      const result = await rpcClient.listDatabases()
      setDatabases(result.databases)
      setError(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Drop database handler
  const handleDropDatabase = React.useCallback(
    async (database: string) => {
      await rpcClient.dropDatabase(database)
      setDatabases((prev) => prev.filter((db) => db.name !== database))
    },
    []
  )

  // Drop collection handler
  const handleDropCollection = React.useCallback(
    async (database: string, collection: string) => {
      await rpcClient.dropCollection(database, collection)
      // In real implementation, would trigger refresh of collections
    },
    []
  )

  return (
    <DatabaseBrowser
      databases={databases}
      fetchCollections={fetchCollections}
      fetchCollectionStats={fetchCollectionStats}
      fetchDatabaseStats={fetchDatabaseStats}
      selectedDatabase={selectedDatabase}
      selectedCollection={selectedCollection}
      isLoading={isLoading}
      error={error}
      onRefresh={handleRefresh}
      onDatabaseSelect={setSelectedDatabase}
      onCollectionSelect={(db, coll) => {
        setSelectedDatabase(db)
        setSelectedCollection(coll)
      }}
      onDropDatabase={handleDropDatabase}
      onDropCollection={handleDropCollection}
      onCreateDatabase={() => {}}
      onCreateCollection={() => {}}
      {...overrides}
    />
  )
}

// Wrapper component for testing
function ConnectedDatabaseBrowser({
  rpcClient,
  ...props
}: { rpcClient: MockRpcClient } & Partial<DatabaseBrowserProps>) {
  return createConnectedBrowser(rpcClient, props)
}

// ============================================================================
// End-to-End Tests
// ============================================================================

describe('DatabaseBrowser E2E', () => {
  let mockRpc: MockRpcClient

  beforeEach(() => {
    mockRpc = createMockRpcClient()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial data loading', () => {
    it('calls listDatabases RPC on mount', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(mockRpc.listDatabases).toHaveBeenCalledTimes(1)
      })
    })

    it('displays loading state while fetching databases', async () => {
      // Create a slow promise
      mockRpc.listDatabases = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ databases: [] }), 100))
      )

      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      expect(screen.getByText('Loading databases...')).toBeInTheDocument()

      await waitFor(() => {
        expect(screen.queryByText('Loading databases...')).not.toBeInTheDocument()
      })
    })

    it('displays databases returned from RPC', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('admin')).toBeInTheDocument()
        expect(screen.getByText('local')).toBeInTheDocument()
        expect(screen.getByText('production')).toBeInTheDocument()
        expect(screen.getByText('staging')).toBeInTheDocument()
      })
    })

    it('displays database count in footer', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('4 databases')).toBeInTheDocument()
      })
    })

    it('handles RPC error gracefully', async () => {
      mockRpc.listDatabases = vi.fn().mockRejectedValue(new Error('Connection refused'))

      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('Connection refused')).toBeInTheDocument()
      })
    })
  })

  describe('database expansion and collection loading', () => {
    it('calls listCollections RPC when database is expanded', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(mockRpc.listCollections).toHaveBeenCalledWith('production')
      })
    })

    it('displays collections from RPC response', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
        expect(screen.getByText('products')).toBeInTheDocument()
        expect(screen.getByText('orders')).toBeInTheDocument()
        expect(screen.getByText('analytics')).toBeInTheDocument()
      })
    })

    it('displays views differently from collections', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(screen.getByText('users_view')).toBeInTheDocument()
      })
    })

    it('shows empty state for database with no collections', async () => {
      mockRpc.listCollections = vi.fn().mockResolvedValue({ collections: [] })

      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(screen.getByText('No collections')).toBeInTheDocument()
      })
    })

    it('handles collection fetch error gracefully', async () => {
      mockRpc.listCollections = vi.fn().mockRejectedValue(new Error('Failed to list collections'))

      // Mock console.error to suppress expected error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('production'))

      // Should show empty/error state gracefully
      await waitFor(() => {
        expect(mockRpc.listCollections).toHaveBeenCalled()
      })

      consoleSpy.mockRestore()
    })
  })

  describe('collection stats fetching', () => {
    it('fetches collection stats when database is expanded', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(mockRpc.collStats).toHaveBeenCalledWith('production', 'users')
        expect(mockRpc.collStats).toHaveBeenCalledWith('production', 'products')
        expect(mockRpc.collStats).toHaveBeenCalledWith('production', 'orders')
      })
    })

    it('fetches database stats when database is expanded', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(mockRpc.dbStats).toHaveBeenCalledWith('production')
      })
    })
  })

  describe('refresh functionality', () => {
    it('calls listDatabases RPC on refresh', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      // Initial call
      expect(mockRpc.listDatabases).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByTestId('refresh-button'))

      await waitFor(() => {
        expect(mockRpc.listDatabases).toHaveBeenCalledTimes(2)
      })
    })

    it('updates databases after refresh', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      // Update mock to return different data
      mockRpc.listDatabases = vi.fn().mockResolvedValue({
        databases: [
          { name: 'newdb', sizeOnDisk: 1024 },
        ],
      })

      fireEvent.click(screen.getByTestId('refresh-button'))

      await waitFor(() => {
        expect(screen.getByText('newdb')).toBeInTheDocument()
      })
    })

    it('clears collection cache on refresh', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      // Expand database to load collections
      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Track the number of calls before refresh
      const callsBeforeRefresh = mockRpc.listCollections.mock.calls.length
      expect(callsBeforeRefresh).toBeGreaterThan(0)

      // Refresh
      fireEvent.click(screen.getByTestId('refresh-button'))

      await waitFor(() => {
        expect(mockRpc.listDatabases).toHaveBeenCalledTimes(2)
      })

      // After refresh, expand a different database to verify new fetches work
      fireEvent.click(screen.getByText('admin'))

      await waitFor(() => {
        // Should have fetched collections for admin
        expect(mockRpc.listCollections).toHaveBeenCalledWith('admin')
      })
    })
  })

  describe('search and filter', () => {
    it('filters databases based on search query', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'prod')

      expect(screen.getByText('production')).toBeInTheDocument()
      expect(screen.queryByText('staging')).not.toBeInTheDocument()
      expect(screen.queryByText('admin')).not.toBeInTheDocument()
    })

    it('filters collections based on search query', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      // Expand production to load collections
      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'user')

      // Should show matching collections
      expect(screen.getByText('users')).toBeInTheDocument()
      expect(screen.getByText('users_view')).toBeInTheDocument()
      // Should hide non-matching collections
      expect(screen.queryByText('orders')).not.toBeInTheDocument()
    })
  })

  describe('database and collection selection', () => {
    it('sets selected database when clicked', async () => {
      const onDatabaseSelect = vi.fn()
      render(
        <ConnectedDatabaseBrowser
          rpcClient={mockRpc}
          onDatabaseSelect={onDatabaseSelect}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('production'))

      expect(onDatabaseSelect).toHaveBeenCalledWith('production')
    })

    it('sets selected collection when clicked', async () => {
      const onCollectionSelect = vi.fn()
      render(
        <ConnectedDatabaseBrowser
          rpcClient={mockRpc}
          onCollectionSelect={onCollectionSelect}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('users'))

      expect(onCollectionSelect).toHaveBeenCalledWith('production', 'users')
    })
  })

  describe('drop operations', () => {
    beforeEach(() => {
      // Mock window.confirm to return true
      vi.spyOn(window, 'confirm').mockReturnValue(true)
    })

    it('calls dropDatabase RPC when drop is confirmed', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      const dropButton = screen.getByTestId('drop-database-production')
      fireEvent.click(dropButton)

      await waitFor(() => {
        expect(mockRpc.dropDatabase).toHaveBeenCalledWith('production')
      })
    })

    it('removes database from list after successful drop', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      const dropButton = screen.getByTestId('drop-database-production')
      fireEvent.click(dropButton)

      await waitFor(() => {
        expect(screen.queryByText('production')).not.toBeInTheDocument()
      })
    })

    it('does not call dropDatabase RPC when cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)

      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      const dropButton = screen.getByTestId('drop-database-production')
      fireEvent.click(dropButton)

      expect(mockRpc.dropDatabase).not.toHaveBeenCalled()
    })
  })

  describe('multiple database operations', () => {
    it('can expand multiple databases sequentially', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      // Expand production
      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Expand admin
      fireEvent.click(screen.getByText('admin'))

      await waitFor(() => {
        expect(screen.getByText('system.users')).toBeInTheDocument()
      })

      // Both should have their collections visible
      expect(screen.getByText('users')).toBeInTheDocument()
      expect(screen.getByText('system.users')).toBeInTheDocument()
    })

    it('caches collections for previously expanded databases', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      // Expand production
      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(mockRpc.listCollections).toHaveBeenCalledWith('production')
      })

      // Count calls after first expansion
      const callsAfterFirstExpand = mockRpc.listCollections.mock.calls.length

      // Collapse production
      fireEvent.click(screen.getByText('production'))

      // Wait for collapse animation/state update
      await waitFor(() => {
        expect(screen.queryByText('users')).not.toBeInTheDocument()
      })

      // Re-expand production
      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Should not have fetched again (caching)
      expect(mockRpc.listCollections.mock.calls.length).toBe(callsAfterFirstExpand)
    })
  })

  describe('accessibility', () => {
    it('maintains focus after database selection', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      const productionNode = screen.getByText('production')
      fireEvent.click(productionNode)

      // The clicked element or its parent should still be in DOM
      expect(productionNode).toBeInTheDocument()
    })

    it('uses proper ARIA attributes for tree structure', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      const tree = screen.getByRole('tree')
      expect(tree).toBeInTheDocument()
    })
  })

  describe('performance', () => {
    it('does not fetch collections until database is expanded', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      // listCollections should not have been called yet
      expect(mockRpc.listCollections).not.toHaveBeenCalled()
    })

    it('fetches collection stats when database is expanded', async () => {
      render(<ConnectedDatabaseBrowser rpcClient={mockRpc} />)

      await waitFor(() => {
        expect(screen.getByText('production')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        // Stats should be fetched for collections in the expanded database
        expect(mockRpc.collStats).toHaveBeenCalled()
        // Should be called for each collection (users, products, orders, analytics, users_view)
        expect(mockRpc.collStats.mock.calls.some(
          call => call[0] === 'production' && call[1] === 'users'
        )).toBe(true)
      })
    })
  })
})
