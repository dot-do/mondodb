/**
 * DatabaseBrowser Component Tests
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatabaseBrowser } from '../DatabaseBrowser'
import type { DatabaseInfo, CollectionInfo, CollectionStats } from '../types'

describe('DatabaseBrowser', () => {
  const mockDatabases: DatabaseInfo[] = [
    { name: 'testdb', sizeOnDisk: 1024000 },
    { name: 'production', sizeOnDisk: 2048000 },
    { name: 'analytics', sizeOnDisk: 512000 },
  ]

  const mockCollections: CollectionInfo[] = [
    { name: 'users', type: 'collection' },
    { name: 'products', type: 'collection' },
    { name: 'orders', type: 'collection' },
  ]

  const mockFetchCollections = vi.fn().mockResolvedValue(mockCollections)

  const mockFetchCollectionStats = vi.fn().mockImplementation(
    (db: string, coll: string): Promise<CollectionStats> =>
      Promise.resolve({
        name: coll,
        count: 1000,
        size: 51200,
      })
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the browser container', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )
      expect(screen.getByTestId('database-browser')).toBeInTheDocument()
    })

    it('renders the header with title', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )
      expect(screen.getByText('Databases')).toBeInTheDocument()
    })

    it('renders search input', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )
      expect(screen.getByPlaceholderText(/Search databases/)).toBeInTheDocument()
    })

    it('renders refresh button', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )
      expect(screen.getByTestId('refresh-button')).toBeInTheDocument()
    })

    it('renders create database button when callback provided', () => {
      const onCreateDatabase = vi.fn()
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onCreateDatabase={onCreateDatabase}
        />
      )
      expect(screen.getByTestId('create-database-button')).toBeInTheDocument()
    })

    it('does not render create database button when callback not provided', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )
      expect(screen.queryByTestId('create-database-button')).not.toBeInTheDocument()
    })

    it('renders database count in footer', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )
      expect(screen.getByText('3 databases')).toBeInTheDocument()
    })

    it('renders singular form for single database', () => {
      render(
        <DatabaseBrowser
          databases={[mockDatabases[0]]}
          fetchCollections={mockFetchCollections}
        />
      )
      expect(screen.getByText('1 database')).toBeInTheDocument()
    })

    it('renders error message when error prop is set', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          error="Failed to connect to database"
        />
      )
      expect(screen.getByText('Failed to connect to database')).toBeInTheDocument()
    })

    it('renders loading state', () => {
      render(
        <DatabaseBrowser
          databases={[]}
          fetchCollections={mockFetchCollections}
          isLoading={true}
        />
      )
      expect(screen.getByText('Loading databases...')).toBeInTheDocument()
    })
  })

  describe('search functionality', () => {
    it('filters databases by name', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'test')

      expect(screen.getByText('testdb')).toBeInTheDocument()
      expect(screen.queryByText('production')).not.toBeInTheDocument()
      expect(screen.queryByText('analytics')).not.toBeInTheDocument()
    })

    it('shows filtered count in footer', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'test')

      expect(screen.getByText(/1 database.*filtered/)).toBeInTheDocument()
    })

    it('clears search when clear button is clicked', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'test')

      const clearButton = screen.getByTestId('clear-search')
      fireEvent.click(clearButton)

      expect(searchInput).toHaveValue('')
      expect(screen.getByText('3 databases')).toBeInTheDocument()
    })

    it('clear button is only visible when search has value', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      expect(screen.queryByTestId('clear-search')).not.toBeInTheDocument()

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'test')

      expect(screen.getByTestId('clear-search')).toBeInTheDocument()
    })

    it('search is case-insensitive', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      const searchInput = screen.getByTestId('search-input')
      await userEvent.type(searchInput, 'TEST')

      expect(screen.getByText('testdb')).toBeInTheDocument()
    })
  })

  describe('refresh functionality', () => {
    it('calls onRefresh when refresh button is clicked', async () => {
      const onRefresh = vi.fn()
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onRefresh={onRefresh}
        />
      )

      fireEvent.click(screen.getByTestId('refresh-button'))
      expect(onRefresh).toHaveBeenCalled()
    })

    it('clears cached collections on refresh', async () => {
      const onRefresh = vi.fn()
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onRefresh={onRefresh}
        />
      )

      // First expand a database to load collections
      fireEvent.click(screen.getByText('testdb'))
      await waitFor(() => {
        expect(mockFetchCollections).toHaveBeenCalledWith('testdb')
      })

      mockFetchCollections.mockClear()

      // Click refresh
      fireEvent.click(screen.getByTestId('refresh-button'))

      // Expand database again - should fetch again
      fireEvent.click(screen.getByText('testdb'))
      fireEvent.click(screen.getByText('testdb')) // Toggle twice to re-expand

      await waitFor(() => {
        expect(mockFetchCollections).toHaveBeenCalledWith('testdb')
      })
    })
  })

  describe('database interactions', () => {
    it('calls onDatabaseSelect when database is selected', () => {
      const onDatabaseSelect = vi.fn()
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onDatabaseSelect={onDatabaseSelect}
        />
      )

      fireEvent.click(screen.getByText('testdb'))
      expect(onDatabaseSelect).toHaveBeenCalledWith('testdb')
    })

    it('fetches collections when database is expanded', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(mockFetchCollections).toHaveBeenCalledWith('testdb')
      })
    })

    it('caches collections and does not refetch on re-expand', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      // Expand
      fireEvent.click(screen.getByText('testdb'))
      await waitFor(() => {
        expect(mockFetchCollections).toHaveBeenCalledTimes(1)
      })

      // Collapse
      fireEvent.click(screen.getByText('testdb'))

      // Re-expand
      fireEvent.click(screen.getByText('testdb'))

      // Should not fetch again
      expect(mockFetchCollections).toHaveBeenCalledTimes(1)
    })

    it('calls onCreateDatabase when create button is clicked', () => {
      const onCreateDatabase = vi.fn()
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onCreateDatabase={onCreateDatabase}
        />
      )

      fireEvent.click(screen.getByTestId('create-database-button'))
      expect(onCreateDatabase).toHaveBeenCalled()
    })

    it('calls onDropDatabase when drop is requested', () => {
      const onDropDatabase = vi.fn()
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onDropDatabase={onDropDatabase}
        />
      )

      const dropButton = screen.getByTestId('drop-database-testdb')
      fireEvent.click(dropButton)
      expect(onDropDatabase).toHaveBeenCalledWith('testdb')
    })
  })

  describe('collection interactions', () => {
    it('calls onCollectionSelect when collection is selected', async () => {
      const onCollectionSelect = vi.fn()
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onCollectionSelect={onCollectionSelect}
        />
      )

      // Expand database
      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('users'))
      expect(onCollectionSelect).toHaveBeenCalledWith('testdb', 'users')
    })

    it('calls onCreateCollection when create collection is requested', async () => {
      const onCreateCollection = vi.fn()
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onCreateCollection={onCreateCollection}
        />
      )

      const createButton = screen.getByTestId('create-collection-testdb')
      fireEvent.click(createButton)
      expect(onCreateCollection).toHaveBeenCalledWith('testdb')
    })

    it('calls onDropCollection when drop collection is requested', async () => {
      const onDropCollection = vi.fn()
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onDropCollection={onDropCollection}
        />
      )

      // Expand database
      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      const dropButton = screen.getByTestId('drop-collection-users')
      fireEvent.click(dropButton)
      expect(onDropCollection).toHaveBeenCalledWith('testdb', 'users')
    })
  })

  describe('stats fetching', () => {
    it('fetches collection stats when database is expanded', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          fetchCollectionStats={mockFetchCollectionStats}
        />
      )

      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(mockFetchCollectionStats).toHaveBeenCalledWith('testdb', 'users')
        expect(mockFetchCollectionStats).toHaveBeenCalledWith('testdb', 'products')
        expect(mockFetchCollectionStats).toHaveBeenCalledWith('testdb', 'orders')
      })
    })
  })

  describe('selection state', () => {
    it('auto-expands selected database on mount', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          selectedDatabase="testdb"
        />
      )

      await waitFor(() => {
        expect(mockFetchCollections).toHaveBeenCalledWith('testdb')
      })
    })

    it('highlights selected database and collection', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          selectedDatabase="testdb"
          selectedCollection="users"
        />
      )

      // Wait for collections to load
      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      const collectionItem = screen.getByTestId('collection-item-users')
      expect(collectionItem).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('accessibility', () => {
    it('search input has accessible label', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )
      expect(screen.getByLabelText(/Search databases/)).toBeInTheDocument()
    })

    it('refresh button has accessible label', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )
      expect(screen.getByLabelText('Refresh databases')).toBeInTheDocument()
    })

    it('error message has alert role', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          error="Connection failed"
        />
      )
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  // ============================================================
  // RED PHASE: New failing tests for tree state, expand/collapse, selection
  // These tests define expected behavior that needs to be implemented
  // ============================================================

  describe('tree state - displays databases and collections in tree structure', () => {
    it('renders tree with proper nested structure and levels', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      // The tree should have proper ARIA tree structure with levels
      const tree = screen.getByRole('tree')
      expect(tree).toBeInTheDocument()

      // Each database should be at level 1
      const databaseNodes = screen.getAllByRole('treeitem')
      expect(databaseNodes).toHaveLength(3)

      // Database nodes should have aria-level="1"
      databaseNodes.forEach((node) => {
        expect(node).toHaveAttribute('aria-level', '1')
      })
    })

    it('renders collections at level 2 when database is expanded', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      // Expand testdb
      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Collections should be at level 2
      const collectionNodes = screen.getAllByTestId(/^collection-item-/)
      collectionNodes.forEach((node) => {
        expect(node).toHaveAttribute('aria-level', '2')
      })
    })

    it('maintains parent-child relationship via aria-owns', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // The database node should reference its child collection group
      const databaseNode = screen.getByTestId('database-node-testdb')
      const treeItem = databaseNode.querySelector('[role="treeitem"]')
      expect(treeItem).toHaveAttribute('aria-owns')
    })

    it('renders database size in human-readable format', () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      // Should show sizes like "1 MB", "2 MB", "512 KB"
      expect(screen.getByText(/1.*MB/i)).toBeInTheDocument()
    })

    it('renders collection document count when stats are available', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          fetchCollectionStats={mockFetchCollectionStats}
        />
      )

      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        // Stats mock returns count: 1000
        expect(screen.getByText(/1,000 docs/i)).toBeInTheDocument()
      })
    })

    it('distinguishes between collections and views with different icons', async () => {
      const collectionsWithViews: CollectionInfo[] = [
        { name: 'users', type: 'collection' },
        { name: 'userStats', type: 'view' },
      ]
      const mockFetchWithViews = vi.fn().mockResolvedValue(collectionsWithViews)

      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchWithViews}
        />
      )

      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
        expect(screen.getByText('userStats')).toBeInTheDocument()
      })

      // Views should have a distinct icon or indicator
      const viewItem = screen.getByTestId('collection-item-userStats')
      expect(viewItem).toHaveAttribute('data-type', 'view')
    })
  })

  describe('expand/collapse - can expand/collapse database nodes', () => {
    it('supports keyboard navigation with arrow keys to expand/collapse', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      const databaseNode = screen.getByText('testdb')

      // Focus the database node
      databaseNode.focus()

      // Press right arrow to expand
      fireEvent.keyDown(databaseNode, { key: 'ArrowRight' })

      await waitFor(() => {
        expect(mockFetchCollections).toHaveBeenCalledWith('testdb')
      })

      // Press left arrow to collapse
      fireEvent.keyDown(databaseNode, { key: 'ArrowLeft' })

      await waitFor(() => {
        expect(screen.queryByText('users')).not.toBeInTheDocument()
      })
    })

    it('supports Enter key to toggle expansion', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      const databaseNode = screen.getByText('testdb')
      databaseNode.focus()

      fireEvent.keyDown(databaseNode, { key: 'Enter' })

      await waitFor(() => {
        expect(mockFetchCollections).toHaveBeenCalledWith('testdb')
      })
    })

    it('supports Space key to toggle expansion', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      const databaseNode = screen.getByText('testdb')
      databaseNode.focus()

      fireEvent.keyDown(databaseNode, { key: ' ' })

      await waitFor(() => {
        expect(mockFetchCollections).toHaveBeenCalledWith('testdb')
      })
    })

    it('allows multiple databases to be expanded simultaneously', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      // Expand first database
      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Expand second database
      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        // Both should be visible
        expect(screen.getByText('users')).toBeInTheDocument()
        expect(screen.getAllByText('products')).toHaveLength(2) // from both dbs
      })
    })

    it('shows expand all button and collapses all databases when clicked', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      // Expand two databases
      fireEvent.click(screen.getByText('testdb'))
      fireEvent.click(screen.getByText('production'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Click collapse all button
      const collapseAllButton = screen.getByTestId('collapse-all-button')
      fireEvent.click(collapseAllButton)

      await waitFor(() => {
        expect(screen.queryByText('users')).not.toBeInTheDocument()
        expect(screen.queryByText('orders')).not.toBeInTheDocument()
      })
    })

    it('preserves expansion state when databases prop updates', async () => {
      const { rerender } = render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      // Expand testdb
      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Rerender with updated databases (same list)
      rerender(
        <DatabaseBrowser
          databases={[...mockDatabases, { name: 'newdb', sizeOnDisk: 100 }]}
          fetchCollections={mockFetchCollections}
        />
      )

      // testdb should still be expanded
      expect(screen.getByText('users')).toBeInTheDocument()
    })

    it('animates the chevron icon during expansion', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
        />
      )

      const databaseNode = screen.getByTestId('database-node-testdb')
      const chevron = databaseNode.querySelector('[data-testid="expand-chevron"]')

      expect(chevron).toHaveStyle({ transform: 'rotate(0deg)' })

      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(chevron).toHaveStyle({ transform: 'rotate(90deg)' })
      })
    })
  })

  describe('selection - can select a collection', () => {
    it('highlights selected collection with visual indicator', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          selectedDatabase="testdb"
          selectedCollection="users"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      const collectionItem = screen.getByTestId('collection-item-users')

      // Should have a distinct selected style
      expect(collectionItem).toHaveClass('selected')
    })

    it('clears previous selection when new collection is selected', async () => {
      const onCollectionSelect = vi.fn()

      const { rerender } = render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          selectedDatabase="testdb"
          selectedCollection="users"
          onCollectionSelect={onCollectionSelect}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Select a different collection
      fireEvent.click(screen.getByText('products'))

      rerender(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          selectedDatabase="testdb"
          selectedCollection="products"
          onCollectionSelect={onCollectionSelect}
        />
      )

      // Users should no longer be selected
      const usersItem = screen.getByTestId('collection-item-users')
      expect(usersItem).not.toHaveAttribute('aria-selected', 'true')

      // Products should be selected
      const productsItem = screen.getByTestId('collection-item-products')
      expect(productsItem).toHaveAttribute('aria-selected', 'true')
    })

    it('supports keyboard navigation with arrow keys between collections', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          selectedDatabase="testdb"
          selectedCollection="users"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      const usersItem = screen.getByTestId('collection-item-users')
      usersItem.focus()

      // Press down arrow to move to next collection
      fireEvent.keyDown(usersItem, { key: 'ArrowDown' })

      // Focus should move to products
      const productsItem = screen.getByTestId('collection-item-products')
      expect(productsItem).toHaveFocus()
    })

    it('double-click on collection opens it in editor', async () => {
      const onCollectionOpen = vi.fn()

      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onCollectionOpen={onCollectionOpen}
        />
      )

      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      fireEvent.dblClick(screen.getByText('users'))

      expect(onCollectionOpen).toHaveBeenCalledWith('testdb', 'users')
    })

    it('selection persists across database collapse and expand', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          selectedDatabase="testdb"
          selectedCollection="users"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Collapse database
      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.queryByText('users')).not.toBeInTheDocument()
      })

      // Re-expand database
      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Selection should still be there
      const collectionItem = screen.getByTestId('collection-item-users')
      expect(collectionItem).toHaveAttribute('aria-selected', 'true')
    })

    it('scrolls selected collection into view when auto-expanded', async () => {
      // Mock scrollIntoView
      const scrollIntoViewMock = vi.fn()
      Element.prototype.scrollIntoView = scrollIntoViewMock

      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          selectedDatabase="testdb"
          selectedCollection="orders"
        />
      )

      await waitFor(() => {
        expect(screen.getByText('orders')).toBeInTheDocument()
      })

      // scrollIntoView should have been called for the selected item
      expect(scrollIntoViewMock).toHaveBeenCalled()
    })

    it('shows breadcrumb path for selected collection', async () => {
      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          selectedDatabase="testdb"
          selectedCollection="users"
          showBreadcrumb={true}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Should show breadcrumb like "testdb > users"
      expect(screen.getByTestId('selection-breadcrumb')).toHaveTextContent('testdb > users')
    })

    it('allows multi-select when holding Cmd/Ctrl key', async () => {
      const onMultiSelect = vi.fn()

      render(
        <DatabaseBrowser
          databases={mockDatabases}
          fetchCollections={mockFetchCollections}
          onMultiSelect={onMultiSelect}
          multiSelectEnabled={true}
        />
      )

      fireEvent.click(screen.getByText('testdb'))

      await waitFor(() => {
        expect(screen.getByText('users')).toBeInTheDocument()
      })

      // Select first collection
      fireEvent.click(screen.getByText('users'))

      // Cmd+click to add another
      fireEvent.click(screen.getByText('products'), { metaKey: true })

      expect(onMultiSelect).toHaveBeenCalledWith([
        { database: 'testdb', collection: 'users' },
        { database: 'testdb', collection: 'products' },
      ])
    })
  })
})
