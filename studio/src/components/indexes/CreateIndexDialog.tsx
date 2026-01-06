import { useState, useCallback, useMemo } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body, InlineCode } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Modal from '@leafygreen-ui/modal'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import Tooltip from '@leafygreen-ui/tooltip'
import TextInput from '@leafygreen-ui/text-input'
import { Select, Option } from '@leafygreen-ui/select'
import Checkbox from '@leafygreen-ui/checkbox'
import { useCreateIndexMutation } from '@hooks/useQueries'

// Types
export type IndexKeyType = 1 | -1 | 'text' | '2dsphere'

export interface IndexField {
  id: string
  name: string
  type: IndexKeyType
}

export interface IndexOptions {
  name?: string
  unique: boolean
  sparse: boolean
  background: boolean
  expireAfterSeconds?: number
}

export interface IndexDefinition {
  fields: IndexField[]
  options: IndexOptions
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

// Styles
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

const descriptionStyles = css`
  color: ${palette.gray.dark1};
  margin-bottom: 20px;
`

const sectionStyles = css`
  margin-bottom: 24px;
`

const sectionTitleStyles = css`
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 12px;
  color: ${palette.gray.dark2};
`

const fieldListStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const fieldRowStyles = css`
  display: flex;
  gap: 8px;
  align-items: center;
`

const fieldNameInputStyles = css`
  flex: 1;
  min-width: 150px;
`

const fieldTypeSelectStyles = css`
  width: 150px;
`

const optionsGridStyles = css`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
`

const checkboxRowStyles = css`
  display: flex;
  align-items: center;
`

const ttlContainerStyles = css`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 12px;
`

const ttlInputStyles = css`
  width: 150px;
`

const previewStyles = css`
  padding: 12px;
  background: ${palette.gray.dark3};
  border-radius: 6px;
  font-family: 'Source Code Pro', monospace;
  font-size: 12px;
  color: ${palette.gray.light1};
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
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

const warningStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: ${palette.yellow.light3};
  border-radius: 4px;
  margin-bottom: 16px;
  color: ${palette.yellow.dark2};
  font-size: 13px;
`

const emptyFieldsStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: ${palette.gray.dark1};
  text-align: center;
  border: 2px dashed ${palette.gray.light2};
  border-radius: 6px;
`

// Custom checkbox wrapper that handles pointer-events for testing
const testableCheckboxLabelStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
`

const testableCheckboxInputStyles = css`
  width: 16px;
  height: 16px;
  margin-top: 2px;
  cursor: pointer;
  accent-color: ${palette.green.dark1};
`

const testableCheckboxTextStyles = css`
  display: flex;
  flex-direction: column;
`

const testableCheckboxDescStyles = css`
  font-size: 12px;
  color: ${palette.gray.dark1};
`

interface TestableCheckboxProps {
  'data-testid': string
  label: string
  description?: string
  checked: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function TestableCheckbox({
  'data-testid': testId,
  label,
  description,
  checked,
  onChange,
}: TestableCheckboxProps) {
  return (
    <label className={testableCheckboxLabelStyles}>
      <input
        type="checkbox"
        className={testableCheckboxInputStyles}
        data-testid={testId}
        checked={checked}
        onChange={onChange}
      />
      <span className={testableCheckboxTextStyles}>
        <span>{label}</span>
        {description && <span className={testableCheckboxDescStyles}>{description}</span>}
      </span>
    </label>
  )
}

// Validation function
export function validateIndexDefinition(definition: IndexDefinition): ValidationResult {
  const errors: string[] = []

  // Check for at least one field
  if (definition.fields.length === 0) {
    errors.push('At least one field is required')
  }

  // Check for empty field names
  const emptyFields = definition.fields.filter(f => !f.name.trim())
  if (emptyFields.length > 0) {
    errors.push('All fields must have a name')
  }

  // Check for duplicate field names
  const fieldNames = definition.fields.map(f => f.name.trim()).filter(Boolean)
  const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index)
  if (duplicates.length > 0) {
    errors.push(`Duplicate field names: ${[...new Set(duplicates)].join(', ')}`)
  }

  // Check field name format (no special characters except dots for nested)
  const invalidFields = definition.fields.filter(f => {
    const name = f.name.trim()
    if (!name) return false
    // Allow alphanumeric, underscores, and dots for nested paths
    return !/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(name)
  })
  if (invalidFields.length > 0) {
    errors.push(`Invalid field names: ${invalidFields.map(f => f.name).join(', ')}`)
  }

