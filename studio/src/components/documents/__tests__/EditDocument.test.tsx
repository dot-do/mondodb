import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { EditDocument, EditDocumentInline } from '../EditDocument'
import {
  useUpdateDocumentMutation,
  useDocumentQuery,
} from '@hooks/useQueries'

// Mock the hooks
vi.mock('@hooks/useQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hooks/useQueries')>()
  return {
    ...actual,
    useUpdateDocumentMutation: vi.fn(),
    useDocumentQuery: vi.fn(),
  }
})

describe('EditDocument', () => {
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
    initialDocument: mockDocument,
  }

  const mockMutateAsync = vi.fn()
  const mockMutation = {
    mutateAsync: mockMutateAsync,
    isPending: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(useUpdateDocumentMutation).mockReturnValue(mockMutation as any)
    vi.mocked(useDocumentQuery).mockReturnValue({
      data: mockDocument,
      isLoading: false,
      error: null,
    } as any)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders modal when open', () => {
      render(<EditDocument {...defaultProps} />)
      expect(screen.getByText('Edit Document')).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      render(<EditDocument {...defaultProps} open={false} />)
      expect(screen.queryByText('Edit Document')).not.toBeInTheDocument()
    })

    it('shows document ID', () => {
      render(<EditDocument {...defaultProps} />)
      expect(screen.getByText('doc123')).toBeInTheDocument()
    })

    it('shows loading state when fetching document', () => {
      vi.mocked(useDocumentQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any)

      render(<EditDocument {...defaultProps} initialDocument={undefined} />)
      // Should show skeleton loader
      expect(screen.queryByTestId('edit-document-editor')).not.toBeInTheDocument()
    })

    it('shows error when document fetch fails', () => {
      vi.mocked(useDocumentQuery).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Not found'),
      } as any)

      render(<EditDocument {...defaultProps} initialDocument={undefined} />)
      expect(screen.getByText(/failed to load document/i)).toBeInTheDocument()
    })
  })

  describe('change detection', () => {
    it('shows Modified badge when document is changed', async () => {
      render(<EditDocument {...defaultProps} />)

      // Initially should not show Modified
      expect(screen.queryByText('Modified')).not.toBeInTheDocument()
    })

    it('Save button is disabled when no changes', () => {
      render(<EditDocument {...defaultProps} />)
      expect(screen.getByTestId('edit-document-submit')).toBeDisabled()
    })
  })

  describe('form submission', () => {
    it('shows loading state during update', () => {
      vi.mocked(useUpdateDocumentMutation).mockReturnValue({
        ...mockMutation,
        isPending: true,
      } as any)

      render(<EditDocument {...defaultProps} />)
      expect(screen.getByTestId('edit-document-submit')).toHaveTextContent(
        'Saving...'
      )
    })
  })

  describe('cancel behavior', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      render(<EditDocument {...defaultProps} />)
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })
})

describe('EditDocumentInline', () => {
  const mockDocument = {
    _id: 'doc123',
    name: 'Test',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(useUpdateDocumentMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any)
    vi.mocked(useDocumentQuery).mockReturnValue({
      data: mockDocument,
      isLoading: false,
      error: null,
    } as any)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('renders children and opens modal on click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <EditDocumentInline
        database="testdb"
        collection="testcoll"
        document={mockDocument}
      >
        {({ onClick }) => (
          <button onClick={onClick} data-testid="trigger">
            Edit
          </button>
        )}
      </EditDocumentInline>
    )

    expect(screen.getByTestId('trigger')).toBeInTheDocument()
    expect(screen.queryByText('Edit Document')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('trigger'))

    expect(screen.getByText('Edit Document')).toBeInTheDocument()
  })
})
