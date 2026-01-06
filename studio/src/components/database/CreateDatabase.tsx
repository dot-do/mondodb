/**
 * CreateDatabase Component
 *
 * Modal dialog for creating a new database with optional initial collection.
 * Includes form validation, error handling, and keyboard accessibility.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Modal from '@leafygreen-ui/modal'
import Icon from '@leafygreen-ui/icon'
import TextInput from '@leafygreen-ui/text-input'
import { useCreateDatabaseMutation } from '@hooks/useQueries'

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

const descriptionStyles = css`
  color: ${palette.gray.dark1};
  margin-bottom: 20px;
`

const formStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const footerStyles = css`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 24px;
  border-top: 1px solid ${palette.gray.light2};
  margin-top: 8px;
`

const errorStyles = css`
  color: ${palette.red.dark2};
  font-size: 13px;
  padding: 8px 12px;
  background: ${palette.red.light3};
  border-radius: 4px;
  margin-bottom: 16px;
`

// Reserved database names in MongoDB
const RESERVED_DB_NAMES = ['admin', 'local', 'config']

// Invalid characters for MongoDB database names: /\. "$*<>:|?
const INVALID_DB_CHARS = /[\/\\.\s"$*<>:|?]/

// Maximum length for database names
const MAX_DB_NAME_LENGTH = 64

/**
 * Validate a database name according to MongoDB rules
 */
function validateDatabaseName(name: string): string | null {
  if (!name) {
    return null // Empty is not an error, just disables submit
  }

  if (INVALID_DB_CHARS.test(name)) {
    return 'Invalid database name: contains forbidden characters'
  }

  if (/^[0-9]/.test(name)) {
    return 'Database name cannot start with a number'
  }

  if (name.length > MAX_DB_NAME_LENGTH) {
    return `Database name is too long (max ${MAX_DB_NAME_LENGTH} characters)`
  }

  if (RESERVED_DB_NAMES.includes(name.toLowerCase())) {
    return `"${name}" is a reserved database name`
  }

  return null
}

export interface CreateDatabaseProps {
  open: boolean
  onClose: () => void
  onSuccess?: (databaseName: string) => void
}

export function CreateDatabase({ open, onClose, onSuccess }: CreateDatabaseProps) {
  const [databaseName, setDatabaseName] = useState('')
  const [initialCollection, setInitialCollection] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const mutation = useCreateDatabaseMutation()

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setDatabaseName('')
      setInitialCollection('')
      setValidationError(null)
      setSubmitError(null)
      // Focus the input after modal opens
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [open])

  // Validate database name on change
  const handleDatabaseNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setDatabaseName(value)
    setValidationError(validateDatabaseName(value))
    setSubmitError(null) // Clear submit error when user types
  }, [])

  const handleInitialCollectionChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInitialCollection(e.target.value)
    setSubmitError(null) // Clear submit error when user types
  }, [])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    // Validate before submit
    const error = validateDatabaseName(databaseName)
    if (error) {
      setValidationError(error)
      return
    }

    if (!databaseName.trim()) {
      return
    }

    try {
      await mutation.mutateAsync({
        name: databaseName,
        initialCollection: initialCollection.trim() || undefined,
      })
      onSuccess?.(databaseName)
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create database')
    }
  }, [databaseName, initialCollection, mutation, onSuccess, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && databaseName.trim() && !validationError && !mutation.isPending) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [databaseName, validationError, mutation.isPending, handleSubmit]
  )

  const isSubmitDisabled = !databaseName.trim() || !!validationError || mutation.isPending

  return (
    <Modal open={open} setOpen={handleClose} size="default">
      <div className={modalContentStyles} onKeyDown={handleKeyDown}>
        <div className={headerStyles}>
          <Icon glyph="Database" />
          <H3>Create Database</H3>
        </div>

        <Body className={descriptionStyles}>
          Create a new database. You can optionally specify an initial collection to create.
        </Body>

        {submitError && (
          <div className={errorStyles} role="alert" data-testid="create-database-error">
            {submitError}
          </div>
        )}

        <div className={formStyles}>
          <TextInput
            ref={inputRef}
            label="Database Name"
            placeholder="my_database"
            value={databaseName}
            onChange={handleDatabaseNameChange}
            state={validationError ? 'error' : 'none'}
            errorMessage={validationError || undefined}
            data-testid="database-name-input"
          />

          <TextInput
            label="Initial Collection (optional)"
            placeholder="my_collection"
            value={initialCollection}
            onChange={handleInitialCollectionChange}
            data-testid="initial-collection-input"
          />
        </div>

        <div className={footerStyles}>
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            data-testid="create-database-submit"
          >
            {mutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export interface CreateDatabaseButtonProps {
  onClick: () => void
  disabled?: boolean
}

export function CreateDatabaseButton({ onClick, disabled = false }: CreateDatabaseButtonProps) {
  return (
    <Button
      variant="primary"
      onClick={onClick}
      disabled={disabled}
      leftGlyph={<Icon glyph="Plus" />}
      data-testid="create-database-button"
    >
      Create Database
    </Button>
  )
}
