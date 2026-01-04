import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act, within } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { QueryHistory } from './QueryHistory'
import { useQueryStore } from '@stores/query'

// Reset store between tests
beforeEach(() => {
  vi.clearAllMocks()

  const { getState } = useQueryStore
  act(() => {
    // Force clear all history
    const history = getState().history
    history.forEach((h) => {
      getState().removeFromHistory(h.id)
    })
    getState().setCurrentFilter('{}')
  })
})

const addHistoryEntries = () => {
  const { getState } = useQueryStore
  act(() => {
    getState().addToHistory({
      query: '{ "status": "active" }',
      database: 'testdb',
      collection: 'users',
      executionTime: 50,
      resultCount: 10,
    })
    getState().addToHistory({
      query: '{ "age": { "$gt": 18 } }',
      database: 'testdb',
      collection: 'users',
      executionTime: 75,
      resultCount: 25,
    })
    getState().addToHistory({
      query: '{ "type": "admin" }',
      database: 'testdb',
      collection: 'roles',
      executionTime: 30,
      resultCount: 3,
    })
  })
}

describe('QueryHistory', () => {
  describe('rendering', () => {
    it('renders the container', () => {
      render(<QueryHistory />)

      expect(screen.getByText('Query History')).toBeInTheDocument()
    })

    it('shows empty state when no history', () => {
      render(<QueryHistory />)

      expect(screen.getByText('No query history yet')).toBeInTheDocument()
      expect(screen.getByText('Run some queries to see them here')).toBeInTheDocument()
    })

    it('renders All and Favorites tabs', () => {
      render(<QueryHistory />)

      expect(screen.getByText(/All/)).toBeInTheDocument()
      expect(screen.getByText(/Favorites/)).toBeInTheDocument()
    })

    it('renders search input', () => {
      render(<QueryHistory />)

      expect(screen.getByPlaceholderText('Search queries...')).toBeInTheDocument()
    })

    it('renders history entries', () => {
      addHistoryEntries()
      render(<QueryHistory />)

      expect(screen.getByText(/status.*active/)).toBeInTheDocument()
      expect(screen.getByText(/age.*\$gt.*18/)).toBeInTheDocument()
      expect(screen.getByText(/type.*admin/)).toBeInTheDocument()
    })
  })

  describe('tabs', () => {
    it('shows count in All tab', () => {
      addHistoryEntries()
      render(<QueryHistory />)

      expect(screen.getByText('All (3)')).toBeInTheDocument()
    })

    it('shows count in Favorites tab', () => {
      addHistoryEntries()

      const { getState } = useQueryStore
      const firstId = getState().history[0]?.id
      act(() => {
        if (firstId) getState().toggleFavorite(firstId)
      })

      render(<QueryHistory />)

      expect(screen.getByText('Favorites (1)')).toBeInTheDocument()
    })

    it('switches to Favorites tab when clicked', async () => {
      const user = userEvent.setup()
      addHistoryEntries()
      render(<QueryHistory />)

      await user.click(screen.getByText(/Favorites/))

      expect(screen.getByText('No favorite queries yet')).toBeInTheDocument()
    })
  })

  describe('search', () => {
    it('filters entries by query text', async () => {
      const user = userEvent.setup()
      addHistoryEntries()
      render(<QueryHistory />)

      await user.type(screen.getByPlaceholderText('Search queries...'), 'admin')

      expect(screen.getByText(/type.*admin/)).toBeInTheDocument()
      expect(screen.queryByText(/status.*active/)).not.toBeInTheDocument()
    })

    it('shows no results message when search has no matches', async () => {
      const user = userEvent.setup()
      addHistoryEntries()
      render(<QueryHistory />)

      await user.type(screen.getByPlaceholderText('Search queries...'), 'nonexistent')

      expect(screen.getByText('No matching queries found')).toBeInTheDocument()
    })
  })

  describe('entry display', () => {
    it('shows database and collection for each entry', () => {
      addHistoryEntries()
      render(<QueryHistory />)

      expect(screen.getAllByText(/testdb\.users/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/testdb\.roles/)).toBeInTheDocument()
    })

    it('shows execution time for entries', () => {
      addHistoryEntries()
      render(<QueryHistory />)

      expect(screen.getByText('50ms')).toBeInTheDocument()
      expect(screen.getByText('75ms')).toBeInTheDocument()
      expect(screen.getByText('30ms')).toBeInTheDocument()
    })

    it('shows result count for entries', () => {
      addHistoryEntries()
      render(<QueryHistory />)

      expect(screen.getByText('10 docs')).toBeInTheDocument()
      expect(screen.getByText('25 docs')).toBeInTheDocument()
      expect(screen.getByText('3 docs')).toBeInTheDocument()
    })

    it('shows relative timestamp', () => {
      addHistoryEntries()
      render(<QueryHistory />)

      // Should show "Just now" for recent entries
      expect(screen.getAllByText('Just now').length).toBeGreaterThan(0)
    })

    it('shows error badge for failed queries', () => {
      const { getState } = useQueryStore
      act(() => {
        getState().addToHistory({
          query: '{ "bad": 1 }',
          database: 'db',
          collection: 'col',
          error: 'Query failed',
        })
      })

      render(<QueryHistory />)

      expect(screen.getByText('Error')).toBeInTheDocument()
    })
  })

  describe('entry selection', () => {
    it('calls onSelect when entry is clicked', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      addHistoryEntries()
      render(<QueryHistory onSelect={onSelect} />)

      // Click on the query text itself
      const queryItems = screen.getAllByText(/type.*admin/)
      await user.click(queryItems[0]!)

      expect(onSelect).toHaveBeenCalled()
    })

    it('loads query from history when entry is clicked', async () => {
      const user = userEvent.setup()
      addHistoryEntries()
      render(<QueryHistory />)

      // Click on a query entry
      const queryItems = screen.getAllByText(/type.*admin/)
      await user.click(queryItems[0]!)

      // The query should be loaded
      const { getState } = useQueryStore
      expect(getState().currentFilter).not.toBe('{}')
    })
  })

  describe('favorite functionality', () => {
    it('toggles favorite when star button is clicked', async () => {
      const user = userEvent.setup()
      addHistoryEntries()
      render(<QueryHistory />)

      // Find the first favorite button (might be hidden until hover, but still clickable)
      const favoriteButtons = screen.getAllByLabelText('Add to favorites')
      await user.click(favoriteButtons[0]!)

      // Check that the entry is now favorited
      const { getState } = useQueryStore
      const favorites = getState().history.filter((h) => h.isFavorite)
      expect(favorites.length).toBe(1)
    })
  })

  describe('delete functionality', () => {
    it('removes entry when delete button is clicked', async () => {
      const user = userEvent.setup()
      addHistoryEntries()
      render(<QueryHistory />)

      const initialCount = useQueryStore.getState().history.length
      const deleteButtons = screen.getAllByLabelText('Delete from history')
      await user.click(deleteButtons[0]!)

      expect(useQueryStore.getState().history.length).toBe(initialCount - 1)
    })
  })

  describe('clear history', () => {
    it('shows clear history button', () => {
      addHistoryEntries()
      render(<QueryHistory />)

      expect(screen.getByLabelText('Clear history')).toBeInTheDocument()
    })

    it('clears non-favorite entries when confirmed', async () => {
      const user = userEvent.setup()
      addHistoryEntries()

      // Favorite one entry
      const { getState } = useQueryStore
      const firstId = getState().history[0]?.id
      act(() => {
        if (firstId) getState().toggleFavorite(firstId)
      })

      // Mock window.confirm
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      render(<QueryHistory />)

      await user.click(screen.getByLabelText('Clear history'))

      expect(confirmSpy).toHaveBeenCalled()
      expect(getState().history.length).toBe(1)
      expect(getState().history[0]?.isFavorite).toBe(true)

      confirmSpy.mockRestore()
    })
  })

  describe('database/collection filtering', () => {
    it('filters by database and collection when provided', () => {
      addHistoryEntries()
      render(<QueryHistory database="testdb" collection="users" />)

      // Should show only users collection entries
      expect(screen.queryByText(/testdb\.roles/)).not.toBeInTheDocument()
      expect(screen.getAllByText(/testdb\.users/).length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('className prop', () => {
    it('applies custom className', () => {
      const { container } = render(<QueryHistory className="custom-class" />)

      const customElement = container.querySelector('.custom-class')
      expect(customElement).toBeInTheDocument()
    })
  })
})
