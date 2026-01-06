import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { CreateDatabase, CreateDatabaseButton } from '../database/CreateDatabase'
import { useCreateDatabaseMutation } from '@hooks/useQueries'

// Mock the mutation hook
vi.mock('@hooks/useQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hooks/useQueries')>()
  return {
    ...actual,
    useCreateDatabaseMutation: vi.fn(),
  }
})

describe('CreateDatabase', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }

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
    vi.mocked(useCreateDatabaseMutation).mockReturnValue(mockMutation as any)
  })

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
  })

  describe('rendering', () => {
    it('renders modal when open', () => {
      render(<CreateDatabase {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /create database/i })).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      render(<CreateDatabase {...defaultProps} open={false} />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders database name input field', () => {
      render(<CreateDatabase {...defaultProps} />)
      expect(screen.getByLabelText(/database name/i)).toBeInTheDocument()
    })

    it('renders Create button', () => {
      render(<CreateDatabase {...defaultProps} />)
      expect(screen.getByRole('button', { name: /create$/i })).toBeInTheDocument()
    })

    it('renders Cancel button', () => {
      render(<CreateDatabase {...defaultProps} />)
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('renders optional initial collection name input', () => {
      render(<CreateDatabase {...defaultProps} />)
      expect(screen.getByLabelText(/initial collection/i)).toBeInTheDocument()
    })
  })

  describe('form validation', () => {
    it('disables Create button when database name is empty', () => {
      render(<CreateDatabase {...defaultProps} />)
      const createButton = screen.getByRole('button', { name: /create$/i })
      expect(createButton).toHaveAttribute('aria-disabled', 'true')
    })

    it('enables Create button when valid database name is entered', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'myNewDatabase')

      const createButton = screen.getByRole('button', { name: /create$/i })
      expect(createButton).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('shows validation error for database name with invalid characters', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateDatabase {...defaultProps} />)

      // MongoDB database names cannot contain: /\. "$*<>:|?
      await user.type(screen.getByLabelText(/database name/i), 'my/database')

      await waitFor(() => {
        expect(screen.getByText(/invalid database name/i)).toBeInTheDocument()
      })
    })

    it('shows validation error for database name starting with number', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), '123database')

      await waitFor(() => {
        expect(screen.getByText(/cannot start with a number/i)).toBeInTheDocument()
      })
    })

    it('shows validation error for database name that is too long', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateDatabase {...defaultProps} />)

      // MongoDB database names have a max length of 64 characters
      const longName = 'a'.repeat(65)
      await user.type(screen.getByLabelText(/database name/i), longName)

      await waitFor(() => {
        expect(screen.getByText(/too long/i)).toBeInTheDocument()
      })
    })

    it('shows validation error for reserved database names', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'admin')

      await waitFor(() => {
        expect(screen.getByText(/reserved/i)).toBeInTheDocument()
      })
    })
  })

  describe('form submission', () => {
    it('calls mutation with database name on submit', async () => {
      mockMutateAsync.mockResolvedValue({ ok: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'testDatabase')
      await user.click(screen.getByRole('button', { name: /create$/i }))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          name: 'testDatabase',
          initialCollection: undefined,
        })
      })
    })

    it('calls mutation with database name and initial collection', async () => {
      mockMutateAsync.mockResolvedValue({ ok: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'testDatabase')
      await user.type(screen.getByLabelText(/initial collection/i), 'users')
      await user.click(screen.getByRole('button', { name: /create$/i }))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          name: 'testDatabase',
          initialCollection: 'users',
        })
      })
    })

    it('calls onSuccess after successful creation', async () => {
      mockMutateAsync.mockResolvedValue({ ok: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'newDatabase')
      await user.click(screen.getByRole('button', { name: /create$/i }))

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalledWith('newDatabase')
      })
    })

    it('closes modal after successful creation', async () => {
      mockMutateAsync.mockResolvedValue({ ok: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'newDatabase')
      await user.click(screen.getByRole('button', { name: /create$/i }))

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('shows loading state during creation', async () => {
      vi.mocked(useCreateDatabaseMutation).mockReturnValue({
        ...mockMutation,
        isPending: true,
      } as any)

      render(<CreateDatabase {...defaultProps} />)

      const createButton = screen.getByRole('button', { name: /creating/i })
      expect(createButton).toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('error handling', () => {
    it('shows error message when mutation fails', async () => {
      vi.useRealTimers()
      mockMutateAsync.mockRejectedValue(new Error('Database already exists'))
      const user = userEvent.setup()

      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'existingDb')
      await user.click(screen.getByRole('button', { name: /create$/i }))

      await waitFor(() => {
        expect(screen.getByText(/database already exists/i)).toBeInTheDocument()
      })

      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    it('shows error for network failure', async () => {
      vi.useRealTimers()
      mockMutateAsync.mockRejectedValue(new Error('Network error'))
      const user = userEvent.setup()

      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'myDatabase')
      await user.click(screen.getByRole('button', { name: /create$/i }))

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })

      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    it('does not close modal on error', async () => {
      vi.useRealTimers()
      mockMutateAsync.mockRejectedValue(new Error('Creation failed'))
      const user = userEvent.setup()

      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'failDb')
      await user.click(screen.getByRole('button', { name: /create$/i }))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled()
      })

      expect(defaultProps.onClose).not.toHaveBeenCalled()

      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    it('preserves user input after error', async () => {
      vi.useRealTimers()
      mockMutateAsync.mockRejectedValue(new Error('Creation failed'))
      const user = userEvent.setup()

      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'myDatabase')
      await user.click(screen.getByRole('button', { name: /create$/i }))

      await waitFor(() => {
        expect(screen.getByLabelText(/database name/i)).toHaveValue('myDatabase')
      })

      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    it('clears error when user starts typing', async () => {
      vi.useRealTimers()
      mockMutateAsync.mockRejectedValue(new Error('Creation failed'))
      const user = userEvent.setup()

      render(<CreateDatabase {...defaultProps} />)

      await user.type(screen.getByLabelText(/database name/i), 'failDb')
      await user.click(screen.getByRole('button', { name: /create$/i }))

      await waitFor(() => {
        expect(screen.getByText(/creation failed/i)).toBeInTheDocument()
      })

      // Start typing to clear error
      await user.type(screen.getByLabelText(/database name/i), '2')

      await waitFor(() => {
        expect(screen.queryByText(/creation failed/i)).not.toBeInTheDocument()
      })

      vi.useFakeTimers({ shouldAdvanceTime: true })
    })
  })

  describe('cancel behavior', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDatabase {...defaultProps} />)
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('resets form when reopened', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      const { rerender } = render(<CreateDatabase {...defaultProps} />)

      // Type a database name
      await user.type(screen.getByLabelText(/database name/i), 'testDb')
      expect(screen.getByLabelText(/database name/i)).toHaveValue('testDb')

      // Close the modal
      rerender(<CreateDatabase {...defaultProps} open={false} />)

      // Reopen the modal
      rerender(<CreateDatabase {...defaultProps} open={true} />)

      // Input should be cleared
      expect(screen.getByLabelText(/database name/i)).toHaveValue('')
    })
  })

  describe('keyboard accessibility', () => {
    it('submits form on Enter key in database name field', async () => {
      mockMutateAsync.mockResolvedValue({ ok: true })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDatabase {...defaultProps} />)

      const input = screen.getByLabelText(/database name/i)
      await user.type(input, 'testDatabase')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled()
      })
    })

    it('focuses database name input when modal opens', async () => {
      render(<CreateDatabase {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByLabelText(/database name/i)).toHaveFocus()
      })
    })
  })
})

describe('CreateDatabaseButton', () => {
  it('renders with correct text', () => {
    render(<CreateDatabaseButton onClick={() => {}} />)
    expect(screen.getByRole('button', { name: /create database/i })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(<CreateDatabaseButton onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: /create database/i }))

    expect(onClick).toHaveBeenCalled()
  })

  it('can be disabled', () => {
    render(<CreateDatabaseButton onClick={() => {}} disabled />)
    expect(screen.getByRole('button', { name: /create database/i })).toHaveAttribute('aria-disabled', 'true')
  })

  it('has accessible name for screen readers', () => {
    render(<CreateDatabaseButton onClick={() => {}} />)
    const button = screen.getByRole('button', { name: /create database/i })
    expect(button).toHaveAccessibleName()
  })
})
