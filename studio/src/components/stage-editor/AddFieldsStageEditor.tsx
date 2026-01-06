/**
 * AddFields Stage Editor
 * UI for building $addFields stage
 */

import { useCallback } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { Body, Label } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import IconButton from '@leafygreen-ui/icon-button'
import Icon from '@leafygreen-ui/icon'
import TextInput from '@leafygreen-ui/text-input'
import TextArea from '@leafygreen-ui/text-area'
import type { AddFieldsStage, AddFieldEntry } from './types'

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

const fieldNameStyles = css`
  min-width: 150px;
`

const expressionStyles = css`
  flex: 1;
  font-family: 'Source Code Pro', monospace;
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

export interface AddFieldsStageEditorProps {
  stage: AddFieldsStage
  onChange: (stage: AddFieldsStage) => void
  availableFields?: string[]
}

export function AddFieldsStageEditor({
  stage,
  onChange,
  availableFields = [],
}: AddFieldsStageEditorProps) {
  // Generate unique ID
  const generateId = () => `af-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  // Add field
  const addField = useCallback(() => {
    const newField: AddFieldEntry = {
      id: generateId(),
      field: '',
      expression: '',
    }
    onChange({
      ...stage,
      fields: [...stage.fields, newField],
    })
  }, [stage, onChange])

  // Remove field
  const removeField = useCallback(
    (index: number) => {
      onChange({
        ...stage,
        fields: stage.fields.filter((_, i) => i !== index),
      })
    },
    [stage, onChange]
  )

  // Update field
  const updateField = useCallback(
    (index: number, updates: Partial<AddFieldEntry>) => {
      const newFields = [...stage.fields]
      newFields[index] = { ...newFields[index], ...updates }
      onChange({
        ...stage,
        fields: newFields,
      })
    },
    [stage, onChange]
  )

  return (
    <div className={containerStyles} data-testid="addfields-stage-editor">
      <Body weight="medium">Add computed fields to documents</Body>

      <Label>Fields</Label>

      {stage.fields.length === 0 && (
        <div className={emptyStateStyles}>
          <Body>No fields defined</Body>
          <Body>Add fields to compute new values</Body>
        </div>
      )}

      {stage.fields.map((field, index) => (
        <div key={field.id} className={fieldRowStyles} data-testid={`addfield-row-${index}`}>
          <TextInput
            className={fieldNameStyles}
            aria-label="Field name"
            placeholder="newFieldName"
            value={field.field}
            onChange={(e) => updateField(index, { field: e.target.value })}
            data-testid={`addfield-name-input-${index}`}
          />

          <TextArea
            className={expressionStyles}
            aria-label="Expression"
            placeholder='{ "$concat": ["$firstName", " ", "$lastName"] }'
            value={field.expression}
            onChange={(e) => updateField(index, { expression: e.target.value })}
            data-testid={`addfield-expression-input-${index}`}
          />

          <IconButton
            aria-label="Remove field"
            onClick={() => removeField(index)}
            data-testid={`remove-addfield-${index}`}
          >
            <Icon glyph="X" />
          </IconButton>
        </div>
      ))}

      <Button
        variant="default"
        size="small"
        leftGlyph={<Icon glyph="Plus" />}
        onClick={addField}
        data-testid="add-addfield-button"
      >
        Add Field
      </Button>
    </div>
  )
}

export default AddFieldsStageEditor
