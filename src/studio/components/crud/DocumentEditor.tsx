/**
 * DocumentEditor Component
 *
 * Provides inline field editing for MongoDB documents with:
 * - Inline field editing for all field types
 * - Field validation with error messages
 * - Diff preview before save
 * - Add/remove fields capability
 * - Keyboard shortcuts
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react'

// Type definitions
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

interface Document {
  _id: string
  [key: string]: JsonValue
}

export interface DocumentEditorProps {
  /** The document to edit */
  document: Document
  /** Called when save button is clicked with updated document */
  onSave?: (document: Document) => void
  /** Called when cancel button is clicked */
  onCancel?: () => void
  /** Fields that are required */
  requiredFields?: string[]
  /** Whether the editor is read-only */
  readOnly?: boolean
}

interface FieldState {
  value: JsonValue
  error: string | null
  touched: boolean
}

interface DiffItem {
  field: string
  oldValue: JsonValue
  newValue: JsonValue
  type: 'modified' | 'added' | 'removed'
}

// Styles
const styles = {
  container: {
    fontFamily: "'Source Code Pro', 'Menlo', monospace",
    fontSize: '13px',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#f9f9f9',
  } as React.CSSProperties,
  fieldsContainer: {
    padding: '8px 0',
  } as React.CSSProperties,
  field: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '8px 16px',
    borderBottom: '1px solid #f0f0f0',
    position: 'relative' as const,
  } as React.CSSProperties,
  fieldHover: {
    backgroundColor: '#f5f5f5',
  } as React.CSSProperties,
  fieldKey: {
    width: '150px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  fieldKeyName: {
    color: '#7b61ff',
    fontWeight: 500,
  } as React.CSSProperties,
  fieldType: {
    fontSize: '10px',
    padding: '2px 6px',
    backgroundColor: '#e8e8e8',
    borderRadius: '3px',
    color: '#666',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,
  fieldValue: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  input: {
    flex: 1,
    padding: '6px 10px',
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  inputError: {
    borderColor: '#f44336',
    backgroundColor: '#fff5f5',
  } as React.CSSProperties,
  inputReadOnly: {
    backgroundColor: '#f5f5f5',
    color: '#666',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#999',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  toggle: {
    width: '40px',
    height: '22px',
    borderRadius: '11px',
    backgroundColor: '#e0e0e0',
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  toggleChecked: {
    backgroundColor: '#4caf50',
  } as React.CSSProperties,
  toggleKnob: {
    position: 'absolute' as const,
    top: '2px',
    left: '2px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: '#fff',
    transition: 'transform 0.2s',
  } as React.CSSProperties,
  toggleKnobChecked: {
    transform: 'translateX(18px)',
  } as React.CSSProperties,
  errorMessage: {
    color: '#f44336',
    fontSize: '11px',
    marginTop: '4px',
  } as React.CSSProperties,
  expandButton: {
    padding: '4px 8px',
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
    backgroundColor: '#f9f9f9',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as React.CSSProperties,
  nestedContainer: {
    marginLeft: '16px',
    borderLeft: '2px solid #e0e0e0',
    paddingLeft: '8px',
  } as React.CSSProperties,
  diffPreview: {
    margin: '16px',
    padding: '12px',
    backgroundColor: '#fffbf0',
    border: '1px solid #ffe0b2',
    borderRadius: '4px',
  } as React.CSSProperties,
  diffTitle: {
    fontWeight: 600,
    marginBottom: '8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,
  diffItem: {
    display: 'flex',
    gap: '8px',
    padding: '4px 0',
    fontSize: '12px',
  } as React.CSSProperties,
  diffOld: {
    backgroundColor: '#ffebee',
    padding: '2px 6px',
    borderRadius: '3px',
    textDecoration: 'line-through',
  } as React.CSSProperties,
  diffNew: {
    backgroundColor: '#e8f5e9',
    padding: '2px 6px',
    borderRadius: '3px',
  } as React.CSSProperties,
  diffRemoved: {
    backgroundColor: '#ffebee',
    padding: '2px 6px',
    borderRadius: '3px',
    color: '#c62828',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    gap: '8px',
    padding: '16px',
    borderTop: '1px solid #e0e0e0',
    justifyContent: 'flex-end',
  } as React.CSSProperties,
  button: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  } as React.CSSProperties,
  buttonPrimary: {
    backgroundColor: '#1976d2',
    color: '#fff',
  } as React.CSSProperties,
  buttonDisabled: {
    backgroundColor: '#e0e0e0',
    color: '#999',
    cursor: 'not-allowed',
  } as React.CSSProperties,
  buttonSecondary: {
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: '1px solid #e0e0e0',
  } as React.CSSProperties,
  deleteButton: {
    padding: '4px 8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#f44336',
    cursor: 'pointer',
    borderRadius: '4px',
    opacity: 0,
    transition: 'opacity 0.2s',
  } as React.CSSProperties,
  deleteButtonVisible: {
    opacity: 1,
  } as React.CSSProperties,
  addFieldButton: {
    margin: '8px 16px',
    padding: '8px 16px',
    border: '1px dashed #e0e0e0',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: '#1976d2',
    width: 'calc(100% - 32px)',
    textAlign: 'left' as const,
  } as React.CSSProperties,
  newFieldInput: {
    display: 'flex',
    gap: '8px',
    padding: '8px 16px',
  } as React.CSSProperties,
  confirmDialog: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialogContent: {
    backgroundColor: '#fff',
    padding: '24px',
    borderRadius: '8px',
    maxWidth: '400px',
    width: '100%',
  } as React.CSSProperties,
  dialogButtons: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '16px',
  } as React.CSSProperties,
}

// Helper to get type of value
function getValueType(value: JsonValue): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

// Helper to format value for display
function formatValue(value: JsonValue): string {
  if (value === null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Toggle component for boolean fields
interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}

function Toggle({ checked, onChange, disabled, 'aria-label': ariaLabel }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        ...styles.toggle,
        ...(checked ? styles.toggleChecked : {}),
        ...(disabled ? { cursor: 'not-allowed', opacity: 0.5 } : {}),
      }}
    >
      <span
        style={{
          ...styles.toggleKnob,
          ...(checked ? styles.toggleKnobChecked : {}),
        }}
      />
    </button>
  )
}

