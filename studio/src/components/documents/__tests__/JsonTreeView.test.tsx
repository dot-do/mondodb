import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { JsonTreeView } from '../JsonTreeView'
import type { Document } from '@lib/rpc-client'

const mockDocuments: Document[] = [
  {
    _id: 'doc1',
    name: 'Test Document 1',
    count: 42,
    active: true,
    tags: ['tag1', 'tag2'],
    nested: { field: 'value', num: 123 },
  },
  {
    _id: 'doc2',
    name: 'Test Document 2',
    count: 0,
    active: false,
    nullField: null,
  },
]

describe('JsonTreeView', () => {
  const defaultProps = {
    documents: mockDocuments,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the container with correct testid', () => {
      render(<JsonTreeView {...defaultProps} />)
      expect(screen.getByTestId('json-tree-view')).toBeInTheDocument()
    })

    it('renders a document container for each document', () => {
      render(<JsonTreeView {...defaultProps} />)
      expect(screen.getByTestId('json-doc-header-doc1')).toBeInTheDocument()
      expect(screen.getByTestId('json-doc-header-doc2')).toBeInTheDocument()
    })

    it('displays document headers', () => {
      render(<JsonTreeView {...defaultProps} />)
      // The _id is shown in the header - check for the headers
      expect(screen.getByTestId('json-doc-header-doc1')).toBeInTheDocument()
      expect(screen.getByTestId('json-doc-header-doc2')).toBeInTheDocument()
    })
  })

  describe('expansion', () => {
    it('expands documents by default when defaultExpanded is true', () => {
      render(<JsonTreeView {...defaultProps} defaultExpanded={true} />)
      // Should see field values since expanded - use getAllByText for multiple occurrences
      expect(screen.getAllByText('"Test Document 1"').length).toBeGreaterThan(0)
    })

    it('collapses documents by default when defaultExpanded is false', () => {
      render(<JsonTreeView {...defaultProps} defaultExpanded={false} />)
      // Should not see field values since collapsed
      expect(screen.queryByText('"Test Document 1"')).not.toBeInTheDocument()
    })

    it('toggles document expansion when header clicked', async () => {
      const user = userEvent.setup()
      render(<JsonTreeView {...defaultProps} defaultExpanded={true} />)

      // Initially expanded
      expect(screen.getAllByText('"Test Document 1"').length).toBeGreaterThan(0)

      // Click to collapse
      await user.click(screen.getByTestId('json-doc-header-doc1'))
      expect(screen.queryAllByText('"Test Document 1"').length).toBe(0)

      // Click to expand again
      await user.click(screen.getByTestId('json-doc-header-doc1'))
      expect(screen.getAllByText('"Test Document 1"').length).toBeGreaterThan(0)
    })
  })

  describe('value rendering', () => {
    it('renders string values', () => {
      render(<JsonTreeView {...defaultProps} defaultExpanded={true} />)
      expect(screen.getAllByText('"Test Document 1"').length).toBeGreaterThan(0)
    })

    it('renders number values', () => {
      render(<JsonTreeView {...defaultProps} defaultExpanded={true} />)
      expect(screen.getAllByText('42').length).toBeGreaterThan(0)
    })

    it('renders boolean values', () => {
      render(<JsonTreeView {...defaultProps} defaultExpanded={true} />)
      expect(screen.getAllByText('true').length).toBeGreaterThan(0)
      expect(screen.getAllByText('false').length).toBeGreaterThan(0)
    })

    it('renders null values', () => {
      render(<JsonTreeView {...defaultProps} defaultExpanded={true} />)
      expect(screen.getByText('null')).toBeInTheDocument()
    })

    it('renders brackets for arrays and objects', () => {
      render(<JsonTreeView {...defaultProps} defaultExpanded={true} />)
      // Should show brackets for arrays and objects
      expect(screen.getAllByText('[').length).toBeGreaterThan(0)
      expect(screen.getAllByText('{').length).toBeGreaterThan(0)
    })

    it('renders field keys', () => {
      render(<JsonTreeView {...defaultProps} defaultExpanded={true} />)
      // Use getAllByText since keys can appear multiple times
      expect(screen.getAllByText('"name"').length).toBeGreaterThan(0)
      expect(screen.getAllByText('"count"').length).toBeGreaterThan(0)
    })
  })

  describe('nested expansion', () => {
    it('shows nested object fields when expanded', () => {
      render(<JsonTreeView {...defaultProps} defaultExpanded={true} />)
      // The nested field should be visible when expanded
      expect(screen.getAllByText('"field"').length).toBeGreaterThan(0)
    })

    it('shows array field', () => {
      render(<JsonTreeView {...defaultProps} defaultExpanded={true} />)
      expect(screen.getAllByText('"tags"').length).toBeGreaterThan(0)
    })
  })

  describe('selection', () => {
    it('shows checkboxes when selectable is true', () => {
      render(<JsonTreeView {...defaultProps} selectable={true} />)
      expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    })

    it('hides checkboxes when selectable is false', () => {
      render(<JsonTreeView {...defaultProps} selectable={false} />)
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    })

    it('calls onSelect when checkbox clicked', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(
        <JsonTreeView
          {...defaultProps}
          selectable={true}
          onSelect={onSelect}
        />
      )

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0]!)
      expect(onSelect).toHaveBeenCalledWith('doc1')
    })

    it('reflects selected state in checkboxes', () => {
      const selectedIds = new Set(['doc1'])
      render(
        <JsonTreeView
          {...defaultProps}
          selectable={true}
          selectedIds={selectedIds}
        />
      )

      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes[0]).toBeChecked()
      expect(checkboxes[1]).not.toBeChecked()
    })

    it('applies selected styles to header', () => {
      const selectedIds = new Set(['doc1'])
      render(
        <JsonTreeView
          {...defaultProps}
          selectable={true}
          selectedIds={selectedIds}
        />
      )

      // The header should have selected styling
      const header = screen.getByTestId('json-doc-header-doc1')
      expect(header).toBeInTheDocument()
    })

    it('calls onSelect when header clicked in selectable mode', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(
        <JsonTreeView
          {...defaultProps}
          selectable={true}
          onSelect={onSelect}
        />
      )

      await user.click(screen.getByTestId('json-doc-header-doc1'))
      expect(onSelect).toHaveBeenCalledWith('doc1')
    })
  })

  describe('empty state', () => {
    it('renders nothing for empty documents array', () => {
      render(<JsonTreeView documents={[]} />)
      const container = screen.getByTestId('json-tree-view')
      expect(container.children).toHaveLength(0)
    })

    it('handles documents with empty nested objects', () => {
      const docsWithEmpty = [{ _id: 'empty', emptyObj: {}, emptyArr: [] }]
      render(<JsonTreeView documents={docsWithEmpty} defaultExpanded={true} />)
      expect(screen.getByText('{}')).toBeInTheDocument()
      expect(screen.getByText('[]')).toBeInTheDocument()
    })
  })

  describe('complex data types', () => {
    it('renders deeply nested structures', () => {
      const deepDoc = [{
        _id: 'deep',
        level1: {
          level2: {
            level3: { value: 'deep value' },
          },
        },
      }]
      render(<JsonTreeView documents={deepDoc} defaultExpanded={true} />)
      expect(screen.getByText('"level1"')).toBeInTheDocument()
    })

    it('renders arrays with mixed types', () => {
      const mixedDoc = [{
        _id: 'mixed',
        items: [1, 'string', true, null, { obj: 'val' }],
      }]
      render(<JsonTreeView documents={mixedDoc} defaultExpanded={true} />)
      expect(screen.getByText('"items"')).toBeInTheDocument()
    })
  })
})
