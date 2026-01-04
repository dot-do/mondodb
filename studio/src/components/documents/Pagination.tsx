import { memo, useCallback, useMemo, useState } from 'react'
import { css, cx } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'

export interface PaginationProps {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  showPageNumbers?: boolean
  showQuickJump?: boolean
  maxVisiblePages?: number
}

// Styles
const paginationStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid ${palette.gray.light2};
  flex-shrink: 0;
  gap: 16px;
  flex-wrap: wrap;
`

const paginationLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const paginationCenterStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
`

const paginationRightStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const pageSizeSelectStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const selectStyles = css`
  padding: 6px 8px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  font-size: 13px;
  background: ${palette.white};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${palette.green.base};
  }
`

const pageInfoStyles = css`
  font-size: 13px;
  color: ${palette.gray.dark1};
`

const pageButtonsStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
`

const pageNumberButtonStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  background: ${palette.white};
  color: ${palette.gray.dark2};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: ${palette.gray.light3};
    border-color: ${palette.gray.base};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const pageNumberButtonActiveStyles = css`
  background: ${palette.green.dark1};
  border-color: ${palette.green.dark1};
  color: ${palette.white};

  &:hover:not(:disabled) {
    background: ${palette.green.dark2};
    border-color: ${palette.green.dark2};
  }
`

const ellipsisStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  color: ${palette.gray.dark1};
  font-size: 13px;
`

const quickJumpStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const quickJumpInputStyles = css`
  width: 60px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  background: ${palette.white};
  color: ${palette.gray.dark2};
  font-size: 13px;
  text-align: center;

  &:hover {
    border-color: ${palette.gray.base};
  }

  &:focus {
    outline: none;
    border-color: ${palette.blue.base};
    box-shadow: 0 0 0 3px ${palette.blue.light3};
  }

  /* Hide number input spinners */
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

// Helper to generate page numbers to display
function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number
): (number | 'ellipsis-start' | 'ellipsis-end')[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = []
  const halfVisible = Math.floor((maxVisible - 3) / 2)

  // Always show first page
  pages.push(1)

  if (currentPage <= halfVisible + 2) {
    // Near the start
    for (let i = 2; i <= Math.min(maxVisible - 2, totalPages - 1); i++) {
      pages.push(i)
    }
    if (totalPages > maxVisible - 1) {
      pages.push('ellipsis-end')
    }
  } else if (currentPage >= totalPages - halfVisible - 1) {
    // Near the end
    pages.push('ellipsis-start')
    for (let i = Math.max(totalPages - maxVisible + 3, 2); i < totalPages; i++) {
      pages.push(i)
    }
  } else {
    // In the middle
    pages.push('ellipsis-start')
    for (let i = currentPage - halfVisible; i <= currentPage + halfVisible; i++) {
      if (i > 1 && i < totalPages) {
        pages.push(i)
      }
    }
    pages.push('ellipsis-end')
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages)
  }

  return pages
}

export const Pagination = memo(function Pagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  showPageNumbers = true,
  showQuickJump = false,
  maxVisiblePages = 7,
}: PaginationProps) {
  const [quickJumpValue, setQuickJumpValue] = useState('')

  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, totalCount)

  // Generate visible page numbers
  const pageNumbers = useMemo(
    () => getPageNumbers(page, totalPages, maxVisiblePages),
    [page, totalPages, maxVisiblePages]
  )

  const handleQuickJump = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const newPage = parseInt(quickJumpValue, 10)
        if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPages) {
          onPageChange(newPage)
          setQuickJumpValue('')
        }
      }
    },
    [quickJumpValue, totalPages, onPageChange]
  )

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      onPageSizeChange?.(newSize)
      // Reset to page 1 when changing page size to avoid being on an invalid page
      onPageChange(1)
    },
    [onPageSizeChange, onPageChange]
  )

  return (
    <div className={paginationStyles} data-testid="pagination">
      <div className={paginationLeftStyles}>
        {onPageSizeChange && (
          <div className={pageSizeSelectStyles}>
            <Body>Show</Body>
            <select
              className={selectStyles}
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              aria-label="Page size"
              data-testid="page-size-select"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <Body>per page</Body>
          </div>
        )}
      </div>

      {showPageNumbers && totalPages > 1 && (
        <div className={paginationCenterStyles}>
          <button
            className={pageNumberButtonStyles}
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            aria-label="First page"
            data-testid="first-page-button"
          >
            <Icon glyph="ChevronLeft" size="small" />
            <Icon glyph="ChevronLeft" size="small" style={{ marginLeft: -8 }} />
          </button>
          <button
            className={pageNumberButtonStyles}
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
            data-testid="prev-page-button"
          >
            <Icon glyph="ChevronLeft" size="small" />
          </button>

          {pageNumbers.map((pageNum, index) =>
            pageNum === 'ellipsis-start' || pageNum === 'ellipsis-end' ? (
              <span key={pageNum} className={ellipsisStyles}>
                ...
              </span>
            ) : (
              <button
                key={pageNum}
                className={cx(
                  pageNumberButtonStyles,
                  pageNum === page && pageNumberButtonActiveStyles
                )}
                onClick={() => onPageChange(pageNum)}
                aria-label={`Page ${pageNum}`}
                aria-current={pageNum === page ? 'page' : undefined}
                data-testid={`page-button-${pageNum}`}
              >
                {pageNum}
              </button>
            )
          )}

          <button
            className={pageNumberButtonStyles}
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            aria-label="Next page"
            data-testid="next-page-button"
          >
            <Icon glyph="ChevronRight" size="small" />
          </button>
          <button
            className={pageNumberButtonStyles}
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
            aria-label="Last page"
            data-testid="last-page-button"
          >
            <Icon glyph="ChevronRight" size="small" />
            <Icon glyph="ChevronRight" size="small" style={{ marginLeft: -8 }} />
          </button>
        </div>
      )}

      {!showPageNumbers && (
        <div className={pageButtonsStyles}>
          <Button
            size="xsmall"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
            aria-label="First page"
            data-testid="first-page-button"
          >
            <Icon glyph="ChevronLeft" />
            <Icon glyph="ChevronLeft" />
          </Button>
          <Button
            size="xsmall"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
            data-testid="prev-page-button"
          >
            <Icon glyph="ChevronLeft" />
          </Button>

          <span className={pageInfoStyles}>
            Page {page} of {totalPages}
          </span>

          <Button
            size="xsmall"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
            data-testid="next-page-button"
          >
            <Icon glyph="ChevronRight" />
          </Button>
          <Button
            size="xsmall"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="Last page"
            data-testid="last-page-button"
          >
            <Icon glyph="ChevronRight" />
            <Icon glyph="ChevronRight" />
          </Button>
        </div>
      )}

      <div className={paginationRightStyles}>
        <span className={pageInfoStyles} data-testid="page-info">
          {startItem}-{endItem} of {totalCount}
        </span>

        {showQuickJump && (
          <div className={quickJumpStyles}>
            <Body>Go to:</Body>
            <input
              type="number"
              className={quickJumpInputStyles}
              min={1}
              max={totalPages}
              value={quickJumpValue}
              onChange={(e) => setQuickJumpValue(e.target.value)}
              onKeyDown={handleQuickJump}
              placeholder={String(page)}
              aria-label="Jump to page"
              data-testid="quick-jump-input"
            />
          </div>
        )}
      </div>
    </div>
  )
})

export default Pagination
