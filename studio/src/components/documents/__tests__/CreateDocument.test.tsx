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

// Mock the JsonEditor component since CodeMirror doesn't work in jsdom
vi.mock('../JsonEditor', () => ({
  JsonEditor: ({ value, onChange, onValidChange, 'data-testid': testId }: {
    value: string
    onChange: (value: string) => void
    onValidChange?: (valid: boolean) => void
    'data-testid'?: string
  }) => {
    return (
      <textarea
        data-testid={testId || 'json-editor-mock'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          if (onValidChange) {
            try {
              JSON.parse(e.target.value)
              onValidChange(true)
            } catch {
              onValidChange(false)
            }
          }
        }}
      />
    )
  },
  formatJson: (str: string) => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2)
    } catch {
      return str
    }
  },
  parseJsonSafe: <T,>(str: string): { success: true; data: T } | { success: false; error: string } => {
    try {
      return { success: true, data: JSON.parse(str) as T }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
    }
  },
}))

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
    // Only run pending timers if fake timers are active
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    }
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

    it('uses latest onClose callback after prop change (stale closure test)', async () => {
      // This test verifies that handleSubmit uses the current handleClose,
      // not a stale version captured at initial render.
      // If handleClose is missing from useCallback deps, this would fail.
      const firstOnClose = vi.fn()
      const secondOnClose = vi.fn()
      mockMutateAsync.mockResolvedValue({ insertedId: 'new-id' })
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      const { rerender } = render(
        <CreateDocument {...defaultProps} onClose={firstOnClose} />
      )

      // Update onClose prop before submitting
      rerender(<CreateDocument {...defaultProps} onClose={secondOnClose} />)

      // Submit the form - should use the updated onClose (via handleClose)
      await user.click(screen.getByTestId('create-document-submit'))

      await waitFor(() => {
        // The second (updated) onClose should be called, not the first
        expect(secondOnClose).toHaveBeenCalled()
        expect(firstOnClose).not.toHaveBeenCalled()
      })
    })

    it('shows error message on mutation failure', async () => {
      // Use real timers for this test
      vi.useRealTimers()
      mockMutateAsync.mockRejectedValue(new Error('Insert failed'))
      const user = userEvent.setup()

      render(<CreateDocument {...defaultProps} />)
      await user.click(screen.getByTestId('create-document-submit'))

      await waitFor(() => {
        expect(screen.getByTestId('create-error')).toHaveTextContent(
          'Insert failed'
        )
      })

      // Restore fake timers for other tests
      vi.useFakeTimers({ shouldAdvanceTime: true })
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
      // LeafyGreen buttons use aria-disabled instead of native disabled attribute
      expect(screen.getByTestId('create-document-submit')).toHaveAttribute('aria-disabled', 'true')
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
