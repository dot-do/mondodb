import { useState, useCallback, useEffect, useMemo } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body, InlineCode } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Modal from '@leafygreen-ui/modal'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import Tooltip from '@leafygreen-ui/tooltip'
import Badge from '@leafygreen-ui/badge'
import { JsonEditor, formatJson, parseJsonSafe } from './JsonEditor'
import { useUpdateDocumentMutation, useDocumentQuery } from '@hooks/useQueries'
import { SkeletonLoader } from '@components/SkeletonLoader'
import type { Document } from '@lib/rpc-client'

const modalContentStyles = css`
  padding: 24px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
`

const headerLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const headerActionsStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const documentIdStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: ${palette.gray.light3};
  border-radius: 4px;
`

const editorContainerStyles = css`
  margin-bottom: 16px;
`

const footerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 16px;
  border-top: 1px solid ${palette.gray.light2};
`

const footerLeftStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const footerRightStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
`

const errorStyles = css`
  color: ${palette.red.dark2};
  font-size: 13px;
  padding: 8px 12px;
  background: ${palette.red.light3};
  border-radius: 4px;
  margin-bottom: 16px;
`

const loadingStyles = css`
  padding: 48px;
  text-align: center;
`

const changeIndicatorStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${palette.gray.dark1};
`

export interface EditDocumentProps {
  database: string
  collection: string
  documentId: string
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  /** Pre-loaded document data (optional, will fetch if not provided) */
  initialDocument?: Document
}

export function EditDocument({
  database,
  collection,
  documentId,
  open,
  onClose,
  onSuccess,
  initialDocument,
}: EditDocumentProps) {
  const [value, setValue] = useState('')
  const [isValid, setIsValid] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Fetch document if not provided
  const {
    data: fetchedDocument,
    isLoading,
    error: fetchError,
  } = useDocumentQuery(
    database,
    collection,
    documentId
  )

  const document = initialDocument ?? fetchedDocument

  const updateMutation = useUpdateDocumentMutation(database, collection)

  // Original document string for comparison
  const originalValue = useMemo(() => {
    if (!document) return ''
    return JSON.stringify(document, null, 2)
  }, [document])

  // Set initial value when document loads
  useEffect(() => {
    if (document && open) {
      const formatted = JSON.stringify(document, null, 2)
      setValue(formatted)
      setHasChanges(false)
      setError(null)
    }
  }, [document, open])

  // Track changes
  useEffect(() => {
    if (!originalValue) return
    try {
      // Compare parsed objects to ignore formatting differences
      const original = JSON.parse(originalValue)
      const current = JSON.parse(value)
      setHasChanges(JSON.stringify(original) !== JSON.stringify(current))
    } catch {
      // If parsing fails, compare strings
      setHasChanges(value !== originalValue)
    }
  }, [value, originalValue])

  const handleValidChange = useCallback((valid: boolean) => {
    setIsValid(valid)
    if (valid) {
      setError(null)
    }
  }, [])

  const handleFormat = useCallback(() => {
    setValue(formatJson(value))
  }, [value])

  const handleReset = useCallback(() => {
    if (document) {
      setValue(JSON.stringify(document, null, 2))
      setError(null)
    }
  }, [document])

  const handleSubmit = useCallback(async () => {
    setError(null)

    const parsed = parseJsonSafe<Record<string, unknown>>(value)
    if (!parsed.success) {
      setError(parsed.error)
      return
    }

    // Validate that the document is an object
    if (
      typeof parsed.data !== 'object' ||
      parsed.data === null ||
      Array.isArray(parsed.data)
    ) {
      setError('Document must be a JSON object')
      return
    }

    // Ensure _id is not changed
    if (parsed.data._id !== documentId) {
      setError('Cannot modify _id field')
      return
    }

    try {
      // Use $set with all fields except _id for update
      const { _id, ...fieldsToUpdate } = parsed.data

      // Build the replacement document
      await updateMutation.mutateAsync({
        filter: { _id: documentId },
        update: { $set: fieldsToUpdate },
      })

      onSuccess?.()
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update document')
    }
  }, [value, documentId, updateMutation, onSuccess])

  const handleClose = useCallback(() => {
    setValue('')
    setError(null)
    setIsValid(true)
    setHasChanges(false)
    onClose()
  }, [onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl/Cmd + Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isValid && hasChanges) {
        e.preventDefault()
        handleSubmit()
      }
      // Ctrl/Cmd + Shift + F to format
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        handleFormat()
      }
      // Escape to close (if no changes)
      if (e.key === 'Escape' && !hasChanges) {
        handleClose()
      }
    },
    [isValid, hasChanges, handleSubmit, handleFormat, handleClose]
  )

  return (
    <Modal open={open} setOpen={handleClose} size="large">
      <div className={modalContentStyles} onKeyDown={handleKeyDown}>
        <div className={headerStyles}>
          <div className={headerLeftStyles}>
            <Icon glyph="Edit" />
            <H3>Edit Document</H3>
            {hasChanges && (
              <Badge variant="yellow">Modified</Badge>
            )}
          </div>
          <div className={headerActionsStyles}>
            <Tooltip
              trigger={
                <IconButton aria-label="Format JSON" onClick={handleFormat}>
                  <Icon glyph="CurlyBraces" />
                </IconButton>
              }
            >
              Format JSON (Cmd+Shift+F)
            </Tooltip>
            <Tooltip
              trigger={
                <IconButton
                  aria-label="Reset changes"
                  onClick={handleReset}
                  disabled={!hasChanges}
                >
                  <Icon glyph="Undo" />
                </IconButton>
              }
            >
              Reset to original
            </Tooltip>
          </div>
        </div>

        {isLoading ? (
          <div className={loadingStyles}>
            <SkeletonLoader count={5} height={20} />
          </div>
        ) : fetchError ? (
          <div className={errorStyles} role="alert">
            Failed to load document: {fetchError.message}
          </div>
        ) : (
          <>
            <div className={documentIdStyles}>
              <Body style={{ fontWeight: 600 }}>_id:</Body>
              <InlineCode>{documentId}</InlineCode>
            </div>

            {error && (
              <div className={errorStyles} role="alert" data-testid="edit-error">
                {error}
              </div>
            )}

            <div className={editorContainerStyles}>
              <JsonEditor
                value={value}
                onChange={setValue}
                onValidChange={handleValidChange}
                height={400}
                data-testid="edit-document-editor"
              />
            </div>

            <div className={footerStyles}>
              <div className={footerLeftStyles}>
                {hasChanges ? (
                  <div className={changeIndicatorStyles}>
                    <Icon glyph="InfoWithCircle" size="small" />
                    <span>You have unsaved changes</span>
                  </div>
                ) : (
                  <Body style={{ fontSize: 12, color: palette.gray.dark1 }}>
                    Tip: Press Cmd+Enter to save
                  </Body>
                )}
              </div>
              <div className={footerRightStyles}>
                <Button variant="default" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={!isValid || !hasChanges || updateMutation.isPending}
                  data-testid="edit-document-submit"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

/**
 * Inline edit document modal that can be used anywhere
 */
export interface EditDocumentInlineProps {
  database: string
  collection: string
  document: Document
  onSuccess?: () => void
  children: (props: { onClick: () => void }) => React.ReactNode
}

export function EditDocumentInline({
  database,
  collection,
  document,
  onSuccess,
  children,
}: EditDocumentInlineProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {children({ onClick: () => setOpen(true) })}
      <EditDocument
        database={database}
        collection={collection}
        documentId={document._id}
        initialDocument={document}
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={onSuccess}
      />
    </>
  )
}
