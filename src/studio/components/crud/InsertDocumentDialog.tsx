/**
 * InsertDocumentDialog Component
 *
 * A dialog component for inserting documents into a MongoDB collection.
 * Features a JSON editor with validation and formatting.
 * Can use either a basic textarea or an enhanced CodeMirror editor.
 */

import { useState, useCallback, useEffect } from 'react'

// Styles for the dialog
const dialogStyles = {
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
    backgroundColor: '#1e1e1e',
    borderRadius: '8px',
    border: '1px solid #444',
    width: '600px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
    color: '#e0e0e0',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid #444',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  iconButton: {
    padding: '6px',
    backgroundColor: 'transparent',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#888',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    padding: '20px',
    overflow: 'auto',
  },
  description: {
    fontSize: '14px',
    color: '#888',
    marginBottom: '16px',
  },
  editorContainer: {
    border: '1px solid #444',
    borderRadius: '6px',
    overflow: 'hidden',
    marginBottom: '16px',
  },
  textarea: {
    width: '100%',
    height: '300px',
    padding: '12px',
    backgroundColor: '#1e1e1e',
    color: '#e0e0e0',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: "'Source Code Pro', 'Menlo', monospace",
    resize: 'vertical' as const,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  error: {
    padding: '12px 16px',
    backgroundColor: '#f4433620',
    border: '1px solid #f44336',
    borderRadius: '4px',
    color: '#ff6b6b',
    fontSize: '13px',
    marginBottom: '16px',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderTop: '1px solid #444',
  },
  footerLeft: {
    fontSize: '12px',
    color: '#666',
  },
  footerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  button: {
    padding: '10px 20px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.2s',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    border: '1px solid #444',
    color: '#888',
  },
  insertButton: {
    backgroundColor: '#4fc3f7',
    color: '#000',
  },
  insertButtonDisabled: {
    backgroundColor: '#4fc3f780',
    color: '#00000080',
    cursor: 'not-allowed',
  },
}

/**
 * Default document template
 */
const DEFAULT_DOCUMENT = `{

}`

/**
 * Format JSON string with proper indentation
 */
export function formatJson(jsonString: string): string {
  try {
    const parsed = JSON.parse(jsonString)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return jsonString
  }
}

/**
 * Parse JSON string safely
 */
export function parseJsonSafe<T = unknown>(
  jsonString: string
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = JSON.parse(jsonString) as T
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid JSON',
    }
  }
}

/**
 * JSON Editor component props
 */
export interface JsonEditorProps {
  value: string
  onChange: (value: string) => void
  onValidChange?: (isValid: boolean) => void
  height?: number | string
  'data-testid'?: string
}

/**
 * Basic JSON Editor using textarea
 * Can be replaced with CodeMirror in the full studio app
 */
