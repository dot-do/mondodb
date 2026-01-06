/**
 * PipelinePreview Unit Tests
 *
 * RED Phase: These tests define the expected behavior for the PipelinePreview component
 * which displays aggregation pipeline execution results with pagination, loading states,
 * error handling, and JSON formatting.
 *
 * The PipelinePreview component is responsible for:
 * - Displaying preview results from pipeline execution
 * - Showing loading state while pipeline runs
 * - Displaying errors when pipeline fails
 * - Handling empty results gracefully
 * - Paginating through large result sets
 * - Formatting JSON results for readability
 * - Showing result count/statistics
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { PipelinePreview } from '../PipelinePreview'

// Mock result documents
const mockResults = [
  { _id: '1', name: 'Product A', category: 'Electronics', price: 299.99, stock: 50 },
  { _id: '2', name: 'Product B', category: 'Books', price: 19.99, stock: 100 },
  { _id: '3', name: 'Product C', category: 'Electronics', price: 149.99, stock: 25 },
  { _id: '4', name: 'Product D', category: 'Clothing', price: 49.99, stock: 200 },
  { _id: '5', name: 'Product E', category: 'Books', price: 29.99, stock: 75 },
]

const mockAggregatedResults = [
  { _id: 'Electronics', totalRevenue: 449.98, count: 2 },
  { _id: 'Books', totalRevenue: 49.98, count: 2 },
  { _id: 'Clothing', totalRevenue: 49.99, count: 1 },
]

const mockNestedResults = [
  {
    _id: '1',
    user: { name: 'John', profile: { age: 30, city: 'NYC' } },
    orders: [{ id: 'o1', total: 100 }, { id: 'o2', total: 200 }],
  },
  {
    _id: '2',
    user: { name: 'Jane', profile: { age: 25, city: 'LA' } },
    orders: [{ id: 'o3', total: 150 }],
  },
]

describe('PipelinePreview', () => {
  const defaultProps = {
    results: mockResults,
    loading: false,
    error: null as string | null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('preview panel rendering', () => {
    it('renders the preview panel container', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('pipeline-preview')).toBeInTheDocument()
    })

    it('renders the preview panel header', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('preview-header')).toBeInTheDocument()
    })

    it('displays "Preview" title in header', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByText('Preview')).toBeInTheDocument()
    })

    it('renders the results container', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('preview-results')).toBeInTheDocument()
    })

    it('renders refresh button in header', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('refresh-preview-button')).toBeInTheDocument()
    })

    it('calls onRefresh when refresh button clicked', async () => {
      const user = userEvent.setup()
      const onRefresh = vi.fn()
      render(<PipelinePreview {...defaultProps} onRefresh={onRefresh} />)

      await user.click(screen.getByTestId('refresh-preview-button'))
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('disables refresh button when loading', () => {
      render(<PipelinePreview {...defaultProps} loading={true} />)
      expect(screen.getByTestId('refresh-preview-button')).toBeDisabled()
    })
  })

  describe('result documents display', () => {
    it('renders all result documents', () => {
      render(<PipelinePreview {...defaultProps} />)

      const documents = screen.getAllByTestId(/^result-document-/)
      expect(documents).toHaveLength(5)
    })

    it('displays document with correct id test attribute', () => {
      render(<PipelinePreview {...defaultProps} />)

      expect(screen.getByTestId('result-document-0')).toBeInTheDocument()
      expect(screen.getByTestId('result-document-1')).toBeInTheDocument()
      expect(screen.getByTestId('result-document-2')).toBeInTheDocument()
    })

    it('displays document content as JSON', () => {
      render(<PipelinePreview {...defaultProps} results={[mockResults[0]!]} />)

      const doc = screen.getByTestId('result-document-0')
      expect(doc).toHaveTextContent('Product A')
      expect(doc).toHaveTextContent('Electronics')
      expect(doc).toHaveTextContent('299.99')
    })

    it('displays nested object properties', () => {
      render(<PipelinePreview {...defaultProps} results={mockNestedResults} />)

      const doc = screen.getByTestId('result-document-0')
      expect(doc).toHaveTextContent('John')
      expect(doc).toHaveTextContent('NYC')
    })

    it('displays array values correctly', () => {
      render(<PipelinePreview {...defaultProps} results={mockNestedResults} />)

      const doc = screen.getByTestId('result-document-0')
      expect(doc).toHaveTextContent('orders')
    })

    it('renders aggregated results with _id grouping field', () => {
      render(<PipelinePreview {...defaultProps} results={mockAggregatedResults} />)

      expect(screen.getByTestId('result-document-0')).toHaveTextContent('Electronics')
      expect(screen.getByTestId('result-document-0')).toHaveTextContent('449.98')
    })

    it('shows document index number', () => {
      render(<PipelinePreview {...defaultProps} />)

      // Document indices should be displayed (1-indexed for user display)
      expect(screen.getByTestId('document-index-0')).toHaveTextContent('1')
      expect(screen.getByTestId('document-index-1')).toHaveTextContent('2')
    })
  })

  describe('pagination controls', () => {
    const manyResults = Array.from({ length: 50 }, (_, i) => ({
      _id: String(i + 1),
      name: `Item ${i + 1}`,
      value: i * 10,
    }))

    it('renders pagination when results exceed page size', () => {
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)
      expect(screen.getByTestId('preview-pagination')).toBeInTheDocument()
    })

    it('hides pagination when results fit on one page', () => {
      render(<PipelinePreview {...defaultProps} results={mockResults} pageSize={20} />)
      expect(screen.queryByTestId('preview-pagination')).not.toBeInTheDocument()
    })

    it('displays page info showing current range and total', () => {
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)
      expect(screen.getByTestId('page-info')).toHaveTextContent('1-10 of 50')
    })

    it('renders first page button', () => {
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)
      expect(screen.getByTestId('first-page-button')).toBeInTheDocument()
    })

    it('renders previous page button', () => {
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)
      expect(screen.getByTestId('prev-page-button')).toBeInTheDocument()
    })

    it('renders next page button', () => {
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)
      expect(screen.getByTestId('next-page-button')).toBeInTheDocument()
    })

    it('renders last page button', () => {
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)
      expect(screen.getByTestId('last-page-button')).toBeInTheDocument()
    })

    it('disables first and prev buttons on first page', () => {
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)

      expect(screen.getByTestId('first-page-button')).toBeDisabled()
      expect(screen.getByTestId('prev-page-button')).toBeDisabled()
    })

    it('navigates to next page when next button clicked', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)

      await user.click(screen.getByTestId('next-page-button'))

      expect(screen.getByTestId('page-info')).toHaveTextContent('11-20 of 50')
    })

    it('navigates to previous page when prev button clicked', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)

      // Go to page 2 first
      await user.click(screen.getByTestId('next-page-button'))
      expect(screen.getByTestId('page-info')).toHaveTextContent('11-20 of 50')

      // Go back to page 1
      await user.click(screen.getByTestId('prev-page-button'))
      expect(screen.getByTestId('page-info')).toHaveTextContent('1-10 of 50')
    })

    it('navigates to first page when first button clicked', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)

      // Go to page 3
      await user.click(screen.getByTestId('next-page-button'))
      await user.click(screen.getByTestId('next-page-button'))
      expect(screen.getByTestId('page-info')).toHaveTextContent('21-30 of 50')

      // Go to first page
      await user.click(screen.getByTestId('first-page-button'))
      expect(screen.getByTestId('page-info')).toHaveTextContent('1-10 of 50')
    })

    it('navigates to last page when last button clicked', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)

      await user.click(screen.getByTestId('last-page-button'))
      expect(screen.getByTestId('page-info')).toHaveTextContent('41-50 of 50')
    })

    it('disables next and last buttons on last page', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)

      await user.click(screen.getByTestId('last-page-button'))

      expect(screen.getByTestId('next-page-button')).toBeDisabled()
      expect(screen.getByTestId('last-page-button')).toBeDisabled()
    })

    it('shows correct documents for current page', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)

      // First page should show items 1-10
      expect(screen.getByTestId('result-document-0')).toHaveTextContent('Item 1')
      expect(screen.getByTestId('result-document-9')).toHaveTextContent('Item 10')

      // Navigate to page 2
      await user.click(screen.getByTestId('next-page-button'))

      // Second page should show items 11-20
      expect(screen.getByTestId('result-document-0')).toHaveTextContent('Item 11')
      expect(screen.getByTestId('result-document-9')).toHaveTextContent('Item 20')
    })

    it('handles partial last page correctly', async () => {
      const user = userEvent.setup()
      const results45 = manyResults.slice(0, 45)
      render(<PipelinePreview {...defaultProps} results={results45} pageSize={10} />)

      await user.click(screen.getByTestId('last-page-button'))

      // Last page should show 41-45 of 45
      expect(screen.getByTestId('page-info')).toHaveTextContent('41-45 of 45')

      // Only 5 documents should be displayed
      const documents = screen.getAllByTestId(/^result-document-/)
      expect(documents).toHaveLength(5)
    })

    it('supports configurable page size', () => {
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={25} />)
      expect(screen.getByTestId('page-info')).toHaveTextContent('1-25 of 50')
    })

    it('renders page size selector when enabled', () => {
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} showPageSizeSelector />)
      expect(screen.getByTestId('page-size-select')).toBeInTheDocument()
    })

    it('changes page size when selector value changed', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} showPageSizeSelector />)

      await user.selectOptions(screen.getByTestId('page-size-select'), '25')

      expect(screen.getByTestId('page-info')).toHaveTextContent('1-25 of 50')
    })

    it('resets to first page when page size changes', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} showPageSizeSelector />)

      // Go to page 3
      await user.click(screen.getByTestId('next-page-button'))
      await user.click(screen.getByTestId('next-page-button'))
      expect(screen.getByTestId('page-info')).toHaveTextContent('21-30 of 50')

      // Change page size
      await user.selectOptions(screen.getByTestId('page-size-select'), '25')

      // Should reset to first page
      expect(screen.getByTestId('page-info')).toHaveTextContent('1-25 of 50')
    })
  })

  describe('loading state', () => {
    it('displays loading spinner when loading', () => {
      render(<PipelinePreview {...defaultProps} loading={true} results={[]} />)
      expect(screen.getByTestId('preview-loading')).toBeInTheDocument()
    })

    it('displays loading message', () => {
      render(<PipelinePreview {...defaultProps} loading={true} results={[]} />)
      expect(screen.getByText(/running pipeline/i)).toBeInTheDocument()
    })

    it('hides results when loading', () => {
      render(<PipelinePreview {...defaultProps} loading={true} />)
      expect(screen.queryByTestId('result-document-0')).not.toBeInTheDocument()
    })

    it('hides pagination when loading', () => {
      const manyResults = Array.from({ length: 50 }, (_, i) => ({ _id: String(i) }))
      render(<PipelinePreview {...defaultProps} results={manyResults} loading={true} pageSize={10} />)
      expect(screen.queryByTestId('preview-pagination')).not.toBeInTheDocument()
    })

    it('shows loading animation', () => {
      render(<PipelinePreview {...defaultProps} loading={true} results={[]} />)
      const spinner = screen.getByTestId('preview-loading')
      expect(spinner).toHaveAttribute('role', 'progressbar')
    })

    it('hides result count when loading', () => {
      render(<PipelinePreview {...defaultProps} loading={true} results={[]} />)
      expect(screen.queryByTestId('result-count')).not.toBeInTheDocument()
    })

    it('shows custom loading message when provided', () => {
      render(<PipelinePreview {...defaultProps} loading={true} loadingMessage="Executing aggregation..." results={[]} />)
      expect(screen.getByText('Executing aggregation...')).toBeInTheDocument()
    })
  })

  describe('error state display', () => {
    const errorProps = {
      ...defaultProps,
      results: [],
      error: 'Pipeline execution failed: Invalid $match operator',
    }

    it('displays error container when error present', () => {
      render(<PipelinePreview {...errorProps} />)
      expect(screen.getByTestId('preview-error')).toBeInTheDocument()
    })

    it('displays error message', () => {
      render(<PipelinePreview {...errorProps} />)
      expect(screen.getByText(/Pipeline execution failed/)).toBeInTheDocument()
    })

    it('displays error icon', () => {
      render(<PipelinePreview {...errorProps} />)
      expect(screen.getByTestId('error-icon')).toBeInTheDocument()
    })

    it('hides results when error present', () => {
      render(<PipelinePreview {...errorProps} />)
      expect(screen.queryByTestId('preview-results')).not.toBeInTheDocument()
    })

    it('hides pagination when error present', () => {
      render(<PipelinePreview {...errorProps} />)
      expect(screen.queryByTestId('preview-pagination')).not.toBeInTheDocument()
    })

    it('displays retry button when error present', () => {
      render(<PipelinePreview {...errorProps} onRefresh={vi.fn()} />)
      expect(screen.getByTestId('retry-button')).toBeInTheDocument()
    })

    it('calls onRefresh when retry button clicked', async () => {
      const user = userEvent.setup()
      const onRefresh = vi.fn()
      render(<PipelinePreview {...errorProps} onRefresh={onRefresh} />)

      await user.click(screen.getByTestId('retry-button'))
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('displays detailed error when expandable', async () => {
      const user = userEvent.setup()
      const detailedError = {
        ...defaultProps,
        results: [],
        error: 'Pipeline execution failed',
        errorDetails: 'Stage 2 ($group): Field "category" not found in document',
      }
      render(<PipelinePreview {...detailedError} />)

      await user.click(screen.getByTestId('show-error-details'))
      expect(screen.getByText(/Stage 2/)).toBeInTheDocument()
    })

    it('displays error stage indicator when provided', () => {
      const errorWithStage = {
        ...defaultProps,
        results: [],
        error: 'Invalid operator',
        errorStage: 2,
      }
      render(<PipelinePreview {...errorWithStage} />)
      expect(screen.getByTestId('error-stage-indicator')).toHaveTextContent('Stage 2')
    })

    it('applies error styling to container', () => {
      render(<PipelinePreview {...errorProps} />)
      const errorContainer = screen.getByTestId('preview-error')
      expect(errorContainer).toHaveClass('error')
    })
  })

  describe('empty results state', () => {
    it('displays empty state when no results', () => {
      render(<PipelinePreview {...defaultProps} results={[]} />)
      expect(screen.getByTestId('preview-empty')).toBeInTheDocument()
    })

    it('displays empty message', () => {
      render(<PipelinePreview {...defaultProps} results={[]} />)
      expect(screen.getByText(/no documents/i)).toBeInTheDocument()
    })

    it('displays empty state icon', () => {
      render(<PipelinePreview {...defaultProps} results={[]} />)
      expect(screen.getByTestId('empty-icon')).toBeInTheDocument()
    })

    it('does not display empty state when loading', () => {
      render(<PipelinePreview {...defaultProps} results={[]} loading={true} />)
      expect(screen.queryByTestId('preview-empty')).not.toBeInTheDocument()
    })

    it('does not display empty state when error present', () => {
      render(<PipelinePreview {...defaultProps} results={[]} error="Failed" />)
      expect(screen.queryByTestId('preview-empty')).not.toBeInTheDocument()
    })

    it('hides pagination when results empty', () => {
      render(<PipelinePreview {...defaultProps} results={[]} />)
      expect(screen.queryByTestId('preview-pagination')).not.toBeInTheDocument()
    })

    it('shows custom empty message when provided', () => {
      render(<PipelinePreview {...defaultProps} results={[]} emptyMessage="Pipeline returned no documents. Try adjusting your stages." />)
      expect(screen.getByText(/Try adjusting your stages/)).toBeInTheDocument()
    })

    it('shows suggestion to modify pipeline in empty state', () => {
      render(<PipelinePreview {...defaultProps} results={[]} />)
      expect(screen.getByText(/modify your pipeline/i)).toBeInTheDocument()
    })
  })

  describe('result count display', () => {
    it('displays result count in header', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('result-count')).toBeInTheDocument()
    })

    it('shows correct count for results', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('result-count')).toHaveTextContent('5 documents')
    })

    it('uses singular "document" for count of 1', () => {
      render(<PipelinePreview {...defaultProps} results={[mockResults[0]!]} />)
      expect(screen.getByTestId('result-count')).toHaveTextContent('1 document')
    })

    it('shows "0 documents" for empty results', () => {
      render(<PipelinePreview {...defaultProps} results={[]} />)
      // When empty, the empty state shows instead
      expect(screen.queryByTestId('result-count')).not.toBeInTheDocument()
    })

    it('formats large result counts with locale formatting', () => {
      const manyResults = Array.from({ length: 1234 }, (_, i) => ({ _id: String(i) }))
      render(<PipelinePreview {...defaultProps} results={manyResults} />)
      // Should show 1,234 documents (locale formatted)
      expect(screen.getByTestId('result-count')).toHaveTextContent('1,234 documents')
    })

    it('shows total count when paginated', () => {
      const manyResults = Array.from({ length: 100 }, (_, i) => ({ _id: String(i) }))
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)
      expect(screen.getByTestId('result-count')).toHaveTextContent('100 documents')
    })

    it('shows execution time when provided', () => {
      render(<PipelinePreview {...defaultProps} executionTimeMs={245} />)
      expect(screen.getByTestId('execution-time')).toHaveTextContent('245ms')
    })

    it('formats execution time in seconds when large', () => {
      render(<PipelinePreview {...defaultProps} executionTimeMs={3456} />)
      expect(screen.getByTestId('execution-time')).toHaveTextContent('3.46s')
    })
  })

  describe('JSON formatting', () => {
    it('renders document content with proper JSON structure', () => {
      render(<PipelinePreview {...defaultProps} results={[mockResults[0]!]} />)

      const doc = screen.getByTestId('result-document-0')
      // Should contain properly formatted JSON keys and values
      expect(doc).toHaveTextContent('_id')
      expect(doc).toHaveTextContent('name')
      expect(doc).toHaveTextContent('Product A')
    })

    it('displays nested objects with proper indentation', () => {
      render(<PipelinePreview {...defaultProps} results={mockNestedResults} />)

      const doc = screen.getByTestId('result-document-0')
      expect(doc).toHaveTextContent('user')
      expect(doc).toHaveTextContent('profile')
    })

    it('displays arrays with brackets', () => {
      render(<PipelinePreview {...defaultProps} results={mockNestedResults} />)

      const doc = screen.getByTestId('result-document-0')
      // Array should be visible with bracket notation
      expect(doc).toHaveTextContent('[')
      expect(doc).toHaveTextContent(']')
    })

    it('syntax highlights JSON keys', () => {
      render(<PipelinePreview {...defaultProps} results={[mockResults[0]!]} />)

      const keyElements = screen.getAllByTestId('json-key')
      expect(keyElements.length).toBeGreaterThan(0)
    })

    it('syntax highlights string values', () => {
      render(<PipelinePreview {...defaultProps} results={[mockResults[0]!]} />)

      const stringElements = screen.getAllByTestId('json-string')
      expect(stringElements.length).toBeGreaterThan(0)
    })

    it('syntax highlights number values', () => {
      render(<PipelinePreview {...defaultProps} results={[mockResults[0]!]} />)

      const numberElements = screen.getAllByTestId('json-number')
      expect(numberElements.length).toBeGreaterThan(0)
    })

    it('syntax highlights boolean values', () => {
      const boolResults = [{ _id: '1', active: true, deleted: false }]
      render(<PipelinePreview {...defaultProps} results={boolResults} />)

      const boolElements = screen.getAllByTestId('json-boolean')
      expect(boolElements.length).toBe(2)
    })

    it('syntax highlights null values', () => {
      const nullResults = [{ _id: '1', value: null }]
      render(<PipelinePreview {...defaultProps} results={nullResults} />)

      expect(screen.getByTestId('json-null')).toBeInTheDocument()
    })

    it('supports collapsible nested objects', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={mockNestedResults} collapsible />)

      // Find and click collapse toggle for nested object
      const collapseToggle = screen.getByTestId('collapse-toggle-user')
      await user.click(collapseToggle)

      // Nested content should be hidden
      expect(screen.queryByText('NYC')).not.toBeInTheDocument()
    })

    it('supports expanding collapsed objects', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={mockNestedResults} collapsible />)

      const collapseToggle = screen.getByTestId('collapse-toggle-user')

      // Collapse first
      await user.click(collapseToggle)
      expect(screen.queryByText('NYC')).not.toBeInTheDocument()

      // Expand again
      await user.click(collapseToggle)
      expect(screen.getByText('NYC')).toBeInTheDocument()
    })

    it('shows collapsed indicator for collapsed objects', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={mockNestedResults} collapsible />)

      const collapseToggle = screen.getByTestId('collapse-toggle-user')
      await user.click(collapseToggle)

      expect(screen.getByText('{...}')).toBeInTheDocument()
    })

    it('shows collapsed indicator for collapsed arrays', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={mockNestedResults} collapsible />)

      const collapseToggle = screen.getByTestId('collapse-toggle-orders')
      await user.click(collapseToggle)

      expect(screen.getByText('[...]')).toBeInTheDocument()
    })
  })

  describe('view modes', () => {
    it('renders in JSON view mode by default', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('json-view')).toBeInTheDocument()
    })

    it('renders view toggle when showViewToggle is true', () => {
      render(<PipelinePreview {...defaultProps} showViewToggle />)
      expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
    })

    it('switches to table view when table toggle clicked', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} showViewToggle />)

      await user.click(screen.getByTestId('view-toggle-table'))

      expect(screen.getByTestId('table-view')).toBeInTheDocument()
      expect(screen.queryByTestId('json-view')).not.toBeInTheDocument()
    })

    it('switches back to JSON view when JSON toggle clicked', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} showViewToggle defaultViewMode="table" />)

      await user.click(screen.getByTestId('view-toggle-json'))

      expect(screen.getByTestId('json-view')).toBeInTheDocument()
      expect(screen.queryByTestId('table-view')).not.toBeInTheDocument()
    })

    it('renders table with columns from document keys', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} showViewToggle />)

      await user.click(screen.getByTestId('view-toggle-table'))

      expect(screen.getByTestId('column-header-_id')).toBeInTheDocument()
      expect(screen.getByTestId('column-header-name')).toBeInTheDocument()
      expect(screen.getByTestId('column-header-category')).toBeInTheDocument()
    })

    it('renders table rows for each document', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} showViewToggle />)

      await user.click(screen.getByTestId('view-toggle-table'))

      const rows = screen.getAllByTestId(/^table-row-/)
      expect(rows).toHaveLength(5)
    })
  })

  describe('copy functionality', () => {
    it('renders copy button for each document', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('copy-document-0')).toBeInTheDocument()
    })

    it('copies document JSON when copy button clicked', async () => {
      const user = userEvent.setup()
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true
      })

      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('copy-document-0'))

      expect(mockWriteText).toHaveBeenCalledWith(
        expect.stringContaining('Product A')
      )
    })

    it('shows copy confirmation after successful copy', async () => {
      const user = userEvent.setup()
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true
      })

      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('copy-document-0'))

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument()
      })
    })

    it('renders copy all button when multiple results', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('copy-all-button')).toBeInTheDocument()
    })

    it('copies all documents when copy all clicked', async () => {
      const user = userEvent.setup()
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true
      })

      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('copy-all-button'))

      expect(mockWriteText).toHaveBeenCalledWith(
        expect.stringContaining('Product A')
      )
      expect(mockWriteText).toHaveBeenCalledWith(
        expect.stringContaining('Product E')
      )
    })
  })

  describe('expand/collapse documents', () => {
    it('shows expand button for each document', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('expand-document-0')).toBeInTheDocument()
    })

    it('expands document to full view when expand clicked', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('expand-document-0'))

      expect(screen.getByTestId('expanded-document-view')).toBeInTheDocument()
    })

    it('closes expanded view when close button clicked', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('expand-document-0'))
      await user.click(screen.getByTestId('close-expanded-view'))

      expect(screen.queryByTestId('expanded-document-view')).not.toBeInTheDocument()
    })

    it('shows full JSON in expanded view without truncation', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} results={mockNestedResults} />)

      await user.click(screen.getByTestId('expand-document-0'))

      const expandedView = screen.getByTestId('expanded-document-view')
      expect(expandedView).toHaveTextContent('profile')
      expect(expandedView).toHaveTextContent('orders')
    })

    it('supports keyboard navigation in expanded view', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      await user.click(screen.getByTestId('expand-document-0'))

      // Press Escape to close
      await user.keyboard('{Escape}')

      expect(screen.queryByTestId('expanded-document-view')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has proper aria-label on preview container', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('pipeline-preview')).toHaveAttribute(
        'aria-label',
        'Pipeline preview results'
      )
    })

    it('has proper role for results list', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('preview-results')).toHaveAttribute('role', 'list')
    })

    it('documents have listitem role', () => {
      render(<PipelinePreview {...defaultProps} />)
      const documents = screen.getAllByTestId(/^result-document-/)
      documents.forEach((doc) => {
        expect(doc).toHaveAttribute('role', 'listitem')
      })
    })

    it('loading state has proper aria-busy', () => {
      render(<PipelinePreview {...defaultProps} loading={true} results={[]} />)
      expect(screen.getByTestId('pipeline-preview')).toHaveAttribute('aria-busy', 'true')
    })

    it('error state has proper role', () => {
      render(<PipelinePreview {...defaultProps} results={[]} error="Failed" />)
      expect(screen.getByTestId('preview-error')).toHaveAttribute('role', 'alert')
    })

    it('pagination buttons have proper aria-labels', () => {
      const manyResults = Array.from({ length: 50 }, (_, i) => ({ _id: String(i) }))
      render(<PipelinePreview {...defaultProps} results={manyResults} pageSize={10} />)

      expect(screen.getByTestId('first-page-button')).toHaveAccessibleName('First page')
      expect(screen.getByTestId('prev-page-button')).toHaveAccessibleName('Previous page')
      expect(screen.getByTestId('next-page-button')).toHaveAccessibleName('Next page')
      expect(screen.getByTestId('last-page-button')).toHaveAccessibleName('Last page')
    })

    it('copy buttons have proper aria-labels', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('copy-document-0')).toHaveAccessibleName('Copy document')
    })

    it('expand buttons have proper aria-labels', () => {
      render(<PipelinePreview {...defaultProps} />)
      expect(screen.getByTestId('expand-document-0')).toHaveAccessibleName('Expand document')
    })

    it('supports keyboard navigation through documents', async () => {
      const user = userEvent.setup()
      render(<PipelinePreview {...defaultProps} />)

      const results = screen.getByTestId('preview-results')
      results.focus()

      await user.tab()
      expect(screen.getByTestId('result-document-0')).toHaveFocus()

      await user.keyboard('{ArrowDown}')
      expect(screen.getByTestId('result-document-1')).toHaveFocus()
    })
  })

  describe('maxDocuments prop', () => {
    it('limits displayed documents to maxDocuments', () => {
      const manyResults = Array.from({ length: 100 }, (_, i) => ({ _id: String(i) }))
      render(<PipelinePreview {...defaultProps} results={manyResults} maxDocuments={20} />)

      expect(screen.getByTestId('result-count')).toHaveTextContent('20 of 100 documents')
    })

    it('shows "showing first N" message when truncated', () => {
      const manyResults = Array.from({ length: 100 }, (_, i) => ({ _id: String(i) }))
      render(<PipelinePreview {...defaultProps} results={manyResults} maxDocuments={20} />)

      expect(screen.getByText(/showing first 20/i)).toBeInTheDocument()
    })

    it('does not show truncation message when all results shown', () => {
      render(<PipelinePreview {...defaultProps} maxDocuments={100} />)

      expect(screen.queryByText(/showing first/i)).not.toBeInTheDocument()
    })
  })

  describe('controlled pagination', () => {
    it('calls onPageChange when page changes', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()
      const manyResults = Array.from({ length: 50 }, (_, i) => ({ _id: String(i) }))
      render(
        <PipelinePreview
          {...defaultProps}
          results={manyResults}
          pageSize={10}
          onPageChange={onPageChange}
        />
      )

      await user.click(screen.getByTestId('next-page-button'))

      expect(onPageChange).toHaveBeenCalledWith(2)
    })

    it('respects controlled page prop', () => {
      const manyResults = Array.from({ length: 50 }, (_, i) => ({ _id: String(i) }))
      render(
        <PipelinePreview
          {...defaultProps}
          results={manyResults}
          pageSize={10}
          page={3}
        />
      )

      expect(screen.getByTestId('page-info')).toHaveTextContent('21-30 of 50')
    })

    it('calls onPageSizeChange when page size changes', async () => {
      const user = userEvent.setup()
      const onPageSizeChange = vi.fn()
      const manyResults = Array.from({ length: 50 }, (_, i) => ({ _id: String(i) }))
      render(
        <PipelinePreview
          {...defaultProps}
          results={manyResults}
          pageSize={10}
          showPageSizeSelector
          onPageSizeChange={onPageSizeChange}
        />
      )

      await user.selectOptions(screen.getByTestId('page-size-select'), '25')

      expect(onPageSizeChange).toHaveBeenCalledWith(25)
    })
  })

  describe('stage-by-stage intermediate results - RED PHASE', () => {
    // Mock pipeline stages for testing
    const mockStages = [
      { $match: { category: 'Electronics' } },
      { $group: { _id: '$category', totalRevenue: { $sum: '$price' }, count: { $sum: 1 } } },
      { $sort: { totalRevenue: -1 } },
    ]

    // Intermediate results for each stage
    const mockIntermediateResults = [
      // Stage 0 results (after $match)
      [
        { _id: '1', name: 'Product A', category: 'Electronics', price: 299.99 },
        { _id: '3', name: 'Product C', category: 'Electronics', price: 149.99 },
      ],
      // Stage 1 results (after $group)
      [
        { _id: 'Electronics', totalRevenue: 449.98, count: 2 },
      ],
      // Stage 2 results (after $sort)
      [
        { _id: 'Electronics', totalRevenue: 449.98, count: 2 },
      ],
    ]

    describe('stage-by-stage display', () => {
      it('renders stage-by-stage view toggle when stageResults prop provided', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )
        expect(screen.getByTestId('stage-view-toggle')).toBeInTheDocument()
      })

      it('shows all stages in stage selector', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        expect(screen.getByTestId('stage-selector')).toBeInTheDocument()

        // Should show stages 0, 1, 2 and "Final" option
        expect(screen.getByTestId('stage-option-0')).toBeInTheDocument()
        expect(screen.getByTestId('stage-option-1')).toBeInTheDocument()
        expect(screen.getByTestId('stage-option-2')).toBeInTheDocument()
        expect(screen.getByTestId('stage-option-final')).toBeInTheDocument()
      })

      it('displays stage labels with operator names', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        expect(screen.getByText(/Stage 0.*\$match/i)).toBeInTheDocument()
        expect(screen.getByText(/Stage 1.*\$group/i)).toBeInTheDocument()
        expect(screen.getByText(/Stage 2.*\$sort/i)).toBeInTheDocument()
      })

      it('shows final results by default', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        // Final results should be displayed
        const resultCount = screen.getByTestId('result-count')
        expect(resultCount).toHaveTextContent('1 document')
      })

      it('switches to stage 0 results when stage 0 selected', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        await user.click(screen.getByTestId('stage-option-0'))

        // Should show stage 0 results (2 documents after $match)
        expect(screen.getByTestId('result-count')).toHaveTextContent('2 documents')
        expect(screen.getByTestId('result-document-0')).toHaveTextContent('Product A')
        expect(screen.getByTestId('result-document-1')).toHaveTextContent('Product C')
      })

      it('switches to stage 1 results when stage 1 selected', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        await user.click(screen.getByTestId('stage-option-1'))

        // Should show stage 1 results (1 document after $group)
        expect(screen.getByTestId('result-count')).toHaveTextContent('1 document')
        expect(screen.getByTestId('result-document-0')).toHaveTextContent('Electronics')
        expect(screen.getByTestId('result-document-0')).toHaveTextContent('449.98')
      })

      it('displays active stage indicator', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        await user.click(screen.getByTestId('stage-option-1'))

        expect(screen.getByTestId('active-stage-indicator')).toHaveTextContent('Stage 1')
      })

      it('shows stage result count for each stage', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        // Each stage option should show its result count
        expect(screen.getByTestId('stage-option-0')).toHaveTextContent('2')
        expect(screen.getByTestId('stage-option-1')).toHaveTextContent('1')
        expect(screen.getByTestId('stage-option-2')).toHaveTextContent('1')
      })
    })

    describe('sequential stage execution', () => {
      it('shows loading state for each stage during sequential execution', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[]}
            stages={mockStages}
            loading={true}
            currentExecutingStage={0}
          />
        )

        expect(screen.getByTestId('stage-execution-progress')).toBeInTheDocument()
        expect(screen.getByTestId('executing-stage-0')).toBeInTheDocument()
      })

      it('displays progress indicator showing which stage is executing', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[]}
            stages={mockStages}
            loading={true}
            currentExecutingStage={1}
          />
        )

        expect(screen.getByTestId('executing-stage-1')).toBeInTheDocument()
        expect(screen.getByText(/executing stage 1/i)).toBeInTheDocument()
      })

      it('marks completed stages with checkmark indicator', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[1]!}
            stageResults={mockIntermediateResults.slice(0, 2)}
            stages={mockStages}
            loading={true}
            currentExecutingStage={2}
          />
        )

        // Stages 0 and 1 should be marked as complete
        expect(screen.getByTestId('stage-0-complete')).toBeInTheDocument()
        expect(screen.getByTestId('stage-1-complete')).toBeInTheDocument()
        expect(screen.queryByTestId('stage-2-complete')).not.toBeInTheDocument()
      })

      it('shows pending state for stages not yet executed', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[mockIntermediateResults[0]!]}
            stages={mockStages}
            loading={true}
            currentExecutingStage={1}
          />
        )

        // Stage 2 should be pending
        expect(screen.getByTestId('stage-2-pending')).toBeInTheDocument()
      })

      it('displays execution time per stage', () => {
        const stageExecutionTimes = [120, 450, 30]
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            stageExecutionTimes={stageExecutionTimes}
          />
        )

        expect(screen.getByTestId('stage-0-execution-time')).toHaveTextContent('120ms')
        expect(screen.getByTestId('stage-1-execution-time')).toHaveTextContent('450ms')
        expect(screen.getByTestId('stage-2-execution-time')).toHaveTextContent('30ms')
      })

      it('shows total pipeline execution time', () => {
        const stageExecutionTimes = [120, 450, 30]
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            stageExecutionTimes={stageExecutionTimes}
            executionTimeMs={600}
          />
        )

        expect(screen.getByTestId('total-execution-time')).toHaveTextContent('600ms')
      })

      it('displays result count change between stages', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        await user.click(screen.getByTestId('stage-option-0'))
        expect(screen.getByTestId('result-count')).toHaveTextContent('2 documents')

        await user.click(screen.getByTestId('stage-option-1'))
        expect(screen.getByTestId('result-count')).toHaveTextContent('1 document')
      })

      it('shows percentage of documents filtered at each stage', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            showStageMetrics={true}
          />
        )

        // Stage 0: 2 docs, Stage 1: 1 doc (50% reduction)
        expect(screen.getByTestId('stage-1-reduction')).toHaveTextContent('50%')
      })
    })

    describe('per-stage error handling', () => {
      const stagesWithError = [
        { $match: { category: 'Electronics' } },
        { $group: { _id: '$invalidField', total: { $sum: '$price' } } },
        { $sort: { total: -1 } },
      ]

      it('displays error at the specific stage where it occurred', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[mockIntermediateResults[0]!]}
            stages={stagesWithError}
            error="Field 'invalidField' not found"
            errorStage={1}
          />
        )

        expect(screen.getByTestId('preview-error')).toBeInTheDocument()
        expect(screen.getByTestId('error-stage-indicator')).toHaveTextContent('Stage 1')
      })

      it('marks the error stage with error indicator', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[mockIntermediateResults[0]!]}
            stages={stagesWithError}
            error="Field 'invalidField' not found"
            errorStage={1}
          />
        )

        expect(screen.getByTestId('stage-1-error')).toBeInTheDocument()
      })

      it('shows successful results from stages before error', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[mockIntermediateResults[0]!]}
            stages={stagesWithError}
            error="Field 'invalidField' not found"
            errorStage={1}
          />
        )

        // Should be able to view stage 0 results even though stage 1 failed
        await user.click(screen.getByTestId('stage-option-0'))

        expect(screen.getByTestId('result-document-0')).toBeInTheDocument()
        expect(screen.getByTestId('result-count')).toHaveTextContent('2 documents')
      })

      it('disables stage selector for stages after error', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[mockIntermediateResults[0]!]}
            stages={stagesWithError}
            error="Field 'invalidField' not found"
            errorStage={1}
          />
        )

        // Stage 2 should be disabled since stage 1 failed
        expect(screen.getByTestId('stage-option-2')).toHaveAttribute('disabled')
      })

      it('displays stage-specific error message when available', () => {
        const stageErrors = {
          1: { message: "Field 'invalidField' not found", code: 'FIELD_NOT_FOUND' },
        }

        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[mockIntermediateResults[0]!]}
            stages={stagesWithError}
            stageErrors={stageErrors}
            errorStage={1}
          />
        )

        expect(screen.getByTestId('stage-1-error-message')).toHaveTextContent("Field 'invalidField' not found")
      })

      it('shows error icon on failed stage in stage selector', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[mockIntermediateResults[0]!]}
            stages={stagesWithError}
            error="Field 'invalidField' not found"
            errorStage={1}
          />
        )

        const stageOption = screen.getByTestId('stage-option-1')
        expect(within(stageOption).getByTestId('error-icon')).toBeInTheDocument()
      })

      it('allows retry from failed stage', async () => {
        const user = userEvent.setup()
        const onRetryFromStage = vi.fn()

        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[mockIntermediateResults[0]!]}
            stages={stagesWithError}
            error="Field 'invalidField' not found"
            errorStage={1}
            onRetryFromStage={onRetryFromStage}
          />
        )

        await user.click(screen.getByTestId('retry-from-stage-1'))

        expect(onRetryFromStage).toHaveBeenCalledWith(1)
      })

      it('displays validation errors before execution', () => {
        const stageValidationErrors = {
          0: { message: '$match stage requires a query object', isValidationError: true },
        }

        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={[]}
            stages={stagesWithError}
            stageErrors={stageValidationErrors}
          />
        )

        expect(screen.getByTestId('stage-0-validation-error')).toBeInTheDocument()
      })
    })

    describe('stage navigation and inspection', () => {
      it('supports keyboard navigation through stages', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        const stageSelector = screen.getByTestId('stage-selector')
        stageSelector.focus()

        await user.keyboard('{ArrowLeft}')
        expect(screen.getByTestId('result-count')).toHaveTextContent('1 document')

        await user.keyboard('{ArrowLeft}')
        expect(screen.getByTestId('result-count')).toHaveTextContent('2 documents')
      })

      it('shows stage code snippet when stage is selected', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            showStageCode={true}
          />
        )

        await user.click(screen.getByTestId('stage-option-0'))

        expect(screen.getByTestId('stage-code-snippet')).toBeInTheDocument()
        expect(screen.getByTestId('stage-code-snippet')).toHaveTextContent('$match')
      })

      it('highlights differences between stage results', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            showDiff={true}
          />
        )

        await user.click(screen.getByTestId('stage-option-1'))

        // Should highlight what changed from stage 0 to stage 1
        expect(screen.getByTestId('stage-diff-indicator')).toBeInTheDocument()
      })

      it('supports comparing results between two stages', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        await user.click(screen.getByTestId('compare-stages-button'))

        expect(screen.getByTestId('stage-comparison-view')).toBeInTheDocument()
      })

      it('displays cumulative pipeline up to selected stage', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            showCumulativePipeline={true}
          />
        )

        await user.click(screen.getByTestId('stage-option-1'))

        const cumulativePipeline = screen.getByTestId('cumulative-pipeline')
        expect(cumulativePipeline).toHaveTextContent('$match')
        expect(cumulativePipeline).toHaveTextContent('$group')
        expect(cumulativePipeline).not.toHaveTextContent('$sort')
      })
    })

    describe('stage result caching', () => {
      it('caches stage results for quick navigation', async () => {
        const user = userEvent.setup()
        const onFetchStageResults = vi.fn()

        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            onFetchStageResults={onFetchStageResults}
          />
        )

        // Navigate to stage 1
        await user.click(screen.getByTestId('stage-option-1'))

        // Navigate back to final
        await user.click(screen.getByTestId('stage-option-final'))

        // Navigate to stage 1 again - should use cached results
        await user.click(screen.getByTestId('stage-option-1'))

        // Should not fetch again since results are cached
        expect(onFetchStageResults).not.toHaveBeenCalled()
      })

      it('indicates when stage results are loading', async () => {
        const user = userEvent.setup()

        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={[]}
            stages={mockStages}
            loadingStageIndex={1}
          />
        )

        await user.click(screen.getByTestId('stage-option-1'))

        expect(screen.getByTestId('stage-results-loading')).toBeInTheDocument()
      })
    })

    describe('empty stage results', () => {
      const emptyStageResults = [
        [{ _id: '1', status: 'active' }],
        [], // Stage 1 returns no results
        [],
      ]

      it('displays empty state for stage with no results', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={emptyStageResults}
            stages={mockStages}
          />
        )

        await user.click(screen.getByTestId('stage-option-1'))

        expect(screen.getByTestId('preview-empty')).toBeInTheDocument()
        expect(screen.getByText(/stage 1 returned no documents/i)).toBeInTheDocument()
      })

      it('shows warning when stage filters out all documents', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={[]}
            stageResults={emptyStageResults}
            stages={mockStages}
          />
        )

        await user.click(screen.getByTestId('stage-option-1'))

        expect(screen.getByTestId('empty-stage-warning')).toBeInTheDocument()
      })
    })

    describe('stage result export', () => {
      it('allows exporting results from specific stage', async () => {
        const user = userEvent.setup()
        const onExportStageResults = vi.fn()

        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            onExportStageResults={onExportStageResults}
          />
        )

        await user.click(screen.getByTestId('stage-option-1'))
        await user.click(screen.getByTestId('export-stage-results'))

        expect(onExportStageResults).toHaveBeenCalledWith(1, mockIntermediateResults[1])
      })

      it('includes stage information in export', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        await user.click(screen.getByTestId('stage-option-1'))

        const exportButton = screen.getByTestId('export-stage-results')
        expect(exportButton).toHaveAccessibleName(/export.*stage 1/i)
      })
    })

    describe('performance with large results - RED PHASE', () => {
      // Generate large result sets for performance testing
      const generateLargeResults = (count: number) =>
        Array.from({ length: count }, (_, i) => ({
          _id: `doc-${i}`,
          name: `Document ${i}`,
          value: Math.random() * 1000,
          category: `Category ${i % 10}`,
          nested: { field1: i, field2: `nested-${i}` },
        }))

      const largeStageResults = [
        generateLargeResults(10000), // Stage 0: 10k docs
        generateLargeResults(5000),  // Stage 1: 5k docs
        generateLargeResults(100),   // Stage 2: 100 docs (aggregated)
      ]

      const manyStages = Array.from({ length: 20 }, (_, i) => ({
        [`$stage${i}`]: { field: `value${i}` },
      }))

      it('handles large result sets without performance degradation', () => {
        const startTime = performance.now()

        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={largeStageResults}
            stages={mockStages}
          />
        )

        const renderTime = performance.now() - startTime
        // Should render within 500ms even with large datasets
        expect(renderTime).toBeLessThan(500)
        expect(screen.getByTestId('stage-selector')).toBeInTheDocument()
      })

      it('virtualizes stage results list for performance', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={largeStageResults}
            stages={mockStages}
            enableVirtualization={true}
          />
        )

        await user.click(screen.getByTestId('stage-option-0'))

        // Should use virtualization - only visible items rendered
        expect(screen.getByTestId('virtualized-results-container')).toBeInTheDocument()

        // Should not render all 10k documents at once
        const visibleDocuments = screen.getAllByTestId(/^result-document-/)
        expect(visibleDocuments.length).toBeLessThan(100)
      })

      it('shows loading placeholder while switching to large result set', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={largeStageResults}
            stages={mockStages}
          />
        )

        await user.click(screen.getByTestId('stage-option-0'))

        // Should show loading state while processing large result set
        expect(screen.getByTestId('stage-results-loading-placeholder')).toBeInTheDocument()
      })

      it('supports lazy loading of stage results', async () => {
        const user = userEvent.setup()
        const onLoadStageResults = vi.fn()

        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={[]} // Start with no cached results
            stages={mockStages}
            lazyLoadStageResults={true}
            onLoadStageResults={onLoadStageResults}
          />
        )

        await user.click(screen.getByTestId('stage-option-0'))

        // Should request to load stage results on demand
        expect(onLoadStageResults).toHaveBeenCalledWith(0)
      })

      it('handles pipelines with many stages efficiently', () => {
        const manyStageResults = manyStages.map((_, i) =>
          generateLargeResults(100 - i * 5)
        )

        render(
          <PipelinePreview
            {...defaultProps}
            results={manyStageResults[manyStages.length - 1]!}
            stageResults={manyStageResults}
            stages={manyStages}
          />
        )

        // Should render all 20 stage options
        expect(screen.getByTestId('stage-option-0')).toBeInTheDocument()
        expect(screen.getByTestId('stage-option-19')).toBeInTheDocument()
      })

      it('paginates stage selector when many stages exist', () => {
        const manyStageResults = manyStages.map(() => generateLargeResults(10))

        render(
          <PipelinePreview
            {...defaultProps}
            results={manyStageResults[manyStages.length - 1]!}
            stageResults={manyStageResults}
            stages={manyStages}
          />
        )

        // Should show stage pagination when > 10 stages
        expect(screen.getByTestId('stage-selector-pagination')).toBeInTheDocument()
      })

      it('truncates intermediate results based on maxStageDocuments prop', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={largeStageResults}
            stages={mockStages}
            maxStageDocuments={100}
          />
        )

        await user.click(screen.getByTestId('stage-option-0'))

        // Should show truncation message
        expect(screen.getByText(/showing first 100 of 10,000/i)).toBeInTheDocument()
      })

      it('shows memory usage warning for large stage results', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={largeStageResults}
            stages={mockStages}
            showMemoryWarning={true}
          />
        )

        await user.click(screen.getByTestId('stage-option-0'))

        // Should display memory usage warning for 10k documents
        expect(screen.getByTestId('memory-usage-warning')).toBeInTheDocument()
      })

      it('supports incremental loading of stage results', async () => {
        const user = userEvent.setup()
        const onLoadMoreResults = vi.fn()

        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={[largeStageResults[0]!.slice(0, 100)]} // Only first 100 loaded
            stages={mockStages}
            hasMoreResults={{ 0: true }}
            onLoadMoreResults={onLoadMoreResults}
          />
        )

        await user.click(screen.getByTestId('stage-option-0'))
        await user.click(screen.getByTestId('load-more-stage-results'))

        expect(onLoadMoreResults).toHaveBeenCalledWith(0, 100) // Load next batch starting at index 100
      })

      it('cancels pending stage result requests when switching stages', async () => {
        const user = userEvent.setup()
        const onCancelStageLoad = vi.fn()

        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={[]}
            stages={mockStages}
            loadingStageIndex={0}
            onCancelStageLoad={onCancelStageLoad}
          />
        )

        // Switch to a different stage while stage 0 is still loading
        await user.click(screen.getByTestId('stage-option-1'))

        expect(onCancelStageLoad).toHaveBeenCalledWith(0)
      })

      it('preserves scroll position when navigating between stages', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={largeStageResults}
            stages={mockStages}
            preserveScrollPosition={true}
          />
        )

        await user.click(screen.getByTestId('stage-option-0'))

        // Scroll down
        const resultsContainer = screen.getByTestId('preview-results')
        resultsContainer.scrollTop = 500

        // Switch to another stage and back
        await user.click(screen.getByTestId('stage-option-1'))
        await user.click(screen.getByTestId('stage-option-0'))

        // Scroll position should be preserved
        expect(resultsContainer.scrollTop).toBe(500)
      })

      it('debounces rapid stage switching', async () => {
        const user = userEvent.setup()
        const onStageChange = vi.fn()

        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={largeStageResults}
            stages={mockStages}
            onStageChange={onStageChange}
            debounceStageSwitch={true}
          />
        )

        // Rapidly click through stages
        await user.click(screen.getByTestId('stage-option-0'))
        await user.click(screen.getByTestId('stage-option-1'))
        await user.click(screen.getByTestId('stage-option-2'))

        // Should debounce and only trigger final stage change
        await waitFor(() => {
          expect(onStageChange).toHaveBeenCalledTimes(1)
          expect(onStageChange).toHaveBeenCalledWith(2)
        })
      })

      it('shows estimated memory size for each stage', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={largeStageResults[2]!}
            stageResults={largeStageResults}
            stages={mockStages}
            showStageMemorySize={true}
          />
        )

        // Should show estimated memory size for stage with 10k docs
        expect(screen.getByTestId('stage-0-memory-size')).toBeInTheDocument()
        expect(screen.getByTestId('stage-0-memory-size')).toHaveTextContent(/\d+(\.\d+)?\s*(KB|MB)/i)
      })
    })

    describe('stage toggling interactions - RED PHASE', () => {
      it('highlights the currently selected stage in stage selector', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        await user.click(screen.getByTestId('stage-option-1'))

        expect(screen.getByTestId('stage-option-1')).toHaveClass('selected')
        expect(screen.getByTestId('stage-option-0')).not.toHaveClass('selected')
      })

      it('shows visual pipeline flow connecting stages', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            showPipelineFlow={true}
          />
        )

        expect(screen.getByTestId('pipeline-flow-visualization')).toBeInTheDocument()
        expect(screen.getByTestId('stage-connector-0-1')).toBeInTheDocument()
        expect(screen.getByTestId('stage-connector-1-2')).toBeInTheDocument()
      })

      it('shows document count change arrows between stages', () => {
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            showDocCountChange={true}
          />
        )

        // Stage 0 -> 1: 2 docs -> 1 doc (decrease)
        expect(screen.getByTestId('doc-count-change-0-1')).toHaveAttribute('data-direction', 'decrease')
      })

      it('enables quick stage toggle via keyboard shortcuts', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        // Focus the preview
        screen.getByTestId('pipeline-preview').focus()

        // Press 1 to go to stage 0
        await user.keyboard('1')
        expect(screen.getByTestId('stage-option-0')).toHaveClass('selected')

        // Press 2 to go to stage 1
        await user.keyboard('2')
        expect(screen.getByTestId('stage-option-1')).toHaveClass('selected')
      })

      it('supports next/previous stage buttons for mobile', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            showStageNavButtons={true}
          />
        )

        // Start at final results
        await user.click(screen.getByTestId('prev-stage-button'))
        expect(screen.getByTestId('stage-option-2')).toHaveClass('selected')

        await user.click(screen.getByTestId('prev-stage-button'))
        expect(screen.getByTestId('stage-option-1')).toHaveClass('selected')

        await user.click(screen.getByTestId('next-stage-button'))
        expect(screen.getByTestId('stage-option-2')).toHaveClass('selected')
      })

      it('shows stage breadcrumb trail', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            showStageBreadcrumb={true}
          />
        )

        await user.click(screen.getByTestId('stage-option-2'))

        expect(screen.getByTestId('stage-breadcrumb')).toBeInTheDocument()
        expect(screen.getByTestId('stage-breadcrumb')).toHaveTextContent('$match')
        expect(screen.getByTestId('stage-breadcrumb')).toHaveTextContent('$group')
        expect(screen.getByTestId('stage-breadcrumb')).toHaveTextContent('$sort')
      })

      it('allows clicking breadcrumb to navigate to stage', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
            showStageBreadcrumb={true}
          />
        )

        await user.click(screen.getByTestId('stage-option-2'))
        await user.click(screen.getByTestId('breadcrumb-stage-0'))

        expect(screen.getByTestId('stage-option-0')).toHaveClass('selected')
      })

      it('displays tooltip with stage details on hover', async () => {
        const user = userEvent.setup()
        render(
          <PipelinePreview
            {...defaultProps}
            results={mockIntermediateResults[2]!}
            stageResults={mockIntermediateResults}
            stages={mockStages}
          />
        )

        await user.hover(screen.getByTestId('stage-option-0'))

        await waitFor(() => {
          expect(screen.getByTestId('stage-tooltip')).toBeInTheDocument()
          expect(screen.getByTestId('stage-tooltip')).toHaveTextContent('$match')
          expect(screen.getByTestId('stage-tooltip')).toHaveTextContent('2 documents')
        })
      })
    })
  })
})
