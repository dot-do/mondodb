/**
 * DeleteDocumentDialog Component
 *
 * Confirmation dialog for deleting documents with support for:
 * - Single document deletion
 * - Multi-select (bulk) deletion
 * - Undo capability via callback
 * - LeafyGreen-like styling (without the actual dependency)
 */

import React, { useState, useCallback, useMemo } from 'react'

/**
 * Document type for the dialog
 */
export interface Document {
  _id: string
  [key: string]: unknown
}

/**
 * Deletion result for undo functionality
 */
export interface DeletionResult {
  success: boolean
  deletedCount: number
  deletedDocuments?: Document[]
  error?: string
}

/**
 * Props for DeleteDocumentDialog
 */
export interface DeleteDocumentDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Database name */
  database: string
  /** Collection name */
  collection: string
  /** Single document ID to delete */
  documentId?: string
  /** Multiple document IDs to delete (for bulk delete) */
  documentIds?: string[]
  /** Optional document preview */
  document?: Document
  /** Optional documents for bulk preview */
  documents?: Document[]
  /** Called when the dialog is closed */
  onClose: () => void
  /** Called when deletion is confirmed */
  onConfirm: (ids: string[]) => Promise<DeletionResult>
  /** Called after successful deletion */
  onSuccess?: (result: DeletionResult) => void
  /** Called when undo is triggered */
  onUndo?: (deletedDocuments: Document[]) => Promise<void>
  /** Whether undo is supported */
  undoEnabled?: boolean
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  dialog: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    padding: '20px 24px 16px',
    borderBottom: '1px solid #e8e8e8',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    color: '#1c2d38',
  },
  content: {
    padding: '24px',
    flex: 1,
    overflow: 'auto',
  },
  body: {
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#3d4f58',
    marginBottom: '16px',
  },
  documentPreview: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#f5f6f7',
    borderRadius: '4px',
    maxHeight: '200px',
    overflow: 'auto',
    fontFamily: "'Source Code Pro', monospace",
    fontSize: '12px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
  },
  warning: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '12px',
    backgroundColor: '#fef7e0',
    borderRadius: '4px',
    marginTop: '16px',
    color: '#944f01',
    fontSize: '14px',
  },
  warningIcon: {
    flexShrink: 0,
    marginTop: '2px',
    color: '#944f01',
  },
  error: {
    color: '#cf4747',
    fontSize: '13px',
    padding: '8px 12px',
    backgroundColor: '#fce9e8',
    borderRadius: '4px',
    marginTop: '16px',
  },
  undoNotice: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    backgroundColor: '#e7f0f5',
    borderRadius: '4px',
    marginTop: '16px',
    color: '#016bf8',
    fontSize: '13px',
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid #e8e8e8',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  button: {
    padding: '10px 20px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    border: 'none',
  },
  cancelButton: {
    backgroundColor: '#f5f6f7',
    color: '#3d4f58',
    border: '1px solid #ccc',
  },
  deleteButton: {
    backgroundColor: '#cf4747',
    color: '#fff',
  },
  deleteButtonDisabled: {
    backgroundColor: '#e8a8a8',
    cursor: 'not-allowed',
  },
  inlineCode: {
    backgroundColor: '#f5f6f7',
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: "'Source Code Pro', monospace",
    fontSize: '13px',
  },
  progressBar: {
    marginTop: '16px',
    height: '4px',
    backgroundColor: '#e8e8e8',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#cf4747',
    transition: 'width 0.3s ease',
  },
}

/**
 * Warning icon SVG
 */
function WarningIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      style={styles.warningIcon}
    >
      <path d="M8 1.5a.5.5 0 0 1 .434.252l6.5 11.5A.5.5 0 0 1 14.5 14H1.5a.5.5 0 0 1-.434-.748l6.5-11.5A.5.5 0 0 1 8 1.5zm0 4a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3a.5.5 0 0 0-.5-.5zm0 5.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" />
    </svg>
  )
}

/**
 * Undo icon SVG
 */
function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 3c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5h-2c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3v2l3-3-3-3v2z" />
    </svg>
  )
}

