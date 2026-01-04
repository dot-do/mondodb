import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { CreateDocument, CreateDocumentButton } from '../CreateDocument'
import { useInsertDocumentMutation } from '@hooks/useQueries'

// Mock the mutation hook
vi.mock('@hooks/useQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hooks/useQueries')>()
  return {
    ...actual,
    useInsertDocumentMutation: vi.fn(),
  }
})

describe('CreateDocument', () => {
  const defaultProps = {
    database: 'testdb',
    collection: 'testcoll',
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }

  const mockMutateAsync = vi.fn()
  const mockMutation = {
    mutateAsync: mockMutateAsync,
    isPending: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(useInsertDocumentMutation).mockReturnValue(mockMutation as any)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders modal when open', () => {
      render(<CreateDocument {...defaultProps} />)
      // Modal renders the title in an H3
      expect(screen.getByRole('heading', { name: 'Insert Document' })).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      render(<CreateDocument {...defaultProps} open={false} />)
      expect(screen.queryByRole('heading', { name: 'Insert Document' })).not.toBeInTheDocument()
    })

    it('shows collection name in description', () => {
      render(<CreateDocument {...defaultProps} />)
      expect(screen.getByText(/testcoll/)).toBeInTheDocument()
    })

    it('renders Insert button', () => {
      render(<CreateDocument {...defaultProps} />)
      expect(screen.getByTestId('create-document-submit')).toBeInTheDocument()
    })

    it('renders Cancel button', () => {
      render(<CreateDocument {...defaultProps} />)
      // Use getAllByRole and find the one with Cancel text
      const cancelButtons = screen.getAllByRole('button').filter(btn =>
        btn.textContent?.toLowerCase().includes('cancel')
      )
      expect(cancelButtons.length).toBeGreaterThan(0)
    })
  })

  describe('form submission', () => {
    it('calls mutation with parsed document on submit', async () => {
      mockMutateAsync.mockResolvedValue({ insertedId: 'new-id' })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDocument {...defaultProps} />)

      // The editor starts with default empty object, we need to add content
      // For testing, we'll just submit the default and verify mutation is called

      await user.click(screen.getByTestId('create-document-submit'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled()
      })
    })

    it('calls onSuccess with insertedId after successful insert', async () => {
      mockMutateAsync.mockResolvedValue({ insertedId: 'abc123' })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDocument {...defaultProps} />)
      await user.click(screen.getByTestId('create-document-submit'))

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalledWith('abc123')
      })
    })

    it('closes modal after successful insert', async () => {
      mockMutateAsync.mockResolvedValue({ insertedId: 'abc123' })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDocument {...defaultProps} />)
      await user.click(screen.getByTestId('create-document-submit'))

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('shows error message on mutation failure', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Insert failed'))
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDocument {...defaultProps} />)
      await user.click(screen.getByTestId('create-document-submit'))

      await waitFor(() => {
        expect(screen.getByTestId('create-error')).toHaveTextContent(
          'Insert failed'
        )
      })
    })

    it('shows loading state during insert', async () => {
      vi.mocked(useInsertDocumentMutation).mockReturnValue({
        ...mockMutation,
        isPending: true,
      } as any)

      render(<CreateDocument {...defaultProps} />)

      expect(screen.getByTestId('create-document-submit')).toHaveTextContent(
        'Inserting...'
      )
      expect(screen.getByTestId('create-document-submit')).toBeDisabled()
    })
  })

  describe('cancel behavior', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<CreateDocument {...defaultProps} />)
      // Find the Cancel button by text content
      const cancelButton = screen.getAllByRole('button').find(btn =>
        btn.textContent?.toLowerCase().includes('cancel')
      )
      expect(cancelButton).toBeTruthy()
      await user.click(cancelButton!)

      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })
})

describe('CreateDocumentButton', () => {
  it('renders with default text', () => {
    render(<CreateDocumentButton onClick={() => {}} />)
    expect(screen.getByTestId('add-document-button')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(<CreateDocumentButton onClick={onClick} />)
    await user.click(screen.getByTestId('add-document-button'))

    expect(onClick).toHaveBeenCalled()
  })

  it('can be disabled', () => {
    render(<CreateDocumentButton onClick={() => {}} disabled />)
    // LeafyGreen Button uses aria-disabled instead of native disabled
    expect(screen.getByTestId('add-document-button')).toHaveAttribute('aria-disabled', 'true')
  })

  it('supports different variants', () => {
    const { rerender } = render(
      <CreateDocumentButton onClick={() => {}} variant="primaryOutline" />
    )
    expect(screen.getByTestId('add-document-button')).toBeInTheDocument()

    rerender(<CreateDocumentButton onClick={() => {}} variant="default" />)
    expect(screen.getByTestId('add-document-button')).toBeInTheDocument()
  })
})