// Field editor component
interface FieldEditorProps {
  fieldKey: string
  value: JsonValue
  error: string | null
  readOnly?: boolean
  isIdField?: boolean
  onValueChange: (value: JsonValue) => void
  onDelete?: () => void
  requiredFields?: string[]
  onBlur?: () => void
  path?: string
}

function FieldEditor({
  fieldKey,
  value,
  error,
  readOnly,
  isIdField,
  onValueChange,
  onDelete,
  requiredFields = [],
  onBlur,
  path = '',
}: FieldEditorProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const fieldPath = path ? `${path}.${fieldKey}` : fieldKey
  const type = getValueType(value)
  const isRequired = requiredFields.includes(fieldKey)

  const handleStringChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(e.target.value)
    },
    [onValueChange]
  )

  const handleNumberChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const numValue = e.target.valueAsNumber
      if (isNaN(numValue)) {
        onValueChange(e.target.value as unknown as JsonValue) // Keep invalid for validation
      } else {
        onValueChange(numValue)
      }
    },
    [onValueChange]
  )

  const renderValue = () => {
    if (readOnly || isIdField) {
      return (
        <input
          type="text"
          value={formatValue(value)}
          readOnly
          disabled={readOnly}
          style={{
            ...styles.input,
            ...(isIdField ? styles.inputReadOnly : styles.inputDisabled),
          }}
          aria-label={`${fieldKey} value`}
        />
      )
    }

    switch (type) {
      case 'string':
        return (
          <input
            type="text"
            value={value as string}
            onChange={handleStringChange}
            onBlur={onBlur}
            style={{
              ...styles.input,
              ...(error ? styles.inputError : {}),
            }}
            aria-label={`${fieldKey} value`}
            required={isRequired}
          />
        )

      case 'number':
        return (
          <input
            type="number"
            value={typeof value === 'number' ? value : ''}
            onChange={handleNumberChange}
            onBlur={onBlur}
            style={{
              ...styles.input,
              ...(error ? styles.inputError : {}),
            }}
            aria-label={`${fieldKey} value`}
          />
        )

      case 'boolean':
        return (
          <Toggle
            checked={value as boolean}
            onChange={onValueChange}
            aria-label={`${fieldKey} toggle`}
          />
        )

      case 'array':
        const arr = value as JsonValue[]
        return (
          <div style={{ flex: 1 }}>
            <button
              style={styles.expandButton}
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Collapse array' : 'Expand array'}
            >
              {isExpanded ? '[-]' : '[+]'} {arr.length} items
            </button>
            {isExpanded && (
              <div style={styles.nestedContainer}>
                {arr.map((item, index) => (
                  <FieldEditor
                    key={index}
                    fieldKey={String(index)}
                    value={item}
                    error={null}
                    readOnly={readOnly}
                    onValueChange={(newValue) => {
                      const newArr = [...arr]
                      newArr[index] = newValue
                      onValueChange(newArr)
                    }}
                    path={fieldPath}
                  />
                ))}
              </div>
            )}
          </div>
        )

      case 'object':
        const obj = value as { [key: string]: JsonValue }
        const keys = Object.keys(obj)
        return (
          <div style={{ flex: 1 }}>
            <button
              style={styles.expandButton}
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Collapse object' : 'Expand object'}
            >
              {isExpanded ? '{-}' : '{+}'} {keys.length} fields
            </button>
            {isExpanded && (
              <div style={styles.nestedContainer}>
                {keys.map((key) => (
                  <FieldEditor
                    key={key}
                    fieldKey={key}
                    value={obj[key]}
                    error={null}
                    readOnly={readOnly}
                    onValueChange={(newValue) => {
                      onValueChange({ ...obj, [key]: newValue })
                    }}
                    path={fieldPath}
                  />
                ))}
              </div>
            )}
          </div>
        )

      case 'null':
        return (
          <input
            type="text"
            value="null"
            disabled
            style={{
              ...styles.input,
              ...styles.inputDisabled,
            }}
            aria-label={`${fieldKey} value`}
          />
        )

      default:
        return (
          <input
            type="text"
            value={formatValue(value)}
            onChange={handleStringChange}
            style={styles.input}
            aria-label={`${fieldKey} value`}
          />
        )
    }
  }

  return (
    <div
      data-testid={`field-${fieldKey}`}
      style={{
        ...styles.field,
        ...(isHovered ? styles.fieldHover : {}),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={styles.fieldKey}>
        <span style={styles.fieldKeyName}>{fieldKey}</span>
        <span style={styles.fieldType}>{type}</span>
      </div>
      <div style={styles.fieldValue}>
        {renderValue()}
        {!isIdField && !readOnly && onDelete && (
          <button
            style={{
              ...styles.deleteButton,
              ...(isHovered ? styles.deleteButtonVisible : {}),
            }}
            onClick={onDelete}
            aria-label={`Delete ${fieldKey} field`}
          >
            Delete
          </button>
        )}
      </div>
      {error && <div style={styles.errorMessage}>{error}</div>}
    </div>
  )
}

// Diff preview component
interface DiffPreviewProps {
  diffs: DiffItem[]
}

function DiffPreview({ diffs }: DiffPreviewProps) {
  if (diffs.length === 0) return null

  return (
    <div data-testid="diff-preview" style={styles.diffPreview}>
      <div style={styles.diffTitle}>
        <span>Changes Preview</span>
        <span>{diffs.length} changes</span>
      </div>
      {diffs.map((diff) => (
        <div key={diff.field} style={styles.diffItem} data-testid={diff.type === 'removed' ? `removed-${diff.field}` : undefined}>
          <strong>{diff.field}:</strong>
          {diff.type === 'removed' ? (
            <span style={styles.diffRemoved}>{formatValue(diff.oldValue)} (removed)</span>
          ) : (
            <>
              {diff.oldValue !== undefined && (
                <span style={styles.diffOld}>{formatValue(diff.oldValue)}</span>
              )}
              <span>-&gt;</span>
              <span style={styles.diffNew}>{formatValue(diff.newValue)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// Confirm dialog component
interface ConfirmDialogProps {
  open: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ open, message, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div style={styles.confirmDialog}>
      <div style={styles.dialogContent}>
        <p>{message}</p>
        <div style={styles.dialogButtons}>
          <button
            style={{ ...styles.button, ...styles.buttonSecondary }}
            onClick={onCancel}
          >
            Keep editing
          </button>
          <button
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={onConfirm}
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>
  )
}

// Main DocumentEditor component
export function DocumentEditor({
  document,
  onSave,
  onCancel,
  requiredFields = [],
  readOnly = false,
}: DocumentEditorProps) {
  const [fields, setFields] = useState<Record<string, FieldState>>(() => {
    const initialFields: Record<string, FieldState> = {}
    for (const key of Object.keys(document)) {
      initialFields[key] = {
        value: document[key],
        error: null,
        touched: false,
      }
    }
    return initialFields
  })

  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isAddingField, setIsAddingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Calculate current document from fields
  const currentDocument = useMemo((): Document => {
    const doc: Document = { _id: document._id }
    for (const [key, state] of Object.entries(fields)) {
      doc[key] = state.value
    }
    return doc
  }, [fields, document._id])

  // Calculate diffs
  const diffs = useMemo((): DiffItem[] => {
    const diffList: DiffItem[] = []
    const originalKeys = new Set(Object.keys(document))
    const currentKeys = new Set(Object.keys(fields))

    // Check for modified and removed fields
    for (const key of originalKeys) {
      if (!currentKeys.has(key)) {
        diffList.push({
          field: key,
          oldValue: document[key],
          newValue: null,
          type: 'removed',
        })
      } else if (JSON.stringify(document[key]) !== JSON.stringify(fields[key]?.value)) {
        diffList.push({
          field: key,
          oldValue: document[key],
          newValue: fields[key]!.value,
          type: 'modified',
        })
      }
    }

    // Check for added fields
    for (const key of currentKeys) {
      if (!originalKeys.has(key)) {
        diffList.push({
          field: key,
          oldValue: null,
          newValue: fields[key]!.value,
          type: 'added',
        })
      }
    }

    return diffList
  }, [document, fields])

  const hasChanges = diffs.length > 0

  // Validate fields
  const hasErrors = useMemo(() => {
    for (const [key, state] of Object.entries(fields)) {
      if (state.error) return true
      if (requiredFields.includes(key) && (state.value === '' || state.value === null)) {
        return true
      }
    }
    return false
  }, [fields, requiredFields])

  // Handle field value change
  const handleFieldChange = useCallback((key: string, value: JsonValue) => {
    setFields((prev) => {
      let error: string | null = null

      // Validate number fields
      if (typeof document[key] === 'number' && typeof value === 'string') {
        error = 'Invalid number'
      }

      return {
        ...prev,
        [key]: {
          value,
          error,
          touched: true,
        },
      }
    })
  }, [document])

  // Handle field blur for validation
  const handleFieldBlur = useCallback((key: string) => {
    setFields((prev) => {
      const field = prev[key]
      if (!field) return prev

      let error: string | null = null

      // Required validation
      if (requiredFields.includes(key) && (field.value === '' || field.value === null)) {
        error = 'This field is required'
      }

      return {
        ...prev,
        [key]: {
          ...field,
          error,
          touched: true,
        },
      }
    })
  }, [requiredFields])

  // Handle field deletion
  const handleDeleteField = useCallback((key: string) => {
    setFields((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  // Handle adding new field
  const handleAddField = useCallback(() => {
    if (!newFieldName.trim()) return

    setFields((prev) => ({
      ...prev,
      [newFieldName]: {
        value: '',
        error: null,
        touched: false,
      },
    }))
    setNewFieldName('')
    setIsAddingField(false)
  }, [newFieldName])

  // Handle save
  const handleSave = useCallback(() => {
    if (hasErrors || !hasChanges) return
    onSave?.(currentDocument)
  }, [hasErrors, hasChanges, currentDocument, onSave])

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (hasChanges) {
      setShowConfirmDialog(true)
    } else {
      onCancel?.()
    }
  }, [hasChanges, onCancel])

  // Handle confirm discard
  const handleConfirmDiscard = useCallback(() => {
    setShowConfirmDialog(false)
    onCancel?.()
  }, [onCancel])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to save
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      }
      // Escape to cancel
      if (e.key === 'Escape') {
        if (!hasChanges) {
          onCancel?.()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, hasChanges, onCancel])

  const fieldKeys = Object.keys(fields)

  return (
    <div data-testid="document-editor" style={styles.container} ref={containerRef}>
      <div style={styles.header}>
        <span>Document Editor</span>
        {hasChanges && <span>{diffs.length} changes</span>}
      </div>

      <div style={styles.fieldsContainer}>
        {fieldKeys.map((key) => (
          <FieldEditor
            key={key}
            fieldKey={key}
            value={fields[key]!.value}
            error={fields[key]!.error}
            readOnly={readOnly}
            isIdField={key === '_id'}
            onValueChange={(value) => handleFieldChange(key, value)}
            onDelete={key !== '_id' ? () => handleDeleteField(key) : undefined}
            requiredFields={requiredFields}
            onBlur={() => handleFieldBlur(key)}
          />
        ))}
      </div>

      {!readOnly && !isAddingField && (
        <button
          style={styles.addFieldButton}
          onClick={() => setIsAddingField(true)}
          aria-label="Add field"
        >
          + Add field
        </button>
      )}

      {isAddingField && (
        <div style={styles.newFieldInput}>
          <input
            type="text"
            placeholder="Field name"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddField()}
            style={styles.input}
            autoFocus
          />
          <button
            style={{ ...styles.button, ...styles.buttonPrimary }}
            onClick={handleAddField}
          >
            Add
          </button>
          <button
            style={{ ...styles.button, ...styles.buttonSecondary }}
            onClick={() => {
              setIsAddingField(false)
              setNewFieldName('')
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {hasChanges && <DiffPreview diffs={diffs} />}

      {!readOnly && (
        <div style={styles.actions}>
          <button
            style={{ ...styles.button, ...styles.buttonSecondary }}
            onClick={handleCancel}
            aria-label="Cancel"
          >
            Cancel
          </button>
          <button
            style={{
              ...styles.button,
              ...(hasChanges && !hasErrors ? styles.buttonPrimary : styles.buttonDisabled),
            }}
            onClick={handleSave}
            disabled={!hasChanges || hasErrors}
            aria-label="Save"
          >
            Save
          </button>
        </div>
      )}

      <ConfirmDialog
        open={showConfirmDialog}
        message="You have unsaved changes. Are you sure you want to discard them?"
        onConfirm={handleConfirmDiscard}
        onCancel={() => setShowConfirmDialog(false)}
      />
    </div>
  )
}

export default DocumentEditor
