import { useState, useCallback } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body, InlineCode } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import ConfirmationModal from '@leafygreen-ui/confirmation-modal'
import Icon from '@leafygreen-ui/icon'
import { useDeleteDocumentMutation } from '@hooks/useQueries'
import type { Document } from '@lib/rpc-client'

const contentStyles = css`
  margin-bottom: 16px;
`

const documentPreviewStyles = css`
  margin-top: 16px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 4px;
  max-height: 200px;
  overflow: auto;
  font-family: 'Source Code Pro', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
`

const warningStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: ${palette.yellow.light3};
  border-radius: 4px;
  margin-top: 16px;
  color: ${palette.yellow.dark2};
`

const warningIconStyles = css`
  flex-shrink: 0;
  margin-top: 2px;
`

const errorStyles = css`
  color: ${palette.red.dark2};
  font-size: 13px;
  padding: 8px 12px;
  background: ${palette.red.light3};
  border-radius: 4px;
  margin-top: 16px;
`

export interface DeleteDocumentProps {
  database: string
  collection: string
  documentId: string
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  /** Optional document preview */
  document?: Document
}

export function DeleteDocument({
  database,
  collection,
  documentId,
  open,
  onClose,
  onSuccess,
  document,
}: DeleteDocumentProps) {
  const [error, setError] = useState<string | null>(null)
  const deleteMutation = useDeleteDocumentMutation(database, collection)

  const handleConfirm = useCallback(async () => {
    setError(null)

    try {
      await deleteMutation.mutateAsync({ _id: documentId })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document')
    }
  }, [documentId, deleteMutation, onSuccess, onClose])

  const handleClose = useCallback(() => {
    setError(null)
    onClose()
  }, [onClose])

  // Format document preview
  const documentPreview = document
    ? JSON.stringify(document, null, 2)
    : null

  return (
    <ConfirmationModal
      open={open}
      onConfirm={handleConfirm}
      onCancel={handleClose}
      title="Delete Document"
      buttonText={deleteMutation.isPending ? 'Deleting...' : 'Delete'}
      variant="danger"
      confirmButtonProps={{
        disabled: deleteMutation.isPending,
      } as Record<string, unknown>}
    >
      <div className={contentStyles}>
        <Body>
          Are you sure you want to delete this document from{' '}
          <strong>{collection}</strong>?
        </Body>

        <Body style={{ marginTop: 8 }}>
          Document ID: <InlineCode>{documentId}</InlineCode>
        </Body>

        {documentPreview && (
          <div
            className={documentPreviewStyles}
            data-testid="delete-document-preview"
          >
            {documentPreview}
          </div>
        )}

        <div className={warningStyles}>
          <Icon glyph="Warning" className={warningIconStyles} />
          <Body>
            This action cannot be undone. The document will be permanently
            deleted.
          </Body>
        </div>

        {error && (
          <div className={errorStyles} role="alert" data-testid="delete-error">
            {error}
          </div>
        )}
      </div>
    </ConfirmationModal>
  )
}

/**
 * Bulk delete confirmation for multiple documents
 */
export interface DeleteDocumentsBulkProps {
  database: string
  collection: string
  documentIds: string[]
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function DeleteDocumentsBulk({
  database,
  collection,
  documentIds,
  open,
  onClose,
  onSuccess,
}: DeleteDocumentsBulkProps) {
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const deleteMutation = useDeleteDocumentMutation(database, collection)

  const handleConfirm = useCallback(async () => {
    setError(null)
    setProgress(0)

    try {
      // Delete documents one by one and track progress
      for (let i = 0; i < documentIds.length; i++) {
        const id = documentIds[i]
        if (id) {
          await deleteMutation.mutateAsync({ _id: id })
          setProgress(((i + 1) / documentIds.length) * 100)
        }
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete documents')
    }
  }, [documentIds, deleteMutation, onSuccess, onClose])

  const handleClose = useCallback(() => {
    setError(null)
    setProgress(0)
    onClose()
  }, [onClose])

  const isDeleting = deleteMutation.isPending

  return (
    <ConfirmationModal
      open={open}
      onConfirm={handleConfirm}
      onCancel={handleClose}
      title="Delete Documents"
      buttonText={
        isDeleting
          ? `Deleting... (${Math.round(progress)}%)`
          : `Delete ${documentIds.length} Documents`
      }
      variant="danger"
      confirmButtonProps={{
        disabled: isDeleting,
      } as Record<string, unknown>}
    >
      <div className={contentStyles}>
        <Body>
          Are you sure you want to delete{' '}
          <strong>{documentIds.length} documents</strong> from{' '}
          <strong>{collection}</strong>?
        </Body>

        <div className={warningStyles}>
          <Icon glyph="Warning" className={warningIconStyles} />
          <Body>
            This action cannot be undone. All selected documents will be
            permanently deleted.
          </Body>
        </div>

        {error && (
          <div className={errorStyles} role="alert" data-testid="delete-bulk-error">
            {error}
          </div>
        )}
      </div>
    </ConfirmationModal>
  )
}

/**
 * Inline delete dialog that manages its own open state
 */
export interface DeleteDocumentInlineProps {
  database: string
  collection: string
  document: Document
  onSuccess?: () => void
  children: (props: { onClick: () => void }) => React.ReactNode
}

export function DeleteDocumentInline({
  database,
  collection,
  document,
  onSuccess,
  children,
}: DeleteDocumentInlineProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {children({ onClick: () => setOpen(true) })}
      <DeleteDocument
        database={database}
        collection={collection}
        documentId={document._id}
        document={document}
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={onSuccess}
      />
    </>
  )
}