  // Check for text index restrictions (only one text field allowed per index)
  const textFields = definition.fields.filter(f => f.type === 'text')
  if (textFields.length > 1) {
    errors.push('Only one text field is allowed per index')
  }

  // Check TTL value if enabled
  if (definition.options.expireAfterSeconds !== undefined) {
    if (definition.options.expireAfterSeconds < 0) {
      errors.push('TTL value must be non-negative')
    }
    // TTL indexes must be on a single field
    if (definition.fields.length > 1) {
      errors.push('TTL indexes can only be created on a single field')
    }
  }

  // Custom index name validation
  if (definition.options.name) {
    const name = definition.options.name.trim()
    if (name.length > 127) {
      errors.push('Index name cannot exceed 127 characters')
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      errors.push('Index name must start with a letter or underscore and contain only alphanumeric characters')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

// Generate index name from fields
function generateIndexName(fields: IndexField[]): string {
  return fields
    .filter(f => f.name.trim())
    .map(f => {
      const suffix = f.type === 1 ? '1' : f.type === -1 ? '-1' : f.type
      return `${f.name}_${suffix}`
    })
    .join('_')
}

// Convert fields to MongoDB key format
function fieldsToKeys(fields: IndexField[]): Record<string, IndexKeyType> {
  const keys: Record<string, IndexKeyType> = {}
  for (const field of fields) {
    if (field.name.trim()) {
      keys[field.name.trim()] = field.type
    }
  }
  return keys
}

// Convert definition to MongoDB options format
function definitionToOptions(definition: IndexDefinition): Record<string, unknown> {
  const options: Record<string, unknown> = {}

  if (definition.options.name?.trim()) {
    options.name = definition.options.name.trim()
  }
  if (definition.options.unique) {
    options.unique = true
  }
  if (definition.options.sparse) {
    options.sparse = true
  }
  if (definition.options.background) {
    options.background = true
  }
  if (definition.options.expireAfterSeconds !== undefined) {
    options.expireAfterSeconds = definition.options.expireAfterSeconds
  }

  return options
}

// Default state
const DEFAULT_DEFINITION: IndexDefinition = {
  fields: [{ id: 'field-1', name: '', type: 1 }],
  options: {
    unique: false,
    sparse: false,
    background: false,
  },
}

// Props
export interface CreateIndexDialogProps {
  database: string
  collection: string
  open: boolean
  onClose: () => void
  onSuccess?: (indexName: string) => void
}

export function CreateIndexDialog({
  database,
  collection,
  open,
  onClose,
  onSuccess,
}: CreateIndexDialogProps) {
  const [definition, setDefinition] = useState<IndexDefinition>(DEFAULT_DEFINITION)
  const [error, setError] = useState<string | null>(null)
  const [enableTTL, setEnableTTL] = useState(false)

  const createIndexMutation = useCreateIndexMutation(database, collection)

  // Validation
  const validation = useMemo(() => validateIndexDefinition(definition), [definition])

  // Preview JSON
  const previewJson = useMemo(() => {
    const keys = fieldsToKeys(definition.fields)
    const options = definitionToOptions(definition)
    return JSON.stringify(
      {
        keys,
        options: Object.keys(options).length > 0 ? options : undefined,
      },
      null,
      2
    )
  }, [definition])

  // Auto-generated index name
  const autoGeneratedName = useMemo(
    () => generateIndexName(definition.fields),
    [definition.fields]
  )

  // Field management
  const addField = useCallback(() => {
    setDefinition(prev => ({
      ...prev,
      fields: [
        ...prev.fields,
        { id: `field-${Date.now()}`, name: '', type: 1 },
      ],
    }))
  }, [])

  const removeField = useCallback((id: string) => {
    setDefinition(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.id !== id),
    }))
  }, [])

  const updateField = useCallback((id: string, updates: Partial<IndexField>) => {
    setDefinition(prev => ({
      ...prev,
      fields: prev.fields.map(f => (f.id === id ? { ...f, ...updates } : f)),
    }))
  }, [])

  // Options management
  const updateOptions = useCallback((updates: Partial<IndexOptions>) => {
    setDefinition(prev => ({
      ...prev,
      options: { ...prev.options, ...updates },
    }))
  }, [])

