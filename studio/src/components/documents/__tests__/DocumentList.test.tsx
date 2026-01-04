import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { DocumentList } from '../DocumentList'
import type { Document } from '@lib/rpc-client'

const mockDocuments: Document[] = [
  { _id: 'doc1', name: 'Test Document 1', count: 10, active: true },
  { _id: 'doc2', name: 'Test Document 2', count: 20, active: false },
  { _id: 'doc3', name: 'Test Document 3', count: 30, nested: { field: 'value' } },
]

describe('DocumentList', () => {
  const defaultProps = {
    documents: mockDocuments,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the document list container', () => {
      render(<DocumentList {...defaultProps} />)
      expect(screen.getByTestId('document-list')).toBeInTheDocument()
    })

    it('displays the correct document count', () => {
      render(<DocumentList {...defaultProps} />)
      expect(screen.getByText('3 documents')).toBeInTheDocument()
    })

    it('displays singular "document" for count of 1', () => {
      render(<DocumentList documents={[mockDocuments[0]!]} />)
      expect(screen.getByText('1 document')).toBeInTheDocument()
    })

    it('renders empty state when no documents', () => {
      render(<DocumentList documents={[]} />)
      expect(screen.getByTestId('document-list-empty')).toBeInTheDocument()
      expect(screen.getByText('No documents found')).toBeInTheDocument()
    })

    it('renders loading state', () => {
      render(<DocumentList {...defaultProps} loading={true} />)
      expect(screen.getByTestId('document-list-loading')).toBeInTheDocument()
    })

    it('renders error state', () => {
      render(<DocumentList {...defaultProps} error="Failed to load" />)
      expect(screen.getByTestId('document-list-error')).toBeInTheDocument()
      expect(screen.getByText('Failed to load')).toBeInTheDocument()
    })
  })

  describe('table view', () => {
    it('renders table view by default', () => {
      render(<DocumentList {...defaultProps} />)
      expect(screen.getByTestId('document-table')).toBeInTheDocument()
    })

    it('auto-generates columns from documents', () => {
      render(<DocumentList {...defaultProps} />)
      expect(screen.getByTestId('column-header-_id')).toBeInTheDocument()
      expect(screen.getByTestId('column-header-name')).toBeInTheDocument()
      expect(screen.getByTestId('column-header-count')).toBeInTheDocument()
    })

    it('renders document rows', () => {
      render(<DocumentList {...defaultProps} />)
      expect(screen.getByTestId('document-row-doc1')).toBeInTheDocument()
      expect(screen.getByTestId('document-row-doc2')).toBeInTheDocument()
      expect(screen.getByTestId('document-row-doc3')).toBeInTheDocument()
    })

    it('respects custom column configuration', () => {
      const columns = [
        { field: '_id', label: 'ID', sortable: true },
        { field: 'name', label: 'Document Name', sortable: true },
      ]
      render(<DocumentList {...defaultProps} columns={columns} />)

      expect(screen.getByText('ID')).toBeInTheDocument()
      expect(screen.getByText('Document Name')).toBeInTheDocument()
      expect(screen.queryByTestId('column-header-count')).not.toBeInTheDocument()
    })
  })

  describe('JSON view', () => {
    it('switches to JSON view when toggle clicked', async () => {
      const user = userEvent.setup()
      render(<DocumentList {...defaultProps} />)

      await user.click(screen.getByTestId('view-toggle-json'))
      expect(screen.getByTestId('json-view')).toBeInTheDocument()
      expect(screen.queryByTestId('document-table')).not.toBeInTheDocument()
    })

    it('switches back to table view', async () => {
      const user = userEvent.setup()
      render(<DocumentList {...defaultProps} defaultViewMode="json" />)

      expect(screen.getByTestId('json-view')).toBeInTheDocument()
      await user.click(screen.getByTestId('view-toggle-table'))
      expect(screen.getByTestId('document-table')).toBeInTheDocument()
    })

    it('sets correct aria-pressed state on view toggles', async () => {
      const user = userEvent.setup()
      render(<DocumentList {...defaultProps} />)

      const tableToggle = screen.getByTestId('view-toggle-table')
      const jsonToggle = screen.getByTestId('view-toggle-json')

      expect(tableToggle).toHaveAttribute('aria-pressed', 'true')
      expect(jsonToggle).toHaveAttribute('aria-pressed', 'false')

      await user.click(jsonToggle)

      expect(tableToggle).toHaveAttribute('aria-pressed', 'false')
      expect(jsonToggle).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('sorting', () => {
    it('calls onSort when column header clicked', async () => {
      const user = userEvent.setup()
      const onSort = vi.fn()
      render(<DocumentList {...defaultProps} onSort={onSort} />)

      const nameHeader = screen.getByTestId('column-header-name')
      await user.click(within(nameHeader).getByText('name'))

      expect(onSort).toHaveBeenCalledWith({ field: 'name', direction: 'asc' })
    })

    it('toggles sort direction on subsequent clicks', async () => {
      const user = userEvent.setup()
      const onSort = vi.fn()
      render(<DocumentList {...defaultProps} onSort={onSort} />)

      const nameHeader = screen.getByTestId('column-header-name')
      const nameLabel = within(nameHeader).getByText('name')

      await user.click(nameLabel)
      expect(onSort).toHaveBeenLastCalledWith({ field: 'name', direction: 'asc' })

      await user.click(nameLabel)
      expect(onSort).toHaveBeenLastCalledWith({ field: 'name', direction: 'desc' })

      await user.click(nameLabel)
      expect(onSort).toHaveBeenLastCalledWith(null)
    })

    it('does not sort non-sortable columns', async () => {
      const user = userEvent.setup()
      const onSort = vi.fn()
      const columns = [
        { field: '_id', label: 'ID', sortable: false },
        { field: 'name', label: 'Name', sortable: true },
      ]
      render(<DocumentList {...defaultProps} columns={columns} onSort={onSort} />)

      await user.click(screen.getByText('ID'))
      expect(onSort).not.toHaveBeenCalled()
    })
  })

  describe('filtering', () => {
    it('shows filter button for filterable columns', () => {
      render(<DocumentList {...defaultProps} />)
      expect(screen.getByTestId('filter-button-name')).toBeInTheDocument()
    })

    it('opens filter dropdown when filter button clicked', async () => {
      const user = userEvent.setup()
      render(<DocumentList {...defaultProps} />)

      await user.click(screen.getByTestId('filter-button-name'))
      expect(screen.getByTestId('filter-dropdown-name')).toBeInTheDocument()
    })

    it('adds filter when value entered and apply clicked', async () => {
      const user = userEvent.setup()
      const onFilter = vi.fn()
      render(<DocumentList {...defaultProps} onFilter={onFilter} />)

      await user.click(screen.getByTestId('filter-button-name'))
      await user.type(screen.getByTestId('filter-input-name'), 'test')
      await user.click(screen.getByText('Apply'))

      expect(onFilter).toHaveBeenCalledWith([
        { field: 'name', value: 'test', operator: 'contains' },
      ])
    })

    it('displays filter chips when filters active', async () => {
      const user = userEvent.setup()
      render(<DocumentList {...defaultProps} onFilter={vi.fn()} />)

      await user.click(screen.getByTestId('filter-button-name'))
      await user.type(screen.getByTestId('filter-input-name'), 'test')
      await user.click(screen.getByText('Apply'))

      expect(screen.getByTestId('filter-bar')).toBeInTheDocument()
      expect(screen.getByText(/name contains "test"/)).toBeInTheDocument()
    })

    it('removes filter when chip remove button clicked', async () => {
      const user = userEvent.setup()
      const onFilter = vi.fn()
      render(<DocumentList {...defaultProps} onFilter={onFilter} />)

      await user.click(screen.getByTestId('filter-button-name'))
      await user.type(screen.getByTestId('filter-input-name'), 'test')
      await user.click(screen.getByText('Apply'))

      await user.click(screen.getByTestId('remove-filter-0'))
      expect(onFilter).toHaveBeenLastCalledWith([])
    })
  })

  describe('selection', () => {
    it('does not show checkboxes when selectable is false', () => {
      render(<DocumentList {...defaultProps} selectable={false} />)
      expect(screen.queryByTestId('select-checkbox-doc1')).not.toBeInTheDocument()
    })

    it('shows checkboxes when selectable is true', () => {
      render(<DocumentList {...defaultProps} selectable={true} />)
      expect(screen.getByTestId('select-checkbox-doc1')).toBeInTheDocument()
    })

    it('calls onSelect when row checkbox clicked', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(<DocumentList {...defaultProps} selectable={true} onSelect={onSelect} />)

      await user.click(screen.getByTestId('select-checkbox-doc1'))
      expect(onSelect).toHaveBeenCalledWith(['doc1'])
    })

    it('supports single selection mode', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(
        <DocumentList
          {...defaultProps}
          selectable={true}
          multiSelect={false}
          onSelect={onSelect}
        />
      )

      await user.click(screen.getByTestId('select-checkbox-doc1'))
      expect(onSelect).toHaveBeenCalledWith(['doc1'])

      await user.click(screen.getByTestId('select-checkbox-doc2'))
      expect(onSelect).toHaveBeenCalledWith(['doc2'])
    })

    it('supports multi-selection mode', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(
        <DocumentList
          {...defaultProps}
          selectable={true}
          multiSelect={true}
          onSelect={onSelect}
        />
      )

      await user.click(screen.getByTestId('select-checkbox-doc1'))
      expect(onSelect).toHaveBeenCalledWith(['doc1'])

      await user.click(screen.getByTestId('select-checkbox-doc2'))
      expect(onSelect).toHaveBeenCalledWith(expect.arrayContaining(['doc1', 'doc2']))
    })

    it('shows select all checkbox in multi-select mode', () => {
      render(<DocumentList {...defaultProps} selectable={true} multiSelect={true} />)
      expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument()
    })

    it('selects all documents when select all clicked', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(
        <DocumentList
          {...defaultProps}
          selectable={true}
          multiSelect={true}
          onSelect={onSelect}
        />
      )

      await user.click(screen.getByTestId('select-all-checkbox'))
      expect(onSelect).toHaveBeenCalledWith(['doc1', 'doc2', 'doc3'])
    })

    it('displays selection info when items selected', async () => {
      const user = userEvent.setup()
      render(<DocumentList {...defaultProps} selectable={true} multiSelect={true} />)

      await user.click(screen.getByTestId('select-checkbox-doc1'))
      await user.click(screen.getByTestId('select-checkbox-doc2'))

      expect(screen.getByTestId('selection-info')).toBeInTheDocument()
      expect(screen.getByText('2 selected')).toBeInTheDocument()
    })

    it('clears selection when clear button clicked', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(
        <DocumentList
          {...defaultProps}
          selectable={true}
          multiSelect={true}
          onSelect={onSelect}
        />
      )

      await user.click(screen.getByTestId('select-checkbox-doc1'))
      await user.click(screen.getByText('Clear'))

      expect(onSelect).toHaveBeenLastCalledWith([])
    })
  })

  describe('expandable rows', () => {
    it('shows expand button for documents with nested content', () => {
      render(<DocumentList {...defaultProps} expandable={true} />)
      expect(screen.getByTestId('expand-button-doc3')).toBeInTheDocument()
    })

    it('expands row when expand button clicked', async () => {
      const user = userEvent.setup()
      render(<DocumentList {...defaultProps} expandable={true} />)

      await user.click(screen.getByTestId('expand-button-doc3'))
      expect(screen.getByTestId('expanded-row-doc3')).toBeInTheDocument()
    })

    it('collapses row when expand button clicked again', async () => {
      const user = userEvent.setup()
      render(<DocumentList {...defaultProps} expandable={true} />)

      await user.click(screen.getByTestId('expand-button-doc3'))
      expect(screen.getByTestId('expanded-row-doc3')).toBeInTheDocument()

      await user.click(screen.getByTestId('expand-button-doc3'))
      expect(screen.queryByTestId('expanded-row-doc3')).not.toBeInTheDocument()
    })
  })

  describe('document actions', () => {
    it('calls onDocumentClick when row clicked', async () => {
      const user = userEvent.setup()
      const onDocumentClick = vi.fn()
      render(<DocumentList {...defaultProps} onDocumentClick={onDocumentClick} />)

      await user.click(screen.getByTestId('document-row-doc1'))
      expect(onDocumentClick).toHaveBeenCalledWith(mockDocuments[0])
    })

    it('calls onDocumentEdit when edit button clicked in expanded row', async () => {
      const user = userEvent.setup()
      const onDocumentEdit = vi.fn()
      render(
        <DocumentList
          {...defaultProps}
          expandable={true}
          onDocumentEdit={onDocumentEdit}
        />
      )

      await user.click(screen.getByTestId('expand-button-doc3'))
      await user.click(screen.getByTestId('edit-button-doc3'))
      expect(onDocumentEdit).toHaveBeenCalledWith(mockDocuments[2])
    })

    it('calls onDocumentDelete when delete button clicked', async () => {
      const user = userEvent.setup()
      const onDocumentDelete = vi.fn()
      render(
        <DocumentList
          {...defaultProps}
          expandable={true}
          onDocumentDelete={onDocumentDelete}
        />
      )

      await user.click(screen.getByTestId('expand-button-doc3'))
      await user.click(screen.getByTestId('delete-button-doc3'))
      expect(onDocumentDelete).toHaveBeenCalledWith(mockDocuments[2])
    })
  })

  describe('pagination', () => {
    it('shows pagination when onPageChange provided and totalPages > 1', () => {
      render(
        <DocumentList
          {...defaultProps}
          totalCount={100}
          page={1}
          pageSize={20}
          onPageChange={vi.fn()}
        />
      )
      expect(screen.getByTestId('pagination')).toBeInTheDocument()
    })

    it('hides pagination when totalPages is 1', () => {
      render(
        <DocumentList
          {...defaultProps}
          totalCount={10}
          page={1}
          pageSize={20}
          onPageChange={vi.fn()}
        />
      )
      expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
    })
  })
})
