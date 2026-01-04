import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import {
  DeleteDocument,
  DeleteDocumentsBulk,
  DeleteDocumentInline,
} from '../DeleteDocument'
import { useDeleteDocumentMutation } from '@hooks/useQueries'

// Mock the mutation hook
vi.mock('@hooks/useQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hooks/useQueries')>()
  return {
    ...actual,
    useDeleteDocumentMutation: vi.fn(),
  }
})

describe('DeleteDocument', () => {
  const mockDocument = {
    _id: 'doc123',
    name: 'Test Document',
    count: 42,
  }

  const defaultProps = {
    database: 'testdb',
    collection: 'testcoll',
    documentId: 'doc123',
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    document: mockDocument,
  }

  const mockMutateAsync = vi.fn()
  const mockMutation = {
    mutateAsync: mockMutateAsync,
    isPending: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(useDeleteDocumentMutation).mockReturnValue(mockMutation as any)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders confirmation modal when open', () => {
      render(<DeleteDocument {...defaultProps} />)
      expect(screen.getByText('Delete Document')).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      render(<DeleteDocument {...defaultProps} open={false} />)
      expect(screen.queryByText('Delete Document')).not.toBeInTheDocument()
    })

    it('shows collection name', () => {
      render(<DeleteDocument {...defaultProps} />)
      expect(screen.getByText(/testcoll/)).toBeInTheDocument()
    })

    it('shows document ID', () => {
      render(<DeleteDocument {...defaultProps} />)
      expect(screen.getByText('doc123')).toBeInTheDocument()
    })

    it('shows document preview when provided', () => {
      render(<DeleteDocument {...defaultProps} />)
      expect(screen.getByTestId('delete-document-preview')).toBeInTheDocument()
      expect(screen.getByTestId('delete-document-preview')).toHaveTextContent(
        'Test Document'
      )
    })

    it('shows warning message', () => {
      render(<DeleteDocument {...defaultProps} />)
      expect(
        screen.getByText(/this action cannot be undone/i)
      ).toBeInTheDocument()
    })

    it('renders Delete button', () => {
      render(<DeleteDocument {...defaultProps} />)
      expect(screen.getByTestId('delete-document-confirm')).toHaveTextContent(
        'Delete'
      )
    })
  })

  describe('deletion', () => {
    it('calls mutation with document ID on confirm', async () => {
      mockMutateAsync.mockResolvedValue({ deletedCount: 1 })
      const user = userEvent.setup()

      render(<DeleteDocument {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-confirm'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({ _id: 'doc123' })
      })
    })

    it('calls onSuccess after successful deletion', async () => {
      mockMutateAsync.mockResolvedValue({ deletedCount: 1 })
      const user = userEvent.setup()

      render(<DeleteDocument {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-confirm'))

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled()
      })
    })

    it('closes modal after successful deletion', async () => {
      mockMutateAsync.mockResolvedValue({ deletedCount: 1 })
      const user = userEvent.setup()

      render(<DeleteDocument {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-confirm'))

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('shows error message on deletion failure', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Delete failed'))
      const user = userEvent.setup()

      render(<DeleteDocument {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('delete-error')).toHaveTextContent(
          'Delete failed'
        )
      })
    })

    it('shows loading state during deletion', () => {
      vi.mocked(useDeleteDocumentMutation).mockReturnValue({
        ...mockMutation,
        isPending: true,
      } as any)

      render(<DeleteDocument {...defaultProps} />)
      expect(screen.getByTestId('delete-document-confirm')).toHaveTextContent(
        'Deleting...'
      )
      expect(screen.getByTestId('delete-document-confirm')).toBeDisabled()
    })
  })

  describe('cancel behavior', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup()

      render(<DeleteDocument {...defaultProps} />)
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })
})

describe('DeleteDocumentsBulk', () => {
  const defaultProps = {
    database: 'testdb',
    collection: 'testcoll',
    documentIds: ['doc1', 'doc2', 'doc3'],
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
    vi.mocked(useDeleteDocumentMutation).mockReturnValue(mockMutation as any)
  })

  it('renders with document count', () => {
    render(<DeleteDocumentsBulk {...defaultProps} />)
    expect(screen.getByText('Delete Documents')).toBeInTheDocument()
    expect(screen.getByText(/3 documents/)).toBeInTheDocument()
  })

  it('shows collection name', () => {
    render(<DeleteDocumentsBulk {...defaultProps} />)
    expect(screen.getByText(/testcoll/)).toBeInTheDocument()
  })

  it('shows warning message', () => {
    render(<DeleteDocumentsBulk {...defaultProps} />)
    expect(
      screen.getByText(/this action cannot be undone/i)
    ).toBeInTheDocument()
  })
})

describe('DeleteDocumentInline', () => {
  const mockDocument = {
    _id: 'doc123',
    name: 'Test',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDeleteDocumentMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any)
  })

  it('renders children and opens modal on click', async () => {
    const user = userEvent.setup()

    render(
      <DeleteDocumentInline
        database="testdb"
        collection="testcoll"
        document={mockDocument}
      >
        {({ onClick }) => (
          <button onClick={onClick} data-testid="trigger">
            Delete
          </button>
        )}
      </DeleteDocumentInline>
    )

    expect(screen.getByTestId('trigger')).toBeInTheDocument()
    expect(screen.queryByText('Delete Document')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('trigger'))

    expect(screen.getByText('Delete Document')).toBeInTheDocument()
  })
})
