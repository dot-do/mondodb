/**
 * ConfirmDialog Component - Stub for TDD RED Phase
 *
 * This is a stub component that will be implemented in the GREEN phase.
 * It throws "not implemented" to ensure tests fail as expected.
 *
 * Expected Props:
 * - open: boolean - Controls dialog visibility
 * - onClose: () => void - Called when dialog should close
 * - onConfirm: () => void | Promise<void> - Called when confirm action is triggered
 * - title: string - Dialog title
 * - message: string - Confirmation message
 * - confirmLabel?: string - Custom label for confirm button (default: "Confirm")
 * - cancelLabel?: string - Custom label for cancel button (default: "Cancel")
 * - loading?: boolean - Shows loading state on confirm button
 * - loadingLabel?: string - Custom loading text (default: "Processing...")
 */

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm?: () => void | Promise<void>
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
  loadingLabel?: string
}

export function ConfirmDialog(_props: ConfirmDialogProps): JSX.Element {
  throw new Error('not implemented')
}