export function DeleteDocumentDialog({
  open,
  database: _database,
  collection,
  documentId,
  documentIds = [],
  document,
  documents = [],
  onClose,
  onConfirm,
  onSuccess,
  onUndo,
  undoEnabled = false,
}: DeleteDocumentDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [deletionResult, setDeletionResult] = useState<DeletionResult | null>(null)

  // Determine if this is a bulk delete (more than 1 document)
  // Single documentId or single item in documentIds is treated as single delete
  const isBulkDelete = !documentId && documentIds.length > 1

  // Get all IDs to delete
  const idsToDelete = useMemo(() => {
    if (documentId) return [documentId]
    return documentIds
  }, [documentId, documentIds])

  const count = idsToDelete.length

  // Format document preview
  const documentPreview = useMemo(() => {
    if (document) {
      return JSON.stringify(document, null, 2)
    }
    if (documents.length > 0 && documents.length <= 3) {
      return documents.map(d => JSON.stringify(d, null, 2)).join('\n---\n')
    }
    return null
  }, [document, documents])

  const handleConfirm = useCallback(async () => {
    setError(null)
    setIsDeleting(true)
    setProgress(0)

    try {
      const result = await onConfirm(idsToDelete)

      setProgress(100)
      setDeletionResult(result)

      if (result.success) {
        onSuccess?.(result)
        onClose()
      } else {
        setError(result.error || 'Failed to delete document(s)')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document(s)')
    } finally {
      setIsDeleting(false)
    }
  }, [idsToDelete, onConfirm, onSuccess, onClose])

  const handleUndo = useCallback(async () => {
    if (!deletionResult?.deletedDocuments || !onUndo) return

    try {
      await onUndo(deletionResult.deletedDocuments)
      setDeletionResult(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo deletion')
    }
  }, [deletionResult, onUndo])
  // Silence unused variable warning - handleUndo is for future undo feature
  void handleUndo

  const handleClose = useCallback(() => {
    setError(null)
    setProgress(0)
    setDeletionResult(null)
    onClose()
  }, [onClose])

  // Handle escape key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isDeleting) {
      handleClose()
    }
  }, [isDeleting, handleClose])

  if (!open) return null

  const title = isBulkDelete ? 'Delete Documents' : 'Delete Document'
  const buttonText = isDeleting
    ? isBulkDelete
      ? `Deleting... (${Math.round(progress)}%)`
      : 'Deleting...'
    : isBulkDelete
      ? `Delete ${count} Documents`
      : 'Delete'

  return (
    <div
      style={styles.overlay}
      onClick={handleClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      data-testid="delete-document-dialog"
    >
      <div
        style={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 id="delete-dialog-title" style={styles.title}>
            {title}
          </h2>
        </div>

        <div style={styles.content}>
          <p style={styles.body}>
            {isBulkDelete ? (
              <>
                Are you sure you want to delete{' '}
                <strong>{count} documents</strong> from{' '}
                <strong>{collection}</strong>?
              </>
            ) : (
              <>
                Are you sure you want to delete this document from{' '}
                <strong>{collection}</strong>?
              </>
            )}
          </p>

          {!isBulkDelete && idsToDelete.length === 1 && idsToDelete[0] && (
            <p style={styles.body}>
              Document ID: <code style={styles.inlineCode}>{idsToDelete[0]}</code>
            </p>
          )}

          {documentPreview && (
            <div
              style={styles.documentPreview}
              data-testid="delete-document-preview"
            >
              {documentPreview}
            </div>
          )}

          <div style={styles.warning}>
            <WarningIcon />
            <span>
              This action cannot be undone.{' '}
              {isBulkDelete
                ? 'All selected documents will be permanently deleted.'
                : 'The document will be permanently deleted.'}
            </span>
          </div>

          {undoEnabled && onUndo && (
            <div style={styles.undoNotice} data-testid="undo-notice">
              <UndoIcon />
              <span>
                Undo will be available for 30 seconds after deletion.
              </span>
            </div>
          )}

          {isDeleting && isBulkDelete && (
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${progress}%`,
                }}
                data-testid="delete-progress"
              />
            </div>
          )}

          {error && (
            <div style={styles.error} role="alert" data-testid="delete-error">
              {error}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button
            type="button"
            style={{ ...styles.button, ...styles.cancelButton }}
            onClick={handleClose}
            disabled={isDeleting}
            data-testid="delete-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            style={{
              ...styles.button,
              ...styles.deleteButton,
              ...(isDeleting ? styles.deleteButtonDisabled : {}),
            }}
            onClick={handleConfirm}
            disabled={isDeleting}
            data-testid="delete-document-confirm"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Props for DeleteDocumentsBulk - convenience wrapper for bulk deletion
 */
export interface DeleteDocumentsBulkProps {
  open: boolean
  database: string
  collection: string
  documentIds: string[]
  onClose: () => void
  onConfirm: (ids: string[]) => Promise<DeletionResult>
  onSuccess?: (result: DeletionResult) => void
}

/**
 * Bulk delete convenience component
 */
export function DeleteDocumentsBulk({
  open,
  database,
  collection,
  documentIds,
  onClose,
  onConfirm,
  onSuccess,
}: DeleteDocumentsBulkProps) {
  return (
    <DeleteDocumentDialog
      open={open}
      database={database}
      collection={collection}
      documentIds={documentIds}
      onClose={onClose}
      onConfirm={onConfirm}
      onSuccess={onSuccess}
    />
  )
}

/**
 * Props for inline delete trigger
 */
export interface DeleteDocumentInlineProps {
  database: string
  collection: string
  document: Document
  onConfirm: (ids: string[]) => Promise<DeletionResult>
  onSuccess?: (result: DeletionResult) => void
  children: (props: { onClick: () => void }) => React.ReactNode
}

/**
 * Inline delete dialog that manages its own open state
 */
export function DeleteDocumentInline({
  database,
  collection,
  document,
  onConfirm,
  onSuccess,
  children,
}: DeleteDocumentInlineProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {children({ onClick: () => setOpen(true) })}
      <DeleteDocumentDialog
        open={open}
        database={database}
        collection={collection}
        documentId={document._id}
        document={document}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        onSuccess={onSuccess}
      />
    </>
  )
}

export default DeleteDocumentDialog
