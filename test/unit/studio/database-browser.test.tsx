/**
 * DatabaseBrowser Component Unit Tests - TDD RED Phase
 *
 * Comprehensive tests for the DatabaseBrowser component covering:
 * 1. Tree State Management - expand/collapse database nodes
 * 2. Database/Collection Selection - single selection mode
 * 3. Data Loading - loading skeleton, empty states
 * 4. Error Handling - error states, retry functionality
 *
 * These tests mock the useDatabaseBrowser hook to test component behavior.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom'
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the useDatabaseBrowser hook
vi.mock('../../../src/studio/hooks/useDatabaseBrowser', () => ({
  useDatabaseBrowser: vi.fn(),
  default: vi.fn(),
}))

// Import after mocking
import { ConnectedDatabaseBrowser } from '../../../src/studio/components/browser/ConnectedDatabaseBrowser'
import { useDatabaseBrowser } from '../../../src/studio/hooks/useDatabaseBrowser'
import type { DatabaseInfo, CollectionInfo, CollectionStats, DatabaseStats } from '../../../src/studio/components/browser/types'

// ============================================================================
// Test Data
// ============================================================================

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

const mockCollectionStats: CollectionStats = {
  name: 'users',
  count: 1000,
  size: 51200,
}

const mockDatabaseStats: DatabaseStats = {
  name: 'testdb',
  collections: 3,
  objects: 1500,
  dataSize: 102400,
}

// ============================================================================
// Helper Functions
// ============================================================================

const createMockHookReturn = (overrides = {}) => ({
  databases: mockDatabases,
  isLoading: false,
  error: undefined,
  selectedDatabase: undefined,
  selectedCollection: undefined,
  fetchCollections: vi.fn().mockResolvedValue(mockCollections),
  fetchCollectionStats: vi.fn().mockResolvedValue(mockCollectionStats),
  fetchDatabaseStats: vi.fn().mockResolvedValue(mockDatabaseStats),
  refresh: vi.fn().mockResolvedValue(undefined),
  selectDatabase: vi.fn(),
  selectCollection: vi.fn(),
  createDatabase: vi.fn().mockResolvedValue(undefined),
  dropDatabase: vi.fn().mockResolvedValue(undefined),
  createCollection: vi.fn().mockResolvedValue(undefined),
  dropCollection: vi.fn().mockResolvedValue(undefined),
  ...overrides,
})

// ============================================================================
// Test Suites
// ============================================================================

describe('DatabaseBrowser with useDatabaseBrowser hook', () => {
  const mockedUseDatabaseBrowser = vi.mocked(useDatabaseBrowser)

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseDatabaseBrowser.mockReturnValue(createMockHookReturn())
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // ==========================================================================
  // 1. Tree State Management
  // ==========================================================================
  describe('Tree State Management', () => {
    describe('Initial state with collapsed databases', () => {
      it('should render all databases in collapsed state initially', async () => {
        render(<ConnectedDatabaseBrowser />)

        // All databases should be visible
        expect(screen.getByText('testdb')).toBeInTheDocument()
        expect(screen.getByText('production')).toBeInTheDocument()
        expect(screen.getByText('analytics')).toBeInTheDocument()

        // Collections should not be visible (collapsed)
        expect(screen.queryByText('users')).not.toBeInTheDocument()
        expect(screen.queryByText('products')).not.toBeInTheDocument()
        expect(screen.queryByText('orders')).not.toBeInTheDocument()
      })

      it('should show database nodes with aria-expanded=false initially', () => {
        render(<ConnectedDatabaseBrowser />)

        const databaseNodes = screen.getAllByRole('treeitem')
        databaseNodes.forEach((node) => {
          expect(node).toHaveAttribute('aria-expanded', 'false')
        })
      })

      it('should show expand icon/chevron for each database', () => {
        render(<ConnectedDatabaseBrowser />)

        // Each database should have a collapse/expand indicator
        const expandIcons = screen.getAllByTestId(/expand-icon/)
        expect(expandIcons.length).toBe(mockDatabases.length)
      })
    })

    describe('Expand/collapse database nodes', () => {
      it('should expand database when clicking on database name', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        // Click on database to expand
        fireEvent.click(screen.getByText('testdb'))

        // Wait for collections to load
        await waitFor(() => {
          expect(screen.getByText('users')).toBeInTheDocument()
          expect(screen.getByText('products')).toBeInTheDocument()
          expect(screen.getByText('orders')).toBeInTheDocument()
        })
      })

      it('should collapse database when clicking on expanded database', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        // Expand first
        fireEvent.click(screen.getByText('testdb'))

        await waitFor(() => {
          expect(screen.getByText('users')).toBeInTheDocument()
        })

        // Collapse by clicking again
        fireEvent.click(screen.getByText('testdb'))

        await waitFor(() => {
          expect(screen.queryByText('users')).not.toBeInTheDocument()
        })
      })

      it('should update aria-expanded attribute when toggling', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        const databaseNode = screen.getByTestId('database-node-testdb')
        expect(databaseNode).toHaveAttribute('aria-expanded', 'false')

        // Expand
        fireEvent.click(screen.getByText('testdb'))

        await waitFor(() => {
          expect(databaseNode).toHaveAttribute('aria-expanded', 'true')
        })

        // Collapse
        fireEvent.click(screen.getByText('testdb'))

        await waitFor(() => {
          expect(databaseNode).toHaveAttribute('aria-expanded', 'false')
        })
      })

      it('should allow multiple databases to be expanded simultaneously', async () => {
        const fetchCollections = vi.fn().mockImplementation((db: string) => {
          if (db === 'testdb') return Promise.resolve(mockCollections)
          if (db === 'production') return Promise.resolve([{ name: 'logs', type: 'collection' }])
          return Promise.resolve([])
        })
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        // Expand first database
        fireEvent.click(screen.getByText('testdb'))
        await waitFor(() => {
          expect(screen.getByText('users')).toBeInTheDocument()
        })

        // Expand second database
        fireEvent.click(screen.getByText('production'))
        await waitFor(() => {
          expect(screen.getByText('logs')).toBeInTheDocument()
        })

        // Both should still be expanded
        expect(screen.getByText('users')).toBeInTheDocument()
        expect(screen.getByText('logs')).toBeInTheDocument()
      })

      it('should expand database using keyboard Enter key', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        const databaseRow = screen.getByTestId('database-row-testdb')
        databaseRow.focus()
        fireEvent.keyDown(databaseRow, { key: 'Enter' })

        await waitFor(() => {
          expect(screen.getByText('users')).toBeInTheDocument()
        })
      })

      it('should expand/collapse with Space key', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        const databaseRow = screen.getByTestId('database-row-testdb')
        databaseRow.focus()
        fireEvent.keyDown(databaseRow, { key: ' ' })

        await waitFor(() => {
          expect(screen.getByText('users')).toBeInTheDocument()
        })
      })
    })

    describe('Expand/collapse collection lists', () => {
      it('should show nested collection list when database is expanded', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByText('testdb'))

        await waitFor(() => {
          const collectionList = screen.getByTestId('collection-list-testdb')
          expect(collectionList).toBeInTheDocument()
        })
      })

      it('should indent collections under parent database', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByText('testdb'))

        await waitFor(() => {
          const collectionItems = screen.getAllByTestId(/collection-item-/)
          collectionItems.forEach((item) => {
            // Check for indentation via padding-left or similar
            expect(item).toHaveStyle({ paddingLeft: expect.any(String) })
          })
        })
      })
    })

    describe('Maintain state on data updates', () => {
      it('should preserve expansion state when databases list updates', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        const mockHookReturn = createMockHookReturn({ fetchCollections })
        mockedUseDatabaseBrowser.mockReturnValue(mockHookReturn)

        const { rerender } = render(<ConnectedDatabaseBrowser />)

        // Expand a database
        fireEvent.click(screen.getByText('testdb'))

        await waitFor(() => {
          expect(screen.getByText('users')).toBeInTheDocument()
        })

        // Simulate new databases being added
        const updatedDatabases = [...mockDatabases, { name: 'newdb', sizeOnDisk: 100 }]
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ databases: updatedDatabases, fetchCollections })
        )

        rerender(<ConnectedDatabaseBrowser />)

        // testdb should still be expanded
        expect(screen.getByText('users')).toBeInTheDocument()
        expect(screen.getByText('newdb')).toBeInTheDocument()
      })

      it('should preserve selection state after refresh', async () => {
        const selectDatabase = vi.fn()
        const refresh = vi.fn().mockResolvedValue(undefined)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            selectedDatabase: 'testdb',
            selectDatabase,
            refresh,
          })
        )

        render(<ConnectedDatabaseBrowser />)

        // Trigger refresh
        const refreshButton = screen.getByTestId('refresh-button')
        fireEvent.click(refreshButton)

        await waitFor(() => {
          expect(refresh).toHaveBeenCalled()
        })

        // Selection should still be highlighted
        const selectedDb = screen.getByTestId('database-row-testdb')
        expect(selectedDb).toHaveAttribute('aria-selected', 'true')
      })

      it('should remember collapsed state across re-renders', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        const { rerender } = render(<ConnectedDatabaseBrowser />)

        // Expand then collapse testdb
        fireEvent.click(screen.getByText('testdb'))
        await waitFor(() => {
          expect(screen.getByText('users')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('testdb'))
        await waitFor(() => {
          expect(screen.queryByText('users')).not.toBeInTheDocument()
        })

        // Rerender
        rerender(<ConnectedDatabaseBrowser />)

        // Should still be collapsed
        expect(screen.queryByText('users')).not.toBeInTheDocument()
      })
    })
  })

  // ==========================================================================
  // 2. Database/Collection Selection
  // ==========================================================================
  describe('Database/Collection Selection', () => {
    describe('Single selection mode', () => {
      it('should select only one database at a time', async () => {
        const selectDatabase = vi.fn()
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ selectDatabase })
        )

        render(<ConnectedDatabaseBrowser />)

        // Select first database
        fireEvent.click(screen.getByText('testdb'))
        expect(selectDatabase).toHaveBeenCalledWith('testdb')

        // Select second database
        fireEvent.click(screen.getByText('production'))
        expect(selectDatabase).toHaveBeenCalledWith('production')
      })

      it('should select only one collection at a time', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        const selectCollection = vi.fn()
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections, selectCollection })
        )

        render(<ConnectedDatabaseBrowser />)

        // Expand database
        fireEvent.click(screen.getByText('testdb'))
        await waitFor(() => {
          expect(screen.getByText('users')).toBeInTheDocument()
        })

        // Select first collection
        fireEvent.click(screen.getByText('users'))
        expect(selectCollection).toHaveBeenCalledWith('testdb', 'users')

        // Select second collection
        fireEvent.click(screen.getByText('products'))
        expect(selectCollection).toHaveBeenCalledWith('testdb', 'products')
      })
    })

    describe('Highlight selected item', () => {
      it('should highlight the selected database', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ selectedDatabase: 'testdb' })
        )

        render(<ConnectedDatabaseBrowser />)

        const selectedRow = screen.getByTestId('database-row-testdb')
        expect(selectedRow).toHaveAttribute('aria-selected', 'true')
        expect(selectedRow).toHaveClass('selected')
      })

      it('should not highlight non-selected databases', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ selectedDatabase: 'testdb' })
        )

        render(<ConnectedDatabaseBrowser />)

        const nonSelectedRow = screen.getByTestId('database-row-production')
        expect(nonSelectedRow).toHaveAttribute('aria-selected', 'false')
        expect(nonSelectedRow).not.toHaveClass('selected')
      })

      it('should highlight the selected collection', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            fetchCollections,
            selectedDatabase: 'testdb',
            selectedCollection: 'users',
          })
        )

        render(<ConnectedDatabaseBrowser />)

        // Wait for auto-expansion due to selection
        await waitFor(() => {
          const selectedCollection = screen.getByTestId('collection-item-users')
          expect(selectedCollection).toHaveAttribute('aria-selected', 'true')
        })
      })

      it('should apply visual highlight styling to selected items', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ selectedDatabase: 'testdb' })
        )

        render(<ConnectedDatabaseBrowser />)

        const selectedRow = screen.getByTestId('database-row-testdb')
        const styles = window.getComputedStyle(selectedRow)
        expect(styles.backgroundColor).not.toBe('transparent')
      })
    })

    describe('onSelect callback triggered', () => {
      it('should call onDatabaseSelect prop when database is selected', () => {
        const onDatabaseSelect = vi.fn()
        render(<ConnectedDatabaseBrowser onDatabaseSelect={onDatabaseSelect} />)

        fireEvent.click(screen.getByText('testdb'))

        expect(onDatabaseSelect).toHaveBeenCalledWith('testdb')
      })

      it('should call onCollectionSelect prop when collection is selected', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        const onCollectionSelect = vi.fn()
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser onCollectionSelect={onCollectionSelect} />)

        // Expand database
        fireEvent.click(screen.getByText('testdb'))
        await waitFor(() => {
          expect(screen.getByText('users')).toBeInTheDocument()
        })

        // Select collection
        fireEvent.click(screen.getByText('users'))

        expect(onCollectionSelect).toHaveBeenCalledWith('testdb', 'users')
      })

      it('should trigger callback with correct parameters on double-click', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        const onCollectionSelect = vi.fn()
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser onCollectionSelect={onCollectionSelect} />)

        fireEvent.click(screen.getByText('testdb'))
        await waitFor(() => {
          expect(screen.getByText('users')).toBeInTheDocument()
        })

        fireEvent.doubleClick(screen.getByText('users'))

        expect(onCollectionSelect).toHaveBeenCalledWith('testdb', 'users')
      })
    })

    describe('Deselect on outside click', () => {
      it('should deselect database when clicking outside the tree', async () => {
        const selectDatabase = vi.fn()
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            selectedDatabase: 'testdb',
            selectDatabase,
          })
        )

        render(
          <div>
            <div data-testid="outside-element">Outside</div>
            <ConnectedDatabaseBrowser />
          </div>
        )

        // Click outside
        fireEvent.click(screen.getByTestId('outside-element'))

        // Should deselect (selectDatabase called with undefined or cleared)
        await waitFor(() => {
          expect(selectDatabase).toHaveBeenCalledWith(undefined)
        })
      })

      it('should deselect collection when clicking outside', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        const selectCollection = vi.fn()
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            fetchCollections,
            selectedDatabase: 'testdb',
            selectedCollection: 'users',
            selectCollection,
          })
        )

        render(
          <div>
            <div data-testid="outside-element">Outside</div>
            <ConnectedDatabaseBrowser />
          </div>
        )

        // Click outside
        fireEvent.click(screen.getByTestId('outside-element'))

        await waitFor(() => {
          expect(selectCollection).toHaveBeenCalledWith(undefined, undefined)
        })
      })

      it('should not deselect when clicking within the browser', async () => {
        const selectDatabase = vi.fn()
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            selectedDatabase: 'testdb',
            selectDatabase,
          })
        )

        render(<ConnectedDatabaseBrowser />)

        // Click on refresh button (inside the browser)
        fireEvent.click(screen.getByTestId('refresh-button'))

        // Should not have been called with undefined
        expect(selectDatabase).not.toHaveBeenCalledWith(undefined)
      })
    })
  })

  // ==========================================================================
  // 3. Data Loading
  // ==========================================================================
  describe('Data Loading', () => {
    describe('Show loading skeleton while fetching', () => {
      it('should show loading skeleton when isLoading is true', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            isLoading: true,
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        expect(screen.getByTestId('database-browser-skeleton')).toBeInTheDocument()
      })

      it('should show multiple skeleton items', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            isLoading: true,
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        const skeletonItems = screen.getAllByTestId(/skeleton-item/)
        expect(skeletonItems.length).toBeGreaterThan(1)
      })

      it('should animate skeleton items', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            isLoading: true,
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        const skeleton = screen.getByTestId('database-browser-skeleton')
        const styles = window.getComputedStyle(skeleton)
        expect(styles.animation).toBeDefined()
      })

      it('should show collection loading skeleton when expanding database', async () => {
        const fetchCollections = vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve(mockCollections), 100)
          })
        })
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByText('testdb'))

        // Should show collection skeleton while loading
        expect(screen.getByTestId('collection-skeleton')).toBeInTheDocument()

        await waitFor(() => {
          expect(screen.queryByTestId('collection-skeleton')).not.toBeInTheDocument()
          expect(screen.getByText('users')).toBeInTheDocument()
        })
      })

      it('should hide skeleton when loading completes', async () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            isLoading: true,
            databases: [],
          })
        )

        const { rerender } = render(<ConnectedDatabaseBrowser />)

        expect(screen.getByTestId('database-browser-skeleton')).toBeInTheDocument()

        // Simulate loading complete
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            isLoading: false,
            databases: mockDatabases,
          })
        )

        rerender(<ConnectedDatabaseBrowser />)

        expect(screen.queryByTestId('database-browser-skeleton')).not.toBeInTheDocument()
        expect(screen.getByText('testdb')).toBeInTheDocument()
      })
    })

    describe('Handle empty database list', () => {
      it('should show empty state message when no databases', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            isLoading: false,
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        expect(screen.getByText(/No databases found/i)).toBeInTheDocument()
      })

      it('should show create database prompt in empty state', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            isLoading: false,
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        expect(screen.getByTestId('empty-state-create-button')).toBeInTheDocument()
      })

      it('should display empty illustration or icon', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            isLoading: false,
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument()
      })
    })

    describe('Handle database with no collections', () => {
      it('should show empty collections message', async () => {
        const fetchCollections = vi.fn().mockResolvedValue([])
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByText('testdb'))

        await waitFor(() => {
          expect(screen.getByText(/No collections/i)).toBeInTheDocument()
        })
      })

      it('should show create collection button in empty collections state', async () => {
        const fetchCollections = vi.fn().mockResolvedValue([])
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByText('testdb'))

        await waitFor(() => {
          expect(screen.getByTestId('create-collection-testdb')).toBeInTheDocument()
        })
      })
    })

    describe('Refresh on demand', () => {
      it('should call refresh when refresh button is clicked', () => {
        const refresh = vi.fn().mockResolvedValue(undefined)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ refresh })
        )

        render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByTestId('refresh-button'))

        expect(refresh).toHaveBeenCalled()
      })

      it('should disable refresh button while refreshing', async () => {
        const refresh = vi.fn().mockImplementation(() => {
          return new Promise((resolve) => setTimeout(resolve, 100))
        })
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ refresh, isLoading: true })
        )

        render(<ConnectedDatabaseBrowser />)

        const refreshButton = screen.getByTestId('refresh-button')
        expect(refreshButton).toBeDisabled()
      })

      it('should show spinning indicator on refresh button', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ isLoading: true })
        )

        render(<ConnectedDatabaseBrowser />)

        const refreshIcon = screen.getByTestId('refresh-icon')
        expect(refreshIcon).toHaveClass('spinning')
      })

      it('should update database list after refresh', async () => {
        const refresh = vi.fn().mockResolvedValue(undefined)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ refresh })
        )

        const { rerender } = render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByTestId('refresh-button'))

        // Simulate refresh completing with new data
        const newDatabases = [...mockDatabases, { name: 'newdb', sizeOnDisk: 100 }]
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ refresh, databases: newDatabases })
        )

        rerender(<ConnectedDatabaseBrowser />)

        expect(screen.getByText('newdb')).toBeInTheDocument()
      })

      it('should clear cached collections after refresh', async () => {
        const fetchCollections = vi.fn().mockResolvedValue(mockCollections)
        const refresh = vi.fn().mockResolvedValue(undefined)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections, refresh })
        )

        render(<ConnectedDatabaseBrowser />)

        // Expand to fetch collections
        fireEvent.click(screen.getByText('testdb'))
        await waitFor(() => {
          expect(fetchCollections).toHaveBeenCalledTimes(1)
        })

        // Refresh
        fireEvent.click(screen.getByTestId('refresh-button'))

        // Collapse and re-expand
        fireEvent.click(screen.getByText('testdb'))
        fireEvent.click(screen.getByText('testdb'))

        // Should fetch again after refresh
        await waitFor(() => {
          expect(fetchCollections).toHaveBeenCalledTimes(2)
        })
      })
    })
  })

  // ==========================================================================
  // 4. Error Handling
  // ==========================================================================
  describe('Error Handling', () => {
    describe('Show error state on fetch failure', () => {
      it('should display error message when error occurs', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Failed to connect to database',
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        expect(screen.getByText('Failed to connect to database')).toBeInTheDocument()
      })

      it('should show error with alert role for accessibility', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Connection error',
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      it('should style error message appropriately', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Connection error',
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        const errorMessage = screen.getByTestId('error-message')
        expect(errorMessage).toHaveClass('error')
      })

      it('should show error icon alongside error message', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Database error',
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        expect(screen.getByTestId('error-icon')).toBeInTheDocument()
      })

      it('should handle collection fetch error', async () => {
        const fetchCollections = vi.fn().mockRejectedValue(new Error('Collection fetch failed'))
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ fetchCollections })
        )

        render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByText('testdb'))

        await waitFor(() => {
          expect(screen.getByText(/Failed to load collections/i)).toBeInTheDocument()
        })
      })

      it('should call onError prop when error occurs', () => {
        const onError = vi.fn()
        const mockError = new Error('Database error')
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({ error: 'Database error' })
        )

        render(<ConnectedDatabaseBrowser onError={onError} />)

        // Hook should have called onError
        expect(onError).toHaveBeenCalled()
      })
    })

    describe('Retry functionality', () => {
      it('should show retry button when error occurs', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Connection failed',
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        expect(screen.getByTestId('retry-button')).toBeInTheDocument()
      })

      it('should call refresh when retry button is clicked', () => {
        const refresh = vi.fn().mockResolvedValue(undefined)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Connection failed',
            databases: [],
            refresh,
          })
        )

        render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByTestId('retry-button'))

        expect(refresh).toHaveBeenCalled()
      })

      it('should clear error state on retry', async () => {
        const refresh = vi.fn().mockResolvedValue(undefined)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Connection failed',
            databases: [],
            refresh,
          })
        )

        const { rerender } = render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByTestId('retry-button'))

        // Simulate successful retry
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: undefined,
            databases: mockDatabases,
            refresh,
          })
        )

        rerender(<ConnectedDatabaseBrowser />)

        expect(screen.queryByTestId('error-message')).not.toBeInTheDocument()
        expect(screen.getByText('testdb')).toBeInTheDocument()
      })

      it('should show loading state during retry', async () => {
        const refresh = vi.fn().mockImplementation(() => {
          return new Promise((resolve) => setTimeout(resolve, 100))
        })
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Connection failed',
            databases: [],
            refresh,
          })
        )

        const { rerender } = render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByTestId('retry-button'))

        // Simulate loading state during retry
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            isLoading: true,
            error: undefined,
            databases: [],
            refresh,
          })
        )

        rerender(<ConnectedDatabaseBrowser />)

        expect(screen.getByTestId('database-browser-skeleton')).toBeInTheDocument()
      })

      it('should show error again if retry fails', async () => {
        const refresh = vi.fn().mockRejectedValue(new Error('Still failing'))
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Connection failed',
            databases: [],
            refresh,
          })
        )

        const { rerender } = render(<ConnectedDatabaseBrowser />)

        fireEvent.click(screen.getByTestId('retry-button'))

        // Simulate retry failed
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Still failing',
            databases: [],
            refresh,
          })
        )

        rerender(<ConnectedDatabaseBrowser />)

        expect(screen.getByText('Still failing')).toBeInTheDocument()
      })

      it('should have accessible retry button label', () => {
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Connection failed',
            databases: [],
          })
        )

        render(<ConnectedDatabaseBrowser />)

        const retryButton = screen.getByTestId('retry-button')
        expect(retryButton).toHaveAccessibleName(/retry/i)
      })

      it('should allow retry via keyboard', () => {
        const refresh = vi.fn().mockResolvedValue(undefined)
        mockedUseDatabaseBrowser.mockReturnValue(
          createMockHookReturn({
            error: 'Connection failed',
            databases: [],
            refresh,
          })
        )

        render(<ConnectedDatabaseBrowser />)

        const retryButton = screen.getByTestId('retry-button')
        retryButton.focus()
        fireEvent.keyDown(retryButton, { key: 'Enter' })

        expect(refresh).toHaveBeenCalled()
      })
    })
  })
})