export function JsonEditor({
  value,
  onChange,
  onValidChange,
  height = 300,
  'data-testid': testId,
}: JsonEditorProps): React.ReactElement {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      onChange(newValue)

      // Validate JSON
      if (onValidChange) {
        if (!newValue.trim()) {
          onValidChange(true)
        } else {
          try {
            JSON.parse(newValue)
            onValidChange(true)
          } catch {
            onValidChange(false)
          }
        }
      }
    },
    [onChange, onValidChange]
  )

  return (
    <textarea
      value={value}
      onChange={handleChange}
      style={{
        ...dialogStyles.textarea,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
      data-testid={testId}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
    />
  )
}

/**
 * InsertDocumentDialog props
 */
export interface InsertDocumentDialogProps {
  /**
   * Database name
   */
  database: string

  /**
   * Collection name
   */
  collection: string

  /**
   * Whether the dialog is open
   */
  open: boolean

  /**
   * Callback when the dialog is closed
   */
  onClose: () => void

  /**
   * Callback for inserting a document
   * Returns the inserted document's ID
   */
  onInsert: (document: Record<string, unknown>) => Promise<{ insertedId: string }>

  /**
   * Callback when insert is successful
   */
  onSuccess?: (insertedId: string) => void

  /**
   * Optional custom editor component to use instead of the default textarea
   */
  EditorComponent?: React.ComponentType<JsonEditorProps>
}

/**
 * InsertDocumentDialog component
 */
export function InsertDocumentDialog({
  database: _database,
  collection,
  open,
  onClose,
  onInsert,
  onSuccess,
  EditorComponent = JsonEditor,
}: InsertDocumentDialogProps): React.ReactElement | null {
  const [value, setValue] = useState(DEFAULT_DOCUMENT)
  const [isValid, setIsValid] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isInserting, setIsInserting] = useState(false)

  /**
   * Handle valid state change from editor
   */
  const handleValidChange = useCallback((valid: boolean) => {
    setIsValid(valid)
    if (valid) {
      setError(null)
    }
  }, [])

  /**
   * Handle format button click
   */
  const handleFormat = useCallback(() => {
    const formatted = formatJson(value)
    setValue(formatted)
  }, [value])

  /**
   * Handle clear button click
   */
  const handleClear = useCallback(() => {
    setValue(DEFAULT_DOCUMENT)
    setError(null)
    setIsValid(true)
  }, [])

  /**
   * Handle insert button click
   */
  const handleInsert = useCallback(async () => {
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

    setIsInserting(true)
    try {
      const result = await onInsert(parsed.data)
      onSuccess?.(result.insertedId)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to insert document')
    } finally {
      setIsInserting(false)
    }
  }, [value, onInsert, onSuccess])

  /**
   * Handle dialog close
   */
  const handleClose = useCallback(() => {
    setValue(DEFAULT_DOCUMENT)
    setError(null)
    setIsValid(true)
    setIsInserting(false)
    onClose()
  }, [onClose])

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl/Cmd + Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isValid && !isInserting) {
        e.preventDefault()
        handleInsert()
      }
      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      }
      // Ctrl/Cmd + Shift + F to format
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        handleFormat()
      }
    },
    [isValid, isInserting, handleInsert, handleClose, handleFormat]
  )

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setValue(DEFAULT_DOCUMENT)
      setError(null)
      setIsValid(true)
      setIsInserting(false)
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <div
      style={dialogStyles.overlay}
      onClick={handleClose}
      data-testid="insert-document-dialog-overlay"
    >
      <div
        style={dialogStyles.dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        data-testid="insert-document-dialog"
        role="dialog"
        aria-labelledby="insert-dialog-title"
        aria-modal="true"
      >
        {/* Header */}
        <div style={dialogStyles.header}>
          <div style={dialogStyles.headerLeft}>
            <span style={{ fontSize: '18px' }}>+</span>
            <h2 id="insert-dialog-title" style={dialogStyles.title}>
              Insert Document
            </h2>
          </div>
          <div style={dialogStyles.headerActions}>
            <button
              style={dialogStyles.iconButton}
              onClick={handleFormat}
              title="Format JSON (Cmd+Shift+F)"
              aria-label="Format JSON"
              data-testid="format-button"
            >
              {'{ }'}
            </button>
            <button
              style={dialogStyles.iconButton}
              onClick={handleClear}
              title="Clear editor"
              aria-label="Clear"
              data-testid="clear-button"
            >
              X
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={dialogStyles.body}>
          <p style={dialogStyles.description}>
            Enter the document to insert into <strong>{collection}</strong>
          </p>

          {error && (
            <div style={dialogStyles.error} role="alert" data-testid="insert-error">
              {error}
            </div>
          )}

          <div
            style={dialogStyles.editorContainer}
            data-testid="insert-document-editor"
          >
            <EditorComponent
              value={value}
              onChange={setValue}
              onValidChange={handleValidChange}
              height={300}
              data-testid="json-editor-input"
            />
          </div>
        </div>

        {/* Footer */}
        <div style={dialogStyles.footer}>
          <div style={dialogStyles.footerLeft}>
            Tip: Press Cmd+Enter to insert
          </div>
          <div style={dialogStyles.footerRight}>
            <button
              style={{ ...dialogStyles.button, ...dialogStyles.cancelButton }}
              onClick={handleClose}
              data-testid="cancel-button"
            >
              Cancel
            </button>
            <button
              style={{
                ...dialogStyles.button,
                ...(isValid && !isInserting
                  ? dialogStyles.insertButton
                  : dialogStyles.insertButtonDisabled),
              }}
              onClick={handleInsert}
              disabled={!isValid || isInserting}
              data-testid="insert-button"
            >
              {isInserting ? 'Inserting...' : 'Insert'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InsertDocumentDialog
