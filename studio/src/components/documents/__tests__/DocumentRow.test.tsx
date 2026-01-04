import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { DocumentRow } from '../DocumentRow'
import type { Document } from '@lib/rpc-client'
import type { ColumnConfig } from '../DocumentList'

const mockDocument: Document = {
  _id: 'test-doc-123',
  name: 'Test Document',
  count: 42,
  active: true,
  tags: ['tag1', 'tag2'],
  metadata: { created: '2024-01-01', author: 'test' },
}

const mockColumns: ColumnConfig[] = [
  { field: '_id', label: 'ID', sortable: true },
  { field: 'name', label: 'Name', sortable: true },
  { field: 'count', label: 'Count', sortable: true },
  { field: 'active', label: 'Active', sortable: true },
  { field: 'tags', label: 'Tags', sortable: false },
  { field: 'metadata', label: 'Metadata', sortable: false },
]

// Helper to wrap DocumentRow in a table
function renderDocumentRow(props: Partial<React.ComponentProps<typeof DocumentRow>> = {}) {
  const defaultProps = {
    document: mockDocument,
    columns: mockColumns,
    ...props,
  }

  return render(
    <table>
      <tbody>
        <DocumentRow {...defaultProps} />
      </tbody>
    </table>
  )
}

describe('DocumentRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders a table row with correct testid', () => {
      renderDocumentRow()
      expect(screen.getByTestId('document-row-test-doc-123')).toBeInTheDocument()
    })

    it('renders cell for each column', () => {
      renderDocumentRow()
      expect(screen.getByTestId('cell-test-doc-123-_id')).toBeInTheDocument()
      expect(screen.getByTestId('cell-test-doc-123-name')).toBeInTheDocument()
      expect(screen.getByTestId('cell-test-doc-123-count')).toBeInTheDocument()
    })

    it('displays string values correctly', () => {
      renderDocumentRow()
      expect(screen.getByText('Test Document')).toBeInTheDocument()
    })

    it('displays number values correctly', () => {
      renderDocumentRow()
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    it('displays boolean values correctly', () => {
      renderDocumentRow()
      expect(screen.getByText('true')).toBeInTheDocument()
    })

    it('displays array indicator for array values', () => {
      renderDocumentRow()
      expect(screen.getByText('Array(2)')).toBeInTheDocument()
    })

    it('displays object indicator for nested objects', () => {
      renderDocumentRow()
      expect(screen.getByText('Object(2)')).toBeInTheDocument()
    })

    it('displays null for null values', () => {
      const docWithNull = { ...mockDocument, nullField: null }
      const columns = [...mockColumns, { field: 'nullField', label: 'Null', sortable: false }]
      renderDocumentRow({ document: docWithNull, columns })
      expect(screen.getByText('null')).toBeInTheDocument()
    })
  })

  describe('selection', () => {
    it('shows checkbox when selectable is true', () => {
      renderDocumentRow({ selectable: true })
      expect(screen.getByTestId('select-checkbox-test-doc-123')).toBeInTheDocument()
    })

    it('hides checkbox when selectable is false', () => {
      renderDocumentRow({ selectable: false })
      expect(screen.queryByTestId('select-checkbox-test-doc-123')).not.toBeInTheDocument()
    })

    it('checkbox reflects selected state', () => {
      renderDocumentRow({ selectable: true, selected: true })
      expect(screen.getByTestId('select-checkbox-test-doc-123')).toBeChecked()
    })

    it('calls onSelect when checkbox clicked', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      renderDocumentRow({ selectable: true, onSelect })

      await user.click(screen.getByTestId('select-checkbox-test-doc-123'))
      expect(onSelect).toHaveBeenCalled()
    })

    it('applies selected styles when selected', () => {
      renderDocumentRow({ selectable: true, selected: true })
      expect(screen.getByTestId('document-row-test-doc-123')).toHaveAttribute(
        'aria-selected',
        'true'
      )
    })
  })

  describe('expandable', () => {
    it('shows expand button when expandable and has nested content', () => {
      renderDocumentRow({ expandable: true })
      expect(screen.getByTestId('expand-button-test-doc-123')).toBeInTheDocument()
    })

    it('hides expand button when not expandable', () => {
      renderDocumentRow({ expandable: false })
      expect(screen.queryByTestId('expand-button-test-doc-123')).not.toBeInTheDocument()
    })

    it('does not show expand button for documents without nested content', () => {
      const simpleDoc = { _id: 'simple', name: 'Simple', count: 1 }
      const simpleColumns = [
        { field: '_id', label: 'ID' },
        { field: 'name', label: 'Name' },
        { field: 'count', label: 'Count' },
      ]
      renderDocumentRow({ document: simpleDoc, columns: simpleColumns, expandable: true })
      expect(screen.queryByTestId('expand-button-simple')).not.toBeInTheDocument()
    })

    it('calls onToggleExpand when expand button clicked', async () => {
      const user = userEvent.setup()
      const onToggleExpand = vi.fn()
      renderDocumentRow({ expandable: true, onToggleExpand })

      await user.click(screen.getByTestId('expand-button-test-doc-123'))
      expect(onToggleExpand).toHaveBeenCalled()
    })

    it('shows expanded content when expanded', () => {
      renderDocumentRow({ expandable: true, expanded: true })
      expect(screen.getByTestId('expanded-row-test-doc-123')).toBeInTheDocument()
    })

    it('hides expanded content when not expanded', () => {
      renderDocumentRow({ expandable: true, expanded: false })
      expect(screen.queryByTestId('expanded-row-test-doc-123')).not.toBeInTheDocument()
    })

    it('shows correct aria-expanded state', () => {
      renderDocumentRow({ expandable: true, expanded: true })
      expect(screen.getByTestId('expand-button-test-doc-123')).toHaveAttribute(
        'aria-expanded',
        'true'
      )
    })
  })

  describe('expanded content', () => {
    it('displays document ID in expanded content', () => {
      renderDocumentRow({ expandable: true, expanded: true })
      expect(screen.getByText('_id: test-doc-123')).toBeInTheDocument()
    })

    it('shows edit button when onEdit provided', () => {
      renderDocumentRow({
        expandable: true,
        expanded: true,
        onEdit: vi.fn(),
      })
      expect(screen.getByTestId('edit-button-test-doc-123')).toBeInTheDocument()
    })

    it('calls onEdit when edit button clicked', async () => {
      const user = userEvent.setup()
      const onEdit = vi.fn()
      renderDocumentRow({ expandable: true, expanded: true, onEdit })

      await user.click(screen.getByTestId('edit-button-test-doc-123'))
      expect(onEdit).toHaveBeenCalled()
    })

    it('shows copy button in expanded content', () => {
      renderDocumentRow({ expandable: true, expanded: true })
      expect(screen.getByTestId('copy-button-test-doc-123')).toBeInTheDocument()
    })

    it('copies document JSON when copy button clicked', async () => {
      const user = userEvent.setup()
      const writeText = vi.fn().mockResolvedValue(undefined)

      // Mock clipboard API
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        writable: true,
        configurable: true,
      })

      renderDocumentRow({ expandable: true, expanded: true })
      await user.click(screen.getByTestId('copy-button-test-doc-123'))

      expect(writeText).toHaveBeenCalledWith(JSON.stringify(mockDocument, null, 2))
    })

    it('shows delete button when onDelete provided', () => {
      renderDocumentRow({
        expandable: true,
        expanded: true,
        onDelete: vi.fn(),
      })
      expect(screen.getByTestId('delete-button-test-doc-123')).toBeInTheDocument()
    })

    it('calls onDelete when delete button clicked', async () => {
      const user = userEvent.setup()
      const onDelete = vi.fn()
      renderDocumentRow({ expandable: true, expanded: true, onDelete })

      await user.click(screen.getByTestId('delete-button-test-doc-123'))
      expect(onDelete).toHaveBeenCalled()
    })
  })

  describe('row click', () => {
    it('calls onClick when row clicked', async () => {
      const user = userEvent.setup()
      const onClick = vi.fn()
      renderDocumentRow({ onClick })

      await user.click(screen.getByTestId('document-row-test-doc-123'))
      expect(onClick).toHaveBeenCalled()
    })

    it('does not call onClick when checkbox clicked', async () => {
      const user = userEvent.setup()
      const onClick = vi.fn()
      renderDocumentRow({ selectable: true, onClick })

      await user.click(screen.getByTestId('select-checkbox-test-doc-123'))
      expect(onClick).not.toHaveBeenCalled()
    })

    it('does not call onClick when expand button clicked', async () => {
      const user = userEvent.setup()
      const onClick = vi.fn()
      renderDocumentRow({ expandable: true, onClick })

      await user.click(screen.getByTestId('expand-button-test-doc-123'))
      expect(onClick).not.toHaveBeenCalled()
    })

    it('adds clickable styles when onClick provided', () => {
      renderDocumentRow({ onClick: vi.fn() })
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('handles keyboard navigation with Enter', async () => {
      const user = userEvent.setup()
      const onClick = vi.fn()
      renderDocumentRow({ onClick })

      const row = screen.getByTestId('document-row-test-doc-123')
      row.focus()
      await user.keyboard('{Enter}')
      expect(onClick).toHaveBeenCalled()
    })
  })

  describe('value formatting', () => {
    it('formats ObjectId correctly', () => {
      const docWithObjectId = {
        ...mockDocument,
        ref: { $oid: '507f1f77bcf86cd799439011' },
      }
      const columns = [...mockColumns, { field: 'ref', label: 'Ref' }]
      renderDocumentRow({ document: docWithObjectId, columns })
      expect(screen.getByText('507f1f77bcf86cd799439011')).toBeInTheDocument()
    })

    it('formats Date objects correctly', () => {
      const docWithDate = {
        ...mockDocument,
        created: { $date: '2024-01-15T10:30:00.000Z' },
      }
      const columns = [...mockColumns, { field: 'created', label: 'Created' }]
      renderDocumentRow({ document: docWithDate, columns })
      expect(screen.getByText(/2024-01-15/)).toBeInTheDocument()
    })

    it('shows title tooltip for truncated strings', () => {
      renderDocumentRow()
      const nameCell = screen.getByText('Test Document')
      expect(nameCell).toHaveAttribute('title', 'Test Document')
    })
  })
})
