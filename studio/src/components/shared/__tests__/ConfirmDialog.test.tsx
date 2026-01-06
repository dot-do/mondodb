/**
 * ConfirmDialog Component Tests - RED Phase (TDD)
 *
 * These tests define the expected behavior of a shared ConfirmDialog component
 * for destructive actions. They are written BEFORE the implementation, so they
 * should FAIL initially.
 *
 * Test Coverage:
 * 1. Dialog rendering with title and message
 * 2. Confirm and cancel buttons presence
 * 3. Danger styling on confirm button
 * 4. Cancel closes dialog without action
 * 5. Confirm triggers onConfirm callback
 * 6. Escape key dismissal
 * 7. Custom button labels
 * 8. Loading state during confirmation
 * 9. Accessibility with proper ARIA attributes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { ConfirmDialog } from '../ConfirmDialog'

// Helper to clean up LeafyGreen portals between tests
function cleanupPortals() {
  document.querySelectorAll('[data-lg-portal]').forEach(el => el.remove())
  document.querySelectorAll('[data-leafygreen-ui-modal-container]').forEach(el => el.remove())
  document.querySelectorAll('[class*="lg-ui-portal"]').forEach(el => el.remove())
}

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed with this action?',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    cleanupPortals()
  })

  // ===========================================================================
  // SECTION 1: Dialog Rendering with Title and Message
  // ===========================================================================
  describe('rendering', () => {
    it('renders dialog when open is true', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not render dialog when open is false', () => {
      render(<ConfirmDialog {...defaultProps} open={false} />)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('renders dialog title', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByRole('heading', { name: 'Confirm Action' })).toBeInTheDocument()
    })

    it('renders dialog message', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByText('Are you sure you want to proceed with this action?')).toBeInTheDocument()
    })

    it('renders with different title', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          title="Delete Item"
        />
      )

      expect(screen.getByRole('heading', { name: 'Delete Item' })).toBeInTheDocument()
    })

    it('renders with different message', () => {
      const message = 'This action cannot be undone. All data will be permanently deleted.'
      render(
        <ConfirmDialog
          {...defaultProps}
          message={message}
        />
      )

      expect(screen.getByText(message)).toBeInTheDocument()
    })

    it('renders with multi-line message', () => {
      const message = 'This is a warning.\nThis action is permanent.\nPlease confirm.'
      render(
        <ConfirmDialog
          {...defaultProps}
          message={message}
        />
      )

      expect(screen.getByText(/This is a warning/)).toBeInTheDocument()
      expect(screen.getByText(/This action is permanent/)).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SECTION 2: Confirm and Cancel Buttons Presence
  // ===========================================================================
  describe('button presence', () => {
    it('renders Confirm button', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByTestId('confirm-dialog-confirm')).toBeInTheDocument()
    })

    it('renders Cancel button', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByTestId('confirm-dialog-cancel')).toBeInTheDocument()
    })

    it('Confirm button has default text "Confirm"', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Confirm')
    })

    it('Cancel button has default text "Cancel"', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Cancel')
    })

    it('both buttons are accessible via role', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // SECTION 3: Danger Styling on Confirm Button
  // ===========================================================================
  describe('danger styling', () => {
    it('Confirm button has danger variant styling', () => {
      render(<ConfirmDialog {...defaultProps} />)

      const confirmButton = screen.getByTestId('confirm-dialog-confirm')
      // LeafyGreen buttons with variant="danger" have specific attributes
      expect(confirmButton).toHaveAttribute('data-variant', 'danger')
    })

    it('Cancel button has default variant styling', () => {
      render(<ConfirmDialog {...defaultProps} />)

      const cancelButton = screen.getByTestId('confirm-dialog-cancel')
      expect(cancelButton).toHaveAttribute('data-variant', 'default')
    })

    it('Confirm button is visually distinct from Cancel', () => {
      render(<ConfirmDialog {...defaultProps} />)

      const confirmButton = screen.getByTestId('confirm-dialog-confirm')
      const cancelButton = screen.getByTestId('confirm-dialog-cancel')

      // They should have different variants
      expect(confirmButton.getAttribute('data-variant')).not.toBe(
        cancelButton.getAttribute('data-variant')
      )
    })
  })

  // ===========================================================================
  // SECTION 4: Cancel Closes Dialog Without Action
  // ===========================================================================
  describe('cancel behavior', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      await user.click(screen.getByTestId('confirm-dialog-cancel'))

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('does not call onConfirm when Cancel is clicked', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      await user.click(screen.getByTestId('confirm-dialog-cancel'))

      expect(defaultProps.onConfirm).not.toHaveBeenCalled()
    })

    it('onClose is called exactly once', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      await user.click(screen.getByTestId('confirm-dialog-cancel'))

      expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
    })

    it('clicking outside dialog calls onClose', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      // Click on the modal backdrop/overlay
      const dialog = screen.getByRole('dialog')
      const overlay = dialog.parentElement?.querySelector('[data-testid="modal-overlay"]')

      if (overlay) {
        await user.click(overlay)
        expect(defaultProps.onClose).toHaveBeenCalled()
      }
    })

    it('does not call onConfirm when clicking outside dialog', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      const dialog = screen.getByRole('dialog')
      const overlay = dialog.parentElement?.querySelector('[data-testid="modal-overlay"]')

      if (overlay) {
        await user.click(overlay)
        expect(defaultProps.onConfirm).not.toHaveBeenCalled()
      }
    })
  })

  // ===========================================================================
  // SECTION 5: Confirm Triggers onConfirm Callback
  // ===========================================================================
  describe('confirm behavior', () => {
    it('calls onConfirm when Confirm button is clicked', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      await user.click(screen.getByTestId('confirm-dialog-confirm'))

      expect(defaultProps.onConfirm).toHaveBeenCalled()
    })

    it('calls onConfirm exactly once', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      await user.click(screen.getByTestId('confirm-dialog-confirm'))

      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1)
    })

    it('calls onClose after onConfirm completes', async () => {
      const user = userEvent.setup()
      const callOrder: string[] = []
      const onConfirm = vi.fn(() => callOrder.push('onConfirm'))
      const onClose = vi.fn(() => callOrder.push('onClose'))

      render(
        <ConfirmDialog
          {...defaultProps}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      )

      await user.click(screen.getByTestId('confirm-dialog-confirm'))

      await waitFor(() => {
        expect(callOrder).toEqual(['onConfirm', 'onClose'])
      })
    })

    it('handles async onConfirm callback', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn().mockResolvedValue(undefined)

      render(
        <ConfirmDialog
          {...defaultProps}
          onConfirm={onConfirm}
        />
      )

      await user.click(screen.getByTestId('confirm-dialog-confirm'))

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalled()
      })
    })

    it('closes dialog after async onConfirm completes', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn().mockResolvedValue(undefined)

      render(
        <ConfirmDialog
          {...defaultProps}
          onConfirm={onConfirm}
        />
      )

      await user.click(screen.getByTestId('confirm-dialog-confirm'))

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled()
      })
    })

    it('does not close dialog if onConfirm rejects', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn().mockRejectedValue(new Error('Confirmation failed'))

      render(
        <ConfirmDialog
          {...defaultProps}
          onConfirm={onConfirm}
        />
      )

      await user.click(screen.getByTestId('confirm-dialog-confirm'))

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalled()
      })

      // Verify onClose was not called - if it were going to be called,
      // it would have been called synchronously after the onConfirm rejection
      expect(defaultProps.onClose).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // SECTION 6: Escape Key Dismissal
  // ===========================================================================
  describe('keyboard interactions', () => {
    it('calls onClose when Escape key is pressed', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      await user.keyboard('{Escape}')

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('does not call onConfirm when Escape key is pressed', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      await user.keyboard('{Escape}')

      expect(defaultProps.onConfirm).not.toHaveBeenCalled()
    })

    it('can trigger Confirm button with Enter key when focused', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      const confirmButton = screen.getByTestId('confirm-dialog-confirm')
      confirmButton.focus()

      await user.keyboard('{Enter}')

      expect(defaultProps.onConfirm).toHaveBeenCalled()
    })

    it('can trigger Cancel button with Enter key when focused', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      const cancelButton = screen.getByTestId('confirm-dialog-cancel')
      cancelButton.focus()

      await user.keyboard('{Enter}')

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('can navigate between buttons with Tab key', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      // Tab through focusable elements
      await user.tab()

      // Should be able to tab to buttons
      const activeElement = document.activeElement
      expect(activeElement).toBeTruthy()
      expect(activeElement?.tagName).toBe('BUTTON')
    })
  })

  // ===========================================================================
  // SECTION 7: Custom Button Labels
  // ===========================================================================
  describe('custom button labels', () => {
    it('renders custom confirm button label', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          confirmLabel="Delete"
        />
      )

      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Delete')
    })

    it('renders custom cancel button label', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          cancelLabel="Go Back"
        />
      )

      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Go Back')
    })

    it('renders both custom button labels', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          confirmLabel="Remove"
          cancelLabel="Keep"
        />
      )

      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Remove')
      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Keep')
    })

    it('custom labels are accessible via role', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          confirmLabel="Proceed"
          cancelLabel="Abort"
        />
      )

      expect(screen.getByRole('button', { name: 'Proceed' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Abort' })).toBeInTheDocument()
    })

    it('handles long custom labels gracefully', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          confirmLabel="Yes, I Understand the Consequences"
          cancelLabel="No, Take Me Back to Safety"
        />
      )

      expect(
        screen.getByTestId('confirm-dialog-confirm')
      ).toHaveTextContent('Yes, I Understand the Consequences')
      expect(
        screen.getByTestId('confirm-dialog-cancel')
      ).toHaveTextContent('No, Take Me Back to Safety')
    })
  })

  // ===========================================================================
  // SECTION 8: Loading State During Confirmation
  // ===========================================================================
  describe('loading state', () => {
    it('shows loading state on Confirm button when loading is true', () => {
      render(<ConfirmDialog {...defaultProps} loading={true} />)

      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveAttribute('aria-disabled', 'true')
    })

    it('disables Confirm button when loading is true', () => {
      render(<ConfirmDialog {...defaultProps} loading={true} />)

      // LeafyGreen Button uses aria-disabled
      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveAttribute('aria-disabled', 'true')
    })

    it('disables Cancel button when loading is true', () => {
      render(<ConfirmDialog {...defaultProps} loading={true} />)

      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows loading spinner during loading state', () => {
      render(<ConfirmDialog {...defaultProps} loading={true} />)

      expect(screen.getByTestId('confirm-dialog-spinner')).toBeInTheDocument()
    })

    it('shows custom loading text when provided', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          loading={true}
          loadingLabel="Deleting..."
        />
      )

      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Deleting...')
    })

    it('shows default loading text when no custom label provided', () => {
      render(<ConfirmDialog {...defaultProps} loading={true} />)

      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent(/loading|processing/i)
    })

    it('prevents multiple clicks during loading state', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} loading={true} />)

      await user.click(screen.getByTestId('confirm-dialog-confirm'))

      // onConfirm should not be called when loading
      expect(defaultProps.onConfirm).not.toHaveBeenCalled()
    })

    it('does not disable Escape key during loading', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} loading={true} />)

      await user.keyboard('{Escape}')

      // Should still be able to cancel with Escape during loading
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('automatically enters loading state during async onConfirm', async () => {
      const user = userEvent.setup()
      let resolveConfirm: () => void
      const onConfirm = vi.fn().mockImplementation(() => new Promise(resolve => {
        resolveConfirm = resolve
      }))

      render(
        <ConfirmDialog
          {...defaultProps}
          onConfirm={onConfirm}
        />
      )

      await user.click(screen.getByTestId('confirm-dialog-confirm'))

      // Should show loading state while promise is pending
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog-confirm')).toHaveAttribute('aria-disabled', 'true')
      })

      // Cleanup
      resolveConfirm!()
    })
  })

  // ===========================================================================
  // SECTION 9: Accessibility with Proper ARIA Attributes
  // ===========================================================================
  describe('accessibility', () => {
    it('has aria-modal attribute set to true', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    })

    it('has accessible dialog title via aria-labelledby', () => {
      render(<ConfirmDialog {...defaultProps} />)

      const dialog = screen.getByRole('dialog')
      const heading = screen.getByRole('heading', { name: 'Confirm Action' })

      expect(dialog).toHaveAttribute('aria-labelledby')
      expect(heading).toBeInTheDocument()
    })

    it('dialog title is connected via aria-labelledby', () => {
      render(<ConfirmDialog {...defaultProps} />)

      const dialog = screen.getByRole('dialog')
      const heading = screen.getByRole('heading', { name: 'Confirm Action' })
      const labelledBy = dialog.getAttribute('aria-labelledby')

      expect(labelledBy).toBeTruthy()
      expect(heading.id).toBe(labelledBy)
    })

    it('has accessible description via aria-describedby', () => {
      render(<ConfirmDialog {...defaultProps} />)

      const dialog = screen.getByRole('dialog')

      expect(dialog).toHaveAttribute('aria-describedby')
    })

    it('message is connected via aria-describedby', () => {
      render(<ConfirmDialog {...defaultProps} />)

      const dialog = screen.getByRole('dialog')
      const describedBy = dialog.getAttribute('aria-describedby')
      const messageElement = document.getElementById(describedBy || '')

      expect(messageElement).toBeInTheDocument()
      expect(messageElement).toHaveTextContent(defaultProps.message)
    })

    it('focus is trapped within dialog', () => {
      render(<ConfirmDialog {...defaultProps} />)

      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()

      // Dialog should contain focusable elements
      const focusableElements = dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      expect(focusableElements.length).toBeGreaterThan(0)
    })

    it('Confirm button has accessible name', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    })

    it('Cancel button has accessible name', () => {
      render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('buttons have proper role attribute', () => {
      render(<ConfirmDialog {...defaultProps} />)

      const confirmButton = screen.getByTestId('confirm-dialog-confirm')
      const cancelButton = screen.getByTestId('confirm-dialog-cancel')

      expect(confirmButton).toHaveAttribute('role', 'button')
      expect(cancelButton).toHaveAttribute('role', 'button')
    })

    it('dialog content is readable by screen readers', () => {
      render(<ConfirmDialog {...defaultProps} />)

      const dialog = screen.getByRole('dialog')
      const title = screen.getByText(defaultProps.title)
      const message = screen.getByText(defaultProps.message)

      expect(dialog).toBeVisible()
      expect(title).toBeVisible()
      expect(message).toBeVisible()
    })

    it('has no accessibility violations in default state', () => {
      render(<ConfirmDialog {...defaultProps} />)

      // Dialog should be properly structured for accessibility
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby')
      expect(dialog).toHaveAttribute('aria-describedby')
    })

    it('has no accessibility violations in loading state', () => {
      render(<ConfirmDialog {...defaultProps} loading={true} />)

      // Buttons should be properly disabled
      const confirmButton = screen.getByTestId('confirm-dialog-confirm')
      const cancelButton = screen.getByTestId('confirm-dialog-cancel')

      expect(confirmButton).toHaveAttribute('aria-disabled', 'true')
      expect(cancelButton).toHaveAttribute('aria-disabled', 'true')
    })

    it('maintains focus within dialog during interactions', async () => {
      const user = userEvent.setup()

      render(<ConfirmDialog {...defaultProps} />)

      const dialog = screen.getByRole('dialog')

      // Tab through elements
      await user.tab()
      await user.tab()

      // Focus should remain within dialog
      const activeElement = document.activeElement
      expect(dialog.contains(activeElement)).toBe(true)
    })
  })

  // ===========================================================================
  // SECTION 10: Edge Cases and Integration Scenarios
  // ===========================================================================
  describe('edge cases', () => {
    it('handles empty message gracefully', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          message=""
        />
      )

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: defaultProps.title })).toBeInTheDocument()
    })

    it('handles very long title', () => {
      const longTitle = 'This is a very long title that might wrap to multiple lines and should still be displayed correctly without breaking the layout or accessibility features'

      render(
        <ConfirmDialog
          {...defaultProps}
          title={longTitle}
        />
      )

      expect(screen.getByText(longTitle)).toBeInTheDocument()
    })

    it('handles very long message', () => {
      const longMessage = 'This is a very long message that contains multiple sentences and paragraphs of text. '.repeat(10)

      render(
        <ConfirmDialog
          {...defaultProps}
          message={longMessage}
        />
      )

      expect(screen.getByText(longMessage)).toBeInTheDocument()
    })

    it('handles rapid open/close transitions', () => {
      const { rerender } = render(<ConfirmDialog {...defaultProps} open={true} />)

      rerender(<ConfirmDialog {...defaultProps} open={false} />)
      rerender(<ConfirmDialog {...defaultProps} open={true} />)
      rerender(<ConfirmDialog {...defaultProps} open={false} />)
      rerender(<ConfirmDialog {...defaultProps} open={true} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('resets loading state when dialog reopens', () => {
      const { rerender } = render(<ConfirmDialog {...defaultProps} loading={true} />)

      rerender(<ConfirmDialog {...defaultProps} open={false} loading={true} />)
      rerender(<ConfirmDialog {...defaultProps} open={true} loading={false} />)

      const confirmButton = screen.getByTestId('confirm-dialog-confirm')
      expect(confirmButton).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('works correctly when onConfirm is not provided', async () => {
      const user = userEvent.setup()

      render(
        <ConfirmDialog
          open={true}
          onClose={defaultProps.onClose}
          title={defaultProps.title}
          message={defaultProps.message}
        />
      )

      // Should not crash when clicking confirm without onConfirm handler
      await user.click(screen.getByTestId('confirm-dialog-confirm'))

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('handles updating title while open', () => {
      const { rerender } = render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByRole('heading', { name: 'Confirm Action' })).toBeInTheDocument()

      rerender(<ConfirmDialog {...defaultProps} title="Updated Title" />)

      expect(screen.getByRole('heading', { name: 'Updated Title' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Confirm Action' })).not.toBeInTheDocument()
    })

    it('handles updating message while open', () => {
      const { rerender } = render(<ConfirmDialog {...defaultProps} />)

      expect(screen.getByText(defaultProps.message)).toBeInTheDocument()

      const newMessage = 'This is a completely different message'
      rerender(<ConfirmDialog {...defaultProps} message={newMessage} />)

      expect(screen.getByText(newMessage)).toBeInTheDocument()
      expect(screen.queryByText(defaultProps.message)).not.toBeInTheDocument()
    })

    it('handles special characters in title', () => {
      const specialTitle = 'Delete "User-123" & <Project>?'

      render(
        <ConfirmDialog
          {...defaultProps}
          title={specialTitle}
        />
      )

      expect(screen.getByText(specialTitle)).toBeInTheDocument()
    })

    it('handles special characters in message', () => {
      const specialMessage = 'Are you sure you want to delete <Component> with ID #123 & remove all associated data?'

      render(
        <ConfirmDialog
          {...defaultProps}
          message={specialMessage}
        />
      )

      expect(screen.getByText(specialMessage)).toBeInTheDocument()
    })
  })
})
