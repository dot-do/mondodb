/**
 * DropIndexDialog Component
 *
 * A confirmation dialog for dropping (deleting) a MongoDB index.
 * Includes loading state, error handling, and proper accessibility.
 */

import { useState, useEffect, useCallback } from 'react'
import { css, keyframes } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body, Label } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Modal from '@leafygreen-ui/modal'
import Icon from '@leafygreen-ui/icon'
import TextInput from '@leafygreen-ui/text-input'
import { useDropIndexMutation } from '@hooks/useQueries'

// Animation for spinner
const spinAnimation = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`

// Styles
const modalContentStyles = css`
  padding: 24px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`

const warningIconStyles = css`
  color: ${palette.red.base};
`

const confirmationTextStyles = css`
  margin-bottom: 16px;
  color: ${palette.gray.dark2};
`

const indexNameStyles = css`
  font-weight: 600;
  color: ${palette.gray.dark3};
  font-family: 'Source Code Pro', monospace;
  background: ${palette.gray.light3};
  padding: 2px 6px;
  border-radius: 4px;
`

const warningTextStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: ${palette.red.light3};
  border-radius: 4px;
  margin-bottom: 16px;
  color: ${palette.red.dark2};
  font-size: 13px;
`

const errorStyles = css`
  color: red;
  font-size: 13px;
  padding: 8px 12px;
  background: ${palette.red.light3};
  border-radius: 4px;
  margin-bottom: 16px;
`

const confirmInputStyles = css`
  margin-bottom: 16px;
`

const confirmLabelStyles = css`
  margin-bottom: 8px;
  font-size: 13px;
  color: ${palette.gray.dark2};
`

const confirmIndexNameStyles = css`
  font-weight: 600;
  font-family: 'Source Code Pro', monospace;
`

const footerStyles = css`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid ${palette.gray.light2};
`

const spinnerStyles = css`
  display: inline-flex;
  animation: ${spinAnimation} 1s linear infinite;
  margin-right: 6px;
`

const buttonContentStyles = css`
  display: flex;
  align-items: center;
  justify-content: center;
`

export interface DropIndexDialogProps {
  indexName: string
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  dropMutation: ReturnType<typeof useDropIndexMutation>
}

export function DropIndexDialog({
  indexName,
  open,
  onClose,
  onSuccess,
  dropMutation,
}: DropIndexDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [confirmationText, setConfirmationText] = useState('')
  const [previousIndexName, setPreviousIndexName] = useState(indexName)
  const [wasOpen, setWasOpen] = useState(open)

  // Check if confirmation matches index name (type-to-confirm safety)
  const isConfirmed = confirmationText === indexName

  // Clear error and confirmation when index name changes
  useEffect(() => {
    if (indexName !== previousIndexName) {
      setError(null)
      setConfirmationText('')
      setPreviousIndexName(indexName)
    }
  }, [indexName, previousIndexName])

  useEffect(() => {
    // Clear error and confirmation when dialog opens (after being closed)
    if (open && !wasOpen) {
      setError(null)
      setConfirmationText('')
    }
    setWasOpen(open)
  }, [open, wasOpen])

  const handleDrop = useCallback(async () => {
    setError(null)
    try {
      await dropMutation.mutateAsync(indexName)
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to drop index')
    }
  }, [dropMutation, indexName, onSuccess, onClose])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  // Handle escape key
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dropMutation.isPending) {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, dropMutation.isPending, handleClose])

  if (!open) {
    return null
  }

  return (
    <Modal open={open} setOpen={handleClose}>
      <div className={modalContentStyles}>
        <div className={headerStyles}>
          <Icon glyph="Warning" className={warningIconStyles} />
          <H3>Drop Index</H3>
        </div>

        <Body className={confirmationTextStyles}>
          Are you sure you want to drop the index{' '}
          <span data-testid="drop-index-name" className={indexNameStyles}>
            {indexName}
          </span>
          ?
        </Body>

        <div className={warningTextStyles}>
          <Icon glyph="Warning" />
          <Body>
            This action cannot be undone. The index will be permanently deleted and
            queries relying on it may become slower.
          </Body>
        </div>

        <div className={confirmInputStyles}>
          <Body className={confirmLabelStyles}>
            Type <span className={confirmIndexNameStyles}>{indexName}</span> to confirm
          </Body>
          <TextInput
            label="Confirmation"
            aria-label={`Type ${indexName} to confirm deletion`}
            placeholder={indexName}
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            data-testid="drop-index-confirm-input"
            autoComplete="off"
            spellCheck={false}
            hideLabel={true}
          />
        </div>

        {error && (
          <div
            className={errorStyles}
            role="alert"
            data-testid="drop-index-error"
            style={{ color: 'red', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Icon glyph="Warning" fill={palette.red.dark2} />
            <span>{error}</span>
          </div>
        )}

        <div className={footerStyles}>
          <Button
            variant="default"
            onClick={handleClose}
            disabled={dropMutation.isPending}
            data-testid="drop-index-cancel"
            data-variant="default"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDrop}
            disabled={dropMutation.isPending || !isConfirmed}
            data-testid="drop-index-confirm"
            data-variant="danger"
          >
            <span className={buttonContentStyles}>
              {dropMutation.isPending && (
                <span className={spinnerStyles} data-testid="drop-index-spinner">
                  <Icon glyph="Refresh" size="small" />
                </span>
              )}
              {dropMutation.isPending ? 'Dropping...' : 'Drop Index'}
            </span>
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default DropIndexDialog
