import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { DatabasePage } from '@components/pages/DatabasePage'
import { useCollectionsQuery } from '@hooks/useQueries'

// Mock the hooks
vi.mock('@hooks/useQueries', () => ({
  useCollectionsQuery: vi.fn(),
}))

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ database: 'testdb' }),
  }
})

describe('DatabasePage keyboard accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useCollectionsQuery).mockReturnValue({
      data: [
        { name: 'users', type: 'collection' },
        { name: 'orders', type: 'collection' },
        { name: 'user_summary', type: 'view' },
      ],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useCollectionsQuery>)
  })

  describe('collection cards', () => {
    it('should be focusable with tab key', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      // Tab through to collection cards
      const card = screen.getByRole('button', { name: /users/i })
      card.focus()

      expect(card).toHaveFocus()
    })

    it('should have role="button" for screen readers', () => {
      render(<DatabasePage />)

      const cards = screen.getAllByRole('button', { name: /users|orders|user_summary/i })
      expect(cards.length).toBe(3)
    })

    it('should trigger navigation on Enter key', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      const card = screen.getByRole('button', { name: /orders/i })
      card.focus()

      await user.keyboard('{Enter}')

      expect(mockNavigate).toHaveBeenCalledWith('/db/testdb/orders')
    })

    it('should trigger navigation on Space key', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      const card = screen.getByRole('button', { name: /orders/i })
      card.focus()

      await user.keyboard(' ')

      expect(mockNavigate).toHaveBeenCalledWith('/db/testdb/orders')
    })

    it('should have tabIndex={0} for keyboard focus', () => {
      render(<DatabasePage />)

      const card = screen.getByRole('button', { name: /users/i })
      expect(card).toHaveAttribute('tabIndex', '0')
    })

    it('should navigate to correct collection path', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      // Test each collection
      const usersCard = screen.getByRole('button', { name: /users/i })
      usersCard.focus()
      await user.keyboard('{Enter}')
      expect(mockNavigate).toHaveBeenCalledWith('/db/testdb/users')

      mockNavigate.mockClear()

      const ordersCard = screen.getByRole('button', { name: /orders/i })
      ordersCard.focus()
      await user.keyboard('{Enter}')
      expect(mockNavigate).toHaveBeenCalledWith('/db/testdb/orders')
    })
  })

  describe('keyboard handler behavior', () => {
    it('should not trigger navigation on other keys', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      const card = screen.getByRole('button', { name: /users/i })
      card.focus()

      await user.keyboard('a')
      await user.keyboard('{Tab}')
      await user.keyboard('{Escape}')

      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('should prevent default scroll behavior on Space key', async () => {
      render(<DatabasePage />)

      const card = screen.getByRole('button', { name: /users/i })
      card.focus()

      const spaceEvent = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
      })
      const preventDefaultSpy = vi.spyOn(spaceEvent, 'preventDefault')

      card.dispatchEvent(spaceEvent)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  describe('click still works', () => {
    it('should trigger navigation on click', async () => {
      const user = userEvent.setup()
      render(<DatabasePage />)

      const card = screen.getByRole('button', { name: /orders/i })
      await user.click(card)

      expect(mockNavigate).toHaveBeenCalledWith('/db/testdb/orders')
    })
  })
})