  // Handle TTL toggle
  const handleTTLToggle = useCallback((checked: boolean) => {
    setEnableTTL(checked)
    if (checked) {
      updateOptions({ expireAfterSeconds: 3600 }) // Default 1 hour
    } else {
      setDefinition(prev => {
        const { expireAfterSeconds, ...rest } = prev.options
        return { ...prev, options: rest as IndexOptions }
      })
    }
  }, [updateOptions])

  // Reset state
  const handleClose = useCallback(() => {
    setDefinition(DEFAULT_DEFINITION)
    setError(null)
    setEnableTTL(false)
    onClose()
  }, [onClose])

  // Submit
  const handleSubmit = useCallback(async () => {
    setError(null)

    // Validate
    const result = validateIndexDefinition(definition)
    if (!result.isValid) {
      setError(result.errors.join('. '))
      return
    }

    try {
      const keys = fieldsToKeys(definition.fields)
      const options = definitionToOptions(definition)

      const indexName = await createIndexMutation.mutateAsync({
        keys: keys as Record<string, 1 | -1 | 'text' | '2dsphere'>,
        options: Object.keys(options).length > 0 ? options : undefined,
      })

      onSuccess?.(indexName)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create index')
    }
  }, [definition, createIndexMutation, onSuccess, handleClose])

