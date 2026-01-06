import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { Sidebar } from '@components/Sidebar'
import { useConnectionStore } from '@stores/connection'
import { useDatabasesQuery, useCollectionsQuery, useCreateDatabaseMutation } from '@hooks/useQueries'

// Mock the stores and hooks
vi.mock('@stores/connection', () => ({
  useConnectionStore: vi.fn(),
}))

vi.mock('@hooks/useQueries', () => ({
  useDatabasesQuery: vi.fn(),
  useCollectionsQuery: vi.fn(),
  useCreateDatabaseMutation: vi.fn(),
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

describe('Sidebar Create Database Integration', () => {
  const mockMutateAsync = vi.fn()
  const mockMutation = {
    mutateAsync: mockMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })

    vi.mocked(useConnectionStore).mockReturnValue({
      isConnected: true,
    })
    vi.mocked(useDatabasesQuery).mockReturnValue({
      data: [{ name: 'testdb' }, { name: 'otherdb' }],
      isLoading: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useDatabasesQuery>)
    vi.mocked(useCollectionsQuery).mockReturnValue({
      data: [{ name: 'users' }, { name: 'orders' }],
      isLoading: false,
    } as ReturnType<typeof useCollectionsQuery>)
    vi.mocked(useCreateDatabaseMutation).mockReturnValue(mockMutation as any)
  })

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
  })

  describe('Create Database button visibility', () => {
    it('shows Create Database button when connected', () => {
      render(<Sidebar />)
      expect(screen.getByRole('button', { name: /create database/i })).toBeInTheDocument()
    })

    it('hides Create Database button when not connected', () => {
      vi.mocked(useConnectionStore).mockReturnValue({
        isConnected: false,
      })

      render(<Sidebar />)
      expect(screen.queryByRole('button', { name: /create database/i })).not.toBeInTheDocument()
    })

    it('shows Create Database button even when no databases exist', () => {
      vi.mocked(useDatabasesQuery).mockReturnValue({
        data: [],
        isLoading: false,
        refetch: vi.fn(),
      } as ReturnType<typeof useDatabasesQuery>)

      render(<Sidebar />)
      expect(screen.getByRole('button', { name: /create database/i })).toBeInTheDocument()
    })
  })

  describe('Create Database modal interaction', () => {
    it('opens Create Database modal when button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<Sidebar />)

      await user.click(screen.getByRole('button', { name: /create database/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
      expect(screen.getByRole('heading', { name: /create database/i })).toBeInTheDocument()
    })

    it('closes modal when Cancel is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<Sidebar />)

      // Open modal
      await user.click(screen.getByRole('button', { name: /create database/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Close modal
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('creates database and shows it in the list on success', async () => {
      mockMutateAsync.mockResolvedValue({ ok: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      const mockRefetch = vi.fn()
      vi.mocked(useDatabasesQuery).mockReturnValue({
        data: [{ name: 'testdb' }, { name: 'otherdb' }],
        isLoading: false,
        refetch: mockRefetch,
      } as ReturnType<typeof useDatabasesQuery>)

      render(<Sidebar />)

      // Open modal
      await user.click(screen.getByRole('button', { name: /create database/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Enter database name
      await user.type(screen.getByLabelText(/database name/i), 'newDatabase')

      // Submit
      await user.click(screen.getByRole('button', { name: /^create$/i }))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          name: 'newDatabase',
          initialCollection: undefined,
        })
      })

      // Should refetch databases list
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled()
      })
    })

    it('navigates to new database after creation', async () => {
      mockMutateAsync.mockResolvedValue({ ok: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<Sidebar />)

      // Open modal
      await user.click(screen.getByRole('button', { name: /create database/i }))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Enter database name
      await user.type(screen.getByLabelText(/database name/i), 'newDatabase')

      // Submit
      await user.click(screen.getByRole('button', { name: /^create$/i }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/db/newDatabase')
      })
    })
  })

  describe('keyboard accessibility', () => {
    it('Create Database button is focusable', async () => {
      render(<Sidebar />)

      const button = screen.getByRole('button', { name: /create database/i })
      button.focus()

      expect(button).toHaveFocus()
    })

    it('opens modal on Enter key', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<Sidebar />)

      const button = screen.getByRole('button', { name: /create database/i })
      button.focus()

      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('opens modal on Space key', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<Sidebar />)

      const button = screen.getByRole('button', { name: /create database/i })
      button.focus()

      await user.keyboard(' ')

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })
  })
})

describe('Sidebar empty state with Create Database', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useConnectionStore).mockReturnValue({
      isConnected: true,
    })
    vi.mocked(useDatabasesQuery).mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useDatabasesQuery>)
    vi.mocked(useCollectionsQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useCollectionsQuery>)
    vi.mocked(useCreateDatabaseMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as any)
  })

  it('shows helpful message when no databases exist', () => {
    render(<Sidebar />)

    expect(screen.getByText(/no databases/i)).toBeInTheDocument()
  })

  it('provides Create Database action in empty state', () => {
    render(<Sidebar />)

    // Should have a prominent create database call-to-action
    expect(screen.getByRole('button', { name: /create database/i })).toBeInTheDocument()
  })

  it('empty state message encourages database creation', () => {
    render(<Sidebar />)

    // The empty state should suggest creating a database
    expect(screen.getByText(/create.*database|get started/i)).toBeInTheDocument()
  })
})
