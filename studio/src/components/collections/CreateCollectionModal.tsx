import { useState, useCallback, useEffect, useRef } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body, Subtitle } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Modal from '@leafygreen-ui/modal'
import Icon from '@leafygreen-ui/icon'
import TextInput from '@leafygreen-ui/text-input'
import TextArea from '@leafygreen-ui/text-area'
import Checkbox from '@leafygreen-ui/checkbox'
import rpcClient from '@lib/rpc-client'

// Styles
const modalContentStyles = css`
  padding: 24px;
`

const headerStyles = css`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
`

const databaseNameStyles = css`
  color: ${palette.gray.dark1};
  margin-bottom: 20px;
`

const fieldGroupStyles = css`
  margin-bottom: 16px;
`

const cappedOptionsStyles = css`
  margin-top: 12px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const advancedToggleStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 0;
  margin-top: 8px;
  color: ${palette.blue.base};
  font-size: 14px;
  border: none;
  background: none;
  width: 100%;
  text-align: left;

  &:hover {
    color: ${palette.blue.dark2};
  }
`

const advancedSectionStyles = css`
  margin-top: 12px;
  padding: 16px;
  background: ${palette.gray.light3};
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const timeSeriesOptionsStyles = css`
  margin-top: 12px;
  padding: 12px;
  background: ${palette.white};
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const footerStyles = css`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid ${palette.gray.light2};
  margin-top: 24px;
`

const errorStyles = css`
  color: ${palette.red.dark2};
  font-size: 13px;
  padding: 12px;
  background: ${palette.red.light3};
  border-radius: 4px;
  margin-bottom: 16px;
`

const successStyles = css`
  color: ${palette.green.dark2};
  font-size: 13px;
  padding: 12px;
  background: ${palette.green.light3};
  border-radius: 4px;
  margin-bottom: 16px;
`

const warningTextStyles = css`
  color: ${palette.yellow.dark2};
  font-size: 12px;
  margin-top: 4px;
`

// Collection name validation
function validateCollectionName(
  name: string,
  existingCollections: string[]
): { isValid: boolean; error: string | null; warning: string | null } {
  if (!name.trim()) {
    return { isValid: false, error: 'Collection name is required', warning: null }
  }

  if (name.startsWith('system.')) {
    return { isValid: false, error: 'Collection name cannot start with "system."', warning: null }
  }

  // Check for invalid characters (MongoDB collection name rules)
  const invalidChars = /[$\0]/
  if (invalidChars.test(name)) {
    return { isValid: false, error: 'Collection name contains invalid characters', warning: null }
  }

  // Check if collection already exists - this is a warning, not an error
  // User can still try to create (server will reject if it truly exists)
  if (existingCollections.includes(name)) {
    return { isValid: true, error: null, warning: 'Collection already exists' }
  }

  return { isValid: true, error: null, warning: null }
}

export interface CreateCollectionModalProps {
  database: string
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  existingCollections?: string[]
}

