import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { Sidebar } from '@components/Sidebar'
import { useConnectionStore } from '@stores/connection'
import { useDatabasesQuery, useCollectionsQuery } from '@hooks/useQueries'

// Mock the stores and hooks
vi.mock('@stores/connection', () => ({
  useConnectionStore: vi.fn(),
}))

vi.mock('@hooks/useQueries', () => ({
  useDatabasesQuery: vi.fn(),
  useCollectionsQuery: vi.fn(),
  useCreateDatabaseMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useDropDatabaseMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useCreateCollectionMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useDropCollectionMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}))

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ database: 'testdb', collection: 'users' }),
  }
})

describe('Sidebar keyboard accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useConnectionStore).mockReturnValue({
      isConnected: true,
    })
    vi.mocked(useDatabasesQuery).mockReturnValue({
      data: [{ name: 'testdb' }, { name: 'otherdb' }],
      isLoading: false,
    } as ReturnType<typeof useDatabasesQuery>)
    vi.mocked(useCollectionsQuery).mockReturnValue({
      data: [{ name: 'users' }, { name: 'orders' }],
      isLoading: false,
    } as ReturnType<typeof useCollectionsQuery>)
  })

  describe('database navigation items', () => {
    it('should be focusable with tab key', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      // Tab to the first database nav item
      await user.tab()

      const dbNavItem = screen.getByRole('button', { name: /testdb/i })
      expect(dbNavItem).toHaveFocus()
    })

    it('should have role="button" for screen readers', () => {
      render(<Sidebar />)

      const dbNavItems = screen.getAllByRole('button', { name: /testdb|otherdb/i })
      expect(dbNavItems.length).toBeGreaterThanOrEqual(1)
    })

    it('should trigger navigation on Enter key', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      const dbNavItem = screen.getByRole('button', { name: /otherdb/i })
      dbNavItem.focus()

      await user.keyboard('{Enter}')

      expect(mockNavigate).toHaveBeenCalledWith('/db/otherdb')
    })

    it('should trigger navigation on Space key', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      const dbNavItem = screen.getByRole('button', { name: /otherdb/i })
      dbNavItem.focus()

      await user.keyboard(' ')

      expect(mockNavigate).toHaveBeenCalledWith('/db/otherdb')
    })

    it('should have tabIndex={0} for keyboard focus', () => {
      render(<Sidebar />)

      const dbNavItem = screen.getByRole('button', { name: /otherdb/i })
      expect(dbNavItem).toHaveAttribute('tabIndex', '0')
    })
  })

  describe('collection navigation items', () => {
    it('should be focusable with tab key', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      // The expanded database (testdb) should show its collections
      const collNavItem = screen.getByRole('button', { name: /orders/i })
      expect(collNavItem).toBeInTheDocument()

      collNavItem.focus()
      expect(collNavItem).toHaveFocus()
    })

    it('should have role="button" for screen readers', () => {
      render(<Sidebar />)

      const collNavItem = screen.getByRole('button', { name: /users/i })
      expect(collNavItem).toBeInTheDocument()
    })

    it('should trigger navigation on Enter key', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      const collNavItem = screen.getByRole('button', { name: /orders/i })
      collNavItem.focus()

      await user.keyboard('{Enter}')

      expect(mockNavigate).toHaveBeenCalledWith('/db/testdb/orders')
    })

    it('should trigger navigation on Space key', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      const collNavItem = screen.getByRole('button', { name: /orders/i })
      collNavItem.focus()

      await user.keyboard(' ')

      expect(mockNavigate).toHaveBeenCalledWith('/db/testdb/orders')
    })

    it('should have tabIndex={0} for keyboard focus', () => {
      render(<Sidebar />)

      const collNavItem = screen.getByRole('button', { name: /orders/i })
      expect(collNavItem).toHaveAttribute('tabIndex', '0')
    })
  })

  describe('keyboard handler behavior', () => {
    it('should not trigger navigation on other keys', async () => {
      const user = userEvent.setup()
      render(<Sidebar />)

      const dbNavItem = screen.getByRole('button', { name: /otherdb/i })
      dbNavItem.focus()

      await user.keyboard('a')
      await user.keyboard('{Tab}')
      await user.keyboard('{Escape}')

      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('should prevent default scroll behavior on Space key', async () => {
      render(<Sidebar />)

      const dbNavItem = screen.getByRole('button', { name: /otherdb/i })
      dbNavItem.focus()

      const spaceEvent = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
      })
      const preventDefaultSpy = vi.spyOn(spaceEvent, 'preventDefault')

      dbNavItem.dispatchEvent(spaceEvent)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })
})
