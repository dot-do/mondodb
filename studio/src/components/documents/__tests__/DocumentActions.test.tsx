import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { DocumentActions, BulkDocumentActions } from '../DocumentActions'
import {
  useInsertDocumentMutation,
  useUpdateDocumentMutation,
  useDeleteDocumentMutation,
  useDocumentQuery,
} from '@hooks/useQueries'

// Mock the hooks
vi.mock('@hooks/useQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hooks/useQueries')>()
  return {
    ...actual,
    useInsertDocumentMutation: vi.fn(),
    useUpdateDocumentMutation: vi.fn(),
    useDeleteDocumentMutation: vi.fn(),
    useDocumentQuery: vi.fn(),
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

// Get the global clipboard mock set up in test/setup.ts
const getClipboardMock = () => {
  const mock = (globalThis as Record<string, unknown>).__clipboardMock as { writeText: ReturnType<typeof vi.fn> }
  return mock.writeText
}

// Mock URL methods
const mockCreateObjectURL = vi.fn(() => 'blob:test')
const mockRevokeObjectURL = vi.fn()
URL.createObjectURL = mockCreateObjectURL
URL.revokeObjectURL = mockRevokeObjectURL

describe('DocumentActions', () => {
  const mockDocument = {
    _id: 'doc123',
    name: 'Test Document',
    count: 42,
  }

  const defaultProps = {
    database: 'testdb',
    collection: 'testcoll',
    document: mockDocument,
  }

  const mockMutations = {
    mutateAsync: vi.fn(),
    isPending: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useInsertDocumentMutation).mockReturnValue(mockMutations as any)
    vi.mocked(useUpdateDocumentMutation).mockReturnValue(mockMutations as any)
    vi.mocked(useDeleteDocumentMutation).mockReturnValue(mockMutations as any)
    vi.mocked(useDocumentQuery).mockReturnValue({
      data: mockDocument,
      isLoading: false,
      error: null,
    } as any)
  })

  describe('menu variant', () => {
    it('renders menu trigger button', () => {
      render(<DocumentActions {...defaultProps} />)
      expect(screen.getByTestId('document-actions-menu')).toBeInTheDocument()
    })

    it('opens menu on click', async () => {
      const user = userEvent.setup()
      render(<DocumentActions {...defaultProps} />)

      await user.click(screen.getByTestId('document-actions-menu'))

      expect(screen.getByTestId('menu-action-edit')).toBeInTheDocument()
      expect(screen.getByTestId('menu-action-duplicate')).toBeInTheDocument()
      expect(screen.getByTestId('menu-action-delete')).toBeInTheDocument()
    })

    it('shows View option when onView is provided', async () => {
      const onView = vi.fn()
      const user = userEvent.setup()

      render(<DocumentActions {...defaultProps} onView={onView} />)
      await user.click(screen.getByTestId('document-actions-menu'))

      expect(screen.getByTestId('menu-action-view')).toBeInTheDocument()
    })

    it('does not show View option when onView is not provided', async () => {
      const user = userEvent.setup()

      render(<DocumentActions {...defaultProps} />)
      await user.click(screen.getByTestId('document-actions-menu'))

      expect(screen.queryByTestId('menu-action-view')).not.toBeInTheDocument()
    })
  })

  describe('inline variant', () => {
    it('renders inline action buttons', () => {
      render(<DocumentActions {...defaultProps} variant="inline" />)

      expect(screen.getByTestId('action-edit')).toBeInTheDocument()
      expect(screen.getByTestId('action-copy-json')).toBeInTheDocument()
      expect(screen.getByTestId('action-delete')).toBeInTheDocument()
    })

    it('shows View button when onView is provided', () => {
      render(
        <DocumentActions {...defaultProps} variant="inline" onView={() => {}} />
      )
      expect(screen.getByTestId('action-view')).toBeInTheDocument()
    })
  })

  describe('actions', () => {
    it('copies document ID to clipboard', async () => {
      const onActionComplete = vi.fn()
      const user = userEvent.setup()

      render(
        <DocumentActions
          {...defaultProps}
          onActionComplete={onActionComplete}
        />
      )

      await user.click(screen.getByTestId('document-actions-menu'))
      await user.click(screen.getByTestId('menu-action-copy-id'))

      // Wait for async clipboard operation to complete
      // onActionComplete is only called after successful clipboard write
      await waitFor(() => {
        expect(onActionComplete).toHaveBeenCalledWith('copy_id')
      })
    })

    it('copies document as JSON to clipboard', async () => {
      const onActionComplete = vi.fn()
      const user = userEvent.setup()

      render(
        <DocumentActions
          {...defaultProps}
          onActionComplete={onActionComplete}
        />
      )

      await user.click(screen.getByTestId('document-actions-menu'))
      await user.click(screen.getByTestId('menu-action-copy-json'))

      // Wait for async clipboard operation to complete
      // onActionComplete is only called after successful clipboard write
      await waitFor(() => {
        expect(onActionComplete).toHaveBeenCalledWith('copy_json')
      })
    })

    it('exports document as JSON file', async () => {
      const onActionComplete = vi.fn()
      const user = userEvent.setup()

      // Mock createElement and appendChild - save originals to restore
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      }
      const originalCreateElement = document.createElement.bind(document)
      const originalAppendChild = document.body.appendChild.bind(document.body)
      const originalRemoveChild = document.body.removeChild.bind(document.body)

      const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
        if (tagName === 'a') {
          return mockLink as any
        }
        return originalCreateElement(tagName)
      })
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        if (node === mockLink) return node as any
        return originalAppendChild(node)
      })
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => {
        if (node === mockLink) return node as any
        return originalRemoveChild(node)
      })

      try {
        render(
          <DocumentActions
            {...defaultProps}
            onActionComplete={onActionComplete}
          />
        )

        await user.click(screen.getByTestId('document-actions-menu'))
        await user.click(screen.getByTestId('menu-action-export'))

        expect(mockCreateObjectURL).toHaveBeenCalled()
        expect(mockLink.download).toBe('testcoll-doc123.json')
        expect(mockLink.click).toHaveBeenCalled()
        expect(onActionComplete).toHaveBeenCalledWith('export_json')
      } finally {
        // Restore original methods
        createElementSpy.mockRestore()
        appendChildSpy.mockRestore()
        removeChildSpy.mockRestore()
      }
    })

    it('duplicates document without _id', async () => {
      const onActionComplete = vi.fn()
      const user = userEvent.setup()

      render(
        <DocumentActions
          {...defaultProps}
          onActionComplete={onActionComplete}
        />
      )

      await user.click(screen.getByTestId('document-actions-menu'))
      await user.click(screen.getByTestId('menu-action-duplicate'))

      await waitFor(() => {
        expect(mockMutations.mutateAsync).toHaveBeenCalledWith({
          name: 'Test Document',
          count: 42,
        })
      })
    })

    it('opens edit modal', async () => {
      const user = userEvent.setup()

      render(<DocumentActions {...defaultProps} />)

      await user.click(screen.getByTestId('document-actions-menu'))
      await user.click(screen.getByTestId('menu-action-edit'))

      expect(screen.getByRole('heading', { name: 'Edit Document' })).toBeInTheDocument()
    })

    it('opens delete modal', async () => {
      const user = userEvent.setup()

      render(<DocumentActions {...defaultProps} />)

      await user.click(screen.getByTestId('document-actions-menu'))
      await user.click(screen.getByTestId('menu-action-delete'))

      expect(screen.getByRole('heading', { name: 'Delete Document' })).toBeInTheDocument()
    })
  })

  describe('action filtering', () => {
    it('only shows specified actions', async () => {
      const user = userEvent.setup()

      render(
        <DocumentActions
          {...defaultProps}
          actions={['edit', 'delete']}
        />
      )

      await user.click(screen.getByTestId('document-actions-menu'))

      expect(screen.getByTestId('menu-action-edit')).toBeInTheDocument()
      expect(screen.getByTestId('menu-action-delete')).toBeInTheDocument()
      expect(
        screen.queryByTestId('menu-action-duplicate')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('menu-action-copy-id')
      ).not.toBeInTheDocument()
    })
  })
})

