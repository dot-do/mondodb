import { useState, useCallback } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Modal from '@leafygreen-ui/modal'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import Tooltip from '@leafygreen-ui/tooltip'
import { JsonEditor, formatJson, parseJsonSafe } from './JsonEditor'
import { useInsertDocumentMutation } from '@hooks/useQueries'

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

const descriptionStyles = css`
  color: ${palette.gray.dark1};
  margin-bottom: 16px;
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

const DEFAULT_DOCUMENT = `{

}`

export interface CreateDocumentProps {
  database: string
  collection: string
  open: boolean
  onClose: () => void
  onSuccess?: (insertedId: string) => void
}

export function CreateDocument({
  database,
  collection,
  open,
  onClose,
  onSuccess,
}: CreateDocumentProps) {
  const [value, setValue] = useState(DEFAULT_DOCUMENT)
  const [isValid, setIsValid] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const insertMutation = useInsertDocumentMutation(database, collection)

  const handleValidChange = useCallback((valid: boolean) => {
    setIsValid(valid)
    if (valid) {
      setError(null)
    }
  }, [])

  const handleFormat = useCallback(() => {
    setValue(formatJson(value))
  }, [value])

  const handleClear = useCallback(() => {
    setValue(DEFAULT_DOCUMENT)
    setError(null)
  }, [])

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

    try {
      const result = await insertMutation.mutateAsync(parsed.data)
      onSuccess?.(result.insertedId)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert document')
    }
  }, [value, insertMutation, onSuccess])

  const handleClose = useCallback(() => {
    setValue(DEFAULT_DOCUMENT)
    setError(null)
    setIsValid(true)
    onClose()
  }, [onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl/Cmd + Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isValid) {
        e.preventDefault()
        handleSubmit()
      }
      // Ctrl/Cmd + Shift + F to format
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        handleFormat()
      }
    },
    [isValid, handleSubmit, handleFormat]
  )

  return (
    <Modal open={open} setOpen={handleClose} size="large">
      <div className={modalContentStyles} onKeyDown={handleKeyDown}>
        <div className={headerStyles}>
          <div className={headerLeftStyles}>
            <Icon glyph="Plus" />
            <H3>Insert Document</H3>
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
                <IconButton aria-label="Clear" onClick={handleClear}>
                  <Icon glyph="Trash" />
                </IconButton>
              }
            >
              Clear editor
            </Tooltip>
          </div>
        </div>

        <Body className={descriptionStyles}>
          Enter the document to insert into <strong>{collection}</strong>
        </Body>

        {error && (
          <div className={errorStyles} role="alert" data-testid="create-error">
            {error}
          </div>
        )}

        <div className={editorContainerStyles}>
          <JsonEditor
            value={value}
            onChange={setValue}
            onValidChange={handleValidChange}
            height={350}
            data-testid="create-document-editor"
          />
        </div>

        <div className={footerStyles}>
          <div className={footerLeftStyles}>
            <Body style={{ fontSize: 12, color: palette.gray.dark1 }}>
              Tip: Press Cmd+Enter to insert
            </Body>
          </div>
          <div className={footerRightStyles}>
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!isValid || insertMutation.isPending}
              data-testid="create-document-submit"
            >
              {insertMutation.isPending ? 'Inserting...' : 'Insert'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Trigger button for opening the create document modal
 */
export interface CreateDocumentButtonProps {
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'primaryOutline' | 'default'
}

export function CreateDocumentButton({
  onClick,
  disabled = false,
  variant = 'primary',
}: CreateDocumentButtonProps) {
  return (
    <Button
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      leftGlyph={<Icon glyph="Plus" />}
      data-testid="add-document-button"
    >
      Add Document
    </Button>
  )
}
