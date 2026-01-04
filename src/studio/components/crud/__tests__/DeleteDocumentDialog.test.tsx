/**
 * DeleteDocumentDialog Component Tests
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DeleteDocumentDialog,
  DeleteDocumentsBulk,
  DeleteDocumentInline,
} from '../DeleteDocumentDialog'
import type { DeletionResult, Document } from '../DeleteDocumentDialog'

describe('DeleteDocumentDialog', () => {
  const mockDocument: Document = {
    _id: 'doc123',
    name: 'Test Document',
    count: 42,
  }

  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn()
  const mockOnSuccess = vi.fn()

  const defaultProps = {
    database: 'testdb',
    collection: 'testcoll',
    documentId: 'doc123',
    open: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
    onSuccess: mockOnSuccess,
    document: mockDocument,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnConfirm.mockResolvedValue({ success: true, deletedCount: 1 } as DeletionResult)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('rendering', () => {
    it('renders confirmation modal when open', () => {
      render(<DeleteDocumentDialog {...defaultProps} />)
      expect(screen.getByText('Delete Document')).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      render(<DeleteDocumentDialog {...defaultProps} open={false} />)
      expect(screen.queryByText('Delete Document')).not.toBeInTheDocument()
    })

    it('shows collection name', () => {
      render(<DeleteDocumentDialog {...defaultProps} />)
      expect(screen.getByText(/testcoll/)).toBeInTheDocument()
    })

    it('shows document ID', () => {
      render(<DeleteDocumentDialog {...defaultProps} />)
      expect(screen.getByText('doc123')).toBeInTheDocument()
    })

    it('shows document preview when provided', () => {
      render(<DeleteDocumentDialog {...defaultProps} />)
      expect(screen.getByTestId('delete-document-preview')).toBeInTheDocument()
      expect(screen.getByTestId('delete-document-preview')).toHaveTextContent(
        'Test Document'
      )
    })

    it('shows warning message', () => {
      render(<DeleteDocumentDialog {...defaultProps} />)
      expect(
        screen.getByText(/this action cannot be undone/i)
      ).toBeInTheDocument()
    })

    it('renders Delete button', () => {
      render(<DeleteDocumentDialog {...defaultProps} />)
      expect(screen.getByTestId('delete-document-confirm')).toHaveTextContent(
        'Delete'
      )
    })

    it('has correct dialog role', () => {
      render(<DeleteDocumentDialog {...defaultProps} />)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('has aria-modal attribute', () => {
      render(<DeleteDocumentDialog {...defaultProps} />)
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })
  })

  describe('deletion', () => {
    it('calls onConfirm with document ID on confirm', async () => {
      const user = userEvent.setup()

      render(<DeleteDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-confirm'))

      await waitFor(() => {
        expect(mockOnConfirm).toHaveBeenCalledWith(['doc123'])
      })
    })

    it('calls onSuccess after successful deletion', async () => {
      const user = userEvent.setup()

      render(<DeleteDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-confirm'))

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled()
      })
    })

    it('closes modal after successful deletion', async () => {
      const user = userEvent.setup()

      render(<DeleteDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-confirm'))

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled()
      })
    })

    it('shows error message on deletion failure', async () => {
      mockOnConfirm.mockRejectedValue(new Error('Delete failed'))
      const user = userEvent.setup()

      render(<DeleteDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('delete-error')).toHaveTextContent(
          'Delete failed'
        )
      })
    })

    it('shows error from result when deletion returns error', async () => {
      mockOnConfirm.mockResolvedValue({
        success: false,
        deletedCount: 0,
        error: 'Permission denied',
      })
      const user = userEvent.setup()

      render(<DeleteDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('delete-error')).toHaveTextContent(
          'Permission denied'
        )
      })
    })

    it('shows loading state during deletion', async () => {
      let resolvePromise: (value: DeletionResult) => void
      mockOnConfirm.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve
          })
      )

      const user = userEvent.setup()

      render(<DeleteDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-confirm'))

      expect(screen.getByTestId('delete-document-confirm')).toHaveTextContent(
        'Deleting...'
      )
      expect(screen.getByTestId('delete-document-confirm')).toBeDisabled()

      // Resolve the promise to clean up
      resolvePromise!({ success: true, deletedCount: 1 })
    })
  })

  describe('cancel behavior', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup()

      render(<DeleteDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('delete-cancel'))

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('calls onClose when overlay is clicked', async () => {
      const user = userEvent.setup()

      render(<DeleteDocumentDialog {...defaultProps} />)
      await user.click(screen.getByTestId('delete-document-dialog'))

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('does not close when dialog content is clicked', async () => {
      const user = userEvent.setup()

      render(<DeleteDocumentDialog {...defaultProps} />)
      await user.click(screen.getByText('Delete Document'))

      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })
})

describe('DeleteDocumentsBulk', () => {
  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn()
  const mockOnSuccess = vi.fn()

  const defaultProps = {
    database: 'testdb',
    collection: 'testcoll',
    documentIds: ['doc1', 'doc2', 'doc3'],
    open: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
    onSuccess: mockOnSuccess,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnConfirm.mockResolvedValue({ success: true, deletedCount: 3 })
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

  it('shows bulk delete button text', () => {
    render(<DeleteDocumentsBulk {...defaultProps} />)
    expect(screen.getByTestId('delete-document-confirm')).toHaveTextContent(
      'Delete 3 Documents'
    )
  })

  it('calls onConfirm with all document IDs', async () => {
    const user = userEvent.setup()

    render(<DeleteDocumentsBulk {...defaultProps} />)
    await user.click(screen.getByTestId('delete-document-confirm'))

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith(['doc1', 'doc2', 'doc3'])
    })
  })
})

describe('DeleteDocumentInline', () => {
  const mockDocument: Document = {
    _id: 'doc123',
    name: 'Test',
  }

  const mockOnConfirm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnConfirm.mockResolvedValue({ success: true, deletedCount: 1 })
  })

  it('renders children and opens modal on click', async () => {
    const user = userEvent.setup()

    render(
      <DeleteDocumentInline
        database="testdb"
        collection="testcoll"
        document={mockDocument}
        onConfirm={mockOnConfirm}
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

describe('Undo capability', () => {
  const mockDocument: Document = {
    _id: 'doc123',
    name: 'Test Document',
  }

  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn()
  const mockOnUndo = vi.fn()

  const propsWithUndo = {
    database: 'testdb',
    collection: 'testcoll',
    documentId: 'doc123',
    open: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
    onUndo: mockOnUndo,
    undoEnabled: true,
    document: mockDocument,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnConfirm.mockResolvedValue({
      success: true,
      deletedCount: 1,
      deletedDocuments: [mockDocument],
    })
  })

  it('shows undo notice when undo is enabled', () => {
    render(<DeleteDocumentDialog {...propsWithUndo} />)
    expect(screen.getByTestId('undo-notice')).toBeInTheDocument()
    expect(screen.getByText(/undo will be available/i)).toBeInTheDocument()
  })

  it('does not show undo notice when undo is disabled', () => {
    render(<DeleteDocumentDialog {...propsWithUndo} undoEnabled={false} />)
    expect(screen.queryByTestId('undo-notice')).not.toBeInTheDocument()
  })

  it('does not show undo notice when onUndo is not provided', () => {
    render(<DeleteDocumentDialog {...propsWithUndo} onUndo={undefined} />)
    expect(screen.queryByTestId('undo-notice')).not.toBeInTheDocument()
  })
})

describe('Multi-select delete support', () => {
  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnConfirm.mockResolvedValue({ success: true, deletedCount: 5 })
  })

  it('handles empty documentIds array', () => {
    render(
      <DeleteDocumentDialog
        database="testdb"
        collection="testcoll"
        documentIds={[]}
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )
    expect(screen.getByText('Delete Document')).toBeInTheDocument()
  })

  it('handles single item in documentIds array', () => {
    render(
      <DeleteDocumentDialog
        database="testdb"
        collection="testcoll"
        documentIds={['single-doc']}
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )
    expect(screen.getByText('Delete Document')).toBeInTheDocument()
  })

  it('handles multiple items showing bulk delete UI', () => {
    render(
      <DeleteDocumentDialog
        database="testdb"
        collection="testcoll"
        documentIds={['doc1', 'doc2', 'doc3', 'doc4', 'doc5']}
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )
    expect(screen.getByText('Delete Documents')).toBeInTheDocument()
    expect(screen.getByText(/5 documents/)).toBeInTheDocument()
  })

  it('prefers documentId over documentIds when both provided', async () => {
    const user = userEvent.setup()

    render(
      <DeleteDocumentDialog
        database="testdb"
        collection="testcoll"
        documentId="single-doc"
        documentIds={['doc1', 'doc2']}
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )

    await user.click(screen.getByTestId('delete-document-confirm'))

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith(['single-doc'])
    })
  })

  it('shows multiple document previews when documents array is small', () => {
    const documents = [
      { _id: 'doc1', name: 'First' },
      { _id: 'doc2', name: 'Second' },
    ]

    render(
      <DeleteDocumentDialog
        database="testdb"
        collection="testcoll"
        documentIds={['doc1', 'doc2']}
        documents={documents}
        open={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
      />
    )

    const preview = screen.getByTestId('delete-document-preview')
    expect(preview).toHaveTextContent('First')
    expect(preview).toHaveTextContent('Second')
  })
})
