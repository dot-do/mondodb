/**
 * Sort Stage Editor
 * UI for building $sort stage
 */

import { useCallback, useMemo } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Label } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import TextInput from '@leafygreen-ui/text-input'
import type { SortStage, SortField, SortDirection } from './types'

// Styles
const containerStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const fieldRowStyles = css`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: ${palette.gray.light3};
  border-radius: 6px;
`

const fieldInputStyles = css`
  flex: 1;
`

const directionToggleStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid ${palette.gray.light2};
  border-radius: 4px;
  background: white;
  cursor: pointer;
  min-width: 120px;
  justify-content: center;

  &:hover {
    background: ${palette.gray.light3};
  }
`

const emptyStateStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: ${palette.gray.light3};
  border-radius: 6px;
  color: ${palette.gray.dark1};
  text-align: center;
  gap: 8px;
`

const errorStyles = css`
  color: ${palette.red.base};
  font-size: 12px;
  margin-top: 4px;
`

const duplicateErrorStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${palette.red.light3};
  border: 1px solid ${palette.red.light2};
  border-radius: 4px;
  color: ${palette.red.dark2};
  font-size: 13px;
`

const dragHandleStyles = css`
  cursor: grab;
  color: ${palette.gray.base};
  display: flex;
  align-items: center;
  padding: 4px;

  &:hover {
    color: ${palette.gray.dark2};
  }
`

export interface SortStageEditorProps {
  stage: SortStage
  onChange: (stage: SortStage) => void
  availableFields?: string[]
}

export function SortStageEditor({
  stage,
  onChange,
  availableFields = [],
}: SortStageEditorProps) {
  // Generate unique ID
  const generateId = () => `sort-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // Add sort field
  const addSortField = useCallback(() => {
    const newField: SortField = {
      id: generateId(),
      field: '',
      direction: 1,
    }
    onChange({
      ...stage,
      fields: [...stage.fields, newField],
    })
  }, [stage, onChange])

  // Remove sort field
  const removeSortField = useCallback(
    (index: number) => {
      onChange({
        ...stage,
        fields: stage.fields.filter((_, i) => i !== index),
      })
    },
    [stage, onChange]
  )

  // Update sort field
  const updateSortField = useCallback(
    (index: number, updates: Partial<SortField>) => {
      const newFields = [...stage.fields]
      newFields[index] = { ...newFields[index], ...updates }
      onChange({
        ...stage,
        fields: newFields,
      })
    },
    [stage, onChange]
  )

  // Toggle direction
  const toggleDirection = useCallback(
    (index: number) => {
      const field = stage.fields[index]
      updateSortField(index, { direction: field.direction === 1 ? -1 : 1 })
    },
    [stage.fields, updateSortField]
  )

  // Check for duplicate fields
  const duplicateFields = useMemo(() => {
    const fields = stage.fields.map((f) => f.field).filter(Boolean)
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const field of fields) {
      if (seen.has(field)) {
        duplicates.add(field)
      }
      seen.add(field)
    }
    return duplicates
  }, [stage.fields])

  return (
    <div className={containerStyles} data-testid="sort-stage-editor">
      <Label>Sort Fields</Label>

      {stage.fields.length === 0 && (
        <div className={emptyStateStyles} data-testid="sort-empty-state">
          <Icon glyph="SortAscending" size="large" />
          <Body>No sort fields defined</Body>
          <Body>Add fields to sort your documents</Body>
        </div>
      )}

      {duplicateFields.size > 0 && (
        <div className={duplicateErrorStyles} data-testid="duplicate-field-error">
          <Icon glyph="Warning" />
          Duplicate sort fields: {Array.from(duplicateFields).join(', ')}
        </div>
      )}

      {stage.fields.map((field, index) => (
        <div key={field.id} className={fieldRowStyles} data-testid={`sort-field-row-${index}`}>
          <div className={dragHandleStyles} data-testid={`sort-field-drag-handle-${index}`}>
            <Icon glyph="Drag" />
          </div>

          <div className={fieldInputStyles}>
            <TextInput
              aria-label="Field name"
              placeholder="field name"
              value={field.field}
              onChange={(e) => updateSortField(index, { field: e.target.value })}
              data-testid={`sort-field-input-${index}`}
            />
            {field.field === '' && (
              <div className={errorStyles} data-testid={`field-required-error-${index}`}>
                Field name is required
              </div>
            )}
          </div>

          <button
            className={directionToggleStyles}
            onClick={() => toggleDirection(index)}
            data-testid={`sort-direction-toggle-${index}`}
          >
            <Icon glyph={field.direction === 1 ? 'SortAscending' : 'SortDescending'} />
            {field.direction === 1 ? 'Ascending' : 'Descending'}
          </button>

          <IconButton
            aria-label="Remove sort field"
            onClick={() => removeSortField(index)}
            data-testid={`remove-sort-field-${index}`}
          >
            <Icon glyph="X" />
          </IconButton>
        </div>
      ))}

      <Button
        variant="default"
        size="small"
        leftGlyph={<Icon glyph="Plus" />}
        onClick={addSortField}
        data-testid="add-sort-field-button"
      >
        Add Sort Field
      </Button>
    </div>
  )
}

export default SortStageEditor
