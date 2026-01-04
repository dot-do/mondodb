import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { Pagination } from '../Pagination'

describe('Pagination', () => {
  const defaultProps = {
    page: 1,
    pageSize: 20,
    totalCount: 100,
    totalPages: 5,
    onPageChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the pagination container', () => {
      render(<Pagination {...defaultProps} />)
      expect(screen.getByTestId('pagination')).toBeInTheDocument()
    })

    it('displays page info correctly', () => {
      render(<Pagination {...defaultProps} />)
      expect(screen.getByTestId('page-info')).toHaveTextContent('1-20 of 100')
    })

    it('displays correct page info for middle pages', () => {
      render(<Pagination {...defaultProps} page={3} />)
      expect(screen.getByTestId('page-info')).toHaveTextContent('41-60 of 100')
    })

    it('displays correct page info for last page', () => {
      render(<Pagination {...defaultProps} page={5} totalCount={95} />)
      expect(screen.getByTestId('page-info')).toHaveTextContent('81-95 of 95')
    })
  })

  describe('navigation buttons', () => {
    it('renders first, prev, next, and last buttons', () => {
      render(<Pagination {...defaultProps} />)
      expect(screen.getByTestId('first-page-button')).toBeInTheDocument()
      expect(screen.getByTestId('prev-page-button')).toBeInTheDocument()
      expect(screen.getByTestId('next-page-button')).toBeInTheDocument()
      expect(screen.getByTestId('last-page-button')).toBeInTheDocument()
    })

    it('disables first and prev buttons on first page', () => {
      render(<Pagination {...defaultProps} page={1} />)
      expect(screen.getByTestId('first-page-button')).toBeDisabled()
      expect(screen.getByTestId('prev-page-button')).toBeDisabled()
    })

    it('disables next and last buttons on last page', () => {
      render(<Pagination {...defaultProps} page={5} />)
      expect(screen.getByTestId('next-page-button')).toBeDisabled()
      expect(screen.getByTestId('last-page-button')).toBeDisabled()
    })

    it('enables all navigation buttons on middle page', () => {
      render(<Pagination {...defaultProps} page={3} />)
      expect(screen.getByTestId('first-page-button')).not.toBeDisabled()
      expect(screen.getByTestId('prev-page-button')).not.toBeDisabled()
      expect(screen.getByTestId('next-page-button')).not.toBeDisabled()
      expect(screen.getByTestId('last-page-button')).not.toBeDisabled()
    })

    it('calls onPageChange with 1 when first button clicked', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()
      render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />)

      await user.click(screen.getByTestId('first-page-button'))
      expect(onPageChange).toHaveBeenCalledWith(1)
    })

    it('calls onPageChange with previous page when prev button clicked', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()
      render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />)

      await user.click(screen.getByTestId('prev-page-button'))
      expect(onPageChange).toHaveBeenCalledWith(2)
    })

    it('calls onPageChange with next page when next button clicked', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()
      render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />)

      await user.click(screen.getByTestId('next-page-button'))
      expect(onPageChange).toHaveBeenCalledWith(4)
    })

    it('calls onPageChange with last page when last button clicked', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()
      render(<Pagination {...defaultProps} page={3} onPageChange={onPageChange} />)

      await user.click(screen.getByTestId('last-page-button'))
      expect(onPageChange).toHaveBeenCalledWith(5)
    })
  })

  describe('page number buttons', () => {
    it('renders page number buttons when showPageNumbers is true', () => {
      render(<Pagination {...defaultProps} showPageNumbers={true} />)
      expect(screen.getByTestId('page-button-1')).toBeInTheDocument()
      expect(screen.getByTestId('page-button-2')).toBeInTheDocument()
    })

    it('highlights current page button', () => {
      render(<Pagination {...defaultProps} page={3} showPageNumbers={true} />)
      expect(screen.getByTestId('page-button-3')).toHaveAttribute('aria-current', 'page')
    })

    it('calls onPageChange when page number clicked', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()
      render(
        <Pagination
          {...defaultProps}
          page={1}
          onPageChange={onPageChange}
          showPageNumbers={true}
        />
      )

      await user.click(screen.getByTestId('page-button-3'))
      expect(onPageChange).toHaveBeenCalledWith(3)
    })

    it('shows ellipsis for many pages when near start', () => {
      render(
        <Pagination
          {...defaultProps}
          page={1}
          totalPages={20}
          showPageNumbers={true}
        />
      )
      expect(screen.getByText('...')).toBeInTheDocument()
    })

    it('shows ellipsis for many pages when near end', () => {
      render(
        <Pagination
          {...defaultProps}
          page={20}
          totalPages={20}
          showPageNumbers={true}
        />
      )
      expect(screen.getByText('...')).toBeInTheDocument()
    })

    it('shows two ellipses when in middle of many pages', () => {
      render(
        <Pagination
          {...defaultProps}
          page={10}
          totalPages={20}
          showPageNumbers={true}
        />
      )
      const ellipses = screen.getAllByText('...')
      expect(ellipses).toHaveLength(2)
    })

    it('does not show page numbers when showPageNumbers is false', () => {
      render(<Pagination {...defaultProps} showPageNumbers={false} />)
      expect(screen.queryByTestId('page-button-1')).not.toBeInTheDocument()
    })
  })

  describe('page size selector', () => {
    it('renders page size selector when onPageSizeChange provided', () => {
      render(<Pagination {...defaultProps} onPageSizeChange={vi.fn()} />)
      expect(screen.getByTestId('page-size-select')).toBeInTheDocument()
    })

    it('hides page size selector when onPageSizeChange not provided', () => {
      render(<Pagination {...defaultProps} />)
      expect(screen.queryByTestId('page-size-select')).not.toBeInTheDocument()
    })

    it('displays current page size in selector', () => {
      render(<Pagination {...defaultProps} pageSize={50} onPageSizeChange={vi.fn()} />)
      expect(screen.getByTestId('page-size-select')).toHaveValue('50')
    })

    it('calls onPageSizeChange and resets to page 1 when size changed', async () => {
      const user = userEvent.setup()
      const onPageSizeChange = vi.fn()
      const onPageChange = vi.fn()
      render(
        <Pagination
          {...defaultProps}
          page={3}
          onPageSizeChange={onPageSizeChange}
          onPageChange={onPageChange}
        />
      )

      await user.selectOptions(screen.getByTestId('page-size-select'), '50')
      expect(onPageSizeChange).toHaveBeenCalledWith(50)
      expect(onPageChange).toHaveBeenCalledWith(1)
    })

    it('uses custom page size options when provided', () => {
      render(
        <Pagination
          {...defaultProps}
          pageSizeOptions={[5, 25, 100]}
          onPageSizeChange={vi.fn()}
        />
      )
      const select = screen.getByTestId('page-size-select')
      expect(select).toContainElement(screen.getByRole('option', { name: '5' }))
      expect(select).toContainElement(screen.getByRole('option', { name: '25' }))
      expect(select).toContainElement(screen.getByRole('option', { name: '100' }))
    })
  })

  describe('quick jump', () => {
    it('shows quick jump input when showQuickJump is true', () => {
      render(<Pagination {...defaultProps} showQuickJump={true} />)
      expect(screen.getByTestId('quick-jump-input')).toBeInTheDocument()
    })

    it('hides quick jump input when showQuickJump is false', () => {
      render(<Pagination {...defaultProps} showQuickJump={false} />)
      expect(screen.queryByTestId('quick-jump-input')).not.toBeInTheDocument()
    })

    it('jumps to entered page when Enter pressed', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()
      render(
        <Pagination
          {...defaultProps}
          onPageChange={onPageChange}
          showQuickJump={true}
        />
      )

      const input = screen.getByTestId('quick-jump-input')
      await user.type(input, '4')
      await user.keyboard('{Enter}')

      expect(onPageChange).toHaveBeenCalledWith(4)
    })

    it('does not jump for invalid page numbers', async () => {
      const user = userEvent.setup()
      const onPageChange = vi.fn()
      render(
        <Pagination
          {...defaultProps}
          onPageChange={onPageChange}
          showQuickJump={true}
        />
      )

      const input = screen.getByTestId('quick-jump-input')
      await user.type(input, '10')
      await user.keyboard('{Enter}')

      // Page 10 is out of range (total pages is 5)
      expect(onPageChange).not.toHaveBeenCalled()
    })

    it('clears input after successful jump', async () => {
      const user = userEvent.setup()
      render(
        <Pagination
          {...defaultProps}
          onPageChange={vi.fn()}
          showQuickJump={true}
        />
      )

      const input = screen.getByTestId('quick-jump-input')
      await user.type(input, '3')
      await user.keyboard('{Enter}')

      expect(input).toHaveValue(null)
    })
  })

  describe('accessibility', () => {
    it('has correct aria-labels on navigation buttons', () => {
      render(<Pagination {...defaultProps} />)
      expect(screen.getByTestId('first-page-button')).toHaveAccessibleName('First page')
      expect(screen.getByTestId('prev-page-button')).toHaveAccessibleName('Previous page')
      expect(screen.getByTestId('next-page-button')).toHaveAccessibleName('Next page')
      expect(screen.getByTestId('last-page-button')).toHaveAccessibleName('Last page')
    })

    it('has correct aria-label on page size select', () => {
      render(<Pagination {...defaultProps} onPageSizeChange={vi.fn()} />)
      expect(screen.getByTestId('page-size-select')).toHaveAccessibleName('Page size')
    })

    it('has correct aria-label on quick jump input', () => {
      render(<Pagination {...defaultProps} showQuickJump={true} />)
      expect(screen.getByTestId('quick-jump-input')).toHaveAccessibleName('Jump to page')
    })

    it('page buttons have correct aria-labels', () => {
      render(<Pagination {...defaultProps} showPageNumbers={true} />)
      expect(screen.getByTestId('page-button-1')).toHaveAccessibleName('Page 1')
      expect(screen.getByTestId('page-button-2')).toHaveAccessibleName('Page 2')
    })
  })

  describe('edge cases', () => {
    it('handles single page correctly', () => {
      render(
        <Pagination
          {...defaultProps}
          page={1}
          totalPages={1}
          totalCount={15}
        />
      )
      expect(screen.getByTestId('page-info')).toHaveTextContent('1-15 of 15')
    })

    it('handles empty results', () => {
      render(
        <Pagination
          {...defaultProps}
          page={1}
          totalPages={0}
          totalCount={0}
        />
      )
      expect(screen.getByTestId('page-info')).toHaveTextContent('1-0 of 0')
    })
  })
})