export function CreateCollectionModal({
  database,
  open,
  onClose,
  onSuccess,
  existingCollections = [],
}: CreateCollectionModalProps) {
  // Form state
  const [collectionName, setCollectionName] = useState('')
  const [isCapped, setIsCapped] = useState(false)
  const [cappedSize, setCappedSize] = useState('1048576') // Default 1MB
  const [cappedMax, setCappedMax] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [validationSchema, setValidationSchema] = useState('')
  const [isTimeSeries, setIsTimeSeries] = useState(false)
  const [timeField, setTimeField] = useState('')
  const [metaField, setMetaField] = useState('')

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [nameBlurred, setNameBlurred] = useState(false)

  // Ref for auto-focus
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Focus the name input when modal opens
  useEffect(() => {
    if (open && nameInputRef.current) {
      // Use queueMicrotask for immediate focus after render
      queueMicrotask(() => {
        nameInputRef.current?.focus()
      })
    }
  }, [open])

  // Validation
  const validation = validateCollectionName(collectionName, existingCollections)
  const showNameError = (nameBlurred || collectionName.length > 0) && validation.error !== null
  const showNameWarning = !showNameError && collectionName.length > 0 && validation.warning !== null

  // Reset form when modal closes
  const resetForm = useCallback(() => {
    setCollectionName('')
    setIsCapped(false)
    setCappedSize('1048576')
    setCappedMax('')
    setShowAdvanced(false)
    setValidationSchema('')
    setIsTimeSeries(false)
    setTimeField('')
    setMetaField('')
    setIsSubmitting(false)
    setError(null)
    setSuccessMessage(null)
    setNameBlurred(false)
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [resetForm, onClose])

  // Clear error when user modifies input
  const handleNameChange = useCallback((value: string) => {
    setCollectionName(value)
    setError(null)
    setSuccessMessage(null)
  }, [])

  const handleSubmit = useCallback(async () => {
    // Validate
    const result = validateCollectionName(collectionName, existingCollections)
    if (!result.isValid) {
      setError(result.error)
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Build options
      let options: Record<string, unknown> | undefined

      if (isCapped) {
        options = {
          capped: true,
          size: parseInt(cappedSize, 10) || 1048576,
        }
        if (cappedMax) {
          options.max = parseInt(cappedMax, 10)
        }
      }

      if (isTimeSeries && timeField) {
        options = options || {}
        options.timeseries = {
          timeField,
          ...(metaField ? { metaField } : {}),
        }
      }

      if (validationSchema.trim()) {
        try {
          const schema = JSON.parse(validationSchema)
          options = options || {}
          options.validator = { $jsonSchema: schema }
        } catch {
          throw new Error('Invalid JSON schema')
        }
      }

      await rpcClient.createCollection(database, collectionName, options)

      setSuccessMessage(`Collection "${collectionName}" created successfully`)

      // Call onSuccess to refresh collections list
      onSuccess?.()

      // Close modal after short delay to show success message
      setTimeout(() => {
        handleClose()
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection')
      setIsSubmitting(false)
    }
  }, [
    collectionName,
    existingCollections,
    database,
    isCapped,
    cappedSize,
    cappedMax,
    isTimeSeries,
    timeField,
    metaField,
    validationSchema,
    onSuccess,
    handleClose,
  ])

  const isCreateDisabled = !validation.isValid || isSubmitting

  return (
    <Modal open={open} setOpen={handleClose}>
      <div className={modalContentStyles}>
        <div className={headerStyles}>
          <Icon glyph="Plus" />
          <H3>Create Collection</H3>
        </div>

        <Body className={databaseNameStyles}>
          Create a new collection in <strong>{database}</strong>
        </Body>

        {error && (
          <div
            className={errorStyles}
            role="alert"
            data-testid="create-collection-error"
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div className={successStyles} role="status">
            {successMessage}
          </div>
        )}

        {/* Collection Name */}
        <div className={fieldGroupStyles}>
          <TextInput
            ref={nameInputRef}
            label="Collection Name"
            id="collection-name"
            placeholder="Enter collection name"
            value={collectionName}
            onChange={(e) => handleNameChange(e.target.value)}
            onBlur={() => setNameBlurred(true)}
            state={showNameError ? 'error' : 'none'}
            errorMessage={showNameError ? validation.error : undefined}
            data-testid="collection-name-input"
          />
          {showNameWarning && (
            <div className={warningTextStyles}>
              {validation.warning}
            </div>
          )}
        </div>

        {/* Capped Collection */}
        <div className={fieldGroupStyles}>
          <Checkbox
            label="Capped Collection"
            description="Fixed-size collection that automatically removes oldest documents"
            checked={isCapped}
            onChange={(e) => setIsCapped(e.target.checked)}
            data-testid="capped-checkbox"
          />

          {isCapped && (
            <div className={cappedOptionsStyles}>
              <TextInput
                label="Size (bytes)"
                type="number"
                min={1}
                value={cappedSize}
                onChange={(e) => setCappedSize(e.target.value)}
                data-testid="capped-size-input"
              />
              <TextInput
                label="Max Documents (optional)"
                type="number"
                min={1}
                value={cappedMax}
                onChange={(e) => setCappedMax(e.target.value)}
                placeholder="No limit"
                data-testid="capped-max-input"
              />
            </div>
          )}
        </div>

        {/* Advanced Options Toggle */}
        <button
          type="button"
          className={advancedToggleStyles}
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
        >
          <Icon glyph={showAdvanced ? 'ChevronDown' : 'ChevronRight'} />
          Advanced Options
        </button>

        {/* Advanced Options Section */}
        {showAdvanced && (
          <div className={advancedSectionStyles}>
            {/* Validation Schema */}
            <TextArea
              label="Validation Schema (JSON)"
              placeholder='{"bsonType": "object", "required": ["name"]}'
              value={validationSchema}
              onChange={(e) => setValidationSchema(e.target.value)}
              data-testid="validation-schema-input"
            />

            {/* Time Series */}
            <Checkbox
              label="Time Series Collection"
              description="Optimized for time-series data"
              checked={isTimeSeries}
              onChange={(e) => setIsTimeSeries(e.target.checked)}
              data-testid="timeseries-checkbox"
            />

            {isTimeSeries && (
              <div className={timeSeriesOptionsStyles}>
                <TextInput
                  label="Time Field"
                  placeholder="timestamp"
                  value={timeField}
                  onChange={(e) => setTimeField(e.target.value)}
                  data-testid="timefield-input"
                />
                <TextInput
                  label="Meta Field (optional)"
                  placeholder="metadata"
                  value={metaField}
                  onChange={(e) => setMetaField(e.target.value)}
                  data-testid="metafield-input"
                />
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className={footerStyles}>
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isCreateDisabled}
            data-testid="create-collection-submit"
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default CreateCollectionModal
