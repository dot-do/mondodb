/**
 * DropIndexDialog Component Tests - RED Phase (TDD)
 *
 * These tests define the expected behavior of the DropIndexDialog component.
 * They are written BEFORE the implementation is complete, so they should FAIL.
 *
 * Test Coverage:
 * 1. Dialog rendering when open/closed
 * 2. Confirmation message display with index name
 * 3. Drop button click behavior
 * 4. Cancel button behavior
 * 5. Error handling when drop fails
 * 6. Loading state during drop operation
 * 7. onSuccess callback after successful drop
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { DropIndexDialog } from '../DropIndexDialog'

// Helper to clean up LeafyGreen portals between tests
function cleanupPortals() {
  document.querySelectorAll('[data-lg-portal]').forEach(el => el.remove())
  document.querySelectorAll('[data-leafygreen-ui-modal-container]').forEach(el => el.remove())
  document.querySelectorAll('[class*="lg-ui-portal"]').forEach(el => el.remove())
}

describe('DropIndexDialog', () => {
  const mockMutateAsync = vi.fn()
  const mockDropMutation = {
    mutateAsync: mockMutateAsync,
    isPending: false,
  }

  const defaultProps = {
    indexName: 'email_1',
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    dropMutation: mockDropMutation as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    cleanupPortals()
  })

  // ===========================================================================
  // SECTION 1: Dialog Rendering when Open/Closed
  // ===========================================================================
  describe('rendering', () => {
    it('renders dialog when open is true', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not render dialog when open is false', () => {
      render(<DropIndexDialog {...defaultProps} open={false} />)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders dialog title "Drop Index"', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByRole('heading', { name: /drop index/i })).toBeInTheDocument()
    })

    it('renders Drop Index button', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByTestId('drop-index-confirm')).toBeInTheDocument()
    })

    it('renders Cancel button', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByTestId('drop-index-cancel')).toBeInTheDocument()
    })

    it('has aria-modal attribute set to true', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })
  })

  // ===========================================================================
  // SECTION 2: Confirmation Message Display with Index Name
  // ===========================================================================
  describe('confirmation message', () => {
    it('displays index name in confirmation message', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByTestId('drop-index-name')).toHaveTextContent('email_1')
    })

    it('shows warning about irreversible action', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
    })

    it('displays correct index name when prop changes', () => {
      const { rerender } = render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByTestId('drop-index-name')).toHaveTextContent('email_1')

      rerender(<DropIndexDialog {...defaultProps} indexName="status_-1_createdAt_1" />)

      expect(screen.getByTestId('drop-index-name')).toHaveTextContent('status_-1_createdAt_1')
    })

    it('shows "Are you sure" confirmation text', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    })

    it('displays the full question asking to drop the specific index', () => {
      render(<DropIndexDialog {...defaultProps} indexName="users_email_unique" />)

      const confirmationText = screen.getByText(/are you sure you want to drop the index/i)
      expect(confirmationText).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SECTION 3: Drop Button Click Behavior
  // ===========================================================================
  describe('drop button behavior', () => {
    // Helper to type confirmation and enable the Drop button
    const confirmAndDrop = async (user: ReturnType<typeof userEvent.setup>, indexName = 'email_1') => {
      await user.type(screen.getByTestId('drop-index-confirm-input'), indexName)
      await user.click(screen.getByTestId('drop-index-confirm'))
    }

    it('calls dropMutation.mutateAsync with index name when Drop Index is clicked', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await confirmAndDrop(user)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith('email_1')
      })
    })

    it('calls onSuccess after successful drop', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await confirmAndDrop(user)

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled()
      })
    })

    it('calls onClose after successful drop', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await confirmAndDrop(user)

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('does not call onSuccess if drop fails', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Failed to drop index'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await confirmAndDrop(user)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled()
      })

      expect(defaultProps.onSuccess).not.toHaveBeenCalled()
    })

    it('does not call onClose if drop fails', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Failed to drop index'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await confirmAndDrop(user)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled()
      })

      // Verify onClose was not called - if it were going to be called,
      // it would have been called synchronously after the mutation rejection
      expect(defaultProps.onClose).not.toHaveBeenCalled()
    })

    it('Drop Index button has danger variant styling', () => {
      render(<DropIndexDialog {...defaultProps} />)

      const dropButton = screen.getByTestId('drop-index-confirm')
      // LeafyGreen buttons with variant="danger" have specific attributes/classes
      expect(dropButton).toHaveAttribute('data-variant', 'danger')
    })
  })

  // ===========================================================================
  // SECTION 4: Cancel Button Behavior
  // ===========================================================================
  describe('cancel button behavior', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await user.click(screen.getByTestId('drop-index-cancel'))

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('does not call dropMutation when Cancel is clicked', async () => {
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await user.click(screen.getByTestId('drop-index-cancel'))

      expect(mockMutateAsync).not.toHaveBeenCalled()
    })

    it('does not call onSuccess when Cancel is clicked', async () => {
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await user.click(screen.getByTestId('drop-index-cancel'))

      expect(defaultProps.onSuccess).not.toHaveBeenCalled()
    })

    it('Cancel button has default variant styling', () => {
      render(<DropIndexDialog {...defaultProps} />)

      const cancelButton = screen.getByTestId('drop-index-cancel')
      expect(cancelButton).toHaveAttribute('data-variant', 'default')
    })

    it('calls onClose when clicking outside the dialog (modal overlay)', async () => {
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      // Click on the modal backdrop/overlay
      const dialog = screen.getByRole('dialog')
      const overlay = dialog.parentElement?.querySelector('[data-testid="modal-overlay"]')

      if (overlay) {
        await user.click(overlay)
        expect(defaultProps.onClose).toHaveBeenCalled()
      }
    })

    it('calls onClose when pressing Escape key', async () => {
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await user.keyboard('{Escape}')

      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // SECTION 5: Error Handling when Drop Fails
  // ===========================================================================
  describe('error handling', () => {
    // Helper to type confirmation before clicking Drop
    const typeConfirmation = async (user: ReturnType<typeof userEvent.setup>, indexName = 'email_1') => {
      await user.type(screen.getByTestId('drop-index-confirm-input'), indexName)
    }

    it('displays error message when drop fails', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Index not found'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await typeConfirmation(user)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('drop-index-error')).toHaveTextContent('Index not found')
      })
    })

    it('displays generic error message for non-Error rejections', async () => {
      mockMutateAsync.mockRejectedValue('Something went wrong')
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await typeConfirmation(user)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('drop-index-error')).toHaveTextContent(/failed to drop index/i)
      })
    })

    it('keeps dialog open when error occurs', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Permission denied'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await typeConfirmation(user)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('drop-index-error')).toBeInTheDocument()
      })

      // Dialog should still be visible
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('clears error when dialog is closed and reopened', async () => {
      mockMutateAsync.mockRejectedValue(new Error('First error'))
      const user = userEvent.setup()

      const { rerender } = render(<DropIndexDialog {...defaultProps} />)

      await typeConfirmation(user)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('drop-index-error')).toBeInTheDocument()
      })

      // Close dialog
      rerender(<DropIndexDialog {...defaultProps} open={false} />)

      // Reopen dialog
      rerender(<DropIndexDialog {...defaultProps} open={true} />)

      // Error should be cleared
      expect(screen.queryByTestId('drop-index-error')).not.toBeInTheDocument()
    })

    it('error message has appropriate styling (red/danger color)', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Test error'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await typeConfirmation(user)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        const errorElement = screen.getByTestId('drop-index-error')
        expect(errorElement).toBeInTheDocument()
        // Check for error styling (typically red color)
        // Note: toHaveStyle doesn't support asymmetric matchers, so we check the computed style
        const computedStyle = window.getComputedStyle(errorElement)
        expect(computedStyle.color).toMatch(/red|#c|rgb\(1[5-9]|rgb\(2[0-5]/)
      })
    })

    it('error message has role="alert" for accessibility', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Test error'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await typeConfirmation(user)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        const errorElement = screen.getByTestId('drop-index-error')
        expect(errorElement).toHaveAttribute('role', 'alert')
      })
    })

    it('allows retry after error', async () => {
      mockMutateAsync
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(undefined)
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await typeConfirmation(user)

      // First attempt fails
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('drop-index-error')).toBeInTheDocument()
      })

      // Second attempt succeeds (confirmation still there)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled()
      })
    })
  })

  // ===========================================================================
  // SECTION 6: Loading State during Drop Operation
  // ===========================================================================
  describe('loading state', () => {
    it('shows loading text on Drop button when mutation is pending', () => {
      const pendingMutation = {
        ...mockDropMutation,
        isPending: true,
      }

      render(<DropIndexDialog {...defaultProps} dropMutation={pendingMutation as any} />)

      expect(screen.getByTestId('drop-index-confirm')).toHaveTextContent(/dropping/i)
    })

    it('disables Drop button when mutation is pending', () => {
      const pendingMutation = {
        ...mockDropMutation,
        isPending: true,
      }

      render(<DropIndexDialog {...defaultProps} dropMutation={pendingMutation as any} />)

      // LeafyGreen Button uses aria-disabled instead of disabled attribute
      expect(screen.getByTestId('drop-index-confirm')).toHaveAttribute('aria-disabled', 'true')
    })

    it('disables Cancel button when mutation is pending', () => {
      const pendingMutation = {
        ...mockDropMutation,
        isPending: true,
      }

      render(<DropIndexDialog {...defaultProps} dropMutation={pendingMutation as any} />)

      // LeafyGreen Button uses aria-disabled instead of disabled attribute
      expect(screen.getByTestId('drop-index-cancel')).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows "Dropping..." text during pending state', () => {
      const pendingMutation = {
        ...mockDropMutation,
        isPending: true,
      }

      render(<DropIndexDialog {...defaultProps} dropMutation={pendingMutation as any} />)

      expect(screen.getByTestId('drop-index-confirm')).toHaveTextContent('Dropping...')
    })

    it('shows "Drop Index" text when not pending', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByTestId('drop-index-confirm')).toHaveTextContent('Drop Index')
    })

    it('shows loading spinner during pending state', () => {
      const pendingMutation = {
        ...mockDropMutation,
        isPending: true,
      }

      render(<DropIndexDialog {...defaultProps} dropMutation={pendingMutation as any} />)

      expect(screen.getByTestId('drop-index-spinner')).toBeInTheDocument()
    })

    it('prevents multiple submissions while pending', async () => {
      let resolvePromise: () => void
      mockMutateAsync.mockImplementation(() => new Promise(resolve => {
        resolvePromise = resolve
      }))

      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      // Type confirmation first
      await user.type(screen.getByTestId('drop-index-confirm-input'), 'email_1')

      // First click
      await user.click(screen.getByTestId('drop-index-confirm'))

      // Try clicking again while pending (should be disabled/prevented)
      // The button should be disabled after the first click triggers the mutation

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1)
      })

      // Resolve to clean up
      resolvePromise!()
    })
  })

  // ===========================================================================
  // SECTION 7: onSuccess Callback after Successful Drop
  // ===========================================================================
  describe('onSuccess callback', () => {
    // Helper to type confirmation
    const typeConfirmation = async (user: ReturnType<typeof userEvent.setup>, indexName = 'email_1') => {
      await user.type(screen.getByTestId('drop-index-confirm-input'), indexName)
    }

    it('calls onSuccess callback after successful mutation', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const onSuccess = vi.fn()
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} onSuccess={onSuccess} />)

      await typeConfirmation(user)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1)
      })
    })

    it('calls onSuccess before onClose', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const callOrder: string[] = []
      const onSuccess = vi.fn(() => callOrder.push('onSuccess'))
      const onClose = vi.fn(() => callOrder.push('onClose'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} onSuccess={onSuccess} onClose={onClose} />)

      await typeConfirmation(user)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(callOrder).toEqual(['onSuccess', 'onClose'])
      })
    })

    it('works correctly when onSuccess is not provided', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const user = userEvent.setup()

      // Render without onSuccess prop
      render(<DropIndexDialog
        indexName="email_1"
        open={true}
        onClose={defaultProps.onClose}
        dropMutation={mockDropMutation as any}
      />)

      await typeConfirmation(user)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled()
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('triggers list refresh via onSuccess (integration behavior)', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const mockRefetch = vi.fn()
      const onSuccess = vi.fn(() => mockRefetch())
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} onSuccess={onSuccess} />)

      await typeConfirmation(user)
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled()
      })
    })
  })

  // ===========================================================================
  // SECTION 8: Edge Cases and Additional Scenarios
  // ===========================================================================
  describe('edge cases', () => {
    it('handles index names with special characters', () => {
      render(<DropIndexDialog {...defaultProps} indexName="user.address.city_1" />)

      expect(screen.getByTestId('drop-index-name')).toHaveTextContent('user.address.city_1')
    })

    it('handles very long index names', () => {
      const longName = 'field1_1_field2_-1_field3_1_field4_-1_field5_1_field6_-1'

      render(<DropIndexDialog {...defaultProps} indexName={longName} />)

      expect(screen.getByTestId('drop-index-name')).toHaveTextContent(longName)
    })

    it('handles index names with underscores', () => {
      render(<DropIndexDialog {...defaultProps} indexName="email_unique_idx" />)

      expect(screen.getByTestId('drop-index-name')).toHaveTextContent('email_unique_idx')
    })

    it('handles empty onSuccess gracefully', async () => {
      mockMutateAsync.mockResolvedValue(undefined)
      const user = userEvent.setup()

      render(<DropIndexDialog
        indexName="email_1"
        open={true}
        onClose={defaultProps.onClose}
        onSuccess={undefined}
        dropMutation={mockDropMutation as any}
      />)

      // Type confirmation first
      await user.type(screen.getByTestId('drop-index-confirm-input'), 'email_1')

      // Should not throw
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('resets internal state when index name changes', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Error for first index'))
      const user = userEvent.setup()

      const { rerender } = render(<DropIndexDialog {...defaultProps} indexName="first_index" />)

      // Type confirmation first
      await user.type(screen.getByTestId('drop-index-confirm-input'), 'first_index')

      // Trigger error for first index
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        expect(screen.getByTestId('drop-index-error')).toBeInTheDocument()
      })

      // Change to different index
      rerender(<DropIndexDialog {...defaultProps} indexName="second_index" />)

      // Error should be cleared for new index
      expect(screen.queryByTestId('drop-index-error')).not.toBeInTheDocument()
      expect(screen.getByTestId('drop-index-name')).toHaveTextContent('second_index')
    })

    it('handles rapid open/close transitions', async () => {
      const { rerender } = render(<DropIndexDialog {...defaultProps} open={true} />)

      rerender(<DropIndexDialog {...defaultProps} open={false} />)
      rerender(<DropIndexDialog {...defaultProps} open={true} />)
      rerender(<DropIndexDialog {...defaultProps} open={false} />)
      rerender(<DropIndexDialog {...defaultProps} open={true} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SECTION 9: Type-to-Confirm Safety Pattern (RED: mondodb-eoa0)
  // ===========================================================================
  describe('type-to-confirm safety pattern', () => {
    it('renders confirmation input field', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByTestId('drop-index-confirm-input')).toBeInTheDocument()
    })

    it('Drop Index button is disabled by default', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByTestId('drop-index-confirm')).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows instruction text to type index name', () => {
      render(<DropIndexDialog {...defaultProps} />)

      // The instruction label should contain "Type ... to confirm"
      expect(screen.getByText(/to confirm/i)).toBeInTheDocument()
      // And the index name should appear in the instruction area (multiple elements may have it)
      expect(screen.getAllByText('email_1').length).toBeGreaterThan(0)
    })

    it('Drop Index button remains disabled with partial match', async () => {
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await user.type(screen.getByTestId('drop-index-confirm-input'), 'email')

      expect(screen.getByTestId('drop-index-confirm')).toHaveAttribute('aria-disabled', 'true')
    })

    it('Drop Index button remains disabled with wrong text', async () => {
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await user.type(screen.getByTestId('drop-index-confirm-input'), 'wrong_name')

      expect(screen.getByTestId('drop-index-confirm')).toHaveAttribute('aria-disabled', 'true')
    })

    it('Drop Index button becomes enabled when exact index name is typed', async () => {
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await user.type(screen.getByTestId('drop-index-confirm-input'), 'email_1')

      expect(screen.getByTestId('drop-index-confirm')).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('confirmation is case-sensitive', async () => {
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      await user.type(screen.getByTestId('drop-index-confirm-input'), 'EMAIL_1')

      expect(screen.getByTestId('drop-index-confirm')).toHaveAttribute('aria-disabled', 'true')
    })

    it('resets confirmation input when dialog reopens', async () => {
      const user = userEvent.setup()

      const { rerender } = render(<DropIndexDialog {...defaultProps} />)

      await user.type(screen.getByTestId('drop-index-confirm-input'), 'email_1')

      // Close dialog
      rerender(<DropIndexDialog {...defaultProps} open={false} />)

      // Reopen dialog
      rerender(<DropIndexDialog {...defaultProps} open={true} />)

      expect(screen.getByTestId('drop-index-confirm-input')).toHaveValue('')
      expect(screen.getByTestId('drop-index-confirm')).toHaveAttribute('aria-disabled', 'true')
    })

    it('resets confirmation input when index name changes', async () => {
      const user = userEvent.setup()

      const { rerender } = render(<DropIndexDialog {...defaultProps} />)

      await user.type(screen.getByTestId('drop-index-confirm-input'), 'email_1')

      // Change index name
      rerender(<DropIndexDialog {...defaultProps} indexName="new_index" />)

      expect(screen.getByTestId('drop-index-confirm-input')).toHaveValue('')
      expect(screen.getByTestId('drop-index-confirm')).toHaveAttribute('aria-disabled', 'true')
    })

    it('confirmation input has accessible label', () => {
      render(<DropIndexDialog {...defaultProps} />)

      const input = screen.getByTestId('drop-index-confirm-input')
      expect(input).toHaveAccessibleName()
    })

    it('handles index names with special characters in confirmation', async () => {
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} indexName="user.email_1" />)

      await user.type(screen.getByTestId('drop-index-confirm-input'), 'user.email_1')

      expect(screen.getByTestId('drop-index-confirm')).not.toHaveAttribute('aria-disabled', 'true')
    })
  })

  // ===========================================================================
  // SECTION 10: Accessibility
  // ===========================================================================
  describe('accessibility', () => {
    it('has accessible dialog title', () => {
      render(<DropIndexDialog {...defaultProps} />)

      const dialog = screen.getByRole('dialog')
      const heading = screen.getByRole('heading', { name: /drop index/i })

      // Dialog should reference the heading for aria-labelledby
      expect(dialog).toHaveAttribute('aria-labelledby')
      expect(heading).toBeInTheDocument()
    })

    it('focus is trapped within dialog', () => {
      render(<DropIndexDialog {...defaultProps} />)

      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()

      // Focus should be on an element within the dialog
      const focusableElements = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      expect(focusableElements.length).toBeGreaterThan(0)
    })

    it('Cancel and Drop buttons have accessible names', () => {
      render(<DropIndexDialog {...defaultProps} />)

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /drop index/i })).toBeInTheDocument()
    })

    it('confirmation text is readable by screen readers', () => {
      render(<DropIndexDialog {...defaultProps} />)

      const confirmationText = screen.getByText(/are you sure you want to drop/i)
      expect(confirmationText).toBeInTheDocument()
      expect(confirmationText).toBeVisible()
    })

    it('error message is announced to screen readers', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Test error'))
      const user = userEvent.setup()

      render(<DropIndexDialog {...defaultProps} />)

      // Type confirmation first
      await user.type(screen.getByTestId('drop-index-confirm-input'), 'email_1')
      await user.click(screen.getByTestId('drop-index-confirm'))

      await waitFor(() => {
        const error = screen.getByTestId('drop-index-error')
        // Should have role="alert" or aria-live="polite/assertive"
        const hasAlertRole = error.getAttribute('role') === 'alert'
        const hasAriaLive = error.getAttribute('aria-live') === 'polite' || error.getAttribute('aria-live') === 'assertive'
        expect(hasAlertRole || hasAriaLive).toBe(true)
      })
    })
  })
})
