import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { DropIndexDialog } from '../DropIndexDialog'
import { useDropIndexMutation } from '@hooks/useQueries'
import type { IndexInfo } from '@lib/rpc-client'

// Mock the mutation hook
vi.mock('@hooks/useQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hooks/useQueries')>()
  return {
    ...actual,
    useDropIndexMutation: vi.fn(),
  }
})

describe('DropIndexDialog', () => {
  const mockIndex: IndexInfo = {
    name: 'email_1',
    key: { email: 1 },
    unique: false,
  }

  const defaultProps = {
    database: 'testdb',
    collection: 'users',
    indexName: 'email_1',
    indexInfo: mockIndex,
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
    vi.mocked(useDropIndexMutation).mockReturnValue(mockMutation as any)
  })

  describe('rendering', () => {
    it('renders confirmation modal when open', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(screen.getByRole('heading', { name: /drop index/i })).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      render(<DropIndexDialog {...defaultProps} open={false} />)
      expect(screen.queryByRole('heading', { name: /drop index/i })).not.toBeInTheDocument()
    })

    it('shows index name in the modal', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(screen.getByText('email_1')).toBeInTheDocument()
    })

    it('shows collection name', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(screen.getByText(/users/)).toBeInTheDocument()
    })

    it('shows database name', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(screen.getByText(/testdb/)).toBeInTheDocument()
    })

    it('shows index keys', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(screen.getByTestId('drop-index-keys')).toHaveTextContent('email: 1')
    })

    it('renders Drop Index button', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(screen.getByTestId('drop-index-confirm')).toHaveTextContent(/drop index/i)
    })

    it('renders Cancel button', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })
  })

  describe('impact warnings', () => {
    it('shows general warning about performance impact', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(
        screen.getByText(/dropping this index may affect query performance/i)
      ).toBeInTheDocument()
    })

    it('shows irreversible action warning', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(
        screen.getByText(/this action cannot be undone/i)
      ).toBeInTheDocument()
    })

    it('shows unique index warning when index is unique', () => {
      const uniqueIndex: IndexInfo = {
        name: 'email_1',
        key: { email: 1 },
        unique: true,
      }
      render(
        <DropIndexDialog
          {...defaultProps}
          indexInfo={uniqueIndex}
        />
      )
      expect(
        screen.getByTestId('drop-index-unique-warning')
      ).toBeInTheDocument()
      expect(
        screen.getByText(/unique index.*duplicate values/i)
      ).toBeInTheDocument()
    })

    it('does not show unique warning for non-unique indexes', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(
        screen.queryByTestId('drop-index-unique-warning')
      ).not.toBeInTheDocument()
    })

    it('shows compound index warning for multi-field indexes', () => {
      const compoundIndex: IndexInfo = {
        name: 'email_status_1',
        key: { email: 1, status: 1 },
      }
      render(
        <DropIndexDialog
          {...defaultProps}
          indexName="email_status_1"
          indexInfo={compoundIndex}
        />
      )
      expect(
        screen.getByTestId('drop-index-compound-warning')
      ).toBeInTheDocument()
      expect(
        screen.getByText(/compound index.*multiple fields/i)
      ).toBeInTheDocument()
    })

    it('does not show compound warning for single-field indexes', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(
        screen.queryByTestId('drop-index-compound-warning')
      ).not.toBeInTheDocument()
    })

    it('shows TTL index warning when index has expireAfterSeconds', () => {
      const ttlIndex: IndexInfo = {
        name: 'createdAt_1',
        key: { createdAt: 1 },
        expireAfterSeconds: 3600,
      }
      render(
        <DropIndexDialog
          {...defaultProps}
          indexName="createdAt_1"
          indexInfo={ttlIndex}
        />
      )
      expect(
        screen.getByTestId('drop-index-ttl-warning')
      ).toBeInTheDocument()
      expect(
        screen.getByText(/ttl index.*automatic document expiration/i)
      ).toBeInTheDocument()
    })

    it('does not show TTL warning for non-TTL indexes', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(
        screen.queryByTestId('drop-index-ttl-warning')
      ).not.toBeInTheDocument()
    })

    it('shows text index warning for text indexes', () => {
      const textIndex: IndexInfo = {
        name: 'description_text',
        key: { description: 'text' as const },
      }
      render(
        <DropIndexDialog
          {...defaultProps}
          indexName="description_text"
          indexInfo={textIndex}
        />
      )
      expect(
        screen.getByTestId('drop-index-text-warning')
      ).toBeInTheDocument()
      expect(
        screen.getByText(/text search.*\$text queries/i)
      ).toBeInTheDocument()
    })

    it('shows multiple warnings when applicable', () => {
      const complexIndex: IndexInfo = {
        name: 'email_status_unique',
        key: { email: 1, status: 1 },
        unique: true,
      }
      render(
        <DropIndexDialog
          {...defaultProps}
          indexName="email_status_unique"
          indexInfo={complexIndex}
        />
      )
      expect(screen.getByTestId('drop-index-unique-warning')).toBeInTheDocument()
      expect(screen.getByTestId('drop-index-compound-warning')).toBeInTheDocument()
    })
  })

  describe('confirmation flow', () => {
    it('requires typing index name to confirm for destructive action', async () => {
      const user = userEvent.setup()
      render(<DropIndexDialog {...defaultProps} />)

      // Confirm button should be disabled initially
      const confirmButton = screen.getByTestId('drop-index-confirm')
      expect(confirmButton).toHaveAttribute('aria-disabled', 'true')

      // Type the index name
      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'email_1')

      // Now confirm button should be enabled
      expect(confirmButton).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('does not enable confirm button with partial index name', async () => {
      const user = userEvent.setup()
      render(<DropIndexDialog {...defaultProps} />)

      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'email')

      const confirmButton = screen.getByTestId('drop-index-confirm')
      expect(confirmButton).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows instruction to type index name', () => {
      render(<DropIndexDialog {...defaultProps} />)
      expect(
        screen.getByText(/type.*email_1.*to confirm/i)
      ).toBeInTheDocument()
    })

    it('confirmation input is case-sensitive', async () => {
      const user = userEvent.setup()
      render(<DropIndexDialog {...defaultProps} />)

      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'EMAIL_1')

      const confirmButton = screen.getByTestId('drop-index-confirm')
      expect(confirmButton).toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('drop action', () => {
    it('calls mutation with index name on confirm', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      // Type confirmation
      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'email_1')

      // Click confirm
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith('email_1')
      })
    })

    it('calls onSuccess after successful drop', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'email_1')
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled()
      })
    })

    it('calls onClose after successful drop', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'email_1')
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('shows error message on drop failure', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Index not found'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'email_1')
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('drop-index-error')).toHaveTextContent(
          'Index not found'
        )
      })
    })

    it('does not close modal on error', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Index not found'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'email_1')
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('drop-index-error')).toBeInTheDocument()
      })

      expect(defaultProps.onClose).not.toHaveBeenCalled()
    })

    it('shows loading state during drop', () => {
      vi.mocked(useDropIndexMutation).mockReturnValue({
        ...mockMutation,
        isPending: true,
      } as any)

      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByTestId('drop-index-confirm')).toHaveTextContent(
        /dropping/i
      )
      expect(screen.getByTestId('drop-index-confirm')).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    })

    it('disables confirmation input during drop', () => {
      vi.mocked(useDropIndexMutation).mockReturnValue({
        ...mockMutation,
        isPending: true,
      } as any)

      render(<DropIndexDialog {...defaultProps} />)

      const input = screen.getByTestId('drop-index-confirmation-input')
      expect(input).toBeDisabled()
    })
  })

  describe('cancel behavior', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(<DropIndexDialog {...defaultProps} onClose={onClose} />)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('resets confirmation input when modal reopens', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<DropIndexDialog {...defaultProps} />)

      // Type in confirmation
      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'email_1')

      // Close modal
      rerender(<DropIndexDialog {...defaultProps} open={false} />)

      // Reopen modal
      rerender(<DropIndexDialog {...defaultProps} open={true} />)

      // Input should be empty
      const newInput = screen.getByTestId('drop-index-confirmation-input')
      expect(newInput).toHaveValue('')
    })

    it('resets error state when modal reopens', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Failed'))
      const user = userEvent.setup()
      const { rerender } = render(<DropIndexDialog {...defaultProps} />)

      // Trigger error
      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'email_1')
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('drop-index-error')).toBeInTheDocument()
      })

      // Close and reopen
      rerender(<DropIndexDialog {...defaultProps} open={false} />)
      rerender(<DropIndexDialog {...defaultProps} open={true} />)

      // Error should be gone
      expect(screen.queryByTestId('drop-index-error')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has proper aria labels', () => {
      render(<DropIndexDialog {...defaultProps} />)

      const confirmButton = screen.getByTestId('drop-index-confirm')
      expect(confirmButton).toHaveAccessibleName()
    })

    it('confirmation input has proper label', () => {
      render(<DropIndexDialog {...defaultProps} />)

      const input = screen.getByTestId('drop-index-confirmation-input')
      expect(input).toHaveAccessibleName()
    })

    it('error message has alert role', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Failed'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      const input = screen.getByTestId('drop-index-confirmation-input')
      await user.type(input, 'email_1')
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('drop-index-error')).toHaveAttribute('role', 'alert')
      })
    })
  })

  describe('special index types', () => {
    it('shows geospatial warning for 2dsphere indexes', () => {
      const geoIndex: IndexInfo = {
        name: 'location_2dsphere',
        key: { location: '2dsphere' as const },
      }
      render(
        <DropIndexDialog
          {...defaultProps}
          indexName="location_2dsphere"
          indexInfo={geoIndex}
        />
      )
      expect(
        screen.getByTestId('drop-index-geo-warning')
      ).toBeInTheDocument()
      expect(
        screen.getByText(/geospatial.*\$near.*\$geoWithin/i)
      ).toBeInTheDocument()
    })

    it('shows sparse index warning', () => {
      const sparseIndex: IndexInfo = {
        name: 'optional_field_1',
        key: { optionalField: 1 },
        sparse: true,
      }
      render(
        <DropIndexDialog
          {...defaultProps}
          indexName="optional_field_1"
          indexInfo={sparseIndex}
        />
      )
      expect(
        screen.getByTestId('drop-index-sparse-warning')
      ).toBeInTheDocument()
      expect(
        screen.getByText(/sparse index.*null values/i)
      ).toBeInTheDocument()
    })
  })
})

describe('DropIndex (integration with IndexList)', () => {
  // These tests verify the DropIndex export that IndexList uses
  // The actual component is DropIndexDialog but exported as DropIndex

  it('exports DropIndex component for use in IndexList', async () => {
    // This test ensures the named export exists
    const module = await import('../DropIndex')
    expect(module.DropIndex).toBeDefined()
  })

  it('DropIndex is an alias for DropIndexDialog', async () => {
    const module = await import('../DropIndex')
    expect(module.DropIndex).toBe(module.DropIndexDialog)
  })
})