  return (
    <Modal open={open} setOpen={handleClose} size="large">
      <div className={modalContentStyles}>
        <div className={headerStyles}>
          <div className={headerLeftStyles}>
            <Icon glyph="Plus" />
            <H3>Create Index</H3>
          </div>
        </div>

        <Body className={descriptionStyles}>
          Create an index on <strong>{collection}</strong> to improve query performance
        </Body>

        {error && (
          <div className={errorStyles} role="alert" data-testid="create-index-error">
            {error}
          </div>
        )}

        {/* Warning for unique on existing data */}
        {definition.options.unique && (
          <div className={warningStyles}>
            <Icon glyph="Warning" />
            <Body>
              Creating a unique index will fail if there are duplicate values in the
              indexed field(s).
            </Body>
          </div>
        )}

        {/* Fields Section */}
        <div className={sectionStyles}>
          <div className={sectionTitleStyles}>Index Fields</div>
          <div className={fieldListStyles}>
            {definition.fields.length === 0 ? (
              <div className={emptyFieldsStyles}>
                <Icon glyph="Plus" />
                <Body>No fields added</Body>
                <Body style={{ fontSize: 12 }}>
                  Click "Add Field" to add index fields
                </Body>
              </div>
            ) : (
              definition.fields.map((field, index) => (
                <div key={field.id} className={fieldRowStyles} data-testid={`index-field-${index}`}>
                  <div className={fieldNameInputStyles}>
                    <TextInput
                      aria-label="Field name"
                      placeholder="field.name"
                      value={field.name}
                      onChange={e => updateField(field.id, { name: e.target.value })}
                      data-testid={`field-name-${index}`}
                    />
                  </div>
                  <div className={fieldTypeSelectStyles}>
                    <Select
                      aria-label="Index type"
                      value={String(field.type)}
                      onChange={val => {
                        const type =
                          val === '1'
                            ? 1
                            : val === '-1'
                            ? -1
                            : (val as IndexKeyType)
                        updateField(field.id, { type })
                      }}
                      data-testid={`field-direction-${index}`}
                    >
                      <Option value="1">Ascending (1)</Option>
                      <Option value="-1">Descending (-1)</Option>
                      <Option value="text">Text</Option>
                      <Option value="2dsphere">2dsphere</Option>
                    </Select>
                  </div>
                  {definition.fields.length > 1 && (
                    <Tooltip trigger={
                      <IconButton
                        aria-label="Remove field"
                        onClick={() => removeField(field.id)}
                        data-testid={`remove-field-${index}`}
                      >
                        <Icon glyph="X" />
                      </IconButton>
                    }>
                      Remove field
                    </Tooltip>
                  )}
                </div>
              ))
            )}
          </div>
          <Button
            variant="default"
            size="small"
            leftGlyph={<Icon glyph="Plus" />}
            onClick={addField}
            style={{ marginTop: 12 }}
            data-testid="add-field-button"
          >
            Add Field
          </Button>
        </div>

        {/* Options Section */}
        <div className={sectionStyles}>
          <div className={sectionTitleStyles}>Index Options</div>

          {/* Custom Name */}
          <TextInput
            label="Index Name (optional)"
            description={`Auto-generated: ${autoGeneratedName || '(add fields)'}`}
            placeholder="my_custom_index"
            value={definition.options.name || ''}
            onChange={e => updateOptions({ name: e.target.value })}
            data-testid="index-name-input"
            style={{ marginBottom: 16 }}
          />

          <div className={optionsGridStyles}>
            <div className={checkboxRowStyles}>
              <TestableCheckbox
                data-testid="unique-checkbox"
                label="Unique"
                description="Reject documents with duplicate values"
                checked={definition.options.unique}
                onChange={e => updateOptions({ unique: e.target.checked })}
              />
            </div>
            <div className={checkboxRowStyles}>
              <TestableCheckbox
                data-testid="sparse-checkbox"
                label="Sparse"
                description="Only index documents with the field"
                checked={definition.options.sparse}
                onChange={e => updateOptions({ sparse: e.target.checked })}
              />
            </div>
            <div className={checkboxRowStyles}>
              <TestableCheckbox
                data-testid="background-checkbox"
                label="Background"
                description="Build index in background"
                checked={definition.options.background}
                onChange={e => updateOptions({ background: e.target.checked })}
              />
            </div>
            <div className={checkboxRowStyles}>
              <TestableCheckbox
                data-testid="ttl-checkbox"
                label="TTL Index"
                description="Automatically delete documents after time"
                checked={enableTTL}
                onChange={e => handleTTLToggle(e.target.checked)}
              />
            </div>
          </div>

          {enableTTL && (
            <div className={ttlContainerStyles}>
              <div className={ttlInputStyles}>
                <TextInput
                  label="Expire After (seconds)"
                  type="number"
                  min={0}
                  value={String(definition.options.expireAfterSeconds ?? 3600)}
                  onChange={e =>
                    updateOptions({
                      expireAfterSeconds: parseInt(e.target.value) || 0,
                    })
                  }
                  data-testid="ttl-input"
                />
              </div>
              <Body style={{ fontSize: 12, color: palette.gray.dark1, paddingBottom: 8 }}>
                ({Math.floor((definition.options.expireAfterSeconds ?? 3600) / 86400)} days,{' '}
                {Math.floor(((definition.options.expireAfterSeconds ?? 3600) % 86400) / 3600)} hours)
              </Body>
            </div>
          )}
        </div>

        {/* Preview Section */}
        <div className={sectionStyles}>
          <div className={sectionTitleStyles}>Index Preview</div>
          <div className={previewStyles} data-testid="index-preview">
            {previewJson}
          </div>
        </div>

        {/* Validation Errors */}
        {!validation.isValid && validation.errors.length > 0 && (
          <div className={errorStyles} data-testid="validation-errors">
            <strong>Validation errors:</strong>
            <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className={footerStyles}>
          <div className={footerLeftStyles}>
            <Body style={{ fontSize: 12, color: palette.gray.dark1 }}>
              {definition.fields.filter(f => f.name.trim()).length} field(s) selected
            </Body>
          </div>
          <div className={footerRightStyles}>
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!validation.isValid || createIndexMutation.isPending}
              data-testid="create-index-submit"
            >
              {createIndexMutation.isPending ? 'Creating...' : 'Create Index'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Trigger button for opening the create index dialog
 */
export interface CreateIndexButtonProps {
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'primaryOutline' | 'default'
}

export function CreateIndexButton({
  onClick,
  disabled = false,
  variant = 'primary',
}: CreateIndexButtonProps) {
  return (
    <Button
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      leftGlyph={<Icon glyph="Plus" />}
      data-testid="create-index-button"
    >
      Create Index
    </Button>
  )
}

/**
 * Inline create index dialog that manages its own open state
 */
export interface CreateIndexInlineProps {
  database: string
  collection: string
  onSuccess?: (indexName: string) => void
  children: (props: { onClick: () => void }) => React.ReactNode
}

export function CreateIndexInline({
  database,
  collection,
  onSuccess,
  children,
}: CreateIndexInlineProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {children({ onClick: () => setOpen(true) })}
      <CreateIndexDialog
        database={database}
        collection={collection}
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={onSuccess}
      />
    </>
  )
}