describe('BulkDocumentActions', () => {
  const mockDocuments = [
    { _id: 'doc1', name: 'Doc 1' },
    { _id: 'doc2', name: 'Doc 2' },
    { _id: 'doc3', name: 'Doc 3' },
  ]

  const defaultProps = {
    database: 'testdb',
    collection: 'testcoll',
    selectedDocuments: mockDocuments,
    onClear: vi.fn(),
    onActionComplete: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDeleteDocumentMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as any)
  })

  it('renders nothing when no documents selected', () => {
    render(
      <BulkDocumentActions {...defaultProps} selectedDocuments={[]} />
    )
    expect(screen.queryByTestId('bulk-actions')).not.toBeInTheDocument()
  })

  it('shows selection count', () => {
    render(<BulkDocumentActions {...defaultProps} />)
    expect(screen.getByText('3 selected')).toBeInTheDocument()
  })

  it('renders Copy button', () => {
    render(<BulkDocumentActions {...defaultProps} />)
    expect(screen.getByTestId('bulk-copy')).toBeInTheDocument()
  })

  it('renders Export button', () => {
    render(<BulkDocumentActions {...defaultProps} />)
    expect(screen.getByTestId('bulk-export')).toBeInTheDocument()
  })

  it('renders Delete button', () => {
    render(<BulkDocumentActions {...defaultProps} />)
    expect(screen.getByTestId('bulk-delete')).toBeInTheDocument()
  })

  it('renders Clear Selection button', () => {
    render(<BulkDocumentActions {...defaultProps} />)
    expect(screen.getByTestId('bulk-clear')).toBeInTheDocument()
  })

  it('calls onClear when Clear Selection is clicked', async () => {
    const user = userEvent.setup()

    render(<BulkDocumentActions {...defaultProps} />)
    await user.click(screen.getByTestId('bulk-clear'))

    expect(defaultProps.onClear).toHaveBeenCalled()
  })

  it('copies all documents to clipboard', async () => {
    const user = userEvent.setup()

    render(<BulkDocumentActions {...defaultProps} />)
    await user.click(screen.getByTestId('bulk-copy'))

    // Wait for async clipboard operation to complete
    // onActionComplete is only called after successful clipboard write
    await waitFor(() => {
      expect(defaultProps.onActionComplete).toHaveBeenCalledWith('copy')
    })
  })

  it('exports all documents as JSON', async () => {
    const user = userEvent.setup()

    // Mock createElement and appendChild - save originals to restore
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    }
    const originalCreateElement = document.createElement.bind(document)
    const originalAppendChild = document.body.appendChild.bind(document.body)
    const originalRemoveChild = document.body.removeChild.bind(document.body)

    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') {
        return mockLink as any
      }
      return originalCreateElement(tagName)
    })
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node === mockLink) return node as any
      return originalAppendChild(node)
    })
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => {
      if (node === mockLink) return node as any
      return originalRemoveChild(node)
    })

    try {
      render(<BulkDocumentActions {...defaultProps} />)
      await user.click(screen.getByTestId('bulk-export'))

      expect(mockCreateObjectURL).toHaveBeenCalled()
      expect(mockLink.download).toContain('testcoll-export-')
      expect(mockLink.click).toHaveBeenCalled()
      expect(defaultProps.onActionComplete).toHaveBeenCalledWith('export')
    } finally {
      // Restore original methods
      createElementSpy.mockRestore()
      appendChildSpy.mockRestore()
      removeChildSpy.mockRestore()
    }
  })
})
